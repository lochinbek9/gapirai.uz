"""
recover_stuck_jobs.py — Script to recover or clean up stuck dubbing jobs.

Scans the database for jobs that have been stuck in non-terminal processing states
(DOWNLOADING, TRANSCRIBING, TRANSLATING, SYNCING, SYNTHESIZING, MERGING) for longer
than the allowed threshold (default: 30 minutes).

Usage:
    PYTHONPATH=. python backend/scripts/recover_stuck_jobs.py [--dry-run] [--timeout-minutes 30]
"""
from __future__ import annotations
import sys
import argparse
import logging
from datetime import datetime, timedelta
from backend.models.database import SessionLocal, DubbingJob, JobStatus

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recover_stuck_jobs")

STUCK_STATUSES = [
    JobStatus.DOWNLOADING,
    JobStatus.TRANSCRIBING,
    JobStatus.TRANSLATING,
    JobStatus.SYNCING,
    JobStatus.SYNTHESIZING,
    JobStatus.MERGING,
]

def recover_stuck_jobs(timeout_minutes: int = 30, dry_run: bool = False) -> int:
    cutoff = datetime.utcnow() - timedelta(minutes=timeout_minutes)
    session = SessionLocal()
    count = 0
    try:
        stuck_jobs = (
            session.query(DubbingJob)
            .filter(
                DubbingJob.status.in_(STUCK_STATUSES),
                DubbingJob.updated_at < cutoff
            )
            .all()
        )

        if not stuck_jobs:
            logger.info("No stuck jobs found.")
            return 0

        logger.info(f"Found {len(stuck_jobs)} stuck job(s) updated before {cutoff.isoformat()}")

        for job in stuck_jobs:
            logger.info(
                f"[JOB {job.id}] Status: {job.status.value}, Title: '{job.video_title or 'N/A'}', "
                f"Last updated: {job.updated_at}"
            )
            if not dry_run:
                job.status = JobStatus.FAILED
                job.error_code = "STUCK_JOB_TIMEOUT"
                job.error_message = "Vazifa vaqti tugadi yoki сервер воркери javob bermadi."
                job.claim_token = None
                job.claim_expires_at = None
                job.updated_at = datetime.utcnow()
                count += 1

        if not dry_run:
            session.commit()
            logger.info(f"Successfully marked {count} stuck job(s) as FAILED.")
        else:
            logger.info("[DRY RUN] No changes were committed to the database.")

        return len(stuck_jobs)
    except Exception as e:
        logger.error(f"Error while recovering stuck jobs: {e}")
        session.rollback()
        return 0
    finally:
        session.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Recover stuck dubbing jobs in the database.")
    parser.add_argument("--dry-run", action="store_true", help="Print stuck jobs without modifying DB.")
    parser.add_argument("--timeout-minutes", type=int, default=30, help="Threshold in minutes (default: 30).")
    args = parser.parse_args()

    recover_stuck_jobs(timeout_minutes=args.timeout_minutes, dry_run=args.dry_run)
