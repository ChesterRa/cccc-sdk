from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk import CCCCClient
from cccc_sdk.errors import DaemonAPIError
from cccc_sdk.transport import DaemonEndpoint


class VoiceLibraryContract(unittest.TestCase):
    def client(self):
        return CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1))

    def test_library_actions_preserve_clears_and_explicit_writer(self):
        result = {"folders": [], "root_order": [], "documents": [{"status": "archived"}]}
        with patch("cccc_sdk.client.call_daemon", return_value={"v": 1, "ok": True, "result": result}) as call:
            client = self.client()
            self.assertEqual(client.assistant_voice_document_library(group_id="g_1"), result)
            self.assertEqual(call.call_args.kwargs["request"], {
                "v": 1, "op": "assistant_voice_document_library", "args": {"group_id": "g_1"},
            })
            for fields in [
                {"action": "create_folder", "name": "Meetings"},
                {"action": "rename_folder", "folder_id": "f_1", "name": "Archive"},
                {"action": "remove_folder", "folder_id": "f_1"},
                {"action": "reorder_root", "root_order": ["folder:f_1", "document:notes.md"]},
                {"action": "reorder_root", "root_order": []},
                {"action": "rename", "document_path": "notes.md", "name": "Summary"},
                {"action": "move", "document_path": "notes.md", "folder_id": ""},
                {"action": "restore", "document_path": "notes.md"},
            ]:
                self.assertEqual(client.assistant_voice_document_library_update(
                    group_id="g_1", by="foreman", **fields,
                ), result)
                self.assertEqual(call.call_args.kwargs["request"], {
                    "v": 1, "op": "assistant_voice_document_library_update",
                    "args": {"group_id": "g_1", "by": "foreman", **fields},
                })

    def test_reorder_does_not_split_a_string_into_item_keys(self):
        with patch("cccc_sdk.client.call_daemon") as call:
            with self.assertRaises(ValueError):
                self.client().assistant_voice_document_library_update(
                    group_id="g_1", action="reorder_root", root_order="document:notes.md",
                )
            call.assert_not_called()

    def test_delete_keeps_daemon_error_and_does_not_retry(self):
        response = {"v": 1, "ok": False, "error": {
            "code": "voice_recording_active", "message": "Stop recording", "details": {"group_id": "g_1"},
        }}
        with patch("cccc_sdk.client.call_daemon", return_value=response) as call:
            with self.assertRaises(DaemonAPIError) as raised:
                self.client().assistant_voice_document_delete(group_id="g_1", document_path="notes.md")
            self.assertEqual(raised.exception.code, "voice_recording_active")
            self.assertEqual(call.call_count, 1)
            self.assertEqual(call.call_args.kwargs["request"]["args"], {
                "group_id": "g_1", "document_path": "notes.md", "by": "user",
            })
