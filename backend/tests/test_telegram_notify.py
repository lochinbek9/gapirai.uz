import unittest
from unittest.mock import patch, MagicMock

from backend.services.telegram_notify import send_content_blocked_to_admins, send_error_to_admins


class TestTelegramNotify(unittest.TestCase):
    @patch("backend.services.telegram_notify.send_telegram_message")
    @patch("backend.services.telegram_notify.get_settings")
    def test_send_content_blocked_to_admins_multiple_admins(self, mock_settings, mock_send_msg):
        settings = MagicMock()
        settings.ADMIN_TG_IDS = '"557407324, 1758736133"'
        mock_settings.return_value = settings

        send_content_blocked_to_admins(
            video_url="https://www.youtube.com/watch?v=example123",
            video_title="Test Video Title",
            category="religious_content",
            reason="Diniy ma'ruza aniqlandi",
            stage="metadata",
            user_id="user-uuid-1",
            user_name="Ali Valiyev",
            user_email_or_phone="+998901234567",
            job_id="job-uuid-1",
        )

        self.assertEqual(mock_send_msg.call_count, 2)
        call_ids = [call.args[0] for call in mock_send_msg.call_args_list]
        self.assertEqual(call_ids, ["557407324", "1758736133"])

        sent_text = mock_send_msg.call_args_list[0].args[1]
        self.assertIn("Test Video Title", sent_text)
        self.assertIn("https://www.youtube.com/watch?v=example123", sent_text)
        self.assertIn("Diniy kontent", sent_text)
        self.assertIn("Diniy ma&#x27;ruza aniqlandi", sent_text)
        self.assertIn("Sarlavha/tavsif (metadata)", sent_text)
        self.assertIn("Ali Valiyev", sent_text)
        self.assertIn("job-uuid-1", sent_text)

        # Check inline keyboard
        reply_markup = mock_send_msg.call_args_list[0].kwargs.get("reply_markup")
        self.assertIsNotNone(reply_markup)
        self.assertEqual(
            reply_markup["inline_keyboard"][0][0]["url"],
            "https://www.youtube.com/watch?v=example123",
        )

    @patch("backend.services.telegram_notify.send_telegram_message")
    @patch("backend.services.telegram_notify.get_settings")
    def test_send_content_blocked_to_admins_local_file_no_url(self, mock_settings, mock_send_msg):
        settings = MagicMock()
        settings.ADMIN_TG_IDS = "557407324"
        mock_settings.return_value = settings

        send_content_blocked_to_admins(
            video_url=None,
            video_title="local_video.mp4",
            category="sexual_explicit",
            reason="18+ behayo kontent aniqlandi",
            stage="transcript",
            user_id="user-2",
            user_name="John Doe",
            job_id="job-uuid-2",
        )

        self.assertEqual(mock_send_msg.call_count, 1)
        sent_text = mock_send_msg.call_args_list[0].args[1]
        self.assertIn("local_video.mp4", sent_text)
        self.assertIn("18+ behayo / shahvoniy", sent_text)
        self.assertIn("Videodagi nutq (transkript)", sent_text)

        # Local file should not have inline URL button
        reply_markup = mock_send_msg.call_args_list[0].kwargs.get("reply_markup")
        self.assertIsNone(reply_markup)

    @patch("backend.services.telegram_notify.send_telegram_message")
    @patch("backend.services.telegram_notify.get_settings")
    def test_send_content_blocked_empty_admin_ids(self, mock_settings, mock_send_msg):
        settings = MagicMock()
        settings.ADMIN_TG_IDS = ""
        mock_settings.return_value = settings

        send_content_blocked_to_admins(
            video_url="https://youtube.com/watch?v=123",
            video_title="Title",
            category="religious_content",
            reason="reason",
            stage="metadata",
        )
        mock_send_msg.assert_not_called()


if __name__ == "__main__":
    unittest.main()
