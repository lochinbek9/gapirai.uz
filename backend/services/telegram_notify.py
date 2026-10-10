"""Telegram'ga chiquvchi xabarlar -- botning o'zidan mustaqil, oddiy HTTP
so'rov (Telegram Bot API). backend/workers/tasks.py job yakunlanganda
(COMPLETED/FAILED) shu yerdan foydalanadi -- interaktiv bot jarayonining
o'zi ishlab turishi shart emas, faqat token kerak.
"""
import logging

import httpx

from backend.config import get_settings, telegram_api_base

logger = logging.getLogger(__name__)


def _api_url(method: str) -> str:
    settings = get_settings()
    # telegram_api_base(): mahalliy Bot API server sozlangan bo'lsa o'sha,
    # aks holda api.telegram.org -- bot mahalliy serverga ko'chgach bulut
    # 401 qaytaradi, shuning uchun bu chiquvchi xabar ham shu yerdan o'tishi shart.
    return f"{telegram_api_base()}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"


def send_telegram_message(chat_id: str, text: str, reply_markup: dict | None = None) -> bool:
    settings = get_settings()
    if not settings.TELEGRAM_BOT_TOKEN or not chat_id:
        return False
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        resp = httpx.post(
            _api_url("sendMessage"),
            json=payload,
            timeout=10,
        )
        if resp.status_code != 200:
            logger.warning(f"Telegram xabar yuborilmadi (chat_id={chat_id}): {resp.status_code} {resp.text[:200]}")
            return False
        return True
    except Exception as e:
        logger.error(f"Telegram xabar yuborishda xato (chat_id={chat_id}): {e}")
        return False


def send_error_to_admins(exc: Exception, context_msg: str = "") -> None:
    import traceback
    settings = get_settings()
    if not settings.ADMIN_TG_IDS:
        return
    
    admin_ids = [id.strip() for id in settings.ADMIN_TG_IDS.split(",") if id.strip()]
    if not admin_ids:
        return
        
    tb_str = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    
    # HTML tag escape
    import html
    tb_str = html.escape(tb_str)
    exc_name = html.escape(type(exc).__name__)
    exc_msg = html.escape(str(exc))
    context_msg = html.escape(context_msg)
    
    text = f"🚨 <b>Xatolik yuz berdi!</b>\n\n"
    if context_msg:
        text += f"<b>Context:</b> {context_msg}\n\n"
    text += f"<b>Exception:</b> {exc_name}: {exc_msg}\n\n"
    text += f"<b>Traceback:</b>\n<pre>{tb_str[:3000]}</pre>"
    
    for admin_id in admin_ids:
        send_telegram_message(admin_id, text)
