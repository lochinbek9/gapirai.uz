"""2026-08-26 host-local-checkpoint fix regression tests (production
finding: job 83ca2305-6cb5-4fc0-a8af-4e2cf0bbc97f -- a successful download
on one worker host was invisible to a later retry landing on a different
host, forcing an unnecessary re-download that then hit a real YouTube
failure).

Two layers tested:
1. backend/services/job_checkpoint.py in isolation, with storage.py's S3
   functions mocked via a small in-memory fake (no real AWS needed).
2. backend/workers/tasks.py:process_video end-to-end (real Postgres, same
   pattern as test_process_video_claim_integration.py), simulating a
   "Worker A downloads, Worker B resumes" scenario by deleting the local
   checkpoint files between two calls and asserting the second call never
   touches the downloader -- proving the S3 restore path, not just the
   pre-existing same-host local-disk check.
"""
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from celery.exceptions import Retry

from backend.models.database import SessionLocal, DubbingJob, JobStatus, User
from backend.services.errors import PermanentError
from backend.services import job_checkpoint
from backend.workers.tasks import process_video


def _fake_retry(captured: dict):
    """Stands in for Task.retry() without touching a real broker -- same
    technique as test_retry_session_resilience.py."""
    def _retry(self=None, exc=None, countdown=None, **kw):
        captured["exc"] = exc
        captured["countdown"] = countdown
        raise Retry(exc=exc)
    return _retry


class _FakeS3:
    """In-memory stand-in for the real S3 bucket -- upload/download just
    move bytes through a dict, so a checkpoint written by one call is
    genuinely visible to a later call, exactly like real S3 would be
    (unlike the local filesystem, which is what this whole fix is about
    NOT relying on across hosts)."""

    def __init__(self):
        self.store: dict[str, bytes] = {}

    def upload(self, file_path: str, object_name: str) -> bool:
        with open(file_path, "rb") as f:
            self.store[object_name] = f.read()
        return True

    def download(self, object_name: str, local_path: str) -> bool:
        if object_name not in self.store:
            return False
        with open(local_path, "wb") as f:
            f.write(self.store[object_name])
        return True


class TestJobCheckpointUnit(unittest.TestCase):
    """job_checkpoint.py in isolation -- no DB, no Celery."""

    def setUp(self):
        self.fake_s3 = _FakeS3()
        self._tmpfiles = []

    def tearDown(self):
        for p in self._tmpfiles:
            Path(p).unlink(missing_ok=True)

    def _dummy_file(self, content: bytes = b"fake-checkpoint-bytes") -> str:
        f = tempfile.NamedTemporaryFile(delete=False)
        f.write(content)
        f.close()
        self._tmpfiles.append(f.name)
        return f.name

    def test_checkpoint_s3_key_is_deterministic_per_job_and_filename(self):
        key1 = job_checkpoint.checkpoint_s3_key("job-a", "video.mp4")
        key2 = job_checkpoint.checkpoint_s3_key("job-a", "video.mp4")
        key3 = job_checkpoint.checkpoint_s3_key("job-b", "video.mp4")
        self.assertEqual(key1, key2)
        self.assertNotEqual(key1, key3)
        self.assertIn("job-a", key1)
        self.assertIn("video.mp4", key1)

    def test_restore_checkpoint_no_s3_call_when_local_file_already_exists(self):
        local = self._dummy_file()
        with patch("backend.services.job_checkpoint.download_file_from_s3") as mock_dl:
            result = job_checkpoint.restore_checkpoint("job-x", "video.mp4", local)
        mock_dl.assert_not_called()
        self.assertTrue(result)

    def test_restore_checkpoint_pulls_from_s3_when_local_missing(self):
        source = self._dummy_file(b"worker-a-content")
        # "Worker A" uploads.
        with patch("backend.services.job_checkpoint.upload_file_to_s3", side_effect=self.fake_s3.upload):
            job_checkpoint.save_checkpoint("job-y", "video.mp4", source)

        # "Worker B" -- a local path that has never existed on this host.
        target_dir = tempfile.mkdtemp()
        target = str(Path(target_dir) / "video.mp4")
        self.assertFalse(Path(target).exists())

        with patch("backend.services.job_checkpoint.download_file_from_s3", side_effect=self.fake_s3.download):
            result = job_checkpoint.restore_checkpoint("job-y", "video.mp4", target)

        self.assertTrue(result)
        self.assertTrue(Path(target).exists())
        self.assertEqual(Path(target).read_bytes(), b"worker-a-content")
        Path(target).unlink()

    def test_restore_checkpoint_returns_false_when_nothing_available(self):
        target = str(Path(tempfile.mkdtemp()) / "never_uploaded.mp4")
        with patch("backend.services.job_checkpoint.download_file_from_s3", return_value=False):
            result = job_checkpoint.restore_checkpoint("job-z", "video.mp4", target)
        self.assertFalse(result)
        self.assertFalse(Path(target).exists())

    def test_save_checkpoint_failure_does_not_raise(self):
        local = self._dummy_file()
        with patch("backend.services.job_checkpoint.upload_file_to_s3", side_effect=Exception("S3 down")):
            job_checkpoint.save_checkpoint("job-w", "video.mp4", local)  # must not raise

    def test_restore_checkpoint_creates_parent_directory(self):
        source = self._dummy_file(b"data")
        with patch("backend.services.job_checkpoint.upload_file_to_s3", side_effect=self.fake_s3.upload):
            job_checkpoint.save_checkpoint("job-v", "audio.wav", source)

        nested_target = str(Path(tempfile.mkdtemp()) / "nested" / "does" / "not" / "exist" / "audio.wav")
        self.assertFalse(Path(nested_target).parent.exists())
        with patch("backend.services.job_checkpoint.download_file_from_s3", side_effect=self.fake_s3.download):
            result = job_checkpoint.restore_checkpoint("job-v", "audio.wav", nested_target)
        self.assertTrue(result)
        self.assertTrue(Path(nested_target).exists())


class TestCrossHostCheckpointResume(unittest.TestCase):
    """End-to-end through process_video, simulating Worker A / Worker B by
    deleting the local checkpoint file between two calls on the SAME job
    row -- if the fix works, the second call finds the file via the fake
    S3 and never calls the downloader again."""

    def setUp(self):
        self.db = SessionLocal()
        self.user_id = uuid.uuid4()
        self.job_id = uuid.uuid4()
        self.db.add(User(id=self.user_id, name="checkpoint-test", email=f"cpt+{self.user_id}@example.com", is_verified=True))
        self.db.commit()
        self.fake_s3 = _FakeS3()
        self._tmpfiles = []

    def _dummy_file(self, content: bytes = b"video-bytes") -> str:
        f = tempfile.NamedTemporaryFile(delete=False, suffix=".bin")
        f.write(content)
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
        for p in self._tmpfiles:
            Path(p).unlink(missing_ok=True)

    def test_worker_a_downloads_worker_b_resumes_without_redownloading(self):
        self._make_job(status=JobStatus.PENDING)
        video_path = self._dummy_file(b"real-video-bytes")
        # audio_path is NOT a DB-tracked field -- tasks.py always recomputes
        # it fresh as UPLOAD_DIR/{job_id}/audio.wav on every call (see
        # tasks.py:process_video, `audio_path = str(job_dir / "audio.wav")`),
        # so the mock must write to that exact real convention, not an
        # arbitrary tempfile, or the checkpoint-restore target on the
        # "Worker B" call wouldn't match what was actually checkpointed.
        from backend.config import get_settings
        settings = get_settings()
        job_dir = Path(settings.UPLOAD_DIR) / str(self.job_id)
        job_dir.mkdir(parents=True, exist_ok=True)
        audio_path = str(job_dir / "audio.wav")
        Path(audio_path).write_bytes(b"real-audio-bytes")
        self._tmpfiles.append(audio_path)

        download_call_count = {"n": 0}

        def fake_download(url, job_id):
            download_call_count["n"] += 1
            return {"title": "t", "duration": 10.0, "video_path": video_path, "audio_path": audio_path}

        # --- "Worker A": DOWNLOAD succeeds, checkpoint uploads to fake S3,
        # then we force a stop right after with an ordinary RETRYABLE error
        # (not PermanentError) -- this matches the real production incident
        # (job 83ca2305: a genuine retryable TTS failure, not a permanent
        # one) and matters here specifically because PermanentError is
        # terminal and triggers _cleanup_upload_dir(), which would delete
        # the local files itself and make this test meaningless. A
        # retryable error takes tasks.py's RETRY branch instead, which
        # deliberately leaves checkpointed files in place for the next
        # attempt -- exactly the scenario this fix targets.
        retry_captured = {}
        with patch("backend.workers.tasks.downloader.download_video", side_effect=fake_download), \
             patch("backend.services.job_checkpoint.upload_file_to_s3", side_effect=self.fake_s3.upload), \
             patch("backend.workers.tasks.transcriber.transcribe_audio", side_effect=Exception("transient transcribe error")), \
             patch.object(process_video, "retry", new=_fake_retry(retry_captured)):
            with self.assertRaises(Retry):
                process_video.run(str(self.job_id))

        self.assertEqual(download_call_count["n"], 1, "Worker A must actually download once")

        self.db.expire_all()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.TRANSCRIBING, "retryable failure must not mark the job terminal")
        self.assertEqual(row.original_video_path, video_path)
        self.assertIsNone(row.processing_claim_token, "claim released so a later delivery can reclaim")

        # --- Simulate "Worker B": the same job_id retried on a host that
        # never had these files -- delete the local checkpoint files (the
        # DB still points at these exact paths, matching what a different
        # host's identical relative path would look like).
        Path(video_path).unlink()
        Path(audio_path).unlink()
        self.assertFalse(Path(video_path).exists())
        self.assertFalse(Path(audio_path).exists())

        def fail_if_called(*a, **kw):
            raise AssertionError("Worker B must NOT re-download -- the checkpoint should have restored from S3")

        # Stays retryable here too, for the same reason as Worker A's stop:
        # PermanentError is terminal and triggers _cleanup_upload_dir(),
        # which would delete the just-restored job_dir/audio.wav before we
        # get to assert on it -- that's a property of the (correct)
        # cleanup logic, not something to work around by asserting earlier.
        with patch("backend.workers.tasks.downloader.download_video", side_effect=fail_if_called), \
             patch("backend.services.job_checkpoint.download_file_from_s3", side_effect=self.fake_s3.download), \
             patch("backend.workers.tasks.transcriber.transcribe_audio", side_effect=Exception("transient transcribe error again")), \
             patch.object(process_video, "retry", new=_fake_retry(retry_captured)):
            with self.assertRaises(Retry):
                process_video.run(str(self.job_id))

        # Download was never re-invoked; checkpoint restore must have
        # recreated the exact local files with the exact original bytes.
        self.assertEqual(download_call_count["n"], 1, "no duplicate expensive download on Worker B")
        self.assertTrue(Path(video_path).exists())
        self.assertEqual(Path(video_path).read_bytes(), b"real-video-bytes")
        self.assertTrue(Path(audio_path).exists())
        self.assertEqual(Path(audio_path).read_bytes(), b"real-audio-bytes")

    def test_missing_checkpoint_on_both_local_and_s3_triggers_safe_redownload(self):
        """If neither the local disk nor S3 has the file (never downloaded,
        or genuinely lost), the checkpoint must NOT get in the way -- a
        normal fresh download has to happen, not a silent stall."""
        self._make_job(status=JobStatus.PENDING, original_video_path="/nonexistent/path/video.mp4")
        video_path = self._dummy_file(b"fresh-download")
        audio_path = self._dummy_file(b"fresh-audio")

        download_call_count = {"n": 0}

        def fake_download(url, job_id):
            download_call_count["n"] += 1
            return {"title": "t", "duration": 10.0, "video_path": video_path, "audio_path": audio_path}

        with patch("backend.workers.tasks.downloader.download_video", side_effect=fake_download), \
             patch("backend.services.job_checkpoint.download_file_from_s3", return_value=False), \
             patch("backend.services.job_checkpoint.upload_file_to_s3", return_value=True), \
             patch("backend.workers.tasks.transcriber.transcribe_audio", side_effect=PermanentError("stop", code="TEST_STOP")):
            with self.assertRaises(PermanentError):
                process_video.run(str(self.job_id))

        self.assertEqual(download_call_count["n"], 1, "a genuinely missing checkpoint must trigger a real download, not a stall")

    def test_telegram_upload_job_with_lost_files_fails_permanently_not_ytdlp(self):
        """A Telegram-uploaded video job (youtube_url = "telegram://file/...",
        set by job_creation.create_job_from_local_video_file) whose local
        audio.wav/video have been cleaned up must NOT be handed to yt-dlp --
        the synthetic scheme just yields "Unsupported url scheme: telegram"
        and 5 wasted retries. It has to fail immediately with a clear,
        non-retryable error telling the user to re-send the file. The web
        upload-video-fallback path is unaffected: it keeps a REAL youtube_url,
        so it still (correctly) falls back to a fresh YouTube download here."""
        self._make_job(
            status=JobStatus.PENDING,
            youtube_url="telegram://file/AgADBg0000fake",
            original_video_path="/nonexistent/path/video.mp4",
        )

        def fail_if_called(*a, **kw):
            raise AssertionError("a telegram:// job must never reach the YouTube downloader")

        with patch("backend.workers.tasks.downloader.download_video", side_effect=fail_if_called), \
             patch("backend.services.job_checkpoint.download_file_from_s3", return_value=False):
            with self.assertRaises(PermanentError) as cm:
                process_video.run(str(self.job_id))

        self.assertEqual(cm.exception.code, "UPLOADED_SOURCE_MISSING")

        self.db.expire_all()
        row = self.db.query(DubbingJob).filter(DubbingJob.id == self.job_id).first()
        self.assertEqual(row.status, JobStatus.FAILED)
        self.assertEqual(row.error_code, "UPLOADED_SOURCE_MISSING")


if __name__ == "__main__":
    unittest.main()
