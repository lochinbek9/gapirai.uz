#!/usr/bin/env python3
"""
Gemini Quota & Cooldown Inspector (CLI)
Har qanday vaqtda barcha API kalitlar va modellar bo'yicha kvota holati,
qolgan vaqt va statistikalarni terminalda chiroyli ko'rsatadi.

Foydalanish:
  python backend/scripts/check_gemini_quota.py
yoki docker ichida:
  docker exec dubber_backend python backend/scripts/check_gemini_quota.py
"""
import sys
import os

# Project root import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.services.gemini_quota_manager import get_gemini_quota_status, get_all_gemini_api_keys

def main():
    status = get_gemini_quota_status()
    total_keys = status["total_keys"]
    active_slots = status["total_active_slots"]
    cooldown_slots = status["total_cooldown_slots"]

    print("\n" + "=" * 90)
    print("                     GEMINI API KVOTA VA STATISTIKA MONITORI")
    print("=" * 90)
    print(f" Jami topilgan API kalitlar: {total_keys} ta")
    print(f" Faol model slotlari (so'rovga tayyor): {active_slots}")
    print(f" Kutishdagi model slotlari (cooldown): {cooldown_slots}")
    print("-" * 90)

    for i, key_data in enumerate(status["keys"], start=1):
        masked_key = key_data["key_masked"]
        print(f"\n[{i}-API KALIT: {masked_key}]")
        print(f"{'Model':<30} | {'Holat':<10} | {'Muvaffaqiyat':<12} | {'429 Limit':<10} | {'Qolgan vaqt / Sabab'}")
        print("-" * 90)

        for m in key_data["models"]:
            name = m["model"]
            is_avail = m["available"]
            st_text = "FAOL" if is_avail else "KUTISHDA"
            succ = m["success_count"]
            lim = m["rate_limit_count"]
            rem_h = m["remaining_human"]
            reason = m["last_reason"][:35] if m["last_reason"] else ""
            desc = rem_h if not is_avail else f"Tayyor {reason}"

            print(f"{name:<30} | {st_text:<10} | {succ:<12} | {lim:<10} | {desc}")

    print("\n" + "=" * 90 + "\n")

if __name__ == "__main__":
    main()
