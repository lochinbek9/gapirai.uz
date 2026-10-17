"""Tarif rejalar — DAQIQA kvotasi, narx, ustuvorlik va TTS sifat darajasi.

2026-08-31: model "oyiga N video, cheksiz davomiylik"dan "oyiga N DAQIQA"ga
o'zgartirildi. Har tarif oylik daqiqa byudjeti beradi (Free 5 / Standard 300
/ Pro 400; Free 2026-09-20da 25 dan 5 ga tushirildi). Sarf haqiqiy video davomiyligi bo'yicha o'lchanadi. Byudjet
tugaganda foydalanuvchi daqiqa paketi sotib oladi (+30/+60/+120/+300) —
sotib olingan daqiqalar HECH QACHON tugamaydi, keyingi oyga o'tadi.

Reja ta'riflari kod konstantasi (bazada emas). Subscription jadvali faqat
"kim qaysi tarifda, qachongacha, qancha daqiqa sarflagan" holatini saqlaydi.

Yillik tariflar (standard_yearly/pro_yearly) — xuddi shu tier xususiyatlari,
faqat narxi va to'lov davri (period_days=365) boshqacha. Oylik daqiqa oynasi
(monthly_minutes_used) har doim 30 kunda qayta boshlanadi, to'lov davridan
MUSTAQIL — aks holda yillik foydalanuvchi butun yil uchun bir martalik
kvota olardi.
"""
import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from backend.models.database import Subscription, PlanTier, User
from backend.config import get_settings

settings = get_settings()


def is_user_admin(db, user_id) -> bool:
    """Tekshiradi: agar foydalanuvchi admin bo'lsa (User.role == 'admin') True qaytaradi."""
    if not user_id:
        return False
    try:
        user = db.query(User).filter(User.id == user_id).first()
        return bool(user and getattr(user, "role", None) == "admin")
    except Exception:
        return False

QUOTA_RESET_DAYS = 30  # oylik daqiqa kvotasi har doim shuncha kunda qayta boshlanadi

# Bitta job uchun maksimal video davomiyligi (daqiqa) — barcha tariflar uchun
# qat'iy. job_creation.py shu chegaradan uzun videoni qabul qilmaydi.
MAX_JOB_MINUTES = 120

# Sotib olinadigan daqiqa paketlari: {daqiqa: narx_som}. Foydalanuvchi oylik
# byudjeti tugaganda shulardan birini sotib oladi (backend/api/minutes_routes.py).
# Sotib olingan daqiqalar Subscription.purchased_minutes'ga qo'shiladi va
# hech qachon tugamaydi.
MINUTE_PACKS: dict[int, int] = {
    15: 4_900,
    35: 15_000,
    70: 25_000,
    140: 45_000,
    350: 100_000,
}

LEGACY_MINUTE_PACKS: dict[int, int] = {
    30: 15_000,
    60: 25_000,
    120: 45_000,
    300: 100_000,
}

# ─────────────────────────────────────────────────────────────────────────────
# Celery navbat arxitekturasi (2026-10-16 qayta ishlandi)
#
# 5 ta navbat, Redis BRPOP ularni QAT'IY SHUNAQA TARTIBDA tekshiradi:
#
#   1. video_processing_priority_short   ← Pro,   ≤10 daqiqa
#   2. video_processing_priority_long    ← Pro,   >10 daqiqa
#   3. video_processing_short            ← Standart/Free, ≤10 daqiqa
#   4. video_processing_long             ← Standart/Free, >10 daqiqa
#   5. video_processing_local            ← Telegram fayl yuklash (shu host)
#
# Ustuvorlik tartibi: Pro → Standart → Free → Admin → tizim joblari
#
# Admin ham priority navbatga tushadi LEKIN Pro dan keyin turadi —
# chunki Admin joblari asosan biz tomondan yuboriladigan tizim ishlari.
# Real mijozlar (Pro > Standart > Free) ustunroq.
#
# Qisqa/Uzun Track (SHORT_TRACK_MAX_MINUTES = 10.0):
#   Short ≤10 daqiqa → parallel, tez tugaydi, OOM xavfi past
#   Long  >10 daqiqa → og'ir, worker slot band tutadi, OOM xavfi bor
# ─────────────────────────────────────────────────────────────────────────────

# Qisqa videodan uzun videoga o'tish chegarasi (daqiqa)
SHORT_TRACK_MAX_MINUTES: float = 10.0

# ── Celery navbat nomlari (2026-10-16: 8 ta aniq darajali navbat) ───────────
# Redis BRPOP tartibiga mos: chapdan o'ngga eng yuqori ustuvorlikdan pastga qarab:
#   1. Qisqa video (<=10 daq): Pro -> Standart -> Free -> Admin
#   2. Uzun video (>10 daq):  Pro -> Standart -> Free -> Admin
#   3. Qo'shimchalar: Telegram local -> Legacy video_processing
QUEUE_SHORT_PRO      = "video_short_pro"       # Pro, <=10 daqiqa (1-ustuvorlik)
QUEUE_SHORT_STANDARD = "video_short_standard"  # Standart, <=10 daqiqa (2-ustuvorlik)
QUEUE_SHORT_FREE     = "video_short_free"      # Free / Anon, <=10 daqiqa (3-ustuvorlik)
QUEUE_SHORT_ADMIN    = "video_short_admin"     # Admin tizim testlari, <=10 daqiqa (4-ustuvorlik)

QUEUE_LONG_PRO       = "video_long_pro"        # Pro, >10 daqiqa (5-ustuvorlik)
QUEUE_LONG_STANDARD  = "video_long_standard"   # Standart, >10 daqiqa (6-ustuvorlik)
QUEUE_LONG_FREE      = "video_long_free"       # Free / Anon, >10 daqiqa (7-ustuvorlik)
QUEUE_LONG_ADMIN     = "video_long_admin"      # Admin tizim testlari, >10 daqiqa (8-ustuvorlik)

# Orqaga moslik uchun eski konstantalar:
PRIORITY_SHORT_QUEUE = QUEUE_SHORT_PRO
PRIORITY_LONG_QUEUE  = QUEUE_LONG_PRO
DEFAULT_SHORT_QUEUE  = QUEUE_SHORT_FREE
DEFAULT_LONG_QUEUE   = QUEUE_LONG_FREE
PRIORITY_QUEUE       = QUEUE_SHORT_PRO
DEFAULT_QUEUE        = QUEUE_SHORT_FREE

# Worker tinglash tartibi (docker-compose WORKER_QUEUES uchun standart qiymat)
ALL_WORKER_QUEUES = (
    f"{QUEUE_SHORT_PRO},"
    f"{QUEUE_SHORT_STANDARD},"
    f"{QUEUE_SHORT_FREE},"
    f"{QUEUE_SHORT_ADMIN},"
    f"{QUEUE_LONG_PRO},"
    f"{QUEUE_LONG_STANDARD},"
    f"{QUEUE_LONG_FREE},"
    f"{QUEUE_LONG_ADMIN},"
    "video_processing_local,"
    "video_processing"
)

# Telegram orqali yuborilgan video FAYL (link emas) shu navbatga tushadi.
# Sabab: bunday job'ning original video fayli faqat uni qabul qilgan hostning
# lokal diskida bor (create_job_from_local_video_file, job_creation.py) —
# YouTube-havolali joblardan farqli, S3'dan boshqa hostda tiklab bo'lmaydi
# (tasks.py DOWNLOAD bosqichi). 2026-09-16dan boshlab worker scaling uchun
# qo'shilgan qo'shimcha hostlar (WORKER_QUEUES orqali) bu navbatni ATAYLAB
# tinglamaydi — faqat asosiy host (uploads/ papkasi bor) tinglaydi.
LOCAL_UPLOAD_QUEUE = "video_processing_local"


@dataclass(frozen=True)
class PlanDef:
    id: str
    name: str
    price: int  # UZS / to'lov davri
    monthly_minutes: float  # oyiga beriladigan dublyaj daqiqasi byudjeti
    priority: bool
    tts_tier: str  # "edge" (bepul) | "premium" (Azure/ElevenLabs)
    tier: PlanTier  # Subscription.plan ustuniga yoziladigan haqiqiy tier
    max_resolution: str  # "360p" | "720p" | "1080p" -- yuklab olish uchun maksimal ruxsat etilgan sifat
    period_days: int = 30  # to'lov davri: 30 = oylik, 365 = yillik


PLANS: dict[str, PlanDef] = {
    "free":            PlanDef(id="free",            name="Bepul",             price=0,         monthly_minutes=5,   priority=False, tts_tier="gemini",  tier=PlanTier.FREE,     max_resolution="360p"),
    "standard":        PlanDef(id="standard",        name="Standart",          price=49_000,    monthly_minutes=350, priority=True,  tts_tier="gemini",  tier=PlanTier.STANDARD, max_resolution="720p"),
    "standard_yearly": PlanDef(id="standard_yearly", name="Standart (yillik)", price=490_000,   monthly_minutes=350, priority=True,  tts_tier="gemini",  tier=PlanTier.STANDARD, max_resolution="720p", period_days=365),
    "pro":             PlanDef(id="pro",             name="Pro",               price=199_000,   monthly_minutes=600, priority=True,  tts_tier="gemini",  tier=PlanTier.PRO,      max_resolution="1080p"),
    "pro_yearly":      PlanDef(id="pro_yearly",      name="Pro (yillik)",      price=1_990_000, monthly_minutes=600, priority=True,  tts_tier="gemini",  tier=PlanTier.PRO,      max_resolution="1080p", period_days=365),
}

RESOLUTION_ORDER = ["360p", "720p", "1080p"]


def get_max_resolution_for_job(db, job) -> str:
    """Job egasining JORIY tarifiga qarab -- login qilmagan/egasiz job uchun
    "free" deb hisoblanadi. Yuklab olish havolasi odatda login holatisiz ham
    ochiladi (mavjud /outputs endpointlari auth talab qilmaydi), shuning
    uchun REQUESTER emas, JOB EGASI tarifi tekshiriladi."""
    if job.user_id is None:
        return "360p"
    if is_user_admin(db, job.user_id):
        return "1080p"
    sub = get_or_create_subscription(db, job.user_id)
    return PLANS[sub.plan.value].max_resolution


def get_tts_provider_for_job(db, job) -> str:
    """Job egasining tanlovi va tarifiga qarab qaysi TTS provayderi ishlatilishini aniqlaydi.
    Default tanlov barcha foydalanuvchilar uchun — gemini.
    """
    if getattr(job, "tts_provider", None):
        return job.tts_provider.lower().strip()

    return "gemini"


def get_max_resolution_for_user(db, user_id) -> str:
    """get_max_resolution_for_job'ning tomoshabin-versiyasi -- Ommaviy
    videolar kutubxonasida (2026-08-19) sifat cheklovi VIDEO EGASI emas,
    TOMOSHA QILAYOTGAN odamning tarifiga qarab belgilanishi kerak (login
    kutubxonada shart, shuning uchun requester har doim ma'lum)."""
    if is_user_admin(db, user_id):
        return "1080p"
    sub = get_or_create_subscription(db, user_id)
    return PLANS[sub.plan.value].max_resolution


def get_or_create_subscription(db, user_id, for_update: bool = False) -> Subscription:
    query = db.query(Subscription).filter(Subscription.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    sub = query.first()
    if sub is None:
        sub = Subscription(user_id=user_id, plan=PlanTier.FREE, period_started_at=datetime.utcnow())
        db.add(sub)
        db.commit()
        db.refresh(sub)
        if for_update:
            sub = db.query(Subscription).filter(Subscription.id == sub.id).with_for_update().first()
        return sub

    # Muddati o'tgan pullik obuna -> FREE'ga qaytadi, davr qayta boshlanadi.
    # DIQQAT: purchased_minutes TEGILMAYDI -- sotib olingan daqiqalar hech
    # qachon tugamaydi, obuna bekor bo'lsa ham.
    if sub.plan != PlanTier.FREE and getattr(sub, "expires_at", None) and isinstance(sub.expires_at, datetime) and sub.expires_at < datetime.utcnow():
        # Avtomatik uzaytirish grace davrida bo'lsa (backend/services/recurring.py)
        # tarif imtiyozlari saqlanadi — kunlik cron kartadan qayta urinib ko'radi.
        if getattr(sub, "grace_until", None) and isinstance(sub.grace_until, datetime) and sub.grace_until >= datetime.utcnow():
            return sub
        sub.plan = PlanTier.FREE
        sub.expires_at = None
        sub.period_started_at = datetime.utcnow()
        sub.monthly_minutes_used = 0.0
        if hasattr(sub, "auto_renew"):
            sub.auto_renew = False
            sub.grace_until = None
        db.commit()
        db.refresh(sub)
        return sub

    # Oylik daqiqa byudjeti har doim 30 kunda qayta boshlanadi — to'lov
    # davridan mustaqil (yillik obunada ham). purchased_minutes TEGILMAYDI.
    if getattr(sub, 'period_started_at', None) and isinstance(sub.period_started_at, datetime) and (datetime.utcnow() - sub.period_started_at) > timedelta(days=QUOTA_RESET_DAYS):
        sub.period_started_at = datetime.utcnow()
        sub.monthly_minutes_used = 0.0
        db.commit()
        db.refresh(sub)

    return sub


def get_minute_balance(db, user_id) -> dict:
    """Foydalanuvchining daqiqa holati -- dashboard va enforcement uchun.

    Returns: {
      "monthly_cap": float,        # tarif oylik byudjeti
      "monthly_used": float,       # joriy davrda sarflangan
      "monthly_remaining": float,  # max(0, cap - used)
      "purchased": float,          # sotib olingan, tugamaydigan qoldiq
      "total_available": float,    # monthly_remaining + purchased
    }
    """
    if is_user_admin(db, user_id):
        sub = get_or_create_subscription(db, user_id)
        from backend.models.database import DubbingJob, JobStatus
        from sqlalchemy import func
        q = db.query(func.coalesce(func.sum(DubbingJob.video_duration), 0.0)).filter(
            DubbingJob.user_id == user_id,
            DubbingJob.status == JobStatus.COMPLETED
        )
        if sub.period_started_at:
            q = q.filter(DubbingJob.created_at >= sub.period_started_at)
        actual_sec = q.scalar() or 0.0
        used = actual_sec / 60.0 if actual_sec > 0 else (sub.monthly_minutes_used or 0.0)
        purchased = sub.purchased_minutes or 0.0
        return {
            "is_unlimited": True,
            "monthly_cap": 999999.0,
            "monthly_used": round(used, 1),
            "monthly_remaining": 999999.0,
            "purchased": round(purchased, 1),
            "total_available": 999999.0,
        }
    sub = get_or_create_subscription(db, user_id)
    plan = PLANS[sub.plan.value]
    used = sub.monthly_minutes_used or 0.0
    purchased = sub.purchased_minutes or 0.0
    monthly_remaining = max(0.0, plan.monthly_minutes - used)
    return {
        "monthly_cap": float(plan.monthly_minutes),
        "monthly_used": round(used, 1),
        "monthly_remaining": round(monthly_remaining, 1),
        "purchased": round(purchased, 1),
        "total_available": round(monthly_remaining + purchased, 1),
    }


def check_quota(db, user_id, duration_minutes: float) -> tuple[bool, int]:
    """Video foydalanuvchining mavjud daqiqalariga (oylik qoldiq + sotib
    olingan) sig'adimi tekshiradi.

    Returns: (covered, shortfall_minutes)
    - covered=True  -> video sig'adi, consume_quota() bilan sarflash mumkin
    - covered=False -> shortfall_minutes = yetishmayotgan daqiqa (butun songa
      yaxlitlangan) -- frontend "Buy additional minutes" CTA'sida ko'rsatiladi
    """
    if is_user_admin(db, user_id):
        return True, 0
    bal = get_minute_balance(db, user_id)
    if duration_minutes <= bal["total_available"] + 1e-6:
        return True, 0
    return False, math.ceil(duration_minutes - bal["total_available"])


def check_and_consume_quota(db, user_id, duration_minutes: float) -> tuple[bool, int]:
    """Kvota tekshiruvi va sarfini bitta atomik tranzaksiyada (SELECT FOR UPDATE)
    xavfsiz bajaradi. Bir vaqtda kelgan parallel so'rovlar orasidagi poyga
    holatini (race condition) oldini oladi.

    Returns: (covered, shortfall_minutes)
    """
    if is_user_admin(db, user_id):
        return True, 0
    sub = get_or_create_subscription(db, user_id, for_update=True)
    plan = PLANS[sub.plan.value]
    used = sub.monthly_minutes_used or 0.0
    purchased = sub.purchased_minutes or 0.0
    monthly_remaining = max(0.0, plan.monthly_minutes - used)
    total_available = monthly_remaining + purchased

    if duration_minutes > total_available + 1e-6:
        db.rollback()
        return False, math.ceil(duration_minutes - total_available)

    from_monthly = min(duration_minutes, monthly_remaining)
    from_purchased = max(0.0, duration_minutes - from_monthly)

    sub.monthly_minutes_used = used + from_monthly
    if from_purchased > 0:
        sub.purchased_minutes = max(0.0, purchased - from_purchased)
    db.commit()
    return True, 0


def consume_quota(db, user_id, duration_minutes: float) -> None:
    """Video navbatga qo'yilganda chaqiriladi -- avval oylik byudjetdan,
    yetmasa sotib olingan daqiqalardan yechadi. Poyga xavfsizligi uchun
    for_update bilan qatorni qulflaydi."""
    if is_user_admin(db, user_id):
        return
    sub = get_or_create_subscription(db, user_id, for_update=True)
    plan = PLANS[sub.plan.value]
    used = sub.monthly_minutes_used or 0.0
    monthly_remaining = max(0.0, plan.monthly_minutes - used)

    from_monthly = min(duration_minutes, monthly_remaining)
    from_purchased = max(0.0, duration_minutes - from_monthly)

    sub.monthly_minutes_used = used + from_monthly
    if from_purchased > 0:
        sub.purchased_minutes = max(0.0, (sub.purchased_minutes or 0.0) - from_purchased)
    db.commit()


def refund_quota(db, user_id, duration_minutes: float) -> None:
    """consume_quota() bilan sarflangan daqiqalarni qaytaradi -- job pipeline
    muvaffaqiyatsiz tugasa (backend/workers/tasks.py) yoki bekor qilinsa.
    consume'ning teskarisi: avval sotib olingan daqiqalarga (agar shu jobda
    ishlatilgan bo'lsa), keyin oylikka qaytaradi -- soddaroq qilib, hammasini
    oylik hisoblagichdan ayiramiz, purchased qoldig'i esa faqat oylik 0'ga
    yetganda oshadi."""
    if not user_id or duration_minutes <= 0:
        return
    if is_user_admin(db, user_id):
        return
    sub = get_or_create_subscription(db, user_id, for_update=True)
    used = sub.monthly_minutes_used or 0.0
    give_back_to_monthly = min(duration_minutes, used)
    remainder = duration_minutes - give_back_to_monthly
    sub.monthly_minutes_used = max(0.0, used - give_back_to_monthly)
    if remainder > 0:
        sub.purchased_minutes = (sub.purchased_minutes or 0.0) + remainder
    db.commit()


def add_purchased_minutes(db, user_id, minutes: int) -> Subscription:
    """Daqiqa paketi to'lovi tasdiqlangach chaqiriladi
    (backend/services/payment_fulfillment.py). purchased_minutes'ga qo'shadi --
    bu qoldiq hech qachon reset bo'lmaydi."""
    sub = get_or_create_subscription(db, user_id)
    sub.purchased_minutes = (sub.purchased_minutes or 0.0) + float(minutes)
    db.commit()
    db.refresh(sub)
    return sub


def activate_subscription(db, user_id, plan_id: str) -> Subscription:
    """To'lov muvaffaqiyatli bo'lgandan keyin chaqiriladi — obunani tanlangan
    tarifning to'lov davriga (plan.period_days: oylik=30, yillik=365) ko'ra
    faollashtiradi/uzaytiradi va OYLIK daqiqa hisoblagichini nolga tushiradi
    (purchased_minutes tegilmaydi)."""
    if plan_id not in PLANS or plan_id == "free":
        raise ValueError(f"Noto'g'ri tarif: {plan_id}")

    plan = PLANS[plan_id]
    sub = get_or_create_subscription(db, user_id)
    now = datetime.utcnow()

    # Agar shu tier'da hali faol muddat qolgan bo'lsa (muddati tugashidan oldin
    # yangilangan), o'sha muddatdan uzaytiramiz — to'langan kunlar yo'qolmasin.
    base = sub.expires_at if (sub.plan == plan.tier and sub.expires_at and sub.expires_at > now) else now

    sub.plan = plan.tier
    sub.expires_at = base + timedelta(days=plan.period_days)
    sub.period_started_at = now
    sub.monthly_minutes_used = 0.0
    db.commit()
    db.refresh(sub)
    return sub


def get_job_queue(db, user_id) -> str:
    """Orqaga moslik uchun saqlanadi — yangi kod get_job_queue_v2() ishlatsin.
    duration_minutes=0.0 bilan chaqiriladi → short track qaytaradi.
    """
    return get_job_queue_v2(db, user_id, duration_minutes=0.0)


def get_job_queue_v2(db, user_id, duration_minutes: float) -> str:
    """Foydalanuvchi tarifi VA video davomiyligiga qarab to'g'ri Celery navbatini
    aniqlaydi.

    Ustuvorlik qoidalari (2026-10-16):
      1. Qisqa video (<=10 daqiqa) -> Uzun video (>10 daqiqa)
      2. Har bir trek ichida qat'iy tartib:
         Pro -> Standart -> Free -> Admin -> qo'shimcha

    Worker Redis BRPOP orqali navbatlarni quyidagi qat'iy tartibda tekshiradi:
      1. video_short_pro        (Pro, <=10 daq)
      2. video_short_standard   (Standart, <=10 daq)
      3. video_short_free       (Free/Anon, <=10 daq)
      4. video_short_admin      (Admin test/ichki, <=10 daq)
      5. video_long_pro         (Pro, >10 daq)
      6. video_long_standard    (Standart, >10 daq)
      7. video_long_free        (Free/Anon, >10 daq)
      8. video_long_admin       (Admin test/ichki, >10 daq)
      9. video_processing_local (Telegram local)
     10. video_processing       (Eski / zaxira)
    """
    is_short = (duration_minutes <= SHORT_TRACK_MAX_MINUTES)

    if user_id is None:
        return QUEUE_SHORT_FREE if is_short else QUEUE_LONG_FREE

    if is_user_admin(db, user_id):
        # Admin tizim testlari — haqiqiy to'lov qilgan foydalanuvchilardan keyin
        return QUEUE_SHORT_ADMIN if is_short else QUEUE_LONG_ADMIN

    sub = get_or_create_subscription(db, user_id)
    plan_tier = sub.plan.value if hasattr(sub.plan, "value") else str(sub.plan)

    if plan_tier == "pro":
        return QUEUE_SHORT_PRO if is_short else QUEUE_LONG_PRO
    elif plan_tier in ("standard", "standart"):
        return QUEUE_SHORT_STANDARD if is_short else QUEUE_LONG_STANDARD
    else:
        return QUEUE_SHORT_FREE if is_short else QUEUE_LONG_FREE
