"""Daqiqa paketlari -- foydalanuvchi oylik byudjeti tugaganda qo'shimcha
daqiqa sotib oladi (backend/services/plans.py: MINUTE_PACKS). Sotib olingan
daqiqalar Subscription.purchased_minutes'ga qo'shiladi (fulfillment:
backend/services/payment_fulfillment.py) va HECH QACHON tugamaydi.

Naqsh: routes.py:purchase_library_access (Click) va payme_routes._build_checkout_url
(Payme) bilan bir xil -- bir martalik, job/plan bilan bog'liq bo'lmagan to'lov.
"""
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models.database import get_db, User
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.auth import get_current_user
from backend.services.plans import MINUTE_PACKS, get_minute_balance
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
    return {
        "balance": get_minute_balance(db, current_user.id),
        "packs": [{"minutes": m, "price": p} for m, p in sorted(MINUTE_PACKS.items())],
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
    if req.pack not in MINUTE_PACKS:
        raise HTTPException(status_code=400, detail=f"Noto'g'ri paket. Mavjud: {sorted(MINUTE_PACKS)}")
    amount = MINUTE_PACKS[req.pack]
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
