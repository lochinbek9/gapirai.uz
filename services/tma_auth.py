"""Telegram Mini App (`window.Telegram.WebApp.initData`) tekshiruvi.

initData -- bot tomonidan HMAC-SHA256 bilan imzolangan URL-query satr.
Telegram rasmiy algoritmi (https://core.telegram.org/bots/webapps
#validating-data-received-via-the-mini-app):

    secret_key    = HMAC_SHA256(key="WebAppData", msg=<bot_token>)
    data_check_str = "\\n".join(f"{k}={v}" for k,v in sorted(pairs) if k != "hash")
    calc_hash     = HMAC_SHA256(key=secret_key, msg=data_check_str).hexdigest()
    -> calc_hash == <received hash>

Bot tokeni bilan imzolangani uchun, tekshiruv o'tsa foydalanuvchi
haqiqatan shu botning Mini App'ini ochgan -- alohida parol/SMS shart emas
(bot `handle_contact` telefon orqali qilgani bilan bir xil ishonch darajasi,
bu yerda telefon o'rniga Telegram user id).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from backend.config import get_settings

settings = get_settings()

# initData qancha "eski" bo'lsa ham qabul qilinadigan maksimal yosh (soniya).
# Telegram auth_date'ni Unix vaqtida beradi. 24 soat -- Mini App ochilgach
# uzoq vaqt ochiq turishi mumkin (WebView keshda), lekin cheksiz emas.
_MAX_AUTH_AGE_SECONDS = 24 * 3600


class InitDataError(Exception):
    """initData yaroqsiz -- imzo mos kelmadi, muddati o'tgan, yoki buzuq."""


def verify_init_data(init_data: str) -> dict:
    """Xom initData satrini tekshiradi va parse qilingan maydonlarni
    (`user` allaqachon dict) qaytaradi. Yaroqsiz bo'lsa InitDataError."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise InitDataError("Bot tokeni sozlanmagan.")
    if not init_data:
        raise InitDataError("initData bo'sh.")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", "")
    if not received_hash:
        raise InitDataError("hash yo'q.")

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs))
    secret_key = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, received_hash):
        raise InitDataError("Imzo mos kelmadi.")

    try:
        auth_date = int(pairs.get("auth_date", "0"))
    except ValueError:
        auth_date = 0
    if auth_date <= 0 or (time.time() - auth_date) > _MAX_AUTH_AGE_SECONDS:
        raise InitDataError("initData muddati o'tgan.")

    user_raw = pairs.get("user")
    if not user_raw:
        raise InitDataError("user maydoni yo'q.")
    try:
        pairs["user"] = json.loads(user_raw)
    except json.JSONDecodeError:
        raise InitDataError("user maydoni buzuq.")

    return pairs
