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
    cookies_target = os.getenv("YOUTUBE_COOKIES_PATH", COOKIES_PATH)
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
        "force_ipv4": True,
        "socket_timeout": 30,
        "retries": 5,
        "fragment_retries": 5,
        "retry_sleep_functions": {
            "http": lambda n: min(60, 5 * (2 ** n)),
            "fragment": lambda n: min(30, 2 * (2 ** n)),
        },
        "extractor_args": {
            "youtube": {
                # "web" client ataylab CHIQARIB TASHLANGAN — cookies bilan
                # ishlatilganda deyarli har doim "Requested format is not
                # available" xatosiga olib kelardi (2026-08-13, real
                # foydalanuvchi joblarida tasdiqlangan: xuddi shu video "web"
                # bilan muvaffaqiyatsiz, faqat ios/android/mweb bilan
                # muvaffaqiyatli bo'ldi).
                #
                # 2026-08-27 audit: mweb ENDI BIRINCHI — YouTube'ning "GVS PO
                # Token'ni video ID'ga bog'lash" tajribasi (yt-dlp o'zi
                # aniqlagan, o'zgartirib bo'lmaydi) haqiqiy, ishlaydigan PO
                # token'ni FAQAT mweb mijoziga beradi. Ilgari ios birinchi
                # bo'lgani uchun yt-dlp har safar avval ios formatlarini
                # so'rar, PO token yo'qligini aniqlab ularni tashlab yuborar
                # ("...may yield HTTP Error 403", productionda tasdiqlangan),
                # va faqat SHUNDAN KEYIN mweb'ga o'tardi — bekorchi so'rov va
                # kechikish, hech qanday foyda bermasdan. mweb birinchi bo'lsa,
                # ishlaydigan PO token'li javob DARHOL kelib, ios/android'ga
                # umuman ehtiyoj qolmaydi (ular hali ham zaxira sifatida
                # qoladi -- agar mweb muvaffaqiyatsiz bo'lsa).
                "player_client": ["mweb", "ios", "android"],
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
    cookies_target = os.getenv("YOUTUBE_COOKIES_PATH", COOKIES_PATH)
    if use_cookies and os.path.isfile(cookies_target) and not _cookies_are_stale(cookies_target):
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


# 2026-08-27 audit: replaced the old datacenter -> residential -> no-cookies
# -> no-cookies-residential escalation chain entirely. A controlled,
# isolated 12-video experiment (4 videos per path, no cross-path
# escalation) measured:
#   cookies+mweb, no proxy:     0/4 first-attempt, 0/4 eventual
#   datacenter+mweb:            0/4 first-attempt, 0/4 eventual
#   residential+mweb:           2/4 first-attempt, 3/4 eventual
# Datacenter provided no measurable benefit over no proxy at all (both
# dominated by LOGIN_REQUIRED at the info stage) -- sending every attempt
# through it first was pure wasted latency before ever reaching the one
# path that actually works. Residential is now the ONLY production path,
# with exactly one bounded retry on that SAME path (proven to recover
# genuinely retryable failures in the experiment) -- never a different
# proxy tier, never more than one retry. Cookie-loading support is kept
# intact (use_cookies=True) as an available-but-not-primary input; see
# _CookieSessionLogger above for why cookie validity is tracked separately
# from this retry decision rather than folded into it.
_RESIDENTIAL_RETRY_SLEEP_BASE = 2.0
_RESIDENTIAL_RETRY_SLEEP_JITTER = 2.0
_RESIDENTIAL_MAX_ATTEMPTS = 4  # 2026-08-28: raised from 2 (1 bounded retry) to 4
# (3 bounded retries) -- measured eventual-success rate with 2 attempts was
# ~65-75%, well below what independent per-attempt probability would predict,
# so more attempts on the SAME residential path were tried as the cheapest
# next lever before evaluating a different proxy provider. Still never
# escalates to a different proxy tier -- datacenter remains untouched.


def _residential_attempt(action, extra: dict | None = None, use_cookies: bool = True):
    """Runs `action(ydl)` via the residential proxy -- the sole production
    ingestion path. On a RETRYABLE failure (error_classification.should_retry),
    retries on this SAME path up to _RESIDENTIAL_MAX_ATTEMPTS total attempts;
    on a non-retryable failure (AUTH_ERROR/VIDEO_UNAVAILABLE/
    PROXY_BILLING_ERROR), fails immediately with no retry, matching the
    existing no-blind-retry rule used everywhere else in this pipeline.
    Never escalates to a different proxy tier -- datacenter is no longer
    attempted at all in the normal path (see the module-level comment above
    for why)."""
    last_exc: Exception | None = None
    for attempt in range(_RESIDENTIAL_MAX_ATTEMPTS):
        try:
            with get_yt_dlp(extra, use_cookies=use_cookies, proxy_url=settings.YOUTUBE_RESIDENTIAL_PROXY_URL) as ydl:
                return action(ydl)
        except Exception as e:
            last_exc = e
            error_code = errcls.classify_text(str(e))
            if attempt < _RESIDENTIAL_MAX_ATTEMPTS - 1 and errcls.should_retry(error_code):
                logger.warning(
                    f"Residential urinish muvaffaqiyatsiz [{error_code}] "
                    f"({errcls.scrub_secrets(str(e))}), xuddi shu yo'lda qayta urinilmoqda "
                    f"({attempt + 2}/{_RESIDENTIAL_MAX_ATTEMPTS})..."
                )
                time.sleep(_RESIDENTIAL_RETRY_SLEEP_BASE + random.random() * _RESIDENTIAL_RETRY_SLEEP_JITTER)
                continue
            break
    raise last_exc


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
        return _residential_attempt(lambda ydl: _extract_info_dict(ydl, youtube_url), use_cookies=True)
    except Exception as e2:
        code = errcls.classify_text(str(e2))
        if code == errcls.VIDEO_UNAVAILABLE:
            raise PermanentError(
                "Bu videoni ochib bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
                code=errcls.VIDEO_UNAVAILABLE,
            ) from e2
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
    job_dir = Path(settings.UPLOAD_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_tpl = str(job_dir / "video.%(ext)s")
    extra_opts = {
        "outtmpl": video_tpl,
        "format": f"bestvideo[ext=mp4][height<={max_height}]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
    }

    def _do_extract(ydl):
        info = ydl.extract_info(youtube_url, download=True)
        return info.get("title", "Unknown"), float(info.get("duration", 0) or 0)

    try:
        title, duration = _residential_attempt(_do_extract, extra=extra_opts, use_cookies=True)
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
