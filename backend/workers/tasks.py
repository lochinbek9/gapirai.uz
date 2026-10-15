import os
import html
import shutil
import time
from pathlib import Path
from datetime import datetime
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from celery.utils.log import get_task_logger
from openai import OpenAI
from backend.workers.celery_app import celery_app
from backend.models.database import SessionLocal, DubbingJob, JobStatus, ContentViolation, User
from backend.services import downloader, transcriber, translator, speech_optimizer, synthesizer, merger, subtitle_cues
from backend.services.errors import PermanentError, NoSpeechFoundError
from backend.services import error_classification
from backend.services.content_safety import check_safety
from backend.services.email_service import send_dubbing_complete_email
from backend.services.telegram_notify import send_telegram_message
from backend.services.job_claim import try_claim, release_claim
from backend.services.job_checkpoint import save_checkpoint, restore_checkpoint
from backend.config import get_settings

logger = get_task_logger(__name__)
settings = get_settings()

# time_limit (3600s) dan sal ko'proq -- 2026-08-26 audit: task_time_limit
# aynan Redis visibility_timeout defaultiga (3600s) teng edi, bu ikkalasi
# bir vaqtda tugab qolish xavfini yaratardi. Lease shu ikkalasidan ham
# ko'proq bo'lishi kerak, aks holda hali ishlayotgan vazifaning claim'i
# lease muddati tugagani sababli "bo'sh" ko'rinib, boshqa worker tomonidan
# noto'g'ri qayta claim qilinishi mumkin.
CLAIM_LEASE_SECONDS = 3900


def _release_claim_safe(job_id: str, claim_token: str) -> None:
    """Claim'ni bo'shatadi -- doim BUTUNLAY YANGI DB sessiyasi bilan, `db`
    o'zgaruvchisi shu payt yopilgan/buzilgan bo'lishidan qat'i nazar (xuddi
    _mark_job_failed kabi, pastda). Muvaffaqiyatsiz bo'lsa ham asl xatoni
    yashirmaydi -- faqat log qoldiradi; claim baribir lease muddati
    tugagach o'z-o'zidan bo'shaydi, shuning uchun bu xato job'ni abadiy
    bloklab qo'ymaydi."""
    session = SessionLocal()
    try:
        release_claim(session, DubbingJob, job_id, claim_token)
    except Exception as exc:
        logger.warning(f"[JOB {job_id}] Claim bo'shatilmadi (lease muddati bilan o'zi tugaydi): {exc}")
    finally:
        session.close()


def _sec_to_vtt_time(seconds: float) -> str:
    """Soniyani WebVTT vaqt formatiga o'girish: HH:MM:SS.mmm"""
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = int(seconds // 60) % 60
    h = int(seconds // 3600)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def is_uzbek_source(job) -> bool:
    """"Subtitr" rejimida video o'zbekcha nutqli deb belgilanganmi: shunda nutq o'zbekcha STT bilan
    matnga aylantiriladi va TARJIMA QILINMAYDI (LLM chaqiruvi ham, qisqartirish ham yo'q --
    aytilgan gap so'zma-so'z subtitr bo'ladi). Dublyaj job'lari uchun hech qachon True emas."""
    return bool(getattr(job, "subtitle_only", False)) and getattr(job, "source_language", None) == "uz"


def segments_source_for_cues(job) -> list:
    """Subtitr kuelari uchun manba segmentlari (Whisper, so'z vaqtlari bilan) --
    bo'sh bo'lsa [] (subtitle_cues shunda faqat tarjima vaqtlariga tayanadi)."""
    return job.transcript_segments or []


def _clean_sub_text(raw: str) -> str:
    if not raw:
        return ""
    t = html.unescape(raw).strip()
    t = t.replace("&quot;", '"').replace("&#39;", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return t.replace("`", "'").replace("ʻ", "'").replace("ʼ", "'")


def _segments_to_vtt(segments: list[dict]) -> str:
    """Tarjima qilingan segmentlardan WebVTT subtitr yaratish."""
    lines = ["WEBVTT", ""]
    for i, seg in enumerate(segments, 1):
        text = _clean_sub_text(seg.get("text", ""))
        if not text:
            continue
        start = _sec_to_vtt_time(seg["start"])
        end   = _sec_to_vtt_time(seg["end"])
        lines.append(f"{i}")
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def _sec_to_srt_time(seconds: float) -> str:
    """Soniyani SRT vaqt formatiga o'girish: HH:MM:SS,mmm (VTT'dan farqli --
    nuqta emas, vergul)."""
    ms = int((seconds % 1) * 1000)
    s = int(seconds) % 60
    m = int(seconds // 60) % 60
    h = int(seconds // 3600)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _segments_to_srt(segments: list[dict]) -> str:
    """Tarjima qilingan segmentlardan SRT subtitr yaratish -- _segments_to_vtt
    bilan bir xil manba, faqat formatlash farq qiladi (raqamli sarlavha,
    vergulli vaqt)."""
    lines = []
    counter = 0
    for seg in segments:
        text = _clean_sub_text(seg.get("text", ""))
        if not text:
            continue
        counter += 1
        start = _sec_to_srt_time(seg["start"])
        end = _sec_to_srt_time(seg["end"])
        lines.append(str(counter))
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


_GENDER_SYSTEM_PROMPT = (
    "You analyze video transcripts and determine the speaker's gender. "
    "Reply with ONLY one word: 'male' or 'female'. "
    "If unclear or multiple speakers, reply 'male'."
)


def _detect_gender(transcript_text: str) -> str:
    """Detect speaker gender -- TRANSLATE_PROVIDER='gemini' bo'lsa Gemini birinchi,
    aks holda OpenAI birinchi, ikkalasi ham ishlamasa 'male'ga tushiriladi."""
    from backend.services.openai_compat import light_model_kwargs

    snippet = transcript_text[:1000]
    gemini_available = bool(settings.GEMINI_API_KEY or settings.GEMINI_USE_VERTEX)
    prefer_gemini = settings.TRANSLATE_PROVIDER == "gemini" or not settings.OPENAI_API_KEY

    def _call_gemini():
        from google.genai import types
        from backend.services.translator import _get_gemini_client, _gemini_text_model
        from backend.services.gemini_quota_manager import get_all_gemini_api_keys

        config = types.GenerateContentConfig(
            system_instruction=_GENDER_SYSTEM_PROMPT, temperature=0, max_output_tokens=5,
        )
        keys = get_all_gemini_api_keys() or [None]
        last_e = None
        for k in keys:
            try:
                response = _get_gemini_client(api_key=k).models.generate_content(
                    model=_gemini_text_model(), contents=f"Transcript: {snippet}", config=config,
                )
                result = (response.text or "").strip().lower()
                return "female" if (result == "female" or (result.startswith("female") and "male" not in result)) else "male"
            except Exception as e:
                last_e = e
                continue
        raise last_e or RuntimeError("Gemini gender detection failed")

    def _call_openai():
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY not set")
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=settings.OPENAI_LIGHT_MODEL,
            messages=[
                {"role": "system", "content": _GENDER_SYSTEM_PROMPT},
                {"role": "user", "content": f"Transcript: {snippet}"},
            ],
            **light_model_kwargs(temperature=0, max_tokens=5),
        )
        result = (resp.choices[0].message.content or "").strip().lower()
        return "female" if (result == "female" or (result.startswith("female") and "male" not in result)) else "male"

    if prefer_gemini and gemini_available:
        try:
            return _call_gemini()
        except Exception as e:
            logger.debug(f"_detect_gender: Gemini xato ({e}), OpenAI'ga o'tilmoqda.")
            try:
                return _call_openai()
            except Exception as e2:
                logger.debug(f"_detect_gender: OpenAI ham xato ({e2}), 'male'ga tushirildi.")
                return "male"

    try:
        return _call_openai()
    except Exception as e:
        if gemini_available:
            try:
                return _call_gemini()
            except Exception as e2:
                logger.debug(f"_detect_gender: Gemini ham ishlamadi ({e2}), 'male'ga tushirildi.")
                return "male"
        logger.debug(f"_detect_gender xato ({e}), 'male'ga tushirildi.")
        return "male"


def _scrub_secrets(text: str) -> str:
    """Log qatoridan credential'larni olib tashlaydi (proxy URL, auth
    header, cookie, API kalit/token) — backend/services/error_classification.py
    ning yagona manbasiga delegatsiya qiladi, shu bilan log qatorlari VA
    persist qilinadigan job.error_message bir xil qoidalar bilan tozalanadi."""
    return error_classification.scrub_secrets(text)


def _classify_download_error(exc: Exception) -> str:
    """DOWNLOAD bosqichidagi xatoni aniq toifaga ajratadi —
    backend/services/error_classification.py ga delegatsiya (yagona
    klassifikatsiya manbasi — downloader.py'ning proksi-eskalatsiya
    qarori ham xuddi shu funksiyadan foydalanadi, ular hech qachon
    bir-biridan farq qilmasligi uchun)."""
    return error_classification.classify_error(exc)


def _error_code_for(exc: Exception, current_stage: str) -> str:
    """Xatolikni qisqa toifaga ajratadi (admin panel/monitoring uchun)."""
    code = getattr(exc, "code", None)
    if code:
        return code
    if isinstance(exc, SoftTimeLimitExceeded):
        return error_classification.TIMEOUT
    if current_stage == "DOWNLOAD":
        return _classify_download_error(exc)
    return f"{current_stage}_FAILED"


def _safe_persisted_error(exc: Exception, current_stage: str) -> tuple[str, str]:
    """Returns (error_code, error_message) SAFE to persist to the DB and
    return via the (intentionally unauthenticated, shareable-link) job
    detail endpoint. Two cases:

    - PermanentError: its message was authored BY US as user-facing text
      (e.g. "Bu videoda nutq topilmadi.") — never derived from a raw
      yt-dlp/network exception, so it is kept verbatim (scrubbed anyway,
      as cheap defense in depth in case a future PermanentError ever
      interpolates raw data).
    - Any other exception: message may be raw yt-dlp/urllib3/requests
      text, which can embed proxy credentials (2026-08-26 audit finding)
      and is never useful to an end user regardless. Classified centrally
      and replaced with the matching safe Uzbek message — the raw,
      scrubbed text is only ever written to the server log, never to a
      persisted/API-visible field.
    """
    code = _error_code_for(exc, current_stage)
    if isinstance(exc, (PermanentError, NoSpeechFoundError)):
        return code, error_classification.scrub_secrets(str(exc))
    return code, error_classification.safe_user_message(code)


def _notify_job_failed_push(job_id: str, job, exc: Exception | str = "", error_code: str | None = None) -> None:
    """FAILED bo'lganda PWA push -- doim yangi sessiya bilan (chaqiruvchining
    `db`si bu paytda buzilgan bo'lishi mumkin, _mark_job_failed kabi).
    VAPID sozlanmagan / obuna yo'q bo'lsa jimgina o'tadi."""
    try:
        user_id = getattr(job, "user_id", None)
        if not user_id:
            return
        from backend.services.push_service import notify_user
        session = SessionLocal()
        try:
            err_code = error_code or getattr(job, "error_code", None) or getattr(exc, "code", None)
            err_str = str(exc).lower() if exc else ""
            video_title = getattr(job, "video_title", None) or "Video"

            if err_code == "NO_SPEECH_FOUND" or "nutq topilmadi" in err_str:
                title = "Videoda nutq topilmadi 🎙"
                body = f"{video_title} — videoda gapirilgan nutq aniqlanmadi."
            elif err_code == "CONTENT_BLOCKED" or "kontent siyosati" in err_str:
                title = "Dublyaj rad etildi 🛡"
                body = f"{video_title} — kontent siyosatiga to'g'ri kelmadi."
            else:
                title = "Dublyaj bajarilmadi ❌"
                body = f"{video_title} — qaytadan urinib ko'ring."

            notify_user(session, user_id, title, body, f"/video/{job_id}")
        finally:
            session.close()
    except Exception as push_err:
        logger.warning(f"[JOB {job_id}] Push (failed) yuborilmadi: {push_err}")


def _mark_job_failed(job_id: str, exc: Exception, current_stage: str) -> None:
    """Job'ni FAILED holatiga o'tkazadi — doim BUTUNLAY YANGI DB sessiyasi
    bilan, chaqiruvchining `db` sessiyasidan mustaqil ravishda.

    Sabab: 2026-08-21/22 productionda haqiqiy job (cdc1f75e) topildi — u
    yuklab olishda muvaffaqiyatsiz bo'lgach, xuddi shu `except` bloki FAILED
    deb belgilashga urinayotganda DB ulanishi vaqtinchalik uzilgan edi
    (`OperationalError: server closed the connection unexpectedly`) — bu
    IKKINCHI xato hech qayerda ushlanmagani uchun, job hech qachon FAILED
    bo'lmay, oxirgi muvaffaqiyatli holatida (DOWNLOADING) ABADIY qotib
    qolgan edi. Bu funksiya shu holatni oldini oladi: eski `db` qanday
    holatda bo'lishidan qat'i nazar, 2 marta yangi sessiya bilan urinadi;
    ikkalasi ham muvaffaqiyatsiz bo'lsa, kamida CRITICAL log qoldiradi —
    "hech narsa" o'rniga."""
    # error_message HECH QACHON xom exception matni bo'lmasligi kerak --
    # GET /jobs/{id} ataylab autentifikatsiyasiz (ulashiladigan havola
    # naqshi), shuning uchun bu maydon proxy credential yoki boshqa
    # sirlarni oshkor qilmasligi kerak (2026-08-26 audit, Priority 1).
    error_code, safe_message = _safe_persisted_error(exc, current_stage)
    fields = {
        "status": JobStatus.FAILED,
        "error_message": safe_message,
        "error_code": error_code,
        "updated_at": datetime.utcnow(),
    }
    for attempt in range(2):
        session = SessionLocal()
        try:
            session.query(DubbingJob).filter(DubbingJob.id == job_id).update(fields)
            session.commit()
            return
        except Exception as mark_exc:
            logger.error(f"[JOB {job_id}] FAILED holatiga o'tkazishda xatolik (urinish {attempt + 1}/2): {mark_exc}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()
    logger.critical(f"[JOB {job_id}] FAILED holatiga HECH QANDAY usulda o'tkazib bo'lmadi — job eski holatida abadiy qotib qolishi mumkin!")


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
    claim_token = None

    try:
        job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        if not job:
            raise ValueError(f"Job topilmadi: {job_id}")

        is_recovery_job = bool(job.completed_at is not None or job.translated_segments)

        # 2026-08-26 audit: bir xil task_id ikki worker'da bir vaqtda faol
        # bo'lishi productionda LIVE kuzatilgan (Celery/Redis qayta
        # yetkazib berishi VA recover_stuck_jobs() bir xil job'ni mustaqil
        # qayta navbatga qo'yishi tufayli). Bu yerda DB darajasidagi atomik
        # claim -- ikkinchi (dublikat) yetkazib berish xato/qayta urinishsiz,
        # xavfsiz chiqib ketadi.
        # redelivered=True -- Celery/Kombu bu vazifani QAYTA yetkazayotgani
        # tasdiqlangan (task_reject_on_worker_lost yoki visibility_timeout
        # orqali) -- eski egasi ALLAQACHON o'lgan bo'lishi kafolatlangan
        # (job_claim.py:try_claim docstringidagi xavfsizlik dalili), shuning
        # uchun muddati tugamagan eski claim'ni ham qayta claim qilishga
        # ruxsat beriladi (2026-08-26 worker-loss audit -- ilgari bunday
        # holatda job lease muddati tugagunча, soatlab, qotib qolardi).
        is_redelivered = bool((self.request.delivery_info or {}).get("redelivered"))
        claim_token = try_claim(db, DubbingJob, job_id, CLAIM_LEASE_SECONDS, allow_reclaim=is_redelivered)
        if claim_token is None:
            logger.info(
                f"[JOB {job_id}] Boshqa worker allaqachon faol claim'ga ega -- "
                f"bu dublikat yetkazib berish, xavfsiz chiqilmoqda."
            )
            return {"job_id": job_id, "status": "skipped_duplicate_claim"}

        job_dir = Path(settings.UPLOAD_DIR) / job_id
        output_dir = Path(settings.OUTPUT_DIR) / job_id

        # BOSQICH 1: Yuklash
        # Checkpoint: agar video+audio disk'da hali ham mavjud bo'lsa (masalan
        # oldingi urinish shu yerdan keyin qulagan bo'lsa), qayta yuklab
        # olinmaydi — YouTube'ga behuda so'rov yuborilmaydi.
        #
        # 2026-08-26 finding (job 83ca2305): "diskda mavjud" ilgari FAQAT shu
        # HOST'ning o'z diskini tekshirar edi -- Celery qayta urinishni
        # BOSHQA worker host'iga yuborsa (5 host'li flot, umumiy disk yo'q),
        # oldingi hostning muvaffaqiyatli yuklab olingan fayli butunlay
        # ko'rinmas edi, majburiy qayta yuklashga (va qayta YouTube xatosiga
        # duch kelishga) olib kelardi. restore_checkpoint() avval xuddi shu
        # lokal tekshiruvni qiladi (bir xil host'da hech narsa o'zgarmaydi,
        # S3'ga murojaat yo'q) -- faqat lokal fayl YO'Q bo'lsa S3'dan
        # tiklashga urinadi (backend/services/job_checkpoint.py).
        current_stage = "DOWNLOAD"
        stage_t0 = time.monotonic()
        # Check if original video is already available (locally or via S3 checkpoint)
        has_video = False
        if job.original_video_path:
            p_vid = Path(job.original_video_path)
            if p_vid.exists() and p_vid.is_file() and p_vid.stat().st_size > 0:
                has_video = True
            elif restore_checkpoint(job_id, "video.mp4", job.original_video_path) and p_vid.exists() and p_vid.stat().st_size > 0:
                has_video = True
            else:
                if p_vid.exists():
                    try:
                        p_vid.unlink()
                    except Exception:
                        pass
                job.original_video_path = None

        # Worker kesh himoyasi: agar video diskda yo'q bo'lsa, lekin u allaqachon boshqa job orqali
        # muvaffaqiyatli dublyaj qilingan bo'lsa, YouTube'dan qayta yuklab o'tirmasdan keshdan olamiz.
        if not has_video and not job.subtitle_only:
            from backend.services.job_creation import extract_youtube_video_id, _cached_job_files_exist
            v_id = job.youtube_video_id or (extract_youtube_video_id(job.youtube_url) if job.youtube_url else None)
            if v_id:
                cache_q = db.query(DubbingJob).filter(
                    DubbingJob.youtube_video_id == v_id,
                    DubbingJob.status == JobStatus.COMPLETED,
                    DubbingJob.subtitle_only.is_(False),
                    DubbingJob.id != job.id,
                )
                if job.speaker_gender in ("male", "female"):
                    cache_q = cache_q.filter(DubbingJob.speaker_gender == job.speaker_gender)
                elif getattr(job, "voice_gender_setting", None) in ("male", "female"):
                    cache_q = cache_q.filter(DubbingJob.speaker_gender == job.voice_gender_setting)

                cached_j = cache_q.order_by(DubbingJob.completed_at.desc()).first()
                if cached_j and _cached_job_files_exist(cached_j):
                    logger.info(f"[JOB {job_id}] Video {v_id} keshdan topildi (job {cached_j.id}) -- worker to'liq natijalarni ko'chirdi.")
                    job.source_job_id = cached_j.storage_id
                    job.video_title = job.video_title or cached_j.video_title
                    job.video_duration = job.video_duration or cached_j.video_duration
                    job.video_thumbnail = job.video_thumbnail or cached_j.video_thumbnail
                    job.speaker_gender = cached_j.speaker_gender
                    job.transcript_text = cached_j.transcript_text
                    job.translated_text = cached_j.translated_text
                    job.transcript_segments = cached_j.transcript_segments
                    job.translated_segments = cached_j.translated_segments
                    job.srt_content = cached_j.srt_content
                    job.uzbek_srt_content = cached_j.uzbek_srt_content
                    job.output_video_path = cached_j.output_video_path or f"outputs/{cached_j.storage_id}/video/dubbed_final.mp4"
                    job.output_video_url = cached_j.output_video_url or f"/outputs/{cached_j.storage_id}/video/dubbed_final.mp4"
                    job.dubbed_audio_path = cached_j.dubbed_audio_path or f"outputs/{cached_j.storage_id}/audio/dubbed_audio.wav"
                    job.error_code = None
                    job.error_message = None
                    job.quota_consumed = True
                    job.status = JobStatus.COMPLETED
                    job.progress = 100.0
                    job.status_message = "Dublyaj tayyor!"
                    job.completed_at = datetime.utcnow()
                    db.commit()
                    return {"job_id": job_id, "status": "completed_from_cache"}

        # Cross-gender matn va resurslarni qayta ishlatish (Donor kesh):
        # Agar video boshqa jinsda (yoki subtitrda) allaqachon dublyaj qilingan bo'lsa,
        # transkripsiya, tarjima va nutq segmentlari 100% bir xil!
        # Qayta resurs sarflamaslik va tarjimalar bir-biridan farqlanib qolmasligi uchun
        # mavjud tugallangan job'dan matnlarni nusxalaymiz.
        from backend.services.job_creation import extract_youtube_video_id
        v_id = job.youtube_video_id or (extract_youtube_video_id(job.youtube_url) if job.youtube_url else None)
        donor_j = None
        if v_id and not job.translated_segments:
            donor_q = db.query(DubbingJob).filter(
                DubbingJob.youtube_video_id == v_id,
                DubbingJob.status == JobStatus.COMPLETED,
                DubbingJob.translated_segments.isnot(None),
                DubbingJob.id != job.id,
            )
            donor_j = donor_q.order_by(DubbingJob.completed_at.desc()).first()
            if donor_j:
                logger.info(
                    f"[JOB {job_id}] Video {v_id} uchun tayyor matnlar donor job {donor_j.id} dan olindi "
                    f"(jinslararo matn keshidan qayta ishlatildi)."
                )
                job.video_title = job.video_title or donor_j.video_title
                job.video_duration = job.video_duration or donor_j.video_duration
                job.video_thumbnail = job.video_thumbnail or donor_j.video_thumbnail
                job.transcript_text = job.transcript_text or donor_j.transcript_text
                job.transcript_segments = job.transcript_segments or donor_j.transcript_segments
                job.srt_content = job.srt_content or donor_j.srt_content
                job.translated_text = job.translated_text or donor_j.translated_text
                job.translated_segments = job.translated_segments or donor_j.translated_segments
                job.uzbek_srt_content = job.uzbek_srt_content or donor_j.uzbek_srt_content
                job.speech_segments = job.speech_segments or donor_j.speech_segments

                # Agar original video diskda hali mavjud bo'lsa, qayta yuklashni ham chetlab o'tamiz
                if not has_video:
                    if donor_j.original_video_path:
                        p_donor_vid = Path(donor_j.original_video_path)
                        if p_donor_vid.exists() and p_donor_vid.is_file() and p_donor_vid.stat().st_size > 0:
                            job.original_video_path = donor_j.original_video_path
                            has_video = True
                    if not has_video:
                        target_vid = job_dir / "video" / "video.mp4"
                        if restore_checkpoint(donor_j.storage_id, "video.mp4", str(target_vid)) and target_vid.exists() and target_vid.stat().st_size > 0:
                            job.original_video_path = str(target_vid)
                            has_video = True
                db.commit()

        if has_video:
            video_path = job.original_video_path
            audio_candidates = [
                job_dir / "audio.wav",
                output_dir / "audio.wav",
                output_dir / "audio" / "audio.wav",
                Path(video_path).parent / "audio.wav",
                Path(video_path).parent.parent / "audio.wav",
                Path(video_path).parent.parent / "audio" / "audio.wav",
            ]
            found_audio = None
            for cand in audio_candidates:
                if cand.exists() and cand.is_file() and cand.stat().st_size > 0:
                    found_audio = str(cand)
                    break

            if not found_audio:
                target_audio = job_dir / "audio.wav"
                if restore_checkpoint(job_id, "audio.wav", str(target_audio)) and target_audio.exists():
                    found_audio = str(target_audio)
                else:
                    target_audio.parent.mkdir(parents=True, exist_ok=True)
                    from backend.services.job_creation import _extract_audio_wav
                    if not _extract_audio_wav(Path(video_path), target_audio):
                        raise PermanentError(
                            "Video faylidan audio ajratib bo'lmadi.",
                            code="AUDIO_EXTRACTION_FAILED",
                        )
                    found_audio = str(target_audio)
                    save_checkpoint(job_id, "audio.wav", found_audio)

            audio_path = found_audio
            _record_stage(stage_timings, job_id, "DOWNLOAD", stage_t0, "skipped")
        else:
            # Telegram bot orqali yuborilgan video fayl job'ining youtube_url'i
            # sintetik ("telegram://file/..."), haqiqiy YouTube havolasi emas.
            # Odatda lokal audio.wav/video hali joyida bo'lgani uchun yuqoridagi
            # checkpoint bu bosqichni o'tkazib yuboradi -- lekin fayllar
            # tozalangandan keyin bu job qayta bu yerga tushsa (masalan qayta
            # navbatga qo'yilsa, yoki checkpoint S3'da yo'q bo'lsa), synthetic
            # URL'ni yt-dlp'ga berish mantiqsiz ("Unsupported url scheme:
            # telegram") va 5 marta behuda retry qilinadi. Qayta yuklab olish
            # IMKONSIZ, shuning uchun darhol, qayta-urinishsiz permanent xato --
            # foydalanuvchi faylni Telegram orqali qaytadan yuborishi kerak.
            # (Web'ning upload-video-fallback yo'li youtube_url'ni HAQIQIY
            # havola sifatida saqlaydi, shuning uchun u bu yerda YouTube'dan
            # qayta yuklashga o'tishi -- to'g'ri xatti-harakat -- buzilmaydi.)
            from backend.services.job_creation import is_valid_youtube_url
            if not is_valid_youtube_url(job.youtube_url or ""):
                raise PermanentError(
                    "Yuklangan video fayl serverda topilmadi (vaqtinchalik fayllar "
                    "tozalangan bo'lishi mumkin). Iltimos, videoni Telegram orqali "
                    "qaytadan yuboring.",
                    code="UPLOADED_SOURCE_MISSING",
                )
            _update_job(db, job, JobStatus.DOWNLOADING, 5.0, "YouTube'dan yuklanmoqda...")
            download_result = downloader.download_video(job.youtube_url, job_id)
            job.video_title = download_result["title"]
            job.video_duration = download_result["duration"]
            job.original_video_path = download_result["video_path"]
            db.commit()
            video_path = download_result["video_path"]
            audio_path = download_result["audio_path"]
            save_checkpoint(job_id, "video.mp4", video_path)
            save_checkpoint(job_id, "audio.wav", audio_path)
            _record_stage(stage_timings, job_id, "DOWNLOAD", stage_t0, "ok")

        # BOSQICH 2: Transkripsiya
        # Checkpoint: xom segmentlar (timestamp bilan) DB'da saqlanadi —
        # ular bo'lsa, qimmat/uzoq transkripsiya qayta bajarilmaydi.
        current_stage = "TRANSCRIBE"
        stage_t0 = time.monotonic()
        uzbek_source = is_uzbek_source(job)
        if job.transcript_segments:
            _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "skipped")
            segments = job.transcript_segments
            transcript_text = job.transcript_text or ""
        else:
            _update_job(db, job, JobStatus.TRANSCRIBING, 20.0, "Nutq matnga aylantirilmoqda...")
            # Subtitr rejimi yoki uzbek_source uchun STT doim Gemini (Google AI Studio) bo'ladi.
            # OpenAI Whisper o'zbek tilini yaxshi tushunmaydi va tez-tez turkcha/xato chiqaradi.
            stt_primary = "gemini" if (job.subtitle_only or uzbek_source or settings.STT_PROVIDER == "gemini") else "openai"
            try:
                transcript = transcriber.transcribe_audio(
                    audio_path,
                    language="uz" if uzbek_source else None,
                    primary=stt_primary,
                )
            except transcriber.WrongLanguageError as exc:
                if uzbek_source:
                    logger.warning(
                        f"[JOB {job_id}] Video 'uz' deb belgilangan, ammo o'zbekcha emas "
                        f"(turkcha/chet tili aniqlandi). Avtomatik tarjima rejimiga o'tkazilmoqda..."
                    )
                    uzbek_source = False
                    job.source_language = "auto"
                    db.commit()
                    _update_job(db, job, JobStatus.TRANSCRIBING, 25.0, "Chet tili aniqlandi, qayta matnga aylantirilmoqda...")
                    transcript = transcriber.transcribe_audio(
                        audio_path,
                        language=None,
                        primary=stt_primary,
                    )
                else:
                    _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "error", "til mos kelmadi")
                    raise PermanentError(
                        "Nutqni matnga aylantirib bo'lmadi: til mos kelmadi. "
                        "Birozdan so'ng qayta urinib ko'ring.",
                        code="STT_WRONG_LANGUAGE",
                    ) from exc
            if not transcript["segments"] or not transcriber.has_speech(transcript["segments"]):
                _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "error", "nutq topilmadi")
                raise NoSpeechFoundError("Bu videoda nutq topilmadi.", code="NO_SPEECH_FOUND")
            job.transcript_text = transcript["text"]
            job.srt_content = transcript["srt"]
            job.transcript_segments = transcript["segments"]

            # Agar STT manba tilini o'zbekcha ('uz') deb aniqlasa, lekin foydalanuvchi 'auto' tanlagan bo'lsa,
            # subtitr rejimida video o'zbekcha deb belgilanadi (tarjimasiz toza subtitr hosil bo'ladi)
            detected_lang = transcript.get("language")
            if detected_lang == "uz" and not uzbek_source and job.subtitle_only:
                logger.info(f"[JOB {job_id}] Subtitr rejimi: STT tilni o'zbekcha ('uz') deb aniqladi. To'g'ridan-to'g'ri o'zbekcha subtitrga o'tkazilmoqda.")
                uzbek_source = True
                job.source_language = "uz"

            db.commit()
            segments = transcript["segments"]
            transcript_text = transcript["text"]
            _record_stage(stage_timings, job_id, "TRANSCRIBE", stage_t0, "ok")

        # Safety Gate -- 2-bosqich (transkript). Sarlavha zararsiz ko'ringan,
        # lekin videoning haqiqiy nutqi siyosatga zid bo'lgan holatlarni shu
        # yerda ushlaydi -- tarjima/TTS (qimmat bosqichlar) boshlanishidan OLDIN.
        current_stage = "SAFETY_CHECK"
        safety = check_safety(transcript_text)
        if not safety.allowed:
            # Faqat CSAM (sexual_minors) shu yerga yetib keladi -- yagona
            # qat'iy blok. user_id NOT NULL -- anonim job (deyarli
            # bo'lmaydi, login majburiy, lekin himoya sifatida) uchun
            # yozuv qo'shmaymiz, video baribir bloklanadi.
            if job.user_id is not None:
                db.add(ContentViolation(
                    user_id=job.user_id,
                    youtube_url=job.youtube_url,
                    video_title=job.video_title,
                    stage="transcript",
                    category=safety.category or "policy_violation",
                    reason=safety.reason or "",
                    blocked=True,
                ))
                db.commit()

            try:
                from backend.services.telegram_notify import send_content_blocked_to_admins
                user = db.query(User).filter(User.id == job.user_id).first() if job.user_id else None
                send_content_blocked_to_admins(
                    video_url=job.youtube_url or (f"Fayl: {job.original_video_path}" if job.original_video_path else None),
                    video_title=job.video_title,
                    category=safety.category,
                    reason=safety.reason,
                    stage="transcript",
                    user_id=str(job.user_id) if job.user_id else None,
                    user_name=user.name if user else None,
                    user_email_or_phone=user.email or user.phone if user else None,
                    job_id=str(job.id),
                )
            except Exception as e:
                logger.error(f"[JOB {job_id}] Moderatsiya admin xabarini yuborishda xatolik: {e}")

            raise PermanentError(
                safety.reason or "Ushbu video GapirAI.uz kontent siyosatiga mos kelmagani sababli dublaj qilinmaydi.",
                code="CONTENT_BLOCKED",
            )
        if safety.category and job.user_id is not None:
            # Ogohlantirish -- pipeline to'xtamaydi, faqat qayd etiladi.
            db.add(ContentViolation(
                user_id=job.user_id,
                youtube_url=job.youtube_url,
                video_title=job.video_title,
                stage="transcript",
                category=safety.category,
                reason=safety.reason or "",
                blocked=False,
            ))
            job.content_flagged = True
            db.commit()

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
            setting = job.voice_gender_setting or "male"
            if setting in ("male", "female"):
                gender = setting
            elif job.subtitle_only:
                # "Subtitr" rejimida ovoz yaratilmaydi -- jins hech qayerda
                # ishlatilmaydi, shuning uchun bekorga LLM chaqirmaymiz.
                gender = "male"
            elif donor_j and donor_j.speaker_gender in ("male", "female"):
                gender = donor_j.speaker_gender
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
            if uzbek_source:
                # Nutq allaqachon o'zbekcha: tarjima ham, qisqartirish ham kerak emas.
                _update_job(db, job, JobStatus.TRANSLATING, 40.0, "Subtitr tayyorlanmoqda...")
                translated_segments = translator.passthrough_segments(segments)
            else:
                _update_job(db, job, JobStatus.TRANSLATING, 40.0, "O'zbek tiliga tarjima qilinmoqda...")
                translated_segments = translator.translate_segments(segments)

            # Davomiylik tekshiruvi — original segment vaqtidan sezilarli
            # uzunroq chiqqan tarjimalar BIR MARTA qisqartiriladi (haqiqiy
            # TTS chaqirilmasdan, belgi-tezlik evristikasi bilan taxmin
            # qilinadi). TRANSLATE checkpoint'i bilan birga saqlanadi —
            # qayta ishlashda ikkalasi ham birga o'tkazib yuboriladi.
            # DUBLYAJ: TTS o'qish vaqti segmentga sig'sin. SUBTITR: ovoz yo'q, lekin
            # matn ekranda o'qib bo'ladigan tezlikda bo'lishi kerak -- shuning uchun
            # faqat o'qish tezligi chegaradan (subtitle_cues.MAX_READ_CPS) oshadigan
            # gaplar qisqartiriladi, ularning oynasi esa so'z vaqtlari bo'yicha
            # aniqlashtiriladi (subtitr aynan shu oynada ko'rinadi).
            if uzbek_source:
                over_budget = {}
            elif job.subtitle_only:
                over_budget = subtitle_cues.reading_budgets(translated_segments, segments_source_for_cues(job))
            else:
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

        # "Subtitr" rejimi -- dublyaj audiosi/videosi umuman kerak emas,
        # TRANSLATE tugagach (transkript+tarjima+vaqt kodlari tayyor bo'lgach)
        # SPEECH_OPT/TTS/MERGE'ni butunlay o'tkazib yuborib job darhol
        # COMPLETED qilinadi. Claim bo'shatish/progress tozalash/db.close()
        # pastdagi umumiy `finally` blokida (funksiya oxirida) baribir
        # ishlaydi -- try ichidan return qilish ularni chetlab o'tmaydi.
        if job.subtitle_only:
            # Subtitr kuelari: qisqa (<=2 qator), so'z vaqtlariga mos, o'qib bo'ladigan
            # tezlikda (backend/services/subtitle_cues.py). Xato bo'lsa job yiqilmaydi --
            # eski (gap darajasidagi) VTT'ga qaytamiz.
            try:
                job.uzbek_srt_content = subtitle_cues.cues_to_vtt(
                    subtitle_cues.build_cues(translated_segments, segments_source_for_cues(job))
                )
            except Exception:
                logger.exception(f"[JOB {job_id}] Subtitr kuelarini qurishda xato -- gap darajasidagi VTT ishlatiladi")
                job.uzbek_srt_content = _segments_to_vtt(translated_segments)
            _update_job(db, job, JobStatus.COMPLETED, 100.0, "Subtitr tayyor!")
            job.completed_at = datetime.utcnow()
            db.commit()
            _cleanup_upload_dir(job_id)
            _log_pipeline_summary(job_id, stage_timings, pipeline_start, "COMPLETED (subtitle-only)")
            return {"job_id": job_id, "status": "completed"}

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
        # DOWNLOAD'dagi bilan bir xil sabab bilan restore_checkpoint()
        # orqali -- boshqa host'dagi qayta urinish ham S3'dan tiklay oladi.
        current_stage = "TTS"
        stage_t0 = time.monotonic()
        tts_restored = bool(job.dubbed_audio_path) and restore_checkpoint(job_id, "dubbed_audio.wav", job.dubbed_audio_path)
        if tts_restored and Path(job.dubbed_audio_path).exists():
            _record_stage(stage_timings, job_id, "TTS", stage_t0, "skipped")
            dubbed_audio_path = job.dubbed_audio_path
            # Checkpoint orqali qayta tiklangan job uchun aniq segment
            # vaqtlari qayta hisoblanmaydi (qimmat emas, shunchaki mavjud
            # emas bu bosqichda) — yakuniy QA (pastda) bunsiz ham
            # clipping/balandlik tekshiruvlarini bajaradi, faqat dub/fon
            # balansi tekshiruvi o'tkazib yuboriladi.
            actual_timings = None
        else:
            from backend.services.job_progress import set_subprogress
            from backend.services.plans import get_tts_provider_for_job

            tts_provider = get_tts_provider_for_job(db, job)
            job.tts_provider = tts_provider

            # Provayder va jinsga qarab aniq ovoz nomini tanlash
            if tts_provider in ("azure", "edge"):
                voice = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"
            elif tts_provider == "gemini":
                voice = getattr(settings, "GEMINI_FEMALE_VOICE", "Autonoe") if gender == "female" else getattr(settings, "GEMINI_MALE_VOICE", "Charon")
            else:
                voice = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"

            if getattr(job, "voice_name", None):
                voice = job.voice_name
            else:
                job.voice_name = voice

            if not getattr(job, "voice_style", None):
                job.voice_style = "neutral"
            db.commit()

            prov_title = {"azure": "Azure", "edge": "Edge", "gemini": "Gemini"}.get(tts_provider, tts_provider)
            _update_job(db, job, JobStatus.SYNTHESIZING, 60.0,
                        f"O'zbek ovozi yaratilmoqda ({prov_title} • {'ayol' if gender == 'female' else 'erkak'})...")
            tts_dir = str(output_dir / "audio" / "tts_segments")
            dubbed_audio_path, actual_timings, qa_results = synthesizer.synthesize_segments(
                speech_segments, tts_dir, voice_name=voice,
                video_id=job_id, user_id=(str(job.user_id) if job.user_id else None),
                existing_qa=job.segment_qa,
                progress_cb=lambda done, total: set_subprogress(job_id, 60.0 + 22.0 * done / max(1, total)),
                provider_name=tts_provider,
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
            save_checkpoint(job_id, "dubbed_audio.wav", dubbed_audio_path)
            _record_stage(stage_timings, job_id, "TTS", stage_t0, "ok")

        # BOSQICH 6: Birlashtirish
        # Checkpoint: yakuniy video allaqachon tayyor bo'lsa, ffmpeg qayta
        # ishlamaydi. Xuddi DOWNLOAD/TTS kabi -- boshqa host'dagi qayta
        # urinish uchun S3'dan tiklash imkoniyati bilan.
        current_stage = "MERGE"
        stage_t0 = time.monotonic()
        merge_restored = bool(job.output_video_path) and restore_checkpoint(job_id, "dubbed_final.mp4", job.output_video_path)
        if merge_restored and Path(job.output_video_path).exists():
            _record_stage(stage_timings, job_id, "MERGE", stage_t0, "skipped")
            final_output = job.output_video_path
        else:
            _update_job(db, job, JobStatus.MERGING, 85.0, "Video birlashtirilmoqda...")
            final_output_dir = output_dir / "video"
            final_output_dir.mkdir(parents=True, exist_ok=True)
            final_output = str(final_output_dir / "dubbed_final.mp4")

            merger.merge_video_audio(
                video_path=video_path,
                dubbed_audio_path=dubbed_audio_path,
                output_path=final_output,
            )

            job.output_video_path = final_output
            job.output_video_url = f"/outputs/{job_id}/video/dubbed_final.mp4"
            db.commit()
            save_checkpoint(job_id, "dubbed_final.mp4", final_output)
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

        # On-demand tiklash Redis lock'ini tozalash
        try:
            from redis import Redis
            Redis.from_url(settings.REDIS_URL).delete(f"ondemand_recovery:{job_id}")
        except Exception:
            pass

        # Duplicate joblar (source_job_id == job_id bo'lgan boshqa joblar)ni ham COMPLETED qilish
        try:
            db.query(DubbingJob).filter(
                DubbingJob.source_job_id == job_id,
                DubbingJob.id != job_id,
            ).update({
                "status": JobStatus.COMPLETED,
                "progress": 100.0,
                "status_message": "Dublyaj tayyor!",
                "output_video_path": final_output,
                "output_video_url": f"/outputs/{job_id}/video/dubbed_final.mp4",
                "dubbed_audio_path": dubbed_audio_path,
            }, synchronize_session=False)
            db.commit()
        except Exception as dup_err:
            logger.warning(f"Duplicate joblarni yangilashda xatolik: {dup_err}")

        # Anonim joblar yoki qayta tiklangan eski joblar uchun qayta email yuborilmaydi
        if job.user_id and job.user and job.user.email and not is_recovery_job:
            try:
                send_dubbing_complete_email(job.user.email, job.user.name or "", job.video_title or "Video", job_id)
            except Exception as email_err:
                logger.warning(f"Dublyaj tayyor email yuborilmadi (job {job_id}): {email_err}")

        # PWA push (backend/services/push_service.py) -- VAPID sozlanmagan
        # bo'lsa jimgina o'tkazib yuboriladi.
        if job.user_id:
            try:
                from backend.services.push_service import notify_user
                notify_user(db, job.user_id, "Dublyaj tayyor! 🎬",
                            job.video_title or "Videongiz o'zbek tilida tayyor.",
                            f"/video/{job_id}")
            except Exception as push_err:
                logger.warning(f"Push yuborilmadi (job {job_id}): {push_err}")

        # Telegram bot orqali bog'langan bo'lsa (backend/telegram_bot.py) --
        # web orqali yaratilgan job bo'lsa ham, foydalanuvchi telefon
        # raqami botga ham ulangan bo'lsa xabar boradi. Rezolyutsiya
        # tugmalari tarifga qarab cheklanadi (backend/services/plans.py) --
        # tugma bosilganda telegram_bot.py resolution_variants.request_resolution()
        # ni chaqiradi, xuddi veb bilan bir xil.
        if job.user_id and job.user and job.user.telegram_chat_id:
            frontend_url = (settings.FRONTEND_URL or "https://gapirai.uz").rstrip("/")
            from backend.services.plans import get_max_resolution_for_job, RESOLUTION_ORDER
            max_res = get_max_resolution_for_job(db, job)
            allowed = RESOLUTION_ORDER[: RESOLUTION_ORDER.index(max_res) + 1]
            keyboard = {"inline_keyboard": [[
                {"text": res, "callback_data": f"res:{job_id}:{res}"} for res in allowed
            ]]}
            send_telegram_message(
                job.user.telegram_chat_id,
                f"\u2705 Dublyaj tayyor!\n\n\U0001F3AC {job.video_title or 'Video'}\n\n{frontend_url}/video/{job_id}\n\nYuklab olish uchun sifatni tanlang:",
                reply_markup=keyboard,
            )

        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "COMPLETED")

        return {"job_id": job_id, "status": "completed", "output_url": job.output_video_url}


    except NoSpeechFoundError as exc:
        # User xatoligi (videoda inson nutqi yo'q) -- bu tizim nosozligi EMAS, adminlarga xabar yuborilmaydi!
        _mark_job_failed(job_id, exc, current_stage)
        try:
            if job.user_id and job.user and job.user.telegram_chat_id:
                v_title = getattr(job, "video_title", None) or "Video"
                msg = (
                    f"🎙 <b>Videoda nutq topilmadi</b>: {v_title}\n\n"
                    f"Ushbu videoda gapirilgan suhbat yoki inson nutqi aniqlanmadi. "
                    f"Dublyaj xizmati faqat ovozli nutq mavjud videolarni tarjima qiladi."
                )
                send_telegram_message(job.user.telegram_chat_id, msg)
        except Exception as notify_exc:
            logger.warning(f"[JOB {job_id}] Telegram xabari yuborilmadi: {notify_exc}")
        _notify_job_failed_push(job_id, job, exc, "NO_SPEECH_FOUND")
        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "FAILED (no speech)")
        raise exc

    except PermanentError as exc:
        try:
            if getattr(exc, "code", None) not in ("CONTENT_BLOCKED", "NO_SPEECH_FOUND"):
                from backend.services.telegram_notify import send_error_to_admins
                u = getattr(job, "user", None)
                send_error_to_admins(
                    exc,
                    context_msg=f"Job: {job_id} | Stage: {current_stage} | Type: PermanentError",
                    job_id=job_id,
                    user_name=getattr(u, "name", None) if u else None,
                    user_email_or_phone=(getattr(u, "phone", None) or getattr(u, "email", None)) if u else None,
                    video_title=getattr(job, "video_title", None),
                    video_url=getattr(job, "youtube_url", None),
                    stage=current_stage,
                )
        except Exception:
            pass
        # Qayta urinish ma'nosiz — har safar bir xil natija chiqadi.
        # Status-o'tkazish endi mustaqil, yangi sessiya bilan (_mark_job_failed) —
        # eski `db` sessiyasi shu paytda qanday holatda bo'lishidan qat'i nazar.
        _mark_job_failed(job_id, exc, current_stage)
        try:
            if job.user_id and job.user and job.user.telegram_chat_id:
                err_code = getattr(exc, "code", None) or getattr(job, "error_code", None)
                err_str = str(exc).lower()
                v_title = getattr(job, "video_title", None) or "Video"
                if err_code == "NO_SPEECH_FOUND" or "nutq topilmadi" in err_str:
                    msg = (
                        f"🎙 <b>Videoda nutq topilmadi</b>: {v_title}\n\n"
                        f"Ushbu videoda gapirilgan suhbat yoki inson nutqi aniqlanmadi. "
                        f"Dublyaj xizmati faqat ovozli nutq mavjud videolarni tarjima qiladi."
                    )
                elif err_code == "CONTENT_BLOCKED" or "kontent siyosati" in err_str:
                    msg = (
                        f"🛡 <b>Dublyaj rad etildi</b>: {v_title}\n\n"
                        f"Ushbu video kontent xavfsizligi qoidalariga mos kelmagani sababli to'xtatildi."
                    )
                else:
                    msg = f"❌ <b>Dublyaj bajarilmadi</b>: {v_title}\n\n{str(exc)}"

                send_telegram_message(job.user.telegram_chat_id, msg)
        except Exception as notify_exc:
            logger.warning(f"[JOB {job_id}] Telegram xabari yuborilmadi: {notify_exc}")
        _notify_job_failed_push(job_id, job, exc, getattr(exc, "code", None))
        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "FAILED (permanent)")
        raise exc

    except Exception as exc:
        try:
            from backend.services.telegram_notify import send_error_to_admins
            u = getattr(job, "user", None)
            send_error_to_admins(
                exc,
                context_msg=f"Job: {job_id} | Stage: {current_stage} | Retry: {self.request.retries}/{self.max_retries}",
                job_id=job_id,
                user_name=getattr(u, "name", None) if u else None,
                user_email_or_phone=(getattr(u, "phone", None) or getattr(u, "email", None)) if u else None,
                video_title=getattr(job, "video_title", None),
                video_url=getattr(job, "youtube_url", None),
                stage=current_stage,
            )
        except Exception:
            pass
        error_code = _error_code_for(exc, current_stage)
        # AUTH_ERROR (va boshqa should_retry()=False toifalar) uchun BLIND
        # RETRY yo'q (2026-08-26 audit, Priority 5) -- eskirgan/bloklangan
        # sessiya soniyalar/daqiqalar o'tishi bilan o'zi tuzalmaydi, shuning
        # uchun bunday xato birinchi marta chiqishi bilanoq to'g'ridan-
        # to'g'ri quyidagi "yakuniy muvaffaqiyatsizlik" bo'limiga o'tadi --
        # xuddi max_retries tugagandagidek, faqat qayta urinishlarni
        # sarflamasdan.
        if self.request.retries < self.max_retries and error_classification.should_retry(error_code):
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
            #
            # 2026-08-26 audit (orphan-job topilmasi, job 9ffc3336): asl `db`
            # sessiyasi aynan shu `except` blokiga olib kelgan
            # OperationalError sababli ALLAQACHON buzilgan bo'lishi mumkin
            # (masalan Postgres idle-in-transaction timeout tufayli) — shu
            # buzilgan sessiyani qayta ishlatib so'rov yuborilsa, IKKINCHI,
            # ushlanmagan OperationalError chiqadi va bu self.retry()/
            # _mark_job_failed()/xabarnoma/kvota-qaytarishning HAMMASINI
            # chetlab o'tadi — job hech qanday error_code'siz DOWNLOADING
            # holatida abadiy qotib qoladi. Yechim: _mark_job_failed bilan
            # bir xil naqsh — eski `db`dan mustaqil, har doim YANGI
            # SessionLocal() ochiladi. Bu yangi sessiya bilan ham
            # muvaffaqiyatsiz bo'lsa (DB butunlay ishlamay qolgan bo'lsa),
            # xato shu yerning o'zida ushlanadi va faqat log qoldiriladi —
            # lekin self.retry() BARIBIR pastda chaqiriladi, chunki qayta
            # urinishning o'zi status-xabari yozilishiga bog'liq emas.
            retry_session = SessionLocal()
            try:
                job = retry_session.query(DubbingJob).filter(DubbingJob.id == job_id).first()
                if job:
                    job.status_message = f"Vaqtinchalik xatolik (qayta urinish {self.request.retries + 1}/{self.max_retries})..."
                    _, job.error_message = _safe_persisted_error(exc, current_stage)
                    job.error_code = error_code
                    job.updated_at = datetime.utcnow()
                    retry_session.commit()
            except Exception as status_exc:
                logger.warning(f"[JOB {job_id}] Qayta urinish oldidan status yangilanmadi: {status_exc}")
            finally:
                retry_session.close()
            try:
                db.close()
            except Exception:
                pass
            _log_pipeline_summary(job_id, stage_timings, pipeline_start, f"RETRY {self.request.retries + 1}/{self.max_retries}")
            raise self.retry(exc=exc, countdown=countdown)

        if current_stage == "DOWNLOAD":
            # Foydalanuvchi so'ragan aniq log formati — monitoring/grep uchun
            # (masalan `docker compose logs worker | grep PROXY_BILLING_ERROR`
            # orqali Webshare balansi tugagan holatlarni tezda topish uchun).
            # Xabar matni credential'lardan tozalangan (_scrub_secrets).
            not_retried = not error_classification.should_retry(error_code)
            logger.error(f"[DOWNLOAD] attempt {self.request.retries + 1}/{self.max_retries}")
            logger.error(f"[DOWNLOAD] error_type={error_code}")
            logger.error(f"[DOWNLOAD] job_id={job_id}")
            logger.error(f"[DOWNLOAD] {_scrub_secrets(str(exc))}")
            logger.error("[DOWNLOAD] not retried (non-retryable error type)" if not_retried else "[DOWNLOAD] max retries reached")
            logger.error("[JOB] status=FAILED")

        # Status-o'tkazish endi mustaqil, yangi sessiya bilan (_mark_job_failed) —
        # eski `db` sessiyasi shu paytda qanday holatda bo'lishidan qat'i nazar
        # (2026-08-21/22 productionda haqiqiy job shu sabab bilan abadiy qotib
        # qolgan edi — batafsili izoh _mark_job_failed'ning o'zida).
        _mark_job_failed(job_id, exc, current_stage)

        # Kvota qaytarish -- bepul/kvota bilan boshlangan job 5 marta
        # urinib ham muvaffaqiyatsiz tugasa, sarflangan kvota userga qaytadi
        # (2026-08-19, foydalanuvchi so'rovi). Pullik (Click) job'lar uchun
        # avtomatik pul qaytarish integratsiyasi yo'q -- Payment.needs_refund
        # true qilinadi, admin panelda qo'lda qaytarish uchun ko'rsatiladi.
        # O'z alohida sessiyasi va try/except bilan — bu yerdagi xato endi
        # yuqoridagi status-o'tkazishga ta'sir qilmaydi.
        refund_db = None
        try:
            refund_db = SessionLocal()
            if job.quota_consumed and job.user_id and not is_recovery_job:
                from backend.services.plans import refund_quota
                refund_quota(refund_db, job.user_id, (job.video_duration or 0.0) / 60.0)
                refund_db.query(DubbingJob).filter(DubbingJob.id == job_id).update({"quota_consumed": False})
            else:
                from backend.models.payment import Payment, PaymentStatus
                paid = refund_db.query(Payment).filter(
                    Payment.job_id == job_id, Payment.status == PaymentStatus.APPROVED
                ).first()
                if paid:
                    paid.needs_refund = True
            refund_db.commit()
        except Exception as refund_exc:
            logger.error(f"[JOB {job_id}] Kvota/to'lov qaytarish belgisini qo'yishda xatolik: {refund_exc}")
        finally:
            if refund_db is not None:
                refund_db.close()

        try:
            if job.user_id and job.user and job.user.telegram_chat_id:
                send_telegram_message(
                    job.user.telegram_chat_id,
                    f"\u274c Dublyaj bajarilmadi (bir necha marta urinildi): {job.video_title or 'Video'}\n\n{str(exc)}",
                )
        except Exception as notify_exc:
            logger.warning(f"[JOB {job_id}] Telegram xabari yuborilmadi: {notify_exc}")
        _notify_job_failed_push(job_id, job, exc, error_code)

        _cleanup_upload_dir(job_id)
        _log_pipeline_summary(job_id, stage_timings, pipeline_start, "FAILED (max retries)")

        raise exc

    finally:
        if claim_token is not None:
            _release_claim_safe(job_id, claim_token)
        try:
            from backend.services.job_progress import clear_subprogress
            clear_subprogress(job_id)
        except Exception:
            pass
        db.close()
