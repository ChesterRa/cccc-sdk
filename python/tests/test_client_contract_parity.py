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


if __name__ == "__main__":
    unittest.main()
