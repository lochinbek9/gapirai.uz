"""BYOK: shifrlash, kalit tanlanishi va API (SQLite, tarmoqsiz)."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api import byok_routes as routes
from backend.models.byok import ByokSetting
from backend.services import byok, gemini_quota_manager as gqm, groq_service

GEMINI, GROQ = "test-gemini-key-000000", "gsk_test_groq_key_000000"


class ByokTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        ByokSetting.__table__.create(engine)
        self.db = sessionmaker(bind=engine, expire_on_commit=False)()
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.addCleanup(byok.deactivate)

    def _put(self, ok=True, **kw):
        with patch.object(routes, "check_key", return_value=ok):
            return routes.update_byok(routes.ByokUpdate(**kw), self.db, self.user)

    def test_stored_encrypted_and_never_returned(self):
        view = self._put(gemini=GEMINI, enabled=True)
        self.assertEqual(view["providers"]["gemini"], ["••••0000"])
        self.assertNotIn(GEMINI, self.db.get(ByokSetting, self.user.id).gemini_keys)
        self.assertEqual(byok.load_keys(self.db, self.user.id), {"gemini": [GEMINI]})

    def test_disabled_or_removed_means_system_keys(self):
        self._put(gemini=GEMINI, enabled=True)
        self._put(enabled=False)
        self.assertEqual(byok.load_keys(self.db, self.user.id), {})
        self._put(enabled=True)
        self.assertFalse(self._put(gemini="")["enabled"])

    def test_bad_or_missing_key_rejected(self):
        with self.assertRaises(HTTPException):
            self._put(ok=False, gemini=GEMINI)
        with self.assertRaises(HTTPException):
            self._put(enabled=True)

    def test_job_owner_activates(self):
        self._put(gemini=GEMINI, enabled=True)
        job = SimpleNamespace(user_id=self.user.id)
        session = SimpleNamespace(close=lambda: None, get=lambda model, key:
                                  self.db.get(model, key) if model is ByokSetting else job)
        with patch.object(byok, "SessionLocal", return_value=session):
            byok.activate_for_job(str(uuid.uuid4()))
        self.assertEqual(byok.active_keys("gemini"), [GEMINI])
        self.assertIsNone(byok.active_keys("groq"))

    def test_only_own_keys_are_counted(self):
        byok._ACTIVE["gemini"], byok._OWNER = [GEMINI], "u1"
        with patch.object(byok, "_redis") as redis:
            byok.count_request("gemini", "system-key")
            redis.assert_not_called()
            byok.count_request("gemini", GEMINI)
        self.assertIn("byok_req:u1:gemini:", redis.return_value.incr.call_args.args[0])

    def test_active_keys_replace_system_keys(self):
        byok._ACTIVE.update({"gemini": [GEMINI], "groq": [GROQ]})
        self.assertEqual(gqm.get_all_gemini_api_keys(), [GEMINI])
        self.assertEqual(gqm.get_paid_gemini_api_keys(), [])
        for paid in (True, False):
            self.assertEqual(gqm.get_gemini_keys_for_request(is_paid=paid), [GEMINI])
        self.assertEqual(groq_service.get_all_groq_api_keys(), [GROQ])
        byok.deactivate()
        self.assertNotIn(GEMINI, gqm.get_all_gemini_api_keys())


if __name__ == "__main__":
    unittest.main()
