"""_detect_gender: Gemini kalitlari kutishda bo'lsa uzoq urinmasdan tushadi (2026-10-27).

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_detect_gender_fast_fail
"""
import unittest
from unittest import mock

from backend.workers import tasks


class FakeModels:
    def __init__(self):
        self.calls = 0

    def generate_content(self, **kw):
        self.calls += 1
        raise RuntimeError("402 prepayment credits are depleted")


class DetectGenderFastFailTest(unittest.TestCase):
    def setUp(self):
        self.models = FakeModels()
        client = mock.Mock(models=self.models)
        patches = [
            mock.patch.object(tasks.settings, "GEMINI_API_KEY", "k0"),
            mock.patch.object(tasks.settings, "TRANSLATE_PROVIDER", "gemini"),
            mock.patch.object(tasks.settings, "OPENAI_API_KEY", ""),
            mock.patch("backend.services.gemini_quota_manager.get_all_gemini_api_keys", return_value=[f"k{i}" for i in range(35)]),
            mock.patch("backend.services.translator._get_gemini_client", return_value=client),
            mock.patch("backend.services.translator._gemini_text_model", return_value="gemini-x"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_tries_at_most_three_keys_then_defaults_to_male(self):
        with mock.patch("backend.services.gemini_quota_manager.is_model_available", return_value=(True, 0.0)):
            self.assertEqual(tasks._detect_gender("hello", "title"), "male")
        self.assertEqual(self.models.calls, 3)

    def test_skips_keys_in_cooldown(self):
        with mock.patch("backend.services.gemini_quota_manager.is_model_available", return_value=(False, 1200.0)):
            self.assertEqual(tasks._detect_gender("hello", "title"), "male")
        self.assertEqual(self.models.calls, 0)


if __name__ == "__main__":
    unittest.main()
