import unittest
from unittest.mock import MagicMock, patch
import uuid
from datetime import datetime, timedelta
from backend.api.routes import cancel_job
from backend.models.database import DubbingJob, JobStatus, User


class TestCancelJob(unittest.TestCase):
    def test_cancel_within_60s_refunds_quota(self):
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(
            spec=DubbingJob,
            id=job_id,
            user_id=owner_id,
            status=JobStatus.SYNTHESIZING,
            quota_consumed=True,
            is_preview=False,
            video_duration=300.0,
            created_at=datetime.utcnow() - timedelta(seconds=20),
        )
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.plans.refund_quota") as mock_refund:
            res = cancel_job(job_id=job_id, db=db, current_user=owner)
            self.assertTrue(res["success"])
            self.assertTrue(res["refunded"])
            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertEqual(job.error_code, "USER_CANCELLED")
            mock_revoke.assert_called_once_with(str(job_id), terminate=True)
            mock_refund.assert_called_once_with(db, owner_id, 5.0)
            self.assertFalse(job.quota_consumed)

    def test_cancel_after_60s_does_not_refund_quota(self):
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(
            spec=DubbingJob,
            id=job_id,
            user_id=owner_id,
            status=JobStatus.SYNTHESIZING,
            quota_consumed=True,
            is_preview=False,
            video_duration=300.0,
            created_at=datetime.utcnow() - timedelta(seconds=75),
        )
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.plans.refund_quota") as mock_refund:
            res = cancel_job(job_id=job_id, db=db, current_user=owner)
            self.assertTrue(res["success"])
            self.assertFalse(res["refunded"])
            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertEqual(job.error_code, "USER_CANCELLED")
            mock_revoke.assert_called_once_with(str(job_id), terminate=True)
            mock_refund.assert_not_called()
            # quota_consumed remains True (not refunded)
            self.assertTrue(job.quota_consumed)


if __name__ == "__main__":
    unittest.main()
