"""Login/register yo'lining qotish xavflarini yopuvchi o'zgarishlar:
  * bcrypt darvozasi (BcryptGate) -- parallelligini cheklaydi, ortig'ini darhol rad etadi;
  * DB ulanishi bcrypt VA tashqi chaqiruv (Resend/SMS) paytida band turmaydi;
  * 503 handler.
Bazaga ulanmaydi -- session mock, tartib chaqiruvlar ro'yxati orqali tekshiriladi."""
import asyncio
import json
import threading
import time
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.api import auth_routes
from backend.services import auth
from backend.services.auth import AuthBusyError, BcryptGate


class TestBcryptGate(unittest.TestCase):
    def test_excess_requests_rejected_immediately_and_slots_released(self):
        gate = BcryptGate(active=1, waiting=1)
        started, release = threading.Event(), threading.Event()
        results = []

        def slow():
            started.set()
            release.wait(5)
            return "ok"

        def worker():
            results.append(gate.run(slow))

        t1 = threading.Thread(target=worker); t1.start()
        self.assertTrue(started.wait(2))                 # 1-si "active" o'rinni egalladi
        t2 = threading.Thread(target=worker); t2.start() # 2-si qabul qilindi, active o'rinni kutmoqda
        time.sleep(0.15)

        t0 = time.perf_counter()
        with self.assertRaises(AuthBusyError):           # 3-si: kutish navbati to'la -> KUTMASDAN rad
            gate.run(lambda: "x")
        self.assertLess(time.perf_counter() - t0, 0.5)

        release.set(); t1.join(2); t2.join(2)
        self.assertEqual(results, ["ok", "ok"])
        self.assertEqual(gate.run(lambda: 7), 7)         # o'rinlar qaytarilgan

    def test_exception_inside_fn_releases_slots(self):
        gate = BcryptGate(active=1, waiting=0)
        with self.assertRaises(ZeroDivisionError):
            gate.run(lambda: 1 / 0)
        self.assertEqual(gate.run(lambda: "still works"), "still works")

    def test_real_hash_and_verify_roundtrip_through_gate(self):
        h = auth.hash_password("secret-123")
        self.assertTrue(h.startswith("$2"))
        self.assertTrue(auth.verify_password("secret-123", h))
        self.assertFalse(auth.verify_password("wrong", h))


class TestAuthBusyHandler(unittest.TestCase):
    def test_returns_503_with_retry_after(self):
        from backend.main import auth_busy_handler
        resp = asyncio.run(auth_busy_handler(MagicMock(), AuthBusyError()))
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.headers["retry-after"], "5")
        self.assertIn("juda ko'p", json.loads(resp.body)["detail"])


def _db(user, calls):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user
    db.rollback.side_effect = lambda: calls.append("rollback")
    db.close.side_effect = lambda: calls.append("close")
    return db


class TestLoginFlow(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.user = SimpleNamespace(id="u1", password_hash="HASH", email="a@b.co", name="Ali", is_verified=True)

    def _patches(self, verify=True):
        c = self.calls
        return (
            patch.object(auth_routes, "verify_password", side_effect=lambda p, h: c.append("bcrypt") or verify),
            patch.object(auth_routes, "create_access_token", side_effect=lambda data: c.append("jwt") or "TOKEN123"),
        )

    def _login(self, user=None, **kw):
        db = _db(self.user if user is None else user, self.calls)
        p1, p2 = self._patches(**kw)
        with p1, p2:
            return auth_routes.login(auth_routes.LoginRequest(email="A@B.co", password="secret"), db)

    def test_direct_login_returns_token_without_email_code(self):
        r = self._login()
        self.assertEqual(self.calls, ["rollback", "bcrypt", "jwt"])
        self.assertEqual(r.access_token, "TOKEN123")
        self.assertEqual(r.user["email"], "a@b.co")

    def test_unknown_user_404_without_bcrypt(self):
        db = _db(None, self.calls)
        p1, p2 = self._patches()
        with p1, p2, self.assertRaises(HTTPException) as cm:
            auth_routes.login(auth_routes.LoginRequest(email="x@y.z", password="p"), db)
        self.assertEqual(cm.exception.status_code, 404)
        self.assertNotIn("bcrypt", self.calls)

    def test_wrong_password_401(self):
        with self.assertRaises(HTTPException) as cm:
            self._login(verify=False)
        self.assertEqual(cm.exception.status_code, 401)
        self.assertNotIn("jwt", self.calls)

    def test_google_only_account_without_password_is_401_not_a_crash(self):
        google_only = SimpleNamespace(id="g1", password_hash=None, email="g@b.co", name="G", is_verified=True)
        with self.assertRaises(HTTPException) as cm:
            self._login(user=google_only)
        self.assertEqual(cm.exception.status_code, 401)
        self.assertNotIn("bcrypt", self.calls)


class TestRegisterAndResend(unittest.TestCase):
    def test_register_existing_email_400_without_bcrypt(self):
        calls = []
        db = _db(SimpleNamespace(id=1), calls)  # mavjud user topildi
        with patch.object(auth_routes, "hash_password", side_effect=lambda p: calls.append("hash") or "H"):
            with self.assertRaises(HTTPException) as cm:
                auth_routes.register(auth_routes.RegisterRequest(name="N", email="a@b.co", password="secret1"), db)
        self.assertEqual(cm.exception.status_code, 400)
        self.assertNotIn("hash", calls)

    def test_register_hashes_outside_transaction_and_closes_before_email(self):
        calls = []
        db = _db(None, calls)  # mavjud user yo'q
        with patch.object(auth_routes, "hash_password", side_effect=lambda p: calls.append("hash") or "H"), \
             patch.object(auth_routes, "_issue_code", side_effect=lambda u, d: calls.append("issue") or "654321"), \
             patch.object(auth_routes, "send_verification_email",
                          side_effect=lambda e, c, n: calls.append(f"email:{e}:{c}:{n}") or True):
            r = auth_routes.register(
                auth_routes.RegisterRequest(name="  Vali ", email=" New@B.CO ", password="secret1"), db)
        self.assertEqual(calls, ["rollback", "hash", "issue", "close", "email:new@b.co:654321:Vali"])
        self.assertEqual(r.email, "new@b.co")

    def test_resend_and_forgot_close_before_email(self):
        for fn, req_cls, mail in (
            (auth_routes.resend_code, auth_routes.ResendCodeRequest, "send_verification_email"),
            (auth_routes.forgot_password, auth_routes.ForgotPasswordRequest, "send_password_reset_email"),
        ):
            calls = []
            db = _db(SimpleNamespace(email="a@b.co", name="Ali"), calls)
            with patch.object(auth_routes, "_issue_code", side_effect=lambda u, d: calls.append("issue") or "111111"), \
                 patch.object(auth_routes, mail, side_effect=lambda e, c, n: calls.append("email") or True):
                r = fn(req_cls(email="A@B.co"), db)
            self.assertEqual(calls, ["issue", "close", "email"], fn.__name__)
            self.assertEqual(r.email, "a@b.co")


if __name__ == "__main__":
    unittest.main()
