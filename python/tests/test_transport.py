from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from cccc_sdk.transport import DaemonEndpoint, discover_endpoint


class TestTransportDiscovery(unittest.TestCase):
    def test_discover_unix_from_addr_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"transport": "unix", "path": "/tmp/ccccd.sock"}), encoding="utf-8"
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep.transport, "unix")
            self.assertEqual(ep.path, "/tmp/ccccd.sock")

    def test_discover_tcp_from_addr_json(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            (home / "daemon").mkdir(parents=True, exist_ok=True)
            (home / "daemon" / "ccccd.addr.json").write_text(
                json.dumps({"transport": "tcp", "host": "127.0.0.1", "port": 12345}), encoding="utf-8"
            )
            ep = discover_endpoint(home)
            self.assertEqual(ep, DaemonEndpoint(transport="tcp", host="127.0.0.1", port=12345))


if __name__ == "__main__":
    unittest.main()

