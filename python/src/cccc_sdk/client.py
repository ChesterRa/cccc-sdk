from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from .client_0430_ops import CCCC0430OpsMixin
from .client_chat_ops import ChatOpsMixin
from .client_group_space_ops import GroupSpaceOpsMixin
from .client_group_space_provider_ops import GroupSpaceProviderOpsMixin
from .errors import DaemonAPIError, IncompatibleDaemonError
from .transport import DaemonEndpoint, call_daemon, discover_endpoint, open_events_stream


def _compact(args: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in args.items() if v is not None}


class CCCCClient(CCCC0430OpsMixin, ChatOpsMixin, GroupSpaceOpsMixin, GroupSpaceProviderOpsMixin):
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

        _UNPROBABLE_OPS = {
            "ping",
            "shutdown",
            "term_attach",
            "presentation_browser_attach",
            "presentation_browser_vnc_attach",
            "web_model_browser_attach",
            "web_model_browser_vnc_attach",
            "space_provider_auth_browser_attach",
            "space_provider_auth_browser_vnc_attach",
            "runtime_hermes_prepare",
            "runtime_hermes_mcp_test",
        }
        for op in (require_ops or []):
            op_name = str(op or "").strip()
            if not op_name or op_name in _UNPROBABLE_OPS:
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

    def group_reset(
        self,
        *,
        group_id: str,
        confirm: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        """Replace a group with a clean group while preserving selected configuration."""
        gid = str(group_id)
        if str(confirm) != gid:
            raise ValueError("group_reset requires confirm to equal group_id")
        return self.call("group_reset", {"group_id": gid, "confirm": gid, "by": str(by)})

    def group_use(self, *, group_id: str, path: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_use", {"group_id": str(group_id), "path": str(path), "by": str(by)})

    def group_set_state(self, *, group_id: str, state: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_set_state", {"group_id": str(group_id), "state": str(state), "by": str(by)})

    def group_settings_update(self, *, group_id: str, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call("group_settings_update", {"group_id": str(group_id), "by": str(by), "patch": dict(patch)})

    def group_automation_state(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_automation_state", {"group_id": str(group_id), "by": str(by)})

    def group_automation_update(
        self,
        *,
        group_id: str,
        ruleset: Dict[str, Any],
        by: str = "user",
        expected_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "ruleset": dict(ruleset), "by": str(by)}
        if expected_version is not None:
            args["expected_version"] = int(expected_version)
        return self.call("group_automation_update", args)

    def group_automation_manage(
        self,
        *,
        group_id: str,
        by: str = "user",
        actions: List[Dict[str, Any]],
        expected_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        items = [dict(x) for x in actions]
        if not items:
            raise ValueError("group_automation_manage requires a non-empty actions list")
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by), "actions": items}
        if expected_version is not None:
            args["expected_version"] = int(expected_version)
        return self.call("group_automation_manage", args)

    def group_automation_reset_baseline(
        self,
        *,
        group_id: str,
        by: str = "user",
        expected_version: Optional[int] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if expected_version is not None:
            args["expected_version"] = int(expected_version)
        return self.call("group_automation_reset_baseline", args)

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
        env_private: Optional[Dict[str, str]] = None,
        capability_autoload: Optional[List[str]] = None,
        capability_hidden: Optional[List[str]] = None,
        profile_id: str = "",
        profile_scope: str = "",
        profile_owner: str = "",
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
        if env_private is not None:
            args["env_private"] = {str(k): str(v) for k, v in env_private.items()}
        if capability_autoload is not None:
            args["capability_autoload"] = [str(x) for x in capability_autoload]
        if capability_hidden is not None:
            args["capability_hidden"] = [str(x) for x in capability_hidden]
        if profile_id:
            args["profile_id"] = str(profile_id)
        if profile_scope:
            args["profile_scope"] = str(profile_scope)
        if profile_owner:
            args["profile_owner"] = str(profile_owner)
        if default_scope_key:
            args["default_scope_key"] = str(default_scope_key)
        if submit:
            args["submit"] = str(submit)
        return self.call("actor_add", args)

    def actor_update(
        self,
        *,
        group_id: str,
        actor_id: str,
        patch: Optional[Dict[str, Any]] = None,
        by: str = "user",
        profile_id: str = "",
        profile_action: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "actor_id": str(actor_id),
            "by": str(by),
            "patch": dict(patch or {}),
        }
        if profile_id:
            args["profile_id"] = str(profile_id)
        if profile_action:
            args["profile_action"] = str(profile_action)
        return self.call("actor_update", args)

    def actor_remove(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_remove", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_start(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_start", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_stop(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_stop", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_restart(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_restart", {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)})

    def actor_new_session(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call(
            "actor_new_session",
            {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)},
        )

    def runtime_hermes_status(self) -> Dict[str, Any]:
        return self.call("runtime_hermes_status", {})

    def runtime_hermes_prepare(
        self,
        *,
        cwd: str = "",
        auto_enable_tools: bool = False,
        force_mcp: bool = False,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {}
        if cwd:
            args["cwd"] = str(cwd)
        if auto_enable_tools:
            args["auto_enable_tools"] = bool(auto_enable_tools)
        if force_mcp:
            args["force_mcp"] = bool(force_mcp)
        return self.call("runtime_hermes_prepare", args)

    def runtime_hermes_mcp_test(
        self,
        *,
        cwd: str = "",
        group_id: str = "",
        actor_id: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {}
        if cwd:
            args["cwd"] = str(cwd)
        if group_id:
            args["group_id"] = str(group_id)
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("runtime_hermes_mcp_test", args)

    def actor_env_private_keys(self, *, group_id: str, actor_id: str, by: str = "user") -> Dict[str, Any]:
        """List configured private env keys for an actor (keys only; never returns values)."""
        return self.call(
            "actor_env_private_keys",
            {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)},
        )

    def actor_env_private_update(
        self,
        *,
        group_id: str,
        actor_id: str,
        set: Optional[Dict[str, str]] = None,  # noqa: A002 - match IPC field name
        unset: Optional[List[str]] = None,
        clear: bool = False,
        by: str = "user",
    ) -> Dict[str, Any]:
        """Update an actor's private env map (runtime-only). Values are never returned."""
        args: Dict[str, Any] = {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by), "clear": bool(clear)}
        if set is not None:
            args["set"] = {str(k): str(v) for k, v in set.items()}
        if unset is not None:
            args["unset"] = [str(x) for x in unset]
        return self.call("actor_env_private_update", args)

    def actor_profile_list(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_profile_list", {"by": str(by)})

    def actor_profile_get(self, *, profile_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_profile_get", {"profile_id": str(profile_id), "by": str(by)})

    def actor_profile_upsert(
        self,
        *,
        profile: Dict[str, Any],
        by: str = "user",
        expected_revision: Optional[int] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"profile": dict(profile), "by": str(by)}
        if expected_revision is not None:
            args["expected_revision"] = int(expected_revision)
        return self.call("actor_profile_upsert", args)

    def actor_profile_delete(
        self, *, profile_id: str, by: str = "user", force_detach: bool = False
    ) -> Dict[str, Any]:
        return self.call(
            "actor_profile_delete",
            {"profile_id": str(profile_id), "by": str(by), "force_detach": bool(force_detach)},
        )

    def actor_profile_secret_keys(self, *, profile_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("actor_profile_secret_keys", {"profile_id": str(profile_id), "by": str(by)})

    def actor_profile_secret_update(
        self,
        *,
        profile_id: str,
        set: Optional[Dict[str, str]] = None,  # noqa: A002 - match IPC field name
        unset: Optional[List[str]] = None,
        clear: bool = False,
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"profile_id": str(profile_id), "by": str(by), "clear": bool(clear)}
        if set is not None:
            args["set"] = {str(k): str(v) for k, v in set.items()}
        if unset is not None:
            args["unset"] = [str(x) for x in unset]
        return self.call("actor_profile_secret_update", args)

    def actor_profile_secret_copy_from_actor(
        self,
        *,
        profile_id: str,
        group_id: str,
        actor_id: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "actor_profile_secret_copy_from_actor",
            {
                "profile_id": str(profile_id),
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
            },
        )

    def actor_profile_secret_copy_from_profile(
        self,
        *,
        profile_id: str,
        source_profile_id: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "actor_profile_secret_copy_from_profile",
            {
                "profile_id": str(profile_id),
                "source_profile_id": str(source_profile_id),
                "by": str(by),
            },
        )

    def capability_overview(
        self,
        *,
        query: str = "",
        limit: Optional[int] = None,
        include_indexed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {}
        if query:
            args["query"] = str(query)
        if limit is not None:
            args["limit"] = int(limit)
        if include_indexed is not None:
            args["include_indexed"] = bool(include_indexed)
        return self.call("capability_overview", args)

    def capability_search(
        self,
        *,
        group_id: str,
        actor_id: str = "",
        by: str = "user",
        query: str = "",
        kind: str = "",
        source_id: str = "",
        trust_tier: str = "",
        qualification_status: str = "",
        include_external: Optional[bool] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if actor_id:
            args["actor_id"] = str(actor_id)
        if query:
            args["query"] = str(query)
        if kind:
            args["kind"] = str(kind)
        if source_id:
            args["source_id"] = str(source_id)
        if trust_tier:
            args["trust_tier"] = str(trust_tier)
        if qualification_status:
            args["qualification_status"] = str(qualification_status)
        if include_external is not None:
            args["include_external"] = bool(include_external)
        if limit is not None:
            args["limit"] = int(limit)
        return self.call("capability_search", args)

    def capability_enable(
        self,
        *,
        group_id: str,
        capability_id: str,
        scope: str = "session",
        enabled: bool = True,
        cleanup: bool = False,
        reason: str = "",
        ttl_seconds: Optional[int] = None,
        by: str = "user",
        actor_id: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "capability_id": str(capability_id),
            "scope": str(scope),
            "enabled": bool(enabled),
            "cleanup": bool(cleanup),
            "by": str(by),
        }
        if reason:
            args["reason"] = str(reason)
        if ttl_seconds is not None:
            args["ttl_seconds"] = int(ttl_seconds)
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("capability_enable", args)

    def capability_block(
        self,
        *,
        group_id: str,
        capability_id: str,
        scope: str = "group",
        blocked: bool = True,
        ttl_seconds: Optional[int] = None,
        reason: str = "",
        by: str = "user",
        actor_id: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "capability_id": str(capability_id),
            "scope": str(scope),
            "blocked": bool(blocked),
            "by": str(by),
        }
        if ttl_seconds is not None:
            args["ttl_seconds"] = int(ttl_seconds)
        if reason:
            args["reason"] = str(reason)
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("capability_block", args)

    def capability_state(self, *, group_id: str, actor_id: str = "", by: str = "user") -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("capability_state", args)

    def capability_allowlist_get(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("capability_allowlist_get", {"by": str(by)})

    def capability_allowlist_validate(
        self,
        *,
        mode: str = "patch",
        patch: Optional[Dict[str, Any]] = None,
        overlay: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"mode": str(mode)}
        if patch is not None:
            args["patch"] = dict(patch)
        if overlay is not None:
            args["overlay"] = dict(overlay)
        return self.call("capability_allowlist_validate", args)

    def capability_allowlist_update(
        self,
        *,
        mode: str = "patch",
        patch: Optional[Dict[str, Any]] = None,
        overlay: Optional[Dict[str, Any]] = None,
        expected_revision: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"mode": str(mode), "by": str(by)}
        if patch is not None:
            args["patch"] = dict(patch)
        if overlay is not None:
            args["overlay"] = dict(overlay)
        if expected_revision:
            args["expected_revision"] = str(expected_revision)
        return self.call("capability_allowlist_update", args)

    def capability_allowlist_reset(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("capability_allowlist_reset", {"by": str(by)})

    def capability_import(
        self,
        *,
        group_id: str,
        record: Dict[str, Any],
        by: str = "user",
        actor_id: str = "",
        dry_run: bool = False,
        probe: Optional[bool] = None,
        enable_after_import: Optional[bool] = None,
        scope: str = "",
        ttl_seconds: Optional[int] = None,
        reason: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "record": dict(record), "by": str(by), "dry_run": bool(dry_run)}
        if actor_id:
            args["actor_id"] = str(actor_id)
        if probe is not None:
            args["probe"] = bool(probe)
        if enable_after_import is not None:
            args["enable_after_import"] = bool(enable_after_import)
        if scope:
            args["scope"] = str(scope)
        if ttl_seconds is not None:
            args["ttl_seconds"] = int(ttl_seconds)
        if reason:
            args["reason"] = str(reason)
        return self.call("capability_import", args)

    def capability_uninstall(
        self,
        *,
        group_id: str,
        capability_id: str,
        by: str = "user",
        actor_id: str = "",
        reason: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "capability_id": str(capability_id),
            "by": str(by),
        }
        if actor_id:
            args["actor_id"] = str(actor_id)
        if reason:
            args["reason"] = str(reason)
        return self.call("capability_uninstall", args)

    def capability_tool_call(
        self,
        *,
        group_id: str,
        tool_name: str,
        arguments: Optional[Dict[str, Any]] = None,
        actor_id: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "tool_name": str(tool_name),
            "by": str(by),
        }
        if arguments is not None:
            args["arguments"] = dict(arguments)
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("capability_tool_call", args)

    def capability_use(
        self,
        *,
        group_id: str,
        capability_id: str,
        actor_id: str = "",
        by: str = "user",
        scope: str = "session",
        reason: str = "",
        ttl_seconds: Optional[int] = None,
        tool_name: str = "",
        tool_arguments: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        enable_result = self.capability_enable(
            group_id=group_id,
            capability_id=capability_id,
            actor_id=actor_id,
            by=by,
            scope=scope,
            reason=reason,
            ttl_seconds=ttl_seconds,
        )
        if not tool_name:
            return enable_result
        return self.capability_tool_call(
            group_id=group_id,
            actor_id=actor_id,
            by=by,
            tool_name=tool_name,
            arguments=tool_arguments or {},
        )

    def memory_search(
        self,
        *,
        group_id: str,
        query: str,
        actor_id: Optional[str] = None,
        limit: Optional[int] = None,
        max_results: Optional[int] = None,
        vector_weight: Optional[float] = None,
        candidate_multiplier: Optional[float] = None,
        min_score: Optional[float] = None,
        tags: Optional[List[str]] = None,
        target: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_search",
            _compact(
                {
                    "group_id": group_id,
                    "actor_id": actor_id,
                    "query": str(query),
                    "limit": int(limit) if limit is not None else None,
                    "max_results": int(max_results) if max_results is not None else None,
                    "vector_weight": float(vector_weight) if vector_weight is not None else None,
                    "candidate_multiplier": float(candidate_multiplier) if candidate_multiplier is not None else None,
                    "min_score": float(min_score) if min_score is not None else None,
                    "tags": [str(x) for x in tags] if tags is not None else None,
                    "target": str(target) if target is not None else None,
                }
            ),
        )

    def memory_get(
        self,
        *,
        group_id: str,
        path: Optional[str] = None,
        actor_id: Optional[str] = None,
        target: Optional[str] = None,
        date: Optional[str] = None,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_get",
            _compact(
                {
                    "group_id": group_id,
                    "actor_id": actor_id,
                    "path": path,
                    "target": str(target) if target is not None else None,
                    "date": date,
                    "offset": int(offset) if offset is not None else None,
                    "limit": int(limit) if limit is not None else None,
                }
            ),
        )

    def memory_write(
        self,
        *,
        group_id: str,
        target: str,
        content: str,
        actor_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        source_refs: Optional[List[str]] = None,
        idempotency_key: Optional[str] = None,
        dedup_intent: Optional[str] = None,
        dedup_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_write",
            _compact(
                {
                    "group_id": group_id,
                    "actor_id": actor_id,
                    "target": str(target),
                    "content": str(content),
                    "tags": [str(x) for x in tags] if tags is not None else None,
                    "source_refs": [str(x) for x in source_refs] if source_refs is not None else None,
                    "idempotency_key": idempotency_key,
                    "dedup_intent": dedup_intent,
                    "dedup_query": dedup_query,
                }
            ),
        )

    def memory_health(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("memory_health", {"group_id": str(group_id)})

    def memory_profile_get(
        self,
        *,
        group_id: str,
        actor_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_profile_get",
            _compact(
                {
                    "group_id": group_id,
                    "actor_id": actor_id,
                    "user_id": user_id,
                    "tags": [str(x) for x in tags] if tags is not None else None,
                }
            ),
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

    def _context_op(
        self, *, group_id: str, op: Dict[str, Any], by: str = "system", dry_run: bool = False
    ) -> Dict[str, Any]:
        return self.context_sync(group_id=group_id, by=by, dry_run=dry_run, ops=[op])

    def coordination_brief_update(
        self,
        *,
        group_id: str,
        by: str = "system",
        dry_run: bool = False,
        objective: Optional[str] = None,
        current_focus: Optional[str] = None,
        constraints: Optional[List[str]] = None,
        project_brief: Optional[str] = None,
        project_brief_stale: Optional[bool] = None,
    ) -> Dict[str, Any]:
        op = _compact(
            {
                "op": "coordination.brief.update",
                "objective": objective,
                "current_focus": current_focus,
                "constraints": [str(x) for x in constraints] if constraints is not None else None,
                "project_brief": project_brief,
                "project_brief_stale": project_brief_stale,
            }
        )
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op=op)

    def coordination_note_add(
        self,
        *,
        group_id: str,
        kind: str,
        summary: str,
        by: str = "system",
        task_id: Optional[str] = None,
        dry_run: bool = False,
    ) -> Dict[str, Any]:
        op = _compact({"op": "coordination.note.add", "kind": str(kind), "summary": str(summary), "task_id": task_id})
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op=op)

    def task_create(
        self,
        *,
        group_id: str,
        title: str,
        by: str = "system",
        dry_run: bool = False,
        outcome: Optional[str] = None,
        status: Optional[str] = None,
        parent_id: Optional[str] = None,
        assignee: Optional[str] = None,
        priority: Optional[str] = None,
        blocked_by: Optional[List[str]] = None,
        waiting_on: Optional[str] = None,
        handoff_to: Optional[str] = None,
        task_type: Optional[str] = None,
        notes: Optional[str] = None,
        checklist: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        op = _compact(
            {
                "op": "task.create",
                "title": str(title),
                "outcome": outcome,
                "status": status,
                "parent_id": parent_id,
                "assignee": assignee,
                "priority": priority,
                "blocked_by": [str(x) for x in blocked_by] if blocked_by is not None else None,
                "waiting_on": waiting_on,
                "handoff_to": handoff_to,
                "task_type": task_type,
                "notes": notes,
                "checklist": [dict(x) for x in checklist] if checklist is not None else None,
            }
        )
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op=op)

    def task_update(
        self,
        *,
        group_id: str,
        task_id: str,
        by: str = "system",
        dry_run: bool = False,
        title: Optional[str] = None,
        outcome: Optional[str] = None,
        status: Optional[str] = None,
        assignee: Optional[str] = None,
        priority: Optional[str] = None,
        blocked_by: Optional[List[str]] = None,
        waiting_on: Optional[str] = None,
        handoff_to: Optional[str] = None,
        notes: Optional[str] = None,
        checklist: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        op = _compact(
            {
                "op": "task.update",
                "task_id": str(task_id),
                "title": title,
                "outcome": outcome,
                "status": status,
                "assignee": assignee,
                "priority": priority,
                "blocked_by": [str(x) for x in blocked_by] if blocked_by is not None else None,
                "waiting_on": waiting_on,
                "handoff_to": handoff_to,
                "notes": notes,
                "checklist": [dict(x) for x in checklist] if checklist is not None else None,
            }
        )
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op=op)

    def task_move(
        self, *, group_id: str, task_id: str, status: str, by: str = "system", dry_run: bool = False
    ) -> Dict[str, Any]:
        return self._context_op(
            group_id=group_id,
            by=by,
            dry_run=dry_run,
            op={"op": "task.move", "task_id": str(task_id), "status": str(status)},
        )

    def task_restore(self, *, group_id: str, task_id: str, by: str = "system", dry_run: bool = False) -> Dict[str, Any]:
        return self._context_op(
            group_id=group_id,
            by=by,
            dry_run=dry_run,
            op={"op": "task.restore", "task_id": str(task_id)},
        )

    def agent_state_update(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "system",
        dry_run: bool = False,
        active_task_id: Optional[str] = None,
        focus: Optional[str] = None,
        next_action: Optional[str] = None,
        what_changed: Optional[str] = None,
        blockers: Optional[List[str]] = None,
        open_loops: Optional[List[str]] = None,
        commitments: Optional[List[str]] = None,
        environment_summary: Optional[str] = None,
        user_model: Optional[str] = None,
        persona_notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        op = _compact(
            {
                "op": "agent_state.update",
                "actor_id": str(actor_id),
                "active_task_id": active_task_id,
                "focus": focus,
                "next_action": next_action,
                "what_changed": what_changed,
                "blockers": [str(x) for x in blockers] if blockers is not None else None,
                "open_loops": [str(x) for x in open_loops] if open_loops is not None else None,
                "commitments": [str(x) for x in commitments] if commitments is not None else None,
                "environment_summary": environment_summary,
                "user_model": user_model,
                "persona_notes": persona_notes,
            }
        )
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op=op)

    def agent_state_clear(
        self, *, group_id: str, actor_id: str, by: str = "system", dry_run: bool = False
    ) -> Dict[str, Any]:
        return self._context_op(
            group_id=group_id,
            by=by,
            dry_run=dry_run,
            op={"op": "agent_state.clear", "actor_id": str(actor_id)},
        )

    def meta_merge(
        self, *, group_id: str, data: Dict[str, Any], by: str = "system", dry_run: bool = False
    ) -> Dict[str, Any]:
        return self._context_op(group_id=group_id, by=by, dry_run=dry_run, op={"op": "meta.merge", "data": dict(data)})

    # ---------------------------------------------------------------------
    # Tracked delegation (daemon-owned task+message atomicity)
    # ---------------------------------------------------------------------

    def tracked_send(
        self,
        *,
        group_id: str,
        text: str,
        insight: str = "",
        title: str = "",
        by: str = "user",
        to: Optional[List[str]] = None,
        path: str = "",
        priority: str = "normal",
        message_priority: str = "",
        task_priority: str = "",
        reply_required: bool = True,
        idempotency_key: str = "",
        outcome: str = "",
        status: str = "",
        waiting_on: str = "",
        task_type: str = "",
        checklist: Optional[List[Dict[str, Any]]] = None,
        notes: str = "",
        blocked_by: Optional[List[str]] = None,
        handoff_to: str = "",
        assignee: str = "",
        refs: Optional[List[Dict[str, Any]]] = None,
        require_peer_insight: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Atomically create a tracked task and send the linked chat message."""
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "by": str(by),
            "text": str(text),
        }
        if title:
            args["title"] = str(title)
        if insight:
            args["insight"] = str(insight)
        if to is not None:
            args["to"] = [str(x) for x in to]
        if path:
            args["path"] = str(path)
        if priority:
            args["priority"] = str(priority)
        if message_priority:
            args["message_priority"] = str(message_priority)
        if task_priority:
            args["task_priority"] = str(task_priority)
        args["reply_required"] = bool(reply_required)
        if idempotency_key:
            args["idempotency_key"] = str(idempotency_key)
        if outcome:
            args["outcome"] = str(outcome)
        if status:
            args["status"] = str(status)
        if waiting_on:
            args["waiting_on"] = str(waiting_on)
        if task_type:
            args["task_type"] = str(task_type)
        if checklist is not None:
            args["checklist"] = [dict(c) for c in checklist]
        if notes:
            args["notes"] = str(notes)
        if blocked_by is not None:
            args["blocked_by"] = [str(x) for x in blocked_by]
        if handoff_to:
            args["handoff_to"] = str(handoff_to)
        if assignee:
            args["assignee"] = str(assignee)
        if refs is not None:
            args["refs"] = [dict(r) for r in refs]
        if insight:
            args["insight"] = str(insight)
        if require_peer_insight is not None:
            args["require_peer_insight"] = bool(require_peer_insight)
        return self.call("tracked_send", args)

    def task_list(self, *, group_id: str, task_id: str = "") -> Dict[str, Any]:
        """List all tasks in a group, or fetch a single task (with children) by id."""
        args: Dict[str, Any] = {"group_id": str(group_id)}
        if task_id:
            args["task_id"] = str(task_id)
        return self.call("task_list", args)

    # ---------------------------------------------------------------------
    # Headless runtime control
    # ---------------------------------------------------------------------

    def headless_status(self, *, group_id: str, actor_id: str) -> Dict[str, Any]:
        return self.call(
            "headless_status",
            {"group_id": str(group_id), "actor_id": str(actor_id)},
        )

    def headless_set_status(
        self,
        *,
        group_id: str,
        actor_id: str,
        status: str,
        task_id: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "actor_id": str(actor_id),
            "status": str(status),
        }
        if task_id:
            args["task_id"] = str(task_id)
        return self.call("headless_set_status", args)

    def headless_ack_message(
        self,
        *,
        group_id: str,
        actor_id: str,
        message_id: str,
    ) -> Dict[str, Any]:
        return self.call(
            "headless_ack_message",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "message_id": str(message_id),
            },
        )

    # ---------------------------------------------------------------------
    # Group copy (export/import for duplication/migration)
    # ---------------------------------------------------------------------

    def group_copy_export(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("group_copy_export", {"group_id": str(group_id)})

    def group_copy_export_file(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("group_copy_export_file", {"group_id": str(group_id)})

    def group_copy_preview_import(
        self,
        *,
        package_b64: str = "",
        package_path: str = "",
    ) -> Dict[str, Any]:
        if bool(package_b64) == bool(package_path):
            raise ValueError("exactly one of package_b64 or package_path is required")
        args = {"package_b64": str(package_b64)} if package_b64 else {"package_path": str(package_path)}
        return self.call("group_copy_preview_import", args)

    def group_copy_import(
        self,
        *,
        package_b64: str = "",
        package_path: str = "",
        workspace_root: str = "",
        title: str = "",
    ) -> Dict[str, Any]:
        if bool(package_b64) == bool(package_path):
            raise ValueError("exactly one of package_b64 or package_path is required")
        args: Dict[str, Any] = (
            {"package_b64": str(package_b64)} if package_b64 else {"package_path": str(package_path)}
        )
        if workspace_root:
            args["workspace_root"] = str(workspace_root)
        if title:
            args["title"] = str(title)
        return self.call("group_copy_import", args)

    # ---------------------------------------------------------------------
    # Capability Center extensions (visibility / install_target / source_delete)
    # ---------------------------------------------------------------------

    def capability_visibility(
        self,
        *,
        group_id: str,
        capability_id: str,
        hidden: bool = True,
        actor_id: str = "",
        reason: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "capability_id": str(capability_id),
            "hidden": bool(hidden),
            "by": str(by),
        }
        if actor_id:
            args["actor_id"] = str(actor_id)
        if reason:
            args["reason"] = str(reason)
        return self.call("capability_visibility", args)

    def capability_install_target(
        self,
        *,
        group_id: str,
        target: str,
        actor_id: str = "",
        scope: str = "actor",
        ttl_seconds: Optional[int] = None,
        reason: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "target": str(target),
            "scope": str(scope),
            "by": str(by),
        }
        if actor_id:
            args["actor_id"] = str(actor_id)
        if ttl_seconds is not None:
            args["ttl_seconds"] = int(ttl_seconds)
        if reason:
            args["reason"] = str(reason)
        return self.call("capability_install_target", args)

    def capability_source_delete(
        self,
        *,
        group_id: str,
        source_id: str,
        source_instance_key: str = "",
        reason: str = "",
        actor_id: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "source_id": str(source_id),
            "by": str(by),
        }
        if source_instance_key:
            args["source_instance_key"] = str(source_instance_key)
        if reason:
            args["reason"] = str(reason)
        if actor_id:
            args["actor_id"] = str(actor_id)
        return self.call("capability_source_delete", args)

    # ---------------------------------------------------------------------
    # Presentation workspace
    # ---------------------------------------------------------------------

    def presentation_get(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("presentation_get", {"group_id": str(group_id)})

    def presentation_publish(
        self,
        *,
        group_id: str,
        by: str = "user",
        slot: str = "",
        title: str = "",
        summary: str = "",
        source_label: str = "",
        source_ref: str = "",
        card_type: str = "",
        content: str = "",
        path: str = "",
        url: str = "",
        blob_rel_path: str = "",
        table: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if slot:
            args["slot"] = str(slot)
        if title:
            args["title"] = str(title)
        if summary:
            args["summary"] = str(summary)
        if source_label:
            args["source_label"] = str(source_label)
        if source_ref:
            args["source_ref"] = str(source_ref)
        if card_type:
            args["card_type"] = str(card_type)
        if content:
            args["content"] = str(content)
        if path:
            args["path"] = str(path)
        if url:
            args["url"] = str(url)
        if blob_rel_path:
            args["blob_rel_path"] = str(blob_rel_path)
        if table is not None:
            args["table"] = dict(table)
        return self.call("presentation_publish", args)

    def presentation_clear(self, *, group_id: str, slot: str = "", by: str = "user") -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if slot:
            args["slot"] = str(slot)
        return self.call("presentation_clear", args)

    def presentation_browser_open(
        self,
        *,
        group_id: str,
        slot: str,
        url: str,
        width: int = 1280,
        height: int = 800,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "presentation_browser_open",
            {
                "group_id": str(group_id),
                "slot": str(slot),
                "url": str(url),
                "width": int(width),
                "height": int(height),
                "by": str(by),
            },
        )

    def presentation_browser_info(self, *, group_id: str, slot: str = "") -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id)}
        if slot:
            args["slot"] = str(slot)
        return self.call("presentation_browser_info", args)

    def presentation_browser_close(
        self, *, group_id: str, slot: str = "", by: str = "user"
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "by": str(by)}
        if slot:
            args["slot"] = str(slot)
        return self.call("presentation_browser_close", args)

    # ---------------------------------------------------------------------
    # Built-in assistant (PET / Voice Secretary) lifecycle
    # ---------------------------------------------------------------------

    def assistant_state(
        self,
        *,
        group_id: str,
        assistant_id: str = "",
        prompt_request_id: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id)}
        if assistant_id:
            args["assistant_id"] = str(assistant_id)
        if prompt_request_id:
            args["prompt_request_id"] = str(prompt_request_id)
        return self.call("assistant_state", args)

    def assistant_voice_recording_lease(
        self,
        *,
        group_id: str,
        action: str,
        by: str = "user",
        owner_id: str = "",
        lease_id: str = "",
        ttl_seconds: Optional[int] = None,
        capture_mode: str = "",
        recognition_backend: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"group_id": str(group_id), "action": str(action), "by": str(by)}
        if owner_id:
            args["owner_id"] = str(owner_id)
        if lease_id:
            args["lease_id"] = str(lease_id)
        if ttl_seconds is not None:
            args["ttl_seconds"] = int(ttl_seconds)
        if capture_mode:
            args["capture_mode"] = str(capture_mode)
        if recognition_backend:
            args["recognition_backend"] = str(recognition_backend)
        return self.call("assistant_voice_recording_lease", args)

    def assistant_settings_update(
        self,
        *,
        group_id: str,
        assistant_id: str,
        patch: Dict[str, Any],
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_settings_update",
            {
                "group_id": str(group_id),
                "assistant_id": str(assistant_id),
                "patch": dict(patch),
                "by": str(by),
            },
        )

    def assistant_status_update(
        self,
        *,
        group_id: str,
        assistant_id: str,
        lifecycle: str,
        health: Optional[Dict[str, Any]] = None,
        by: str = "",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "assistant_id": str(assistant_id),
            "lifecycle": str(lifecycle),
        }
        if health is not None:
            args["health"] = dict(health)
        if by:
            args["by"] = str(by)
        return self.call("assistant_status_update", args)

    # ---------------------------------------------------------------------
    # Daemon core (shutdown / observability / branding)
    # ---------------------------------------------------------------------

    def shutdown(self) -> Dict[str, Any]:
        return self.call("shutdown", {})

    def observability_get(self) -> Dict[str, Any]:
        return self.call("observability_get", {})

    def observability_update(self, *, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call(
            "observability_update",
            {"patch": dict(patch), "by": str(by)},
        )

    def branding_get(self) -> Dict[str, Any]:
        return self.call("branding_get", {})

    def branding_update(self, *, patch: Dict[str, Any], by: str = "user") -> Dict[str, Any]:
        return self.call(
            "branding_update",
            {"patch": dict(patch), "by": str(by)},
        )

    # ---------------------------------------------------------------------
    # Diagnostics (admin/operator)
    # ---------------------------------------------------------------------

    def debug_snapshot(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call(
            "debug_snapshot",
            {"group_id": str(group_id), "by": str(by)},
        )

    def debug_tail_logs(
        self,
        *,
        component: str,
        group_id: str = "",
        lines: int = 200,
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"component": str(component), "by": str(by), "lines": int(lines)}
        if group_id:
            args["group_id"] = str(group_id)
        return self.call("debug_tail_logs", args)

    def debug_clear_logs(
        self,
        *,
        component: str,
        group_id: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {"component": str(component), "by": str(by)}
        if group_id:
            args["group_id"] = str(group_id)
        return self.call("debug_clear_logs", args)

    def terminal_tail(
        self,
        *,
        group_id: str,
        actor_id: str,
        max_chars: int = 8000,
        strip_ansi: bool = True,
        compact: bool = True,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "terminal_tail",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "max_chars": int(max_chars),
                "strip_ansi": bool(strip_ansi),
                "compact": bool(compact),
                "by": str(by),
            },
        )

    def terminal_clear(
        self, *, group_id: str, actor_id: str, by: str = "user"
    ) -> Dict[str, Any]:
        return self.call(
            "terminal_clear",
            {"group_id": str(group_id), "actor_id": str(actor_id), "by": str(by)},
        )

    def terminal_history(
        self,
        *,
        group_id: str,
        actor_id: str,
        before: Optional[int] = None,
        limit_bytes: int = 64_000,
        strip_ansi: bool = False,
        compact: bool = False,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "terminal_history",
            _compact(
                {
                    "group_id": str(group_id),
                    "actor_id": str(actor_id),
                    "before": int(before) if before is not None else None,
                    "limit_bytes": int(limit_bytes),
                    "strip_ansi": bool(strip_ansi),
                    "compact": bool(compact),
                    "by": str(by),
                }
            ),
        )

    # ---------------------------------------------------------------------
    # Maintenance (ledger)
    # ---------------------------------------------------------------------

    def ledger_snapshot(
        self, *, group_id: str, by: str = "user", reason: str = "manual"
    ) -> Dict[str, Any]:
        return self.call(
            "ledger_snapshot",
            {"group_id": str(group_id), "by": str(by), "reason": str(reason)},
        )

    def ledger_compact(
        self,
        *,
        group_id: str,
        by: str = "user",
        reason: str = "auto",
        force: bool = False,
    ) -> Dict[str, Any]:
        return self.call(
            "ledger_compact",
            {
                "group_id": str(group_id),
                "by": str(by),
                "reason": str(reason),
                "force": bool(force),
            },
        )

    # ---------------------------------------------------------------------
    # Stream / system notify (low-level)
    # ---------------------------------------------------------------------

    def stream_emit(
        self,
        *,
        group_id: str,
        op: str,
        by: str,
        stream_id: str = "",
        text: str = "",
        format: str = "plain",  # noqa: A002 - match IPC field name
        seq: int = 0,
        to: Optional[List[str]] = None,
        reply_to: str = "",
        client_id: str = "",
    ) -> Dict[str, Any]:
        """Emit a chat.stream event (op = 'start' | 'update' | 'end')."""
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "by": str(by),
            "op": str(op),
            "format": str(format),
            "seq": int(seq),
        }
        if stream_id:
            args["stream_id"] = str(stream_id)
        if text:
            args["text"] = str(text)
        if to is not None:
            args["to"] = [str(x) for x in to]
        if reply_to:
            args["reply_to"] = str(reply_to)
        if client_id:
            args["client_id"] = str(client_id)
        return self.call("stream_emit", args)

    def system_notify(
        self,
        *,
        group_id: str,
        message: str = "",
        title: str = "",
        kind: str = "info",
        priority: str = "normal",
        target_actor_id: str = "",
        requires_ack: bool = False,
        context: Optional[Dict[str, Any]] = None,
        by: str = "system",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "by": str(by),
            "kind": str(kind),
            "priority": str(priority),
            "requires_ack": bool(requires_ack),
        }
        if message:
            args["message"] = str(message)
        if title:
            args["title"] = str(title)
        if target_actor_id:
            args["target_actor_id"] = str(target_actor_id)
        if context is not None:
            args["context"] = dict(context)
        return self.call("system_notify", args)

    # ---------------------------------------------------------------------
    # Registry / group admin
    # ---------------------------------------------------------------------

    def registry_reconcile(self, *, remove_missing: bool = False) -> Dict[str, Any]:
        return self.call("registry_reconcile", {"remove_missing": bool(remove_missing)})

    def group_detach_scope(
        self, *, group_id: str, scope_key: str, by: str = "user"
    ) -> Dict[str, Any]:
        return self.call(
            "group_detach_scope",
            {"group_id": str(group_id), "scope_key": str(scope_key), "by": str(by)},
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
