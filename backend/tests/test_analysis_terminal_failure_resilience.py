"""2026-08-27 analysis-terminal-failure-path fix regression tests.

Production incident (10-video reliability sample): analyze_video_task's
retry branch was already hardened (2026-08-26) against a poisoned original
`db` session, but its TWO terminal failure exits -- the PermanentError
handler and the final "max retries reached" handler -- still wrote the
FAILED status directly on the original session. When a real Postgres
connection blip hit `fJ9rUzIMcZQ`'s analysis at exactly that moment, the
write itself raised a second, unhandled OperationalError, skipping the
FAILED write entirely and leaving the row stuck in DOWNLOADING with a
stale error_code, forever indistinguishable from a live task.

Same `_PoisonableSession` technique as test_retry_session_resilience.py:
delegates to a real Postgres session until poisoned, after which every
query/commit simulates a dead connection -- reproducing the exact
production failure mode without needing to kill a live connection.
`SessionLocal` is patched so only the task's own first `db = SessionLocal()`
call can be poisoned; every subsequent `SessionLocal()` call (what
_mark_analysis_failed and the retry branch now use) gets a genuinely
fresh, real, unpoisoned session.
"""
import unittest
import uuid
from datetime import datetime
from unittest.mock import patch

from celery.exceptions import Retry
from sqlalchemy.exc import OperationalError

from backend.models.database import SessionLocal, VideoAnalysis, AnalysisStatus, User
from backend.services.errors import PermanentError
from backend.workers.analysis_tasks import analyze_video_task, _mark_analysis_failed


class _PoisonableSession:
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
        return self._real.close()

    def __getattr__(self, name):
        return getattr(self._real, name)


def _fake_retry(captured: dict):
    def _retry(self=None, exc=None, countdown=None, **kw):
        captured["exc"] = exc
        captured["countdown"] = countdown
        raise Retry(exc=exc)
    return _retry


class TestMarkAnalysisFailedUnit(unittest.TestCase):
    """_mark_analysis_failed() in isolation -- proves the fresh-session
    write succeeds even when SessionLocal's FIRST call would have returned
    a poisoned session (it never does inside this helper -- every call it
    makes is its own fresh SessionLocal())."""

    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.analysis_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="mark-failed-test", email=f"mft+{self.user_id}@example.com", is_verified=True))
        self.db.add(VideoAnalysis(
            id=self.analysis_id, user_id=self.user_id, youtube_url="https://youtube.com/watch?v=test",
            status=AnalysisStatus.DOWNLOADING,
        ))
        self.db.commit()

    def tearDown(self):
        self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).delete()
        self.db.query(User).filter(User.id == self.user_id).delete()
        self.db.commit()
        self.db.close()

    def test_writes_failed_with_error_code_and_message(self):
        _mark_analysis_failed(str(self.analysis_id), "HTTP_403", "test error message")
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertEqual(row.status, AnalysisStatus.FAILED)
        self.assertEqual(row.error_code, "HTTP_403")
        self.assertEqual(row.error_message, "test error message")

    def test_never_reuses_a_caller_supplied_broken_session(self):
        """_mark_analysis_failed takes no `db` argument at all -- it always
        opens its own. This test documents that contract: even if we
        (the caller) hand it nothing but a dead analysis_id string, it
        still succeeds, because it never touches any session we might
        have poisoned."""
        _mark_analysis_failed(str(self.analysis_id), "TIMEOUT", "unrelated to any caller session")
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertEqual(row.status, AnalysisStatus.FAILED)


class TestAnalyzeVideoTaskTerminalFailureResilience(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.analysis_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="analysis-resilience-test", email=f"art+{self.user_id}@example.com", is_verified=True))
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

    def _patched_session_local(self, holder: dict):
        real = SessionLocal

        def factory():
            if "session" not in holder:
                wrapped = _PoisonableSession(real())
                holder["session"] = wrapped
                return wrapped
            return real()
        return factory

    # 1 & 2. PermanentError path uses a fresh session -- if it reused the
    # poisoned original, this would raise OperationalError instead of
    # cleanly reaching FAILED.
    def test_permanent_error_path_uses_fresh_session_not_poisoned_original(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        holder = {}

        def poison_then_raise(*a, **kw):
            holder["session"].poison()
            raise PermanentError("Bu videoda nutq topilmadi.", code="NO_SPEECH_FOUND")

        with patch("backend.workers.analysis_tasks.SessionLocal", side_effect=self._patched_session_local(holder)), \
             patch("backend.workers.analysis_tasks.downloader.download_video") as mock_dl, \
             patch("backend.workers.analysis_tasks.transcriber.transcribe_audio", side_effect=poison_then_raise):
            mock_dl.return_value = {"title": "t", "duration": 5.0, "audio_path": "/dev/null"}
            with self.assertRaises(PermanentError):
                analyze_video_task.run(str(self.analysis_id))

        fresh = SessionLocal()
        row = fresh.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        fresh.close()
        self.assertEqual(row.status, AnalysisStatus.FAILED, "PermanentError must still reach FAILED despite the poisoned original session")
        self.assertEqual(row.error_code, "NO_SPEECH_FOUND")
        self.assertIsNotNone(row.error_message)
        self.assertIsNone(row.processing_claim_token, "claim must be released")

    # 1 & 3. Final retry-exhaustion path uses a fresh session.
    def test_retry_exhaustion_path_uses_fresh_session_not_poisoned_original(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        holder = {}

        def poison_then_fail(*a, **kw):
            holder["session"].poison()
            raise Exception("simulated persistent transcription failure")

        analyze_video_task.push_request(retries=5)  # already at max -- next failure skips retry branch
        try:
            with patch("backend.workers.analysis_tasks.SessionLocal", side_effect=self._patched_session_local(holder)), \
                 patch("backend.workers.analysis_tasks.downloader.download_video") as mock_dl, \
                 patch("backend.workers.analysis_tasks.transcriber.transcribe_audio", side_effect=poison_then_fail):
                mock_dl.return_value = {"title": "t", "duration": 5.0, "audio_path": "/dev/null"}
                with self.assertRaises(Exception):
                    analyze_video_task.run(str(self.analysis_id))
        finally:
            analyze_video_task.pop_request()

        fresh = SessionLocal()
        row = fresh.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        fresh.close()
        self.assertEqual(row.status, AnalysisStatus.FAILED, "max-retries-exhausted path must still reach FAILED despite the poisoned original session")
        self.assertIsNotNone(row.error_code)
        self.assertEqual(row.error_message, "Videoni tahlil qilishda xatolik yuz berdi. Iltimos, birozdan keyin qayta urinib ko'ring.")
        self.assertIsNone(row.processing_claim_token, "claim must be released")

    # 4. Retry counter remains correct through the (unmodified) retry branch.
    def test_retry_branch_countdown_and_message_unaffected_by_this_fix(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        captured = {}

        analyze_video_task.push_request(retries=2)
        try:
            with patch("backend.workers.analysis_tasks.downloader.download_video") as mock_dl, \
                 patch("backend.workers.analysis_tasks.transcriber.transcribe_audio", side_effect=Exception("transient")), \
                 patch.object(analyze_video_task, "retry", new=_fake_retry(captured)):
                mock_dl.return_value = {"title": "t", "duration": 5.0, "audio_path": "/dev/null"}
                with self.assertRaises(Retry):
                    analyze_video_task.run(str(self.analysis_id))
        finally:
            analyze_video_task.pop_request()

        self.assertEqual(captured.get("countdown"), 120)  # min(600, 30*2**2)
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertIn("3/5", row.status_message)
        # TRANSCRIBING is legitimately set (via _update_analysis) before the
        # mocked failure fires -- the retry branch's own job is just to NOT
        # push status to FAILED/COMPLETED, which this asserts directly.
        self.assertNotIn(row.status, (AnalysisStatus.FAILED, AnalysisStatus.COMPLETED), "retry branch must not touch terminal status")

    # 5. Claim released on both terminal failure paths (already asserted
    # above per-path; this test isolates it explicitly as its own check).
    def test_claim_released_after_permanent_error(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        with patch("backend.workers.analysis_tasks.downloader.download_video") as mock_dl, \
             patch("backend.workers.analysis_tasks.transcriber.transcribe_audio",
                   side_effect=PermanentError("no speech", code="NO_SPEECH_FOUND")):
            mock_dl.return_value = {"title": "t", "duration": 5.0, "audio_path": "/dev/null"}
            with self.assertRaises(PermanentError):
                analyze_video_task.run(str(self.analysis_id))
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertIsNone(row.processing_claim_token)
        self.assertIsNone(row.processing_lease_expires_at)

    # 6. COMPLETED clears stale error_code/error_message from an earlier
    # failed-then-succeeded retry cycle.
    def test_completed_clears_stale_error_fields(self):
        self._make_analysis(
            status=AnalysisStatus.ANALYZING,
            error_code="HTTP_403",
            error_message="stale error from an earlier failed attempt",
            transcript_segments=[{"start": 0.0, "end": 1.0, "text": "salom dunyo"}],
            video_language="uz",
            language="uz",
            summary={"short": "s", "medium": "m", "detailed": "d"},
            key_points=[{"title": "t", "description": "d", "timestamp": 0.0}],
            chapters=[{"title": "c", "start": 0.0, "end": 1.0}],
            five_minute_summary={"title": "t"},
        )
        with patch("backend.workers.analysis_tasks._service") as mock_service:
            result = analyze_video_task.run(str(self.analysis_id))

        self.assertEqual(result["status"], "completed")
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertEqual(row.status, AnalysisStatus.COMPLETED)
        self.assertIsNone(row.error_code, "stale error_code must be cleared on COMPLETED")
        self.assertIsNone(row.error_message, "stale error_message must be cleared on COMPLETED")
        # Do not affect successful analysis data.
        self.assertEqual(row.summary, {"short": "s", "medium": "m", "detailed": "d"})
        self.assertIsNotNone(row.completed_at)

    # 7. Normal success path (no prior error at all) remains unchanged.
    def test_normal_success_unaffected(self):
        self._make_analysis(status=AnalysisStatus.PENDING)
        with patch("backend.workers.analysis_tasks.downloader.download_video") as mock_dl, \
             patch("backend.workers.analysis_tasks.transcriber.transcribe_audio") as mock_transcribe, \
             patch("backend.workers.analysis_tasks._service") as mock_service:
            mock_dl.return_value = {"title": "t", "duration": 5.0, "audio_path": "/dev/null"}
            mock_transcribe.return_value = {"segments": [{"start": 0.0, "end": 1.0, "text": "salom"}], "language": "uz"}
            mock_service.generate_summary.return_value = {"short": "s", "medium": "m", "detailed": "d"}
            mock_service.generate_key_points.return_value = [{"title": "t", "description": "d", "timestamp": 0.0}]
            mock_service.generate_chapters.return_value = [{"title": "c", "start": 0.0, "end": 1.0}]
            mock_service.generate_five_minute_summary.return_value = {"title": "t"}
            with patch("backend.workers.analysis_tasks.transcriber.has_speech", return_value=True):
                result = analyze_video_task.run(str(self.analysis_id))

        self.assertEqual(result["status"], "completed")
        self.db.expire_all()
        row = self.db.query(VideoAnalysis).filter(VideoAnalysis.id == self.analysis_id).first()
        self.assertEqual(row.status, AnalysisStatus.COMPLETED)
        self.assertIsNone(row.error_code)
        self.assertIsNone(row.error_message)
        self.assertIsNone(row.processing_claim_token)


if __name__ == "__main__":
    unittest.main()
