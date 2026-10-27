"""TTS_PROVIDER_OVERRIDE -- hamma job'ni bitta provayderga o'tkazish (2026-10-27).

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_tts_override
"""
import unittest
from types import SimpleNamespace
from unittest import mock

from backend.services import plans, synthesizer


class TTSOverrideTest(unittest.TestCase):
    def provider(self, override, job_choice="gemini"):
        fake = SimpleNamespace(TTS_PROVIDER_OVERRIDE=override)
        with mock.patch("backend.config.get_settings", return_value=fake):
            return plans.get_tts_provider_for_job(db=None, job=SimpleNamespace(tts_provider=job_choice, user_id=None))

    def test_override_wins_over_job_choice(self):
        self.assertEqual(self.provider("Azure "), "azure")
        self.assertEqual(self.provider(""), "gemini")

    def test_free_mode_uses_edge_unless_overridden(self):
        cases = [((True, ""), True), ((True, "azure"), False), ((False, ""), False), ((False, "azure"), False)]
        for (free, override), expected in cases:
            with mock.patch.object(synthesizer.settings, "FREE_MODE", free), \
                 mock.patch.object(synthesizer.settings, "TTS_PROVIDER_OVERRIDE", override):
                self.assertEqual(synthesizer._free_tts(), expected, (free, override))


if __name__ == "__main__":
    unittest.main()
