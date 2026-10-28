"""Shaxsiy API kalitlar (Premiere plagini uchun).

    DATABASE_URL=sqlite:///... python -m unittest backend.tests.test_api_keys
"""
import unittest
import uuid

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api import api_key_routes as routes
from backend.models.database import ApiKey, Base, User
from backend.services import auth


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


def bearer(token):
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class ApiKeyTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables[n] for n in ("users", "api_keys")])
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(id=uuid.uuid4(), email="a@t.uz", name="A", is_verified=True, is_active=True, role="admin")
        self.db.add(self.user)
        self.db.commit()
        # record_user_activity Postgres'ga xos SQL yozadi -- bu testga aloqasi yo'q
        self._activity = auth.record_user_activity
        auth.record_user_activity = lambda db, user: None

    def tearDown(self):
        auth.record_user_activity = self._activity
        self.db.close()
        self.engine.dispose()

    def login(self, token):
        return auth.get_current_user(credentials=bearer(token), db=self.db)

    def test_key_authenticates_until_revoked(self):
        web = self.login(auth.create_access_token(self.user.id, self.user.email))
        created = routes.create_api_key(routes.CreateKeyRequest(name="Premiere"), db=self.db, user=web)
        self.assertNotIn("token", routes.list_api_keys(db=self.db, user=web)["keys"][0])

        via_key = self.login(created["token"])
        self.assertEqual(via_key.id, self.user.id)
        self.assertIsNotNone(self.db.get(ApiKey, uuid.UUID(created["id"])).last_used_at)

        routes.revoke_api_key(uuid.UUID(created["id"]), db=self.db, user=self.login(auth.create_access_token(self.user.id)))
        with self.assertRaises(HTTPException) as e:
            self.login(created["token"])
        self.assertEqual(e.exception.status_code, 401)

    def test_key_cannot_reach_admin_or_manage_keys(self):
        web = self.login(auth.create_access_token(self.user.id))
        token = routes.create_api_key(routes.CreateKeyRequest(), db=self.db, user=web)["token"]
        via_key = self.login(token)
        for call in (
            lambda: auth.get_current_admin_user(current_user=via_key),
            lambda: routes.create_api_key(routes.CreateKeyRequest(), db=self.db, user=via_key),
            lambda: routes.list_api_keys(db=self.db, user=via_key),
        ):
            with self.assertRaises(HTTPException) as e:
                call()
            self.assertEqual(e.exception.status_code, 403)

    def test_forged_key_id_is_rejected(self):
        forged = auth.create_api_key_token(self.user.id, uuid.uuid4())   # bazada yo'q kalit
        with self.assertRaises(HTTPException):
            self.login(forged)

    def test_active_key_limit(self):
        web = self.login(auth.create_access_token(self.user.id))
        for _ in range(routes.MAX_ACTIVE_KEYS):
            routes.create_api_key(routes.CreateKeyRequest(), db=self.db, user=web)
        with self.assertRaises(HTTPException) as e:
            routes.create_api_key(routes.CreateKeyRequest(), db=self.db, user=web)
        self.assertEqual(e.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
