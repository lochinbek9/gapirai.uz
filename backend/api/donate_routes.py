"""Loyihaga ixtiyoriy donat (qo'llab-quvvatlash).

Mavjud Click/Payme to'lov infratuzilmasini qayta ishlatadi -- donat =
job/plan/paket bilan bog'lanmagan Payment (is_donation=True). Login SHART
EMAS: user_id NULL bo'lishi mumkin, donor o'zini ixtiyoriy tanishtiradi.
Webhook'lar (click_routes /complete, payme PerformTransaction) Payment'ni
id bo'yicha topib payment_fulfillment.apply_successful_payment'ni
chaqiradi -- u yerda is_donation shoxi bor (yetkaziladigan narsa yo'q).
Naqsh: backend/api/minutes_routes.py bilan bir xil.
"""
import re
import time
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from backend.models.database import get_db, User
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.auth import get_optional_user
from backend.services.click_service import generate_payment_url
from backend.config import get_settings

router = APIRouter(prefix="/api/donate", tags=["donate"])

# Tayyor summalar (so'm) + chegaralar. Frontend shu ro'yxatni /options'dan oladi.
DONATION_PRESETS = [10_000, 25_000, 50_000, 100_000]
DONATION_MIN = 1_000
DONATION_MAX = 10_000_000


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class DonateRequest(BaseModel):
    amount: int
    provider: str = "click"          # "click" | "payme"
    name: str | None = None
    email: str | None = None
    message: str | None = None

    @field_validator("name", "message")
    @classmethod
    def _trim(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()[:500]
        return v or None

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip().lower()
        if not v:
            return None
        if not _EMAIL_RE.match(v):
            raise ValueError("Email manzili noto'g'ri.")
        return v


@router.get("/options")
def donate_options() -> dict:
    return {"presets": DONATION_PRESETS, "min": DONATION_MIN, "max": DONATION_MAX}


@router.post("")
def create_donation(
    req: DonateRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    if req.amount < DONATION_MIN or req.amount > DONATION_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Summa {DONATION_MIN:,} - {DONATION_MAX:,} so'm oralig'ida bo'lishi kerak.".replace(",", " "),
        )
    if req.provider not in ("click", "payme"):
        raise HTTPException(status_code=400, detail="Noto'g'ri to'lov turi.")

    settings = get_settings()
    amount = float(req.amount)

    origin_header = request.headers.get("origin") or request.headers.get("referer")
    if origin_header:
        parsed = urlparse(origin_header)
        base_origin = f"{parsed.scheme}://{parsed.netloc}"
    else:
        base_origin = (settings.FRONTEND_URL or "https://gapirai.uz").rstrip("/")
    return_url = f"{base_origin}/donate/thanks"

    provider_enum = PaymentProvider.PAYME if req.provider == "payme" else PaymentProvider.CLICK
    payment = Payment(
        user_id=current_user.id if current_user else None,
        is_donation=True,
        amount=amount,
        provider=provider_enum,
        status=PaymentStatus.PENDING,
        donor_name=req.name or (current_user.name if current_user else None),
        donor_email=req.email or (current_user.email if current_user else None),
        donor_message=req.message,
        click_create_time=int(time.time()) if provider_enum == PaymentProvider.CLICK else None,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    if provider_enum == PaymentProvider.PAYME:
        from backend.services.payme_service import generate_payme_checkout_url
        payment_url = generate_payme_checkout_url(
            merchant_id=settings.PAYME_MERCHANT_ID,
            account_field="payment_id",
            account_value=str(payment.id),
            amount_tiyin=int(round(amount * 100)),
            return_url=return_url,
            sandbox=settings.PAYME_SANDBOX_MODE,
        )
    else:
        payment_url = generate_payment_url(
            merchant_id=settings.CLICK_MERCHANT_ID or "56653",
            service_id=settings.CLICK_SERVICE_ID or "108780",
            transaction_param=str(payment.id),
            amount=amount,
            return_url=return_url,
            merchant_user_id=getattr(settings, "CLICK_MERCHANT_USER_ID", "") or "89102",
        )

    return {"success": True, "payment_url": payment_url, "payment_id": str(payment.id), "amount": req.amount}
