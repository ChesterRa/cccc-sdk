from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional


MessageMode = Literal["send", "request_reply", "mail"]
ReplyMessageMode = Literal["send", "mail"]
MessageHistoryMode = Literal["all", "send", "request_reply", "mail"]


def _message_mode(value: MessageMode) -> str:
    mode = str(value).strip()
    if mode not in {"send", "request_reply", "mail"}:
        raise ValueError("message_mode must be send, request_reply, or mail")
    return mode


def _message_history_mode(value: MessageHistoryMode) -> str:
    mode = str(value).strip()
    if mode not in {"all", "send", "request_reply", "mail"}:
        raise ValueError("history mode must be all, send, request_reply, or mail")
    return mode


def _reply_message_mode(value: ReplyMessageMode) -> str:
    mode = str(value).strip()
    if mode not in {"send", "mail"}:
        raise ValueError("reply message_mode must be send or mail")
    return mode


class ChatOpsMixin:
    def send_cross_group(
        self,
        *,
        group_id: str,
        dst_group_id: str,
        text: str,
        message_mode: MessageMode,
        by: str = "user",
        to: Optional[List[str]] = None,
        insight: str = "",
        require_peer_insight: Optional[bool] = None,
    ) -> Dict[str, Any]:
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "dst_group_id": str(dst_group_id),
            "text": str(text),
            "by": str(by),
            "message_mode": _message_mode(message_mode),
        }
        if to is not None:
            args["to"] = [str(x) for x in to]
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
        message_mode: MessageMode,
        by: str = "user",
        to: Optional[List[str]] = None,
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
            "message_mode": _message_mode(message_mode),
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
        message_mode: MessageMode,
        text: str = "",
        insight: str = "",
        by: str = "user",
        to: Optional[List[str]] = None,
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
            "message_mode": _message_mode(message_mode),
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
        message_mode: ReplyMessageMode = "send",
        by: str = "user",
        to: Optional[List[str]] = None,
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
            "message_mode": _reply_message_mode(message_mode),
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

    def reply_request_cancel(
        self, *, group_id: str, source_event_id: str, by: str = "user"
    ) -> Dict[str, Any]:
        return self.call(
            "reply_request_cancel",
            {
                "group_id": str(group_id),
                "source_event_id": str(source_event_id),
                "by": str(by),
            },
        )

    def message_deliver(
        self,
        *,
        group_id: str,
        source_event_id: str,
        actor_ids: List[str],
        by: str = "user",
        force_ambiguous: bool = False,
    ) -> Dict[str, Any]:
        recipients = [str(actor_id).strip() for actor_id in actor_ids]
        if not recipients or any(not actor_id for actor_id in recipients):
            raise ValueError("message_deliver requires one or more non-empty actor_ids")
        return self.call(
            "message_deliver",
            {
                "group_id": str(group_id),
                "source_event_id": str(source_event_id),
                "actor_ids": recipients,
                "by": str(by),
                "force_ambiguous": bool(force_ambiguous),
            },
        )

    def inbox_peek(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
        limit: int = 50,
    ) -> Dict[str, Any]:
        return self.call(
            "inbox_peek",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
                "limit": int(limit),
            },
        )

    def inbox_read(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
        limit: int = 50,
    ) -> Dict[str, Any]:
        return self.call(
            "inbox_read",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "by": str(by),
                "limit": int(limit),
            },
        )

    def message_history(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
        mode: MessageHistoryMode = "all",
        query: str = "",
        before_event_id: str = "",
        limit: int = 50,
    ) -> Dict[str, Any]:
        """Inspect actor-visible messages without consuming Mail."""
        args: Dict[str, Any] = {
            "group_id": str(group_id),
            "actor_id": str(actor_id),
            "by": str(by),
            "mode": _message_history_mode(mode),
            "limit": int(limit),
        }
        if query:
            args["query"] = str(query)
        if before_event_id:
            args["before_event_id"] = str(before_event_id)
        return self.call("message_history", args)
