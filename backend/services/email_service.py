"""
Email Service — tasdiqlash kodlarini SMTP orqali yuborish (ro'yxatdan
o'tish va kirish uchun 2 bosqichli tasdiqlash).
"""
import random
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CODE_TTL_MINUTES = 10


def generate_verification_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def send_verification_email(to_email: str, code: str, name: str = "") -> bool:
    """SMTP orqali tasdiqlash kodini yuboradi. Muvaffaqiyatli bo'lsa True qaytaradi."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP sozlanmagan (SMTP_USER/SMTP_PASSWORD bo'sh) — kod yuborilmadi.")
        return False

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = (
        f"{greeting}\n\n"
        f"GapirAI.uz'ga kirish uchun tasdiqlash kodingiz:\n\n"
        f"    {code}\n\n"
        f"Bu kod {CODE_TTL_MINUTES} daqiqa davomida amal qiladi.\n"
        f"Agar bu so'rovni siz yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">GapirAI.uz'ga kirish uchun tasdiqlash kodingiz:</p>
      <div style="background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;padding:20px;border-radius:16px;margin:20px 0;">
        {code}
      </div>
      <p style="color:#64748b;font-size:12px;">Bu kod {CODE_TTL_MINUTES} daqiqa davomida amal qiladi. Agar bu so'rovni siz yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL or settings.SMTP_USER}>"
    msg["To"] = to_email
    msg["Subject"] = f"GapirAI.uz tasdiqlash kodi: {code}"
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [to_email], msg.as_string())
        return True
    except Exception as e:
        logger.error(f"Tasdiqlash kodini yuborishda xatolik ({to_email}): {e}")
        return False
