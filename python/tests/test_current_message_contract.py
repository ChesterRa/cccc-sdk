from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk import CCCCClient, DaemonAPIError, IncompatibleDaemonError
from cccc_sdk.transport import DaemonEndpoint


class CurrentMessageContract(unittest.TestCase):
    def setUp(self):
        self.client = CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1))

    def test_exact_history_is_non_consuming_and_rejects_old_daemon_responses(self):
        expected = {"messages": [{"id": "e_1"}], "has_more": False, "delivery_text": None}
        with patch.object(self.client, "call", return_value=expected) as call:
            self.assertEqual(self.client.message_history_exact(
                group_id="g_1", actor_id="peer", event_id="e_1", by="peer",
            ), expected)
            call.assert_called_once_with("message_history", {
                "group_id": "g_1", "actor_id": "peer", "event_id": "e_1", "by": "peer",
            })
        for result in [
            {"messages": [{"id": "e_1"}], "has_more": False},
            {"messages": [{"id": "other"}], "has_more": False, "delivery_text": "text"},
            {"messages": [], "has_more": False, "delivery_text": None},
            {"messages": [{"id": "e_1"}], "has_more": True, "delivery_text": "text"},
        ]:
            with self.subTest(result=result), patch.object(self.client, "call", return_value=result):
                with self.assertRaises(IncompatibleDaemonError):
                    self.client.message_history_exact(group_id="g_1", actor_id="peer", event_id="e_1")
        with patch.object(self.client, "call") as call:
            with self.assertRaises(ValueError):
                self.client.message_history_exact(group_id="g_1", actor_id="peer", event_id=" ")
            call.assert_not_called()

    def test_summary_and_model_label_reach_daemon(self):
        summary = {"group_id": "g_1", "observed_at": "2026-11-03T00:00:00Z",
                   "cutoff": "2026-11-02T00:00:00Z", "actors": []}
        with patch.object(self.client, "call", return_value=summary) as call:
            self.assertEqual(self.client.inbox_summary(group_id="g_1", cutoff=summary["cutoff"]), summary)
            call.assert_called_once_with("inbox_summary", {
                "group_id": "g_1", "cutoff": summary["cutoff"], "by": "user",
            })
        with patch.object(self.client, "call", return_value={}) as call:
            self.client.actor_add(group_id="g_1", actor_id="peer", model_label="Model A")
            self.assertEqual(call.call_args.args[1]["model_label"], "Model A")

    def test_sender_activity_and_review_reminder_are_preserved(self):
        activity = {"days": 14, "since": "2026-11-01T00:00:00Z", "user": {}, "members": []}
        with patch.object(self.client, "call", return_value=activity) as call:
            self.assertEqual(self.client.group_activity(group_id="g_1", by="foreman"), activity)
            call.assert_called_once_with("group_activity", {"group_id": "g_1", "by": "foreman"})
        with patch.object(self.client, "call", return_value={}) as call:
            self.client.message_history(group_id="g_1", actor_id="foreman", sender="user")
            self.assertEqual(call.call_args.args[1]["sender"], "user")
            self.client.message_history(group_id="g_1", actor_id="foreman")
            self.assertNotIn("sender", call.call_args.args[1])
        reminder = {"changes": [], "review_reminder": "Review the team"}
        with patch.object(self.client, "call", return_value=reminder):
            self.assertEqual(self.client.context_sync(group_id="g_1", ops=[], by="foreman"), reminder)
        denied = DaemonAPIError(code="invalid_args", message="permission denied: lead", details={})
        with patch.object(self.client, "call", side_effect=denied):
            with self.assertRaises(DaemonAPIError):
                self.client.message_history_exact(group_id="g_1", actor_id="peer", event_id="e_1", by="foreman")

    def test_removed_voice_operations_fail_before_dispatch(self):
        calls = [
            lambda: self.client.assistant_settings_update(group_id="g", assistant_id="voice_secretary", patch={}),
            lambda: self.client.assistant_status_update(group_id="g", assistant_id="voice_secretary", lifecycle="working"),
            lambda: self.client.assistant_voice_document_input_read(group_id="g"),
            lambda: self.client.assistant_voice_prompt_draft_submit(group_id="g", request_id="r"),
            lambda: self.client.assistant_voice_request(group_id="g", request_text="hello"),
        ]
        with patch.object(self.client, "call") as call:
            for invoke in calls:
                with self.subTest(invoke=invoke), self.assertRaisesRegex(IncompatibleDaemonError, "removed from daemon IPC"):
                    invoke()
            call.assert_not_called()
