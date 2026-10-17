import time
from pathlib import Path
from datetime import datetime
from celery import Task
from celery.exceptions import SoftTimeLimitExceeded
from celery.utils.log import get_task_logger

from backend.workers.celery_app import celery_app
from backend.workers.tasks import _record_stage, _log_pipeline_summary, _error_code_for, _safe_persisted_error, _cleanup_upload_dir
from backend.models.database import SessionLocal, VideoAnalysis, AnalysisStatus
from backend.services import downloader, transcriber
from backend.services.video_analysis import VideoAnalysisService, normalize_video_language
from backend.services.errors import PermanentError, NoSpeechFoundError
from backend.services import error_classification
from backend.services.job_claim import try_claim, release_claim
from backend.config import get_settings

logger = get_task_logger(__name__)
settings = get_settings()
_service = VideoAnalysisService()

# backend/workers/tasks.py:CLAIM_LEASE_SECONDS bilan bir xil mantiq --
# time_limit (2700s) dan sal ko'proq.
ANALYSIS_CLAIM_LEASE_SECONDS = 2900


def _release_analysis_claim_safe(analysis_id: str, claim_token: str) -> None:
    """backend/workers/tasks.py:_release_claim_safe bilan bir xil naqsh --
    doim yangi sessiya, muvaffaqiyatsizlik jim log qilinadi (lease muddati
    bilan o'zi tuzaladi)."""
    session = SessionLocal()
    try:
        release_claim(session, VideoAnalysis, analysis_id, claim_token)
    except Exception as exc:
        logger.warning(f"[ANALYSIS {analysis_id}] Claim bo'shatilmadi (lease muddati bilan o'zi tugaydi): {exc}")
    finally:
        session.close()


def _update_analysis(db, analysis: VideoAnalysis, status: AnalysisStatus, progress: float, message: str):
    analysis.status = status
    analysis.progress = progress
    analysis.status_message = message
    analysis.updated_at = datetime.utcnow()
    db.commit()


def _mark_analysis_failed(analysis_id: str, error_code: str, error_message: str) -> None:
    """VideoAnalysis'ni FAILED holatiga o'tkazadi -- backend/workers/tasks.py
    :_mark_job_failed bilan AYNAN bir xil naqsh: chaqiruvchining `db`
    sessiyasi bu paytda qanday holatda (buzilgan yoki yo'q) bo'lishidan
    qat'i nazar, doim BUTUNLAY YANGI SessionLocal() bilan, 2 marta urinadi.

    2026-08-27 audit: bu funksiya yo'qligi sababli productionda haqiqiy
    analiz (fJ9rUzIMcZQ, 10-video ishonchlilik namunasida) abadiy
    DOWNLOADING holatida qotib qolgan edi -- yakuniy FAILED yozuvi ASL
    (aynan shu Postgres uzilishi tufayli allaqachon buzilgan) sessiya bilan
    to'g'ridan-to'g'ri urinilgan, natijada IKKINCHI, ushlanmagan
    OperationalError chiqqan -- bu esa qayta urinish/status yozish/
    tozalashning HAMMASINI chetlab o'tgan (xuddi tasks.py'da avval
    tuzatilgan retry-branch bug bilan bir xil sinf, faqat boshqa chaqiruv
    nuqtasida).

    Ikkala urinish ham muvaffaqiyatsiz bo'lsa (masalan DB haqiqatan ham
    vaqtinchalik ishlamay qolgan bo'lsa): "muvaffaqiyatli yozildi" deb
    soxta da'vo qilinmaydi -- faqat CRITICAL log qoldiriladi va mavjud
    recover_stuck_analyses() (backend/main.py) mexanizmiga tayaniladi,
    chunki claim allaqachon bo'shatilgan (yoki hech qachon olinmagan)
    bo'lishi mumkin va qator claim-erkin sifatida qayta tiklanishga
    yaroqli."""
    fields = {
        "status": AnalysisStatus.FAILED,
        "error_message": error_message,
        "error_code": error_code,
        "updated_at": datetime.utcnow(),
    }
    for attempt in range(2):
        session = SessionLocal()
        try:
            session.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id).update(fields)
            session.commit()
            return
        except Exception as mark_exc:
            logger.error(f"[ANALYSIS {analysis_id}] FAILED holatiga o'tkazishda xatolik (urinish {attempt + 1}/2): {mark_exc}")
            try:
                session.rollback()
            except Exception:
                pass
        finally:
            session.close()
    logger.critical(
        f"[ANALYSIS {analysis_id}] FAILED holatiga HECH QANDAY usulda o'tkazib bo'lmadi -- "
        f"analiz eski holatida abadiy qotib qolishi mumkin, recover_stuck_analyses() ga tayaniladi!"
    )


def _cleanup_analysis_dirs(analysis_id: str) -> None:
    _cleanup_upload_dir(analysis_id)
    out_dir = Path(settings.OUTPUT_DIR) / analysis_id
    if out_dir.exists():
        try:
            import shutil
            shutil.rmtree(out_dir)
        except Exception:
            pass


@celery_app.task(
    bind=True,
    name="backend.workers.analysis_tasks.analyze_video_task",
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=2400,  # 40 daqiqa
    time_limit=2700,       # 45 daqiqa
)
def analyze_video_task(self: Task, analysis_id: str) -> dict:
    db = SessionLocal()
    stage_timings: dict = {}
    pipeline_start = time.monotonic()
    current_stage = "INIT"
    claim_token = None
    analysis = None

    try:
        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id).first()
        if not analysis:
            raise ValueError(f"Analysis topilmadi: {analysis_id}")

        # 2026-08-26 audit: backend/workers/tasks.py:process_video bilan bir
        # xil dublikat-ijro muammosi -- aslida shu funksiya production'da
        # LIVE ikki marta bir vaqtda ishlab turgan holda tutilgan edi.
        # backend/workers/tasks.py:process_video bilan bir xil mantiq --
        # qarang shu yerdagi job_claim.py:try_claim docstringi.
        is_redelivered = bool((self.request.delivery_info or {}).get("redelivered"))
        claim_token = try_claim(db, VideoAnalysis, analysis_id, ANALYSIS_CLAIM_LEASE_SECONDS, allow_reclaim=is_redelivered)
        if claim_token is None:
            logger.info(
                f"[ANALYSIS {analysis_id}] Boshqa worker allaqachon faol claim'ga ega -- "
                f"bu dublikat yetkazib berish, xavfsiz chiqilmoqda."
            )
            return {"analysis_id": analysis_id, "status": "skipped_duplicate_claim"}

        # video-analysis o'zining uploads/ papkasini dublyajnikidan alohida
        # ushlaydi (bir xil job_id ehtimoli yo'q — UUID) — shuning uchun
        # downloader.download_video()ga alohida "job_id" sifatida uzatiladi.
        job_dir = Path(settings.UPLOAD_DIR) / analysis_id

        # BOSQICH 1: Yuklash (mavjud dublyaj pipeline'idan qayta foydalanish)
        current_stage = "DOWNLOAD"
        stage_t0 = time.monotonic()
        audio_path_upload = Path(settings.UPLOAD_DIR) / analysis_id / "audio.wav"
        audio_path_output = Path(settings.OUTPUT_DIR) / analysis_id / "audio.wav"
        audio_path = str(audio_path_output if audio_path_output.exists() else audio_path_upload)
        if analysis.transcript_segments:
            # Transkript allaqachon boshqa manbadan ko'chirilgan (bog'langan
            # dublyaj job'idan, backend/api/learn_routes.py) -- audio fayl
            # UMUMAN kerak emas, chunki TRANSCRIBE bosqichi (pastda) baribir
            # o'tkazib yuboriladi. Bo'lmasa bu holatda ham qimmat/keraksiz
            # YouTube yuklab olish bajarilib qolardi.
            _record_stage(stage_timings, analysis_id, "DOWNLOAD", stage_t0, "skipped")
        elif audio_path_upload.exists() or audio_path_output.exists():
            _record_stage(stage_timings, analysis_id, "DOWNLOAD", stage_t0, "skipped")
        else:
            _update_analysis(db, analysis, AnalysisStatus.DOWNLOADING, 10.0, "YouTube'dan ma'lumot olinmoqda...")
            caption_data = None
            try:
                caption_data = downloader.extract_youtube_captions(analysis.youtube_url)
            except Exception as cap_err:
                logger.warning(f"[ANALYSIS {analysis_id}] Subtitrlarni tekshirishda xatolik: {cap_err}")

            if caption_data and caption_data.get("segments"):
                analysis.transcript_segments = caption_data["segments"]
                analysis.video_title = analysis.video_title or caption_data.get("title")
                analysis.video_duration = analysis.video_duration or caption_data.get("duration")
                if caption_data.get("language"):
                    analysis.video_language = normalize_video_language(caption_data.get("language"))
                db.commit()
                _record_stage(stage_timings, analysis_id, "DOWNLOAD", stage_t0, "skipped (captions)")
            else:
                download_result = downloader.download_audio(analysis.youtube_url, analysis_id)
                analysis.video_title = analysis.video_title or download_result["title"]
                analysis.video_duration = analysis.video_duration or download_result["duration"]
                db.commit()
                audio_path = download_result["audio_path"]
                _record_stage(stage_timings, analysis_id, "DOWNLOAD", stage_t0, "ok")

        # BOSQICH 2: Transkripsiya (mavjud transcriber.py'dan qayta foydalanish)
        # Checkpoint: transcript_segments allaqachon saqlangan bo'lsa, qimmat
        # Whisper chaqiruvi qayta bajarilmaydi.
        current_stage = "TRANSCRIBE"
        stage_t0 = time.monotonic()
        if analysis.transcript_segments:
            _record_stage(stage_timings, analysis_id, "TRANSCRIBE", stage_t0, "skipped")
        else:
            _update_analysis(db, analysis, AnalysisStatus.TRANSCRIBING, 35.0, "Nutq matnga aylantirilmoqda...")
            transcript = transcriber.transcribe_audio(audio_path, primary="gemini")
            if not transcript["segments"] or not transcriber.has_speech(transcript["segments"]):
                _record_stage(stage_timings, analysis_id, "TRANSCRIBE", stage_t0, "error", "nutq topilmadi")
                raise NoSpeechFoundError("Bu videoda nutq topilmadi.", code="NO_SPEECH_FOUND")
            analysis.transcript_segments = transcript["segments"]
            analysis.video_language = normalize_video_language(transcript.get("language"))
            db.commit()
            _record_stage(stage_timings, analysis_id, "TRANSCRIBE", stage_t0, "ok")

        # "Original" tahlil tili tanlangan bo'lsa, endi video tili ma'lum (yo hozir
        # aniqlandi, yo oldingi urinishdan saqlangan) — shu tilga hal qilamiz va
        # qayta yozamiz, shunda quiz/notes/Q&A kabi keyingi "lazy" endpointlar buni
        # qayta hal qilmasdan to'g'ridan-to'g'ri ishlatadi (video_analysis_routes.py).
        if analysis.language == "original":
            analysis.language = analysis.video_language or "en"
            db.commit()

        segments = analysis.transcript_segments

        # BOSQICH 3: Bazaviy tahlil (xulosa, asosiy fikrlar, chapterlar, 5
        # daqiqada). Checkpoint: to'rttasi ham allaqachon mavjud bo'lsa qayta
        # hisoblanmaydi. notes/quiz BU YERDA generatsiya qilinmaydi — ular
        # "lazy" (faqat foydalanuvchi so'raganda, video_analysis_routes.py
        # orqali), chunki ko'p foydalanuvchi ularni umuman so'ramasligi mumkin
        # (xarajatni nazorat qilish — bugungi sessiyaning asosiy mavzusi).
        # "5 daqiqada" esa arzon (bitta qo'shimcha LLM chaqiruvi) va Learning
        # Workspace'ning asosiy tabi bo'lgani uchun shu arzon guruhga qo'shildi
        # (backend/api/learn_routes.py orqali yaratilgan har bir tahlil buni
        # avtomatik oladi).
        current_stage = "ANALYZE"
        stage_t0 = time.monotonic()
        if analysis.summary and analysis.key_points and analysis.chapters and analysis.five_minute_summary:
            _record_stage(stage_timings, analysis_id, "ANALYZE", stage_t0, "skipped")
        else:
            _update_analysis(db, analysis, AnalysisStatus.ANALYZING, 70.0, "AI tahlil qilinmoqda...")
            analysis.summary = _service.generate_summary(segments, analysis.language)
            analysis.key_points = _service.generate_key_points(segments, analysis.language)
            analysis.chapters = _service.generate_chapters(segments, analysis.video_duration or 0.0, analysis.language)
            analysis.five_minute_summary = _service.generate_five_minute_summary(segments, analysis.video_duration or 0.0, analysis.language)
            db.commit()
            _record_stage(stage_timings, analysis_id, "ANALYZE", stage_t0, "ok")

        _update_analysis(db, analysis, AnalysisStatus.COMPLETED, 100.0, "Tahlil tayyor!")
        analysis.completed_at = datetime.utcnow()
        # 2026-08-27 audit: muvaffaqiyatli yakunlangan analiz oldingi
        # (keyinchalik muvaffaqiyatli bo'lgan) qayta urinishdan qolgan
        # eski error_code/error_message'ni ko'rsatib turishi mumkin edi --
        # funksional emas, faqat chalkashtiruvchi (masalan qo'llab-quvvatlash
        # jamoasi "COMPLETED" qatorda hali ham xato kodini ko'rgan).
        analysis.error_code = None
        analysis.error_message = None
        db.commit()

        _cleanup_analysis_dirs(analysis_id)
        _log_pipeline_summary(analysis_id, stage_timings, pipeline_start, "COMPLETED")

        return {"analysis_id": analysis_id, "status": "completed"}

    except NoSpeechFoundError as exc:
        # User xatoligi (videoda nutq yo'q) -- bu tizim nosozligi emas, adminlarga xabar yuborilmaydi!
        _, safe_message = _safe_persisted_error(exc, current_stage)
        _mark_analysis_failed(analysis_id, "NO_SPEECH_FOUND", safe_message)
        _cleanup_analysis_dirs(analysis_id)
        _log_pipeline_summary(analysis_id, stage_timings, pipeline_start, "FAILED (no speech)")
        raise exc

    except PermanentError as exc:
        try:
            if getattr(exc, "code", None) not in ("CONTENT_BLOCKED", "NO_SPEECH_FOUND"):
                from backend.services.telegram_notify import send_error_to_admins
                u = getattr(analysis, "user", None) if analysis else None
                send_error_to_admins(
                    exc,
                    context_msg=f"Analysis: {analysis_id} | Stage: {current_stage} | Type: PermanentError",
                    job_id=analysis_id,
                    user_name=getattr(u, "name", None) if u else None,
                    user_email_or_phone=(getattr(u, "phone", None) or getattr(u, "email", None)) if u else None,
                    video_title=getattr(analysis, "video_title", None) if analysis else None,
                    video_url=getattr(analysis, "youtube_url", None) if analysis else None,
                    stage=f"ANALYSIS:{current_stage}",
                )
        except Exception:
            pass

        _, safe_message = _safe_persisted_error(exc, current_stage)
        _mark_analysis_failed(analysis_id, _error_code_for(exc, current_stage), safe_message)
        _cleanup_analysis_dirs(analysis_id)
        _log_pipeline_summary(analysis_id, stage_timings, pipeline_start, "FAILED (permanent)")
        raise exc

    except Exception as exc:
        try:
            from backend.services.telegram_notify import send_error_to_admins
            u = getattr(analysis, "user", None) if analysis else None
            send_error_to_admins(
                exc,
                context_msg=f"Analysis: {analysis_id} | Stage: {current_stage} | Retry: {self.request.retries}/{self.max_retries}",
                job_id=analysis_id,
                user_name=getattr(u, "name", None) if u else None,
                user_email_or_phone=(getattr(u, "phone", None) or getattr(u, "email", None)) if u else None,
                video_title=getattr(analysis, "video_title", None) if analysis else None,
                video_url=getattr(analysis, "youtube_url", None) if analysis else None,
                stage=f"ANALYSIS:{current_stage}",
            )
        except Exception:
            pass

        error_code = _error_code_for(exc, current_stage)
        # AUTH_ERROR uchun blind retry yo'q -- tasks.py:process_video bilan
        # bir xil qoida (2026-08-26 audit, Priority 5).
        if self.request.retries < self.max_retries and error_classification.should_retry(error_code):
            countdown = min(600, 30 * (2 ** self.request.retries))
            retry_session = SessionLocal()
            try:
                analysis = retry_session.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id).first()
                if analysis:
                    analysis.status_message = "Qayta ishlanmoqda (biroz kuting)..."
                    _, analysis.error_message = _safe_persisted_error(exc, current_stage)
                    analysis.error_code = error_code
                    analysis.updated_at = datetime.utcnow()
                    retry_session.commit()
            except Exception as status_exc:
                logger.warning(f"[ANALYSIS {analysis_id}] Qayta urinish oldidan status yangilanmadi: {status_exc}")
            finally:
                retry_session.close()
            try:
                db.close()
            except Exception:
                pass
            _log_pipeline_summary(analysis_id, stage_timings, pipeline_start, f"RETRY {self.request.retries + 1}/{self.max_retries}")
            raise self.retry(exc=exc, countdown=countdown)

        _mark_analysis_failed(
            analysis_id,
            error_code,
            "Videoni tahlil qilishda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko'ring.",
        )
        logger.error(f"[{analysis_id}] ANALYZE FAILED (real error): {exc}")
        _cleanup_analysis_dirs(analysis_id)
        _log_pipeline_summary(analysis_id, stage_timings, pipeline_start, "FAILED")
        raise exc

    finally:
        if claim_token is not None:
            _release_analysis_claim_safe(analysis_id, claim_token)
        db.close()
