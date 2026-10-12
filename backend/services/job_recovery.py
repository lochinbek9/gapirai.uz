"""On-Demand (Talab bo'yicha) video tiklash xizmati.

Eskirgan yoki diskdan tozalangan YouTube videolarni foydalanuvchi murojaat
qilganda (GET /api/jobs/{id} yoki GET /api/outputs/{id}/video orqali) avtomatik
tarzda fonda qayta tiklaydi.

Xavfsizlik & Tejamkorlik kafolatlari:
1. FOYDALANUVCHI BALANSI / KVOTASI SARFLANMAYDI:
   Job avval yaratilganida kvota sarflangan (job.quota_consumed = True).
   Tiklash jarayonida yangi kvota yechilmaydi (consume_quota chaqirilmaydi).
2. QAYTA STT / TRANSLATE QILINMAYDI:
   Barcha transkript (job.transcript_segments) va tarjima (job.translated_segments)
   bazada saqlangani sababli OpenAI Whisper va GPT-4o bosqichlari to'liq
   o'tkazib yuboriladi (0 API xarajati).
3. FAQAT YOUTUBE VIDEOLAR:
   Yuklangan (upload://) videolarning asl manbasi serverdan o'chgan bo'lsa,
   ular qayta tiklanmaydi.
4. BIR MARTALIK CELERY ENQUEUE (REDIS LOCK):
   Bir vaqtning o'zida bir nechta so'rov kelsa yoki sahifa yangilansa ham,
   Redis lock (ondemand_recovery:{job_id}) orqali faqat 1 ta Celery vazifasi
   navbatga qo'yiladi.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from redis import Redis
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.database import DubbingJob, JobStatus
from backend.services.job_creation import is_valid_youtube_url

logger = logging.getLogger(__name__)
_settings = get_settings()
_redis: Optional[Redis] = None


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(_settings.REDIS_URL, decode_responses=True)
    return _redis


def is_output_video_missing(job: DubbingJob) -> bool:
    """Tekshiradi: agar job video yaratishi kerak bo'lgan job bo'lsa (subtitle_only emas),
    lekin uning diskdagi dubbed_final.mp4 fayli mavjud bo'lmasa True qaytaradi."""
    if job.subtitle_only:
        return False

    if job.output_video_path and Path(job.output_video_path).exists():
        return False

    storage_id = str(job.storage_id or job.id)
    candidate = Path(f"outputs/{storage_id}/video/dubbed_final.mp4")
    if candidate.exists():
        return False

    return True


def can_recover_job(job: DubbingJob) -> bool:
    """Tekshiradi: bu job on-demand tiklanishi mumkinmi?
    - subtitle_only emas
    - youtube_url haqiqiy YouTube havolasi
    - transkript VA tarjima segmentlari bazada to'liq mavjud (Whisper/GPT-4o qayta chaqirilmasligi uchun)
    """
    if job.subtitle_only:
        return False
    if not is_valid_youtube_url(job.youtube_url or ""):
        return False
    if not (job.transcript_segments and job.translated_segments):
        return False
    return True


def trigger_ondemand_recovery(db: Session, job: DubbingJob) -> bool:
    """Video fayli diskda yo'q bo'lsa va qayta tiklash mumkin bo'lsa,
    Celery taskni navbatga qo'yadi va job holatini DOWNLOADING ga o'tkazadi.
    Faqat bir marta Redis lock orqali ishga tushadi."""
    if not can_recover_job(job):
        return False

    master_id = str(job.storage_id or job.id)
    lock_key = f"ondemand_recovery:{master_id}"

    try:
        r = _get_redis()
        # Redis SET NX bilan 15 daqiqalik (900s) lock qo'yamiz
        acquired = r.set(lock_key, "1", nx=True, ex=900)
        if not acquired:
            logger.info(f"[RECOVERY] Job {master_id} allaqachon qayta tiklanmoqda.")
            return False
    except Exception as exc:
        logger.warning(f"[RECOVERY] Redis lock tekshirishda xatolik: {exc}")
        if job.status in (JobStatus.DOWNLOADING, JobStatus.SYNTHESIZING, JobStatus.MERGING):
            return False

    master_job = db.query(DubbingJob).filter(DubbingJob.id == master_id).first()
    if not master_job:
        master_job = job

    master_job.status = JobStatus.DOWNLOADING
    master_job.progress = 5.0
    master_job.status_message = "Video serverda qayta tiklanmoqda..."

    if str(job.id) != master_id:
        job.status = JobStatus.DOWNLOADING
        job.progress = 5.0
        job.status_message = "Video serverda qayta tiklanmoqda..."

    db.commit()

    from backend.workers.tasks import process_video
    from backend.services.plans import get_job_queue

    queue = get_job_queue(db, master_job.user_id)
    process_video.apply_async(args=[master_id], task_id=master_id, queue=queue)
    logger.info(f"[RECOVERY] Job {master_id} uchun qayta tiklash navbatga qo'yildi (queue={queue}).")
    return True
