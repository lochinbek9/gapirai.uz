"""gapi TTS: kalit faqat BYOK'dan, ovoz tanlovi, balans tugashi (tarmoqsiz)."""
import unittest
from unittest.mock import patch

import httpx

from backend.services import byok, synthesizer
from backend.services.tts import gapi_provider as gapi
from backend.services.tts.base import PermanentTTSError, TTSOutOfCreditsError
from backend.services.tts.factory import get_provider


class GapiTest(unittest.TestCase):
    def setUp(self):
        self.addCleanup(byok.deactivate)
        self.provider = get_provider("gapi")

    def test_no_key_no_request(self):
        with patch.object(gapi.httpx, "request") as request:
            self.assertFalse(self.provider.synthesize("salom", "/tmp/x.wav"))
        request.assert_not_called()

    def test_voice_and_errors(self):
        byok._ACTIVE["gapi"] = ["test-gapi-key"]
        for status, error, expected in ((429, "insufficient_balance", TTSOutOfCreditsError),
                                        (401, "invalid_token", PermanentTTSError)):
            with patch.object(gapi.httpx, "request", return_value=httpx.Response(status, json={"error": error})) as request:
                with self.assertRaises(expected):
                    self.provider.synthesize("salom", "/tmp/x.wav", voice_name="uz-UZ-MadinaNeural")
            self.assertEqual(request.call_args.kwargs["json"]["voice"], "zebo")

    def test_style_per_gender_and_cache(self):
        from backend.services import gemini_quota_manager as gqm, tts_cache
        byok._ACTIVE["gapi"] = ["test-gapi-key"]
        neutral = tts_cache._cache_key("salom", "uz-UZ-MadinaNeural", "gapi")
        gqm.activate_gemini_override(gqm.sanitize_override(None, None, female="jonli", male="sokin"))
        self.addCleanup(gqm.deactivate_gemini_override)
        self.assertNotEqual(tts_cache._cache_key("salom", "uz-UZ-MadinaNeural", "gapi"), neutral)
        for voice, expected in (("uz-UZ-MadinaNeural", ("zebo", "cheerful")), ("uz-UZ-SardorNeural", ("doston", "calm"))):
            with patch.object(gapi.httpx, "request", return_value=httpx.Response(400, json={})) as request:
                self.provider.synthesize("salom", "/tmp/x.wav", voice_name=voice)
            body = request.call_args.kwargs["json"]
            self.assertEqual((body["voice"], body["style"]), expected)

    def test_default_styles(self):
        self.assertEqual((gapi.chosen_style(True), gapi.chosen_style(False)), ("iliq", "sokin"))

    def test_brand_pronunciation(self):
        for raw in ("GapirAI", "Gapir AI", "gapirai.uz"):
            self.assertEqual(gapi._BRAND.sub("Gapir ey-ay", raw), "Gapir ey-ay")

    def test_token_not_sent_to_foreign_host(self):
        byok._ACTIVE["gapi"] = ["test-gapi-key"]
        reply = httpx.Response(202, json={"result_url": "https://example.com/x"})
        with patch.object(gapi.httpx, "request", return_value=reply) as request:
            self.assertFalse(self.provider.synthesize("salom", "/tmp/x.wav"))
        self.assertEqual(request.call_count, 1)

    def test_free_mode_does_not_override_gapi(self):
        with patch.object(synthesizer.settings, "FREE_MODE", True), \
             patch.object(synthesizer.settings, "TTS_PROVIDER_OVERRIDE", ""):
            self.assertFalse(synthesizer._free_tts("gapi"))
            self.assertTrue(synthesizer._free_tts("edge"))


if __name__ == "__main__":
    unittest.main()


def test_system_key_makes_gapi_default_only_when_enabled():
    from types import SimpleNamespace
    from backend.services import plans

    on = SimpleNamespace(GAPI_TTS_DEFAULT=True, GAPI_API_KEY="k")
    assert plans.gapi_is_default(on)
    assert not plans.gapi_is_default(SimpleNamespace(GAPI_TTS_DEFAULT=True, GAPI_API_KEY=""))
    assert not plans.gapi_is_default(SimpleNamespace(GAPI_TTS_DEFAULT=False, GAPI_API_KEY="k"))
