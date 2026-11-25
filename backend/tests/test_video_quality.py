"""Admin 1080p: past sifatli nusxa qayta ishlatilmaydi."""
import tempfile
import unittest
from unittest.mock import patch

from backend.services import video_quality as q


class VideoQualityTest(unittest.TestCase):
    def test_threshold(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            for size, expected in (((640, 360), False), ((1280, 720), False), ((1920, 1080), True),
                                   ((1080, 1920), True), ((1920, 800), True)):
                with patch.object(q, "_get_video_dimensions", return_value=size):
                    self.assertEqual(q.good_enough(f.name, 1080), expected, size)
                    self.assertTrue(q.good_enough(f.name, 0))
        self.assertFalse(q.good_enough("/yoq.mp4", 1080))

    def test_admin_height_follows_choice(self):
        from backend.services import gemini_quota_manager as gqm
        self.addCleanup(gqm.deactivate_gemini_override)
        with patch("backend.services.plans.is_user_admin", return_value=True):
            self.assertEqual(q.required_height(None, "u"), 1080)
            gqm.activate_gemini_override(gqm.sanitize_override(quality="2160"))
            self.assertEqual(q.required_height(None, "u"), 2160)
            gqm.activate_gemini_override(gqm.sanitize_override(quality="360"))
            self.assertEqual(q.required_height(None, "u"), 360)
        with patch("backend.services.plans.is_user_admin", return_value=False):
            self.assertEqual(q.required_height(None, "u"), 0)

    def test_low_choice_rejects_bigger_source(self):
        with tempfile.NamedTemporaryFile(suffix=".mp4") as f:
            for size, expected in (((1920, 1080), False), ((256, 144), True), ((144, 256), True)):
                with patch.object(q, "_get_video_dimensions", return_value=size):
                    self.assertEqual(q.good_enough(f.name, 144), expected, size)

    def test_retry_with_new_task_id_keeps_job_choice(self):
        from backend.services import byok, gemini_quota_manager as gqm
        from backend.workers.celery_app import celery_app
        from backend.workers.override_task import GeminiOverrideTask

        @celery_app.task(base=GeminiOverrideTask, name="test.noop_override")
        def noop(job_id):
            return job_id

        with patch.object(gqm, "load_job_gemini_override", return_value=None) as load, \
             patch.object(byok, "activate_for_job") as activate:
            noop.push_request(id="boshqa-task-id")
            try:
                noop("job-1")
            finally:
                noop.pop_request()
        load.assert_called_with("job-1")
        activate.assert_called_with("job-1")


if __name__ == "__main__":
    unittest.main()
