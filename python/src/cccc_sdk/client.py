from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from .errors import DaemonAPIError, IncompatibleDaemonError
from .transport import DaemonEndpoint, call_daemon, discover_endpoint, open_events_stream


class CCCCClient:
    """A minimal client for the CCCC daemon IPC v1."""

    def __init__(
        self,
        *,
        cccc_home: Optional[str] = None,
        endpoint: Optional[DaemonEndpoint] = None,
        timeout_s: float = 30.0,
    ) -> None:
        self._timeout_s = float(timeout_s)
        self._home = Path(cccc_home).expanduser() if cccc_home else None
        self._endpoint = endpoint or discover_endpoint(self._home)

    @property
    def endpoint(self) -> DaemonEndpoint:
        return self._endpoint

    def call_raw(self, op: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        req = {"v": 1, "op": str(op), "args": dict(args or {})}
        resp = call_daemon(endpoint=self._endpoint, request=req, timeout_s=self._timeout_s)
        if bool(resp.get("ok")):
            return resp
        err = resp.get("error") if isinstance(resp.get("error"), dict) else {}
        raise DaemonAPIError(
            code=str(err.get("code") or "error"),
            message=str(err.get("message") or "daemon error"),
            details=dict(err.get("details") or {}) if isinstance(err.get("details"), dict) else {},
            raw=resp if isinstance(resp, dict) else None,
        )

    def call(self, op: str, args: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Call an IPC op and return only the `result` payload."""
        resp = self.call_raw(op, args)
        out = resp.get("result")
        return dict(out) if isinstance(out, dict) else {}

    def assert_compatible(
        self,
        *,
        require_ipc_v: int = 1,
        require_capabilities: Optional[Dict[str, bool]] = None,
        require_ops: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Fail fast with a clear error if the connected daemon is incompatible.

        This intentionally prefers **capability / op probing** over strict version
        matching, so it remains usable across RC iterations.
        """
        ping_env = self.call_raw("ping", {})
        ping = ping_env.get("result") if isinstance(ping_env, dict) else None
        ping = dict(ping) if isinstance(ping, dict) else {}

        try:
            ipc_v = int(ping.get("ipc_v") or 0)
        except Exception:
            ipc_v = 0
        if ipc_v < int(require_ipc_v):
            raise IncompatibleDaemonError(
                f"daemon ipc_v={ipc_v} is incompatible (require ipc_v>={int(require_ipc_v)})"
            )

        caps = ping.get("capabilities")
        caps = dict(caps) if isinstance(caps, dict) else {}
        for k, want in (require_capabilities or {}).items():
            if bool(want) and not bool(caps.get(k)):
                raise IncompatibleDaemonError(f"daemon capability missing: {k}=true is required")

        for op in (require_ops or []):
            op_name = str(op or "").strip()
            if not op_name or op_name in ("ping", "shutdown", "events_stream", "term_attach"):
                continue
            try:
                # Use an empty args probe: a supported op should return a structured error
                # (missing_group_id, invalid_request, etc.), but not "unknown_op".
                self.call_raw(op_name, {})
            except DaemonAPIError as e:
                if str(e.code or "") == "unknown_op":
                    raise IncompatibleDaemonError(f"daemon does not support op: {op_name}") from e
                # Any other error code implies the op is recognized.
        return ping

    # ---------------------------------------------------------------------
    # Convenience helpers (minimal set for v0)
    # ---------------------------------------------------------------------

    def ping(self) -> Dict[str, Any]:
        return self.call("ping")

    def groups(self) -> Dict[str, Any]:
        return self.call("groups")

    def group_show(self, group_id: str) -> Dict[str, Any]:
        return self.call("group_show", {"group_id": str(group_id)})

    def attach(self, *, path: str, group_id: str = "", by: str = "user") -> Dict[str, Any]:
        args: Dict[str, Any] = {"path": str(path), "by": str(by)}
        if group_id:
            args["group_id"] = str(group_id)
        return self.call("attach", args)

    def group_create(self, *, title: str = "", topic: str = "", by: str = "user") -> Dict[str, Any]:
        return self.call("group_create", {"title": str(title), "topic": str(topic), "by": str(by)})

    def group_update(self, *, group_id: str, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call("group_update", {"group_id": str(group_id), "by": str(by), "patch": dict(patch)})

    def group_delete(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_delete", {"group_id": str(group_id), "by": str(by)})

    def group_use(self, *, group_id: str, path: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_use", {"group_id": str(group_id), "path": str(path), "by": str(by)})

    def group_set_state(self, *, group_id: str, state: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_set_state", {"group_id": str(group_id), "state": str(state), "by": str(by)})

    def group_settings_update(self, *, group_id: str, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call("group_settings_update", {"group_id": str(group_id), "by": str(by), "patch": dict(patch)})

    def group_start(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_start", {"group_id": str(group_id), "by": str(by)})

    def group_stop(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_stop", {"group_id": str(group_id), "by": str(by)})

    def actor_list(self, group_id: str) -> Dict[str, Any]:
        return self.call("actor_list", {"group_id": str(group_id)})

    def actor_add(
        self,
        *,
        group_id: str,
        actor_id: str = "",
        title: str = "",
        runtime: str = "",
        runner: str = "pty",
        command: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        default_scope_key: str = "",
        submit: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if actor_id:
            args["actor_id"] = str(actor_id)
        if title:
            args["title"] = str(title)
        if runtime:
            args["runtime"] = str(runtime)
        if runner:
            args["runner"] = str(runner)
        if command is not None:
            args["command"] = [str(x) for x in command]
        if env is not None:
            args["env"] = {str(k): str(v) for k, v in env.items()}
        if default_scope_key:
            args["default_scope_key"] = str(default_scope_key)
        if submit:
            args["submit"] = str(submit)
        return self.call("actor_add", args)

    def actor_update(self, *, group_id: str, actor_id: str, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call(
            "actor_update", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by), "patch": dict(patch)}
        )

    def actor_remove(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_remove", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_start(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_start", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_stop(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_stop", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_restart(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_restart", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def send_cross_group(
        self,
        *,
        group_id: str,
        dst_group_id: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "dst_group_id": str(dst_group_id),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        return self.call("send_cross_group", args)

    def send(
        self,
        *,
        group_id: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
        path: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        if path:
            args["path"] = str(path)
        return self.call("send", args)

    def reply(
        self,
        *,
        group_id: str,
        reply_to: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "reply_to": str(reply_to),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        return self.call("reply", args)

    def chat_ack(self, *, group_id: str, actor_id: str, event_id: str, by: Optional[str] = None) -> Dict[str, Any]:
        """ACK an attention message (self-only in CCCC: by must equal actor_id)."""
        aid = str(actor_id)
        return self.call(
            "chat_ack",
            {
                "group_id": str(group_id),
                "actor_id": aid,
                "event_id": str(event_id),
                "by": str(by) if by is not None else aid,
            },
        )

    def inbox_list(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
        limit: int = 50,
        kind_filter: str = "all",
    ) -> Dict[str, Any]:
        return self.call(
            "inbox_list",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
                "limit": int(limit),
                "kind_filter": str(kind_filter),
            },
        )

    def inbox_mark_read(self, *, group_id: str, actor_id: str, event_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call(
            "inbox_mark_read",
            {"group_id": str(group_id), "actor_id": str(actor_id), "event_id": str(event_id), "by": str(by)},
        )

    def inbox_mark_all_read(
        self, *, group_id: str, actor_id: str, by: str = "user", kind_filter: str = "all"
    ) -> Dict[str, Any]:
        return self.call(
            "inbox_mark_all_read",
            {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by), "kind_filter": str(kind_filter)},
        )

    def notify_ack(
        self, *, group_id: str, actor_id: str, notify_event_id: str, by: Optional[str] = None
    ) -> Dict[str, Any]:
        aid = str(actor_id)
        return self.call(
            "notify_ack",
            {
                "group_id": str(group_id),
                "actor_id": aid,
                "notify_event_id": str(notify_event_id),
                "by": str(by) if by is not None else aid,
            },
        )

    def context_get(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("context_get", {"group_id": str(group_id)})

    def context_sync(
        self, *, group_id: str, ops: List[Dict[str, Any]], by: str = "system", dry_run: bool = False
    ) -> Dict[str, Any]:
        return self.call(
            "context_sync",
            {"group_id": str(group_id), "by": str(by), "ops": list(ops), "dry_run": bool(dry_run)},
        )


    # ---------------------------------------------------------------------
    # events_stream (push stream)
    # ---------------------------------------------------------------------

    def events_stream(
        self,
        *,
        group_id: str,
        by: str = "user",
        kinds: Optional[Set[str]] = None,
        since_event_id: str = "",
        since_ts: str = "",
        timeout_s: Optional[float] = None,
    ) -> Iterable[Dict[str, Any]]:
        """Subscribe to a best-effort event stream.

        Yields stream items (dict), e.g.:
          { "t": "event", "event": {...} }
          { "t": "heartbeat", "ts": "..." }
        """
        req: Dict[str, Any] = {
            "v": 1,
            "op": "events_stream",
            "args": {
                "group_id": str(group_id),
                "by": str(by),
            },
        }
        if kinds is not None:
            req["args"]["kinds"] = sorted({str(k) for k in kinds if str(k).strip()})
        if since_event_id:
            req["args"]["since_event_id"] = str(since_event_id)
        if since_ts:
            req["args"]["since_ts"] = str(since_ts)

        sock, f = open_events_stream(endpoint=self._endpoint, request=req, timeout_s=float(timeout_s or self._timeout_s))
        try:
            first = f.readline(4_000_000)
            if not first:
                return
            import json

            resp = json.loads(first.decode("utf-8", errors="replace"))
            if not bool(resp.get("ok")):
                err = resp.get("error") if isinstance(resp.get("error"), dict) else {}
                raise DaemonAPIError(
                    code=str(err.get("code") or "error"),
                    message=str(err.get("message") or "daemon error"),
                    details=dict(err.get("details") or {}) if isinstance(err.get("details"), dict) else {},
                    raw=resp if isinstance(resp, dict) else None,
                )

            # After the handshake, treat the stream as long-lived: do not inherit the
            # request timeout as a read timeout (heartbeats may be sparse).
            try:
                sock.settimeout(None)
            except Exception:
                pass

            while True:
                line = f.readline(4_000_000)
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line.decode("utf-8", errors="replace"))
                except Exception:
                    continue
                if isinstance(item, dict):
                    yield item
        finally:
            try:
                sock.close()
            except Exception:
                pass
