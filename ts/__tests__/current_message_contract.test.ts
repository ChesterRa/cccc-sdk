import { it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient, IncompatibleDaemonError } from '../src/index.js';

async function client() {
  return CCCCClient.create({ endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' } });
}

it('rejects ordinary history returned by a daemon that ignores exact event IDs', async () => {
  const c = await client();
  let result: Record<string, unknown> = { messages: [{ id: 'e_1' }], has_more: false, delivery_text: null };
  const calls: unknown[] = [];
  c.call = async (op, args) => { calls.push({ op, args }); return result; };
  assert.equal(await c.messageHistoryExact({ groupId: 'g_1', actorId: 'peer', eventId: 'e_1', by: 'peer' }), result);
  assert.deepEqual(calls[0], { op: 'message_history', args: {
    group_id: 'g_1', actor_id: 'peer', event_id: 'e_1', by: 'peer',
  } });
  for (result of [
    { messages: [{ id: 'e_1' }], has_more: false },
    { messages: [{ id: 'other' }], has_more: false, delivery_text: 'text' },
    { messages: [], has_more: false, delivery_text: null },
    { messages: [{ id: 'e_1' }], has_more: true, delivery_text: 'text' },
  ]) {
    await assert.rejects(c.messageHistoryExact({ groupId: 'g_1', actorId: 'peer', eventId: 'e_1' }), IncompatibleDaemonError);
  }
  const before = calls.length;
  await assert.rejects(c.messageHistoryExact({ groupId: 'g_1', actorId: 'peer', eventId: ' ' }), /must not be empty/);
  assert.equal(calls.length, before);
});

it('maps summary and model labels', async () => {
  const c = await client();
  const calls: Array<{ op: string; args?: Record<string, unknown> }> = [];
  const summary = { group_id: 'g_1', observed_at: '2026-11-03T00:00:00Z', cutoff: '2026-11-02T00:00:00Z', actors: [] };
  c.call = async (op, args) => { calls.push({ op, args }); return summary; };
  assert.equal(await c.inboxSummary({ groupId: 'g_1', cutoff: summary.cutoff }), summary);
  assert.deepEqual(calls.pop(), { op: 'inbox_summary', args: { group_id: 'g_1', cutoff: summary.cutoff, by: 'user' } });
  await c.actorAdd({ groupId: 'g_1', actorId: 'peer', modelLabel: 'Model A' });
  assert.equal(calls.pop()?.args?.['model_label'], 'Model A');
});

it('passes sender and group activity and preserves review reminders', async () => {
  const c = await client();
  const calls: Array<{ op: string; args?: Record<string, unknown> }> = [];
  const activity = { days: 14, since: '2026-11-01T00:00:00Z', user: {}, members: [] };
  c.call = async (op, args) => { calls.push({ op, args }); return op === 'group_activity' ? activity : {}; };
  await c.messageHistory({ groupId: 'g_1', actorId: 'foreman', sender: 'user' });
  assert.equal(calls.at(-1)?.args?.['sender'], 'user');
  await c.messageHistory({ groupId: 'g_1', actorId: 'foreman' });
  assert.ok(!('sender' in (calls.at(-1)?.args ?? {})));
  assert.equal(await c.groupActivity({ groupId: 'g_1', by: 'foreman' }), activity);
  assert.deepEqual(calls.at(-1), { op: 'group_activity', args: { group_id: 'g_1', by: 'foreman' } });
  const reminder = { changes: [], review_reminder: 'Review the team' };
  c.call = async () => reminder;
  assert.equal(await c.contextSync({ groupId: 'g_1', ops: [], by: 'foreman' }), reminder);
});

it('fails the removed Voice operations without dispatching', async () => {
  const c = await client();
  let calls = 0;
  c.call = async () => { calls++; return {}; };
  const invocations = [
    () => c.assistantSettingsUpdate({ groupId: 'g', assistantId: 'voice_secretary', patch: {} }),
    () => c.assistantStatusUpdate({ groupId: 'g', assistantId: 'voice_secretary', lifecycle: 'working' }),
    () => c.assistantVoiceDocumentInputRead({ groupId: 'g' }),
    () => c.assistantVoicePromptDraftSubmit({ groupId: 'g', requestId: 'r' }),
    () => c.assistantVoiceRequest({ groupId: 'g', requestText: 'hello' }),
  ];
  for (const invoke of invocations) await assert.rejects(invoke(), IncompatibleDaemonError);
  assert.equal(calls, 0);
});
