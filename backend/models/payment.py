from sqlalchemy import Column, String, Float, DateTime, Enum, ForeignKey, Integer, BigInteger
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
    MANUAL = "manual"

class Payment(Base):
    __tablename__ = "payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    job_id = Column(UUID(as_uuid=True), ForeignKey("dubbing_jobs.id"), nullable=True) # Linked to a video dubbing job
    amount = Column(Float, nullable=False)
    provider = Column(Enum(PaymentProvider), default=PaymentProvider.CLICK)
    status = Column(Enum(PaymentStatus), default=PaymentStatus.PENDING)
    
    click_transaction_id = Column(String, index=True)
    click_prepare_id = Column(BigInteger)
    click_status = Column(Integer)
    click_create_time = Column(Integer)
    click_complete_time = Column(Integer)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User")
    job = relationship("DubbingJob")
