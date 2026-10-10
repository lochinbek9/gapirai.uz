"""
Downloader — yt-dlp with cookies auth, iOS fallback, and Redis-based rate limiting.
Single-IP safe: prevents hammering YouTube even under concurrent job requests.
"""
import os
import re
import time
import random
import logging
import subprocess
import tempfile
import shutil
from contextlib import contextmanager
import requests
import yt_dlp
from pathlib import Path
from redis import Redis


from backend.config import get_settings
from backend.services.errors import PermanentError
from backend.services import error_classification as errcls
from backend.services import proxy_manager

logger = logging.getLogger(__name__)
settings = get_settings()

COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies.txt")

# Video haqiqiy fayli hech qachon foydalanuvchiga ko'rsatilmaydigan hajmdan
# oshib ketmasligi uchun (disk to'lib qolishining oldini olish).
MAX_DOWNLOAD_SIZE_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB


def _is_permanent_download_error(err_str: str) -> bool:
    return errcls.classify_text(err_str) == errcls.VIDEO_UNAVAILABLE


class YoutubeRateLimiter:
    """Redis-backed lock ensuring only one download at a time with cooldown."""

    MIN_COOLDOWN = 30       # minimum seconds between download starts
    MAX_COOLDOWN = 300      # cap exponential backoff at 5 minutes
    MAX_CONCURRENT = 1
    ACQUIRE_TIMEOUT = 8000   # max wait for a slot (10 minutes)
    POLL_INTERVAL = 1.5     # sleep between slot checks

    def __init__(self, redis_url: str):
        self._redis: Redis | None = None
        self._redis_url = redis_url

    @property
    def redis(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    def acquire(self, timeout: int = ACQUIRE_TIMEOUT) -> None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            current = int(self.redis.get("yt_dl:concurrent") or 0)
            if current >= self.MAX_CONCURRENT:
                time.sleep(self.POLL_INTERVAL)
                continue

            last = self.redis.get("yt_dl:last_start")
            if last:
                elapsed = time.time() - float(last)
                if elapsed < self.MIN_COOLDOWN:
                    time.sleep(min(self.POLL_INTERVAL, self.MIN_COOLDOWN - elapsed + 0.5))
                    continue

            pipe = self.redis.pipeline()
            pipe.incr("yt_dl:concurrent")
            pipe.expire("yt_dl:concurrent", 180)
            pipe.set("yt_dl:last_start", time.time())
            pipe.expire("yt_dl:last_start", 3600)
            results = pipe.execute()

            if results[0] == 1:
                return
            time.sleep(0.5)

        raise RuntimeError("YouTube download slot not available — too many requests")

    def release(self) -> None:
        pipe = self.redis.pipeline()
        pipe.decr("yt_dl:concurrent")
        pipe.set("yt_dl:last_start", time.time())
        pipe.expire("yt_dl:last_start", 3600)
        pipe.execute()

    def mark_failure(self) -> None:
        fails = self.redis.incr("yt_dl:fails")
        self.redis.expire("yt_dl:fails", 3600)
        backoff = min(self.MAX_COOLDOWN, self.MIN_COOLDOWN * (2 ** fails))
        jitter = random.uniform(0, backoff * 0.3)
        self.redis.set("yt_dl:last_start", time.time() + backoff + jitter)

    def mark_success(self) -> None:
        self.redis.delete("yt_dl:fails")


_rate_limiter = YoutubeRateLimiter(settings.REDIS_URL)


# Cookie freshness -- makes cookie availability EXPLICIT rather than
# blindly trusting whatever file happens to be mounted at COOKIES_PATH.
# cookies.txt here is a manually-maintained, manually-refreshed export
# (see backend/services/README or the ingestion audit) -- there is no
# automated refresh, and there must not be one (no personal-account login
# automation in this codebase). A file older than the threshold is more
# likely to trigger a wasted, bot-check-flavored request than to succeed,
# so it is treated as absent: the existing cookie-less fallback path runs
# instead, and this is logged (server-side only) as a clear diagnostic
# rather than failing silently or blindly attempting stale credentials.
YOUTUBE_COOKIES_MAX_AGE_HOURS = float(os.getenv("YOUTUBE_COOKIES_MAX_AGE_HOURS", "96"))


def _cookies_are_stale(path: str) -> bool:
    try:
        if not os.path.isfile(path) or os.path.getsize(path) < 50:
            return True
        age_hours = (time.time() - os.path.getmtime(path)) / 3600
    except OSError:
        return True
    if age_hours > YOUTUBE_COOKIES_MAX_AGE_HOURS:
        logger.warning(
            f"YouTube cookies file is {age_hours:.0f}h old (max {YOUTUBE_COOKIES_MAX_AGE_HOURS:.0f}h) "
            "-- treating as absent and proceeding without cookies. No cookie contents logged."
        )
        return True
    return False


def cookie_status() -> dict:
    """Explicit, inspectable cookie state -- present/absent, fresh/stale,
    age in hours. No cookie contents, ever. Intended for operator-facing
    diagnostics (e.g. an admin/health endpoint), not end-user output."""
    from backend.services.cookie_manager import get_effective_cookies_path
    cookies_target = get_effective_cookies_path()
    if not os.path.isfile(cookies_target):
        return {"present": False, "fresh": False, "age_hours": None}
    age_hours = (time.time() - os.path.getmtime(cookies_target)) / 3600
    return {
        "present": True,
        "fresh": age_hours <= YOUTUBE_COOKIES_MAX_AGE_HOURS,
        "age_hours": round(age_hours, 1),
    }


class _CookieSessionLogger:
    """Routes yt-dlp's own internal warnings through this project's logger
    instead of letting them vanish into quiet/no_warnings suppression --
    specifically to surface ONE distinct, previously-invisible signal:
    yt-dlp's own detection that the loaded cookie SESSION is server-side
    invalid. This is NOT the same thing as file-age staleness (that's
    _cookies_are_stale(), checked entirely separately) -- a cookie file can
    be fresh by age and still session-invalid, exactly as confirmed live in
    the 2026-08-27 isolated-path reliability experiment (this warning fired
    on effectively every attempt, success or failure alike).

    2026-08-27 audit: logged as its own distinct, greppable marker
    (COOKIE_SESSION_INVALID) rather than folded into the existing AUTH_ERROR
    classification -- the experiment showed this signal does NOT reliably
    predict failure (mweb succeeds via PO-token regardless of it), so it
    must not change retry/success decisions, only add visibility for
    diagnosing WHY a failure happened when one does. Everything else is
    silently dropped, matching the prior quiet/no_warnings behavior exactly
    -- and this never logs cookie contents, only yt-dlp's own fixed
    warning text (scrubbed defensively anyway)."""

    def debug(self, msg):
        pass

    def info(self, msg):
        pass

    def warning(self, msg):
        if "cookies are no longer valid" in msg or "have likely been rotated" in msg:
            logger.warning(
                f"[COOKIE_SESSION_INVALID] yt-dlp cookie sessiyasini tekshirishda: "
                f"sessiya haqiqiy emas deb aniqlandi (fayl yangi bo'lsa ham -- bu "
                f"fayl yoshi emas, sessiya haqiqiyligi muammosi): {errcls.scrub_secrets(msg)}"
            )

    def error(self, msg):
        pass


def _build_yt_opts(extra: dict | None = None, use_cookies: bool = True, proxy_url: str | None = None) -> tuple[dict, str | None]:
    """yt-dlp options tuned for single-IP anti-blocking.

    Auth: cookies.txt (optional). Falls back to unauthenticated iOS/Android client if cookies missing or disabled.
    Copies cookies.txt to a temporary file so yt-dlp can write session cookies without failing
    if COOKIES_PATH is on a read-only filesystem mount.
    """
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
        "logger": _CookieSessionLogger(),
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "retry_sleep_functions": {
            "http": lambda n: min(60, 5 * (2 ** n)),
            "fragment": lambda n: min(30, 2 * (2 ** n)),
        },
        "extractor_args": {
            "youtube": {
                # Zamonaviy yt-dlp va bgutil pot-provider bilan ishlaydigan mijozlar
                "player_client": ["mweb", "web", "tv", "tv_downgraded", "android", "ios"],
                "fetch_pot": ["always"],
            },
            # PO token provider (bgutil, docker-compose "pot-provider" sidecar) —
            # bu YouTube'ning "Sign in to confirm you're not a bot" bloklashini
            # yengish uchun ishlatiladi. Avval faqat CLI konfiguratsiya faylida
            # (backend/Dockerfile: ~/.config/yt-dlp/config) berilgan edi — bu
            # FAQAT `yt-dlp` buyruq qatoridan chaqirilganda o'qiladi, biz esa
            # Python API (yt_dlp.YoutubeDL) orqali ishlatamiz, u CLI config
            # faylini o'qimaydi. Natijada PO token provider hech qachon
            # haqiqatda ishlatilmagan edi — bu productionda ko'plab haqiqiy
            # "cookielari eskirgan"/bot-bloklash xatolarining asosiy sababi
            # bo'lgan (2026-08-13, real job orqali tasdiqlangan: xuddi shu
            # video PO token'siz muvaffaqiyatsiz, PO token bilan muvaffaqiyatli
            # bo'ldi). Shuning uchun endi bu yerda, Python opts ichida ham
            # aniq beriladi.
            "youtubepot-bgutilhttp": {"base_url": ["http://pot-provider:4416"]},
        },
        # Deno-backed JS interpreter + the EJS remote component, for
        # decoding YouTube's obfuscated signature/n-parameter scheme --
        # the same thing a real browser's own JS engine does natively.
        # This is required extraction machinery, not an anti-bot bypass:
        # yt-dlp cannot resolve some signed media URLs at all without it,
        # independent of any bot-check. The backend Docker image already
        # installs Deno specifically for this (see Dockerfile) and wrote
        # it into a yt-dlp CLI config file that this Python API path never
        # reads -- the same class of dead-config bug the PO-token base_url
        # above already fixed once (2026-08-13). Wiring it in here closes
        # that gap for the js_runtimes/remote_components half too
        # (2026-08-26 ingestion audit).
        # NOTE: js_runtimes takes a {runtime: config} dict in the Python
        # API, NOT the list the --js-runtimes CLI flag accepts -- verified
        # directly against yt-dlp's own option-parsing source. The value
        # must be an actual dict, not None: yt-dlp's own live production
        # verification (2026-08-26) caught `config.get('path')` being
        # called unconditionally on this value inside YoutubeDL._js_runtimes
        # -- None crashes with AttributeError, even though the validator
        # that runs at YoutubeDL() construction time accepts None.
        "js_runtimes": {"deno": {}},
        "remote_components": ["ejs:github"],
    }

    if proxy_url is not None:
        if proxy_url:
            opts["proxy"] = proxy_url
    elif settings.YOUTUBE_PROXY_ENABLED and settings.YOUTUBE_PROXY_URL:
        opts["proxy"] = settings.YOUTUBE_PROXY_URL

    temp_cookie_path = None
    from backend.services.cookie_manager import get_effective_cookies_path
    cookies_target = get_effective_cookies_path()
    if use_cookies and os.path.isfile(cookies_target) and os.path.getsize(cookies_target) >= 50 and not _cookies_are_stale(cookies_target):
        try:
            tmp = tempfile.NamedTemporaryFile(suffix=".txt", delete=False)
            shutil.copyfile(cookies_target, tmp.name)
            tmp.close()
            temp_cookie_path = tmp.name
            opts["cookiefile"] = temp_cookie_path
        except Exception as e:
            logger.warning(f"Could not copy cookies file from {cookies_target}: {e}")
            opts["cookiefile"] = cookies_target
    if extra:
        opts.update(extra)
    return opts, temp_cookie_path


@contextmanager
def get_yt_dlp(extra: dict | None = None, use_cookies: bool = True, proxy_url: str | None = None):
    """Context manager for YoutubeDL instance ensuring temporary cookie files are cleaned up."""
    opts, temp_cookie_path = _build_yt_opts(extra, use_cookies=use_cookies, proxy_url=proxy_url)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            yield ydl
    finally:
        if temp_cookie_path and os.path.exists(temp_cookie_path):
            try:
                os.remove(temp_cookie_path)
            except Exception as e:
                logger.warning(f"Could not remove temp cookie file {temp_cookie_path}: {e}")


# 2026-08-27 audit found datacenter proxies gave zero measurable benefit
# over a direct connection for YouTube's bot-check, and residential was the
# only tier that actually helped -- see backend/services/proxy_manager.py's
# module docstring for the full experiment writeup. That single-tier,
# single-URL logic (formerly `_residential_attempt` here) has been replaced
# by proxy_manager.run_with_proxy_chain(), a configurable multi-endpoint
# chain (direct -> datacenter pool -> residential pool) driven by .env —
# 2026-09-04, added once a single static residential URL was no longer
# enough (needed rotation across several proxies + per-proxy health
# tracking, not just one path with one fallback).


def _extract_info_dict(ydl, youtube_url: str) -> dict:
    info = ydl.extract_info(youtube_url, download=False)
    return {
        "title": info.get("title", "Unknown"),
        "duration": info.get("duration", 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", ""),
        "description": info.get("description", ""),
    }


_YT_VIDEO_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|embed/)|music\.youtube\.com/watch\?v=)"
    r"([A-Za-z0-9_-]{11})"
)

_ISO8601_DURATION_RE = re.compile(
    r"P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"
)


def _parse_iso8601_duration(duration: str) -> int:
    """YouTube Data API "PT4M13S" formatidagi davomiylikni sekundga o'giradi."""
    m = _ISO8601_DURATION_RE.match(duration or "")
    if not m:
        return 0
    hours, minutes, seconds = (int(g) if g else 0 for g in m.groups())
    return hours * 3600 + minutes * 60 + seconds


def _get_video_info_via_api(youtube_url: str) -> dict | None:
    """YouTube Data API v3 orqali metadata olish -- yt-dlp skrapping talab
    qilmagani uchun bot-check xavfi umuman yo'q. API kalit sozlanmagan yoki
    video ID ajratilmasa None qaytadi (chaqiruvchi yt-dlp'ga tushadi)."""
    if not settings.YOUTUBE_DATA_API_KEY:
        return None
    m = _YT_VIDEO_ID_RE.search(youtube_url or "")
    if not m:
        return None
    video_id = m.group(1)
    try:
        resp = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "snippet,contentDetails",
                "id": video_id,
                "key": settings.YOUTUBE_DATA_API_KEY,
            },
            timeout=10,
        )
        resp.raise_for_status()
        items = resp.json().get("items", [])
        if not items:
            return None
        snippet = items[0].get("snippet", {})
        content_details = items[0].get("contentDetails", {})
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (
            thumbnails.get("maxres")
            or thumbnails.get("high")
            or thumbnails.get("medium")
            or thumbnails.get("default")
            or {}
        ).get("url", "")
        return {
            "title": snippet.get("title", "Unknown"),
            "duration": _parse_iso8601_duration(content_details.get("duration", "")),
            "thumbnail": thumbnail,
            "uploader": snippet.get("channelTitle", ""),
            "description": snippet.get("description", ""),
        }
    except Exception as e:
        logger.warning(f"YouTube Data API orqali metadata olishda xatolik ({e}) — yt-dlp'ga tushilmoqda.")
        return None


def get_video_info(youtube_url: str) -> dict:
    api_result = _get_video_info_via_api(youtube_url)
    if api_result is not None:
        return api_result

    try:
        return proxy_manager.run_with_proxy_chain(lambda ydl: _extract_info_dict(ydl, youtube_url), use_cookies=True)
    except Exception as e2:
        code = errcls.classify_text(str(e2))
        if code == errcls.VIDEO_UNAVAILABLE:
            raise PermanentError(
                "Bu videoni ochib bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
                code=errcls.VIDEO_UNAVAILABLE,
            ) from e2

        # Favqulodda oEmbed zaxirasi: agar yt-dlp bot-blok yoki tarmoq xatosi bersa ham,
        # frontend'ga video sarlavhasi va rasmini tezkor ko'rsatish uchun.
        m = _YT_VIDEO_ID_RE.search(youtube_url or "")
        if m:
            video_id = m.group(1)
            try:
                oembed_resp = requests.get(
                    f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json",
                    timeout=5,
                )
                if oembed_resp.status_code == 200:
                    data = oembed_resp.json()
                    logger.info(f"oEmbed fallback metadata olindi for {video_id}")
                    return {
                        "title": data.get("title", "Unknown"),
                        "duration": 0,
                        "thumbnail": data.get("thumbnail_url", f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
                        "uploader": data.get("author_name", ""),
                        "description": "",
                    }
            except Exception:
                pass

        # Texnik xabar -- faqat server logi uchun (bu funksiya to'g'ridan-to'g'ri
        # job_creation.py'dan chaqiriladi, u o'zining xavfsiz umumiy xabarini
        # qaytaradi va bu matnni foydalanuvchiga hech qachon ko'rsatmaydi).
        raise RuntimeError(f"Video ma'lumot olishda xatolik [{code}]: {errcls.scrub_secrets(str(e2))}") from e2


def download_video(youtube_url: str, job_id: str, max_height: int = 720) -> dict:
    _rate_limiter.acquire()
    try:
        return _do_download(youtube_url, job_id, max_height=max_height)
    except Exception:
        _rate_limiter.mark_failure()
        raise
    else:
        _rate_limiter.mark_success()
    finally:
        _rate_limiter.release()


def _do_download(youtube_url: str, job_id: str, max_height: int = 720) -> dict:
    job_dir = Path(settings.OUTPUT_DIR) / job_id
    video_dir = job_dir / "video"
    video_dir.mkdir(parents=True, exist_ok=True)
    
    video_tpl = str(video_dir / "video.%(ext)s")

    # Jonli yuklab olish foizi -- DOWNLOADING bosqichi progress oynasiga
    # (5..18) moslanadi; set_subprogress o'zi vaqt/qiymat bo'yicha cheklaydi,
    # shuning uchun yt-dlp hook'ini sekundiga bir necha marta chaqirsa ham
    # xavfsiz (backend/services/job_progress.py).
    from backend.services.job_progress import set_subprogress

    def _dl_progress_hook(d: dict) -> None:
        try:
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate")
                if total:
                    frac = min(1.0, (d.get("downloaded_bytes") or 0) / total)
                    set_subprogress(job_id, 5.0 + frac * 13.0)
            elif d.get("status") == "finished":
                set_subprogress(job_id, 18.0)
        except Exception:
            pass

    extra_opts = {
        "outtmpl": video_tpl,
        "format": f"bestvideo[ext=mp4][height<={max_height}]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "progress_hooks": [_dl_progress_hook],
    }

    def _do_extract(ydl):
        info = ydl.extract_info(youtube_url, download=True)
        return info.get("title", "Unknown"), float(info.get("duration", 0) or 0)

    try:
        title, duration = proxy_manager.run_with_proxy_chain(_do_extract, extra=extra_opts, use_cookies=True)
    except Exception as e2:
        code = errcls.classify_text(str(e2))
        if code == errcls.VIDEO_UNAVAILABLE:
            raise PermanentError(
                "Bu videoni yuklab bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
                code=errcls.VIDEO_UNAVAILABLE,
            ) from e2
        # Texnik xabar -- job.error_message'ga yozilmasdan oldin
        # backend/workers/tasks.py markazlashgan klassifikatsiya +
        # xavfsiz foydalanuvchi xabariga aylantiradi (Priority 1/6).
        raise RuntimeError(f"Video yuklashda xatolik [{code}]: {errcls.scrub_secrets(str(e2))}") from e2

    video_file = None
    for f in job_dir.iterdir():
        if f.is_file() and f.stem == "video":
            video_file = f
            break
    if not video_file:
        files = [f for f in job_dir.iterdir() if f.is_file()]
        if not files:
            raise RuntimeError(f"Yuklangan video topilmadi: {job_dir}")
        video_file = files[0]

    # Kutilganidan ancha katta fayl (masalan noto'g'ri format tanlandi yoki
    # metadata xato) diskni to'ldirib qo'ymasligi uchun darhol o'chiriladi.
    file_size = video_file.stat().st_size
    if file_size > MAX_DOWNLOAD_SIZE_BYTES:
        try:
            video_file.unlink()
        except Exception:
            pass
        raise PermanentError(
            f"Video hajmi ruxsat etilgan chegaradan katta ({file_size / (1024**3):.1f} GB > "
            f"{MAX_DOWNLOAD_SIZE_BYTES / (1024**3):.0f} GB).",
            code="FILE_TOO_LARGE",
        )

    audio_file = job_dir / "audio.wav"
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", str(video_file),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(audio_file),
    ]
    proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Audio ajratishda xatolik: {proc.stderr[-500:]}")

    return {
        "video_path": str(video_file),
        "audio_path": str(audio_file),
        "title": title,
        "duration": duration,
    }
