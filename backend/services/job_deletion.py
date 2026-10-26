"""Dublyaj job'ini o'chirish (foydalanuvchi va admin panel uchun bitta mantiq).

Kesh-hit job'lar (DubbingJob.source_job_id) o'z fayllariga ega emas -- ular
ASL job'ning fayllariga ishora qiladi (S3 ``dubber/<asl-id>/...``, disk
``outputs/<asl-id>/...``, ResolutionVariant.job_id = asl-id). Shuning uchun:

- nusxani o'chirish faqat uning yozuvini o'chiradi, fayllarga tegmaydi;
- nusxalari bor ASL job o'chirilsa, eng birinchi nusxa yangi asl
  ("merosxo'r") bo'ladi: fayllar uning ID'siga ko'chiriladi, qolgan nusxalar
  unga ulanadi. Aks holda boshqa foydalanuvchilarning videolari buzilardi
  (2026-10-24 gacha shunday edi);
- nusxasiz ASL job o'chirilsa, uning barcha fayllari (sifat variantlari
  bilan birga) o'chiriladi.
"""
import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.database import DubbingJob, ResolutionVariant

logger = logging.getLogger(__name__)

S3_PREFIX = "dubber"
CHECKPOINT_PREFIX = "dubber-checkpoints"
_PATH_FIELDS = ("output_video_path", "output_video_url", "dubbed_audio_path", "original_video_path")


class JobDeletionError(Exception):
    """O'chirish boshlanmasdan yoki orqaga qaytarilgandan keyin ko'tariladi --
    baza va fayllar o'zgarmagan holatda qoladi."""


@dataclass
class DeleteImpact:
    is_copy: bool       # kesh nusxasi -- faqat yozuv o'chadi
    copies: int         # bu ASL job'ga ishora qiluvchi boshqa job'lar soni
    is_public: bool


def delete_impact(db: Session, job: DubbingJob) -> DeleteImpact:
    copies = 0
    if job.source_job_id is None:
        copies = db.query(DubbingJob).filter(DubbingJob.source_job_id == job.id).count()
    return DeleteImpact(is_copy=job.source_job_id is not None, copies=copies, is_public=bool(job.is_public))


def _output_dir(job_id: str) -> Path:
    return Path(get_settings().OUTPUT_DIR) / job_id


def _replace_id(value, old: str, new: str):
    return value.replace(old, new) if isinstance(value, str) and old in value else value


def _move_s3(old: str, new: str) -> list[str] | None:
    """``dubber/<old>/`` ostidagi obyektlarni ``dubber/<new>/`` ga nusxalaydi.
    Nusxalangan yangi kalitlarni qaytaradi (orqaga qaytarish uchun); None --
    nusxalash muvaffaqiyatsiz (yarim nusxalanganlar o'chirib qo'yilgan)."""
    from backend.services.storage import copy_s3_object, delete_file_from_s3, list_s3_keys

    keys = list_s3_keys(f"{S3_PREFIX}/{old}/")
    if keys is None:
        # S3 sozlanmagan yoki ishlamayapti -- fayllar faqat diskda, ko'chirishga narsa yo'q
        return []
    copied: list[str] = []
    for key in keys:
        dst = f"{S3_PREFIX}/{new}/" + key[len(f"{S3_PREFIX}/{old}/"):]
        if not copy_s3_object(key, dst):
            for c in copied:
                delete_file_from_s3(c)
            return None
        copied.append(dst)
    return copied


def _refresh_public_marker(db: Session, storage_id: str) -> None:
    from sqlalchemy import or_
    from backend.scripts.disk_cleanup import PUBLIC_MARKER

    marker = _output_dir(storage_id) / PUBLIC_MARKER
    sid = uuid.UUID(storage_id)
    still_public = db.query(DubbingJob.id).filter(
        DubbingJob.is_public.is_(True),
        or_(DubbingJob.id == sid, DubbingJob.source_job_id == sid),
    ).first()
    try:
        if still_public and marker.parent.is_dir():
            marker.touch(exist_ok=True)
        elif not still_public:
            marker.unlink(missing_ok=True)
    except OSError as e:
        logger.warning(f"Public marker ({storage_id}): {e}")


def _cancel_task(job_id: str) -> None:
    try:
        from backend.workers.celery_app import celery_app
        celery_app.control.revoke(job_id, terminate=True)
    except Exception as e:
        logger.warning(f"Celery taskini bekor qilishda xatolik ({job_id}): {e}")


def _detach_payments(db: Session, job_id) -> None:
    try:
        from backend.models.payment import Payment
        db.query(Payment).filter(Payment.job_id == job_id).update({Payment.job_id: None})
    except Exception:
        pass


def _remove_own_scratch(job_id: str) -> None:
    """Job'ning o'z ID'si ostidagi vaqtinchalik fayllar (checkpointlar, /tmp)."""
    from backend.services.storage import delete_s3_prefix
    try:
        delete_s3_prefix(f"{CHECKPOINT_PREFIX}/{job_id}/")
    except Exception as e:
        logger.warning(f"Checkpointlarni tozalashda xatolik ({job_id}): {e}")
    shutil.rmtree(Path("/tmp/dubber") / job_id, ignore_errors=True)


def delete_job(db: Session, job: DubbingJob) -> DeleteImpact:
    """Job'ni o'chiradi. Xatoda JobDeletionError (baza o'zgarmagan)."""
    job_id = str(job.id)
    impact = delete_impact(db, job)
    _cancel_task(job_id)

    if impact.is_copy:
        storage_id = str(job.source_job_id)
        try:
            # Eski "nusxaning nusxasi" zanjirlari (2026-08-21 gacha yaratilgan):
            # bu nusxaga ishora qiluvchilarni to'g'ridan-to'g'ri aslga ulaymiz --
            # aks holda FK o'chirishga yo'l qo'ymaydi.
            for child in db.query(DubbingJob).filter(DubbingJob.source_job_id == job.id).all():
                child.source_job_id = job.source_job_id
                for field in _PATH_FIELDS:
                    setattr(child, field, _replace_id(getattr(child, field), job_id, storage_id))
            db.flush()
            _detach_payments(db, job.id)
            db.delete(job)
            db.commit()
        except Exception as e:
            db.rollback()
            raise JobDeletionError(str(e)) from e
        _remove_own_scratch(job_id)
        _refresh_public_marker(db, storage_id)
        return impact

    heirs = (
        db.query(DubbingJob)
        .filter(DubbingJob.source_job_id == job.id)
        .order_by(DubbingJob.created_at.asc(), DubbingJob.id.asc())
        .all()
    )

    if not heirs:
        try:
            db.query(ResolutionVariant).filter(ResolutionVariant.job_id == job.id).delete()
            _detach_payments(db, job.id)
            db.delete(job)
            db.commit()
        except Exception as e:
            db.rollback()
            raise JobDeletionError(str(e)) from e
        # Fayllar faqat commit muvaffaqiyatli bo'lgandan keyin o'chiriladi
        from backend.services.storage import delete_s3_prefix
        shutil.rmtree(_output_dir(job_id), ignore_errors=True)
        try:
            delete_s3_prefix(f"{S3_PREFIX}/{job_id}/")
        except Exception as e:
            logger.warning(f"S3 fayllarini tozalashda xatolik ({job_id}): {e}")
        _remove_own_scratch(job_id)
        return impact

    # --- Nusxalari bor ASL job: eng birinchi nusxa merosxo'r bo'ladi ---
    heir = heirs[0]
    heir_id = str(heir.id)
    src_dir, dst_dir = _output_dir(job_id), _output_dir(heir_id)
    moved_dir = False
    if src_dir.is_dir():
        if dst_dir.exists():
            # Nusxa job'larda odatda o'z papkasi bo'lmaydi; bo'sh bo'lsa olib tashlaymiz
            try:
                dst_dir.rmdir()
            except OSError as e:
                raise JobDeletionError(f"Merosxo'r papkasi bo'sh emas: {dst_dir}") from e
        try:
            src_dir.rename(dst_dir)
            moved_dir = True
        except OSError as e:
            raise JobDeletionError(f"Papkani ko'chirib bo'lmadi: {e}") from e

    copied = _move_s3(job_id, heir_id)
    if copied is None:
        if moved_dir:
            dst_dir.rename(src_dir)
        raise JobDeletionError("S3 fayllarini ko'chirib bo'lmadi")

    try:
        heir.source_job_id = None
        for other in heirs[1:]:
            other.source_job_id = heir.id
        for h in heirs:
            for field in _PATH_FIELDS:
                setattr(h, field, _replace_id(getattr(h, field), job_id, heir_id))
        for v in db.query(ResolutionVariant).filter(ResolutionVariant.job_id == job.id).all():
            v.job_id = heir.id
            v.s3_key = _replace_id(v.s3_key, job_id, heir_id)
        _detach_payments(db, job.id)
        db.flush()
        db.delete(job)
        db.commit()
    except Exception as e:
        db.rollback()
        from backend.services.storage import delete_file_from_s3
        for key in copied:
            delete_file_from_s3(key)
        if moved_dir:
            dst_dir.rename(src_dir)
        raise JobDeletionError(str(e)) from e

    # Commit muvaffaqiyatli -- eski S3 nusxalarini olib tashlash
    from backend.services.storage import delete_s3_prefix
    try:
        delete_s3_prefix(f"{S3_PREFIX}/{job_id}/")
    except Exception as e:
        logger.warning(f"Eski S3 fayllarini tozalashda xatolik ({job_id}): {e}")
    _remove_own_scratch(job_id)
    _refresh_public_marker(db, heir_id)
    logger.info(f"[DELETE {job_id}] {len(heirs)} ta nusxa bor edi -- fayllar {heir_id} ga ko'chirildi")
    return impact
