"""Gemini kalitlar tartibi: standart holatda BARCHA so'rovlar pullik kalitdan
boshlanadi (bepul kalitlar ~20 so'rov/kun bilan tez tugab, 429 + qayta
urinishlar dublyajni sekinlashtirardi). GEMINI_PAID_KEYS_FIRST_FOR_ALL=False
eski tartibni qaytaradi."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.services import gemini_quota_manager as gqm

PAID = ["paid-key-aaaaaaaaaaaa", "paid-key-bbbbbbbbbbbb"]
FREE = ["free-key-111111111111", "free-key-222222222222", "free-key-333333333333"]


class TestGeminiKeyOrder(unittest.TestCase):
    def _order(self, is_paid, paid_first=True, allow_paid_fallback=True):
        with patch.object(gqm, "get_paid_gemini_api_keys", return_value=list(PAID)), \
                patch.object(gqm, "get_free_gemini_api_keys", return_value=list(FREE)), \
                patch.object(gqm, "get_settings", return_value=SimpleNamespace(GEMINI_PAID_KEYS_FIRST_FOR_ALL=paid_first)):
            return gqm.get_gemini_keys_for_request(is_paid=is_paid, allow_paid_fallback=allow_paid_fallback)

    def test_paid_request_uses_paid_keys_first(self):
        self.assertEqual(self._order(is_paid=True), PAID + FREE)

    def test_free_request_also_uses_paid_keys_first_by_default(self):
        self.assertEqual(self._order(is_paid=False), PAID + FREE)

    def test_flag_off_restores_free_first_order(self):
        self.assertEqual(self._order(is_paid=False, paid_first=False), FREE + PAID)

    def test_no_paid_fallback_means_free_only(self):
        self.assertEqual(self._order(is_paid=False, allow_paid_fallback=False), FREE)


if __name__ == "__main__":
    unittest.main()
