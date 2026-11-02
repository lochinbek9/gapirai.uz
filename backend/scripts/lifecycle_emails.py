"""Avtomatik xatlar cron -- backend/services/lifecycle_emails.run (faollashtirish
seriyasi, bepul daqiqa tugadi, haftalik yangiliklar).

Ishlatish (har soatda; tungi soatlarda o'zi hech narsa yubormaydi):
    docker compose exec -T backend python -m backend.scripts.lifecycle_emails
Faqat ko'rish (hech narsa yubormaydi):
    docker compose exec -T backend python -m backend.scripts.lifecycle_emails --dry-run
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.models.database import SessionLocal
from backend.services.lifecycle_emails import run


def main() -> int:
    db = SessionLocal()
    try:
        result = run(db, dry_run="--dry-run" in sys.argv)
        print(f"[lifecycle_emails] {result}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
