"""Cross-host job-checkpoint storage.

2026-08-26 finding (job 83ca2305, post-Webshare-fix reliability test):
process_video's checkpoint fields (DubbingJob.original_video_path,
dubbed_audio_path, output_video_path) are DB-stored, but the FILES they
point to are LOCAL to whichever of the 5 worker hosts happened to create
them. Celery redelivers a retried task to ANY available worker -- when a
retry lands on a different host than the one that made the earlier
progress, that host has no way to see the first host's local files, so a
checkpoint that looks satisfied in the DB is actually unreachable, forcing
an expensive, unnecessary redo (in the observed incident: a full YouTube
re-download, which then hit a real, avoidable failure).

This module backs those three file checkpoints with S3, reusing the SAME
bucket/client already used for final delivered output and the TTS cache
(backend/services/storage.py, backend/services/tts_cache.py) -- one S3
storage system, a second key prefix, not a second storage system.

Design: Worker A finishes a stage -> save_checkpoint() uploads it under a
deterministic dubber-checkpoints/{job_id}/{filename} key. Worker B (same
job, later retry) calls restore_checkpoint() before trusting a DB-recorded
path -- if the local file is already there (same-host retry, the common
case), it's a no-op local check with no S3 round-trip; if not (cross-host
retry), it downloads from S3 and the local path becomes valid again, and
the stage is skipped exactly as if it had run on this host.

Failure handling: S3 not configured, or a transient upload/download error,
never fails the job -- save_checkpoint() failing just means a future
cross-host retry (if one happens) redoes that one stage, the same
behavior as before this module existed. restore_checkpoint() failing
just means the caller's normal "recompute" path runs, as before.

Cleanup: no explicit delete here. The bucket already carries a lifecycle
rule that expires objects after a few days (see storage.py:s3_object_exists
docstring) -- checkpoint objects age out the same way orphaned final-output
objects already do, rather than adding a second cleanup mechanism.
"""
import logging
from pathlib import Path

from backend.services.storage import upload_file_to_s3, download_file_from_s3, delete_file_from_s3

logger = logging.getLogger(__name__)

_CHECKPOINT_S3_PREFIX = "dubber-checkpoints"


def checkpoint_s3_key(job_id: str, filename: str) -> str:
    return f"{_CHECKPOINT_S3_PREFIX}/{job_id}/{filename}"


def save_checkpoint(job_id: str, filename: str, local_path: str) -> None:
    """Upload a just-completed stage's local file to S3 so a retry that
    lands on a different host can still find it. Best-effort: a failure
    here is logged, never raised -- the local file is already valid for
    THIS host's own retries, which is the common case."""
    key = checkpoint_s3_key(job_id, filename)
    try:
        if not upload_file_to_s3(local_path, key):
            logger.warning(
                f"[CHECKPOINT {job_id}] {filename} S3'ga yuklanmadi -- "
                f"lokal nusxa shu host uchun baribir ishlaydi, faqat boshqa "
                f"host'da qayta urinish zaxirasi yo'qoladi."
            )
    except Exception as exc:
        logger.warning(f"[CHECKPOINT {job_id}] {filename} S3'ga yuklashda kutilmagan xatolik: {exc}")


def restore_checkpoint(job_id: str, filename: str, local_path: str) -> bool:
    """True if local_path is a usable checkpoint file after this call --
    either it was already there (same-host retry, no S3 touched), or it
    was just restored from S3 (cross-host retry). False means neither
    worked and the caller should recompute the stage normally, same as
    if this module didn't exist."""
    if Path(local_path).exists():
        return True
    key = checkpoint_s3_key(job_id, filename)
    try:
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        if download_file_from_s3(key, local_path):
            logger.info(
                f"[CHECKPOINT {job_id}] {filename} S3'dan tiklandi -- "
                f"boshqa worker host'dagi oldingi urinishdan davom etilmoqda."
            )
            return True
    except Exception as exc:
        logger.warning(f"[CHECKPOINT {job_id}] {filename} S3'dan tiklashda xatolik: {exc}")
    return False


def delete_checkpoint(job_id: str, filename: str) -> None:
    """S3'dagi ushbu job uchun saqlangan bosqich checkpoint faylini o'chiradi."""
    key = checkpoint_s3_key(job_id, filename)
    try:
        delete_file_from_s3(key)
    except Exception as exc:
        logger.warning(f"[CHECKPOINT {job_id}] {filename} S3'dan o'chirishda xatolik: {exc}")
