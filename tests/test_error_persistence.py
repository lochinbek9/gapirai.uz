"""Tests that a raw exception (potentially containing proxy credentials)
never reaches a persisted/API-visible error_message field -- the exact
leak path confirmed by the 2026-08-26 ingestion audit (GET /jobs/{id} is
intentionally unauthenticated, a shareable-link pattern, so anything
written to job.error_message is effectively public)."""
import unittest

from backend.services.errors import PermanentError
from backend.services import error_classification as ec
from backend.workers.tasks import _safe_persisted_error, _error_code_for


_CREDENTIAL_LEAK_EXC = RuntimeError(
    "requests.exceptions.ProxyError: HTTPSConnectionPool: Unable to connect to proxy, "
    "tunnel connection failed: http://evkznxig-rotate:REALPASSWORD123@p.webshare.io:80"
)


class TestSafePersistedError(unittest.TestCase):
    def test_credentials_never_appear_in_persisted_message(self):
        code, message = _safe_persisted_error(_CREDENTIAL_LEAK_EXC, "DOWNLOAD")
        self.assertNotIn("REALPASSWORD123", message)
        self.assertNotIn("evkznxig-rotate", message)
        self.assertEqual(code, ec.PROXY_ERROR)

    def test_generic_exception_maps_to_safe_category_message_not_raw_text(self):
        exc = RuntimeError("Sign in to confirm you're not a bot [tvhtml5]")
        code, message = _safe_persisted_error(exc, "DOWNLOAD")
        self.assertEqual(code, ec.AUTH_ERROR)
        self.assertEqual(message, ec.safe_user_message(ec.AUTH_ERROR))
        self.assertNotIn("tvhtml5", message)

    def test_user_facing_message_never_contains_operator_instructions(self):
        # This is the literal historical bug: the raised exception used to
        # tell the END USER to re-export cookies.txt in an incognito
        # browser and upload it to the server.
        exc = RuntimeError(
            "YouTube session cookielari eskirgan. Iltimos, cookies.txt faylini "
            "Incognito rejimida YouTube ga kirib qayta eksport qiling va serverga yuklang."
        )
        code, message = _safe_persisted_error(exc, "DOWNLOAD")
        self.assertEqual(code, ec.AUTH_ERROR)
        for banned in ("cookies.txt", "incognito", "eksport", "yuklang"):
            self.assertNotIn(banned, message.lower())

    def test_permanent_error_message_preserved_verbatim(self):
        # PermanentError messages are authored BY US as safe, specific,
        # useful user-facing text -- they must survive unchanged (this is
        # the "preserve useful user-facing error messages" requirement),
        # not be flattened to a generic category message.
        exc = PermanentError("Bu videoda nutq topilmadi.", code="NO_SPEECH_FOUND")
        code, message = _safe_persisted_error(exc, "TRANSCRIBE")
        self.assertEqual(code, "NO_SPEECH_FOUND")
        self.assertEqual(message, "Bu videoda nutq topilmadi.")

    def test_permanent_error_still_scrubbed_defensively(self):
        # Defense in depth: even an authored PermanentError message is run
        # through scrub_secrets, in case a future call site ever
        # interpolates raw data into one.
        exc = PermanentError(
            "Video hajmi katta: http://evkznxig-rotate:REALPASSWORD123@p.webshare.io/report",
            code="FILE_TOO_LARGE",
        )
        _, message = _safe_persisted_error(exc, "DOWNLOAD")
        self.assertNotIn("REALPASSWORD123", message)

    def test_video_unavailable_permanent_error_preserved(self):
        exc = PermanentError(
            "Bu videoni yuklab bo'lmadi — u shaxsiy, o'chirilgan, mavjud emas yoki cheklangan bo'lishi mumkin.",
            code=ec.VIDEO_UNAVAILABLE,
        )
        code, message = _safe_persisted_error(exc, "DOWNLOAD")
        self.assertEqual(code, ec.VIDEO_UNAVAILABLE)
        self.assertIn("shaxsiy", message)

    def test_error_code_for_prefers_explicit_code_attribute(self):
        exc = PermanentError("x", code="CONTENT_BLOCKED")
        self.assertEqual(_error_code_for(exc, "SAFETY_CHECK"), "CONTENT_BLOCKED")

    def test_error_code_for_falls_back_to_stage_name(self):
        exc = RuntimeError("Whisper crashed unexpectedly")
        self.assertEqual(_error_code_for(exc, "TRANSCRIBE"), "TRANSCRIBE_FAILED")


class TestJobResponseNeverExposesCredentials(unittest.TestCase):
    """routes.py's JobResponse serializes job.error_message directly
    (error_message=job.error_message, no further processing) via the
    intentionally-unauthenticated GET /jobs/{id} -- so guaranteeing the
    STORED value is clean is equivalent to guaranteeing the API response
    is clean. This test exercises that data-flow guarantee at the
    persistence boundary rather than standing up a full HTTP+DB
    integration test, matching this project's existing unit-test style
    (see test_job_creation.py)."""

    def test_stored_error_message_is_what_the_unauthenticated_endpoint_returns(self):
        _, stored_message = _safe_persisted_error(_CREDENTIAL_LEAK_EXC, "DOWNLOAD")
        # backend/api/routes.py:_job_to_response does:
        #   error_message=job.error_message
        # i.e. no additional scrubbing happens between storage and the
        # public API response -- so this IS the value any unauthenticated
        # caller with a job UUID would receive.
        # Generic (non-PermanentError) exceptions are replaced entirely by
        # a safe category message -- not partially scrubbed raw text -- so
        # neither the credentials NOR the proxy host/URL survive at all.
        api_response_error_message = stored_message
        self.assertNotIn("REALPASSWORD123", api_response_error_message)
        self.assertNotIn("evkznxig-rotate", api_response_error_message)
        self.assertNotIn("webshare.io", api_response_error_message)
        self.assertNotIn("://", api_response_error_message)


if __name__ == "__main__":
    unittest.main()
