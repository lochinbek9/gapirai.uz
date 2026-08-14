"""Dublyaj job yaratishning umumiy mantig'i — web API (routes.py) va Telegram
bot (telegram_bot.py) ikkalasi ham shu yerdan foydalanadi. Xatti-harakat
(video ma'lumot olish -> Safety Gate -> davomiylik chegarasi -> kvota ->
job yozish -> bepul bo'lsa darhol navbatga qo'yish) faqat BITTA joyda
yozilgan bo'lishi kerak — ikki joyda saqlansa, biri tuzatilib biri unutilib
qolish xavfi bor (masalan Safety Gate faqat bittasida bo'lib qolishi mumkin).
"""
from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse
import asyncio
import uuid

from sqlalchemy.orm import Session

from backend.models.database import DubbingJob, JobStatus, User, ContentViolation
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.downloader import get_video_info
from backend.services.content_safety import check_safety
from backend.services.click_service import generate_payment_url, normalize_uzs_amount
from backend.workers.tasks import process_video
from backend.config import get_settings

MAX_VIDEO_DURATION_MINUTES = 180  # routes.py bilan bir xil qiymat

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


Outcome = Literal["queued", "awaiting_payment", "blocked", "too_long", "invalid_url", "fetch_error"]


@dataclass
class JobCreationResult:
    outcome: Outcome
    job_id: str | None = None
    video_title: str | None = None
    duration_minutes: float | None = None
    amount: int | None = None
    error_detail: str | None = None


async def create_dubbing_job(db: Session, user: User, youtube_url: str, voice_gender: str = "auto") -> JobCreationResult:
    """Web (routes.py) va bot ikkalasi ham chaqiradigan yagona kirish nuqtasi.
    HTTPException ko'tarmaydi -- chaqiruvchi outcome'ga qarab o'zi (HTTP javob
    yoki Telegram xabari) ko'rinishini tanlaydi."""
    if not is_valid_youtube_url(youtube_url):
        return JobCreationResult(outcome="invalid_url")

    try:
        info = await asyncio.to_thread(get_video_info, youtube_url)
    except Exception as e:
        return JobCreationResult(outcome="fetch_error", error_detail=str(e))

    title = info.get("title", "Unknown")
    duration = info.get("duration", 0)
    thumbnail = info.get("thumbnail")
    duration_minutes = duration / 60.0

    # Safety Gate -- 1-bosqich (metadata).
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
        ))
        db.commit()
        return JobCreationResult(outcome="blocked", video_title=title)

    if duration_minutes > MAX_VIDEO_DURATION_MINUTES:
        return JobCreationResult(outcome="too_long", video_title=title, duration_minutes=duration_minutes)

    from backend.services.plans import check_quota, consume_quota, get_job_queue
    covered_by_quota, amount = check_quota(db, user.id, duration_minutes)

    job_id = str(uuid.uuid4())
    if amount > 0:
        status = JobStatus.AWAITING_PAYMENT
        status_message = "To'lov kutilmoqda"
    else:
        status = JobStatus.PENDING
        status_message = "Navbatga qo'shildi"

    job = DubbingJob(
        id=job_id,
        user_id=user.id,
        youtube_url=youtube_url,
        video_title=title,
        video_duration=duration,
        video_thumbnail=thumbnail,
        voice_gender_setting=voice_gender,
        status=status,
        progress=0.0,
        status_message=status_message,
    )
    db.add(job)
    db.commit()

    if amount == 0:
        if covered_by_quota:
            consume_quota(db, user.id, duration_minutes)
        process_video.apply_async(args=[job_id], task_id=job_id, queue=get_job_queue(db, user.id))
        return JobCreationResult(outcome="queued", job_id=job_id, video_title=title, duration_minutes=duration_minutes)

    return JobCreationResult(outcome="awaiting_payment", job_id=job_id, video_title=title, duration_minutes=duration_minutes, amount=amount)


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
