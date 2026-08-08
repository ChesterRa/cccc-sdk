from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from .client_0430_shared import _compact


class CCCC0434OpsMixin:
    """Operations added to the daemon IPC contract for CCCC 0.4.34."""

    def terminal_snapshot(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: str = "user",
        limit_bytes: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "terminal_snapshot",
            _compact(
                {
                    "group_id": str(group_id),
                    "actor_id": str(actor_id),
                    "by": str(by),
                    "limit_bytes": int(limit_bytes) if limit_bytes is not None else None,
                }
            ),
        )

    def web_model_delivery_preferences_get(
        self,
        *,
        group_id: str,
        actor_id: str,
    ) -> Dict[str, Any]:
        return self.call(
            "web_model_delivery_preferences_get",
            {"group_id": str(group_id), "actor_id": str(actor_id)},
        )

    def web_model_delivery_preferences_update(
        self,
        *,
        group_id: str,
        actor_id: str,
        mode: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        normalized_mode = str(mode).strip()
        if normalized_mode not in {"standard", "image_compat"}:
            raise ValueError("mode must be 'standard' or 'image_compat'")
        return self.call(
            "web_model_delivery_preferences_update",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "mode": normalized_mode,
                "by": str(by),
            },
        )

    def web_model_runtime_recover_turn(
        self,
        *,
        group_id: str,
        actor_id: str,
        event_ids: Iterable[str],
    ) -> Dict[str, Any]:
        if isinstance(event_ids, (str, bytes)):
            raise ValueError("event_ids must be an iterable of event id strings")
        canonical_event_ids = [str(event_id).strip() for event_id in event_ids]
        if not canonical_event_ids or any(not event_id for event_id in canonical_event_ids):
            raise ValueError("event_ids must contain at least one non-empty event id")
        return self.call(
            "web_model_runtime_recover_turn",
            {
                "group_id": str(group_id),
                "actor_id": str(actor_id),
                "event_ids": canonical_event_ids,
            },
        )
