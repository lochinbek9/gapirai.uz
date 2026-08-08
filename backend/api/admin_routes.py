from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends
from sqlalchemy import func
from backend.models.database import SessionLocal, User, DubbingJob
from backend.models.payment import Payment, PaymentStatus
from backend.config import get_settings
from backend.services.auth import get_current_admin_user

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

TREND_DAYS = 30


def _daily_counts(db, model, since: datetime) -> dict[str, int]:
    rows = (
        db.query(func.date(model.created_at).label("day"), func.count(model.id))
        .filter(model.created_at >= since)
        .group_by("day")
        .all()
    )
    return {str(day): count for day, count in rows}


def _period_count(db, model, start: datetime, end: datetime | None = None):
    q = db.query(model).filter(model.created_at >= start)
    if end is not None:
        q = q.filter(model.created_at <= end)
    return q.count()


@router.get("/stats")
async def admin_stats(current_user: User = Depends(get_current_admin_user)):
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        total_users = db.query(User).count()
        verified_users = db.query(User).filter(User.is_verified.is_(True)).count()
        users_7d = db.query(User).filter(User.created_at > now - timedelta(days=7)).count()
        users_24h = db.query(User).filter(User.created_at > now - timedelta(hours=24)).count()

        status_rows = db.query(DubbingJob.status, func.count(DubbingJob.id)).group_by(DubbingJob.status).all()
        jobs_by_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in status_rows}

        error_code_rows = (
            db.query(DubbingJob.error_code, func.count(DubbingJob.id))
            .filter(DubbingJob.error_code.isnot(None))
            .group_by(DubbingJob.error_code)
            .order_by(func.count(DubbingJob.id).desc())
            .all()
        )
        jobs_by_error_code = {code: c for code, c in error_code_rows}

        total_jobs = db.query(DubbingJob).count()
        jobs_with_user = db.query(DubbingJob).filter(DubbingJob.user_id.isnot(None)).count()
        jobs_7d = db.query(DubbingJob).filter(DubbingJob.created_at > now - timedelta(days=7)).count()
        jobs_24h = db.query(DubbingJob).filter(DubbingJob.created_at > now - timedelta(hours=24)).count()

        revenue_total = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == PaymentStatus.APPROVED
        ).scalar()
        payments_approved = db.query(Payment).filter(Payment.status == PaymentStatus.APPROVED).count()

        recent_users = [
            {"email": u.email, "created_at": u.created_at.isoformat() if u.created_at else None, "is_verified": u.is_verified}
            for u in db.query(User).order_by(User.created_at.desc()).limit(10).all()
        ]

        # ── Trendlar: kunlik ro'yxatdan o'tish/video soni, bugun/kecha,
        # bu oy/o'tgan oy solishtiruvi — admin panelda grafik uchun.
        trend_since = now - timedelta(days=TREND_DAYS)
        user_daily = _daily_counts(db, User, trend_since)
        job_daily = _daily_counts(db, DubbingJob, trend_since)

        daily = []
        for i in range(TREND_DAYS, -1, -1):
            d = (now - timedelta(days=i)).date()
            key = str(d)
            daily.append({"date": key, "users": user_daily.get(key, 0), "jobs": job_daily.get(key, 0)})

        today_key = str(now.date())
        yesterday_key = str((now - timedelta(days=1)).date())

        this_month_start = datetime(now.year, now.month, 1)
        last_month_end = this_month_start - timedelta(seconds=1)
        last_month_start = datetime(last_month_end.year, last_month_end.month, 1)

        trends = {
            "daily": daily,
            "today": {"users": user_daily.get(today_key, 0), "jobs": job_daily.get(today_key, 0)},
            "yesterday": {"users": user_daily.get(yesterday_key, 0), "jobs": job_daily.get(yesterday_key, 0)},
            "this_month": {
                "users": _period_count(db, User, this_month_start),
                "jobs": _period_count(db, DubbingJob, this_month_start),
            },
            "last_month": {
                "users": _period_count(db, User, last_month_start, last_month_end),
                "jobs": _period_count(db, DubbingJob, last_month_start, last_month_end),
            },
        }

        return {
            "users": {
                "total": total_users,
                "verified": verified_users,
                "last_7d": users_7d,
                "last_24h": users_24h,
            },
            "jobs": {
                "total": total_jobs,
                "with_registered_user": jobs_with_user,
                "anonymous": total_jobs - jobs_with_user,
                "by_status": jobs_by_status,
                "by_error_code": jobs_by_error_code,
                "last_7d": jobs_7d,
                "last_24h": jobs_24h,
            },
            "payments": {
                "approved_count": payments_approved,
                "revenue_total_uzs": float(revenue_total or 0),
            },
            "recent_users": recent_users,
            "trends": trends,
        }
    finally:
        db.close()
