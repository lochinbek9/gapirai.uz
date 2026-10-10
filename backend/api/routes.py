import asyncio
import logging
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, Response, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, defer
from pathlib import Path
from typing import Optional

from backend.models.database import get_db, SessionLocal, DubbingJob, JobStatus, User, ResolutionVariant
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
    video_duration: Optional[float] = None
    video_thumbnail: Optional[str] = None
    output_video_url: Optional[str] = None
    transcript_text: Optional[str] = None
    translated_text: Optional[str] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    created_at: Optional[str] = None
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
    # Faqat kutayotgan (PENDING) job egasiga, va navbat worker o'rinlaridan
    # uzunroq bo'lgandagina to'ldiriladi (backend/services/queue_load.py).
    queue_position: Optional[int] = None
    queue_eta_minutes: Optional[int] = None


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
    if status_str not in ("completed", "failed", "awaiting_payment"):
        duration = job.video_duration or 300.0
        baseline_dt = job.updated_at or job.created_at
        remaining_factor = max(0.1, (100.0 - live_progress) / 100.0)
        est_seconds = (30 + 0.3 * duration) * remaining_factor
        expected_dt = baseline_dt + timedelta(seconds=est_seconds)
        expected_end_time = expected_dt.isoformat() + "Z"

    return JobResponse(
        job_id=str(job.id),
        status=status_str,
        progress=round(live_progress, 1),
        status_message=job.status_message,
        youtube_url=job.youtube_url,
        video_title=job.video_title,
        video_duration=job.video_duration,
        video_thumbnail=job.video_thumbnail,
        output_video_url=job.output_video_url,
        transcript_text=None if redact else job.transcript_text,
        translated_text=job.translated_text,
        error_message=None if redact else job.error_message,
        error_code=None if redact else job.error_code,
        created_at=job.created_at.isoformat() if job.created_at else None,
        speaker_gender=job.speaker_gender,
        voice_gender_setting=job.voice_gender_setting,
        uzbek_srt_content=job.uzbek_srt_content,
        expected_end_time=expected_end_time,
        rating=None if redact else job.rating,
        feedback_comment=None if redact else job.feedback_comment,
        feedback_voice_ok=None if redact else job.feedback_voice_ok,
        feedback_translation_ok=None if redact else job.feedback_translation_ok,
        feedback_speed_ok=None if redact else job.feedback_speed_ok,
        content_flagged=job.content_flagged,
        linked_analysis_id=str(job.linked_analysis_id) if job.linked_analysis_id else None,
        subtitle_only=bool(job.subtitle_only),
        # "Video hech qachon serverga tushmadi" -- error_code'ning aniq
        # qaysi so'z bilan yozilganiga qaramasdan, o'zi to'liq va ishonchli
        # signal (agar TRANSCRIBE yoki keyingi bosqichda muvaffaqiyatsiz
        # bo'lgan bo'lsa, original_video_path allaqachon to'ldirilgan
        # bo'ladi). error_code ro'yxatiga qarab tekshirish - eski,
        # klassifikatordan OLDINGI "DOWNLOAD_FAILED" kabi qiymatlarni
        # noto'g'ri chetlab qo'ygan edi (2026-08-23 aniqlangan).
        fallback_available=status_str == "failed" and not job.original_video_path,
        fallback_reason="YOUTUBE_DOWNLOAD_FAILED" if status_str == "failed" and not job.original_video_path else None,
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
    source_language: Optional[str] = None,
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
        )
    finally:
        db.close()


@router.post("/jobs/upload", status_code=201, dependencies=[Depends(rate_limit("upload_job", 10, 600))])
async def upload_job_file(
    request: Request,
    subtitle_only: bool = Query(True),
    voice_gender: str = Query("auto"),
    source_language: str = Query("auto"),
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

    is_owner = current_user_id is not None and job.user_id == current_user_id
    if current_user_id is not None and not is_owner:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    if not is_owner:
        raw_status = job.status.value if hasattr(job.status, "value") else job.status
        if str(raw_status).upper() != "COMPLETED":
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
    return response


@router.get("/jobs")
def list_jobs(
    limit: int = Query(20, le=100),
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
    job = db.query(DubbingJob).filter(
        DubbingJob.id == job_id,
        DubbingJob.user_id == current_user.id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")
    db.delete(job)
    db.commit()


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


@router.get("/outputs/{job_id}/audio")
def download_audio(job_id: uuid.UUID, db: Session = Depends(get_db)):
    """Dublyaj qilingan audioni WAV formatida yuklab olish."""
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Audio hali tayyor emas.")

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
        raise HTTPException(status_code=404, detail="Audio fayl topilmadi.")
    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    filename = f"{safe_title or job_id}_audio.wav"
    return FileResponse(path=audio_path, media_type="audio/wav", filename=filename)


@router.get("/outputs/{job_id}/video")
def download_video(job_id: uuid.UUID, db: Session = Depends(get_db)):
    job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
    if not job or job.status != JobStatus.COMPLETED:
        raise HTTPException(status_code=404, detail="Video hali tayyor emas.")

    settings = get_settings()
    if settings.AWS_BUCKET_NAME:
        from backend.services.storage import generate_presigned_download_url, s3_object_exists
        s3_key = f"dubber/{job.storage_id}/dubbed_final.mp4"
        if not s3_object_exists(s3_key):
            raise HTTPException(status_code=410, detail="Video fayl endi mavjud emas — saqlash muddati tugagan.")
        presigned_url = generate_presigned_download_url(s3_key)
        if presigned_url:
            return Response(status_code=307, headers={"Location": presigned_url})

    video_path = job.output_video_path
    if not video_path or not Path(video_path).exists():
        raise HTTPException(status_code=404, detail="Video fayl topilmadi.")
    safe_title = re.sub(r'[^\w\s-]', '', job.video_title or str(job_id))[:50].strip()
    filename = f"dubbed_{safe_title or job_id}.mp4"
    return FileResponse(path=video_path, media_type="video/mp4", filename=filename)


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
    job = db.query(DubbingJob).filter(
        DubbingJob.id == job_id,
        DubbingJob.user_id == current_user.id,
    ).first()
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

    # Bekor qilingan job hech qachon yakunlanmaydi — yarim qolgan yuklama
    # va sintez fayllarini darhol tozalaymiz.
    for base_dir in (settings.UPLOAD_DIR, settings.OUTPUT_DIR):
        job_dir = Path(base_dir) / str(job_id)
        if job_dir.exists():
            try:
                shutil.rmtree(job_dir)
            except Exception:
                pass

    return {"success": True, "message": "Dublyaj bekor qilindi."}


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
        )
    except Exception as err:
        pass

    return {"success": True, "message": "Fikringiz va baholashingiz uchun rahmat!"}


