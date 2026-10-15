import unittest
from unittest.mock import patch
from backend.services import merger


class TestMergerAudioPadding(unittest.TestCase):
    def test_filtergraph_pads_audio_when_target_dur_provided(self):
        graph = merger._build_audio_filtergraph(target_dur=26.0)
        self.assertIn("apad=whole_dur=26.000", graph)
        self.assertIn("[1:a]apad=whole_dur=26.000,aformat=", graph)

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
        mock_run.return_value.returncode = 0

        merger.merge_video_audio("dummy_video.mp4", "dummy_audio.wav", "dummy_out.mp4")

        self.assertTrue(mock_run.called)
        cmd = mock_run.call_args[0][0]
        # Filter complex flag should include apad=whole_dur=26.000
        fc_idx = cmd.index("-filter_complex")
        filter_str = cmd[fc_idx + 1]
        self.assertIn("apad=whole_dur=26.000", filter_str)


if __name__ == "__main__":
    unittest.main()
