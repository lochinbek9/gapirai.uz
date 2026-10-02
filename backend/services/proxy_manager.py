"""Proxy pool manager for YouTube ingestion -- replaces the old single-URL,
single-tier `downloader._residential_attempt` with a configurable N-proxy
chain: direct -> datacenter pool -> residential pool, driven entirely by
.env (backend/config.py PROXY_* / DATACENTER_PROXIES / RESIDENTIAL_PROXIES).

Design carried over from the 2026-08-27 audit (see downloader.py's own
module comment for the full experiment writeup):
  - Only a genuinely retryable failure (error_classification.should_retry)
    gets a bounded SAME-endpoint retry (one extra try). A non-retryable
    failure (AUTH_ERROR) or a second failure on the same endpoint moves on
    to the next endpoint in the chain -- never a blind loop.
  - VIDEO_UNAVAILABLE aborts the entire chain immediately: no proxy fixes a
    genuinely unavailable video.
  - PROXY_BILLING_ERROR (a proxy account out of balance) is never worth
    retrying on that SAME endpoint -- it is put in a long cooldown and the
    chain moves on immediately.
  - The datacenter tier measured ZERO benefit over a direct connection in
    the 2026-08-27 experiment. It stays in this module as a configurable,
    OFF-by-default rung (DATACENTER_PROXIES empty = skipped entirely)
    rather than being removed outright, in case that changes.

Health tracking is passive (derived from real download attempts, never an
active probe against YouTube or the proxy itself) and stored in Redis,
keyed by host:port ONLY -- credentials never enter a Redis key or a log
line (see _endpoint_key). All Redis access is defensive: any Redis error
degrades to "try the endpoint anyway" rather than blocking a download.
"""
from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from enum import Enum
from urllib.parse import urlsplit

from redis import Redis

from backend.config import get_settings
from backend.services import error_classification as errcls

logger = logging.getLogger(__name__)
settings = get_settings()

_redis: Redis | None = None


def _conn() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


class ProxyTier(str, Enum):
    DIRECT = "direct"
    DATACENTER = "datacenter"
    RESIDENTIAL = "residential"


@dataclass(frozen=True)
class ProxyEndpoint:
    tier: ProxyTier
    url: str  # "" for DIRECT -- matches downloader._build_yt_opts's own
    # "explicit empty string means no proxy at all" contract (proxy_url=None
    # there means something different: fall back to the legacy single-URL
    # settings, which this module never wants once it owns the decision).

    @property
    def key(self) -> str:
        """Redis-safe identity -- host:port only, never credentials. This
        is what ends up in Redis keys and log lines."""
        if not self.url:
            return "direct"
        p = urlsplit(self.url)
        return f"{self.tier.value}:{p.hostname}:{p.port or ''}"


_FAIL_THRESHOLD = 2  # consecutive failures before a proxy is put in cooldown
_BILLING_COOLDOWN_SECONDS = 6 * 3600  # a depleted proxy account doesn't refill itself in minutes
_STATS_TTL_SECONDS = 7 * 24 * 3600  # per-endpoint counters expire after a week of total inactivity
_RETRY_SLEEP_BASE = 2.0
_RETRY_SLEEP_JITTER = 2.0


def _parse_pool(raw: str) -> list[str]:
    return [p.strip() for p in (raw or "").split(",") if p.strip()]


def _legacy_or_pool(pool_raw: str, legacy_url: str) -> list[str]:
    """New pool var wins if set; otherwise the old single-URL var (if any)
    is treated as a 1-proxy pool, so an existing single-proxy deployment
    keeps working unchanged."""
    pool = _parse_pool(pool_raw)
    if pool:
        return pool
    return [legacy_url] if legacy_url else []


def _datacenter_pool() -> list[str]:
    legacy = settings.YOUTUBE_PROXY_URL if settings.YOUTUBE_PROXY_ENABLED else ""
    return _legacy_or_pool(settings.DATACENTER_PROXIES, legacy)


def _residential_pool() -> list[str]:
    return _legacy_or_pool(settings.RESIDENTIAL_PROXIES, settings.YOUTUBE_RESIDENTIAL_PROXY_URL)


def _healthy(tier: ProxyTier, urls: list[str]) -> list[str]:
    """Filters out proxies currently in cooldown. If EVERY proxy in the
    pool is cooling down, degrades to the full pool anyway -- trying a
    recently-failed proxy is still better than skipping the tier outright
    when there is nothing healthier to offer."""
    if not urls:
        return []
    try:
        c = _conn()
        now = time.time()
        healthy = []
        for u in urls:
            until = c.get(f"proxy:cooldown:{_endpoint_key(tier, u)}")
            if until is None or float(until) <= now:
                healthy.append(u)
        return healthy or urls
    except Exception as e:
        logger.debug(f"Proxy health tekshiruvi (Redis) ishlamadi -- bari sog'lom deb hisoblanadi: {e}")
        return urls


def _endpoint_key(tier: ProxyTier, url: str) -> str:
    return ProxyEndpoint(tier, url).key


def _rotated(tier: ProxyTier, urls: list[str]) -> list[str]:
    """Round-robin starting offset via a Redis counter (same INCR-based
    pattern as backend/services/scheduler.py's round-robin pointer) --
    successive calls start at a different point in the pool instead of
    always hammering the first entry. Falls back to a random offset if
    Redis is unavailable."""
    if len(urls) <= 1:
        return list(urls)
    try:
        offset = _conn().incr(f"proxy:rr:{tier.value}") % len(urls)
    except Exception:
        offset = random.randrange(len(urls))
    return urls[offset:] + urls[:offset]


def _build_chain() -> list[ProxyEndpoint]:
    chain: list[ProxyEndpoint] = []
    if settings.PROXY_DIRECT_FIRST:
        chain.append(ProxyEndpoint(ProxyTier.DIRECT, ""))
    if settings.PROXY_ENABLED:
        for tier, pool_fn in ((ProxyTier.DATACENTER, _datacenter_pool), (ProxyTier.RESIDENTIAL, _residential_pool)):
            pool = pool_fn()
            if not pool:
                continue
            for url in _rotated(tier, _healthy(tier, pool)):
                chain.append(ProxyEndpoint(tier, url))
    if not any(ep.tier == ProxyTier.DIRECT for ep in chain):
        # DIRECT har doim zaxira sifatida zanjir oxirida bo'lishi kerak --
        # proksilar ishlamay qolsa ham to'g'ridan-to'g'ri urinish amalga oshadi.
        chain.append(ProxyEndpoint(ProxyTier.DIRECT, ""))
    return chain


def _record(endpoint: ProxyEndpoint, *, success: bool, cooldown_seconds: int | None = None) -> None:
    if endpoint.tier == ProxyTier.DIRECT:
        return  # nothing to track -- there is only ever one "direct" identity
    key = endpoint.key
    try:
        c = _conn()
        if success:
            c.delete(f"proxy:fails:{key}")
            c.delete(f"proxy:cooldown:{key}")
            c.incr(f"proxy:stats:{key}:success")
            c.expire(f"proxy:stats:{key}:success", _STATS_TTL_SECONDS)
            return
        c.incr(f"proxy:stats:{key}:fail")
        c.expire(f"proxy:stats:{key}:fail", _STATS_TTL_SECONDS)
        if cooldown_seconds is not None:
            c.set(f"proxy:cooldown:{key}", time.time() + cooldown_seconds, ex=cooldown_seconds)
            return
        fails = c.incr(f"proxy:fails:{key}")
        c.expire(f"proxy:fails:{key}", settings.PROXY_COOLDOWN_SECONDS * 4)
        if fails >= _FAIL_THRESHOLD:
            c.set(f"proxy:cooldown:{key}", time.time() + settings.PROXY_COOLDOWN_SECONDS, ex=settings.PROXY_COOLDOWN_SECONDS)
    except Exception as e:
        logger.debug(f"Proxy health yozuvi (Redis) ishlamadi -- e'tiborsiz qoldirildi: {e}")


def get_stats() -> dict:
    """Operator-facing snapshot -- host:port identity only, never
    credentials. Not wired to any HTTP endpoint by this change; meant for
    manual inspection (redis-cli KEYS 'proxy:*') or a future admin view."""
    out: dict = {}
    try:
        c = _conn()
        for tier, pool_fn in ((ProxyTier.DATACENTER, _datacenter_pool), (ProxyTier.RESIDENTIAL, _residential_pool)):
            for url in pool_fn():
                key = _endpoint_key(tier, url)
                cooldown = c.get(f"proxy:cooldown:{key}")
                out[key] = {
                    "success": int(c.get(f"proxy:stats:{key}:success") or 0),
                    "fail": int(c.get(f"proxy:stats:{key}:fail") or 0),
                    "consecutive_fails": int(c.get(f"proxy:fails:{key}") or 0),
                    "cooldown_until": float(cooldown) if cooldown else None,
                }
    except Exception as e:
        return {"error": str(e)}
    return out


def run_with_proxy_chain(action, *, extra: dict | None = None, use_cookies: bool = True):
    """Runs `action(ydl)` across the configured proxy chain (direct ->
    datacenter pool -> residential pool, each pool rotated). Replaces
    downloader._residential_attempt() as the single retry/escalation
    decision point for all YouTube ingestion.

    Per endpoint: one bounded same-endpoint retry on a genuinely retryable
    failure (error_classification.should_retry), then move on. AUTH_ERROR
    (bot-check) and PROXY_BILLING_ERROR (proxy account depleted) never get
    a same-endpoint retry -- they move to the next endpoint immediately
    (a different IP is exactly what might fix an AUTH_ERROR; nothing fixes
    a depleted account except billing). VIDEO_UNAVAILABLE aborts the whole
    chain immediately -- raised as-is, translated to PermanentError by the
    caller (downloader.get_video_info / _do_download), exactly as before.

    Bounded overall by PROXY_MAX_RETRIES distinct endpoints, regardless of
    how large the configured pools are.
    """
    # Local import: downloader.py imports this module for the chain, so a
    # module-level import here would be circular. get_yt_dlp/_build_yt_opts
    # stay in downloader.py unchanged -- existing tests patch them there.
    from backend.services.downloader import get_yt_dlp

    chain = _build_chain()[: max(1, settings.PROXY_MAX_RETRIES)]
    last_exc: Exception | None = None

    for endpoint in chain:
        for local_attempt in range(2):
            try:
                with get_yt_dlp(extra, use_cookies=use_cookies, proxy_url=endpoint.url) as ydl:
                    result = action(ydl)
                _record(endpoint, success=True)
                return result
            except Exception as e:
                last_exc = e
                code = errcls.classify_text(str(e))

                if code == errcls.VIDEO_UNAVAILABLE:
                    raise  # nothing in the proxy chain can fix this -- abort immediately

                if code == errcls.PROXY_BILLING_ERROR:
                    logger.warning(
                        f"[{endpoint.tier.value}] proksi hisobida balans tugagan [{code}] -- "
                        f"{_BILLING_COOLDOWN_SECONDS // 3600} soatga cooldown'ga qo'yildi, "
                        "keyingi endpoint'ga o'tilmoqda..."
                    )
                    _record(endpoint, success=False, cooldown_seconds=_BILLING_COOLDOWN_SECONDS)
                    break

                if local_attempt == 0 and errcls.should_retry(code):
                    logger.warning(
                        f"[{endpoint.tier.value}] urinish muvaffaqiyatsiz [{code}] "
                        f"({errcls.scrub_secrets(str(e))}) -- xuddi shu endpoint'da qayta urinilmoqda..."
                    )
                    time.sleep(_RETRY_SLEEP_BASE + random.random() * _RETRY_SLEEP_JITTER)
                    continue

                # AUTH_ERROR, or the bounded same-endpoint retry also failed --
                # this endpoint is done, move on to the next one in the chain.
                _record(endpoint, success=False)
                break

    raise last_exc
