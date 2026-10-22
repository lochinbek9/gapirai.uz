import unittest
from unittest.mock import MagicMock, patch
import uuid
from datetime import datetime, timedelta
from backend.api.routes import cancel_job
from backend.models.database import DubbingJob, JobStatus, User
from backend.services.cancel_policy import check_cancel_refund_eligibility, record_stage_transition


class TestCancelJob(unittest.TestCase):
    def test_cancel_within_30s_in_initial_stage_refunds_quota(self):
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(
            spec=DubbingJob,
            id=job_id,
            user_id=owner_id,
            status=JobStatus.DOWNLOADING,
            quota_consumed=True,
            is_preview=False,
            video_duration=300.0,
            created_at=datetime.utcnow() - timedelta(seconds=15),
        )
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.cancel_policy.check_cancel_refund_eligibility", return_value=(True, 15.0, "ok", "DOWNLOAD", "DOWNLOAD")), \
             patch("backend.services.plans.refund_quota") as mock_refund:
            res = cancel_job(job_id=job_id, db=db, current_user=owner)
            self.assertTrue(res["success"])
            self.assertTrue(res["refunded"])
            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertEqual(job.error_code, "USER_CANCELLED")
            mock_revoke.assert_called_once_with(str(job_id), terminate=True)
            mock_refund.assert_called_once_with(db, owner_id, 5.0)
            self.assertFalse(job.quota_consumed)

    def test_cancel_after_30s_does_not_refund_quota(self):
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(
            spec=DubbingJob,
            id=job_id,
            user_id=owner_id,
            status=JobStatus.DOWNLOADING,
            quota_consumed=True,
            is_preview=False,
            video_duration=300.0,
            created_at=datetime.utcnow() - timedelta(seconds=35),
        )
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.cancel_policy.check_cancel_refund_eligibility", return_value=(False, 0.0, "30s dan oshdi", "DOWNLOAD", "DOWNLOAD")), \
             patch("backend.services.plans.refund_quota") as mock_refund:
            res = cancel_job(job_id=job_id, db=db, current_user=owner)
            self.assertTrue(res["success"])
            self.assertFalse(res["refunded"])
            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertEqual(job.error_code, "USER_CANCELLED")
            mock_revoke.assert_called_once_with(str(job_id), terminate=True)
            mock_refund.assert_not_called()
            self.assertTrue(job.quota_consumed)

    def test_cancel_after_transitioning_to_second_stage_does_not_refund_even_under_30s(self):
        """1 bosqich ishlagach 2 nchisida ham bekor qilish yechadi balansdan!"""
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(
            spec=DubbingJob,
            id=job_id,
            user_id=owner_id,
            status=JobStatus.TRANSCRIBING,
            quota_consumed=True,
            is_preview=False,
            video_duration=300.0,
            created_at=datetime.utcnow() - timedelta(seconds=12),
        )
        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.cancel_policy.check_cancel_refund_eligibility", return_value=(False, 0.0, "Keyingi bosqichga o'tib bo'ldi", "DOWNLOAD", "TRANSCRIBE")), \
             patch("backend.services.plans.refund_quota") as mock_refund:
            res = cancel_job(job_id=job_id, db=db, current_user=owner)
            self.assertTrue(res["success"])
            self.assertFalse(res["refunded"])
            mock_refund.assert_not_called()
            self.assertTrue(job.quota_consumed)

    def test_skipped_first_stage_starts_timer_at_second_stage(self):
        """Tayyor bosqich skip qilinadi, 2-bosqichdan boshlagan bo'lsa 30s beriladi."""
        fake_redis = {}
        def fake_get(k): return fake_redis.get(k)
        def fake_set(k, v, nx=False, ex=None):
            if nx and k in fake_redis:
                return False
            fake_redis[k] = v
            return True
        def fake_incr(k):
            val = int(fake_redis.get(k, 0)) + 1
            fake_redis[k] = str(val)
            return val

        mock_r = MagicMock()
        mock_r.get.side_effect = fake_get
        mock_r.set.side_effect = fake_set
        mock_r.incr.side_effect = fake_incr

        job_id = "test-job-123"
        with patch("backend.services.cancel_policy._get_redis", return_value=mock_r):
            # Bosqich 1: DOWNLOAD skipped (kesh)
            record_stage_transition(job_id, "DOWNLOAD", is_skipped=True)
            self.assertNotIn(f"job_initial_stage:{job_id}", fake_redis)

            # Bosqich 2: TRANSCRIBE real boshlandi!
            record_stage_transition(job_id, "TRANSCRIBE", is_skipped=False)
            self.assertEqual(fake_redis[f"job_initial_stage:{job_id}"], "TRANSCRIBE")
            self.assertEqual(fake_redis[f"job_current_stage:{job_id}"], "TRANSCRIBE")

            # 10 soniya o'tdi, hali TRANSCRIBE'da:
            can_ref, left, msg, init_s, cur_s = check_cancel_refund_eligibility(job_id, "TRANSCRIBING")
            self.assertTrue(can_ref)
            self.assertEqual(init_s, "TRANSCRIBE")

            # TRANSCRIBE tugab, 3-bosqich (TRANSLATE)ga o'tdi:
            record_stage_transition(job_id, "TRANSLATE", is_skipped=False)
            self.assertEqual(fake_redis[f"job_current_stage:{job_id}"], "TRANSLATE")

            # Endi bekor qilsa: limit QAYTARILMAYDI!
            can_ref2, _, _, _, _ = check_cancel_refund_eligibility(job_id, "TRANSLATING")
            self.assertFalse(can_ref2)


if __name__ == "__main__":
    unittest.main()
