from __future__ import annotations

from typing import Any, Dict, Optional


class GroupSpaceOpsMixin:
    def group_space_status(self, *, group_id: str, provider: str = "notebooklm") -> Dict[str, Any]:
        return self.call("group_space_status", {"group_id": str(group_id), "provider": str(provider)})

    def group_space_spaces(self, *, group_id: str, provider: str = "notebooklm") -> Dict[str, Any]:
        return self.call("group_space_spaces", {"group_id": str(group_id), "provider": str(provider)})

    def group_space_capabilities(self, *, group_id: str, provider: str = "notebooklm") -> Dict[str, Any]:
        return self.call("group_space_capabilities", {"group_id": str(group_id), "provider": str(provider)})

    def group_space_bind(
        self,
        *,
        group_id: str,
        lane: str,
        action: str = "bind",
        remote_space_id: str = "",
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "action": str(action),
            "by": str(by),
        }
        if remote_space_id:
            args["remote_space_id"] = str(remote_space_id)
        return self.call("group_space_bind", args)

    def group_space_ingest(
        self,
        *,
        group_id: str,
        lane: str,
        kind: str = "context_sync",
        payload: Optional[Dict[str, Any]] = None,
        idempotency_key: str = "",
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "kind": str(kind),
            "by": str(by),
        }
        if payload is not None:
            args["payload"] = dict(payload)
        if idempotency_key:
            args["idempotency_key"] = str(idempotency_key)
        return self.call("group_space_ingest", args)

    def group_space_query(
        self,
        *,
        group_id: str,
        lane: str,
        query: str,
        options: Optional[Dict[str, Any]] = None,
        provider: str = "notebooklm",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "query": str(query),
        }
        if options is not None:
            args["options"] = dict(options)
        return self.call("group_space_query", args)

    def group_space_sources(
        self,
        *,
        group_id: str,
        lane: str,
        action: str = "list",
        source_id: str = "",
        new_title: str = "",
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "action": str(action),
            "by": str(by),
        }
        if source_id:
            args["source_id"] = str(source_id)
        if new_title:
            args["new_title"] = str(new_title)
        return self.call("group_space_sources", args)

    def group_space_artifact(
        self,
        *,
        group_id: str,
        lane: str,
        action: str = "list",
        kind: str = "",
        options: Optional[Dict[str, Any]] = None,
        wait: Optional[bool] = None,
        save_to_space: Optional[bool] = None,
        output_path: str = "",
        output_format: str = "",
        artifact_id: str = "",
        timeout_seconds: Optional[int] = None,
        initial_interval: Optional[int] = None,
        max_interval: Optional[int] = None,
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "action": str(action),
            "by": str(by),
        }
        if kind:
            args["kind"] = str(kind)
        if options is not None:
            args["options"] = dict(options)
        if wait is not None:
            args["wait"] = bool(wait)
        if save_to_space is not None:
            args["save_to_space"] = bool(save_to_space)
        if output_path:
            args["output_path"] = str(output_path)
        if output_format:
            args["output_format"] = str(output_format)
        if artifact_id:
            args["artifact_id"] = str(artifact_id)
        if timeout_seconds is not None:
            args["timeout_seconds"] = int(timeout_seconds)
        if initial_interval is not None:
            args["initial_interval"] = int(initial_interval)
        if max_interval is not None:
            args["max_interval"] = int(max_interval)
        return self.call("group_space_artifact", args)

    def group_space_jobs(
        self,
        *,
        group_id: str,
        lane: str,
        action: str = "list",
        job_id: str = "",
        state: str = "",
        limit: Optional[int] = None,
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "provider": str(provider),
            "lane": str(lane),
            "action": str(action),
            "by": str(by),
        }
        if job_id:
            args["job_id"] = str(job_id)
        if state:
            args["state"] = str(state)
        if limit is not None:
            args["limit"] = int(limit)
        return self.call("group_space_jobs", args)

    def group_space_sync(
        self,
        *,
        group_id: str,
        lane: str,
        provider: str = "notebooklm",
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "group_space_sync",
            {
                "group_id": str(group_id),
                "provider": str(provider),
                "lane": str(lane),
                "action": "status",
                "by": str(by),
            },
        )
