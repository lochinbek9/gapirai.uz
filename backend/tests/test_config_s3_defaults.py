"""backend/config.py — AWS/S3 default konsistensiyasi.

Ilgari `AWS_BUCKET_NAME` / `AWS_REGION` uchun kod defaulti boshqa loyihaning
prod bucketiga (`hr-lodex-recordings` / `eu-north-1`) ishora qilardi. Kalitlar
sozlangan-u bucket sozlanmagan muhitda dublyaj fayllari begona bucketga jim
yozilib ketishi mumkin edi.

Endi defaultlar AWS kalitlari kabi bo'sh -> source of truth faqat `.env`
(prod) / Modal Secret. Bu testlar shuni muzlatadi:
  * sozlanmagan holatda ikkala default ham ""
  * explicit environment qiymatlari hamon override qiladi (runtime behavior
    o'zgarmagan)
  * bucket/kalitlarsiz storage._get_s3_client() (None, None) qaytaradi
  * eski begona-bucket literali kod bazasiga qaytmagan
"""
import inspect
import os
import unittest
from unittest import mock

from backend.config import Settings
from backend.services import storage

_AWS_KEYS = ("AWS_BUCKET_NAME", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")


class TestS3DefaultsAreEmpty(unittest.TestCase):
    def _settings_without_aws_env(self) -> Settings:
        # Test konteyneri env'ida AWS_BUCKET_NAME=... bo'lishi mumkin -- sof
        # kod defaultini ko'rish uchun o'sha kalitlarni vaqtincha olib turamiz.
        with mock.patch.dict(os.environ, {}, clear=False):
            for k in _AWS_KEYS:
                os.environ.pop(k, None)
            return Settings(_env_file=None)

    def test_bucket_default_is_empty(self):
        self.assertEqual(self._settings_without_aws_env().AWS_BUCKET_NAME, "")

    def test_region_default_is_empty(self):
        self.assertEqual(self._settings_without_aws_env().AWS_REGION, "")

    def test_no_foreign_bucket_literal_in_config_source(self):
        src = inspect.getsource(Settings)
        self.assertNotIn("hr-lodex-recordings", src)
        self.assertNotIn("eu-north-1", src)


class TestExplicitEnvStillOverrides(unittest.TestCase):
    """Runtime behavior o'zgarmagan: .env / environment qiymatlari g'olib."""

    def test_environment_values_win_over_empty_default(self):
        with mock.patch.dict(
            os.environ,
            {"AWS_BUCKET_NAME": "prod-bucket-xyz", "AWS_REGION": "ap-south-1"},
        ):
            s = Settings(_env_file=None)
        self.assertEqual(s.AWS_BUCKET_NAME, "prod-bucket-xyz")
        self.assertEqual(s.AWS_REGION, "ap-south-1")

    def test_init_kwargs_win(self):
        s = Settings(_env_file=None, AWS_BUCKET_NAME="kw-bucket", AWS_REGION="me-central-1")
        self.assertEqual(s.AWS_BUCKET_NAME, "kw-bucket")
        self.assertEqual(s.AWS_REGION, "me-central-1")


class TestS3ClientDisabledWhenUnconfigured(unittest.TestCase):
    def test_get_s3_client_returns_none_none_without_bucket_or_keys(self):
        fake = Settings(
            _env_file=None,
            AWS_ACCESS_KEY_ID="",
            AWS_SECRET_ACCESS_KEY="",
            AWS_BUCKET_NAME="",
            AWS_REGION="",
        )
        with mock.patch.object(storage, "get_settings", return_value=fake):
            client, bucket = storage._get_s3_client()
        self.assertIsNone(client)
        self.assertIsNone(bucket)

    def test_keys_present_but_no_bucket_still_disabled_no_foreign_fallback(self):
        # Regression: kalitlar bor, bucket yo'q -> ILGARI "hr-lodex-recordings"
        # ga ulanardi. Endi -> (None, None), begona bucketga fallback YO'Q.
        fake = Settings(
            _env_file=None,
            AWS_ACCESS_KEY_ID="AKIA_TEST",
            AWS_SECRET_ACCESS_KEY="secret_test",
            AWS_BUCKET_NAME="",
            AWS_REGION="",
        )
        with mock.patch.object(storage, "get_settings", return_value=fake):
            client, bucket = storage._get_s3_client()
        self.assertIsNone(client)
        self.assertIsNone(bucket)

    def test_explicit_bucket_and_keys_build_a_client(self):
        # Positive kontrol: to'liq sozlangan -> haqiqiy client (prod yo'li).
        fake = Settings(
            _env_file=None,
            AWS_ACCESS_KEY_ID="AKIA_TEST",
            AWS_SECRET_ACCESS_KEY="secret_test",
            AWS_BUCKET_NAME="prod-bucket-xyz",
            AWS_REGION="us-east-1",
        )
        with mock.patch.object(storage, "get_settings", return_value=fake):
            client, bucket = storage._get_s3_client()
        self.assertIsNotNone(client)
        self.assertEqual(bucket, "prod-bucket-xyz")


if __name__ == "__main__":
    unittest.main()
