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


def should_throttle_alert(alert_key: str, throttle_seconds: int = 600) -> bool:
    """Tekshiradi: agar shu alert_key so'nggi `throttle_seconds` soniya ichida
    allaqachon yuborilgan bo'lsa True qaytaradi (adminlarni spam qilmaslik uchun).
    Aks holda Redis kalitini belgilab False qaytaradi."""
    if not alert_key:
        return False
    try:
        from redis import Redis
        settings = get_settings()
        redis_url = getattr(settings, "REDIS_URL", None)
        if not redis_url or not isinstance(redis_url, str):
            return False
        r = Redis.from_url(redis_url, decode_responses=True, socket_timeout=3)
        key = f"alert_throttle:{alert_key}"
        # set nx=True returns True if key was set, None if key already exists
        is_new = r.set(key, "1", ex=throttle_seconds, nx=True)
        return not bool(is_new)
    except Exception as e:
        logger.debug(f"Alert throttle tekshirishda xatolik (e'tiborsiz qoldirildi): {e}")
        return False


# Ushbu admin ID ga xatoliklar va alertlar bormasin (faqat 557407324 ga borsa yetadi):
EXCLUDED_ADMIN_TG_IDS = {"1758736133"}


def get_admin_tg_ids(exclude_blocked: bool = True) -> list[str]:
    """Admin Telegram ID lar ro'yxatini qaytaradi."""
    settings = get_settings()
    if not settings.ADMIN_TG_IDS:
        return []
    ids = []
    for raw_id in str(settings.ADMIN_TG_IDS).split(","):
        clean_id = raw_id.strip().strip('"').strip("'")
        if not clean_id:
            continue
        if exclude_blocked and clean_id in EXCLUDED_ADMIN_TG_IDS:
            continue
        ids.append(clean_id)
    return ids


def send_alert_to_admins(
    text: str,
    *,
    alert_key: str | None = None,
    throttle_seconds: int = 600,
    reply_markup: dict | None = None,
) -> bool:
    """Barcha adminlarga tezkor ogohlantirish xabarini yuboradi.
    Agar `alert_key` ko'rsatilgan bo'lsa, xabarlar takrorlanishidan (spam)
    saqlash uchun `throttle_seconds` oralig'ida faqat bir marta yuboriladi."""
    if alert_key and should_throttle_alert(alert_key, throttle_seconds):
        logger.info(f"Admin ogohlantirishi cheklandi (throttled): {alert_key}")
        return False

    admin_ids = get_admin_tg_ids(exclude_blocked=True)
    if not admin_ids:
        return False

    success = False
    for admin_id in admin_ids:
        try:
            if send_telegram_message(admin_id, text, reply_markup=reply_markup):
                success = True
        except Exception as e:
            logger.error(f"Admin ({admin_id}) ga ogohlantirish yuborilmadi: {e}")

    return success


def save_error_log(
    error_id: str,
    exc: Exception,
    *,
    context_msg: str = "",
    job_id: str | None = None,
    user_name: str | None = None,
    user_email_or_phone: str | None = None,
    video_title: str | None = None,
    video_url: str | None = None,
    stage: str | None = None,
) -> str | None:
    import json
    import traceback
    from datetime import datetime
    from redis import Redis

    settings = get_settings()
    redis_url = getattr(settings, "REDIS_URL", None)
    if not redis_url or not isinstance(redis_url, str):
        return None

    try:
        r = Redis.from_url(redis_url, decode_responses=True, socket_timeout=3)
        raw_tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        data = {
            "id": error_id,
            "exc_name": type(exc).__name__,
            "exc_msg": str(exc),
            "context_msg": context_msg,
            "stage": stage,
            "job_id": job_id,
            "video_title": video_title,
            "video_url": video_url,
            "user_name": user_name,
            "user_email_or_phone": user_email_or_phone,
            "traceback": raw_tb,
            "created_at": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC"),
        }
        r.set(f"errlog:{error_id}", json.dumps(data, ensure_ascii=False), ex=7 * 86400)
        frontend_url = getattr(settings, "FRONTEND_URL", "https://gapirai.uz")
        base_url = (frontend_url if isinstance(frontend_url, str) else "https://gapirai.uz").rstrip("/")
        return f"{base_url}/api/errors/{error_id}"
    except Exception as e:
        logger.warning(f"Error logni Redisga saqlashda xatolik: {e}")
        return None


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
    import uuid

    admin_ids = get_admin_tg_ids(exclude_blocked=True)
    if not admin_ids:
        return

    # Nutqsiz video yoki taqiqlangan kontent tizim nosozligi emas (user xatoligi) -- adminlarga xabar yuborilmaydi
    err_code = getattr(exc, "code", None)
    err_name = type(exc).__name__
    err_str = str(exc).lower()
    if (
        err_code in ("NO_SPEECH_FOUND", "CONTENT_BLOCKED")
        or err_name in ("NoSpeechFoundError", "NoSpeechError", "ContentBlockedError")
        or "nutq topilmadi" in err_str
        or "kontent siyosati" in err_str
    ):
        return

    # Bir xil xatolik ketma-ket takrorlanganda adminlarni flood qilmaslik uchun throttle
    err_sig = f"{stage or 'unknown'}:{err_name}:{str(exc)[:60]}"
    if should_throttle_alert(f"err_{err_sig}", throttle_seconds=300):
        logger.info(f"Admin xatolik xabari cheklandi (throttled): {err_sig}")
        return

    # Extract job_id from context_msg if not explicitly provided
    if not job_id and context_msg:
        m = re.search(r"Job:\s*([0-9a-fA-F-]{36})", context_msg)
        if m:
            job_id = m.group(1)

    # Auto-resolve metadata from DB if job_id is present and info is missing
    if job_id and (not user_name or not video_title):
        try:
            from backend.models.database import SessionLocal, DubbingJob, VideoAnalysis, User
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
                else:
                    analysis = db.query(VideoAnalysis).filter(VideoAnalysis.id == job_id).first()
                    if analysis:
                        if not video_title:
                            video_title = f"[Tahlil] {analysis.video_title or 'Video'}"
                        if not video_url:
                            video_url = analysis.youtube_url
                        if not user_name and analysis.user_id:
                            db_user = db.query(User).filter(User.id == analysis.user_id).first()
                            if db_user:
                                user_name = db_user.name
                                if not user_email_or_phone:
                                    user_email_or_phone = db_user.phone or db_user.email
            finally:
                db.close()
        except Exception:
            pass

    error_id = uuid.uuid4().hex[:12]
    error_url = save_error_log(
        error_id,
        exc,
        context_msg=context_msg,
        job_id=job_id,
        user_name=user_name,
        user_email_or_phone=user_email_or_phone,
        video_title=video_title,
        video_url=video_url,
        stage=stage,
    )

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

    lines.append(f"⚠️ <b>Xatolik:</b> <code>{exc_name}</code>: {exc_msg}")

    if error_url:
        lines.append(f"\n📄 <b>Log:</b> <a href=\"{error_url}\">Traceback ko'rish</a>")
    else:
        lines.append(f"\n<blockquote expandable><b>Traceback:</b>\n<pre>{tb_str[:2500]}</pre></blockquote>")

    text = "\n".join(lines)

    btn_row = []
    if video_url and (video_url.startswith("http://") or video_url.startswith("https://")):
        btn_row.append({"text": "🎬 Video", "url": video_url})
    if error_url:
        btn_row.append({"text": "📄 Log", "url": error_url})
    btn_row.append({"text": "🗑", "callback_data": "del_msg"})
    reply_markup = {"inline_keyboard": [btn_row]}

    for admin_id in admin_ids:
        send_telegram_message(admin_id, text, reply_markup=reply_markup)



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

    admin_ids = get_admin_tg_ids(exclude_blocked=True)
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

    btn_row = []
    if video_url and (video_url.startswith("http://") or video_url.startswith("https://")):
        video_link_html = f'<a href="{html.escape(video_url)}">{html.escape(video_url)}</a>'
        btn_row.append({"text": "🎬 Videoni ko'rish", "url": video_url})
    elif video_url:
        video_link_html = f'<code>{html.escape(video_url)}</code>'
    else:
        video_link_html = "<i>Fayl orqali yuklangan (havola mavjud emas)</i>"

    btn_row.append({"text": "🗑", "callback_data": "del_msg"})
    reply_markup = {"inline_keyboard": [btn_row]}

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


def send_disk_space_alert(free_gb: float, total_gb: float, used_pct: float) -> bool:
    """Disk bo'sh joyi kritik darajaga yetganda (<5GB yoki >90% to'lganda)
    adminlarga Telegram orqali ogohlantirish yuboradi. Har 6 soatda ko'pi bilan 1 marta."""
    text = (
        f"🚨 <b>DIQQAT: Server diski to'lib bormoqda!</b>\n\n"
        f"💾 <b>Bo'sh joy:</b> <code>{free_gb:.1f} GB</code> / {total_gb:.1f} GB\n"
        f"📊 <b>Band qilingan:</b> <code>{used_pct:.1f}%</code>\n\n"
        f"<i>⚠️ Disk to'lib qolsa, yangi videolarni yuklab olish yoki ffmpeg render "
        f"jarayoni to'xtab qolishi mumkin. Iltimos, server diskini tozalang!</i>"
    )
    return send_alert_to_admins(text, alert_key="disk_space_critical", throttle_seconds=6 * 3600)


def send_cookie_expiry_alert(days_remaining: int, is_missing: bool = False) -> bool:
    """YouTube cookies.txt fayli eskirganda yoki tugashiga kam qolganda
    adminlarga Telegram orqali ogohlantirish yuboradi. Har 24 soatda ko'pi bilan 1 marta."""
    if is_missing:
        text = (
            f"🍪 <b>DIQQAT: YouTube cookies.txt topilmadi!</b>\n\n"
            f"Serverda YouTube cookie fayli mavjud emas yoki bo'sh. "
            f"Foydalanuvchilar YouTube videolarini yuklab olishda 'Sign in to confirm you\\'re not a bot' "
            f"xatoligiga uchrashlari mumkin.\n\n"
            f"<i>👉 Admin panel orqali yangi cookies.txt faylini yuklang!</i>"
        )
        key = "cookie_missing"
    else:
        text = (
            f"🍪 <b>OGOHLANTIRISH: YouTube cookie muddati oz qoldi!</b>\n\n"
            f"⏳ <b>Qolgan muddat:</b> <code>{days_remaining} kun</code>\n\n"
            f"<i>Cookie muddati tugasa, YouTube yuklashlari to'xtab qolishi mumkin. "
            f"Iltimos, admin paneldan cookies.txt ni yangilang!</i>"
        )
        key = f"cookie_expiry_{days_remaining}"

    return send_alert_to_admins(text, alert_key=key, throttle_seconds=24 * 3600)


def send_worker_restart_alert(worker_name: str, reason: str = "Javob bermay qoldi (ping timeout)") -> bool:
    """Watchdog Celery worker'ni qotib qolgani sababli qayta ishga tushirganda
    adminlarga Telegram orqali xabar beradi. Har 15 daqiqada ko'pi bilan 1 marta."""
    text = (
        f"⚠️ <b>Celery Worker avtomatik qayta ishga tushirildi!</b>\n\n"
        f"⚙️ <b>Worker:</b> <code>{worker_name}</code>\n"
        f"📌 <b>Sabab:</b> {reason}\n\n"
        f"<i>Watchdog tizimi worker muzlab qolganini aniqladi va xizmatni uzluksiz ushlab "
        f"turish uchun konteynerni restart qildi.</i>"
    )
    return send_alert_to_admins(text, alert_key=f"worker_restart_{worker_name}", throttle_seconds=900)


def send_job_max_retries_failed_alert(
    job_id: str,
    stage: str,
    exc: Exception,
    video_title: str | None = None,
    user_info: str | None = None,
) -> bool:
    """Job barcha retry urinishlaridan keyin butunlay to'xtaganda (FAILED)
    adminlarga Telegram orqali yakuniy xabar beradi."""
    import html
    safe_title = html.escape(video_title or "Video")
    safe_exc = html.escape(str(exc)[:250])
    lines = [
        f"🚨 <b>Dublyaj barcha urinishlardan so'ng to'xtadi (FAILED)!</b>\n",
        f"🆔 <b>Job ID:</b> <code>{job_id}</code>",
        f"🎬 <b>Video:</b> {safe_title}",
        f"📍 <b>Bosqich:</b> <code>{stage}</code>",
        f"⚠️ <b>Yakuniy xatolik:</b> <code>{safe_exc}</code>",
    ]
    if user_info:
        lines.append(f"👤 <b>Foydalanuvchi:</b> {html.escape(user_info)}")
    lines.append("\n<i>Kvota foydalanuvchiga qaytarildi yoki to'lov tekshiruvi belgilandi.</i>")
    text = "\n".join(lines)
    return send_alert_to_admins(text, alert_key=f"job_fatal_{job_id}", throttle_seconds=3600)

