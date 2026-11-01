"""Hujjat tahlili (backend/services/document_extract.py) va uzun material
konspekti / savol-javob uchun mos parchalar (backend/services/video_analysis.py)."""
import io
import unittest
import zipfile
from unittest.mock import patch

from backend.services import document_extract, video_analysis
from backend.services.document_extract import DocumentError, extract_document, guess_language, pages_to_segments
from backend.services.video_analysis import VideoAnalysisService, _format_transcript, _relevant_lines, needs_digests


def _zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()


W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'


def _docx(paragraphs: list[str]) -> bytes:
    body = "".join(f"<w:p><w:r><w:t>{p}</w:t></w:r></w:p>" for p in paragraphs)
    return _zip({"word/document.xml": f"<w:document {W}><w:body>{body}</w:body></w:document>"})


def _pdf(page_texts: list[str]) -> bytes:
    """Matnli (yoki bo'sh -- skanerlangan kabi) betlardan iborat minimal PDF."""
    from pypdf import PdfWriter
    from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

    writer = PdfWriter()
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    for text in page_texts:
        page = writer.add_blank_page(width=600, height=800)
        if text:
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode())
            page[NameObject("/Resources")] = DictionaryObject({
                NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)}),
            })
            page[NameObject("/Contents")] = writer._add_object(stream)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


class TestExtract(unittest.TestCase):
    def test_pdf_text_pages_and_scanned_pages_marked_for_ocr(self):
        text = "Fotosintez - o'simliklar quyosh nuridan energiya oladigan jarayon."
        res = extract_document(_pdf([text, "", text]), "kitob.pdf")
        self.assertEqual(res["unit"], "bet")
        self.assertEqual(len(res["pages"]), 3)
        self.assertIn("Fotosintez", res["pages"][0])
        self.assertEqual(res["ocr_pages"], [2])

    def test_docx_paragraphs_become_parts(self):
        res = extract_document(_docx(["Birinchi bo'lim.", "Ikkinchi bo'lim."]), "Hisobot.DOCX")
        self.assertEqual(res["unit"], "qism")
        self.assertEqual(res["pages"], ["Birinchi bo'lim.\nIkkinchi bo'lim."])
        self.assertEqual(res["ocr_pages"], [])

    def test_long_text_split_into_parts_without_losing_text(self):
        para = "Bu juda muhim gap. " * 40
        text = "\n\n".join([para] * 20)
        res = extract_document(text.encode("utf-8"), "matn.txt")
        self.assertGreater(len(res["pages"]), 3)
        self.assertTrue(all(len(p) <= document_extract.CHARS_PER_PART for p in res["pages"]))
        self.assertEqual(sum(p.count("muhim") for p in res["pages"]), 800)

    def test_txt_cp1251_fallback(self):
        res = extract_document("Привет, мир".encode("cp1251"), "ru.txt")
        self.assertIn("Привет", res["pages"][0])

    def test_pptx_slides_in_numeric_order(self):
        slide = lambda t: f"<p:sld {A}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
        data = _zip({"ppt/slides/slide10.xml": slide("O'n"), "ppt/slides/slide2.xml": slide("Ikki"), "ppt/slides/slide1.xml": slide("Bir")})
        res = extract_document(data, "deck.pptx")
        self.assertEqual(res["unit"], "slayd")
        self.assertEqual(res["pages"], ["Bir", "Ikki", "O'n"])

    def test_epub_spine_order_and_html_stripped(self):
        data = _zip({
            "META-INF/container.xml": '<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>',
            "OEBPS/book.opf": '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest>'
                              '<spine><itemref idref="b"/><itemref idref="a"/></spine></package>',
            "OEBPS/a.xhtml": "<html><body><p>Ikkinchi bob</p></body></html>",
            "OEBPS/b.xhtml": "<html><head><style>p{}</style></head><body><h1>Birinchi bob</h1><p>Matn</p></body></html>",
        })
        text = extract_document(data, "kitob.epub")["pages"][0]
        self.assertLess(text.index("Birinchi"), text.index("Ikkinchi"))
        self.assertNotIn("p{}", text)

    def test_unsupported_and_broken_files(self):
        with self.assertRaises(DocumentError):
            extract_document(b"x", "rasm.jpg")
        with self.assertRaises(DocumentError):
            extract_document(b"not a zip", "buzuq.docx")
        with self.assertRaises(DocumentError):
            extract_document(b"%PDF-1.4 garbage", "buzuq.pdf")

    def test_segments_carry_page_and_unit(self):
        segs = pages_to_segments(["Birinchi bet", "", "Uchinchi bet"], "bet")
        self.assertEqual([s["page"] for s in segs], [1, 3])
        self.assertEqual(segs[1]["start"], 3.0)
        self.assertEqual(segs[0]["unit"], "bet")

    def test_guess_language(self):
        self.assertEqual(guess_language("Bu kitob o'zbek tilida yozilgan va u bilan ishlash uchun kerak bo'lgan qo'llanma. " * 5), "uz")
        self.assertEqual(guess_language("Это книга о том, как работает память человека. " * 5), "ru")
        self.assertEqual(guess_language("This book explains how human memory works in practice. " * 5), "en")


class TestLongMaterial(unittest.TestCase):
    def _segments(self, n: int, doc: bool = False) -> list[dict]:
        segs = []
        for i in range(n):
            text = f"Gap raqami {i}: oddiy mazmun haqida batafsil so'zlar " * 3
            seg = {"start": float(i * 10), "end": float(i * 10 + 9), "text": text}
            if doc:
                seg.update(start=float(i // 10 + 1), end=float(i // 10 + 1), page=i // 10 + 1, unit="bet")
            segs.append(seg)
        return segs

    def test_document_labels_use_pages(self):
        material = _format_transcript(self._segments(5, doc=True))
        self.assertIn("[1-bet]", material)
        self.assertNotIn("00:", material)

    def test_long_material_uses_digests_instead_of_dropping_lines(self):
        segs = self._segments(400)
        self.assertTrue(needs_digests(segs))
        digests = [{"label": "00:00 – 66:30", "digest": "KONSPEKT-MATNI"}]
        material = _format_transcript(segs, digests=digests)
        self.assertIn("KONSPEKT-MATNI", material)

    @patch.object(video_analysis, "_call_json", return_value={"digest": "[01:00] qisqa"})
    def test_build_digests_covers_every_chunk(self, call):
        segs = self._segments(400)
        digests = VideoAnalysisService().build_digests(segs, "uz", chunk_chars=10000)
        self.assertGreater(len(digests), 3)
        self.assertEqual(call.call_count, len(digests))
        self.assertEqual(digests[0]["start"], 0.0)
        self.assertEqual(digests[-1]["end"], segs[-1]["end"])

    @patch.object(video_analysis, "_call_json", side_effect=RuntimeError("limit"))
    def test_build_digests_survives_llm_failure(self, _call):
        digests = VideoAnalysisService().build_digests(self._segments(400), "uz", chunk_chars=10000)
        self.assertTrue(all(d["digest"] for d in digests))

    def test_relevant_lines_find_late_passage(self):
        segs = self._segments(400)
        segs[380]["text"] = "Mitoxondriyalar hujayraning energiya stansiyasi hisoblanadi."
        lines = _relevant_lines(segs, "Mitoxondriya nima?", max_chars=2000)
        self.assertTrue(any("Mitoxondriyalar" in l for l in lines))
        self.assertTrue(any(l.startswith("[01:03:20]") for l in lines))

    @patch.object(video_analysis, "_call_json", return_value={"answer": "Javob", "timestamps": [3800]})
    def test_answer_question_sends_matching_passage_for_long_material(self, call):
        segs = self._segments(400)
        segs[380]["text"] = "Mitoxondriyalar hujayraning energiya stansiyasi hisoblanadi."
        VideoAnalysisService().answer_question(segs, "Mitoxondriya haqida nima deyilgan?", digests=[{"label": "x", "digest": "umumiy"}])
        sent = call.call_args.args[1]
        self.assertIn("Mitoxondriyalar", sent)
        self.assertIn("umumiy", sent)


if __name__ == "__main__":
    unittest.main()
