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


if __name__ == "__main__":
    unittest.main()
