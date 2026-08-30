"""Residential-first YouTube ingestion path tests -- covers _residential_attempt():
its bounded same-path retry, its refusal to ever touch the datacenter proxy,
and the 2026-08-30 no-proxy fallback specifically for PROXY_BILLING_ERROR
(a residential-proxy-account balance exhaustion that no retry can fix, but
which a live production test proved a direct/no-proxy attempt can survive).
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
    """Residential-first ordering + datacenter never attempted."""

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
        """Covers success, one-retry-then-succeed, exhausted-retry-then-fail,
        and the new billing-error no-proxy-fallback path -- datacenter must
        never appear as proxy_url in any of them."""
        scenarios = [
            MagicMock(return_value="ok"),
            MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden"), "ok"]),
            MagicMock(side_effect=RuntimeError("HTTP Error 403: Forbidden")),
            MagicMock(side_effect=RuntimeError("Tunnel connection failed: 402 Payment Required")),
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
    """Exactly one bounded retry on the same path -- never more, never
    escalating, and never retrying a non-retryable error."""

    def test_retryable_failure_gets_exactly_one_retry_then_succeeds(self):
        call_log = []
        action = MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden"), "ok"])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep"):
            result = downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(action.call_count, 2)
        self.assertEqual(len(call_log), 2, "must retry exactly once on the same (residential) path")

    def test_retryable_failure_twice_raises_after_exactly_two_attempts_total(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("HTTP Error 403: Forbidden"),
            RuntimeError("HTTP Error 403: Forbidden"),
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep"):
            with self.assertRaises(RuntimeError):
                downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(action.call_count, 2, "must not retry beyond exactly one bounded retry (no infinite proxy escalation)")

    def test_non_retryable_failure_does_not_retry_at_all(self):
        """AUTH_ERROR/VIDEO_UNAVAILABLE must fail immediately -- matches the
        existing no-blind-retry rule used elsewhere in this pipeline
        (tasks.py, analysis_tasks.py)."""
        call_log = []
        action = MagicMock(side_effect=RuntimeError("Sign in to confirm you're not a bot"))
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep") as mock_sleep:
            with self.assertRaises(RuntimeError):
                downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(action.call_count, 1, "a non-retryable error must not trigger the bounded retry")
        mock_sleep.assert_not_called()


class TestProxyBillingErrorNoProxyFallback(unittest.TestCase):
    """2026-08-30: PROXY_BILLING_ERROR means the residential proxy ACCOUNT is
    out of balance -- no retry on that same path can ever succeed. Verified
    live on production-new the same day that a direct (no-proxy) mweb +
    PO-token request can succeed when this happens. So this ONE error type
    gets a bounded no-proxy fallback instead of the normal same-path retry
    or immediate failure."""

    def test_billing_error_falls_back_to_no_proxy_and_succeeds(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Tunnel connection failed: 402 Payment Required"),
            "ok",
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.time.sleep") as mock_sleep:
            result = downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(action.call_count, 2)
        self.assertEqual(len(call_log), 2)
        self.assertEqual(call_log[0]["proxy_url"], settings.YOUTUBE_RESIDENTIAL_PROXY_URL,
                          "first attempt must still be residential")
        self.assertIsNone(call_log[1]["proxy_url"], "fallback attempt must be no-proxy (None), never datacenter")
        mock_sleep.assert_not_called()

    def test_billing_error_fallback_also_fails_raises_the_fallback_error(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Tunnel connection failed: 402 Payment Required"),
            RuntimeError("Sign in to confirm you're not a bot"),
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            with self.assertRaises(RuntimeError) as ctx:
                downloader._residential_attempt(action, use_cookies=True)
        self.assertIn("not a bot", str(ctx.exception))
        self.assertEqual(action.call_count, 2, "must not retry beyond the one no-proxy fallback attempt")
        self.assertIsNone(call_log[1]["proxy_url"])

    def test_billing_error_does_not_consume_the_normal_bounded_retry(self):
        """The billing-error fallback is a SEPARATE, single attempt -- it
        must not also trigger the normal same-path residential retry (that
        would be three total attempts, not two, and would waste time on a
        path already known to be broken)."""
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Tunnel connection failed: 402 Payment Required"),
            "ok",
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            downloader._residential_attempt(action, use_cookies=True)
        self.assertEqual(action.call_count, 2, "exactly 2 total attempts: residential once, no-proxy once")

    def test_billing_error_fallback_never_uses_datacenter(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Tunnel connection failed: 402 Payment Required"),
            "ok",
        ])
        with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.downloader.settings.YOUTUBE_PROXY_URL", "http://fake-datacenter-proxy"):
            downloader._residential_attempt(action, use_cookies=True)
        for call in call_log:
            self.assertNotEqual(call["proxy_url"], "http://fake-datacenter-proxy")


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
