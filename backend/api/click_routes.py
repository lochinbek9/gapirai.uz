from fastapi import APIRouter, Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import os
import time
from backend.models.database import get_db, DubbingJob, User
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.click_service import (
    generate_payment_url, 
    validate_signature, 
    ClickErrors,
    calculate_price
)
# Assume auth_routes provides a way to get current user
# Using a placeholder for get_current_user logic or just allowing by userId for now.

router = APIRouter(prefix="/api/payments/click", tags=["click"])

class InitiatePaymentRequest(BaseModel):
    job_id: str
    user_id: str # Temporary simplified auth for route

@router.post("/initiate")
async def initiate_payment(req: InitiatePaymentRequest, db: Session = Depends(get_db)):
    job = db.query(DubbingJob).filter(DubbingJob.id == req.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # duration is required to calculate price
    if not job.video_duration:
        raise HTTPException(status_code=400, detail="Video duration is unknown")
    
    duration_minutes = job.video_duration / 60.0
    amount = calculate_price(duration_minutes)

    if amount == 0:
        return {"success": True, "message": "Video is under 10 minutes, free of charge", "amount": 0}

    payment = Payment(
        user_id=req.user_id,
        job_id=job.id,
        amount=amount,
        provider=PaymentProvider.CLICK,
        status=PaymentStatus.PENDING,
        click_create_time=int(time.time())
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    merchant_id = os.environ.get("CLICK_MERCHANT_ID", "12345")
    service_id = os.environ.get("CLICK_SERVICE_ID", "12345")
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    return_url = f"{frontend_url}/payment-status?payment_id={payment.id}"

    payment_url = generate_payment_url(
        merchant_id=merchant_id,
        service_id=service_id,
        transaction_param=str(payment.id),
        amount=amount,
        return_url=return_url
    )

    return {
        "success": True,
        "payment_url": payment_url,
        "payment_id": str(payment.id),
        "amount": amount
    }

@router.post("/prepare")
async def click_prepare(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    data = dict(form_data)
    
    secret_key = os.environ.get("CLICK_SECRET_KEY", "YOUR_SECRET_KEY")
    
    if not validate_signature(data, secret_key):
        return {"error": ClickErrors.SIGN_CHECK_FAILED, "error_note": "Invalid signature"}

    action = int(data.get("action", -1))
    if action != 0:
        return {"error": ClickErrors.ACTION_NOT_FOUND, "error_note": "Invalid action"}

    merchant_trans_id = data.get("merchant_trans_id")
    amount = float(data.get("amount", 0))
    click_trans_id = data.get("click_trans_id")

    payment = db.query(Payment).filter(Payment.id == merchant_trans_id).first()
    if not payment:
        return {"error": ClickErrors.TRANSACTION_NOT_FOUND, "error_note": "Payment not found"}

    if payment.status == PaymentStatus.APPROVED:
        return {"error": ClickErrors.ALREADY_PAID, "error_note": "Already paid"}

    if float(payment.amount) != amount:
        return {"error": ClickErrors.INVALID_AMOUNT, "error_note": "Amount mismatch"}

    payment.click_transaction_id = str(click_trans_id)
    payment.click_prepare_id = int(click_trans_id) if str(click_trans_id).isdigit() else 0
    payment.click_status = 0
    db.commit()

    return {
        "error": ClickErrors.SUCCESS,
        "error_note": "Success",
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_prepare_id": str(payment.id)
    }

@router.post("/complete")
async def click_complete(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    data = dict(form_data)
    
    secret_key = os.environ.get("CLICK_SECRET_KEY", "YOUR_SECRET_KEY")
    
    if not validate_signature(data, secret_key):
        return {"error": ClickErrors.SIGN_CHECK_FAILED, "error_note": "Invalid signature"}

    action = int(data.get("action", -1))
    if action != 1:
        return {"error": ClickErrors.ACTION_NOT_FOUND, "error_note": "Invalid action"}

    merchant_trans_id = data.get("merchant_trans_id")
    click_error = int(data.get("error", 0))
    error_note = data.get("error_note", "")
    click_trans_id = data.get("click_trans_id")

    payment = db.query(Payment).filter(Payment.id == merchant_trans_id).first()
    if not payment:
        return {"error": ClickErrors.TRANSACTION_NOT_FOUND, "error_note": "Payment not found"}

    if click_error < 0:
        payment.status = PaymentStatus.CANCELLED
        payment.click_status = click_error
        db.commit()
        return {
            "error": ClickErrors.TRANSACTION_CANCELLED,
            "error_note": "Payment cancelled by Click",
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id
        }

    if payment.status == PaymentStatus.APPROVED:
        return {
            "error": ClickErrors.SUCCESS,
            "error_note": "Already completed",
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": str(payment.id)
        }

    payment.status = PaymentStatus.APPROVED
    payment.click_status = 1
    payment.click_complete_time = int(time.time())
    db.commit()

    return {
        "error": ClickErrors.SUCCESS,
        "error_note": "Success",
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_confirm_id": str(payment.id)
    }
