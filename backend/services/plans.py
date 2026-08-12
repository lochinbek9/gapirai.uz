"""Tarif rejalar — narx, kvota, ustuvorlik va TTS sifat darajasi.

Reja ta'riflari kod konstantasi (bazada emas) — MAX_VIDEO_DURATION_MINUTES bilan
bir xil pattern: narx o'zgarsa, bitta qator tahrirlanadi, bazaviy migratsiya kerak
emas. Bu yerda faqat "kim qaysi tarifda va qachongacha" holati (Subscription
jadvali) saqlanadi.

Muhim moslik qoidasi: 45 daqiqadan qisqa videolar HAR DOIM bepul — bu
click_service.calculate_price()'ning bugungi (tarif tizimigacha bo'lgan)
xatti-harakati, va shu holicha saqlanadi. Tarif kvotasi (videos_per_period,
free_minutes) faqat 45+ daqiqali (pullik bo'lishi mumkin) videolarga tegishli —
"free_minutes" past kvotani emas, balki kvota ichida QAYSI davomiylikdagi
video "bepul hisoblanadi"ni bildiradi.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta

from backend.models.database import Subscription, PlanTier
from backend.services.click_service import calculate_price

SUBSCRIPTION_PERIOD_DAYS = 30
_FREE_THRESHOLD_MINUTES = 45.0  # click_service.calculate_price bilan bir xil chegara


@dataclass(frozen=True)
class PlanDef:
    id: str
    name: str
    price: int  # UZS / oy
    videos_per_period: int  # shu tarifda oyiga nechta 45+ daqiqali video BEPUL kiritilgan
    free_minutes: float  # kiritilgan videoning maksimal davomiyligi (undan uzuni odatdagidek to'lanadi)
    priority: bool
    tts_tier: str  # "edge" | "premium"


PLANS: dict[str, PlanDef] = {
    "free": PlanDef(id="free", name="Bepul", price=0, videos_per_period=1, free_minutes=45.0, priority=False, tts_tier="edge"),
    "standard": PlanDef(id="standard", name="Standart", price=49_000, videos_per_period=5, free_minutes=60.0, priority=False, tts_tier="edge"),
    "pro": PlanDef(id="pro", name="Pro", price=149_000, videos_per_period=20, free_minutes=90.0, priority=True, tts_tier="premium"),
}


def get_or_create_subscription(db, user_id) -> Subscription:
    sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
    if sub is None:
        sub = Subscription(user_id=user_id, plan=PlanTier.FREE, period_started_at=datetime.utcnow())
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return sub

    # Muddati o'tgan pullik obuna -> FREE'ga qaytadi, davr qayta boshlanadi.
    if sub.plan != PlanTier.FREE and sub.expires_at and sub.expires_at < datetime.utcnow():
        sub.plan = PlanTier.FREE
        sub.expires_at = None
        sub.period_started_at = datetime.utcnow()
        sub.videos_used_this_period = 0
        db.commit()
        db.refresh(sub)
        return sub

    # FREE tarifning "oyiga N video" kvotasi ham 30 kunda qayta boshlanadi
    # (aks holda kvota butun umrga bitta bo'lib qoladi).
    if sub.plan == PlanTier.FREE and sub.period_started_at and (datetime.utcnow() - sub.period_started_at) > timedelta(days=SUBSCRIPTION_PERIOD_DAYS):
        sub.period_started_at = datetime.utcnow()
        sub.videos_used_this_period = 0
        db.commit()
        db.refresh(sub)

    return sub


def check_quota(db, user_id, duration_minutes: float) -> tuple[bool, int]:
    """Berilgan video uchun to'lov kerakmi tekshiradi.

    Returns: (covered_without_payment, price_uzs)
    - 45 daqiqadan qisqa video: har doim (True, 0) — bugungi xatti-harakat, tarifdan mustaqil.
    - 45+ daqiqa: tarifning kvotasi (videos_per_period, free_minutes) ichiga
      sig'sa (True, 0) — chaqiruvchi keyin consume_quota() chaqirishi kerak;
      aks holda (False, narx) — click_service.calculate_price() orqali.
    """
    if duration_minutes < _FREE_THRESHOLD_MINUTES:
        return True, 0

    sub = get_or_create_subscription(db, user_id)
    plan = PLANS[sub.plan.value]

    if duration_minutes <= plan.free_minutes and sub.videos_used_this_period < plan.videos_per_period:
        return True, 0

    price = calculate_price(duration_minutes, is_first_video=False)
    return False, price


def consume_quota(db, user_id, duration_minutes: float) -> None:
    """45+ daqiqali video kvota ichida (pullik bo'lmasdan) qoplanganda chaqiriladi."""
    if duration_minutes < _FREE_THRESHOLD_MINUTES:
        return  # qisqa videolar kvotaga kirmaydi
    sub = get_or_create_subscription(db, user_id)
    sub.videos_used_this_period += 1
    db.commit()


def activate_subscription(db, user_id, plan_id: str) -> Subscription:
    """To'lov muvaffaqiyatli bo'lgandan keyin chaqiriladi — obunani 30 kunga
    faollashtiradi/uzaytiradi va davr hisoblagichini nolga tushiradi."""
    if plan_id not in PLANS or plan_id == "free":
        raise ValueError(f"Noto'g'ri tarif: {plan_id}")

    sub = get_or_create_subscription(db, user_id)
    now = datetime.utcnow()

    # Agar shu tarifda hali faol muddat qolgan bo'lsa (muddati tugashidan oldin
    # yangilangan), o'sha muddatdan uzaytiramiz — to'langan kunlar yo'qolmasin.
    base = sub.expires_at if (sub.plan == PlanTier(plan_id) and sub.expires_at and sub.expires_at > now) else now

    sub.plan = PlanTier(plan_id)
    sub.expires_at = base + timedelta(days=SUBSCRIPTION_PERIOD_DAYS)
    sub.period_started_at = now
    sub.videos_used_this_period = 0
    db.commit()
    db.refresh(sub)
    return sub
