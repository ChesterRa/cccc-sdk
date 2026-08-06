from __future__ import annotations

from typing import Any, Dict, List, Optional


class ChatOpsMixin:
    def send_cross_group(
        self,
        *,
        group_id: str,
        dst_group_id: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
        reply_required: bool = False,
        refs: Optional[List[Dict[str, Any]]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        insight: str = "",
        require_peer_insight: Optional[bool] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "dst_group_id": str(dst_group_id),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
            "reply_required": bool(reply_required),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        if refs is not None:
            args["refs"] = [dict(r) for r in refs]
        if attachments is not None:
            args["attachments"] = [dict(a) for a in attachments]
        if insight:
            args["insight"] = str(insight)
        if require_peer_insight is not None:
            args["require_peer_insight"] = bool(require_peer_insight)
        return self.call("send_cross_group", args)

    def send(
        self,
        *,
        group_id: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
        reply_required: bool = False,
        path: str = "",
        refs: Optional[List[Dict[str, Any]]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        client_id: str = "",
        suggested_user_message: str = "",
        insight: str = "",
        require_peer_insight: Optional[bool] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
            "reply_required": bool(reply_required),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        if path:
            args["path"] = str(path)
        if refs is not None:
            args["refs"] = [dict(r) for r in refs]
        if attachments is not None:
            args["attachments"] = [dict(a) for a in attachments]
        if client_id:
            args["client_id"] = str(client_id)
        if suggested_user_message:
            args["suggested_user_message"] = str(suggested_user_message)
        if insight:
            args["insight"] = str(insight)
        if require_peer_insight is not None:
            args["require_peer_insight"] = bool(require_peer_insight)
        return self.call("send", args)

    def send_files(
        self,
        *,
        group_id: str,
        paths: List[str],
        text: str = "",
        insight: str = "",
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
        reply_required: bool = False,
        client_id: str = "",
    ) -> Dict[str, Any]:
        """Upload active-scope files and send them in one chat message."""
        if not isinstance(paths, list):
            raise ValueError("send_files requires a non-empty list of paths")
        normalized_paths = [str(path).strip() for path in paths]
        if not normalized_paths or any(not path for path in normalized_paths):
            raise ValueError("send_files requires one or more non-empty paths")
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "paths": normalized_paths,
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
            "reply_required": bool(reply_required),
        }
        if to is not None:
            args["to"] = [str(item) for item in to]
        if insight:
            args["insight"] = str(insight)
        if client_id:
            args["client_id"] = str(client_id)
        return self.call("send_files", args)

    def reply(
        self,
        *,
        group_id: str,
        reply_to: str,
        text: str,
        by: str = "user",
        to: Optional[List[str]] = None,
        priority: str = "normal",
        reply_required: bool = False,
        refs: Optional[List[Dict[str, Any]]] = None,
        attachments: Optional[List[Dict[str, Any]]] = None,
        client_id: str = "",
        suggested_user_message: str = "",
        insight: str = "",
        require_peer_insight: Optional[bool] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "reply_to": str(reply_to),
            "text": str(text),
            "by": str(by),
            "priority": str(priority),
            "reply_required": bool(reply_required),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
        if refs is not None:
            args["refs"] = [dict(r) for r in refs]
        if attachments is not None:
            args["attachments"] = [dict(a) for a in attachments]
        if client_id:
            args["client_id"] = str(client_id)
        if suggested_user_message:
            args["suggested_user_message"] = str(suggested_user_message)
        if insight:
            args["insight"] = str(insight)
        if require_peer_insight is not None:
            args["require_peer_insight"] = bool(require_peer_insight)
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
