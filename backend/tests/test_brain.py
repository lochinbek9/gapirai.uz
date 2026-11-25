"""«Miyya»: kirish faqat egaga, fikrlar bazadagi key_points'dan, holat faqat o'z tahliliga yoziladi."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from backend.api import brain_routes as brain


def _settings(emails):
    return SimpleNamespace(BRAIN_OWNER_EMAILS=emails)


class BrainAccessTest(unittest.TestCase):
    def test_only_listed_admin_allowed(self):
        with patch.object(brain, "get_settings", return_value=_settings("Owner@example.test")):
            self.assertTrue(brain.is_brain_owner(SimpleNamespace(role="admin", email="owner@example.test")))
            self.assertFalse(brain.is_brain_owner(SimpleNamespace(role="user", email="owner@example.test")))
            self.assertFalse(brain.is_brain_owner(SimpleNamespace(role="admin", email="other@example.test")))
            with self.assertRaises(HTTPException) as ctx:
                brain.require_brain_owner(SimpleNamespace(role="admin", email="other@example.test"))
            self.assertEqual(ctx.exception.status_code, 404)

    def test_empty_setting_allows_nobody(self):
        with patch.object(brain, "get_settings", return_value=_settings("")):
            self.assertFalse(brain.is_brain_owner(SimpleNamespace(role="admin", email=None)))


class BrainIdeaTest(unittest.TestCase):
    def test_key_changes_with_content(self):
        a = {"title": "A", "timestamp": 1.0}
        self.assertEqual(brain.idea_key(a), brain.idea_key(dict(a)))
        self.assertNotEqual(brain.idea_key(a), brain.idea_key({"title": "B", "timestamp": 1.0}))

    def test_unknown_idea_is_not_saved(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
            key_points=[{"title": "A", "timestamp": 1.0}])
        with self.assertRaises(HTTPException) as ctx:
            brain.update_idea(uuid.uuid4(), "0" * 16, brain.IdeaUpdate(selected=True), MagicMock(), db,
                              SimpleNamespace(id=uuid.uuid4()))
        self.assertEqual(ctx.exception.status_code, 404)
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_tags_are_normalised(self):
        self.assertEqual(brain._clean_tags([" #Biznes ", "biznes", "", "Vaqt"]), ["biznes", "vaqt"])


if __name__ == "__main__":
    unittest.main()
