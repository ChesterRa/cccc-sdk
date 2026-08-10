from __future__ import annotations

from typing import Any, Dict, Optional, Union

from .client_0430_shared import _compact
from .errors import DaemonAPIError


_MAX_GROUP_PREAMBLE_BYTES = 512 * 1024


class CCCC0430AdminOpsMixin:
    def actor_new_session(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "actor_new_session",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
            },
        )

    def group_copy_export_file(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
        return self.call("group_copy_export_file", {"group_id": str(group_id), "by": str(by)})

    def group_preamble_get(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("group_preamble_get", {"group_id": str(group_id)})

    def group_preamble_set(self, *, group_id: str, content: str, by: str = "user") -> Dict[str, Any]:
        if not isinstance(content, str) or not content.strip():
            raise ValueError("group_preamble_set requires non-empty content")
        body = content
        if len(body.encode("utf-8")) > _MAX_GROUP_PREAMBLE_BYTES:
            raise ValueError("group_preamble_set content exceeds 512 KiB")
        return self.call(
            "group_preamble_set",
            {"group_id": str(group_id), "content": body, "by": str(by)},
        )

    def group_preamble_reset(self, *, group_id: str, confirm: str, by: str = "user") -> Dict[str, Any]:
        if str(confirm) != "preamble":
            raise ValueError("group_preamble_reset requires confirm='preamble'")
        return self.call(
            "group_preamble_reset",
            {"group_id": str(group_id), "confirm": "preamble", "by": str(by)},
        )

    def terminal_history(
        self,
        *,
        group_id: str,
        actor_id: str,
        before: Optional[int] = None,
        limit_bytes: Optional[int] = None,
        strip_ansi: Optional[bool] = None,
        compact: Optional[bool] = None,
        limit: Optional[int] = None,
        cursor: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        cursor_before = int(cursor) if cursor.isdigit() else None
        return self.call(
            "terminal_history",
            _compact(
                {
                    "group_id": str(group_id),
                    "actor_id": str(actor_id),
                    "before": int(before) if before is not None else cursor_before,
                    "limit_bytes": int(limit_bytes) if limit_bytes is not None else (int(limit) if limit is not None else None),
                    "strip_ansi": strip_ansi,
                    "compact": compact,
                    "by": str(by),
                }
            ),
        )

    def terminal_since(
        self,
        *,
        group_id: str,
        actor_id: str,
        after: int,
        limit_bytes: Optional[int] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "terminal_since",
            _compact(
                {
                    "group_id": str(group_id),
                    "actor_id": str(actor_id),
                    "after": int(after),
                    "limit_bytes": int(limit_bytes) if limit_bytes is not None else None,
                    "by": str(by),
                }
            ),
        )

    def term_resize(self, *, group_id: str, actor_id: str, cols: int, rows: int) -> Dict[str, Any]:
        args = {"group_id": str(group_id), "actor_id": str(actor_id), "cols": int(cols), "rows": int(rows)}
        try:
            return self.call("term_resize", args)
        except DaemonAPIError as error:
            if error.code != "unknown_op":
                raise
        # Rust CCCC builds prior to contract parity used this legacy alias.
        legacy = self.call("terminal_resize", args)
        return {
            "group_id": str(group_id),
            "actor_id": str(actor_id),
            "cols": int(legacy.get("cols") or cols),
            "rows": int(legacy.get("rows") or rows),
        }

    def im_bind_chat(
        self,
        *,
        group_id: str,
        key: str,
    ) -> Dict[str, Any]:
        return self.call("im_bind_chat", {"group_id": str(group_id), "key": str(key)})

    def im_list_authorized(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("im_list_authorized", {"group_id": str(group_id)})

    def im_list_pending(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("im_list_pending", {"group_id": str(group_id)})

    def im_reject_pending(self, *, group_id: str, key: str) -> Dict[str, Any]:
        return self.call("im_reject_pending", {"group_id": str(group_id), "key": str(key)})

    def im_revoke_chat(
        self,
        *,
        group_id: str,
        chat_id: str,
        thread_id: Optional[Union[int, str]] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "im_revoke_chat",
            _compact(
                {
                    "group_id": str(group_id),
                    "chat_id": str(chat_id),
                    "thread_id": thread_id,
                }
            ),
        )

    def remote_access_state(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("remote_access_state", {"by": str(by)})

    def remote_access_configure(
        self,
        *,
        provider: Optional[str] = None,
        mode: Optional[str] = None,
        require_access_token: Optional[bool] = None,
        web_host: Optional[str] = None,
        web_port: Optional[int] = None,
        web_public_url: Optional[str] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "remote_access_configure",
            _compact(
                {
                    "by": str(by),
                    "provider": provider,
                    "mode": mode,
                    "require_access_token": require_access_token,
                    "web_host": web_host,
                    "web_port": int(web_port) if web_port is not None else None,
                    "web_public_url": web_public_url,
                }
            ),
        )

    def remote_access_start(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("remote_access_start", {"by": str(by)})

    def remote_access_stop(self, *, by: str = "user") -> Dict[str, Any]:
        return self.call("remote_access_stop", {"by": str(by)})
