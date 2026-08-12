from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
from cccc_sdk.errors import IncompatibleDaemonError
from cccc_sdk.transport import DaemonEndpoint


TARGET_FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "spec" / "SDK_DAEMON_TARGET_0_4_33.json").read_text(
        encoding="utf-8"
    )
)


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
                "term_resize",
            ],
        )
        self.assertEqual(captured[0]["args"]["insight"], "Compatibility is the release gate.")
        self.assertIs(captured[0]["args"]["require_peer_insight"], True)
        self.assertEqual(captured[4]["args"]["confirm"], "preamble")
        self.assertEqual(captured[5]["args"]["before"], 100)
        self.assertEqual(captured[6]["args"]["after"], 100)

    def test_reme_helpers_match_current_daemon_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        message = {"role": "user", "name": "waterbang", "content": "Keep this decision."}
        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.memory_reme_layout_get(group_id="g_1")
            client.memory_reme_index_sync(group_id="g_1", mode="rebuild")
            client.memory_reme_context_check(
                group_id="g_1",
                messages=[message],
                context_window_tokens=128000,
                reserve_tokens=36000,
                keep_recent_tokens=20000,
            )
            client.memory_reme_compact(
                group_id="g_1",
                messages_to_summarize=[message],
                turn_prefix_messages=[{"role": "system", "content": "Project context"}],
                previous_summary="Earlier summary",
                language="zh-CN",
                return_prompt=True,
            )
            client.memory_reme_daily_flush(
                group_id="g_1",
                messages=[message],
                date="2026-08-08",
                version="default",
                language="zh-CN",
                return_prompt=False,
                signal_pack={"decisions": ["ship"]},
                signal_pack_token_budget=320,
                dedup_intent="update",
                dedup_query="release decision",
            )
            client.memory_reme_write(
                group_id="g_1",
                target="memory",
                content="The SDK follows IPC v1.",
                mode="append",
                idempotency_key="sdk-ipc-v1",
                actor_id="foreman",
                source_refs=["chat:e_1"],
                tags=["sdk"],
                supersedes=["MEMORY.md#L1"],
                dedup_intent="supersede",
                dedup_query="SDK IPC contract",
            )

        self.assertEqual(
            [request["op"] for request in captured],
            [
                "memory_reme_layout_get",
                "memory_reme_index_sync",
                "memory_reme_context_check",
                "memory_reme_compact",
                "memory_reme_daily_flush",
                "memory_reme_write",
            ],
        )
        self.assertEqual(captured[0]["args"], {"group_id": "g_1"})
        self.assertEqual(captured[1]["args"], {"group_id": "g_1", "mode": "rebuild"})
        self.assertEqual(
            captured[2]["args"],
            {
                "group_id": "g_1",
                "messages": [message],
                "context_window_tokens": 128000,
                "reserve_tokens": 36000,
                "keep_recent_tokens": 20000,
            },
        )
        self.assertEqual(
            captured[3]["args"],
            {
                "group_id": "g_1",
                "messages_to_summarize": [message],
                "turn_prefix_messages": [{"role": "system", "content": "Project context"}],
                "previous_summary": "Earlier summary",
                "language": "zh-CN",
                "return_prompt": True,
            },
        )
        self.assertEqual(
            captured[4]["args"],
            {
                "group_id": "g_1",
                "messages": [message],
                "date": "2026-08-08",
                "version": "default",
                "language": "zh-CN",
                "return_prompt": False,
                "signal_pack": {"decisions": ["ship"]},
                "signal_pack_token_budget": 320,
                "dedup_intent": "update",
                "dedup_query": "release decision",
            },
        )
        self.assertEqual(
            captured[5]["args"],
            {
                "group_id": "g_1",
                "target": "memory",
                "content": "The SDK follows IPC v1.",
                "mode": "append",
                "idempotency_key": "sdk-ipc-v1",
                "actor_id": "foreman",
                "source_refs": ["chat:e_1"],
                "tags": ["sdk"],
                "supersedes": ["MEMORY.md#L1"],
                "dedup_intent": "supersede",
                "dedup_query": "SDK IPC contract",
            },
        )

    def test_remote_access_helpers_use_the_global_flat_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.remote_access_state()
            client.remote_access_configure(
                provider="manual",
                mode="tailnet_only",
                require_access_token=True,
                web_host="0.0.0.0",
                web_port=8848,
                web_public_url="https://cccc.example.test",
            )
            client.remote_access_start()
            client.remote_access_stop(by="user")

        self.assertEqual(
            [request["op"] for request in captured],
            [
                "remote_access_state",
                "remote_access_configure",
                "remote_access_start",
                "remote_access_stop",
            ],
        )
        self.assertEqual(captured[0]["args"], {"by": "user"})
        self.assertEqual(
            captured[1]["args"],
            {
                "by": "user",
                "provider": "manual",
                "mode": "tailnet_only",
                "require_access_token": True,
                "web_host": "0.0.0.0",
                "web_port": 8848,
                "web_public_url": "https://cccc.example.test",
            },
        )
        self.assertEqual(captured[2]["args"], {"by": "user"})
        self.assertEqual(captured[3]["args"], {"by": "user"})

    def test_im_auth_and_voice_model_install_match_current_contracts(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.im_bind_chat(group_id="g_1", key="bind-key")
            client.im_list_authorized(group_id="g_1")
            client.im_list_pending(group_id="g_1")
            client.im_reject_pending(group_id="g_1", key="bind-key")
            client.im_revoke_chat(group_id="g_1", chat_id="chat-1", thread_id="1710000000.100")
            client.assistant_voice_model_install(group_id="g_1", model_id="sensevoice-small")

        self.assertEqual(
            [request["op"] for request in captured],
            [
                "im_bind_chat",
                "im_list_authorized",
                "im_list_pending",
                "im_reject_pending",
                "im_revoke_chat",
                "assistant_voice_model_install",
            ],
        )
        self.assertEqual(captured[0]["args"], {"group_id": "g_1", "key": "bind-key"})
        self.assertEqual(captured[1]["args"], {"group_id": "g_1"})
        self.assertEqual(captured[2]["args"], {"group_id": "g_1"})
        self.assertEqual(captured[3]["args"], {"group_id": "g_1", "key": "bind-key"})
        self.assertEqual(
            captured[4]["args"],
            {"group_id": "g_1", "chat_id": "chat-1", "thread_id": "1710000000.100"},
        )
        self.assertEqual(
            captured[5]["args"],
            {"group_id": "g_1", "model_id": "sensevoice-small", "by": "user"},
        )

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

    def test_voice_secretary_idempotency_and_general_instruction_fields(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.assistant_voice_document_instruction(
                group_id="g_1",
                document_path="notes/meeting.md",
                request_id="voice-ask-1",
                input_append_id="voice-input-1",
                instruction="Tighten the summary",
            )
            client.assistant_voice_input_append(
                group_id="g_1",
                kind="voice_instruction",
                request_id="voice-ask-2",
                input_append_id="voice-input-2",
                instruction="Check the latest summary",
                text="Include omissions",
                source_text="Current meeting notes",
            )

        self.assertEqual(captured[0]["args"]["request_id"], "voice-ask-1")
        self.assertEqual(captured[0]["args"]["input_append_id"], "voice-input-1")
        self.assertEqual(captured[1]["args"]["kind"], "voice_instruction")
        self.assertEqual(captured[1]["args"]["request_id"], "voice-ask-2")
        self.assertEqual(captured[1]["args"]["input_append_id"], "voice-input-2")
        self.assertEqual(captured[1]["args"]["instruction"], "Check the latest summary")
        self.assertEqual(captured[1]["args"]["text"], "Include omissions")
        self.assertEqual(captured[1]["args"]["source_text"], "Current meeting notes")

    def test_web_model_completion_requires_and_reuses_delivery_id(self) -> None:
        captured: list[dict] = []
        contract = TARGET_FIXTURE["operations"]["web_model_runtime_complete_turn"]
        args = contract["request"]["args"]

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return contract["completion_response"]

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            for _ in range(2):
                client.web_model_runtime_complete_turn(
                    group_id=args["group_id"],
                    actor_id=args["actor_id"],
                    turn_id=args["turn_id"],
                    delivery_id=args["delivery_id"],
                    event_ids=args["event_ids"],
                    status=args["status"],
                )

        self.assertEqual(captured[0], captured[1])
        self.assertEqual(captured[0]["op"], "web_model_runtime_complete_turn")
        self.assertTrue(set(contract["required_args"]).issubset(captured[0]["args"]))
        self.assertEqual(captured[0]["args"]["delivery_id"], args["delivery_id"])


if __name__ == "__main__":
    unittest.main()
