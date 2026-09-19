"""Navbat himoyasi (backend/services/queue_load.py + job_creation.check_queue_capacity).
Bazaga ulanmaydi -- hisoblash funksiyalari va qaror mantig'i mock bilan sinaladi."""
import unittest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services import job_creation, queue_load


def _settings(**overrides):
    base = dict(
        MAX_ACTIVE_JOBS_PER_USER=3,
        QUEUE_WORKER_SLOTS=6,
        QUEUE_AVG_JOB_MINUTES=12.0,
        MAX_QUEUE_WAIT_MINUTES=120,
    )
    base.update(overrides)
    return MagicMock(**base)


class TestEstimateAndFormat(unittest.TestCase):
    @patch.object(queue_load, "get_settings")
    def test_linear_throughput_model(self, gs):
        gs.return_value = _settings()  # 6 o'rin, 12 daqiqa/job -> daqiqasiga 0.5 job
        self.assertEqual(queue_load.estimate_wait_minutes(1), 2)
        self.assertEqual(queue_load.estimate_wait_minutes(6), 12)
        self.assertEqual(queue_load.estimate_wait_minutes(30), 60)

    @patch.object(queue_load, "get_settings")
    def test_zero_slots_does_not_divide_by_zero(self, gs):
        gs.return_value = _settings(QUEUE_WORKER_SLOTS=0)
        self.assertGreaterEqual(queue_load.estimate_wait_minutes(3), 1)

    def test_format_wait(self):
        self.assertEqual(queue_load.format_wait(0), "1 daqiqa")
        self.assertEqual(queue_load.format_wait(7), "7 daqiqa")
        self.assertEqual(queue_load.format_wait(23), "25 daqiqa")   # 5 ga yaxlitlanadi
        self.assertEqual(queue_load.format_wait(60), "1 soat")
        self.assertEqual(queue_load.format_wait(88), "1 soat 30 daqiqa")
        self.assertEqual(queue_load.format_wait(120), "2 soat")


class TestActiveLimit(unittest.TestCase):
    def _db(self, n):
        db = MagicMock()
        db.query.return_value.filter.return_value.count.return_value = n
        return db

    @patch.object(queue_load, "get_settings")
    def test_at_limit_returns_limit(self, gs):
        gs.return_value = _settings(MAX_ACTIVE_JOBS_PER_USER=3)
        self.assertEqual(queue_load.active_limit_reached(self._db(3), uuid.uuid4()), 3)

    @patch.object(queue_load, "get_settings")
    def test_below_limit_is_allowed(self, gs):
        gs.return_value = _settings(MAX_ACTIVE_JOBS_PER_USER=3)
        self.assertIsNone(queue_load.active_limit_reached(self._db(2), uuid.uuid4()))

    @patch.object(queue_load, "get_settings")
    def test_zero_disables_and_never_queries(self, gs):
        gs.return_value = _settings(MAX_ACTIVE_JOBS_PER_USER=0)
        db = MagicMock()
        self.assertIsNone(queue_load.active_limit_reached(db, uuid.uuid4()))
        db.query.assert_not_called()


class TestOverload(unittest.TestCase):
    @patch("backend.services.plans.get_job_queue", return_value="video_processing")
    @patch.object(queue_load, "waiting_total")
    @patch.object(queue_load, "get_settings")
    def test_rejects_only_when_estimate_exceeds_limit(self, gs, waiting, _q):
        gs.return_value = _settings()  # 120 daqiqa chegara, 0.5 job/daqiqa
        waiting.return_value = 59      # yangi job 60-o'rin -> 120 daqiqa: chegaradan OSHMAydi
        self.assertIsNone(queue_load.overload_wait_minutes(MagicMock(), uuid.uuid4()))
        waiting.return_value = 60      # 61-o'rin -> 122 daqiqa: oshadi
        self.assertEqual(queue_load.overload_wait_minutes(MagicMock(), uuid.uuid4()), 122)

    @patch("backend.services.plans.get_job_queue")
    @patch.object(queue_load, "waiting_total", return_value=10_000)
    @patch.object(queue_load, "get_settings")
    def test_priority_users_are_never_rejected_for_queue_length(self, gs, _w, q):
        from backend.services.plans import PRIORITY_QUEUE
        gs.return_value = _settings()
        q.return_value = PRIORITY_QUEUE
        self.assertIsNone(queue_load.overload_wait_minutes(MagicMock(), uuid.uuid4()))

    @patch.object(queue_load, "waiting_total", return_value=10_000)
    @patch.object(queue_load, "get_settings")
    def test_zero_limit_disables(self, gs, _w):
        gs.return_value = _settings(MAX_QUEUE_WAIT_MINUTES=0)
        self.assertIsNone(queue_load.overload_wait_minutes(MagicMock(), uuid.uuid4()))


class TestCheckQueueCapacity(unittest.TestCase):
    @patch.object(queue_load, "overload_wait_minutes", return_value=999)
    @patch.object(queue_load, "active_limit_reached", return_value=3)
    def test_active_limit_takes_precedence(self, _a, _o):
        r = job_creation.check_queue_capacity(MagicMock(), uuid.uuid4())
        self.assertEqual(r.outcome, "active_limit")
        self.assertEqual(r.active_limit, 3)

    @patch.object(queue_load, "overload_wait_minutes", return_value=150)
    @patch.object(queue_load, "active_limit_reached", return_value=None)
    def test_queue_full(self, _a, _o):
        r = job_creation.check_queue_capacity(MagicMock(), uuid.uuid4())
        self.assertEqual(r.outcome, "queue_full")
        self.assertEqual(r.queue_wait_minutes, 150)

    @patch.object(queue_load, "overload_wait_minutes", return_value=None)
    @patch.object(queue_load, "active_limit_reached", return_value=None)
    def test_ok_returns_none(self, _a, _o):
        self.assertIsNone(job_creation.check_queue_capacity(MagicMock(), uuid.uuid4()))

    def test_messages(self):
        a = job_creation.JobCreationResult(outcome="active_limit", active_limit=3)
        self.assertIn("3 ta video", job_creation.queue_rejection_message(a))
        q = job_creation.JobCreationResult(outcome="queue_full", queue_wait_minutes=150)
        self.assertIn("2 soat 30 daqiqa", job_creation.queue_rejection_message(q))


class TestCreateDubbingJobIntegration(unittest.IsolatedAsyncioTestCase):
    """Rad etish YouTube/Safety Gate'dan OLDIN bo'lishi, kesh-hit esa
    tekshiruvdan MUSTASNO bo'lishi kerak."""

    def _user(self):
        u = MagicMock()
        u.id = uuid.uuid4()
        return u

    @patch.object(job_creation, "get_video_info")
    @patch.object(job_creation, "_cached_job_files_exist", return_value=False)
    @patch.object(job_creation, "_daily_job_limit_reached", return_value=False)
    @patch.object(job_creation, "check_queue_capacity")
    async def test_rejected_before_any_youtube_call(self, cap, _daily, _files, gvi):
        cap.return_value = job_creation.JobCreationResult(outcome="queue_full", queue_wait_minutes=200)
        r = await job_creation.create_dubbing_job(
            MagicMock(), self._user(), "https://youtu.be/abc12345678",
        )
        self.assertEqual(r.outcome, "queue_full")
        gvi.assert_not_called()

    @patch.object(job_creation, "_create_job_from_cache", new_callable=AsyncMock)
    @patch.object(job_creation, "_cached_job_files_exist", return_value=True)
    @patch.object(job_creation, "_daily_job_limit_reached", return_value=False)
    @patch.object(job_creation, "check_queue_capacity")
    async def test_cache_hit_is_never_blocked_by_queue(self, cap, _daily, _files, from_cache):
        from_cache.return_value = job_creation.JobCreationResult(outcome="ready", job_id="x")
        r = await job_creation.create_dubbing_job(
            MagicMock(), self._user(), "https://youtu.be/abc12345678",
        )
        self.assertEqual(r.outcome, "ready")
        cap.assert_not_called()


if __name__ == "__main__":
    unittest.main()
