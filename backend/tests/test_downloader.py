import os
import tempfile
import time
import unittest
from backend.services.downloader import _build_yt_opts, get_yt_dlp, cookie_status, _cookies_are_stale


class TestDownloaderCookies(unittest.TestCase):
    def test_build_yt_opts_with_readonly_cookies(self):
        # Create temporary mock cookies file with read-only permissions
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"# Netscape HTTP Cookie File\n")
            cookie_path = f.name

        os.chmod(cookie_path, 0o444)
        original_cookies_path = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = cookie_path

        try:
            opts, temp_cookie_path = _build_yt_opts()

            assert temp_cookie_path is not None
            assert temp_cookie_path != cookie_path
            assert opts.get("cookiefile") == temp_cookie_path
            assert os.path.exists(temp_cookie_path)
        finally:
            if original_cookies_path is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original_cookies_path
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)

            if temp_cookie_path and os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)
            if os.path.exists(cookie_path):
                os.remove(cookie_path)

    def test_get_yt_dlp_cleanup(self):
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"# Netscape HTTP Cookie File\n")
            cookie_path = f.name

        os.chmod(cookie_path, 0o444)
        original_cookies_path = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = cookie_path

        try:
            created_temp_path = None
            with get_yt_dlp() as ydl:
                created_temp_path = ydl.params.get("cookiefile")
                assert created_temp_path is not None
                assert os.path.exists(created_temp_path)

            # After exiting context manager, temp cookie file must be deleted
            assert not os.path.exists(created_temp_path)
        finally:
            if original_cookies_path is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original_cookies_path
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)

            if os.path.exists(cookie_path):
                os.remove(cookie_path)


class TestCookieFreshness(unittest.TestCase):
    """2026-08-26 audit, Priority 2: cookie availability must be explicit --
    a stale file is treated as absent (existing cookie-less fallback runs)
    rather than blindly trusted, since production's real outage was caused
    by exactly that (a manually-uploaded cookies.txt going stale with
    nothing noticing)."""

    def _make_cookie_file(self, age_hours: float) -> str:
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"# Netscape HTTP Cookie File\n")
            path = f.name
        old_time = time.time() - age_hours * 3600
        os.utime(path, (old_time, old_time))
        return path

    def test_fresh_cookies_are_not_stale(self):
        path = self._make_cookie_file(age_hours=1)
        try:
            self.assertFalse(_cookies_are_stale(path))
        finally:
            os.remove(path)

    def test_old_cookies_are_stale(self):
        # Default threshold is 96h (4 days) -- matches the ingestion audit's
        # recommendation and the real staleness window observed in
        # production (cookies.txt was 6 days old when the AUTH_ERROR
        # cluster occurred).
        path = self._make_cookie_file(age_hours=200)
        try:
            self.assertTrue(_cookies_are_stale(path))
        finally:
            os.remove(path)

    def test_stale_cookies_are_not_used_by_build_yt_opts(self):
        path = self._make_cookie_file(age_hours=200)
        original = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = path
        try:
            opts, temp_cookie_path = _build_yt_opts()
            self.assertIsNone(temp_cookie_path)
            self.assertNotIn("cookiefile", opts)
        finally:
            if original is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)
            os.remove(path)

    def test_cookie_status_reports_absent(self):
        original = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = "/nonexistent/path/cookies.txt"
        try:
            status = cookie_status()
            self.assertFalse(status["present"])
            self.assertFalse(status["fresh"])
            self.assertIsNone(status["age_hours"])
        finally:
            if original is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)

    def test_cookie_status_reports_fresh_present_file(self):
        path = self._make_cookie_file(age_hours=1)
        original = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = path
        try:
            status = cookie_status()
            self.assertTrue(status["present"])
            self.assertTrue(status["fresh"])
            self.assertIsNotNone(status["age_hours"])
        finally:
            if original is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)
            os.remove(path)

    def test_cookie_status_never_includes_cookie_contents(self):
        path = self._make_cookie_file(age_hours=1)
        original = os.getenv("YOUTUBE_COOKIES_PATH")
        os.environ["YOUTUBE_COOKIES_PATH"] = path
        try:
            status = cookie_status()
            self.assertEqual(set(status.keys()), {"present", "fresh", "age_hours"})
        finally:
            if original is not None:
                os.environ["YOUTUBE_COOKIES_PATH"] = original
            else:
                os.environ.pop("YOUTUBE_COOKIES_PATH", None)
            os.remove(path)


class TestPlayerClientOrder(unittest.TestCase):
    """2026-08-27 audit: yt-dlp itself detects a YouTube-side experiment
    that binds a usable GVS PO Token only to the mweb client -- ios/android
    requests get no usable token and are skipped by yt-dlp with an explicit
    "may yield HTTP Error 403" warning (confirmed live in production).
    With the old ["ios", "android", "mweb"] order, every single call wasted
    a request on ios (and often android) before ever reaching the client
    that actually works. mweb must be tried first."""

    def test_mweb_is_tried_first(self):
        opts, temp_cookie_path = _build_yt_opts()
        try:
            player_client = opts["extractor_args"]["youtube"]["player_client"]
            self.assertEqual(player_client[0], "mweb", "mweb must be first -- it's the only client currently getting a usable PO-token")
            # ios/android stay as fallbacks -- not removed, just deprioritized.
            self.assertIn("ios", player_client)
            self.assertIn("android", player_client)
        finally:
            if temp_cookie_path and os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)

    def test_web_client_still_excluded(self):
        # Unrelated to this fix, but a regression here would silently
        # reintroduce the 2026-08-13 "Requested format is not available"
        # failure mode -- cheap to keep covered.
        opts, temp_cookie_path = _build_yt_opts()
        try:
            player_client = opts["extractor_args"]["youtube"]["player_client"]
            self.assertNotIn("web", player_client)
        finally:
            if temp_cookie_path and os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)


class TestJsRuntimeWiring(unittest.TestCase):
    """2026-08-26 audit, Priority 7: Deno/EJS were installed in the Docker
    image specifically for signature/n-parameter decoding but never reached
    the Python API path that actually runs -- confirm the fix stuck."""

    def test_js_runtimes_and_remote_components_are_set(self):
        opts, temp_cookie_path = _build_yt_opts()
        try:
            self.assertEqual(opts.get("js_runtimes"), {"deno": {}})
            self.assertEqual(opts.get("remote_components"), ["ejs:github"])
        finally:
            if temp_cookie_path and os.path.exists(temp_cookie_path):
                os.remove(temp_cookie_path)


if __name__ == "__main__":
    unittest.main()
