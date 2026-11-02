"""
Avtomatik (lifecycle) emaillar -- 2026-11-02. Cron har soatda chaqiradi
(backend/scripts/lifecycle_emails.py); qo'lda "Xabarnoma" yuborishni kutmasdan
foydalanuvchilarga o'z vaqtida xat boradi.

Xatlar (muhimlik tartibida -- kunlik limit yetsa avval shular ketadi):
  1. activate_1/2/3 -- ro'yxatdan o'tib, bitta ham dublaj/subtitr/tahlil
     yubormaganlarga: 1-, 3- va 7-kun. Biror narsa yuborsa seriya to'xtaydi.
  2. quota:<davr> -- bepul tarifda 5 daqiqasi tugagan faol foydalanuvchiga
     davr (30 kun) ichida bir marta.
  3. news:<yil>-W<hafta> -- haftalik "GapirAI.uz yangiliklari": admin yozgan
     yangiliklar (site_news) + hafta davomida chiqqan ommaviy videolar. Bo'sh
     haftada yuborilmaydi.

Qoidalar:
  - EmailOptOut'dagilarga (xat ostidagi "Bunday xatlarni olmaslik") hech narsa ketmaydi.
  - Bir odamga 3 kunda ko'pi bilan 1 ta avtomatik xat.
  - Toshkent vaqti 09:00-20:59 oralig'ida yuboriladi.
  - Kunlik limit EMAIL_DAILY_LIMIT (Resend bepul tarifi kuniga 100 ta) -- oshgani
    keyingi kunga qoladi. Resend 429 qaytarsa, shu ishga tushirish to'xtaydi.
  - (user_id, kind) noyob (email_log) -- bir xil xat ikki marta ketmaydi.
"""
import hashlib
import hmac
import html
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode

from sqlalchemy import and_, exists, func, or_

from backend.config import get_settings
from backend.models.database import (
    DubbingJob,
    EmailLog,
    EmailOptOut,
    JobStatus,
    PlanTier,
    SiteNews,
    Subscription,
    User,
    VideoAnalysis,
)
from backend.services.email_service import DeliveryResult, deliver_email, list_unsubscribe_headers

logger = logging.getLogger(__name__)
settings = get_settings()

SITE = "https://gapirai.uz"
API = "https://api.gapirai.uz"
TASHKENT = timedelta(hours=5)
SEND_HOURS = range(9, 21)            # Toshkent vaqti, 09:00-20:59
MIN_GAP = timedelta(days=3)          # bir odamga avtomatik xatlar orasidagi eng kam masofa
ACTIVATION_MAX_AGE = timedelta(days=90)  # bundan eski "uxlab qolgan" hisoblar seriyaga kirmaydi
FREE_MONTHLY_MINUTES = 5             # backend/services/plans.py: bepul tarif

ACTIVATION_STEPS = [  # (kind, ro'yxatdan o'tgandan keyin necha kun)
    ("activate_1", 1),
    ("activate_2", 3),
    ("activate_3", 7),
]


# --- Obunadan chiqish ------------------------------------------------------

def unsubscribe_token(user_id) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"unsub:{user_id}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(user_id) -> str:
    return f"{API}/api/email/unsubscribe?" + urlencode({"u": str(user_id), "t": unsubscribe_token(user_id)})


def verify_unsubscribe(user_id: str, token: str) -> bool:
    return hmac.compare_digest(unsubscribe_token(user_id), token or "")


# --- Xat shabloni -------------------------------------------------------------

def _utm(url: str, kind: str) -> str:
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}utm_source=email&utm_medium=lifecycle&utm_campaign={kind.split(':')[0]}"


def render(user: User, kind: str, subject: str, paragraphs: list[str], button: tuple[str, str] | None,
           extra_html: str = "") -> tuple[str, str]:
    """Saytdagi uslub: oq fon, qora tugma, ko'k havola. Returns (html, text)."""
    name = (user.name or "").strip()
    greeting = f"Assalomu alaykum, {name}!" if name else "Assalomu alaykum!"
    body_html = "".join(
        f'<p style="margin:0 0 14px;color:#0B0D12;font-size:15px;line-height:1.65;">{p}</p>' for p in paragraphs
    )
    button_html = ""
    if button:
        label, url = button
        button_html = (
            f'<div style="margin:24px 0 8px;"><a href="{html.escape(_utm(url, kind))}" '
            f'style="display:inline-block;background:#0B0D12;color:#FFFFFF;font-size:15px;font-weight:600;'
            f'text-decoration:none;padding:12px 24px;border-radius:10px;">{html.escape(label)}</a></div>'
        )
    unsub = unsubscribe_url(user.id)
    page = f"""<!doctype html><html><body style="margin:0;background:#F6F7F9;">
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:16px;padding:28px 24px;">
    <p style="margin:0 0 20px;font-size:18px;font-weight:600;color:#0B0D12;">GapirAI<span style="color:#2B5CF0;">.uz</span></p>
    <p style="margin:0 0 14px;color:#0B0D12;font-size:15px;font-weight:600;">{html.escape(greeting)}</p>
    {body_html}{extra_html}{button_html}
  </div>
  <p style="margin:16px 8px 0;color:#585E6A;font-size:12px;line-height:1.5;">
    Siz GapirAI.uz'da ro'yxatdan o'tganingiz uchun bu xatni oldingiz.
    <a href="{html.escape(unsub)}" style="color:#585E6A;">Bunday xatlarni olmaslik</a>
  </p>
</div></body></html>"""
    import re
    plain = [greeting, ""] + [re.sub(r"<[^>]+>", "", p) for p in paragraphs]
    if button:
        plain += ["", f"{button[0]}: {_utm(button[1], kind)}"]
    plain += ["", "GapirAI.uz jamoasi", f"Bunday xatlarni olmaslik: {unsub}"]
    return page, "\n".join(plain)


def activation_email(user: User, kind: str) -> tuple[str, str, str]:
    if kind == "activate_1":
        subject = "Birinchi videongizni o'zbek tilida ko'ring"
        paras = [
            "GapirAI.uz'da ro'yxatdan o'tdingiz, lekin hali birorta video yubormadingiz.",
            "Har 30 kunda <b>5 daqiqa bepul</b>. YouTube havolasini qo'ying — bir necha daqiqada video "
            "o'zbekcha ovoz bilan tayyor bo'ladi. Havola izlashga vaqt bo'lmasa, sahifadagi tayyor "
            "namunalardan birini tanlang.",
        ]
        button = ("Bepul sinab ko'rish", f"{SITE}/")
    elif kind == "activate_2":
        subject = "Videoni o'zbekcha tinglash 1 daqiqada"
        paras = [
            "Ingliz, rus yoki boshqa tildagi foydali video bormi? GapirAI.uz uni o'zbek tiliga o'giradi: "
            "nutqni matnga aylantiradi, tarjima qiladi va spikerga mos o'zbekcha ovoz bilan qayta yozadi.",
            "Ovozsiz variant ham bor — faqat o'zbekcha subtitr. Yoki uzun ma'ruzaning qisqa konspekti va "
            "testini oling — bu daqiqa sarflamaydi.",
        ]
        button = ("Video yuborish", f"{SITE}/")
    else:
        subject = "Biror narsa xalaqit berdimi?"
        paras = [
            "Ro'yxatdan o'tganingizga bir hafta bo'ldi, lekin xizmatdan hali foydalanmadingiz. Biror joyda "
            "qiyinchilik bo'lgan bo'lsa, Telegram'da @gapirai_support ga yozing — yordam beramiz.",
            "Telefonda qulayroq bo'lsa, @gapirai_uz_bot ga videoning havolasini yoki videoning o'zini "
            "yuboring — tayyor dublaj chatga keladi.",
        ]
        button = ("Saytga o'tish", f"{SITE}/")
    page, text = render(user, kind, subject, paras, button)
    return subject, page, text


def quota_email(user: User, kind: str) -> tuple[str, str, str]:
    subject = "Bepul daqiqalaringiz tugadi"
    paras = [
        "Bu oy uchun 5 daqiqalik bepul limitingiz tugadi — demak xizmat sizga foydali bo'ldi.",
        "Davom ettirish uchun eng arzon yo'l — <b>15 daqiqalik paket, 4 900 so'm</b>, muddati tugamaydi. "
        "Ko'p video ko'rsangiz, Standart tarif: oyiga 350 daqiqa. To'lov Click, Payme, Uzum yoki Paynet orqali.",
        "Bepul daqiqalar 30 kunlik davr tugagach yana yangilanadi.",
    ]
    page, text = render(user, kind, subject, paras, ("Paket yoki tarif tanlash", f"{SITE}/pricing"))
    return subject, page, text


def news_email(user: User, kind: str, news: list[SiteNews], videos: list[DubbingJob]) -> tuple[str, str, str]:
    subject = f"GapirAI.uz yangiliklari: {news[0].title}" if news else "Bu haftaning yangi o'zbekcha videolari"
    items = ""
    for n in news:
        link = ""
        if n.link_url:
            link = (f' <a href="{html.escape(_utm(n.link_url, kind))}" style="color:#204CD6;">'
                    f'{html.escape(n.link_text or "Batafsil")}</a>')
        items += (
            f'<div style="margin:0 0 18px;"><p style="margin:0 0 4px;font-size:16px;font-weight:600;color:#0B0D12;">'
            f'{html.escape(n.title)}</p><p style="margin:0;color:#585E6A;font-size:15px;line-height:1.6;">'
            f'{html.escape(n.body)}{link}</p></div>'
        )
    if videos:
        items += '<p style="margin:8px 0 10px;font-size:16px;font-weight:600;color:#0B0D12;">Yangi ommaviy videolar</p>'
        for v in videos:
            url = _utm(f"{SITE}/video/{v.id}", kind)
            thumb = (f'<img src="{html.escape(v.video_thumbnail)}" width="120" alt="" '
                     f'style="border-radius:8px;display:block;" />') if v.video_thumbnail else ""
            items += (
                f'<a href="{html.escape(url)}" style="display:flex;gap:12px;align-items:center;margin:0 0 12px;'
                f'text-decoration:none;color:#0B0D12;">{thumb}<span style="font-size:14px;line-height:1.4;">'
                f'{html.escape(v.video_title or "Video")}</span></a>'
            )
    page, text = render(user, kind, subject, ["Bu haftada GapirAI.uz'da nimalar o'zgardi:"],
                        ("Saytga o'tish", f"{SITE}/"), extra_html=items)
    text_items = [f"- {n.title}: {n.body}" for n in news] + [f"- {v.video_title}: {SITE}/video/{v.id}" for v in videos]
    text = text.replace("GapirAI.uz jamoasi", "\n".join(text_items) + "\n\nGapirAI.uz jamoasi", 1)
    return subject, page, text


# --- Kimga nima ketadi --------------------------------------------------------

def _eligible_users(db):
    """Email'i bor, faol, ichki emas, obunadan chiqmagan foydalanuvchilar."""
    return db.query(User).filter(
        User.email.isnot(None),
        User.email != "",
        User.is_active.is_(True),
        or_(User.is_internal.is_(False), User.is_internal.is_(None)),
        ~exists().where(EmailOptOut.user_id == User.id),
    )


def _recently_emailed(db, now: datetime) -> set:
    rows = db.query(EmailLog.user_id).filter(EmailLog.sent_at > now - MIN_GAP, EmailLog.ok.is_(True)).distinct()
    return {r[0] for r in rows}


def _already(db, kind: str) -> set:
    return {r[0] for r in db.query(EmailLog.user_id).filter(EmailLog.kind == kind)}


def activation_candidates(db, now: datetime):
    """[(user, kind)] -- seriyaning navbatdagi xati. Biror narsa yuborgan (dublaj,
    subtitr yoki tahlil) foydalanuvchi seriyadan chiqadi."""
    used = or_(
        exists().where(DubbingJob.user_id == User.id),
        exists().where(VideoAnalysis.user_id == User.id),
    )
    users = _eligible_users(db).filter(~used, User.created_at > now - ACTIVATION_MAX_AGE).all()
    sent = {}
    for uid, kind in db.query(EmailLog.user_id, EmailLog.kind).filter(EmailLog.kind.like("activate_%")):
        sent.setdefault(uid, set()).add(kind)
    out = []
    for u in users:
        done = sent.get(u.id, set())
        for kind, day in ACTIVATION_STEPS:
            if kind in done:
                continue
            if u.created_at and now - u.created_at >= timedelta(days=day):
                out.append((u, kind))
            break  # faqat navbatdagi qadam
    return out


def quota_candidates(db, now: datetime):
    """Bepul tarif, joriy davrda 5 daqiqa tugagan, sotib olingan daqiqasi yo'q, oxirgi 14 kunda faol."""
    rows = (
        _eligible_users(db)
        .join(Subscription, Subscription.user_id == User.id)
        .filter(
            Subscription.plan == PlanTier.FREE,
            Subscription.monthly_minutes_used >= FREE_MONTHLY_MINUTES,
            func.coalesce(Subscription.purchased_minutes, 0) <= 0,
            User.last_active_at > now - timedelta(days=14),
        )
        .with_entities(User, Subscription.period_started_at)
        .all()
    )
    out = []
    for user, period_start in rows:
        kind = f"quota:{(period_start or user.created_at or now):%Y-%m-%d}"
        out.append((user, kind))
    return out


def news_kind(now: datetime) -> str:
    y, w, _ = (now + TASHKENT).isocalendar()
    return f"news:{y}-W{w:02d}"


def news_content(db, now: datetime):
    since = now - timedelta(days=7)
    news = db.query(SiteNews).filter(SiteNews.created_at > since).order_by(SiteNews.created_at.desc()).limit(5).all()
    videos = (
        db.query(DubbingJob)
        .filter(DubbingJob.is_public.is_(True), DubbingJob.status == JobStatus.COMPLETED, DubbingJob.published_at > since)
        .order_by(DubbingJob.published_at.desc())
        .limit(4)
        .all()
    )
    return news, videos


# --- Yuborish -----------------------------------------------------------------

def _send(db, user: User, kind: str, subject: str, page: str, text: str, now: datetime) -> str:
    result = deliver_email(user.email.strip(), subject, page, text, list_unsubscribe_headers(unsubscribe_url(user.id)))
    if result != DeliveryResult.RATE_LIMITED:
        # Muvaffaqiyatsiz (yaroqsiz manzil va h.k.) ham yoziladi -- har soatda qayta urinilmasin
        db.add(EmailLog(user_id=user.id, kind=kind, ok=result == DeliveryResult.OK, sent_at=now))
        db.commit()
    return result


def run(db, now: datetime | None = None, daily_limit: int | None = None, dry_run: bool = False) -> dict:
    """Bir marta ishga tushirish (cron har soatda). Returns {"sent", "failed", "skipped", "reason"}."""
    now = now or datetime.utcnow()
    daily_limit = settings.EMAIL_DAILY_LIMIT if daily_limit is None else daily_limit
    stats = {"sent": 0, "failed": 0, "planned": 0, "reason": ""}

    day_start = (now + TASHKENT).replace(hour=0, minute=0, second=0, microsecond=0) - TASHKENT
    sent_today = db.query(func.count(EmailLog.id)).filter(EmailLog.sent_at >= day_start).scalar() or 0
    budget = max(0, daily_limit - sent_today)
    if not dry_run:  # dry-run (admin statistikasi) navbatni istalgan vaqtda ko'rsatadi
        if (now + TASHKENT).hour not in SEND_HOURS:
            stats["reason"] = "tungi vaqt"
            return stats
        if budget == 0:
            stats["reason"] = "kunlik limit"
            return stats

    busy = _recently_emailed(db, now)
    queue: list[tuple[User, str, tuple[str, str, str]]] = []

    for user, kind in activation_candidates(db, now):
        if user.id not in busy:
            queue.append((user, kind, activation_email(user, kind)))
            busy.add(user.id)

    for user, kind in quota_candidates(db, now):
        if user.id not in busy and user.id not in _already(db, kind):
            queue.append((user, kind, quota_email(user, kind)))
            busy.add(user.id)

    news, videos = news_content(db, now)
    if news or videos:
        kind = news_kind(now)
        done = _already(db, kind)
        for user in _eligible_users(db).order_by(User.last_active_at.desc().nullslast()).all():
            if user.id not in busy and user.id not in done:
                queue.append((user, kind, news_email(user, kind, news, videos)))
                busy.add(user.id)

    stats["planned"] = len(queue)
    if dry_run:
        stats["reason"] = "dry-run"
        return stats

    for user, kind, (subject, page, text) in queue[:budget]:
        result = _send(db, user, kind, subject, page, text, now)
        if result == DeliveryResult.OK:
            stats["sent"] += 1
        elif result == DeliveryResult.RATE_LIMITED:
            stats["reason"] = "Resend limiti (429)"
            break
        else:
            stats["failed"] += 1
    if not stats["reason"] and len(queue) > budget:
        stats["reason"] = f"kunlik limit: {len(queue) - budget} ta keyingi kunlarga qoldi"
    return stats
