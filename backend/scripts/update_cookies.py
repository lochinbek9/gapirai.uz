"""
update_cookies.py — CLI tool to validate and update YouTube cookies.txt safely.

Usage:
    PYTHONPATH=. python backend/scripts/update_cookies.py --file path/to/new_cookies.txt
    PYTHONPATH=. python backend/scripts/update_cookies.py --check
"""
from __future__ import annotations
import os
import sys
import argparse
import logging
from backend.services.cookie_manager import check_cookie_health, min_cookie_expiry, _save_cookies_netscape

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("update_cookies")

def validate_cookies_file(filepath: str) -> tuple[bool, str]:
    if not os.path.exists(filepath):
        return False, f"Fayl topilmadi: {filepath}"
    
    if os.path.getsize(filepath) < 100:
        return False, "Fayl hajmi juda kichik (100 baytdan kam). Bu yaroqsiz cookie fayли bo'lishi mumkin."
    
    has_netscape_header = False
    has_youtube_domain = False
    
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
            for line in lines[:10]:
                if "Netscape" in line or "cookie" in line.lower():
                    has_netscape_header = True
                    break
            for line in lines:
                if ".youtube.com" in line or ".google.com" in line:
                    has_youtube_domain = True
                    break
    except Exception as e:
        return False, f"Faylni o'qishda xatolik: {e}"

    if not has_youtube_domain:
        return False, "Faylda .youtube.com yoki .google.com доменлари uchun cookielar topilmadi."

    return True, "Cookie fayли формати тоғри."

def update_cookies_file(source_path: str, target_path: str = "/app/cookies.txt") -> bool:
    is_valid, msg = validate_cookies_file(source_path)
    if not is_valid:
        logger.error(f"Валидация муваффақиятсиз: {msg}")
        return False

    target = target_path if target_path != "/app/cookies.txt" else os.getenv("YOUTUBE_COOKIES_PATH", "/app/cookies.txt")
    try:
        with open(source_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        tmp_target = target + ".tmp"
        with open(tmp_target, "w", encoding="utf-8") as f:
            f.write(content)

        os.replace(tmp_target, target)
        logger.info(f"Cookie fayли муваффақиятли янгиланди: {target}")

        health = check_cookie_health()
        logger.info(
            f"Янги cookie ҳолати: qolgan kun = {health['days_remaining']}, "
            f"hajmi = {health['size']} B, fresh = {health['is_fresh']}"
        )
        return True
    except Exception as e:
        logger.error(f"Cookie fayлини сақлашда хатолик: {e}")
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate and update YouTube cookies.txt")
    parser.add_argument("--file", type=str, help="Path to new Netscape cookies.txt file")
    parser.add_argument("--check", action="store_true", help="Check status of current active cookies.txt")
    args = parser.parse_args()

    if args.check:
        health = check_cookie_health()
        logger.info(f"Cookie holati: {health}")
        sys.exit(0)

    if args.file:
        success = update_cookies_file(args.file)
        sys.exit(0 if success else 1)

    parser.print_help()
