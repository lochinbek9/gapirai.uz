from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional

TASHKENT_TZ = ZoneInfo("Asia/Tashkent")
TASHKENT_OFFSET = timezone(timedelta(hours=5))


def now_tashkent() -> datetime:
    """Return current time in Tashkent (Asia/Tashkent, UTC+5)."""
    return datetime.now(TASHKENT_TZ)


def to_tashkent(dt: Optional[datetime]) -> Optional[datetime]:
    """Convert naive UTC or aware datetime to Tashkent timezone."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TASHKENT_TZ)


def format_tashkent(dt: Optional[datetime], fmt: str = "%Y-%m-%d %H:%M") -> str:
    """Format datetime in Tashkent timezone."""
    t = to_tashkent(dt)
    if not t:
        return ""
    return t.strftime(fmt)


def to_tashkent_iso(dt: Optional[datetime]) -> Optional[str]:
    """Convert datetime to ISO 8601 string in Tashkent timezone (+05:00)."""
    t = to_tashkent(dt)
    if not t:
        return None
    return t.isoformat()
