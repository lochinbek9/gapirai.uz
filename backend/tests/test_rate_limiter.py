"""backend/services/rate_limiter.py — client IP aniqlash (P1 XFF bypass fix).

Topologiya (prod pre-check bilan tasdiqlangan): client -> nginx -> uvicorn,
Cloudflare YO'Q, backend :8000 tashqaridan yopiq.

Client yuboradigan X-Forwarded-For ning ENG CHAP qiymati soxtalashtirilishi
mumkin edi -> har so'rovda yangi rate-limit bucket. Endi:
  X-Real-IP  ->  X-Forwarded-For ENG O'NG qiymat  ->  request.client.host

Bu testlar FAQAT yangi xatti-harakatni muzlatadi (eski chap-XFF yo'li uchun
test YO'Q).
"""
import inspect
import re
import unittest
from unittest.mock import patch

from starlette.datastructures import Address, Headers
from starlette.requests import Request

from backend.services import rate_limiter
from backend.services.rate_limiter import _client_ip, rate_limit


def _req(headers: dict | None = None, client_host: str | None = "10.0.0.9") -> Request:
    """Minimal soxta Request — faqat .headers va .client kerak."""
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    scope = {
        "type": "http",
        "headers": raw,
        "client": (client_host, 12345) if client_host else None,
    }
    return Request(scope)


class TestClientIpResolution(unittest.TestCase):
    def test_1_x_real_ip_is_used(self):
        self.assertEqual(_client_ip(_req({"X-Real-IP": "203.0.113.7"})), "203.0.113.7")

    def test_2_x_real_ip_wins_over_spoofed_left_xff(self):
        r = _req({
            "X-Real-IP": "203.0.113.7",
            "X-Forwarded-For": "6.6.6.6, 203.0.113.7",  # 6.6.6.6 = hujjum qiluvchi da'vosi
        })
        self.assertEqual(_client_ip(r), "203.0.113.7")

    def test_3_rightmost_xff_when_no_x_real_ip(self):
        r = _req({"X-Forwarded-For": "9.9.9.9, 8.8.8.8, 203.0.113.7"})
        self.assertEqual(_client_ip(r), "203.0.113.7")

    def test_4_attacker_ip_then_real_client_ip(self):
        # nginx: X-Forwarded-For = "<client da'vosi>, <haqiqiy peer>"
        r = _req({"X-Forwarded-For": "attacker-ip, real-client-ip"})
        self.assertEqual(_client_ip(r), "real-client-ip")

    def test_5_falls_back_to_request_client_host(self):
        self.assertEqual(_client_ip(_req({}, client_host="10.0.0.9")), "10.0.0.9")

    def test_5b_unknown_when_no_client_and_no_headers(self):
        self.assertEqual(_client_ip(_req({}, client_host=None)), "unknown")

    def test_6_empty_x_real_ip_falls_through_to_xff(self):
        r = _req({"X-Real-IP": "   ", "X-Forwarded-For": "1.1.1.1, 203.0.113.7"})
        self.assertEqual(_client_ip(r), "203.0.113.7")

    def test_6b_empty_x_real_ip_and_empty_xff_falls_through_to_client(self):
        r = _req({"X-Real-IP": "  ", "X-Forwarded-For": " , ,  "}, client_host="10.0.0.9")
        self.assertEqual(_client_ip(r), "10.0.0.9")

    def test_single_xff_entry(self):
        self.assertEqual(_client_ip(_req({"X-Forwarded-For": "203.0.113.7"})), "203.0.113.7")

    def test_header_lookup_is_case_insensitive(self):
        # Starlette Headers case-insensitive; kod lowercase kalit ishlatadi
        h = Headers({"x-real-ip": "203.0.113.7"})
        self.assertEqual(h.get("X-Real-IP"), "203.0.113.7")
        self.assertEqual(_client_ip(_req({"x-real-ip": "203.0.113.7"})), "203.0.113.7")


class _FakeRedis:
    """Dict-backed — qaysi kalit oshirilganini aniq ko'rish uchun."""

    def __init__(self):
        self.counts: dict[str, int] = {}
        self.expires: dict[str, int] = {}

    def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, secs):
        self.expires[key] = secs

    def ttl(self, key):
        return self.expires.get(key, -1)


class TestRateLimitKeysByResolvedIp(unittest.TestCase):
    def setUp(self):
        self.fake = _FakeRedis()
        self._p = patch.object(rate_limiter, "_get_redis", return_value=self.fake)
        self._p.start()
        self.dep = rate_limit("xfftest", max_requests=2, window_seconds=600)

    def tearDown(self):
        self._p.stop()

    def _hit(self, headers):
        # dependency HTTPException ko'tarsa -> 429
        try:
            self.dep(_req(headers))
            return 200
        except Exception as exc:  # HTTPException
            return getattr(exc, "status_code", 500)

    def test_7_same_resolved_ip_shares_bucket(self):
        h = {"X-Real-IP": "203.0.113.7"}
        self.assertEqual(self._hit(h), 200)  # 1
        self.assertEqual(self._hit(h), 200)  # 2
        self.assertEqual(self._hit(h), 429)  # 3 -> limit
        self.assertEqual(self.fake.counts["ratelimit:xfftest:203.0.113.7"], 3)

    def test_7b_spoofed_left_xff_cannot_split_the_bucket(self):
        # Bir xil X-Real-IP, LEKIN har safar boshqa soxta chap-XFF -> baribir bitta bucket
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "1.1.1.1"}), 200)
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "2.2.2.2"}), 200)
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "3.3.3.3"}), 429)
        self.assertEqual(list(self.fake.counts.keys()), ["ratelimit:xfftest:203.0.113.7"])

    def test_8_different_resolved_ip_gets_own_bucket(self):
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7"}), 200)
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7"}), 200)
        self.assertEqual(self._hit({"X-Real-IP": "203.0.113.7"}), 429)
        # boshqa IP -> toza bucket
        self.assertEqual(self._hit({"X-Real-IP": "198.51.100.4"}), 200)
        self.assertEqual(self.fake.counts["ratelimit:xfftest:198.51.100.4"], 1)


class TestRedisFailOpenUnchanged(unittest.TestCase):
    def test_9_redis_unavailable_is_fail_open(self):
        dep = rate_limit("xfftest_down", max_requests=1, window_seconds=600)
        with patch.object(rate_limiter, "_get_redis", side_effect=ConnectionError("redis down")):
            # bir necha marta -> hech qachon 429 emas (fail-open saqlanadi)
            for _ in range(5):
                self.assertIsNone(dep(_req({"X-Real-IP": "203.0.113.7"})))

    def test_9b_redis_incr_error_is_fail_open(self):
        dep = rate_limit("xfftest_err", max_requests=1, window_seconds=600)

        class _Boom:
            def incr(self, *a):
                raise RuntimeError("boom")

        with patch.object(rate_limiter, "_get_redis", return_value=_Boom()):
            for _ in range(5):
                self.assertIsNone(dep(_req({"X-Real-IP": "203.0.113.7"})))


class TestRateLimitValuesUnchanged(unittest.TestCase):
    """Regression: fix _client_ip'dan tashqarida hech narsani o'zgartirmadi —
    18 endpoint limitlari muzlatiladi."""

    _EXPECTED = {
        ("register", 5, 600), ("login", 10, 600), ("verify_code", 10, 600),
        ("google_auth", 20, 600), ("phone_request_code", 3, 600),
        ("phone_verify_code", 10, 600), ("resend_code", 5, 600),
        ("forgot_password", 5, 600), ("reset_password", 10, 600),
        ("video_info", 20, 600), ("create_job", 8, 600), ("upload_video", 10, 600),
        ("library", 60, 600), ("platform_feedback", 10, 600), ("feedback", 20, 600),
        ("video_analysis_create", 8, 600), ("video_analysis_question", 20, 600),
        ("learn", 8, 600),
    }

    def test_10_all_endpoint_limits_frozen(self):
        from backend.api import auth_routes, learn_routes, video_analysis_routes
        from backend.api import routes as api_routes

        pat = re.compile(r'rate_limit\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*\)')
        found = set()
        for mod in (auth_routes, api_routes, video_analysis_routes, learn_routes):
            for m in pat.finditer(inspect.getsource(mod)):
                found.add((m.group(1), int(m.group(2)), int(m.group(3))))
        self.assertEqual(found, self._EXPECTED)


if __name__ == "__main__":
    unittest.main()
