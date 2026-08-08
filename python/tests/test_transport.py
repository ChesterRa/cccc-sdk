from __future__ import annotations

import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from cccc_sdk.errors import (
    DaemonConnectionError,
    DaemonUnavailableError,
    IncompatibleDaemonError,
    OutcomeUnknownError,
    RequestTooLargeError,
)
from cccc_sdk.transport import DaemonEndpoint, _connect, call_daemon, discover_endpoint


class TestTransportDiscovery(unittest.TestCase):
    def test_discover_unix_from_addr_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"v": 1, "transport": "unix", "path": "/tmp/ccccd.sock"}), encoding="utf-8"
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep.transport, "unix")
            self.assertEqual(ep.path, "/tmp/ccccd.sock")

    def test_discover_tcp_from_addr_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"v": 1, "transport": "tcp", "host": "127.0.0.1", "port": 12345}), encoding="utf-8"
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep, DaemonEndpoint(transport="tcp", host="127.0.0.1", port=12345))

    def test_preserves_connectable_ipv6_host(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"v": 1, "transport": "tcp", "host": "::1", "port": 12345}),
                encoding="utf-8",
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep, DaemonEndpoint(transport="tcp", host="::1", port=12345))

    def test_normalizes_ipv6_wildcard_to_ipv6_loopback(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"v": 1, "transport": "tcp", "host": "[::]", "port": 12345}),
                encoding="utf-8",
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep, DaemonEndpoint(transport="tcp", host="::1", port=12345))

    def test_descriptor_without_v1_falls_back_instead_of_being_trusted(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"transport": "tcp", "host": "192.0.2.1", "port": 12345}),
                encoding="utf-8",
            )
            endpoint = discover_endpoint(home)
            self.assertEqual(endpoint.transport, "unix")
            self.assertEqual(endpoint.path, str(home / "daemon" / "ccccd.sock"))


class TestTransportExchange(unittest.TestCase):
    def _socket_with_response(self, response: bytes) -> Mock:
        socket = Mock()
        socket.makefile.return_value = io.BytesIO(response)
        return socket

    def test_rejects_oversized_request_before_connecting(self) -> None:
        with patch("cccc_sdk.transport._connect") as connect:
            with self.assertRaises(RequestTooLargeError):
                call_daemon(
                    endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1),
                    request={"v": 1, "op": "send", "args": {"text": "x" * 2_000_000}},
                    timeout_s=1,
                )
        connect.assert_not_called()

    def test_invalid_endpoint_preserves_the_real_pre_write_error(self) -> None:
        with self.assertRaises(DaemonConnectionError) as raised:
            call_daemon(
                endpoint=DaemonEndpoint(transport=""),
                request={"v": 1, "op": "ping", "args": {}},
                timeout_s=1,
            )
        self.assertEqual(str(raised.exception), "daemon endpoint is not available")
        self.assertIsInstance(raised.exception.__cause__, DaemonUnavailableError)

    def test_tcp_connect_uses_address_family_agnostic_resolution(self) -> None:
        expected_socket = Mock()
        with patch(
            "cccc_sdk.transport.socket.create_connection",
            return_value=expected_socket,
        ) as create_connection:
            connected = _connect(
                DaemonEndpoint(transport="tcp", host="::1", port=43123),
                timeout_s=2.5,
            )
        self.assertIs(connected, expected_socket)
        create_connection.assert_called_once_with(("::1", 43123), timeout=2.5)

    def test_marks_empty_post_write_response_as_outcome_unknown(self) -> None:
        socket = self._socket_with_response(b"")
        with patch("cccc_sdk.transport._connect", return_value=socket):
            with self.assertRaises(OutcomeUnknownError) as raised:
                call_daemon(
                    endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1),
                    request={"v": 1, "op": "group_create", "args": {}},
                    timeout_s=1,
                )
        self.assertEqual(raised.exception.op, "group_create")
        socket.sendall.assert_called_once()

    def test_marks_non_object_post_write_response_as_outcome_unknown(self) -> None:
        for response in (b"[]\n", b'"scalar"\n'):
            with self.subTest(response=response):
                socket = self._socket_with_response(response)
                with patch("cccc_sdk.transport._connect", return_value=socket):
                    with self.assertRaises(OutcomeUnknownError) as raised:
                        call_daemon(
                            endpoint=DaemonEndpoint(
                                transport="tcp",
                                host="127.0.0.1",
                                port=1,
                            ),
                            request={"v": 1, "op": "group_create", "args": {}},
                            timeout_s=1,
                        )
                self.assertEqual(raised.exception.op, "group_create")
                socket.sendall.assert_called_once()

    def test_requires_v1_on_real_transport_responses(self) -> None:
        socket = self._socket_with_response(b'{"ok":true,"result":{}}\n')
        with patch("cccc_sdk.transport._connect", return_value=socket):
            with self.assertRaises(IncompatibleDaemonError):
                call_daemon(
                    endpoint=DaemonEndpoint(transport="tcp", host="127.0.0.1", port=1),
                    request={"v": 1, "op": "ping", "args": {}},
                    timeout_s=1,
                )


if __name__ == "__main__":
    unittest.main()
