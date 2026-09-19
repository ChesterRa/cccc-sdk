import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient, OutcomeUnknownError, type ConnectSendOptions } from '../src/index.js';

const endpoint = { transport: 'tcp' as const, host: '127.0.0.1', port: 1, path: '' };
const options: ConnectSendOptions = { groupId: 'local', instanceId: 'peer', targetGroupId: 'remote', clientId: 'key', text: 'hello', mode: 'mail' };

test('Connect preserves target and caller key after an uncertain result; never replays itself', async () => {
  const client = await CCCCClient.create({ endpoint });
  const calls: unknown[] = [];
  client.call = async (op, args) => { calls.push({ op, args }); if (calls.length === 1) throw new OutcomeUnknownError(op, 'closed'); return { accepted: true }; };
  await assert.rejects(client.connectSend(options), OutcomeUnknownError);
  assert.equal(calls.length, 1);
  await client.connectSend(options);
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(calls[0], { op: 'connect_send', args: { group_id: 'local', instance_id: 'peer', target_group_id: 'remote', client_id: 'key', text: 'hello', message_mode: 'mail', by: 'user' } });
});

test('Connect keys are byte bounded, files are daemon paths, and context versions and render cursors survive', async () => {
  const client = await CCCCClient.create({ endpoint });
  const calls: { op: string; args: unknown }[] = [];
  client.call = async (op, args) => { calls.push({ op, args }); return {}; };
  for (const clientId of ['', ' ', '界'.repeat(43)]) await assert.rejects(client.connectSend({ ...options, clientId }), /clientId/);
  await assert.rejects(client.connectSendFiles({ ...options, paths: [] }), /paths/);
  assert.equal(calls.length, 0);
  await client.connectSendFiles({ ...options, paths: ['not-on-sdk-machine.txt'] });
  assert.deepEqual((calls.at(-1)?.args as Record<string, unknown>)['paths'], ['not-on-sdk-machine.txt']);
  await client.connectCatalog({ groupId: 'local', instanceId: 'peer', targetGroupId: 'remote' });
  assert.equal((calls.at(-1)?.args as Record<string, unknown>)['target_group_id'], 'remote');
  await client.contextSync({ groupId: 'local', ops: [], ifVersion: 'version' });
  assert.equal((calls.at(-1)?.args as Record<string, unknown>)['if_version'], 'version');
  await client.terminalHistory({ groupId: 'local', actorId: 'agent', before: 40, renderBefore: 100 });
  assert.equal((calls.at(-1)?.args as Record<string, unknown>)['render_before'], 100);
});

test('compatibility propagates transport failures instead of claiming support', async () => {
  const client = await CCCCClient.create({ endpoint });
  client.callRaw = async op => { if (op === 'ping') return { v: 1, ok: true, result: { ipc_v: 1, capabilities: {} } }; throw new OutcomeUnknownError(op, 'closed'); };
  await assert.rejects(client.assertCompatible({ requireOps: ['groups'] }), OutcomeUnknownError);
});
