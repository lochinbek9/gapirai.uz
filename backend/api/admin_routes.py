from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import func, or_
from backend.models.database import SessionLocal, User, DubbingJob, ContentViolation, Subscription, PlanTier, BroadcastCampaign
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


@router.get("/retention")
def admin_retention_stats(
    days: int = Query(default=14, ge=7, le=60),
    current_user: User = Depends(get_current_admin_user),
):
    """Foydalanuvchilarning qaytib kirish (Retention) tahlili:
    - Jami ro'yxatdan o'tganlar, qaytganlar soni va umumiy qaytish foizi
    - Bugungi va kechagi faol, yangi va qaytganlar soni
    - Kunma-kun faollik (Total Active, New Users, Returning Users, Returning %)
    - Kirish chastotasi bo'yicha taqsimot (1 kun, 2-3 kun, 4-7 kun, 8+ kun)
    - Oxirgi faol bo'lgan foydalanuvchilar ro'yxati (holat belgilari bilan)
    """
    from sqlalchemy import text
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today = now.date()
        yesterday = today - timedelta(days=1)
        since_date = today - timedelta(days=days)

        # 1. Umumiy hisob (Overall summary)
        summary_row = db.execute(text("""
            WITH user_summary AS (
                SELECT 
                    user_id,
                    count(DISTINCT visit_date) as active_days
                FROM user_daily_visits
                GROUP BY user_id
            )
            SELECT 
                (SELECT count(*) FROM users) as total_registered,
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

        # 2. Bugun va kechagi ko'rsatkichlar
        today_row = db.execute(text("""
            SELECT 
                count(DISTINCT v.user_id) as total_active,
                count(DISTINCT CASE WHEN v.visit_date::date = u.created_at::date THEN v.user_id END) as new_users,
                count(DISTINCT CASE WHEN v.visit_date::date > u.created_at::date THEN v.user_id END) as returning_users
            FROM user_daily_visits v
            JOIN users u ON v.user_id = u.id
            WHERE v.visit_date::date = :tdate
        """), {"tdate": today}).mappings().first()

        today_active = today_row["total_active"] or 0
        today_new = today_row["new_users"] or 0
        today_returning = today_row["returning_users"] or 0
        today_ret_pct = round(100.0 * today_returning / max(1, today_active), 1)

        yesterday_row = db.execute(text("""
            SELECT 
                count(DISTINCT v.user_id) as total_active,
                count(DISTINCT CASE WHEN v.visit_date::date = u.created_at::date THEN v.user_id END) as new_users,
                count(DISTINCT CASE WHEN v.visit_date::date > u.created_at::date THEN v.user_id END) as returning_users
            FROM user_daily_visits v
            JOIN users u ON v.user_id = u.id
            WHERE v.visit_date::date = :ydate
        """), {"ydate": yesterday}).mappings().first()

        yesterday_active = yesterday_row["total_active"] or 0
        yesterday_new = yesterday_row["new_users"] or 0
        yesterday_returning = yesterday_row["returning_users"] or 0
        yesterday_ret_pct = round(100.0 * yesterday_returning / max(1, yesterday_active), 1)

        # 3. Kunma-kun tahlil (Oxirgi N kun)
        daily_rows = db.execute(text("""
            SELECT 
                v.visit_date::date as day,
                count(DISTINCT v.user_id) as total_active,
                count(DISTINCT CASE WHEN v.visit_date::date = u.created_at::date THEN v.user_id END) as new_users,
                count(DISTINCT CASE WHEN v.visit_date::date > u.created_at::date THEN v.user_id END) as returning_users,
                COALESCE((
                    SELECT count(*) FROM dubbing_jobs j 
                    WHERE j.created_at::date = v.visit_date::date
                ), 0) as jobs_count
            FROM user_daily_visits v
            JOIN users u ON v.user_id = u.id
            WHERE v.visit_date::date >= :since
            GROUP BY v.visit_date::date
            ORDER BY day DESC
        """), {"since": since_date}).mappings().all()

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

        # 4. Kirish chastotasi taqsimoti (Frequency distribution)
        freq_row = db.execute(text("""
            WITH counts AS (
                SELECT user_id, count(DISTINCT visit_date) as cnt
                FROM user_daily_visits
                GROUP BY user_id
            )
            SELECT 
                count(DISTINCT CASE WHEN cnt = 1 THEN user_id END) as one_day,
                count(DISTINCT CASE WHEN cnt BETWEEN 2 AND 3 THEN user_id END) as days_2_3,
                count(DISTINCT CASE WHEN cnt BETWEEN 4 AND 7 THEN user_id END) as days_4_7,
                count(DISTINCT CASE WHEN cnt >= 8 THEN user_id END) as days_8_plus
            FROM counts;
        """)).mappings().first()

        one_day = freq_row["one_day"] or 0
        days_2_3 = freq_row["days_2_3"] or 0
        days_4_7 = freq_row["days_4_7"] or 0
        days_8_plus = freq_row["days_8_plus"] or 0

        frequency = [
            {"label": "1 marta kirgan", "count": one_day, "pct": round(100.0 * one_day / max(1, total_act), 1)},
            {"label": "2-3 kun kirgan", "count": days_2_3, "pct": round(100.0 * days_2_3 / max(1, total_act), 1)},
            {"label": "4-7 kun kirgan (Faol)", "count": days_4_7, "pct": round(100.0 * days_4_7 / max(1, total_act), 1)},
            {"label": "8+ kun kirgan (Sodiq)", "count": days_8_plus, "pct": round(100.0 * days_8_plus / max(1, total_act), 1)},
        ]

        # 5. Oxirgi faol bo'lgan foydalanuvchilar (50 ta)
        user_rows = db.execute(text("""
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone,
                u.created_at,
                u.last_active_at,
                COALESCE(v.active_days, 1) as active_days,
                COALESCE(j.jobs_count, 0) as jobs_count
            FROM users u
            LEFT JOIN (
                SELECT user_id, count(DISTINCT visit_date) as active_days
                FROM user_daily_visits
                GROUP BY user_id
            ) v ON u.id = v.user_id
            LEFT JOIN (
                SELECT user_id, count(*) as jobs_count
                FROM dubbing_jobs
                WHERE user_id IS NOT NULL
                GROUP BY user_id
            ) j ON u.id = j.user_id
            ORDER BY u.last_active_at DESC NULLS LAST
            LIMIT 50;
        """)).mappings().all()

        recent_users_list = []
        for u in user_rows:
            act_days = u["active_days"] or 1
            if act_days >= 4:
                status = "loyal"
                status_label = "Sodiq (4+ kun)"
            elif act_days >= 2:
                status = "returning"
                status_label = "Qaytgan (2-3 kun)"
            else:
                status = "one_time"
                status_label = "1 marta kirgan"

            recent_users_list.append({
                "id": str(u["id"]),
                "name": u["name"] or "Noma'lum",
                "email": u["email"] or "",
                "phone": u["phone"] or "",
                "created_at": u["created_at"].strftime("%Y-%m-%d %H:%M") if u["created_at"] else None,
                "last_active_at": u["last_active_at"].strftime("%Y-%m-%d %H:%M") if u["last_active_at"] else None,
                "active_days": act_days,
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
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "completed_at": c.completed_at.isoformat() if c.completed_at else None,
                "admin": {
                    "name": admin_name or "Admin",
                    "email": admin_email or "",
                },
            })

        return {"campaigns": campaigns}
    finally:
        db.close()




