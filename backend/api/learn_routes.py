"""POST /api/learn — bitta so'rov bilan HAM dublyaj, HAM tahlil (Learning
Workspace uchun) boshlaydi.

Bu fayl faqat QO'SHIMCHA -- routes.py'dagi /jobs va video_analysis_routes.py
o'zgarishsiz qoladi, ularning har biri mustaqil ravishda ham ishlashda davom
etadi. /api/learn shunchaki ikkalasini bir so'rovda ketma-ket chaqiradi va
bog'laydi (DubbingJob.linked_analysis_id) -- Learning Workspace
(frontend/app/learn/[id]) shu orqali qaysi tahlilni ham poll qilishni biladi.

Xarajatni nazorat qilish uchun ikkita qoida:
1. Agar dublyaj job'i kesh-hit bo'lsa (source_job_id orqali asl, allaqachon
   TO'LIQ dublyaj qilingan job'ga ishora qiladi), o'sha asl job'ning
   transcript_segments'i to'g'ridan-to'g'ri yangi VideoAnalysis'ga
   ko'chiriladi -- shunda analyze_video_task o'zining DOWNLOAD/TRANSCRIBE
   bosqichlarini o'tkazib yuboradi (mavjud checkpoint naqshi, o'zgarishsiz).
   Yangi (kesh bo'lmagan) videolar uchun tahlil o'zining mustaqil
   yuklab olish/transkripsiya bosqichini bajaradi -- bu P0 uchun qabul
   qilingan, muhandislik qilinmagan takrorlanish (rejaga qarang).
2. Video to'lov kutayotgan bo'lsa (45 daqiqadan uzun, awaiting_payment),
   tahlil UMUMAN yaratilmaydi -- foydalanuvchi pul to'lamasdan turib bepul
   "o'quv materiallari" ololmasligi kerak. Bu holatda linked_analysis_id
   NULL bo'lib qoladi; to'lovdan keyin tahlilni avtomatik ishga tushirish
   hali ulanmagan (payment_fulfillment.py'ga tegilmaslik uchun ataylab --
   ma'lum, alohida qayd etilgan P0 bo'shlig'i, jim qoldirilmagan).
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db, DubbingJob, VideoAnalysis, AnalysisStatus, User
from backend.services.auth import get_current_user
from backend.services.job_creation import create_dubbing_job, MAX_VIDEO_DURATION_MINUTES
from backend.services.rate_limiter import rate_limit
from backend.services.video_analysis import find_cached_analysis, clone_analysis_for_user
from backend.workers.analysis_tasks import analyze_video_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["learn"])


class LearnRequest(BaseModel):
    youtube_url: str
    voice_gender: str = "auto"


def _create_linked_analysis(db: Session, user: User, youtube_url: str, dubbing_job: DubbingJob) -> VideoAnalysis:
    # Eng arzon yo'l birinchi: boshqa foydalanuvchi ALLAQACHON shu videoni
    # "uz" tilida tahlil qilgan bo'lsa (find_cached_analysis,
    # backend/services/video_analysis.py), tayyor natijadan nusxa olib
    # QAYTA HECH NARSA QILMASDAN tugatamiz -- yuklab olish/transkripsiya/LLM
    # chaqiruvi yo'q (2026-08-25, DubbingJob keshi bilan bir xil ruh).
    cached = find_cached_analysis(db, dubbing_job.youtube_video_id, "uz")
    if cached:
        analysis = clone_analysis_for_user(db, cached, user.id)
        dubbing_job.linked_analysis_id = analysis.id
        db.commit()
        return analysis

    analysis = VideoAnalysis(
        user_id=user.id,
        youtube_url=youtube_url,
        youtube_video_id=dubbing_job.youtube_video_id,
        video_title=dubbing_job.video_title,
        video_duration=dubbing_job.video_duration,
        video_thumbnail=dubbing_job.video_thumbnail,
        language="uz",
        status=AnalysisStatus.PENDING,
        progress=0.0,
        status_message="Navbatga qo'shildi",
    )

    # storage_id -- kesh-hit bo'lsa asl (to'liq dublyaj qilingan) job'ga,
    # aks holda o'zining ID'siga hal bo'ladi (backend/models/database.py).
    # Bu YUQORIDAGI VideoAnalysis keshidan farqli -- faqat transkriptni
    # (DOWNLOAD/TRANSCRIBE bosqichlarini) qayta ishlatadi, ANALYZE bosqichi
    # (4 ta LLM chaqiruvi) baribir yangidan bajariladi.
    root_job = db.query(DubbingJob).filter(DubbingJob.id == dubbing_job.storage_id).first()
    if root_job and root_job.transcript_segments:
        analysis.transcript_segments = root_job.transcript_segments
        analysis.status = AnalysisStatus.TRANSCRIBING
        analysis.status_message = "Transkript dublyajdan qayta ishlatildi"

    db.add(analysis)
    db.commit()
    db.refresh(analysis)

    dubbing_job.linked_analysis_id = analysis.id
    db.commit()

    analyze_video_task.apply_async(args=[str(analysis.id)], task_id=str(analysis.id))
    return analysis


@router.post("/learn", status_code=201, dependencies=[Depends(rate_limit("learn", 8, 600))])
async def learn_video(
    request: LearnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    # Dublyaj yaratish mantig'i o'zgarishsiz -- routes.py:create_job bilan
    # bir xil funksiya, bir xil kvota/to'lov/Safety Gate/kesh xatti-harakati.
    result = await create_dubbing_job(db, current_user, request.youtube_url, request.voice_gender)

    if result.outcome == "invalid_url":
        raise HTTPException(status_code=400, detail="Faqat YouTube URL qabul qilinadi.")
    if result.outcome == "fetch_error":
        raise HTTPException(status_code=400, detail=f"Video ma'lumotlarini olishda xatolik: {result.error_detail}")
    if result.outcome == "blocked":
        raise HTTPException(
            status_code=403,
            detail="Ushbu video GapirAI.uz kontent siyosatiga mos kelmagani sababli dublaj qilinmaydi.",
        )
    if result.outcome == "too_long":
        raise HTTPException(
            status_code=400,
            detail=f"Video juda uzun ({result.duration_minutes:.0f} daqiqa). Maksimal ruxsat etilgan davomiylik — {MAX_VIDEO_DURATION_MINUTES} daqiqa.",
        )
    if result.outcome == "insufficient_minutes":
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_minutes",
                "message": f"Bu video uchun {result.minutes_short} daqiqa yetishmayapti. Qo'shimcha daqiqa sotib oling.",
                "minutes_short": result.minutes_short,
                "video_minutes": round(result.duration_minutes or 0, 1),
            },
        )

    dubbing_job = db.query(DubbingJob).filter(DubbingJob.id == result.job_id).first()
    if not dubbing_job:
        raise HTTPException(status_code=500, detail="Job yaratishda kutilmagan xatolik.")

    analysis = _create_linked_analysis(db, current_user, request.youtube_url, dubbing_job)
    analysis_id = str(analysis.id)

    status = {"queued": "pending", "ready": "completed"}.get(result.outcome, "pending")

    return {
        "dubbing_job_id": str(dubbing_job.id),
        "analysis_id": analysis_id,
        "status": status,
        "amount": result.amount,
    }
