"""Obunani avtomatik uzaytirish cron — auto_renew=True bo'lgan, muddati
bugun/ertaga tugaydigan yoki grace davridagi obunalarni bog'langan kartadan
uzaytiradi (backend/services/recurring.run_auto_renew).

Ishlatish (kunlik cron, subscription_reminders.py bilan bir xil naqsh):
    PYTHONPATH=. python -m backend.scripts.auto_renew

Yoki docker'da:
    docker compose exec -T backend python -m backend.scripts.auto_renew

Feature-flag CLICK_CARD_TOKEN_ENABLED / PAYME_CARD_TOKEN_ENABLED o'chiq
bo'lsa charge() ishlamaydi — obunalar grace'ga tushib, keyin FREE'ga
o'tishi mumkin, shuning uchun bu cron'ni faqat karta API'lari yoqilgandan
keyin crontab'ga qo'shing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.models.database import SessionLocal
from backend.services.recurring import run_auto_renew


def main() -> int:
    db = SessionLocal()
    try:
        result = run_auto_renew(db)
        print(f"[auto_renew] {result}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
