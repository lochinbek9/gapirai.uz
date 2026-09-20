"""Subtitr eksporti (backend/services/subtitle_export.py): .txt formati va
yuklab olish fayl nomi / Content-Disposition. Toza funksiyalar, DB kerak emas."""
import unittest
import uuid

from backend.services import subtitle_export as se


class TestSegmentsToTxt(unittest.TestCase):
    def test_one_line_per_segment_without_timecodes(self):
        segs = [{"id": 1, "start": 0.0, "end": 2.0, "text": "Salom dunyo"},
                {"id": 2, "start": 2.0, "end": 4.5, "text": "Bu ikkinchi qator"}]
        self.assertEqual(se.segments_to_txt(segs), "Salom dunyo\nBu ikkinchi qator\n")

    def test_blank_and_missing_text_are_skipped_and_whitespace_collapsed(self):
        segs = [{"text": "  bir   ikki \n uch "}, {"text": "   "}, {"id": 3}, {"text": ""}]
        self.assertEqual(se.segments_to_txt(segs), "bir ikki uch\n")

    def test_empty_inputs_give_empty_string(self):
        self.assertEqual(se.segments_to_txt([]), "")
        self.assertEqual(se.segments_to_txt(None), "")

    def test_plain_text_fallback(self):
        self.assertEqual(se.plain_text_fallback("  Yaxlit matn  "), "Yaxlit matn\n")
        self.assertEqual(se.plain_text_fallback(""), "")
        self.assertEqual(se.plain_text_fallback(None), "")


class TestDownloadFilename(unittest.TestCase):
    JOB = uuid.UUID("11111111-2222-3333-4444-555555555555")

    def test_uses_title_as_stem(self):
        self.assertEqual(se.download_filename("My Video", self.JOB, "srt"), "My Video.uz.srt")

    def test_path_and_windows_forbidden_chars_are_removed(self):
        name = se.download_filename('../../etc/pass:wd*?"<>|', self.JOB, "txt")
        for bad in ("/", "\\", ":", "*", "?", '"', "<", ">", "|"):
            self.assertNotIn(bad, name)
        self.assertTrue(name.endswith(".uz.txt"))

    def test_control_chars_and_newlines_cannot_survive(self):
        name = se.download_filename("a\r\nSet-Cookie: x=1\x00b", self.JOB, "vtt")
        self.assertNotIn("\n", name)
        self.assertNotIn("\r", name)
        self.assertNotIn("\x00", name)

    def test_empty_or_junk_title_falls_back_to_job_id(self):
        for title in (None, "", "   ", "...", "///"):
            self.assertEqual(se.download_filename(title, self.JOB, "srt"), f"{self.JOB}.uz.srt")

    def test_long_titles_are_truncated(self):
        name = se.download_filename("x" * 500, self.JOB, "srt")
        self.assertLessEqual(len(name), 80 + len(".uz.srt"))


class TestContentDisposition(unittest.TestCase):
    def test_ascii_filename(self):
        cd = se.content_disposition("My Video.uz.srt")
        self.assertIn('attachment; filename="My Video.uz.srt"', cd)
        self.assertIn("filename*=UTF-8''My%20Video.uz.srt", cd)

    def test_unicode_title_gets_utf8_filename_and_safe_ascii_fallback(self):
        cd = se.content_disposition("Привет дунё.uz.srt")
        self.assertIn("filename*=UTF-8''", cd)
        self.assertIn("%D0%9F", cd)                       # kirillcha to'g'ri kodlangan
        self.assertIn('filename="subtitle.uz.srt"', cd)   # ASCII zaxira: hech narsa qolmagan -> "subtitle"
        cd.encode("ascii")                                # sarlavha faqat ASCII

    def test_quotes_and_crlf_cannot_break_the_header(self):
        cd = se.content_disposition('a"b\r\nX-Evil: 1.uz.srt')
        self.assertNotIn("\r", cd)
        self.assertNotIn("\n", cd)
        self.assertEqual(cd.count('"'), 2)  # faqat filename="..." atrofidagi ikkitasi
        cd.encode("ascii")


if __name__ == "__main__":
    unittest.main()
