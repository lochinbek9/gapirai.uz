import os
import pytest
from backend.config import get_settings
from backend.models.database import create_tables


@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """Ensure all directories, database tables, and enums exist before any test runs."""
    settings = get_settings()
    os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        create_tables()
    except Exception as e:
        print(f"[conftest] Warning while creating test database tables: {e}")


# Modul darajasida keshlangan Redis klientlari (`_redis = Redis.from_url(...)` bir marta).
# Biror test `redis.Redis.from_url` ni mock qilgan paytda kesh to'lsa, MagicMock keyingi
# testlarga "oqib" o'tadi (masalan, test_job_by_video'da JobResponse.current_stage
# MagicMock bo'lib qolgan). Har testdan keyin keshlarni tozalaymiz.
_CACHED_REDIS_MODULES = (
    "backend.services.cancel_policy",
    "backend.services.job_progress",
    "backend.services.job_recovery",
    "backend.services.proxy_manager",
    "backend.services.sms_service",
    "backend.services.rate_limiter",
)


@pytest.fixture(autouse=True)
def reset_cached_redis_clients():
    import importlib
    import sys

    yield
    for name in _CACHED_REDIS_MODULES:
        if name in sys.modules:
            importlib.import_module(name)._redis = None
