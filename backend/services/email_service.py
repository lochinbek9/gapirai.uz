"""
Email Service — tasdiqlash kodlarini Resend API orqali yuborish (ro'yxatdan
o'tish va kirish uchun 2 bosqichli tasdiqlash).

Gmail SMTP dastlab ishlatilgan edi, lekin oddiy shaxsiy Gmail hisobidan
avtomatik yuborilgan xatlar Google'ning spam filtriga tushib qolgani
sababli, gapirai.uz domenida SPF/DKIM tasdiqlangan Resend'ga o'tkazildi.
"""
import random
import logging
import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CODE_TTL_MINUTES = 10
RESEND_API_URL = "https://api.resend.com/emails"


def generate_verification_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def send_verification_email(to_email: str, code: str, name: str = "") -> bool:
    """Resend API orqali tasdiqlash kodini yuboradi. Muvaffaqiyatli bo'lsa True qaytaradi."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — kod yuborilmadi.")
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

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": f"GapirAI.uz tasdiqlash kodi: {code}",
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi ({to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Tasdiqlash kodini yuborishda xatolik ({to_email}): {e}")
        return False
