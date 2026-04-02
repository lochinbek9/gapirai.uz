"""
Download Service — Host Mac da ishlaydi (Docker ichida emas).
yt-dlp Chrome cookies bilan YouTube dan video va audio yuklab oladi.
Docker worker http://host.docker.internal:8001 orqali bu servisga murojaat qiladi.
"""
import os
import subprocess
from pathlib import Path

# Node.js uchun PATH ni kengaytirish (yt-dlp n-challenge solving uchun kerak)
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


def _opts(output_template: str) -> dict:
    opts = {
        "outtmpl": output_template,
        "quiet": False,
        "no_warnings": False,
        # Android/web client sifatida ko'rinish — bot detection chetlab o'tiladi
        "extractor_args": {
            "youtube": {
                "player_client": ["android", "web"],
            }
        },
    }
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 100:
        opts["cookiefile"] = str(COOKIES_FILE)
    return opts


@app.get("/health")
def health():
    return {"status": "ok", "service": "download-service"}


@app.post("/download", response_model=DownloadResponse)
def download(req: DownloadRequest):
    job_dir = UPLOADS_DIR / req.job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    combined_tpl = str(job_dir / "combined.%(ext)s")
    video_tpl = str(job_dir / "video.%(ext)s")

    # 1. Audio yuklash (ba/b → wav)
    audio_opts = {
        **_opts(combined_tpl),
        "format": "ba/b",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "192",
        }],
    }

    # 2. Video yuklash (faqat video stream)
    video_opts = {
        **_opts(video_tpl),
        "format": "bv[ext=mp4]/bv/b[ext=mp4]/b",
        "merge_output_format": "mp4",
    }

    title = "Unknown"
    duration = 0.0

    try:
        with yt_dlp.YoutubeDL(audio_opts) as ydl:
            info = ydl.extract_info(req.youtube_url, download=True)
            title = info.get("title", "Unknown")
            duration = float(info.get("duration", 0))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio yuklashda xatolik: {e}")

    try:
        with yt_dlp.YoutubeDL(video_opts) as ydl:
            ydl.download([req.youtube_url])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video yuklashda xatolik: {e}")

    # Fayllarni topish
    audio_file = _find_file(job_dir, "combined")
    video_file = _find_file(job_dir, "video")

    return DownloadResponse(
        video_path=str(video_file),
        audio_path=str(audio_file),
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
