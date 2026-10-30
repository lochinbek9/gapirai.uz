import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from backend.workers.tasks import _verify_output_files_exist
from backend.services.job_creation import _cached_job_files_exist
from backend.services.job_recovery import is_output_video_missing
from backend.services import resolution_variants


class TestVerifyOutputFiles(unittest.TestCase):
    def test_verify_output_raises_when_path_is_none(self):
        with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR="/tmp")):
            with self.assertRaises(RuntimeError) as ctx:
                _verify_output_files_exist(None, None, "job-123")
            self.assertIn("mavjud emas", str(ctx.exception))

    def test_verify_output_raises_when_file_not_found(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_file = os.path.join(tmpdir, "does_not_exist.mp4")
            with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                with self.assertRaises(RuntimeError) as ctx:
                    _verify_output_files_exist(missing_file, None, "job-123")
                self.assertIn("diskda topilmadi", str(ctx.exception))

    def test_verify_output_raises_when_file_is_zero_bytes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            empty_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(empty_file).touch()  # 0 bytes
            with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                with self.assertRaises(RuntimeError) as ctx:
                    _verify_output_files_exist(empty_file, None, "job-123")
                self.assertIn("0 bayt", str(ctx.exception))

    def test_verify_output_succeeds_when_file_valid(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            valid_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(valid_file).write_bytes(b"valid video content")
            with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                # Should not raise any error
                _verify_output_files_exist(valid_file, None, "job-123")

    @patch("backend.services.storage.s3_object_exists")
    def test_verify_output_succeeds_when_s3_has_object(self, mock_s3_exists):
        mock_s3_exists.return_value = True
        with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="my-bucket", OUTPUT_DIR="/tmp")):
            # Even if local file is missing, S3 presence suffices
            _verify_output_files_exist("/missing/local.mp4", None, "job-123")
            mock_s3_exists.assert_called_once_with("dubber/job-123/dubbed_final.mp4")

    @patch("backend.services.storage.s3_object_exists")
    def test_verify_output_raises_when_s3_object_missing_and_local_missing(self, mock_s3_exists):
        mock_s3_exists.return_value = False
        with tempfile.TemporaryDirectory() as tmpdir:
            missing_file = os.path.join(tmpdir, "dubbed_final.mp4")
            with patch("backend.workers.tasks.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="my-bucket", OUTPUT_DIR=tmpdir)):
                with self.assertRaises(RuntimeError) as ctx:
                    _verify_output_files_exist(missing_file, None, "job-123")
                self.assertIn("diskda topilmadi", str(ctx.exception))


class TestCachedJobFilesExistWithZeroBytes(unittest.TestCase):
    def test_cached_files_exist_returns_false_for_zero_byte_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            empty_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(empty_file).touch()
            job = SimpleNamespace(
                storage_id="test-storage",
                output_video_path=empty_file,
            )
            with patch("backend.services.job_creation.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                self.assertFalse(_cached_job_files_exist(job))

    def test_cached_files_exist_returns_true_for_non_empty_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            valid_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(valid_file).write_bytes(b"content")
            job = SimpleNamespace(
                storage_id="test-storage",
                output_video_path=valid_file,
            )
            with patch("backend.services.job_creation.get_settings", return_value=SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                self.assertTrue(_cached_job_files_exist(job))


class TestJobRecoveryWithZeroBytes(unittest.TestCase):
    def test_output_missing_returns_true_for_zero_byte_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            empty_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(empty_file).touch()
            job = SimpleNamespace(
                id="job-1",
                storage_id="job-1",
                subtitle_only=False,
                output_video_path=empty_file,
            )
            with patch("backend.services.job_recovery._settings", SimpleNamespace(OUTPUT_DIR=tmpdir, REDIS_URL="redis://localhost:6379")):
                self.assertTrue(is_output_video_missing(job))

    def test_output_missing_returns_false_for_valid_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            valid_file = os.path.join(tmpdir, "dubbed_final.mp4")
            Path(valid_file).write_bytes(b"video bytes")
            job = SimpleNamespace(
                id="job-1",
                storage_id="job-1",
                subtitle_only=False,
                output_video_path=valid_file,
            )
            with patch("backend.services.job_recovery._settings", SimpleNamespace(OUTPUT_DIR=tmpdir, REDIS_URL="redis://localhost:6379")):
                self.assertFalse(is_output_video_missing(job))


class TestResolutionVariantsCheck(unittest.TestCase):
    @patch("subprocess.run")
    def test_generate_360p_raises_when_output_is_empty(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        with tempfile.TemporaryDirectory() as tmpdir:
            job = SimpleNamespace(
                storage_id="job-123",
                output_video_path=os.path.join(tmpdir, "master.mp4"),
            )
            Path(job.output_video_path).write_bytes(b"master video")
            with patch("backend.services.resolution_variants.settings", SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                # The local_out will be outputs/job-123/video/dubbed_360p.mp4
                # Since ffmpeg is mocked and creates nothing (or empty), it raises RuntimeError
                with self.assertRaises(RuntimeError) as ctx:
                    resolution_variants.generate_downscaled(job, "360p")
                self.assertIn("360p video fayli", str(ctx.exception))

    @patch("subprocess.run")
    def test_generate_360p_succeeds_when_output_is_valid(self, mock_run):
        with tempfile.TemporaryDirectory() as tmpdir:
            job = SimpleNamespace(
                storage_id="job-123",
                output_video_path=os.path.join(tmpdir, "master.mp4"),
            )
            Path(job.output_video_path).write_bytes(b"master video")
            local_out = os.path.join(tmpdir, "job-123", "video", "dubbed_360p.mp4")

            def create_360p(*args, **kwargs):
                Path(local_out).parent.mkdir(parents=True, exist_ok=True)
                Path(local_out).write_bytes(b"360p video bytes")
                return MagicMock(returncode=0)

            mock_run.side_effect = create_360p
            with patch("backend.services.resolution_variants.settings", SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                out = resolution_variants.generate_downscaled(job, "360p")
                self.assertEqual(out, f"/outputs/{job.storage_id}/video/dubbed_360p.mp4")
                self.assertTrue(os.path.exists(local_out))
                self.assertGreater(os.path.getsize(local_out), 0)

    @patch("subprocess.run")
    def test_generate_480p_scales_to_480_and_names_file(self, mock_run):
        with tempfile.TemporaryDirectory() as tmpdir:
            job = SimpleNamespace(storage_id="job-480", output_video_path=os.path.join(tmpdir, "master.mp4"))
            Path(job.output_video_path).write_bytes(b"master video")
            local_out = os.path.join(tmpdir, "job-480", "video", "dubbed_480p.mp4")

            def create_480p(*args, **kwargs):
                Path(local_out).parent.mkdir(parents=True, exist_ok=True)
                Path(local_out).write_bytes(b"480p video bytes")
                return MagicMock(returncode=0)

            mock_run.side_effect = create_480p
            with patch("backend.services.resolution_variants.settings", SimpleNamespace(AWS_BUCKET_NAME="", OUTPUT_DIR=tmpdir)):
                out = resolution_variants.generate_variant(job, "480p")
            self.assertEqual(out, "/outputs/job-480/video/dubbed_480p.mp4")
            self.assertIn("scale=-2:480", mock_run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
