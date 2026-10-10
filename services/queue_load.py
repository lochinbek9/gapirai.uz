"""Navbat himoyasi -- ko'p foydalanuvchi bir vaqtda job yuborganda sayt qotib
qolmasligi va foydalanuvchi ("nega hech narsa bo'lmayapti?") uchun aniq
holat ko'rsatilishi uchun (2026-09-19).

Uch narsa:
  1. Bitta foydalanuvchining bir vaqtdagi faol joblari chegarasi.
  2. Navbat juda uzun bo'lsa (taxminiy kutish MAX_QUEUE_WAIT_MINUTES'dan
     oshsa) yangi ustuvor-bo'lmagan job'ni rad etish -- soatlab kutdirib
     keyin baribir foydalanuvchini yo'qotgandan ko'ra darhol rost aytish.
  3. Kutayotgan job uchun "navbatda N-o'rin, taxminan M daqiqa" taxmini.

Hammasi Postgres'dagi dubbing_jobs jadvalidan hisoblanadi (Celery/Redis
ichki formatiga bog'lanmasdan). "Eskirgan" (STALE_AFTER'dan qadimgi)
joblar hisobga olinmaydi -- osilib qolgan job foydalanuvchini abadiy
bloklamasin va navbat chuqurligini sun'iy oshirmasin.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.models.database import DubbingJob, JobStatus

# Worker slot band qiladigan (yoki band qilishni kutayotgan) holatlar.
# AWAITING_PAYMENT ishlov bermaydi -- hisobga olinmaydi.
ACTIVE_STATUSES = (
    JobStatus.PENDING,
    JobStatus.DOWNLOADING,
    JobStatus.TRANSCRIBING,
    JobStatus.TRANSLATING,
    JobStatus.SYNCING,
    JobStatus.SYNTHESIZING,
    JobStatus.MERGING,
)

# process_video time_limit'i 8000s (~2.2 soat) + navbat kutishi MAX_QUEUE_WAIT
# (2 soat) -- shundan qadimgi "faol" job haqiqatan osilib qolgan.
STALE_AFTER = timedelta(hours=4)


def _since() -> datetime:
    return datetime.utcnow() - STALE_AFTER


def active_jobs_for_user(db: Session, user_id) -> int:
    return (
        db.query(DubbingJob)
        .filter(
            DubbingJob.user_id == user_id,
            DubbingJob.status.in_(ACTIVE_STATUSES),
            DubbingJob.created_at >= _since(),
        )
        .count()
    )


def active_limit_reached(db: Session, user_id) -> int | None:
    """Foydalanuvchi bir vaqtdagi faol job chegarasiga yetgan bo'lsa shu
    chegarani (int), aks holda None qaytaradi. 0 = o'chirilgan."""
    limit = get_settings().MAX_ACTIVE_JOBS_PER_USER
    if not limit or limit <= 0:
        return None
    return limit if active_jobs_for_user(db, user_id) >= limit else None


def waiting_total(db: Session) -> int:
    """Hali hech qaysi worker olmagan (PENDING) joblar soni."""
    return (
        db.query(DubbingJob)
        .filter(DubbingJob.status == JobStatus.PENDING, DubbingJob.created_at >= _since())
        .count()
    )


def queue_position(db: Session, job: DubbingJob) -> int:
    """PENDING job'ning navbatdagi o'rni (1 = keyingi). Faqat undan oldin
    yaratilgan PENDING joblar sanaladi."""
    ahead = (
        db.query(DubbingJob)
        .filter(
            DubbingJob.status == JobStatus.PENDING,
            DubbingJob.created_at >= _since(),
            DubbingJob.created_at < job.created_at,
        )
        .count()
    )
    return ahead + 1


def estimate_wait_minutes(position: int) -> int:
    """Chiziqli o'tkazuvchanlik modeli: tizim daqiqasiga
    QUEUE_WORKER_SLOTS / QUEUE_AVG_JOB_MINUTES ta job tugatadi. Taxmin --
    aniq va'da emas."""
    s = get_settings()
    slots = max(1, s.QUEUE_WORKER_SLOTS)
    return max(1, round(position * s.QUEUE_AVG_JOB_MINUTES / slots))


def format_wait(minutes: int) -> str:
    """5 daqiqagacha yaxlitlab, o'qishga qulay ko'rinishda: '25 daqiqa',
    '2 soat', '1 soat 30 daqiqa'."""
    minutes = max(1, int(minutes))
    if minutes >= 10:
        minutes = int(5 * round(minutes / 5))
    if minutes < 60:
        return f"{minutes} daqiqa"
    hours, rest = divmod(minutes, 60)
    return f"{hours} soat" if rest == 0 else f"{hours} soat {rest} daqiqa"


def overload_wait_minutes(db: Session, user_id) -> int | None:
    """Navbat haddan tashqari uzun bo'lsa yangi job uchun taxminiy kutish
    (daqiqa), aks holda None. Ustuvor navbat (Pro/Premium) bundan
    MUSTASNO -- ular to'lagan xizmat aynan shu, va ularning joblari
    baribir oddiy navbatdan oldin olinadi (plans.get_job_queue)."""
    limit = get_settings().MAX_QUEUE_WAIT_MINUTES
    if not limit or limit <= 0:
        return None

    from backend.services.plans import PRIORITY_QUEUE, get_job_queue
    if get_job_queue(db, user_id) == PRIORITY_QUEUE:
        return None

    wait = estimate_wait_minutes(waiting_total(db) + 1)
    return wait if wait > limit else None
