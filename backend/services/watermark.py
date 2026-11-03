"""Suv belgisi istisnolari (hamkorlar) -- backend/models/database.py: WatermarkExemption.

Kesh bilan bog'liq ikki qoida (backend/services/job_creation.py):
- istisno qilingan foydalanuvchi boshqalarning (belgili) tayyor nusxasini olmaydi --
  uning videosi har doim o'zi uchun belgisiz yig'iladi;
- boshqa foydalanuvchi hamkorning belgisiz videosini keshdan olmaydi.
"""
from sqlalchemy.orm import Session

from backend.models.database import DubbingJob, WatermarkExemption


def is_watermark_exempt(db: Session, user_id) -> bool:
    if not user_id:
        return False
    return db.get(WatermarkExemption, user_id) is not None


def is_cache_compatible(db: Session, user_id, cached_job: DubbingJob) -> bool:
    """Kesh-hit faqat belgi holati bir xil bo'lsa: ikkalasi ham belgili yoki ikkalasi ham belgisiz."""
    root = cached_job
    if cached_job.source_job_id:
        root = db.get(DubbingJob, cached_job.source_job_id) or cached_job
    return is_watermark_exempt(db, user_id) == is_watermark_exempt(db, root.user_id)
