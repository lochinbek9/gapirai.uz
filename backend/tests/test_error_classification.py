"""Tests for backend/services/error_classification.py -- the single source
of truth for YouTube-ingestion error classification, retry policy, safe
user-facing messages, and secret scrubbing (2026-08-26 ingestion audit,
Priority 1/4/5/6/9)."""
import unittest

from backend.services import error_classification as ec


class TestClassifyText(unittest.TestCase):
    def test_auth_error_sign_in_to_confirm(self):
        self.assertEqual(ec.classify_text("ERROR: [youtube] Sign in to confirm you're not a bot"), ec.AUTH_ERROR)

    def test_auth_error_stale_cookies(self):
        self.assertEqual(ec.classify_text("The provided YouTube account cookies are no longer valid"), ec.AUTH_ERROR)

    def test_auth_error_wins_over_bare_403(self):
        # A bot-check message can legitimately also mention "403" -- AUTH_ERROR
        # must win, not the generic HTTP_403 bucket.
        self.assertEqual(
            ec.classify_text("HTTP Error 403: Forbidden -- Sign in to confirm you're not a bot"),
            ec.AUTH_ERROR,
        )

    def test_http_403_alone_is_not_auth_error(self):
        # 2026-08-26 audit: a bare 403 must NOT be treated as a bot-check/
        # auth signal -- that was the bug that caused blind proxy escalation
        # for problems a proxy can't fix.
        self.assertEqual(ec.classify_text("HTTP Error 403: Forbidden"), ec.HTTP_403)

    def test_http_429(self):
        self.assertEqual(ec.classify_text("HTTP Error 429: Too Many Requests"), ec.HTTP_429)

    def test_proxy_billing_error(self):
        self.assertEqual(ec.classify_text("HTTP Error 402: Payment Required (proxy)"), ec.PROXY_BILLING_ERROR)

    def test_po_token_required(self):
        self.assertEqual(ec.classify_text("Some formats are missing a valid PO Token"), ec.PO_TOKEN_REQUIRED)

    def test_video_unavailable_private(self):
        self.assertEqual(ec.classify_text("ERROR: Private video. Sign in if you've been granted access"), ec.VIDEO_UNAVAILABLE)

    def test_video_unavailable_removed(self):
        self.assertEqual(ec.classify_text("This video has been removed by the uploader"), ec.VIDEO_UNAVAILABLE)

    def test_extractor_error(self):
        self.assertEqual(ec.classify_text("ERROR: Requested format is not available"), ec.EXTRACTOR_ERROR)

    def test_network_error(self):
        self.assertEqual(ec.classify_text("[Errno 111] Connection reset by peer"), ec.NETWORK_ERROR)

    def test_proxy_error(self):
        self.assertEqual(ec.classify_text("ProxyError: Unable to connect to proxy"), ec.PROXY_ERROR)

    def test_timeout(self):
        self.assertEqual(ec.classify_text("urlopen error timed out"), ec.TIMEOUT)

    def test_upstream_error(self):
        self.assertEqual(ec.classify_text("HTTP Error 503: Service Unavailable"), ec.UPSTREAM_ERROR)

    def test_unknown_fallback(self):
        self.assertEqual(ec.classify_text("some completely novel failure mode"), ec.UNKNOWN)

    def test_classify_error_wraps_exception(self):
        self.assertEqual(ec.classify_error(RuntimeError("Sign in to confirm you're not a bot")), ec.AUTH_ERROR)


class TestRetryPolicy(unittest.TestCase):
    def test_auth_error_never_retries(self):
        self.assertFalse(ec.should_retry(ec.AUTH_ERROR))

    def test_video_unavailable_never_retries(self):
        self.assertFalse(ec.should_retry(ec.VIDEO_UNAVAILABLE))

    def test_proxy_billing_error_never_retries(self):
        # A provider that's out of balance ("402 Payment Required") will
        # still be out of balance 30 seconds later -- retrying just burns
        # the bounded retry budget for a guaranteed-identical failure.
        self.assertFalse(ec.should_retry(ec.PROXY_BILLING_ERROR))

    def test_network_error_retries(self):
        self.assertTrue(ec.should_retry(ec.NETWORK_ERROR))

    def test_timeout_retries(self):
        self.assertTrue(ec.should_retry(ec.TIMEOUT))

    def test_proxy_error_retries(self):
        self.assertTrue(ec.should_retry(ec.PROXY_ERROR))

    def test_http_429_retries(self):
        self.assertTrue(ec.should_retry(ec.HTTP_429))

    def test_http_403_retries_bounded(self):
        # HTTP_403 gets the existing bounded retry, not a special no-retry
        # rule -- it just no longer auto-escalates to a residential proxy.
        self.assertTrue(ec.should_retry(ec.HTTP_403))

    def test_unknown_retries(self):
        self.assertTrue(ec.should_retry(ec.UNKNOWN))


class TestResidentialProxyEscalation(unittest.TestCase):
    def test_escalates_on_genuine_auth_error(self):
        self.assertTrue(ec.should_escalate_to_residential_proxy(RuntimeError("Sign in to confirm you're not a bot")))

    def test_does_not_escalate_on_bare_403(self):
        # This is the exact behavior the 2026-08-26 audit asked to stop --
        # "do not automatically interpret every 403 as a proxy problem".
        self.assertFalse(ec.should_escalate_to_residential_proxy(RuntimeError("HTTP Error 403: Forbidden")))

    def test_does_not_escalate_on_format_not_available(self):
        self.assertFalse(ec.should_escalate_to_residential_proxy(RuntimeError("Requested format is not available")))

    def test_does_not_escalate_on_network_error(self):
        self.assertFalse(ec.should_escalate_to_residential_proxy(RuntimeError("Connection reset by peer")))


class TestSafeUserMessages(unittest.TestCase):
    _ALL_CODES = [
        ec.AUTH_ERROR, ec.HTTP_403, ec.HTTP_429, ec.EXTRACTOR_ERROR, ec.PO_TOKEN_REQUIRED,
        ec.VIDEO_UNAVAILABLE, ec.NETWORK_ERROR, ec.PROXY_ERROR, ec.PROXY_BILLING_ERROR,
        ec.UPSTREAM_ERROR, ec.TIMEOUT, ec.UNKNOWN,
    ]

    def test_every_known_code_has_a_message(self):
        for code in self._ALL_CODES:
            msg = ec.safe_user_message(code)
            self.assertIsInstance(msg, str)
            self.assertGreater(len(msg), 0)

    def test_unrecognized_code_falls_back_to_unknown_message(self):
        self.assertEqual(ec.safe_user_message("SOMETHING_NEW"), ec.SAFE_USER_MESSAGES[ec.UNKNOWN])

    def test_no_message_contains_operator_instructions(self):
        # The literal bug this audit fixed: end users must never be told to
        # "re-export cookies.txt" or perform any server-side maintenance.
        banned_substrings = ("cookies.txt", "incognito", "export", "upload", "server")
        for code in self._ALL_CODES:
            msg = ec.safe_user_message(code).lower()
            for banned in banned_substrings:
                self.assertNotIn(banned, msg, f"{code}'s user message leaks operator instructions: {msg!r}")

    def test_auth_error_message_matches_audit_spec(self):
        self.assertEqual(ec.safe_user_message(ec.AUTH_ERROR), "Videoni olish uchun kerakli ruxsat mavjud emas.")

    def test_video_unavailable_message_matches_audit_spec(self):
        self.assertEqual(ec.safe_user_message(ec.VIDEO_UNAVAILABLE), "Bu video mavjud emas yoki unga kirish cheklangan.")

    def test_http_429_message_matches_audit_spec(self):
        self.assertEqual(ec.safe_user_message(ec.HTTP_429), "YouTube vaqtincha so'rovlarni chekladi. Birozdan keyin qayta urinib ko'ring.")

    def test_po_token_message_matches_audit_spec(self):
        self.assertEqual(ec.safe_user_message(ec.PO_TOKEN_REQUIRED), "Bu video hozirgi kirish usuli bilan mavjud emas.")

    def test_unknown_message_matches_audit_spec(self):
        self.assertEqual(ec.safe_user_message(ec.UNKNOWN), "Videoni hozircha qayta ishlay olmadik.")


class TestScrubSecrets(unittest.TestCase):
    def test_scrubs_proxy_url_credentials(self):
        text = "ProxyError: Unable to connect to proxy http://myuser:s3cr3tPass@p.webshare.io:8080"
        out = ec.scrub_secrets(text)
        self.assertNotIn("myuser", out)
        self.assertNotIn("s3cr3tPass", out)
        self.assertIn("<redacted>", out)
        self.assertIn("p.webshare.io", out)  # host is fine to keep, only credentials redacted

    def test_scrubs_bearer_token(self):
        text = "request failed: Authorization: Bearer sk-abcdef1234567890xyz"
        out = ec.scrub_secrets(text)
        self.assertNotIn("sk-abcdef1234567890xyz", out)

    def test_scrubs_cookie_header(self):
        text = 'headers={"Cookie": "SID=abcd1234efgh5678ijkl; HSID=zzzz9999yyyy8888"}'
        out = ec.scrub_secrets(text)
        self.assertNotIn("abcd1234efgh5678ijkl", out)

    def test_scrubs_api_key(self):
        text = "request failed with api_key=AIzaSyD1234567890abcdefGHIJKL"
        out = ec.scrub_secrets(text)
        self.assertNotIn("AIzaSyD1234567890abcdefGHIJKL", out)

    def test_leaves_plain_text_unchanged(self):
        text = "Requested format is not available"
        self.assertEqual(ec.scrub_secrets(text), text)

    def test_empty_string_is_noop(self):
        self.assertEqual(ec.scrub_secrets(""), "")

    def test_scrubbing_survives_full_classification_round_trip(self):
        # Realistic combined case: a proxy failure whose message embeds the
        # full authenticated proxy URL, as urllib3/requests sometimes emit.
        raw = "requests.exceptions.ProxyError: HTTPSConnectionPool: Unable to connect to proxy, tunnel connection failed: http://evkznxig-rotate:REALPASSWORD123@p.webshare.io:80"
        scrubbed = ec.scrub_secrets(raw)
        self.assertNotIn("REALPASSWORD123", scrubbed)
        self.assertNotIn("evkznxig-rotate", scrubbed)
        # And classification still works on the scrubbed text.
        self.assertEqual(ec.classify_text(scrubbed), ec.PROXY_ERROR)


if __name__ == "__main__":
    unittest.main()
