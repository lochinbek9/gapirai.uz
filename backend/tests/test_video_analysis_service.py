"""VideoAnalysisService.generate_five_minute_summary()'ning LLM javobini
tozalash/tekshirish mantig'i uchun testlar -- fayl docstringida yozilgan
xavfsizlik qoidasiga mos (LLM javobidagi maydonlar hech qachon ko'r-ko'rona
ishonib olinmaydi, har doim tekshiriladi/tozalanadi)."""
import unittest
from unittest.mock import patch

from backend.services import video_analysis
from backend.services.video_analysis import VideoAnalysisService


_SEGMENTS = [{"start": 0.0, "end": 5.0, "text": "Salom"}, {"start": 5.0, "end": 300.0, "text": "davomi"}]


class TestGenerateFiveMinuteSummary(unittest.TestCase):
    def setUp(self):
        self.service = VideoAnalysisService()

    @patch.object(video_analysis, "_call_json")
    def test_well_formed_response_passes_through(self, mock_call_json):
        mock_call_json.return_value = {
            "title": "Mavzu",
            "why_it_matters": "Muhim, chunki...",
            "core_ideas": ["G'oya 1", "G'oya 2"],
            "examples": ["Misol 1"],
            "takeaways": ["Xulosa 1"],
            "key_terms": [{"term": "API", "explanation": "..."}],
            "remember": "Eng muhimi shu.",
        }
        result = self.service.generate_five_minute_summary(_SEGMENTS, 300.0, "uz")
        self.assertEqual(result["title"], "Mavzu")
        self.assertEqual(result["core_ideas"], ["G'oya 1", "G'oya 2"])
        self.assertEqual(result["key_terms"], [{"term": "API", "explanation": "..."}])
        self.assertEqual(result["remember"], "Eng muhimi shu.")

    @patch.object(video_analysis, "_call_json")
    def test_non_dict_response_returns_safe_defaults(self, mock_call_json):
        mock_call_json.return_value = "not a dict"
        result = self.service.generate_five_minute_summary(_SEGMENTS, 300.0, "uz")
        self.assertEqual(result["title"], "")
        self.assertEqual(result["core_ideas"], [])
        self.assertEqual(result["key_terms"], [])

    @patch.object(video_analysis, "_call_json")
    def test_lists_are_clamped_to_max_length(self, mock_call_json):
        mock_call_json.return_value = {
            "core_ideas": [f"idea {i}" for i in range(50)],
            "key_terms": [{"term": f"t{i}", "explanation": "x"} for i in range(50)],
        }
        result = self.service.generate_five_minute_summary(_SEGMENTS, 300.0, "uz")
        self.assertLessEqual(len(result["core_ideas"]), 10)
        self.assertLessEqual(len(result["key_terms"]), 12)

    @patch.object(video_analysis, "_call_json")
    def test_malformed_list_items_are_dropped_or_coerced(self, mock_call_json):
        mock_call_json.return_value = {
            "core_ideas": ["real idea", "", None, 123],
            "key_terms": [{"term": "ok", "explanation": "yes"}, {"no_term": "skip me"}, "not a dict"],
        }
        result = self.service.generate_five_minute_summary(_SEGMENTS, 300.0, "uz")
        # bo'sh/None satrlar tashlab yuboriladi, raqamlar str()ga aylantiriladi
        self.assertIn("real idea", result["core_ideas"])
        self.assertNotIn("", result["core_ideas"])
        self.assertNotIn(None, result["core_ideas"])
        # faqat "term" maydoni bor va dict bo'lgan elementlar saqlanadi
        self.assertEqual(result["key_terms"], [{"term": "ok", "explanation": "yes"}])

    @patch.object(video_analysis, "_call_json")
    def test_core_ideas_not_a_list_returns_empty(self, mock_call_json):
        mock_call_json.return_value = {"core_ideas": "should be a list, not a string"}
        result = self.service.generate_five_minute_summary(_SEGMENTS, 300.0, "uz")
        self.assertEqual(result["core_ideas"], [])


if __name__ == "__main__":
    unittest.main()
