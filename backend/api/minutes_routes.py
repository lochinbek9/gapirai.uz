"""Daqiqa paketlari -- foydalanuvchi oylik byudjeti tugaganda qo'shimcha
daqiqa sotib oladi (backend/services/plans.py: MINUTE_PACKS). Sotib olingan
daqiqalar Subscription.purchased_minutes'ga qo'shiladi (fulfillment:
backend/services/payment_fulfillment.py) va HECH QACHON tugamaydi.

Naqsh: donate_routes.py (Click) va payme_routes._build_checkout_url (Payme)
bilan bir xil -- bir martalik, job/plan bilan bog'liq bo'lmagan to'lov.
"""
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db, User
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.auth import get_current_user
from backend.services.plans import (
    MINUTE_PACKS,
    LEGACY_MINUTE_PACKS,
    STARTER_PACK_MINUTES,
    has_purchased_starter_pack,
    get_minute_balance,
    get_user_first_video_discount,
    apply_user_discount,
)
from backend.services.click_service import generate_payment_url
from backend.config import get_settings

router = APIRouter(prefix="/api/minutes", tags=["minutes"])


@router.get("")
def minute_balance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Dashboard uchun: {monthly_cap, monthly_used, monthly_remaining,
    purchased, total_available} + sotib olsa bo'ladigan paketlar."""
    has_starter = has_purchased_starter_pack(db, current_user.id)
    discount = get_user_first_video_discount(db, current_user.id)
    is_disc_active = bool(discount and discount.get("active"))

    return {
        "balance": get_minute_balance(db, current_user.id),
        "discount": discount,
        "packs": [
            {
                "minutes": m,
                "price": p,
                "discounted_price": int(round(p * 0.9)) if is_disc_active else None,
                "one_time": m == STARTER_PACK_MINUTES,
                "already_purchased": has_starter if m == STARTER_PACK_MINUTES else False,
            }
            for m, p in sorted(MINUTE_PACKS.items())
        ],
    }


class PurchaseRequest(BaseModel):
    pack: int                  # 30 | 60 | 120 | 300
    provider: str = "click"    # "click" | "payme"


def _pending_pack_payment(db: Session, user_id, pack: int, provider: PaymentProvider) -> Payment | None:
    return db.query(Payment).filter(
        Payment.user_id == user_id,
        Payment.minutes_purchased == pack,
        Payment.status == PaymentStatus.PENDING,
        Payment.provider == provider,
    ).first()


@router.post("/purchase")
def purchase_minutes(
    req: PurchaseRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    all_packs = {**LEGACY_MINUTE_PACKS, **MINUTE_PACKS}
    if req.pack not in all_packs:
        raise HTTPException(status_code=400, detail=f"Noto'g'ri paket. Mavjud: {sorted(MINUTE_PACKS)}")
    
    if req.pack == STARTER_PACK_MINUTES and has_purchased_starter_pack(db, current_user.id):
        raise HTTPException(
            status_code=400,
            detail="Starter paketi (15 daqiqa) bir martalik maxsus taklif hisoblanadi va siz uni allaqachon xarid qilgansiz. Iltimos, boshqa paketlarni tanlang.",
        )

    base_amount = all_packs[req.pack]
    amount, _ = apply_user_discount(db, current_user.id, base_amount)
    settings = get_settings()

    origin_header = request.headers.get("origin") or request.headers.get("referer")
    if origin_header:
        parsed = urlparse(origin_header)
        base_origin = f"{parsed.scheme}://{parsed.netloc}"
    else:
        base_origin = (settings.FRONTEND_URL or "https://gapirai.uz").rstrip("/")
    return_url = f"{base_origin}/dashboard"

    if req.provider == "payme":
        from backend.services.payme_service import generate_payme_checkout_url
        payment = _pending_pack_payment(db, current_user.id, req.pack, PaymentProvider.PAYME)
        if not payment:
            payment = Payment(
                user_id=current_user.id, minutes_purchased=req.pack, amount=amount,
                provider=PaymentProvider.PAYME, status=PaymentStatus.PENDING,
            )
            db.add(payment)
            db.commit()
            db.refresh(payment)
        elif payment.amount != amount:
            payment.amount = amount
            db.commit()
        payment_url = generate_payme_checkout_url(
            merchant_id=settings.PAYME_MERCHANT_ID,
            account_field="payment_id",
            account_value=str(payment.id),
            amount_tiyin=int(round(amount * 100)),
            return_url=return_url,
            sandbox=settings.PAYME_SANDBOX_MODE,
        )
        return {"success": True, "payment_url": payment_url, "payment_id": str(payment.id),
                "amount": amount, "minutes": req.pack}

    # default: Click
    payment = _pending_pack_payment(db, current_user.id, req.pack, PaymentProvider.CLICK)
    if not payment:
        payment = Payment(
            user_id=current_user.id, minutes_purchased=req.pack, amount=amount,
            provider=PaymentProvider.CLICK, status=PaymentStatus.PENDING,
            click_create_time=int(time.time()),
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
    elif payment.amount != amount:
        payment.amount = amount
        db.commit()

    payment_url = generate_payment_url(
        merchant_id=settings.CLICK_MERCHANT_ID or "56653",
        service_id=settings.CLICK_SERVICE_ID or "108780",
        transaction_param=str(payment.id),
        amount=amount,
        return_url=return_url,
        merchant_user_id=getattr(settings, "CLICK_MERCHANT_USER_ID", "") or "89102",
    )
    return {"success": True, "payment_url": payment_url, "payment_id": str(payment.id),
            "amount": amount, "minutes": req.pack}
