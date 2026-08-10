import { compactRecord, type CCCC0430Client } from './client_0430_shared.js';
import { IncompatibleDaemonError } from './errors.js';

type VoiceSecretaryDocumentSaveOptions = {
  groupId: string;
  documentPath?: string;
  workspacePath?: string;
  title?: string;
  content?: string;
  status?: 'active' | 'archived';
  createNew?: boolean;
  by?: string;
};

export interface CCCC0430AssistantOps {
  assistantVoiceModelInstall(options: { groupId: string; modelId: string; by?: string }): Promise<Record<string, unknown>>;
  /** @deprecated Rust CCCC uses the HTTP Voice Secretary transcription endpoint. */
  assistantVoiceTranscribe(options: { groupId: string; audioBase64?: string; path?: string; mimeType?: string; by?: string }): Promise<Record<string, unknown>>;
  assistantVoiceTranscriptAppend(options: {
    groupId: string;
    sessionId: string;
    segmentId?: string;
    text?: string;
    language?: string;
    documentPath?: string;
    isFinal?: boolean;
    flush?: boolean;
    trigger?: Record<string, unknown>;
    by?: string;
  }): Promise<Record<string, unknown>>;
  assistantVoiceDocumentList(options: { groupId: string; includeArchived?: boolean }): Promise<Record<string, unknown>>;
  assistantVoiceDocumentInputRead(options: { groupId: string; by?: string }): Promise<Record<string, unknown>>;
  assistantVoiceDocumentSave(options: VoiceSecretaryDocumentSaveOptions): Promise<Record<string, unknown>>;
  assistantVoiceDocumentInstruction(options: {
    groupId: string;
    documentPath: string;
    requestId?: string;
    inputAppendId?: string;
    instruction?: string;
    sourceText?: string;
    trigger?: Record<string, unknown>;
    by?: string;
  }): Promise<Record<string, unknown>>;
  assistantVoiceDocumentArchive(options: { groupId: string; documentPath: string; by?: string }): Promise<Record<string, unknown>>;
  assistantVoiceInputAppend(options: {
    groupId: string;
    kind?: 'voice_instruction' | 'prompt_refine';
    requestId?: string;
    inputAppendId?: string;
    instruction?: string;
    text?: string;
    sourceText?: string;
    voiceTranscript?: string;
    composerText?: string;
    operation?: string;
    composerContext?: Record<string, unknown>;
    composerSnapshotHash?: string;
    by?: string;
  }): Promise<Record<string, unknown>>;
  assistantVoicePromptDraftSubmit(options: {
    groupId: string;
    requestId: string;
    draftText?: string;
    noOp?: boolean;
    summary?: string;
    operation?: string;
    composerSnapshotHash?: string;
    by?: string;
  }): Promise<Record<string, unknown>>;
  assistantVoicePromptDraftAck(options: {
    groupId: string;
    requestId: string;
    status: 'applied' | 'dismissed' | 'stale';
  }): Promise<Record<string, unknown>>;
  assistantVoiceRequest(options: {
    groupId: string;
    requestText: string;
    target?: string;
    summary?: string;
    documentPath?: string;
    artifactPaths?: string[];
    sourceEventId?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    requiresAck?: boolean;
    by?: string;
  }): Promise<Record<string, unknown>>;
}

const assistantOps: CCCC0430AssistantOps & ThisType<CCCC0430Client> = {
  async assistantVoiceModelInstall(options) {
    return this.call('assistant_voice_model_install', compactRecord({
      group_id: options.groupId,
      model_id: options.modelId,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoiceTranscribe(options) {
    void options;
    throw new IncompatibleDaemonError(
      'assistant_voice_transcribe was removed from Rust daemon IPC; use the HTTP Voice Secretary transcription endpoint'
    );
  },

  async assistantVoiceTranscriptAppend(options) {
    return this.call('assistant_voice_transcript_append', compactRecord({
      group_id: options.groupId,
      session_id: options.sessionId,
      segment_id: options.segmentId,
      text: options.text,
      language: options.language,
      document_path: options.documentPath,
      is_final: options.isFinal,
      flush: options.flush,
      trigger: options.trigger,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoiceDocumentList(options) {
    return this.call('assistant_voice_document_list', compactRecord({
      group_id: options.groupId,
      include_archived: options.includeArchived,
    }));
  },

  async assistantVoiceDocumentInputRead(options) {
    return this.call('assistant_voice_document_input_read', compactRecord({
      group_id: options.groupId,
      by: options.by,
    }));
  },

  async assistantVoiceDocumentSave(options) {
    return this.call('assistant_voice_document_save', compactRecord({
      group_id: options.groupId,
      document_path: options.documentPath,
      workspace_path: options.workspacePath,
      title: options.title,
      content: options.content,
      status: options.status,
      create_new: options.createNew,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoiceDocumentInstruction(options) {
    return this.call('assistant_voice_document_instruction', compactRecord({
      group_id: options.groupId,
      document_path: options.documentPath,
      request_id: options.requestId,
      input_append_id: options.inputAppendId,
      instruction: options.instruction,
      source_text: options.sourceText,
      trigger: options.trigger,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoiceDocumentArchive(options) {
    return this.call('assistant_voice_document_archive', compactRecord({
      group_id: options.groupId,
      document_path: options.documentPath,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoiceInputAppend(options) {
    return this.call('assistant_voice_input_append', compactRecord({
      group_id: options.groupId,
      kind: options.kind ?? 'prompt_refine',
      request_id: options.requestId,
      input_append_id: options.inputAppendId,
      instruction: options.instruction,
      text: options.text,
      source_text: options.sourceText,
      voice_transcript: options.voiceTranscript,
      composer_text: options.composerText,
      operation: options.operation,
      composer_context: options.composerContext,
      composer_snapshot_hash: options.composerSnapshotHash,
      by: options.by ?? 'user',
    }));
  },

  async assistantVoicePromptDraftSubmit(options) {
    return this.call('assistant_voice_prompt_draft_submit', compactRecord({
      group_id: options.groupId,
      request_id: options.requestId,
      draft_text: options.draftText,
      no_op: options.noOp,
      summary: options.summary,
      operation: options.operation,
      composer_snapshot_hash: options.composerSnapshotHash,
      by: options.by ?? 'voice-secretary',
    }));
  },

  async assistantVoicePromptDraftAck(options) {
    return this.call('assistant_voice_prompt_draft_ack', {
      group_id: options.groupId,
      request_id: options.requestId,
      status: options.status,
    });
  },

  async assistantVoiceRequest(options) {
    return this.call('assistant_voice_request', compactRecord({
      group_id: options.groupId,
      request_text: options.requestText,
      target: options.target,
      summary: options.summary,
      document_path: options.documentPath,
      artifact_paths: options.artifactPaths,
      source_event_id: options.sourceEventId,
      priority: options.priority,
      requires_ack: options.requiresAck,
      by: options.by ?? 'voice-secretary',
    }));
  },
};

export function installCCCC0430AssistantOps(proto: CCCC0430Client & Partial<CCCC0430AssistantOps>): void {
  Object.assign(proto, assistantOps);
}
