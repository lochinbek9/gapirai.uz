"""backend/services/proxy_manager.py -- the multi-endpoint chain that
replaced downloader._residential_attempt() (2026-09-04). Covers: bounded
same-endpoint retry, non-retryable failures moving to the next endpoint
instead of retrying, VIDEO_UNAVAILABLE aborting the whole chain, billing
errors cooling down just the one endpoint, pool rotation, the empty
datacenter pool being skipped by default, and PROXY_MAX_RETRIES capping
how many endpoints get tried.

Uses the real local Redis (same convention as test_minute_quota.py using
the real local Postgres) -- proxy_manager's own keys all live under the
"proxy:" prefix, flushed before/after each test so runs don't interfere
with each other or with anything else using the same Redis instance.
"""
import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from redis import Redis

from backend.config import get_settings
from backend.services import proxy_manager

settings = get_settings()


def _flush_proxy_keys():
    r = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    for key in r.scan_iter("proxy:*"):
        r.delete(key)


def _tracking_get_yt_dlp(call_log, side_effect=None):
    calls = iter(side_effect) if side_effect is not None else None

    @contextmanager
    def _fake(extra=None, use_cookies=True, proxy_url=None):
        call_log.append(proxy_url)
        if calls is not None:
            outcome = next(calls)
            if isinstance(outcome, Exception):
                raise outcome
        yield MagicMock()
    return _fake


class ProxyManagerTestCase(unittest.TestCase):
    def setUp(self):
        self._patchers = [
            patch.object(settings, "YOUTUBE_PROXY_ENABLED", False),
            patch.object(settings, "YOUTUBE_PROXY_URL", ""),
            patch.object(settings, "YOUTUBE_RESIDENTIAL_PROXY_URL", ""),
        ]
        for p in self._patchers:
            p.start()
        _flush_proxy_keys()

    def tearDown(self):
        _flush_proxy_keys()
        for p in reversed(self._patchers):
            p.stop()


class TestDirectOnlyDefault(ProxyManagerTestCase):
    """PROXY_ENABLED=False (the default on a fresh install) -- only the
    direct attempt runs, matching pre-proxy-manager behavior exactly."""

    def test_success_on_direct_makes_exactly_one_attempt(self):
        call_log = []
        action = MagicMock(return_value="ok")
        with patch.object(settings, "PROXY_ENABLED", False), \
             patch.object(settings, "PROXY_DIRECT_FIRST", True), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            result = proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(call_log, [""], "direct means an explicit empty proxy_url, never None")


class TestBoundedRetry(ProxyManagerTestCase):
    def test_retryable_failure_gets_exactly_one_retry_on_same_endpoint_then_succeeds(self):
        call_log = []
        action = MagicMock(side_effect=[RuntimeError("HTTP Error 403: Forbidden"), "ok"])
        with patch.object(settings, "PROXY_ENABLED", False), \
             patch.object(settings, "PROXY_DIRECT_FIRST", True), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.proxy_manager.time.sleep"):
            result = proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(call_log, ["", ""], "must retry exactly once, on the SAME (direct) endpoint")

    def test_non_retryable_failure_does_not_retry_and_raises_immediately(self):
        call_log = []
        action = MagicMock(side_effect=RuntimeError("Sign in to confirm you're not a bot"))
        with patch.object(settings, "PROXY_ENABLED", False), \
             patch.object(settings, "PROXY_DIRECT_FIRST", True), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.proxy_manager.time.sleep") as mock_sleep:
            with self.assertRaises(RuntimeError):
                proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(len(call_log), 1, "AUTH_ERROR must not trigger the bounded same-endpoint retry")
        mock_sleep.assert_not_called()


class TestVideoUnavailableAbortsChain(ProxyManagerTestCase):
    def test_video_unavailable_stops_immediately_even_with_more_endpoints_configured(self):
        call_log = []
        action = MagicMock(side_effect=RuntimeError("Video unavailable"))
        with patch.object(settings, "PROXY_ENABLED", True), \
             patch.object(settings, "PROXY_DIRECT_FIRST", True), \
             patch.object(settings, "DATACENTER_PROXIES", ""), \
             patch.object(settings, "RESIDENTIAL_PROXIES", "http://u:p@res1:8080,http://u:p@res2:8080"), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            with self.assertRaises(RuntimeError):
                proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(len(call_log), 1, "a genuinely unavailable video must abort the whole chain, not escalate")


class TestNonRetryableMovesToNextEndpoint(ProxyManagerTestCase):
    def test_auth_error_on_first_residential_proxy_moves_to_second_which_succeeds(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Sign in to confirm you're not a bot"),
            "ok",
        ])
        with patch.object(settings, "PROXY_ENABLED", True), \
             patch.object(settings, "PROXY_DIRECT_FIRST", False), \
             patch.object(settings, "DATACENTER_PROXIES", ""), \
             patch.object(settings, "RESIDENTIAL_PROXIES", "http://u:p@res1:8080,http://u:p@res2:8080"), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            result = proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(result, "ok")
        self.assertEqual(len(call_log), 2, "no same-endpoint retry on AUTH_ERROR, but the chain must move on")
        self.assertNotEqual(call_log[0], call_log[1], "the second attempt must be a DIFFERENT endpoint")


class TestBillingErrorCoolsDownJustThatEndpoint(ProxyManagerTestCase):
    def test_billing_error_skips_to_next_endpoint_without_retrying_and_cools_down_the_first(self):
        call_log = []
        action = MagicMock(side_effect=[
            RuntimeError("Tunnel connection failed: 402 Payment Required"),
            "ok",
        ])
        with patch.object(settings, "PROXY_ENABLED", True), \
             patch.object(settings, "PROXY_DIRECT_FIRST", False), \
             patch.object(settings, "DATACENTER_PROXIES", ""), \
             patch.object(settings, "RESIDENTIAL_PROXIES", "http://u:p@res1:8080,http://u:p@res2:8080"):
            with patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
                result = proxy_manager.run_with_proxy_chain(action, use_cookies=True)
            self.assertEqual(result, "ok")
            self.assertEqual(len(call_log), 2, "billing error must not consume the same-endpoint retry")
            self.assertNotEqual(call_log[0], call_log[1])

            stats = proxy_manager.get_stats()
        cooled_down = [v for v in stats.values() if v["cooldown_until"] is not None]
        self.assertEqual(len(cooled_down), 1, "exactly the depleted endpoint must be in cooldown")


class TestDatacenterSkippedWhenEmpty(ProxyManagerTestCase):
    def test_empty_datacenter_pool_is_never_attempted(self):
        call_log = []
        action = MagicMock(return_value="ok")
        with patch.object(settings, "PROXY_ENABLED", True), \
             patch.object(settings, "PROXY_DIRECT_FIRST", False), \
             patch.object(settings, "DATACENTER_PROXIES", ""), \
             patch.object(settings, "RESIDENTIAL_PROXIES", "http://u:p@res1:8080"), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
            proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        self.assertEqual(call_log, ["http://u:p@res1:8080"])


class TestRotation(ProxyManagerTestCase):
    def test_successive_calls_rotate_the_starting_endpoint(self):
        pool = "http://u:p@res1:8080,http://u:p@res2:8080"
        seen_first_endpoints = []
        for _ in range(2):
            call_log = []
            with patch.object(settings, "PROXY_ENABLED", True), \
                 patch.object(settings, "PROXY_DIRECT_FIRST", False), \
                 patch.object(settings, "DATACENTER_PROXIES", ""), \
                 patch.object(settings, "RESIDENTIAL_PROXIES", pool), \
                 patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)):
                proxy_manager.run_with_proxy_chain(MagicMock(return_value="ok"), use_cookies=True)
            seen_first_endpoints.append(call_log[0])
        self.assertNotEqual(seen_first_endpoints[0], seen_first_endpoints[1],
                            "rotation must pick a different starting proxy on the next call")


class TestMaxRetriesCapsChainLength(ProxyManagerTestCase):
    def test_pool_larger_than_max_retries_is_truncated(self):
        pool = ",".join(f"http://u:p@res{i}:8080" for i in range(10))
        call_log = []
        action = MagicMock(side_effect=RuntimeError("HTTP Error 403: Forbidden"))
        with patch.object(settings, "PROXY_ENABLED", True), \
             patch.object(settings, "PROXY_DIRECT_FIRST", False), \
             patch.object(settings, "DATACENTER_PROXIES", ""), \
             patch.object(settings, "RESIDENTIAL_PROXIES", pool), \
             patch.object(settings, "PROXY_MAX_RETRIES", 3), \
             patch("backend.services.downloader.get_yt_dlp", side_effect=_tracking_get_yt_dlp(call_log)), \
             patch("backend.services.proxy_manager.time.sleep"):
            with self.assertRaises(RuntimeError):
                proxy_manager.run_with_proxy_chain(action, use_cookies=True)
        # 3 endpoints allowed, one bounded retry each (403 is retryable) = 6 calls max
        distinct_endpoints = len(set(call_log))
        self.assertLessEqual(distinct_endpoints, 3, "must not try more than PROXY_MAX_RETRIES distinct endpoints")


if __name__ == "__main__":
    unittest.main()
