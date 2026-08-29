from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client_0430_shared import _compact


class CCCC0430RuntimeOpsMixin:
    """Web Model runtime operations supported by the current native contract."""

    def web_model_runtime_wait_next_turn(
        self,
        *,
        group_id: str,
        actor_id: str,
        by: Optional[str] = None,
        limit: int = 20,
        kind_filter: str = "all",
    ) -> Dict[str, Any]:
        aid = str(actor_id)
        return self.call(
            "web_model_runtime_wait_next_turn",
            {
                "group_id": str(group_id),
                "actor_id": aid,
                "by": str(by) if by is not None else aid,
                "limit": min(max(int(limit), 1), 20),
                "kind_filter": str(kind_filter),
            },
        )

    def web_model_runtime_complete_turn(
        self,
        *,
        group_id: str,
        actor_id: str,
        turn_id: str,
        delivery_id: str,
        event_ids: Optional[List[str]] = None,
        latest_event_id: str = "",
        status: str = "done",
        summary: str = "",
        by: Optional[str] = None,
    ) -> Dict[str, Any]:
        aid = str(actor_id)
        return self.call(
            "web_model_runtime_complete_turn",
            _compact(
                {
                    "group_id": str(group_id),
                    "actor_id": aid,
                    "by": str(by) if by is not None else aid,
                    "turn_id": str(turn_id),
                    "delivery_id": str(delivery_id),
                    "event_ids": [str(event_id) for event_id in event_ids]
                    if event_ids is not None
                    else None,
                    "latest_event_id": latest_event_id or None,
                    "status": str(status),
                    "summary": summary or None,
                }
            ),
        )
