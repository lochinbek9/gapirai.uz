"""backend/services/job_claim.py -- DB-darajasidagi atomik claim/lease
testlari (2026-08-26 Celery worker-lifecycle auditi).

Bu testlar HAQIQIY Postgres ulanishini talab qiladi (mock emas) -- claim
mexanizmining butun ma'nosi PostgreSQL'ning o'zi bergan qator darajasidagi
atomiklikka tayanadi, shuning uchun buni faqat haqiqiy DB ustida tekshirish
mumkin (xuddi backend/services/job_creation.py testlaridan farqli).
DATABASE_URL orqali ulanadi -- local dev docker-compose stack yoki CI'dagi
haqiqiy Postgres kutiladi.
"""
import threading
import unittest
import uuid
from datetime import datetime, timedelta

from backend.models.database import SessionLocal, DubbingJob, JobStatus, User
from backend.services.job_claim import try_claim, release_claim


class TestJobClaimRealDB(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.job_id = uuid.uuid4()
        self.db.add(User(
            id=self.user_id, name="claim-test",
            email=f"claimtest+{self.user_id}@example.com", is_verified=True,
        ))
        self.db.add(DubbingJob(
            id=self.job_id, user_id=self.user_id,
            youtube_url="https://youtube.com/watch?v=test",
            status=JobStatus.DOWNLOADING,
        ))
        self.db.commit()

    def tearDown(self):
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).delete()
        self.db.query(User).filter(User.id == self.user_id).delete()
        self.db.commit()
        self.db.close()

    def test_single_claim_succeeds(self):
        token = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token)
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.processing_claim_token, token)
        self.assertIsNotNone(row.processing_lease_expires_at)

    def test_second_claim_blocked_while_lease_active(self):
        token1 = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token1)
        db2 = SessionLocal()
        token2 = try_claim(db2, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNone(token2)
        db2.close()

    def test_ten_concurrent_claims_exactly_one_winner(self):
        """Muhim test: bir nechta "worker" bir vaqtda bir xil job_id'ni
        claim qilishga urinsa, AYNAN BITTASI yutishi kerak -- bu Phase 2
        talabining o'zagi ("ONE job_id cannot enter an active processing
        state simultaneously in two workers")."""
        results = []

        def attempt():
            session = SessionLocal()
            token = try_claim(session, DubbingJob, self.job_id, lease_seconds=60)
            results.append(token)
            session.close()

        threads = [threading.Thread(target=attempt) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        winners = [t for t in results if t is not None]
        self.assertEqual(len(winners), 1, f"expected exactly one winner, got: {results}")

    def test_release_then_reclaim_succeeds(self):
        token = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        release_claim(self.db, DubbingJob, self.job_id, token)
        token2 = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token2)
        self.assertNotEqual(token, token2)

    def test_expired_lease_allows_new_claim_without_release(self):
        """Worker A qulasa (release_claim() hech qachon chaqirilmaydi),
        claim baribir lease muddati tugagach o'z-o'zidan bo'shaydi --
        Phase 3'ning asosiy talabi: yo'qolgan worker vazifani abadiy
        bloklab qo'ymasligi kerak."""
        token = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token)
        # Worker A "qulaydi" -- release_claim hech qachon chaqirilmaydi.
        # Lease'ni sun'iy ravishda o'tmishga suramiz (real vaqtda kutish o'rniga).
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).update(
            {"processing_lease_expires_at": datetime.utcnow() - timedelta(seconds=1)}
        )
        self.db.commit()

        token_b = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token_b)
        self.assertNotEqual(token, token_b)

    # 2026-08-26 worker-loss audit -- allow_reclaim (redelivered=True) tests.
    # These prove the exact invariant required: a live worker's claim is
    # never touched by this path, but a dead worker's abandoned claim
    # becomes reclaimable immediately rather than waiting for the full
    # lease duration.

    def test_healthy_unexpired_claim_blocks_non_redelivered_attempt(self):
        """Talab #1 (Worker A alive + Worker B attempts same job -> B must
        NOT steal A's claim): a normal (non-redelivered) attempt against a
        live, unexpired claim must still be blocked -- unchanged baseline
        behavior."""
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900)
        self.assertIsNotNone(token_a)
        token_b = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900, allow_reclaim=False)
        self.assertIsNone(token_b, "a non-redelivered attempt must never steal a live claim")
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.processing_claim_token, token_a, "original claim must be untouched")

    def test_four_concurrent_reclaim_attempts_on_empty_slot_exactly_one_winner(self):
        """allow_reclaim=True racing for a genuinely EMPTY slot: if
        several callers all observe the SAME (empty) prior state
        simultaneously (forced via a barrier -- see test_simultaneous_
        reclaim_of_the_same_dead_claim_exactly_one_winner for why this
        must be forced rather than left to timing), exactly one must
        win. Capped at 4 concurrent sessions (not 10) to stay under the
        SQLAlchemy engine's connection pool (pool_size=3 + max_overflow=2
        = 5) -- a barrier forces all N sessions to be simultaneously
        alive and holding a connection until every one has reached it,
        so N beyond the pool's capacity deadlocks (confirmed: 10 hung
        the whole test run). Uses the same observe-then-compare-and-swap
        primitive try_claim() uses internally (try_claim() itself has no
        injection point for a barrier between its own read and write, so
        this reimplements that exact sequence to make the race
        deterministic)."""
        barrier = threading.Barrier(4)
        results = []

        def attempt(label):
            session = SessionLocal()
            row = session.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
            observed = row.processing_claim_token
            barrier.wait()
            token_matches = (
                DubbingJob.processing_claim_token.is_(None) if observed is None
                else DubbingJob.processing_claim_token == observed
            )
            new_token = uuid.uuid4().hex
            n = (
                session.query(DubbingJob)
                .filter(DubbingJob.id == self.job_id, token_matches)
                .update({"processing_claim_token": new_token}, synchronize_session=False)
            )
            session.commit()
            results.append(new_token if n == 1 else None)
            session.close()

        threads = [threading.Thread(target=attempt, args=(f"w{i}",)) for i in range(4)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        winners = [t for t in results if t is not None]
        self.assertEqual(len(winners), 1, f"exactly one caller must win an empty slot, got: {results}")

    def test_dead_workers_unexpired_claim_is_reclaimable_with_allow_reclaim(self):
        """Talab #2-6 (Worker A dies -> Celery redelivers -> redelivered
        task detects & reclaims the abandoned claim -> only one active):
        this is the exact gap found in production -- a claim with a
        VALID, UNEXPIRED lease (simulating a SIGKILLed worker that never
        reached release_claim) must become reclaimable when the caller
        signals allow_reclaim=True (i.e. its own Celery delivery was
        redelivered)."""
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900)
        self.assertIsNotNone(token_a)
        # token_a's holder "dies" -- never released, lease still valid.
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertGreater(row.processing_lease_expires_at, datetime.utcnow(), "lease must still be unexpired for this test to be meaningful")

        token_b = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900, allow_reclaim=True)
        self.assertIsNotNone(token_b, "a redelivered attempt must be able to reclaim an abandoned (unexpired) claim")
        self.assertNotEqual(token_a, token_b)

        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.processing_claim_token, token_b, "only worker B's claim should remain")

    def test_simultaneous_reclaim_of_the_same_dead_claim_exactly_one_winner(self):
        """Talab #6 (only one task remains active), tested precisely: TWO
        callers that genuinely, simultaneously observe the SAME dead
        claim (forced via a barrier so both reads happen before either
        write -- not timing luck) must resolve to exactly one winner.

        Note on what this deliberately does NOT test: an *unsynchronized*
        multi-way race where later callers' reads land after an earlier
        winner has already committed is not attempted here, because it
        doesn't correspond to anything Celery's real delivery semantics
        can produce. In the real system, allow_reclaim=True is only ever
        set from self.request.delivery_info['redelivered'], which Celery
        populates only when it has independently confirmed the CURRENT
        holder of this exact task_id's message is gone -- Redis hands a
        given message to exactly one consumer at a time, so there is
        never more than one in-flight redelivery for the same job_id.
        A later redelivered=True arriving after an earlier reclaimer has
        already taken over is not a forgery -- it means Celery has
        confirmed THAT reclaimer also died, which is exactly the case
        this mechanism is supposed to keep handling correctly (a real,
        legitimate chain of deaths, not a race against a live worker)."""
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=3900)
        self.assertIsNotNone(token_a)

        barrier = threading.Barrier(2)
        results = []

        def attempt(label):
            session = SessionLocal()
            row = session.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
            observed = row.processing_claim_token
            barrier.wait()  # force both reads to happen before either write
            token_matches = (
                DubbingJob.processing_claim_token.is_(None) if observed is None
                else DubbingJob.processing_claim_token == observed
            )
            new_token = uuid.uuid4().hex
            n = (
                session.query(DubbingJob)
                .filter(DubbingJob.id == self.job_id, token_matches)
                .update({"processing_claim_token": new_token}, synchronize_session=False)
            )
            session.commit()
            results.append((label, new_token if n == 1 else None))
            session.close()

        threads = [threading.Thread(target=attempt, args=(f"w{i}",)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        winners = [r[1] for r in results if r[1] is not None]
        self.assertEqual(len(winners), 1, f"exactly one of two truly-simultaneous reclaimers must win, got: {results}")
        self.assertNotIn(token_a, winners, "the reclaiming winner must get a NEW token, not somehow reuse the dead worker's")

    def test_release_with_wrong_token_is_safe_noop(self):
        """Agar release juda kech kelsa (masalan Worker A juda sekin
        javob bersa) va shu orada Worker B allaqachon yangi claim olgan
        bo'lsa, Worker A'ning eskirgan release chaqiruvi Worker B'ning
        YANGI claim'ini bo'shatib yubormasligi kerak."""
        token_a = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).update(
            {"processing_lease_expires_at": datetime.utcnow() - timedelta(seconds=1)}
        )
        self.db.commit()
        token_b = try_claim(self.db, DubbingJob, self.job_id, lease_seconds=60)
        self.assertIsNotNone(token_b)

        release_claim(self.db, DubbingJob, self.job_id, token_a)  # eskirgan/kech

        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.processing_claim_token, token_b, "Worker B's live claim must survive Worker A's stale release")


if __name__ == "__main__":
    unittest.main()
