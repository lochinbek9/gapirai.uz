import re
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path
from typing import Optional

from backend.models.database import get_db, DubbingJob, JobStatus, User
from backend.services.downloader import get_video_info
from backend.services.auth import get_current_user, get_optional_user
from backend.workers.tasks import process_video
from backend.config import get_settings
from backend.services.click_service import calculate_price

settings = get_settings()
router = APIRouter(prefix="/api", tags=["dubbing"])


class CreateJobRequest(BaseModel):
    youtube_url: str
    target_language: str = "uz"
    voice_gender: str = "auto"   # auto / male / female


class VideoInfoResponse(BaseModel):
    title: str
    duration: float
    thumbnail: str
    uploader: str


class JobResponse(BaseModel):
    job_id: str
    status: str
    progress: float
    status_message: Optional[str] = None
    video_title: Optional[str] = None
    video_duration: Optional[float] = None
    video_thumbnail: Optional[str] = None
    output_video_url: Optional[str] = None
    transcript_text: Optional[str] = None
    translated_text: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    speaker_gender: Optional[str] = None
    voice_gender_setting: Optional[str] = None
    uzbek_srt_content: Optional[str] = None
    expected_end_time: Optional[str] = None


def _job_to_response(job: DubbingJob) -> JobResponse:
    raw_status = job.status.value if hasattr(job.status, "value") else job.status
    status_str = str(raw_status).lower() if raw_status else "pending"
    
    expected_end_time = None
    if status_str not in ("completed", "failed", "awaiting_payment"):
        duration = job.video_duration or 300.0
        baseline_dt = job.updated_at or job.created_at
        progress = job.progress or 0.0
        remaining_factor = max(0.1, (100.0 - progress) / 100.0)
        est_seconds = (30 + 0.3 * duration) * remaining_factor
        expected_dt = baseline_dt + timedelta(seconds=est_seconds)
        expected_end_time = expected_dt.isoformat() + "Z"

    return JobResponse(
        job_id=str(job.id),
        status=status_str,
        progress=job.progress or 0.0,
        status_message=job.status_message,
        video_title=job.video_title,
        video_duration=job.video_duration,
        video_thumbnail=job.video_thumbnail,
        output_video_url=job.output_video_url,
        transcript_text=job.transcript_text,
        translated_text=job.translated_text,
        error_message=job.error_message,
        created_at=job.created_at.isoformat() if job.created_at else None,
        speaker_gender=job.speaker_gender,
        voice_gender_setting=job.voice_gender_setting,
        uzbek_srt_content=job.uzbek_srt_content,
        expected_end_time=expected_end_time
    )


@router.get("/video-info")
async def video_info(url: str) -> VideoInfoResponse:
    try:
        info = get_video_info(url)
        return VideoInfoResponse(**info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video ma'lumot olishda xatolik: {str(e)}")


@router.post("/jobs", status_code=201)
async def create_job(
    request: CreateJobRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
) -> dict:
    if "youtube.com" not in request.youtube_url and "youtu.be" not in request.youtube_url:
        raise HTTPException(status_code=400, detail="Faqat YouTube URL qabul qilinadi.")

    # Video ma'lumotlarini yuklash
    try:
        info = get_video_info(request.youtube_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Video ma'lumotlarini olishda xatolik: {str(e)}")

    title = info.get("title", "Unknown")
    duration = info.get("duration", 0)
    thumbnail = info.get("thumbnail")

    duration_minutes = duration / 60.0

    is_first_video = False
    if current_user:
        existing_jobs_count = db.query(DubbingJob).filter(DubbingJob.user_id == current_user.id).count()
        is_first_video = existing_jobs_count == 0

    amount = calculate_price(duration_minutes, is_first_video=is_first_video)

    job_id = str(uuid.uuid4())
    
    if amount > 0:
        status = JobStatus.AWAITING_PAYMENT
        status_message = "To'lov kutilmoqda"
    else:
        status = JobStatus.PENDING
        status_message = "Navbatga qo'shildi"

    job = DubbingJob(
        id=job_id,
        user_id=current_user.id if current_user else None,
        youtube_url=request.youtube_url,
        video_title=title,
        video_duration=duration,
        video_thumbnail=thumbnail,
        voice_gender_setting=request.voice_gender,
        status=status,
        progress=0.0,
        status_message=status_message,
    )
    db.add(job)
    db.commit()

    if amount == 0:
        process_video.apply_async(args=[job_id], task_id=job_id)
        return {"job_id": job_id, "status": "pending"}
    
    return {"job_id": job_id, "status": "awaiting_payment", "amount": amount}


@router.get("/jobs/{job_id}")
async def get_job(job_id: uuid.UUID, db: Session = Depends(get_db)) -> JobResponse:
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    return _job_to_response(job)


@router.get("/jobs")
async def list_jobs(
    limit: int = Query(20, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[JobResponse]:
    """Foydalanuvchining o'z joblari."""
    jobs = (
        db.query(DubbingJob)
        .filter(DubbingJob.user_id == current_user.id)
        .order_by(DubbingJob.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_job_to_response(j) for j in jobs]


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = db.query(DubbingJob).filter(
        DubbingJob.id == job_id,
        DubbingJob.user_id == current_user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    db.delete(job)
    db.commit()


@router.get("/jobs/{job_id}/subtitles.vtt")
async def get_subtitles(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """O'zbekcha subtitrlarni WebVTT formatida qaytarish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or not job.uzbek_srt_content:
        raise HTTPException(status_code=404, detail="Subtitrlar topilmadi.")
    return Response(
        content=job.uzbek_srt_content,
        media_type="text/vtt",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.get("/outputs/{job_id}/audio")
async def download_audio(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Dublyaj qilingan audioni WAV formatida yuklab olish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Audio hali tayyor emas.")

    settings = get_settings()
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import generate_presigned_download_url
        s3_key = f"dubber/{job_id}/dubbed_audio.wav"
        presigned_url = generate_presigned_download_url(s3_key)
        if presigned_url:
            return Response(status_code=307, headers={"Location": presigned_url})

    audio_path = job.dubbed_audio_path
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(status_code=404, detail="Audio fayl topilmadi.")
    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    filename = f"{safe_title or job_id}_audio.wav"
    return FileResponse(path=audio_path, media_type="audio/wav", filename=filename)


@router.get("/outputs/{job_id}/video")
async def download_video(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Video hali tayyor emas.")

    settings = get_settings()
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import generate_presigned_download_url
        s3_key = f"dubber/{job_id}/dubbed_final.mp4"
        presigned_url = generate_presigned_download_url(s3_key)
        if presigned_url:
            return Response(status_code=307, headers={"Location": presigned_url})

    video_path = job.output_video_path
    if not video_path or not Path(video_path).exists():
        raise HTTPException(status_code=404, detail="Video fayl topilmadi.")
    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    filename = f"dubbed_{safe_title or job_id}.mp4"
    return FileResponse(path=video_path, media_type="video/mp4", filename=filename)


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db)
):
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    
    active_statuses = [
        JobStatus.PENDING,
        JobStatus.AWAITING_PAYMENT,
        JobStatus.DOWNLOADING,
        JobStatus.TRANSCRIBING,
        JobStatus.TRANSLATING,
        JobStatus.SYNTHESIZING,
        JobStatus.SYNCING,
        JobStatus.MERGING
    ]
    if job.status not in active_statuses:
        return {"success": False, "message": "Job active holatda emas, bekor qilib bo'lmaydi."}

    from backend.workers.celery_app import celery_app
    try:
        celery_app.control.revoke(str(job_id), terminate=True)
    except Exception:
        pass
    
    job.status = JobStatus.FAILED
    job.status_message = "Foydalanuvchi tomonidan bekor qilindi."
    job.error_message = "User cancelled the job."
    job.updated_at = datetime.utcnow()
    db.commit()
    
    return {"success": True, "message": "Dublyaj bekor qilindi."}

