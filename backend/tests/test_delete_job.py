import unittest
from unittest.mock import MagicMock, call, patch
import uuid
from backend.api.routes import delete_job
from backend.models.database import DubbingJob, ResolutionVariant, User
from fastapi import HTTPException


class TestDeleteJob(unittest.TestCase):
    def test_delete_job_by_owner(self):
        owner_id = uuid.uuid4()
        job_id = uuid.uuid4()
        owner = MagicMock(spec=User, id=owner_id)

        job = MagicMock(spec=DubbingJob, id=job_id, user_id=owner_id, output_video_url=None)
        db = MagicMock()
        
        # Mock query
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=False), \
             patch("backend.workers.celery_app.celery_app.control.revoke") as mock_revoke, \
             patch("backend.services.job_checkpoint.delete_checkpoint") as mock_checkpoint:
            res = delete_job(job_id=job_id, db=db, current_user=owner)
            self.assertEqual(res.status_code, 204)
            mock_revoke.assert_called_once_with(str(job_id), terminate=True)
            mock_checkpoint.assert_has_calls(
                [call(str(job_id), name) for name in ("video.mp4", "audio.wav", "dubbed_audio.wav", "dubbed_final.mp4")],
                any_order=True,
            )
            db.delete.assert_called_once_with(job)
            db.commit.assert_called_once()

    def test_delete_job_by_admin(self):
        admin_id = uuid.uuid4()
        other_user_id = uuid.uuid4()
        job_id = uuid.uuid4()
        admin_user = MagicMock(spec=User, id=admin_id)

        job = MagicMock(spec=DubbingJob, id=job_id, user_id=other_user_id, output_video_url=None)
        db = MagicMock()
        
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = job

        with patch("backend.services.plans.is_user_admin", return_value=True), \
             patch("backend.workers.celery_app.celery_app.control.revoke"), \
             patch("backend.services.job_checkpoint.delete_checkpoint"):
            res = delete_job(job_id=job_id, db=db, current_user=admin_user)
            self.assertEqual(res.status_code, 204)
            db.delete.assert_called_once_with(job)
            db.commit.assert_called_once()

    def test_delete_job_not_found_or_not_owner(self):
        user_id = uuid.uuid4()
        job_id = uuid.uuid4()
        user = MagicMock(spec=User, id=user_id)

        db = MagicMock()
        query_mock = MagicMock()
        db.query.return_value = query_mock
        query_mock.filter.return_value = query_mock
        query_mock.first.return_value = None

        with patch("backend.services.plans.is_user_admin", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                delete_job(job_id=job_id, db=db, current_user=user)
            self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
