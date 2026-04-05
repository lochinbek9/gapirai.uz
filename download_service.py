"""
Download Service — Host Mac da ishlaydi (Docker ichida emas).
yt-dlp Python API orqali YouTube dan video va audio yuklab oladi.
Android player client ishlatiladi (EJS/n-challenge o'tkazib yuboriladi).
Docker worker http://host.docker.internal:8001 orqali bu servisga murojaat qiladi.
"""
import os
import subprocess
import json
from pathlib import Path

# Node.js uchun PATH ni kengaytirish
_extra_paths = ["/usr/local/bin", "/opt/homebrew/bin"]
_current_path = os.environ.get("PATH", "")
_missing = [p for p in _extra_paths if p not in _current_path]
if _missing:
    os.environ["PATH"] = ":".join(_missing) + ":" + _current_path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import yt_dlp
import uvicorn

UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

CONTAINER_UPLOADS_DIR = os.getenv("CONTAINER_UPLOADS_DIR", "/app/uploads")
COOKIES_FILE = Path(__file__).parent / "cookies.txt"

app = FastAPI(title="AI Dubber — Download Service")


class DownloadRequest(BaseModel):
    youtube_url: str
    job_id: str


class DownloadResponse(BaseModel):
    video_path: str
    audio_path: str
    title: str
    duration: float


def _build_opts(output_template: str) -> dict:
    opts = {
        "outtmpl": output_template,
        "quiet": False,
        "no_warnings": False,

        # ✅ Android & Web klient — EJS/n-challenge'ni o'tkazib yuboradi
        # Bu "Requested format is not available" muammosini hal qiladi
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
            }
        },

        # Format: 720p MP4 (fallback: har qanday eng yaxshi format)
        "format": "bestvideo[ext=mp4][height<=720]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "merge_output_format": "mp4",
    }

    # Cookie fayli mavjud bo'lsa ishlatamiz
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 100:
        opts["cookiefile"] = str(COOKIES_FILE)
    else:
        # Cookie fayl yo'q bo'lsa Chrome'dan o'qiymiz
        opts["cookiesfrombrowser"] = ("chrome",)

    return opts


@app.get("/health")
def health():
    return {"status": "ok", "service": "download-service"}


@app.post("/download", response_model=DownloadResponse)
def download(req: DownloadRequest):
    job_dir = UPLOADS_DIR / req.job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_tpl = str(job_dir / "video.%(ext)s")
    dl_opts = _build_opts(video_tpl)

    title = "Unknown"
    duration = 0.0

    # ─── 1. Videoni yuklab olish ───
    try:
        with yt_dlp.YoutubeDL(dl_opts) as ydl:
            info = ydl.extract_info(req.youtube_url, download=True)
            title = info.get("title", "Unknown")
            duration = float(info.get("duration", 0))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video yuklashda xatolik: {e}")

    # ─── 2. Yuklangan video faylini topish ───
    video_file = _find_file(job_dir, "video")

    # ─── 3. FFmpeg bilan audio ajratib olish (16kHz mono, Whisper uchun optimal) ───
    audio_file = job_dir / "audio.wav"
    ffmpeg_result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(video_file),
            "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
            str(audio_file),
        ],
        capture_output=True,
        text=True,
    )
    if ffmpeg_result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Audio ajratishda xatolik: {ffmpeg_result.stderr[-500:]}"
        )

    # Docker worker /app/uploads/ deb ko'radi
    container_video = Path(CONTAINER_UPLOADS_DIR) / req.job_id / video_file.name
    container_audio = Path(CONTAINER_UPLOADS_DIR) / req.job_id / audio_file.name

    return DownloadResponse(
        video_path=str(container_video),
        audio_path=str(container_audio),
        title=title,
        duration=duration,
    )


def _find_file(directory: Path, prefix: str) -> Path:
    for f in directory.iterdir():
        if f.stem == prefix:
            return f
    raise FileNotFoundError(f"'{prefix}' fayli topilmadi: {directory}")


if __name__ == "__main__":
    print("Download Service ishga tushmoqda: http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)
