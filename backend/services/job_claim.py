"""DB-backed atomic claim/lease -- bitta job/tahlil bir vaqtning o'zida
IKKI worker'da faol qayta ishlanishini oldini oladi.

2026-08-26 auditda productionda LIVE kuzatilgan: bir xil task_id ikki xil
worker jarayonida BIR VAQTDA faol edi (biri redelivered=True bilan). Sabab
ikki qatlamda: Celery/Redis darajasida (acks_late + reject_on_worker_lost
o'chirilgan bo'lsa xabar qayta yetkazilishi mumkin) VA ilova darajasida
(recover_stuck_jobs() ham mustaqil ravishda o'sha task_id'ni qayta navbatga
qo'yishi mumkin) -- ikkalasi ham hech qanday o'zaro himoyasiz edi.

Nega Redis lock emas, DB claim: Redis SETNX/lock worker qulashi yoki
tarmoq uzilishi paytida yo'qolishi mumkin (xotira-ichi, task'ning o'zi
bilan bir xil manba emas) -- DB'dagi qator esa PostgreSQL'ning o'zi
tomonidan MVCC bilan tekshiriladi va barcha worker'lar (production-new +
worker-1..4) BITTA umumiy Postgres'ga ulanishi 2026-08-26 tasdiqlangan,
shuning uchun bu yerda haqiqiy, workerlar-aro umumiy holat.

Nega SELECT...FOR UPDATE emas: process_video/analyze_video_task soatlab
davom etishi mumkin va har bosqichda alohida commit() qiladi (checkpoint
arxitekturasi) -- butun vazifa davomida bitta tranzaksiyani ochiq saqlash
shu naqshni buzadi. Buning o'rniga: bitta atomik UPDATE...WHERE bilan
"claim token" yoziladi va tranzaksiya DARHOL commit qilinadi -- qulf
vazifaning butun umri davomida emas, faqat shu bitta so'rov paytida
ushlab turiladi.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional, Type

from sqlalchemy.orm import Session


def try_claim(db: Session, model: Type, row_id, lease_seconds: int, allow_reclaim: bool = False) -> Optional[str]:
    """Faol qayta ishlash uchun qatorni atomik claim qiladi.

    Muvaffaqiyatli bo'lsa yangi claim token qaytaradi -- chaqiruvchi shu
    token bilan keyinroq (muvaffaqiyat/xato/retry -- barcha yo'llarda)
    release_claim() chaqirishi SHART. Boshqa worker allaqachon muddati
    tugamagan claim'ga ega bo'lsa (va allow_reclaim=False bo'lsa) None
    qaytaradi -- bu XATO emas: chaqiruvchi buni "dublikat yetkazib berish"
    deb talqin qilib, xech narsa qilmasdan (qayta urinishsiz) chiqib
    ketishi kerak.

    allow_reclaim -- 2026-08-26 worker-loss audit: worker bola-jarayoni
    SIGKILL bilan o'lsa (OOM, deploy), uning `finally: release_claim()`
    bloki HECH QACHON ishlamaydi -- eski claim muddati tugagunча (soatlab)
    hech kim uni qayta claim qila olmasdi, garchi Celery'ning o'zi
    (task_reject_on_worker_lost=True) vazifani DARHOL qayta yetkazib
    bersa ham. Yechim: chaqiruvchi o'zining Celery yetkazilishi
    REDELIVERY ekanini bilsa (self.request.delivery_info['redelivered']),
    shuni shu yerga uzatadi -- shunda WHERE sharti muddati tugamagan
    claim'ni ham "band" deb hisoblamaydi.

    Xavfsizlik: bu FAQAT chindan HAM o'lgan claim'larni qamrab oladi.
    Celery/Kombu redelivered=True'ni FAQAT ikki holatda qo'yadi: (a)
    task_reject_on_worker_lost worker yo'qolganini aniqlagandan keyin,
    yoki (b) broker visibility_timeout tugagandan keyin. Ikkalasi ham
    FAQAT vazifa allaqachon o'lgan/tugagan bo'lishi mumkin bo'lgan
    paytda sodir bo'ladi -- bu loyihadagi HAR BIR vazifaning time_limit'i
    (process_video=8000s, analyze_video_task=2700s) broker
    visibility_timeout'idan (9000s) qat'iy kichik, shuning uchun Celery'ning
    o'zi HECH QACHON hali tirik/ishlab turgan vazifa uchun redelivered=True
    bermaydi -- shuning uchun bu yo'l orqali sog'lom, faol ishlayotgan
    claim hech qachon "o'g'irlanmaydi".

    Atomiklik (allow_reclaim=False, standart yo'l): bitta UPDATE...WHERE
    PostgreSQL'ning qator darajasidagi qulfiga tayanadi -- ikkita bir
    vaqtdagi chaqiruv tabiiy ravishda ketma-ketlashtiriladi (biri
    bloklanadi, ikkinchisi commit qilgach WHERE sharti qayta tekshiriladi
    va endi mos kelmaydi -- shuning uchun aynan shu ikkita bir vaqtdagi
    chaqiruvning faqat BITTASI rows_matched=1 oladi).

    Atomiklik (allow_reclaim=True): "muddati tugamagan HAR QANDAY claim"
    o'zi WHERE'da to'g'ridan-to'g'ri ifodalanadigan sobit shart EMAS
    (NULL/expired'dan farqli) -- shuning uchun avval joriy token
    O'QILADI, keyin ANIQ shu kuzatilgan qiymatga solishtirib (compare-
    and-swap) UPDATE qilinadi. Bu ham xuddi shu bir xil kafolatni beradi:
    ikkita chaqiruv bir xil eski token'ni ko'rgan bo'lsa ham, PostgreSQL
    ularni ketma-ketlashtiradi -- birinchisi token'ni o'zgartiradi,
    ikkinchisining WHERE sharti (eski token bilan solishtirish) endi mos
    kelmay qoladi. Tasodifiy 128-bitli token to'qnashuvi ehtimoli
    e'tiborga olinmaydigan darajada kichik, shuning uchun bu CAS
    haqiqatan HAM eksklyuziv.
    """
    token = uuid.uuid4().hex
    now = datetime.utcnow()
    expires_at = now + timedelta(seconds=lease_seconds)

    if allow_reclaim:
        row = db.query(model).filter(model.id == row_id).first()
        if row is None:
            return None
        observed_token = row.processing_claim_token
        token_matches = (
            model.processing_claim_token.is_(None)
            if observed_token is None
            else model.processing_claim_token == observed_token
        )
        rows_matched = (
            db.query(model)
            .filter(model.id == row_id, token_matches)
            .update(
                {"processing_claim_token": token, "processing_lease_expires_at": expires_at},
                synchronize_session=False,
            )
        )
    else:
        claim_free = (model.processing_claim_token.is_(None)) | (model.processing_lease_expires_at < now)
        rows_matched = (
            db.query(model)
            .filter(model.id == row_id, claim_free)
            .update(
                {"processing_claim_token": token, "processing_lease_expires_at": expires_at},
                synchronize_session=False,
            )
        )
    db.commit()
    return token if rows_matched == 1 else None


def release_claim(db: Session, model: Type, row_id, token: str) -> None:
    """Claim'ni bo'shatadi -- FAQAT shu aniq token hali ham egasi bo'lsa.

    Himoya: agar bu chaqiruv juda kech kelsa (masalan lease muddati
    allaqachon tugab, BOSHQA worker qayta claim qilgan bo'lsa), o'sha
    YANGI claim tasodifan bo'shatib yuborilmaydi -- faqat token mos
    kelgandagina qator o'zgaradi."""
    db.query(model).filter(
        model.id == row_id,
        model.processing_claim_token == token,
    ).update(
        {"processing_claim_token": None, "processing_lease_expires_at": None},
        synchronize_session=False,
    )
    db.commit()
