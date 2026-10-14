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


def send_error_to_admins(
    exc: Exception,
    context_msg: str = "",
    *,
    job_id: str | None = None,
    user_name: str | None = None,
    user_email_or_phone: str | None = None,
    video_title: str | None = None,
    video_url: str | None = None,
    stage: str | None = None,
) -> None:
    import traceback
    import html
    import re

    settings = get_settings()
    if not settings.ADMIN_TG_IDS:
        return
    
    admin_ids = [
        id.strip().strip('"').strip("'")
        for id in settings.ADMIN_TG_IDS.split(",")
        if id.strip().strip('"').strip("'")
    ]
    if not admin_ids:
        return

    # Extract job_id from context_msg if not explicitly provided
    if not job_id and context_msg:
        m = re.search(r"Job:\s*([0-9a-fA-F-]{36})", context_msg)
        if m:
            job_id = m.group(1)

    # Auto-resolve metadata from DB if job_id is present and info is missing
    if job_id and (not user_name or not video_title):
        try:
            from backend.models.database import SessionLocal, DubbingJob, User
            db = SessionLocal()
            try:
                db_job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
                if db_job:
                    if not video_title:
                        video_title = db_job.video_title or "Video"
                    if not video_url:
                        video_url = db_job.youtube_url
                    if not user_name and db_job.user_id:
                        db_user = db.query(User).filter(User.id == db_job.user_id).first()
                        if db_user:
                            user_name = db_user.name
                            if not user_email_or_phone:
                                user_email_or_phone = db_user.phone or db_user.email
            finally:
                db.close()
        except Exception:
            pass

    tb_str = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    tb_str = html.escape(tb_str)
    exc_name = html.escape(type(exc).__name__)
    exc_msg = html.escape(str(exc))

    lines = ["🚨 <b>Xatolik yuz berdi!</b>\n"]

    if user_name or user_email_or_phone:
        user_info = html.escape(user_name or "Noma'lum")
        if user_email_or_phone:
            user_info += f" (<code>{html.escape(user_email_or_phone)}</code>)"
        lines.append(f"👤 <b>Foydalanuvchi:</b> {user_info}")

    if video_title:
        lines.append(f"🎬 <b>Video:</b> {html.escape(video_title)}")

    if video_url:
        if video_url.startswith("http://") or video_url.startswith("https://"):
            lines.append(f"🔗 <b>Havola:</b> <a href=\"{html.escape(video_url)}\">{html.escape(video_url)}</a>")
        else:
            lines.append(f"📁 <b>Manba:</b> <code>{html.escape(video_url)}</code>")

    if stage:
        lines.append(f"📍 <b>Bosqich:</b> <code>{html.escape(stage)}</code>")
    elif context_msg:
        lines.append(f"<b>Context:</b> {html.escape(context_msg)}")

    lines.append(f"⚠️ <b>Xatolik:</b> <code>{exc_name}</code>: {exc_msg}\n")
    lines.append(f"<b>Traceback:</b>\n<pre>{tb_str[:2500]}</pre>")

    text = "\n".join(lines)

    for admin_id in admin_ids:
        send_telegram_message(admin_id, text)



def send_content_blocked_to_admins(
    *,
    video_url: str | None,
    video_title: str | None,
    category: str | None,
    reason: str | None,
    stage: str,
    user_id: str | None = None,
    user_name: str | None = None,
    user_email_or_phone: str | None = None,
    job_id: str | None = None,
) -> None:
    """Taqiqlangan (diniy, 18+, zo'ravonlik va h.k.) video aniqlanganda
    adminlarga tekshirish uchun video havolasi va sababini Telegram orqali yuboradi."""
    import html

    settings = get_settings()
    if not settings.ADMIN_TG_IDS:
        return

    admin_ids = [
        id.strip().strip('"').strip("'")
        for id in settings.ADMIN_TG_IDS.split(",")
        if id.strip().strip('"').strip("'")
    ]
    if not admin_ids:
        return

    category_names = {
        "religious_content": "Diniy kontent",
        "sexual_explicit": "18+ behayo / shahvoniy",
        "sexual_violence": "Jinsiy zo'ravonlik",
        "graphic_violence": "Shafqatsiz zo'ravonlik / Terrorizm",
        "sexual_minors": "Voyaga yetmaganlar xavfsizligi",
        "policy_violation": "Siyosat buzilishi",
    }
    cat_label = category_names.get(category, category or "Noma'lum")
    stage_label = "Sarlavha/tavsif (metadata)" if stage == "metadata" else "Videodagi nutq (transkript)"

    reply_markup = None
    if video_url and (video_url.startswith("http://") or video_url.startswith("https://")):
        video_link_html = f'<a href="{html.escape(video_url)}">{html.escape(video_url)}</a>'
        reply_markup = {
            "inline_keyboard": [
                [{"text": "🎬 Videoni ko'rish", "url": video_url}]
            ]
        }
    elif video_url:
        video_link_html = f'<code>{html.escape(video_url)}</code>'
    else:
        video_link_html = "<i>Fayl orqali yuklangan (havola mavjud emas)</i>"

    default_title = "Noma'lum"
    default_reason = "Ko'rsatilmagan"
    safe_title = html.escape(video_title or default_title)
    safe_reason = html.escape(reason or default_reason)
    lines = [
        "🛡 <b>Taqiqlangan kontent aniqlandi!</b>",
        "",
        f"🎬 <b>Video:</b> {safe_title}",
        f"🔗 <b>Havola:</b> {video_link_html}",
        f"🏷 <b>Kategoriya:</b> {html.escape(cat_label)} (<code>{html.escape(category or '')}</code>)",
        f"📍 <b>Bosqich:</b> {html.escape(stage_label)}",
        f"📝 <b>Sabab:</b> {safe_reason}",
    ]

    if job_id:
        lines.append(f"🆔 <b>Job ID:</b> <code>{html.escape(str(job_id))}</code>")

    if user_id or user_name or user_email_or_phone:
        user_parts = []
        if user_name:
            user_parts.append(html.escape(user_name))
        if user_email_or_phone:
            user_parts.append(f"({html.escape(user_email_or_phone)})")
        if user_id:
            user_parts.append(f"[ID: <code>{html.escape(str(user_id))}</code>]")
        lines.append(f"👤 <b>Foydalanuvchi:</b> {' '.join(user_parts)}")

    lines.append("")
    lines.append("<i>⚠️ Agar bu video soxta taqiq (false positive) bo'lsa, tekshirib ko'ring.</i>")

    text = "\n".join(lines)

    for admin_id in admin_ids:
        try:
            send_telegram_message(admin_id, text, reply_markup=reply_markup)
        except Exception as e:
            logger.error(f"Admin ({admin_id}) ga moderatsiya xabari yuborilmadi: {e}")
