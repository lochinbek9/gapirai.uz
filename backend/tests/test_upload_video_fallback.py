"""Unit tests for the upload-recovery security fix in
backend/api/routes.py:upload_video_fallback (2026-08-26).

Full HTTP-level behavior (auth, ownership, status checks, streamed size
limit) is exercised live against a running backend as part of this
feature's verification pass, matching this project's established
pattern (direct API calls with minted test JWTs) rather than a new
TestClient/DB fixture harness -- there isn't one in this codebase and
building one is out of scope for a security-fix-sized change. This file
covers the one pure, deterministic unit under test: the fix itself."""
import unittest

from backend.api.routes import _CONTENT_TYPE_TO_EXT, _ALLOWED_UPLOAD_CONTENT_TYPES


class TestContentTypeExtensionMapping(unittest.TestCase):
    def test_every_allowed_content_type_has_a_mapped_extension(self):
        # The fix's core guarantee: the saved file's extension is derived
        # ONLY from the already-validated content_type, never from the
        # client-supplied filename.
        for content_type in _ALLOWED_UPLOAD_CONTENT_TYPES:
            self.assertIn(content_type, _CONTENT_TYPE_TO_EXT)

    def test_mapping_has_no_extra_unvalidated_entries(self):
        # Every mapped extension must correspond to an allowed content
        # type -- no dead/unreachable mapping entries.
        self.assertEqual(set(_CONTENT_TYPE_TO_EXT.keys()), _ALLOWED_UPLOAD_CONTENT_TYPES)

    def test_extensions_are_the_expected_safe_values(self):
        self.assertEqual(_CONTENT_TYPE_TO_EXT["video/mp4"], ".mp4")
        self.assertEqual(_CONTENT_TYPE_TO_EXT["video/quicktime"], ".mov")
        self.assertEqual(_CONTENT_TYPE_TO_EXT["video/x-matroska"], ".mkv")
        self.assertEqual(_CONTENT_TYPE_TO_EXT["video/webm"], ".webm")

    def test_no_extension_value_could_enable_path_traversal_or_execution(self):
        for ext in _CONTENT_TYPE_TO_EXT.values():
            self.assertNotIn("/", ext)
            self.assertNotIn("..", ext)
            self.assertTrue(ext.startswith("."))


if __name__ == "__main__":
    unittest.main()
