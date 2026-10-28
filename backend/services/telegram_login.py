"""Saytga Telegram orqali kirish (Telegram Login Widget, 2026-10-28) -- imzo tekshiruvi.

Telegram rasmiy algoritmi (https://core.telegram.org/widgets/login#checking-authorization):

    data_check_string = "\\n".join(f"{k}={v}" for k, v in sorted(fields) if k != "hash")
    secret_key        = SHA256(<bot_token>)          # Mini App'dan farqli: HMAC("WebAppData") EMAS
    hash              = HMAC_SHA256(secret_key, data_check_string).hexdigest()

Bot tokeni bilan imzolangani uchun, tekshiruv o'tsa foydalanuvchi haqiqatan
o'z Telegram'ida shu botga kirishni tasdiqlagan -- parol/SMS shart emas
(tma_auth.py bilan bir xil ishonch darajasi).
"""
from __future__ import annotations

import hashlib
import hmac
import time

from backend.config import get_settings

# Widget ma'lumoti qancha "eski" bo'lsa ham qabul qilinadi (soniya). Foydalanuvchi
# tasdiqlagach darhol yuboriladi -- 1 kun Telegram tavsiyasidan ham qattiqroq emas,
# lekin qayta ishlatish (replay) oynasini cheklaydi.
MAX_AUTH_AGE_SECONDS = 24 * 3600
# Server va Telegram soatlari biroz farq qilishi mumkin
MAX_CLOCK_SKEW_SECONDS = 300

# Imzoga kiradigan maydonlar (Telegram yuboradiganlar). Boshqa kalitlar e'tiborga olinmaydi.
FIELDS = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")


class TelegramLoginError(Exception):
    """Ma'lumot yaroqsiz -- imzo mos kelmadi, muddati o'tgan yoki maydon yo'q."""


def bot_id_from_token(token: str) -> int | None:
    """Bot tokenining birinchi qismi -- ochiq bot ID (sir emas, widget'ga kerak)."""
    head = (token or "").split(":", 1)[0]
    return int(head) if head.isdigit() else None


def verify_login(data: dict, bot_token: str | None = None, now: float | None = None) -> dict:
    """Widget qaytargan maydonlarni tekshiradi; to'g'ri bo'lsa -- ularni qaytaradi."""
    token = bot_token if bot_token is not None else get_settings().TELEGRAM_BOT_TOKEN
    if not token:
        raise TelegramLoginError("Telegram orqali kirish sozlanmagan.")
    received = str(data.get("hash") or "")
    if not received:
        raise TelegramLoginError("Imzo yo'q.")

    fields = {k: str(data[k]) for k in FIELDS if data.get(k) not in (None, "")}
    if "id" not in fields or "auth_date" not in fields:
        raise TelegramLoginError("Maydonlar to'liq emas.")

    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hashlib.sha256(token.encode()).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise TelegramLoginError("Imzo mos kelmadi.")

    try:
        auth_date = int(fields["auth_date"])
    except ValueError:
        raise TelegramLoginError("auth_date buzuq.")
    age = (now if now is not None else time.time()) - auth_date
    if age > MAX_AUTH_AGE_SECONDS or age < -MAX_CLOCK_SKEW_SECONDS:
        raise TelegramLoginError("Kirish muddati o'tgan. Qaytadan urinib ko'ring.")
    return fields
