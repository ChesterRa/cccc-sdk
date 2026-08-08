from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
from cccc_sdk.errors import DaemonAPIError, IncompatibleDaemonError
from cccc_sdk.transport import DaemonEndpoint


class TestClientContractParity(unittest.TestCase):
    def _client(self) -> CCCCClient:
        return CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=9000))

    def test_send_includes_attention_and_reply_required(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"event": {"id": "e1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().send(
                group_id="g_1",
                text="hello",
                by="user",
                priority="attention",
                reply_required=True,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "send")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("priority"), "attention")
        self.assertIs(args.get("reply_required"), True)

    def test_send_files_maps_paths_into_one_daemon_operation(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"event": {"id": "e-files"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().send_files(
                group_id="g_1",
                paths=["reference.png", "candidate.png"],
                text="inspect",
                to=["seat-design"],
                priority="attention",
            )

        self.assertEqual(captured[0].get("op"), "send_files")
        args = captured[0].get("args") or {}
        self.assertEqual(args.get("paths"), ["reference.png", "candidate.png"])
        self.assertEqual(args.get("to"), ["seat-design"])
        self.assertEqual(args.get("priority"), "attention")

        with self.assertRaisesRegex(ValueError, "non-empty paths"):
            self._client().send_files(group_id="g_1", paths=[])
        with self.assertRaisesRegex(ValueError, "non-empty paths"):
            self._client().send_files(group_id="g_1", paths=["reference.png", "  "])

    def test_reply_includes_reply_required(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"event": {"id": "e2"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().reply(
                group_id="g_1",
                reply_to="e_origin",
                text="roger",
                by="peer1",
                reply_required=True,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "reply")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("reply_to"), "e_origin")
        self.assertIs(args.get("reply_required"), True)

    def test_send_cross_group_includes_reply_required(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"src_event": {"id": "s1"}, "dst_event": {"id": "d1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().send_cross_group(
                group_id="g_src",
                dst_group_id="g_dst",
                text="relay",
                by="user",
                reply_required=True,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "send_cross_group")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertIs(args.get("reply_required"), True)

    def test_group_automation_manage_requires_actions(self) -> None:
        client = self._client()
        with self.assertRaises(ValueError):
            client.group_automation_manage(group_id="g_1", actions=[])

    def test_tracked_send_includes_task_metadata(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"event": {"id": "e1"}, "task": {"id": "t1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().tracked_send(
                group_id="g_1",
                title="Update SDK",
                text="please handle",
                outcome="all tests pass",
                assignee="peer-impl",
                checklist=[{"text": "write tests", "status": "pending"}],
                by="user",
                to=["peer-impl"],
                priority="attention",
                reply_required=True,
                waiting_on="actor",
                insight="This task closes the release gap.",
                require_peer_insight=True,
            )

        req = captured[0]
        self.assertEqual(req.get("op"), "tracked_send")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(
            args,
            {
                "group_id": "g_1",
                "title": "Update SDK",
                "text": "please handle",
                "outcome": "all tests pass",
                "assignee": "peer-impl",
                "checklist": [{"text": "write tests", "status": "pending"}],
                "by": "user",
                "to": ["peer-impl"],
                "priority": "attention",
                "reply_required": True,
                "waiting_on": "actor",
                "insight": "This task closes the release gap.",
                "require_peer_insight": True,
            },
        )

    def test_assert_compatible_probes_events_stream(self) -> None:
        client = self._client()
        def fake_call_raw(op: str, args: dict) -> dict:
            if op == "ping":
                return {"ok": True, "result": {"ipc_v": 1, "capabilities": {"events_stream": True}}}
            raise DaemonAPIError(code="unknown_op", message=f"unknown operation: {op}", details={})

        with patch.object(client, "call_raw", side_effect=fake_call_raw):
            with self.assertRaises(IncompatibleDaemonError):
                client.assert_compatible(require_ops=["events_stream"])

    def test_tracked_send_defaults_reply_required_to_true(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"task_id": "t1"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().tracked_send(group_id="g_1", title="Review SDK", text="please review")

        args = captured[0].get("args") if isinstance(captured[0].get("args"), dict) else {}
        self.assertIs(args.get("reply_required"), True)

    def test_context_v3_helpers_emit_context_sync_ops(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"success": True}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.coordination_brief_update(
                group_id="g_1",
                by="foreman",
                objective="ship",
                current_focus="compat",
                constraints=["no regressions"],
                project_brief="sdk",
                project_brief_stale=False,
                dry_run=True,
            )
            client.task_move(group_id="g_1", task_id="t1", status="done", by="foreman")
            client.agent_state_update(
                group_id="g_1",
                actor_id="peer-impl",
                by="peer-impl",
                focus="coding",
                blockers=[],
            )

        self.assertEqual(captured[0]["op"], "context_sync")
        self.assertEqual(
            captured[0]["args"],
            {
                "group_id": "g_1",
                "by": "foreman",
                "ops": [
                    {
                        "op": "coordination.brief.update",
                        "objective": "ship",
                        "current_focus": "compat",
                        "constraints": ["no regressions"],
                        "project_brief": "sdk",
                        "project_brief_stale": False,
                    }
                ],
                "dry_run": True,
            },
        )
        self.assertEqual(captured[1]["args"]["ops"], [{"op": "task.move", "task_id": "t1", "status": "done"}])
        self.assertEqual(
            captured[2]["args"]["ops"],
            [{"op": "agent_state.update", "actor_id": "peer-impl", "focus": "coding", "blockers": []}],
        )

    def test_capability_and_memory_helpers_map_to_current_ops(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.capability_search(
                query="docs",
                group_id="g_1",
                actor_id="foreman",
                include_external=True,
                trust_tier="local",
                limit=5,
            )
            client.memory_search(
                group_id="g_1",
                actor_id="worker",
                query="recent decisions",
                limit=3,
                max_results=7,
                vector_weight=0.6,
                candidate_multiplier=4.0,
                min_score=0.2,
                tags=["reply-style"],
                target="memory",
            )

        self.assertEqual(captured[0]["op"], "capability_search")
        self.assertEqual(
            captured[0]["args"],
            {
                "query": "docs",
                "group_id": "g_1",
                "actor_id": "foreman",
                "by": "user",
                "include_external": True,
                "trust_tier": "local",
                "limit": 5,
            },
        )
        self.assertEqual(captured[1]["op"], "memory_search")
        self.assertEqual(
            captured[1]["args"],
            {
                "group_id": "g_1",
                "actor_id": "worker",
                "query": "recent decisions",
                "limit": 3,
                "max_results": 7,
                "vector_weight": 0.6,
                "candidate_multiplier": 4.0,
                "min_score": 0.2,
                "tags": ["reply-style"],
                "target": "memory",
            },
        )

    def test_memory_get_and_capability_use_match_daemon_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.memory_get(
                group_id="g_1",
                actor_id="worker",
                path="state/memory/MEMORY.md",
                offset=10,
                limit=25,
            )
            client.capability_use(
                group_id="g_1",
                actor_id="foreman",
                capability_id="cap.docs",
                tool_name="docs_search",
                tool_arguments={"q": "memory"},
                scope="session",
                by="foreman",
            )

        self.assertEqual(captured[0]["op"], "memory_get")
        self.assertEqual(
            captured[0]["args"],
            {
                "group_id": "g_1",
                "actor_id": "worker",
                "path": "state/memory/MEMORY.md",
                "offset": 10,
                "limit": 25,
            },
        )
        self.assertEqual(captured[1]["op"], "capability_enable")
        self.assertEqual(
            captured[1]["args"],
            {
                "capability_id": "cap.docs",
                "group_id": "g_1",
                "actor_id": "foreman",
                "by": "foreman",
                "scope": "session",
                "enabled": True,
                "cleanup": False,
            },
        )
        self.assertEqual(captured[2]["op"], "capability_tool_call")
        self.assertEqual(
            captured[2]["args"],
            {
                "group_id": "g_1",
                "actor_id": "foreman",
                "by": "foreman",
                "tool_name": "docs_search",
                "arguments": {"q": "memory"},
            },
        )

    def test_explicit_reme_helpers_preserve_low_level_controls(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.memory_reme_search(
                group_id="g_1",
                query="recent decisions",
                max_results=3,
                vector_weight=0.6,
                candidate_multiplier=4.0,
                min_score=0.2,
                sources=["memory"],
            )
            client.memory_reme_get(
                group_id="g_1",
                path="state/memory/MEMORY.md",
                offset=10,
                limit=25,
            )

        self.assertEqual(captured[0]["op"], "memory_reme_search")
        self.assertEqual(
            captured[0]["args"],
            {
                "group_id": "g_1",
                "query": "recent decisions",
                "max_results": 3,
                "vector_weight": 0.6,
                "candidate_multiplier": 4.0,
                "min_score": 0.2,
                "sources": ["memory"],
            },
        )
        self.assertEqual(captured[1]["op"], "memory_reme_get")
        self.assertEqual(
            captured[1]["args"],
            {
                "group_id": "g_1",
                "path": "state/memory/MEMORY.md",
                "offset": 10,
                "limit": 25,
            },
        )

    def test_memory_write_health_and_profile_get_match_daemon_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.memory_write(
                group_id="g_1",
                actor_id="worker",
                target="daily",
                content="user: hi\nassistant: hello",
                tags=["dingtalk-auto-reply"],
                source_refs=["message:m1"],
                idempotency_key="reply:m1",
                dedup_intent="update",
                dedup_query="message m1",
            )
            client.memory_health(group_id="g_1")
            client.memory_profile_get(
                group_id="g_1",
                actor_id="worker",
                user_id="waterbang",
                tags=["dingtalk-profile", "reply-style"],
            )

        self.assertEqual(captured[0]["op"], "memory_write")
        self.assertEqual(
            captured[0]["args"],
            {
                "group_id": "g_1",
                "actor_id": "worker",
                "target": "daily",
                "content": "user: hi\nassistant: hello",
                "tags": ["dingtalk-auto-reply"],
                "source_refs": ["message:m1"],
                "idempotency_key": "reply:m1",
                "dedup_intent": "update",
                "dedup_query": "message m1",
            },
        )
        self.assertEqual(captured[1]["op"], "memory_health")
        self.assertEqual(captured[1]["args"], {"group_id": "g_1"})
        self.assertEqual(captured[2]["op"], "memory_profile_get")
        self.assertEqual(
            captured[2]["args"],
            {
                "group_id": "g_1",
                "actor_id": "worker",
                "user_id": "waterbang",
                "tags": ["dingtalk-profile", "reply-style"],
            },
        )

    def test_capability_use_without_tool_returns_enable_result(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"state": "runnable"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            result = self._client().capability_use(group_id="g_1", capability_id="cap.docs")

        self.assertEqual(result, {"state": "runnable"})
        self.assertEqual(
            captured,
            [
                {
                    "v": 1,
                    "op": "capability_enable",
                    "args": {
                        "group_id": "g_1",
                        "capability_id": "cap.docs",
                        "scope": "session",
                        "enabled": True,
                        "cleanup": False,
                        "by": "user",
                    },
                }
            ],
        )

    def test_actor_add_supports_profile_id(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"actor": {"id": "a1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_add(
                group_id="g_1",
                actor_id="a1",
                profile_id="ap_123",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_add")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("profile_id"), "ap_123")

    def test_actor_add_supports_capability_autoload(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"actor": {"id": "a1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_add(
                group_id="g_1",
                actor_id="a1",
                capability_autoload=["pack:space"],
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_add")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("capability_autoload"), ["pack:space"])

    def test_actor_update_supports_profile_args(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"actor": {"id": "a1"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_update(
                group_id="g_1",
                actor_id="a1",
                patch={},
                profile_action="convert_to_custom",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_update")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("profile_action"), "convert_to_custom")

    def test_actor_profile_upsert_supports_expected_revision(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"profile": {"id": "ap_123"}}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_profile_upsert(
                profile={"name": "codex", "runtime": "codex", "runner": "pty"},
                expected_revision=3,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_profile_upsert")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("expected_revision"), 3)

    def test_actor_profile_secret_update_maps_set_unset(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"profile_id": "ap_123", "keys": ["API_KEY"]}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_profile_secret_update(
                profile_id="ap_123",
                set={"API_KEY": "xxx"},
                unset=["OLD_KEY"],
                clear=False,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_profile_secret_update")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("profile_id"), "ap_123")
        self.assertEqual(args.get("set"), {"API_KEY": "xxx"})
        self.assertEqual(args.get("unset"), ["OLD_KEY"])

    def test_actor_profile_secret_copy_from_actor_maps_args(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"profile_id": "ap_123", "group_id": "g_1", "actor_id": "a1", "keys": []}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_profile_secret_copy_from_actor(
                profile_id="ap_123",
                group_id="g_1",
                actor_id="a1",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_profile_secret_copy_from_actor")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("profile_id"), "ap_123")
        self.assertEqual(args.get("group_id"), "g_1")
        self.assertEqual(args.get("actor_id"), "a1")

    def test_actor_profile_secret_copy_from_profile_maps_args(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"profile_id": "ap_dst", "source_profile_id": "ap_src", "keys": []}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().actor_profile_secret_copy_from_profile(
                profile_id="ap_dst",
                source_profile_id="ap_src",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "actor_profile_secret_copy_from_profile")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("profile_id"), "ap_dst")
        self.assertEqual(args.get("source_profile_id"), "ap_src")

    def test_capability_enable_maps_scope_and_ttl(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"state": "activation_pending"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().capability_enable(
                group_id="g_1",
                capability_id="pack:space",
                scope="session",
                ttl_seconds=600,
                actor_id="foreman",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "capability_enable")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("capability_id"), "pack:space")
        self.assertEqual(args.get("scope"), "session")
        self.assertEqual(args.get("ttl_seconds"), 600)
        self.assertEqual(args.get("actor_id"), "foreman")

    def test_capability_allowlist_get_maps_by(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"revision": "r1"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().capability_allowlist_get(by="user")

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "capability_allowlist_get")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("by"), "user")

    def test_capability_allowlist_validate_maps_patch_mode(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"valid": True}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().capability_allowlist_validate(
                mode="patch",
                patch={"defaults": {"source_level": {"skillsmp_remote": "indexed"}}},
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "capability_allowlist_validate")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("mode"), "patch")
        self.assertEqual(args.get("patch"), {"defaults": {"source_level": {"skillsmp_remote": "indexed"}}})

    def test_capability_allowlist_update_maps_revision_and_overlay(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"updated": True, "revision": "r2"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().capability_allowlist_update(
                mode="replace",
                overlay={"allow": {"packs": ["pack:space"]}},
                expected_revision="r1",
                by="user",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "capability_allowlist_update")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("mode"), "replace")
        self.assertEqual(args.get("overlay"), {"allow": {"packs": ["pack:space"]}})
        self.assertEqual(args.get("expected_revision"), "r1")
        self.assertEqual(args.get("by"), "user")

    def test_capability_allowlist_reset_maps_by(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"reset": True}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().capability_allowlist_reset(by="user")

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "capability_allowlist_reset")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("by"), "user")

    def test_group_space_bind_maps_lane_and_remote_space_id(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"lane": "work"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().group_space_bind(
                group_id="g_1",
                lane="work",
                action="bind",
                remote_space_id="nb_123",
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "group_space_bind")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("lane"), "work")
        self.assertEqual(args.get("action"), "bind")
        self.assertEqual(args.get("remote_space_id"), "nb_123")

    def test_group_space_provider_auth_maps_timeout(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {"provider": "notebooklm"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().group_space_provider_auth(
                provider="notebooklm",
                action="start",
                timeout_seconds=120,
            )

        self.assertEqual(len(captured), 1)
        req = captured[0]
        self.assertEqual(req.get("op"), "group_space_provider_auth")
        args = req.get("args") if isinstance(req.get("args"), dict) else {}
        self.assertEqual(args.get("provider"), "notebooklm")
        self.assertEqual(args.get("action"), "start")
        self.assertEqual(args.get("timeout_seconds"), 120)

    # -----------------------------------------------------------------
    # cccc 0.4.17 alignment — new ops and contract extensions
    # -----------------------------------------------------------------

    def _capture(self, op_result: dict) -> tuple[list[dict], CCCCClient]:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": op_result}

        client = self._client()
        patcher = patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon)
        patcher.start()
        self.addCleanup(patcher.stop)
        return captured, client

    def test_send_includes_refs_and_attachments(self) -> None:
        captured, client = self._capture({"event": {"id": "e_refs"}})
        client.send(
            group_id="g_1",
            text="see ref",
            refs=[{"kind": "task_ref", "task_id": "t_42"}],
            attachments=[{"kind": "file", "path": "blobs/a.txt"}],
            client_id="cl_1",
            insight="Rollback remains unverified.",
            suggested_user_message="Please confirm the rollback evidence.",
        )
        args = captured[0]["args"]
        self.assertEqual(args["refs"], [{"kind": "task_ref", "task_id": "t_42"}])
        self.assertEqual(args["attachments"], [{"kind": "file", "path": "blobs/a.txt"}])
        self.assertEqual(args["client_id"], "cl_1")
        self.assertEqual(args["insight"], "Rollback remains unverified.")
        self.assertEqual(args["suggested_user_message"], "Please confirm the rollback evidence.")

    def test_reply_includes_refs(self) -> None:
        captured, client = self._capture({"event": {"id": "e_r"}})
        client.reply(
            group_id="g_1",
            reply_to="e_origin",
            text="roger",
            refs=[{"kind": "presentation_ref", "slot_id": "slot-1"}],
            insight="The current frame may be too narrow.",
            suggested_user_message="Should we widen the frame?",
        )
        args = captured[0]["args"]
        self.assertEqual(args["refs"], [{"kind": "presentation_ref", "slot_id": "slot-1"}])
        self.assertEqual(args["insight"], "The current frame may be too narrow.")
        self.assertEqual(args["suggested_user_message"], "Should we widen the frame?")

    def test_send_cross_group_uses_only_cross_runtime_message_fields(self) -> None:
        captured, client = self._capture({"src_event": {"id": "s"}, "dst_event": {"id": "d"}})
        client.send_cross_group(
            group_id="g_src",
            dst_group_id="g_dst",
            text="cross",
            insight="The destination should challenge this plan independently.",
        )
        args = captured[0]["args"]
        self.assertNotIn("refs", args)
        self.assertNotIn("attachments", args)
        self.assertEqual(args["insight"], "The destination should challenge this plan independently.")

    def test_actor_add_supports_capability_hidden_and_profile_scope(self) -> None:
        captured, client = self._capture({"actor": {"id": "a1"}})
        client.actor_add(
            group_id="g_1",
            actor_id="a1",
            capability_hidden=["skill:x"],
            profile_scope="user",
            profile_owner="alice",
        )
        args = captured[0]["args"]
        self.assertEqual(args["capability_hidden"], ["skill:x"])
        self.assertEqual(args["profile_scope"], "user")
        self.assertEqual(args["profile_owner"], "alice")

    def test_actor_update_can_set_runtime_state_source_via_patch(self) -> None:
        captured, client = self._capture({"actor": {"id": "a1"}})
        client.actor_update(
            group_id="g_1",
            actor_id="a1",
            patch={"runtime_state_source": "app_server"},
        )
        args = captured[0]["args"]
        self.assertEqual(args["patch"], {"runtime_state_source": "app_server"})

    def test_tracked_send_maps_all_fields(self) -> None:
        captured, client = self._capture({"task_id": "t_1", "event_id": "e_1"})
        client.tracked_send(
            group_id="g_1",
            text="please fix bug",
            insight="We may be optimizing the wrong layer.",
            title="Fix bug",
            to=["@alice"],
            priority="attention",
            task_priority="attention",
            idempotency_key="idem-1",
            outcome="bug closed",
            status="planned",
            waiting_on="actor",
            task_type="standard",
            checklist=[{"label": "repro"}, {"label": "patch"}],
            notes="see ticket",
            blocked_by=["t_0"],
            handoff_to="alice",
            assignee="alice",
            refs=[{"kind": "url", "url": "https://example.com/issue/1"}],
        )
        args = captured[0]["args"]
        self.assertEqual(captured[0]["op"], "tracked_send")
        self.assertEqual(args["title"], "Fix bug")
        self.assertEqual(args["to"], ["@alice"])
        self.assertEqual(args["priority"], "attention")
        self.assertEqual(args["task_priority"], "attention")
        self.assertEqual(args["idempotency_key"], "idem-1")
        self.assertEqual(args["insight"], "We may be optimizing the wrong layer.")
        self.assertEqual(args["outcome"], "bug closed")
        self.assertEqual(args["status"], "planned")
        self.assertEqual(args["waiting_on"], "actor")
        self.assertEqual(args["task_type"], "standard")
        self.assertEqual(args["checklist"], [{"label": "repro"}, {"label": "patch"}])
        self.assertEqual(args["notes"], "see ticket")
        self.assertEqual(args["blocked_by"], ["t_0"])
        self.assertEqual(args["handoff_to"], "alice")
        self.assertEqual(args["assignee"], "alice")
        self.assertEqual(args["refs"], [{"kind": "url", "url": "https://example.com/issue/1"}])

    def test_tracked_send_omits_unset_fields(self) -> None:
        captured, client = self._capture({"task_id": "t_2"})
        client.tracked_send(group_id="g_1", text="quick task")
        args = captured[0]["args"]
        # Only required + always-emitted defaults should be present
        self.assertEqual(args["group_id"], "g_1")
        self.assertEqual(args["text"], "quick task")
        self.assertEqual(args["by"], "user")
        self.assertEqual(args["priority"], "normal")
        self.assertIs(args["reply_required"], True)
        self.assertNotIn("idempotency_key", args)
        self.assertNotIn("checklist", args)
        self.assertNotIn("refs", args)

    def test_task_list_with_and_without_task_id(self) -> None:
        captured, client = self._capture({"tasks": []})
        client.task_list(group_id="g_1")
        self.assertEqual(captured[0]["op"], "task_list")
        self.assertEqual(captured[0]["args"], {"group_id": "g_1"})

        captured.clear()
        client.task_list(group_id="g_1", task_id="t_3")
        self.assertEqual(captured[0]["args"]["task_id"], "t_3")

    def test_headless_ops_map_args(self) -> None:
        captured, client = self._capture({"state": {"status": "idle"}})
        client.headless_status(group_id="g_1", actor_id="a1")
        self.assertEqual(captured[0]["op"], "headless_status")
        self.assertEqual(captured[0]["args"], {"group_id": "g_1", "actor_id": "a1"})

        captured.clear()
        client.headless_set_status(group_id="g_1", actor_id="a1", status="working", task_id="t_9")
        self.assertEqual(captured[0]["op"], "headless_set_status")
        self.assertEqual(captured[0]["args"]["status"], "working")
        self.assertEqual(captured[0]["args"]["task_id"], "t_9")

        captured.clear()
        client.headless_ack_message(group_id="g_1", actor_id="a1", message_id="msg_42")
        self.assertEqual(captured[0]["op"], "headless_ack_message")
        self.assertEqual(captured[0]["args"]["message_id"], "msg_42")

    def test_group_copy_ops(self) -> None:
        captured, client = self._capture({"package_b64": "AAAA"})
        client.group_copy_export(group_id="g_1")
        self.assertEqual(captured[0]["op"], "group_copy_export")
        self.assertEqual(captured[0]["args"], {"group_id": "g_1", "by": "user"})

        captured.clear()
        client.group_copy_export_file(group_id="g_1")
        self.assertEqual(captured[0]["op"], "group_copy_export_file")
        self.assertEqual(captured[0]["args"], {"group_id": "g_1", "by": "user"})

        captured.clear()
        client.group_copy_preview_import(package_b64="ZZZ=")
        self.assertEqual(captured[0]["op"], "group_copy_preview_import")
        self.assertEqual(captured[0]["args"], {"package_b64": "ZZZ="})

        captured.clear()
        client.group_copy_preview_import(package_path="/tmp/group.zip")
        self.assertEqual(captured[0]["args"], {"package_path": "/tmp/group.zip"})

        captured.clear()
        client.group_copy_import(package_b64="ZZZ=", workspace_root="/tmp/x", title="Restored")
        self.assertEqual(captured[0]["op"], "group_copy_import")
        self.assertEqual(captured[0]["args"]["workspace_root"], "/tmp/x")
        self.assertEqual(captured[0]["args"]["title"], "Restored")

        captured.clear()
        client.group_copy_import(package_path="/tmp/group.zip", title="Restored from file")
        self.assertEqual(captured[0]["args"]["package_path"], "/tmp/group.zip")
        self.assertEqual(captured[0]["args"]["title"], "Restored from file")

        with self.assertRaisesRegex(ValueError, "exactly one"):
            client.group_copy_preview_import()
        with self.assertRaisesRegex(ValueError, "exactly one"):
            client.group_copy_import(package_b64="A", package_path="/tmp/group.zip")

    def test_cccc_0_4_32_lifecycle_delta_maps_args(self) -> None:
        captured, client = self._capture({"ok": True})
        client.actor_new_session(group_id="g_1", actor_id="grok-1", by="user")
        self.assertEqual(captured[0]["op"], "actor_new_session")
        self.assertEqual(captured[0]["args"]["actor_id"], "grok-1")

        captured.clear()
        client.group_reset(group_id="g_1", confirm="g_1", by="user")
        self.assertEqual(captured[0]["op"], "group_reset")
        self.assertEqual(captured[0]["args"]["confirm"], "g_1")

        with self.assertRaisesRegex(ValueError, "confirm"):
            client.group_reset(group_id="g_1", confirm="g_wrong")

    def test_group_preamble_contract_maps_and_validates_args(self) -> None:
        captured, client = self._capture({"source": "builtin", "content": "Startup"})

        client.group_preamble_get(group_id="g_1")
        self.assertEqual(captured[0]["op"], "group_preamble_get")
        self.assertEqual(captured[0]["args"], {"group_id": "g_1"})

        captured.clear()
        client.group_preamble_set(
            group_id="g_1",
            content="Wait for the targeted mission.\n",
            by="user",
        )
        self.assertEqual(captured[0]["op"], "group_preamble_set")
        self.assertEqual(captured[0]["args"]["content"], "Wait for the targeted mission.\n")

        captured.clear()
        client.group_preamble_reset(group_id="g_1", confirm="preamble", by="user")
        self.assertEqual(captured[0]["op"], "group_preamble_reset")
        self.assertEqual(captured[0]["args"]["confirm"], "preamble")

        with self.assertRaisesRegex(ValueError, "non-empty"):
            client.group_preamble_set(group_id="g_1", content="  ")
        with self.assertRaisesRegex(ValueError, "512 KiB"):
            client.group_preamble_set(group_id="g_1", content="x" * (512 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, "confirm"):
            client.group_preamble_reset(group_id="g_1", confirm="wrong")

    def test_capability_extensions(self) -> None:
        captured, client = self._capture({"action_id": "cv_1"})
        client.capability_visibility(
            group_id="g_1",
            capability_id="skill:x",
            hidden=True,
            actor_id="a1",
            reason="dup",
            by="a1",
        )
        self.assertEqual(captured[0]["op"], "capability_visibility")
        self.assertEqual(captured[0]["args"]["capability_id"], "skill:x")
        self.assertIs(captured[0]["args"]["hidden"], True)
        self.assertEqual(captured[0]["args"]["reason"], "dup")

        captured.clear()
        client.capability_install_target(
            group_id="g_1",
            target="github:owner/repo",
            actor_id="a1",
            scope="session",
            ttl_seconds=600,
            reason="trial",
        )
        self.assertEqual(captured[0]["op"], "capability_install_target")
        self.assertEqual(captured[0]["args"]["target"], "github:owner/repo")
        self.assertEqual(captured[0]["args"]["scope"], "session")
        self.assertEqual(captured[0]["args"]["ttl_seconds"], 600)

        captured.clear()
        client.capability_source_delete(
            group_id="g_1", source_id="github_import", reason="remove stale import"
        )
        self.assertEqual(captured[0]["op"], "capability_source_delete")
        self.assertEqual(captured[0]["args"]["source_id"], "github_import")
        self.assertEqual(captured[0]["args"]["reason"], "remove stale import")
        self.assertNotIn("source_instance_key", captured[0]["args"])

    def test_presentation_ops(self) -> None:
        captured, client = self._capture({"presentation": {}})
        client.presentation_get(group_id="g_1")
        self.assertEqual(captured[0]["op"], "presentation_get")

        captured.clear()
        client.presentation_publish(
            group_id="g_1",
            slot="slot-1",
            title="Demo",
            card_type="markdown",
            content="# hi",
        )
        self.assertEqual(captured[0]["op"], "presentation_publish")
        self.assertEqual(captured[0]["args"]["slot"], "slot-1")
        self.assertEqual(captured[0]["args"]["card_type"], "markdown")
        self.assertEqual(captured[0]["args"]["content"], "# hi")

        captured.clear()
        client.presentation_clear(group_id="g_1", slot="slot-1")
        self.assertEqual(captured[0]["op"], "presentation_clear")
        self.assertEqual(captured[0]["args"]["slot"], "slot-1")

        captured.clear()
        client.presentation_browser_open(
            group_id="g_1", slot="slot-1", url="https://example.com", width=1024, height=768
        )
        self.assertEqual(captured[0]["op"], "presentation_browser_open")
        self.assertEqual(captured[0]["args"]["url"], "https://example.com")
        self.assertEqual(captured[0]["args"]["width"], 1024)

        captured.clear()
        client.presentation_browser_info(group_id="g_1", slot="slot-1")
        self.assertEqual(captured[0]["op"], "presentation_browser_info")

        captured.clear()
        client.presentation_browser_close(group_id="g_1", slot="slot-1")
        self.assertEqual(captured[0]["op"], "presentation_browser_close")

    def test_assistant_ops(self) -> None:
        captured, client = self._capture({"assistant": {}})
        client.assistant_state(group_id="g_1", assistant_id="voice_secretary")
        self.assertEqual(captured[0]["op"], "assistant_state")
        self.assertEqual(captured[0]["args"]["assistant_id"], "voice_secretary")

        captured.clear()
        client.assistant_settings_update(
            group_id="g_1",
            assistant_id="voice_secretary",
            patch={"enabled": True},
        )
        self.assertEqual(captured[0]["op"], "assistant_settings_update")
        self.assertEqual(captured[0]["args"]["patch"], {"enabled": True})

        captured.clear()
        client.assistant_status_update(
            group_id="g_1",
            assistant_id="voice_secretary",
            lifecycle="working",
            health={"ok": True},
        )
        self.assertEqual(captured[0]["op"], "assistant_status_update")
        self.assertEqual(captured[0]["args"]["lifecycle"], "working")
        self.assertEqual(captured[0]["args"]["health"], {"ok": True})

    def test_daemon_core_ops(self) -> None:
        captured, client = self._capture({"observability": {}})
        client.observability_get()
        self.assertEqual(captured[0]["op"], "observability_get")

        captured.clear()
        client.observability_update(patch={"log_level": "info"})
        self.assertEqual(captured[0]["op"], "observability_update")
        self.assertEqual(captured[0]["args"]["patch"], {"log_level": "info"})

        captured.clear()
        client.branding_get()
        self.assertEqual(captured[0]["op"], "branding_get")

        captured.clear()
        client.branding_update(patch={"product_name": "Demo"})
        self.assertEqual(captured[0]["op"], "branding_update")
        self.assertEqual(captured[0]["args"]["patch"], {"product_name": "Demo"})

        captured.clear()
        client.shutdown()
        self.assertEqual(captured[0]["op"], "shutdown")

    def test_diagnostics_ops(self) -> None:
        captured, client = self._capture({"snapshot": {}})
        client.debug_snapshot(group_id="g_1")
        self.assertEqual(captured[0]["op"], "debug_snapshot")

        captured.clear()
        client.debug_tail_logs(component="daemon", lines=50)
        self.assertEqual(captured[0]["op"], "debug_tail_logs")
        self.assertEqual(captured[0]["args"]["component"], "daemon")
        self.assertEqual(captured[0]["args"]["lines"], 50)

        captured.clear()
        client.debug_clear_logs(component="web")
        self.assertEqual(captured[0]["op"], "debug_clear_logs")

        captured.clear()
        client.terminal_tail(group_id="g_1", actor_id="a1", max_chars=4000)
        self.assertEqual(captured[0]["op"], "terminal_tail")
        self.assertEqual(captured[0]["args"]["max_chars"], 4000)
        self.assertIs(captured[0]["args"]["strip_ansi"], True)

        captured.clear()
        client.terminal_history(
            group_id="g_1",
            actor_id="a1",
            before=12_000,
            limit_bytes=32_000,
            strip_ansi=True,
            compact=True,
        )
        self.assertEqual(captured[0]["op"], "terminal_history")
        self.assertEqual(captured[0]["args"]["before"], 12_000)
        self.assertEqual(captured[0]["args"]["limit_bytes"], 32_000)
        self.assertIs(captured[0]["args"]["strip_ansi"], True)

        captured.clear()
        client.terminal_clear(group_id="g_1", actor_id="a1")
        self.assertEqual(captured[0]["op"], "terminal_clear")

    def test_maintenance_ops(self) -> None:
        captured, client = self._capture({"reason": "manual"})
        client.ledger_snapshot(group_id="g_1", reason="manual")
        self.assertEqual(captured[0]["op"], "ledger_snapshot")
        self.assertEqual(captured[0]["args"]["reason"], "manual")

        captured.clear()
        client.ledger_compact(group_id="g_1", force=True)
        self.assertEqual(captured[0]["op"], "ledger_compact")
        self.assertIs(captured[0]["args"]["force"], True)

    def test_stream_emit_and_system_notify(self) -> None:
        captured, client = self._capture({"event": {}, "stream_id": "s1"})
        client.stream_emit(group_id="g_1", op="start", by="a1", text="hello", seq=1)
        self.assertEqual(captured[0]["op"], "stream_emit")
        self.assertEqual(captured[0]["args"]["op"], "start")
        self.assertEqual(captured[0]["args"]["seq"], 1)
        self.assertEqual(captured[0]["args"]["format"], "plain")

        captured.clear()
        client.system_notify(
            group_id="g_1",
            message="hello",
            title="Heads up",
            kind="info",
            requires_ack=True,
            target_actor_id="a1",
        )
        self.assertEqual(captured[0]["op"], "system_notify")
        self.assertEqual(captured[0]["args"]["title"], "Heads up")
        self.assertIs(captured[0]["args"]["requires_ack"], True)
        self.assertEqual(captured[0]["args"]["target_actor_id"], "a1")

    def test_admin_ops(self) -> None:
        captured, client = self._capture({"removed_group_ids": []})
        client.registry_reconcile(remove_missing=True)
        self.assertEqual(captured[0]["op"], "registry_reconcile")
        self.assertIs(captured[0]["args"]["remove_missing"], True)

        captured.clear()
        client.group_detach_scope(group_id="g_1", scope_key="scope_a")
        self.assertEqual(captured[0]["op"], "group_detach_scope")
        self.assertEqual(captured[0]["args"]["scope_key"], "scope_a")

    def test_cccc_0_4_18_runtime_and_voice_ops(self) -> None:
        captured, client = self._capture({"ok": True})

        client.runtime_hermes_status()
        self.assertEqual(captured[0]["op"], "runtime_hermes_status")
        self.assertEqual(captured[0]["args"], {})

        captured.clear()
        client.runtime_hermes_prepare(cwd="/repo", auto_enable_tools=True, force_mcp=True)
        self.assertEqual(captured[0]["op"], "runtime_hermes_prepare")
        self.assertEqual(
            captured[0]["args"],
            {"cwd": "/repo", "auto_enable_tools": True, "force_mcp": True},
        )

        captured.clear()
        client.runtime_hermes_mcp_test(cwd="/repo", group_id="g_1", actor_id="hermes-1")
        self.assertEqual(captured[0]["op"], "runtime_hermes_mcp_test")
        self.assertEqual(
            captured[0]["args"],
            {"cwd": "/repo", "group_id": "g_1", "actor_id": "hermes-1"},
        )

        captured.clear()
        client.assistant_voice_recording_lease(
            group_id="g_1",
            action="acquire",
            owner_id="tab-1",
            ttl_seconds=30,
            capture_mode="push_to_talk",
            recognition_backend="browser",
        )
        self.assertEqual(captured[0]["op"], "assistant_voice_recording_lease")
        self.assertEqual(
            captured[0]["args"],
            {
                "group_id": "g_1",
                "action": "acquire",
                "by": "user",
                "owner_id": "tab-1",
                "ttl_seconds": 30,
                "capture_mode": "push_to_talk",
                "recognition_backend": "browser",
            },
        )


if __name__ == "__main__":
    unittest.main()
