"""2026-08-26 ingestion audit, Priority 5/9: bounded retries, no infinite
loops, and no blind retry for error categories where retrying cannot
possibly change the outcome."""
import unittest

from backend.services import error_classification as ec
from backend.workers.tasks import process_video
from backend.workers.analysis_tasks import analyze_video_task


class TestCeleryRetryBounds(unittest.TestCase):
    """These read the actual @celery_app.task(...) decorator arguments --
    if a future change ever removed max_retries (making retries unbounded),
    these fail immediately rather than only being caught by a production
    incident."""

    def test_process_video_has_bounded_retries(self):
        self.assertIsNotNone(process_video.max_retries)
        self.assertGreater(process_video.max_retries, 0)
        self.assertLessEqual(process_video.max_retries, 10)  # sane upper bound, not "basically infinite"

    def test_process_video_has_a_hard_time_limit(self):
        # time_limit forcibly kills the worker process -- a second,
        # independent backstop against a task hanging forever even within
        # a single attempt.
        self.assertIsNotNone(process_video.time_limit)

    def test_analyze_video_task_has_bounded_retries(self):
        self.assertIsNotNone(analyze_video_task.max_retries)
        self.assertGreater(analyze_video_task.max_retries, 0)
        self.assertLessEqual(analyze_video_task.max_retries, 10)

    def test_analyze_video_task_has_a_hard_time_limit(self):
        self.assertIsNotNone(analyze_video_task.time_limit)


class TestNoBlindRetryCategories(unittest.TestCase):
    """The categories where a retry cannot possibly help -- a blocked/stale
    session or a permanently unavailable video will look identical on
    attempt 2, 3, 4, 5. Retrying them anyway just delays the (identical)
    failure and wastes a worker slot."""

    def test_no_retry_categories_are_exactly_the_unfixable_ones(self):
        # AUTH_ERROR (blocked/stale session), VIDEO_UNAVAILABLE (permanently
        # gone), and PROXY_BILLING_ERROR (provider out of balance) share the
        # same property: retrying seconds/minutes later cannot change the
        # outcome. Everything else gets the ordinary bounded retry.
        no_retry_codes = {c for c in [
            ec.AUTH_ERROR, ec.HTTP_403, ec.HTTP_429, ec.EXTRACTOR_ERROR,
            ec.PO_TOKEN_REQUIRED, ec.VIDEO_UNAVAILABLE, ec.NETWORK_ERROR,
            ec.PROXY_ERROR, ec.PROXY_BILLING_ERROR, ec.UPSTREAM_ERROR,
            ec.TIMEOUT, ec.UNKNOWN,
        ] if not ec.should_retry(c)}
        self.assertEqual(no_retry_codes, {ec.AUTH_ERROR, ec.VIDEO_UNAVAILABLE, ec.PROXY_BILLING_ERROR})

    def test_proxy_billing_error_never_retries(self):
        # 2026-08-26 production verification: a live PROXY_BILLING_ERROR
        # (Webshare balance lockout, "402 Payment Required") was observed
        # via a re-enqueued stuck job right after this fix deployed --
        # confirmed this category belongs in the no-retry set, matching the
        # audit's own classification table (it was mistakenly left out of
        # the first implementation pass).
        self.assertFalse(ec.should_retry(ec.PROXY_BILLING_ERROR))

    def test_po_token_required_is_retried_but_bounded(self):
        # PO_TOKEN_REQUIRED gets the ordinary bounded retry (the
        # pot-provider sidecar may just be cold/restarting) -- it must
        # NOT be in the no-retry set, and it must still be bounded by the
        # same Celery max_retries as everything else (verified above).
        self.assertTrue(ec.should_retry(ec.PO_TOKEN_REQUIRED))

    def test_http_429_is_retried_but_bounded(self):
        self.assertTrue(ec.should_retry(ec.HTTP_429))


if __name__ == "__main__":
    unittest.main()
