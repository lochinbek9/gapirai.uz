"""NeuronAI STT provayderi (backend/services/transcriber.py): so'rov, segment siljishi,
qayta urinish, xatolar va provayderlar tartibidagi o'rni."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.services import transcriber
from backend.services.transcriber import settings


def _resp(code, json_body=None, headers=None):
    r = MagicMock(status_code=code, text="x")
    r.json.return_value = json_body or {}
    r.headers = headers or {}
    return r


OK = _resp(200, {"data": {
    "text": "Salom dunyo", "language": "uz", "duration_seconds": 4.0, "cost": 4, "balance": 996,
    "segments": [{"start": 0.0, "end": 1.5, "text": " Salom "}, {"start": 1.5, "end": 2.0, "text": "  "},
                 {"start": 2.0, "end": 4.0, "text": "dunyo"}],
}})


class NeuronAISTTTest(unittest.TestCase):
    def setUp(self):
        for name, value in (("NEURONAI_API_KEY", "nai_test"), ("NEURONAI_STT_ENABLED", True)):
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)
        sleep = patch.object(transcriber.time, "sleep")
        self.sleep = sleep.start()
        self.addCleanup(sleep.stop)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.write(b"audio-bytes")
        tmp.close()
        self.chunk = Path(tmp.name)
        self.addCleanup(self.chunk.unlink)

    def test_segments_are_offset_and_blank_ones_dropped(self):
        with patch("httpx.post", return_value=OK) as post:
            segs, text, lang = transcriber._transcribe_chunk_neuronai(self.chunk, offset_seconds=480, language="uz")
        self.assertEqual(segs, [{"start": 480.0, "end": 481.5, "text": "Salom"}, {"start": 482.0, "end": 484.0, "text": "dunyo"}])
        self.assertEqual((text, lang), ("Salom dunyo", "uz"))
        kwargs = post.call_args.kwargs
        self.assertTrue(post.call_args.args[0].endswith("/stt/transcribe"))
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer nai_test")
        self.assertEqual(kwargs["data"], {"language": "uz"})

    def test_unsupported_language_becomes_auto_and_idempotency_key_is_stable(self):
        with patch("httpx.post", return_value=OK) as post:
            transcriber.neuronai_transcribe_file(self.chunk, "fr")
            transcriber.neuronai_transcribe_file(self.chunk, "fr")
        first, second = post.call_args_list
        self.assertEqual(first.kwargs["data"], {"language": "auto"})
        self.assertEqual(first.kwargs["headers"]["Idempotency-Key"], second.kwargs["headers"]["Idempotency-Key"])

    def test_retries_429_then_succeeds(self):
        with patch("httpx.post", side_effect=[_resp(429, headers={"retry-after": "3"}), OK]) as post:
            transcriber.neuronai_transcribe_file(self.chunk, "en")
        self.assertEqual(post.call_count, 2)
        self.sleep.assert_called_once_with(3.0)

    def test_error_raises_with_code(self):
        err = _resp(402, {"error": {"code": "insufficient_balance", "message": "Top up"}})
        with patch("httpx.post", return_value=err) as post:
            with self.assertRaisesRegex(RuntimeError, "402 insufficient_balance"):
                transcriber.neuronai_transcribe_file(self.chunk, "en")
        self.assertEqual(post.call_count, 1)

    def test_provider_order(self):
        with patch.object(settings, "GEMINI_API_KEY", "g"), patch("backend.services.groq_service.is_groq_available", return_value=False):
            self.assertEqual(transcriber._transcribe_provider_order("neuronai")[0], "neuronai")
            self.assertEqual(transcriber._transcribe_provider_order("gemini")[:2], ["gemini", "neuronai"])
            with patch.object(settings, "NEURONAI_STT_ENABLED", False):
                self.assertNotIn("neuronai", transcriber._transcribe_provider_order("neuronai"))


if __name__ == "__main__":
    unittest.main()
