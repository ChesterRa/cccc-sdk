from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client_0430_shared import _compact
from .client_chat_ops import MessageMode, _message_mode


def _check_key(client_id: str) -> None:
    if not client_id.strip() or len(client_id.encode("utf-8")) > 128:
        raise ValueError("client_id must be non-empty and at most 128 UTF-8 bytes")


class ConnectOpsMixin:
    """Qualified remote Group routes; acceptance is not proof of delivery."""

    def connect_catalog(self, *, group_id: str, instance_id: Optional[str] = None,
                        target_group_id: Optional[str] = None, by: str = "user",
                        after: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        return self.call("connect_catalog", _compact(dict(
            group_id=group_id, instance_id=instance_id, target_group_id=target_group_id,
            by=by, after=after, limit=limit)))

    def connect_send(self, *, group_id: str, instance_id: str, target_group_id: str,
                     client_id: str, text: str, message_mode: MessageMode, by: str = "user",
                     to: Optional[List[str]] = None, format: Optional[str] = None,
                     insight: Optional[str] = None,
                     attachments: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        # Retain this caller key across an uncertain outcome; never generate a new one on retry.
        _check_key(client_id)
        return self.call("connect_send", _compact(dict(
            group_id=group_id, instance_id=instance_id, target_group_id=target_group_id,
            client_id=client_id, text=text, message_mode=_message_mode(message_mode), by=by, to=to,
            format=format, insight=insight, attachments=attachments)))

    def connect_send_files(self, *, group_id: str, instance_id: str, target_group_id: str,
                           client_id: str, paths: List[str], message_mode: MessageMode,
                           text: str = "", by: str = "user", to: Optional[List[str]] = None,
                           insight: Optional[str] = None) -> Dict[str, Any]:
        _check_key(client_id)
        if not paths or any(not path.strip() for path in paths):
            raise ValueError("paths must contain one or more non-empty paths")
        return self.call("connect_send_files", _compact(dict(
            group_id=group_id, instance_id=instance_id, target_group_id=target_group_id,
            client_id=client_id, paths=list(paths), text=text, message_mode=_message_mode(message_mode),
            by=by, to=to, insight=insight)))
