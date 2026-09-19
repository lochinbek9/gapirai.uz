"""GapirAI.uz Telegram bot -- to'liq dublyaj xizmati Telegram ichida.

Web bilan bir xil hisob: foydalanuvchi telefon raqamini ulashadi (Telegram
o'zi tasdiqlaydi, SMS kod shart emas), va agar shu raqam saytda ham
ro'yxatdan o'tgan bo'lsa -- kvota/obuna ikkalasida ham baravar ishlaydi
(backend/models/database.py: User.phone, User.telegram_chat_id).

Job yaratish mantig'i backend/services/job_creation.py'da -- web API
(routes.py) bilan bir xil, ikki joyda saqlanmaydi (Safety Gate, kvota,
davomiylik chegarasi -- barchasi avtomatik shu orqali ishlaydi).

Video tayyor bo'lganda xabar backend/workers/tasks.py'dan (job yakunlanganda)
keladi -- bu jarayon faqat kiruvchi xabarlarni tinglaydi, holatni o'zi
so'rovda kutib turmaydi.

Ishga tushirish: alohida Docker Compose xizmati (docker-compose.yml:
telegram_bot), long-polling rejimida.
"""
import logging
import re
import uuid
from pathlib import Path

from telegram import (
    Update,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    WebAppInfo,
)
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from backend.config import get_settings
from backend.models.database import SessionLocal, User, DubbingJob, JobStatus
from backend.services.job_creation import (
    create_dubbing_job,
    create_click_payment,
    create_job_from_local_video_file,
    is_valid_youtube_url,
    queue_rejection_message,
    check_queue_capacity,
)
from backend.services.resolution_variants import request_resolution

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# python-telegram-bot ichida httpx ishlatadi; uning INFO-darajali "HTTP Request:
# POST https://api.telegram.org/bot<TOKEN>/getUpdates" logi HAR long-poll
# so'rovida BOT TOKENINI to'liq oshkor qiladi. WARNING'ga ko'tarib, bu
# oqimni to'xtatamiz (xatoliklar baribir ko'rinadi). httpcore ham shovqinli.
for _noisy in ("httpx", "httpcore", "telegram.ext.Application"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

logger = logging.getLogger("telegram_bot")

settings = get_settings()


def _miniapp_url() -> str | None:
    """Telegram Mini App manzili. TELEGRAM_MINIAPP_URL bo'sh bo'lsa
    FRONTEND_URL'dan /tma sifatida hosil qilinadi. Telegram faqat HTTPS
    qabul qiladi -- localhost/dev'da None qaytadi (menu tugmasi qo'yilmaydi)."""
    url = (settings.TELEGRAM_MINIAPP_URL or "").strip()
    if not url:
        base = (settings.FRONTEND_URL or "").rstrip("/")
        url = f"{base}/tma" if base else ""
    return url if url.startswith("https://") else None


_PHONE_RE = re.compile(r"^\+998\d{9}$")

# 2026-09-04: to'g'ridan-to'g'ri video fayl qabul qilish -- faqat mahalliy
# Telegram Bot API server (docker-compose.yml: telegram-bot-api) sozlangan
# bo'lsa ishlaydi (settings.TELEGRAM_LOCAL_API_URL), chunki rasmiy
# api.telegram.org'ning 20MB yuklab olish chegarasi to'liq metrajli
# videolar uchun deyarli hech qachon yetarli emas. routes.py:
# _ALLOWED_UPLOAD_CONTENT_TYPES/_CONTENT_TYPE_TO_EXT bilan bir xil ro'yxat.
_ALLOWED_VIDEO_MIME_TO_EXT = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "video/webm": ".webm",
}
# Mahalliy Bot API server (--local) o'zi ham 2000MB'dan katta faylni qabul
# qilmaydi -- foydalanuvchiga tushunarli xabar berish uchun shu yerda ham
# oldindan tekshiramiz.
TELEGRAM_MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024


def _normalize_uz_phone(raw: str) -> str | None:
    """Telegram contact.phone_number odatda '+' belgisisiz keladi
    ('998901234567'). auth_routes.py bilan bir xil formatga (+998XXXXXXXXX)
    keltiradi, mos kelmasa None qaytaradi."""
    digits = re.sub(r"[^\d]", "", raw)
    if digits.startswith("998") and len(digits) == 12:
        candidate = f"+{digits}"
    elif len(digits) == 9:
        candidate = f"+998{digits}"
    else:
        candidate = f"+{digits}" if not raw.startswith("+") else raw
    return candidate if _PHONE_RE.match(candidate) else None


def _looks_like_youtube_url(text: str) -> str | None:
    """Matn ichidan birinchi YouTube havolasini topadi (foydalanuvchi
    ba'zan 'mana bu video: <link>' deb yozadi)."""
    for token in text.split():
        if is_valid_youtube_url(token):
            return token
    return None


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    finally:
        db.close()

    if user:
        await update.message.reply_text(
            f"Xush kelibsiz, {user.name or ''}! 👋\n\nNima qilmoqchisiz?",
            reply_markup=_main_menu_markup(),
        )
        return

    button = KeyboardButton("📱 Telefon raqamimni ulashish", request_contact=True)
    await update.message.reply_text(
        "Assalomu alaykum! GapirAI.uz botiga xush kelibsiz. 🎬\n\n"
        "YouTube videolarni o'zbek tiliga avtomatik dublyaj qilib beraman.\n\n"
        "Boshlash uchun telefon raqamingizni ulashing (agar saytda ro'yxatdan o'tgan bo'lsangiz, "
        "hisobingiz avtomatik tanilib, obuna/kvotangiz shu yerda ham ishlaydi):",
        reply_markup=ReplyKeyboardMarkup([[button]], one_time_keyboard=True, resize_keyboard=True),
    )


def _donate_url() -> str:
    return f"{(settings.FRONTEND_URL or 'https://gapirai.uz').rstrip('/')}/donate"


def _miniapp_markup() -> InlineKeyboardMarkup | None:
    """"GapirAI ilovasini ochish" inline WebApp tugmasi -- URL sozlangan
    bo'lsagina (HTTPS). Aks holda None (tugmasiz xabar)."""
    url = _miniapp_url()
    if not url:
        return None
    return InlineKeyboardMarkup([[InlineKeyboardButton("🚀 GapirAI ilovasi", web_app=WebAppInfo(url=url))]])


def _main_menu_markup() -> InlineKeyboardMarkup:
    """Foydalanuvchi kirishi bilan ko'rsatiladigan asosiy menyu -- "nima
    qilmoqchisiz?". Dublyaj (callback), donat (to'g'ridan-to'g'ri url --
    to'lov redirect'lari tashqi brauzerda ishonchliroq), ilova (WebApp,
    faqat HTTPS URL bo'lsa)."""
    rows = [
        [InlineKeyboardButton("🎬 Video dublyaj qilish", callback_data="menu:dub")],
        [InlineKeyboardButton("📝 Subtitr yaratish", callback_data="menu:subtitle")],
        [InlineKeyboardButton("🧠 Videoni tahlil qilish", callback_data="menu:learn")],
        [InlineKeyboardButton("💛 Loyihani qo'llab-quvvatlash", url=_donate_url())],
    ]
    mini = _miniapp_url()
    if mini:
        rows.append([InlineKeyboardButton("🚀 Ilova (videolarim, tarif)", web_app=WebAppInfo(url=mini))])
    return InlineKeyboardMarkup(rows)


async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/menu -- asosiy menyuni qayta ko'rsatadi."""
    await update.message.reply_text("Nima qilmoqchisiz?", reply_markup=_main_menu_markup())


async def handle_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Asosiy menyu tugmalari (callback_data="menu:..."). Tanlangan rejim
    context.user_data['mode']'ga yoziladi -- keyingi YouTube havolasi shu
    rejimga qarab dublyaj yoki tahlil sifatida ishlanadi (handle_text)."""
    query = update.callback_query
    await query.answer()
    action = (query.data or "").split(":", 1)[-1]
    if action == "dub":
        context.user_data["mode"] = "dub"
        await query.message.reply_text(
            "🎬 YouTube havolasini yoki video faylni yuboring — o'zbek tiliga dublyaj qilib beraman.\n\n"
            "Video tayyor bo'lganda shu yerga xabar yuboraman."
        )
    elif action == "subtitle":
        context.user_data["mode"] = "subtitle"
        await query.message.reply_text(
            "📝 YouTube havolasini yuboring — o'zbekcha subtitr (.srt/.vtt) tayyorlab beraman. "
            "Dublyaj audiosi yaratilmaydi, shuning uchun tezroq.\n\n"
            "Tayyor bo'lganda shu yerga havola yuboraman."
        )
    elif action == "learn":
        context.user_data["mode"] = "learn"
        await query.message.reply_text(
            "🧠 YouTube havolasini yuboring — video bo'yicha konspekt, 5 daqiqalik xulosa, "
            "test va AI ustoz tayyorlab beraman (dublyaj ham qilinadi).\n\n"
            "Tayyor bo'lganda shu yerga tahlil havolasini yuboraman."
        )


async def app_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/app -- Mini App'ni ochuvchi tugma. Guruhlarda menu tugmasi
    ko'rinmagani uchun ham foydali."""
    markup = _miniapp_markup()
    if not markup:
        await update.message.reply_text("Ilova hozircha mavjud emas.")
        return
    await update.message.reply_text(
        "GapirAI ilovasi — videolaringiz, dublyaj holati va tarif bir joyda:",
        reply_markup=markup,
    )


async def donate_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/donate -- loyihani qo'llab-quvvatlash sahifasiga havola (asosiy yo'l
    /start menyusidagi tugma; bu buyruq to'g'ridan-to'g'ri yozganlar uchun)."""
    markup = InlineKeyboardMarkup([[InlineKeyboardButton("💛 Qo'llab-quvvatlash", url=_donate_url())]])
    await update.message.reply_text(
        "GapirAI.uz — mustaqil loyiha. 🙏\n\n"
        "Har bir hissa videolarni ko'proq odamga, tezroq yetkazishga yordam beradi. "
        "Click yoki Payme orqali istalgan summada qo'llab-quvvatlashingiz mumkin:",
        reply_markup=markup,
    )


async def _post_init(application: Application) -> None:
    """Bot ishga tushganda: buyruqlar ro'yxati + (HTTPS bo'lsa) Mini App
    menu tugmasi -- barcha foydalanuvchilar uchun, chat_id ko'rsatilmagan."""
    try:
        await application.bot.set_my_commands([
            ("start", "Boshlash / asosiy menyu"),
            ("menu", "Asosiy menyu"),
            ("donate", "Loyihani qo'llab-quvvatlash"),
            ("app", "GapirAI ilovasi"),
        ])
    except Exception as e:
        logger.warning(f"Buyruqlar ro'yxatini o'rnatib bo'lmadi: {e}")

    url = _miniapp_url()
    if not url:
        logger.info("TELEGRAM_MINIAPP_URL (yoki HTTPS FRONTEND_URL) yo'q -- menu tugmasi o'rnatilmadi.")
        return
    try:
        await application.bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="GapirAI", web_app=WebAppInfo(url=url))
        )
        logger.info(f"Menu tugmasi Mini App'ga o'rnatildi: {url}")
    except Exception as e:
        logger.warning(f"Menu tugmasini o'rnatib bo'lmadi: {e}")


async def handle_contact(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    contact = update.message.contact
    if contact.user_id != update.effective_user.id:
        await update.message.reply_text("Iltimos, faqat o'zingizning telefon raqamingizni ulashing.")
        return

    phone = _normalize_uz_phone(contact.phone_number)
    if not phone:
        await update.message.reply_text(
            "Uzr, hozircha faqat O'zbekiston raqamlari (+998) qo'llab-quvvatlanadi.",
            reply_markup=ReplyKeyboardRemove(),
        )
        return

    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.phone == phone).first()
        if not user:
            user = User(
                phone=phone,
                name=update.effective_user.first_name or phone,
                is_verified=True,  # Telegram contact-share o'zi tasdiqlaydi -- SMS kod shart emas.
                auth_provider="phone",
                telegram_chat_id=chat_id,
            )
            db.add(user)
        else:
            user.telegram_chat_id = chat_id
            if not user.is_verified:
                user.is_verified = True
        db.commit()
        name = user.name
    finally:
        db.close()

    await update.message.reply_text(
        f"Rahmat, {name}! Hisobingiz ulandi. ✅",
        reply_markup=ReplyKeyboardRemove(),
    )
    await update.message.reply_text("Nima qilmoqchisiz?", reply_markup=_main_menu_markup())


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.effective_chat.id)
    text = (update.message.text or "").strip()

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    finally:
        db.close()

    if not user:
        await update.message.reply_text("Avval /start buyrug'ini yuborib, telefon raqamingizni ulashing.")
        return

    url = _looks_like_youtube_url(text)
    if not url:
        await update.message.reply_text(
            "Iltimos, YouTube video havolasini yoki video faylni yuboring.",
            reply_markup=_main_menu_markup(),
        )
        return

    # Menyuda tanlangan rejim (bir martalik) -- "learn" bo'lsa dublyajdan
    # tashqari Learning Workspace tahlili ham yaratiladi.
    mode = context.user_data.pop("mode", "dub")

    await update.message.reply_text("⏳ Video tekshirilmoqda...")

    db = SessionLocal()
    try:
        # DB user'ni shu sessiyada qayta olish kerak -- yuqoridagi `user`
        # boshqa (yopilgan) sessiyaga bog'langan edi.
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        result = await create_dubbing_job(db, user, url, voice_gender="auto", subtitle_only=(mode == "subtitle"))

        frontend_url = (settings.FRONTEND_URL or "https://gapirai.uz").rstrip("/")

        if result.outcome == "invalid_url":
            await update.message.reply_text("Bu YouTube havolasi noto'g'ri ko'rinadi.")
        elif result.outcome == "fetch_error":
            await update.message.reply_text(f"Video ma'lumotlarini olishda xatolik: {result.error_detail}")
        elif result.outcome == "blocked":
            await update.message.reply_text(
                "🚫 Ushbu video GapirAI.uz kontent siyosatiga mos kelmagani sababli dublaj qilinmaydi."
            )
        elif result.outcome == "too_long":
            await update.message.reply_text(
                f"Video juda uzun ({result.duration_minutes:.0f} daqiqa). "
                "Maksimal ruxsat etilgan davomiylik bilan qayta urinib ko'ring."
            )
        elif result.outcome in ("queued", "ready"):
            analysis_url = None
            if mode == "learn":
                try:
                    job = db.query(DubbingJob).filter(DubbingJob.id == result.job_id).first()
                    if job:
                        from backend.api.learn_routes import _create_linked_analysis
                        analysis = _create_linked_analysis(db, user, url, job)
                        analysis_url = f"{frontend_url}/learn/{analysis.id}"
                except Exception:
                    logger.exception("Tahlil yaratishda xato")

            if analysis_url:
                verb = "tahlil qilinmoqda" if result.outcome == "queued" else "tayyor"
                await update.message.reply_text(
                    f"✅ \"{result.video_title}\" {verb}.\n\n"
                    f"Konspekt, xulosa, test va AI ustoz:\n{analysis_url}"
                )
            elif mode == "subtitle":
                # Subtitr rejimi TTS/audio kutmaydi, tez tayyor bo'ladi va
                # process_video() bu holatda telegram bildirishnomasini
                # yubormaydi (backend/workers/tasks.py) -- shuning uchun
                # havolani navbatga qo'shilgan zahoti beramiz, sahifaning
                # o'zi progressni ko'rsatib turadi (frontend/app/subtitles/[id]).
                verb = "tayyorlanmoqda" if result.outcome == "queued" else "tayyor"
                await update.message.reply_text(
                    f"📝 \"{result.video_title}\" subtitri {verb}.\n\n{frontend_url}/subtitles/{result.job_id}"
                )
            elif result.outcome == "queued":
                await update.message.reply_text(
                    f"✅ \"{result.video_title}\" navbatga qo'shildi.\n\nTayyor bo'lganda shu yerga xabar yuboraman."
                )
            else:
                await update.message.reply_text(
                    f"✅ \"{result.video_title}\" allaqachon tayyor!\n\n{frontend_url}/video/{result.job_id}"
                )
        elif result.outcome == "insufficient_minutes":
            await update.message.reply_text(
                f"\"{result.video_title}\" ({result.duration_minutes:.0f} daqiqa) uchun "
                f"{result.minutes_short} daqiqa yetishmayapti.\n\n"
                f"Qo'shimcha daqiqa sotib oling yoki tarifni yangilang:\n{frontend_url}/pricing"
            )
        elif result.outcome == "daily_limit":
            await update.message.reply_text(
                f"Kunlik dublyaj chegarasiga yetdingiz (24 soatda {result.daily_limit} ta). "
                "Ertaga qaytadan urinib ko'ring."
            )
        elif result.outcome in ("active_limit", "queue_full"):
            await update.message.reply_text(queue_rejection_message(result))
    finally:
        db.close()


async def handle_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Foydalanuvchi video faylni to'g'ridan-to'g'ri yuborsa -- YouTube
    havolasisiz, faylning o'zidan job yaratadi
    (backend/services/job_creation.py:create_job_from_local_video_file).
    Faqat mahalliy Telegram Bot API server sozlangan bo'lsa ishlaydi
    (settings.TELEGRAM_LOCAL_API_URL) -- aks holda YouTube-havola oqimi
    o'zgarishsiz, bu funksiya faqat aniq xabar bilan rad etadi."""
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
    finally:
        db.close()

    if not user:
        await update.message.reply_text("Avval /start buyrug'ini yuborib, telefon raqamingizni ulashing.")
        return

    if not settings.TELEGRAM_LOCAL_API_URL:
        await update.message.reply_text(
            "Uzr, hozircha video fayl qabul qilinmaydi — faqat YouTube havolasini yuboring."
        )
        return

    media = update.message.video or update.message.document
    if media is None:
        return

    ext = _ALLOWED_VIDEO_MIME_TO_EXT.get(getattr(media, "mime_type", None) or "")
    if not ext:
        await update.message.reply_text("Faqat MP4, MOV, MKV yoki WebM formatidagi video fayllar qabul qilinadi.")
        return

    if media.file_size and media.file_size > TELEGRAM_MAX_VIDEO_BYTES:
        await update.message.reply_text(
            f"Fayl hajmi {TELEGRAM_MAX_VIDEO_BYTES // (1024 ** 3)} GB dan katta bo'lmasligi kerak."
        )
        return

    # Navbat to'la / faol job chegarasi bo'lsa, faylni (2GB gacha) yuklab
    # olishdan OLDIN rad etamiz -- yuk ostida bekorga disk/tarmoq sarflamaslik.
    db = SessionLocal()
    try:
        rejection = check_queue_capacity(db, user.id)
    finally:
        db.close()
    if rejection:
        await update.message.reply_text(queue_rejection_message(rejection))
        return

    await update.message.reply_text("⏳ Video qabul qilinmoqda, biroz kuting...")

    job_id = str(uuid.uuid4())
    job_dir = Path(settings.UPLOAD_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    video_path = job_dir / f"video{ext}"

    try:
        tg_file = await context.bot.get_file(media.file_id)
        await tg_file.download_to_drive(custom_path=str(video_path))
        # Mahalliy Bot API server (--local) faylni O'Z diskida saqlaydi va
        # download_to_drive local rejimda uni KO'CHIRMAY, NUSXALAYDI --
        # nusxa olingach asl faylni o'chiramiz, aks holda telegram_bot_api_data
        # volume'i vaqt o'tib to'lib ketadi.
        src = getattr(tg_file, "file_path", "") or ""
        if src.startswith("/"):
            try:
                Path(src).unlink(missing_ok=True)
            except OSError:
                pass
    except Exception:
        logger.exception(f"Telegram fayl yuklashda xato: job={job_id}")
        video_path.unlink(missing_ok=True)
        await update.message.reply_text("Video faylini olishda xatolik yuz berdi. Qaytadan urinib ko'ring.")
        return

    db = SessionLocal()
    try:
        # DB user'ni shu sessiyada qayta olish kerak -- yuqoridagi `user`
        # boshqa (yopilgan) sessiyaga bog'langan edi (handle_text bilan bir xil naqsh).
        user = db.query(User).filter(User.telegram_chat_id == chat_id).first()
        result = await create_job_from_local_video_file(
            db, user, job_id, video_path,
            source_url=f"telegram://file/{media.file_unique_id}",
        )

        if result.outcome == "bad_file":
            await update.message.reply_text(
                "Video faylini o'qib bo'lmadi — fayl buzilgan yoki qo'llab-quvvatlanmaydigan bo'lishi mumkin."
            )
        elif result.outcome == "too_long":
            await update.message.reply_text(
                f"Video juda uzun ({result.duration_minutes:.0f} daqiqa). "
                "Maksimal ruxsat etilgan davomiylik bilan qayta urinib ko'ring."
            )
        elif result.outcome == "insufficient_minutes":
            frontend_url = (settings.FRONTEND_URL or "https://gapirai.uz").rstrip("/")
            await update.message.reply_text(
                f"Bu video ({result.duration_minutes:.0f} daqiqa) uchun {result.minutes_short} daqiqa yetishmayapti.\n\n"
                f"Qo'shimcha daqiqa sotib oling yoki tarifni yangilang:\n{frontend_url}/pricing"
            )
        elif result.outcome == "daily_limit":
            await update.message.reply_text(
                f"Kunlik dublyaj chegarasiga yetdingiz (24 soatda {result.daily_limit} ta). "
                "Ertaga qaytadan urinib ko'ring."
            )
        elif result.outcome in ("active_limit", "queue_full"):
            await update.message.reply_text(queue_rejection_message(result))
        elif result.outcome == "queued":
            await update.message.reply_text(
                "✅ Video navbatga qo'shildi.\n\nTayyor bo'lganda shu yerga xabar yuboraman."
            )
    finally:
        db.close()


async def handle_resolution_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Dublyaj tayyor bo'lganda yuborilgan xabardagi 360p/720p/1080p
    tugmalaridan biri bosilganda ishga tushadi -- veb bilan bir xil
    resolution_variants.request_resolution() orqali (backend/api/routes.py
    ham shu funksiyani chaqiradi, mantiq bitta joyda)."""
    query = update.callback_query
    await query.answer()

    try:
        _, job_id, resolution = (query.data or "").split(":", 2)
    except ValueError:
        return

    db = SessionLocal()
    try:
        job = db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        if not job or job.status != JobStatus.COMPLETED:
            await query.message.reply_text("Video topilmadi yoki hali tayyor emas.")
            return

        result = request_resolution(db, job, resolution)

        if result.outcome == "forbidden":
            await query.message.reply_text(
                "Bu sifat sizning tarif rejangizda mavjud emas. Tarifni oshirish uchun saytga o'ting."
            )
        elif result.outcome == "ready":
            await query.message.reply_text(f"✅ {resolution}:\n\n{result.download_url}")
        elif result.outcome == "processing":
            await query.message.reply_text(
                f"⏳ {resolution} versiyasi tayyorlanmoqda. Tayyor bo'lganda shu yerga xabar beraman."
            )
        else:
            await query.message.reply_text("Noto'g'ri so'rov.")
    finally:
        db.close()


def main() -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN sozlanmagan -- bot ishga tushmaydi.")
        return

    builder = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).post_init(_post_init)
    if settings.TELEGRAM_LOCAL_API_URL:
        # Self-hosted local Bot API server (docker-compose.yml: telegram-bot-api)
        # -- 20MB'lik rasmiy chegara o'rniga 2GB'gacha. local_mode(True)
        # get_file()/download_to_drive()'ni serverga qayta HTTP so'rov
        # yubormasdan, u allaqachon saqlagan lokal fayl yo'lidan to'g'ridan-to'g'ri
        # o'qishga o'tkazadi (shared volume ikkala konteynerda ham bir xil
        # yo'lda ulangan bo'lishi shart -- docker-compose.yml izohiga qarang).
        base = settings.TELEGRAM_LOCAL_API_URL.rstrip("/")
        builder = builder.base_url(f"{base}/bot").local_mode(True)
        logger.info(f"Telegram bot mahalliy Bot API server orqali ishga tushmoqda: {base}")
    app = builder.build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu_command))
    app.add_handler(CommandHandler("app", app_command))
    app.add_handler(CommandHandler("donate", donate_command))
    app.add_handler(MessageHandler(filters.CONTACT, handle_contact))
    app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, handle_video))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    app.add_handler(CallbackQueryHandler(handle_menu_callback, pattern=r"^menu:"))
    app.add_handler(CallbackQueryHandler(handle_resolution_callback, pattern=r"^res:"))

    logger.info("Telegram bot ishga tushdi (long polling).")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
