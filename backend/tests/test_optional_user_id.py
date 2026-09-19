"""get_optional_user_id -- GET /jobs/{id} polling'i User SELECT'siz egalikni
tekshirishi uchun (bazaga umuman tegmaydi, shuning uchun DB kerak emas)."""
import unittest
import uuid

from fastapi.security import HTTPAuthorizationCredentials

from backend.services.auth import create_access_token, get_optional_user_id


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


class TestGetOptionalUserId(unittest.TestCase):
    def test_no_credentials_is_anonymous(self):
        self.assertIsNone(get_optional_user_id(None))

    def test_valid_token_returns_uuid(self):
        uid = uuid.uuid4()
        tok = create_access_token(str(uid), "a@b.co")
        self.assertEqual(get_optional_user_id(_creds(tok)), uid)

    def test_garbage_token_is_anonymous(self):
        self.assertIsNone(get_optional_user_id(_creds("not-a-jwt")))

    def test_token_with_non_uuid_subject_is_anonymous(self):
        tok = create_access_token("not-a-uuid", "a@b.co")
        self.assertIsNone(get_optional_user_id(_creds(tok)))


if __name__ == "__main__":
    unittest.main()
