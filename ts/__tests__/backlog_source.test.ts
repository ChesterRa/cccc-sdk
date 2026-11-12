import { it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient, DaemonAPIError, type BacklogSource } from '../src/index.js';

it('checks backlog operation support with harmless empty arguments', async () => {
  const client = await CCCCClient.create({ endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' } });
  const operations = ['get', 'use', 'create', 'exclude', 'add', 'edit', 'move', 'close', 'promote'].map(action => `backlog_${action}`);
  const calls: {op: string; args?: Record<string, unknown>}[] = [];
  client.callRaw = async (op, args) => {
    calls.push({ op, args });
    if (op === 'ping') return { v: 1, ok: true, result: { ipc_v: 1, capabilities: {} } };
    throw new DaemonAPIError('invalid_args', 'group_id required', {});
  };
  await client.assertCompatible({ requireOps: operations });
  assert.deepEqual(calls.slice(1).map(call => call.op), operations);
  assert.ok(calls.slice(1).every(call => !call.args || Object.keys(call.args).length === 0));
});

it('keeps omitted source distinct from clearing a source', async () => {
  const client = await CCCCClient.create({ endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' } });
  const calls: Record<string, unknown>[] = [];
  client.call = async (_op, args) => { calls.push(args ?? {}); return {}; };
  const source: BacklogSource = { scope_key: 's_project', path: 'BACKLOG.md', entry_id: 'abcdef123456' };
  await client.taskCreate({ groupId: 'g', title: 'iteration', source });
  await client.taskUpdate({ groupId: 'g', taskId: 'T001', title: 'rename' });
  await client.taskUpdate({ groupId: 'g', taskId: 'T001', source: null });
  const operations = calls.map(call => (call['ops'] as Record<string, unknown>[])[0]);
  assert.deepEqual(operations[0]?.['source'], source);
  assert.ok(!('source' in operations[1]!));
  assert.equal(operations[2]?.['source'], null);
});
