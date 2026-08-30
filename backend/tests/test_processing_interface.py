"""Phase 2 — processing boundary (backend/services/processing/).

Bu qatlam FAQAT invocation boundary: LocalEncoder / LocalTranscriber mavjud
merger.merge_video_audio() / transcriber.transcribe_audio() ni O'ZGARTIRMASDAN
o'raydi. Testlar shuni tekshiradi:
  - kontrakt (Protocol) mavjud
  - default implementatsiya lokal
  - wrapper mavjud funksiyani AYNAN o'sha argumentlar bilan chaqiradi (mock)
  - hech qanday biznes mantiq boundary'ga ko'chirilmagan (wrapper natijasi =
    underlying natija, o'zgartirishsiz)
"""
import unittest
from unittest.mock import patch, MagicMock

from backend.services import processing
from backend.services.processing import (
    Encoder,
    Transcriber,
    LocalEncoder,
    LocalTranscriber,
    get_encoder,
    get_transcriber,
)


class TestContract(unittest.TestCase):
    def test_protocols_exist_and_are_runtime_checkable(self):
        self.assertTrue(isinstance(LocalEncoder(), Encoder))
        self.assertTrue(isinstance(LocalTranscriber(), Transcriber))

    def test_package_reexports(self):
        # __init__.py orqali ham import qilinadi (tasks.py shundan foydalanadi)
        for name in ("Encoder", "Transcriber", "LocalEncoder", "LocalTranscriber",
                     "get_encoder", "get_transcriber"):
            self.assertTrue(hasattr(processing, name), name)


class TestDefaultImplementationIsLocal(unittest.TestCase):
    def setUp(self):
        # get_* jarayon-darajali singleton — testlar orasida tozalab qo'yamiz
        processing.interface._encoder = None
        processing.interface._transcriber = None

    def tearDown(self):
        processing.interface._encoder = None
        processing.interface._transcriber = None

    def test_get_encoder_returns_local(self):
        self.assertIsInstance(get_encoder(), LocalEncoder)

    def test_get_transcriber_returns_local(self):
        self.assertIsInstance(get_transcriber(), LocalTranscriber)

    def test_get_encoder_is_cached(self):
        self.assertIs(get_encoder(), get_encoder())


class TestLocalEncoderDelegates(unittest.TestCase):
    @patch("backend.services.merger.merge_video_audio", return_value="/out/dubbed_final.mp4")
    def test_encode_merge_calls_merger_with_exact_kwargs(self, mock_merge):
        result = LocalEncoder().encode_merge(
            video_path="/in/video.mp4",
            audio_path="/in/dubbed_audio.wav",
            out_path="/out/dubbed_final.mp4",
            mix_mode="dubbed_only",
        )
        mock_merge.assert_called_once_with(
            video_path="/in/video.mp4",
            dubbed_audio_path="/in/dubbed_audio.wav",
            output_path="/out/dubbed_final.mp4",
            audio_mix_mode="dubbed_only",
        )
        # wrapper natijani o'zgartirmaydi
        self.assertEqual(result, "/out/dubbed_final.mp4")

    @patch("backend.services.merger.merge_video_audio", return_value="/out/x.mp4")
    def test_encode_merge_default_mix_mode_is_none(self, mock_merge):
        LocalEncoder().encode_merge("/v.mp4", "/a.wav", "/o.mp4")
        self.assertIsNone(mock_merge.call_args.kwargs["audio_mix_mode"])


class TestLocalTranscriberDelegates(unittest.TestCase):
    _FAKE = {"text": "hi", "segments": [{"start": 0.0, "end": 1.0, "text": "hi"}],
             "srt": "1\n00:00:00,000 --> 00:00:01,000\nhi\n", "language": "en"}

    @patch("backend.services.transcriber.transcribe_audio")
    def test_transcribe_calls_transcriber_with_exact_args(self, mock_tx):
        mock_tx.return_value = dict(self._FAKE)
        result = LocalTranscriber().transcribe("/in/audio.wav")
        mock_tx.assert_called_once_with("/in/audio.wav", language="en")
        # wrapper natijani o'zgartirmaydi (shakl ham, qiymat ham)
        self.assertEqual(result, self._FAKE)

    @patch("backend.services.transcriber.transcribe_audio")
    def test_transcribe_passes_through_language(self, mock_tx):
        mock_tx.return_value = dict(self._FAKE)
        LocalTranscriber().transcribe("/a.wav", language="uz")
        mock_tx.assert_called_once_with("/a.wav", language="uz")


class TestTasksUsesBoundary(unittest.TestCase):
    def test_tasks_module_imports_boundary_getters(self):
        from backend.workers import tasks
        self.assertTrue(hasattr(tasks, "get_encoder"))
        self.assertTrue(hasattr(tasks, "get_transcriber"))

    def test_tasks_no_longer_calls_merger_merge_video_audio_directly(self):
        # process_video ning sequential MERGE yo'li endi boundary orqali.
        # merger import'i chunked pipeline (merge_video_audio_chunk) uchun qoladi.
        import inspect
        from backend.workers import tasks
        src = inspect.getsource(tasks.process_video)
        self.assertNotIn("merger.merge_video_audio(", src)
        self.assertIn("get_encoder().encode_merge(", src)
        self.assertNotIn("transcriber.transcribe_audio(", src)
        self.assertIn("get_transcriber().transcribe(", src)


if __name__ == "__main__":
    unittest.main()
