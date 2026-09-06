from sqlalchemy import Column, String, Float, DateTime, Enum, ForeignKey, Integer, BigInteger, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
import enum
from datetime import datetime
from backend.models.database import Base

class PaymentStatus(str, enum.Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    CANCELLED = "Cancelled"

class PaymentProvider(str, enum.Enum):
    CLICK = "click"
    PAYME = "payme"
    PAYNET = "paynet"
    UZUM = "uzum"
    MANUAL = "manual"


class PaymentCard(Base):
    """Foydalanuvchining avtomatik to'lov uchun bog'langan kartasi. DIQQAT:
    bu yerda karta raqami (PAN) yoki CVV HECH QACHON saqlanmaydi — faqat
    provayder (Click/Payme) bergan qayta ishlatiladigan token va niqoblangan
    raqam. Karta raqami foydalanuvchi formasidan to'g'ridan-to'g'ri provayder
    API'siga (TLS) yuboriladi, bazaga yozilmaydi.

    Oqim: bind (POST card_token/request yoki cards.create) -> provayder
    egasining telefoniga SMS kod yuboradi -> verify (sms_code) -> is_active=True.
    Keyin charge (card_token/payment yoki receipts.pay) — provayder o'zining
    webhook'ini (click /complete, payme PerformTransaction) chaqiradi, shu
    orqali backend/services/payment_fulfillment.py ishga tushadi.
    """
    __tablename__ = "payment_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String(20), nullable=False)  # "click" | "payme"
    token = Column(String, nullable=False)
    card_mask = Column(String(30), nullable=True)
    card_type = Column(String(20), nullable=True)   # "uzcard" | "humo"
    expire = Column(String(5), nullable=True)        # "MM/YY" — faqat ma'lumot uchun
    phone_hint = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=False, nullable=False)   # SMS tasdiqdan keyin
    is_default = Column(Boolean, default=False, nullable=False)
    consent_at = Column(DateTime, nullable=True)     # avtomatik yechishga rozilik vaqti
    last_charged_at = Column(DateTime, nullable=True)
    last_error = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("dubbing_jobs.id"), nullable=True) # Linked to a video dubbing job
    plan = Column(String(20), nullable=True)  # "standard" | "pro" — set instead of job_id for a subscription renewal payment
    is_library_access = Column(Boolean, default=False, nullable=False)  # 2026-08-19: Ommaviy videolar kutubxonasiga bir martalik kirish to'lovi -- job_id/plan ikkalasi ham bo'sh
    # 2026-08-31: minute-pack xaridi -- paket hajmi (daqiqa: 30/60/120/300).
    # job_id / plan / is_library_access o'rniga o'rnatiladi. To'lov tasdiqlangach
    # backend/services/payment_fulfillment.py Subscription.purchased_minutes'ga qo'shadi.
    minutes_purchased = Column(Integer, nullable=True)
    amount = Column(Float, nullable=False)
    provider = Column(Enum(PaymentProvider), default=PaymentProvider.CLICK)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING)

    # 2026-09-03: avtomatik to'lov. card_id — qaysi bog'langan karta bilan
    # yechilgani; is_auto — foydalanuvchi aralashuvisiz (auto-renew yoki
    # auto top-up) amalga oshirilgani. fulfilled_at — apply_successful_payment()
    # bir martadan ortiq bajarilmasligi kafolati (webhook + to'g'ridan-to'g'ri
    # API javobi poygaga kirsa).
    card_id = Column(UUID(as_uuid=True), ForeignKey("payment_cards.id"), nullable=True)
    is_auto = Column(Boolean, default=False, nullable=False)
    fulfilled_at = Column(DateTime, nullable=True)

    # 2026-09-05: loyihaga ixtiyoriy donat (qo'llab-quvvatlash). job_id/plan/
    # is_library_access/minutes_purchased ning hech biri o'rnatilmaydi.
    # user_id ham NULL bo'lishi mumkin (login shart emas) -- donor o'zini
    # ixtiyoriy tanishtiradi. Fulfillment yetkaziladigan narsa yo'q, faqat
    # fulfilled_at + rahmat xabari (backend/services/payment_fulfillment.py).
    is_donation = Column(Boolean, default=False, nullable=False)
    donor_name = Column(String(120), nullable=True)
    donor_email = Column(String(255), nullable=True)
    donor_message = Column(String(500), nullable=True)

    click_transaction_id = Column(String, index=True)
    click_prepare_id = Column(BigInteger)
    click_status = Column(Integer)
    click_create_time = Column(Integer)
    click_complete_time = Column(Integer)

    # Payme (Paycom) Merchant API (backend/api/payme_routes.py) -- Payme
    # o'zining "id"si orqali tranzaksiyani kuzatadi (CreateTransaction'da
    # beriladi, keyingi Perform/Cancel/Check so'rovlarida shu orqali
    # qidiriladi). payme_state Payme'ning holat mashinasi: 1=yaratilgan,
    # 2=tasdiqlangan, -1=tasdiqlanmasdan bekor qilingan, -2=tasdiqlangandan
    # keyin bekor qilingan.
    payme_transaction_id = Column(String, index=True, nullable=True)
    payme_state = Column(Integer, nullable=True)
    payme_create_time = Column(BigInteger, nullable=True)
    payme_perform_time = Column(BigInteger, nullable=True)
    payme_cancel_time = Column(BigInteger, nullable=True)
    payme_cancel_reason = Column(Integer, nullable=True)
    # 2026-08-19: pullik job 5 marta urinib ham muvaffaqiyatsiz tugasa
    # (backend/workers/tasks.py) shu bayroq true qilinadi -- Click orqali
    # avtomatik pul qaytarish integratsiyasi yo'q, shuning uchun admin panelda
    # ko'rsatilib, qo'lda qaytariladi.
    needs_refund = Column(Boolean, default=False, nullable=False)

    # Paynet (UZPAYNET) Universal Web-Service -- JSON-RPC 2.0, Basic Auth
    # (backend/api/paynet_routes.py). transactionId Paynet tomonidan
    # PerformTransaction so'rovida beriladi -- Payme'dan farqli, alohida
    # Create bosqichi yo'q, PerformTransaction bir zumda yaratadi va
    # tasdiqlaydi. providerTrnId (raqamli, Paynet'ga qaytariladigan) esa
    # payment.id'dan CRC32 orqali hisoblanadi (paynet_service.provider_trn_id),
    # alohida ustun sifatida saqlanmaydi.
    paynet_transaction_id = Column(BigInteger, index=True, nullable=True)
    paynet_perform_time = Column(DateTime, nullable=True)
    paynet_cancel_time = Column(DateTime, nullable=True)

    # Uzum Bank Merchant webhook (backend/api/uzum_routes.py) -- RASMIY
    # spetsifikatsiya (developer.uzumbank.uz/merchant, 2026-08-20).
    # uzum_account_id -- Uzum'ning "account" maydoni oddiy RAQAM ko'rinishida
    # keladi (Payment.id UUID emas), shuning uchun Click'dagi crc32 naqshi
    # bilan hisoblanadi va SAQLANADI (indekslangan qidiruv uchun).
    # uzum_transaction_id -- Uzum'ning "transId" (UUID-shaklidagi string).
    uzum_account_id = Column(BigInteger, index=True, nullable=True)
    uzum_transaction_id = Column(String, index=True, nullable=True)
    uzum_create_time = Column(DateTime, nullable=True)
    uzum_confirm_time = Column(DateTime, nullable=True)
    uzum_cancel_time = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    job = relationship("DubbingJob")
