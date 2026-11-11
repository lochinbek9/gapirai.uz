"""Pullik TTS balansi video o'rtasida tugasa: synthesizer xatoni yutmaydi, worker butun
ovozni Edge'da qaytadan yaratadi (bitta videoda ikki xil ovoz bo'lmasin)."""
import inspect
import tempfile
import unittest
from unittest.mock import patch

from backend.services import synthesizer
from backend.services.tts.base import TTSOutOfCreditsError


class OutOfCreditsTest(unittest.TestCase):
    def test_synthesizer_propagates_out_of_credits(self):
        segs = [{"id": i, "start": float(i * 3), "end": float(i * 3 + 2), "text": f"Gap {i}."} for i in range(4)]
        with tempfile.TemporaryDirectory() as tmp, \
             patch.object(synthesizer, "_synthesize_text", side_effect=TTSOutOfCreditsError("402")), \
             patch.object(synthesizer, "_free_tts", return_value=False):
            with self.assertRaises(TTSOutOfCreditsError):
                synthesizer.synthesize_segments(segs, tmp, voice_name="uz-UZ-SardorNeural", provider_name="neuronai")

    def test_worker_redoes_whole_dub_on_edge(self):
        from backend.workers import tasks
        src = inspect.getsource(tasks.process_video.run)
        self.assertIn("except TTSOutOfCreditsError as exc:", src)
        branch = src[src.index("except TTSOutOfCreditsError as exc:"):]
        branch = branch[:branch.index("job.dubbed_audio_path = dubbed_audio_path")]
        for needle in ('shutil.rmtree(tts_dir, ignore_errors=True)', 'tts_provider = "edge"',
                       'existing_qa=None', "send_alert_to_admins"):
            self.assertIn(needle, branch)


if __name__ == "__main__":
    unittest.main()
