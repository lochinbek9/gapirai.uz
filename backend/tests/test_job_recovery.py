import unittest
import uuid
from unittest.mock import patch, MagicMock
from pathlib import Path

from fastapi.testclient import TestClient
from backend.main import app
from backend.models.database import SessionLocal, DubbingJob, JobStatus, User
from backend.services.auth import create_access_token, hash_password
from backend.services.job_recovery import (
    is_output_video_missing,
    can_recover_job,
    trigger_ondemand_recovery,
)


class TestJobRecovery(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.db = SessionLocal()
        self.user = User(
            email=f"recovery_user_{uuid.uuid4()}@example.com",
            name="RecUser",
            password_hash=hash_password("password123"),
            is_verified=True,
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.user_tok = create_access_token(str(self.user.id), self.user.email)

    def tearDown(self):
        from backend.models.database import Subscription
        self.db.query(DubbingJob).filter(DubbingJob.user_id == self.user.id).delete(synchronize_session=False)
        self.db.query(Subscription).filter(Subscription.user_id == self.user.id).delete(synchronize_session=False)
        self.db.query(User).filter(User.id == self.user.id).delete(synchronize_session=False)
        self.db.commit()
        self.db.close()

    def test_can_recover_job_logic(self):
        # 1. YouTube video with segments -> can recover
        job1 = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=JobStatus.COMPLETED,
            transcript_segments=[{"text": "hi"}],
            translated_segments=[{"text": "salom"}],
            translated_text="O'zbekcha tarjima matni",
        )
        self.assertTrue(can_recover_job(job1))

        # 2. Subtitle only -> should NOT recover video
        job2 = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=JobStatus.COMPLETED,
            subtitle_only=True,
            transcript_segments=[{"text": "hi"}],
            translated_segments=[{"text": "salom"}],
            translated_text="Subtitr",
        )
        self.assertFalse(can_recover_job(job2))

        # 3. Uploaded video (non-youtube) -> should NOT recover because source file is gone
        job3 = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="upload://local_file_123.mp4",
            status=JobStatus.COMPLETED,
            transcript_segments=[{"text": "hi"}],
            translated_segments=[{"text": "salom"}],
            translated_text="Tarjima",
        )
        self.assertFalse(can_recover_job(job3))

    @patch("backend.services.job_recovery._get_redis")
    @patch("backend.workers.tasks.process_video.apply_async")
    def test_trigger_ondemand_recovery(self, mock_apply_async, mock_get_redis):
        mock_redis = MagicMock()
        mock_redis.set.return_value = True  # lock acquired
        mock_get_redis.return_value = mock_redis

        job = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=JobStatus.COMPLETED,
            transcript_segments=[{"text": "hi"}],
            translated_segments=[{"text": "salom"}],
            translated_text="Salom dunyo",
            video_title="Test Video",
        )
        self.db.add(job)
        self.db.commit()

        success = trigger_ondemand_recovery(self.db, job)
        self.assertTrue(success)

        # Check that job status changed to DOWNLOADING
        self.db.refresh(job)
        self.assertEqual(job.status, JobStatus.DOWNLOADING)
        self.assertIn("qayta tiklanmoqda", job.status_message)

        # Check Celery task enqueued with job id
        mock_apply_async.assert_called_once()
        self.assertEqual(mock_apply_async.call_args[1]["args"], [str(job.id)])

    @patch("backend.services.job_recovery._get_redis")
    @patch("backend.workers.tasks.process_video.apply_async")
    def test_trigger_ondemand_recovery_dedup(self, mock_apply_async, mock_get_redis):
        # When lock is already held by another worker
        mock_redis = MagicMock()
        mock_redis.set.return_value = False
        mock_get_redis.return_value = mock_redis

        job = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=JobStatus.COMPLETED,
            transcript_segments=[{"text": "hi"}],
            translated_segments=[{"text": "salom"}],
            translated_text="Salom",
        )
        self.db.add(job)
        self.db.commit()

        success = trigger_ondemand_recovery(self.db, job)
        self.assertFalse(success)
        mock_apply_async.assert_not_called()

    @patch("backend.services.job_recovery._get_redis")
    @patch("backend.workers.tasks.process_video.apply_async")
    def test_recovery_never_deducts_quota(self, mock_apply_async, mock_get_redis):
        # Guarantee that recovery does not call consume_quota or alter user balance
        mock_redis = MagicMock()
        mock_redis.set.return_value = True
        mock_get_redis.return_value = mock_redis

        initial_quota_consumed = True
        job = DubbingJob(
            id=uuid.uuid4(),
            user_id=self.user.id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=JobStatus.COMPLETED,
            transcript_segments=[{"text": "hello"}],
            translated_segments=[{"text": "salom"}],
            translated_text="Salom",
            quota_consumed=initial_quota_consumed,
        )
        self.db.add(job)
        self.db.commit()

        with patch("backend.services.plans.consume_quota") as mock_consume:
            trigger_ondemand_recovery(self.db, job)
            mock_consume.assert_not_called()

        self.db.refresh(job)
        self.assertEqual(job.quota_consumed, initial_quota_consumed)


if __name__ == "__main__":
    unittest.main()
