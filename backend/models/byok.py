"""BYOK (o'z kaliting): egasining shaxsiy AI kalitlari, bazada faqat shifrlangan holda."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID

from backend.models.database import Base


class ByokSetting(Base):
    __tablename__ = "byok_settings"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    enabled = Column(Boolean, nullable=False, default=False)
    gemini_keys = Column(Text, nullable=True)  # Fernet shifrlangan, har qatorda bitta kalit
    groq_keys = Column(Text, nullable=True)
    gapi_keys = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
