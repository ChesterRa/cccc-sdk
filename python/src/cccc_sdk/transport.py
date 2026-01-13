from __future__ import annotations

import json
import os
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from .errors import DaemonUnavailableError


MAX_DAEMON_LINE_BYTES = 4_000_000  # 4MB safety limit (match CCCC)


@dataclass(frozen=True)
class DaemonEndpoint:
    transport: str  # "unix" | "tcp"
    path: str = ""
    host: str = ""
    port: int = 0


def _default_home() -> Path:
    raw = str(os.environ.get("CCCC_HOME") or "").strip()
    if raw:
        return Path(raw).expanduser()
    return Path.home() / ".cccc"


def discover_endpoint(home: Optional[Path] = None) -> DaemonEndpoint:
    """Discover the daemon endpoint (best-effort).

    Mirrors CCCC's behavior:
    - Prefer `${home}/daemon/ccccd.addr.json` if present and valid.
    - Fall back to AF_UNIX `${home}/daemon/ccccd.sock` when supported.
    """
    h = (home or _default_home()).expanduser()
    addr_path = h / "daemon" / "ccccd.addr.json"
    sock_path = h / "daemon" / "ccccd.sock"

    try:
        doc = json.loads(addr_path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        doc = None

    if isinstance(doc, dict):
        transport = str(doc.get("transport") or "").strip().lower()
        if transport == "tcp":
            try:
                host = str(doc.get("host") or "").strip() or "127.0.0.1"
                port = int(doc.get("port") or 0)
            except Exception:
                host, port = "127.0.0.1", 0
            if port > 0:
                # CCCC clients always connect to loopback even if daemon bound to 0.0.0.0.
                if host in ("", "localhost", "0.0.0.0"):
                    host = "127.0.0.1"
                if ":" in host:
                    host = "127.0.0.1"
                return DaemonEndpoint(transport="tcp", host=host, port=port)
        if transport == "unix":
            p = str(doc.get("path") or "").strip()
            if p:
                return DaemonEndpoint(transport="unix", path=p)

    if getattr(socket, "AF_UNIX", None) is not None:
        return DaemonEndpoint(transport="unix", path=str(sock_path))

    return DaemonEndpoint(transport="")


def _connect(endpoint: DaemonEndpoint, *, timeout_s: float) -> socket.socket:
    if endpoint.transport == "tcp":
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout_s)
        s.connect((endpoint.host or "127.0.0.1", int(endpoint.port or 0)))
        return s
    if endpoint.transport == "unix":
        af_unix = getattr(socket, "AF_UNIX", None)
        if af_unix is None:
            raise DaemonUnavailableError("AF_UNIX is not supported on this platform")
        s = socket.socket(af_unix, socket.SOCK_STREAM)
        s.settimeout(timeout_s)
        s.connect(endpoint.path)
        return s
    raise DaemonUnavailableError("daemon endpoint is not available")


def call_daemon(
    *,
    endpoint: DaemonEndpoint,
    request: Dict[str, Any],
    timeout_s: float,
) -> Dict[str, Any]:
    """Send one IPC request and return one IPC response (dict)."""
    try:
        s = _connect(endpoint, timeout_s=timeout_s)
    except Exception as e:
        raise DaemonUnavailableError(str(e)) from e

    try:
        payload = (json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8")
        s.sendall(payload)
        with s.makefile("rb") as f:
            line = f.readline(MAX_DAEMON_LINE_BYTES)
        try:
            return json.loads(line.decode("utf-8", errors="replace"))
        except Exception as e:
            raise DaemonUnavailableError(f"invalid daemon response (not json): {e}") from e
    finally:
        try:
            s.close()
        except Exception:
            pass


def open_events_stream(
    *,
    endpoint: DaemonEndpoint,
    request: Dict[str, Any],
    timeout_s: float,
) -> Tuple[socket.socket, Any]:
    """Open a streaming connection and return (socket, fileobj).

    Caller is responsible for closing the socket.
    """
    try:
        s = _connect(endpoint, timeout_s=timeout_s)
    except Exception as e:
        raise DaemonUnavailableError(str(e)) from e

    payload = (json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8")
    s.sendall(payload)
    f = s.makefile("rb")
    return s, f

