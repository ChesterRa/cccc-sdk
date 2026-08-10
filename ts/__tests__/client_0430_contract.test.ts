import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/client.js';
import { IncompatibleDaemonError } from '../src/errors.js';

type CallCapture = { op: string; args?: Record<string, unknown> };

async function makeClient(calls: CallCapture[]): Promise<CCCCClient> {
  const client = await CCCCClient.create({
    endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
  });
  client.call = async (op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    calls.push({ op, args });
    return {};
  };
  return client;
}

describe('cccc 0.4.33 JSON op alignment', () => {
  it('maps current message, group preamble, and terminal operations', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.send({
      groupId: 'g_1',
      text: 'next?',
      suggestedUserMessage: 'ship it',
      insight: 'Compatibility is the release gate.',
      requirePeerInsight: true,
    });
    await client.reply({ groupId: 'g_1', replyTo: 'e_1', text: 'done', insight: 'The probe now matches reality.' });
    await client.groupPreambleGet({ groupId: 'g_1' });
    await client.groupPreambleSet({ groupId: 'g_1', content: 'Project guidance' });
    await client.groupPreambleReset({ groupId: 'g_1', confirm: 'preamble' });
    await client.terminalHistory({
      groupId: 'g_1',
      actorId: 'codex-1',
      before: 100,
      limitBytes: 2048,
      stripAnsi: true,
      compact: true,
    });
    await client.terminalSince({ groupId: 'g_1', actorId: 'codex-1', after: 100, limitBytes: 4096 });
    await client.termResize({ groupId: 'g_1', actorId: 'codex-1', cols: 120, rows: 40 });

    assert.deepEqual(calls.map((call) => call.op), [
      'send',
      'reply',
      'group_preamble_get',
      'group_preamble_set',
      'group_preamble_reset',
      'terminal_history',
      'terminal_since',
      'term_resize',
    ]);
    assert.equal(calls[0]?.args?.['insight'], 'Compatibility is the release gate.');
    assert.equal(calls[0]?.args?.['require_peer_insight'], true);
    assert.equal(calls[4]?.args?.['confirm'], 'preamble');
    assert.equal(calls[5]?.args?.['before'], 100);
    assert.equal(calls[5]?.args?.['limit_bytes'], 2048);
    assert.equal(calls[6]?.args?.['after'], 100);
  });

  it('maps all ReMe helpers to the current daemon contract', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    const message = { role: 'user', name: 'waterbang', content: 'Keep this decision.' };

    await client.memoryRemeLayoutGet({ groupId: 'g_1' });
    await client.memoryRemeIndexSync({ groupId: 'g_1', mode: 'rebuild' });
    await client.memoryRemeContextCheck({
      groupId: 'g_1',
      messages: [message],
      contextWindowTokens: 128000,
      reserveTokens: 36000,
      keepRecentTokens: 20000,
    });
    await client.memoryRemeCompact({
      groupId: 'g_1',
      messagesToSummarize: [message],
      turnPrefixMessages: [{ role: 'system', content: 'Project context' }],
      previousSummary: 'Earlier summary',
      language: 'zh-CN',
      returnPrompt: true,
    });
    await client.memoryRemeDailyFlush({
      groupId: 'g_1',
      messages: [message],
      date: '2026-08-08',
      version: 'default',
      language: 'zh-CN',
      returnPrompt: false,
      signalPack: { decisions: ['ship'] },
      signalPackTokenBudget: 320,
      dedupIntent: 'update',
      dedupQuery: 'release decision',
    });
    await client.memoryRemeWrite({
      groupId: 'g_1',
      target: 'memory',
      content: 'The SDK follows IPC v1.',
      mode: 'append',
      idempotencyKey: 'sdk-ipc-v1',
      actorId: 'foreman',
      sourceRefs: ['chat:e_1'],
      tags: ['sdk'],
      supersedes: ['MEMORY.md#L1'],
      dedupIntent: 'supersede',
      dedupQuery: 'SDK IPC contract',
    });

    assert.deepEqual(calls.map((call) => call.op), [
      'memory_reme_layout_get',
      'memory_reme_index_sync',
      'memory_reme_context_check',
      'memory_reme_compact',
      'memory_reme_daily_flush',
      'memory_reme_write',
    ]);
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1' });
    assert.deepEqual(calls[1]?.args, { group_id: 'g_1', mode: 'rebuild' });
    assert.deepEqual(calls[2]?.args, {
      group_id: 'g_1',
      messages: [message],
      context_window_tokens: 128000,
      reserve_tokens: 36000,
      keep_recent_tokens: 20000,
    });
    assert.deepEqual(calls[3]?.args, {
      group_id: 'g_1',
      messages_to_summarize: [message],
      turn_prefix_messages: [{ role: 'system', content: 'Project context' }],
      previous_summary: 'Earlier summary',
      language: 'zh-CN',
      return_prompt: true,
    });
    assert.deepEqual(calls[4]?.args, {
      group_id: 'g_1',
      messages: [message],
      date: '2026-08-08',
      version: 'default',
      language: 'zh-CN',
      return_prompt: false,
      signal_pack: { decisions: ['ship'] },
      signal_pack_token_budget: 320,
      dedup_intent: 'update',
      dedup_query: 'release decision',
    });
    assert.deepEqual(calls[5]?.args, {
      group_id: 'g_1',
      target: 'memory',
      content: 'The SDK follows IPC v1.',
      mode: 'append',
      idempotency_key: 'sdk-ipc-v1',
      actor_id: 'foreman',
      source_refs: ['chat:e_1'],
      tags: ['sdk'],
      supersedes: ['MEMORY.md#L1'],
      dedup_intent: 'supersede',
      dedup_query: 'SDK IPC contract',
    });
  });

  it('maps Remote Access helpers to the global flat contract', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.remoteAccessState();
    await client.remoteAccessConfigure({
      provider: 'manual',
      mode: 'tailnet_only',
      requireAccessToken: true,
      webHost: '0.0.0.0',
      webPort: 8848,
      webPublicUrl: 'https://cccc.example.test',
    });
    await client.remoteAccessStart();
    await client.remoteAccessStop({ by: 'user' });

    assert.deepEqual(calls.map((call) => call.op), [
      'remote_access_state',
      'remote_access_configure',
      'remote_access_start',
      'remote_access_stop',
    ]);
    assert.deepEqual(calls[0]?.args, { by: 'user' });
    assert.deepEqual(calls[1]?.args, {
      by: 'user',
      provider: 'manual',
      mode: 'tailnet_only',
      require_access_token: true,
      web_host: '0.0.0.0',
      web_port: 8848,
      web_public_url: 'https://cccc.example.test',
    });
    assert.deepEqual(calls[2]?.args, { by: 'user' });
    assert.deepEqual(calls[3]?.args, { by: 'user' });
  });

  it('maps IM authorization and Voice model install to their current contracts', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.imBindChat({ groupId: 'g_1', key: 'bind-key' });
    await client.imListAuthorized({ groupId: 'g_1' });
    await client.imListPending({ groupId: 'g_1' });
    await client.imRejectPending({ groupId: 'g_1', key: 'bind-key' });
    await client.imRevokeChat({
      groupId: 'g_1',
      chatId: 'chat-1',
      threadId: '1710000000.100',
    });
    await client.assistantVoiceModelInstall({ groupId: 'g_1', modelId: 'sensevoice-small' });

    assert.deepEqual(calls.map((call) => call.op), [
      'im_bind_chat',
      'im_list_authorized',
      'im_list_pending',
      'im_reject_pending',
      'im_revoke_chat',
      'assistant_voice_model_install',
    ]);
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1', key: 'bind-key' });
    assert.deepEqual(calls[1]?.args, { group_id: 'g_1' });
    assert.deepEqual(calls[2]?.args, { group_id: 'g_1' });
    assert.deepEqual(calls[3]?.args, { group_id: 'g_1', key: 'bind-key' });
    assert.deepEqual(calls[4]?.args, {
      group_id: 'g_1',
      chat_id: 'chat-1',
      thread_id: '1710000000.100',
    });
    assert.deepEqual(calls[5]?.args, {
      group_id: 'g_1',
      model_id: 'sensevoice-small',
      by: 'user',
    });
  });

  it('maps current Voice Secretary request/response operations', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.assistantVoiceTranscriptAppend({
      groupId: 'g_1',
      sessionId: 's_1',
      segmentId: 'seg_1',
      text: 'hello',
      documentPath: 'notes/meeting.md',
      isFinal: true,
    });
    await client.assistantVoiceDocumentList({ groupId: 'g_1', includeArchived: true });
    await client.assistantVoiceDocumentSave({
      groupId: 'g_1',
      documentPath: 'notes/meeting.md',
      content: '# Summary',
      createNew: true,
    });
    await client.assistantVoiceDocumentInstruction({
      groupId: 'g_1',
      documentPath: 'notes/meeting.md',
      instruction: 'Tighten the summary',
    });
    await client.assistantVoiceInputAppend({
      groupId: 'g_1',
      requestId: 'r_1',
      composerText: 'draft',
      operation: 'replace_with_refined_prompt',
    });
    await client.assistantVoicePromptDraftSubmit({ groupId: 'g_1', requestId: 'r_1', draftText: 'refined' });
    await client.assistantVoicePromptDraftAck({ groupId: 'g_1', requestId: 'r_1', status: 'applied' });
    await client.assistantVoiceRequest({
      groupId: 'g_1',
      requestText: 'Review the release',
      target: '@foreman',
      artifactPaths: ['notes/meeting.md'],
      requiresAck: true,
    });
    await client.assistantVoiceDocumentArchive({ groupId: 'g_1', documentPath: 'notes/meeting.md' });

    assert.deepEqual(calls.map((call) => call.op), [
      'assistant_voice_transcript_append',
      'assistant_voice_document_list',
      'assistant_voice_document_save',
      'assistant_voice_document_instruction',
      'assistant_voice_input_append',
      'assistant_voice_prompt_draft_submit',
      'assistant_voice_prompt_draft_ack',
      'assistant_voice_request',
      'assistant_voice_document_archive',
    ]);
    assert.equal(calls[0]?.args?.['session_id'], 's_1');
    assert.equal(calls[2]?.args?.['document_path'], 'notes/meeting.md');
    assert.equal(calls[4]?.args?.['kind'], 'prompt_refine');
    assert.equal(calls[7]?.args?.['request_text'], 'Review the release');
  });

  it('fails clearly for the removed daemon IPC transcription operation', async () => {
    const client = await makeClient([]);
    await assert.rejects(
      client.assistantVoiceTranscribe({ groupId: 'g_1', audioBase64: 'abc' }),
      IncompatibleDaemonError
    );
  });

  it('maps current Voice Secretary idempotency and general-instruction fields', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.assistantVoiceDocumentInstruction({
      groupId: 'g_1',
      documentPath: 'notes/meeting.md',
      requestId: 'voice-ask-1',
      inputAppendId: 'voice-input-1',
      instruction: 'Tighten the summary',
    });
    await client.assistantVoiceInputAppend({
      groupId: 'g_1',
      kind: 'voice_instruction',
      requestId: 'voice-ask-2',
      inputAppendId: 'voice-input-2',
      instruction: 'Check the latest summary',
      text: 'Include omissions',
      sourceText: 'Current meeting notes',
    });

    assert.equal(calls[0]?.args?.['request_id'], 'voice-ask-1');
    assert.equal(calls[0]?.args?.['input_append_id'], 'voice-input-1');
    assert.equal(calls[1]?.args?.['kind'], 'voice_instruction');
    assert.equal(calls[1]?.args?.['request_id'], 'voice-ask-2');
    assert.equal(calls[1]?.args?.['input_append_id'], 'voice-input-2');
    assert.equal(calls[1]?.args?.['instruction'], 'Check the latest summary');
    assert.equal(calls[1]?.args?.['text'], 'Include omissions');
    assert.equal(calls[1]?.args?.['source_text'], 'Current meeting notes');
  });
});
