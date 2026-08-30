"""E-2 regression: backend/services/click_service.py::validate_signature() fail-closed.

Bag: CLICK_SECRET_KEY bo'sh bo'lsa payload_str = f"...{secret_key}..." bo'sh
satr bilan qurilardi, ya'ni imzo FAQAT ommaviy maydonlar MD5'i bo'lardi.
So'rovchi o'sha maydonlarni o'zi yuborayotgani uchun "to'g'ri" sign_string'ni
o'zi hisoblab, har qanday /prepare + /complete webhook'ini o'tkaza olardi
-> istalgan Payment'ni APPROVED qilish (bepul obuna/dublyaj/kutubxona).

Fix: `if not secret_key: return False` (validate_signature boshida).
Mavjud imzo semantikasi o'zgarmaydi -- faqat bo'sh kalit endi fail-closed.
"""
import hashlib
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend.services.click_service import validate_signature, ClickErrors

REAL_KEY = "test-secret-abc123"


def _base(action) -> dict:
    return {
        "click_trans_id": "12345",
        "service_id": "108780",
        "merchant_trans_id": "abc-payment-id",
        "amount": "23000",
        "action": str(action),
        "sign_time": "2026-08-28 03:00:00",
        "merchant_prepare_id": "999",
    }


def _sign(p: dict, secret_key: str) -> str:
    """click_service.validate_signature bilan bir xil formula (prepare/complete)."""
    if str(p["action"]) == "1":
        s = (f'{p["click_trans_id"]}{p["service_id"]}{secret_key}{p["merchant_trans_id"]}'
             f'{p.get("merchant_prepare_id", "")}{p["amount"]}{p["action"]}{p["sign_time"]}')
    else:
        s = (f'{p["click_trans_id"]}{p["service_id"]}{secret_key}{p["merchant_trans_id"]}'
             f'{p["amount"]}{p["action"]}{p["sign_time"]}')
    return hashlib.md5(s.encode("utf-8")).hexdigest()


class TestValidateSignatureFailClosed(unittest.TestCase):
    def test_empty_secret_rejects_even_with_self_computed_md5(self):
        # Aynan hujjum: secret_key="" bilan MD5 hisoblanib yuboriladi.
        p = _base(0)
        p["sign_string"] = _sign(p, "")
        self.assertFalse(validate_signature(p, ""))

    def test_empty_secret_rejects_complete_too(self):
        p = _base(1)
        p["sign_string"] = _sign(p, "")
        self.assertFalse(validate_signature(p, ""))

    def test_none_secret_rejects(self):
        p = _base(0)
        p["sign_string"] = "deadbeef"
        self.assertFalse(validate_signature(p, None))


class TestValidateSignatureBehaviorUnchanged(unittest.TestCase):
    """Fix mavjud xatti-harakatni buzmasligi kerak."""

    def test_valid_prepare_signature_true(self):
        p = _base(0)
        p["sign_string"] = _sign(p, REAL_KEY)
        self.assertTrue(validate_signature(p, REAL_KEY))

    def test_valid_complete_signature_true(self):
        p = _base(1)
        p["sign_string"] = _sign(p, REAL_KEY)
        self.assertTrue(validate_signature(p, REAL_KEY))

    def test_valid_complete_without_merchant_prepare_id_true(self):
        # merchant_prepare_id yo'q -> prep_str = "" (validate_signature mantiqi)
        p = _base(1)
        p.pop("merchant_prepare_id")
        p["sign_string"] = _sign(p, REAL_KEY)
        self.assertTrue(validate_signature(p, REAL_KEY))

    def test_tampered_amount_false(self):
        p = _base(0)
        p["sign_string"] = _sign(p, REAL_KEY)
        p["amount"] = "1"  # imzolangandan keyin o'zgartirildi
        self.assertFalse(validate_signature(p, REAL_KEY))

    def test_wrong_secret_false(self):
        p = _base(0)
        p["sign_string"] = _sign(p, "some-other-key")
        self.assertFalse(validate_signature(p, REAL_KEY))

    def test_missing_sign_string_false(self):
        p = _base(0)  # sign_string umuman yo'q
        self.assertFalse(validate_signature(p, REAL_KEY))

    def test_missing_amount_false(self):
        p = _base(0)
        p["sign_string"] = _sign(p, REAL_KEY)
        del p["amount"]
        self.assertFalse(validate_signature(p, REAL_KEY))

    def test_sign_string_case_insensitive(self):
        p = _base(0)
        p["sign_string"] = _sign(p, REAL_KEY).upper()
        self.assertTrue(validate_signature(p, REAL_KEY))


class TestClickWebhookEndpointsFailClosed(unittest.TestCase):
    """Endpoint darajasi: bo'sh CLICK_SECRET_KEY + forged imzo -> APPROVED bo'lmaydi."""

    def setUp(self):
        from fastapi.testclient import TestClient
        from backend.main import app
        self.client = TestClient(app)

    def _forged_form(self, action) -> dict:
        p = _base(action)
        p["sign_string"] = _sign(p, "")  # kalitsiz "imzo"
        return p

    @patch("backend.api.click_routes.get_settings")
    def test_prepare_rejects_forged_signature_when_secret_empty(self, mock_get_settings):
        mock_get_settings.return_value = SimpleNamespace(CLICK_SECRET_KEY="")
        r = self.client.post("/api/payments/click/prepare", data=self._forged_form(0))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("error"), ClickErrors.SIGN_CHECK_FAILED)

    @patch("backend.services.payment_fulfillment.apply_successful_payment")
    @patch("backend.api.click_routes.get_settings")
    def test_complete_does_not_fulfill_forged_when_secret_empty(self, mock_get_settings, mock_apply):
        mock_get_settings.return_value = SimpleNamespace(CLICK_SECRET_KEY="")
        r = self.client.post("/api/payments/click/complete", data=self._forged_form(1))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json().get("error"), ClickErrors.SIGN_CHECK_FAILED)
        mock_apply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
