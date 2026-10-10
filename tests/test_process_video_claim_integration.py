"""backend/workers/tasks.py:process_video -- claim integratsiyasi bo'yicha
uchidan-uchigacha testlar (2026-08-26 Celery worker-lifecycle audit).

Haqiqiy Postgres talab qiladi. Tashqi xizmatlar (downloader/transcriber/...)
mock qilinadi -- bu yerda tekshirilayotgan narsa "claim to'g'ri
olinadi/bo'shatiladimi va job ABADIY qotib qolmaydimi", dublyaj
pipeline'ining o'zi emas (u boshqa testlarda/qo'lda tekshirilgan)."""
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from backend.models.database import SessionLocal, DubbingJob, JobStatus, User
from backend.services.errors import PermanentError
from backend.workers.tasks import process_video


class TestProcessVideoClaimIntegration(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.job_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="pv-claim-test", email=f"pvclaim+{self.user_id}@example.com", is_verified=True))

    def _make_job(self, **overrides):
        defaults = dict(id=self.job_id, user_id=self.user_id, youtube_url="https://youtube.com/watch?v=test", status=JobStatus.PENDING)
        defaults.update(overrides)
        self.db.add(DubbingJob(**defaults))
        self.db.commit()

    def tearDown(self):
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).delete()
        self.db.query(User).filter(User.id == self.user_id).delete()
        self.db.commit()
        self.db.close()

    def test_duplicate_delivery_short_circuits_without_touching_pipeline(self):
        """Bosh audit topilmasi shu yerda: bir xil task_id ikki marta
        yetkazib berilsa (redelivery + recover_stuck_jobs() musobaqasi),
        IKKINCHISI hech qanday qimmat ishni bajarmasdan xavfsiz chiqib
        ketishi kerak."""
        self._make_job(
            status=JobStatus.DOWNLOADING,
            processing_claim_token="another-worker-active",
            processing_lease_expires_at=datetime.utcnow() + timedelta(seconds=3600),
        )
        with patch("backend.workers.tasks.downloader.download_video") as mock_download:
            result = process_video(str(self.job_id))
        mock_download.assert_not_called()
        self.assertEqual(result, {"job_id": str(self.job_id), "status": "skipped_duplicate_claim"})
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.processing_claim_token, "another-worker-active", "must not clobber the real owner's claim")

    def test_successful_claim_reaches_terminal_state_and_releases_claim(self):
        """Muhim test (Phase 7): Worker A vazifani boshlaydi -> claim
        oladi -> muvaffaqiyatsiz bo'ladi (permanent xato) -> FAILED
        terminal holatga yetadi -> claim bo'shatiladi (job abadiy
        qulflanib qolmaydi, keyingi retry/recovery uni qayta claim qila
        oladi)."""
        self._make_job(status=JobStatus.PENDING)
        with patch("backend.workers.tasks.downloader.download_video", side_effect=PermanentError("test: video unavailable", code="TEST_ERR")):
            with self.assertRaises(PermanentError):
                process_video(str(self.job_id))

        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED, "must reach a terminal state, not stay stuck")
        self.assertIsNone(row.processing_claim_token, "claim must be released on the failure path too")
        self.assertIsNone(row.processing_lease_expires_at)

    def test_dead_worker_claim_blocks_normal_redelivery_without_reclaim_signal(self):
        """2026-08-26 worker-loss audit -- reproduces the EXACT gap found
        in production before the fix: Worker A claims and 'dies' (SIGKILL,
        claim never released). A plain redelivered attempt WITHOUT the
        Celery redelivered-flag being surfaced (e.g. an old/unpatched
        worker, or a genuinely non-redelivered duplicate) must still be
        blocked -- allow_reclaim is opt-in, not automatic."""
        self._make_job(status=JobStatus.PENDING)
        from backend.services.job_claim import try_claim
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900)
        self.assertIsNotNone(token_a)

        with patch("backend.workers.tasks.downloader.download_video") as mock_download:
            result = process_video(str(self.job_id))
        mock_download.assert_not_called()
        self.assertEqual(result["status"], "skipped_duplicate_claim")

    def test_redelivered_task_reclaims_dead_workers_claim_and_completes(self):
        """The actual fix, end-to-end at the task level: Worker A claims
        and 'dies' (claim never released, lease still valid). A REdelivered
        task attempt (simulated via Celery's own push_request mechanism,
        the standard way to unit-test bound-task request context) must
        detect and reclaim the abandoned claim, then run to a valid
        terminal state -- with only one execution ever touching the
        pipeline.

        Uses process_video.run(...) rather than calling process_video(...)
        directly: Celery's Task.__call__ (invoked by direct call syntax)
        pushes its OWN fresh request context, which would shadow the one
        we push manually below. .run() is the bound function itself,
        without that extra context-management wrapper -- the standard way
        to unit-test a bound task against a specific request context."""
        self._make_job(status=JobStatus.PENDING)
        from backend.services.job_claim import try_claim
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900)
        self.assertIsNotNone(token_a)
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertGreater(row.processing_lease_expires_at, datetime.utcnow(), "must still be unexpired -- this is the whole point of the test")

        process_video.push_request(delivery_info={"redelivered": True})
        try:
            with patch("backend.workers.tasks.downloader.download_video", side_effect=PermanentError("test", code="TEST_ERR")):
                with self.assertRaises(PermanentError):
                    process_video.run(str(self.job_id))
        finally:
            process_video.pop_request()

        # process_video.run() did all its work through its OWN separate
        # SessionLocal() -- self.db's identity map has no idea that
        # happened and will otherwise happily hand back its own stale,
        # pre-change cached copy of this row instead of re-querying.
        self.db.expire_all()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED, "redelivered attempt must have actually run the pipeline (not skipped) and reached a terminal state")
        self.assertIsNone(row.processing_claim_token, "the reclaiming worker's own claim must be released on completion")

    def test_worker_a_dies_worker_b_completes_only_one_active_execution(self):
        """Phase 7'ning "eng muhim testi": Worker A job'ni claim qiladi
        va (SIGKILL/OOM bilan) qulaydi -- claim hech qachon bo'shatilmaydi.
        Keyinroq (lease muddati tugagach) Worker B xuddi shu job'ni qayta
        claim qiladi va tugatadi. Bu ikki bosqich orasida BIR VAQTNING
        o'zida faqat bitta faol ijro bo'lishi kerak edi (Worker A'ning
        "o'lik" claim'i Worker B'ni to'xtatib turadi, lease tugagunча)."""
        self._make_job(status=JobStatus.PENDING)

        from backend.services.job_claim import try_claim
        # Worker A: claim oladi, keyin "qulaydi" -- release_claim HECH
        # QACHON chaqirilmaydi (process_video chaqirilmaydi ham -- xuddi
        # worker jarayoni birinchi qadamdayoq o'ldirilgandek).
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token_a)

        # Worker A hali "tirik" paytida (lease muddati tugamagan) Worker B
        # xuddi shu job'ni qayta ishlashga urinsa -- bloklanishi kerak.
        with patch("backend.workers.tasks.downloader.download_video") as mock_download:
            result_while_a_alive = process_video(str(self.job_id))
        mock_download.assert_not_called()
        self.assertEqual(result_while_a_alive["status"], "skipped_duplicate_claim")

        # Vaqt o'tadi -- Worker A'ning lease muddati tugaydi (haqiqiy hayotda:
        # 65 daqiqa, bu yerda sun'iy ravishda o'tmishga suriladi).
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).update(
            {"processing_lease_expires_at": datetime.utcnow() - timedelta(seconds=1)}
        )
        self.db.commit()

        # Worker B endi muvaffaqiyatli claim qilib, vazifani tugatadi.
        with patch("backend.workers.tasks.downloader.download_video", side_effect=PermanentError("test", code="TEST_ERR")):
            with self.assertRaises(PermanentError):
                process_video(str(self.job_id))

        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED, "job must reach a valid terminal state")
        self.assertIsNone(row.processing_claim_token, "Worker B must release its claim on completion")


if __name__ == "__main__":
    unittest.main()
