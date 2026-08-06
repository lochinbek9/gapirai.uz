"""
Telegram notification service for feedback and system alerts.
Sends star ratings and comments to Telegram bot.
"""
import os
import logging
import httpx

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_telegram_feedback(
    job_id: str,
    video_title: str,
    rating: int,
    comment: str | None = None,
    chat_id: str | None = None,
) -> bool:
    """
    Dublyaj bahosi va fikrini Telegram bot orqali guruh/kanal/admin chatiga yuboradi.
    """
    token = settings.TELEGRAM_BOT_TOKEN or os.getenv("TELEGRAM_BOT_TOKEN", "7987651672:AAH5OXmkbjH0HIEUih7cywWO1KOCbrF2Zic")
    target_chat = chat_id or settings.TELEGRAM_CHAT_ID or os.getenv("TELEGRAM_CHAT_ID", "")

    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN sozlanmagan.")
        return False

    if not target_chat:
        logger.warning("TELEGRAM_CHAT_ID sozlanmagan — xabar yuborilmadi.")
        return False

    stars_str = "⭐" * rating
    comment_clean = comment.strip() if comment and comment.strip() else "Fikr qoldirilmadi"
    title_clean = video_title or "Noma'lum video"

    text = (
        f"⭐️ <b>YANGI FIKR VA BAHOLASH (Xadichai.uz)</b> ⭐️\n\n"
        f"📹 <b>Video</b>: {title_clean}\n"
        f"⭐ <b>Baho</b>: {stars_str} ({rating} / 5)\n"
        f"💬 <b>Fikr</b>: \"{comment_clean}\"\n\n"
        f"🆔 <b>Job ID</b>: <code>{job_id}</code>\n"
        f"🔗 <b>Havola</b>: https://xadichai.uz/video/{job_id}"
    )

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        res = httpx.post(url, json=payload, timeout=10.0)
        if res.status_code == 200:
            logger.info(f"Telegram feedback notification sent for job {job_id}")
            return True
        logger.warning(f"Telegram API response {res.status_code}: {res.text}")
    except Exception as exc:
        logger.error(f"Failed to send Telegram notification: {exc}")
    return False
