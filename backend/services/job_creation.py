"""Dublyaj job yaratishning umumiy mantig'i — web API (routes.py) va Telegram
bot (telegram_bot.py) ikkalasi ham shu yerdan foydalanadi. Xatti-harakat
(video ma'lumot olish -> Safety Gate -> davomiylik chegarasi -> kvota ->
job yozish -> bepul bo'lsa darhol navbatga qo'yish) faqat BITTA joyda
yozilgan bo'lishi kerak — ikki joyda saqlansa, biri tuzatilib biri unutilib
qolish xavfi bor (masalan Safety Gate faqat bittasida bo'lib qolishi mumkin).
"""
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse
import asyncio
import logging
import re
import subprocess
import uuid

logger = logging.getLogger(__name__)

from sqlalchemy.orm import Session

from backend.models.database import DubbingJob, JobStatus, User, ContentViolation
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.downloader import get_video_info
from backend.services.content_safety import check_safety
from backend.services.click_service import generate_payment_url, normalize_uzs_amount
from backend.services.storage import s3_object_exists
from backend.workers.tasks import process_video
from backend.config import get_settings

# Bitta job uchun maksimal video davomiyligi -- plans.MAX_JOB_MINUTES bilan
# bir xil (2026-08-31: 180 -> 120). routes.py bu qiymatni shu yerdan import qiladi.
from backend.services.plans import MAX_JOB_MINUTES as MAX_VIDEO_DURATION_MINUTES, is_user_admin

# LEGACY (2026-08-31 gacha): kesh-hit uchun qat'iy narx. Endi kesh-hit ham
# oddiy job kabi DAQIQA sarflaydi (alohida narx yo'q). Konstanta faqat eski
# to'lov-route importlari buzilmasligi uchun qoldirilgan.
CACHE_HIT_PRICE = 5_000

# routes.py bilan bir xil ro'yxat -- shu yerda yagona manba, routes.py
# bundan import qiladi (ikki joyda saqlanib, biri unutilib qolmasligi uchun).
YOUTUBE_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com",
    "music.youtube.com", "youtu.be",
}


def is_valid_youtube_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    return parsed.netloc.lower() in YOUTUBE_HOSTS


_VIDEO_ID_RE = re.compile(
    r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|shorts/|embed/)|music\.youtube\.com/watch\?v=)"
    r"([A-Za-z0-9_-]{11})"
)


def extract_youtube_video_id(url: str) -> str | None:
    """URL matnining o'zidan (tarmoq so'rovisiz) 11-belgili YouTube video ID
    ajratadi -- barcha shakllarni (youtu.be, watch?v=, shorts/, embed/) bitta
    ID'ga tushiradi. Kesh qidiruvi shu orqali YouTube'ga so'rov yubormasdan
    ishlaydi (backend/models/database.py: DubbingJob.youtube_video_id)."""
    m = _VIDEO_ID_RE.search(url or "")
    return m.group(1) if m else None


def _cached_job_files_exist(cached_job: DubbingJob) -> bool:
    """Kesh-hit nomzodning tayyor video fayli hali haqiqatan mavjudligini
    tekshiradi -- resolution_variants.py:request_resolution bilan bir xil
    naqsh (master fayl S3'da bormi). cached_job.storage_id orqali (kesh
    zanjiridan qat'i nazar ASL ildiz job) tekshiradi, chunki kesh-hit
    joblarning o'zi hech qachon S3'ga fayl yuklamaydi.

    Buning yo'qligi ilgari tekshirilmagan edi (2026-08-24 aniqlangan bag):
    create_dubbing_job() COMPLETED holatidagi istalgan mos job'ni keshdan
    qaytarardi, garchi uning S3 lifecycle (3 kun) bo'yicha allaqachon
    o'chirilgan bo'lishidan qat'i nazar -- foydalanuvchi "tayyor" job olib,
    keyin video/audio yuklashda darhol 410 bilan yiqilardi."""
    settings = get_settings()
    storage_id = cached_job.storage_id
    if settings.AWS_BUCKET_NAME:
        return s3_object_exists(f"dubber/{storage_id}/dubbed_final.mp4")
    video_path = cached_job.output_video_path
    return bool(video_path) and Path(video_path).exists()


Outcome = Literal[
    "queued", "ready", "insufficient_minutes", "blocked", "too_long",
    "invalid_url", "fetch_error", "bad_file", "daily_limit",
    "active_limit", "queue_full",
]


@dataclass
class JobCreationResult:
    outcome: Outcome
    job_id: str | None = None
    video_title: str | None = None
    duration_minutes: float | None = None
    amount: int | None = None
    error_detail: str | None = None
    minutes_short: int | None = None  # outcome="insufficient_minutes" uchun
    daily_limit: int | None = None    # outcome="daily_limit" uchun (chegara qiymati)
    active_limit: int | None = None   # outcome="active_limit" uchun (bir vaqtdagi faol job chegarasi)
    queue_wait_minutes: int | None = None  # outcome="queue_full" uchun (taxminiy kutish)


def check_queue_capacity(db: Session, user_id) -> "JobCreationResult | None":
    if is_user_admin(db, user_id):
        return None
    from backend.services import queue_load
    limit = queue_load.active_limit_reached(db, user_id)
    if limit is not None:
        return JobCreationResult(outcome="active_limit", active_limit=limit)
    wait = queue_load.overload_wait_minutes(db, user_id)
    if wait is not None:
        return JobCreationResult(outcome="queue_full", queue_wait_minutes=wait)
    return None


def queue_rejection_message(result: "JobCreationResult") -> str:
    """active_limit / queue_full uchun foydalanuvchiga ko'rsatiladigan matn --
    veb (HTTP detail) va Telegram bot bir xil gapirishi uchun bitta joyda."""
    from backend.services import queue_load
    if result.outcome == "active_limit":
        return (
            f"Sizda allaqachon {result.active_limit} ta video ishlanmoqda. "
            "Ulardan biri tugagach yangisini yuborishingiz mumkin."
        )
    return (
        "Hozir server juda band — navbat uzun "
        f"(taxminiy kutish: {queue_load.format_wait(result.queue_wait_minutes or 1)}). "
        "Iltimos, birozdan so'ng qayta urinib ko'ring."
    )


def _daily_job_limit_reached(db: Session, user_id) -> bool:
    if is_user_admin(db, user_id):
        return False
    limit = get_settings().MAX_JOBS_PER_DAY
    if not limit or limit <= 0:
        return False
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=24)
    count = (
        db.query(DubbingJob)
        .filter(
            DubbingJob.user_id == user_id,
            DubbingJob.created_at >= since,
            DubbingJob.status != JobStatus.FAILED,
        )
        .count()
    )
    return count >= limit


def _quota_or_autotopup(db: Session, user_id, duration_minutes: float) -> tuple[bool, int]:
    """check_quota() — daqiqa yetmasa va foydalanuvchi avtomatik to'ldirishni
    yoqgan bo'lsa (Subscription.auto_topup_enabled + bog'langan karta), bir
    marta avtomatik paket sotib olishga urinadi va qayta tekshiradi
    (backend/services/recurring.py). Aks holda (covered, shortfall) qaytadi."""
    from backend.services.plans import check_quota
    covered, minutes_short = check_quota(db, user_id, duration_minutes)
    if covered:
        return True, 0
    try:
        from backend.services.recurring import try_auto_topup
        if try_auto_topup(db, user_id, minutes_short):
            return check_quota(db, user_id, duration_minutes)
    except Exception as e:  # avtomatik to'ldirish hech qachon job yaratishni buzmasin
        logger.warning("Auto top-up urinishi xato bilan tugadi user=%s: %s", user_id, e)
    return covered, minutes_short


async def create_dubbing_job(
    db: Session, user: User, youtube_url: str, voice_gender: str = "male", subtitle_only: bool = False,
    source_language: str | None = None,
) -> JobCreationResult:
    """Web (routes.py) va bot ikkalasi ham chaqiradigan yagona kirish nuqtasi.
    HTTPException ko'tarmaydi -- chaqiruvchi outcome'ga qarab o'zi (HTTP javob
    yoki Telegram xabari) ko'rinishini tanlaydi.

    subtitle_only=True -- "Subtitr" rejimi (2026-09-16): dublyaj audiosi/
    videosi yaratilmaydi, faqat transkripsiya+tarjima+VTT/SRT (process_video()
    TRANSLATE bosqichidan keyin darhol COMPLETED qiladi, tasks.py).
    source_language="uz" (faqat subtitle_only bilan) -- video o'zbekcha nutqli: o'zbekcha STT, TARJIMASIZ."""
    if not is_valid_youtube_url(youtube_url):
        return JobCreationResult(outcome="invalid_url")

    if _daily_job_limit_reached(db, user.id):
        return JobCreationResult(outcome="daily_limit", daily_limit=get_settings().MAX_JOBS_PER_DAY)

    # Kesh: agar shu video ALLAQACHON (istalgan foydalanuvchi tomonidan)
    # dublyaj qilingan bo'lsa, YouTube'ga so'rov yubormasdan (video ID
    # URL matnining o'zidan ajratiladi) va Safety Gate'ni qayta ishlatmasdan
    # tayyor natijani arzon narxda taqdim etamiz (2026-08-15, foydalanuvchi
    # so'rovi -- YouTube bot-check va OpenAI xarajatini ham kamaytiradi).
    # subtitle_only so'rovlari kesh'ni chetlab o'tadi (2026-09-16) -- to'liq
    # dublyaj keshidan subtitr olish o'zi xavfsiz bo'lardi (audio ortiqcha,
    # zarar yo'q), lekin buni to'g'ri sinash uchun _create_job_from_cache()ni
    # ham subtitle_only bilan mos qilish kerak edi; V1'da soddalik uchun
    # har doim yangi (tez, TTS'siz) ishlov beriladi.
    video_id = extract_youtube_video_id(youtube_url)
    if video_id and not subtitle_only:
        cache_query = db.query(DubbingJob).filter(
            DubbingJob.youtube_video_id == video_id,
            DubbingJob.status == JobStatus.COMPLETED,
            # Faqat TO'LIQ dublyaj qilingan (audio/video mavjud) joblar --
            # subtitle_only=True keshi audio/videoga ega emas, to'liq
            # dublyaj so'rovini noto'g'ri "tayyor" deb belgilamasligi kerak.
            DubbingJob.subtitle_only.is_(False),
        )
        if voice_gender in ("male", "female"):
            cache_query = cache_query.filter(DubbingJob.speaker_gender == voice_gender)
        cached_job = cache_query.order_by(DubbingJob.completed_at.desc()).first()
        if cached_job and _cached_job_files_exist(cached_job):
            return await _create_job_from_cache(db, user, youtube_url, cached_job, voice_gender)

    rejection = check_queue_capacity(db, user.id)
    if rejection:
        return rejection

    try:
        info = await asyncio.to_thread(get_video_info, youtube_url)
    except Exception as e:
        # Xom kutubxona xatosini (yt-dlp/YouTube API) foydalanuvchiga
        # ko'rsatmaymiz -- faqat serverda log qilamiz, xavfsiz umumiy
        # xabar qaytaramiz (backend/api/routes.py va telegram_bot.py
        # ikkalasi ham shu error_detail'ni to'g'ridan-to'g'ri ko'rsatadi).
        logger.exception(f"get_video_info xato: {youtube_url}")
        return JobCreationResult(
            outcome="fetch_error",
            error_detail="Video ma'lumotlarini olib bo'lmadi. Havola to'g'riligini tekshiring yoki birozdan so'ng qaytadan urinib ko'ring.",
        )

    title = info.get("title", "Unknown")
    duration = info.get("duration", 0)
    thumbnail = info.get("thumbnail")
    duration_minutes = duration / 60.0

    # Safety Gate -- 1-bosqich (metadata). Faqat CSAM (sexual_minors)
    # hali ham bloklaydi -- qolgan kategoriyalar endi faqat ogohlantirish
    # sifatida qayd etiladi (blocked=False), job yaratishni davom ettiradi.
    metadata_text = f"{title}\n{info.get('description', '')}\nKanal: {info.get('uploader', '')}"
    safety = check_safety(metadata_text)
    if not safety.allowed:
        db.add(ContentViolation(
            user_id=user.id,
            youtube_url=youtube_url,
            video_title=title,
            stage="metadata",
            category=safety.category or "policy_violation",
            reason=safety.reason or "",
            blocked=True,
        ))
        db.commit()
        try:
            from backend.services.telegram_notify import send_content_blocked_to_admins
            send_content_blocked_to_admins(
                video_url=youtube_url,
                video_title=title,
                category=safety.category,
                reason=safety.reason,
                stage="metadata",
                user_id=str(user.id) if user else None,
                user_name=user.name if user else None,
                user_email_or_phone=user.email or user.phone if user else None,
            )
        except Exception as e:
            logger.error(f"Moderatsiya admin xabarini yuborishda xatolik: {e}")
        return JobCreationResult(
            outcome="blocked",
            video_title=title,
            error_detail=safety.reason or "Ushbu video GapirAI.uz kontent siyosatiga mos kelmagani sababli dublaj qilinmaydi.",
        )
    metadata_flagged = bool(safety.category)
    if safety.category:
        db.add(ContentViolation(
            user_id=user.id,
            youtube_url=youtube_url,
            video_title=title,
            stage="metadata",
            category=safety.category,
            reason=safety.reason or "",
            blocked=False,
        ))
        db.commit()

    if duration_minutes > MAX_VIDEO_DURATION_MINUTES:
        return JobCreationResult(outcome="too_long", video_title=title, duration_minutes=duration_minutes)

    from backend.services.plans import check_quota, consume_quota, get_job_queue
    covered, minutes_short = _quota_or_autotopup(db, user.id, duration_minutes)
    if not covered:
        # Daqiqa yetmadi -- job yaratilmaydi. Frontend "Buy additional minutes"
        # CTA'sini ko'rsatadi (backend/api/minutes_routes.py orqali paket sotib olinadi).
        return JobCreationResult(
            outcome="insufficient_minutes",
            video_title=title,
            duration_minutes=duration_minutes,
            minutes_short=minutes_short,
        )

    job_id = str(uuid.uuid4())
    job = DubbingJob(
        id=job_id,
        user_id=user.id,
        youtube_url=youtube_url,
        youtube_video_id=video_id,
        video_title=title,
        video_duration=duration,
        video_thumbnail=thumbnail,
        voice_gender_setting=voice_gender,
        status=JobStatus.PENDING,
        progress=0.0,
        status_message="Navbatga qo'shildi",
        content_flagged=metadata_flagged,
        subtitle_only=subtitle_only,
        source_language="uz" if (subtitle_only and source_language == "uz") else None,
    )
    db.add(job)
    db.commit()

    consume_quota(db, user.id, duration_minutes)
    job.quota_consumed = True
    db.commit()
    process_video.apply_async(args=[job_id], task_id=job_id, queue=get_job_queue(db, user.id))
    return JobCreationResult(outcome="queued", job_id=job_id, video_title=title, duration_minutes=duration_minutes)


def _media_duration_seconds(path: Path) -> float | None:
    """api/routes.py:_get_media_duration_seconds bilan bir xil -- ffprobe
    orqali. Xato bo'lsa None."""
    try:
        import json as _json
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
            capture_output=True, text=True, check=True, timeout=10,
        )
        return float(_json.loads(result.stdout)["format"]["duration"])
    except Exception:
        return None


def _extract_audio_wav(video_path: Path, audio_path: Path) -> bool:
    """api/routes.py:upload_video_fallback bilan bir xil ffmpeg buyrug'i --
    transkripsiya aynan shu formatdagi WAV faylni kutadi (16kHz mono PCM).
    Muvaffaqiyatsiz bo'lsa False (fayl buzilgan/qo'llab-quvvatlanmaydigan)."""
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", str(video_path), "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(audio_path)],
        capture_output=True, text=True,
    )
    return proc.returncode == 0


def create_job_from_local_video_file_sync(
    db: Session, user: User, job_id: str, video_path: Path, source_url: str, voice_gender: str = "male",
    subtitle_only: bool = False, video_title: str | None = None, source_language: str | None = None,
) -> JobCreationResult:
    """Diskda allaqachon mavjud video fayldan (YouTube havolasisiz) yangi job
    yaratadi -- Telegram bot (backend/telegram_bot.py:handle_video) foydalanuvchi
    video faylni to'g'ridan-to'g'ri yuborganda shu orqali ishlaydi (2026-09-04).

    api/routes.py:upload_video_fallback bilan bir xil fayl->audio mantig'i
    (video_path chaqiruvchi tomonidan allaqachon diskka yozilgan bo'lishi
    kerak -- job_id bilan nomlangan papkada), create_dubbing_job bilan bir
    xil davomiylik/kvota tekshiruvi.

    Metadata (sarlavha/tavsif) Safety Gate BU YERDA yo'q -- fayl yuklashda
    metadata umuman mavjud emas. Transkripsiyadan keyingi Safety Gate
    (backend/workers/tasks.py, "transcript" bosqichi) esa BARCHA joblar uchun
    -- manbasidan qat'i nazar -- o'zgarishsiz, shartsiz ishlaydi va aynan shu
    yo'lni ham to'liq qamrab oladi.

    Bu SINXRON yadro: FastAPI (POST /api/jobs/upload) uni threadpool'da
    chaqiradi, Telegram bot esa pastdagi async o'ram orqali. subtitle_only=True
    -- "Subtitr" rejimi (dublyaj audiosi/videosi yo'q); video_title -- yuklangan
    fayl nomi (YouTube'dagi sarlavha o'rniga natija sahifasida ko'rsatiladi)."""
    if _daily_job_limit_reached(db, user.id):
        video_path.unlink(missing_ok=True)
        return JobCreationResult(outcome="daily_limit", daily_limit=get_settings().MAX_JOBS_PER_DAY)

    rejection = check_queue_capacity(db, user.id)
    if rejection:
        video_path.unlink(missing_ok=True)
        return rejection

    duration = _media_duration_seconds(video_path)
    if not duration:
        video_path.unlink(missing_ok=True)
        return JobCreationResult(outcome="bad_file")

    duration_minutes = duration / 60.0
    if duration_minutes > MAX_VIDEO_DURATION_MINUTES:
        video_path.unlink(missing_ok=True)
        return JobCreationResult(outcome="too_long", duration_minutes=duration_minutes)

    covered, minutes_short = _quota_or_autotopup(db, user.id, duration_minutes)
    if not covered:
        video_path.unlink(missing_ok=True)
        return JobCreationResult(
            outcome="insufficient_minutes", duration_minutes=duration_minutes, minutes_short=minutes_short,
        )

    job_dir = video_path.parent.parent if video_path.parent.name == "video" else video_path.parent
    audio_path = job_dir / "audio.wav"
    if not _extract_audio_wav(video_path, audio_path):
        video_path.unlink(missing_ok=True)
        return JobCreationResult(outcome="bad_file")

    try:
        from backend.services.job_checkpoint import save_checkpoint
        save_checkpoint(job_id, "video.mp4", str(video_path))
        save_checkpoint(job_id, "audio.wav", str(audio_path))
    except Exception:
        pass

    from backend.services.plans import consume_quota, LOCAL_UPLOAD_QUEUE

    job = DubbingJob(
        id=job_id,
        user_id=user.id,
        youtube_url=source_url,
        video_title=video_title,
        video_duration=duration,
        voice_gender_setting=voice_gender,
        subtitle_only=subtitle_only,
        source_language="uz" if (subtitle_only and source_language == "uz") else None,
        original_video_path=str(video_path),
        status=JobStatus.PENDING,
        progress=0.0,
        status_message="Navbatga qo'shildi",
    )
    db.add(job)
    db.commit()

    consume_quota(db, user.id, duration_minutes)
    job.quota_consumed = True
    db.commit()
    # Doim LOCAL_UPLOAD_QUEUE — get_job_queue()'ning Pro/Free navbatlari emas,
    # chunki bu job'ning video fayli faqat SHU hostning diskida bor (yuqoridagi
    # original_video_path). Agar scaling uchun qo'shilgan boshqa worker host bu
    # job'ni olib ketsa, faylni topolmay xato beradi (tasks.py DOWNLOAD bosqichi).
    process_video.apply_async(args=[job_id], task_id=job_id, queue=LOCAL_UPLOAD_QUEUE)
    return JobCreationResult(outcome="queued", job_id=job_id, duration_minutes=duration_minutes)


async def create_job_from_local_video_file(
    db: Session, user: User, job_id: str, video_path: Path, source_url: str, voice_gender: str = "auto",
    subtitle_only: bool = False, video_title: str | None = None, source_language: str | None = None,
) -> JobCreationResult:
    """Telegram bot (async) uchun o'ram -- mantiq yuqoridagi sinxron yadroda."""
    return create_job_from_local_video_file_sync(
        db, user, job_id, video_path, source_url, voice_gender,
        subtitle_only=subtitle_only, video_title=video_title, source_language=source_language,
    )


def precheck_local_upload(db: Session, user_id) -> "JobCreationResult | None":
    """Fayl yuklash BOSHLANMASDAN oldin arzon tekshiruvlar: kunlik chegara,
    navbat himoyasi va daqiqa qoldig'i. Maqsad -- foydalanuvchi 1 GB videoni
    yuklab bo'lgach "daqiqangiz qolmagan" degan rad javobini olmasligi va
    serverimiz ortiqcha trafik/disk sarflamasligi (Telegram bot ham faylni
    yuklashdan oldin xuddi shunday tekshiradi). Aniq davomiylik/kvota
    tekshiruvi baribir yuklashdan KEYIN (create_job_from_local_video_file_sync)."""
    if _daily_job_limit_reached(db, user_id):
        return JobCreationResult(outcome="daily_limit", daily_limit=get_settings().MAX_JOBS_PER_DAY)
    rejection = check_queue_capacity(db, user_id)
    if rejection:
        return rejection
    from backend.services.plans import get_minute_balance, get_or_create_subscription
    balance = get_minute_balance(db, user_id)
    if balance["total_available"] < 0.5:
        sub = get_or_create_subscription(db, user_id)
        # Avtomatik to'ldirish yoqilgan bo'lsa (_quota_or_autotopup) daqiqa
        # yuklashdan keyin o'zi to'ldiriladi -- oldindan rad qilmaymiz.
        if not getattr(sub, "auto_topup_enabled", False):
            return JobCreationResult(outcome="insufficient_minutes")
    return None


async def _create_job_from_cache(db: Session, user: User, youtube_url: str, cached_job: DubbingJob, voice_gender: str) -> JobCreationResult:
    """Kesh-hit uchun job yaratadi -- matn maydonlarini (transkript/tarjima/
    subtitr) nusxalaydi, lekin video/audio S3 fayllarini NUSXALAMAYDI --
    source_job_id orqali asl job'ga ishora qiladi (DubbingJob.storage_id
    shu orqali S3 kalitini to'g'ri hisoblaydi)."""
    duration_minutes = cached_job.video_duration / 60.0

    from backend.services.plans import check_quota, consume_quota
    covered, minutes_short = _quota_or_autotopup(db, user.id, duration_minutes)
    if not covered:
        return JobCreationResult(
            outcome="insufficient_minutes",
            video_title=cached_job.video_title,
            duration_minutes=duration_minutes,
            minutes_short=minutes_short,
        )

    job_id = str(uuid.uuid4())
    job = DubbingJob(
        id=job_id,
        user_id=user.id,
        youtube_url=youtube_url,
        youtube_video_id=cached_job.youtube_video_id,
        # cached_job.id EMAS -- cached_job o'zi ham kesh-hit bo'lishi mumkin
        # (2026-08-21 topilgan zanjir bagi). storage_id har doim ASL ildizga
        # ishora qiladi, shuning uchun yangi job to'g'ridan-to'g'ri o'sha
        # ildizga bog'lanadi va zanjir uzunligi o'smaydi.
        source_job_id=cached_job.storage_id,
        video_title=cached_job.video_title,
        video_duration=cached_job.video_duration,
        video_thumbnail=cached_job.video_thumbnail,
        speaker_gender=cached_job.speaker_gender,
        voice_gender_setting=voice_gender,
        transcript_text=cached_job.transcript_text,
        translated_text=cached_job.translated_text,
        srt_content=cached_job.srt_content,
        uzbek_srt_content=cached_job.uzbek_srt_content,
        output_video_path=cached_job.output_video_path or f"outputs/{cached_job.storage_id}/video/dubbed_final.mp4",
        output_video_url=cached_job.output_video_url or f"/outputs/{cached_job.storage_id}/video/dubbed_final.mp4",
        dubbed_audio_path=cached_job.dubbed_audio_path or f"outputs/{cached_job.storage_id}/audio/dubbed_audio.wav",
        status=JobStatus.PENDING,
        progress=100.0,
        status_message="Tayyorlanmoqda...",
    )
    db.add(job)
    db.commit()

    consume_quota(db, user.id, duration_minutes)
    job.quota_consumed = True
    job.status = JobStatus.COMPLETED
    job.status_message = "Dublyaj tayyor!"
    job.completed_at = datetime.utcnow()
    db.commit()
    return JobCreationResult(outcome="ready", job_id=job_id, video_title=cached_job.video_title, duration_minutes=duration_minutes)


def create_click_payment(db: Session, job: DubbingJob, amount: int, return_url: str) -> str:
    """AWAITING_PAYMENT holatidagi job uchun Click to'lov havolasini
    yaratadi/qayta ishlatadi -- click_routes.py:initiate_payment bilan bir
    xil mantiq (paid branch), bot uchun alohida."""
    settings = get_settings()

    existing_approved = db.query(Payment).filter(
        Payment.job_id == job.id, Payment.status == PaymentStatus.APPROVED
    ).first()
    if existing_approved:
        return ""

    payment = db.query(Payment).filter(
        Payment.job_id == job.id, Payment.status == PaymentStatus.PENDING
    ).first()

    import time
    if not payment:
        payment = Payment(
            user_id=job.user_id,
            job_id=job.id,
            amount=amount,
            provider=PaymentProvider.CLICK,
            status=PaymentStatus.PENDING,
            click_create_time=int(time.time()),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
    elif normalize_uzs_amount(payment.amount) != amount:
        payment.amount = amount
        payment.click_create_time = int(time.time())
        db.commit()
        db.refresh(payment)

    merchant_id = settings.CLICK_MERCHANT_ID or "56653"
    service_id = settings.CLICK_SERVICE_ID or "108780"
    merchant_user_id = getattr(settings, "CLICK_MERCHANT_USER_ID", "") or "89102"

    return generate_payment_url(
        merchant_id=merchant_id,
        service_id=service_id,
        transaction_param=str(payment.id),
        amount=amount,
        return_url=return_url,
        merchant_user_id=merchant_user_id,
    )
