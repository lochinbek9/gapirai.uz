import os
from pathlib import Path
from datetime import datetime
from celery import Task
from backend.workers.celery_app import celery_app
from backend.models.database import SessionLocal, DubbingJob, JobStatus
from backend.services import downloader, transcriber, translator, synthesizer, merger
from backend.config import get_settings

settings = get_settings()


def _update_job(db, job: DubbingJob, status: JobStatus, progress: float, message: str):
    """Job holatini yangilash."""
    job.status = status
    job.progress = progress
    job.status_message = message
    job.updated_at = datetime.utcnow()
    db.commit()


@celery_app.task(
    bind=True,
    name="backend.workers.tasks.process_video",
    max_retries=2,
    default_retry_delay=30,
)
def process_video(self: Task, job_id: str) -> dict:
    """
    Asosiy dublyaj vazifasi. Barcha bosqichlarni ketma-ket bajaradi:
    Download → Transcribe → Translate → Synthesize → Merge
    """
    db = SessionLocal()

    try:
        job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        if not job:
            raise ValueError(f"Job topilmadi: {job_id}")

        job_dir = Path(settings.UPLOAD_DIR) / job_id
        output_dir = Path(settings.OUTPUT_DIR) / job_id

        # ──────────────────────────────────────────
        # BOSQICH 1: Video va audio yuklash
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.DOWNLOADING, 5.0, "YouTube'dan yuklanmoqda...")

        download_result = downloader.download_video(job.youtube_url, job_id)
        job.video_title = download_result["title"]
        job.video_duration = download_result["duration"]
        job.original_video_path = download_result["video_path"]
        db.commit()

        # ──────────────────────────────────────────
        # BOSQICH 2: Inglizcha transkripsiya (STT)
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.TRANSCRIBING, 20.0, "Nutq matnga aylantirilmoqda...")

        transcript = transcriber.transcribe_audio(download_result["audio_path"])
        job.transcript_text = transcript["text"]
        job.srt_content = transcript["srt"]
        db.commit()

        # ──────────────────────────────────────────
        # BOSQICH 3: O'zbekchaga tarjima
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.TRANSLATING, 40.0, "O'zbek tiliga tarjima qilinmoqda...")

        translated_segments = translator.translate_segments(transcript["segments"])
        job.translated_text = " ".join(s["text"] for s in translated_segments)
        db.commit()

        # ──────────────────────────────────────────
        # BOSQICH 4: O'zbekcha ovoz yaratish (TTS)
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.SYNTHESIZING, 60.0, "O'zbek ovozi yaratilmoqda...")

        tts_dir = str(output_dir / "tts_segments")
        dubbed_audio_path = synthesizer.synthesize_segments(translated_segments, tts_dir)
        job.dubbed_audio_path = dubbed_audio_path
        db.commit()

        # ──────────────────────────────────────────
        # BOSQICH 5: Video va audioni birlashtirish
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.MERGING, 85.0, "Video birlashtirilmoqda...")

        final_output = str(output_dir / "dubbed_final.mp4")
        output_dir.mkdir(parents=True, exist_ok=True)

        merger.merge_video_audio(
            video_path=job.original_video_path,
            dubbed_audio_path=dubbed_audio_path,
            output_path=final_output,
        )

        job.output_video_path = final_output
        job.output_video_url = f"/outputs/{job_id}/dubbed_final.mp4"  # Local URL

        # ──────────────────────────────────────────
        # BAJARILDI
        # ──────────────────────────────────────────
        _update_job(db, job, JobStatus.COMPLETED, 100.0, "Dublyaj tayyor!")
        job.completed_at = datetime.utcnow()
        db.commit()

        return {
            "job_id": job_id,
            "status": "completed",
            "output_url": job.output_video_url,
        }

    except Exception as exc:
        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "updated_at": datetime.utcnow(),
        })
        db.commit()
        raise self.retry(exc=exc, countdown=30)

    finally:
        db.close()
