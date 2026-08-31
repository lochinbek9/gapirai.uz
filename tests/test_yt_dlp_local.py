"""
test_yt_dlp_local.py — Test yt-dlp video metadata extraction locally.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.services.cookie_manager import check_cookie_health
import yt_dlp

TEST_YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"  # "Me at the zoo" (first YouTube video, 19 sec)

def test_yt_dlp_extraction():
    print(f"=== Testing yt-dlp info extraction for URL: {TEST_YOUTUBE_URL} ===")
    
    # Check cookies file health
    health = check_cookie_health()
    print(f"Cookie health status: {health}")

    # Test unauthenticated fallback (player_client: ios/android/mweb)
    print("Testing unauthenticated iOS/Android client fallback...")
    opts_no_cookies = {
        "quiet": True,
        "no_warnings": True,
        "force_ipv4": True,
        "socket_timeout": 15,
        "extractor_args": {
            "youtube": {
                "player_client": ["ios", "android", "mweb"],
            }
        }
    }
    try:
        with yt_dlp.YoutubeDL(opts_no_cookies) as ydl:
            info = ydl.extract_info(TEST_YOUTUBE_URL, download=False)
            title = info.get("title", "Unknown")
            duration = info.get("duration", 0)
            uploader = info.get("uploader", "Unknown")
            
            print("\n[SUCCESS] Successfully extracted YouTube video info using fallback client!")
            print(f"  Title: {title}")
            print(f"  Duration: {duration}s")
            print(f"  Uploader: {uploader}")
            return True
    except Exception as e:
        print(f"\n[FAILED] Error extracting video info: {e}")
        return False

if __name__ == "__main__":
    success = test_yt_dlp_extraction()
    sys.exit(0 if success else 1)
