from __future__ import annotations

from typing import Any, Dict, Optional

from .client_0430_shared import _compact
from .errors import IncompatibleDaemonError


class CCCC0430AssistantOpsMixin:
    def assistant_voice_model_install(
        self,
        *,
        group_id: str,
        model_id: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_model_install",
            {"group_id": str(group_id), "model_id": str(model_id), "by": str(by)},
        )

    def assistant_voice_transcribe(
        self,
        *,
        group_id: str,
        audio_base64: str = "",
        path: str = "",
        mime_type: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        del group_id, audio_base64, path, mime_type, by
        raise IncompatibleDaemonError(
            "assistant_voice_transcribe was removed from Rust daemon IPC; "
            "use the HTTP Voice Secretary transcription endpoint"
        )

    def assistant_voice_transcript_append(
        self,
        *,
        group_id: str,
        session_id: str,
        segment_id: str = "",
        text: str = "",
        language: str = "",
        document_path: str = "",
        is_final: Optional[bool] = None,
        flush: Optional[bool] = None,
        trigger: Optional[Dict[str, Any]] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_transcript_append",
            _compact(
                {
                    "group_id": str(group_id),
                    "session_id": str(session_id),
                    "segment_id": segment_id or None,
                    "text": text or None,
                    "language": language or None,
                    "document_path": document_path or None,
                    "is_final": is_final,
                    "flush": flush,
                    "trigger": dict(trigger) if trigger is not None else None,
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_document_list(self, *, group_id: str, include_archived: Optional[bool] = None) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_document_list",
            _compact({"group_id": str(group_id), "include_archived": include_archived}),
        )

    def assistant_voice_document_input_read(
        self, *, group_id: str, by: str = ""
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_document_input_read",
            _compact({"group_id": str(group_id), "by": by or None}),
        )

    def assistant_voice_document_save(
        self,
        *,
        group_id: str,
        document_path: str = "",
        workspace_path: str = "",
        title: str = "",
        content: str = "",
        status: str = "",
        create_new: Optional[bool] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_document_save",
            _compact(
                {
                    "group_id": str(group_id),
                    "document_path": document_path or None,
                    "workspace_path": workspace_path or None,
                    "title": title or None,
                    "content": content or None,
                    "status": status or None,
                    "create_new": create_new,
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_document_instruction(
        self,
        *,
        group_id: str,
        document_path: str,
        request_id: str = "",
        input_append_id: str = "",
        instruction: str = "",
        source_text: str = "",
        trigger: Optional[Dict[str, Any]] = None,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_document_instruction",
            _compact(
                {
                    "group_id": str(group_id),
                    "document_path": str(document_path),
                    "request_id": request_id or None,
                    "input_append_id": input_append_id or None,
                    "instruction": instruction or None,
                    "source_text": source_text or None,
                    "trigger": dict(trigger) if trigger is not None else None,
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_document_archive(
        self,
        *,
        group_id: str,
        document_path: str,
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_document_archive",
            _compact(
                {
                    "group_id": str(group_id),
                    "document_path": str(document_path),
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_input_append(
        self,
        *,
        group_id: str,
        kind: str = "prompt_refine",
        request_id: str = "",
        input_append_id: str = "",
        instruction: str = "",
        text: str = "",
        source_text: str = "",
        voice_transcript: str = "",
        composer_text: str = "",
        operation: str = "",
        composer_context: Optional[Dict[str, Any]] = None,
        composer_snapshot_hash: str = "",
        by: str = "user",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_input_append",
            _compact(
                {
                    "group_id": str(group_id),
                    "kind": str(kind),
                    "request_id": request_id or None,
                    "input_append_id": input_append_id or None,
                    "instruction": instruction or None,
                    "text": text or None,
                    "source_text": source_text or None,
                    "voice_transcript": voice_transcript or None,
                    "composer_text": composer_text or None,
                    "operation": operation or None,
                    "composer_context": dict(composer_context) if composer_context is not None else None,
                    "composer_snapshot_hash": composer_snapshot_hash or None,
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_prompt_draft_submit(
        self,
        *,
        group_id: str,
        request_id: str,
        draft_text: str = "",
        no_op: Optional[bool] = None,
        summary: str = "",
        operation: str = "",
        composer_snapshot_hash: str = "",
        by: str = "voice-secretary",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_prompt_draft_submit",
            _compact(
                {
                    "group_id": str(group_id),
                    "request_id": str(request_id),
                    "draft_text": draft_text or None,
                    "no_op": no_op,
                    "summary": summary or None,
                    "operation": operation or None,
                    "composer_snapshot_hash": composer_snapshot_hash or None,
                    "by": str(by),
                }
            ),
        )

    def assistant_voice_prompt_draft_ack(
        self, *, group_id: str, request_id: str, status: str
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_prompt_draft_ack",
            {"group_id": str(group_id), "request_id": str(request_id), "status": str(status)},
        )

    def assistant_voice_request(
        self,
        *,
        group_id: str,
        request_text: str,
        target: str = "",
        summary: str = "",
        document_path: str = "",
        artifact_paths: Optional[list[str]] = None,
        source_event_id: str = "",
        priority: str = "",
        requires_ack: Optional[bool] = None,
        by: str = "voice-secretary",
    ) -> Dict[str, Any]:
        return self.call(
            "assistant_voice_request",
            _compact(
                {
                    "group_id": str(group_id),
                    "request_text": str(request_text),
                    "target": target or None,
                    "summary": summary or None,
                    "document_path": document_path or None,
                    "artifact_paths": [str(path) for path in artifact_paths] if artifact_paths is not None else None,
                    "source_event_id": source_event_id or None,
                    "priority": priority or None,
                    "requires_ack": requires_ack,
                    "by": str(by),
                }
            ),
        )
