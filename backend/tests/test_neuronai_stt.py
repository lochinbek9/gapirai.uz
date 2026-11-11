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

    def test_uzbek_turkish_letters_are_normalized(self):
        raw = "Keling suhbatimizni avval ular bilan bir tanişişdan boşlaylik. Özi umuman eksportçilar uyuşmasi qanday faoliyat olib boryapti, şular töğrisida"
        body = {"data": {"text": raw, "language": "uz", "segments": [{"start": 0.0, "end": 6.0, "text": raw}]}}
        with patch("httpx.post", return_value=_resp(200, body)):
            segs, text, lang = transcriber._transcribe_chunk_neuronai(self.chunk, offset_seconds=0, language="uz")
        self.assertIn("tanishishdan boshlaylik. Oʻzi", text)
        self.assertIn("eksportchilar uyushmasi", text)
        self.assertIn("shular toʻgʻrisida", text)
        self.assertFalse(transcriber.looks_turkish(text))
        self.assertEqual(segs[0]["text"], text)


    def test_worker_uses_stt_uz_primary_for_uzbek_source(self):
        """2026-11-11: tasks.py o'zbekcha nutq uchun primary="gemini" ni qattiq yozgani sababli
        STT_UZ_PRIMARY=neuronai e'tiborsiz qolgan, job Gemini cooldown'larida osilib turgan."""
        import inspect
        from backend.workers import tasks
        src = inspect.getsource(tasks.process_video.run)
        self.assertIn("stt_primary = settings.STT_UZ_PRIMARY", src)


    def test_worker_dub_stt_neuronai_admin_gate(self):
        import inspect
        from backend.workers import tasks
        src = inspect.getsource(tasks.process_video.run)
        self.assertIn('elif settings.STT_PROVIDER == "neuronai" and (', src)
        self.assertIn("not settings.NEURONAI_DUB_ADMIN_ONLY or plans.is_user_admin(db, job.user_id)", src)


class FreeModeOrderTest(unittest.TestCase):
    """FREE_MODE'da lokal Whisper birinchi; primary=neuronai bo'lsa NeuronAI birinchi."""

    def setUp(self):
        for name, value in (("FREE_MODE", True), ("NEURONAI_API_KEY", "nai_test"), ("NEURONAI_STT_ENABLED", True)):
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)

    def test_neuronai_primary_skips_local_whisper(self):
        api = {"text": "hi", "segments": [{"start": 0, "end": 1, "text": "hi"}], "srt": "", "language": "en"}
        with patch.object(transcriber, "_transcribe_local_whisper") as whisper, \
             patch.object(transcriber, "_transcribe_via_api", return_value=api) as via_api:
            self.assertEqual(transcriber.transcribe_audio("a.wav", None, primary="neuronai"), api)
        whisper.assert_not_called()
        self.assertEqual(via_api.call_args.args[2], "neuronai")

    def test_other_primary_keeps_local_whisper_first(self):
        local = {"text": "x", "segments": [], "srt": "", "language": "en"}
        with patch.object(transcriber, "_transcribe_local_whisper", return_value=local) as whisper, \
             patch.object(transcriber, "_transcribe_via_api") as via_api:
            self.assertEqual(transcriber.transcribe_audio("a.wav", None, primary="gemini"), local)
        whisper.assert_called_once()
        via_api.assert_not_called()

    def test_neuronai_down_falls_back_to_local_whisper(self):
        local = {"text": "x", "segments": [], "srt": "", "language": "en"}
        with patch.object(transcriber, "_transcribe_local_whisper", return_value=local) as whisper, \
             patch.object(transcriber, "_transcribe_via_api", side_effect=RuntimeError("402")):
            self.assertEqual(transcriber.transcribe_audio("a.wav", None, primary="neuronai"), local)
        whisper.assert_called_once()


class SplitLongSegmentTest(unittest.TestCase):
    def test_short_segment_unchanged(self):
        seg = {"start": 1.0, "end": 5.0, "text": "Salom. Qalaysiz?"}
        self.assertEqual(transcriber.split_long_segment(seg), [seg])

    def test_long_segment_split_into_contiguous_sentence_pieces(self):
        text = ("Assalomu alaykum, bugun eksport haqida gaplashamiz. Rahmat. "
                "Oʻzbekiston eksportchilar uyushmasi oʻz faoliyatini ikki ming oʻn toʻqqizinchi yildan boshlagan. "
                "Keyin turli savollar va muammolar chiqib kela boshladi, biz ularni oʻrganib chiqdik. "
                "Hukumatga takliflar berdik va boshqa davlatlar amaliyotini oʻrgandik.")
        parts = transcriber.split_long_segment({"start": 100.0, "end": 130.0, "text": text})
        self.assertGreater(len(parts), 3)
        self.assertEqual(parts[0]["start"], 100.0)
        self.assertEqual(parts[-1]["end"], 130.0)
        for a, b in zip(parts, parts[1:]):
            self.assertEqual(a["end"], b["start"])
        self.assertTrue(all(p["end"] - p["start"] <= 9.0 for p in parts))
        self.assertEqual(" ".join(p["text"] for p in parts), text)
        self.assertIn("Rahmat.", parts[0]["text"] + parts[1]["text"])  # qisqa gap qo'shni bilan birlashadi

    def test_run_on_sentence_split_on_commas_and_words(self):
        text = ", ".join(["juda uzun gap davom etmoqda va tugamaydi"] * 12)
        parts = transcriber.split_long_segment({"start": 0.0, "end": 30.0, "text": text})
        self.assertGreater(len(parts), 3)
        self.assertEqual(" ".join(p["text"] for p in parts), text)


if __name__ == "__main__":
    unittest.main()
