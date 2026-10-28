"""Saytga Telegram orqali kirish (Login Widget) -- imzo va /auth/telegram.

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_telegram_login
"""
import hashlib
import hmac
import time
import unittest
import uuid

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api import auth_routes
from backend.config import get_settings
from backend.models.database import Base, User
from backend.services.telegram_login import TelegramLoginError, bot_id_from_token, verify_login


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


TOKEN = "123456789:AAFakeTokenForTestsOnly_xyz"


def signed(token=TOKEN, **fields):
    """Telegram widget'i qaytaradigan ma'lumot -- haqiqiy algoritm bilan imzolangan."""
    data = {"id": 555000111, "first_name": "Alisher", "last_name": "Navoiy", "username": "alisher",
            "auth_date": int(time.time())}
    data.update(fields)
    data = {k: v for k, v in data.items() if v is not None}
    check = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    data["hash"] = hmac.new(hashlib.sha256(token.encode()).digest(), check.encode(), hashlib.sha256).hexdigest()
    return data


class VerifyTest(unittest.TestCase):
    def test_valid_payload(self):
        self.assertEqual(verify_login(signed(), TOKEN)["id"], "555000111")

    def test_optional_fields_absent(self):
        verify_login(signed(last_name=None, username=None), TOKEN)

    def test_tampered_field_rejected(self):
        data = signed()
        data["id"] = 1
        with self.assertRaises(TelegramLoginError):
            verify_login(data, TOKEN)

    def test_other_bot_token_rejected(self):
        with self.assertRaises(TelegramLoginError):
            verify_login(signed(token="999:other"), TOKEN)

    def test_expired_and_future_rejected(self):
        for delta in (-(25 * 3600), 3600):
            with self.assertRaises(TelegramLoginError):
                verify_login(signed(auth_date=int(time.time()) + delta), TOKEN)

    def test_no_token_configured(self):
        with self.assertRaises(TelegramLoginError):
            verify_login(signed(), "")

    def test_bot_id(self):
        self.assertEqual(bot_id_from_token(TOKEN), 123456789)
        self.assertIsNone(bot_id_from_token(""))


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables["users"]])
        self.db = sessionmaker(bind=self.engine)()
        self.settings = get_settings()
        self._token = self.settings.TELEGRAM_BOT_TOKEN
        self.settings.TELEGRAM_BOT_TOKEN = TOKEN

    def tearDown(self):
        self.settings.TELEGRAM_BOT_TOKEN = self._token
        self.db.close()
        self.engine.dispose()

    def login(self, **fields):
        return auth_routes.telegram_auth(auth_routes.TelegramLoginRequest(**signed(**fields)), db=self.db)

    def test_new_user_then_same_user(self):
        first = self.login()
        self.assertTrue(first.access_token)
        self.assertEqual(first.user["name"], "Alisher Navoiy")
        user = self.db.query(User).one()
        self.assertEqual((user.telegram_chat_id, user.auth_provider, user.is_verified), ("555000111", "telegram", True))
        second = self.login(first_name="Boshqa ism")
        self.assertEqual(second.user["id"], first.user["id"])
        self.assertEqual(self.db.query(User).count(), 1)

    def test_existing_bot_user_is_reused(self):
        u = User(id=uuid.uuid4(), name="Bot foydalanuvchi", telegram_chat_id="555000111", phone="+998901234567",
                 auth_provider="phone", is_verified=True)
        self.db.add(u)
        self.db.commit()
        self.assertEqual(self.login().user["id"], str(u.id))

    def test_name_fallbacks(self):
        self.assertEqual(self.login(id=1, first_name=None, last_name=None, username="zz").user["name"], "@zz")
        self.assertEqual(self.login(id=2, first_name=None, last_name=None, username=None).user["name"], "Telegram 2")

    def test_bad_signature_401_and_inactive_403(self):
        data = signed()
        data["first_name"] = "Hacker"
        with self.assertRaises(HTTPException) as e:
            auth_routes.telegram_auth(auth_routes.TelegramLoginRequest(**data), db=self.db)
        self.assertEqual(e.exception.status_code, 401)
        self.db.add(User(id=uuid.uuid4(), name="x", telegram_chat_id="777", is_active=False, auth_provider="telegram"))
        self.db.commit()
        with self.assertRaises(HTTPException) as e:
            self.login(id=777)
        self.assertEqual(e.exception.status_code, 403)

    def test_config(self):
        self.assertEqual(auth_routes.telegram_login_config(), {"enabled": True, "bot_id": 123456789, "bot_username": "gapirai_uz_bot"})
        self.settings.TELEGRAM_BOT_TOKEN = ""
        self.assertEqual(auth_routes.telegram_login_config(), {"enabled": False})


if __name__ == "__main__":
    unittest.main()
