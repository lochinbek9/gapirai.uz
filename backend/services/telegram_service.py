"""
Telegram notification service for feedback and system alerts.
Sends star ratings and comments to Telegram bot.
"""
import os
import logging
import httpx

from backend.config import get_settings, telegram_api_base

logger = logging.getLogger(__name__)
settings = get_settings()


def _format_ok(label: str, value: bool | None) -> str | None:
    if value is None:
        return None
    return f"{'✅' if value else '❌'} <b>{label}</b>: {'Yaxshi' if value else 'Yomon'}"


def send_telegram_feedback(
    job_id: str | None = None,
    video_title: str | None = None,
    rating: int | None = None,
    comment: str | None = None,
    chat_id: str | None = None,
    voice_ok: bool | None = None,
    translation_ok: bool | None = None,
    speed_ok: bool | None = None,
    user_name: str | None = None,
    user_email: str | None = None,
    user_phone: str | None = None,
    created_at_str: str | None = None,
) -> bool:
    """
    Dublyaj bahosi va foydalanuvchi fikrini Telegram bot orqali guruh/kanal/admin chatiga yuboradi.
    Foydalanuvchi ma'lumotlari (ism, email/telefon) bilan birga yuboriladi (Job ID va havola chiqarilmaydi).
    """
    import html

    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN", "")
    target_chat = chat_id or settings.TELEGRAM_FEEDBACK_CHANNEL_ID or settings.TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID", "") or "-1003827197120"

    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN sozlanmagan.")
        return False

    if not target_chat:
        logger.warning("TELEGRAM_CHAT_ID sozlanmagan — xabar yuborilmadi.")
        return False

    name_clean = html.escape(user_name.strip()) if user_name and user_name.strip() else "Anonim foydalanuvchi"
    user_lines = [f"👤 <b>Foydalanuvchi</b>: {name_clean}"]
    if user_email and user_email.strip():
        user_lines.append(f"📧 <b>Email</b>: {html.escape(user_email.strip())}")
    if user_phone and user_phone.strip():
        user_lines.append(f"📞 <b>Telefon</b>: {html.escape(user_phone.strip())}")
    user_block = "\n".join(user_lines)

    stars_str = ("⭐" * rating + f" ({rating} / 5)") if rating else "Baholanmagan"
    comment_clean = html.escape(comment.strip()) if comment and comment.strip() else "Fikr qoldirilmadi"
    title_clean = html.escape(video_title.strip()) if video_title and video_title.strip() else "Noma'lum video"

    detail_lines = [
        line for line in (
            _format_ok("Ovoz sifati", voice_ok),
            _format_ok("Tarjima sifati", translation_ok),
            _format_ok("Tezlik", speed_ok),
        ) if line
    ]
    details_block = ("\n" + "\n".join(detail_lines) + "\n") if detail_lines else ""
    date_line = f"\n🕒 <b>Sana</b>: {html.escape(created_at_str)}" if created_at_str else ""

    text = (
        f"⭐️ <b>YANGI FIKR VA BAHOLASH (GapirAI.uz)</b> ⭐️\n\n"
        f"{user_block}\n"
        f"📹 <b>Video</b>: {title_clean}\n"
        f"⭐ <b>Baho</b>: {stars_str}\n"
        f"{details_block}"
        f"💬 <b>Fikr</b>: \"{comment_clean}\""
        f"{date_line}"
    )

    url = f"{telegram_api_base()}/bot{token}/sendMessage"
    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    fallback_chat = "-1003827197120"
    try:
        res = httpx.post(url, json=payload, timeout=10.0)
        if res.status_code == 200:
            logger.info(f"Telegram feedback notification sent for user {name_clean}")
            return True
        logger.warning(f"Telegram API response {res.status_code}: {res.text}")
        if str(target_chat) != fallback_chat:
            payload["chat_id"] = fallback_chat
            fb_res = httpx.post(url, json=payload, timeout=10.0)
            if fb_res.status_code == 200:
                logger.info(f"Telegram feedback sent to fallback chat {fallback_chat}")
                return True
    except Exception as exc:
        logger.error(f"Failed to send Telegram notification: {exc}")
    return False


def send_telegram_platform_feedback(
    message: str,
    rating: int | None = None,
    user_email: str | None = None,
) -> bool:
    """
    Saytga umumiy (biror videoga bog'liq bo'lmagan) fikr-mulohaza — istalgan
    tashrif buyuruvchi qoldirishi mumkin bo'lgan "Platforma haqida fikringiz"
    formasi orqali kelgan xabarni Telegram guruh/kanal/admin chatiga yuboradi.
    """
    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN", "")
    target_chat = settings.TELEGRAM_FEEDBACK_CHANNEL_ID or settings.TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID", "") or "-1004431243067"

    if not token or not target_chat:
        logger.warning("TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan — platforma fikri yuborilmadi.")
        return False

    rating_line = f"⭐ <b>Baho</b>: {'⭐' * rating} ({rating} / 5)\n" if rating else ""
    user_line = f"👤 <b>Foydalanuvchi</b>: {user_email}\n" if user_email else "👤 <b>Foydalanuvchi</b>: Anonim\n"

    text = (
        f"💬 <b>PLATFORMA HAQIDA FIKR (GapirAI.uz)</b> 💬\n\n"
        f"{rating_line}"
        f"{user_line}"
        f"📝 <b>Xabar</b>: \"{message.strip()}\""
    )

    url = f"{telegram_api_base()}/bot{token}/sendMessage"
    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    fallback_chat = "-1003827197120"
    try:
        res = httpx.post(url, json=payload, timeout=10.0)
        if res.status_code == 200:
            logger.info("Telegram platform feedback notification sent")
            return True
        logger.warning(f"Telegram API response {res.status_code}: {res.text}")
        if str(target_chat) != fallback_chat:
            payload["chat_id"] = fallback_chat
            fb_res = httpx.post(url, json=payload, timeout=10.0)
            if fb_res.status_code == 200:
                logger.info(f"Telegram platform feedback sent to fallback chat {fallback_chat}")
                return True
    except Exception as exc:
        logger.error(f"Failed to send Telegram platform feedback notification: {exc}")
    return False
