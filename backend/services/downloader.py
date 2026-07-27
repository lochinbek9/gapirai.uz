"""
Downloader — yt-dlp with cookies auth, iOS fallback, and Redis-based rate limiting.
Single-IP safe: prevents hammering YouTube even under concurrent job requests.
"""
import os
import time
import random
import logging
import subprocess
import yt_dlp
from pathlib import Path
from redis import Redis

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
CONTAINER_UPLOADS_DIR = os.getenv("CONTAINER_UPLOADS_DIR", "/app/uploads")

COOKIES_PATH = os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies.txt")


class YoutubeRateLimiter:
    """Redis-backed lock ensuring only one download at a time with cooldown."""

    MIN_COOLDOWN = 30       # minimum seconds between download starts
    MAX_COOLDOWN = 300      # cap exponential backoff at 5 minutes
    MAX_CONCURRENT = 1
    ACQUIRE_TIMEOUT = 600   # max wait for a slot (10 minutes)
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


def _build_yt_opts(extra: dict | None = None) -> dict:
    """yt-dlp options tuned for single-IP anti-blocking.

    Auth: cookies.txt (required). Falls back to unauthenticated iOS client if cookies missing.
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
                "player_client": "web,web_creator,ios",
                "player_skip": ["webpage", "configs"],
            }
        },
    }

    if os.path.isfile(COOKIES_PATH):
        opts["cookiefile"] = COOKIES_PATH
    else:
        # No cookies — use iOS-only (less strict) but limited formats
        opts["extractor_args"]["youtube"]["player_client"] = "ios,web_creator"

    if extra:
        opts.update(extra)
    return opts


def get_video_info(youtube_url: str) -> dict:
    opts = _build_yt_opts()

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
        return {
            "title": info.get("title", "Unknown"),
            "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail", ""),
            "uploader": info.get("uploader", ""),
        }


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
    opts = _build_yt_opts({
        "outtmpl": video_tpl,
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
    })

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            title = info.get("title", "Unknown")
            duration = float(info.get("duration", 0) or 0)
    except Exception as e:
        raise RuntimeError(f"Video yuklashda xatolik: {e}")

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

    audio_file = job_dir / "audio.wav"
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", str(video_file),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(audio_file),
    ]
    proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Audio ajratishda xatolik: {proc.stderr[-500:]}")

    container_video = Path(CONTAINER_UPLOADS_DIR) / job_id / video_file.name
    container_audio = Path(CONTAINER_UPLOADS_DIR) / job_id / audio_file.name

    return {
        "video_path": str(container_video),
        "audio_path": str(container_audio),
        "title": title,
        "duration": duration,
    }
