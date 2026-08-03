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
    await client.groupPreambleReset({ groupId: 'g_1' });
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
      'terminal_resize',
    ]);
    assert.equal(calls[0]?.args?.['insight'], 'Compatibility is the release gate.');
    assert.equal(calls[0]?.args?.['require_peer_insight'], true);
    assert.equal(calls[4]?.args?.['confirm'], 'preamble');
    assert.equal(calls[5]?.args?.['before'], 100);
    assert.equal(calls[5]?.args?.['limit_bytes'], 2048);
    assert.equal(calls[6]?.args?.['after'], 100);
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
});
