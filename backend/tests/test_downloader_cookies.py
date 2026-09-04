"""Cookie-session-validity signal tests -- split out of the old
test_downloader_residential_first.py (2026-09-04) when the single-tier
_residential_attempt() it also tested was replaced by
backend/services/proxy_manager.py's multi-endpoint chain (see
test_proxy_manager.py for that half). _CookieSessionLogger, _build_yt_opts,
and _cookies_are_stale are unchanged by that split, so these tests are
unchanged too.
"""
import unittest

from backend.services import downloader


class TestCookieSessionInvalidClassification(unittest.TestCase):
    """Invalid-cookie signal is classified distinctly from generic
    AUTH_ERROR / file-age staleness, without ever logging cookie contents."""

    def test_invalid_cookie_warning_is_logged_with_distinct_marker(self):
        cs_logger = downloader._CookieSessionLogger()
        with self.assertLogs("backend.services.downloader", level="WARNING") as cm:
            cs_logger.warning(
                "The provided YouTube account cookies are no longer valid. "
                "They have likely been rotated in the browser as a security measure."
            )
        self.assertTrue(any("COOKIE_SESSION_INVALID" in msg for msg in cm.output))

    def test_rotated_cookie_phrasing_variant_also_matches(self):
        cs_logger = downloader._CookieSessionLogger()
        with self.assertLogs("backend.services.downloader", level="WARNING") as cm:
            cs_logger.warning("...have likely been rotated in the browser as a security measure...")
        self.assertTrue(any("COOKIE_SESSION_INVALID" in msg for msg in cm.output))

    def test_unrelated_warning_produces_no_log_output(self):
        cs_logger = downloader._CookieSessionLogger()
        with self.assertRaises(AssertionError):
            with self.assertLogs("backend.services.downloader", level="WARNING"):
                cs_logger.warning("Some unrelated yt-dlp warning about formats.")

    def test_debug_info_error_are_always_silent(self):
        cs_logger = downloader._CookieSessionLogger()
        with self.assertRaises(AssertionError):
            with self.assertLogs("backend.services.downloader", level="DEBUG"):
                cs_logger.debug("noisy internal debug line")
                cs_logger.info("noisy internal info line")
                cs_logger.error("noisy internal error line")

    def test_file_freshness_check_has_no_knowledge_of_session_validity_signal(self):
        import inspect
        src = inspect.getsource(downloader._cookies_are_stale)
        self.assertNotIn("CookieSessionLogger", src)
        self.assertNotIn("no longer valid", src)

    def test_cookie_session_logger_is_wired_into_default_opts(self):
        opts, temp_cookie_path = downloader._build_yt_opts()
        try:
            self.assertIsInstance(opts.get("logger"), downloader._CookieSessionLogger)
        finally:
            if temp_cookie_path:
                import os
                if os.path.exists(temp_cookie_path):
                    os.remove(temp_cookie_path)


if __name__ == "__main__":
    unittest.main()
