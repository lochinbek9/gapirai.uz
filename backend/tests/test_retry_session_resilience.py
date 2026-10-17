"""2026-08-26 orphan-job fix regression tests (production incident:
job 9ffc3336-3096-4226-bc14-0878f4e06f99, YouTube reliability sample test).

Root cause reproduced here: a connection-level error (Postgres
idle-in-transaction timeout) invalidates the task's own `db` session.
Before this fix, the retryable-error branch in process_video/
analyze_video_task reused that SAME (now-dead) session for its status-
update lookup, raising a SECOND, unhandled OperationalError from inside
the except block -- which skipped self.retry()/_mark_job_failed()/refund/
notification entirely and left the row stuck in a non-terminal status with
no error_code/error_message, forever indistinguishable from a live task.

These tests use a `_PoisonableSession` wrapper: it delegates to a real
Postgres session normally, but once "poisoned" it raises OperationalError
on every further query/commit -- reproducing the exact production failure
mode without needing to actually kill a live connection. `SessionLocal` is
patched so only the FIRST call (the task's own `db`) can be poisoned;
every subsequent `SessionLocal()` call (what the fix's retry-branch lookup
now uses, matching _mark_job_failed/_release_claim_safe) gets a genuinely
fresh, real, unpoisoned session -- so if the fix is reverted to reusing the
original session, these tests fail with an unhandled OperationalError
instead of a clean Retry/FAILED outcome.
"""
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from celery.exceptions import Retry
from sqlalchemy.exc import OperationalError

from backend.models.database import (
    SessionLocal, DubbingJob, JobStatus, User, VideoAnalysis, AnalysisStatus,
)
from backend.services.errors import PermanentError
from backend.workers.tasks import process_video
from backend.workers.analysis_tasks import analyze_video_task


class _PoisonableSession:
    """Wraps a real SQLAlchemy session. Behaves normally until `.poison()`
    is called, after which every query/commit/add simulates a dead
    connection -- reproducing a mid-task Postgres disconnect."""

    def __init__(self, real_session):
        self._real = real_session
        self._poisoned = False

    def poison(self):
        self._poisoned = True

    def _check(self):
        if self._poisoned:
            raise OperationalError("simulated dead connection (idle-in-transaction timeout)", None, None)

    def query(self, *a, **kw):
        self._check()
        return self._real.query(*a, **kw)

    def commit(self):
        self._check()
        return self._real.commit()

    def add(self, *a, **kw):
        self._check()
        return self._real.add(*a, **kw)

    def close(self):
        # A real dead connection's close() does not itself raise -- matches
        # the defensive `try: db.close() except Exception: pass` in the fix.
        return self._real.close()

    def __getattr__(self, name):
        return getattr(self._real, name)


def _fake_retry(captured: dict):
    """Stands in for Task.retry() without touching a real broker -- mirrors
    the standard Celery unit-testing technique of raising Retry directly."""
    def _retry(self=None, exc=None, countdown=None, **kw):
        captured["exc"] = exc
        captured["countdown"] = countdown
        raise Retry(exc=exc)
    return _retry


class TestProcessVideoRetrySessionResilience(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.job_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="retry-session-test", email=f"rst+{self.user_id}@example.com", is_verified=True))
        self.db.commit()
        self._tmpfiles = []

    def _dummy_file(self) -> str:
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
        f.write(b"x")
        f.close()
        self._tmpfiles.append(f.name)
        return f.name

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
        for path in self._tmpfiles:
            Path(path).unlink(missing_ok=True)

    def _patched_session_local(self, poisoned_holder: dict):
        """First SessionLocal() call returns a poisonable wrapper (and
        stashes it in poisoned_holder so the test can poison it later);
        every subsequent call returns a genuinely fresh real session."""
        real_session_local = SessionLocal

        def factory():
            if "session" not in poisoned_holder:
                wrapped = _PoisonableSession(real_session_local())
                poisoned_holder["session"] = wrapped
                return wrapped
            return real_session_local()
        return factory

    # 1. initial DB OperationalError -- the very first query in the task
    #    (the job fetch) hits an already-dead connection.
    def test_initial_job_fetch_operational_error_does_not_crash_uncaught(self):
        self._make_job(status=JobStatus.PENDING)
        captured = {}
        call_count = {"n": 0}

        def factory():
            call_count["n"] += 1
            if call_count["n"] == 1:
                wrapped = _PoisonableSession(SessionLocal())
                wrapped.poison()
                return wrapped
            return SessionLocal()

        with patch("backend.workers.tasks.SessionLocal", side_effect=factory):
            with patch.object(process_video, "retry", new=_fake_retry(captured)):
                with self.assertRaises(Retry):
                    process_video.run(str(self.job_id))

        self.assertIsNotNone(captured.get("exc"))

        fresh = SessionLocal()
        row = fresh.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        fresh.close()
        # 6. job does not remain stuck -- error is now visible, not silent
        # (before the fix, this row would have NO error_code/status_message
        # at all -- the second unhandled OperationalError skipped every
        # write in the except block).
        self.assertTrue(row.error_code, "error_code must be populated, not silently blank")
        self.assertIn(f"1/{process_video.max_retries}", row.status_message)
        self.assertIsNone(row.processing_claim_token, "claim must not be left held after a failed initial fetch")

    # 2 & 3. retryable error mid-pipeline (DOWNLOAD stage), original session
    #    poisoned AFTER legitimate prior use -- proves the retry-branch uses
    #    a fresh session rather than the now-broken original.
    def test_retryable_download_error_uses_fresh_session_not_original(self):
        self._make_job(status=JobStatus.PENDING)
        holder = {}
        captured = {}

        def download_side_effect(*a, **kw):
            # Simulate the connection dying mid-task, exactly like the
            # production incident -- poison the ORIGINAL session right as
            # the retryable error occurs.
            holder["session"].poison()
            raise Exception("simulated: server closed the connection unexpectedly")

        with patch("backend.workers.tasks.SessionLocal", side_effect=self._patched_session_local(holder)):
            with patch("backend.workers.tasks.downloader.download_video", side_effect=download_side_effect):
                with patch.object(process_video, "retry", new=_fake_retry(captured)):
                    # If the fix were reverted (retry branch reuses `db`),
                    # this would raise OperationalError instead of Retry --
                    # the poisoned original session is set up specifically
                    # to have no other way to succeed.
                    with self.assertRaises(Retry):
                        process_video.run(str(self.job_id))

        self.assertIsNotNone(captured.get("exc"))
        # 4. retry is actually scheduled (countdown computed = retry happened).
        self.assertIsNotNone(captured.get("countdown"))

        fresh = SessionLocal()
        row = fresh.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        fresh.close()
        self.assertIn(f"1/{process_video.max_retries}", row.status_message)
        self.assertIsNotNone(row.error_code)
        self.assertIsNone(row.processing_claim_token)

    # 5. retry counter preserved across the fix.
    def test_retry_counter_is_reflected_in_persisted_status_message(self):
        self._make_job(status=JobStatus.PENDING)
        holder = {}
        captured = {}

        def download_side_effect(*a, **kw):
            holder["session"].poison()
            raise Exception("simulated transient network error")

        process_video.push_request(retries=2)
        try:
            with patch("backend.workers.tasks.SessionLocal", side_effect=self._patched_session_local(holder)):
                with patch("backend.workers.tasks.downloader.download_video", side_effect=download_side_effect):
                    with patch.object(process_video, "retry", new=_fake_retry(captured)):
                        with self.assertRaises(Retry):
                            process_video.run(str(self.job_id))
        finally:
            process_video.pop_request()

        # countdown formula: min(600, 30 * 2**retries) -- retries=2 -> 120
        self.assertEqual(captured.get("countdown"), 120)
        fresh = SessionLocal()
        row = fresh.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        fresh.close()
        self.assertIn(f"3/{process_video.max_retries}", row.status_message)  # self.request.retries + 1

    # 8. non-retryable error behavior unchanged -- must NOT touch the new
    #    retry-branch code path at all; goes straight to FAILED as before.
    def test_non_retryable_error_still_goes_straight_to_failed(self):
        self._make_job(status=JobStatus.PENDING)
        with patch("backend.workers.tasks.downloader.download_video",
                   side_effect=Exception("ERROR: [youtube] xyz: Private video. Sign in if you've been granted access to this video")):
            with self.assertRaises(Exception):
                process_video.run(str(self.job_id))

        self.db.expire_all()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED)
        self.assertEqual(row.error_code, "VIDEO_UNAVAILABLE")
        self.assertIsNone(row.processing_claim_token)

    # 9. successful processing behavior unchanged -- the fix's new code path
    #    is never entered when nothing fails.
    def test_successful_pipeline_reaches_completed_unaffected(self):
        video_path = self._dummy_file()
        audio_path = self._dummy_file()
        dubbed_audio_path = self._dummy_file()
        output_video_path = self._dummy_file()

        self._make_job(
            status=JobStatus.PENDING,
            original_video_path=video_path,
            transcript_segments=[{"start": 0.0, "end": 1.0, "text": "salom"}],
            transcript_text="salom",
            speaker_gender="male",
            translated_segments=[{"id": 0, "start": 0.0, "end": 1.0, "text": "salom"}],
            speech_segments=[{"id": 0, "start": 0.0, "end": 1.0, "text": "salom"}],
            dubbed_audio_path=dubbed_audio_path,
            output_video_path=output_video_path,
        )
        # DOWNLOAD checkpoint also requires job_dir/audio.wav to exist.
        from backend.config import get_settings
        settings = get_settings()
        job_dir = Path(settings.UPLOAD_DIR) / str(self.job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        real_audio_path = job_dir / "audio.wav"
        real_audio_path.write_bytes(b"x")
        self._tmpfiles.append(str(real_audio_path))

        with patch("backend.workers.tasks.check_safety") as mock_safety, \
             patch("backend.services.storage.upload_file_to_s3", return_value=False), \
             patch("backend.services.synthesizer.group_segments_into_sentences", side_effect=lambda s: s), \
             patch("backend.workers.tasks.send_dubbing_complete_email"):
            mock_safety.return_value = type("S", (), {"allowed": True, "category": None})()
            result = process_video.run(str(self.job_id))

        self.assertEqual(result["status"], "completed")
        self.db.expire_all()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.COMPLETED)
        self.assertIsNone(row.processing_claim_token)


class TestAnalyzeVideoTaskRetrySessionResilience(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.analysis_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="retry-session-analysis-test", email=f"rsat+{self.user_id}@example.com", is_verified=True))
        self.db.commit()

    def _make_analysis(self, **overrides):
        defaults = dict(id=self.analysis_id, user_id=self.user_id, youtube_url="https://youtube.com/watch?v=test", status=AnalysisStatus.PENDING)
        defaults.update(overrides)
        self.db.add(VideoAnalysis(**defaults))
        self.db.commit()

    def tearDown(self):
        self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).delete()
        self.db.query(User).filter(User.id == self.user_id).delete()
        self.db.commit()
        self.db.close()

    def _patched_session_local(self, poisoned_holder: dict):
        real_session_local = SessionLocal

        def factory():
            if "session" not in poisoned_holder:
                wrapped = _PoisonableSession(real_session_local())
                poisoned_holder["session"] = wrapped
                return wrapped
            return real_session_local()
        return factory

    # 7. analysis does not remain stuck -- same fix, same proof, for the
    #    independent analysis pipeline.
    def test_retryable_download_error_uses_fresh_session_not_original(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        holder = {}
        captured = {}

        def download_side_effect(*a, **kw):
            holder["session"].poison()
            raise Exception("simulated: server closed the connection unexpectedly")

        with patch("backend.workers.analysis_tasks.SessionLocal", side_effect=self._patched_session_local(holder)):
            with patch("backend.workers.analysis_tasks.downloader.download_video", side_effect=download_side_effect):
                with patch.object(analyze_video_task, "retry", new=_fake_retry(captured)):
                    with self.assertRaises(Retry):
                        analyze_video_task.run(str(self.analysis_id))

        self.assertIsNotNone(captured.get("countdown"))
        fresh = SessionLocal()
        row = fresh.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        fresh.close()
        self.assertIn(f"1/{analyze_video_task.max_retries}", row.status_message)
        self.assertIsNotNone(row.error_code)
        self.assertIsNone(row.processing_claim_token)

    def test_non_retryable_error_still_goes_straight_to_failed(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        with patch("backend.workers.analysis_tasks.downloader.download_video",
                   side_effect=Exception("ERROR: [youtube] xyz: Private video. Sign in if you've been granted access to this video")):
            with self.assertRaises(Exception):
                analyze_video_task.run(str(self.analysis_id))

        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertEqual(row.status, AnalysisStatus.FAILED)
        self.assertEqual(row.error_code, "VIDEO_UNAVAILABLE")
        self.assertIsNone(row.processing_claim_token)


if __name__ == "__main__":
    unittest.main()
