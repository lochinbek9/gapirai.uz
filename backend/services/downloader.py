"""
Downloader — Docker worker tomonidan chaqiriladi.
Haqiqiy yuklab olish host Mac dagi download_service.py da amalga oshiriladi.
Docker ichidan host ga: http://host.docker.internal:8001
"""
import os
import yt_dlp
import httpx
from pathlib import Path
from backend.config import get_settings

settings = get_settings()

# Host Mac dagi download servisi manzili
DOWNLOAD_SERVICE_URL = os.getenv("DOWNLOAD_SERVICE_URL", "http://host.docker.internal:8001")
COOKIES_FILE = "/app/cookies.txt"


def get_video_info(youtube_url: str) -> dict:
    """YouTube video haqida ma'lumot olish (yuklamasdan)."""
    opts = {"quiet": True, "no_warnings": True}
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 100:
        opts["cookiefile"] = COOKIES_FILE

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
        return {
            "title": info.get("title", "Unknown"),
            "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail", ""),
            "uploader": info.get("uploader", ""),
        }


def download_video(youtube_url: str, job_id: str) -> dict:
    """
    Host Mac dagi download servisiga so'rov yuborish.
    Natija: video va audio fayl yo'llari.
    """
    try:
        response = httpx.post(
            f"{DOWNLOAD_SERVICE_URL}/download",
            json={"youtube_url": youtube_url, "job_id": job_id},
            timeout=600.0,  # 10 daqiqa — katta videolar uchun
        )
        response.raise_for_status()
        data = response.json()
        return {
            "video_path": data["video_path"],
            "audio_path": data["audio_path"],
            "title": data["title"],
            "duration": data["duration"],
        }
    except httpx.ConnectError:
        raise RuntimeError(
            "Download servisi topilmadi. "
            "Host Mac da `python download_service.py` ni ishga tushiring."
        )
    except httpx.HTTPStatusError as e:
        raise RuntimeError(f"Download xatolik: {e.response.json().get('detail', str(e))}")
