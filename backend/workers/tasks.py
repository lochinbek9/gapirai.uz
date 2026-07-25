import os
from pathlib import Path
from datetime import datetime
from celery import Task
from openai import OpenAI
from backend.workers.celery_app import celery_app
from backend.models.database import SessionLocal, DubbingJob, JobStatus
from backend.services import downloader, transcriber, translator, synthesizer, merger
from backend.config import get_settings

settings = get_settings()


def _sec_to_vtt_time(seconds: float) -> str:
    """Soniyani WebVTT vaqt formatiga o'girish: HH:MM:SS.mmm"""
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = int(seconds // 60) % 60
    h = int(seconds // 3600)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _segments_to_vtt(segments: list[dict]) -> str:
    """Tarjima qilingan segmentlardan WebVTT subtitr yaratish."""
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(segments, 1):
        text = seg.get("text", "").strip()
        if not text:
            continue
        start = _sec_to_vtt_time(seg["start"])
        end   = _sec_to_vtt_time(seg["end"])
        lines.append(f"{i}")
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def _update_job(db, job: DubbingJob, status: JobStatus, progress: float, message: str):
    job.status = status
    job.progress = progress
    job.status_message = message
    job.updated_at = datetime.utcnow()
    db.commit()


def _detect_gender(transcript_text: str) -> str:
    """Detect speaker gender with OpenAI."""
    try:
        snippet = transcript_text[:1000]
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=settings.OPENAI_MODEL if settings.OPENAI_MODEL else "gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You analyze video transcripts and determine the speaker's gender. "
                        "Reply with ONLY one word: 'male' or 'female'. "
                        "If unclear or multiple speakers, reply 'male'."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Transcript: {snippet}",
                },
            ],
            max_tokens=5,
            temperature=0,
        )
        result = resp.choices[0].message.content.strip().lower()
        return "female" if "female" in result else "male"
    except Exception:
        return "male"


@celery_app.task(
    bind=True,
    name="backend.workers.tasks.process_video",
    max_retries=2,
    default_retry_delay=30,
)
def process_video(self: Task, job_id: str) -> dict:
    db = SessionLocal()

    try:
        job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        if not job:
            raise ValueError(f"Job topilmadi: {job_id}")

        job_dir = Path(settings.UPLOAD_DIR) / job_id
        output_dir = Path(settings.OUTPUT_DIR) / job_id

        # BOSQICH 1: Yuklash
        _update_job(db, job, JobStatus.DOWNLOADING, 5.0, "YouTube'dan yuklanmoqda...")
        download_result = downloader.download_video(job.youtube_url, job_id)
        job.video_title = download_result["title"]
        job.video_duration = download_result["duration"]
        job.original_video_path = download_result["video_path"]
        db.commit()

        # BOSQICH 2: Transkripsiya
        _update_job(db, job, JobStatus.TRANSCRIBING, 20.0, "Nutq matnga aylantirilmoqda...")
        transcript = transcriber.transcribe_audio(download_result["audio_path"])
        job.transcript_text = transcript["text"]
        job.srt_content = transcript["srt"]
        db.commit()

        if not transcript["segments"]:
            raise ValueError("Bu videoda nutq topilmadi.")

        # BOSQICH 3: Jins aniqlash (foydalanuvchi tanlamagan bo'lsa avtomatik)
        setting = job.voice_gender_setting or "auto"
        if setting in ("male", "female"):
            gender = setting
            job.speaker_gender = gender
            db.commit()
        else:
            _update_job(db, job, JobStatus.TRANSLATING, 35.0, "Spikerning jinsi aniqlanmoqda...")
            gender = _detect_gender(transcript["text"])
            job.speaker_gender = gender
            db.commit()

        # BOSQICH 4: Tarjima
        _update_job(db, job, JobStatus.TRANSLATING, 40.0, "O'zbek tiliga tarjima qilinmoqda...")
        translated_segments = translator.translate_segments(transcript["segments"])
        job.translated_text = " ".join(s["text"] for s in translated_segments)
        job.uzbek_srt_content = _segments_to_vtt(translated_segments)
        db.commit()

        # BOSQICH 5: TTS (jinsga mos ovoz)
        voice = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"
        _update_job(db, job, JobStatus.SYNTHESIZING, 60.0,
                    f"O'zbek ovozi yaratilmoqda ({'ayol' if gender == 'female' else 'erkak'})...")
        tts_dir = str(output_dir / "tts_segments")
        dubbed_audio_path = synthesizer.synthesize_segments(
            translated_segments, tts_dir, voice_name=voice
        )
        job.dubbed_audio_path = dubbed_audio_path
        db.commit()

        # BOSQICH 6: Birlashtirish
        _update_job(db, job, JobStatus.MERGING, 85.0, "Video birlashtirilmoqda...")
        final_output = str(output_dir / "dubbed_final.mp4")
        output_dir.mkdir(parents=True, exist_ok=True)

        merger.merge_video_audio(
            video_path=job.original_video_path,
            dubbed_audio_path=dubbed_audio_path,
            output_path=final_output,
        )

        job.output_video_path = final_output
        job.output_video_url = f"/outputs/{job_id}/dubbed_final.mp4"
        _update_job(db, job, JobStatus.COMPLETED, 100.0, "Dublyaj tayyor!")
        job.completed_at = datetime.utcnow()
        db.commit()

        return {"job_id": job_id, "status": "completed", "output_url": job.output_video_url}

    except Exception as exc:
        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "updated_at": datetime.utcnow(),
        })
        db.commit()
        if "Download" in str(exc):
            raise self.retry(exc=exc, countdown=30)
        raise exc

    finally:
        db.close()
