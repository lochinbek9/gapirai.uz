"""
test_local_fixes.py — Standalone local test suite for verifying cookie_manager and update_cookies logic.
"""
from __future__ import annotations
import os
import sys
import tempfile
import time
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.cookie_manager import (
    check_cookie_health,
    min_cookie_expiry,
    get_or_refresh_cookies_sync,
    refresh_cookies,
)
from backend.scripts.update_cookies import validate_cookies_file, update_cookies_file


def test_cookie_validation_and_health():
    print("=== TEST 1: Validating cookie file format and health ===")

    # 1. Test invalid / non-existent file
    is_valid, msg = validate_cookies_file("non_existent_file.txt")
    assert not is_valid, "Should reject non-existent file"
    print("  [OK] Successfully rejected non-existent file")

    # 2. Test valid Netscape cookies file format
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as tmp:
        future_expiry = int(time.time() + 30 * 86400)  # 30 days in future
        tmp.write("# Netscape HTTP Cookie File\n")
        tmp.write(f".youtube.com\tTRUE\t/\tTRUE\t{future_expiry}\tSAPISID\ttest_token_1234567890\n")
        tmp.write(f".google.com\tTRUE\t/\tFALSE\t{future_expiry}\tSID\ttest_sid_val_1234567890\n")
        tmp_path = tmp.name

    try:
        is_valid, msg = validate_cookies_file(tmp_path)
        assert is_valid, f"Should accept valid Netscape file: {msg}"
        print("  [OK] Successfully validated Netscape cookie format")

        # Set env var to test cookie_manager against this temporary file
        os.environ["YOUTUBE_COOKIES_PATH"] = tmp_path
        health = check_cookie_health()
        assert health["exists"] is True, "Health should report exists=True"
        assert health["is_fresh"] is True, "Health should report is_fresh=True for 30-day cookie"
        assert health["days_remaining"] >= 29.0, f"Days remaining should be ~30, got {health['days_remaining']}"
        print(f"  [OK] Health report: {health}")

        # Test updating active cookies file
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as target_tmp:
            target_path = target_tmp.name

        success = update_cookies_file(tmp_path, target_path)
        assert success, "Should successfully update target cookies file"
        assert os.path.getsize(target_path) > 100, "Target file should have non-empty content"
        print("  [OK] Atomic cookie file update succeeded")

        if os.path.exists(target_path):
            os.remove(target_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_deprecated_playwright_graceful_handling():
    print("\n=== TEST 2: Testing deprecated Playwright login fallback ===")
    import asyncio
    res = asyncio.run(refresh_cookies("test@example.com", "password123"))
    assert res is False, "refresh_cookies should return False gracefully without raising exceptions"
    print("  [OK] Playwright refresh_cookies returns False gracefully without crash")


if __name__ == "__main__":
    test_cookie_validation_and_health()
    test_deprecated_playwright_graceful_handling()
    print("\n[SUCCESS] ALL LOCAL VERIFICATION TESTS PASSED SUCCESSFULLY!")
