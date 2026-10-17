import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from backend.services import merger


_SETTINGS = {
    "DUCKING_THRESHOLD": 0.012,
    "DUCKING_RATIO": 20.0,
    "DUCKING_ATTACK_MS": 5,
    "DUCKING_RELEASE_MS": 400,
    "VOICE_HIGHPASS_HZ": 80,
    "VOICE_EQ_FREQ_HZ": 3000,
    "VOICE_EQ_GAIN_DB": 2.5,
    "VOICE_COMPRESSOR_RATIO": 3.0,
    "VOICE_GAIN_BOOST_DB": 5.0,
    "VOICE_LIMITER_LIMIT": 0.95,
    "FINAL_LOUDNORM_I": -16.0,
    "FINAL_LOUDNORM_TP": -1.5,
    "FINAL_LOUDNORM_LRA": 11.0,
    "ORIGINAL_AUDIO_VOLUME": 0.22,
}


class TestMergerService(unittest.TestCase):
    def setUp(self):
        self.settings = SimpleNamespace(**_SETTINGS)

    def test_ducked_mix_filtergraph(self):
        with patch.object(merger, "settings", self.settings):
            graph = merger._build_audio_filtergraph()

        self.assertIn("[0:a]", graph)
        self.assertIn("[1:a]", graph)
        self.assertIn("sidechaincompress", graph)
        self.assertIn("amix=inputs=2", graph)
        self.assertIn("[final]", graph)

    def test_ducked_mix_with_target_dur(self):
        with patch.object(merger, "settings", self.settings):
            graph = merger._build_audio_filtergraph(target_dur=12.345)

        self.assertIn("apad=whole_dur=12.345", graph)
        self.assertIn("[0:a]", graph)
        self.assertIn("[final]", graph)

    @patch("subprocess.run")
    @patch("backend.services.merger._get_duration")
    @patch("backend.services.merger._get_video_codec")
    @patch("backend.services.merger._get_video_dimensions")
    def test_merge_video_audio_raises_when_output_missing(self, mock_dim, mock_codec, mock_dur, mock_run):
        mock_dur.side_effect = [10.0, 10.0]  # video, audio
        mock_codec.return_value = "h264"
        mock_dim.return_value = (1280, 720)
        mock_run.return_value = MagicMock(returncode=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "out.mp4")
            with self.assertRaises(RuntimeError) as ctx:
                merger.merge_video_audio("video.mp4", "audio.wav", out_path)
            self.assertIn("chiqish video fayli yaratilmadi yoki bo'sh", str(ctx.exception))

    @patch("subprocess.run")
    @patch("backend.services.merger._get_duration")
    @patch("backend.services.merger._get_video_codec")
    @patch("backend.services.merger._get_video_dimensions")
    def test_merge_video_audio_raises_when_output_is_empty(self, mock_dim, mock_codec, mock_dur, mock_run):
        mock_dur.side_effect = [10.0, 10.0]  # video, audio
        mock_codec.return_value = "h264"
        mock_dim.return_value = (1280, 720)
        mock_run.return_value = MagicMock(returncode=0)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "out.mp4")
            Path(out_path).touch()  # 0 byte file
            with self.assertRaises(RuntimeError) as ctx:
                merger.merge_video_audio("video.mp4", "audio.wav", out_path)
            self.assertIn("0 bayt", str(ctx.exception))

    @patch("subprocess.run")
    @patch("backend.services.merger._get_duration")
    @patch("backend.services.merger._get_video_codec")
    @patch("backend.services.merger._get_video_dimensions")
    def test_merge_video_audio_succeeds_when_output_valid(self, mock_dim, mock_codec, mock_dur, mock_run):
        mock_dur.side_effect = [10.0, 10.0]  # video, audio
        mock_codec.return_value = "h264"
        mock_dim.return_value = (1280, 720)

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "out.mp4")

            def create_file(*args, **kwargs):
                Path(out_path).write_bytes(b"dummy video content")
                return MagicMock(returncode=0)

            mock_run.side_effect = create_file

            result = merger.merge_video_audio("video.mp4", "audio.wav", out_path)
            self.assertEqual(result, out_path)
            self.assertTrue(os.path.exists(out_path))
            self.assertGreater(os.path.getsize(out_path), 0)


if __name__ == "__main__":
    unittest.main()
