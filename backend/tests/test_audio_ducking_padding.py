import os
import tempfile
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch
from backend.services import merger


class TestMergerAudioPadding(unittest.TestCase):
    def test_filtergraph_pads_audio_when_target_dur_provided(self):
        graph = merger._build_audio_filtergraph(target_dur=26.0)
        self.assertIn("apad=whole_dur=26.000", graph)
        self.assertIn("atrim=0:26.000", graph)

    def test_filtergraph_no_pad_when_target_dur_none(self):
        graph = merger._build_audio_filtergraph(target_dur=None)
        self.assertNotIn("apad", graph)
        self.assertIn("[1:a]aformat=", graph)

    @patch("backend.services.merger._get_duration")
    @patch("backend.services.merger._get_video_codec", return_value="h264")
    @patch("backend.services.merger.subprocess.run")
    def test_merge_video_audio_passes_target_dur_when_audio_shorter(self, mock_run, mock_codec, mock_dur):
        # Video is 26s, audio is 12s
        mock_dur.side_effect = [26.0, 12.0]

        with tempfile.TemporaryDirectory() as tmpdir:
            out_path = os.path.join(tmpdir, "dummy_out.mp4")

            def create_file(*args, **kwargs):
                Path(out_path).write_bytes(b"dummy video")
                return MagicMock(returncode=0)

            mock_run.side_effect = create_file

            merger.merge_video_audio("dummy_video.mp4", "dummy_audio.wav", out_path)

            self.assertTrue(mock_run.called)
            cmd = mock_run.call_args[0][0]
            # Filter complex flag should include apad=whole_dur=26.000
            fc_idx = cmd.index("-filter_complex")
            filter_str = cmd[fc_idx + 1]
            self.assertIn("apad=whole_dur=26.000", filter_str)


if __name__ == "__main__":
    unittest.main()
