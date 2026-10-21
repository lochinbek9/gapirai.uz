"""Tests for Gemini primary and Azure secondary provider configuration for TTS and STT across all plans."""
import unittest
from unittest.mock import MagicMock, patch

from backend.config import get_settings
from backend.services import plans
from backend.services.tts.factory import get_provider, get_fallback_provider
from backend.services.tts.gemini_provider import GeminiProvider
from backend.services.tts.azure_provider import AzureProvider
from backend.services.transcriber import _transcribe_provider_order

settings = get_settings()


class TestGeminiAzureProviderConfig(unittest.TestCase):
    def test_settings_defaults(self):
        """Verify default settings configured for Gemini 1st and Azure 2nd."""
        self.assertEqual(settings.TTS_PROVIDER, "gemini")
        self.assertEqual(settings.TTS_FALLBACK_PROVIDER, "azure")
        self.assertEqual(settings.STT_PROVIDER, "gemini")
        self.assertEqual(settings.STT_FALLBACK_PROVIDER, "azure")

    def test_all_plans_have_gemini_tts(self):
        """All tiers in plans.PLANS must have tts_tier set to 'gemini'."""
        for plan_id, plan_def in plans.PLANS.items():
            self.assertEqual(
                plan_def.tts_tier,
                "gemini",
                f"Plan '{plan_id}' should have tts_tier='gemini', got '{plan_def.tts_tier}'",
            )

    def test_get_tts_provider_for_job(self):
        """get_tts_provider_for_job must return 'gemini' for all jobs."""
        mock_db = MagicMock()

        # Anonymous job
        job_anon = MagicMock()
        job_anon.user_id = None
        self.assertEqual(plans.get_tts_provider_for_job(mock_db, job_anon), "gemini")

        # Free tier job
        job_free = MagicMock()
        job_free.user_id = 101
        self.assertEqual(plans.get_tts_provider_for_job(mock_db, job_free), "gemini")

        # Pro tier job
        job_pro = MagicMock()
        job_pro.user_id = 102
        self.assertEqual(plans.get_tts_provider_for_job(mock_db, job_pro), "gemini")

    def test_tts_factory_returns_gemini_and_azure(self):
        """Factory get_provider() must return Gemini and get_fallback_provider() must return Azure."""
        primary = get_provider()
        self.assertIsInstance(primary, GeminiProvider)
        self.assertEqual(primary.name, "gemini")

        fallback = get_fallback_provider()
        self.assertIsInstance(fallback, AzureProvider)
        self.assertEqual(fallback.name, "azure")

    def test_stt_provider_order_gemini_first_azure_second(self):
        """_transcribe_provider_order('gemini') must place Gemini 1st and Azure 2nd."""
        with patch.object(settings, "GEMINI_API_KEY", "mock-key"), \
             patch.object(settings, "AZURE_SPEECH_KEY", "mock-azure-key"), \
             patch.object(settings, "OPENAI_API_KEY", "mock-openai-key"):
            order = _transcribe_provider_order("gemini")
            self.assertGreaterEqual(len(order), 2)
            self.assertEqual(order[0], "gemini", "Gemini must be first in STT order")
            self.assertIn("azure", order, "Azure must be in STT order")


if __name__ == "__main__":
    unittest.main()
