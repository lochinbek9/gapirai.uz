"""NeuronAI TTS provayderi (backend/services/tts/neuronai_provider.py)."""
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.services.tts import neuronai_provider
from backend.services.tts.base import PermanentTTSError
from backend.services.tts.factory import get_provider
from backend.services.tts.neuronai_provider import NeuronAIProvider, settings


def _resp(code, content=b"", json_body=None, headers=None):
    r = MagicMock(status_code=code, content=content, text="x")
    r.json.return_value = json_body or {}
    r.headers = headers or {}
    return r


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg yo'q")
class NeuronAITTSTest(unittest.TestCase):
    def setUp(self):
        p = patch.object(settings, "NEURONAI_API_KEY", "nai_test")
        p.start()
        self.addCleanup(p.stop)
        sleep = patch.object(neuronai_provider.time, "sleep")
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        src = self.tmp / "src.wav"  # NeuronAI qaytaradigan WAV o'rniga: 44.1 kHz stereo
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=1",
                        "-ar", "44100", "-ac", "2", str(src)], check=True)
        self.wav = src.read_bytes()
        self.out = str(self.tmp / "out.wav")

    def test_success_converts_to_24k_mono_and_maps_voice(self):
        ok = _resp(200, self.wav, headers={"x-cost": "3.0", "x-balance": "100"})
        with patch("httpx.post", return_value=ok) as post:
            self.assertTrue(NeuronAIProvider().synthesize("Salom dunyo", self.out, voice_name="uz-UZ-MadinaNeural"))
        body = post.call_args.kwargs["json"]
        self.assertEqual((body["voice_id"], body["language"], body["quality"]), ("madina", "uz", "standard"))
        self.assertTrue(post.call_args.kwargs["headers"]["Idempotency-Key"].startswith("tts-"))
        with wave.open(self.out) as w:
            self.assertEqual((w.getframerate(), w.getnchannels()), (24000, 1))

    def test_voice_mapping(self):
        p = NeuronAIProvider()
        self.assertEqual(p._voice_for("Charon"), "kamron")
        self.assertEqual(p._voice_for("Autonoe"), "madina")
        self.assertEqual(p._voice_for("uz-UZ-SardorNeural"), "kamron")
        self.assertEqual(p._voice_for("Saodat"), "saodat")
        self.assertEqual(p._voice_for(None), "kamron")

    def test_429_retried_then_ok(self):
        with patch("httpx.post", side_effect=[_resp(429, headers={"retry-after": "3"}), _resp(200, self.wav)]) as post:
            self.assertTrue(NeuronAIProvider().synthesize("Salom", self.out))
        self.assertEqual(post.call_count, 2)
        self.sleep.assert_called_once_with(3.0)
        first, second = post.call_args_list
        self.assertEqual(first.kwargs["headers"]["Idempotency-Key"], second.kwargs["headers"]["Idempotency-Key"])

    def test_server_or_validation_error_returns_false_for_fallback(self):
        for code in (500, 422):
            with patch("httpx.post", return_value=_resp(code, json_body={"error": {"code": "server_error"}})):
                self.assertFalse(NeuronAIProvider().synthesize("Salom", self.out))

    def test_balance_exhausted_raises_out_of_credits(self):
        from backend.services.tts.base import TTSOutOfCreditsError
        with patch("httpx.post", return_value=_resp(402, json_body={"error": {"code": "insufficient_balance"}})):
            with self.assertRaises(TTSOutOfCreditsError):
                NeuronAIProvider().synthesize("Salom", self.out)

    def test_auth_error_is_permanent(self):
        with patch("httpx.post", return_value=_resp(401, json_body={"error": {"code": "invalid_api_key"}})):
            with self.assertRaises(PermanentTTSError):
                NeuronAIProvider().synthesize("Salom", self.out)

    def test_no_key_or_empty_text(self):
        with patch.object(settings, "NEURONAI_API_KEY", ""), patch("httpx.post") as post:
            self.assertFalse(NeuronAIProvider().synthesize("Salom", self.out))
        self.assertFalse(NeuronAIProvider().synthesize("   ", self.out))
        post.assert_not_called()


class FactoryTest(unittest.TestCase):
    def test_registered_and_override(self):
        self.assertEqual(get_provider("neuronai").name, "neuronai")
        from types import SimpleNamespace
        from backend.services.plans import get_tts_provider_for_job
        with patch("backend.config.get_settings", return_value=SimpleNamespace(TTS_PROVIDER_OVERRIDE="neuronai")):
            self.assertEqual(get_tts_provider_for_job(None, SimpleNamespace(tts_provider="azure")), "neuronai")


if __name__ == "__main__":
    unittest.main()
