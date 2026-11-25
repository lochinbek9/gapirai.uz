"""«Miyya» vazifalari: bepul kalitlar, 5 tagacha taklif, o'chmaslik va doska amallari (SQLite)."""
import json
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api import brain_task_routes as routes
from backend.models.brain import BrainColumn, BrainTask, BrainTaskGeneration
from backend.services import brain_tasks as service


class SuggestTest(unittest.TestCase):
    def test_at_most_five_and_empty_titles_skipped(self):
        raw = json.dumps({"tasks": [{"title": ""}] + [{"title": f"V{i}"} for i in range(9)]})
        self.assertEqual([t["title"] for t in service.parse_tasks(raw)], ["V0.", "V1.", "V2.", "V3.", "V4."])

    def test_style_is_normalised(self):
        raw = json.dumps({"tasks": [{"title": "Qog'ozga yozing", "description": "Ta'sirni o`lchang, 'reja' tuzing."},
                                    {"title": "Tayyormisiz?"}]})
        first, second = service.parse_tasks(raw)
        self.assertEqual(first, {"title": "Qog‘ozga yozing.", "description": "Ta’sirni o‘lchang, 'reja' tuzing.",
                                 "duration_minutes": None})
        self.assertEqual(second["title"], "Tayyormisiz?")

    def test_duration_follows_text(self):
        cases = [("Har kuni 1 soat o‘qing.", 15, 60), ("15 daqiqada yozing.", None, 15), ("Yarim soat yuring.", None, 30),
                 ("1 soat 30 daqiqa ishlang.", None, 90), ("1-2 soat ajrating.", 60, None),
                 ("5 daqiqada tanlang, 1 soat ishlang.", 30, None), ("Reja yozing.", 20, 20),
                 ("Reja yozing.", 9000, None), ("Reja yozing.", "20", None)]
        for text, suggested, expected in cases:
            self.assertEqual(service._duration(text, suggested), expected, text)

    def test_paid_key_never_used(self):
        with patch.object(service, "get_all_gemini_api_keys", return_value=["paid"]), \
             patch.object(service, "get_paid_gemini_api_keys", return_value=["paid"]):
            self.assertEqual(service._free_gemini_keys(), [])


class BoardTest(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        for model in (BrainColumn, BrainTask, BrainTaskGeneration):
            model.__table__.create(engine)
        self.db = sessionmaker(bind=engine, expire_on_commit=False)()
        self.user = SimpleNamespace(id=uuid.uuid4())
        self.columns = routes._columns(self.db, self.user.id)

    def _add(self, title, column):
        return routes.create_task(routes.TaskCreate(title=title, column_id=column.id), self.db, self.user)

    def test_move_order_is_persisted(self):
        a, b = self._add("a", self.columns[0]), self._add("b", self.columns[0])
        routes.move_task(uuid.UUID(b["id"]), routes.TaskMove(column_id=self.columns[0].id, index=0), self.db, self.user)
        titles = [t.title for t in routes._column_tasks(self.db, self.user.id, self.columns[0].id)]
        self.assertEqual(titles, ["b", "a"])
        self.assertTrue(a)

    def test_deleting_column_keeps_tasks(self):
        self._add("a", self.columns[1])
        routes.delete_column(self.columns[1].id, self.db, self.user)
        listed = routes.list_tasks(BackgroundTasks(), self._with_states(), self.user)
        self.assertEqual([t["title"] for t in listed["tasks"]], ["a"])
        self.assertEqual(len(listed["columns"]), 2)

    def _with_states(self):
        from backend.models.brain import BrainIdeaState
        BrainIdeaState.__table__.create(self.db.get_bind(), checkfirst=True)
        return self.db

    def test_archive_then_trash_keeps_row(self):
        task_id = uuid.UUID(self._add("a", self.columns[0])["id"])
        with self.assertRaises(HTTPException):
            routes.delete_task(task_id, self.db, self.user)  # arxivsiz o'chirilmaydi
        routes.archive_task(task_id, self.db, self.user)
        self.assertEqual(routes._column_tasks(self.db, self.user.id, self.columns[0].id), [])
        self.assertIsNone(routes.restore_task(task_id, self.db, self.user)["archived_at"])
        routes.archive_task(task_id, self.db, self.user)
        routes.delete_task(task_id, self.db, self.user)
        listed = routes.list_tasks(BackgroundTasks(), self._with_states(), self.user)
        self.assertEqual(listed["tasks"], [])
        self.assertIsNotNone(self.db.get(BrainTask, task_id).deleted_at)  # bazada qoladi
        with self.assertRaises(HTTPException):
            routes.restore_task(task_id, self.db, self.user)

    def test_edit_keeps_original_and_edited(self):
        task_id = uuid.UUID(self._add("asl", self.columns[0])["id"])
        patch_task = lambda **kw: routes.update_task(task_id, routes.TaskUpdate(**kw), self.db, self.user)
        switch = lambda v: routes.switch_version(task_id, routes.TaskVersion(version=v), self.db, self.user)
        self.assertIsNone(patch_task(title="asl", labels=["x"])["version"])  # matn o'zgarmadi
        with self.assertRaises(HTTPException):
            switch("original")
        patch_task(title="birinchi", description="d")
        patch_task(title="ikkinchi")
        back = switch("original")
        self.assertEqual((back["title"], back["description"], back["version"]), ("asl", "", "original"))
        again = switch("edited")
        self.assertEqual((again["title"], again["description"], again["version"]), ("ikkinchi", "d", "edited"))

    def test_duration_saved_and_cleared(self):
        task_id = uuid.UUID(self._add("a", self.columns[0])["id"])
        patch_task = lambda **kw: routes.update_task(task_id, routes.TaskUpdate(**kw), self.db, self.user)
        self.assertEqual(patch_task(duration_minutes=45)["duration_minutes"], 45)
        self.assertEqual(patch_task(labels=["x"])["duration_minutes"], 45)
        self.assertIsNone(patch_task(duration_minutes=None)["duration_minutes"])

    def test_generation_claimed_once(self):
        args = (self.db, self.user.id, uuid.uuid4(), "k")
        self.assertTrue(service.claim_generation(*args))
        self.assertFalse(service.claim_generation(*args))
        service._finish(self.db, self.user.id, args[2], "k", "done")
        self.assertFalse(service.claim_generation(*args, retry=True))


if __name__ == "__main__":
    unittest.main()
