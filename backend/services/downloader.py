"""
Downloader — performs downloads locally inside the worker using yt-dlp and ffmpeg.
Uses PO Token provider for YouTube bot detection bypass.
"""
import os
import subprocess
import logging
import yt_dlp
from pathlib import Path
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
CONTAINER_UPLOADS_DIR = os.getenv("CONTAINER_UPLOADS_DIR", "/app/uploads")


def _get_yt_opts() -> dict:
    """Base yt-dlp options with PO token + anti-bot settings."""
    return {
        "quiet": True,
        "no_warnings": True,
        "extractor_args": {
            "youtube": {
                "player_client": "tv,web_embedded",
                "player_skip": "webpage",
            }
        },
        "force_ipv4": True,
    }


def get_video_info(youtube_url: str) -> dict:
    """YouTube video haqida ma'lumot olish (yuklamasdan)."""
    opts = _get_yt_opts()

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
    Download video and extract audio locally using yt-dlp and ffmpeg.
    Returns dict with video_path, audio_path, title, duration where paths are
    mount-visible inside containers (e.g. /app/uploads/<job_id>/video.mp4).
    """
    job_dir = Path(settings.UPLOAD_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_tpl = str(job_dir / "video.%(ext)s")
    opts = _get_yt_opts()
    opts.update({
        "outtmpl": video_tpl,
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
        "retries": 3,
        "fragment_retries": 3,
        "socket_timeout": 30,
    })

    title = "Unknown"
    duration = 0.0

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(youtube_url, download=True)
            title = info.get("title", "Unknown")
            duration = float(info.get("duration", 0) or 0)
    except Exception as e:
        raise RuntimeError(f"Video yuklashda xatolik: {e}")

    # Find downloaded video file
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

    # Extract audio with ffmpeg (16kHz mono WAV for transcription)
    audio_file = job_dir / "audio.wav"
    ffmpeg_cmd = [
        "ffmpeg", "-y", "-i", str(video_file),
        "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(audio_file)
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
