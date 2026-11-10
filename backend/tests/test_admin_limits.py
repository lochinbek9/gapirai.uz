"""Admin (role='admin') uchun limitlar: hujjat bet limiti, video uzunligi, daqiqa balansi."""
import unittest
import uuid

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.models.database import Base, User
from backend.services import document_extract
from backend.services.plans import get_minute_balance


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


class AdminLimitsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        tables = [Base.metadata.tables[n] for n in ("users", "subscriptions")]
        Base.metadata.create_all(self.engine, tables=tables)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def user(self, role="user"):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", role=role)
        self.db.add(u)
        self.db.commit()
        return u

    def test_document_page_limit(self):
        self.assertEqual(document_extract.page_limit(self.db, self.user()), document_extract.FREE_PAGE_LIMIT)
        self.assertEqual(document_extract.page_limit(self.db, self.user("admin")), document_extract.ADMIN_PAGE_LIMIT)

    def test_minute_balance_marks_admin_unlimited(self):
        self.assertFalse(get_minute_balance(self.db, self.user().id)["is_unlimited"])
        self.assertTrue(get_minute_balance(self.db, self.user("admin").id)["is_unlimited"])


if __name__ == "__main__":
    unittest.main()
