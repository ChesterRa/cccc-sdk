from __future__ import annotations

from typing import Any, Dict, Optional

from .client_0430_shared import _compact


class CCCC0430AdminOpsMixin:
    def actor_new_session(
        self,
        *,
        group_id: str,
        actor_id: str,
        clear_saved_session: bool = False,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "actor_new_session",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
                "clear_saved_session": bool(clear_saved_session),
            },
        )

    def group_copy_export_file(self, *, group_id: str, include_blobs: Optional[bool] = None) -> Dict[str, Any]:
        return self.call("group_copy_export_file", _compact({"group_id": str(group_id), "include_blobs": include_blobs}))

    def group_preamble_get(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("group_preamble_get", {"group_id": str(group_id)})

    def group_preamble_set(self, *, group_id: str, content: str, by: str = "user") -> Dict[str, Any]:
        return self.call(
            "group_preamble_set",
            {"group_id": str(group_id), "content": str(content), "by": str(by)},
        )

    def group_preamble_reset(self, *, group_id: str, by: str = "user") -> Dict[str, Any]:
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
        return self.call(
            "terminal_resize",
            {"group_id": str(group_id), "actor_id": str(actor_id), "cols": int(cols), "rows": int(rows)},
        )

    def im_bind_chat(
        self,
        *,
        group_id: str,
        platform: str,
        chat_id: str,
        thread_id: Optional[int] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "im_bind_chat",
            _compact(
                {
                    "group_id": str(group_id),
                    "platform": str(platform),
                    "chat_id": str(chat_id),
                    "thread_id": int(thread_id) if thread_id is not None else None,
                    "by": str(by),
                }
            ),
        )

    def im_list_authorized(self, *, platform: str = "") -> Dict[str, Any]:
        return self.call("im_list_authorized", _compact({"platform": platform or None}))

    def im_list_pending(self, *, platform: str = "") -> Dict[str, Any]:
        return self.call("im_list_pending", _compact({"platform": platform or None}))

    def im_reject_pending(self, *, key: str, platform: str = "", by: str = "user") -> Dict[str, Any]:
        return self.call("im_reject_pending", _compact({"platform": platform or None, "key": str(key), "by": str(by)}))

    def im_revoke_chat(
        self,
        *,
        chat_id: str,
        platform: str = "",
        thread_id: Optional[int] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "im_revoke_chat",
            _compact(
                {
                    "platform": platform or None,
                    "chat_id": str(chat_id),
                    "thread_id": int(thread_id) if thread_id is not None else None,
                    "by": str(by),
                }
            ),
        )

    def remote_access_state(self, *, group_id: str = "", by: str = "") -> Dict[str, Any]:
        return self.call("remote_access_state", _compact({"group_id": group_id or None, "by": by or None}))

    def remote_access_configure(
        self, *, config: Dict[str, Any], group_id: str = "", by: str = "user"
    ) -> Dict[str, Any]:
        return self.call(
            "remote_access_configure",
            _compact({"group_id": group_id or None, "config": dict(config), "by": str(by)}),
        )

    def remote_access_start(self, *, group_id: str = "", by: str = "user") -> Dict[str, Any]:
        return self.call("remote_access_start", _compact({"group_id": group_id or None, "by": str(by)}))

    def remote_access_stop(self, *, group_id: str = "", by: str = "user") -> Dict[str, Any]:
        return self.call("remote_access_stop", _compact({"group_id": group_id or None, "by": str(by)}))

    def blueprint_generate(self, *, group_id: str, task_id: str, variant: Optional[int] = None) -> Dict[str, Any]:
        return self.call(
            "blueprint_generate",
            _compact(
                {
                    "group_id": str(group_id),
                    "task_id": str(task_id),
                    "variant": int(variant) if variant is not None else None,
                }
            ),
        )
