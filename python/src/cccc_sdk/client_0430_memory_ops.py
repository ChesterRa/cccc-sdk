from __future__ import annotations

from typing import Any, Dict, List, Optional

from .client_0430_shared import _compact


class CCCC0430MemoryOpsMixin:
    def memory_reme_layout_get(self, *, group_id: str) -> Dict[str, Any]:
        return self.call("memory_reme_layout_get", {"group_id": str(group_id)})

    def memory_reme_index_sync(self, *, group_id: str, mode: Optional[str] = None) -> Dict[str, Any]:
        return self.call(
            "memory_reme_index_sync",
            _compact({"group_id": str(group_id), "mode": str(mode) if mode is not None else None}),
        )

    def memory_reme_search(
        self,
        *,
        group_id: str,
        query: str,
        max_results: Optional[int] = None,
        min_score: Optional[float] = None,
        sources: Optional[List[str]] = None,
        vector_weight: Optional[float] = None,
        candidate_multiplier: Optional[float] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_search",
            _compact(
                {
                    "group_id": str(group_id),
                    "query": str(query),
                    "max_results": int(max_results) if max_results is not None else None,
                    "min_score": float(min_score) if min_score is not None else None,
                    "sources": [str(source) for source in sources] if sources is not None else None,
                    "vector_weight": float(vector_weight) if vector_weight is not None else None,
                    "candidate_multiplier": (
                        float(candidate_multiplier) if candidate_multiplier is not None else None
                    ),
                }
            ),
        )

    def memory_reme_get(
        self,
        *,
        group_id: str,
        path: str,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_get",
            _compact(
                {
                    "group_id": str(group_id),
                    "path": str(path),
                    "offset": int(offset) if offset is not None else None,
                    "limit": int(limit) if limit is not None else None,
                }
            ),
        )

    def memory_reme_context_check(
        self,
        *,
        group_id: str,
        messages: List[Dict[str, Any]],
        context_window_tokens: Optional[int] = None,
        reserve_tokens: Optional[int] = None,
        keep_recent_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_context_check",
            _compact(
                {
                    "group_id": str(group_id),
                    "messages": [dict(message) for message in messages],
                    "context_window_tokens": (
                        int(context_window_tokens) if context_window_tokens is not None else None
                    ),
                    "reserve_tokens": int(reserve_tokens) if reserve_tokens is not None else None,
                    "keep_recent_tokens": (
                        int(keep_recent_tokens) if keep_recent_tokens is not None else None
                    ),
                }
            ),
        )

    def memory_reme_compact(
        self,
        *,
        group_id: str,
        messages_to_summarize: List[Dict[str, Any]],
        turn_prefix_messages: Optional[List[Dict[str, Any]]] = None,
        previous_summary: Optional[str] = None,
        language: Optional[str] = None,
        return_prompt: Optional[bool] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_compact",
            _compact(
                {
                    "group_id": str(group_id),
                    "messages_to_summarize": [dict(message) for message in messages_to_summarize],
                    "turn_prefix_messages": (
                        [dict(message) for message in turn_prefix_messages]
                        if turn_prefix_messages is not None
                        else None
                    ),
                    "previous_summary": previous_summary,
                    "language": language,
                    "return_prompt": return_prompt,
                }
            ),
        )

    def memory_reme_daily_flush(
        self,
        *,
        group_id: str,
        messages: List[Dict[str, Any]],
        date: Optional[str] = None,
        version: Optional[str] = None,
        language: Optional[str] = None,
        return_prompt: Optional[bool] = None,
        signal_pack: Optional[Dict[str, Any]] = None,
        signal_pack_token_budget: Optional[int] = None,
        dedup_intent: Optional[str] = None,
        dedup_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_daily_flush",
            _compact(
                {
                    "group_id": str(group_id),
                    "messages": [dict(message) for message in messages],
                    "date": date,
                    "version": version,
                    "language": language,
                    "return_prompt": return_prompt,
                    "signal_pack": dict(signal_pack) if signal_pack is not None else None,
                    "signal_pack_token_budget": (
                        int(signal_pack_token_budget) if signal_pack_token_budget is not None else None
                    ),
                    "dedup_intent": dedup_intent,
                    "dedup_query": dedup_query,
                }
            ),
        )

    def memory_reme_write(
        self,
        *,
        group_id: str,
        target: str,
        content: str,
        date: Optional[str] = None,
        mode: Optional[str] = None,
        idempotency_key: Optional[str] = None,
        actor_id: Optional[str] = None,
        source_refs: Optional[List[str]] = None,
        tags: Optional[List[str]] = None,
        supersedes: Optional[List[str]] = None,
        dedup_intent: Optional[str] = None,
        dedup_query: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.call(
            "memory_reme_write",
            _compact(
                {
                    "group_id": str(group_id),
                    "target": str(target),
                    "content": str(content),
                    "date": date,
                    "mode": mode,
                    "idempotency_key": idempotency_key,
                    "actor_id": actor_id,
                    "source_refs": [str(ref) for ref in source_refs] if source_refs is not None else None,
                    "tags": [str(tag) for tag in tags] if tags is not None else None,
                    "supersedes": [str(ref) for ref in supersedes] if supersedes is not None else None,
                    "dedup_intent": dedup_intent,
                    "dedup_query": dedup_query,
                }
            ),
        )
