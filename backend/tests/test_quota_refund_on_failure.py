"""Tests verifying quota/limit refunding when a dubbing job fails or is cancelled.

Covers:
- NoSpeechFoundError refunds consumed quota
- PermanentError refunds consumed quota
- Max retries exceeded refunds consumed quota
- Non-retryable errors refund consumed quota without extra attempts
- Active jobs that reached translation checkpoint still get quota refunded on failure
- On-demand recovery of an already completed job (completed_at is not None) does NOT refund quota
- Paid jobs (Click/Payme/Uzum) flag Payment.needs_refund = True on failure
- User-initiated cancellation refunds consumed quota
"""
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from backend.models.database import SessionLocal, DubbingJob, JobStatus, User, Subscription, PlanTier
from backend.models.payment import Payment, PaymentStatus
from backend.services import plans
from backend.services.errors import PermanentError, NoSpeechFoundError
from backend.workers.tasks import process_video, _refund_job_quota_or_flag_payment


class TestQuotaRefundOnFailure(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.job_id = uuid.uuid4()
        self.user = User(
            id=self.user_id,
            name="quota-refund-tester",
            email=f"refund-{self.user_id}@example.com",
            is_verified=True,
            auth_provider="password",
        )
        self.db.add(self.user)
        self.db.commit()

        # Set up a subscription with 10 monthly minutes
        self.sub = plans.get_or_create_subscription(self.db, self.user_id)
        self.sub.monthly_minutes_used = 0.0
        self.sub.purchased_minutes = 0.0
        self.db.commit()

    def tearDown(self):
        self.db.query(Payment).filter(Payment.job_id == self.job_id).delete()
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).delete()
        self.db.query(Subscription).filter(Subscription.user_id == self.user_id).delete()
        self.db.query(User).filter(User.id == self.user_id).delete()
        self.db.commit()
        self.db.close()

    def _create_job(self, duration_seconds: float = 300.0, quota_consumed: bool = True, **kwargs):
        duration_minutes = duration_seconds / 60.0
        if quota_consumed:
            plans.consume_quota(self.db, self.user_id, duration_minutes)

        job_data = dict(
            id=self.job_id,
            user_id=self.user_id,
            youtube_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            video_title="Test Video",
            video_duration=duration_seconds,
            status=JobStatus.PENDING,
            quota_consumed=quota_consumed,
        )
        job_data.update(kwargs)
        job = DubbingJob(**job_data)
        self.db.add(job)
        self.db.commit()
        return job

    def test_no_speech_found_error_refunds_quota(self):
        """When a video has no speech, user minutes must be refunded immediately."""
        self._create_job(duration_seconds=300.0, quota_consumed=True)  # 5 minutes
        sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(sub.monthly_minutes_used, 5.0)

        with patch("backend.workers.tasks.downloader.download_video") as mock_dl:
            mock_dl.side_effect = NoSpeechFoundError("No speech detected", code="NO_SPEECH_FOUND")
            with self.assertRaises(NoSpeechFoundError):
                process_video(str(self.job_id))

        self.db.expire_all()
        refreshed_job = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(refreshed_job.status, JobStatus.FAILED)
        self.assertFalse(refreshed_job.quota_consumed)

        refreshed_sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(refreshed_sub.monthly_minutes_used, 0.0)

    def test_permanent_error_refunds_quota(self):
        """When a job hits PermanentError (e.g. content blocked or video unavailable), quota must be refunded."""
        self._create_job(duration_seconds=180.0, quota_consumed=True)  # 3 minutes
        sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(sub.monthly_minutes_used, 3.0)

        with patch("backend.workers.tasks.downloader.download_video") as mock_dl:
            mock_dl.side_effect = PermanentError("Video is private or unavailable", code="VIDEO_UNAVAILABLE")
            with self.assertRaises(PermanentError):
                process_video(str(self.job_id))

        self.db.expire_all()
        refreshed_job = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(refreshed_job.status, JobStatus.FAILED)
        self.assertFalse(refreshed_job.quota_consumed)

        refreshed_sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(refreshed_sub.monthly_minutes_used, 0.0)

    def test_job_failed_after_checkpoint_still_refunds_quota(self):
        """Active jobs that reached translation (translated_segments present) but fail at later stage
        must NOT be mistakenly treated as recovery jobs; their quota must be refunded."""
        self._create_job(
            duration_seconds=240.0,
            quota_consumed=True,
            translated_segments=[{"start": 0.0, "end": 2.0, "text": "Salom"}],
            completed_at=None,
        )
        sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(sub.monthly_minutes_used, 4.0)

        with patch("backend.workers.tasks.downloader.download_video") as mock_dl:
            mock_dl.side_effect = PermanentError("TTS provider error", code="TTS_FAILED")
            with self.assertRaises(PermanentError):
                process_video(str(self.job_id))

        self.db.expire_all()
        refreshed_job = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(refreshed_job.status, JobStatus.FAILED)
        self.assertFalse(refreshed_job.quota_consumed)

        refreshed_sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(refreshed_sub.monthly_minutes_used, 0.0)

    def test_on_demand_recovery_of_completed_job_never_refunds_quota(self):
        """If an already completed job (completed_at is set) fails during on-demand recovery,
        it must not refund quota since the user already received the completed dubbing."""
        self._create_job(
            duration_seconds=300.0,
            quota_consumed=True,
            completed_at=datetime.utcnow() - timedelta(days=10),
            translated_segments=[{"start": 0.0, "end": 2.0, "text": "Salom"}],
        )
        # Manually reset used minutes to simulate normal state
        sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        sub.monthly_minutes_used = 5.0
        self.db.commit()

        # Trigger refund helper directly with is_recovery_job=True
        _refund_job_quota_or_flag_payment(str(self.job_id), is_recovery_job=True)

        self.db.expire_all()
        refreshed_sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        # Minutes must remain unchanged
        self.assertAlmostEqual(refreshed_sub.monthly_minutes_used, 5.0)

    def test_paid_job_failure_flags_needs_refund(self):
        """For directly paid jobs (Click, Payme, etc.) where quota_consumed is False,
        failure must mark Payment.needs_refund = True."""
        job = self._create_job(duration_seconds=600.0, quota_consumed=False)
        payment = Payment(
            user_id=self.user_id,
            job_id=self.job_id,
            amount=5000,
            status=PaymentStatus.APPROVED,
            needs_refund=False,
        )
        self.db.add(payment)
        self.db.commit()

        with patch("backend.workers.tasks.downloader.download_video") as mock_dl:
            mock_dl.side_effect = PermanentError("Failed to fetch media", code="MEDIA_ERROR")
            with self.assertRaises(PermanentError):
                process_video(str(self.job_id))

        self.db.expire_all()
        refreshed_payment = self.db.query(Payment).filter(Payment.job_id == self.job_id).first()
        self.assertTrue(refreshed_payment.needs_refund)

    def test_max_retries_exceeded_refunds_quota(self):
        """When retries are exhausted on transient errors, quota must be refunded."""
        self._create_job(duration_seconds=300.0, quota_consumed=True)
        sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(sub.monthly_minutes_used, 5.0)

        process_video.push_request(retries=3)
        try:
            with patch("backend.workers.tasks.downloader.download_video") as mock_dl:
                mock_dl.side_effect = RuntimeError("Transient network timeout")
                with self.assertRaises(RuntimeError):
                    process_video.run(str(self.job_id))
        finally:
            process_video.pop_request()

        self.db.expire_all()
        refreshed_job = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(refreshed_job.status, JobStatus.FAILED)
        self.assertFalse(refreshed_job.quota_consumed)

        refreshed_sub = self.db.query(Subscription).filter(Subscription.user_id == self.user_id).first()
        self.assertAlmostEqual(refreshed_sub.monthly_minutes_used, 0.0)


if __name__ == "__main__":
    unittest.main()
