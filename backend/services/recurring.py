"""Avtomatik to'lov (rekurrent) — karta tokeni bilan:

  1. Auto-renew  — obuna muddati tugaganda bog'langan kartadan avtomatik
     uzaytirish. Kunlik cron: backend/scripts/auto_renew.py -> run_auto_renew().
  2. Auto top-up — daqiqa balansi job uchun yetmaganda avtomatik daqiqa
     paketi sotib olish. Job yaratishda sinxron: try_auto_topup()
     (backend/services/job_creation.py).

Karta bog'lash oqimi: bind_card -> (provayder SMS yuboradi) -> verify_card.
To'lov: charge_card() Payment yaratadi, provayder charge API'sini chaqiradi;
provayder o'z webhook'ini chaqirib fulfillment'ni ishga tushiradi
(backend/services/payment_fulfillment.apply_successful_payment, fulfilled_at
idempotentligi bilan himoyalangan).

Barcha karta operatsiyalari feature-flag ortida: CLICK_CARD_TOKEN_ENABLED /
PAYME_CARD_TOKEN_ENABLED. O'chiq bo'lsa hech narsa ishlamaydi (mavjud
redirect-checkout esa o'zgarishsiz).
"""
import logging
from datetime import datetime, timedelta

from backend.config import get_settings
from backend.models.database import Subscription, PlanTier, User
from backend.models.payment import Payment, PaymentCard, PaymentStatus, PaymentProvider
from backend.services.card_providers import CardProviderError, click_cards, payme_cards
from backend.services.payment_fulfillment import apply_successful_payment
from backend.services.plans import (
    PLANS, MINUTE_PACKS, get_or_create_subscription, get_minute_balance,
)

logger = logging.getLogger(__name__)

_PROVIDERS = {"click": click_cards, "payme": payme_cards}
_PROVIDER_ENUM = {"click": PaymentProvider.CLICK, "payme": PaymentProvider.PAYME}


# ----------------------------- provayder holati -----------------------------

def enabled_providers() -> dict[str, bool]:
    s = get_settings()
    return {
        "click": bool(s.CLICK_CARD_TOKEN_ENABLED and s.CLICK_SECRET_KEY and s.CLICK_MERCHANT_USER_ID),
        "payme": bool(s.PAYME_CARD_TOKEN_ENABLED and s.PAYME_MERCHANT_ID and (
            s.PAYME_TEST_KEY if s.PAYME_SANDBOX_MODE else s.PAYME_KEY)),
    }


def _mod(provider: str):
    if provider not in _PROVIDERS:
        raise CardProviderError(f"Noma'lum provayder: {provider}")
    if not enabled_providers().get(provider):
        raise CardProviderError("Bu to'lov tizimida avtomatik to'lov hozircha mavjud emas.")
    return _PROVIDERS[provider]


# ------------------------------ karta CRUD ---------------------------------

def list_cards(db, user_id) -> list[PaymentCard]:
    return (
        db.query(PaymentCard)
        .filter(PaymentCard.user_id == user_id)
        .order_by(PaymentCard.is_default.desc(), PaymentCard.created_at.desc())
        .all()
    )


def get_default_card(db, user_id) -> PaymentCard | None:
    cards = [c for c in list_cards(db, user_id) if c.is_active]
    if not cards:
        return None
    for c in cards:
        if c.is_default:
            return c
    return cards[0]


def bind_card(db, user_id, provider: str, card_number: str, expire: str) -> PaymentCard:
    """Provayderga kartani ro'yxatdan o'tkazadi (token oladi). Provayder karta
    egasining telefoniga SMS kod yuboradi. Karta is_active=False bo'lib
    yaratiladi — verify_card() dan keyin faollashadi."""
    mod = _mod(provider)
    res = mod.bind(card_number, expire)

    # xuddi shu token allaqachon bog'langan bo'lsa — o'shani qaytaramiz
    existing = db.query(PaymentCard).filter(
        PaymentCard.provider == provider, PaymentCard.token == res["token"]
    ).first()
    if existing:
        return existing

    phone_hint = res.get("phone_hint")
    if provider == "payme" and not phone_hint:
        try:
            phone_hint = mod.request_code(res["token"])
        except CardProviderError:
            phone_hint = None

    card = PaymentCard(
        user_id=user_id,
        provider=provider,
        token=res["token"],
        card_mask=res.get("card_mask"),
        card_type=res.get("card_type"),
        expire=_norm_expire(expire),
        phone_hint=phone_hint,
        is_active=bool(res.get("verified")),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


def resend_code(db, card: PaymentCard) -> str | None:
    mod = _mod(card.provider)
    phone = mod.request_code(card.token)
    if phone and phone != card.phone_hint:
        card.phone_hint = phone
        db.commit()
    return phone or card.phone_hint


def verify_card(db, card: PaymentCard, code: str) -> PaymentCard:
    """SMS kodni tekshiradi. Muvaffaqiyatli bo'lsa karta faollashadi va
    (agar foydalanuvchining birinchi kartasi bo'lsa) default qilinadi.
    consent_at shu vaqtda o'rnatiladi — foydalanuvchi avtomatik yechishga
    aynan karta tasdiqlash orqali rozilik bildiradi."""
    mod = _mod(card.provider)
    res = mod.verify(card.token, code)
    card.token = res.get("token", card.token)
    card.card_mask = res.get("card_mask") or card.card_mask
    card.card_type = res.get("card_type") or card.card_type
    card.is_active = True
    card.consent_at = datetime.utcnow()
    card.last_error = None

    has_default = db.query(PaymentCard).filter(
        PaymentCard.user_id == card.user_id, PaymentCard.is_active == True,  # noqa: E712
        PaymentCard.is_default == True, PaymentCard.id != card.id,
    ).first()
    if not has_default:
        card.is_default = True
    db.commit()
    db.refresh(card)
    return card


def set_default_card(db, user_id, card_id) -> None:
    for c in db.query(PaymentCard).filter(PaymentCard.user_id == user_id).all():
        c.is_default = (str(c.id) == str(card_id) and c.is_active)
    db.commit()


def remove_card(db, card: PaymentCard) -> None:
    try:
        _PROVIDERS[card.provider].delete(card.token)
    except Exception as e:  # provayderda o'chmasa ham lokal yozuvni olib tashlaymiz
        logger.warning("Karta provayderda o'chmadi: %s", e)
    was_default = card.is_default
    user_id = card.user_id
    db.delete(card)
    db.commit()
    if was_default:
        nxt = get_default_card(db, user_id)
        if nxt:
            nxt.is_default = True
            db.commit()

    # kartasi qolmagan bo'lsa avtomatik to'lovlarni o'chiramiz
    if not get_default_card(db, user_id):
        sub = db.query(Subscription).filter(Subscription.user_id == user_id).first()
        if sub and (sub.auto_renew or sub.auto_topup_enabled):
            sub.auto_renew = False
            sub.auto_topup_enabled = False
            db.commit()


def _norm_expire(expire: str) -> str:
    e = expire.replace("/", "").replace(" ", "")
    return f"{e[:2]}/{e[2:]}" if len(e) == 4 else expire


# ------------------------------- to'lov -----------------------------------

def charge_card(db, card: PaymentCard, amount_uzs: float, *,
                minutes_purchased: int | None = None, plan: str | None = None,
                is_auto: bool, description: str) -> tuple[bool, Payment]:
    """Bog'langan kartadan to'lov yechadi. Fulfillment provayder webhook'i
    orqali (yoki shu funksiya ichidan, fulfilled_at idempotentligi bilan)
    amalga oshiriladi."""
    payment = Payment(
        user_id=card.user_id,
        amount=float(amount_uzs),
        provider=_PROVIDER_ENUM[card.provider],
        status=PaymentStatus.PENDING,
        card_id=card.id,
        is_auto=is_auto,
        minutes_purchased=minutes_purchased,
        plan=plan,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    mod = _PROVIDERS[card.provider]
    try:
        if card.provider == "payme":
            result = mod.charge(card.token, amount_uzs, str(payment.id), description)
        else:
            result = mod.charge(card.token, amount_uzs, str(payment.id))
    except CardProviderError as e:
        result = {"ok": False, "provider_ref": None, "error": e.message}

    db.refresh(payment)  # webhook shu orada fulfilled_at qo'ygan bo'lishi mumkin

    if result.get("ok") or payment.fulfilled_at:
        if payment.status != PaymentStatus.APPROVED:
            payment.status = PaymentStatus.APPROVED
        if card.provider == "click" and result.get("provider_ref"):
            payment.click_transaction_id = result["provider_ref"]
        elif card.provider == "payme" and result.get("provider_ref"):
            payment.payme_transaction_id = result["provider_ref"]
        db.commit()
        apply_successful_payment(db, payment)  # fulfilled_at bo'lsa no-op
        card.last_charged_at = datetime.utcnow()
        card.last_error = None
        db.commit()
        return True, payment

    payment.status = PaymentStatus.REJECTED
    card.last_error = (result.get("error") or "To'lov rad etildi")[:500]
    db.commit()
    return False, payment


# ----------------------------- auto top-up --------------------------------

def _auto_topups_today(db, user_id) -> int:
    since = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(Payment)
        .filter(
            Payment.user_id == user_id,
            Payment.is_auto == True,  # noqa: E712
            Payment.minutes_purchased.isnot(None),
            Payment.status == PaymentStatus.APPROVED,
            Payment.created_at >= since,
        )
        .count()
    )


def _pick_pack(preferred: int | None, shortfall_minutes: int) -> int:
    packs = sorted(MINUTE_PACKS)
    if preferred and preferred in MINUTE_PACKS and preferred >= shortfall_minutes:
        return preferred
    for p in packs:
        if p >= shortfall_minutes:
            return p
    return packs[-1]  # eng katta — bitta job (maks 120 daq) uchun doim yetadi


def try_auto_topup(db, user_id, shortfall_minutes: int) -> bool:
    """check_quota() False qaytarganda job_creation shu funksiyani chaqiradi.
    True qaytsa — daqiqa qo'shildi, qayta check_quota qilinadi."""
    sub = get_or_create_subscription(db, user_id)
    if not sub.auto_topup_enabled:
        return False
    card = get_default_card(db, user_id)
    if not card:
        return False
    s = get_settings()
    if _auto_topups_today(db, user_id) >= s.AUTO_TOPUP_MAX_PER_DAY:
        logger.info("Auto top-up kunlik limitga yetdi: user=%s", user_id)
        return False

    pack = _pick_pack(sub.auto_topup_pack, shortfall_minutes)
    amount = MINUTE_PACKS[pack]
    try:
        ok, payment = charge_card(
            db, card, amount, minutes_purchased=pack, is_auto=True,
            description=f"Avtomatik +{pack} daqiqa",
        )
    except Exception as e:
        logger.error("Auto top-up charge xatosi user=%s: %s", user_id, e)
        return False

    if ok:
        _notify(db, user_id, "Daqiqa avtomatik to'ldirildi",
                [f"Balansingiz tugagani uchun +{pack} daqiqa avtomatik sotib olindi "
                 f"({amount:,} so'm). Dublyaj davom etmoqda.".replace(",", " ")],
                url="/dashboard")
    else:
        _notify(db, user_id, "Avtomatik to'lov amalga oshmadi",
                [f"+{pack} daqiqa avtomatik sotib olishga urinish muvaffaqiyatsiz tugadi. "
                 f"Kartangizni tekshiring yoki daqiqani qo'lda sotib oling."],
                url="/pricing")
    return ok


# ------------------------------ auto-renew --------------------------------

def _grace_days() -> int:
    return max(1, get_settings().AUTO_RENEW_GRACE_DAYS)


def _enter_grace_or_downgrade(db, sub: Subscription, now: datetime) -> str:
    sub.renew_failed_attempts = (sub.renew_failed_attempts or 0) + 1
    if not sub.grace_until:
        sub.grace_until = (sub.expires_at or now) + timedelta(days=_grace_days())

    if sub.renew_failed_attempts >= _grace_days() or now > sub.grace_until:
        old_name = PLANS[sub.plan.value].name
        sub.plan = PlanTier.FREE
        sub.expires_at = None
        sub.auto_renew = False
        sub.grace_until = None
        sub.period_started_at = now
        sub.monthly_minutes_used = 0.0
        db.commit()
        _notify(db, sub.user_id, "Tarifingiz Bepul rejaga o'tkazildi",
                [f'"{old_name}" tarifini avtomatik uzaytirib bo\'lmadi (bir necha urinishdan keyin). '
                 f"Hisobingiz Bepul rejaga o'tkazildi. Qayta obuna bo'lish uchun kartani tekshiring."],
                url="/pricing")
        return "downgraded"

    db.commit()
    left = (sub.grace_until - now).days + 1
    _notify(db, sub.user_id, "Obunani avtomatik uzaytirib bo'lmadi",
            [f"Kartangizdan to'lov yechilmadi. Keyingi {left} kun ichida qayta urinib ko'ramiz — "
             f"shu vaqt davomida tarif imtiyozlari saqlanadi. Kartangizni tekshiring."],
            url="/dashboard")
    return "grace"


def run_auto_renew(db) -> dict:
    """Kunlik cron (backend/scripts/auto_renew.py). auto_renew=True bo'lgan,
    muddati bugun/ertaga tugaydigan yoki grace davridagi obunalarni kartadan
    uzaytiradi."""
    now = datetime.utcnow()
    horizon = now + timedelta(days=1)
    subs = (
        db.query(Subscription)
        .filter(Subscription.auto_renew == True, Subscription.plan != PlanTier.FREE)  # noqa: E712
        .all()
    )
    out = {"total": len(subs), "charged": 0, "grace": 0, "downgraded": 0, "skipped": 0}

    for sub in subs:
        due = bool(sub.expires_at and sub.expires_at <= horizon)
        in_grace = bool(sub.grace_until and sub.grace_until >= now)
        if not (due or in_grace):
            out["skipped"] += 1
            continue
        if sub.renew_last_attempt_at and sub.renew_last_attempt_at.date() == now.date():
            out["skipped"] += 1
            continue

        plan_id = sub.auto_renew_plan or sub.plan.value
        plan = PLANS.get(plan_id)
        card = get_default_card(db, sub.user_id)
        sub.renew_last_attempt_at = now

        if not card or not plan or plan_id == "free":
            res = _enter_grace_or_downgrade(db, sub, now)
            out["downgraded" if res == "downgraded" else "grace"] += 1
            continue

        try:
            ok, _ = charge_card(
                db, card, plan.price, plan=plan_id, is_auto=True,
                description=f"{plan.name} — obunani avtomatik uzaytirish",
            )
        except Exception as e:
            logger.error("Auto-renew charge xatosi user=%s: %s", sub.user_id, e)
            ok = False

        if ok:
            db.refresh(sub)  # apply_successful_payment -> activate_subscription bajarilgan
            sub.renew_failed_attempts = 0
            sub.grace_until = None
            sub.auto_renew = True
            sub.auto_renew_plan = plan_id
            db.commit()
            _notify(db, sub.user_id, "Obuna avtomatik uzaytirildi",
                    [f'"{plan.name}" tarifingiz {plan.price:,} so\'mga avtomatik uzaytirildi. '
                     f"Amal muddati: {sub.expires_at:%Y-%m-%d}.".replace(",", " ")],
                    url="/dashboard")
            out["charged"] += 1
        else:
            res = _enter_grace_or_downgrade(db, sub, now)
            out["downgraded" if res == "downgraded" else "grace"] += 1

    return out


# ---------------------------- bildirishnoma -------------------------------

def _notify(db, user_id, title: str, body_lines: list[str], url: str = "/dashboard") -> None:
    try:
        from backend.services.push_service import notify_user
        notify_user(db, user_id, title, " ".join(body_lines), url)
    except Exception as e:
        logger.warning("Push bildirishnoma yuborilmadi: %s", e)
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user and user.email:
            from backend.services.email_service import send_billing_email
            send_billing_email(user.email, user.name or "", title, body_lines)
    except Exception as e:
        logger.warning("Billing email yuborilmadi: %s", e)
