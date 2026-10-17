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

from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

COOKIES_FILE = "/app/cookies.txt"
COOKIES_UPLOAD_FILE = os.path.join(settings.UPLOAD_DIR, "cookies.txt")
COOKIES_META_FILE = "/app/cookies_meta.json"
REFRESH_INTERVAL_HOURS = 12
COOKIE_FRESH_DAYS = 7


def get_effective_cookies_path() -> str:
    """Eng ustuvor va mavjud cookies fayli yo'lini qaytaradi:
    1. YOUTUBE_COOKIES_PATH (agar o'rnatilgan bo'lsa)
    2. /app/uploads/cookies.txt (admin panel orqali yuklangan dinamik cookies)
    3. Standart /app/cookies.txt
    4. /app/secrets/cookies.txt (doimiy tashqi secrets papkasi)
    """
    env_target = os.getenv("YOUTUBE_COOKIES_PATH")
    if env_target:
        return env_target
    if os.path.isfile(COOKIES_UPLOAD_FILE) and os.path.getsize(COOKIES_UPLOAD_FILE) >= 20:
        return COOKIES_UPLOAD_FILE
    if os.path.isfile(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) >= 20:
        return COOKIES_FILE
    secrets_target = "/app/secrets/cookies.txt"
    if os.path.isfile(secrets_target) and os.path.getsize(secrets_target) >= 20:
        return secrets_target
    return COOKIES_FILE


def min_cookie_expiry(target_path: str | None = None) -> float:
    """Eng erta (minimal) expires qiymatini qaytaradi (epoch seconds).
    Asosiy YouTube/Google auth kuki-lari (LOGIN_INFO, SID, va h.k.) muddati olinadi.
    Eski o'tgan bir martalik tokenlar (masalan ST-*, SOCS) sababli noto'g'ri eskirgan
    deb ko'rsatilishining oldi olingan."""
    target = target_path or get_effective_cookies_path()
    if not os.path.exists(target):
        return 0.0

    AUTH_COOKIE_NAMES = {"LOGIN_INFO", "SID", "__Secure-1PSID", "__Secure-3PSID", "SSID", "HSID"}
    auth_expires = []
    future_expires = []
    all_expires = []
    now = time.time()

    try:
        with open(target, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.startswith("#") or not line.strip():
                    continue
                parts = line.rstrip("\n").split("\t")
                if len(parts) >= 6 and parts[4].isdigit():
                    val = int(parts[4])
                    name = parts[5].strip()
                    if val > 0:
                        all_expires.append(val)
                        if val > now:
                            future_expires.append(val)
                            if name in AUTH_COOKIE_NAMES:
                                auth_expires.append(val)
    except Exception:
        return 0.0

    if auth_expires:
        return float(min(auth_expires))
    if future_expires:
        return float(min(future_expires))
    return float(min(all_expires)) if all_expires else 0.0


def cookies_are_fresh() -> bool:
    """Cookie fayl yengilligi: eng erta expires hali ham COOKIE_FRESH_DAYS
    kelajagida. Bu meta-fayldan emas — fayl o'zida haqiqiy expiry
    (AUDIT_STABILITY.md §2.1)."""
    expiry = min_cookie_expiry()
    if expiry <= 0:
        return False
    return expiry > time.time() + COOKIE_FRESH_DAYS * 86400


def check_cookie_health(notify_on_alert: bool = True) -> dict:
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
    target = get_effective_cookies_path()
    if not os.path.exists(target):
        if notify_on_alert:
            try:
                from backend.services.telegram_notify import send_cookie_expiry_alert
                send_cookie_expiry_alert(0, is_missing=True)
            except Exception:
                pass
        return {
            "exists": False,
            "path": target,
            "size": 0,
            "min_expiry": 0.0,
            "days_remaining": 0.0,
            "is_fresh": False,
            "updated_at": None,
            "cookie_count": 0,
        }

    size = os.path.getsize(target)
    expiry = min_cookie_expiry()
    now = time.time()
    days_remaining = (expiry - now) / 86400.0 if expiry > now else 0.0
    mtime = os.path.getmtime(target)
    updated_at = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")

    # Cookie qatorlari soni
    cookie_count = 0
    try:
        with open(target, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if line.strip() and not line.startswith("#"):
                    cookie_count += 1
    except Exception:
        pass

    res = {
        "exists": size > 50,
        "path": target,
        "size": size,
        "min_expiry": expiry,
        "days_remaining": round(days_remaining, 1),
        "is_fresh": days_remaining >= COOKIE_FRESH_DAYS,
        "updated_at": updated_at,
        "cookie_count": cookie_count,
    }

    if notify_on_alert:
        try:
            from backend.services.telegram_notify import send_cookie_expiry_alert
            if not res["exists"]:
                send_cookie_expiry_alert(0, is_missing=True)
            elif days_remaining <= 3:
                send_cookie_expiry_alert(int(days_remaining), is_missing=False)
        except Exception as e:
            logger.debug(f"Cookie alert yuborilmadi: {e}")

    return res


def save_uploaded_cookies(content: str) -> dict:
    """Foydalanuvchi/admin tomonidan yuklangan Netscape cookies.txt faylini
    /app/uploads/cookies.txt ga xavfsiz va atomik yozadi."""
    content = content.strip()
    if len(content) < 30:
        raise ValueError("Cookie fayli bo'sh yoki juda qisqa")

    # YouTube yoki Google domenlariga oidligini tekshirish
    if "youtube" not in content.lower() and "google" not in content.lower():
        raise ValueError("Yuklangan cookies.txt faylida YouTube yoki Google sessiyalari topilmadi")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    target_path = COOKIES_UPLOAD_FILE
    tmp_path = target_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(content + "\n")
    os.replace(tmp_path, target_path)

    # Shuningdek, agar standart COOKIES_FILE ga ham yozish imkoni bo'lsa (masalan hostda)
    try:
        if os.path.exists(COOKIES_FILE) and os.access(COOKIES_FILE, os.W_OK):
            with open(COOKIES_FILE, "w", encoding="utf-8") as f:
                f.write(content + "\n")
    except Exception as e:
        logger.warning(f"Standart cookies fayliga nusxalab bo'lmadi (readonly mount): {e}")

    return check_cookie_health()


def delete_uploaded_cookies() -> bool:
    """Yuklangan cookies faylini o'chiradi."""
    if os.path.exists(COOKIES_UPLOAD_FILE):
        try:
            os.remove(COOKIES_UPLOAD_FILE)
            return True
        except Exception as e:
            logger.error(f"Cookies faylini o'chirishda xatolik: {e}")
    return False


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

