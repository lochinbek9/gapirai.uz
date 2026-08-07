import os
import shutil
from pathlib import Path
from datetime import datetime
from celery import Task
from celery.utils.log import get_task_logger
from openai import OpenAI
from backend.workers.celery_app import celery_app
from backend.models.database import SessionLocal, DubbingJob, JobStatus
from backend.services import downloader, transcriber, translator, speech_optimizer, synthesizer, merger
from backend.services.errors import PermanentError
from backend.config import get_settings

logger = get_task_logger(__name__)
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


def _cleanup_upload_dir(job_id: str) -> None:
    """
    uploads/{job_id}/ (yuklab olingan asl video + transkripsiya uchun
    ajratilgan audio) hech qachon foydalanuvchiga ko'rsatilmaydi — faqat
    pipeline ichida ishlatiladi. Job haqiqatan tugagach (COMPLETED yoki
    qayta urinishlar tugab FAILED bo'lgach) endi kerak emas.

    Diqqat: bu faqat job TUGAGANDA chaqiriladi, retry oralig'ida emas —
    aks holda navbatdagi urinish videoni behuda qayta yuklab olar edi.
    """
    job_dir = Path(settings.UPLOAD_DIR) / job_id
    if job_dir.exists():
        try:
            shutil.rmtree(job_dir)
        except Exception as exc:
            logger.warning(f"uploads/{job_id} tozalab bo'lmadi: {exc}")


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
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=3300,  # 55 daqiqa — osilib qolgan bosqichga ogohlantirish
    time_limit=3600,       # 60 daqiqa — worker'ni majburan to'xtatadi (hard limit)
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
        # Checkpoint: agar video+audio disk'da hali ham mavjud bo'lsa (masalan
        # oldingi urinish shu yerdan keyin qulagan bo'lsa), qayta yuklab
        # olinmaydi — YouTube'ga behuda so'rov yuborilmaydi.
        audio_path = str(job_dir / "audio.wav")
        if job.original_video_path and Path(job.original_video_path).exists() and Path(audio_path).exists():
            logger.info(f"[{job_id}] Yuklash allaqachon bajarilgan — o'tkazib yuborildi.")
            video_path = job.original_video_path
        else:
            _update_job(db, job, JobStatus.DOWNLOADING, 5.0, "YouTube'dan yuklanmoqda...")
            download_result = downloader.download_video(job.youtube_url, job_id)
            job.video_title = download_result["title"]
            job.video_duration = download_result["duration"]
            job.original_video_path = download_result["video_path"]
            db.commit()
            video_path = download_result["video_path"]
            audio_path = download_result["audio_path"]

        # BOSQICH 2: Transkripsiya
        # Checkpoint: xom segmentlar (timestamp bilan) DB'da saqlanadi —
        # ular bo'lsa, qimmat/uzoq transkripsiya qayta bajarilmaydi.
        if job.transcript_segments:
            logger.info(f"[{job_id}] Transkripsiya allaqachon bajarilgan — o'tkazib yuborildi.")
            segments = job.transcript_segments
            transcript_text = job.transcript_text or ""
        else:
            _update_job(db, job, JobStatus.TRANSCRIBING, 20.0, "Nutq matnga aylantirilmoqda...")
            transcript = transcriber.transcribe_audio(audio_path)
            if not transcript["segments"]:
                raise PermanentError("Bu videoda nutq topilmadi.")
            job.transcript_text = transcript["text"]
            job.srt_content = transcript["srt"]
            job.transcript_segments = transcript["segments"]
            db.commit()
            segments = transcript["segments"]
            transcript_text = transcript["text"]

        # BOSQICH 3: Jins aniqlash (foydalanuvchi tanlamagan bo'lsa avtomatik)
        if job.speaker_gender:
            gender = job.speaker_gender
        else:
            setting = job.voice_gender_setting or "auto"
            if setting in ("male", "female"):
                gender = setting
            else:
                _update_job(db, job, JobStatus.TRANSLATING, 35.0, "Spikerning jinsi aniqlanmoqda...")
                gender = _detect_gender(transcript_text)
            job.speaker_gender = gender
            db.commit()

        # BOSQICH 4: Tarjima
        # Checkpoint: tarjima qilingan segmentlar saqlanadi — Google
        # Translate'ga qayta murojaat qilinmaydi.
        if job.translated_segments:
            logger.info(f"[{job_id}] Tarjima allaqachon bajarilgan — o'tkazib yuborildi.")
            translated_segments = job.translated_segments
        else:
            _update_job(db, job, JobStatus.TRANSLATING, 40.0, "O'zbek tiliga tarjima qilinmoqda...")
            translated_segments = translator.translate_segments(segments)
            job.translated_text = " ".join(s["text"] for s in translated_segments)
            job.uzbek_srt_content = _segments_to_vtt(translated_segments)
            job.translated_segments = translated_segments
            db.commit()

        # BOSQICH 4.5: Nutq uchun optimallashtirish (raqamlar, qisqartmalar, og'zaki uslub)
        # Faqat TTS kirishi uchun — subtitr matni yuqoridagi tarjimadan o'zgarishsiz qoladi,
        # chunki "JWT" -> "Jey Vi Ti" kabi og'zaki shakllar yozma subtitrda g'alati ko'rinadi.
        # Checkpoint: bu bosqich LLM chaqiruvi bo'lishi mumkin (pullik) — natija saqlanadi.
        if job.speech_segments:
            logger.info(f"[{job_id}] Nutq optimizatsiyasi allaqachon bajarilgan — o'tkazib yuborildi.")
            speech_segments = job.speech_segments
        else:
            _update_job(db, job, JobStatus.SYNCING, 50.0, "Matn tabiiy talaffuzga moslashtirilmoqda...")
            speech_segments = speech_optimizer.optimize_segments(translated_segments)
            job.speech_segments = speech_segments
            db.commit()

        # BOSQICH 5: TTS (jinsga mos ovoz)
        # Checkpoint: agar birlashtirilgan dublyaj audiosi allaqachon
        # diskda bo'lsa, ElevenLabs'ga qayta pul to'lab sintez qilinmaydi.
        if job.dubbed_audio_path and Path(job.dubbed_audio_path).exists():
            logger.info(f"[{job_id}] TTS allaqachon bajarilgan — o'tkazib yuborildi.")
            dubbed_audio_path = job.dubbed_audio_path
        else:
            voice = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"
            _update_job(db, job, JobStatus.SYNTHESIZING, 60.0,
                        f"O'zbek ovozi yaratilmoqda ({'ayol' if gender == 'female' else 'erkak'})...")
            tts_dir = str(output_dir / "tts_segments")
            dubbed_audio_path = synthesizer.synthesize_segments(
                speech_segments, tts_dir, voice_name=voice
            )
            job.dubbed_audio_path = dubbed_audio_path
            db.commit()

        # BOSQICH 6: Birlashtirish
        # Checkpoint: yakuniy video allaqachon tayyor bo'lsa, ffmpeg qayta
        # ishlamaydi.
        if job.output_video_path and Path(job.output_video_path).exists():
            logger.info(f"[{job_id}] Birlashtirish allaqachon bajarilgan — o'tkazib yuborildi.")
            final_output = job.output_video_path
        else:
            _update_job(db, job, JobStatus.MERGING, 85.0, "Video birlashtirilmoqda...")
            final_output = str(output_dir / "dubbed_final.mp4")
            output_dir.mkdir(parents=True, exist_ok=True)

            merger.merge_video_audio(
                video_path=video_path,
                dubbed_audio_path=dubbed_audio_path,
                output_path=final_output,
            )

            job.output_video_path = final_output
            job.output_video_url = f"/outputs/{job_id}/dubbed_final.mp4"
            db.commit()

        # Upload files to S3 if configured
        try:
            from backend.services.storage import upload_file_to_s3
            s3_audio_key = f"dubber/{job_id}/dubbed_audio.wav"
            s3_video_key = f"dubber/{job_id}/dubbed_final.mp4"
            logger.info(f"Uploading output files for job {job_id} to S3...")

            upload_file_to_s3(dubbed_audio_path, s3_audio_key)
            upload_file_to_s3(final_output, s3_video_key)
        except Exception as s3_err:
            logger.error(f"S3 upload failed for job {job_id}: {s3_err}")

        _update_job(db, job, JobStatus.COMPLETED, 100.0, "Dublyaj tayyor!")
        job.completed_at = datetime.utcnow()
        db.commit()

        _cleanup_upload_dir(job_id)

        return {"job_id": job_id, "status": "completed", "output_url": job.output_video_url}


    except PermanentError as exc:
        # Qayta urinish ma'nosiz — har safar bir xil natija chiqadi.
        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "updated_at": datetime.utcnow(),
        })
        db.commit()
        _cleanup_upload_dir(job_id)
        raise exc

    except Exception as exc:
        if self.request.retries < self.max_retries:
            countdown = min(300, 30 * (2 ** self.request.retries))
            # Qayta urinishlar mavjud bo'lsa statusni FAILED qilmaymiz, faqat xabarni yangilaymiz.
            # DIQQAT: uploads/ VA job'ning bajarilgan bosqich natijalari
            # (transcript_segments, translated_segments, ...) ATAYLAB
            # tozalanmaydi/o'chirilmaydi — keyingi urinish shu checkpoint
            # nuqtalaridan davom etadi, boshidan boshlamaydi.
            job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
            if job:
                job.status_message = f"Vaqtinchalik xatolik (qayta urinish {self.request.retries + 1}/{self.max_retries})..."
                job.error_message = str(exc)
                job.updated_at = datetime.utcnow()
                db.commit()
            db.close()
            raise self.retry(exc=exc, countdown=countdown)

        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "updated_at": datetime.utcnow(),
        })
        db.commit()

        _cleanup_upload_dir(job_id)

        raise exc

    finally:
        db.close()
