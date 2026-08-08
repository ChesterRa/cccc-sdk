from __future__ import annotations

import json
import os
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from .errors import (
    DaemonConnectionError,
    DaemonUnavailableError,
    IncompatibleDaemonError,
    OutcomeUnknownError,
    RequestTooLargeError,
)


MAX_DAEMON_LINE_BYTES = 4_000_000  # 4MB safety limit (match CCCC)
MAX_DAEMON_REQUEST_BYTES = 2_000_000


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


def _normalize_tcp_connect_host(raw_host: str) -> str:
    host = str(raw_host or "").strip()
    if host.startswith("[") and host.endswith("]"):
        host = host[1:-1].strip()
    if host in ("", "localhost", "0.0.0.0"):
        return "127.0.0.1"
    if host == "::":
        return "::1"
    return host


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

    if isinstance(doc, dict) and doc.get("v") == 1:
        transport = str(doc.get("transport") or "").strip().lower()
        if transport == "tcp":
            try:
                host = str(doc.get("host") or "").strip() or "127.0.0.1"
                port = int(doc.get("port") or 0)
            except Exception:
                host, port = "127.0.0.1", 0
            if 0 < port <= 65_535:
                host = _normalize_tcp_connect_host(host)
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
        return socket.create_connection(
            (endpoint.host or "127.0.0.1", int(endpoint.port or 0)),
            timeout=timeout_s,
        )
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
    payload = (json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8")
    if len(payload) > MAX_DAEMON_REQUEST_BYTES:
        raise RequestTooLargeError(
            f"daemon request exceeds {MAX_DAEMON_REQUEST_BYTES} bytes"
        )
    try:
        s = _connect(endpoint, timeout_s=timeout_s)
    except Exception as e:
        raise DaemonConnectionError(str(e)) from e

    try:
        s.sendall(payload)
        with s.makefile("rb") as f:
            line = f.readline(MAX_DAEMON_LINE_BYTES + 1)
        if not line:
            raise OutcomeUnknownError(op=str(request.get("op") or ""), message="empty response")
        if len(line) > MAX_DAEMON_LINE_BYTES:
            raise OutcomeUnknownError(
                op=str(request.get("op") or ""),
                message=f"response exceeds {MAX_DAEMON_LINE_BYTES} bytes",
            )
        try:
            response = json.loads(line.decode("utf-8", errors="replace"))
        except Exception as e:
            raise OutcomeUnknownError(
                op=str(request.get("op") or ""),
                message=f"invalid daemon response (not json): {e}",
            ) from e
        if not isinstance(response, dict):
            raise OutcomeUnknownError(
                op=str(request.get("op") or ""),
                message="daemon response must be a JSON object",
            )
        if response.get("v") != 1:
            raise IncompatibleDaemonError(
                f"daemon response uses unsupported IPC version: {response.get('v')}"
            )
        return response
    except (IncompatibleDaemonError, OutcomeUnknownError):
        raise
    except Exception as e:
        raise OutcomeUnknownError(
            op=str(request.get("op") or ""),
            message=str(e),
        ) from e
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
    payload = (json.dumps(request, ensure_ascii=False) + "\n").encode("utf-8")
    if len(payload) > MAX_DAEMON_REQUEST_BYTES:
        raise RequestTooLargeError(
            f"daemon request exceeds {MAX_DAEMON_REQUEST_BYTES} bytes"
        )
    try:
        s = _connect(endpoint, timeout_s=timeout_s)
    except Exception as e:
        raise DaemonConnectionError(str(e)) from e

    try:
        s.sendall(payload)
    except Exception as e:
        try:
            s.close()
        except Exception:
            pass
        raise OutcomeUnknownError(
            op=str(request.get("op") or ""),
            message=str(e),
        ) from e
    try:
        f = s.makefile("rb")
    except Exception as e:
        try:
            s.close()
        except Exception:
            pass
        raise OutcomeUnknownError(
            op=str(request.get("op") or ""),
            message=str(e),
        ) from e
    return s, f
