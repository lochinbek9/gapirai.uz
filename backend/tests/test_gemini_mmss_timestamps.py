"""Gemini STT ba'zan "1:01" (61s) ni 101 deb qaytaradi -- har daqiqadan keyin
+40s siljish videoning oxirini dublyajsiz qoldirardi (2026-10 production).
Ma'lumotlar production job'laridan olingan (bo'lakka nisbatan vaqtlar)."""

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.transcriber import (
    _fix_gemini_mmss_timestamps,
    _gemini_time_to_seconds,
    _transcribe_chunk_gemini,
)


def _segs(pairs):
    return [{"start": float(a), "end": float(b), "text": f"s{i}"} for i, (a, b) in enumerate(pairs)]


# Job 62d60729, 1-bo'lak (180s): 55 -> 101, 157 -> 205, 258 -> 300 sakrashlari.
JOB_62D6_CHUNK1 = [
    (0, 4), (4, 10), (10, 15), (15, 18), (18, 24), (24, 28), (28, 32), (32, 38), (38, 42), (42, 47),
    (47, 52), (52, 55), (55, 101), (101, 105), (105, 111), (111, 119), (119, 124), (124, 128),
    (128, 134), (134, 137), (137, 145), (145, 149), (149, 152), (152, 157), (157, 205), (205, 209),
    (209, 217), (217, 225), (225, 233), (233, 237), (237, 244), (244, 249), (249, 251), (251, 255),
    (255, 258), (258, 300),
]

# Job 3eb27fcb, 1-bo'lak (180s): nutq 18..52, keyin 147 (= 1:47 = 107s) va 227..257 (= 147..177s).
JOB_3EB2_CHUNK1 = [
    (18, 21), (21, 26), (26, 30), (30, 35), (35, 40), (40, 43), (43, 46), (46, 52),
    (147, 152), (227, 232), (233, 239), (239, 245), (245, 250), (250, 257),
]


class TestGeminiTimeParsing(unittest.TestCase):
    def test_numbers_and_strings(self):
        self.assertEqual(_gemini_time_to_seconds(75.4), 75.4)
        self.assertEqual(_gemini_time_to_seconds("75.4"), 75.4)
        self.assertEqual(_gemini_time_to_seconds("1:01.5"), 61.5)
        self.assertEqual(_gemini_time_to_seconds("01:15"), 75.0)
        self.assertEqual(_gemini_time_to_seconds("0:01:15"), 75.0)
        self.assertEqual(_gemini_time_to_seconds("1:01,5"), 61.5)


class TestFixGeminiMmssTimestamps(unittest.TestCase):
    def test_production_job_62d6_is_converted_to_clip_length(self):
        fixed = _fix_gemini_mmss_timestamps(_segs(JOB_62D6_CHUNK1), clip_duration=180.0)
        self.assertEqual(len(fixed), len(JOB_62D6_CHUNK1))
        self.assertAlmostEqual(fixed[-1]["end"], 180.0)          # "3:00" -> 180s
        self.assertAlmostEqual(fixed[12]["end"], 61.0)           # 55-101 -> 55-61
        starts = [s["start"] for s in fixed]
        self.assertEqual(starts, sorted(starts))                 # vaqt tartibi saqlanadi
        self.assertTrue(all(s["end"] <= 182.0 for s in fixed))

    def test_production_job_3eb2_end_moves_inside_video(self):
        fixed = _fix_gemini_mmss_timestamps(_segs(JOB_3EB2_CHUNK1), clip_duration=180.0)
        self.assertEqual(len(fixed), len(JOB_3EB2_CHUNK1))       # hech bir segment yo'qolmaydi
        self.assertAlmostEqual(fixed[0]["start"], 18.0)          # 1-daqiqa o'zgarmaydi
        self.assertAlmostEqual(fixed[8]["start"], 107.0)         # 147 -> 1:47
        self.assertAlmostEqual(fixed[-1]["end"], 177.0)          # 257 -> 2:57

    def test_mmss_detected_even_when_not_exceeding_clip(self):
        # Nutq 1:40 dan oldin tugaydi (max 135 < 180) -- faqat 60..99 bo'shlig'i va
        # daqiqa chegarasidagi uzluksizlik bo'yicha aniqlanadi.
        pairs = [(0, 5), (5, 30), (30, 57), (57, 102), (102, 120), (120, 135)]
        fixed = _fix_gemini_mmss_timestamps(_segs(pairs), clip_duration=180.0)
        self.assertAlmostEqual(fixed[3]["end"], 62.0)
        self.assertAlmostEqual(fixed[-1]["end"], 95.0)

    def test_real_seconds_are_untouched(self):
        pairs = [(i, i + 5) for i in range(0, 175, 5)]           # 60..99 oralig'i to'la
        segs = _segs(pairs)
        self.assertEqual(_fix_gemini_mmss_timestamps(segs, clip_duration=180.0), segs)

    def test_real_silence_gap_is_not_mistaken_for_mmss(self):
        # 55..105s musiqa: 60..99 bo'sh, lekin chegaradagi qadam katta (50s) -- tegmaymiz.
        segs = _segs([(0, 30), (30, 55), (105, 120), (120, 140)])
        self.assertEqual(_fix_gemini_mmss_timestamps(segs, clip_duration=180.0), segs)

    def test_unexplainable_overflow_is_clamped(self):
        # 190 MM:SS bo'lishi mumkin emas (90 >= 60) -- bo'lakdan tashqarisi tashlanadi.
        segs = _segs([(0, 60), (60, 120), (120, 178), (178, 185), (190, 195)])
        fixed = _fix_gemini_mmss_timestamps(segs, clip_duration=180.0)
        self.assertEqual(len(fixed), 4)
        self.assertEqual(fixed[-1]["end"], 180.0)

    def test_empty_and_unknown_duration(self):
        self.assertEqual(_fix_gemini_mmss_timestamps([], 180.0), [])
        segs = _segs([(i, i + 5) for i in range(0, 120, 5)])
        self.assertEqual(_fix_gemini_mmss_timestamps(segs, None), segs)


class TestTranscribeChunkGeminiAppliesFixBeforeOffset(unittest.TestCase):
    def test_second_chunk_offset_is_added_after_conversion(self):
        # 2-bo'lak (offset 180s): Gemini "1:44" ni 144 deb qaytargan (62d60729'dagi 180+144=324).
        payload = {"language": "en", "segments": [
            {"start": 0, "end": 30, "text": "a"}, {"start": 30, "end": 58, "text": "b"},
            {"start": 58, "end": 102, "text": "c"}, {"start": 102, "end": 144, "text": "d"},
        ]}
        client = MagicMock()
        client.models.generate_content.return_value = SimpleNamespace(text=json.dumps(payload))
        with tempfile.NamedTemporaryFile(suffix=".mp3") as f, \
                patch("backend.services.transcriber._get_gemini_transcribe_client", return_value=client), \
                patch("backend.services.transcriber._get_gemini_candidate_models", return_value=["gemini-test"]), \
                patch("backend.services.transcriber._probe_audio_duration", return_value=120.0), \
                patch("backend.services.gemini_quota_manager.get_gemini_keys_for_request", return_value=["k"]), \
                patch("backend.services.gemini_quota_manager.is_model_available", return_value=(True, 0.0)), \
                patch("backend.services.gemini_quota_manager.record_model_request"), \
                patch("backend.services.gemini_quota_manager.record_model_success"), \
                patch("backend.services.gemini_quota_manager.is_paid_gemini_key", return_value=True), \
                patch("backend.services.gemini_quota_manager.mask_key", return_value="k***"):
            segments, text, lang, tier, key = _transcribe_chunk_gemini(Path(f.name), offset_seconds=180.0, language="en")

        self.assertEqual([s["text"] for s in segments], ["a", "b", "c", "d"])
        self.assertAlmostEqual(segments[2]["end"], 180 + 62.0)
        self.assertAlmostEqual(segments[-1]["end"], 180 + 104.0)   # 324 emas, 284
        self.assertEqual(text, "a b c d")


if __name__ == "__main__":
    unittest.main()
