import asyncio
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db, VideoAnalysis, AnalysisStatus, User, DubbingJob
from backend.services.downloader import get_video_info
import uuid
from backend.services.auth import get_current_user, get_optional_user_id
from backend.services.video_analysis import VideoAnalysisService, find_cached_analysis, clone_analysis_for_user
from backend.services.job_creation import extract_youtube_video_id
from backend.services.rate_limiter import rate_limit
from backend.workers.analysis_tasks import analyze_video_task
from backend.api.routes import _is_valid_youtube_url, MAX_VIDEO_DURATION_MINUTES
from backend.services.timezone_utils import to_tashkent_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/video-analysis", tags=["video-analysis"])
_service = VideoAnalysisService()

# Foydalanuvchi tanlashi mumkin bo'lgan tahlil tillari + "original" — bu holda
# tahlil tili transkripsiyadan keyin aniqlangan video tiliga hal qilinadi
# (backend/workers/analysis_tasks.py). Video o'zi qaysi tilda bo'lishidan
# qat'iy nazar, transkript doim original tilda qoladi — faqat tahlil
# (summary/key_points/chapters/notes/quiz) shu tanlangan tilda chiqadi.
ALLOWED_ANALYSIS_LANGUAGES = {"uz", "en", "ru", "tr", "kk", "original"}


class CreateAnalysisRequest(BaseModel):
    youtube_url: Optional[str] = None
    job_id: Optional[str] = None
    language: str = "uz"


class QuestionRequest(BaseModel):
    question: str


def _get_owned_analysis(analysis_id: str, db: Session, current_user: User) -> VideoAnalysis:
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Tahlil topilmadi.")
    if analysis.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Bu tahlilga kirish huquqingiz yo'q.")
    return analysis


def _get_accessible_analysis(
    analysis_id: str,
    db: Session,
    current_user_id: Optional[uuid.UUID] = None,
) -> VideoAnalysis:
    """Tahlilni ko'rish/o'qish huquqini tekshirish.
    - Agar tahlil tugallangan (COMPLETED) bo'lsa -> har qanday foydalanuvchi
      (shu jumladan anonim / Telegram / iPhone orqali havola ochgan mehmonlar) ko'ra oladi.
    - Agar jarayonda yoki xato bo'lsa -> egasi (authenticated) ko'ra oladi.
    - Anonim yoki boshqa foydalanuvchi bo'lsa:
      - Anonim -> 401 ("Ushbu tahlilni ko'rish uchun tizimga kiring.")
      - Boshqa foydalanuvchi -> 403 ("Bu tahlilga kirish huquqingiz yo'q.")
    """
    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Tahlil topilmadi.")

    if analysis.status == AnalysisStatus.COMPLETED:
        return analysis

    is_owner = current_user_id is not None and analysis.user_id == current_user_id
    if is_owner:
        return analysis

    if not current_user_id:
        raise HTTPException(status_code=401, detail="Ushbu tahlilni ko'rish uchun tizimga kiring.")
    raise HTTPException(status_code=403, detail="Bu tahlilga kirish huquqingiz yo'q.")


def _analysis_to_dict(analysis: VideoAnalysis) -> dict:
    raw_status = analysis.status.value if hasattr(analysis.status, "value") else analysis.status
    video_url = None
    if analysis.youtube_url and analysis.youtube_url.startswith("upload://"):
        raw_jid = analysis.youtube_url.replace("upload://", "").strip()
        video_url = f"/outputs/{raw_jid}/video/dubbed_final.mp4"

    return {
        "id": str(analysis.id),
        "status": str(raw_status).lower() if raw_status else "pending",
        "progress": analysis.progress or 0.0,
        "status_message": analysis.status_message,
        "youtube_url": analysis.youtube_url,
        "video_url": video_url,
        "video_title": analysis.video_title,
        "video_duration": analysis.video_duration,
        "video_thumbnail": analysis.video_thumbnail,
        "language": analysis.language,
        "video_language": analysis.video_language,
        "summary": analysis.summary,
        "key_points": analysis.key_points,
        "chapters": analysis.chapters,
        "five_minute_summary": analysis.five_minute_summary,
        "notes": analysis.notes,
        "quiz": analysis.quiz,
        "qa_history": analysis.qa_history or [],
        "gemini_key_tier": getattr(analysis, "gemini_key_tier", None),
        "gemini_key_used": getattr(analysis, "gemini_key_used", None),
        "error_message": analysis.error_message,
        "error_code": analysis.error_code,
        "created_at": to_tashkent_iso(analysis.created_at),
    }


@router.get("")
def list_user_analyses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Foydalanuvchining barcha video tahlillarini ro'yxati (yangi yaratilganlari birinchi)."""
    analyses = (
        db.query(VideoAnalysis)
        .filter(VideoAnalysis.user_id == current_user.id)
        .order_by(VideoAnalysis.created_at.desc())
        .all()
    )
    return [_analysis_to_dict(a) for a in analyses]


@router.delete("/{analysis_id}")
def delete_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Foydalanuvchining video tahlilini o'chirish."""
    analysis = _get_owned_analysis(analysis_id, db, current_user)
    db.delete(analysis)
    db.commit()
    return {"success": True}


@router.post("", status_code=201, dependencies=[Depends(rate_limit("video_analysis_create", 8, 600))])
async def create_analysis(
    request: CreateAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if request.language not in ALLOWED_ANALYSIS_LANGUAGES:
        raise HTTPException(status_code=400, detail="Noto'g'ri tahlil tili.")

    # 1. Agar job_id ko'rsatilgan bo'lsa yoki youtube_url upload:// bilan boshlansa -> mavjud DubbingJob dan tahlil
    target_job = None
    if request.job_id:
        try:
            target_job = db.query(DubbingJob).filter(DubbingJob.id == request.job_id).first()
        except Exception:
            pass
    elif request.youtube_url and request.youtube_url.startswith("upload://"):
        raw_jid = request.youtube_url.replace("upload://", "").strip()
        try:
            target_job = db.query(DubbingJob).filter(DubbingJob.id == raw_jid).first()
        except Exception:
            pass

    if target_job:
        # Allaqachon tahlil yaratilgan bo'lsa
        if target_job.linked_analysis_id:
            existing = db.query(VideoAnalysis).filter(VideoAnalysis.id == target_job.linked_analysis_id).first()
            if existing:
                raw_st = existing.status.value if hasattr(existing.status, "value") else str(existing.status).lower()
                return {"analysis_id": str(existing.id), "status": raw_st}

        root_job = db.query(DubbingJob).filter(DubbingJob.id == target_job.storage_id).first() if target_job.storage_id else target_job
        segments = (root_job.transcript_segments if root_job else None) or target_job.transcript_segments

        is_user_paid = (
            getattr(current_user, "is_admin", False)
            or getattr(current_user, "current_plan", "free") != "free"
            or bool(getattr(target_job, "quota_consumed", False))
        )

        analysis = VideoAnalysis(
            user_id=current_user.id,
            youtube_url=target_job.youtube_url or f"upload://{target_job.id}",
            youtube_video_id=target_job.youtube_video_id,
            video_title=target_job.video_title or "Yuklangan video",
            video_duration=target_job.video_duration,
            video_thumbnail=target_job.video_thumbnail,
            language=request.language,
            status=AnalysisStatus.TRANSCRIBING if segments else AnalysisStatus.PENDING,
            progress=25.0 if segments else 0.0,
            status_message="Transkript dublyajdan qayta ishlatildi" if segments else "Navbatga qo'shildi",
            transcript_segments=segments,
            gemini_key_tier="paid" if is_user_paid else "free",
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        target_job.linked_analysis_id = analysis.id
        db.commit()

        analyze_video_task.apply_async(args=[str(analysis.id)], task_id=str(analysis.id))
        return {"analysis_id": str(analysis.id), "status": "pending"}

    # 2. Aks holda YouTube URL talab qilinadi
    if not request.youtube_url or not _is_valid_youtube_url(request.youtube_url):
        raise HTTPException(status_code=400, detail="Faqat YouTube URL yoki yuklangan video qabul qilinadi.")

    try:
        # Thread'da ishga tushiriladi — get_video_info bloklovchi (yt-dlp
        # tarmoq so'rovlari + bot-check qayta urinishlarida time.sleep),
        # to'g'ridan-to'g'ri await qilinsa butun asyncio event loop'ni to'sib
        # qo'yadi (backend/api/routes.py'da xuddi shu sababdan tuzatilgan).
        info = await asyncio.to_thread(get_video_info, request.youtube_url)
    except Exception as e:
        logger.exception(f"video_info xato (tahlil): {request.youtube_url}")
        raise HTTPException(status_code=400, detail="Video ma'lumotlarini olib bo'lmadi. Havola to'g'riligini tekshiring yoki birozdan so'ng qaytadan urinib ko'ring.")

    duration_minutes = info.get("duration", 0) / 60.0
    if duration_minutes > MAX_VIDEO_DURATION_MINUTES:
        raise HTTPException(
            status_code=400,
            detail=f"Video juda uzun ({duration_minutes:.0f} daqiqa). Maksimal ruxsat etilgan davomiylik — {MAX_VIDEO_DURATION_MINUTES} daqiqa.",
        )

    # Boshqa foydalanuvchi ALLAQACHON shu videoni shu tilda tahlil qilgan bo'lsa
    video_id = extract_youtube_video_id(request.youtube_url)
    cached = find_cached_analysis(db, video_id, request.language)
    if cached:
        analysis = clone_analysis_for_user(db, cached, current_user.id)
        return {"analysis_id": str(analysis.id), "status": "completed"}

    is_user_paid = (
        getattr(current_user, "is_admin", False)
        or getattr(current_user, "current_plan", "free") != "free"
    )

    analysis = VideoAnalysis(
        user_id=current_user.id,
        youtube_url=request.youtube_url,
        youtube_video_id=video_id,
        video_title=info.get("title"),
        video_duration=info.get("duration"),
        video_thumbnail=info.get("thumbnail"),
        language=request.language,
        status=AnalysisStatus.PENDING,
        progress=0.0,
        status_message="Navbatga qo'shildi",
        gemini_key_tier="paid" if is_user_paid else "free",
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    analyze_video_task.apply_async(args=[str(analysis.id)], task_id=str(analysis.id))

    return {"analysis_id": str(analysis.id), "status": "pending"}


@router.get("/{analysis_id}")
def get_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    return _analysis_to_dict(analysis)


@router.post("/{analysis_id}/retry", dependencies=[Depends(rate_limit("video_analysis_retry", 8, 600))])
def retry_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Xatolik yuz bergan (failed) tahlilni qayta ishga tushirish (retry)."""
    analysis = _get_owned_analysis(analysis_id, db, current_user)
    if analysis.status != AnalysisStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail="Faqat xatolik yuz bergan tahlillarni qayta ishga tushirish mumkin.",
        )

    analysis.status = AnalysisStatus.PENDING
    analysis.progress = 0.0
    analysis.status_message = "Qayta navbatga qo'shildi..."
    analysis.error_message = None
    analysis.error_code = None
    analysis.updated_at = datetime.utcnow()
    db.commit()

    analyze_video_task.apply_async(args=[str(analysis.id)], task_id=str(analysis.id))

    return {"analysis_id": str(analysis.id), "status": "pending"}


@router.post("/{analysis_id}/cancel")
def cancel_analysis(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Jarayondagi yoki navbatdagi tahlilni to'xtatish va bekor qilish."""
    analysis = _get_owned_analysis(analysis_id, db, current_user)
    if analysis.status == AnalysisStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Tugallangan tahlilni bekor qilib bo'lmaydi.",
        )

    try:
        from backend.celery_app import celery_app
        celery_app.control.revoke(str(analysis.id), terminate=True, signal="SIGTERM")
    except Exception as e:
        logger.warning(f"Celery task revoke error for {analysis.id}: {e}")

    analysis.status = AnalysisStatus.FAILED
    analysis.status_message = "Foydalanuvchi tomonidan bekor qilindi"
    analysis.error_message = "Tahlil foydalanuvchi tomonidan bekor qilindi."
    analysis.error_code = "CANCELLED"
    analysis.processing_claim_token = None
    analysis.processing_lease_expires_at = None
    analysis.updated_at = datetime.utcnow()
    db.commit()

    return {"analysis_id": str(analysis.id), "status": "failed", "message": "Tahlil muvaffaqiyatli bekor qilindi"}


@router.get("/{analysis_id}/transcript")
def get_transcript(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    return {"segments": analysis.transcript_segments or []}


@router.get("/{analysis_id}/chapters")
def get_chapters(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    return {"chapters": analysis.chapters or []}


def _is_paid_user(db: Session, user_id: Optional[uuid.UUID]) -> bool:
    from backend.services.plans import is_user_paid_tier
    return is_user_paid_tier(db, user_id)


@router.post("/{analysis_id}/question", dependencies=[Depends(rate_limit("video_analysis_question", 20, 600))])
def ask_question(
    analysis_id: str,
    request: QuestionRequest,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    if analysis.status != AnalysisStatus.COMPLETED or not analysis.transcript_segments:
        raise HTTPException(status_code=400, detail="Tahlil hali tayyor emas.")
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Savol bo'sh bo'lishi mumkin emas.")

    is_paid = _is_paid_user(db, current_user_id)
    qa_history = analysis.qa_history or []
    result = _service.answer_question(
        analysis.transcript_segments, request.question.strip(), qa_history, is_paid=is_paid
    )
    entry = {
        "question": request.question.strip(),
        "answer": result["answer"],
        "timestamps": result["timestamps"],
        "asked_at": to_tashkent_iso(datetime.utcnow()),
    }
    analysis.qa_history = qa_history + [entry]
    db.commit()
    return entry


@router.post("/{analysis_id}/quiz")
def get_or_generate_quiz(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    if analysis.status != AnalysisStatus.COMPLETED or not analysis.transcript_segments:
        raise HTTPException(status_code=400, detail="Tahlil hali tayyor emas.")
    if not analysis.quiz:
        is_paid = _is_paid_user(db, current_user_id)
        analysis.quiz = _service.generate_quiz(analysis.transcript_segments, analysis.language, is_paid=is_paid)
        db.commit()
    return {"quiz": analysis.quiz}


@router.post("/{analysis_id}/bilingual")
def get_or_generate_bilingual(
    analysis_id: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    if analysis.status != AnalysisStatus.COMPLETED or not analysis.transcript_segments:
        raise HTTPException(status_code=400, detail="Tahlil hali tayyor emas.")
    if not analysis.bilingual_segments:
        if analysis.video_language and analysis.video_language == analysis.language:
            # Tahlil tili video tili bilan bir xil — tarjima ma'nosiz, LLM
            # chaqiruvisiz original matnni ikkalasi sifatida qaytaramiz.
            analysis.bilingual_segments = [
                {"start": s.get("start", 0.0), "end": s.get("end", 0.0), "original": s.get("text", ""), "translated": s.get("text", "")}
                for s in analysis.transcript_segments
            ]
        else:
            is_paid = _is_paid_user(db, current_user_id)
            analysis.bilingual_segments = _service.generate_bilingual_segments(analysis.transcript_segments, analysis.language, is_paid=is_paid)
        db.commit()
    return {"segments": analysis.bilingual_segments}


@router.post("/{analysis_id}/notes")
def get_or_generate_notes(
    analysis_id: str,
    force: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    if analysis.status != AnalysisStatus.COMPLETED or not analysis.transcript_segments:
        raise HTTPException(status_code=400, detail="Tahlil hali tayyor emas.")
    if not analysis.notes or force:
        is_paid = _is_paid_user(db, current_user_id)
        analysis.notes = _service.generate_notes(analysis.transcript_segments, analysis.language, is_paid=is_paid)
        db.commit()
    return {"notes": analysis.notes}


@router.get("/{analysis_id}/search")
def search_transcript(
    analysis_id: str,
    q: str,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> dict:
    analysis = _get_accessible_analysis(analysis_id, db, current_user_id)
    query = q.strip().lower()
    if not query:
        return {"results": []}
    results = [
        seg for seg in (analysis.transcript_segments or [])
        if query in (seg.get("text") or "").lower()
    ]
    return {"results": results}
