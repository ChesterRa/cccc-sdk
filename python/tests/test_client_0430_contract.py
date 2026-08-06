from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
from cccc_sdk.errors import IncompatibleDaemonError
from cccc_sdk.transport import DaemonEndpoint


class TestClient0433Contract(unittest.TestCase):
    def _client(self) -> CCCCClient:
        return CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=9000))

    def test_current_message_preamble_and_terminal_ops(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.send(
                group_id="g_1",
                text="next?",
                insight="Compatibility is the release gate.",
                require_peer_insight=True,
            )
            client.reply(group_id="g_1", reply_to="e_1", text="done", insight="The probe now matches reality.")
            client.group_preamble_get(group_id="g_1")
            client.group_preamble_set(group_id="g_1", content="Project guidance")
            client.group_preamble_reset(group_id="g_1", confirm="preamble")
            client.terminal_history(
                group_id="g_1",
                actor_id="codex-1",
                before=100,
                limit_bytes=2048,
                strip_ansi=True,
                compact=True,
            )
            client.terminal_since(group_id="g_1", actor_id="codex-1", after=100, limit_bytes=4096)
            client.term_resize(group_id="g_1", actor_id="codex-1", cols=120, rows=40)

        self.assertEqual(
            [request["op"] for request in captured],
            [
                "send",
                "reply",
                "group_preamble_get",
                "group_preamble_set",
                "group_preamble_reset",
                "terminal_history",
                "terminal_since",
                "terminal_resize",
            ],
        )
        self.assertEqual(captured[0]["args"]["insight"], "Compatibility is the release gate.")
        self.assertIs(captured[0]["args"]["require_peer_insight"], True)
        self.assertEqual(captured[4]["args"]["confirm"], "preamble")
        self.assertEqual(captured[5]["args"]["before"], 100)
        self.assertEqual(captured[6]["args"]["after"], 100)

    def test_current_voice_secretary_ops(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.assistant_voice_transcript_append(
                group_id="g_1",
                session_id="s_1",
                segment_id="seg_1",
                text="hello",
                document_path="notes/meeting.md",
                is_final=True,
            )
            client.assistant_voice_document_list(group_id="g_1", include_archived=True)
            client.assistant_voice_document_save(
                group_id="g_1", document_path="notes/meeting.md", content="# Summary", create_new=True
            )
            client.assistant_voice_document_instruction(
                group_id="g_1", document_path="notes/meeting.md", instruction="Tighten the summary"
            )
            client.assistant_voice_input_append(
                group_id="g_1", request_id="r_1", composer_text="draft", operation="replace_with_refined_prompt"
            )
            client.assistant_voice_prompt_draft_submit(group_id="g_1", request_id="r_1", draft_text="refined")
            client.assistant_voice_prompt_draft_ack(group_id="g_1", request_id="r_1", status="applied")
            client.assistant_voice_request(
                group_id="g_1",
                request_text="Review the release",
                target="@foreman",
                artifact_paths=["notes/meeting.md"],
                requires_ack=True,
            )
            client.assistant_voice_document_archive(group_id="g_1", document_path="notes/meeting.md")

        self.assertEqual(captured[0]["args"]["session_id"], "s_1")
        self.assertEqual(captured[2]["args"]["document_path"], "notes/meeting.md")
        self.assertEqual(captured[4]["args"]["kind"], "prompt_refine")
        self.assertEqual(captured[7]["args"]["request_text"], "Review the release")

    def test_removed_ipc_transcription_fails_clearly(self) -> None:
        with self.assertRaises(IncompatibleDaemonError):
            self._client().assistant_voice_transcribe(group_id="g_1", audio_base64="abc")


if __name__ == "__main__":
    unittest.main()
