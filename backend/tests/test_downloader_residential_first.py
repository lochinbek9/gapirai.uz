"""2026-08-27 residential-first ingestion path regression tests.

Root context: a controlled, isolated 12-video experiment measured
cookies-direct and datacenter+mweb at 0/4 eventual success each, versus
residential+mweb at 3/4 eventual success (2/4 first-attempt). This
replaced the old datacenter -> residential -> no-cookies -> no-cookies-
residential escalation chain with: residential is the ONLY path, with
exactly one bounded retry on that same path, no cross-tier escalation.
"""
import unittest
from contextlib import contextmanager
from unittest.mock import patch, MagicMock

from backend.services import downloader
from backend.config import get_settings

settings = get_settings()


def _tracking_get_yt_dlp(call_log):
    @contextmanager
    def _fake(extra=None, use_cookies=True, proxy_url=None):
        call_log.append({"proxy_url": proxy_url, "use_cookies": use_cookies, "extra": extra})
        yield MagicMock()
    return _fake


class TestResidentialFirstOrdering(unittest.TestCase):
    """1. Residential-first ordering + 3. datacenter never attempted."""

    def test_first_attempt_uses_residential_proxy_not_datacenter(self):
        call_log = []
        action = MagicMock(return_value="ok")
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            result = downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(len(call_log), 1, "a clean success must make exactly one attempt")
        self.assertEqual(call_log[0]["proxy_url"], settings.YOUTUBE_RESIDENTIAL_PROXY_URL)
        self.assertTrue(call_log[0]["use_cookies"], "cookie loading support stays intact, just not primary-deciding")

    def test_datacenter_proxy_never_used_across_retry_and_failure_paths(self):
        """Covers the success path, the one-retry-then-succeed path, and the
        exhausted-retry-then-fail path -- datacenter must never appear as
        proxy_url in any of them. Local dev has neither proxy configured
        (both blank), which would make a bare inequality check trivially
        pass/fail on empty strings -- patch in distinct fake values so this
        test is meaningful in any environment."""
        scenarios = [
            MagicMock(return_value="ok"),
            MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden"), "ok"]),
            MagicMock(side_effect=RuntimeError("HTTP Error 403: Forbidden")),
        ]
        for action in scenarios:
            call_log = []
            with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
                 patch("backend.services.downloader.settings.YOUTUBE_PROXY_URL", "http://fake-datacenter-proxy"), \
                 patch("backend.services.downloader.settings.YOUTUBE_RESIDENTIAL_PROXY_URL", "http://fake-residential-proxy"), \
                 patch("backend.services.downloader.time.sleep"):
                try:
                    downloader._residential_attempt(action, use_cookies=True)
                except Exception:
                    pass
            self.assertGreater(len(call_log), 0)
            for call in call_log:
                self.assertNotEqual(call["proxy_url"], "http://fake-datacenter-proxy", "datacenter must never be attempted")
                self.assertEqual(call["proxy_url"], "http://fake-residential-proxy")

    def test_get_video_info_routes_through_residential_when_data_api_unavailable(self):
        """End-to-end wiring check on the actual public function, not just
        the helper in isolation."""
        call_log = []
        with patch("backend.services.downloader._get_video_info_via_api", return_value=None), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader._extract_info_dict", return_value={"title": "t", "duration": 5}):
            result = downloader.get_video_info("https://youtube.com/watch?v=test")
        self.assertEqual(result["title"], "t")
        self.assertEqual(len(call_log), 1)
        self.assertEqual(call_log[0]["proxy_url"], settings.YOUTUBE_RESIDENTIAL_PROXY_URL)


class TestBoundedRetry(unittest.TestCase):
    """2. Up to _RESIDENTIAL_MAX_ATTEMPTS total attempts on the same path --
    never more, never escalating, and never retrying a non-retryable error."""

    def test_retryable_failure_gets_retried_then_succeeds(self):
        call_log = []
        action = MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden"), "ok"])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep"):
            result = downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(action.call_count, 2)
        self.assertEqual(len(call_log), 2, "must retry on the same (residential) path")

    def test_retryable_failure_raises_after_exactly_max_attempts_total(self):
        call_log = []
        action = MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden")] * downloader._RESIDENTIAL_MAX_ATTEMPTS)
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep"):
            with self.assertRaises(RuntimeError):
                downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(
            action.call_count, downloader._RESIDENTIAL_MAX_ATTEMPTS,
            "must not retry beyond _RESIDENTIAL_MAX_ATTEMPTS total attempts (no infinite proxy escalation)"
        )

    def test_third_attempt_succeeds_within_max_attempts(self):
        """Proves the raised max isn't just cosmetic -- a failure that would
        have exhausted the OLD 2-attempt bound now gets a real 3rd try."""
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("HTTP Error 403: Forbidden"),
            RuntimeError("HTTP Error 403: Forbidden"),
            "ok",
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep"):
            result = downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(action.call_count, 3)

    def test_non_retryable_failure_does_not_retry_at_all(self):
        """AUTH_ERROR/VIDEO_UNAVAILABLE/PROXY_BILLING_ERROR must fail
        immediately -- matches the existing no-blind-retry rule used
        elsewhere in this pipeline (tasks.py, analysis_tasks.py)."""
        call_log = []
        action = MagicMock(side_effect=RuntimeError("Sign in to confirm you're not a bot"))
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep") as mock_sleep:
            with self.assertRaises(RuntimeError):
                downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(action.call_count, 1, "a non-retryable error must not trigger the bounded retry")
        mock_sleep.assert_not_called()


class TestCookieSessionInvalidClassification(unittest.TestCase):
    """4. Invalid-cookie signal is classified distinctly from generic
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
            # assertLogs itself raises AssertionError when nothing was
            # logged -- this proves unrelated yt-dlp chatter is silently
            # dropped, matching the prior quiet/no_warnings behavior.
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
        """_cookies_are_stale() (file-age) and _CookieSessionLogger
        (server-side session validity) are deliberately independent --
        freshness must never be treated as proof of validity."""
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
