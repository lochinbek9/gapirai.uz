"""
YouTube cookie manager.
Playwright orqali headless Chrome bilan YouTube ga login qilib,
cookilarni avtomatik yangilab turadi.

2026-08-25 audit tuzatishi (AUDIT_STABILITY.md §2):
- `cookies_are_fresh()` endi sun'iy meta-faylga emas, cookie faylning
  O'ZIDAGI eng kech `expires` qiymatiga qaraydi (meta-fayl eski
  dizaynda konteynerning effemer qatlamida yashardi va qayta ishga
  tushishda yo'qolardi).
- `_save_cookies_netscape()` endi atomik yozadi (tmp + os.replace) —
  yarim yozilgan fayl hech qachon yt-dlp'ga ko'rinmaydi.
- Qo'shildi `min_cookie_expiry()` — tashqi monitoring uchun foydali
  (health-check: "kuки истекут через N дней").
"""
from __future__ import annotations
import asyncio
import json
import os
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

COOKIES_FILE = "/app/cookies.txt"
COOKIES_META_FILE = "/app/cookies_meta.json"
REFRESH_INTERVAL_HOURS = 12  # Har 12 soatda yangilash (meta-fayl eski dizaynidan qolgan)
# Freshness kuki: eng erta expires'dan shuncha kun oldin "eski" deb hisoblanadi.
# YouTube sessiya kukilarining typik qiymati "expires=0" bo'ladi (sessiya) — ular
# hisobga olinmaydi; faqat aniq sanali kukilar (SAPISID/SSID kabi) hisobga olinadi.
COOKIE_FRESH_DAYS = 7


def min_cookie_expiry() -> float:
    """Eng erta (minimal) expires qiymatini qaytaradi (epoch seconds).
    Fayl yo'q yoki sanali kuки yo'q bo'lsa 0 qaytaradi."""
    target = os.getenv("YOUTUBE_COOKIES_PATH", COOKIES_FILE)
    if not os.path.exists(target):
        return 0.0
    expires_vals = []
    try:
        with open(target) as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 5 and parts[4].isdigit():
                    val = int(parts[4])
                    if val > 0:
                        expires_vals.append(val)
    except Exception:
        return 0.0
    return float(min(expires_vals)) if expires_vals else 0.0


def cookies_are_fresh() -> bool:
    """Cookie fayl yengilligi: eng erta expires hali ham COOKIE_FRESH_DAYS
    kelajagida. Bu meta-fayldan emas — fayl o'zida haqiqiy expiry
    (AUDIT_STABILITY.md §2.1)."""
    expiry = min_cookie_expiry()
    if expiry <= 0:
        return False
    return expiry > time.time() + COOKIE_FRESH_DAYS * 86400


def check_cookie_health() -> dict:
    """
    Cookie faylining holatini batafsil tekshirish.
    Qaytaradi: {
        'exists': bool,
        'path': str,
        'size': int,
        'min_expiry': float,
        'days_remaining': float,
        'is_fresh': bool
    }
    """
    target = os.getenv("YOUTUBE_COOKIES_PATH", COOKIES_FILE)
    if not os.path.exists(target):
        return {
            "exists": False,
            "path": target,
            "size": 0,
            "min_expiry": 0.0,
            "days_remaining": 0.0,
            "is_fresh": False,
        }

    size = os.path.getsize(target)
    expiry = min_cookie_expiry()
    now = time.time()
    days_remaining = (expiry - now) / 86400.0 if expiry > now else 0.0

    return {
        "exists": size > 100,
        "path": target,
        "size": size,
        "min_expiry": expiry,
        "days_remaining": round(days_remaining, 1),
        "is_fresh": days_remaining >= COOKIE_FRESH_DAYS,
    }


async def refresh_cookies(youtube_email: str, youtube_password: str) -> bool:
    """
    DEPRECATED / UNSUPPORTED:
    Google'ning xavfsizlik siyosati (Bot Detection) sababli headless Playwright
    orqali avtomatik Google logini bloklanadi.
    Iltimos, cookies.txt faylini brauzerdan ('Get cookies.txt LOCALLY' kengaytmasi)
    eksport qilib серверга yuklang.
    """
    logger.warning(
        "Playwright orqali avtomatik Google logini Google bot-detection "
        "tufayli to'xtatildi. cookies.txt faylini qo'lda янгилаш тавсия этилади."
    )
    return False


def _save_cookies_netscape(cookies: list, filepath: str) -> None:
    """Playwright/Netscape cookilarini faylga atomik yozish (yt-dlp uchun)."""
    lines = ["# Netscape HTTP Cookie File\n"]
    for c in cookies:
        domain = c.get("domain", "")
        include_subdomains = "TRUE" if domain.startswith(".") else "FALSE"
        path = c.get("path", "/")
        secure = "TRUE" if c.get("secure", False) else "FALSE"
        exp_raw = c.get("expires", 0)
        expires = int(exp_raw) if exp_raw and exp_raw > 0 else 0
        name = c.get("name", "")
        value = c.get("value", "")
        lines.append(f"{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")

    tmp_path = filepath + ".tmp"
    with open(tmp_path, "w") as f:
        f.writelines(lines)
    os.replace(tmp_path, filepath)


def get_or_refresh_cookies_sync(email: str = "", password: str = "") -> str | None:
    """
    Sync wrapper — cookie faylini va uning holatini tekshiradi.
    """
    health = check_cookie_health()
    if not health["exists"]:
        logger.warning(f"YouTube cookies.txt fayli topilmadi yoki bo'sh ({health['path']})")
        return None

    if not health["is_fresh"]:
        logger.warning(f"YouTube cookies.txt eskirdi (qolgan kun: {health['days_remaining']}). Yangilash tavsiya etiladi!")

    return health["path"]

