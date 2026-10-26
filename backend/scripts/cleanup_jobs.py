"""Admin tozalash: bekor qilingan, eski xato va dublikat dublaj job'larini o'chirish.

Qoidalar (egasi 2026-10-26 tasdiqlagan):
- bekor qilingan (foydalanuvchi yoki admin) -- hammasi;
- xato bilan tugagan -- faqat RETENTION_DAYS kundan eskilari (yangilarida
  foydalanuvchi hali "Qayta urinish" bosishi mumkin);
- dublikat -- bitta foydalanuvchi bitta YouTube videoni (bir xil rejimda:
  dublaj yoki subtitr) bir necha marta tayyorlatgan bo'lsa, bittasi qoladi:
  ommaviy > to'liq (sinov emas) > eng yangi. Faqat tayyor job'lar solishtiriladi;
- jarayondagi va to'lov kutayotgan job'larga HECH QACHON tegilmaydi.

O'chirish services/job_deletion.py orqali: kesh nusxalari bor asl job
o'chsa, fayllar birinchi nusxaga ko'chadi -- boshqa foydalanuvchilarning
videolari buzilmaydi.

Sukut bo'yicha faqat sanaydi (hech narsa o'zgarmaydi):
    docker compose exec backend python -m backend.scripts.cleanup_jobs
O'chirish uchun:
    docker compose exec backend python -m backend.scripts.cleanup_jobs --apply
"""
import argparse
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.database import DubbingJob, JobStatus, SessionLocal

RETENTION_DAYS = 7
CANCEL_CODES = {"USER_CANCELLED", "ADMIN_CANCELLED"}
CANCEL_TEXT = ("user cancelled", "bekor qilindi")


def is_cancelled(job: DubbingJob) -> bool:
    msg = (job.error_message or "").lower()
    return job.error_code in CANCEL_CODES or any(t in msg for t in CANCEL_TEXT)


def _keep_rank(job: DubbingJob) -> tuple:
    """Dublikatlar ichida qaysi biri qoladi: kattasi qoladi."""
    return (bool(job.is_public), not bool(job.is_preview), job.created_at or datetime.min, str(job.id))


def find_candidates(db: Session, now: datetime | None = None, retention_days: int = RETENTION_DAYS) -> dict[str, list[DubbingJob]]:
    now = now or datetime.utcnow()
    cutoff = now - timedelta(days=retention_days)

    failed = db.query(DubbingJob).filter(DubbingJob.status == JobStatus.FAILED).all()
    cancelled = [j for j in failed if is_cancelled(j)]
    old_failed = [j for j in failed if not is_cancelled(j) and j.created_at and j.created_at < cutoff]

    groups: dict[tuple, list[DubbingJob]] = defaultdict(list)
    completed = (
        db.query(DubbingJob)
        .filter(
            DubbingJob.status == JobStatus.COMPLETED,
            DubbingJob.user_id.isnot(None),
            DubbingJob.youtube_video_id.isnot(None),
        )
        .all()
    )
    for j in completed:
        groups[(j.user_id, j.youtube_video_id, bool(j.subtitle_only))].append(j)
    duplicates = []
    for jobs in groups.values():
        if len(jobs) > 1:
            jobs.sort(key=_keep_rank, reverse=True)
            duplicates.extend(jobs[1:])

    return {"cancelled": cancelled, "failed": old_failed, "duplicates": duplicates}


def _line(j: DubbingJob) -> str:
    when = j.created_at.strftime("%Y-%m-%d") if j.created_at else "?"
    title = (j.video_title or j.youtube_url or "")[:60]
    return f"  {str(j.id)[:8]}  {when}  {j.status.value if j.status else '?':<9}  {title}"


def main() -> None:
    p = argparse.ArgumentParser(description="Bekor qilingan, eski xato va dublikat job'larni tozalash")
    p.add_argument("--apply", action="store_true", help="haqiqatan o'chirish (sukut: faqat sanash)")
    p.add_argument("--days", type=int, default=RETENTION_DAYS, help="xato job'lar uchun saqlash muddati (kun)")
    p.add_argument("--show", type=int, default=10, help="har toifadan nechta misol ko'rsatish")
    args = p.parse_args()

    labels = {"cancelled": "Bekor qilingan", "failed": f"Xato ({args.days} kundan eski)", "duplicates": "Dublikat (ortiqcha nusxa)"}
    db = SessionLocal()
    try:
        cands = find_candidates(db, retention_days=args.days)
        ids: list = []
        for key, jobs in cands.items():
            print(f"{labels[key]}: {len(jobs)} ta")
            for j in sorted(jobs, key=lambda j: j.created_at or datetime.min)[: args.show]:
                print(_line(j))
            ids.extend(j.id for j in jobs)
        ids = list(dict.fromkeys(ids))
        print(f"\nJami o'chiriladi: {len(ids)} ta video")

        if not args.apply:
            print("Hech narsa o'zgarmadi. O'chirish uchun --apply bilan qayta ishga tushiring.")
            return

        from backend.services.job_deletion import JobDeletionError, delete_job

        done, failed = 0, []
        for job_id in ids:
            # Har safar qayta o'qiymiz: oldingi o'chirish nusxani "asl"ga aylantirgan bo'lishi mumkin
            job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
            if not job:
                continue
            try:
                delete_job(db, job)
                done += 1
            except JobDeletionError as e:
                db.rollback()
                failed.append((job_id, str(e)))
        print(f"O'chirildi: {done} ta. Xato: {len(failed)} ta.")
        for job_id, err in failed[:20]:
            print(f"  {job_id}: {err}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
