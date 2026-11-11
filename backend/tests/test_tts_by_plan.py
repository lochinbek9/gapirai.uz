"""TTS_PRO_PROVIDER: amaldagi Pro (va admin) -> alohida provayder, qolganlar -> TTS_PROVIDER_OVERRIDE."""
import unittest
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.models.database import Base, PlanTier, Subscription, User
from backend.services import plans


@compiles(JSONB, "sqlite")
def _jsonb_on_sqlite(type_, compiler, **kw):
    return "JSON"


class TTSByPlanTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables[n] for n in ("users", "subscriptions")])
        self.db = sessionmaker(bind=self.engine)()
        cfg = SimpleNamespace(TTS_PROVIDER_OVERRIDE="neuronai", TTS_PRO_PROVIDER="voicelab")
        p = patch("backend.config.get_settings", return_value=cfg)
        p.start()
        self.addCleanup(p.stop)
        self.cfg = cfg

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def user(self, plan=None, role="user", expires_in_days=30):
        u = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:8]}@t.uz", name="t", role=role)
        self.db.add(u)
        if plan:
            self.db.add(Subscription(id=uuid.uuid4(), user_id=u.id, plan=plan, period_started_at=datetime.utcnow(),
                                     expires_at=datetime.utcnow() + timedelta(days=expires_in_days)))
        self.db.commit()
        return SimpleNamespace(user_id=u.id, tts_provider=None)

    def provider(self, job):
        return plans.get_tts_provider_for_job(self.db, job)

    def test_pro_and_admin_get_pro_provider(self):
        self.assertEqual(self.provider(self.user(PlanTier.PRO)), "voicelab")
        self.assertEqual(self.provider(self.user(role="admin")), "voicelab")

    def test_others_get_override(self):
        self.assertEqual(self.provider(self.user(PlanTier.STANDARD)), "neuronai")
        self.assertEqual(self.provider(self.user(PlanTier.FREE)), "neuronai")
        self.assertEqual(self.provider(self.user()), "neuronai")  # obunasi yo'q
        self.assertEqual(self.provider(SimpleNamespace(user_id=None, tts_provider=None)), "neuronai")  # anonim

    def test_expired_pro_is_not_pro(self):
        self.assertEqual(self.provider(self.user(PlanTier.PRO, expires_in_days=-1)), "neuronai")

    def test_empty_pro_provider_keeps_old_behaviour(self):
        self.cfg.TTS_PRO_PROVIDER = ""
        self.assertEqual(self.provider(self.user(PlanTier.PRO)), "neuronai")


if __name__ == "__main__":
    unittest.main()
