"""backend/main.py:recover_stuck_jobs() -- 2026-08-26 Celery worker-lifecycle
audit remediation testlari.

Haqiqiy Postgres ulanishini talab qiladi (claim mexanizmi kabi). Celery
apply_async() haqiqatan chaqirilmaydi -- mock qilinadi, chunki bu yerda
tekshirilayotgan narsa "recover_stuck_jobs() TO'G'RI qatorni TO'G'RI
holatda navbatga qo'yishga urinadimi", Celery/Redis'ning o'zi emas."""
import threading
import unittest
import uuid
from datetime import datetime, timedelta
from unittest.mock import patch

from redis import Redis

from backend.config import get_settings
from backend.models.database import SessionLocal, DubbingJob, JobStatus, User, Subscription
import backend.main as main_module


def _make_job(db, status, recovery_attempt_count=0, claimed=False, lease_expired=False):
    user_id = uuid.uuid4()
    job_id = uuid.uuid4()
    db.add(User(id=user_id, name="recovery-test", email=f"recoverytest+{user_id}@example.com", is_verified=True))
    job = DubbingJob(
        id=job_id, user_id=user_id,
        youtube_url="https://youtube.com/watch?v=test",
        status=status,
        recovery_attempt_count=recovery_attempt_count,
    )
    if claimed:
        job.processing_claim_token = "someone-elses-token"
        job.processing_lease_expires_at = (
            datetime.utcnow() - timedelta(seconds=1) if lease_expired
            else datetime.utcnow() + timedelta(seconds=3600)
        )
    db.add(job)
    db.commit()
    return job_id, user_id


def _cleanup(db, job_id, user_id):
    db.query(DubbingJob).filter(DubbingJob.id == job_id).delete()
    # get_job_queue() (recover_stuck_jobs() ichida) lazy-create qiladigan
    # Subscription qatorini ham tozalash kerak -- aks holda users FK
    # tozalashda ishlamay, keyingi testga qoldiq qator sizib o'tadi
    # (recover_stuck_jobs() BUTUN jadvalni ko'rib chiqadi -- shu qoldiq
    # boshqa testlarning apply_async chaqiruv sonini buzadi).
    db.query(Subscription).filter(Subscription.user_id == user_id).delete()
    db.query(User).filter(User.id == user_id).delete()
    db.commit()


class TestRecoverStuckJobs(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self._cleanup_ids = []
        # Haqiqiy Redis kerak -- _redis_recovery_claim() None ulanishda
        # "xavfsiz tomonga o'tib, baribir navbatga qo'yiladi" (fail-open)
        # qiladi, bu esa aynan tekshirmoqchi bo'lgan dedup'ni butunlay
        # chetlab o'tadi.
        self.redis_conn = Redis.from_url(get_settings().REDIS_URL)

    def tearDown(self):
        for job_id, user_id in self._cleanup_ids:
            _cleanup(self.db, job_id, user_id)
        self.db.close()

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_stuck_job_with_no_claim_gets_requeued(self, mock_apply_async):
        job_id, user_id = _make_job(self.db, JobStatus.DOWNLOADING)
        self._cleanup_ids.append((job_id, user_id))

        main_module.recover_stuck_jobs(redis_conn=self.redis_conn)

        mock_apply_async.assert_called_once()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        self.assertEqual(row.status, JobStatus.PENDING)
        self.assertEqual(row.recovery_attempt_count, 1)
        # recover_stuck_jobs() DB-claim'ga hech qachon YOZMAYDI (faqat
        # o'qiydi) -- haqiqiy claim vazifaning o'zi ishga tushganda
        # process_video ichida olinadi, shuning uchun bu yerda hali bo'sh.
        self.assertIsNone(row.processing_claim_token)

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_actively_claimed_job_is_not_touched(self, mock_apply_async):
        """Talab #2: haqiqatan ishlab turgan job (muddati tugamagan claim'ga
        ega) qayta navbatga qo'yilmasligi kerak."""
        job_id, user_id = _make_job(self.db, JobStatus.DOWNLOADING, claimed=True, lease_expired=False)
        self._cleanup_ids.append((job_id, user_id))

        main_module.recover_stuck_jobs(redis_conn=self.redis_conn)

        mock_apply_async.assert_not_called()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        self.assertEqual(row.status, JobStatus.DOWNLOADING)  # o'zgarmagan
        self.assertEqual(row.processing_claim_token, "someone-elses-token")  # tegilmagan

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_job_with_expired_claim_is_still_recovered(self, mock_apply_async):
        job_id, user_id = _make_job(self.db, JobStatus.DOWNLOADING, claimed=True, lease_expired=True)
        self._cleanup_ids.append((job_id, user_id))

        main_module.recover_stuck_jobs(redis_conn=self.redis_conn)

        mock_apply_async.assert_called_once()

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_recovery_attempt_count_increments_not_resets(self, mock_apply_async):
        job_id, user_id = _make_job(self.db, JobStatus.DOWNLOADING, recovery_attempt_count=2)
        self._cleanup_ids.append((job_id, user_id))

        main_module.recover_stuck_jobs(redis_conn=self.redis_conn)

        row = self.db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        self.assertEqual(row.recovery_attempt_count, 3, "must increment from prior value, not reset to 1")

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_exhausted_recovery_marks_failed_instead_of_looping(self, mock_apply_async):
        """Talab #1/#3: doimiy xatoga uchragan job cheksiz PENDING<->DOWNLOADING
        aylanishda qolmasligi, oxir-oqibat FAILED bo'lishi kerak (044530c0
        production incidenti, 2026-08-26 audit)."""
        job_id, user_id = _make_job(
            self.db, JobStatus.DOWNLOADING,
            recovery_attempt_count=main_module.RECOVERY_MAX_ATTEMPTS,
        )
        self._cleanup_ids.append((job_id, user_id))

        main_module.recover_stuck_jobs(redis_conn=self.redis_conn)

        mock_apply_async.assert_not_called()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED)
        self.assertEqual(row.error_code, "RECOVERY_EXHAUSTED")

    @patch("backend.workers.tasks.process_video.apply_async")
    def test_concurrent_backend_restarts_only_one_enqueues(self, mock_apply_async):
        """Talab #5: bir nechta backend instansi (--workers 4, yoki
        alohida deploy) bir vaqtda restart bo'lsa ham, bitta job faqat
        BIR MARTA navbatga qo'yilishi kerak."""
        job_id, user_id = _make_job(self.db, JobStatus.DOWNLOADING)
        self._cleanup_ids.append((job_id, user_id))

        call_count = {"n": 0}
        lock = threading.Lock()

        def counted(*args, **kwargs):
            with lock:
                call_count["n"] += 1

        mock_apply_async.side_effect = counted

        threads = [threading.Thread(target=main_module.recover_stuck_jobs, args=(self.redis_conn,)) for _ in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(call_count["n"], 1, "exactly one of the 4 simultaneous recovery runs must enqueue the job")


if __name__ == "__main__":
    unittest.main()
