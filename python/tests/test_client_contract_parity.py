from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
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
            },
        )

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
            client.memory_search(group_id="g_1", query="recent decisions", limit=3, vector_weight=0.2)

        self.assertEqual(captured[0]["op"], "capability_search")
        self.assertEqual(
            captured[0]["args"],
            {
                "query": "docs",
                "group_id": "g_1",
                "actor_id": "foreman",
                "include_external": True,
                "trust_tier": "local",
                "limit": 5,
            },
        )
        self.assertEqual(captured[1]["op"], "memory_reme_search")
        self.assertEqual(
            captured[1]["args"],
            {
                "group_id": "g_1",
                "query": "recent decisions",
                "max_results": 3,
                "vector_weight": 0.2,
            },
        )

    def test_memory_get_and_capability_use_match_daemon_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.memory_get(group_id="g_1", path="state/memory/MEMORY.md", offset=10, limit=25)
            client.capability_use(
                group_id="g_1",
                actor_id="foreman",
                capability_id="cap.docs",
                tool_name="docs_search",
                tool_arguments={"q": "memory"},
                scope="session",
                by="foreman",
            )

        self.assertEqual(captured[0]["op"], "memory_reme_get")
        self.assertEqual(
            captured[0]["args"],
            {"group_id": "g_1", "path": "state/memory/MEMORY.md", "offset": 10, "limit": 25},
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
            [{"v": 1, "op": "capability_enable", "args": {"capability_id": "cap.docs", "group_id": "g_1"}}],
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


if __name__ == "__main__":
    unittest.main()
