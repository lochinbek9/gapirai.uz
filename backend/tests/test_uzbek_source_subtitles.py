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
             patch.object(transcriber.settings, "GEMINI_USE_VERTEX", False), \
             patch.object(transcriber.settings, "AZURE_SPEECH_KEY", ""), \
             patch.object(transcriber.settings, "OPENAI_ENABLED", True):
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
             patch.object(transcriber.settings, "GEMINI_USE_VERTEX", False), \
             patch.object(transcriber.settings, "AZURE_SPEECH_KEY", ""), \
             patch.object(transcriber.settings, "OPENAI_ENABLED", True):
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



TURKISH = ("Merhaba arkadaşlar, bugün size çok güzel bir şey göstereceğim ve umarım hoşunuza gidecek, "
           "çünkü bu konuda uzun zamandır çalışıyorum ve sonuçlar gerçekten şaşırtıcı.")
UZBEK_LATIN = ("Assalomu alaykum aziz do'stlar, bugun sizlarga juda qiziq narsani ko'rsataman va umid qilamanki, "
               "sizga yoqadi, chunki men bu ustida uzoq vaqtdan beri ishlayapman.")
UZBEK_CYRILLIC = ("Ассалому алайкум азиз дўстлар, бугун сизларга жуда қизиқ нарсани кўрсатаман ва умид қиламанки, "
                  "сизга ёқади, чунки мен бу устида узоқ вақтдан бери ишлаяпман.")


class TestLooksTurkish(unittest.TestCase):
    def test_turkish_is_detected(self):
        self.assertTrue(transcriber.looks_turkish(TURKISH))

    def test_uzbek_latin_cyrillic_and_english_are_not_flagged(self):
        for text in (UZBEK_LATIN, UZBEK_CYRILLIC, "This is a perfectly normal English sentence about nothing in particular."):
            self.assertFalse(transcriber.looks_turkish(text), text[:30])

    def test_short_empty_or_none_is_never_flagged(self):
        self.assertFalse(transcriber.looks_turkish("Merhaba şey"))
        self.assertFalse(transcriber.looks_turkish(""))
        self.assertFalse(transcriber.looks_turkish(None))


class TestOpenAIRequestForUzbek(unittest.TestCase):
    """2026-08-12 tuzatishi (commit 3759074): OpenAI 'uz' til ko'rsatkichini 400 bilan rad etadi."""

    def _call(self, language):
        import tempfile
        from pathlib import Path
        captured = {}

        def fake_create(**kwargs):
            captured.update(kwargs)
            return {"segments": [{"start": 0.0, "end": 1.0, "text": "salom"}], "text": "salom", "language": "uzbek"}

        client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=fake_create)))
        with tempfile.NamedTemporaryFile(suffix=".mp3") as f, \
             patch.object(transcriber, "_get_client", return_value=client), \
             patch.object(transcriber, "call_openai_with_retry", side_effect=lambda fn, **kw: fn(**kw)):
            transcriber._transcribe_chunk(Path(f.name), 0.0, language=language)
        return captured

    def test_uz_hint_is_not_sent_but_uzbek_prompt_is(self):
        kwargs = self._call("uz")
        self.assertNotIn("language", kwargs)
        self.assertEqual(kwargs["prompt"], transcriber._UZ_STT_PROMPT)
        self.assertIn("oʻ", transcriber._UZ_STT_PROMPT)

    def test_english_still_sends_its_hint_and_no_prompt(self):
        kwargs = self._call("en")
        self.assertEqual(kwargs["language"], "en")
        self.assertNotIn("prompt", kwargs)

    def test_none_sends_neither(self):
        kwargs = self._call(None)
        self.assertNotIn("language", kwargs)
        self.assertNotIn("prompt", kwargs)

    def test_gemini_prompt_says_uzbek_not_turkish(self):
        prompt = transcriber._build_transcribe_prompt("uz")
        self.assertIn("NOT Turkish", prompt)
        self.assertIn("Uzbek", prompt)
        self.assertNotIn("NOT Turkish", transcriber._build_transcribe_prompt("en"))


class TestTurkishOutputFallsThrough(unittest.TestCase):
    def _run(self, primary, outputs):
        """outputs: {"openai": text, "gemini": text} -- har provayder qaytaradigan matn."""
        calls = []

        def make(name):
            def fn(path, offset_seconds, language="en"):
                calls.append(name)
                return [{"start": 0.0, "end": 5.0, "text": outputs[name]}], outputs[name], "uz"
            return fn

        with patch.object(transcriber, "_transcribe_chunk", make("openai")), \
             patch.object(transcriber, "_transcribe_chunk_gemini", make("gemini")), \
             patch.object(transcriber, "_chunk_audio", return_value=["/tmp/x.mp3"]), \
             patch.object(transcriber.settings, "GEMINI_API_KEY", "k"), \
             patch.object(transcriber.settings, "GEMINI_USE_VERTEX", False), \
             patch.object(transcriber.settings, "AZURE_SPEECH_KEY", ""), \
             patch.object(transcriber.settings, "OPENAI_ENABLED", True):
            try:
                return calls, transcriber._transcribe_via_api("/tmp/a.wav", "uz", primary)
            except Exception as exc:
                return calls, exc

    def test_turkish_from_first_provider_is_discarded_and_second_is_used(self):
        calls, result = self._run("openai", {"openai": TURKISH, "gemini": UZBEK_LATIN})
        self.assertEqual(calls, ["openai", "gemini"])
        self.assertEqual(result["text"], UZBEK_LATIN)

    def test_all_providers_turkish_raises_wrong_language_error(self):
        calls, err = self._run("gemini", {"openai": TURKISH, "gemini": TURKISH})
        self.assertEqual(calls, ["gemini", "openai"])
        self.assertIsInstance(err, transcriber.WrongLanguageError)

    def test_english_mode_never_runs_the_turkish_check(self):
        with patch.object(transcriber, "_transcribe_chunk", lambda p, offset_seconds, language="en": ([{"start": 0, "end": 1, "text": TURKISH}], TURKISH, "en")), \
             patch.object(transcriber, "_chunk_audio", return_value=["/tmp/x.mp3"]), \
             patch.object(transcriber.settings, "AZURE_SPEECH_KEY", ""), \
             patch.object(transcriber.settings, "OPENAI_ENABLED", True):
            result = transcriber._transcribe_via_api("/tmp/a.wav", "en", primary="openai")
        self.assertEqual(result["text"], TURKISH)


class TestLocalWhisperIsNotUsedForUzbek(unittest.TestCase):
    def test_uzbek_api_failure_raises_without_touching_local_whisper(self):
        with patch.object(transcriber, "_transcribe_via_api", side_effect=RuntimeError("api down")), \
             patch.object(transcriber, "_transcribe_local_whisper") as local:
            with self.assertRaises(RuntimeError):
                transcriber.transcribe_audio("/tmp/a.wav", language="uz")
        local.assert_not_called()

    def test_wrong_language_propagates_without_local_whisper(self):
        with patch.object(transcriber, "_transcribe_via_api", side_effect=transcriber.WrongLanguageError("turkcha")), \
             patch.object(transcriber, "_transcribe_local_whisper") as local:
            with self.assertRaises(transcriber.WrongLanguageError):
                transcriber.transcribe_audio("/tmp/a.wav", language="uz")
        local.assert_not_called()

    def test_english_keeps_local_whisper_as_last_resort(self):
        with patch.object(transcriber, "_transcribe_via_api", side_effect=RuntimeError("api down")), \
             patch.object(transcriber, "_transcribe_local_whisper", return_value={"text": "hello", "segments": [], "srt": "", "language": "en"}) as local:
            result = transcriber.transcribe_audio("/tmp/a.wav", language="en")
        local.assert_called_once()
        self.assertEqual(result["text"], "hello")

    def test_free_mode_does_not_route_uzbek_to_local_whisper(self):
        with patch.object(transcriber.settings, "FREE_MODE", True), \
             patch.object(transcriber, "_transcribe_via_api", return_value={"text": "ok", "segments": [], "srt": "", "language": "uz"}), \
             patch.object(transcriber, "_transcribe_local_whisper") as local:
            transcriber.transcribe_audio("/tmp/a.wav", language="uz")
        local.assert_not_called()


if __name__ == "__main__":
    unittest.main()
