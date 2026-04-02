import yt_dlp
import os
import re
from pathlib import Path
from backend.config import get_settings

settings = get_settings()


def sanitize_filename(name: str) -> str:
    """Fayl nomidan xavfli belgilarni olib tashlash."""
    return re.sub(r'[\\/*?:"<>|]', "_", name)


def get_video_info(youtube_url: str) -> dict:
    """YouTube video haqida ma'lumot olish (yuklamasdan)."""
    ydl_opts = {"quiet": True, "no_warnings": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=False)
        return {
            "title": info.get("title", "Unknown"),
            "duration": info.get("duration", 0),
            "thumbnail": info.get("thumbnail", ""),
            "uploader": info.get("uploader", ""),
        }


def download_video(youtube_url: str, job_id: str) -> dict:
    """
    YouTube'dan videoni yuklab olish.

    Returns:
        dict: {
            "video_path": str,  # Video fayl yo'li (audio yo'q)
            "audio_path": str,  # Audio fayl yo'li (faqat audio)
            "title": str,
            "duration": float
        }
    """
    output_dir = Path(settings.UPLOAD_DIR) / job_id
    output_dir.mkdir(parents=True, exist_ok=True)

    video_path = str(output_dir / "video.%(ext)s")
    audio_path = str(output_dir / "audio.%(ext)s")

    # 1. Faqat video (audio siz) yuklab olish
    video_opts = {
        "format": "bestvideo[ext=mp4]/bestvideo",
        "outtmpl": video_path,
        "quiet": True,
        "no_warnings": True,
    }

    # 2. Faqat audio yuklab olish
    audio_opts = {
        "format": "bestaudio/best",
        "outtmpl": audio_path,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
        "quiet": True,
        "no_warnings": True,
    }

    title = "Unknown"
    duration = 0

    with yt_dlp.YoutubeDL(video_opts) as ydl:
        info = ydl.extract_info(youtube_url, download=True)
        title = info.get("title", "Unknown")
        duration = info.get("duration", 0)

    with yt_dlp.YoutubeDL(audio_opts) as ydl:
        ydl.download([youtube_url])

    # Yaratilgan fayllarni topish
    downloaded_video = _find_file(output_dir, "video")
    downloaded_audio = _find_file(output_dir, "audio")

    return {
        "video_path": str(downloaded_video),
        "audio_path": str(downloaded_audio),
        "title": title,
        "duration": duration,
    }


def _find_file(directory: Path, prefix: str) -> Path:
    """Papkadan prefiks bo'yicha faylni topish."""
    for f in directory.iterdir():
        if f.stem == prefix:
            return f
    raise FileNotFoundError(f"'{prefix}' fayli topilmadi: {directory}")
