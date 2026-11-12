from unittest import TestCase
from unittest.mock import patch

from cccc_sdk.client import CCCCClient
from cccc_sdk.transport import DaemonEndpoint


class BacklogSourceTest(TestCase):
    def test_backlog_support_checks_send_only_empty_arguments(self):
        requests = []
        client = CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1))
        operations = [f"backlog_{action}" for action in ["get", "use", "create", "exclude", "add", "edit", "move", "close", "promote"]]

        def capture(**kwargs):
            request = kwargs["request"]
            requests.append(request)
            if request["op"] == "ping":
                return {"ok": True, "result": {"ipc_v": 1, "capabilities": {}}}
            return {"ok": False, "error": {"code": "invalid_args", "message": "group_id required"}}

        with patch("cccc_sdk.client.call_daemon", side_effect=capture):
            client.assert_compatible(require_ops=operations)
        self.assertEqual([r["op"] for r in requests[1:]], operations)
        self.assertTrue(all(r["args"] == {} for r in requests[1:]))

    def test_source_omission_and_null_have_different_meanings(self):
        calls = []
        client = CCCCClient(endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1))
        source = {"scope_key": "s_project", "path": "BACKLOG.md", "entry_id": "abcdef123456"}

        def capture(**kwargs):
            calls.append(kwargs["request"])
            return {"ok": True, "result": {"changes": []}}

        with patch("cccc_sdk.client.call_daemon", side_effect=capture):
            client.task_create(group_id="g", title="iteration", source=source)
            client.task_update(group_id="g", task_id="T001", title="rename")
            client.task_update(group_id="g", task_id="T001", source=None)
        self.assertEqual(calls[0]["args"]["ops"][0]["source"], source)
        self.assertNotIn("source", calls[1]["args"]["ops"][0])
        self.assertIsNone(calls[2]["args"]["ops"][0]["source"])
