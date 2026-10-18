import pytest
from backend.models.database import create_tables


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    """Ensure all database tables and enums are created in the test database."""
    try:
        create_tables()
    except Exception as e:
        print(f"[conftest] Warning while creating test database tables: {e}")
