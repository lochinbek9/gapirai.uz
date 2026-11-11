"""NeuronAI LLM: spiker jinsini aniqlash (tasks._detect_gender) va kontent xavfsizligi
(content_safety.check_safety) -- NEURONAI_AUX_LLM_ENABLED bilan avval NeuronAI, xatoda avvalgi zanjir."""
import unittest
from unittest.mock import patch

from backend.services import content_safety, neuronai_llm
from backend.services.content_safety import settings
from backend.workers import tasks


class AuxLLMTest(unittest.TestCase):
    def setUp(self):
        for name, value in (("NEURONAI_API_KEY", "nai_test"), ("NEURONAI_AUX_LLM_ENABLED", True),
                            ("CONTENT_SAFETY_ENABLED", True), ("TRANSLATE_PROVIDER", "gemini"), ("GEMINI_API_KEY", "g")):
            p = patch.object(settings, name, value)
            p.start()
            self.addCleanup(p.stop)

    def test_gender_uses_neuronai(self):
        for answer, expected in (("**Female**", "female"), ("male", "male"), ("Male.", "male")):
            with patch.object(neuronai_llm, "chat_text", return_value=answer) as chat:
                self.assertEqual(tasks._detect_gender("Men o'zim qildim", "Madina vlog"), expected)
            self.assertIn("Madina vlog", chat.call_args.args[0][1]["content"])

    def test_gender_falls_back_when_neuronai_fails(self):
        with patch.object(neuronai_llm, "chat_text", side_effect=RuntimeError("402")), \
             patch("backend.services.gemini_quota_manager.get_all_gemini_api_keys", return_value=[]), \
             patch.object(settings, "OPENAI_API_KEY", ""):
            self.assertEqual(tasks._detect_gender("text"), "male")  # avvalgi zanjirning standart javobi

    def test_safety_prohibited_via_neuronai(self):
        data = {"is_prohibited": True, "category": "sexual_explicit", "reason_uz": "18+ kontent"}
        with patch.object(neuronai_llm, "chat_json", return_value=data), \
             patch.object(content_safety, "_gemini_safety_check") as gemini:
            res = content_safety.check_safety("some transcript")
        self.assertFalse(res.allowed)
        self.assertEqual((res.category, res.reason), ("sexual_explicit", "18+ kontent"))
        gemini.assert_not_called()

    def test_safety_allowed_and_unknown_category(self):
        with patch.object(neuronai_llm, "chat_json", return_value={"is_prohibited": False}):
            self.assertTrue(content_safety.check_safety("vlog").allowed)
        with patch.object(neuronai_llm, "chat_json", return_value={"is_prohibited": "true", "category": "weird"}):
            res = content_safety.check_safety("x")
        self.assertEqual((res.allowed, res.category), (False, "policy_violation"))

    def test_safety_falls_back_to_existing_chain(self):
        with patch.object(neuronai_llm, "chat_json", side_effect=RuntimeError("timeout")), \
             patch.object(content_safety, "_gemini_safety_check", return_value=content_safety.SafetyResult(allowed=True)) as gemini:
            self.assertTrue(content_safety.check_safety("x").allowed)
        gemini.assert_called_once()

    def test_flag_off_does_not_call_neuronai(self):
        with patch.object(settings, "NEURONAI_AUX_LLM_ENABLED", False), \
             patch.object(neuronai_llm, "chat_json") as chat, \
             patch.object(content_safety, "_gemini_safety_check", return_value=content_safety.SafetyResult(allowed=True)):
            content_safety.check_safety("x")
        chat.assert_not_called()


if __name__ == "__main__":
    unittest.main()
