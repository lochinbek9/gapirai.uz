import asyncio
import logging
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, Body
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response, RedirectResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer
from pathlib import Path
from typing import Optional, Dict, Any

from backend.models.database import get_db, SessionLocal, DubbingJob, JobStatus, User, ResolutionVariant, VideoAnalysis
from backend.services.auth import get_current_user, get_optional_user, get_optional_user_id
from backend.services.downloader import get_video_info
from backend.config import get_settings
from backend.services.rate_limiter import rate_limit
# Job yaratish mantig'i (video ma'lumot olish, Safety Gate, davomiylik
# chegarasi, kvota) shu yerda -- Telegram bot ham xuddi shu funksiyani
# chaqiradi, ikki joyda saqlanmaydi.
from backend.services.job_creation import (
    MAX_VIDEO_DURATION_MINUTES,
    is_valid_youtube_url as _is_valid_youtube_url,
    create_dubbing_job,
    create_job_from_local_video_file_sync,
    precheck_local_upload,
    queue_rejection_message,
    JobCreationResult,
)
from backend.services import subtitle_export, subtitle_cues
from backend.services.timezone_utils import to_tashkent_iso, format_tashkent, now_tashkent

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dubbing"])


class CreateJobRequest(BaseModel):
    youtube_url: str
    target_language: str = "uz"
    voice_gender: str = "auto"   # auto / male / female
    # 2026-09-16: "Subtitr" rejimi -- dublyaj audiosi/videosi yaratilmaydi,
    # faqat transkripsiya+tarjima+VTT/SRT (backend/services/job_creation.py).
    subtitle_only: bool = False
    # "auto" -- chet tildagi video (o'zbekchaga tarjima qilinadi, eski xatti-harakat);
    # "uz" -- video o'zbekcha nutqli: o'zbekcha STT, TARJIMASIZ (faqat subtitr rejimida).
    source_language: str = "auto"
    tts_provider: Optional[str] = None   # azure / edge / gemini (faqat Pro va Admin tanlay oladi)
    voice_name: Optional[str] = None
    voice_style: Optional[str] = None
    force_new: Optional[bool] = False
    is_preview: Optional[bool] = False


class RegenerateJobRequest(BaseModel):
    voice_name: Optional[str] = None
    speaker_gender: Optional[str] = None
    tts_provider: Optional[str] = None
    gemini_key_tier: Optional[str] = None
    force_regenerate: Optional[bool] = None
    stt_provider: Optional[str] = None
    translation_model: Optional[str] = None
    reuse_transcript: Optional[bool] = None
    reuse_translation: Optional[bool] = None


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
    youtube_url: Optional[str] = None
    video_title: Optional[str] = None
    channel_name: Optional[str] = None
    video_duration: Optional[float] = None
    video_thumbnail: Optional[str] = None
    output_video_url: Optional[str] = None
    transcript_text: Optional[str] = None
    translated_text: Optional[str] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    speaker_gender: Optional[str] = None
    voice_gender_setting: Optional[str] = None
    uzbek_srt_content: Optional[str] = None
    expected_end_time: Optional[str] = None
    rating: Optional[int] = None
    feedback_comment: Optional[str] = None
    feedback_voice_ok: Optional[bool] = None
    feedback_translation_ok: Optional[bool] = None
    feedback_speed_ok: Optional[bool] = None
    content_flagged: Optional[bool] = None
    fallback_available: bool = False
    fallback_reason: Optional[str] = None
    linked_analysis_id: Optional[str] = None
    subtitle_only: bool = False
    source_language: Optional[str] = None
    tts_provider: Optional[str] = None
    voice_name: Optional[str] = None
    voice_style: Optional[str] = None
    stt_model: Optional[str] = None
    translation_model: Optional[str] = None
    tts_model: Optional[str] = None
    # Faqat kutayotgan (PENDING) job egasiga, va navbat worker o'rinlaridan
    # uzunroq bo'lgandagina to'ldiriladi (backend/services/queue_load.py).
    queue_position: Optional[int] = None
    queue_eta_minutes: Optional[int] = None
    is_preview: bool = False
    audio_mix_mode: Optional[str] = None
    costs: Optional[Dict[str, Any]] = None
    user_info: Optional[Dict[str, Any]] = None
    discount_offer: Optional[Dict[str, Any]] = None
    can_refund_on_cancel: Optional[bool] = None
    cancel_refund_seconds_left: Optional[float] = None
    initial_stage: Optional[str] = None
    current_stage: Optional[str] = None


def _normalize_audio_mix_mode(mode: str | None) -> str:
    """Validate and normalize audio mix mode to supported options."""
    if mode in ("dubbed_only", "ducked_mix"):
        return mode
    return "dubbed_only"


# YouTube yuklab olish DOWNLOAD bosqichida muvaffaqiyatsiz bo'lgan (video
# hech qachon serverga tushmagan) job'lar uchun -- foydalanuvchi videoni
# to'g'ridan-to'g'ri yuklashi mumkinligini bildiradi (POST
# /jobs/{id}/upload-video). Aniqlanishi _job_to_response'da: shunchaki
# original_video_path bo'sh-ligi (boshqa bosqichda muvaffaqiyatsiz bo'lgan
# job uchun video allaqachon bor, qayta yuklash befoyda).


_JOB_RESPONSE_DEFERRED = (
    defer(DubbingJob.srt_content),
    defer(DubbingJob.transcript_segments),
    defer(DubbingJob.translated_segments),
    defer(DubbingJob.speech_segments),
    defer(DubbingJob.segment_qa),
)


def _job_to_response(job: DubbingJob, redact: bool = False) -> JobResponse:
    # redact=True -- job egasi BO'LMAGAN (anonim) so'rovchi uchun. Faqat
    # tugallangan job'ning ulashsa bo'ladigan qismi qaytariladi: video,
    # subtitr, sarlavha. Egasining shaxsiy ma'lumoti (ichki xato matni,
    # transkript, baho/fikr) YASHIRILADI -- get_job() shu bayroqni beradi.
    raw_status = job.status.value if hasattr(job.status, "value") else job.status
    status_str = str(raw_status).lower() if raw_status else "pending"


    # Jonli (bosqich ichidagi) progress -- DubbingJob.progress qo'pol sakraydi
    # (5/20/40/60/85), shuning uchun uzun videoda bar daqiqalab qotib turadi.
    # DOWNLOADING / SYNTHESIZING bosqichlarida worker Redis'ga oraliq foizni
    # yozib boradi (backend/services/job_progress.py) -- shuni aralashtiramiz,
    # keyingi bosqich chegarasidan oshirmasdan.
    live_progress = job.progress or 0.0
    if status_str in ("downloading", "synthesizing"):
        from backend.services.job_progress import get_subprogress
        sub = get_subprogress(str(job.id))
        if sub is not None:
            ceiling = 19.0 if status_str == "downloading" else 83.0
            live_progress = max(live_progress, min(sub, ceiling))

    expected_end_time = None
    if status_str not in ("completed", "failed", "awaiting_payment", "pending") and live_progress > 0:
        duration = float(job.video_duration or 300.0)
        remaining_factor = max(0.1, (100.0 - live_progress) / 100.0)
        # Taxminiy qolgan vaqt to'g'ridan-to'g'ri joriy vaqtdan (now) hisoblanadi,
        # shunda navbatda kutgan vaqt hisob-kitobni buzib 0 soniya/noto'g'ri ko'rsatmaydi.
        base_dur = 25.0 + 0.40 * duration
        if status_str in ("synthesizing", "merging"):
            base_dur = max(base_dur, 35.0 + 0.35 * duration)
        est_remaining_seconds = max(15.0, base_dur * remaining_factor)
        expected_dt = datetime.utcnow() + timedelta(seconds=est_remaining_seconds)
        expected_end_time = to_tashkent_iso(expected_dt)

    channel_name = getattr(job, "channel_name", None)
    if not channel_name and job.youtube_url:
        try:
            import redis
            import re
            m = re.search(r"(?:youtu\.be/|v=|/shorts/|/embed/)([A-Za-z0-9_-]{11})", job.youtube_url)
            if m:
                r_cli = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
                channel_name = r_cli.get(f"yt:chan:{m.group(1)}")
        except Exception:
            channel_name = None

    # Real Xarajat (Tannarx) hisoblash (Admin va xarajat monitoringi uchun)
    dur_sec = float(job.video_duration or 0.0)
    dur_min = dur_sec / 60.0
    stt_model_val = getattr(job, "stt_model", None) or ""
    gem_tier = getattr(job, "gemini_key_tier", None)
    is_groq = "groq" in stt_model_val.lower() or (getattr(job, "gemini_key_used", None) or "").startswith("groq:")
    if gem_tier == "paid" and "gemini" in stt_model_val.lower() and not is_groq and dur_sec > 0:
        stt_cost_usd = round(dur_min * 0.002, 4)
    else:
        stt_cost_usd = 0.0

    chars = len(job.translated_text) if getattr(job, "translated_text", None) else int(dur_min * 1200)
    llm_cost_usd = round((chars / 1000.0) * 0.0005, 4) if (dur_sec > 0 or chars > 0) else 0.0

    # Real TTS tannarxi provayderga qarab (Edge: bepul $0.00, Azure: $0.016, Gemini: $0.017)
    tts_prov = (job.tts_provider or ("edge" if "edge" in (job.tts_model or "").lower() else ("azure" if "azure" in (job.tts_model or "").lower() else "gemini"))).lower()
    est_chars = chars if chars > 0 else int(dur_min * 1200)
    if tts_prov == "edge":
        tts_cost_usd = 0.0
    elif tts_prov == "azure":
        tts_cost_usd = round((est_chars / 1000.0) * 0.016, 4) if (dur_sec > 0 or est_chars > 0) else 0.0
    else:
        tts_cost_usd = round((est_chars / 1000.0) * 0.017, 4) if (dur_sec > 0 or est_chars > 0) else 0.0

    total_cost_usd = round(stt_cost_usd + llm_cost_usd + tts_cost_usd, 4)
    total_cost_uzs = int(round(total_cost_usd * 12850))
    cost_per_minute_uzs = int(round(total_cost_uzs / dur_min)) if dur_min > 0 else 0

    costs = {
        "stt_cost_usd": stt_cost_usd,
        "llm_cost_usd": llm_cost_usd,
        "tts_cost_usd": tts_cost_usd,
        "total_cost_usd": total_cost_usd,
        "total_cost_uzs": total_cost_uzs,
        "cost_per_minute_uzs": cost_per_minute_uzs,
    }

    can_ref_cancel = None
    ref_sec_left = None
    init_stage = None
    curr_stage = None
    if raw_status in (
        JobStatus.PENDING,
        JobStatus.AWAITING_PAYMENT,
        JobStatus.DOWNLOADING,
        JobStatus.TRANSCRIBING,
        JobStatus.TRANSLATING,
        JobStatus.SYNTHESIZING,
        JobStatus.SYNCING,
        JobStatus.MERGING,
    ):
        try:
            from backend.services.cancel_policy import check_cancel_refund_eligibility
            can_ref_cancel, ref_sec_left, _, init_stage, curr_stage = check_cancel_refund_eligibility(
                str(job.id),
                raw_status.value if hasattr(raw_status, "value") else str(raw_status),
                job.created_at,
            )
        except Exception:
            pass

    return JobResponse(
        job_id=str(job.id),
        status=status_str,
        progress=round(live_progress, 1),
        status_message=job.status_message,
        youtube_url=job.youtube_url,
        video_title=job.video_title,
        channel_name=channel_name,
        video_duration=job.video_duration,
        video_thumbnail=job.video_thumbnail,
        output_video_url=job.output_video_url or (
            f"/outputs/{job.storage_id}/video/dubbed_final.mp4"
            if job.status == JobStatus.COMPLETED
            else None
        ),
        transcript_text=None if redact else job.transcript_text,
        translated_text=job.translated_text,
        error_message=None if redact else job.error_message,
        error_code=None if redact else job.error_code,
        created_at=to_tashkent_iso(job.created_at) if job.created_at else None,
        updated_at=to_tashkent_iso(job.updated_at) if getattr(job, "updated_at", None) else None,
        speaker_gender=job.speaker_gender,
        voice_gender_setting=job.voice_gender_setting,
        uzbek_srt_content=job.uzbek_srt_content,
        expected_end_time=expected_end_time,
        rating=None if redact else job.rating,
        feedback_comment=None if redact else job.feedback_comment,
        feedback_voice_ok=None if redact else job.feedback_voice_ok,
        feedback_translation_ok=None if redact else job.feedback_translation_ok,
        feedback_speed_ok=None if redact else job.feedback_speed_ok,
        content_flagged=getattr(job, "content_flagged", False),
        linked_analysis_id=str(job.linked_analysis_id) if getattr(job, "linked_analysis_id", None) else None,
        subtitle_only=bool(getattr(job, "subtitle_only", False)),
        source_language=getattr(job, "source_language", None),
        tts_provider=getattr(job, "tts_provider", None),
        voice_name=getattr(job, "voice_name", None),
        voice_style=getattr(job, "voice_style", None),
        stt_model=getattr(job, "stt_model", None),
        translation_model=getattr(job, "translation_model", None),
        tts_model=getattr(job, "tts_model", None) or (
            f"gemini-3.8-flash-tts ({getattr(job, 'voice_name', None) or 'Charon'})" if getattr(job, "tts_provider", None) == 'gemini'
            else (f"edge-tts ({getattr(job, 'voice_name', None) or 'uz-UZ-SardorNeural'})" if getattr(job, "tts_provider", None) == 'edge'
            else (f"azure-neural ({getattr(job, 'voice_name', None) or 'uz-UZ-SardorNeural'})" if (getattr(job, "tts_provider", None) == 'azure' or (getattr(job, "voice_name", None) and 'Neural' in str(job.voice_name)))
            else None))
        ),
        fallback_available=status_str == "failed" and not job.original_video_path,
        fallback_reason="YOUTUBE_DOWNLOAD_FAILED" if status_str == "failed" and not job.original_video_path else None,
        is_preview=bool(getattr(job, "is_preview", False)),
        audio_mix_mode=_normalize_audio_mix_mode(getattr(job, "audio_mix_mode", None) or getattr(settings, "AUDIO_MIX_MODE", "dubbed_only")),
        costs=costs,
        can_refund_on_cancel=can_ref_cancel,
        cancel_refund_seconds_left=ref_sec_left,
        initial_stage=init_stage,
        current_stage=curr_stage,
    )



@router.get("/video-info", dependencies=[Depends(rate_limit("video_info", 20, 600))])
async def video_info(url: str) -> VideoInfoResponse:
    try:
        # get_video_info bloklovchi (yt-dlp tarmoq so'rovlari + bot-check
        # qayta urinishlarida time.sleep) — thread'ga chiqarilmasa, butun
        # asyncio event loop'ni to'sib qo'yadi va HATTO /health kabi
        # bog'liqsiz so'rovlar ham javob bermay qoladi (2026-08-13
        # productionda haqiqiy uzilish orqali tasdiqlangan).
        info = await asyncio.to_thread(get_video_info, url)
        return VideoInfoResponse(**info)
    except Exception as e:
        # Xom kutubxona xatosini (yt-dlp/YouTube API) foydalanuvchiga
        # ko'rsatmaymiz -- faqat serverda log qilamiz.
        logger.exception(f"video_info xato: {url}")
        raise HTTPException(status_code=400, detail="Video ma'lumotlarini olib bo'lmadi. Havola to'g'riligini tekshiring yoki birozdan so'ng qaytadan urinib ko'ring.")


def _normalize_source_language(value: Optional[str], subtitle_only: bool) -> Optional[str]:
    """Video tili: "auto"/bo'sh -> None (eski xatti-harakat), "uz" -> "uz". "uz" faqat subtitr rejimida
    ma'noga ega (o'zbekcha nutqni o'zbekchaga "dublyaj" qilish ma'nosiz) -- aks holda 400."""
    value = (value or "auto").strip().lower()
    if value == "auto":
        return None
    if value != "uz":
        raise HTTPException(status_code=400, detail="Video tili noto'g'ri: faqat 'auto' yoki 'uz'.")
    if not subtitle_only:
        raise HTTPException(status_code=400, detail="O'zbekcha manba faqat subtitr rejimida qo'llanadi.")
    return "uz"


def _raise_for_outcome(result: JobCreationResult) -> None:
    """Job yaratish natijasidagi rad holatlarini HTTP xatosiga aylantiradi
    (queued/ready -- xato emas, hech narsa qilmaydi). POST /jobs (YouTube) va
    POST /jobs/upload (fayl) bir xil matn/kodlar bilan javob berishi uchun
    bitta joyda."""
    if result.outcome == "invalid_url":
        raise HTTPException(status_code=400, detail="Faqat YouTube URL qabul qilinadi.")
    if result.outcome == "fetch_error":
        raise HTTPException(status_code=400, detail=f"Video ma'lumotlarini olishda xatolik: {result.error_detail}")
    if result.outcome == "bad_file":
        raise HTTPException(
            status_code=400,
            detail="Video faylini o'qib bo'lmadi — fayl buzilgan yoki qo'llab-quvvatlanmaydigan bo'lishi mumkin.",
        )
    if result.outcome == "blocked":
        detail = result.error_detail or "Ushbu video GapirAI.uz kontent siyosatiga mos kelmagani sababli dublaj qilinmaydi."
        raise HTTPException(
            status_code=403,
            detail=detail,
        )
    if result.outcome == "music_copyright":
        raise HTTPException(
            status_code=400,
            detail=result.error_detail or "Mualliflik huquqi bilan himoyalangan qo'shiq va musiqiy videolarni dublyaj qilib bo'lmaydi."
        )
    if result.outcome == "too_long":
        raise HTTPException(
            status_code=400,
            detail=f"Video juda uzun ({result.duration_minutes:.0f} daqiqa). Maksimal ruxsat etilgan davomiylik — {MAX_VIDEO_DURATION_MINUTES} daqiqa.",
        )
    if result.outcome == "insufficient_minutes":
        # Daqiqa yetmadi -- frontend "Buy additional minutes" CTA'sini ko'rsatadi.
        # minutes_short=None -- fayl yuklashdan OLDINGI tekshiruv (davomiylik
        # hali noma'lum): daqiqa qoldig'ining o'zi tugagan.
        if result.minutes_short is None:
            message = "Daqiqangiz qolmagan. Qo'shimcha daqiqa sotib oling yoki tarifni yangilang."
        else:
            message = f"Bu video uchun {result.minutes_short} daqiqa yetishmayapti. Qo'shimcha daqiqa sotib oling."
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_minutes",
                "message": message,
                "minutes_short": result.minutes_short,
                "video_minutes": round(result.duration_minutes or 0, 1),
            },
        )
    if result.outcome == "daily_limit":
        raise HTTPException(
            status_code=429,
            detail=f"Kunlik dublyaj chegarasiga yetdingiz (24 soatda {result.daily_limit} ta). "
            "Ertaga qaytadan urinib ko'ring.",
        )
    if result.outcome == "active_limit":
        raise HTTPException(status_code=429, detail=queue_rejection_message(result))
    if result.outcome == "queue_full":
        raise HTTPException(
            status_code=503, detail=queue_rejection_message(result), headers={"Retry-After": "300"},
        )


@router.post("/jobs", status_code=201, dependencies=[Depends(rate_limit("create_job", 8, 600))])
async def create_job(
    request: CreateJobRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    # Yaratish mantig'i backend/services/job_creation.py'da -- Telegram bot
    # ham xuddi shu funksiyani chaqiradi, ikki joyda saqlanmaydi.
    source_language = _normalize_source_language(request.source_language, request.subtitle_only)
    result = await create_dubbing_job(
        db, current_user, request.youtube_url, request.voice_gender, subtitle_only=request.subtitle_only,
        source_language=source_language,
        tts_provider=request.tts_provider,
        voice_name=request.voice_name,
        voice_style=request.voice_style,
        force_new=bool(request.force_new),
        is_preview=bool(request.is_preview),
    )

    _raise_for_outcome(result)
    if result.outcome == "queued":
        return {"job_id": result.job_id, "status": "pending"}
    if result.outcome == "ready":
        # Kesh-hit, kvota bilan qoplangan -- darhol tayyor (job DB'da
        # allaqachon COMPLETED, backend/services/job_creation.py).
        return {"job_id": result.job_id, "status": "completed"}

    raise HTTPException(status_code=500, detail="Kutilmagan holat.")


# Yuklangan videoning ruxsat etilgan turlari: mavjud upload_video_fallback bilan
# BIR XIL (_ALLOWED_UPLOAD_CONTENT_TYPES / _CONTENT_TYPE_TO_EXT pastda e'lon qilingan).
_UPLOAD_WRITE_BUFFER = 1024 * 1024  # diskka 1 MB'lab yozamiz (har 64 KB uchun thread almashtirmaslik)


def _upload_display_title(raw_name: Optional[str]) -> str:
    """X-File-Name sarlavhasidan (URL-kodlangan) natija sahifasida ko'rsatiladigan
    sarlavha: faqat fayl nomi (yo'lsiz), kengaytmasiz, boshqaruv belgilarisiz,
    qisqartirilgan. Bu matn FAQAT ko'rsatish/yuklab olish nomi uchun -- diskdagi
    fayl nomi HECH QACHON undan olinmaydi (path traversal imkonsiz)."""
    from urllib.parse import unquote
    name = unquote(raw_name or "")[:300].replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]+", " ", name)
    stem = name.rsplit(".", 1)[0] if "." in name else name
    stem = " ".join(stem.split())[:120]
    return stem or "Yuklangan video"


def _finish_uploaded_job(
    user_id, job_id: str, video_path: Path, subtitle_only: bool, voice_gender: str, title: str,
    source_language: Optional[str] = None, tts_provider: Optional[str] = None, voice_name: Optional[str] = None,
) -> JobCreationResult:
    """Yuklash tugagach ffprobe/kvota/ffmpeg/DB ishlari -- SINXRON, threadpool'da
    chaqiriladi (event loop bloklanmasin). O'z DB sessiyasini ochadi: yuklash
    minutlab davom etishi mumkin, shuning uchun request sessiyasi/ulanishi
    oldindan yopilgan (poolni band qilmaslik uchun)."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            video_path.unlink(missing_ok=True)
            return JobCreationResult(outcome="bad_file")
        return create_job_from_local_video_file_sync(
            db, user, job_id, video_path, source_url=f"upload://{job_id}", voice_gender=voice_gender,
            subtitle_only=subtitle_only, video_title=title, source_language=source_language,
            tts_provider=tts_provider, voice_name=voice_name,
        )
    finally:
        db.close()


@router.post("/jobs/upload", status_code=201, dependencies=[Depends(rate_limit("upload_job", 10, 600))])
async def upload_job_file(
    request: Request,
    subtitle_only: bool = Query(True),
    voice_gender: str = Query("auto"),
    source_language: str = Query("auto"),
    tts_provider: Optional[str] = Query(None),
    voice_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Video FAYLDAN (YouTube havolasisiz) job yaratadi -- asosan "Subtitr"
    rejimi uchun (2026-09-20), lekin subtitle_only=false bo'lsa dublyaj ham.

    So'rov tanasi -- XOM fayl baytlari (multipart EMAS): `Content-Type: video/mp4`
    kabi, `Content-Length` majburiy, fayl nomi `X-File-Name` (URL-kodlangan)
    sarlavhasida. Sabab: multipart Starlette'da avval vaqtinchalik faylga to'liq
    yoziladi va keyin yana nusxalanadi (1 GB uchun disk ikki baravar band);
    xom oqim esa to'g'ridan-to'g'ri job papkasiga yoziladi.

    Tartib: (1) arzon tekshiruvlar -- tur/hajm/kunlik chegara/navbat/daqiqa
    qoldig'i/diskda joy -- BARCHASI fayl o'qilishidan OLDIN; (2) DB ulanishi
    yopiladi (yuklash uzoq davom etadi); (3) fayl diskka oqim bilan yoziladi;
    (4) davomiylik/kvota/audio ajratish threadpool'da. Job faqat host-1 diskida
    turgan fayl bilan ishlashi uchun LOCAL_UPLOAD_QUEUE'ga tushadi."""
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    if content_type not in _ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Faqat MP4, MOV, MKV yoki WebM formatlar qabul qilinadi.")

    limit = settings.WEB_UPLOAD_MAX_MB * 1024 * 1024
    try:
        content_length = int(request.headers.get("content-length", ""))
    except ValueError:
        raise HTTPException(status_code=411, detail="Fayl hajmi (Content-Length) ko'rsatilmagan.")
    if content_length <= 0:
        raise HTTPException(status_code=400, detail="Fayl bo'sh.")
    if content_length > limit:
        raise HTTPException(
            status_code=413, detail=f"Fayl hajmi {settings.WEB_UPLOAD_MAX_MB} MB dan katta bo'lmasligi kerak.",
        )

    if voice_gender not in ("auto", "male", "female"):
        voice_gender = "auto"
    source_language = _normalize_source_language(source_language, subtitle_only)  # fayl o'qilishidan OLDIN
    user_id = current_user.id
    rejection = precheck_local_upload(db, user_id)
    # Yuklash daqiqalar davom etadi: DB ulanishini shu yerda qaytaramiz (aks holda
    # bir nechta parallel yuklash pool'ni (kichik) band qilib saytni qotiradi).
    db.close()
    if rejection:
        _raise_for_outcome(rejection)

    upload_root = Path(settings.OUTPUT_DIR)
    upload_root.mkdir(parents=True, exist_ok=True)
    reserve = int(settings.UPLOAD_MIN_FREE_DISK_GB * 1024 ** 3)
    if shutil.disk_usage(upload_root).free < content_length + reserve:
        raise HTTPException(
            status_code=503,
            detail="Server hozir yangi fayl qabul qila olmaydi (disk to'lgan). Birozdan so'ng qayta urinib ko'ring.",
            headers={"Retry-After": "300"},
        )

    job_id = str(uuid.uuid4())
    job_dir = upload_root / job_id
    video_dir = job_dir / "video"
    video_dir.mkdir(parents=True, exist_ok=True)
    video_path = video_dir / f"video{_CONTENT_TYPE_TO_EXT[content_type]}"

    size = 0
    buffer = bytearray()
    try:
        with open(video_path, "wb") as f:
            async for chunk in request.stream():
                if not chunk:
                    continue
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status_code=413, detail=f"Fayl hajmi {settings.WEB_UPLOAD_MAX_MB} MB dan katta bo'lmasligi kerak.",
                    )
                buffer += chunk
                if len(buffer) >= _UPLOAD_WRITE_BUFFER:
                    await run_in_threadpool(f.write, bytes(buffer))
                    buffer.clear()
            if buffer:
                await run_in_threadpool(f.write, bytes(buffer))
        if size != content_length:
            raise HTTPException(status_code=400, detail="Yuklash to'liq tugamadi. Qaytadan urinib ko'ring.")
    except BaseException:
        # 413 / mijoz uzilishi / boshqa har qanday xato: yarim yozilgan fayl va
        # bo'sh job papkasi diskda qolib ketmasin (disk to'lishining oldini olish).
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    try:
        result = await run_in_threadpool(
            _finish_uploaded_job, user_id, job_id, video_path, subtitle_only, voice_gender,
            _upload_display_title(request.headers.get("x-file-name")), source_language,
            tts_provider, voice_name,
        )
    except BaseException:
        # DB/ffmpeg kutilmagan xatosi: job yaratilmadi, demak fayl ham hech kimga
        # kerak emas -- yetim (1 GB gacha) bo'lib diskda qolmasin.
        shutil.rmtree(job_dir, ignore_errors=True)
        raise
    if result.outcome != "queued":
        # create_job_from_local_video_file_sync faylni o'zi o'chiradi; bo'sh papkani ham.
        shutil.rmtree(job_dir, ignore_errors=True)
    _raise_for_outcome(result)
    if result.outcome == "queued":
        return {"job_id": result.job_id, "status": "pending"}
    raise HTTPException(status_code=500, detail="Kutilmagan holat.")


@router.get("/jobs/stats")
def get_jobs_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Foydalanuvchining barcha joblari bo'yicha haqiqiy dinamik statistika."""
    total = db.query(DubbingJob).filter(DubbingJob.user_id == current_user.id).count()
    completed = db.query(DubbingJob).filter(
        DubbingJob.user_id == current_user.id,
        DubbingJob.status == JobStatus.COMPLETED,
    ).count()
    failed = db.query(DubbingJob).filter(
        DubbingJob.user_id == current_user.id,
        DubbingJob.status == JobStatus.FAILED,
    ).count()
    processing = max(0, total - completed - failed)
    return {
        "total": total,
        "completed": completed,
        "processing": processing,
        "failed": failed,
    }


@router.get("/jobs/{job_id}")
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: Optional[uuid.UUID] = Depends(get_optional_user_id),
) -> JobResponse:
    """Job ma'lumotlarini olish.
    - Egasi (authenticated) -> to'liq javob.
    - Authenticated, lekin egasi emas -> 404 (IDOR/enumeratsiyani yashiradi).
    - Anonim -> FAQAT tugallangan job, va faqat ulashsa bo'ladigan maydonlar
      (transkript / xato matni / baho-fikr yashiriladi). Jarayondagi / xato
      bo'lgan job anonimga umuman ko'rinmaydi.

    Bu endpoint har kutayotgan foydalanuvchidan davriy so'raladi, shuning
    uchun User qatorini yuklamaymiz -- egalikni faqat token'dagi id bilan
    solishtiramiz (bitta SELECT kam)."""
    job = db.query(DubbingJob).options(*_JOB_RESPONSE_DEFERRED).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    from backend.services.plans import is_user_admin
    is_admin = is_user_admin(db, current_user_id)
    is_owner = current_user_id is not None and job.user_id == current_user_id
    if current_user_id is not None and not is_owner and not is_admin:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    # On-demand video recovery tekshiruvi:
    # Agar job ilgari tugallangan bo'lsa va video fayli diskda yo'q bo'lsa, avtomatik qayta tiklaymiz
    from backend.services.job_recovery import is_output_video_missing, trigger_ondemand_recovery, can_recover_job
    video_missing = is_output_video_missing(job)

    if not video_missing:
        if job.status != JobStatus.COMPLETED and can_recover_job(job) and (job.completed_at is not None or job.status_message == "Video serverda qayta tiklanmoqda..."):
            job.status = JobStatus.COMPLETED
            job.progress = 100.0
            job.status_message = "Dublyaj tayyor!"
            db.commit()
    else:
        if can_recover_job(job) and (job.completed_at is not None or job.status == JobStatus.COMPLETED):
            trigger_ondemand_recovery(db, job)

    is_recovering = (
        (job.completed_at is not None or job.status_message == "Video serverda qayta tiklanmoqda...")
        and can_recover_job(job)
        and (job.status in (JobStatus.DOWNLOADING, JobStatus.SYNTHESIZING, JobStatus.MERGING, JobStatus.PENDING))
    )

    if not is_owner and not is_admin:
        raw_status = job.status.value if hasattr(job.status, "value") else job.status
        if str(raw_status).upper() != "COMPLETED" and not is_recovering:
            raise HTTPException(status_code=404, detail="Job topilmadi.")
        return _job_to_response(job, redact=True)

    response = _job_to_response(job)
    if job.status == JobStatus.PENDING and job.created_at:
        # Navbat worker o'rinlaridan qisqa bo'lsa job zum bir necha soniyada
        # boshlanadi -- "1-o'rin" kabi shovqin ko'rsatmaymiz. Uzun bo'lganda
        # foydalanuvchi "nega hech narsa bo'lmayapti" demasligi uchun o'rin va
        # taxminiy kutishni status_message orqali (frontend uni allaqachon
        # ko'rsatadi) aytamiz.
        from backend.services import queue_load
        position = queue_load.queue_position(db, job)
        if position > max(1, settings.QUEUE_WORKER_SLOTS):
            eta = queue_load.estimate_wait_minutes(position)
            response.queue_position = position
            response.queue_eta_minutes = eta
            response.status_message = (
                f"Navbatda: {position}-o'rin, taxminan {queue_load.format_wait(eta)} kutish"
            )

    # 1. Admin uchun video egasining to'liq ma'lumotlari (Ism-familiya, email, telefon, tarif, balans, LTV)
    if is_admin:
        if job.user_id:
            try:
                from sqlalchemy import func
                from backend.models.payment import Payment, PaymentStatus
                from backend.services.plans import get_or_create_subscription, get_minute_balance

                owner = db.query(User).filter(User.id == job.user_id).first()
                if owner:
                    sub = get_or_create_subscription(db, owner.id)
                    bal = get_minute_balance(db, owner.id)
                    user_jobs_count = db.query(DubbingJob).filter(DubbingJob.user_id == owner.id).count()
                    user_completed_count = db.query(DubbingJob).filter(
                        DubbingJob.user_id == owner.id,
                        DubbingJob.status == JobStatus.COMPLETED
                    ).count()
                    payments_total = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
                        Payment.user_id == owner.id,
                        Payment.status == PaymentStatus.APPROVED
                    ).scalar() or 0
                    payments_count = db.query(Payment).filter(
                        Payment.user_id == owner.id,
                        Payment.status == PaymentStatus.APPROVED
                    ).count()

                    response.user_info = {
                        "id": str(owner.id),
                        "name": owner.name,
                        "email": owner.email,
                        "phone": owner.phone,
                        "telegram_chat_id": owner.telegram_chat_id,
                        "auth_provider": owner.auth_provider,
                        "role": owner.role,
                        "is_internal": owner.is_internal,
                        "plan": sub.plan.value if sub else "free",
                        "plan_expires_at": to_tashkent_iso(sub.current_period_end) if sub and sub.current_period_end else None,
                        "minutes": bal,
                        "created_at": to_tashkent_iso(owner.created_at) if owner.created_at else None,
                        "last_active_at": to_tashkent_iso(owner.last_active_at) if owner.last_active_at else None,
                        "jobs_count": user_jobs_count,
                        "completed_jobs_count": user_completed_count,
                        "payments_total_uzs": int(payments_total),
                        "payments_count": payments_count,
                        "anonymous": False,
                    }
                else:
                    response.user_info = {
                        "anonymous": False,
                        "id": str(job.user_id),
                        "name": "Noma'lum foydalanuvchi",
                    }
            except Exception as e:
                logger.warning(f"Failed to fetch user_info for admin on job {job.id}: {e}")
                response.user_info = {"anonymous": False, "id": str(job.user_id), "error": str(e)}
        else:
            response.user_info = {
                "anonymous": True,
                "name": "Anonim mehmon (ro'yxatdan o'tmagan)",
            }

    # 2. Foydalanuvchi o'zining ilk videosi tugallanganda 24 soatlik 10% chegirma holati
    if current_user_id and is_owner and job.status == JobStatus.COMPLETED:
        try:
            from backend.services.plans import get_user_first_video_discount
            disc = get_user_first_video_discount(db, current_user_id)
            if disc and disc.get("eligible"):
                response.discount_offer = disc
        except Exception as e:
            logger.warning(f"Failed to check discount_offer for user {current_user_id}: {e}")

    return response


@router.get("/jobs")
def list_jobs(
    limit: int = Query(50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[JobResponse]:
    """Foydalanuvchining o'z joblari."""
    jobs = (
        db.query(DubbingJob)
        .options(*_JOB_RESPONSE_DEFERRED)
        .filter(DubbingJob.user_id == current_user.id)
        .order_by(DubbingJob.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_job_to_response(j) for j in jobs]


# Faqat DOWNLOAD bosqichida haqiqatan ham to'xtagan job'lar uchun mo'ljallangan
# fallback -- backend/services/downloader.py'ning MAX_DOWNLOAD_SIZE_BYTES bilan
# bir xil chegara.
MAX_UPLOAD_SIZE_BYTES = 3 * 1024 * 1024 * 1024  # 3 GB
_ALLOWED_UPLOAD_CONTENT_TYPES = {"video/mp4", "video/quicktime", "video/x-matroska", "video/webm"}
# Saqlanadigan fayl kengaytmasi shu FIXED xaritadan olinadi -- foydalanuvchi
# yuborgan `file.filename`'dan HECH QACHON emas (2026-08-26, upload-recovery
# xavfsizlik ko'rib chiqilishi: filename ixtiyoriy/ishonchsiz, faqat allaqachon
# tekshirilgan content_type'ga bog'liq bo'lishi kerak).
_CONTENT_TYPE_TO_EXT = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
}


def _get_media_duration_seconds(path: str) -> float | None:
    """ffprobe orqali video/audio davomiyligini aniqlaydi. Xato bo'lsa None."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", path],
            capture_output=True, text=True, check=True, timeout=10,
        )
        import json as _json
        return float(_json.loads(result.stdout)["format"]["duration"])
    except Exception:
        return None


@router.post("/jobs/{job_id}/upload-video", dependencies=[Depends(rate_limit("upload_video", 10, 600))])
async def upload_video_fallback(
    job_id: uuid.UUID,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """YouTube yuklab olish DOWNLOAD bosqichida muvaffaqiyatsiz bo'lgan job
    uchun fallback -- foydalanuvchi video faylini to'g'ridan-to'g'ri yuklaydi.

    Mavjud pipeline'ga MINIMAL diff bilan ulanadi: backend/workers/tasks.py
    process_video()'ning o'zi allaqachon "agar original_video_path va
    audio.wav mavjud bo'lsa, DOWNLOAD bosqichini o'tkazib yuborish"
    checkpoint'iga ega edi (checkpoint retry uchun yozilgan, lekin bu yerda
    ham to'g'ridan-to'g'ri ishlaydi) -- process_video'ning o'zi o'zgarmadi,
    faqat shu ikki faylni to'g'ri joyga qo'yib, job'ni qayta navbatga
    qo'yamiz. 2026-08-23, Webshare proksi balansi tugashi natijasida ko'p
    YouTube yuklab olish muvaffaqiyatsiz bo'lgani sababli qo'shildi."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    if job.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Sizda bu job uchun ruxsat yo'q.")
    if job.status != JobStatus.FAILED:
        raise HTTPException(status_code=400, detail="Bu funksiya faqat muvaffaqiyatsiz job'lar uchun mavjud.")
    if job.original_video_path:
        raise HTTPException(
            status_code=400,
            detail="Bu job uchun video allaqachon yuklab olingan edi — muammo YouTube yuklab olishda emas.",
        )
    if file.content_type not in _ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Faqat MP4, MOV, MKV yoki WebM formatlar qabul qilinadi.")

    job_dir = Path(settings.OUTPUT_DIR) / str(job_id)
    video_dir = job_dir / "video"
    video_dir.mkdir(parents=True, exist_ok=True)
    # job_dir "video" bazaviy nomi va job_id (UUID, FastAPI tomonidan
    # tekshirilgan) qat'iy belgilangan -- fayl nomi umuman ishlatilmaydi,
    # shuning uchun path traversal imkonsiz.
    video_path = video_dir / f"video{_CONTENT_TYPE_TO_EXT[file.content_type]}"

    size = 0
    try:
        with open(video_path, "wb") as f:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Fayl hajmi {MAX_UPLOAD_SIZE_BYTES // (1024 ** 3)} GB dan katta bo'lmasligi kerak.",
                    )
                f.write(chunk)
    except Exception:
        # HTTPException (413) VA tarmoq uzilishi/mijoz bekor qilishi kabi
        # boshqa har qanday xato -- ikkalasida ham yarim yozilgan fayl
        # qolib ketmasligi kerak (2026-08-26, keyingi "qayta urinish"
        # buzuq qisman faylni topib qolmasligi uchun).
        video_path.unlink(missing_ok=True)
        raise

    # Audio ajratish -- backend/services/downloader.py'dagi bilan bir xil
    # ffmpeg buyrug'i (transkripsiya aynan shu formatdagi WAV faylni kutadi).
    audio_path = job_dir / "audio.wav"
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(audio_path)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        video_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="Video faylini o'qib bo'lmadi — fayl buzilgan yoki qo'llab-quvvatlanmaydigan bo'lishi mumkin.",
        )

    duration = _get_media_duration_seconds(str(video_path))

    job.original_video_path = str(video_path)
    if duration:
        job.video_duration = duration
    job.status = JobStatus.PENDING
    job.status_message = "Video qabul qilindi. Navbatga qo'shildi."
    job.error_message = None
    job.error_code = None
    job.updated_at = datetime.utcnow()
    db.commit()

    from backend.workers.tasks import process_video
    from backend.services.plans import LOCAL_UPLOAD_QUEUE
    # Yuklangan fayl faqat SHU host (host-1) diskida turibdi -- boshqa worker
    # host (worker-3) uni topa olmasdi va YouTube'dan qayta yuklashga tushardi
    # (aynan shuni bu yo'l chetlab o'tishi kerak). Shuning uchun har doim
    # LOCAL_UPLOAD_QUEUE (create_job_from_local_video_file_sync bilan bir xil).
    process_video.apply_async(args=[str(job_id)], task_id=str(job_id), queue=LOCAL_UPLOAD_QUEUE)

    return {"success": True, "message": "Video qabul qilindi, ishlov berish boshlandi."}


@router.delete("/jobs/{job_id}", status_code=204)
def delete_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from backend.services.plans import is_user_admin
    is_admin = is_user_admin(db, current_user.id)

    query = db.query(DubbingJob).filter(DubbingJob.id == job_id)
    if not is_admin:
        query = query.filter(DubbingJob.user_id == current_user.id)
    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    # 1. Bekor qilish: agar job navbatda yoki jarayonda bo'lsa Celery taskni to'xtatish
    try:
        from backend.workers.celery_app import celery_app
        celery_app.control.revoke(str(job.id), terminate=True)
    except Exception as e:
        logger.warning(f"Celery taskini bekor qilishda xatolik ({job.id}): {e}")

    # 2. Checkpointlarni tozalash (Redis/disk)
    try:
        from backend.services.job_checkpoint import delete_checkpoint
        delete_checkpoint(str(job.id))
    except Exception as e:
        logger.warning(f"Checkpointni tozalashda xatolik ({job.id}): {e}")

    # 3. Tashqi kalitlar (Foreign Keys) bog'liqliklarini uzish va tozalash
    try:
        # a) Ushbu job'dan kesh sifatida nusxa olgan boshqa joblarning source_job_id'sini null qilish
        db.query(DubbingJob).filter(DubbingJob.source_job_id == job.id).update({DubbingJob.source_job_id: None})

        # b) Rezolyutsiya variantlarini o'chirish (resolution_variants FK)
        db.query(ResolutionVariant).filter(ResolutionVariant.job_id == job.id).delete()

        # c) To'lov tranzaksiyalari bo'lsa job_id'ni null qilish (to'lov saqlanadi, job aloqasi uziladi)
        try:
            from backend.models.payment import Payment
            db.query(Payment).filter(Payment.job_id == job.id).update({Payment.job_id: None})
        except Exception:
            pass

        # 4. Job'ni o'chirish va commit qilish
        db.delete(job)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.exception(f"Jobni bazadan o'chirishda xatolik ({job.id}): {e}")
        raise HTTPException(status_code=500, detail="Jobni o'chirishda xatolik yuz berdi.")

    # 5. Diskdagi lokal fayllarni tozalash (commit muvaffaqiyatli bo'lgandan so'ng)
    try:
        out_dir = Path(settings.OUTPUT_DIR) / str(job.id)
        if out_dir.exists():
            shutil.rmtree(out_dir, ignore_errors=True)
        temp_dir = Path("/tmp/dubber") / str(job.id)
        if temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
    except Exception as e:
        logger.warning(f"Lokal fayllarni tozalashda xatolik ({job.id}): {e}")

    # 6. S3 fayllarini tozalash (agar mavjud bo'lsa)
    try:
        from backend.services.storage import delete_file_from_s3
        if job.output_video_url and not job.output_video_url.startswith("http") and not job.output_video_url.startswith("/outputs"):
            delete_file_from_s3(job.output_video_url)
    except Exception as e:
        logger.warning(f"S3 faylini tozalashda xatolik ({job.id}): {e}")

    return Response(status_code=204)


@router.post("/jobs/{job_id}/retry")
@router.post("/jobs/{job_id}/regenerate")
def retry_job(
    job_id: uuid.UUID,
    payload: Optional[RegenerateJobRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xatolik yuz bergan (failed) yoki muvaffaqiyatli yakunlangan (completed) job'ni
    qayta ishga tushirish (regenerate).

    Muvaffaqiyatli joblar yoki qayta yaratishda:
    - Balansdan tegishli daqiqa yechiladi (u ham balansdan yechsin).
    - STT va tarjima (matnlar) saqlanadi, faqat TTS va video birlashtirish noldan toza ishlaydi.
    - Foydalanuvchi xohlasa ovoz yoki provayderni o'zgartirishi mumkin.
    """
    from backend.services.plans import check_and_consume_quota, is_user_admin
    from backend.services.job_checkpoint import delete_checkpoint
    from backend.services.job_creation import extract_youtube_video_id, _cached_job_files_exist

    query = db.query(DubbingJob).filter(DubbingJob.id == job_id)
    if not is_user_admin(db, current_user.id):
        query = query.filter(DubbingJob.user_id == current_user.id)
    job = query.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    if job.status not in (JobStatus.FAILED, JobStatus.COMPLETED):
        raise HTTPException(
            status_code=400,
            detail="Faqat xatolik yuz bergan yoki yakunlangan videolarni qayta ishga tushirish mumkin.",
        )

    err_code = (job.error_code or "").upper()
    err_msg = (job.error_message or "").lower()
    if err_code == "NO_SPEECH_FOUND" or "nutq topilmadi" in err_msg:
        raise HTTPException(status_code=400, detail="Ushbu videoda nutq mavjud emasligi sababli qayta urinish mumkin emas.")
    if err_code == "CONTENT_BLOCKED" or "kontent siyosati" in err_msg or "taqiqlangan" in err_msg:
        raise HTTPException(status_code=400, detail="Ushbu video kontent xavfsizligi qoidalariga to'g'ri kelmagani sababli qayta ishga tushirish mumkin emas.")

    is_regenerate = (job.status == JobStatus.COMPLETED) or bool(payload and payload.force_regenerate)

    # 1. Sozlamalarni yangilash (agar foydalanuvchi yangi ovoz yoki provayder yuborgan bo'lsa)
    if payload:
        if payload.speaker_gender:
            if payload.speaker_gender != job.speaker_gender:
                job.speech_segments = None  # yangi jins uchun qayta optimizatsiya bo'ladi
            job.speaker_gender = payload.speaker_gender
        if payload.tts_provider:
            job.tts_provider = payload.tts_provider
            gender = job.speaker_gender or "male"
            if payload.tts_provider in ("azure", "edge"):
                if payload.voice_name and "neural" in payload.voice_name.lower():
                    job.voice_name = payload.voice_name
                else:
                    job.voice_name = "uz-UZ-MadinaNeural" if gender == "female" else "uz-UZ-SardorNeural"
                job.tts_model = f"{payload.tts_provider}-tts ({job.voice_name})"
            elif payload.tts_provider == "gemini":
                if payload.voice_name and "neural" not in payload.voice_name.lower():
                    job.voice_name = payload.voice_name
                else:
                    job.voice_name = "Autonoe" if gender == "female" else "Charon"
                job.tts_model = f"gemini-3.8-flash-tts ({job.voice_name})"
        elif payload.voice_name:
            job.voice_name = payload.voice_name
        if payload.gemini_key_tier:
            job.gemini_key_tier = payload.gemini_key_tier
        if payload.stt_provider:
            job.stt_model = payload.stt_provider
        if payload.reuse_transcript is False:
            job.transcript_segments = None
            job.transcript_text = None
            job.srt_content = None
        if payload.translation_model:
            job.translation_model = payload.translation_model
        if payload.reuse_translation is False:
            job.translated_segments = None
            job.translated_text = None
            job.uzbek_srt_content = None

    # 2. Balansdan daqiqa yechish (admin uchun cheksiz/bepul, oddiy user uchun balansdan yechiladi)
    duration_seconds = job.video_duration
    if not duration_seconds and job.original_video_path and Path(job.original_video_path).exists():
        from backend.services.job_creation import _media_duration_seconds
        dur = _media_duration_seconds(Path(job.original_video_path))
        if dur:
            duration_seconds = int(dur)
            job.video_duration = duration_seconds

    duration_minutes = max(0.1, round((duration_seconds or 60.0) / 60.0, 2))

    # 2. Balansdan daqiqa yechish:
    # - 2 daqiqalik parchalar (is_preview=True) HAR DOIM bepul: balansdan yechilmaydi va qaytarilmaydi!
    # - Admin sinov/qayta ishga tushirishi bepul (is_user_admin). Ilgari yechilmagan job sun'iy quota_consumed=True qilinmaydi!
    # - Agar job avval FAILED bo'lgan bo'lsa va undan daqiqa yechilgan bo'lsa (quota_consumed=True), qayta yechilmaydi.
    # - Faqat oddiy foydalanuvchi COMPLETED videoni qayta yaratganda yoki ilgari yechilmaganda balansdan yechiladi.
    is_preview = bool(getattr(job, "is_preview", False))
    if is_preview:
        job.quota_consumed = False
    elif is_user_admin(db, current_user.id):
        # Admin sinovi bepul: foydalanuvchiga ta'sir qilmaydi, quota_consumed flagi o'zgarmaydi
        pass
    else:
        needs_quota = is_regenerate or not getattr(job, "quota_consumed", False)
        if needs_quota:
            target_user_id = job.user_id or current_user.id
            has_quota, shortfall = check_and_consume_quota(db, target_user_id, duration_minutes)
            if not has_quota:
                raise HTTPException(
                    status_code=402,
                    detail=f"Daqiqa balansingiz yetarli emas. Qayta yaratish uchun {shortfall} daqiqa kerak.",
                )
            job.quota_consumed = True


    # 3. Kesh tekshiruvi: Faqat FAILED videolarda (Regenerate bo'lmaganda) boshqa donor kesh qidiriladi
    video_id = job.youtube_video_id or (extract_youtube_video_id(job.youtube_url) if job.youtube_url else None)
    if not is_regenerate and video_id and not getattr(job, "subtitle_only", False):
        cache_query = db.query(DubbingJob).filter(
            DubbingJob.youtube_video_id == video_id,
            DubbingJob.status == JobStatus.COMPLETED,
            DubbingJob.subtitle_only.is_(False),
            DubbingJob.id != job.id,
        )
        if job.speaker_gender in ("male", "female"):
            cache_query = cache_query.filter(DubbingJob.speaker_gender == job.speaker_gender)
        elif getattr(job, "voice_gender_setting", None) in ("male", "female"):
            cache_query = cache_query.filter(DubbingJob.speaker_gender == job.voice_gender_setting)

        cached_job = cache_query.order_by(DubbingJob.completed_at.desc()).first()
        if cached_job and _cached_job_files_exist(cached_job):
            job.source_job_id = cached_job.storage_id
            job.video_title = job.video_title or cached_job.video_title
            job.video_duration = job.video_duration or cached_job.video_duration
            job.video_thumbnail = job.video_thumbnail or cached_job.video_thumbnail
            job.speaker_gender = cached_job.speaker_gender
            job.transcript_text = cached_job.transcript_text
            job.translated_text = cached_job.translated_text
            job.transcript_segments = cached_job.transcript_segments
            job.translated_segments = cached_job.translated_segments
            job.srt_content = cached_job.srt_content
            job.uzbek_srt_content = cached_job.uzbek_srt_content
            job.output_video_path = cached_job.output_video_path or f"outputs/{cached_job.storage_id}/video/dubbed_final.mp4"
            job.output_video_url = cached_job.output_video_url or f"/outputs/{cached_job.storage_id}/video/dubbed_final.mp4"
            job.dubbed_audio_path = cached_job.dubbed_audio_path or f"outputs/{cached_job.storage_id}/audio/dubbed_audio.wav"
            job.error_code = None
            job.error_message = None
            job.recovery_attempt_count = 0
            job.processing_claim_token = None
            job.processing_lease_expires_at = None
            job.status = JobStatus.COMPLETED
            job.progress = 100.0
            job.status_message = "Dublyaj tayyor!"
            job.completed_at = datetime.utcnow()
            db.commit()
            return {"success": True, "message": "Video tayyor holatga keltirildi (keshdan)."}

    elif not is_regenerate and video_id and getattr(job, "subtitle_only", False):
        cache_query = db.query(DubbingJob).filter(
            DubbingJob.youtube_video_id == video_id,
            DubbingJob.status == JobStatus.COMPLETED,
            DubbingJob.transcript_segments.isnot(None),
            DubbingJob.translated_segments.isnot(None),
            DubbingJob.id != job.id,
        )
        cached_sub_job = cache_query.order_by(DubbingJob.completed_at.desc()).first()
        if cached_sub_job:
            job.source_job_id = cached_sub_job.storage_id
            job.video_title = job.video_title or cached_sub_job.video_title
            job.video_duration = job.video_duration or cached_sub_job.video_duration
            job.video_thumbnail = job.video_thumbnail or cached_sub_job.video_thumbnail
            job.transcript_text = cached_sub_job.transcript_text
            job.translated_text = cached_sub_job.translated_text
            job.transcript_segments = cached_sub_job.transcript_segments
            job.translated_segments = cached_sub_job.translated_segments
            job.srt_content = cached_sub_job.srt_content
            job.uzbek_srt_content = cached_sub_job.uzbek_srt_content
            job.error_code = None
            job.error_message = None
            job.recovery_attempt_count = 0
            job.processing_claim_token = None
            job.processing_lease_expires_at = None
            job.status = JobStatus.COMPLETED
            job.progress = 100.0
            job.status_message = "Subtitr tayyor!"
            job.completed_at = datetime.utcnow()
            db.commit()
            return {"success": True, "message": "Subtitr tayyor holatga keltirildi (keshdan)."}

    # Boshqa jinsda tayyor bo'lgan dublyajdan matnlarni (STT, tarjima, nutq segmentlari) ko'chirish
    if video_id and not job.translated_segments:
        donor_job = db.query(DubbingJob).filter(
            DubbingJob.youtube_video_id == video_id,
            DubbingJob.status == JobStatus.COMPLETED,
            DubbingJob.translated_segments.isnot(None),
            DubbingJob.id != job.id,
        ).order_by(DubbingJob.completed_at.desc()).first()
        if donor_job:
            job.transcript_text = job.transcript_text or donor_job.transcript_text
            job.transcript_segments = job.transcript_segments or donor_job.transcript_segments
            job.srt_content = job.srt_content or donor_job.srt_content
            job.translated_text = job.translated_text or donor_job.translated_text
            job.translated_segments = job.translated_segments or donor_job.translated_segments
            job.uzbek_srt_content = job.uzbek_srt_content or donor_job.uzbek_srt_content
            job.speech_segments = job.speech_segments or donor_job.speech_segments

    # 4. Chiqish fayllarini tozalash (yangi sintez va birlashtirish uchun)
    job.source_job_id = None

    if job.original_video_path:
        p_vid = Path(job.original_video_path)
        if p_vid.exists() and p_vid.is_file() and p_vid.stat().st_size == 0:
            try:
                p_vid.unlink()
            except Exception:
                pass
            job.original_video_path = None
        elif not p_vid.exists():
            job.original_video_path = None

    if job.dubbed_audio_path:
        p_aud = Path(job.dubbed_audio_path)
        if p_aud.exists():
            try:
                p_aud.unlink()
            except Exception:
                pass
        job.dubbed_audio_path = None

    if job.output_video_path:
        p_vid = Path(job.output_video_path)
        if p_vid.exists():
            try:
                p_vid.unlink()
            except Exception:
                pass
        job.output_video_path = None

    job.output_video_url = None
    job.segment_qa = None
    job.uzbek_srt_content = None

    # Checkpoint va eski audio segmentlarni tozalash
    delete_checkpoint(str(job.id), "dubbed_audio.wav")
    delete_checkpoint(str(job.id), "dubbed_final.mp4")

    tts_seg_dir = Path("outputs") / str(job.id) / "audio" / "tts_segments"
    if tts_seg_dir.exists():
        try:
            shutil.rmtree(tts_seg_dir)
        except Exception:
            pass

    try:
        db.query(ResolutionVariant).filter(ResolutionVariant.job_id == str(job.id)).delete()
    except Exception:
        pass

    job.status = JobStatus.PENDING
    job.progress = 0.0
    job.status_message = "Qayta yaratilmoqda (navbatga qo'yildi)..." if is_regenerate else "Qayta navbatga qo'yildi..."
    job.error_code = None
    job.error_message = None
    job.recovery_attempt_count = 0
    job.processing_claim_token = None
    job.processing_lease_expires_at = None
    job.created_at = datetime.utcnow()
    job.completed_at = None
    db.commit()

    from backend.workers.tasks import process_video
    from backend.services.plans import get_job_queue_v2, LOCAL_UPLOAD_QUEUE
    _dur = (job.video_duration or 0) / 60.0
    if not job.youtube_url and job.original_video_path:
        queue = LOCAL_UPLOAD_QUEUE
    else:
        queue = get_job_queue_v2(db, job.user_id or current_user.id, _dur)
    # Do not pass task_id=str(job.id) so Celery creates a fresh task ID,
    # preventing Celery worker from discarding previously revoked tasks.
    process_video.apply_async(args=[str(job.id)], queue=queue)

    return {
        "success": True,
        "message": "Video qayta yaratish uchun navbatga qo'yildi." if is_regenerate else "Video qayta navbatga qo'yildi."
    }


def _subtitle_cues_for(job) -> list | None:
    """Faqat "Subtitr" rejimidagi job'lar uchun: tarjima gaplarini qisqa, o'qib
    bo'ladigan kuelarga aylantiradi (backend/services/subtitle_cues.py). So'rov
    paytida hisoblanadi -- shuning uchun bu tuzatishdan OLDIN yaratilgan
    subtitrlar ham yaxshilanadi. Dublyaj job'lari o'zgarmaydi (ularning subtitri
    dublyaj audiosi vaqtiga moslangan). Xatoda None -- eski yo'lga qaytiladi."""
    if not getattr(job, "subtitle_only", False) or not job.translated_segments:
        return None
    try:
        return subtitle_cues.build_cues(job.translated_segments, job.transcript_segments or [])
    except Exception:
        logger.exception(f"Subtitr kuelarini qurishda xato: job={job.id}")
        return None


@router.get("/jobs/{job_id}/subtitles.vtt")
def get_subtitles(
    job_id: uuid.UUID,
    download: bool = Query(False),
    db: Session = Depends(get_db),
):
    """O'zbekcha subtitrlarni WebVTT formatida qaytarish -- video pleerning
    <track> elementi shuni ishlatadi (VideoPlayer.tsx), shuning uchun odatda
    Content-Disposition: attachment QO'YILMAYDI (brauzer inline o'qishi
    kerak, yuklab olish sifatida emas). Faqat `?download=1` bilan (natija
    sahifasidagi "VTT yuklab olish" tugmasi) attachment beriladi."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or not job.uzbek_srt_content:
        raise HTTPException(status_code=404, detail="Subtitrlar topilmadi.")
    cues = _subtitle_cues_for(job)
    content = subtitle_cues.cues_to_vtt(cues) if cues else job.uzbek_srt_content
    headers = {"Access-Control-Allow-Origin": "*"}
    if download:
        headers["Content-Disposition"] = subtitle_export.content_disposition(
            subtitle_export.download_filename(job.video_title, job_id, "vtt")
        )
    return Response(content=content, media_type="text/vtt", headers=headers)


@router.get("/jobs/{job_id}/subtitles.srt")
def get_subtitles_srt(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """O'zbekcha subtitrlarni SRT formatida, yuklab olish uchun qaytaradi
    (2026-09-16, "Subtitr" rejimi) -- .vtt'dan farqli, bu to'g'ridan-to'g'ri
    foydalanuvchi yuklab oladigan fayl, shuning uchun Content-Disposition
    beriladi. Fayl nomi video sarlavhasi (yuklangan videoda -- fayl nomi)
    bo'yicha: `<nom>.uz.srt`."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or not job.translated_segments:
        raise HTTPException(status_code=404, detail="Subtitrlar topilmadi.")
    cues = _subtitle_cues_for(job)
    if cues:
        srt_content = subtitle_cues.cues_to_srt(cues)
    else:
        from backend.workers.tasks import _segments_to_srt
        srt_content = _segments_to_srt(job.translated_segments)
    return Response(
        content=srt_content,
        media_type="application/x-subrip",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Content-Disposition": subtitle_export.content_disposition(
                subtitle_export.download_filename(job.video_title, job_id, "srt")
            ),
        },
    )


@router.get("/jobs/{job_id}/subtitles.txt")
def get_subtitles_txt(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Subtitr MATNINI oddiy .txt sifatida yuklab olish (2026-09-20): har bir
    subtitr qatori alohida satrda, vaqt kodlarisiz -- o'qish, nusxalash yoki
    boshqa joyga qo'yish uchun. Segmentlar yo'q eski job'larda yaxlit tarjima
    matni beriladi."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Subtitrlar topilmadi.")
    text = subtitle_export.segments_to_txt(job.translated_segments) or subtitle_export.plain_text_fallback(
        job.translated_text
    )
    if not text:
        raise HTTPException(status_code=404, detail="Subtitrlar topilmadi.")
    return Response(
        content=text,
        media_type="text/plain; charset=utf-8",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Content-Disposition": subtitle_export.content_disposition(
                subtitle_export.download_filename(job.video_title, job_id, "txt")
            ),
        },
    )


@router.get("/jobs/{job_id}/summary")
def get_job_summary(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Dublyaj qilingan video uchun tezkor AI Xulosa va asosiy fikrlar (3-5 ta tezis).
    1. Agar linked_analysis mavjud bo'lsa, uning tayyor xulosasini beradi.
    2. Aks holda Redis keshidan tekshiradi.
    3. Keshda bo'lmasa, job.translated_text asosida Gemini orqali 1-2 soniyada
       ixcham xulosa va asosiy fikrlarni generatsiya qiladi va Redis'ga keshlaydi."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Ish topilmadi.")

    # 1. Linked VideoAnalysis bor bo'lsa:
    if job.linked_analysis_id:
        analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == job.linked_analysis_id).first()
        if analysis and (analysis.summary or analysis.key_points):
            short_sum = (analysis.summary or {}).get("short") or (analysis.summary or {}).get("medium")
            kps = [kp.get("title", "") for kp in (analysis.key_points or [])[:4] if kp.get("title")]
            return {
                "summary": short_sum or (analysis.five_minute_summary or {}).get("why_it_matters"),
                "key_points": kps,
                "source": "analysis",
            }

    # 2. Redis keshini tekshiramiz:
    redis_key = f"job_summary:{job_id}"
    r_cli = None
    try:
        import redis
        r_cli = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        cached = r_cli.get(redis_key)
        if cached:
            import json
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Redis get summary error: {e}")

    # 3. Agar matn bo'lmasa:
    text_to_summarize = job.translated_text or job.transcript_text
    if not text_to_summarize:
        return {"summary": None, "key_points": [], "source": "none"}

    # 4. Gemini orqali ixcham xulosa generatsiya qilamiz:
    try:
        from backend.services.gemini_quota_manager import call_gemini_json_with_fallback
        system_prompt = (
            "Siz professional video tahlilchisiz. Berilgan matn bo'yicha O'zbek tilida aniq, "
            "tushunarli va qisqa xulosa tuzing. Faqat JSON formatida javob bering."
        )
        user_prompt = f"""Quyidagi video matnidan foydalanib:
1. 'summary': Videoning asl mohiyatini tushuntiruvchi 1-2 jumlali ixcham xulosa.
2. 'key_points': 3-4 ta eng muhim fikr, maslahat yoki saboq (har biri qisqa, ta'sirli 1 jumla).

Video sarlavhasi: {job.video_title or 'Video'}
Matn:
{text_to_summarize[:3500]}

JSON formati:
{{
  "summary": "...",
  "key_points": ["1-asosiy fikr...", "2-asosiy fikr...", "3-asosiy fikr..."]
}}
"""
        res = call_gemini_json_with_fallback(system_prompt, user_prompt)
        payload = {
            "summary": res.get("summary"),
            "key_points": res.get("key_points") or [],
            "source": "generated",
        }
        if r_cli:
            try:
                import json
                r_cli.setex(redis_key, 86400 * 7, json.dumps(payload))
            except Exception:
                pass
        return payload
    except Exception as exc:
        logger.warning(f"Error generating summary for job {job_id}: {exc}")
        return {"summary": None, "key_points": [], "source": "error"}


@router.get("/outputs/{job_id}/audio")
def download_audio(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Dublyaj qilingan audioni WAV formatida yuklab olish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Audio topilmadi.")

    settings = get_settings()
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import generate_presigned_download_url, s3_object_exists
        s3_key = f"dubber/{job.storage_id}/dubbed_audio.wav"
        if not s3_object_exists(s3_key):
            raise HTTPException(status_code=410, detail="Audio fayl endi mavjud emas — saqlash muddati tugagan.")
        presigned_url = generate_presigned_download_url(s3_key)
        if presigned_url:
            return Response(status_code=307, headers={"Location": presigned_url})

    audio_path = job.dubbed_audio_path
    if not audio_path or not Path(audio_path).exists():
        candidate = Path(f"outputs/{job.storage_id}/audio/dubbed_audio.wav")
        if candidate.exists():
            audio_path = str(candidate)
        else:
            from backend.services.job_recovery import can_recover_job, trigger_ondemand_recovery
            if can_recover_job(job):
                trigger_ondemand_recovery(db, job)
                raise HTTPException(
                    status_code=503,
                    detail="Audio serverda qayta tiklanmoqda. Iltimos, 1-2 daqiqadan so'ng sahifani yangilang.",
                    headers={"Retry-After": "60"},
                )
            raise HTTPException(status_code=404, detail="Audio fayl topilmadi.")
    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    filename = f"{safe_title or job_id}_audio.wav"
    return FileResponse(path=audio_path, media_type="audio/wav", filename=filename)


@router.api_route("/outputs/{job_id}/video", methods=["GET", "HEAD"])
def download_video(
    request: Request,
    job_id: uuid.UUID,
    resolution: Optional[str] = Query(None, description="Video rezolyutsiyasi: 360p, 720p, 1080p"),
    download: bool = Query(False, description="True bo'lsa yuklab olish uchun attachment, aks holda inline ko'rish"),
    db: Session = Depends(get_db),
):
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Video topilmadi.")

    suffix = "_360p" if resolution == "360p" else "_1080p" if resolution == "1080p" else "_final"
    variant_name = f"dubbed{suffix}.mp4"

    settings = get_settings()
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import generate_presigned_download_url, s3_object_exists
        s3_key = f"dubber/{job.storage_id}/{variant_name}"
        if not s3_object_exists(s3_key):
            raise HTTPException(status_code=410, detail="Video fayl endi mavjud emas — saqlash muddati tugagan.")
        presigned_url = generate_presigned_download_url(s3_key)
        if presigned_url:
            return Response(status_code=307, headers={"Location": presigned_url})

    video_path = None
    if resolution in ("360p", "1080p"):
        candidate = Path(f"outputs/{job.storage_id}/video/{variant_name}")
        if candidate.exists():
            video_path = str(candidate)
        else:
            direct_candidate = Path(f"outputs/{job_id}/video/{variant_name}")
            if direct_candidate.exists():
                video_path = str(direct_candidate)

    # Agar 360p yoki 1080p varianti hali mavjud bo'lmasa yoki master so'ralgan bo'lsa,
    # 404 berib videopleerni buzmaslik uchun master videoga (dubbed_final.mp4) fallback qilamiz:
    if not video_path or not Path(video_path).exists():
        video_path = job.output_video_path
        if not video_path or not Path(video_path).exists():
            candidate = Path(f"outputs/{job.storage_id}/video/dubbed_final.mp4")
            if candidate.exists():
                video_path = str(candidate)
            else:
                direct_candidate = Path(f"outputs/{job_id}/video/dubbed_final.mp4")
                if direct_candidate.exists():
                    video_path = str(direct_candidate)

    if not video_path or not Path(video_path).exists():
        if resolution not in ("360p", "1080p"):
            from backend.services.job_recovery import can_recover_job, trigger_ondemand_recovery
            if can_recover_job(job):
                trigger_ondemand_recovery(db, job)
                raise HTTPException(
                    status_code=503,
                    detail="Video serverda qayta tiklanmoqda. Iltimos, 1-2 daqiqadan so'ng sahifani yangilang.",
                    headers={"Retry-After": "60"},
                )
        raise HTTPException(status_code=404, detail="Video fayl topilmadi.")

    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    res_label = resolution if resolution in ("360p", "720p", "1080p") else "720p"
    filename = f"{safe_title or job_id} - {res_label}.mp4"
    disp_type = "attachment" if download else "inline"
    return FileResponse(
        path=video_path,
        media_type="video/mp4",
        filename=filename,
        content_disposition_type=disp_type,
        method=request.method,
    )


@router.get("/jobs/{job_id}/resolutions")
def list_resolutions(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Tarif bo'yicha ruxsat etilgan va tayyor rezolyutsiyalar ro'yxati.
    720p har doim "ready" -- u master fayl, alohida generatsiya kerak emas."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Video hali tayyor emas.")

    from backend.services.plans import get_max_resolution_for_job, RESOLUTION_ORDER
    max_idx = RESOLUTION_ORDER.index(get_max_resolution_for_job(db, job))

    variant_status = {
        v.resolution: v.status
        for v in db.query(ResolutionVariant).filter(ResolutionVariant.job_id == job.storage_id).all()
    }

    # Master S3 lifecycle (3 kun) bo'yicha allaqachon o'chirilgan bo'lishi
    # mumkin -- shu holatda 720p "ready" ko'rsatib, bosilganda 410 bilan
    # yiqilishidan ko'ra, ro'yxatning o'zida "expired" ko'rsatish yaxshiroq.
    master_missing = False
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import s3_object_exists
        master_missing = not s3_object_exists(f"dubber/{job.storage_id}/dubbed_final.mp4")

    resolutions = []
    for i, res in enumerate(RESOLUTION_ORDER):
        available = i <= max_idx
        status = "ready" if res == "720p" else variant_status.get(res, "not_requested")
        if master_missing and status == "ready":
            status = "expired"
        resolutions.append({"resolution": res, "available": available, "status": status})

    return {"resolutions": resolutions}


@router.post("/jobs/{job_id}/resolutions/{resolution}")
def request_resolution(job_id: uuid.UUID, resolution: str, db: Session = Depends(get_db)):
    """Berilgan rezolyutsiyani so'raydi -- 720p darhol qaytadi (master fayl),
    360p/1080p mavjud bo'lmasa Celery task navbatga qo'yiladi va "processing"
    qaytariladi (frontend buni pollaydi). Mantiq resolution_variants.py'da --
    Telegram bot ham xuddi shu funksiyani chaqiradi, ikki joyda saqlanmaydi."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Video hali tayyor emas.")

    from backend.services.resolution_variants import request_resolution as _request_resolution
    result = _request_resolution(db, job, resolution)

    if result.outcome == "invalid":
        raise HTTPException(status_code=400, detail="Noto'g'ri rezolyutsiya.")
    if result.outcome == "forbidden":
        raise HTTPException(status_code=403, detail="Bu sifat sizning tarif rejangizda mavjud emas.")
    if result.outcome == "expired":
        raise HTTPException(status_code=410, detail="Bu video fayli endi mavjud emas — saqlash muddati tugagan.")
    if result.outcome == "ready":
        return {"status": "ready", "download_url": result.download_url}
    return {"status": "processing"}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # 2026-08-25: ilgari current_user tekshiruvi umuman yo'q edi -- job_id'ni
    # bilgan ISTALGAN kishi (havola ulashish, log, referrer orqali) boshqa
    # birovning ishlayotgan job'ini bekor qila olardi. DELETE /jobs/{job_id}
    # (yuqorida) bilan bir xil naqsh -- so'rovning o'ziga user_id filtri.
    from backend.services.plans import is_user_admin
    is_admin = is_user_admin(db, current_user.id)

    query = db.query(DubbingJob).filter(DubbingJob.id == job_id)
    if not is_admin:
        query = query.filter(DubbingJob.user_id == current_user.id)
    job = query.first()
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
    
    now_utc = datetime.utcnow()
    created_at = job.created_at or now_utc
    limit_refunded = False

    # 2026-10-22: Bekor qilishda kvotani qaytarish yangi qoidasi:
    # 1. Boshlang'ich faol bosqich (tayyor kesh/donor skip qilinadi) uchun maksimal 30 soniya vaqt beriladi.
    # 2. Agar 1-bosqich ishlab, 2-bosqichga o'tgan bo'lsa (hatto 30s ichida bo'lsa ham), limit qaytarilmaydi (balansdan yechiladi).
    # 3. Boshlang'ich bosqich 30 soniyadan oshsa ham limit qaytarilmaydi.
    from backend.services.cancel_policy import check_cancel_refund_eligibility
    can_refund, seconds_left, reason, initial_stage, current_stage = check_cancel_refund_eligibility(
        str(job.id),
        job.status.value if hasattr(job.status, "value") else str(job.status),
        job.created_at,
    )

    if can_refund:
        if getattr(job, "quota_consumed", False) and not getattr(job, "is_preview", False):
            try:
                from backend.services.plans import refund_quota
                refund_quota(db, job.user_id, (job.video_duration or 0.0) / 60.0)
                job.quota_consumed = False
                limit_refunded = True
            except Exception:
                pass
        msg = (
            f"Dublyaj bekor qilindi. Boshlang'ich bosqich ({initial_stage or 'boshlanish'}) "
            f"vaqti (30 soniya) ichida bekor qilingani uchun sarflangan daqiqalar hisobingizga to'liq qaytarildi."
        )
        status_msg = "Foydalanuvchi tomonidan bekor qilindi (daqiqalar qaytarildi)."
    else:
        logger.info(
            f"Job {job_id} bekor qilindi, lekin limit qaytarilmadi: {reason}"
        )
        msg = f"Dublyaj bekor qilindi. {reason}"
        status_msg = f"Foydalanuvchi tomonidan bekor qilindi (limit qaytarilmadi)."

    job.status = JobStatus.FAILED
    job.status_message = status_msg
    job.error_code = "USER_CANCELLED"
    job.error_message = msg
    job.updated_at = now_utc

    db.commit()

    # Bekor qilingan job hech qachon yakunlanmaydi — yarim qolgan yuklama
    # va sintez fayllarini darhol tozalaymiz.
    for base_dir in (settings.UPLOAD_DIR, settings.OUTPUT_DIR):
        job_dir = Path(base_dir) / str(job_id)
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir)
            except Exception:
                pass

    return {"success": True, "message": msg, "refunded": limit_refunded}


class PlatformFeedbackRequest(BaseModel):
    message: str
    rating: Optional[int] = None


@router.post("/platform-feedback", dependencies=[Depends(rate_limit("platform_feedback", 10, 600))])
def submit_platform_feedback(
    req: PlatformFeedbackRequest,
    current_user: Optional[User] = Depends(get_optional_user),
):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Fikr matni bo'sh bo'lmasligi kerak.")
    if req.rating is not None and (req.rating < 1 or req.rating > 5):
        raise HTTPException(status_code=400, detail="Baho 1 va 5 orasida bo'lishi kerak.")

    try:
        from backend.services.telegram_service import send_telegram_platform_feedback
        send_telegram_platform_feedback(
            message=message,
            rating=req.rating,
            user_email=current_user.email if current_user else None,
        )
    except Exception:
        pass

    return {"success": True, "message": "Fikringiz uchun rahmat!"}


class FeedbackRequest(BaseModel):
    rating: int  # 1 to 5
    comment: Optional[str] = None
    chat_id: Optional[str] = None
    voice_ok: Optional[bool] = None
    translation_ok: Optional[bool] = None
    speed_ok: Optional[bool] = None


@router.post("/jobs/{job_id}/feedback", dependencies=[Depends(rate_limit("feedback", 20, 600))])
def submit_feedback(
    job_id: uuid.UUID,
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Baho 1 va 5 orasida bo'lishi kerak.")

    # 2026-08-25: cancel_job bilan bir xil bag -- current_user tekshiruvi
    # yo'q edi, job_id'ni bilgan istalgan kishi boshqa birovning
    # baho/feedback'ini ustidan yozib qo'yishi mumkin edi.
    job = db.query(DubbingJob).filter(
        DubbingJob.id == job_id,
        DubbingJob.user_id == current_user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    job.rating = req.rating
    job.feedback_comment = req.comment
    job.feedback_created_at = datetime.utcnow()
    job.feedback_voice_ok = req.voice_ok
    job.feedback_translation_ok = req.translation_ok
    job.feedback_speed_ok = req.speed_ok
    db.commit()

    # Telegram xabarnoma yuborish
    try:
        from backend.services.telegram_service import send_telegram_feedback
        send_telegram_feedback(
            job_id=str(job.id),
            video_title=job.video_title or "Video",
            rating=req.rating,
            comment=req.comment,
            chat_id=req.chat_id,
            voice_ok=req.voice_ok,
            translation_ok=req.translation_ok,
            speed_ok=req.speed_ok,
            user_name=current_user.name if current_user else None,
            user_email=current_user.email if current_user else None,
            user_phone=current_user.phone if current_user else None,
            created_at_str=now_tashkent().strftime("%Y-%m-%d %H:%M"),
        )
    except Exception as err:
        pass

    return {"success": True, "message": "Fikringiz va baholashingiz uchun rahmat!"}


@router.get("/errors/{error_id}", response_class=HTMLResponse)
def view_error_log(error_id: str):
    import html
    import json
    from redis import Redis

    settings = get_settings()
    data = None
    if settings.REDIS_URL:
        try:
            r = Redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)
            raw = r.get(f"errlog:{error_id}")
            if raw:
                data = json.loads(raw)
        except Exception as e:
            logger.warning(f"Error logni Redisdan olishda xatolik: {e}")

    if not data:
        return HTMLResponse(
            status_code=404,
            content="""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Xatolik logi topilmadi</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { background: #1e293b; padding: 32px; border-radius: 12px; text-align: center; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); }
        h2 { color: #f87171; margin-top: 0; }
        p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="box">
        <h2>Xatolik logi topilmadi</h2>
        <p>Ushbu log eskirgan (7 kundan ortiq) yoki serverda mavjud emas.</p>
    </div>
</body>
</html>""",
        )

    exc_name = html.escape(data.get("exc_name") or "Xatolik")
    exc_msg = html.escape(data.get("exc_msg") or "")
    stage = html.escape(data.get("stage") or "Noma'lum")
    job_id = html.escape(data.get("job_id") or "-")
    user_name = html.escape(data.get("user_name") or "-")
    user_contact = html.escape(data.get("user_email_or_phone") or "")
    video_title = html.escape(data.get("video_title") or "-")
    video_url = data.get("video_url") or ""
    created_at = html.escape(data.get("created_at") or "")
    traceback_str = html.escape(data.get("traceback") or "Traceback mavjud emas")

    video_link_html = f'<a href="{html.escape(video_url)}" target="_blank" rel="noopener">{html.escape(video_url)}</a>' if video_url else "-"
    user_html = f"{user_name} (<code>{user_contact}</code>)" if user_contact else user_name

    og_title = f"🚨 {exc_name}: {exc_msg[:70]}"
    og_desc = f"Bosqich: {stage} | Video: {data.get('video_title') or '-'}"

    html_content = f"""<!DOCTYPE html>
<html lang="uz">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Xatolik: {exc_name}</title>
    <meta property="og:site_name" content="GapirAI.uz Error Log">
    <meta property="og:title" content="{html.escape(og_title)}">
    <meta property="og:description" content="{html.escape(og_desc)}">
    <meta name="robots" content="noindex, nofollow">
    <style>
        :root {{
            --bg: #090d16;
            --card: #131c2e;
            --border: #1e293b;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --accent-red: #ef4444;
            --code-bg: #050811;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 24px 16px;
            display: flex;
            justify-content: center;
        }}
        .container {{
            width: 100%;
            max-width: 900px;
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 24px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }}
        .header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border);
            padding-bottom: 16px;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 10px;
        }}
        .header h1 {{
            font-size: 1.25rem;
            color: var(--accent-red);
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            word-break: break-all;
        }}
        .badge {{
            background: rgba(239, 68, 68, 0.15);
            color: var(--accent-red);
            border: 1px solid rgba(239, 68, 68, 0.3);
            padding: 4px 10px;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
        }}
        .meta-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 12px;
            margin-bottom: 24px;
        }}
        .meta-card {{
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border);
            padding: 10px 14px;
            border-radius: 8px;
        }}
        .meta-card .label {{
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-muted);
            margin-bottom: 4px;
        }}
        .meta-card .value {{
            font-size: 0.9rem;
            color: var(--text);
            word-break: break-all;
        }}
        .meta-card a {{ color: #38bdf8; text-decoration: none; }}
        .meta-card a:hover {{ text-decoration: underline; }}
        .section-title {{
            font-size: 0.95rem;
            font-weight: 600;
            margin-bottom: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .copy-btn {{
            background: #1e293b;
            color: #cbd5e1;
            border: 1px solid #334155;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 0.78rem;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .copy-btn:hover {{ background: #334155; color: white; }}
        pre {{
            background: var(--code-bg);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 16px;
            overflow-x: auto;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.84rem;
            line-height: 1.55;
            color: #7dd3fc;
            white-space: pre-wrap;
            word-break: break-word;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 {exc_name}</h1>
            <span class="badge">{stage}</span>
        </div>
        <div class="meta-grid">
            <div class="meta-card">
                <div class="label">Sana / Vaqt</div>
                <div class="value">{created_at}</div>
            </div>
            <div class="meta-card">
                <div class="label">Foydalanuvchi</div>
                <div class="value">{user_html}</div>
            </div>
            <div class="meta-card">
                <div class="label">Video</div>
                <div class="value">{video_title}</div>
            </div>
            <div class="meta-card">
                <div class="label">Havola</div>
                <div class="value">{video_link_html}</div>
            </div>
            <div class="meta-card">
                <div class="label">Job ID</div>
                <div class="value"><code>{job_id}</code></div>
            </div>
            <div class="meta-card">
                <div class="label">Xatolik matni</div>
                <div class="value">{exc_msg}</div>
            </div>
        </div>
        <div class="section-title">
            <span>Traceback</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('tb').innerText); this.innerText='Nusxalandi!'; setTimeout(() => this.innerText='Nusxa olish', 2000)">Nusxa olish</button>
        </div>
        <pre id="tb">{traceback_str}</pre>
    </div>
</body>
</html>"""
    return HTMLResponse(content=html_content)



