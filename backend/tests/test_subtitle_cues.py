"""Subtitr kuelari (backend/services/subtitle_cues.py): gaplarni qisqa,
o'qib bo'ladigan, nutqqa mos kuelarga aylantirish. Toza funksiyalar -- DB kerak
emas; oxirida endpoint integratsiyasi (soxta DB bilan)."""
import unittest
import uuid
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.main import app
from backend.models.database import get_db
from backend.services import subtitle_cues as sc

LONG_UZ = ("Odamlar bu bosqichga kelib shunday boʻlishi kerak, shunday boʻlishi kerak, "
           "shunday boʻlishi kerak, deyishadi va men ham, ehtimol, siz uchun borishim mumkin, "
           "lekin men uchun yoʻq.")


def assert_well_formed(tc: unittest.TestCase, cues, max_line=sc.MAX_LINE_CHARS):
    for i, c in enumerate(cues):
        tc.assertGreater(c["end"], c["start"], f"kue {i} davomiyligi <=0")
        tc.assertTrue(c["text"].strip())
        for line in c["text"].split("\n"):
            tc.assertLessEqual(len(line), max_line, f"kue {i} qatori uzun: {line!r}")
        if i + 1 < len(cues):
            tc.assertLessEqual(c["end"], cues[i + 1]["start"] + 1e-9, f"kue {i} keyingisi bilan ustma-ust")
            tc.assertLessEqual(c["start"], cues[i + 1]["start"], "tartibsiz")


class TestSplitText(unittest.TestCase):
    def test_prefers_sentence_then_clause_boundaries(self):
        parts = sc.split_text("Birinchi gap shu yerda tugaydi. Ikkinchi gap esa boshqa fikrni aytadi.", 2)
        self.assertEqual(parts, ["Birinchi gap shu yerda tugaydi.", "Ikkinchi gap esa boshqa fikrni aytadi."])

    def test_returns_requested_parts_without_losing_words(self):
        text = LONG_UZ
        parts = sc.split_text(text, 3)
        self.assertEqual(len(parts), 3)
        self.assertEqual(" ".join(parts).split(), text.split())
        self.assertTrue(all(len(p) >= sc.MIN_PART_CHARS for p in parts))

    def test_short_text_or_single_part_is_untouched(self):
        self.assertEqual(sc.split_text("Salom dunyo", 1), ["Salom dunyo"])
        self.assertEqual(sc.split_text("Hi", 3), ["Hi"])

    def test_no_candidates_does_not_crash(self):
        self.assertEqual(sc.split_text("bittasidajudauzunsozbuyerdatugaydi", 2), ["bittasidajudauzunsozbuyerdatugaydi"])


class TestWrapLines(unittest.TestCase):
    def test_short_text_is_one_line(self):
        self.assertEqual(sc.wrap_lines("Salom, dunyo!"), "Salom, dunyo!")

    def test_two_balanced_lines_within_limit(self):
        out = sc.wrap_lines("Yoʻq, men sizning energiyangizni tekshirdim va energiyangiz yaxshi edi.")
        lines = out.split("\n")
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(len(l) <= sc.MAX_LINE_CHARS for l in lines))

    def test_prefers_breaking_after_punctuation_when_balance_is_equal(self):
        # ikkala bo'linish ham teng muvozanatli (21|29 va 29|21): vergul keyin bo'lgani yutadi
        out = sc.wrap_lines("abcdefghij klmnopqrst uvwxyz, abcdefghij klmnopqrst")
        self.assertEqual(out, "abcdefghij klmnopqrst uvwxyz,\nabcdefghij klmnopqrst")

    def test_balance_beats_punctuation_when_the_comma_is_far_from_the_middle(self):
        out = sc.wrap_lines("Mayli, men nima qilishimni koʻrsata olaman bilasizmi, shunday")
        first, second = out.split("\n")
        self.assertLessEqual(abs(len(first) - len(second)), 12)

    def test_too_long_falls_back_to_more_lines_but_respects_limit(self):
        text = " ".join(["soʻz"] * 40)
        lines = sc.wrap_lines(text).split("\n")
        self.assertGreater(len(lines), 2)
        self.assertTrue(all(len(l) <= sc.MAX_LINE_CHARS for l in lines))


class TestRefineSourceSegments(unittest.TestCase):
    def test_uses_word_times_when_present(self):
        segs = [{"start": 0.0, "end": 6.0, "words": [{"word": "a", "start": 1.2, "end": 1.6}, {"word": "b", "start": 4.9, "end": 5.4}]}]
        self.assertEqual(sc.refine_source_segments(segs), [(1.2, 5.4)])

    def test_falls_back_to_segment_times(self):
        self.assertEqual(sc.refine_source_segments([{"start": 2.0, "end": 4.0}]), [(2.0, 4.0)])
        self.assertEqual(sc.refine_source_segments([{"start": 2.0, "end": 4.0, "words": []}]), [(2.0, 4.0)])

    def test_word_times_far_from_segment_are_not_trusted(self):
        segs = [{"start": 10.0, "end": 12.0, "words": [{"word": "x", "start": 40.0, "end": 41.0}]}]
        self.assertEqual(sc.refine_source_segments(segs), [(10.0, 12.0)])

    def test_garbage_is_skipped(self):
        segs = [None, {}, {"start": "x", "end": 1}, {"start": 5, "end": 3}, {"start": 1, "end": 2, "words": [{"start": None}]}]
        self.assertEqual(sc.refine_source_segments([s for s in segs if isinstance(s, dict)]), [(1.0, 2.0)])


class TestBuildCues(unittest.TestCase):
    def test_long_sentence_becomes_short_two_line_cues_covering_the_window(self):
        cues = sc.build_cues([{"id": 1, "start": 146.0, "end": 152.9, "text": LONG_UZ}])
        self.assertGreater(len(cues), 1)
        assert_well_formed(self, cues)
        self.assertAlmostEqual(cues[0]["start"], 146.0, places=2)
        self.assertLessEqual(cues[-1]["end"], 152.9 + sc.MAX_CUE_HOLD_SECONDS)
        for c in cues:
            self.assertLessEqual(len(c["text"].replace("\n", " ")), sc.MAX_CUE_CHARS)
            self.assertLessEqual(c["end"] - c["start"], sc.MAX_CUE_SECONDS + 0.5)
        self.assertEqual(" ".join(c["text"].replace("\n", " ") for c in cues).split(), LONG_UZ.split())

    def test_short_sentence_stays_one_cue(self):
        cues = sc.build_cues([{"id": 1, "start": 0.0, "end": 3.0, "text": "Salom, qalaysiz?"}])
        self.assertEqual(len(cues), 1)
        self.assertEqual((cues[0]["start"], cues[0]["end"], cues[0]["text"]), (0.0, 3.0, "Salom, qalaysiz?"))

    def test_word_times_move_cue_to_real_speech_start_and_end(self):
        source = [{"start": 0.0, "end": 6.0, "words": [{"word": "x", "start": 1.4, "end": 1.8}, {"word": "y", "start": 4.6, "end": 5.1}]}]
        cues = sc.build_cues([{"id": 1, "start": 0.0, "end": 6.0, "text": "Bu qisqa gap."}], source)
        self.assertAlmostEqual(cues[0]["start"], 1.4, places=2)   # nutqdan OLDIN paydo bo'lmaydi
        self.assertGreaterEqual(cues[0]["end"], 5.1 - 1e-9)

    def test_split_snaps_to_real_speech_pause(self):
        # ikki gap oralig'ida 1 soniyalik pauza (3.0 -> 4.0); matn ikkiga bo'linishi kerak
        source = [
            {"start": 0.0, "end": 3.2, "words": [{"word": "a", "start": 0.2, "end": 3.0}]},
            {"start": 3.2, "end": 8.0, "words": [{"word": "b", "start": 4.0, "end": 7.8}]},
        ]
        text = "Birinchi qism nutqning boshida aytilgan gap edi, ikkinchi qism esa pauzadan keyin aytilgan uzunroq gap edi."
        cues = sc.build_cues([{"id": 1, "start": 0.0, "end": 8.0, "text": text}], source)
        self.assertEqual(len(cues), 2)
        self.assertAlmostEqual(cues[0]["end"], 3.0, places=1)     # pauzadan oldin yo'qoladi
        self.assertAlmostEqual(cues[1]["start"], 4.0, places=1)   # nutq qaytganda paydo bo'ladi
        assert_well_formed(self, cues)

    def test_fast_cue_is_extended_into_the_following_silence_but_not_over_next_cue(self):
        segs = [
            {"id": 1, "start": 0.0, "end": 1.0, "text": "Bu juda qisqa vaqtga sigʻmaydigan ancha uzun matn."},   # ~50 belgi / 1s
            {"id": 2, "start": 5.0, "end": 7.0, "text": "Keyingi gap."},
        ]
        cues = sc.build_cues(segs)
        self.assertGreater(cues[0]["end"], 1.0)                     # o'qishga vaqt berildi
        self.assertLessEqual(cues[0]["end"], 5.0 - sc.MIN_GAP_SECONDS + 1e-9)
        self.assertEqual(cues[1]["start"], 5.0)

    def test_min_duration_is_applied_when_space_allows(self):
        cues = sc.build_cues([{"id": 1, "start": 0.0, "end": 0.3, "text": "Ha."}, {"id": 2, "start": 10.0, "end": 11.0, "text": "Yoʻq."}])
        self.assertGreaterEqual(cues[0]["end"] - cues[0]["start"], sc.MIN_CUE_SECONDS - 1e-9)

    def test_overlapping_or_unordered_inputs_never_produce_overlaps(self):
        segs = [
            {"id": 2, "start": 3.0, "end": 6.0, "text": "Ikkinchi gap shu yerda ancha uzun bo'lib ketdi endi."},
            {"id": 1, "start": 0.0, "end": 4.0, "text": "Birinchi gap ikkinchisi bilan ustma-ust tushadi."},
        ]
        assert_well_formed(self, sc.build_cues(segs))

    def test_garbage_input_never_raises(self):
        junk = [None, {}, {"text": "faqat matn"}, {"start": 1, "end": 2, "text": ""}, {"start": "a", "end": "b", "text": "x"},
                {"start": 5, "end": 5, "text": "nol davomiylik"}, {"start": 2, "end": 1, "text": "teskari"}]
        cues = sc.build_cues([j for j in junk if j is not None], [{"start": "z"}, None] and [{"start": "z"}])
        assert_well_formed(self, cues)
        self.assertEqual(sc.build_cues(None), [])
        self.assertEqual(sc.build_cues([]), [])

    def test_long_video_is_fast(self):
        import time
        segs = [{"id": i, "start": i * 5.0, "end": i * 5.0 + 4.5, "text": "Bu oʻrtacha uzunlikdagi tarjima qilingan gap, u ikki qatorga sigʻadi."} for i in range(2500)]
        source = [{"start": i * 5.0, "end": i * 5.0 + 4.5, "words": [{"word": "w", "start": i * 5.0 + 0.2, "end": i * 5.0 + 4.3}]} for i in range(2500)]
        t0 = time.time()
        cues = sc.build_cues(segs, source)
        self.assertLess(time.time() - t0, 3.0)
        self.assertGreaterEqual(len(cues), 2500)


class TestReadingBudgets(unittest.TestCase):
    def test_flags_only_sentences_that_are_too_fast_to_read(self):
        segs = [
            {"id": 1, "start": 0.0, "end": 2.0, "text": "x" * 60},   # 30 belgi/s -> tez
            {"id": 2, "start": 2.0, "end": 6.0, "text": "y" * 60},   # 15 belgi/s -> normal
            {"id": 3, "start": 6.0, "end": 9.0, "text": "z" * 66},   # 22 belgi/s -> qiyin, lekin chegaradan past
        ]
        b = sc.reading_budgets(segs)
        self.assertEqual(list(b), [1])
        self.assertAlmostEqual(b[1], 2.0 * sc.CONDENSE_SLACK)   # yumshoq byudjet: butunlay TTS tezligiga siqilmaydi

    def test_uses_word_refined_window(self):
        # segment oynasi 6s (10 b/s -> normal), lekin haqiqiy nutq atigi 2s (30 b/s -> tez)
        segs = [{"id": 7, "start": 0.0, "end": 6.0, "text": "z" * 60}]
        source = [{"start": 0.0, "end": 6.0, "words": [{"word": "a", "start": 2.0, "end": 4.0}]}]
        self.assertEqual(list(sc.reading_budgets(segs, source)), [7])
        self.assertEqual(sc.reading_budgets(segs), {})

    def test_segments_without_id_or_window_are_ignored(self):
        self.assertEqual(sc.reading_budgets([{"start": 0, "end": 1, "text": "x" * 100}]), {})
        self.assertEqual(sc.reading_budgets(None), {})


class TestFormatting(unittest.TestCase):
    CUES = [{"start": 0.0, "end": 1.9996, "text": "Salom"}, {"start": 3725.5, "end": 3727.0, "text": "Ikki\nqator"}]

    def test_vtt(self):
        vtt = sc.cues_to_vtt(self.CUES)
        self.assertTrue(vtt.startswith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nSalom\n"))
        self.assertIn("2\n01:02:05.500 --> 01:02:07.000\nIkki\nqator\n", vtt)

    def test_srt_uses_comma_and_has_no_header(self):
        srt = sc.cues_to_srt(self.CUES)
        self.assertTrue(srt.startswith("1\n00:00:00,000 --> 00:00:02,000\nSalom\n"))
        self.assertNotIn("WEBVTT", srt)
        self.assertIn("01:02:05,500 --> 01:02:07,000", srt)


class FakeQuery:
    def __init__(self, job): self.job = job
    def filter(self, *a, **k): return self
    def first(self): return self.job


class TestEndpointsUseCues(unittest.TestCase):
    def setUp(self):
        stored = "WEBVTT\n\n1\n00:02:26.000 --> 00:02:32.900\n" + LONG_UZ + "\n"
        self.job = SimpleNamespace(
            id=uuid.uuid4(), video_title="Clip", subtitle_only=True, uzbek_srt_content=stored,
            translated_segments=[{"id": 1, "start": 146.0, "end": 152.9, "text": LONG_UZ}],
            transcript_segments=[{"start": 146.0, "end": 152.9}], translated_text=LONG_UZ,
        )

        class DB:
            def __init__(s, job): s.job = job
            def query(s, *a): return FakeQuery(s.job)
            def close(s): pass

        app.dependency_overrides[get_db] = lambda: DB(self.job)
        self.client = TestClient(app)
        self.addCleanup(lambda: app.dependency_overrides.pop(get_db, None))

    def test_subtitle_job_vtt_and_srt_are_split_into_short_cues(self):
        vtt = self.client.get(f"/api/jobs/{self.job.id}/subtitles.vtt").text
        srt = self.client.get(f"/api/jobs/{self.job.id}/subtitles.srt").text
        self.assertGreater(vtt.count("-->"), 1)
        self.assertGreater(srt.count("-->"), 1)
        self.assertIn(",", srt.split("-->")[0])       # SRT vaqt formati (vergul)
        for line in (vtt + srt).splitlines():
            if "-->" not in line and line and not line.isdigit() and line != "WEBVTT":
                self.assertLessEqual(len(line), sc.MAX_LINE_CHARS)

    def test_dubbing_job_subtitles_are_untouched(self):
        self.job.subtitle_only = False
        vtt = self.client.get(f"/api/jobs/{self.job.id}/subtitles.vtt").text
        self.assertEqual(vtt, self.job.uzbek_srt_content)   # dublyaj audiosi vaqtiga moslangan, tegilmaydi

    def test_endpoint_falls_back_if_cue_building_fails(self):
        from unittest.mock import patch
        with patch.object(sc, "build_cues", side_effect=RuntimeError("boom")):
            r = self.client.get(f"/api/jobs/{self.job.id}/subtitles.vtt")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.text, self.job.uzbek_srt_content)


if __name__ == "__main__":
    unittest.main()
