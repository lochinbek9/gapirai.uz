import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.models.database import DubbingJob, JobStatus, User
from backend.services import job_creation


class TestCrossGenderTextReuse(unittest.IsolatedAsyncioTestCase):
    """Tests for reusing transcript, translation, and speech segments across genders."""

    def setUp(self):
        self.db = MagicMock()
        self.user = User(id=uuid.uuid4(), name="Test User")
        self.youtube_url = "https://www.youtube.com/watch?v=abc12345678"
        self.video_id = "abc12345678"

        _p = patch.object(job_creation, "_daily_job_limit_reached", return_value=False)
        _p.start()
        self.addCleanup(_p.stop)

        _q = patch.object(job_creation, "check_queue_capacity", return_value=None)
        _q.start()
        self.addCleanup(_q.stop)

    @patch("backend.services.job_creation.process_video")
    @patch("backend.services.plans.get_job_queue", return_value="default")
    @patch("backend.services.plans.consume_quota")
    @patch("backend.services.plans.check_quota", return_value=(True, 0))
    @patch("backend.services.job_creation.check_safety")
    @patch("backend.services.job_creation.get_video_info")
    async def test_female_request_reuses_male_donor_texts(
        self, mock_get_info, mock_check_safety, mock_check_quota,
        mock_consume_quota, mock_get_queue, mock_process_video,
    ):
        """When a video was previously completed as male, a new female request
        must reuse transcript, translation, and speech segments without re-fetching info."""
        male_donor = DubbingJob(
            id=uuid.uuid4(),
            source_job_id=None,
            status=JobStatus.COMPLETED,
            youtube_video_id=self.video_id,
            speaker_gender="male",
            voice_gender_setting="male",
            video_title="Donor Video Title",
            video_duration=120.0,
            video_thumbnail="https://example.com/thumb.jpg",
            transcript_text="Hello world original",
            transcript_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Hello world original"}],
            srt_content="1\n00:00:00,000 --> 00:00:02,000\nHello world original\n",
            translated_text="Salom dunyo tarjima",
            translated_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo tarjima"}],
            uzbek_srt_content="WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nSalom dunyo tarjima\n",
            speech_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo tarjima"}],
            output_video_path="/outputs/donor/video/dubbed_final.mp4",
            original_video_path="/outputs/donor/video/video.mp4",
        )

        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        # First call is exact match query (female -> None), second is donor query (-> male_donor)
        q.first.side_effect = [None, male_donor]
        self.db.query.return_value = q

        result = await job_creation.create_dubbing_job(
            self.db, self.user, self.youtube_url, voice_gender="female"
        )

        self.assertEqual(result.outcome, "queued")
        self.assertEqual(result.video_title, "Donor Video Title")
        self.assertEqual(result.duration_minutes, 2.0)
        # get_video_info should NOT be called because donor metadata was reused!
        mock_get_info.assert_not_called()
        mock_process_video.apply_async.assert_called_once()

        # Check the newly added DubbingJob
        added_jobs = [call[0][0] for call in self.db.add.call_args_list if isinstance(call[0][0], DubbingJob)]
        self.assertTrue(len(added_jobs) > 0)
        new_job = added_jobs[-1]

        # Verify cross-gender text fields are identical to donor
        self.assertEqual(new_job.transcript_text, "Hello world original")
        self.assertEqual(new_job.transcript_segments, male_donor.transcript_segments)
        self.assertEqual(new_job.translated_text, "Salom dunyo tarjima")
        self.assertEqual(new_job.translated_segments, male_donor.translated_segments)
        self.assertEqual(new_job.uzbek_srt_content, male_donor.uzbek_srt_content)
        self.assertEqual(new_job.speech_segments, male_donor.speech_segments)

        # Verify gender fields are configured for requested female gender
        self.assertEqual(new_job.voice_gender_setting, "female")
        self.assertEqual(new_job.speaker_gender, "female")

    @patch("backend.services.job_creation.process_video")
    @patch("backend.services.plans.get_job_queue", return_value="default")
    @patch("backend.services.plans.consume_quota")
    @patch("backend.services.plans.check_quota", return_value=(True, 0))
    @patch.object(job_creation, "_cached_job_files_exist", return_value=True)
    async def test_same_gender_returns_full_cache_hit(
        self, mock_files_exist, mock_check_quota, mock_consume_quota,
        mock_get_queue, mock_process_video,
    ):
        """When an exact same-gender job exists with files, return ready outcome."""
        female_job = DubbingJob(
            id=uuid.uuid4(),
            source_job_id=None,
            status=JobStatus.COMPLETED,
            youtube_video_id=self.video_id,
            speaker_gender="female",
            voice_gender_setting="female",
            video_title="Donor Video Title",
            video_duration=120.0,
            output_video_path="/outputs/female/video/dubbed_final.mp4",
        )

        def mock_query(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            q.first.return_value = female_job
            return q

        self.db.query = mock_query

        result = await job_creation.create_dubbing_job(
            self.db, self.user, self.youtube_url, voice_gender="female"
        )
        self.assertEqual(result.outcome, "ready")
        mock_process_video.apply_async.assert_not_called()


class TestProcessVideoCrossGenderWorker(unittest.TestCase):
    """Test process_video pipeline skips transcription, translation and speech opt when text is reused."""

    @patch("redis.Redis.from_url")
    @patch("backend.services.job_creation._extract_audio_wav", return_value=True)
    @patch("backend.workers.tasks._cleanup_upload_dir")
    @patch("backend.services.storage.upload_file_to_s3", return_value=False)
    @patch("backend.workers.tasks.Path.exists", return_value=True)
    @patch("backend.workers.tasks.restore_checkpoint", return_value=False)
    @patch("backend.workers.tasks.save_checkpoint")
    @patch("backend.workers.tasks.merger.merge_video_audio")
    @patch("backend.workers.tasks.synthesizer.synthesize_segments")
    @patch("backend.workers.tasks.speech_optimizer.optimize_segments")
    @patch("backend.workers.tasks.translator.translate_segments")
    @patch("backend.workers.tasks.transcriber.transcribe_audio")
    @patch("backend.workers.tasks.downloader.download_video")
    @patch("backend.workers.tasks.SessionLocal")
    def test_worker_skips_text_generation_and_uses_female_gender(
        self, mock_session_cls, mock_download, mock_transcribe, mock_translate,
        mock_speech_opt, mock_synthesize, mock_merge, mock_save_chk, mock_restore_chk,
        mock_path_exists, mock_s3, mock_cleanup, mock_extract_audio, mock_redis,
    ):
        from backend.workers.tasks import process_video

        job_id = str(uuid.uuid4())
        mock_db = MagicMock()
        mock_session_cls.return_value = mock_db

        import tempfile
        tmp_vid = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
        tmp_vid.write(b"dummy-video-content")
        tmp_vid.close()
        self.addCleanup(lambda: Path(tmp_vid.name).unlink(missing_ok=True))

        job = DubbingJob(
            id=job_id,
            status=JobStatus.PENDING,
            youtube_url="https://www.youtube.com/watch?v=abc12345678",
            youtube_video_id="abc12345678",
            voice_gender_setting="female",
            speaker_gender="female",
            original_video_path=tmp_vid.name,
            # Pre-populated from donor job:
            transcript_text="Hello world original",
            transcript_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Hello world original"}],
            srt_content="1\n00:00:00,000 --> 00:00:02,000\nHello world original\n",
            translated_text="Salom dunyo tarjima",
            translated_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo tarjima"}],
            uzbek_srt_content="WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nSalom dunyo tarjima\n",
            speech_segments=[{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo tarjima"}],
            user_id=None,
        )

        def mock_query(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            # 1st call is job fetch by id -> returns job
            # subsequent calls (cache query, etc.) -> return None
            q.first.side_effect = [job, None, None, None]
            return q

        mock_db.query = mock_query

        mock_synthesize.return_value = (
            "/tmp/dubbed_audio.wav",
            [{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo tarjima"}],
            {},
        )

        # Mock claim lock and state
        with patch("backend.workers.tasks.try_claim", return_value="test-token"), \
             patch("backend.workers.tasks.release_claim"):
            result = process_video(job_id)

        self.assertEqual(result["status"], "completed")

        # TRANSCRIBE, TRANSLATE, and SPEECH_OPT must NOT be called!
        mock_transcribe.assert_not_called()
        mock_translate.assert_not_called()
        mock_speech_opt.assert_not_called()

        # synthesize_segments MUST be called with female voice
        mock_synthesize.assert_called_once()
        synth_kwargs = mock_synthesize.call_args.kwargs
        self.assertEqual(synth_kwargs.get("voice_name"), "uz-UZ-MadinaNeural")


if __name__ == "__main__":
    unittest.main()

