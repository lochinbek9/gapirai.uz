"""To'lov muvaffaqiyatli tasdiqlangandan keyin bajariladigan yagona mantiq --
Click (click_routes.py) va Payme (payme_routes.py) ikkalasi ham shu yerdan
foydalanadi, ikki joyda saqlanmaydi (2026-08-19, Payme integratsiyasi
qo'shilganda click_routes.py'dan ajratib olindi)."""
import logging
from datetime import datetime

from backend.models.database import DubbingJob, JobStatus
from backend.workers.tasks import process_video

logger = logging.getLogger(__name__)


def apply_successful_payment(db, payment) -> None:
    """payment.status allaqachon APPROVED qilib qo'yilgan bo'lishi kerak --
    bu funksiya faqat SHU to'lov nimaga tegishli ekaniga qarab (donat /
    obuna / job / daqiqa paketi) tegishli holatni faollashtiradi.

    IDEMPOTENT: fulfilled_at o'rnatilgan bo'lsa darhol qaytadi. Avtomatik
    (karta tokeni) to'lovlarda fulfillment ikki yo'ldan kelishi mumkin —
    provayder webhook'i (click /complete, payme PerformTransaction) VA
    recurring.charge() ichidagi to'g'ridan-to'g'ri chaqiruv — qaysi biri
    oldin ishlasa, ikkinchisi shu bayroq tufayli hech narsa qilmaydi
    (aks holda daqiqa/obuna ikki marta kreditlanardi)."""
    if getattr(payment, "fulfilled_at", None):
        return

    if getattr(payment, "is_donation", False):
        # Donat -- yetkaziladigan narsa yo'q. Faqat qayd etamiz va (email
        # bo'lsa) rahmat xabari yuboramiz. Xabar yuborilmasa ham donat
        # bekor bo'lmaydi (fail-open).
        logger.info(f"Donat tasdiqlandi: payment={payment.id} amount={payment.amount} donor={payment.donor_name or 'anonim'}")
        if payment.donor_email:
            try:
                from backend.services.email_service import send_billing_email
                send_billing_email(
                    to_email=payment.donor_email,
                    name=payment.donor_name or "",
                    subject="Rahmat! Loyihani qo'llab-quvvatlaganingiz uchun",
                    body_lines=[
                        f"GapirAI.uz loyihasiga {int(payment.amount):,} so'm hissa qo'shganingiz uchun katta rahmat.".replace(",", " "),
                        "Sizning yordamingiz videolarni ko'proq odamga, tezroq yetkazishga imkon beradi.",
                    ],
                    cta_text="Saytga o'tish",
                    cta_url="https://gapirai.uz",
                )
            except Exception as e:
                logger.warning(f"Donat rahmat xabari yuborilmadi payment={payment.id}: {e}")
    elif payment.minutes_purchased:
        # 2026-08-31: daqiqa paketi xaridi -> Subscription.purchased_minutes'ga
        # qo'shiladi (hech qachon tugamaydi). Provayder webhooklari (click_complete,
        # payme PerformTransaction, uzum confirm, paynet perform) hammasi shu
        # yerga keladi -- alohida fulfillment kodi kerak emas.
        from backend.services.plans import add_purchased_minutes
        add_purchased_minutes(db, payment.user_id, int(payment.minutes_purchased))
    elif payment.plan:
        from backend.services.plans import activate_subscription
        activate_subscription(db, payment.user_id, payment.plan)
    else:
        job = db.query(DubbingJob).filter(DubbingJob.id == payment.job_id).first()
        if job:
            if job.source_job_id:
                # Kesh-hit job -- qayta ishlov shart emas, natija allaqachon
                # asl job'da tayyor (backend/services/job_creation.py).
                job.status = JobStatus.COMPLETED
                job.status_message = "Dublyaj tayyor!"
                job.completed_at = datetime.utcnow()
            else:
                job.status = JobStatus.PENDING
                job.status_message = "To'lov tasdiqlandi. Dublyaj navbatga qo'shildi."
                from backend.services.plans import get_job_queue_v2
                _dur = (job.video_duration or 0) / 60.0
                process_video.apply_async(args=[str(job.id)], task_id=str(job.id), queue=get_job_queue_v2(db, payment.user_id, _dur))

    payment.fulfilled_at = datetime.utcnow()
    db.commit()
