"""Avtomatik to'lov API — bog'langan kartalar va avtomatik to'lov sozlamalari
(backend/services/recurring.py).

  GET    /api/billing/overview                    — kartalar + sozlamalar + balans
  POST   /api/billing/cards                        — karta bog'lash (provayder SMS yuboradi)
  POST   /api/billing/cards/{id}/verify            — SMS kodni tasdiqlash
  POST   /api/billing/cards/{id}/resend            — SMS kodni qayta yuborish
  POST   /api/billing/cards/{id}/default           — asosiy karta qilish
  DELETE /api/billing/cards/{id}                    — kartani o'chirish
  PUT    /api/billing/auto-renew   {enabled, plan}  — obunani avto-uzaytirish
  PUT    /api/billing/auto-topup   {enabled, pack}  — daqiqani avto-to'ldirish

Karta raqami (PAN) faqat provayderga uzatiladi, bazaga yozilmaydi va
loglanmaydi (backend/services/card_providers/).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.models.database import get_db, User
from backend.models.payment import PaymentCard
from backend.services.auth import get_current_user
from backend.services.card_providers import CardProviderError
from backend.services.plans import PLANS, MINUTE_PACKS, LEGACY_MINUTE_PACKS, STARTER_PACK_MINUTES, get_or_create_subscription, get_minute_balance
from backend.services import recurring

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/billing", tags=["billing"])

_MAX_UNVERIFIED_CARDS = 3


def _card_json(c: PaymentCard) -> dict:
    return {
        "id": str(c.id),
        "provider": c.provider,
        "card_mask": c.card_mask,
        "card_type": c.card_type,
        "expire": c.expire,
        "is_active": c.is_active,
        "is_default": c.is_default,
        "phone_hint": c.phone_hint,
        "last_error": c.last_error if not c.is_active else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _get_card(db: Session, user: User, card_id: str) -> PaymentCard:
    card = db.query(PaymentCard).filter(
        PaymentCard.id == card_id, PaymentCard.user_id == user.id
    ).first()
    if not card:
        raise HTTPException(status_code=404, detail="Karta topilmadi.")
    return card


@router.get("/overview")
def overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> dict:
    sub = get_or_create_subscription(db, current_user.id)
    cards = recurring.list_cards(db, current_user.id)
    from datetime import datetime
    in_grace = bool(sub.grace_until and sub.grace_until >= datetime.utcnow())
    return {
        "providers": recurring.enabled_providers(),
        "cards": [_card_json(c) for c in cards],
        "has_active_card": recurring.get_default_card(db, current_user.id) is not None,
        "current_plan": sub.plan.value,
        "current_plan_paid": sub.plan.value != "free",
        "preferences": {
            "auto_renew": sub.auto_renew,
            "auto_renew_plan": sub.auto_renew_plan or (sub.plan.value if sub.plan.value != "free" else None),
            "auto_topup_enabled": sub.auto_topup_enabled,
            "auto_topup_pack": sub.auto_topup_pack,
            "in_grace": in_grace,
            "grace_until": sub.grace_until.isoformat() if sub.grace_until else None,
            "renew_failed_attempts": sub.renew_failed_attempts or 0,
        },
        "minute_balance": get_minute_balance(db, current_user.id),
        "minute_packs": [{"minutes": m, "price": p} for m, p in sorted(MINUTE_PACKS.items())],
    }


class BindCardRequest(BaseModel):
    provider: str = Field(pattern="^(click|payme)$")
    card_number: str = Field(min_length=12, max_length=25)
    expire: str = Field(min_length=4, max_length=5)  # 'MMYY' yoki 'MM/YY'


@router.post("/cards")
def bind_card(req: BindCardRequest, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)) -> dict:
    unverified = db.query(PaymentCard).filter(
        PaymentCard.user_id == current_user.id, PaymentCard.is_active == False  # noqa: E712
    ).count()
    if unverified >= _MAX_UNVERIFIED_CARDS:
        raise HTTPException(status_code=429, detail="Juda ko'p tasdiqlanmagan karta. Avval mavjudlarini tasdiqlang yoki o'chiring.")
    try:
        card = recurring.bind_card(db, current_user.id, req.provider,
                                   req.card_number, req.expire)
    except CardProviderError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {
        "card": _card_json(card),
        "needs_code": not card.is_active,
        "phone_hint": card.phone_hint,
    }


class VerifyCardRequest(BaseModel):
    code: str = Field(min_length=3, max_length=8)


@router.post("/cards/{card_id}/verify")
def verify_card(card_id: str, req: VerifyCardRequest, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    card = _get_card(db, current_user, card_id)
    if card.is_active:
        return {"card": _card_json(card)}
    try:
        card = recurring.verify_card(db, card, req.code)
    except CardProviderError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {"card": _card_json(card)}


@router.post("/cards/{card_id}/resend")
def resend_code(card_id: str, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    card = _get_card(db, current_user, card_id)
    try:
        phone = recurring.resend_code(db, card)
    except CardProviderError as e:
        raise HTTPException(status_code=400, detail=e.message)
    return {"phone_hint": phone}


@router.post("/cards/{card_id}/default")
def make_default(card_id: str, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> dict:
    card = _get_card(db, current_user, card_id)
    if not card.is_active:
        raise HTTPException(status_code=400, detail="Avval kartani tasdiqlang.")
    recurring.set_default_card(db, current_user.id, card_id)
    return {"ok": True}


@router.delete("/cards/{card_id}")
def delete_card(card_id: str, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> dict:
    card = _get_card(db, current_user, card_id)
    recurring.remove_card(db, card)
    return {"ok": True}


class AutoRenewRequest(BaseModel):
    enabled: bool
    plan: str | None = None


@router.put("/auto-renew")
def set_auto_renew(req: AutoRenewRequest, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    sub = get_or_create_subscription(db, current_user.id)
    if req.enabled:
        if not recurring.get_default_card(db, current_user.id):
            raise HTTPException(status_code=400, detail="Avtomatik uzaytirish uchun avval karta bog'lang.")
        plan_id = req.plan or (sub.plan.value if sub.plan.value != "free" else None)
        if not plan_id or plan_id not in PLANS or plan_id == "free":
            raise HTTPException(status_code=400, detail="Avtomatik uzaytirish uchun to'g'ri tarif tanlang (pullik obuna).")
        sub.auto_renew = True
        sub.auto_renew_plan = plan_id
    else:
        sub.auto_renew = False
    db.commit()
    return {"auto_renew": sub.auto_renew, "auto_renew_plan": sub.auto_renew_plan}


class AutoTopupRequest(BaseModel):
    enabled: bool
    pack: int | None = None


@router.put("/auto-topup")
def set_auto_topup(req: AutoTopupRequest, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)) -> dict:
    sub = get_or_create_subscription(db, current_user.id)
    if req.enabled:
        if not recurring.get_default_card(db, current_user.id):
            raise HTTPException(status_code=400, detail="Avtomatik to'ldirish uchun avval karta bog'lang.")
        all_packs = {**LEGACY_MINUTE_PACKS, **MINUTE_PACKS}
        if req.pack is not None and req.pack not in all_packs:
            raise HTTPException(status_code=400, detail=f"Noto'g'ri paket. Mavjud: {sorted(MINUTE_PACKS)}")
        if req.pack == STARTER_PACK_MINUTES:
            raise HTTPException(status_code=400, detail="Starter paketi (15 daqiqa) bir martalik bo'lib, avtomatik to'ldirish uchun mos kelmaydi.")
        sub.auto_topup_enabled = True
        sub.auto_topup_pack = req.pack
    else:
        sub.auto_topup_enabled = False
    db.commit()
    return {"auto_topup_enabled": sub.auto_topup_enabled, "auto_topup_pack": sub.auto_topup_pack}
