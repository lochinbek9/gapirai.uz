"""
Downloader — yt-dlp with cookies auth, iOS fallback, and Redis-based rate limiting.
Single-IP safe: prevents hammering YouTube even under concurrent job requests.
"""
import os
import time
import random
import logging
import subprocess
import tempfile
import shutil
from contextlib import contextmanager
import yt_dlp
from pathlib import Path
from redis import Redis


from backend.config import get_settings
from backend.services.errors import PermanentError

logger = logging.getLogger(__name__)
settings = get_settings()

COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies.txt")

# Video haqiqiy fayli hech qachon foydalanuvchiga ko'rsatilmaydigan hajmdan
# oshib ketmasligi uchun (disk to'lib qolishining oldini olish).
MAX_DOWNLOAD_SIZE_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB

# yt-dlp/YouTube'dan qaytadigan, qayta urinish bilan hal bo'lmaydigan
# xatolik matnlari — bunday holatlarda job darhol FAILED bo'lishi kerak,
# 3 marta behuda qayta urinilmasligi kerak.
_PERMANENT_ERROR_PATTERNS = [
    "private video",
    "video unavailable",
    "video is unavailable",
    "no longer available",
    "has been removed",
    "account associated with this video has been terminated",
    "this video is not available",
    "copyright",
    "members-only",
    "premieres in",
    "live event will begin",
    "this live stream recording is not available",
    "video has been removed",
    "unable to extract",
]


def _is_permanent_download_error(err_str: str) -> bool:
    low = err_str.lower()
    return any(pattern in low for pattern in _PERMANENT_ERROR_PATTERNS)


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


def _build_yt_opts(extra: dict | None = None, use_cookies: bool = True) -> tuple[dict, str | None]:
    """yt-dlp options tuned for single-IP anti-blocking.

    Auth: cookies.txt (optional). Falls back to unauthenticated iOS/Android client if cookies missing or disabled.
    Copies cookies.txt to a temporary file so yt-dlp can write session cookies without failing
    if COOKIES_PATH is on a read-only filesystem mount.
    """
    opts: dict = {
        "quiet": True,
        "no_warnings": True,
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
                # muvaffaqiyatli bo'ldi). ios/android/mweb PO token bilan
                # birga ishonchli ishlaydi, cookies bo'lsa ham ular orqali
                # qo'llanadi.
                "player_client": ["ios", "android", "mweb"],
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
    }

    if settings.YOUTUBE_PROXY_ENABLED and settings.YOUTUBE_PROXY_URL:
        opts["proxy"] = settings.YOUTUBE_PROXY_URL

    temp_cookie_path = None
    cookies_target = os.getenv("YOUTUBE_COOKIES_PATH", COOKIES_PATH)
    if use_cookies and os.path.isfile(cookies_target):
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
def get_yt_dlp(extra: dict | None = None, use_cookies: bool = True):
    """Context manager for YoutubeDL instance ensuring temporary cookie files are cleaned up."""
    opts, temp_cookie_path = _build_yt_opts(extra, use_cookies=use_cookies)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            yield ydl
    finally:
        if temp_cookie_path and os.path.exists(temp_cookie_path):
            try:
                os.remove(temp_cookie_path)
            except Exception as e:
                logger.warning(f"Could not remove temp cookie file {temp_cookie_path}: {e}")


_BOT_CHECK_MARKERS = ("cookies are no longer valid", "Sign in to confirm you")


def _extract_info_dict(ydl, youtube_url: str) -> dict:
    info = ydl.extract_info(youtube_url, download=False)
    return {
        "title": info.get("title", "Unknown"),
        "duration": info.get("duration", 0),
        "thumbnail": info.get("thumbnail", ""),
        "uploader": info.get("uploader", ""),
    }


def get_video_info(youtube_url: str) -> dict:
    # "Sign in to confirm you're not a bot" tekshirilganda PROKSI ROTATSIYA
    # QILUVCHI IP SIFATIGA BOG'LIQ — cookies yoki PO token doimiy buzuq emas
    # (2026-08-13 haqiqiy testda tasdiqlangan: xuddi shu so'rov 3 urinishdan
    # 2 tasida muvaffaqiyatli bo'ldi). Shuning uchun bu xato uchun bir necha
    # marta (yangi proksi IP bilan) qayta urinish ma'noli — darhol "cookielar
    # eskirgan" deb xabar berish o'rniga.
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with get_yt_dlp(use_cookies=True) as ydl:
                return _extract_info_dict(ydl, youtube_url)
        except Exception as e:
            last_exc = e
            if not any(marker in str(e) for marker in _BOT_CHECK_MARKERS):
                break  # boshqa turdagi xato — qayta urinish foydasiz
            if attempt < 2:
                logger.warning(f"Bot-check xatosi (urinish {attempt + 1}/3), qayta urinilmoqda: {e}")
                time.sleep(2 + random.random() * 2)

    logger.warning(f"Extract info with cookies failed ({last_exc}). Retrying without cookies...")
    try:
        with get_yt_dlp(use_cookies=False) as ydl:
            return _extract_info_dict(ydl, youtube_url)
    except Exception as e2:
        err_str = f"{last_exc} | {e2}"
        if any(marker in err_str for marker in _BOT_CHECK_MARKERS):
            raise RuntimeError(
                "YouTube session cookielari eskirgan. Iltimos, cookies.txt faylini Incognito rejimida YouTube ga kirib qayta eksport qiling va serverga yuklang."
            ) from e2
        if _is_permanent_download_error(err_str):
            raise PermanentError(
                "Bu videoni ochib bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
                code="VIDEO_UNAVAILABLE",
            ) from e2
        raise RuntimeError(f"Video ma'lumot olishda xatolik: {e2}") from e2


def download_video(youtube_url: str, job_id: str) -> dict:
    _rate_limiter.acquire()
    try:
        return _do_download(youtube_url, job_id)
    except Exception:
        _rate_limiter.mark_failure()
        raise
    else:
        _rate_limiter.mark_success()
    finally:
        _rate_limiter.release()


def _do_download(youtube_url: str, job_id: str) -> dict:
    job_dir = Path(settings.UPLOAD_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_tpl = str(job_dir / "video.%(ext)s")
    extra_opts = {
        "outtmpl": video_tpl,
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
    }

    last_exc: Exception | None = None
    info = None
    for attempt in range(3):
        try:
            with get_yt_dlp(extra_opts, use_cookies=True) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                title = info.get("title", "Unknown")
                duration = float(info.get("duration", 0) or 0)
            last_exc = None
            break
        except Exception as e:
            last_exc = e
            if not any(marker in str(e) for marker in _BOT_CHECK_MARKERS):
                break
            if attempt < 2:
                logger.warning(f"Bot-check xatosi yuklab olishda (urinish {attempt + 1}/3), qayta urinilmoqda: {e}")
                time.sleep(2 + random.random() * 2)

    if last_exc is not None:
        e = last_exc
        logger.warning(f"Download with cookies failed ({e}). Retrying without cookies...")
        try:
            with get_yt_dlp(extra_opts, use_cookies=False) as ydl:
                info = ydl.extract_info(youtube_url, download=True)
                title = info.get("title", "Unknown")
                duration = float(info.get("duration", 0) or 0)
        except Exception as e2:
            err_str = f"{e} | {e2}"
            if any(marker in err_str for marker in _BOT_CHECK_MARKERS):
                raise RuntimeError(
                    "YouTube session cookielari eskirgan. Iltimos, cookies.txt faylini Incognito rejimida YouTube ga kirib qayta eksport qiling va serverga yuklang."
                ) from e2
            if _is_permanent_download_error(err_str):
                raise PermanentError(
                    "Bu videoni yuklab bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
                    code="VIDEO_UNAVAILABLE",
                ) from e2
            raise RuntimeError(f"Video yuklashda xatolik: {e2}") from e2

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
