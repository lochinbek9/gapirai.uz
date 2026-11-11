"""VoiceLab TTS provayderi (backend/services/tts/voicelab_provider.py)."""
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.services.tts import voicelab_provider
from backend.services.tts.base import PermanentTTSError
from backend.services.tts.factory import get_provider
from backend.services.tts.voicelab_provider import VoiceLabProvider, settings


def _resp(code, content=b"", json_body=None, headers=None):
    r = MagicMock(status_code=code, content=content, text="x")
    r.json.return_value = json_body or {}
    r.headers = headers or {}
    return r


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg yo'q")
class VoiceLabTTSTest(unittest.TestCase):
    def setUp(self):
        p = patch.object(settings, "VOICELAB_API_KEY", "vl_test")
        p.start()
        self.addCleanup(p.stop)
        sleep = patch.object(voicelab_provider.time, "sleep")
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        src = self.tmp / "src.wav"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=300:duration=1",
                        "-ar", "24000", "-ac", "1", str(src)], check=True)
        self.wav = src.read_bytes()
        self.out = str(self.tmp / "out.wav")

    def test_sync_200_writes_wav_and_sends_expected_body(self):
        with patch("httpx.post", return_value=_resp(200, self.wav, headers={"x-voicelab-characters-used": "11"})) as post:
            self.assertTrue(VoiceLabProvider().synthesize("Salom dunyo", self.out, voice_name="uz-UZ-MadinaNeural"))
        kw = post.call_args.kwargs
        self.assertTrue(post.call_args.args[0].endswith("/v1/tts"))
        self.assertEqual(kw["json"], {"text": "Salom dunyo", "language": "uz",
                                      "voice_id": settings.VOICELAB_TTS_FEMALE_VOICE, "model_id": settings.VOICELAB_TTS_MODEL})
        idem = kw["headers"]["Idempotency-Key"]
        self.assertTrue(8 <= len(idem) <= 128 and idem.startswith("gapirai-"))
        with wave.open(self.out) as w:
            self.assertEqual((w.getframerate(), w.getnchannels()), (24000, 1))

    def test_202_job_is_polled_and_audio_downloaded(self):
        queued = _resp(202, json_body={"id": "gen_1", "status_url": "/v1/tts/generations/gen_1"})
        pending = _resp(200, json_body={"status": "processing"})
        done = _resp(200, json_body={"status": "completed", "audio_url": "https://cdn.example/a.wav"})
        audio = _resp(200, self.wav)
        with patch("httpx.post", return_value=queued), \
             patch("httpx.get", side_effect=[pending, done, audio]) as get:
            self.assertTrue(VoiceLabProvider().synthesize("Salom", self.out))
        self.assertEqual(get.call_args_list[0].args[0], "https://api.voicelab.uz/v1/tts/generations/gen_1")
        self.assertNotIn("headers", get.call_args_list[2].kwargs)  # imzolangan URL kalitsiz

    def test_failed_job_returns_false(self):
        queued = _resp(202, json_body={"status_url": "/v1/tts/generations/gen_2"})
        with patch("httpx.post", return_value=queued), \
             patch("httpx.get", return_value=_resp(200, json_body={"status": "failed", "error": {"code": "x"}})):
            self.assertFalse(VoiceLabProvider().synthesize("Salom", self.out))

    def test_voice_mapping(self):
        p = VoiceLabProvider()
        self.assertEqual(p._voice_for("voice_custom123"), "voice_custom123")
        self.assertEqual(p._voice_for("Autonoe"), settings.VOICELAB_TTS_FEMALE_VOICE)
        self.assertEqual(p._voice_for("uz-UZ-SardorNeural"), settings.VOICELAB_TTS_MALE_VOICE)
        self.assertEqual(p._voice_for(None), settings.VOICELAB_TTS_MALE_VOICE)

    def test_retryable_errors_then_ok_with_same_key(self):
        with patch("httpx.post", side_effect=[_resp(429, headers={"retry-after": "4"}), _resp(503), _resp(200, self.wav)]) as post:
            self.assertTrue(VoiceLabProvider().synthesize("Salom", self.out))
        keys = {c.kwargs["headers"]["Idempotency-Key"] for c in post.call_args_list}
        self.assertEqual((post.call_count, len(keys)), (3, 1))

    def test_voice_or_validation_errors_fall_back(self):
        for code in (404, 422):
            with patch("httpx.post", return_value=_resp(code, json_body={"error": {"code": "voice_unavailable"}})):
                self.assertFalse(VoiceLabProvider().synthesize("Salom", self.out))

    def test_out_of_credits_raises(self):
        from backend.services.tts.base import TTSOutOfCreditsError
        with patch("httpx.post", return_value=_resp(402, json_body={"error": {"code": "insufficient_credits"}})):
            with self.assertRaises(TTSOutOfCreditsError):
                VoiceLabProvider().synthesize("Salom", self.out)

    def test_auth_error_is_permanent(self):
        with patch("httpx.post", return_value=_resp(401, json_body={"error": {"code": "invalid_api_key"}})):
            with self.assertRaises(PermanentTTSError):
                VoiceLabProvider().synthesize("Salom", self.out)

    def test_non_wav_body_rejected(self):
        with patch("httpx.post", return_value=_resp(200, b"<html>error</html>" * 20)):
            self.assertFalse(VoiceLabProvider().synthesize("Salom", self.out))


class FactoryTest(unittest.TestCase):
    def test_registered(self):
        self.assertEqual(get_provider("voicelab").name, "voicelab")


if __name__ == "__main__":
    unittest.main()
