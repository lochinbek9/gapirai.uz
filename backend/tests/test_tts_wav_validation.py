"""2026-08-26 corrupted-TTS-WAV fix regression tests (production finding:
job 83ca2305 -- Azure TTS produced seg_0021.wav with an all-zero RIFF
header; pydub/ffmpeg raised CouldntDecodeError with no validation or retry
in front of it, crashing the whole TTS stage over one bad segment).

Covers synthesizer.py's _validate_wav_file() (the four independent checks)
directly, and _process_single_segment's bounded per-segment retry loop via
synthesize_segments() with a real WAV written by pydub plus a real ffmpeg
probe -- no ffmpeg/pydub calls are mocked, since the whole point is to
prove the validation genuinely catches what ffmpeg would have choked on.
"""
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydub import AudioSegment

from backend.services import synthesizer


def _write_valid_wav(path: str, duration_ms: int = 500) -> None:
    AudioSegment.silent(duration=duration_ms, frame_rate=24000).export(path, format="wav")


class TestValidateWavFile(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _path(self, name: str) -> str:
        return str(Path(self.tmpdir) / name)

    # 6. valid WAV accepted
    def test_valid_wav_is_accepted(self):
        p = self._path("valid.wav")
        _write_valid_wav(p)
        valid, reason = synthesizer._validate_wav_file(p)
        self.assertTrue(valid, reason)
        self.assertEqual(reason, "")

    def test_missing_file_rejected(self):
        valid, reason = synthesizer._validate_wav_file(self._path("does_not_exist.wav"))
        self.assertFalse(valid)
        self.assertIn("mavjud emas", reason)

    # 7. zero-byte WAV rejected
    def test_zero_byte_wav_rejected(self):
        p = self._path("empty.wav")
        Path(p).touch()
        valid, reason = synthesizer._validate_wav_file(p)
        self.assertFalse(valid)
        self.assertIn("bo'sh", reason)

    # 8. malformed WAV rejected (this is the EXACT production failure --
    # a file that exists, is non-empty, but has an all-zero RIFF header)
    def test_malformed_header_rejected(self):
        p = self._path("bad_header.wav")
        Path(p).write_bytes(b"\x00" * 4 + b"\x00\x00\x00\x00" + b"\x00" * 4 + b"garbage-audio-data" * 10)
        valid, reason = synthesizer._validate_wav_file(p)
        self.assertFalse(valid)
        self.assertIn("sarlavha", reason)

    # 9. ffmpeg-decode failure rejected (valid RIFF/WAVE markers, but
    # nonsensical format parameters -- only a real decode attempt catches
    # this, since the RIFF/WAVE header check alone would pass it)
    def test_valid_riff_wave_markers_but_undecodable_format_rejected_by_ffmpeg_probe(self):
        import struct
        p = self._path("bad_format.wav")
        real = self._path("real.wav")
        _write_valid_wav(real, duration_ms=2000)
        data = bytearray(Path(real).read_bytes())
        # Corrupt num_channels (bytes 22-23) and bits_per_sample (bytes
        # 34-35) to 0 in the fmt subchunk -- RIFF/WAVE markers stay intact
        # (so the header check alone would wrongly accept this), but no
        # decoder can make sense of "0 channels, 0 bits per sample".
        data[22:24] = struct.pack("<H", 0)
        data[34:36] = struct.pack("<H", 0)
        Path(p).write_bytes(bytes(data))

        # Confirm the header check alone (RIFF/WAVE markers) would have
        # passed this -- proving the ffmpeg probe is doing real work here,
        # not just re-checking what the header check already caught.
        self.assertEqual(bytes(data[0:4]), b"RIFF")
        self.assertEqual(bytes(data[8:12]), b"WAVE")

        valid, reason = synthesizer._validate_wav_file(p)
        self.assertFalse(valid, "a format-corrupted file must not be accepted as valid")
        self.assertIn("ffmpeg", reason)


class TestPerSegmentRetry(unittest.TestCase):
    """synthesize_segments()'s bounded per-segment retry, via
    _process_single_segment -- exercised through the real public function
    with only the TTS provider layer mocked (everything downstream --
    validation, retry counting, audio assembly -- is real)."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _segments(self):
        return [{"id": 0, "start": 0.0, "end": 1.0, "text": "salom dunyo"}]

    # 10. corrupt segment retried, 11. valid retry succeeds
    def test_corrupt_segment_is_retried_and_succeeds_on_second_attempt(self):
        call_count = {"n": 0}

        def fake_synthesize_text(text, output_path, voice_name=None, video_id=None, user_id=None):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # First attempt: simulate the exact production corruption --
                # a file that exists but has a broken header.
                Path(output_path).write_bytes(b"\x00" * 44)
            else:
                _write_valid_wav(output_path)
            return "azure"

        with patch("backend.services.synthesizer._synthesize_text", side_effect=fake_synthesize_text), \
             patch("backend.services.synthesizer.settings") as mock_settings:
            mock_settings.FREE_MODE = False
            mock_settings.ENABLE_SEGMENT_QA = False
            with patch("backend.services.synthesizer.get_provider") as mock_get_provider:
                mock_provider = mock_get_provider.return_value
                mock_provider.name = "azure"
                mock_provider.synthesize_batch.side_effect = Exception("no batch support in this test")
                merged_path, timings, qa = synthesizer.synthesize_segments(
                    self._segments(), self.tmpdir, voice_name="uz-UZ-SardorNeural",
                )

        self.assertEqual(call_count["n"], 2, "must retry exactly once before succeeding")
        self.assertTrue(Path(merged_path).exists())
        self.assertEqual(len(timings), 1)

    # 12. when EVERY segment fails TTS (bad key / no credit / provider down),
    # synthesize_segments must raise clearly -- not hang, and not return a
    # dub that is entirely original audio. (A MINORITY of failed segments is
    # tolerated instead -- see test_minority_failed_segments_are_dropped.)
    def test_all_segments_failing_raises_clear_error(self):
        def always_corrupt(text, output_path, voice_name=None, video_id=None, user_id=None):
            Path(output_path).write_bytes(b"\x00" * 44)
            return "azure"

        with patch("backend.services.synthesizer._synthesize_text", side_effect=always_corrupt), \
             patch("backend.services.synthesizer.settings") as mock_settings:
            mock_settings.FREE_MODE = False
            mock_settings.ENABLE_SEGMENT_QA = False
            with patch("backend.services.synthesizer.get_provider") as mock_get_provider:
                mock_provider = mock_get_provider.return_value
                mock_provider.name = "azure"
                mock_provider.synthesize_batch.side_effect = Exception("no batch support in this test")
                with self.assertRaises(RuntimeError) as ctx:
                    synthesizer.synthesize_segments(
                        self._segments(), self.tmpdir, voice_name="uz-UZ-SardorNeural",
                    )
        self.assertIn("TTS_INVALID_AUDIO", str(ctx.exception))

    # 12b. a SINGLE unrecoverable segment among several valid ones must NOT
    # kill the job (production finding: job 5c4f986d -- one transient
    # Azure-429 -> empty-Edge-fallback on segment 154 of a 150+ segment
    # video failed the whole dub, then Celery retried it 5x over ~23min).
    # The bad slot keeps the original audio; the dub still completes.
    def test_minority_failed_segments_are_dropped_not_fatal(self):
        segments = [
            {"id": 0, "start": 0.0, "end": 1.0, "text": "birinchi"},
            {"id": 1, "start": 2.0, "end": 3.0, "text": "ikkinchi"},
            {"id": 2, "start": 4.0, "end": 5.0, "text": "uchinchi"},
            {"id": 3, "start": 6.0, "end": 7.0, "text": "tortinchi"},
        ]

        def one_bad(text, output_path, voice_name=None, video_id=None, user_id=None):
            if text == "uchinchi":
                Path(output_path).write_bytes(b"\x00" * 44)  # always corrupt
            else:
                _write_valid_wav(output_path)
            return "azure"

        with patch("backend.services.synthesizer._synthesize_text", side_effect=one_bad), \
             patch("backend.services.synthesizer.settings") as mock_settings:
            mock_settings.FREE_MODE = False
            mock_settings.ENABLE_SEGMENT_QA = False
            with patch("backend.services.synthesizer.get_provider") as mock_get_provider:
                mock_provider = mock_get_provider.return_value
                mock_provider.name = "azure"
                mock_provider.synthesize_batch.side_effect = Exception("no batch support in this test")
                merged_path, timings, qa = synthesizer.synthesize_segments(
                    segments, self.tmpdir, voice_name="uz-UZ-SardorNeural",
                )

        self.assertTrue(Path(merged_path).exists())
        self.assertEqual(len(timings), 3, "the 3 good segments survive; the corrupt one is dropped")

    # 13. other segments are not regenerated unnecessarily
    def test_other_segments_not_regenerated_when_one_segment_is_corrupt(self):
        # Gap > 0.6s so group_segments_into_sentences() does NOT merge these
        # into one segment (that merge logic is unrelated to this fix, but
        # would silently collapse the test's two-segment premise if not
        # avoided -- see synthesizer.py:_GROUP_MAX_GAP_S).
        segments = [
            {"id": 0, "start": 0.0, "end": 1.0, "text": "birinchi"},
            {"id": 1, "start": 2.0, "end": 3.0, "text": "ikkinchi"},
        ]
        calls: dict[str, int] = {}

        def fake_synthesize_text(text, output_path, voice_name=None, video_id=None, user_id=None):
            calls[text] = calls.get(text, 0) + 1
            if text == "birinchi" and calls[text] == 1:
                Path(output_path).write_bytes(b"\x00" * 44)  # corrupt on first attempt only
            else:
                _write_valid_wav(output_path)
            return "azure"

        with patch("backend.services.synthesizer._synthesize_text", side_effect=fake_synthesize_text), \
             patch("backend.services.synthesizer.settings") as mock_settings:
            mock_settings.FREE_MODE = False
            mock_settings.ENABLE_SEGMENT_QA = False
            with patch("backend.services.synthesizer.get_provider") as mock_get_provider:
                mock_provider = mock_get_provider.return_value
                mock_provider.name = "azure"
                mock_provider.synthesize_batch.side_effect = Exception("no batch support in this test")
                synthesizer.synthesize_segments(segments, self.tmpdir, voice_name="uz-UZ-SardorNeural")

        self.assertEqual(calls["birinchi"], 2, "the corrupt segment retries once")
        self.assertEqual(calls["ikkinchi"], 1, "the healthy segment must be synthesized exactly once, never re-touched")


if __name__ == "__main__":
    unittest.main()
