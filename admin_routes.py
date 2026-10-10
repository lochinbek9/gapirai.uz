from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from backend.models.database import SessionLocal, User, DubbingJob, ContentViolation, Subscription, PlanTier
from backend.models.payment import Payment, PaymentStatus
from backend.config import get_settings
from backend.services.auth import get_current_admin_user
from backend.services.plans import get_or_create_subscription, get_minute_balance, PLANS

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

TREND_DAYS = 30
TREND_MONTHS = 12
TREND_YEARS = 5


def _daily_counts(db, model, since: datetime) -> dict[str, int]:
    rows = (
        db.query(func.date(model.created_at).label("day"), func.count(model.id))
        .filter(model.created_at >= since)
        .group_by("day")
        .all()
    )
    return {str(day): count for day, count in rows}


def _bucketed_counts(db, model, since: datetime, trunc: str) -> dict[str, int]:
    """`trunc` — Postgres date_trunc birligi ("month"/"year"). Kalitlar
    "YYYY-MM" (month) yoki "YYYY" (year) shaklida qaytadi — frontend'dagi
    granularity tugmasi shu formatga mos kunlik/oylik/yillik grafikni tanlaydi."""
    bucket = func.date_trunc(trunc, model.created_at).label("bucket")
    rows = db.query(bucket, func.count(model.id)).filter(model.created_at >= since).group_by(bucket).all()
    fmt = "%Y-%m" if trunc == "month" else "%Y"
    return {b.strftime(fmt): count for b, count in rows}


def _period_count(db, model, start: datetime, end: datetime | None = None):
    q = db.query(model).filter(model.created_at >= start)
    if end is not None:
        q = q.filter(model.created_at <= end)
    return q.count()


@router.get("/stats")
def admin_stats(current_user: User = Depends(get_current_admin_user)):
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

        # Har bir jobning qaysi video, qaysi akkaunt va qachon bo'lganini
        # to'liq ko'rish uchun — admin panelidagi umumlashtirilgan
        # "xatolik turlari" kartasi o'rniga individual joblar ro'yxati.
        recent_jobs_rows = (
            db.query(DubbingJob, User.email)
            .outerjoin(User, DubbingJob.user_id == User.id)
            .order_by(DubbingJob.created_at.desc())
            .limit(50)
            .all()
        )
        recent_jobs = [
            {
                "id": str(job.id),
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "video_title": job.video_title,
                "youtube_url": job.youtube_url,
                "user_email": email,
                "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                "error_code": job.error_code,
                "error_message": job.error_message,
            }
            for job, email in recent_jobs_rows
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

        # Oylik/yillik granularity — kunlik chiziqli grafik bilan bir xil
        # {date, users, jobs} shakli, faqat sana kaliti "YYYY-MM"/"YYYY".
        monthly_since = datetime(now.year, now.month, 1) - timedelta(days=31 * (TREND_MONTHS - 1))
        user_monthly = _bucketed_counts(db, User, monthly_since, "month")
        job_monthly = _bucketed_counts(db, DubbingJob, monthly_since, "month")
        monthly = []
        for i in range(TREND_MONTHS - 1, -1, -1):
            month_index0 = (now.year * 12 + (now.month - 1)) - i
            y, m = divmod(month_index0, 12)
            key = f"{y}-{m + 1:02d}"
            monthly.append({"date": key, "users": user_monthly.get(key, 0), "jobs": job_monthly.get(key, 0)})

        yearly_since = datetime(now.year - (TREND_YEARS - 1), 1, 1)
        user_yearly = _bucketed_counts(db, User, yearly_since, "year")
        job_yearly = _bucketed_counts(db, DubbingJob, yearly_since, "year")
        yearly = []
        for i in range(TREND_YEARS - 1, -1, -1):
            key = str(now.year - i)
            yearly.append({"date": key, "users": user_yearly.get(key, 0), "jobs": job_yearly.get(key, 0)})

        today_key = str(now.date())
        yesterday_key = str((now - timedelta(days=1)).date())

        this_month_start = datetime(now.year, now.month, 1)
        last_month_end = this_month_start - timedelta(seconds=1)
        last_month_start = datetime(last_month_end.year, last_month_end.month, 1)

        trends = {
            "daily": daily,
            "monthly": monthly,
            "yearly": yearly,
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
                "last_7d": jobs_7d,
                "last_24h": jobs_24h,
            },
            "payments": {
                "approved_count": payments_approved,
                "revenue_total_uzs": float(revenue_total or 0),
            },
            "recent_users": recent_users,
            "recent_jobs": recent_jobs,
            "trends": trends,
        }
    finally:
        db.close()


@router.get("/blocked-users")
def blocked_users(current_user: User = Depends(get_current_admin_user)):
    """Content Safety Gate tomonidan bloklangan foydalanuvchilar ro'yxati --
    har bir foydalanuvchi bo'yicha guruhlangan, nechta marta bloklangani va
    eng so'nggi bloklanish sanasi bilan (backend/services/content_safety.py,
    backend/models/database.py: ContentViolation)."""
    db = SessionLocal()
    try:
        rows = (
            db.query(
                ContentViolation.user_id,
                User.name,
                User.email,
                User.phone,
                func.count(ContentViolation.id).label("violation_count"),
                func.max(ContentViolation.created_at).label("last_violation_at"),
            )
            .join(User, User.id == ContentViolation.user_id)
            .filter(ContentViolation.blocked.is_(True))
            .group_by(ContentViolation.user_id, User.name, User.email, User.phone)
            .order_by(func.count(ContentViolation.id).desc())
            .all()
        )
        users = [
            {
                "user_id": str(r.user_id),
                "name": r.name,
                "email": r.email,
                "phone": r.phone,
                "violation_count": r.violation_count,
                "last_violation_at": r.last_violation_at.isoformat() if r.last_violation_at else None,
            }
            for r in rows
        ]
        recent = (
            db.query(ContentViolation)
            .filter(ContentViolation.blocked.is_(True))
            .order_by(ContentViolation.created_at.desc())
            .limit(50)
            .all()
        )
        recent_violations = [
            {
                "id": str(v.id),
                "user_id": str(v.user_id),
                "video_title": v.video_title,
                "stage": v.stage,
                "category": v.category,
                "reason": v.reason,
                "created_at": v.created_at.isoformat(),
            }
            for v in recent
        ]
        return {
            "total_blocked_accounts": len(users),
            "total_violations": sum(u["violation_count"] for u in users),
            "users": users,
            "recent_violations": recent_violations,
        }
    finally:
        db.close()


@router.get("/refunds-needed")
def refunds_needed(current_user: User = Depends(get_current_admin_user)):
    """Pullik (Click) job 5 marta urinib ham muvaffaqiyatsiz tugagan
    to'lovlar -- Click orqali avtomatik pul qaytarish integratsiyasi yo'q
    (backend/workers/tasks.py: Payment.needs_refund), shuning uchun bu
    yerda ko'rsatilib, admin Click ilovasi orqali qo'lda qaytaradi."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Payment, User, DubbingJob)
            .join(User, User.id == Payment.user_id)
            .outerjoin(DubbingJob, DubbingJob.id == Payment.job_id)
            .filter(Payment.needs_refund.is_(True))
            .order_by(Payment.updated_at.desc())
            .all()
        )
        payments = [
            {
                "payment_id": str(p.id),
                "user_name": u.name,
                "user_email": u.email,
                "user_phone": u.phone,
                "amount": p.amount,
                "video_title": j.video_title if j else None,
                "error_message": j.error_message if j else None,
                "click_transaction_id": p.click_transaction_id,
                "paid_at": p.updated_at.isoformat() if p.updated_at else None,
            }
            for p, u, j in rows
        ]
        return {
            "total_amount": sum(p["amount"] for p in payments),
            "payments": payments,
        }
    finally:
        db.close()


class AddMinutesRequest(BaseModel):
    minutes: float | None = None
    amount_uzs: float | None = None
    rate_per_minute: float = 500.0
    reason: str | None = None


class SetPlanRequest(BaseModel):
    plan: str  # "free" | "standard" | "pro"
    days: int = 30
    reset_monthly: bool = True


@router.get("/users")
def admin_list_users(
    q: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user),
):
    """Admin panel: foydalanuvchilarni qidirish va ularning obuna/daqiqa holatini ko'rish."""
    db = SessionLocal()
    try:
        query = db.query(User)
        if q and q.strip():
            term = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    User.email.ilike(term),
                    User.name.ilike(term),
                    User.phone.ilike(term),
                )
            )

        total = query.count()
        users = query.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

        result = []
        for u in users:
            sub = db.query(Subscription).filter(Subscription.user_id == u.id).first()
            if not sub:
                sub = Subscription(user_id=u.id, plan=PlanTier.FREE, period_started_at=datetime.utcnow())
                db.add(sub)
                db.commit()
                db.refresh(sub)

            bal = get_minute_balance(db, u.id)
            result.append({
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "phone": u.phone,
                "role": u.role,
                "is_verified": u.is_verified,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "plan": sub.plan.value if hasattr(sub.plan, "value") else str(sub.plan),
                "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
                "monthly_minutes_used": sub.monthly_minutes_used or 0.0,
                "purchased_minutes": sub.purchased_minutes or 0.0,
                "balance": bal,
            })

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "users": result,
        }
    finally:
        db.close()


@router.post("/users/{user_id}/add-minutes")
def admin_add_minutes(
    user_id: str,
    req: AddMinutesRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Admin orqali daqiqa yoki so'm kiritilganda avtomatik hisoblab balansga daqiqa qo'shish."""
    minutes_to_add = req.minutes
    if (minutes_to_add is None or minutes_to_add <= 0) and req.amount_uzs is not None and req.amount_uzs > 0:
        rate = req.rate_per_minute if req.rate_per_minute > 0 else 500.0
        minutes_to_add = round(req.amount_uzs / rate, 1)

    if minutes_to_add is None or minutes_to_add <= 0:
        raise HTTPException(status_code=400, detail="Qo'shiladigan daqiqa yoki summa 0 dan katta bo'lishi kerak")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

        sub = get_or_create_subscription(db, user.id, for_update=True)
        sub.purchased_minutes = round(float(sub.purchased_minutes or 0.0) + float(minutes_to_add), 1)
        db.commit()
        db.refresh(sub)

        bal = get_minute_balance(db, user.id)
        return {
            "success": True,
            "message": f"{minutes_to_add} daqiqa muvaffaqiyatli qo'shildi",
            "added_minutes": minutes_to_add,
            "purchased_minutes": sub.purchased_minutes,
            "balance": bal,
        }
    finally:
        db.close()


@router.post("/users/{user_id}/set-plan")
def admin_set_plan(
    user_id: str,
    req: SetPlanRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Admin orqali foydalanuvchiga tarif (free, standard, pro) va muddat biriktirish."""
    plan_key = req.plan.lower()
    if plan_key not in ["free", "standard", "pro"]:
        raise HTTPException(status_code=400, detail="Noto'g'ri tarif tanlandi. Mumkin bo'lganlar: free, standard, pro")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

        sub = get_or_create_subscription(db, user.id, for_update=True)
        sub.plan = PlanTier(plan_key)
        if plan_key == "free":
            sub.expires_at = None
        else:
            sub.expires_at = datetime.utcnow() + timedelta(days=max(1, req.days))

        sub.period_started_at = datetime.utcnow()
        if req.reset_monthly:
            sub.monthly_minutes_used = 0.0

        db.commit()
        db.refresh(sub)

        bal = get_minute_balance(db, user.id)
        return {
            "success": True,
            "message": f"Tarif {plan_key.upper()} ga o'zgartirildi ({req.days} kun)",
            "plan": sub.plan.value,
            "expires_at": sub.expires_at.isoformat() if sub.expires_at else None,
            "balance": bal,
        }
    finally:
        db.close()

