"""gapi STT: faqat o'zbekcha audio uchun, BYOK kaliti bilan (tarmoqsiz)."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from backend.services import byok, gapi_stt, gemini_quota_manager as gqm, transcriber


class GapiSttTest(unittest.TestCase):
    def setUp(self):
        self.addCleanup(byok.deactivate)
        self.addCleanup(gqm.deactivate_gemini_override)

    def test_paid_options_disabled(self):
        byok._ACTIVE["gapi"] = ["test-gapi-key"]
        reply = httpx.Response(200, json={"text": "salom", "segments": [{"start": 0, "end": 1, "text": "salom"}], "audio_seconds": 1})
        with tempfile.NamedTemporaryFile(suffix=".mp3") as f, patch.object(gapi_stt.httpx, "post", return_value=reply) as post, \
             patch.object(byok, "log_gapi_stt"):
            segments, text, lang = transcriber._transcribe_chunk_gapi(Path(f.name), 10.0, "uz")
        self.assertEqual((segments[0]["start"], text, lang), (10.0, "salom", "uz"))
        self.assertIn('"pii": false', post.call_args.kwargs["data"]["settings"])

    def test_uzbek_prefers_gapi_foreign_never(self):
        byok._ACTIVE["gapi"] = ["test-gapi-key"]
        with patch.object(transcriber, "_transcribe_via_api", return_value={"language": "uz"}) as api:
            transcriber.transcribe_audio("a.mp3", language="uz")
        self.assertEqual(api.call_args.args[2], "gapi")
        self.assertNotIn("gapi", transcriber._transcribe_provider_order("groq"))
        gqm.activate_gemini_override({"stt": "gapi"})
        with patch.object(transcriber, "detect_language_local", return_value=("en", 0.99)), \
             patch.object(transcriber, "_transcribe_local_whisper", return_value={"language": "en"}), \
             patch.object(transcriber, "_transcribe_via_api", return_value={"language": "en"}) as api:
            transcriber.transcribe_audio("a.mp3", primary="groq")
        self.assertNotIn("gapi", [c.args[2] for c in api.call_args_list])


if __name__ == "__main__":
    unittest.main()
