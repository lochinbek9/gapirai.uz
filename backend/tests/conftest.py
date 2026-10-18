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
