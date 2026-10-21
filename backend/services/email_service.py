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
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CODE_TTL_MINUTES = 10
RESEND_API_URL = "https://api.resend.com/emails"


def _send_smtp_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> bool:
    """SMTP (masalan Admin Gmail yoki boshqa SMTP server) orqali email yuborish."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP_USER yoki SMTP_PASSWORD sozlanmagan — xat yuborilmadi.")
        return False

    try:
        from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USER
        from_name = settings.SMTP_FROM_NAME or "GapirAI.uz"

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        if settings.SMTP_PORT == 465:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
        else:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            if settings.SMTP_USE_TLS:
                server.starttls()

        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()
        return True
    except Exception as e:
        logger.error(f"SMTP orqali email yuborishda xatolik ({to_email}): {e}")
        return False


# Kirish/ro'yxat/parol tiklash kodlari so'rov ICHIDA yuboriladi (auth_routes.py):
# Resend sekinlashsa so'rov oqimi shuncha band turadi, shuning uchun qisqa.
_OTP_EMAIL_TIMEOUT_S = 5


def generate_verification_code() -> str:
    return f"{random.randint(0, 999999):06d}"


def _send_code_email(to_email: str, code: str, name: str, subject: str, intro: str) -> bool:
    """Resend API orqali kodli emailni yuboradi (kirish tasdig'i yoki parolni tiklash)."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — kod yuborilmadi.")
        return False

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = (
        f"{greeting}\n\n"
        f"{intro}\n\n"
        f"    {code}\n\n"
        f"Bu kod {CODE_TTL_MINUTES} daqiqa davomida amal qiladi.\n"
        f"Agar bu so'rovni siz yubormagan bo'lsangiz, xabarni e'tiborsiz qoldiring.\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">{intro}</p>
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
        "subject": subject,
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
            timeout=_OTP_EMAIL_TIMEOUT_S,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi ({to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Tasdiqlash kodini yuborishda xatolik ({to_email}): {e}")
        return False


def send_verification_email(to_email: str, code: str, name: str = "") -> bool:
    """Ro'yxatdan o'tish/kirish tasdiqlash kodini yuboradi. Muvaffaqiyatli bo'lsa True qaytaradi."""
    return _send_code_email(
        to_email, code, name,
        subject=f"GapirAI.uz tasdiqlash kodi: {code}",
        intro="GapirAI.uz'ga kirish uchun tasdiqlash kodingiz:",
    )


def send_password_reset_email(to_email: str, code: str, name: str = "") -> bool:
    """Parolni tiklash kodini yuboradi. Muvaffaqiyatli bo'lsa True qaytaradi."""
    return _send_code_email(
        to_email, code, name,
        subject=f"GapirAI.uz parolni tiklash kodi: {code}",
        intro="Parolingizni tiklash uchun tasdiqlash kodingiz:",
    )


def send_dubbing_complete_email(to_email: str, name: str, video_title: str, job_id: str) -> bool:
    """Dublyaj tayyor bo'lganda foydalanuvchiga xabar yuboradi
    (backend/workers/tasks.py, job COMPLETED bo'lgandan so'ng)."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — dublyaj tayyor xabari yuborilmadi.")
        return False

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    video_url = f"https://gapirai.uz/video/{job_id}"
    text_body = (
        f"{greeting}\n\n"
        f"\"{video_title}\" videongizning o'zbekcha dublyaji tayyor!\n\n"
        f"Ko'rish/yuklab olish uchun: {video_url}\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">
        <strong>"{video_title}"</strong> videongizning o'zbekcha dublyaji tayyor!
      </p>
      <a href="{video_url}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px;margin:16px 0;">Ko'rish / yuklab olish</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": "Dublyaj tayyor!",
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi (dublyaj tayyor, {to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Dublyaj tayyor xabarini yuborishda xatolik ({to_email}): {e}")
        return False


def send_subtitles_complete_email(to_email: str, name: str, video_title: str, job_id: str) -> bool:
    """Subtitr tayyor bo'lganda foydalanuvchiga xabar yuboradi."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — subtitr tayyor xabari yuborilmadi.")
        return False

    frontend_url = (getattr(settings, "FRONTEND_URL", None) or "https://gapirai.uz").rstrip("/")
    video_url = f"{frontend_url}/video/{job_id}"
    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = (
        f"{greeting}\n\n"
        f"\"{video_title}\" videongizning o'zbekcha subtitrlari tayyor!\n\n"
        f"Ko'rish/yuklab olish uchun: {video_url}\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">
        <strong>"{video_title}"</strong> videongizning o'zbekcha subtitrlari tayyor!
      </p>
      <a href="{video_url}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px;margin:16px 0;">Subtitrlarni ko'rish / yuklab olish</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": "Subtitr tayyor!",
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi (subtitr tayyor, {to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Subtitr tayyor xabarini yuborishda xatolik ({to_email}): {e}")
        return False


def send_analysis_complete_email(to_email: str, name: str, video_title: str, analysis_id: str) -> bool:
    """Video tahlil tayyor bo'lganda foydalanuvchiga xabar yuboradi."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — tahlil tayyor xabari yuborilmadi.")
        return False

    frontend_url = (getattr(settings, "FRONTEND_URL", None) or "https://gapirai.uz").rstrip("/")
    analysis_url = f"{frontend_url}/learn/{analysis_id}"
    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = (
        f"{greeting}\n\n"
        f"\"{video_title}\" videongizning chuqur AI tahlili, boblari va konspekti tayyor!\n\n"
        f"Tahlilni ochish: {analysis_url}\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">
        <strong>"{video_title}"</strong> videongizning chuqur AI tahlili, konspekti va boblari tayyor!
      </p>
      <a href="{analysis_url}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px;margin:16px 0;">Tahlilni ko'rish</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": "Video tahlili tayyor!",
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi (tahlil tayyor, {to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Tahlil tayyor xabarini yuborishda xatolik ({to_email}): {e}")
        return False


def send_subscription_reminder_email(to_email: str, name: str, plan_name: str, expires_at_str: str) -> bool:
    """Tarif obunasi 3 kundan keyin tugashi haqida eslatma yuboradi
    (backend/scripts/subscription_reminders.py — kunlik cron)."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — obuna eslatmasi yuborilmadi.")
        return False

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = (
        f"{greeting}\n\n"
        f"\"{plan_name}\" tarifingiz {expires_at_str} sanasida tugaydi. "
        f"Xizmatdan uzluksiz foydalanish uchun gapirai.uz/dashboard sahifasida tarifni yangilang.\n\n"
        f"GapirAI.uz jamoasi"
    )
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      <p style="color:#334155;font-size:14px;">
        <strong>{plan_name}</strong> tarifingiz <strong>{expires_at_str}</strong> sanasida tugaydi.
        Xizmatdan uzluksiz foydalanish uchun tarifni yangilang.
      </p>
      <a href="https://gapirai.uz/dashboard" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px;margin:16px 0;">Tarifni yangilash</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": f"Tarifingiz {expires_at_str} sanasida tugaydi",
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi (obuna eslatmasi, {to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Obuna eslatmasini yuborishda xatolik ({to_email}): {e}")
        return False


def send_billing_email(to_email: str, name: str, subject: str, body_lines: list[str],
                       cta_text: str = "Dashboard", cta_url: str = "https://gapirai.uz/dashboard") -> bool:
    """Avtomatik to'lov bildirishnomalari — obuna uzaytirildi / to'lov
    muvaffaqiyatsiz / tarif FREE'ga tushirildi / daqiqa avtomatik to'ldirildi
    (backend/services/recurring.py)."""
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY sozlanmagan — billing email yuborilmadi.")
        return False

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    text_body = greeting + "\n\n" + "\n".join(body_lines) + f"\n\n{cta_text}: {cta_url}\n\nGapirAI.uz jamoasi"
    html_lines = "".join(f'<p style="color:#334155;font-size:14px;">{ln}</p>' for ln in body_lines)
    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#1e293b;margin:0 0 16px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      <p style="color:#334155;font-size:14px;">{greeting}</p>
      {html_lines}
      <a href="{cta_url}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#6366f1,#0ea5e9);color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:12px;margin:16px 0;">{cta_text}</a>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">GapirAI.uz jamoasi</p>
    </div>
    """
    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
                "to": [to_email],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            },
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend xatoligi (billing, {to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Billing email yuborishda xatolik ({to_email}): {e}")
        return False


def send_broadcast_email(
    to_email: str,
    name: str,
    subject: str,
    message_text: str,
    button_text: str | None = None,
    button_url: str | None = None,
) -> bool:
    """Admin ommaviy xabarnomalarini (broadcast) foydalanuvchiga yuborish.
    Agar SMTP_ENABLED bo'lsa yoki SMTP_USER va SMTP_PASSWORD berilgan bo'lsa (masalan Admin Gmail),
    to'g'ridan-to'g'ri SMTP orqali jo'natadi. Aks holda Resend API orqali jo'natadi."""
    import html as html_lib

    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    safe_message = html_lib.escape(message_text).replace("\n", "<br/>")

    button_html = ""
    if button_text and button_url:
        button_html = f"""
        <div style="margin:28px 0 16px;">
          <a href="{html_lib.escape(button_url)}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:12px;box-shadow:0 4px 12px rgba(124,58,237,0.25);">{html_lib.escape(button_text)}</a>
        </div>
        """

    html_body = f"""
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:540px;margin:0 auto;padding:32px 24px;background-color:#ffffff;border-radius:16px;border:1px solid #e2e8f0;">
      <div style="margin-bottom:20px;">
        <h2 style="color:#0f172a;margin:0;font-size:22px;font-weight:800;letter-spacing:-0.5px;">GapirAI<span style="color:#7c3aed;">.uz</span></h2>
      </div>
      <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px;font-weight:600;">{html_lib.escape(greeting)}</p>
      <div style="color:#1e293b;font-size:15px;line-height:1.7;margin:16px 0;">
        {safe_message}
      </div>
      {button_html}
      <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 16px 0;" />
      <p style="color:#94a3b8;font-size:11px;margin:0;line-height:1.5;">Ushbu xabar GapirAI.uz platformasi foydalanuvchilariga yuborildi. Savollaringiz bo'lsa, @gapirai_support botiga murojaat qiling.</p>
    </div>
    """

    text_body = f"{greeting}\n\n{message_text}"
    if button_text and button_url:
        text_body += f"\n\n{button_text}: {button_url}"
    text_body += "\n\nGapirAI.uz jamoasi"

    # 1. Agar SMTP sozlangan bo'lsa (masalan Admin Gmail)
    if settings.SMTP_ENABLED or (settings.SMTP_USER and settings.SMTP_PASSWORD):
        return _send_smtp_email(to_email, subject, text_body, html_body)

    # 2. Resend API orqali
    if not settings.RESEND_API_KEY:
        logger.warning("Na SMTP, na RESEND_API_KEY sozlanmagan — broadcast email yuborilmadi.")
        return False

    payload = {
        "from": f"{settings.RESEND_FROM_NAME} <{settings.RESEND_FROM_EMAIL}>",
        "to": [to_email],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
        if response.status_code in (200, 201):
            return True
        logger.error(f"Resend broadcast xatosi ({to_email}): {response.status_code} {response.text[:300]}")
        return False
    except Exception as e:
        logger.error(f"Broadcast email yuborishda xatolik ({to_email}): {e}")
        return False

