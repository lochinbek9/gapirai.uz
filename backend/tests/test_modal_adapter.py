"""Phase 3A — Modal adapter/prototype (backend/services/processing/modal_adapter.py).

Bu adapter PIPELINE'ga ULANMAGAN. Testlar shuni tasdiqlaydi:
  - modul `modal`siz import qilinadi (requirements.txt da modal yo'q)
  - __init__.py Modal adapterni re-export QILMAYDI
  - ModalEncoder / ModalTranscriber interface.Encoder / interface.Transcriber
    Protocol'lariga mos
  - get_encoder() / get_transcriber() HAMON Local* qaytaradi (default o'zgarmagan)
  - Modal/S3 sozlanmagan bo'lsa ModalNotConfigured (jim fallback yo'q)
  - orkestratsiya: lokal fayl -> S3 upload -> remote(S3 kalitlar) -> S3 download
    -> lokal yo'l (hammasi mock, haqiqiy Modal/S3 chaqiruvi yo'q)
"""
import importlib
import unittest
from unittest.mock import MagicMock, patch

import backend.services.processing as processing_pkg
from backend.services.processing import (
    LocalEncoder,
    LocalTranscriber,
    get_encoder,
    get_transcriber,
    interface,
)
from backend.services.processing import modal_adapter
from backend.services.processing.interface import Encoder, Transcriber
from backend.services.processing.modal_adapter import (
    ModalEncoder,
    ModalNotConfigured,
    ModalTranscriber,
    _WORK_PREFIX,
)


class TestImportSafety(unittest.TestCase):
    def test_module_imports_without_modal(self):
        # test collection'ning o'zi buni tasdiqlaydi (modal req'da yo'q); aniq assert:
        m = importlib.import_module("backend.services.processing.modal_adapter")
        self.assertTrue(hasattr(m, "ModalEncoder"))
        self.assertTrue(hasattr(m, "ModalTranscriber"))
        with self.assertRaises(ImportError):
            import modal  # noqa: F401

    def test_not_reexported_from_package_init(self):
        self.assertFalse(hasattr(processing_pkg, "ModalEncoder"))
        self.assertFalse(hasattr(processing_pkg, "ModalTranscriber"))
        self.assertNotIn("ModalEncoder", getattr(processing_pkg, "__all__", []))


class TestContract(unittest.TestCase):
    def test_modal_adapters_satisfy_protocols(self):
        self.assertIsInstance(ModalEncoder(), Encoder)
        self.assertIsInstance(ModalTranscriber(), Transcriber)


class TestDefaultBehaviorUnchanged(unittest.TestCase):
    def setUp(self):
        interface._encoder = None
        interface._transcriber = None

    def tearDown(self):
        interface._encoder = None
        interface._transcriber = None

    def test_get_encoder_still_local(self):
        enc = get_encoder()
        self.assertIsInstance(enc, LocalEncoder)
        self.assertNotIsInstance(enc, ModalEncoder)

    def test_get_transcriber_still_local(self):
        tx = get_transcriber()
        self.assertIsInstance(tx, LocalTranscriber)
        self.assertNotIsInstance(tx, ModalTranscriber)


class TestNotConfigured(unittest.TestCase):
    @patch.object(modal_adapter, "_modal_ready", return_value=False)
    def test_encoder_raises_when_modal_unavailable(self, _m):
        with self.assertRaises(ModalNotConfigured):
            ModalEncoder().encode_merge("/v.mp4", "/a.wav", "/o.mp4")

    @patch.object(modal_adapter, "_modal_ready", return_value=True)
    @patch.object(modal_adapter, "_s3_ready", return_value=False)
    def test_encoder_raises_when_s3_unavailable(self, _s3, _m):
        with self.assertRaises(ModalNotConfigured):
            ModalEncoder().encode_merge("/v.mp4", "/a.wav", "/o.mp4")

    @patch.object(modal_adapter, "_modal_ready", return_value=False)
    def test_transcriber_raises_when_modal_unavailable(self, _m):
        with self.assertRaises(ModalNotConfigured):
            ModalTranscriber().transcribe("/a.wav")


@patch.object(modal_adapter, "_modal_ready", return_value=True)
@patch.object(modal_adapter, "_s3_ready", return_value=True)
class TestModalEncoderOrchestration(unittest.TestCase):
    @patch("backend.services.storage.download_file_from_s3", return_value=True)
    @patch("backend.services.storage.upload_file_to_s3", return_value=True)
    @patch.object(modal_adapter, "_lookup_remote")
    def test_upload_call_remote_download(self, mock_lookup, mock_up, mock_down, _s3, _m):
        fake_fn = MagicMock()
        fake_fn.remote.return_value = "dubber-work/deadbeef0001/dubbed_final.mp4"
        mock_lookup.return_value = fake_fn

        result = ModalEncoder().encode_merge(
            video_path="/local/video.mp4",
            audio_path="/local/dubbed_audio.wav",
            out_path="/local/out/dubbed_final.mp4",
            mix_mode="dubbed_only",
        )

        # 1. ikkala kirish fayli dubber-work/ prefiksi ostida S3'ga yuklandi
        self.assertEqual(mock_up.call_count, 2)
        up_keys = [c.args[1] for c in mock_up.call_args_list]
        self.assertTrue(all(k.startswith(_WORK_PREFIX + "/") for k in up_keys), up_keys)
        self.assertTrue(any(k.endswith("/video.mp4") for k in up_keys), up_keys)
        self.assertTrue(any(k.endswith("/audio.wav") for k in up_keys), up_keys)

        # 2. remote to'g'ri S3 kalitlar + mix_mode bilan
        mock_lookup.assert_called_once_with("encode_merge_remote")
        rk = fake_fn.remote.call_args.kwargs
        self.assertEqual(rk["mix_mode"], "dubbed_only")
        self.assertTrue(rk["video_key"].startswith(_WORK_PREFIX + "/"))
        self.assertTrue(rk["audio_key"].startswith(_WORK_PREFIX + "/"))

        # 3. remote qaytargan kalit lokal out_path'ga
        mock_down.assert_called_once()
        self.assertEqual(mock_down.call_args.args[0], "dubber-work/deadbeef0001/dubbed_final.mp4")
        self.assertEqual(mock_down.call_args.args[1], "/local/out/dubbed_final.mp4")

        # 4. natija = lokal out_path (Encoder kontrakti)
        self.assertEqual(result, "/local/out/dubbed_final.mp4")

    @patch("backend.services.storage.download_file_from_s3", return_value=True)
    @patch("backend.services.storage.upload_file_to_s3", return_value=True)
    @patch.object(modal_adapter, "_lookup_remote")
    def test_default_mix_mode_none_passed_through(self, mock_lookup, mock_up, mock_down, _s3, _m):
        fake_fn = MagicMock()
        fake_fn.remote.return_value = "dubber-work/x/dubbed_final.mp4"
        mock_lookup.return_value = fake_fn
        ModalEncoder().encode_merge("/v.mp4", "/a.wav", "/o.mp4")
        self.assertIsNone(fake_fn.remote.call_args.kwargs["mix_mode"])

    @patch("backend.services.storage.upload_file_to_s3", return_value=False)
    @patch.object(modal_adapter, "_lookup_remote")
    def test_raises_and_skips_remote_when_input_upload_fails(self, mock_lookup, mock_up, _s3, _m):
        with self.assertRaises(ModalNotConfigured):
            ModalEncoder().encode_merge("/v.mp4", "/a.wav", "/o.mp4")
        mock_lookup.assert_not_called()


@patch.object(modal_adapter, "_modal_ready", return_value=True)
@patch.object(modal_adapter, "_s3_ready", return_value=True)
class TestModalTranscriberOrchestration(unittest.TestCase):
    _FAKE = {
        "text": "salom",
        "segments": [{"start": 0.0, "end": 1.0, "text": "salom"}],
        "srt": "1\n00:00:00,000 --> 00:00:01,000\nsalom\n",
        "language": "uz",
    }

    @patch("backend.services.storage.upload_file_to_s3", return_value=True)
    @patch.object(modal_adapter, "_lookup_remote")
    def test_upload_audio_call_remote_return_dict(self, mock_lookup, mock_up, _s3, _m):
        fake_fn = MagicMock()
        fake_fn.remote.return_value = dict(self._FAKE)
        mock_lookup.return_value = fake_fn

        result = ModalTranscriber().transcribe("/local/audio.wav", language="uz")

        mock_up.assert_called_once()
        self.assertTrue(mock_up.call_args.args[1].startswith(_WORK_PREFIX + "/"))
        mock_lookup.assert_called_once_with("transcribe_remote")
        self.assertEqual(fake_fn.remote.call_args.kwargs["language"], "uz")
        # adapter natijani o'zgartirmaydi (transcriber.transcribe_audio shakli)
        self.assertEqual(result, self._FAKE)


if __name__ == "__main__":
    unittest.main()
