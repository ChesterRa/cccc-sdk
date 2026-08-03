from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client_0430_shared import _compact


class CCCC0430MemoryOpsMixin:
    def memory_reme_layout_get(self, *, group_id: Optional[str] = None, by: Optional[str] = None) -> Dict[str, Any]:
        return self.call("memory_reme_layout_get", _compact({"group_id": group_id, "by": by}))

    def memory_reme_search(
        self,
        *,
        query: str,
        group_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        limit: Optional[int] = None,
        max_results: Optional[int] = None,
        tags: Optional[List[str]] = None,
        target: Optional[str] = None,
        vector_weight: Optional[float] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_search",
            _compact(
                {
                    "group_id": group_id,
                    "actor_id": actor_id,
                    "query": str(query),
                    "limit": int(limit) if limit is not None else None,
                    "max_results": int(max_results) if max_results is not None else None,
                    "tags": [str(x) for x in tags] if tags is not None else None,
                    "target": str(target) if target is not None else None,
                    "vector_weight": float(vector_weight) if vector_weight is not None else None,
                }
            ),
        )

    def memory_reme_get(
        self,
        *,
        group_id: Optional[str] = None,
        path: Optional[str] = None,
        actor_id: Optional[str] = None,
        target: Optional[str] = None,
        date: Optional[str] = None,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_get",
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

    def memory_reme_write(
        self,
        *,
        target: str,
        content: str,
        group_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        source_refs: Optional[List[str]] = None,
        idempotency_key: Optional[str] = None,
        dedup_intent: Optional[str] = None,
        dedup_query: Optional[str] = None,
        date: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_write",
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
                    "date": date,
                }
            ),
        )

    def memory_reme_index_sync(
        self, *, group_id: Optional[str] = None, force: Optional[bool] = None, by: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.call("memory_reme_index_sync", _compact({"group_id": group_id, "force": force, "by": by}))

    def memory_reme_context_check(
        self, *, messages: List[Dict[str, Any]], group_id: Optional[str] = None, by: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.call("memory_reme_context_check", _compact({"group_id": group_id, "messages": [dict(m) for m in messages], "by": by}))

    def memory_reme_compact(
        self,
        *,
        messages: List[Dict[str, Any]],
        group_id: Optional[str] = None,
        return_prompt: Optional[bool] = None,
        by: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_compact",
            _compact({"group_id": group_id, "messages": [dict(m) for m in messages], "return_prompt": return_prompt, "by": by}),
        )

    def memory_reme_daily_flush(
        self, *, group_id: Optional[str] = None, date: Optional[str] = None, by: Optional[str] = None
    ) -> Dict[str, Any]:
        return self.call("memory_reme_daily_flush", _compact({"group_id": group_id, "date": date, "by": by}))
