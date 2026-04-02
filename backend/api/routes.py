import uuid
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy.orm import Session
from pathlib import Path

from backend.models.database import get_db, DubbingJob, JobStatus
from backend.services.downloader import get_video_info
from backend.workers.tasks import process_video
from backend.config import get_settings

settings = get_settings()
router = APIRouter(prefix="/api", tags=["dubbing"])


# ─────────────────────────────────────────
# Request / Response schemalar
# ─────────────────────────────────────────

class CreateJobRequest(BaseModel):
    youtube_url: str


class VideoInfoResponse(BaseModel):
    title: str
    duration: float
    thumbnail: str
    uploader: str


class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    status_message: str | None
    video_title: str | None
    video_duration: float | None
    output_video_url: str | None
    transcript_text: str | None
    translated_text: str | None
    error_message: str | None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Endpointlar
# ─────────────────────────────────────────

@router.get("/video-info")
async def video_info(url: str) -> VideoInfoResponse:
    """YouTube URL haqida ma'lumot olish (yuklamasdan)."""
    try:
        info = get_video_info(url)
        return VideoInfoResponse(**info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video ma'lumot olishda xatolik: {str(e)}")


@router.post("/jobs", status_code=201)
async def create_job(request: CreateJobRequest, db: Session = Depends(get_db)) -> dict:
    """Yangi dublyaj vazifasini yaratish va navbatga qo'shish."""
    if "youtube.com" not in request.youtube_url and "youtu.be" not in request.youtube_url:
        raise HTTPException(status_code=400, detail="Faqat YouTube URL qabul qilinadi.")

    job_id = str(uuid.uuid4())
    job = DubbingJob(
        id=job_id,
        youtube_url=request.youtube_url,
        status=JobStatus.PENDING,
        progress=0.0,
        status_message="Navbatga qo'shildi",
    )
    db.add(job)
    db.commit()

    # Celery vazifasini ishga tushirish
    process_video.apply_async(args=[job_id], task_id=job_id)

    return {"job_id": job_id, "status": "pending"}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, db: Session = Depends(get_db)) -> JobResponse:
    """Job holati va natijasini olish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    return JobResponse.model_validate(job)


@router.get("/jobs")
async def list_jobs(
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db)
) -> list[JobResponse]:
    """Barcha joblarni ko'rish."""
    jobs = (
        db.query(DubbingJob)
        .order_by(DubbingJob.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [JobResponse.model_validate(j) for j in jobs]


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str, db: Session = Depends(get_db)):
    """Jobni o'chirish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    db.delete(job)
    db.commit()


@router.get("/outputs/{job_id}/video")
async def download_video(job_id: str, db: Session = Depends(get_db)):
    """Tayyor videoni yuklab olish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Video hali tayyor emas.")

    video_path = job.output_video_path
    if not video_path or not Path(video_path).exists():
        raise HTTPException(status_code=404, detail="Video fayl topilmadi.")

    filename = f"dubbed_{job.video_title or job_id}.mp4"
    return FileResponse(
        path=video_path,
        media_type="video/mp4",
        filename=filename,
    )
