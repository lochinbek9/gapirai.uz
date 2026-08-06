from datetime import datetime, timedelta
from fastapi import APIRouter, Header, HTTPException
from sqlalchemy import func
from backend.models.database import SessionLocal, User, DubbingJob
from backend.models.payment import Payment, PaymentStatus
from backend.config import get_settings

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()


def _check_admin(x_admin_key: str = Header(None)) -> None:
    if not settings.ADMIN_PASSWORD or x_admin_key != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Ruxsat yo'q.")


@router.post("/login")
async def admin_login(x_admin_key: str = Header(None)):
    _check_admin(x_admin_key)
    return {"ok": True}


@router.get("/stats")
async def admin_stats(x_admin_key: str = Header(None)):
    _check_admin(x_admin_key)
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        total_users = db.query(User).count()
        verified_users = db.query(User).filter(User.is_verified.is_(True)).count()
        users_7d = db.query(User).filter(User.created_at > now - timedelta(days=7)).count()
        users_24h = db.query(User).filter(User.created_at > now - timedelta(hours=24)).count()

        status_rows = db.query(DubbingJob.status, func.count(DubbingJob.id)).group_by(DubbingJob.status).all()
        jobs_by_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in status_rows}

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
                "last_7d": jobs_7d,
                "last_24h": jobs_24h,
            },
            "payments": {
                "approved_count": payments_approved,
                "revenue_total_uzs": float(revenue_total or 0),
            },
            "recent_users": recent_users,
        }
    finally:
        db.close()
