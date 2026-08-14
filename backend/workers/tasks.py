import os
import shutil
import time
from pathlib import Path
from datetime import datetime
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from celery.utils.log import get_task_logger
from openai import OpenAI
from backend.workers.celery_app import celery_app
from backend.models.database import SessionLocal, DubbingJob, JobStatus
from backend.services import downloader, transcriber, translator, speech_optimizer, synthesizer, merger
from backend.services.errors import PermanentError
from backend.services.email_service import send_dubbing_complete_email
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


_STAGE_ICONS = {"ok": "✅", "skipped": "⏭️", "error": "❌"}


def _record_stage(stage_timings: dict, job_id: str, stage: str, start: float, status: str, detail: str = "") -> None:
    """Bir bosqich tugagach chaqiriladi — davomiylikni saqlaydi va bitta
    izchil formatli log qatorini chiqaradi (masalan monitoring/log
    qidiruvida grep qilish uchun oson bo'lsin deb)."""
    duration = time.monotonic() - start
    stage_timings[stage] = {"duration": duration, "status": status, "detail": detail}
    icon = _STAGE_ICONS.get(status, "•")
    suffix = f" — {detail}" if detail else ""
    logger.info(f"[{job_id}] STAGE={stage} duration={duration:.1f}s status={status} {icon}{suffix}")


def _log_pipeline_summary(job_id: str, stage_timings: dict, total_start: float, final_status: str) -> None:
    """Job tugagach (COMPLETED/FAILED/retry oldidan) yagona, o'qish oson
    hisobot bloki — qaysi bosqich qancha vaqt olganini bir qarashda ko'rish
    uchun."""
    total = time.monotonic() - total_start
    lines = [f"JOB {job_id} [{final_status}]"]
    for stage, info in stage_timings.items():
        icon = _STAGE_ICONS.get(info["status"], "•")
        lines.append(f"  {stage:<12} {info['duration']:>7.1f}s {icon} {info['status']}")
    lines.append(f"  {'TOTAL':<12} {total:>7.1f}s")
    logger.info("\n".join(lines))


def _detect_gender(transcript_text: str) -> str:
    """Detect speaker gender with OpenAI."""
    try:
        snippet = transcript_text[:1000]
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=settings.OPENAI_LIGHT_MODEL,
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


def _error_code_for(exc: Exception, current_stage: str) -> str:
    """Xatolikni qisqa toifaga ajratadi (admin panel/monitoring uchun)."""
    code = getattr(exc, "code", None)
    if code:
        return code
    if isinstance(exc, SoftTimeLimitExceeded):
        return "TIMEOUT"
    return f"{current_stage}_FAILED"


@celery_app.task(
    bind=True,
    name="backend.workers.tasks.process_video",
    max_retries=5,
    default_retry_delay=60,
    soft_time_limit=3300,  # 55 daqiqa — osilib qolgan bosqichga ogohlantirish
    time_limit=3600,       # 60 daqiqa — worker'ni majburan to'xtatadi (hard limit)
)
def process_video(self: Task, job_id: str) -> dict:
    db = SessionLocal()
    stage_timings: dict = {}
    pipeline_start = time.monotonic()
    current_stage = "INIT"

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
        current_stage = "DOWNLOAD"
        stage_t0 = time.monotonic()
        audio_path = str(job_dir / "audio.wav")
        if job.original_video_path and Path(job.original_video_path).exists() and Path(audio_path).exists():
            _record_stage(stage_timings, job_id, "DOWNLOAD", stage_t0, "skipped")
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
            _record_stage(stage_timings, job_id, "DOWNLOAD", stage_t0, "ok")

        # BOSQICH 2: Transkripsiya
        # Checkpoint: xom segmentlar (timestamp bilan) DB'da saqlanadi —
        # ular bo'lsa, qimmat/uzoq transkripsiya qayta bajarilmaydi.
        current_stage = "TRANSCRIBE"
        stage_t0 = time.monotonic()
        if job.transcript_segments:
            _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "skipped")
            segments = job.transcript_segments
            transcript_text = job.transcript_text or ""
        else:
            _update_job(db, job, JobStatus.TRANSCRIBING, 20.0, "Nutq matnga aylantirilmoqda...")
            transcript = transcriber.transcribe_audio(audio_path)
            if not transcript["segments"] or not transcriber.has_speech(transcript["segments"]):
                _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "error", "nutq topilmadi")
                raise PermanentError("Bu videoda nutq topilmadi.", code="NO_SPEECH_FOUND")
            job.transcript_text = transcript["text"]
            job.srt_content = transcript["srt"]
            job.transcript_segments = transcript["segments"]
            db.commit()
            segments = transcript["segments"]
            transcript_text = transcript["text"]
            _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "ok")

        # Whisper segmentlari nutq pauzasiga qarab kesilgan, gap chegarasiga
        # emas — tarjima/nutq optimallashdan OLDIN tabiiy gaplarga
        # birlashtiramiz, aks holda LLM har bir bo'lakka soxta nuqta qo'yib,
        # keyingi bosqichlarni "bu tugal gap" deb aldab qo'yadi.
        segments = synthesizer.group_segments_into_sentences(segments)

        # BOSQICH 3: Jins aniqlash (foydalanuvchi tanlamagan bo'lsa avtomatik)
        current_stage = "GENDER"
        stage_t0 = time.monotonic()
        if job.speaker_gender:
            gender = job.speaker_gender
            _record_stage(stage_timings, job_id, "GENDER", stage_t0, "skipped")
        else:
            setting = job.voice_gender_setting or "auto"
            if setting in ("male", "female"):
                gender = setting
            else:
                _update_job(db, job, JobStatus.TRANSLATING, 35.0, "Spikerning jinsi aniqlanmoqda...")
                gender = _detect_gender(transcript_text)
            job.speaker_gender = gender
            db.commit()
            _record_stage(stage_timings, job_id, "GENDER", stage_t0, "ok")

        # BOSQICH 4: Tarjima
        # Checkpoint: tarjima qilingan segmentlar saqlanadi — Google
        # Translate'ga qayta murojaat qilinmaydi.
        current_stage = "TRANSLATE"
        stage_t0 = time.monotonic()
        if job.translated_segments:
            _record_stage(stage_timings, job_id, "TRANSLATE", stage_t0, "skipped")
            translated_segments = job.translated_segments
        else:
            _update_job(db, job, JobStatus.TRANSLATING, 40.0, "O'zbek tiliga tarjima qilinmoqda...")
            translated_segments = translator.translate_segments(segments)

            # Davomiylik tekshiruvi — original segment vaqtidan sezilarli
            # uzunroq chiqqan tarjimalar BIR MARTA qisqartiriladi (haqiqiy
            # TTS chaqirilmasdan, belgi-tezlik evristikasi bilan taxmin
            # qilinadi). TRANSLATE checkpoint'i bilan birga saqlanadi —
            # qayta ishlashda ikkalasi ham birga o'tkazib yuboriladi.
            over_budget = {}
            for seg in translated_segments:
                target = seg.get("end", 0) - seg.get("start", 0)
                if target <= 0:
                    continue
                estimated = translator.estimate_duration_seconds(seg.get("text", ""))
                if estimated > target * settings.DURATION_OVERAGE_TOLERANCE:
                    over_budget[seg["id"]] = target
            if over_budget:
                logger.info(f"Job {job_id}: {len(over_budget)} segment vaqt byudjetidan oshib ketgan — qisqartirilmoqda.")
                to_shorten = [s for s in translated_segments if s["id"] in over_budget]
                shortened = translator.shorten_segments(to_shorten, over_budget)
                shortened_by_id = {s["id"]: s for s in shortened}
                translated_segments = [shortened_by_id.get(s["id"], s) for s in translated_segments]

            job.translated_text = " ".join(s["text"] for s in translated_segments)
            job.uzbek_srt_content = _segments_to_vtt(translated_segments)
            job.translated_segments = translated_segments
            db.commit()
            _record_stage(stage_timings, job_id, "TRANSLATE", stage_t0, "ok")

        # BOSQICH 4.5: Nutq uchun optimallashtirish (raqamlar, qisqartmalar, og'zaki uslub)
        # Faqat TTS kirishi uchun — subtitr matni yuqoridagi tarjimadan o'zgarishsiz qoladi,
        # chunki "JWT" -> "Jey Vi Ti" kabi og'zaki shakllar yozma subtitrda g'alati ko'rinadi.
        # Checkpoint: bu bosqich LLM chaqiruvi bo'lishi mumkin (pullik) — natija saqlanadi.
        current_stage = "SPEECH_OPT"
        stage_t0 = time.monotonic()
        if job.speech_segments:
            _record_stage(stage_timings, job_id, "SPEECH_OPT", stage_t0, "skipped")
            speech_segments = job.speech_segments
        else:
            _update_job(db, job, JobStatus.SYNCING, 50.0, "Matn tabiiy talaffuzga moslashtirilmoqda...")
            speech_segments = speech_optimizer.optimize_segments(translated_segments)
            job.speech_segments = speech_segments
            db.commit()
            _record_stage(stage_timings, job_id, "SPEECH_OPT", stage_t0, "ok")

        # BOSQICH 5: TTS (jinsga mos ovoz)
        # Checkpoint: agar birlashtirilgan dublyaj audiosi allaqachon
        # diskda bo'lsa, ElevenLabs'ga qayta pul to'lab sintez qilinmaydi.
        current_stage = "TTS"
        stage_t0 = time.monotonic()
        if job.dubbed_audio_path and Path(job.dubbed_audio_path).exists():
            _record_stage(stage_timings, job_id, "TTS", stage_t0, "skipped")
            dubbed_audio_path = job.dubbed_audio_path
            # Checkpoint orqali qayta tiklangan job uchun aniq segment
            # vaqtlari qayta hisoblanmaydi (qimmat emas, shunchaki mavjud
            # emas bu bosqichda) — yakuniy QA (pastda) bunsiz ham
            # clipping/balandlik tekshiruvlarini bajaradi, faqat dub/fon
            # balansi tekshiruvi o'tkazib yuboriladi.
            actual_timings = None
        else:
            voice = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"
            _update_job(db, job, JobStatus.SYNTHESIZING, 60.0,
                        f"O'zbek ovozi yaratilmoqda ({'ayol' if gender == 'female' else 'erkak'})...")
            tts_dir = str(output_dir / "tts_segments")
            dubbed_audio_path, actual_timings, qa_results = synthesizer.synthesize_segments(
                speech_segments, tts_dir, voice_name=voice,
                video_id=job_id, user_id=(str(job.user_id) if job.user_id else None),
                existing_qa=job.segment_qa,
            )
            job.dubbed_audio_path = dubbed_audio_path
            # Segment darajasidagi QA checkpoint — Celery qayta urinishida
            # faqat muvaffaqiyatsiz/tekshirilmagan segmentlar qayta
            # ishlanadi (synthesizer.py'ning existing_qa parametri orqali).
            job.segment_qa = qa_results
            # Audio gap kesilib qolmasligi uchun original vaqtdan siljigan
            # bo'lishi mumkin (synthesizer.py) — subtitr shu HAQIQIY
            # vaqtlar bilan qayta quriladi, aks holda ovoz bilan mos
            # tushmay qoladi.
            job.uzbek_srt_content = _segments_to_vtt(actual_timings)
            db.commit()
            _record_stage(stage_timings, job_id, "TTS", stage_t0, "ok")

        # BOSQICH 6: Birlashtirish
        # Checkpoint: yakuniy video allaqachon tayyor bo'lsa, ffmpeg qayta
        # ishlamaydi.
        current_stage = "MERGE"
        stage_t0 = time.monotonic()
        if job.output_video_path and Path(job.output_video_path).exists():
            _record_stage(stage_timings, job_id, "MERGE", stage_t0, "skipped")
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
            _record_stage(stage_timings, job_id, "MERGE", stage_t0, "ok")

        # Yakuniy aralashma QA — merger.py'ning ducking/mixing natijasini
        # signal darajasida tekshiradi (clipping, loudness range, dub/fon
        # balansi). Faqat diagnostika — hozircha alohida retry mexanizmi
        # yo'q (segment-QA'dan farqli, bu butun videoni qamraydi), shuning
        # uchun muammo topilsa job baribir COMPLETED bo'ladi, lekin loglarda
        # aniq ko'rinadi. Local fayl S3'ga yuklanib o'chirilishidan OLDIN
        # ishlashi kerak.
        try:
            from backend.services.audio_qa import check_final_mix_quality
            final_qa = check_final_mix_quality(final_output, actual_timings)
            if final_qa["flags"]:
                logger.warning(
                    f"Job {job_id}: yakuniy aralashmada muammo(lar) — {final_qa['flags']} "
                    f"(score={final_qa['score']}, peak={final_qa['peak_dbfs']}dBFS, "
                    f"LRA={final_qa['loudness_lra']}, dub={final_qa['dub_rms_dbfs']}dBFS, "
                    f"fon={final_qa['background_rms_dbfs']}dBFS)"
                )
            else:
                logger.info(f"Job {job_id}: yakuniy aralashma QA'dan o'tdi (score={final_qa['score']}).")
        except Exception as exc:
            logger.warning(f"Job {job_id}: yakuniy QA ishlamadi (pipeline davom etadi): {exc}")

        # Upload files to S3 if configured — muvaffaqiyatli yuklangandan
        # so'ng lokal nusxa DARHOL o'chiriladi (S3 endi doimiy manba,
        # disk cheklangan va cheksiz to'planib qolmasligi kerak).
        try:
            from backend.services.storage import upload_file_to_s3
            s3_audio_key = f"dubber/{job_id}/dubbed_audio.wav"
            s3_video_key = f"dubber/{job_id}/dubbed_final.mp4"
            logger.info(f"Uploading output files for job {job_id} to S3...")

            if upload_file_to_s3(dubbed_audio_path, s3_audio_key):
                try:
                    os.remove(dubbed_audio_path)
                except Exception:
                    pass
            if upload_file_to_s3(final_output, s3_video_key):
                try:
                    os.remove(final_output)
                except Exception:
                    pass
        except Exception as s3_err:
            logger.error(f"S3 upload failed for job {job_id}: {s3_err}")

        _update_job(db, job, JobStatus.COMPLETED, 100.0, "Dublyaj tayyor!")
        job.completed_at = datetime.utcnow()
        db.commit()

        # Anonim (login qilmagan) joblar uchun email yo'q — jim o'tkazib
        # yuboriladi. Email yuborish muvaffaqiyatsiz bo'lsa ham job
        # COMPLETED holatida qoladi (bildirishnoma ikkinchi darajali).
        if job.user_id and job.user and job.user.email:
            try:
                send_dubbing_complete_email(job.user.email, job.user.name or "", job.video_title or "Video", job_id)
            except Exception as email_err:
                logger.warning(f"Dublyaj tayyor email yuborilmadi (job {job_id}): {email_err}")

        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "COMPLETED")

        return {"job_id": job_id, "status": "completed", "output_url": job.output_video_url}


    except PermanentError as exc:
        # Qayta urinish ma'nosiz — har safar bir xil natija chiqadi.
        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "error_code": _error_code_for(exc, current_stage),
            "updated_at": datetime.utcnow(),
        })
        db.commit()
        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "FAILED (permanent)")
        raise exc

    except Exception as exc:
        if self.request.retries < self.max_retries:
            # 600s'gacha (10 daq) chegaralangan — bugun kuzatilgan naqsh
            # bo'yicha YouTube'ning vaqtinchalik bot-bloklanishi odatda
            # ~10-15 daqiqada tozalanadi (2026-08-14); qayta urinishlar
            # oralig'i shu oynaga yetib borishi uchun oshirildi (avval 300s).
            countdown = min(600, 30 * (2 ** self.request.retries))
            # Qayta urinishlar mavjud bo'lsa statusni FAILED qilmaymiz, faqat xabarni yangilaymiz.
            # DIQQAT: uploads/ VA job'ning bajarilgan bosqich natijalari
            # (transcript_segments, translated_segments, ...) ATAYLAB
            # tozalanmaydi/o'chirilmaydi — keyingi urinish shu checkpoint
            # nuqtalaridan davom etadi, boshidan boshlamaydi.
            job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
            if job:
                job.status_message = f"Vaqtinchalik xatolik (qayta urinish {self.request.retries + 1}/{self.max_retries})..."
                job.error_message = str(exc)
                job.error_code = _error_code_for(exc, current_stage)
                job.updated_at = datetime.utcnow()
                db.commit()
            db.close()
            _log_pipeline_summary(job_id, stage_timings, pipeline_start, f"RETRY {self.request.retries + 1}/{self.max_retries}")
            raise self.retry(exc=exc, countdown=countdown)

        db.query(DubbingJob).filter(DubbingJob.id == job_id).update({
            "status": JobStatus.FAILED,
            "error_message": str(exc),
            "error_code": _error_code_for(exc, current_stage),
            "updated_at": datetime.utcnow(),
        })
        db.commit()

        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "FAILED (max retries)")

        raise exc

    finally:
        db.close()
