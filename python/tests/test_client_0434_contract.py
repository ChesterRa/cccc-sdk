from __future__ import annotations

import unittest
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
from cccc_sdk.errors import (
    DaemonAPIError,
    DaemonConnectionError,
    DaemonUnavailableError,
    IncompatibleDaemonError,
)
from cccc_sdk.transport import DaemonEndpoint


class TestClient0434Contract(unittest.TestCase):
    def _endpoint(self, port: int = 9000) -> DaemonEndpoint:
        return DaemonEndpoint(transport="tcp", host="127.0.0.1", port=port)

    def _client(self) -> CCCCClient:
        return CCCCClient(endpoint=self._endpoint())

    def test_new_terminal_and_web_model_ops_match_the_daemon_contract(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {"v": 1, "ok": True, "result": {}}

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            client = self._client()
            client.terminal_snapshot(
                group_id="g_1",
                actor_id="web-1",
                by="user",
                limit_bytes=4096,
            )
            client.web_model_delivery_preferences_get(group_id="g_1", actor_id="web-1")
            client.web_model_delivery_preferences_update(
                group_id="g_1",
                actor_id="web-1",
                mode="image_compat",
            )
            client.web_model_runtime_recover_turn(
                group_id="g_1",
                actor_id="web-1",
                event_ids=["e_1", "e_2"],
            )
            client.blueprint_generate(
                task_id="t_1",
                task_name="Release",
                task_goal="Ship safely",
                theme_hint="shield",
            )

        self.assertEqual(
            [request["op"] for request in captured],
            [
                "terminal_snapshot",
                "web_model_delivery_preferences_get",
                "web_model_delivery_preferences_update",
                "web_model_runtime_recover_turn",
                "blueprint_generate",
            ],
        )
        self.assertEqual(captured[0]["args"]["limit_bytes"], 4096)
        self.assertEqual(captured[2]["args"]["mode"], "image_compat")
        self.assertEqual(captured[3]["args"]["event_ids"], ["e_1", "e_2"])
        self.assertEqual(
            captured[4]["args"],
            {
                "task_id": "t_1",
                "task_name": "Release",
                "task_goal": "Ship safely",
                "theme_hint": "shield",
            },
        )

    def test_new_web_model_options_are_validated_before_transport(self) -> None:
        client = self._client()
        with self.assertRaisesRegex(ValueError, "mode"):
            client.web_model_delivery_preferences_update(
                group_id="g_1",
                actor_id="web-1",
                mode="clipboard",
            )
        with self.assertRaisesRegex(ValueError, "event_ids"):
            client.web_model_runtime_recover_turn(
                group_id="g_1",
                actor_id="web-1",
                event_ids=[],
            )

    def test_term_resize_prefers_the_standard_operation(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            return {
                "v": 1,
                "ok": True,
                "result": {
                    "group_id": "g_1",
                    "actor_id": "a_1",
                    "cols": 120,
                    "rows": 40,
                },
            }

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            self._client().term_resize(group_id="g_1", actor_id="a_1", cols=120, rows=40)

        self.assertEqual([request["op"] for request in captured], ["term_resize"])

    def test_term_resize_falls_back_only_after_structured_unknown_op(self) -> None:
        captured: list[dict] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            captured.append(request)
            if request["op"] == "term_resize":
                return {
                    "v": 1,
                    "ok": False,
                    "error": {"code": "unknown_op", "message": "unknown", "details": {}},
                }
            return {
                "v": 1,
                "ok": True,
                "result": {"resized": True, "cols": 120, "rows": 40},
            }

        with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
            result = self._client().term_resize(
                group_id="g_1", actor_id="a_1", cols=120, rows=40
            )

        self.assertEqual(
            [request["op"] for request in captured],
            ["term_resize", "terminal_resize"],
        )
        self.assertEqual(
            result,
            {"group_id": "g_1", "actor_id": "a_1", "cols": 120, "rows": 40},
        )

        with patch(
            "cccc_sdk.client.call_daemon",
            return_value={
                "v": 1,
                "ok": False,
                "error": {"code": "permission_denied", "message": "denied", "details": {}},
            },
        ) as transport:
            with self.assertRaises(DaemonAPIError):
                self._client().term_resize(group_id="g_1", actor_id="a_1", cols=120, rows=40)
        self.assertEqual(transport.call_count, 1)

    def test_compatibility_probe_accepts_the_bounded_resize_alias(self) -> None:
        operations: list[str] = []

        def fake_call_raw(op: str, args: dict) -> dict:
            operations.append(op)
            if op == "ping":
                return {"v": 1, "ok": True, "result": {"ipc_v": 1, "capabilities": {}}}
            if op == "term_resize":
                raise DaemonAPIError(code="unknown_op", message="unknown", details={})
            if op == "terminal_resize":
                raise DaemonAPIError(code="invalid_request", message="missing args", details={})
            raise AssertionError(op)

        client = self._client()
        with patch.object(client, "call_raw", side_effect=fake_call_raw):
            client.assert_compatible(require_ops=["term_resize"])
        self.assertEqual(operations, ["ping", "term_resize", "terminal_resize"])

    def test_compatibility_probe_skips_side_effectful_optional_arg_operations(self) -> None:
        operations: list[str] = []

        def fake_call_raw(op: str, args: dict) -> dict:
            operations.append(op)
            if op == "ping":
                return {"v": 1, "ok": True, "result": {"ipc_v": 1, "capabilities": {}}}
            raise AssertionError(f"unsafe compatibility probe: {op}")

        client = self._client()
        with patch.object(client, "call_raw", side_effect=fake_call_raw):
            client.assert_compatible(
                require_ops=[
                    "group_create",
                    "registry_reconcile",
                    "capability_allowlist_reset",
                    "remote_access_start",
                    "group_space_provider_auth",
                ]
            )
        self.assertEqual(operations, ["ping"])

    def test_explicit_unsupported_response_version_is_rejected(self) -> None:
        with patch(
            "cccc_sdk.client.call_daemon",
            return_value={"v": 2, "ok": True, "result": {}},
        ):
            with self.assertRaisesRegex(IncompatibleDaemonError, "unsupported IPC version"):
                self._client().ping()

    def test_auto_discovered_endpoint_is_refreshed_only_before_exchange(self) -> None:
        old_endpoint = self._endpoint(9001)
        new_endpoint = self._endpoint(9002)
        calls: list[DaemonEndpoint] = []

        def fake_call_daemon(*, endpoint, request, timeout_s):  # type: ignore[no-untyped-def]
            calls.append(endpoint)
            if len(calls) == 1:
                raise DaemonConnectionError("connection refused")
            return {"v": 1, "ok": True, "result": {}}

        with patch(
            "cccc_sdk.client.discover_endpoint", side_effect=[old_endpoint, new_endpoint]
        ) as discover:
            with patch("cccc_sdk.client.call_daemon", side_effect=fake_call_daemon):
                client = CCCCClient(cccc_home="/tmp/cccc-sdk-test")
                client.ping()

        self.assertEqual(calls, [old_endpoint, new_endpoint])
        self.assertEqual(client.endpoint, new_endpoint)
        self.assertEqual(discover.call_count, 2)

        with patch("cccc_sdk.client.discover_endpoint", return_value=old_endpoint) as discover:
            with patch(
                "cccc_sdk.client.call_daemon",
                side_effect=DaemonUnavailableError("connection closed after write"),
            ):
                client = CCCCClient(cccc_home="/tmp/cccc-sdk-test")
                with self.assertRaises(DaemonUnavailableError):
                    client.ping()
        self.assertEqual(discover.call_count, 1)

    def test_explicit_endpoint_is_never_rediscovered(self) -> None:
        with patch("cccc_sdk.client.discover_endpoint") as discover:
            with patch(
                "cccc_sdk.client.call_daemon",
                side_effect=DaemonConnectionError("connection refused"),
            ) as transport:
                with self.assertRaises(DaemonConnectionError):
                    self._client().ping()
        discover.assert_not_called()
        self.assertEqual(transport.call_count, 1)


if __name__ == "__main__":
    unittest.main()
