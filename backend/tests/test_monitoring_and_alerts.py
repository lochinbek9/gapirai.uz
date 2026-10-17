import unittest
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from backend.services import health_check
from backend.services import telegram_notify


class TestHealthCheckService(unittest.TestCase):
    @patch("backend.models.database.SessionLocal")
    def test_check_db_healthy(self, mock_session_cls):
        mock_session = MagicMock()
        mock_session_cls.return_value = mock_session
        res = health_check.check_db()
        self.assertEqual(res["status"], "healthy")
        self.assertIn("latency_ms", res)
        mock_session.close.assert_called_once()

    @patch("backend.models.database.SessionLocal")
    def test_check_db_unhealthy(self, mock_session_cls):
        mock_session_cls.side_effect = RuntimeError("DB connection timeout")
        res = health_check.check_db()
        self.assertEqual(res["status"], "unhealthy")
        self.assertIn("error", res)

    @patch("redis.Redis.from_url")
    def test_check_redis_healthy(self, mock_redis_cls):
        mock_r = MagicMock()
        mock_r.ping.return_value = True
        mock_redis_cls.return_value = mock_r
        res = health_check.check_redis()
        self.assertEqual(res["status"], "healthy")
        self.assertIn("latency_ms", res)

    @patch("redis.Redis.from_url")
    def test_check_redis_unhealthy(self, mock_redis_cls):
        mock_r = MagicMock()
        mock_r.ping.side_effect = RuntimeError("Redis down")
        mock_redis_cls.return_value = mock_r
        res = health_check.check_redis()
        self.assertEqual(res["status"], "unhealthy")
        self.assertIn("error", res)

    @patch("shutil.disk_usage")
    def test_check_disk_healthy(self, mock_disk):
        # 100 GB total, 80 GB free (20% used)
        mock_disk.return_value = SimpleNamespace(
            total=100 * (1024 ** 3),
            free=80 * (1024 ** 3),
            used=20 * (1024 ** 3),
        )
        res = health_check.check_disk(notify_if_low=False)
        self.assertEqual(res["status"], "healthy")
        self.assertEqual(res["free_gb"], 80.0)

    @patch("shutil.disk_usage")
    @patch("backend.services.telegram_notify.send_disk_space_alert")
    def test_check_disk_critical_triggers_alert(self, mock_alert, mock_disk):
        # 100 GB total, 2 GB free (98% used)
        mock_disk.return_value = SimpleNamespace(
            total=100 * (1024 ** 3),
            free=2 * (1024 ** 3),
            used=98 * (1024 ** 3),
        )
        res = health_check.check_disk(notify_if_low=True)
        self.assertEqual(res["status"], "critical")
        mock_alert.assert_called_once()

    @patch("backend.workers.celery_app.celery_app.control.ping")
    def test_check_celery_workers_healthy(self, mock_ping):
        mock_ping.return_value = [{"celery@worker-1": {"ok": "pong"}}]
        res = health_check.check_celery_workers()
        self.assertEqual(res["status"], "healthy")
        self.assertEqual(res["worker_count"], 1)

    @patch("backend.workers.celery_app.celery_app.control.ping")
    def test_check_celery_workers_none_active(self, mock_ping):
        mock_ping.return_value = []
        res = health_check.check_celery_workers()
        self.assertEqual(res["status"], "warning")
        self.assertEqual(res["worker_count"], 0)

    @patch("backend.services.cookie_manager.check_cookie_health")
    def test_check_youtube_cookies_expiring(self, mock_cookie_health):
        mock_cookie_health.return_value = {
            "exists": True,
            "days_remaining": 2.0,
            "is_fresh": False,
        }
        res = health_check.check_youtube_cookies(notify_if_expiring=False)
        self.assertEqual(res["status"], "warning")
        self.assertIn("oz qoldi", res["message"])

    @patch("backend.services.health_check.check_db")
    @patch("backend.services.health_check.check_redis")
    def test_check_system_health_fast_mode(self, mock_redis, mock_db):
        mock_db.return_value = {"status": "healthy", "latency_ms": 1.2}
        mock_redis.return_value = {"status": "healthy", "latency_ms": 0.5}

        res = health_check.check_system_health(detailed=False)
        self.assertEqual(res["status"], "healthy")
        self.assertIn("database", res["components"])
        self.assertIn("redis", res["components"])
        self.assertNotIn("disk", res["components"])

    @patch("backend.services.health_check.check_db")
    @patch("backend.services.health_check.check_redis")
    def test_check_system_health_unhealthy_when_db_down(self, mock_redis, mock_db):
        mock_db.return_value = {"status": "unhealthy", "error": "down"}
        mock_redis.return_value = {"status": "healthy", "latency_ms": 0.5}

        res = health_check.check_system_health(detailed=False)
        self.assertEqual(res["status"], "unhealthy")


class TestTelegramAlertsAndThrottling(unittest.TestCase):
    @patch("redis.Redis.from_url")
    def test_should_throttle_alert(self, mock_redis_cls):
        mock_r = MagicMock()
        mock_redis_cls.return_value = mock_r

        # First call: key is set (nx=True returns True) -> not throttled (returns False)
        mock_r.set.return_value = True
        self.assertFalse(telegram_notify.should_throttle_alert("test_key", throttle_seconds=60))

        # Second call: key already exists (nx=True returns None) -> throttled (returns True)
        mock_r.set.return_value = None
        self.assertTrue(telegram_notify.should_throttle_alert("test_key", throttle_seconds=60))

    @patch("backend.services.telegram_notify.send_telegram_message")
    @patch("backend.services.telegram_notify.should_throttle_alert", return_value=True)
    def test_send_alert_to_admins_skips_when_throttled(self, mock_throttle, mock_send_msg):
        with patch("backend.services.telegram_notify.get_settings", return_value=SimpleNamespace(ADMIN_TG_IDS="123")):
            res = telegram_notify.send_alert_to_admins("test alert", alert_key="throttled_key")
            self.assertFalse(res)
            mock_send_msg.assert_not_called()

    @patch("backend.services.telegram_notify.send_telegram_message", return_value=True)
    @patch("backend.services.telegram_notify.should_throttle_alert", return_value=False)
    def test_send_alert_to_admins_sends_when_not_throttled(self, mock_throttle, mock_send_msg):
        with patch("backend.services.telegram_notify.get_settings", return_value=SimpleNamespace(ADMIN_TG_IDS="123,456")):
            res = telegram_notify.send_alert_to_admins("test alert", alert_key="new_key")
            self.assertTrue(res)
            self.assertEqual(mock_send_msg.call_count, 2)

    @patch("backend.services.telegram_notify.send_alert_to_admins")
    def test_send_disk_space_alert(self, mock_send_alert):
        telegram_notify.send_disk_space_alert(3.5, 100.0, 96.5)
        mock_send_alert.assert_called_once()
        args, kwargs = mock_send_alert.call_args
        self.assertIn("3.5 GB", args[0])
        self.assertEqual(kwargs["alert_key"], "disk_space_critical")

    @patch("backend.services.telegram_notify.send_alert_to_admins")
    def test_send_cookie_expiry_alert_missing(self, mock_send_alert):
        telegram_notify.send_cookie_expiry_alert(0, is_missing=True)
        mock_send_alert.assert_called_once()
        args, kwargs = mock_send_alert.call_args
        self.assertIn("topilmadi", args[0])
        self.assertEqual(kwargs["alert_key"], "cookie_missing")

    @patch("backend.services.telegram_notify.send_alert_to_admins")
    def test_send_worker_restart_alert(self, mock_send_alert):
        telegram_notify.send_worker_restart_alert("dubber_worker", "Ping timeout")
        mock_send_alert.assert_called_once()
        args, kwargs = mock_send_alert.call_args
        self.assertIn("dubber_worker", args[0])
        self.assertEqual(kwargs["alert_key"], "worker_restart_dubber_worker")

    @patch("backend.services.telegram_notify.send_alert_to_admins")
    def test_send_job_max_retries_failed_alert(self, mock_send_alert):
        telegram_notify.send_job_max_retries_failed_alert(
            job_id="job-999",
            stage="DOWNLOAD",
            exc=RuntimeError("Video blocked"),
            video_title="Sample Video",
        )
        mock_send_alert.assert_called_once()
        args, kwargs = mock_send_alert.call_args
        self.assertIn("job-999", args[0])
        self.assertIn("Sample Video", args[0])
        self.assertEqual(kwargs["alert_key"], "job_fatal_job-999")


if __name__ == "__main__":
    unittest.main()
