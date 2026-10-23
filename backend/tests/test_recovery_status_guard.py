"""On-demand tiklash faqat COMPLETED job uchun (2026-10-23): bekor qilingan /
FAILED bo'lgan eski job sahifasi ochilganda butun pipeline qayta ishga
tushmasligi kerak. DB'ga murojaat qilmaydi -- trigger status tekshiruvida
DB va Redis'dan oldin qaytadi."""
import unittest
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

from backend.models.database import DubbingJob, JobStatus
from backend.services.job_recovery import trigger_ondemand_recovery


def _job(status, error_code=None):
    return DubbingJob(
        id=uuid.uuid4(),
        youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        status=status,
        error_code=error_code,
        completed_at=datetime(2026, 9, 29, 10, 38),
        transcript_segments=[{"text": "hi"}],
        translated_segments=[{"text": "salom"}],
    )


class TestRecoveryStatusGuard(unittest.TestCase):
    @patch("backend.services.job_recovery._get_redis")
    @patch("backend.workers.tasks.process_video.apply_async")
    def test_not_completed_jobs_are_never_recovered(self, mock_apply_async, mock_get_redis):
        for status, code in (
            (JobStatus.FAILED, "USER_CANCELLED"),
            (JobStatus.FAILED, "ADMIN_CANCELLED"),
            (JobStatus.FAILED, "MERGE_FAILED"),
            (JobStatus.PENDING, None),
            (JobStatus.AWAITING_PAYMENT, None),
        ):
            db = MagicMock()
            self.assertFalse(trigger_ondemand_recovery(db, _job(status, code)), f"{status} {code}")
            db.commit.assert_not_called()
        mock_get_redis.assert_not_called()
        mock_apply_async.assert_not_called()


if __name__ == "__main__":
    unittest.main()
