"""Admin (Bearer JWT, role=admin + ADMIN_ALLOWED_EMAILS) IP limitidan ozod; qolganlar -- yo'q."""
import unittest
import uuid
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.services import rate_limiter
from backend.services.auth import create_access_token


def _request(token=None, ip="1.2.3.4"):
    req = MagicMock()
    req.headers = {"x-real-ip": ip, **({"authorization": f"Bearer {token}"} if token else {})}
    req.client = None
    return req


class FakeRedis:
    def __init__(self):
        self.counts = {}

    def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, seconds):
        pass

    def ttl(self, key):
        return 60


class RateLimitAdminTest(unittest.TestCase):
    def setUp(self):
        rate_limiter._admin_cache.clear()
        self.redis = FakeRedis()
        p = patch.object(rate_limiter, "_get_redis", return_value=self.redis)
        p.start()
        self.addCleanup(p.stop)
        self.dep = rate_limiter.rate_limit("create_job", 2, 600)

    def hit(self, req, n):
        for _ in range(n):
            self.dep(req)

    def test_admin_token_is_not_limited_and_lookup_cached(self):
        token = create_access_token(str(uuid.uuid4()), "lochinbeksetor@gmail.com")
        with patch.object(rate_limiter, "_lookup_admin", return_value=True) as lookup:
            self.hit(_request(token), 10)
        self.assertEqual(self.redis.counts, {})
        lookup.assert_called_once()

    def test_regular_user_and_anonymous_are_limited(self):
        token = create_access_token(str(uuid.uuid4()), "u@t.uz")
        with patch.object(rate_limiter, "_lookup_admin", return_value=False):
            self.hit(_request(token), 2)
            with self.assertRaises(HTTPException) as ctx:
                self.dep(_request(token))
        self.assertEqual(ctx.exception.status_code, 429)
        self.hit(_request(ip="5.6.7.8"), 2)
        with self.assertRaises(HTTPException):
            self.dep(_request(ip="5.6.7.8"))

    def test_api_key_and_invalid_tokens_are_not_exempt(self):
        api_token = create_access_token({"sub": str(uuid.uuid4()), "typ": "api"})
        with patch.object(rate_limiter, "_lookup_admin", return_value=True) as lookup:
            self.assertFalse(rate_limiter._is_admin_request(_request(api_token)))
            self.assertFalse(rate_limiter._is_admin_request(_request("not-a-jwt")))
        lookup.assert_not_called()

    def test_admin_check_error_falls_back_to_normal_limit(self):
        token = create_access_token(str(uuid.uuid4()), "a@t.uz")
        with patch.object(rate_limiter, "_lookup_admin", side_effect=RuntimeError("db down")):
            self.hit(_request(token), 2)
            with self.assertRaises(HTTPException):
                self.dep(_request(token))


if __name__ == "__main__":
    unittest.main()
