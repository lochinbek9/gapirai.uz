from fastapi import APIRouter, Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
import time
from backend.models.database import get_db, DubbingJob, JobStatus, User
from backend.models.payment import Payment, PaymentStatus, PaymentProvider
from backend.services.click_service import (
    generate_payment_url, 
    validate_signature, 
    ClickErrors,
    calculate_price,
    normalize_uzs_amount,
)
from typing import Optional
from backend.services.auth import get_current_user, get_optional_user
from backend.config import get_settings
from backend.workers.tasks import process_video

router = APIRouter(prefix="/api/payments/click", tags=["click"])

class InitiatePaymentRequest(BaseModel):
    job_id: str

@router.post("/initiate")
async def initiate_payment(
    req: InitiatePaymentRequest,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user)
):
    settings = get_settings()
    job = db.query(DubbingJob).filter(DubbingJob.id == req.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job topilmadi.")

    if current_user:
        if not job.user_id:
            job.user_id = current_user.id
            db.commit()
        elif job.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sizda bu videoga ruxsat yo'q.")

    # duration is required to calculate price
    if not job.video_duration:
        raise HTTPException(status_code=400, detail="Video davomiyligi aniqlanmadi.")
    
    duration_minutes = job.video_duration / 60.0
    # User's first video is free: check if user has other jobs
    is_first_video = False
    if current_user:
        other_jobs_count = db.query(DubbingJob).filter(
            DubbingJob.user_id == current_user.id,
            DubbingJob.id != job.id
        ).count()
        is_first_video = (other_jobs_count == 0)

    amount = calculate_price(duration_minutes, is_first_video=is_first_video)

    if amount == 0:
        if job.status == JobStatus.AWAITING_PAYMENT:
            job.status = JobStatus.PENDING
            job.status_message = "Navbatga qo'shildi"
            db.commit()
            process_video.apply_async(args=[str(job.id)], task_id=str(job.id))
        return {"success": True, "message": "Bepul video. Ishlov berish boshlandi.", "amount": 0}

    # Check if already paid
    existing_approved = db.query(Payment).filter(
        Payment.job_id == job.id,
        Payment.status == PaymentStatus.APPROVED
    ).first()
    if existing_approved:
        return {"success": True, "message": "To'lov allaqachon amalga oshirilgan.", "amount": 0}

    # Find or create pending payment
    payment = db.query(Payment).filter(
        Payment.job_id == job.id,
        Payment.status == PaymentStatus.PENDING
    ).first()

    user_id_val = current_user.id if current_user else None

    if not payment:
        payment = Payment(
            user_id=user_id_val,
            job_id=job.id,
            amount=amount,
            provider=PaymentProvider.CLICK,
            status=PaymentStatus.PENDING,
            click_create_time=int(time.time())
        )
        db.add(payment)
        db.commit()
        db.refresh(payment)
    elif normalize_uzs_amount(payment.amount) != amount:
        payment.amount = amount
        payment.click_create_time = int(time.time())
        db.commit()
        db.refresh(payment)

    merchant_id = settings.CLICK_MERCHANT_ID or "56653"
    service_id = settings.CLICK_SERVICE_ID or "97933"
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    return_url = f"{frontend_url}/video/{job.id}"  # redirect back to video page

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
    
    settings = get_settings()
    secret_key = settings.CLICK_SECRET_KEY or "NiZx8zzFZsX"
    
    if not validate_signature(data, secret_key):
        return {"error": ClickErrors.SIGN_CHECK_FAILED, "error_note": "Invalid signature"}

    action = int(data.get("action", -1))
    if action != 0:
        return {"error": ClickErrors.ACTION_NOT_FOUND, "error_note": "Invalid action"}

    merchant_trans_id = data.get("merchant_trans_id")
    amount = normalize_uzs_amount(data.get("amount", 0))
    click_trans_id = data.get("click_trans_id")

    payment = db.query(Payment).filter(Payment.id == merchant_trans_id).first()
    if not payment:
        return {"error": ClickErrors.TRANSACTION_NOT_FOUND, "error_note": "Payment not found"}

    if payment.status == PaymentStatus.APPROVED:
        return {"error": ClickErrors.ALREADY_PAID, "error_note": "Already paid"}

    if normalize_uzs_amount(payment.amount) != amount:
        return {"error": ClickErrors.INVALID_AMOUNT, "error_note": "Amount mismatch"}

    payment.click_transaction_id = str(click_trans_id)
    payment.click_prepare_id = int(click_trans_id) if str(click_trans_id).isdigit() else 0
    payment.click_status = 0
    db.commit()

    import zlib
    prep_id = zlib.crc32(payment.id.bytes)
    click_trans_val = int(click_trans_id) if str(click_trans_id).isdigit() else 0

    return {
        "error": ClickErrors.SUCCESS,
        "error_note": "Success",
        "click_trans_id": click_trans_val,
        "merchant_trans_id": merchant_trans_id,
        "merchant_prepare_id": prep_id
    }


@router.post("/complete")
async def click_complete(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    data = dict(form_data)
    
    settings = get_settings()
    secret_key = settings.CLICK_SECRET_KEY or "NiZx8zzFZsX"
    
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
        
        # update job status too
        job = db.query(DubbingJob).filter(DubbingJob.id == payment.job_id).first()
        if job:
            job.status = JobStatus.FAILED
            job.error_message = f"To'lov bekor qilindi: {error_note}"
            
        db.commit()
        return {
            "error": ClickErrors.TRANSACTION_CANCELLED,
            "error_note": "Payment cancelled by Click",
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id
        }

    import zlib
    confirm_id = zlib.crc32(payment.id.bytes)
    click_trans_val = int(click_trans_id) if str(click_trans_id).isdigit() else 0

    if payment.status == PaymentStatus.APPROVED:
        return {
            "error": ClickErrors.SUCCESS,
            "error_note": "Already completed",
            "click_trans_id": click_trans_val,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": confirm_id
        }

    payment.status = PaymentStatus.APPROVED
    payment.click_status = 1
    payment.click_complete_time = int(time.time())

    # update job status and trigger processing
    job = db.query(DubbingJob).filter(DubbingJob.id == payment.job_id).first()
    if job:
        job.status = JobStatus.PENDING
        job.status_message = "To'lov tasdiqlandi. Dublyaj navbatga qo'shildi."
        process_video.apply_async(args=[str(job.id)], task_id=str(job.id))
        
    db.commit()

    return {
        "error": ClickErrors.SUCCESS,
        "error_note": "Success",
        "click_trans_id": click_trans_val,
        "merchant_trans_id": merchant_trans_id,
        "merchant_confirm_id": confirm_id
    }

