"""STT tilga qarab yo'naltirish, Groq zaxiralari va NeuronAI balans ogohlantirishi (2026-11-21).
Tarmoq va Redis mock -- hech qanday tashqi so'rov yo'q."""
import json
import unittest
from unittest.mock import MagicMock, patch

from backend.services import content_safety, provider_balance, transcriber, translator


class BalanceAlertTest(unittest.TestCase):
    def _resp(self, balance):
        return MagicMock(status_code=200, json=lambda: {"data": {"balance": balance}})

    def test_low_balance_alerts_high_does_not(self):
        with patch.object(provider_balance.settings, "NEURONAI_API_KEY", "nai_x"), \
             patch.object(provider_balance.settings, "NEURONAI_BALANCE_ALERT_UZS", 5000.0), \
             patch.object(provider_balance, "_alert") as alert:
            with patch("httpx.get", return_value=self._resp(1200.5)):
                self.assertEqual(provider_balance.check_balances(), 1200.5)
            alert.assert_called_once()
            self.assertIn("1,200", alert.call_args.args[0])
            alert.reset_mock()
            with patch("httpx.get", return_value=self._resp(80000)):
                provider_balance.check_balances()
            alert.assert_not_called()

    def test_maybe_check_runs_only_when_claimed(self):
        with patch.object(provider_balance.settings, "NEURONAI_API_KEY", "nai_x"), \
             patch.object(provider_balance, "check_balances") as check:
            with patch.object(provider_balance, "_claim", return_value=False):
                provider_balance.maybe_check_balances()
            check.assert_not_called()
            with patch.object(provider_balance, "_claim", return_value=True):
                provider_balance.maybe_check_balances()
            check.assert_called_once()

    def test_bad_response_is_none_and_never_raises(self):
        with patch.object(provider_balance.settings, "NEURONAI_API_KEY", "nai_x"), \
             patch("httpx.get", side_effect=RuntimeError("down")):
            self.assertIsNone(provider_balance.check_balances())

    def test_out_of_credits_alert(self):
        with patch("backend.services.telegram_notify.send_alert_to_admins") as send:
            provider_balance.report_out_of_credits("neuronai")
        self.assertEqual(send.call_args.kwargs["alert_key"], "provider_out_of_credits:neuronai")


class SttRoutingTest(unittest.TestCase):
    RESULT_EN = {"text": "hi", "segments": [{"start": 0, "end": 1, "text": "hi"}], "srt": "", "language": "english"}
    RESULT_UZ = {"text": "salom", "segments": [{"start": 0, "end": 1, "text": "salom"}], "srt": "", "language": "uzbek"}

    def setUp(self):
        for name, value in (("FREE_MODE", True),):
            p = patch.object(transcriber.settings, name, value)
            p.start()
            self.addCleanup(p.stop)
        p = patch.object(transcriber, "_groq_stt_available", return_value=True)
        p.start()
        self.addCleanup(p.stop)

    def test_groq_primary_skips_local_whisper(self):
        with patch.object(transcriber, "_transcribe_local_whisper") as local, \
             patch.object(transcriber, "_transcribe_via_api", return_value=self.RESULT_EN) as api:
            out = transcriber.transcribe_audio("a.wav", language=None, primary="groq")
        local.assert_not_called()
        self.assertEqual(api.call_args.args[2], "groq")
        self.assertEqual(out["language"], "english")

    def test_uzbek_speech_from_groq_is_redone_on_neuronai(self):
        with patch.object(transcriber, "_transcribe_via_api", side_effect=[self.RESULT_UZ, {**self.RESULT_UZ, "text": "salom!"}]) as api, \
             patch.object(transcriber, "is_neuronai_stt_available", return_value=True):
            out = transcriber.transcribe_audio("a.wav", language=None, primary="groq")
        self.assertEqual([c.args[1:3] for c in api.call_args_list], [(None, "groq"), ("uz", "neuronai")])
        self.assertEqual(out["text"], "salom!")

    def test_neuronai_failure_keeps_groq_result(self):
        with patch.object(transcriber, "_transcribe_via_api", side_effect=[self.RESULT_UZ, RuntimeError("402")]), \
             patch.object(transcriber, "is_neuronai_stt_available", return_value=True):
            out = transcriber.transcribe_audio("a.wav", language=None, primary="groq")
        self.assertEqual(out["text"], "salom")


class SafetyFallbackTest(unittest.TestCase):
    def test_neuronai_402_goes_to_groq_not_gemini(self):
        with patch.object(content_safety.settings, "CONTENT_SAFETY_ENABLED", True), \
             patch.object(content_safety.settings, "NEURONAI_AUX_LLM_ENABLED", True), \
             patch.object(content_safety.settings, "NEURONAI_API_KEY", "nai_x"), \
             patch.object(content_safety, "_neuronai_safety_check", side_effect=RuntimeError("402")), \
             patch("backend.services.groq_service.is_groq_available", return_value=True), \
             patch("backend.services.groq_service.groq_chat_completion",
                   return_value=(json.dumps({"is_prohibited": False}), "gsk...x")) as groq, \
             patch.object(content_safety, "_gemini_safety_check") as gemini:
            res = content_safety.check_safety("A lecture about machine learning.")
        self.assertTrue(res.allowed)
        groq.assert_called_once()
        gemini.assert_not_called()


class GroqStrictTranslationTest(unittest.TestCase):
    SEGS = [{"id": i, "start": float(i), "end": i + 1.0, "text": f"line {i}"} for i in range(1, 5)]

    def test_merged_segments_are_split_and_retried(self):
        calls = []

        def fake(messages, **kw):
            instruction = messages[1]["content"]
            batch = [s for s in self.SEGS if f'"id": {s["id"]},' in instruction]
            calls.append(len(batch))
            if len(batch) > 2:  # LLM bo'lakni birlashtirib yubordi -- bitta segment kam
                batch = batch[:-1]
            return json.dumps({"segments": [{"id": s["id"], "text": f"qator {s['id']}"} for s in batch]}), "gsk...x"

        with patch("backend.services.groq_service.groq_chat_completion", side_effect=fake):
            out = translator._translate_chunk_groq(self.SEGS, self.SEGS)
        self.assertEqual([o["text"] for o in out], ["qator 1", "qator 2", "qator 3", "qator 4"])
        self.assertEqual([o["start"] for o in out], [1.0, 2.0, 3.0, 4.0])
        self.assertEqual(calls[0], 4)


if __name__ == "__main__":
    unittest.main()
