"""O'zbekcha manbali subtitr (2026-09-20): nutq o'zbekcha STT bilan matnga aylantiriladi va TARJIMA
QILINMAYDI. Tekshiriladi: STT provayderlar tartibi, tarjimasiz o'tkazish, job belgisi, API tekshiruvi."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

from backend.api.routes import _normalize_source_language
from backend.services import transcriber, translator
from backend.workers.tasks import is_uzbek_source


class TestProviderOrder(unittest.TestCase):
    def _order(self, primary, gemini):
        with patch.object(transcriber.settings, "GEMINI_API_KEY", "k" if gemini else ""), \
             patch.object(transcriber.settings, "GEMINI_USE_VERTEX", False):
            return transcriber._transcribe_provider_order(primary)

    def test_default_is_openai_then_gemini(self):
        self.assertEqual(self._order("openai", True), ["openai", "gemini"])

    def test_gemini_primary_when_configured(self):
        self.assertEqual(self._order("gemini", True), ["gemini", "openai"])

    def test_gemini_is_never_listed_when_not_configured(self):
        self.assertEqual(self._order("gemini", False), ["openai"])
        self.assertEqual(self._order("openai", False), ["openai"])

    def test_unknown_primary_falls_back_to_default_order(self):
        self.assertEqual(self._order("whatever", True), ["openai", "gemini"])


class TestChunkFallbackUsesTheOrder(unittest.TestCase):
    def _run(self, primary, openai_ok, gemini_ok):
        calls = []

        def fake_openai(path, offset_seconds, language="en"):
            calls.append("openai")
            if not openai_ok:
                raise RuntimeError("openai down")
            return [{"start": 0.0, "end": 1.0, "text": "salom"}], "salom", "uz"

        def fake_gemini(path, offset_seconds, language="en"):
            calls.append("gemini")
            if not gemini_ok:
                raise RuntimeError("gemini down")
            return [{"start": 0.0, "end": 1.0, "text": "salom"}], "salom", "uz"

        with patch.object(transcriber, "_transcribe_chunk", fake_openai), \
             patch.object(transcriber, "_transcribe_chunk_gemini", fake_gemini), \
             patch.object(transcriber, "_chunk_audio", return_value=["/tmp/x.mp3"]), \
             patch.object(transcriber.settings, "GEMINI_API_KEY", "k"), \
             patch.object(transcriber.settings, "GEMINI_USE_VERTEX", False):
            try:
                result = transcriber._transcribe_via_api("/tmp/a.wav", "uz", primary)
            except Exception as exc:
                return calls, exc
        return calls, result

    def test_gemini_first_then_openai_on_failure(self):
        calls, result = self._run("gemini", openai_ok=True, gemini_ok=False)
        self.assertEqual(calls, ["gemini", "openai"])
        self.assertEqual(result["text"], "salom")

    def test_openai_first_is_unchanged_for_default(self):
        calls, _ = self._run("openai", openai_ok=True, gemini_ok=True)
        self.assertEqual(calls, ["openai"])

    def test_both_failing_raises_the_last_error(self):
        calls, err = self._run("gemini", openai_ok=False, gemini_ok=False)
        self.assertEqual(calls, ["gemini", "openai"])
        self.assertIsInstance(err, RuntimeError)


class TestPassthroughSegments(unittest.TestCase):
    def test_text_is_kept_verbatim_and_ids_and_times_preserved(self):
        segs = [{"id": 5, "start": 1.0, "end": 3.5, "text": "  Assalomu   alaykum,\n do'stlar!  "},
                {"id": 6, "start": 3.5, "end": 5.0, "text": "Bugun  yangi mavzu."}]
        out = translator.passthrough_segments(segs)
        self.assertEqual([s["id"] for s in out], [5, 6])
        self.assertEqual((out[0]["start"], out[0]["end"]), (1.0, 3.5))
        self.assertEqual(out[0]["text"], "Assalomu alaykum, do'stlar!")

    def test_blank_segments_dropped_and_missing_ids_generated(self):
        out = translator.passthrough_segments([{"start": 0, "end": 1, "text": "  "}, {"start": 1, "end": 2, "text": "bor"}])
        self.assertEqual([s["text"] for s in out], ["bor"])
        self.assertEqual(translator.passthrough_segments(None), [])

    def test_makes_no_network_or_llm_call(self):
        with patch.object(translator, "_get_client", side_effect=AssertionError("LLM chaqirildi")), \
             patch.object(translator, "call_openai_with_retry", side_effect=AssertionError("LLM chaqirildi")):
            translator.passthrough_segments([{"id": 1, "start": 0, "end": 1, "text": "salom"}])


class TestIsUzbekSource(unittest.TestCase):
    def test_only_subtitle_jobs_with_uz(self):
        job = lambda **k: SimpleNamespace(**k)
        self.assertTrue(is_uzbek_source(job(subtitle_only=True, source_language="uz")))
        self.assertFalse(is_uzbek_source(job(subtitle_only=False, source_language="uz")))   # dublyaj -- hech qachon
        self.assertFalse(is_uzbek_source(job(subtitle_only=True, source_language=None)))
        self.assertFalse(is_uzbek_source(job(subtitle_only=True, source_language="en")))
        self.assertFalse(is_uzbek_source(job(subtitle_only=True)))                        # ustun yo'q (eski obyekt)


class TestNormalizeSourceLanguage(unittest.TestCase):
    def test_auto_and_empty_mean_translate(self):
        for v in (None, "", "auto", " AUTO "):
            self.assertIsNone(_normalize_source_language(v, True))
            self.assertIsNone(_normalize_source_language(v, False))

    def test_uz_needs_subtitle_mode(self):
        self.assertEqual(_normalize_source_language("uz", True), "uz")
        self.assertEqual(_normalize_source_language(" UZ ", True), "uz")
        with self.assertRaises(HTTPException) as cm:
            _normalize_source_language("uz", False)
        self.assertEqual(cm.exception.status_code, 400)

    def test_unknown_language_is_400(self):
        with self.assertRaises(HTTPException) as cm:
            _normalize_source_language("klingon", True)
        self.assertEqual(cm.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
