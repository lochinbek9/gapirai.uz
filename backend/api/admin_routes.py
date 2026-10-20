from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func, or_, and_, select, case, distinct, text
from backend.models.database import SessionLocal, User, DubbingJob, ContentViolation, Subscription, PlanTier, BroadcastCampaign, ExcludedEmail, TTSUsageLog, JobStatus
from backend.models.payment import Payment, PaymentStatus
from backend.config import get_settings
from backend.services.auth import get_current_admin_user
from backend.services.plans import get_or_create_subscription, get_minute_balance, PLANS
from backend.services.timezone_utils import to_tashkent_iso

router = APIRouter(prefix="/admin", tags=["admin"])
settings = get_settings()

TREND_DAYS = 30
TREND_MONTHS = 12
TREND_YEARS = 5


def _daily_counts(db, model, since: datetime, extra_filter=None) -> dict[str, int]:
    # Toshkent vaqti (UTC+5) bo'yicha kunlarga ajratish
    q = db.query(
        func.date(model.created_at + timedelta(hours=5)).label("day"),
        func.count(model.id)
    ).filter(model.created_at >= since)
    if extra_filter is not None:
        q = q.filter(extra_filter)
    rows = q.group_by("day").all()
    return {str(day): count for day, count in rows}


def _bucketed_counts(db, model, since: datetime, trunc: str, extra_filter=None) -> dict[str, int]:
    """`trunc` — Postgres date_trunc birligi ("month"/"year"). Kalitlar
    "YYYY-MM" (month) yoki "YYYY" (year) shaklida qaytadi — frontend'dagi
    granularity tugmasi shu formatga mos kunlik/oylik/yillik grafikni tanlaydi."""
    bucket = func.date_trunc(trunc, model.created_at + timedelta(hours=5)).label("bucket")
    q = db.query(bucket, func.count(model.id)).filter(model.created_at >= since)
    if extra_filter is not None:
        q = q.filter(extra_filter)
    rows = q.group_by(bucket).all()
    fmt = "%Y-%m" if trunc == "month" else "%Y"
    return {b.strftime(fmt): count for b, count in rows}


def _period_count(db, model, start: datetime, end: datetime | None = None, extra_filter=None):
    q = db.query(model).filter(model.created_at >= start)
    if end is not None:
        q = q.filter(model.created_at <= end)
    if extra_filter is not None:
        q = q.filter(extra_filter)
    return q.count()


@router.get("/stats")
def admin_stats(
    include_internal: bool = Query(default=False),
    current_user: User = Depends(get_current_admin_user),
):
    """Admin panel statistikasi:
    `include_internal=False` (default): haqiqiy mijozlar statistikasi (dasturchilar, test va
    'mijoz emas' ro'yxatidagi hisoblar chiqarib tashlanadi).
    """
    db = SessionLocal()
    try:
        now = datetime.utcnow()

        internal_ids_select = select(User.id).filter(User.is_internal.is_(True))

        if include_internal:
            user_filter = None
            job_filter = None
            pay_user_filter = None
            recent_jobs_user_filter = None
        else:
            user_filter = User.is_internal.is_(False)
            job_filter = or_(DubbingJob.user_id.is_(None), DubbingJob.user_id.notin_(internal_ids_select))
            pay_user_filter = and_(
                Payment.user_id.isnot(None),
                Payment.user_id.notin_(internal_ids_select),
                or_(Payment.is_donation.is_(False), Payment.is_donation.is_(None)),
            )
            recent_jobs_user_filter = or_(User.id.is_(None), User.is_internal.is_(False))

        # ── Foydalanuvchilar ──
        u_q = db.query(User)
        if user_filter is not None:
            u_q = u_q.filter(user_filter)
        total_users = u_q.count()
        verified_users = u_q.filter(User.is_verified.is_(True)).count()
        users_7d = u_q.filter(User.created_at > now - timedelta(days=7)).count()
        users_24h = u_q.filter(User.created_at > now - timedelta(hours=24)).count()

        # ── Dublyaj ishlari ──
        j_q = db.query(DubbingJob)
        if job_filter is not None:
            j_q = j_q.filter(job_filter)
        total_jobs = j_q.count()
        jobs_with_user = j_q.filter(DubbingJob.user_id.isnot(None)).count()
        jobs_7d = j_q.filter(DubbingJob.created_at > now - timedelta(days=7)).count()
        jobs_24h = j_q.filter(DubbingJob.created_at > now - timedelta(hours=24)).count()

        status_q = db.query(DubbingJob.status, func.count(DubbingJob.id))
        if job_filter is not None:
            status_q = status_q.filter(job_filter)
        status_rows = status_q.group_by(DubbingJob.status).all()
        jobs_by_status = {(s.value if hasattr(s, "value") else str(s)): c for s, c in status_rows}

        # ── To'lovlar ──
        p_q = db.query(Payment).filter(Payment.status == PaymentStatus.APPROVED)
        if pay_user_filter is not None:
            p_q = p_q.filter(pay_user_filter)
        payments_approved = p_q.count()

        revenue_q = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(Payment.status == PaymentStatus.APPROVED)
        if pay_user_filter is not None:
            revenue_q = revenue_q.filter(pay_user_filter)
        revenue_total = revenue_q.scalar()

        # ── So'nggi foydalanuvchilar ──
        recent_u_q = db.query(User)
        if user_filter is not None:
            recent_u_q = recent_u_q.filter(user_filter)
        recent_users = [
            {"email": u.email, "created_at": to_tashkent_iso(u.created_at), "is_verified": u.is_verified}
            for u in recent_u_q.order_by(User.created_at.desc()).limit(10).all()
        ]

        # ── So'nggi joblar ──
        recent_jobs_query = (
            db.query(DubbingJob, User.email)
            .outerjoin(User, DubbingJob.user_id == User.id)
        )
        if recent_jobs_user_filter is not None:
            recent_jobs_query = recent_jobs_query.filter(recent_jobs_user_filter)
        recent_jobs_rows = recent_jobs_query.order_by(DubbingJob.created_at.desc()).limit(50).all()

        recent_jobs = [
            {
                "id": str(job.id),
                "created_at": to_tashkent_iso(job.created_at),
                "video_title": job.video_title,
                "youtube_url": job.youtube_url,
                "user_email": email,
                "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                "error_code": job.error_code,
                "error_message": job.error_message,
                "tts_provider": job.tts_provider,
                "stt_model": job.stt_model,
                "translation_model": job.translation_model,
                "tts_model": job.tts_model or (f"gemini-3.8-flash-tts ({job.voice_name})" if job.tts_provider == 'gemini' else (f"edge-tts ({job.voice_name})" if job.tts_provider == 'edge' else (f"azure ({job.voice_name})" if job.tts_provider == 'azure' or (job.voice_name and 'Neural' in str(job.voice_name)) else None))),
            }
            for job, email in recent_jobs_rows
        ]

        # ── Toshkent vaqti bo'yicha Bugun va Kecha (UTC+5) ──
        TASHKENT_OFFSET = timedelta(hours=5)
        tashkent_now = datetime.utcnow() + TASHKENT_OFFSET
        tashkent_today_date = tashkent_now.date()

        # Trendlar (faqat real mijozlar)
        trend_since = now - timedelta(days=TREND_DAYS)
        user_daily = _daily_counts(db, User, trend_since, extra_filter=user_filter)
        job_daily = _daily_counts(db, DubbingJob, trend_since, extra_filter=job_filter)

        daily = []
        for i in range(TREND_DAYS, -1, -1):
            d = (tashkent_now - timedelta(days=i)).date()
            key = str(d)
            daily.append({"date": key, "users": user_daily.get(key, 0), "jobs": job_daily.get(key, 0)})

        monthly_since = datetime(tashkent_now.year, tashkent_now.month, 1) - timedelta(days=31 * (TREND_MONTHS - 1))
        user_monthly = _bucketed_counts(db, User, monthly_since, "month", extra_filter=user_filter)
        job_monthly = _bucketed_counts(db, DubbingJob, monthly_since, "month", extra_filter=job_filter)
        monthly = []
        for i in range(TREND_MONTHS - 1, -1, -1):
            month_index0 = (tashkent_now.year * 12 + (tashkent_now.month - 1)) - i
            y, m = divmod(month_index0, 12)
            key = f"{y}-{m + 1:02d}"
            monthly.append({"date": key, "users": user_monthly.get(key, 0), "jobs": job_monthly.get(key, 0)})

        yearly_since = datetime(tashkent_now.year - (TREND_YEARS - 1), 1, 1)
        user_yearly = _bucketed_counts(db, User, yearly_since, "year", extra_filter=user_filter)
        job_yearly = _bucketed_counts(db, DubbingJob, yearly_since, "year", extra_filter=job_filter)
        yearly = []
        for i in range(TREND_YEARS - 1, -1, -1):
            key = str(tashkent_now.year - i)
            yearly.append({"date": key, "users": user_yearly.get(key, 0), "jobs": job_yearly.get(key, 0)})

        # UTC vaqtiga o'girilgan aniq chegaralar (DB dagi created_at UTC bilan solishtirish uchun)
        today_start_utc = datetime(tashkent_today_date.year, tashkent_today_date.month, tashkent_today_date.day) - TASHKENT_OFFSET
        yesterday_start_utc = today_start_utc - timedelta(days=1)
        yesterday_end_utc = today_start_utc

        # Bugungi va kechagi real mijozlar (users)
        today_users_q = db.query(User).filter(User.created_at >= today_start_utc)
        yesterday_users_q = db.query(User).filter(User.created_at >= yesterday_start_utc, User.created_at < yesterday_end_utc)
        if user_filter is not None:
            today_users_q = today_users_q.filter(user_filter)
            yesterday_users_q = yesterday_users_q.filter(user_filter)
        today_users = today_users_q.count()
        yesterday_users = yesterday_users_q.count()

        # Bugungi va kechagi video dublyajlar (jobs)
        today_jobs_q = db.query(DubbingJob).filter(DubbingJob.created_at >= today_start_utc)
        yesterday_jobs_q = db.query(DubbingJob).filter(DubbingJob.created_at >= yesterday_start_utc, DubbingJob.created_at < yesterday_end_utc)
        if job_filter is not None:
            today_jobs_q = today_jobs_q.filter(job_filter)
            yesterday_jobs_q = yesterday_jobs_q.filter(job_filter)
        today_jobs = today_jobs_q.count()
        yesterday_jobs = yesterday_jobs_q.count()

        # Bugungi va kechagi to'lovlar (payments)
        today_pay_q = db.query(Payment).filter(Payment.status == PaymentStatus.APPROVED, Payment.created_at >= today_start_utc)
        yesterday_pay_q = db.query(Payment).filter(Payment.status == PaymentStatus.APPROVED, Payment.created_at >= yesterday_start_utc, Payment.created_at < yesterday_end_utc)
        if pay_user_filter is not None:
            today_pay_q = today_pay_q.filter(pay_user_filter)
            yesterday_pay_q = yesterday_pay_q.filter(pay_user_filter)
        today_payments = today_pay_q.count()
        yesterday_payments = yesterday_pay_q.count()

        # Bugungi va kechagi tushum (revenue)
        today_rev_q = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == PaymentStatus.APPROVED, Payment.created_at >= today_start_utc
        )
        yesterday_rev_q = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.status == PaymentStatus.APPROVED, Payment.created_at >= yesterday_start_utc, Payment.created_at < yesterday_end_utc
        )
        if pay_user_filter is not None:
            today_rev_q = today_rev_q.filter(pay_user_filter)
            yesterday_rev_q = yesterday_rev_q.filter(pay_user_filter)
        today_revenue = float(today_rev_q.scalar() or 0)
        yesterday_revenue = float(yesterday_rev_q.scalar() or 0)

        this_month_start_tashkent = datetime(tashkent_now.year, tashkent_now.month, 1)
        this_month_start_utc = this_month_start_tashkent - TASHKENT_OFFSET
        last_month_end_tashkent = this_month_start_tashkent - timedelta(seconds=1)
        last_month_start_tashkent = datetime(last_month_end_tashkent.year, last_month_end_tashkent.month, 1)
        last_month_start_utc = last_month_start_tashkent - TASHKENT_OFFSET
        last_month_end_utc = this_month_start_utc

        trends = {
            "daily": daily,
            "monthly": monthly,
            "yearly": yearly,
            "today": {
                "users": today_users,
                "jobs": today_jobs,
                "payments": today_payments,
                "revenue_uzs": today_revenue,
            },
            "yesterday": {
                "users": yesterday_users,
                "jobs": yesterday_jobs,
                "payments": yesterday_payments,
                "revenue_uzs": yesterday_revenue,
            },
            "this_month": {
                "users": _period_count(db, User, this_month_start_utc, extra_filter=user_filter),
                "jobs": _period_count(db, DubbingJob, this_month_start_utc, extra_filter=job_filter),
            },
            "last_month": {
                "users": _period_count(db, User, last_month_start_utc, last_month_end_utc, extra_filter=user_filter),
                "jobs": _period_count(db, DubbingJob, last_month_start_utc, last_month_end_utc, extra_filter=job_filter),
            },
        }

        internal_users_count = db.query(User).filter(User.is_internal.is_(True)).count()
        internal_jobs_count = db.query(DubbingJob).filter(DubbingJob.user_id.in_(internal_ids_select)).count()

        return {
            "users": {
                "total": total_users,
                "verified": verified_users,
                "last_7d": users_7d,
                "last_24h": users_24h,
                "internal_count": internal_users_count,
            },
            "jobs": {
                "total": total_jobs,
                "with_registered_user": jobs_with_user,
                "anonymous": total_jobs - jobs_with_user,
                "by_status": jobs_by_status,
                "last_7d": jobs_7d,
                "last_24h": jobs_24h,
                "internal_count": internal_jobs_count,
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
                "last_violation_at": to_tashkent_iso(r.last_violation_at),
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
                "created_at": to_tashkent_iso(v.created_at),
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
                "paid_at": to_tashkent_iso(p.updated_at),
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
    action: str = "add"  # "add" | "deduct"
    reason: str | None = None


class SetPlanRequest(BaseModel):
    plan: str  # "free" | "standard" | "pro"
    days: int = 30
    reset_monthly: bool = True


@router.get("/users")
def admin_list_users(
    q: str | None = None,
    filter_type: str | None = Query(None, description="all | customers | internal"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user),
):
    """Admin panel: foydalanuvchilarni qidirish va ularning obuna/daqiqa holatini ko'rish."""
    db = SessionLocal()
    try:
        query = db.query(User)
        if filter_type == "customers":
            query = query.filter(User.is_internal.is_(False))
        elif filter_type == "internal":
            query = query.filter(User.is_internal.is_(True))

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

        user_ids = [u.id for u in users]
        existing_subs = {
            s.user_id: s
            for s in db.query(Subscription).filter(Subscription.user_id.in_(user_ids)).all()
        } if user_ids else {}

        result = []
        for u in users:
            sub = existing_subs.get(u.id)
            if not sub:
                sub = Subscription(user_id=u.id, plan=PlanTier.FREE, period_started_at=datetime.utcnow())
                db.add(sub)
                db.commit()
                db.refresh(sub)
                existing_subs[u.id] = sub

            bal = get_minute_balance(db, u.id)
            result.append({
                "id": str(u.id),
                "email": u.email,
                "name": u.name,
                "phone": u.phone,
                "role": u.role,
                "is_internal": getattr(u, "is_internal", False),
                "is_verified": u.is_verified,
                "created_at": to_tashkent_iso(u.created_at),
                "plan": sub.plan.value if hasattr(sub.plan, "value") else str(sub.plan),
                "expires_at": to_tashkent_iso(sub.expires_at),
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
    """Admin orqali daqiqa yoki so'm kiritilganda avtomatik hisoblab balansga daqiqa qo'shish yoki ayirish."""
    mins = req.minutes
    if (mins is None or mins <= 0) and req.amount_uzs is not None and req.amount_uzs > 0:
        rate = req.rate_per_minute if req.rate_per_minute > 0 else 500.0
        mins = round(req.amount_uzs / rate, 1)

    if mins is None or mins <= 0:
        raise HTTPException(status_code=400, detail="Daqiqa yoki summa 0 dan katta bo'lishi kerak")

    is_deduct = str(req.action or "").lower() in ["deduct", "subtract", "minus", "ayirish"]

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

        sub = get_or_create_subscription(db, user.id, for_update=True)
        from backend.services.plans import PLANS
        plan = PLANS[sub.plan.value]

        if is_deduct:
            # 1. Avval kuymaydigan (purchased_minutes) dan ayiramiz
            purchased = float(sub.purchased_minutes or 0.0)
            if purchased >= mins:
                sub.purchased_minutes = round(purchased - mins, 1)
            else:
                leftover = mins - purchased
                sub.purchased_minutes = 0.0
                # Qolganini joriy oylik kvotadan ayiramiz (monthly_minutes_used ni oshirish orqali)
                current_used = float(sub.monthly_minutes_used or 0.0)
                sub.monthly_minutes_used = round(min(float(plan.monthly_minutes), current_used + leftover), 1)

            db.commit()
            db.refresh(sub)

            bal = get_minute_balance(db, user.id)
            return {
                "success": True,
                "message": f"{mins} daqiqa muvaffaqiyatli ayirildi",
                "deducted_minutes": mins,
                "purchased_minutes": sub.purchased_minutes,
                "balance": bal,
            }
        else:
            sub.purchased_minutes = round(float(sub.purchased_minutes or 0.0) + float(mins), 1)
            db.commit()
            db.refresh(sub)

            bal = get_minute_balance(db, user.id)
            return {
                "success": True,
                "message": f"{mins} daqiqa muvaffaqiyatli qo'shildi",
                "added_minutes": mins,
                "purchased_minutes": sub.purchased_minutes,
                "balance": bal,
            }
    finally:
        db.close()


@router.post("/users/{user_id}/deduct-minutes")
def admin_deduct_minutes(
    user_id: str,
    req: AddMinutesRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Admin orqali daqiqa ayirish uchun alohida endpoint."""
    req.action = "deduct"
    return admin_add_minutes(user_id=user_id, req=req, current_user=current_user)


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
            "expires_at": to_tashkent_iso(sub.expires_at),
            "balance": bal,
        }
    finally:
        db.close()


@router.get("/cookies")
def admin_get_cookies(current_user: User = Depends(get_current_admin_user)):
    """YouTube cookies faylining holatini qaytaradi."""
    from backend.services.cookie_manager import check_cookie_health
    return check_cookie_health()


@router.post("/cookies")
async def admin_upload_cookies(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin_user),
):
    """Admin orqali yangi cookies.txt faylini yuklash."""
    from backend.services.cookie_manager import save_uploaded_cookies
    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="Fayl matn (UTF-8) formatida bo'lishi kerak")

    try:
        health = save_uploaded_cookies(content)
        return {
            "success": True,
            "message": f"Cookies muvaffaqiyatli saqlandi ({health.get('cookie_count', 0)} ta cookie)",
            "data": health,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cookies saqlashda xatolik: {e}")


@router.delete("/cookies")
def admin_delete_cookies(current_user: User = Depends(get_current_admin_user)):
    """Admin orqali yuklangan cookies.txt faylini o'chirish."""
    from backend.services.cookie_manager import delete_uploaded_cookies, check_cookie_health
    deleted = delete_uploaded_cookies()
    return {
        "success": True,
        "deleted": deleted,
        "data": check_cookie_health(),
    }


@router.get("/system-health")
def admin_system_health(current_user: User = Depends(get_current_admin_user)):
    """Admin panel uchun tizim salomatligi (DB, Redis, Disk, Celery, Cookie, AI Providers, Queues) monitoringi."""
    from backend.services.health_check import check_system_health
    return check_system_health(detailed=True, notify=False)


@router.post("/jobs/{job_id}/retry")
def admin_retry_job(
    job_id: str,
    current_user: User = Depends(get_current_admin_user),
):
    """Admin panel orqali xatolikka uchragan yoki to'xtab qolgan job'ni bevosita qayta navbatga qo'yish."""
    from backend.api.routes import retry_job
    db = SessionLocal()
    try:
        return retry_job(job_id=job_id, payload=None, db=db, current_user=current_user)
    finally:
        db.close()



@router.get("/retention")
def admin_retention_stats(
    days: int = Query(default=7, ge=0, le=365),
    include_internal: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_admin_user),
):
    """Foydalanuvchilarning qaytib kirish (Retention) tahlili:
    - Jami ro'yxatdan o'tganlar, qaytganlar soni va umumiy qaytish foizi
    - Bugungi va kechagi faol, yangi va qaytganlar soni (Toshkent vaqti UTC+5)
    - Kunma-kun faollik (Total Active, New Users, Returning Users, Returning %)
    - Kirish chastotasi bo'yicha taqsimot (1 kun, 2-3 kun, 4-6 kun, 7-14 kun, 15-30 kun, 30+ kun)
    - Oxirgi faol bo'lgan foydalanuvchilar (20 ta limit, streak va tarif bilan)
    
    `include_internal=False` bo'lganda test/dasturchi hisoblari hisobga olinmaydi.
    """
    from sqlalchemy import text
    from datetime import date
    db = SessionLocal()
    try:
        now_utc = datetime.utcnow()
        now_tashkent = now_utc + timedelta(hours=5)
        today = now_tashkent.date()
        yesterday = today - timedelta(days=1)
        project_start_date = date(2026, 7, 27)

        if days == 0:
            since_date = project_start_date
        else:
            since_date = today - timedelta(days=max(0, days - 1))

        internal_clause = "" if include_internal else "AND u.is_internal = FALSE"
        internal_where = "" if include_internal else "WHERE is_internal = FALSE"
        internal_u_where = "" if include_internal else "WHERE u.is_internal = FALSE"

        # 1. Umumiy hisob (Overall summary)
        summary_row = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            ),
            user_summary AS (
                SELECT 
                    a.user_id,
                    count(DISTINCT a.day) as active_days
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                {internal_u_where}
                GROUP BY a.user_id
            )
            SELECT 
                (SELECT count(*) FROM users {internal_where}) as total_registered,
                count(DISTINCT user_id) as total_active_all_time,
                count(DISTINCT CASE WHEN active_days > 1 THEN user_id END) as total_returning_all_time,
                count(DISTINCT CASE WHEN active_days = 1 THEN user_id END) as total_one_time,
                count(DISTINCT CASE WHEN active_days >= 4 THEN user_id END) as total_loyal
            FROM user_summary;
        """)).mappings().first()

        total_reg = summary_row["total_registered"] or 0
        total_act = summary_row["total_active_all_time"] or 0
        total_ret = summary_row["total_returning_all_time"] or 0
        overall_ret_pct = round(100.0 * total_ret / max(1, total_act), 1)

        # 2. Bugun va kechagi ko'rsatkichlar (Toshkent vaqti bilan)
        today_row = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            )
            SELECT 
                count(DISTINCT a.user_id) as total_active,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date = :tdate THEN a.user_id END) as new_users,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date < :tdate THEN a.user_id END) as returning_users
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE a.day = :tdate {internal_clause}
        """), {"tdate": today}).mappings().first()

        today_active = today_row["total_active"] or 0
        today_new = today_row["new_users"] or 0
        today_returning = today_row["returning_users"] or 0
        today_ret_pct = round(100.0 * today_returning / max(1, today_active), 1)

        yesterday_row = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            )
            SELECT 
                count(DISTINCT a.user_id) as total_active,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date = :ydate THEN a.user_id END) as new_users,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date < :ydate THEN a.user_id END) as returning_users
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE a.day = :ydate {internal_clause}
        """), {"ydate": yesterday}).mappings().first()

        yesterday_active = yesterday_row["total_active"] or 0
        yesterday_new = yesterday_row["new_users"] or 0
        yesterday_returning = yesterday_row["returning_users"] or 0
        yesterday_ret_pct = round(100.0 * yesterday_returning / max(1, yesterday_active), 1)

        # 3. Kunma-kun tahlil (Oxirgi N kun yoki loyiha boshidan)
        daily_rows = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            )
            SELECT 
                a.day,
                count(DISTINCT a.user_id) as total_active,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date = a.day THEN a.user_id END) as new_users,
                count(DISTINCT CASE WHEN (u.created_at + interval '5 hours')::date < a.day THEN a.user_id END) as returning_users,
                COALESCE((
                    SELECT count(*) FROM dubbing_jobs j 
                    LEFT JOIN users ju ON j.user_id = ju.id
                    WHERE (j.created_at + interval '5 hours')::date = a.day
                    {'AND (ju.id IS NULL OR ju.is_internal = FALSE)' if not include_internal else ''}
                ), 0) as jobs_count
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE a.day >= :since AND a.day <= :today {internal_clause}
            GROUP BY a.day
            ORDER BY a.day DESC
        """), {"since": since_date, "today": today}).mappings().all()

        daily_stats = []
        for r in daily_rows:
            tot = r["total_active"] or 0
            ret = r["returning_users"] or 0
            daily_stats.append({
                "date": str(r["day"]),
                "total_active": tot,
                "new_users": r["new_users"] or 0,
                "returning_users": ret,
                "returning_pct": round(100.0 * ret / max(1, tot), 1),
                "jobs_count": r["jobs_count"] or 0,
            })

        # 4. Kirish chastotasi taqsimoti (Frequency distribution: 1, 3, 6, 14, 30, 30+)
        freq_row = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            ),
            counts AS (
                SELECT a.user_id, count(DISTINCT a.day) as cnt
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                {internal_u_where}
                GROUP BY a.user_id
            )
            SELECT 
                count(DISTINCT CASE WHEN cnt = 1 THEN user_id END) as days_1,
                count(DISTINCT CASE WHEN cnt BETWEEN 2 AND 3 THEN user_id END) as days_2_3,
                count(DISTINCT CASE WHEN cnt BETWEEN 4 AND 6 THEN user_id END) as days_4_6,
                count(DISTINCT CASE WHEN cnt BETWEEN 7 AND 14 THEN user_id END) as days_7_14,
                count(DISTINCT CASE WHEN cnt BETWEEN 15 AND 30 THEN user_id END) as days_15_30,
                count(DISTINCT CASE WHEN cnt > 30 THEN user_id END) as days_30_plus
            FROM counts;
        """)).mappings().first()

        d1 = freq_row["days_1"] or 0
        d23 = freq_row["days_2_3"] or 0
        d46 = freq_row["days_4_6"] or 0
        d714 = freq_row["days_7_14"] or 0
        d1530 = freq_row["days_15_30"] or 0
        d30p = freq_row["days_30_plus"] or 0

        frequency = [
            {"label": "1 kun", "count": d1, "pct": round(100.0 * d1 / max(1, total_act), 1)},
            {"label": "3 kun (2-3 kun)", "count": d23, "pct": round(100.0 * d23 / max(1, total_act), 1)},
            {"label": "6 kun (4-6 kun)", "count": d46, "pct": round(100.0 * d46 / max(1, total_act), 1)},
            {"label": "14 kun (7-14 kun)", "count": d714, "pct": round(100.0 * d714 / max(1, total_act), 1)},
            {"label": "30 kun (15-30 kun)", "count": d1530, "pct": round(100.0 * d1530 / max(1, total_act), 1)},
            {"label": "Barchasi (30+ kun)", "count": d30p, "pct": round(100.0 * d30p / max(1, total_act), 1)},
        ]

        # 5. Oxirgi faol bo'lgan foydalanuvchilar (Default 20 ta limit, streak va tarif bilan)
        user_rows = db.execute(text(f"""
            WITH user_activity AS (
                SELECT v.user_id, v.visit_date as day FROM user_daily_visits v
                UNION
                SELECT u.id as user_id, (u.created_at + interval '5 hours')::date as day FROM users u
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as day FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT u.id as user_id, (u.last_active_at + interval '5 hours')::date as day FROM users u WHERE u.last_active_at IS NOT NULL
            ),
            user_days AS (
                SELECT user_id, day,
                       day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY day))::int as grp
                FROM user_activity
            ),
            user_streaks AS (
                SELECT user_id, count(*) as streak_len
                FROM user_days
                GROUP BY user_id, grp
            ),
            streaks AS (
                SELECT user_id, max(streak_len) as streak
                FROM user_streaks
                GROUP BY user_id
            ),
            act_days AS (
                SELECT user_id, count(DISTINCT day) as total_days
                FROM user_activity
                GROUP BY user_id
            )
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                (u.created_at + interval '5 hours') as created_at_tashkent,
                (u.last_active_at + interval '5 hours') as last_active_at_tashkent,
                COALESCE(ad.total_days, 1) as active_days,
                COALESCE(st.streak, 1) as streak,
                COALESCE(s.plan::text, 'free') as plan,
                COALESCE(j.jobs_count, 0) as jobs_count
            FROM users u
            LEFT JOIN act_days ad ON u.id = ad.user_id
            LEFT JOIN streaks st ON u.id = st.user_id
            LEFT JOIN (
                SELECT DISTINCT ON (user_id) user_id, plan 
                FROM subscriptions 
                ORDER BY user_id, created_at DESC
            ) s ON u.id = s.user_id
            LEFT JOIN (
                SELECT user_id, count(*) as jobs_count
                FROM dubbing_jobs
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            ) j ON u.id = j.user_id
            {internal_u_where}
            ORDER BY u.last_active_at DESC NULLS LAST
            LIMIT :limit OFFSET :offset;
        """), {"limit": limit, "offset": offset}).mappings().all()

        recent_users_list = []
        for u in user_rows:
            act_days = u["active_days"] or 1
            streak = u["streak"] or 1
            plan = u["plan"] or "free"

            if act_days >= 7:
                status = "loyal"
                status_label = "Sodiq (7+ kun)"
            elif act_days >= 3:
                status = "returning"
                status_label = "Faol (3-6 kun)"
            elif act_days == 2:
                status = "returning"
                status_label = "Qaytgan (2 kun)"
            else:
                status = "one_time"
                status_label = "1 kun kirgan"

            recent_users_list.append({
                "id": str(u["id"]),
                "name": u["name"] or "Noma'lum",
                "email": u["email"] or "",
                "phone": u["phone"] or "",
                "created_at": u["created_at_tashkent"].strftime("%Y-%m-%d %H:%M") if u["created_at_tashkent"] else None,
                "last_active_at": u["last_active_at_tashkent"].strftime("%Y-%m-%d %H:%M") if u["last_active_at_tashkent"] else None,
                "active_days": act_days,
                "streak": streak,
                "plan": plan,
                "jobs_count": u["jobs_count"] or 0,
                "loyalty_status": status,
                "loyalty_label": status_label,
            })

        return {
            "summary": {
                "total_registered": total_reg,
                "total_active_all_time": total_act,
                "total_returning_all_time": total_ret,
                "overall_retention_pct": overall_ret_pct,
                "today": {
                    "total_active": today_active,
                    "new_users": today_new,
                    "returning_users": today_returning,
                    "returning_pct": today_ret_pct,
                },
                "yesterday": {
                    "total_active": yesterday_active,
                    "new_users": yesterday_new,
                    "returning_users": yesterday_returning,
                    "returning_pct": yesterday_ret_pct,
                },
            },
            "daily_stats": daily_stats,
            "frequency": frequency,
            "recent_users": recent_users_list,
        }
    finally:
        db.close()


@router.get("/funnel")
def admin_funnel_stats(
    days: int = Query(default=30, ge=0, le=365),
    include_internal: bool = Query(default=False),
    current_user: User = Depends(get_current_admin_user),
):
    """Ro'yxatdan o'tishdan to'lovgacha bo'lgan to'liq konversiya voronkasi (Funnel):
    - 1. Ro'yxatdan o'tganlar (Registered)
    - 2. Tasdiqlangan hisoblar (Verified: Email / Google / Phone)
    - 3. Kamida bitta video yuborganlar (Attempted first job)
    - 4. Muvaffaqiyatli dublyaj olganlar (Completed job)
    - 5. Limitga duch kelgan / Faol foydalanuvchilar (2+ video yoki 5+ daqiqa)
    - 6. To'lovni boshlaganlar (Checkout initiated / Pending payment)
    - 7. Muvaffaqiyatli to'lov qilganlar (Approved payment / Paid customers)
    """
    from sqlalchemy import text
    from datetime import date
    db = SessionLocal()
    try:
        now_utc = datetime.utcnow()
        now_tashkent = now_utc + timedelta(hours=5)
        today = now_tashkent.date()
        project_start_date = date(2026, 7, 27)

        if days == 0:
            since_date = project_start_date
        else:
            since_date = today - timedelta(days=max(0, days - 1))

        internal_u_where = "" if include_internal else "AND u.is_internal = FALSE"
        internal_where_base = "" if include_internal else "WHERE is_internal = FALSE"

        # 1. Voronka asosiy ko'rsatkichlari (Funnel Stages)
        funnel_row = db.execute(text(f"""
            WITH user_base AS (
                SELECT 
                    u.id,
                    u.is_verified,
                    u.created_at,
                    COALESCE((
                        SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u.id
                    ), 0) as job_count,
                    COALESCE((
                        SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u.id AND j.status = 'COMPLETED'
                    ), 0) as completed_job_count,
                    COALESCE((
                        SELECT sum(j.video_duration) FROM dubbing_jobs j WHERE j.user_id = u.id
                    ), 0) / 60.0 as total_video_minutes,
                    COALESCE((
                        SELECT count(*) FROM payments p 
                        WHERE p.user_id = u.id AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
                    ), 0) as payment_attempts,
                    COALESCE((
                        SELECT count(*) FROM payments p 
                        WHERE p.user_id = u.id AND p.status = 'APPROVED' AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
                    ), 0) as approved_payments,
                    COALESCE((
                        SELECT sum(p.amount) FROM payments p 
                        WHERE p.user_id = u.id AND p.status = 'APPROVED' AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
                    ), 0) as user_total_spent
                FROM users u
                WHERE (u.created_at + interval '5 hours')::date >= :since
                  AND (u.created_at + interval '5 hours')::date <= :today
                  {internal_u_where}
            )
            SELECT 
                count(*) as registered,
                count(CASE WHEN is_verified THEN 1 END) as verified,
                count(CASE WHEN job_count >= 1 THEN 1 END) as attempted_job,
                count(CASE WHEN completed_job_count >= 1 THEN 1 END) as completed_job,
                count(CASE WHEN job_count >= 2 OR total_video_minutes >= 5.0 THEN 1 END) as reached_paywall,
                count(CASE WHEN payment_attempts >= 1 THEN 1 END) as checkout_initiated,
                count(CASE WHEN approved_payments >= 1 THEN 1 END) as paid
            FROM user_base;
        """), {"since": since_date, "today": today}).mappings().first()

        registered = (funnel_row["registered"] if funnel_row else 0) or 0
        verified = (funnel_row["verified"] if funnel_row else 0) or 0
        attempted_job = (funnel_row["attempted_job"] if funnel_row else 0) or 0
        completed_job = (funnel_row["completed_job"] if funnel_row else 0) or 0
        reached_paywall = (funnel_row["reached_paywall"] if funnel_row else 0) or 0
        checkout_initiated = (funnel_row["checkout_initiated"] if funnel_row else 0) or 0
        paid = (funnel_row["paid"] if funnel_row else 0) or 0

        # Konversiya foizlari (Conversion & Drop-off rates)
        def pct(part: int, whole: int) -> float:
            return round(100.0 * part / max(1, whole), 1)

        reg_to_verified_pct = pct(verified, registered)
        verified_to_job_pct = pct(attempted_job, verified)
        job_to_completed_pct = pct(completed_job, attempted_job)
        completed_to_paywall_pct = pct(reached_paywall, completed_job)
        paywall_to_checkout_pct = pct(checkout_initiated, reached_paywall)
        checkout_to_paid_pct = pct(paid, checkout_initiated)
        overall_conversion_pct = pct(paid, registered)

        # 2. Moliyaviy ko'rsatkichlar (Financial stats for the period)
        internal_pay_clause = "" if include_internal else "AND (u.id IS NULL OR u.is_internal = FALSE)"
        revenue_row = db.execute(text(f"""
            SELECT 
                count(*) as approved_count,
                COALESCE(sum(p.amount), 0) as total_revenue,
                COALESCE(sum(CASE WHEN p.plan IS NOT NULL AND p.plan != '' THEN p.amount ELSE 0 END), 0) as subscription_revenue,
                COALESCE(sum(CASE WHEN p.minutes_purchased IS NOT NULL THEN p.amount ELSE 0 END), 0) as minute_packs_revenue,
                count(CASE WHEN p.plan IS NOT NULL AND p.plan != '' THEN 1 END) as subscription_count,
                count(CASE WHEN p.minutes_purchased IS NOT NULL THEN 1 END) as minute_packs_count
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = 'APPROVED'
              AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
              AND (p.created_at + interval '5 hours')::date >= :since
              AND (p.created_at + interval '5 hours')::date <= :today
              {internal_pay_clause}
        """), {"since": since_date, "today": today}).mappings().first()

        total_rev = (revenue_row["total_revenue"] if revenue_row else 0) or 0
        sub_rev = (revenue_row["subscription_revenue"] if revenue_row else 0) or 0
        min_rev = (revenue_row["minute_packs_revenue"] if revenue_row else 0) or 0
        app_count = (revenue_row["approved_count"] if revenue_row else 0) or 0
        aov = round(total_rev / max(1, app_count), 0)

        # 3. To'lov tizimlari taqsimoti (Provider breakdown)
        provider_rows = db.execute(text(f"""
            SELECT 
                p.provider,
                count(*) as count,
                COALESCE(sum(p.amount), 0) as total_amount
            FROM payments p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.status = 'APPROVED'
              AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
              AND (p.created_at + interval '5 hours')::date >= :since
              AND (p.created_at + interval '5 hours')::date <= :today
              {internal_pay_clause}
            GROUP BY p.provider
            ORDER BY total_amount DESC;
        """), {"since": since_date, "today": today}).mappings().all()

        providers = [
            {
                "provider": (r["provider"].value if hasattr(r["provider"], "value") else str(r["provider"])).upper(),
                "count": r["count"],
                "total_uzs": r["total_amount"],
                "pct": pct(r["total_amount"], total_rev),
            }
            for r in provider_rows
        ]

        # 4. So'nggi to'lovlar (Recent Conversions)
        recent_pay_rows = db.execute(text(f"""
            SELECT 
                p.id,
                p.amount,
                p.provider,
                p.plan,
                p.minutes_purchased,
                p.created_at + interval '5 hours' as created_at_tashkent,
                u.id as user_id,
                u.name as user_name,
                u.email as user_email,
                u.phone as user_phone
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'APPROVED'
              AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
              {internal_u_where}
            ORDER BY p.created_at DESC
            LIMIT 10;
        """)).mappings().all()

        recent_conversions = [
            {
                "payment_id": str(r["id"]),
                "user_id": str(r["user_id"]),
                "user_name": r["user_name"] or "Noma'lum",
                "user_email": r["user_email"] or "",
                "user_phone": r["user_phone"] or "",
                "item_type": "subscription" if r["plan"] else ("minute_pack" if r["minutes_purchased"] else "other"),
                "item_label": f"Tarif: {r['plan']}" if r["plan"] else (f"+{r['minutes_purchased']} daqiqa" if r["minutes_purchased"] else "Xarid"),
                "amount_uzs": r["amount"],
                "provider": (r["provider"].value if hasattr(r["provider"], "value") else str(r["provider"])).upper(),
                "paid_at": r["created_at_tashkent"].strftime("%Y-%m-%d %H:%M") if r["created_at_tashkent"] else None,
            }
            for r in recent_pay_rows
        ]

        # 5. Avtomatik tahlil va xulosalar (Actionable Insights)
        insights = []
        if registered > 0:
            if reg_to_verified_pct < 70.0:
                insights.append({
                    "stage": "verification",
                    "type": "warning",
                    "title": "Email tasdiqlashda yo'qotish yuqori",
                    "description": f"Ro'yxatdan o'tganlarning faqat {reg_to_verified_pct}% qismi hisobini tasdiqlagan. OTP kod yetib borishini tekshirish yoki Google Sign-In ni ko'proq targ'ib qilish tavsiya etiladi."
                })
            if verified_to_job_pct < 60.0:
                insights.append({
                    "stage": "activation",
                    "type": "warning",
                    "title": "Birinchi videoga o'tish sekin",
                    "description": f"Tasdiqlangan foydalanuvchilarning {verified_to_job_pct}% qismi video yuborgan. Bosh sahifada tayyor namunaviy videolar yoki qulayroq onboard tavsiya etiladi."
                })
            if checkout_to_paid_pct < 60.0 and checkout_initiated > 0:
                insights.append({
                    "stage": "checkout",
                    "type": "caution",
                    "title": "To'lov bosqichida tashlab ketish bor",
                    "description": f"To'lovni boshlaganlarning faqat {checkout_to_paid_pct}% qismi to'lovni muvaffaqiyatli yakunlagan. Click/Payme oynasiga o'tishdagi xatoliklar yoki qulaylikni tekshiring."
                })
            if overall_conversion_pct >= 5.0:
                insights.append({
                    "stage": "overall",
                    "type": "success",
                    "title": "A'lo darajadagi umumiy konversiya",
                    "description": f"Ro'yxatdan to'lovgacha umumiy konversiya {overall_conversion_pct}% ni tashkil etmoqda (SaaS o'rtachasi: 2-4%)."
                })
            elif overall_conversion_pct > 0:
                insights.append({
                    "stage": "overall",
                    "type": "info",
                    "title": "Barqaror konversiya",
                    "description": f"Umumiy konversiya ko'rsatkichi {overall_conversion_pct}%. Daqiqa paketlari taklifini kuchaytirish orqali o'stirish mumkin."
                })
            else:
                insights.append({
                    "stage": "overall",
                    "type": "info",
                    "title": "To'lovlar kutilmoqda",
                    "description": "Tanlangan davrda to'lovlar mavjud emas. Foydalanuvchilarga daqiqa paketlarini qulayroq ko'rsatish tavsiya etiladi."
                })

        return {
            "timeframe": {
                "days": days,
                "since_date": since_date.strftime("%Y-%m-%d"),
                "today": today.strftime("%Y-%m-%d"),
            },
            "stages": [
                {
                    "key": "registered",
                    "label": "Ro'yxatdan o'tganlar",
                    "count": registered,
                    "pct_of_top": 100.0,
                    "conversion_from_prev": 100.0,
                    "drop_pct": 0.0,
                    "icon": "UserPlus",
                },
                {
                    "key": "verified",
                    "label": "Tasdiqlangan hisoblar",
                    "count": verified,
                    "pct_of_top": pct(verified, registered),
                    "conversion_from_prev": reg_to_verified_pct,
                    "drop_pct": round(100.0 - reg_to_verified_pct, 1),
                    "icon": "UserCheck",
                },
                {
                    "key": "attempted_job",
                    "label": "Kamida 1 video yuborganlar",
                    "count": attempted_job,
                    "pct_of_top": pct(attempted_job, registered),
                    "conversion_from_prev": verified_to_job_pct,
                    "drop_pct": round(100.0 - verified_to_job_pct, 1),
                    "icon": "Video",
                },
                {
                    "key": "completed_job",
                    "label": "Muvaffaqiyatli dublyaj olganlar",
                    "count": completed_job,
                    "pct_of_top": pct(completed_job, registered),
                    "conversion_from_prev": job_to_completed_pct,
                    "drop_pct": round(100.0 - job_to_completed_pct, 1),
                    "icon": "CheckCircle2",
                },
                {
                    "key": "reached_paywall",
                    "label": "Limitga duch kelgan / Faollar (2+ video / 5+ daq)",
                    "count": reached_paywall,
                    "pct_of_top": pct(reached_paywall, registered),
                    "conversion_from_prev": completed_to_paywall_pct,
                    "drop_pct": round(100.0 - completed_to_paywall_pct, 1),
                    "icon": "Zap",
                },
                {
                    "key": "checkout_initiated",
                    "label": "To'lovni boshlaganlar",
                    "count": checkout_initiated,
                    "pct_of_top": pct(checkout_initiated, registered),
                    "conversion_from_prev": paywall_to_checkout_pct,
                    "drop_pct": round(100.0 - paywall_to_checkout_pct, 1),
                    "icon": "CreditCard",
                },
                {
                    "key": "paid",
                    "label": "Muvaffaqiyatli to'lov qilganlar",
                    "count": paid,
                    "pct_of_top": overall_conversion_pct,
                    "conversion_from_prev": checkout_to_paid_pct,
                    "drop_pct": round(100.0 - checkout_to_paid_pct, 1),
                    "icon": "Award",
                },
            ],
            "metrics": {
                "overall_conversion_pct": overall_conversion_pct,
                "total_revenue_uzs": total_rev,
                "subscription_revenue_uzs": sub_rev,
                "minute_packs_revenue_uzs": min_rev,
                "average_order_value_uzs": aov,
                "approved_transactions_count": app_count,
            },
            "providers": providers,
            "recent_conversions": recent_conversions,
            "insights": insights,
        }
    finally:
        db.close()


@router.get("/cohorts")
def admin_cohorts_stats(
    granularity: str = Query(default="weekly"),
    metric: str = Query(default="activity"),
    periods_count: int = Query(default=8, ge=4, le=24),
    include_internal: bool = Query(default=False),
    current_user: User = Depends(get_current_admin_user),
):
    """Foydalanuvchilarning aktivatsiya va retention kohortalari tahlili:
    - Haftalik yoki Oylik kohortalar (Weekly / Monthly)
    - Ko'rsatkich turi bo'yicha:
        1. 'activity' — platformaga kirish, video yuborish yoki tahlil
        2. 'jobs' — kamida bitta video yoki tahlil yaratish (Mahsulot qiymati)
        3. 'paying' — to'lov qiluvchilar retentioni (Repeat purchase)
    - Klassik kohorta issiqlik xaritasi (Heatmap matrix) W0, W1, W2...
    - Aktivatsiya bosqichlari (Tasdiqlangan, D0 24h, D3, Aha! moment, 2+ video, To'lov)
    - O'rtacha va median birinchi harakat vaqti (Time to first action)
    - Amaliy tavsiyalar va xulosalar (Actionable insights)
    """
    from sqlalchemy import text
    from datetime import date, datetime, timedelta

    if granularity not in ("weekly", "monthly"):
        granularity = "weekly"
    if metric not in ("activity", "jobs", "paying"):
        metric = "activity"

    db = SessionLocal()
    try:
        now_utc = datetime.utcnow()
        now_tashkent = now_utc + timedelta(hours=5)
        today = now_tashkent.date()
        internal_clause = "" if include_internal else "AND u.is_internal = FALSE"

        UZBEK_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"]

        # 1. Kohortalar bazasi (Ro'yxatdan o'tgan haftalar/oylar)
        if granularity == "weekly":
            cohort_sql = f"""
                SELECT 
                    date_trunc('week', u.created_at + interval '5 hours')::date as cohort_start,
                    (date_trunc('week', u.created_at + interval '5 hours')::date + interval '6 days')::date as cohort_end,
                    to_char(u.created_at + interval '5 hours', 'IYYY-\"W\"IW') as cohort_id,
                    count(*) as cohort_size
                FROM users u
                WHERE 1=1 {internal_clause}
                GROUP BY 1, 2, 3
                ORDER BY cohort_start DESC
                LIMIT :limit;
            """
        else:
            cohort_sql = f"""
                SELECT 
                    date_trunc('month', u.created_at + interval '5 hours')::date as cohort_start,
                    (date_trunc('month', u.created_at + interval '5 hours') + interval '1 month - 1 day')::date as cohort_end,
                    to_char(u.created_at + interval '5 hours', 'YYYY-MM') as cohort_id,
                    count(*) as cohort_size
                FROM users u
                WHERE 1=1 {internal_clause}
                GROUP BY 1, 2, 3
                ORDER BY cohort_start DESC
                LIMIT :limit;
            """

        cohort_rows = db.execute(text(cohort_sql), {"limit": periods_count}).mappings().all()
        if not cohort_rows:
            return {
                "granularity": granularity,
                "metric": metric,
                "cohorts": [],
                "benchmarks": [],
                "activation": [],
                "activation_summary": {},
                "insights": []
            }

        oldest_cohort_start = cohort_rows[-1]["cohort_start"]

        # 2. Tanlangan ko'rsatkich bo'yicha faollik manbasi (Activity CTE)
        if metric == "jobs":
            activity_cte = """
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as act_day 
                FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT va.user_id, (va.created_at + interval '5 hours')::date as act_day 
                FROM video_analyses va WHERE va.user_id IS NOT NULL
            """
        elif metric == "paying":
            activity_cte = """
                SELECT p.user_id, (p.created_at + interval '5 hours')::date as act_day 
                FROM payments p 
                WHERE p.user_id IS NOT NULL 
                  AND p.status = 'APPROVED' 
                  AND (p.is_donation IS FALSE OR p.is_donation IS NULL)
            """
        else:  # activity
            activity_cte = """
                SELECT v.user_id, v.visit_date as act_day FROM user_daily_visits v
                UNION
                SELECT j.user_id, (j.created_at + interval '5 hours')::date as act_day 
                FROM dubbing_jobs j WHERE j.user_id IS NOT NULL
                UNION
                SELECT va.user_id, (va.created_at + interval '5 hours')::date as act_day 
                FROM video_analyses va WHERE va.user_id IS NOT NULL
                UNION
                SELECT p.user_id, (p.created_at + interval '5 hours')::date as act_day 
                FROM payments p WHERE p.user_id IS NOT NULL AND p.status = 'APPROVED'
            """

        # 3. Retention Matrix so'rovi (Heatmap jadvali)
        if granularity == "weekly":
            matrix_sql = f"""
                WITH user_cohorts AS (
                    SELECT 
                        u.id as user_id,
                        date_trunc('week', u.created_at + interval '5 hours')::date as cohort_start
                    FROM users u
                    WHERE (u.created_at + interval '5 hours')::date >= :oldest_start
                      {internal_clause}
                ),
                activity AS (
                    {activity_cte}
                )
                SELECT 
                    uc.cohort_start,
                    FLOOR((date_trunc('week', a.act_day)::date - uc.cohort_start) / 7.0)::int as period_index,
                    count(DISTINCT uc.user_id) as active_count
                FROM user_cohorts uc
                JOIN activity a ON uc.user_id = a.user_id
                WHERE a.act_day >= uc.cohort_start
                GROUP BY 1, 2
                HAVING FLOOR((date_trunc('week', a.act_day)::date - uc.cohort_start) / 7.0)::int BETWEEN 0 AND :max_periods;
            """
        else:
            matrix_sql = f"""
                WITH user_cohorts AS (
                    SELECT 
                        u.id as user_id,
                        date_trunc('month', u.created_at + interval '5 hours')::date as cohort_start
                    FROM users u
                    WHERE (u.created_at + interval '5 hours')::date >= :oldest_start
                      {internal_clause}
                ),
                activity AS (
                    {activity_cte}
                )
                SELECT 
                    uc.cohort_start,
                    ((EXTRACT(YEAR FROM a.act_day) - EXTRACT(YEAR FROM uc.cohort_start)) * 12 + 
                     (EXTRACT(MONTH FROM a.act_day) - EXTRACT(MONTH FROM uc.cohort_start)))::int as period_index,
                    count(DISTINCT uc.user_id) as active_count
                FROM user_cohorts uc
                JOIN activity a ON uc.user_id = a.user_id
                WHERE a.act_day >= uc.cohort_start
                GROUP BY 1, 2
                HAVING ((EXTRACT(YEAR FROM a.act_day) - EXTRACT(YEAR FROM uc.cohort_start)) * 12 + 
                        (EXTRACT(MONTH FROM a.act_day) - EXTRACT(MONTH FROM uc.cohort_start)))::int BETWEEN 0 AND :max_periods;
            """

        matrix_rows = db.execute(text(matrix_sql), {
            "oldest_start": oldest_cohort_start,
            "max_periods": periods_count - 1
        }).mappings().all()

        matrix_map = {}
        for r in matrix_rows:
            matrix_map[(r["cohort_start"], r["period_index"])] = r["active_count"]

        # Retention satrlarini tuzish
        retention_rows = []
        period_sums = {p: [] for p in range(periods_count)}
        for c in cohort_rows:
            c_start = c["cohort_start"]
            c_end = c["cohort_end"]
            c_size = c["cohort_size"]
            c_id = c["cohort_id"]

            if granularity == "weekly":
                label = f"{c_start.strftime('%d.%m')} - {c_end.strftime('%d.%m')}"
            else:
                month_name = UZBEK_MONTHS[c_start.month - 1]
                label = f"{month_name} {c_start.year}"

            periods = []
            for p in range(periods_count):
                if granularity == "weekly":
                    p_start = c_start + timedelta(days=p * 7)
                else:
                    m_year = c_start.year + (c_start.month - 1 + p) // 12
                    m_month = ((c_start.month - 1 + p) % 12) + 1
                    p_start = date(m_year, m_month, 1)

                is_future = p_start > today
                if is_future:
                    periods.append({
                        "period_index": p,
                        "label": f"{'W' if granularity == 'weekly' else 'M'}{p}",
                        "active_count": 0,
                        "retention_pct": None,
                        "is_future": True,
                    })
                else:
                    act_count = matrix_map.get((c_start, p), 0)
                    pct = round(100.0 * act_count / max(1, c_size), 1)
                    periods.append({
                        "period_index": p,
                        "label": f"{'W' if granularity == 'weekly' else 'M'}{p}",
                        "active_count": act_count,
                        "retention_pct": pct,
                        "is_future": False,
                    })
                    period_sums[p].append(pct)

            retention_rows.append({
                "cohort_id": c_id,
                "cohort_label": label,
                "cohort_start": c_start.strftime("%Y-%m-%d"),
                "cohort_end": c_end.strftime("%Y-%m-%d"),
                "cohort_size": c_size,
                "periods": periods,
            })

        # Benchmarks (O'rtacha ko'rsatkichlar)
        benchmarks = []
        for p in range(periods_count):
            vals = period_sums[p]
            avg_pct = round(sum(vals) / len(vals), 1) if vals else None
            benchmarks.append({
                "period_index": p,
                "label": f"{'W' if granularity == 'weekly' else 'M'}{p}",
                "avg_retention_pct": avg_pct,
                "cohorts_count": len(vals),
            })

        # 4. Aktivatsiya Kohortasi (Activation Milestones & Time-to-First-Action)
        if granularity == "weekly":
            date_group = "date_trunc('week', u.created_at + interval '5 hours')::date"
        else:
            date_group = "date_trunc('month', u.created_at + interval '5 hours')::date"

        activation_sql = f"""
            WITH user_first_actions AS (
                SELECT 
                    u.id as user_id,
                    {date_group} as cohort_start,
                    u.created_at as reg_time,
                    u.is_verified,
                    (SELECT MIN(j.created_at) FROM dubbing_jobs j WHERE j.user_id = u.id) as first_job_time,
                    (SELECT MIN(va.created_at) FROM video_analyses va WHERE va.user_id = u.id) as first_analysis_time,
                    COALESCE((SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u.id), 0) +
                    COALESCE((SELECT count(*) FROM video_analyses va WHERE va.user_id = u.id), 0) as total_actions,
                    COALESCE((SELECT count(*) FROM dubbing_jobs j WHERE j.user_id = u.id AND j.status = 'COMPLETED'), 0) as completed_jobs,
                    COALESCE((SELECT count(*) FROM payments p WHERE p.user_id = u.id AND p.status = 'APPROVED' AND (p.is_donation IS FALSE OR p.is_donation IS NULL)), 0) as approved_payments
                FROM users u
                WHERE (u.created_at + interval '5 hours')::date >= :oldest_start
                  {internal_clause}
            ),
            user_calc AS (
                SELECT 
                    user_id,
                    cohort_start,
                    is_verified,
                    total_actions,
                    completed_jobs,
                    approved_payments,
                    LEAST(first_job_time, first_analysis_time) as first_action_time,
                    CASE 
                        WHEN LEAST(first_job_time, first_analysis_time) IS NOT NULL 
                        THEN EXTRACT(EPOCH FROM (LEAST(first_job_time, first_analysis_time) - reg_time)) / 60.0 
                        ELSE NULL 
                    END as minutes_to_action
                FROM user_first_actions
            )
            SELECT 
                cohort_start,
                count(*) as total_users,
                count(CASE WHEN is_verified THEN 1 END) as verified_count,
                count(CASE WHEN total_actions >= 1 THEN 1 END) as attempted_count,
                count(CASE WHEN minutes_to_action IS NOT NULL AND minutes_to_action <= 1440 THEN 1 END) as d0_activated_count,
                count(CASE WHEN minutes_to_action IS NOT NULL AND minutes_to_action <= 4320 THEN 1 END) as d3_activated_count,
                count(CASE WHEN minutes_to_action IS NOT NULL AND minutes_to_action <= 10080 THEN 1 END) as d7_activated_count,
                count(CASE WHEN completed_jobs >= 1 THEN 1 END) as completed_job_count,
                count(CASE WHEN total_actions >= 2 THEN 1 END) as habit_2plus_count,
                count(CASE WHEN approved_payments >= 1 THEN 1 END) as paid_count,
                ROUND(AVG(CASE WHEN minutes_to_action IS NOT NULL AND minutes_to_action >= 0 THEN minutes_to_action END)::numeric, 1) as avg_min_to_action,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY minutes_to_action)::numeric, 1) as median_min_to_action
            FROM user_calc
            GROUP BY 1
            ORDER BY 1 DESC;
        """

        act_rows = db.execute(text(activation_sql), {"oldest_start": oldest_cohort_start}).mappings().all()
        act_map = {r["cohort_start"]: r for r in act_rows}

        activation_rows = []
        total_all_users = 0
        total_all_verified = 0
        total_all_d0 = 0
        total_all_aha = 0
        total_all_habit = 0
        total_all_paid = 0

        def calc_pct(part: int, whole: int) -> float:
            return round(100.0 * part / max(1, whole), 1)

        for c in cohort_rows:
            c_start = c["cohort_start"]
            c_end = c["cohort_end"]
            c_size = c["cohort_size"]
            c_id = c["cohort_id"]

            if granularity == "weekly":
                label = f"{c_start.strftime('%d.%m')} - {c_end.strftime('%d.%m')}"
            else:
                month_name = UZBEK_MONTHS[c_start.month - 1]
                label = f"{month_name} {c_start.year}"

            act_data = act_map.get(c_start, {})
            u_count = act_data.get("total_users", c_size) or c_size
            verified_c = act_data.get("verified_count", 0) or 0
            attempted_c = act_data.get("attempted_count", 0) or 0
            d0_c = act_data.get("d0_activated_count", 0) or 0
            d3_c = act_data.get("d3_activated_count", 0) or 0
            d7_c = act_data.get("d7_activated_count", 0) or 0
            completed_c = act_data.get("completed_job_count", 0) or 0
            habit_c = act_data.get("habit_2plus_count", 0) or 0
            paid_c = act_data.get("paid_count", 0) or 0
            avg_min = float(act_data.get("avg_min_to_action") or 0.0)
            med_min = float(act_data.get("median_min_to_action") or 0.0)

            total_all_users += u_count
            total_all_verified += verified_c
            total_all_d0 += d0_c
            total_all_aha += completed_c
            total_all_habit += habit_c
            total_all_paid += paid_c

            activation_rows.append({
                "cohort_id": c_id,
                "cohort_label": label,
                "cohort_start": c_start.strftime("%Y-%m-%d"),
                "cohort_end": c_end.strftime("%Y-%m-%d"),
                "cohort_size": u_count,
                "verified_count": verified_c,
                "verified_pct": calc_pct(verified_c, u_count),
                "attempted_count": attempted_c,
                "attempted_pct": calc_pct(attempted_c, u_count),
                "d0_activated_count": d0_c,
                "d0_activated_pct": calc_pct(d0_c, u_count),
                "d3_activated_count": d3_c,
                "d3_activated_pct": calc_pct(d3_c, u_count),
                "d7_activated_count": d7_c,
                "d7_activated_pct": calc_pct(d7_c, u_count),
                "completed_job_count": completed_c,
                "completed_job_pct": calc_pct(completed_c, u_count),
                "habit_2plus_count": habit_c,
                "habit_2plus_pct": calc_pct(habit_c, u_count),
                "paid_count": paid_c,
                "paid_pct": calc_pct(paid_c, u_count),
                "avg_min_to_action": avg_min,
                "median_min_to_action": med_min,
            })

        # 5. Aktivatsiya Umumiy Xulosasi (Activation Summary)
        avg_d0 = calc_pct(total_all_d0, total_all_users)
        avg_aha = calc_pct(total_all_aha, total_all_users)
        avg_habit = calc_pct(total_all_habit, total_all_users)
        avg_paid = calc_pct(total_all_paid, total_all_users)
        avg_w1_ret = benchmarks[1]["avg_retention_pct"] if len(benchmarks) > 1 else None

        activation_summary = {
            "total_users_evaluated": total_all_users,
            "overall_verified_pct": calc_pct(total_all_verified, total_all_users),
            "overall_d0_activation_pct": avg_d0,
            "overall_aha_moment_pct": avg_aha,
            "overall_habit_pct": avg_habit,
            "overall_paid_pct": avg_paid,
            "avg_w1_retention_pct": avg_w1_ret,
            "median_time_to_first_action_min": activation_rows[0]["median_min_to_action"] if activation_rows else 3.0,
        }

        # 6. Avtomatik Tahlillar va Tavsiyalar (Actionable Insights)
        insights = []
        if total_all_users > 0:
            insights.append({
                "type": "success",
                "title": "Tezkor birinchi harakat (Time-to-Value)",
                "description": f"Foydalanuvchilarning ro'yxatdan o'tgandan birinchi video/tahlilni yuborishgacha bo'lgan median vaqti taxminan {activation_summary['median_time_to_first_action_min']} daqiqani tashkil etmoqda. Onboarding jarayoni tez va tushunarli."
            })
            if avg_d0 < 45.0:
                insights.append({
                    "type": "warning",
                    "title": "D0 (24 soatlik) aktivatsiyani oshirish imkoniyati",
                    "description": f"Yangi foydalanuvchilarning {avg_d0}% qismi birinchi 24 soat ichida video yuborgan. Ro'yxatdan o'tgan zahoti tayyor namunaviy videolarni taklif qilish D0 aktivatsiyasini 55%+ ga yetkazishi mumkin."
                })
            else:
                insights.append({
                    "type": "success",
                    "title": "Yuqori D0 aktivatsiya darajasi",
                    "description": f"Yangi foydalanuvchilarning {avg_d0}% qismi dastlabki 24 soatda faol harakat qilmoqda (Benchmark: 35-40%)."
                })

            if avg_aha < 30.0:
                insights.append({
                    "type": "caution",
                    "title": "'Aha! moment' (birinchi muvaffaqiyatli video)da yo'qotish",
                    "description": f"Foydalanuvchilarning faqat {avg_aha}% qismi kamida 1 ta tayyor video olgan. Video tahlil/dublyaj jarayonidagi xatoliklarni kamaytirish va navbatni tezlatish muhim."
                })
            else:
                insights.append({
                    "type": "info",
                    "title": "Barqaror asosiy qiymat yetkazilishi",
                    "description": f"Foydalanuvchilarning {avg_aha}% qismi birinchi videoni muvaffaqiyatli qabul qilib, mahsulotning haqiqiy qiymatini his qilgan."
                })

            if avg_w1_ret is not None and avg_w1_ret < 10.0:
                insights.append({
                    "type": "warning",
                    "title": "W1 (1-hafta) qaytish ko'rsatkichi",
                    "description": f"Haftalik qaytish o'rtacha {avg_w1_ret}%. Foydalanuvchilar bilan 3-kuni va 7-kuni Telegram-bot yoki Email orqali foydali yangi funksiyalar va tavsiyalar bilan aloqaga chiqish tavsiya etiladi."
                })

        return {
            "granularity": granularity,
            "metric": metric,
            "timeframe": {
                "since_date": oldest_cohort_start.strftime("%Y-%m-%d"),
                "today": today.strftime("%Y-%m-%d"),
            },
            "cohorts": retention_rows,
            "benchmarks": benchmarks,
            "activation": activation_rows,
            "activation_summary": activation_summary,
            "insights": insights,
        }
    finally:
        db.close()



# ─────────────────────────────────────────────────────────────
# Ommaviy xabarnomalar (Broadcast Notifications: Email & Telegram)
# ─────────────────────────────────────────────────────────────

class BroadcastCreateRequest(BaseModel):
    title: str
    message: str
    channel: str = "both"  # "both", "telegram", "email"
    target_filter: str = "all"  # "all", "telegram_users", "email_users", "paid_users", "free_users"
    button_text: str | None = None
    button_url: str | None = None


class BroadcastTestRequest(BaseModel):
    title: str
    message: str
    channel: str = "both"  # "both", "telegram", "email"
    button_text: str | None = None
    button_url: str | None = None
    test_email: str | None = None
    test_telegram_chat_id: str | None = None


def _process_broadcast_campaign(campaign_id: str):
    """Fon rejimida barcha foydalanuvchilarga xabarlarni jo'natish."""
    import html as html_lib
    import logging
    import time
    from backend.services.email_service import send_broadcast_email
    from backend.services.telegram_notify import send_telegram_message

    task_logger = logging.getLogger("broadcast_task")
    db = SessionLocal()
    try:
        campaign = db.query(BroadcastCampaign).filter(BroadcastCampaign.id == campaign_id).first()
        if not campaign:
            return

        campaign.status = "sending"
        db.commit()

        # Auditoriyani filtrlash
        q = db.query(User).filter(User.is_active.is_(True))
        if campaign.target_filter == "telegram_users":
            q = q.filter(User.telegram_chat_id.isnot(None))
        elif campaign.target_filter == "email_users":
            q = q.filter(User.email.isnot(None))
        elif campaign.target_filter == "paid_users":
            q = q.join(Subscription, Subscription.user_id == User.id).filter(
                Subscription.tier != PlanTier.FREE,
                Subscription.status == "active"
            )
        elif campaign.target_filter == "free_users":
            paid_sub_user_ids = db.query(Subscription.user_id).filter(
                Subscription.tier != PlanTier.FREE,
                Subscription.status == "active"
            ).subquery()
            q = q.filter(User.id.notin_(paid_sub_user_ids))
        elif campaign.target_filter == "unactivated_users":
            completed_sub = db.query(DubbingJob.user_id).filter(
                DubbingJob.status == JobStatus.COMPLETED,
                DubbingJob.user_id.isnot(None)
            ).subquery()
            q = q.filter(
                User.id.notin_(completed_sub),
                or_(User.is_internal.is_(False), User.is_internal.is_(None))
            )

        users = q.all()
        recipient_data = [
            {
                "id": str(u.id),
                "name": u.name or "",
                "email": (u.email or "").strip().lower(),
                "telegram_chat_id": (u.telegram_chat_id or "").strip(),
            }
            for u in users
        ]

        campaign.total_recipients = len(recipient_data)
        db.commit()

        email_sent = 0
        email_failed = 0
        tg_sent = 0
        tg_failed = 0

        tg_text = f"📢 <b>{html_lib.escape(campaign.title)}</b>\n\n{html_lib.escape(campaign.message)}"
        tg_markup = None
        if campaign.button_text and campaign.button_url:
            tg_markup = {
                "inline_keyboard": [
                    [{"text": campaign.button_text, "url": campaign.button_url}]
                ]
            }

        for idx, rec in enumerate(recipient_data):
            # 1. Telegram
            if campaign.channel in ("both", "telegram") and rec["telegram_chat_id"]:
                try:
                    success = send_telegram_message(
                        chat_id=rec["telegram_chat_id"],
                        text=tg_text,
                        reply_markup=tg_markup,
                    )
                    if success:
                        tg_sent += 1
                    else:
                        tg_failed += 1
                except Exception as e:
                    task_logger.warning(f"Broadcast TG error ({rec['telegram_chat_id']}): {e}")
                    tg_failed += 1
                time.sleep(0.04)  # Telegram limit ~25/sec

            # 2. Email
            if campaign.channel in ("both", "email") and rec["email"]:
                try:
                    success = send_broadcast_email(
                        to_email=rec["email"],
                        name=rec["name"],
                        subject=campaign.title,
                        message_text=campaign.message,
                        button_text=campaign.button_text,
                        button_url=campaign.button_url,
                    )
                    if success:
                        email_sent += 1
                    else:
                        email_failed += 1
                except Exception as e:
                    task_logger.warning(f"Broadcast Email error ({rec['email']}): {e}")
                    email_failed += 1
                time.sleep(0.1)  # Resend limit ~10/sec

            if idx % 20 == 0 or idx == len(recipient_data) - 1:
                campaign.email_sent = email_sent
                campaign.email_failed = email_failed
                campaign.telegram_sent = tg_sent
                campaign.telegram_failed = tg_failed
                db.commit()

        campaign.status = "completed"
        campaign.completed_at = datetime.utcnow()
        campaign.email_sent = email_sent
        campaign.email_failed = email_failed
        campaign.telegram_sent = tg_sent
        campaign.telegram_failed = tg_failed
        db.commit()

    except Exception as e:
        task_logger.exception(f"Broadcast fatal error: {e}")
        try:
            campaign = db.query(BroadcastCampaign).filter(BroadcastCampaign.id == campaign_id).first()
            if campaign:
                campaign.status = "failed"
                campaign.error_message = str(e)
                campaign.completed_at = datetime.utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.get("/broadcast/audience")
def get_broadcast_audience(
    channel: str = Query(default="both"),
    target_filter: str = Query(default="all"),
    current_user: User = Depends(get_current_admin_user),
):
    """Tanlangan filtr bo'yicha qancha foydalanuvchiga xabar yetib borishini hisoblaydi."""
    db = SessionLocal()
    try:
        q = db.query(User).filter(User.is_active.is_(True))
        if target_filter == "telegram_users":
            q = q.filter(User.telegram_chat_id.isnot(None))
        elif target_filter == "email_users":
            q = q.filter(User.email.isnot(None))
        elif target_filter == "paid_users":
            q = q.join(Subscription, Subscription.user_id == User.id).filter(
                Subscription.tier != PlanTier.FREE,
                Subscription.status == "active"
            )
        elif target_filter == "free_users":
            paid_sub_user_ids = db.query(Subscription.user_id).filter(
                Subscription.tier != PlanTier.FREE,
                Subscription.status == "active"
            ).subquery()
            q = q.filter(User.id.notin_(paid_sub_user_ids))
        elif target_filter == "unactivated_users":
            completed_sub = db.query(DubbingJob.user_id).filter(
                DubbingJob.status == JobStatus.COMPLETED,
                DubbingJob.user_id.isnot(None)
            ).subquery()
            q = q.filter(
                User.id.notin_(completed_sub),
                or_(User.is_internal.is_(False), User.is_internal.is_(None))
            )

        users = q.all()
        total_matched = len(users)

        email_count = sum(1 for u in users if u.email) if channel in ("both", "email") else 0
        telegram_count = sum(1 for u in users if u.telegram_chat_id) if channel in ("both", "telegram") else 0

        return {
            "total_matched": total_matched,
            "email_recipients": email_count,
            "telegram_recipients": telegram_count,
            "channel": channel,
            "target_filter": target_filter,
        }
    finally:
        db.close()


@router.post("/broadcast/test")
def send_broadcast_test(
    body: BroadcastTestRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Adminning o'ziga bitta sinov xabarini yuboradi (yuborishdan oldin ko'rib olish uchun)."""
    import html as html_lib
    from backend.services.email_service import send_broadcast_email
    from backend.services.telegram_notify import send_telegram_message

    target_email = body.test_email or current_user.email
    target_tg = body.test_telegram_chat_id or current_user.telegram_chat_id

    email_sent = False
    tg_sent = False
    errors = []

    if body.channel in ("both", "email"):
        if not target_email:
            errors.append("Admin emailingiz topilmadi. Iltimos, sinov email manzilini kiriting.")
        else:
            success = send_broadcast_email(
                to_email=target_email,
                name=current_user.name or "Admin",
                subject=f"[TEST] {body.title}",
                message_text=body.message,
                button_text=body.button_text,
                button_url=body.button_url,
            )
            if success:
                email_sent = True
            else:
                errors.append(f"Email yuborishda xatolik yuz berdi ({target_email}).")

    if body.channel in ("both", "telegram"):
        if not target_tg:
            errors.append("Admin Telegram ID topilmadi. Avval botga /start bosing yoki Telegram ID kiriting.")
        else:
            tg_text = f"🧪 <b>[TEST XABAR]</b>\n\n📢 <b>{html_lib.escape(body.title)}</b>\n\n{html_lib.escape(body.message)}"
            tg_markup = None
            if body.button_text and body.button_url:
                tg_markup = {
                    "inline_keyboard": [
                        [{"text": body.button_text, "url": body.button_url}]
                    ]
                }
            success = send_telegram_message(
                chat_id=target_tg,
                text=tg_text,
                reply_markup=tg_markup,
            )
            if success:
                tg_sent = True
            else:
                errors.append(f"Telegram bot orqali xabar yuborib bo'lmadi ({target_tg}).")

    return {
        "success": email_sent or tg_sent,
        "email_sent": email_sent,
        "telegram_sent": tg_sent,
        "target_email": target_email,
        "target_telegram": target_tg,
        "errors": errors,
    }


@router.post("/broadcast")
def create_broadcast_campaign(
    body: BroadcastCreateRequest,
    current_user: User = Depends(get_current_admin_user),
):
    """Barcha tanlangan foydalanuvchilarga xabarnoma yuborish kampaniyasini boshlaydi."""
    import threading

    if not body.title.strip():
        raise HTTPException(status_code=400, detail="Xabar sarlavhasi (mavzusi) kiritilishi shart.")
    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Xabar matni kiritilishi shart.")

    db = SessionLocal()
    try:
        campaign = BroadcastCampaign(
            admin_id=current_user.id,
            title=body.title.strip(),
            message=body.message.strip(),
            channel=body.channel,
            target_filter=body.target_filter,
            button_text=body.button_text.strip() if body.button_text else None,
            button_url=body.button_url.strip() if body.button_url else None,
            status="pending",
        )
        db.add(campaign)
        db.commit()
        db.refresh(campaign)

        # Fon oqimida (asynchronous background thread) yuborishni boshlaymiz
        thread = threading.Thread(
            target=_process_broadcast_campaign,
            args=(str(campaign.id),),
            daemon=True,
        )
        thread.start()

        return {
            "success": True,
            "campaign_id": str(campaign.id),
            "status": "pending",
            "message": "Xabar yuborish boshlandi.",
        }
    finally:
        db.close()


@router.get("/broadcast")
def list_broadcast_campaigns(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_admin_user),
):
    """Oldin yuborilgan xabarnomalar kampaniyalari ro'yxatini qaytaradi."""
    db = SessionLocal()
    try:
        rows = (
            db.query(BroadcastCampaign, User.name, User.email)
            .outerjoin(User, BroadcastCampaign.admin_id == User.id)
            .order_by(BroadcastCampaign.created_at.desc())
            .limit(limit)
            .all()
        )

        campaigns = []
        for c, admin_name, admin_email in rows:
            campaigns.append({
                "id": str(c.id),
                "title": c.title,
                "message": c.message,
                "channel": c.channel,
                "target_filter": c.target_filter,
                "button_text": c.button_text,
                "button_url": c.button_url,
                "status": c.status,
                "total_recipients": c.total_recipients or 0,
                "email_sent": c.email_sent or 0,
                "email_failed": c.email_failed or 0,
                "telegram_sent": c.telegram_sent or 0,
                "telegram_failed": c.telegram_failed or 0,
                "error_message": c.error_message,
                "created_at": to_tashkent_iso(c.created_at),
                "completed_at": to_tashkent_iso(c.completed_at),
                "admin": {
                    "name": admin_name or "Admin",
                    "email": admin_email or "",
                },
            })

        return {"campaigns": campaigns}
    finally:
        db.close()


@router.get("/gemini-quota")
def get_gemini_quota(current_admin: User = Depends(get_current_admin_user)):
    """
    Barcha Gemini API kalitlari va modellarining joriy kvota,
    cooldown va so'rovlar holatini qaytaradi.
    """
    from backend.services.gemini_quota_manager import get_gemini_quota_status
    return get_gemini_quota_status()


class AdminGeminiModeRequest(BaseModel):
    mode: str  # "free" | "paid"


class AdminGeminiBalanceRequest(BaseModel):
    initial_balance: float


class AdminGeminiResetCooldownRequest(BaseModel):
    key_masked: str
    model: str | None = None


@router.get("/gemini-keys/overview")
def get_gemini_keys_overview(
    current_admin: User = Depends(get_current_admin_user),
):
    """
    Barcha Gemini API kalitlari (pullik va 36+ bepul), ularning rasmiy limitlari,
    muvaffaqiyatli videolar soni, umumiy davomiyligi, hisoblangan tannarxi (USD/UZS)
    va alohida pullik kalit bloki ma'lumotlarini qaytaradi.
    Shuningdek Groq Cloud kalitlari blokini alohida aralashtirmagan holda taqdim etadi.
    """
    from backend.services.gemini_quota_manager import get_gemini_keys_detailed_stats
    from backend.services.groq_service import get_groq_keys_detailed_stats
    db = SessionLocal()
    try:
        stats = get_gemini_keys_detailed_stats(db)
        stats["groq"] = get_groq_keys_detailed_stats(db)
        return stats
    finally:
        db.close()


@router.get("/groq-keys/overview")
def get_groq_keys_overview_endpoint(
    current_admin: User = Depends(get_current_admin_user),
):
    """Groq Cloud API kalitlari ro'yxati, bepul limitlar ($0.00 / 0 UZS) va holatini qaytaradi."""
    from backend.services.groq_service import get_groq_keys_detailed_stats
    db = SessionLocal()
    try:
        return get_groq_keys_detailed_stats(db)
    finally:
        db.close()


class AdminGroqResetCooldownRequest(BaseModel):
    key_masked: str


@router.post("/groq-keys/reset-cooldown")
def reset_admin_groq_cooldown_endpoint(
    req: AdminGroqResetCooldownRequest,
    current_admin: User = Depends(get_current_admin_user),
):
    """Groq kalit cooldownini qo'lda tozalash."""
    from backend.services.groq_service import reset_groq_key_cooldown
    ok = reset_groq_key_cooldown(req.key_masked)
    return {"status": "ok" if ok else "not_found", "key_masked": req.key_masked}


@router.post("/gemini-keys/admin-mode")
def set_admin_gemini_mode_endpoint(
    req: AdminGeminiModeRequest,
    current_admin: User = Depends(get_current_admin_user),
):
    """Admin dublyaj/tahlil qilganda qaysi kalit ishlasin: 'free' (default) yoki 'paid'."""
    from backend.services.gemini_quota_manager import set_admin_gemini_mode
    res_mode = set_admin_gemini_mode(req.mode)
    return {"status": "ok", "mode": res_mode, "message": f"Admin rejimi '{res_mode}' ga o'zgartirildi."}


@router.post("/gemini-keys/initial-balance")
def set_admin_gemini_balance_endpoint(
    req: AdminGeminiBalanceRequest,
    current_admin: User = Depends(get_current_admin_user),
):
    """Pullik kalitning boshlang'ich kiritilgan balansini sozlash."""
    from backend.services.gemini_quota_manager import set_paid_initial_balance
    bal = set_paid_initial_balance(req.initial_balance)
    return {"status": "ok", "initial_balance": bal, "message": f"Boshlang'ich balans ${bal:.2f} qilib belgilandi."}


@router.post("/gemini-keys/reset-cooldown")
def reset_admin_gemini_cooldown_endpoint(
    req: AdminGeminiResetCooldownRequest,
    current_admin: User = Depends(get_current_admin_user),
):
    """Kalit yoki model cooldownini zudlik bilan tozalash."""
    from backend.services.gemini_quota_manager import reset_gemini_key_cooldown
    ok = reset_gemini_key_cooldown(req.key_masked, req.model)
    return {"status": "ok" if ok else "not_found", "key_masked": req.key_masked}


class ExcludedEmailCreateRequest(BaseModel):
    email: str
    reason: str = "Dasturchi / Test"


@router.get("/excluded-emails")
def list_excluded_emails(current_user: User = Depends(get_current_admin_user)):
    """Mijoz emas (ExcludedEmail) ro'yxatini qaytaradi."""
    db = SessionLocal()
    try:
        items = db.query(ExcludedEmail).order_by(ExcludedEmail.created_at.desc()).all()
        return [
            {
                "id": str(item.id),
                "email": item.email,
                "reason": item.reason,
                "created_at": to_tashkent_iso(item.created_at),
            }
            for item in items
        ]
    finally:
        db.close()


@router.post("/excluded-emails")
def add_excluded_email(req: ExcludedEmailCreateRequest, current_user: User = Depends(get_current_admin_user)):
    """Yangi emailni 'Mijoz emas' ro'yxatiga qo'shadi va agar user mavjud bo'lsa is_internal=True qiladi."""
    db = SessionLocal()
    try:
        clean_email = req.email.strip().lower()
        if not clean_email:
            raise HTTPException(status_code=400, detail="Email bo'sh bo'lishi mumkin emas.")
        
        ex = db.query(ExcludedEmail).filter(func.lower(ExcludedEmail.email) == clean_email).first()
        if not ex:
            ex = ExcludedEmail(email=clean_email, reason=req.reason)
            db.add(ex)
        else:
            ex.reason = req.reason
            
        # Agar bu email bilan user allaqachon mavjud bo'lsa, is_internal=True
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if user:
            user.is_internal = True
            
        db.commit()
        return {"status": "ok", "email": clean_email, "message": f"{clean_email} mijoz emas ro'yxatiga qo'shildi."}
    finally:
        db.close()


@router.delete("/excluded-emails/{email}")
def remove_excluded_email(email: str, current_user: User = Depends(get_current_admin_user)):
    """Emailni 'Mijoz emas' ro'yxatidan chiqaradi va userning is_internal holatini False qiladi."""
    db = SessionLocal()
    try:
        clean_email = email.strip().lower()
        ex = db.query(ExcludedEmail).filter(func.lower(ExcludedEmail.email) == clean_email).first()
        if ex:
            db.delete(ex)
            
        user = db.query(User).filter(func.lower(User.email) == clean_email).first()
        if user:
            user.is_internal = False
            
        db.commit()
        return {"status": "ok", "email": clean_email, "message": f"{clean_email} ro'yxatdan chiqarildi."}
    finally:
        db.close()


@router.post("/users/{user_id}/toggle-internal")
def toggle_user_internal(user_id: str, current_user: User = Depends(get_current_admin_user)):
    """Foydalanuvchini 'Mijoz emas' (is_internal) holatini yoqish/o'chirish."""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if not u:
            raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi.")
        
        u.is_internal = not getattr(u, "is_internal", False)
        
        # ExcludedEmail jadvalini ham sinxronlashtirish
        if u.email:
            clean_email = u.email.strip().lower()
            ex = db.query(ExcludedEmail).filter(func.lower(ExcludedEmail.email) == clean_email).first()
            if u.is_internal and not ex:
                db.add(ExcludedEmail(email=clean_email, reason="Admin panel orqali belgilandi"))
            elif not u.is_internal and ex:
                db.delete(ex)

        db.commit()
        return {
            "status": "ok",
            "user_id": str(u.id),
            "email": u.email,
            "is_internal": u.is_internal,
            "message": f"Foydalanuvchi {'mijoz emas (internal)' if u.is_internal else 'haqiqiy mijoz'} deb belgilandi.",
        }
    finally:
        db.close()


@router.get("/jobs-cost")
def admin_jobs_cost(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=5, le=100),
    status: str | None = Query(default=None),
    search: str | None = Query(default=None),
    tts_provider: str | None = Query(default=None),
    include_internal: bool = Query(default=False),
    sort_by: str = Query(default="newest"),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Har bir dublyaj job uchun xarajatlar taqsimoti (TTS, STT, LLM) va batafsil statuslar.
    """
    import uuid as _uuid
    db = SessionLocal()
    try:
        internal_ids_select = select(User.id).filter(User.is_internal.is_(True))

        # Base query joined with User
        base_query = db.query(DubbingJob, User).outerjoin(User, DubbingJob.user_id == User.id)

        # Exclude internal accounts unless explicitly requested
        if not include_internal:
            base_query = base_query.filter(
                or_(DubbingJob.user_id.is_(None), DubbingJob.user_id.notin_(internal_ids_select))
            )

        # Provider filter
        if tts_provider and tts_provider.strip().lower() not in ("all", ""):
            clean_prov = tts_provider.strip().lower()
            base_query = base_query.filter(func.lower(DubbingJob.tts_provider) == clean_prov)

        # Status filter
        if status and status.strip().upper() not in ("ALL", ""):
            clean_status = status.strip().upper()
            if clean_status == "PROCESSING":
                base_query = base_query.filter(DubbingJob.status.in_([
                    JobStatus.DOWNLOADING,
                    JobStatus.TRANSCRIBING,
                    JobStatus.TRANSLATING,
                    JobStatus.SYNTHESIZING,
                    JobStatus.SYNCING,
                    JobStatus.MERGING,
                ]))
            elif clean_status in ("AWAITING", "AWAITING_PAYMENT"):
                base_query = base_query.filter(DubbingJob.status.in_([
                    JobStatus.AWAITING_PAYMENT,
                    JobStatus.PENDING,
                ]))
            else:
                try:
                    js = JobStatus(clean_status)
                    base_query = base_query.filter(DubbingJob.status == js)
                except ValueError:
                    base_query = base_query.filter(func.upper(func.cast(DubbingJob.status, func.text)) == clean_status)

        # Search filter
        if search and search.strip():
            term = search.strip()
            s = f"%{term}%"
            is_valid_uuid = False
            parsed_uuid = None
            try:
                parsed_uuid = _uuid.UUID(term)
                is_valid_uuid = True
            except ValueError:
                is_valid_uuid = False

            if is_valid_uuid and parsed_uuid:
                base_query = base_query.filter(DubbingJob.id == parsed_uuid)
            else:
                base_query = base_query.filter(
                    or_(
                        DubbingJob.video_title.ilike(s),
                        DubbingJob.youtube_url.ilike(s),
                        DubbingJob.youtube_video_id.ilike(s),
                        User.email.ilike(s),
                        User.name.ilike(s),
                        User.phone.ilike(s),
                    )
                )

        # Total count for pagination
        total_items = base_query.count()
        total_pages = max(1, (total_items + page_size - 1) // page_size)

        # Sorting
        if sort_by == "oldest":
            base_query = base_query.order_by(DubbingJob.created_at.asc())
        elif sort_by == "duration_desc":
            base_query = base_query.order_by(DubbingJob.video_duration.desc().nullslast(), DubbingJob.created_at.desc())
        elif sort_by == "duration_asc":
            base_query = base_query.order_by(DubbingJob.video_duration.asc().nullslast(), DubbingJob.created_at.desc())
        else:  # "newest"
            base_query = base_query.order_by(DubbingJob.created_at.desc())

        # Page rows
        offset = (page - 1) * page_size
        page_rows = base_query.offset(offset).limit(page_size).all()

        job_ids = [str(job.id) for job, _ in page_rows]

        # Batch load TTSUsageLog for current page
        tts_data_by_job: dict[str, dict] = {}
        if job_ids:
            tts_rows = db.query(
                TTSUsageLog.video_id,
                TTSUsageLog.provider,
                TTSUsageLog.currency,
                TTSUsageLog.cache_hit,
                func.sum(TTSUsageLog.characters).label("characters"),
                func.sum(TTSUsageLog.estimated_cost).label("estimated_cost"),
                func.sum(TTSUsageLog.duration_seconds).label("duration_seconds"),
                func.count(TTSUsageLog.id).label("entry_count"),
            ).filter(
                TTSUsageLog.video_id.in_(job_ids)
            ).group_by(
                TTSUsageLog.video_id,
                TTSUsageLog.provider,
                TTSUsageLog.currency,
                TTSUsageLog.cache_hit,
            ).all()

            for r in tts_rows:
                v_id = str(r.video_id)
                if v_id not in tts_data_by_job:
                    tts_data_by_job[v_id] = {
                        "cost_usd": 0.0,
                        "cost_uzs": 0.0,
                        "characters": 0,
                        "duration_seconds": 0.0,
                        "calls_count": 0,
                        "cache_hits_count": 0,
                        "cache_saved_usd": 0.0,
                        "providers": set(),
                    }
                entry = tts_data_by_job[v_id]
                entry["calls_count"] += (r.entry_count or 0)
                entry["characters"] += (r.characters or 0)
                entry["duration_seconds"] += float(r.duration_seconds or 0.0)
                if r.provider:
                    entry["providers"].add(r.provider)

                if r.cache_hit:
                    entry["cache_hits_count"] += (r.entry_count or 0)
                    entry["cache_saved_usd"] += round((r.characters or 0) / 1000.0 * 0.016, 4)
                else:
                    if r.currency == "UZS":
                        entry["cost_uzs"] += float(r.estimated_cost or 0.0)
                    else:
                        entry["cost_usd"] += float(r.estimated_cost or 0.0)

        # Batch load payments for current page
        payments_by_job: dict[str, dict] = {}
        if job_ids:
            pay_rows = db.query(Payment).filter(
                Payment.job_id.in_(job_ids),
                Payment.status == PaymentStatus.APPROVED,
            ).all()
            for p in pay_rows:
                if p.job_id:
                    payments_by_job[str(p.job_id)] = {
                        "amount_uzs": p.amount,
                        "provider": p.provider.value if hasattr(p.provider, 'value') else str(p.provider),
                        "paid_at": to_tashkent_iso(p.created_at),
                    }

        USD_TO_UZS = 12800

        # Build job response items
        items = []
        for job, user in page_rows:
            j_id = str(job.id)
            tts_info = tts_data_by_job.get(j_id, {
                "cost_usd": 0.0,
                "cost_uzs": 0.0,
                "characters": 0,
                "duration_seconds": 0.0,
                "calls_count": 0,
                "cache_hits_count": 0,
                "cache_saved_usd": 0.0,
                "providers": set(),
            })

            dur_sec = float(job.video_duration or 0.0)
            dur_min = dur_sec / 60.0

            # STT Cost estimation (Whisper $0.006/min; Gemini $0.002/min)
            stt_model = job.stt_model or "gemini-3.8-flash"
            if dur_sec > 0 and job.status not in (JobStatus.PENDING, JobStatus.AWAITING_PAYMENT):
                stt_rate = 0.002 if "gemini" in stt_model.lower() else 0.006
                stt_cost_usd = round(dur_min * stt_rate, 4)
            else:
                stt_cost_usd = 0.0

            # LLM Translation Cost estimation (~$0.0005 per 1k characters)
            llm_model = job.translation_model or "gemini-1.5-flash"
            llm_cost_usd = 0.0
            if job.status not in (JobStatus.PENDING, JobStatus.AWAITING_PAYMENT, JobStatus.DOWNLOADING):
                if job.translated_text:
                    chars = len(job.translated_text)
                    llm_cost_usd = round((chars / 1000.0) * 0.0005, 4)
                elif dur_sec > 0:
                    chars = int(dur_min * 1200)
                    llm_cost_usd = round((chars / 1000.0) * 0.0005, 4)

            tts_usd = round(tts_info["cost_usd"], 4)
            tts_uzs = round(tts_info["cost_uzs"])
            total_usd = round(tts_usd + (tts_uzs / USD_TO_UZS) + stt_cost_usd + llm_cost_usd, 4)
            total_uzs = int(round(total_usd * USD_TO_UZS))

            cost_per_min_uzs = int(round(total_uzs / dur_min)) if dur_min > 0 else 0

            # Payment / margin
            pay_info = payments_by_job.get(j_id)
            revenue_uzs = pay_info["amount_uzs"] if pay_info else 0
            profit_uzs = revenue_uzs - total_uzs if pay_info else None
            margin_pct = round((profit_uzs / revenue_uzs) * 100.0, 1) if pay_info and revenue_uzs > 0 else None

            # Processing time
            proc_sec = None
            if job.completed_at and job.created_at:
                proc_sec = round((job.completed_at - job.created_at).total_seconds(), 1)

            # Segment QA summary
            qa_summary = None
            if job.segment_qa and isinstance(job.segment_qa, dict):
                qa_dict = job.segment_qa
                seg_count = len(qa_dict)
                passed_count = sum(1 for v in qa_dict.values() if isinstance(v, dict) and v.get("score", 0) >= 0.75)
                retried_count = sum(1 for v in qa_dict.values() if isinstance(v, dict) and v.get("attempts", 1) > 1)
                scores = [v.get("score", 0) for v in qa_dict.values() if isinstance(v, dict) and "score" in v]
                avg_score = round(sum(scores) / len(scores), 2) if scores else None
                qa_summary = {
                    "total_segments": seg_count,
                    "passed_segments": passed_count,
                    "retried_segments": retried_count,
                    "avg_score": avg_score,
                }

            items.append({
                "id": j_id,
                "video_title": job.video_title or "Nomsiz video",
                "youtube_url": job.youtube_url,
                "youtube_video_id": job.youtube_video_id,
                "video_thumbnail": job.video_thumbnail,
                "video_duration": dur_sec,
                "video_duration_min": round(dur_min, 1),
                "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                "status_message": job.status_message,
                "progress": float(job.progress or 0.0),
                "created_at": to_tashkent_iso(job.created_at),
                "completed_at": to_tashkent_iso(job.completed_at),
                "processing_seconds": proc_sec,
                "subtitle_only": bool(job.subtitle_only),
                "source_language": job.source_language,
                "models": {
                    "tts_provider": job.tts_provider or (list(tts_info["providers"])[0] if tts_info["providers"] else "edge"),
                    "voice_name": job.voice_name,
                    "voice_style": job.voice_style,
                    "stt_model": stt_model,
                    "translation_model": llm_model,
                    "gemini_key_tier": getattr(job, "gemini_key_tier", None) or "free",
                    "gemini_key_used": getattr(job, "gemini_key_used", None),
                },
                "costs": {
                    "tts_cost_usd": tts_usd,
                    "tts_cost_uzs": tts_uzs,
                    "tts_characters": tts_info["characters"],
                    "tts_duration_seconds": round(tts_info["duration_seconds"], 1),
                    "tts_calls_count": tts_info["calls_count"],
                    "cache_hits_count": tts_info["cache_hits_count"],
                    "cache_saved_usd": round(tts_info["cache_saved_usd"], 3),
                    "stt_cost_usd": stt_cost_usd,
                    "llm_cost_usd": llm_cost_usd,
                    "total_cost_usd": total_usd,
                    "total_cost_uzs": total_uzs,
                    "cost_per_minute_uzs": cost_per_min_uzs,
                },
                "payment": {
                    "has_payment": pay_info is not None,
                    "revenue_uzs": revenue_uzs,
                    "profit_uzs": profit_uzs,
                    "margin_pct": margin_pct,
                    "provider": pay_info["provider"] if pay_info else None,
                },
                "user": {
                    "id": str(user.id) if user else None,
                    "name": user.name if user else "Mehmon (Anonim)",
                    "email": user.email if user else None,
                    "phone": user.phone if user else None,
                    "is_internal": bool(getattr(user, "is_internal", False)) if user else False,
                },
                "error_code": job.error_code,
                "error_message": job.error_message,
                "qa_summary": qa_summary,
            })

        # Summary KPIs (fast on DubbingJob table)
        stat_filter = or_(DubbingJob.user_id.is_(None), DubbingJob.user_id.notin_(internal_ids_select)) if not include_internal else None

        q_stat = db.query(DubbingJob.status, func.count(DubbingJob.id))
        if stat_filter is not None:
            q_stat = q_stat.filter(stat_filter)
        status_counts = dict(q_stat.group_by(DubbingJob.status).all())

        total_all_jobs = sum(status_counts.values())
        completed_all = status_counts.get(JobStatus.COMPLETED, 0)
        failed_all = status_counts.get(JobStatus.FAILED, 0)
        success_rate = round((completed_all / (completed_all + failed_all) * 100.0), 1) if (completed_all + failed_all) > 0 else 0.0

        # Duration sum of completed
        q_dur = db.query(func.sum(DubbingJob.video_duration))
        if stat_filter is not None:
            q_dur = q_dur.filter(stat_filter)
        total_dur_sec = q_dur.filter(DubbingJob.status == JobStatus.COMPLETED).scalar() or 0.0
        total_dur_min = round(total_dur_sec / 60.0, 1)

        # Provider breakdown counts
        q_prov = db.query(DubbingJob.tts_provider, func.count(DubbingJob.id))
        if stat_filter is not None:
            q_prov = q_prov.filter(stat_filter)
        prov_counts = {
            (k or "boshqa"): v for k, v in q_prov.group_by(DubbingJob.tts_provider).all()
        }

        # Page-level totals
        page_total_usd = round(sum(item["costs"]["total_cost_usd"] for item in items), 3)
        page_total_uzs = sum(item["costs"]["total_cost_uzs"] for item in items)
        page_avg_job_uzs = round(page_total_uzs / len(items)) if items else 0

        return {
            "summary": {
                "total_jobs": total_all_jobs,
                "completed_jobs": completed_all,
                "failed_jobs": failed_all,
                "processing_jobs": sum(status_counts.get(s, 0) for s in [
                    JobStatus.DOWNLOADING, JobStatus.TRANSCRIBING, JobStatus.TRANSLATING,
                    JobStatus.SYNTHESIZING, JobStatus.SYNCING, JobStatus.MERGING
                ]),
                "awaiting_payment_jobs": status_counts.get(JobStatus.AWAITING_PAYMENT, 0) + status_counts.get(JobStatus.PENDING, 0),
                "success_rate_pct": success_rate,
                "total_completed_duration_min": total_dur_min,
                "providers": prov_counts,
                "page_total_cost_usd": page_total_usd,
                "page_total_cost_uzs": page_total_uzs,
                "page_avg_job_cost_uzs": page_avg_job_uzs,
            },
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total_items,
                "total_pages": total_pages,
            },
            "jobs": items,
        }
    finally:
        db.close()


@router.get("/unactivated-users")
def get_unactivated_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=5, le=100),
    filter_type: str = Query(default="all"),
    search: str | None = Query(default=None),
    sort_by: str = Query(default="newest"),
    current_user: User = Depends(get_current_admin_user),
):
    """
    Birinchi dublyajni tugatmagan (unactivated / drop-off) foydalanuvchilar tahlili va ro'yxati.
    """
    db = SessionLocal()
    try:
        # 1. Muvaffaqiyatli dublyajga ega bo'lgan foydalanuvchilar
        completed_user_ids_sub = (
            db.query(distinct(DubbingJob.user_id))
            .filter(DubbingJob.status == JobStatus.COMPLETED, DubbingJob.user_id.isnot(None))
            .subquery()
        )

        internal_ids_sub = select(User.id).filter(User.is_internal.is_(True))

        base_unactivated = db.query(User).filter(
            or_(User.is_internal.is_(False), User.is_internal.is_(None)),
            User.id.notin_(completed_user_ids_sub),
            User.id.notin_(internal_ids_sub)
        )

        total_unactivated = base_unactivated.count()

        total_real_users = db.query(User).filter(
            or_(User.is_internal.is_(False), User.is_internal.is_(None)),
            User.id.notin_(internal_ids_sub)
        ).count()

        completed_users_count = max(0, total_real_users - total_unactivated)

        # Foydalanuvchilar urinishlari agregatsiyasi
        user_jobs_agg = (
            db.query(
                DubbingJob.user_id.label("uid"),
                func.count(DubbingJob.id).label("total_jobs"),
                func.count(case((DubbingJob.status.in_([JobStatus.AWAITING_PAYMENT, JobStatus.PENDING]), 1))).label("awaiting_jobs"),
                func.count(case((DubbingJob.status == JobStatus.FAILED, 1))).label("failed_jobs"),
                func.max(DubbingJob.created_at).label("last_job_at"),
            )
            .filter(DubbingJob.user_id.isnot(None))
            .group_by(DubbingJob.user_id)
            .subquery()
        )

        never_attempted_count = db.query(User.id).outerjoin(
            user_jobs_agg, User.id == user_jobs_agg.c.uid
        ).filter(
            or_(User.is_internal.is_(False), User.is_internal.is_(None)),
            User.id.notin_(completed_user_ids_sub),
            User.id.notin_(internal_ids_sub),
            or_(user_jobs_agg.c.total_jobs.is_(None), user_jobs_agg.c.total_jobs == 0)
        ).count()

        attempted_count = max(0, total_unactivated - never_attempted_count)

        awaiting_payment_count = db.query(User.id).join(
            user_jobs_agg, User.id == user_jobs_agg.c.uid
        ).filter(
            or_(User.is_internal.is_(False), User.is_internal.is_(None)),
            User.id.notin_(completed_user_ids_sub),
            User.id.notin_(internal_ids_sub),
            user_jobs_agg.c.awaiting_jobs > 0,
            user_jobs_agg.c.failed_jobs == 0
        ).count()

        failed_attempt_count = max(0, attempted_count - awaiting_payment_count)

        # Top error reasons among failed first jobs
        error_reasons_sql = """
            WITH first_jobs AS (
                SELECT 
                    j.user_id,
                    j.error_code,
                    j.status,
                    ROW_NUMBER() OVER(PARTITION BY j.user_id ORDER BY j.created_at ASC) as rn
                FROM dubbing_jobs j
                JOIN users u ON u.id = j.user_id
                WHERE (u.is_internal IS FALSE OR u.is_internal IS NULL)
                  AND j.user_id NOT IN (SELECT DISTINCT user_id FROM dubbing_jobs WHERE status = 'COMPLETED' AND user_id IS NOT NULL)
            )
            SELECT 
                COALESCE(error_code, CASE WHEN status IN ('AWAITING_PAYMENT', 'PENDING') THEN 'AWAITING_PAYMENT' ELSE 'UNKNOWN' END) as code,
                count(*) as count
            FROM first_jobs
            WHERE rn = 1
            GROUP BY 1
            ORDER BY count DESC
            LIMIT 8;
        """
        reason_rows = db.execute(text(error_reasons_sql)).fetchall()
        top_reasons = []
        reason_labels = {
            "AUTH_ERROR": "YouTube sessiya / blokirovka",
            "credit_balance_exhausted": "Tashqi AI kvotasi tugagan",
            "DOWNLOAD_FAILED": "Video yuklab olishda xatolik",
            "HTTP_403": "YouTube server 403 blokirovkasi",
            "AWAITING_PAYMENT": "Paywall (>10 daqiqalik video)",
            "USER_CANCELLED": "Foydalanuvchi bekor qilgan",
            "PROXY_BILLING_ERROR": "Proksi tarmog'i xatosi",
            "NO_SPEECH_FOUND": "Videoda nutq topilmadi",
            "UPLOADED_SOURCE_MISSING": "Yuklangan fayl topilmadi",
            "UNKNOWN": "Noma'lum xatolik",
        }
        for r in reason_rows:
            top_reasons.append({
                "code": r[0],
                "label": reason_labels.get(r[0], r[0]),
                "count": r[1],
                "pct": round(100.0 * r[1] / max(1, attempted_count), 1) if attempted_count > 0 else 0.0
            })

        # 2. Foydalanuvchilarni qidirish va filtrlash
        q_users = db.query(
            User,
            user_jobs_agg.c.total_jobs,
            user_jobs_agg.c.awaiting_jobs,
            user_jobs_agg.c.failed_jobs,
            user_jobs_agg.c.last_job_at
        ).outerjoin(
            user_jobs_agg, User.id == user_jobs_agg.c.uid
        ).filter(
            or_(User.is_internal.is_(False), User.is_internal.is_(None)),
            User.id.notin_(completed_user_ids_sub),
            User.id.notin_(internal_ids_sub)
        )

        if filter_type == "never_attempted":
            q_users = q_users.filter(
                or_(user_jobs_agg.c.total_jobs.is_(None), user_jobs_agg.c.total_jobs == 0)
            )
        elif filter_type == "failed_attempt":
            q_users = q_users.filter(user_jobs_agg.c.failed_jobs > 0)
        elif filter_type == "awaiting_payment":
            q_users = q_users.filter(
                user_jobs_agg.c.awaiting_jobs > 0,
                user_jobs_agg.c.failed_jobs == 0
            )

        if search and search.strip():
            term = f"%{search.strip()}%"
            q_users = q_users.filter(
                or_(
                    User.email.ilike(term),
                    User.name.ilike(term),
                    User.phone.ilike(term)
                )
            )

        total_filtered = q_users.count()
        total_pages = max(1, (total_filtered + page_size - 1) // page_size)

        if sort_by == "oldest":
            q_users = q_users.order_by(User.created_at.asc())
        elif sort_by == "most_attempts":
            q_users = q_users.order_by(user_jobs_agg.c.total_jobs.desc().nullslast(), User.created_at.desc())
        else: # newest
            q_users = q_users.order_by(User.created_at.desc())

        offset = (page - 1) * page_size
        user_rows = q_users.offset(offset).limit(page_size).all()

        page_user_ids = [u.id for u, _, _, _, _ in user_rows]
        latest_jobs_by_user = {}
        if page_user_ids:
            latest_jobs = (
                db.query(DubbingJob)
                .filter(DubbingJob.user_id.in_(page_user_ids))
                .order_by(DubbingJob.created_at.desc())
                .all()
            )
            for j in latest_jobs:
                if j.user_id not in latest_jobs_by_user:
                    latest_jobs_by_user[j.user_id] = j

        items = []
        for u, t_jobs, a_jobs, f_jobs, last_at in user_rows:
            tot = t_jobs or 0
            cat = "never_attempted"
            if tot > 0:
                if (a_jobs or 0) > 0 and (f_jobs or 0) == 0:
                    cat = "awaiting_payment"
                else:
                    cat = "failed_attempt"

            last_job_obj = latest_jobs_by_user.get(u.id)
            last_job_data = None
            if last_job_obj:
                last_job_data = {
                    "id": str(last_job_obj.id),
                    "video_title": last_job_obj.video_title or "Nomsiz video",
                    "youtube_url": last_job_obj.youtube_url,
                    "video_duration": last_job_obj.video_duration,
                    "status": last_job_obj.status.value if hasattr(last_job_obj.status, "value") else str(last_job_obj.status),
                    "error_code": last_job_obj.error_code,
                    "error_message": last_job_obj.error_message,
                    "created_at": to_tashkent_iso(last_job_obj.created_at),
                }

            items.append({
                "id": str(u.id),
                "name": u.name or "Nomsiz",
                "email": u.email,
                "phone": u.phone,
                "telegram_chat_id": u.telegram_chat_id,
                "is_verified": bool(u.is_verified),
                "registered_at": to_tashkent_iso(u.created_at),
                "attempt_count": tot,
                "category": cat,
                "last_job": last_job_data,
            })

        def calc_pct(part, whole):
            return round(100.0 * part / max(1, whole), 1)

        return {
            "summary": {
                "total_users": total_real_users,
                "completed_users": completed_users_count,
                "completed_pct": calc_pct(completed_users_count, total_real_users),
                "unactivated_users": total_unactivated,
                "unactivated_pct": calc_pct(total_unactivated, total_real_users),
                "never_attempted_users": never_attempted_count,
                "never_attempted_pct": calc_pct(never_attempted_count, total_real_users),
                "failed_attempt_users": failed_attempt_count,
                "failed_attempt_pct": calc_pct(failed_attempt_count, total_real_users),
                "awaiting_payment_users": awaiting_payment_count,
                "awaiting_payment_pct": calc_pct(awaiting_payment_count, total_real_users),
            },
            "top_reasons": top_reasons,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_items": total_filtered,
                "total_pages": total_pages,
            },
            "users": items,
        }
    finally:
        db.close()







