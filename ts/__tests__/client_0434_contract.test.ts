import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/client.js';
import { DaemonAPIError } from '../src/errors.js';

type CallCapture = { op: string; args?: Record<string, unknown> };

async function makeClient(calls: CallCapture[]): Promise<CCCCClient> {
  const client = await CCCCClient.create({
    endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
  });
  client.call = async (op: string, args?: Record<string, unknown>) => {
    calls.push({ op, args });
    return {};
  };
  return client;
}

describe('cccc 0.4.34 JSON op alignment', () => {
  it('maps terminal snapshot and Web Model delivery operations', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.terminalSnapshot({
      groupId: 'g_1',
      actorId: 'web-1',
      limitBytes: 4096,
    });
    await client.webModelDeliveryPreferencesGet({ groupId: 'g_1', actorId: 'web-1' });
    await client.webModelDeliveryPreferencesUpdate({
      groupId: 'g_1',
      actorId: 'web-1',
      mode: 'image_compat',
    });
    await client.webModelRuntimeRecoverTurn({
      groupId: 'g_1',
      actorId: 'web-1',
      eventIds: ['e_1', 'e_2'],
    });
    await client.blueprintGenerate({
      taskId: 't_1',
      taskName: 'Release',
      taskGoal: 'Ship safely',
      themeHint: 'shield',
    });

    assert.deepEqual(calls.map(({ op }) => op), [
      'terminal_snapshot',
      'web_model_delivery_preferences_get',
      'web_model_delivery_preferences_update',
      'web_model_runtime_recover_turn',
      'blueprint_generate',
    ]);
    assert.equal(calls[0]?.args?.['limit_bytes'], 4096);
    assert.equal(calls[2]?.args?.['mode'], 'image_compat');
    assert.deepEqual(calls[3]?.args?.['event_ids'], ['e_1', 'e_2']);
    assert.deepEqual(calls[4]?.args, {
      task_id: 't_1',
      task_name: 'Release',
      task_goal: 'Ship safely',
      theme_hint: 'shield',
    });
  });

  it('rejects an empty Web Model recovery set before transport', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await assert.rejects(
      client.webModelRuntimeRecoverTurn({ groupId: 'g_1', actorId: 'web-1', eventIds: [] }),
      /eventIds/,
    );
    assert.equal(calls.length, 0);
  });

  it('prefers term_resize and falls back only for unknown_op', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.termResize({ groupId: 'g_1', actorId: 'a_1', cols: 120, rows: 40 });
    assert.deepEqual(calls.map(({ op }) => op), ['term_resize']);

    calls.length = 0;
    client.call = async (op: string, args?: Record<string, unknown>) => {
      calls.push({ op, args });
      if (op === 'term_resize') {
        throw new DaemonAPIError('unknown_op', 'unknown');
      }
      return { resized: true, cols: 120, rows: 40 };
    };
    const resized = await client.termResize({
      groupId: 'g_1', actorId: 'a_1', cols: 120, rows: 40,
    });
    assert.deepEqual(calls.map(({ op }) => op), ['term_resize', 'terminal_resize']);
    assert.deepEqual(resized, {
      group_id: 'g_1', actor_id: 'a_1', cols: 120, rows: 40,
    });

    calls.length = 0;
    client.call = async (op: string, args?: Record<string, unknown>) => {
      calls.push({ op, args });
      throw new DaemonAPIError('permission_denied', 'denied');
    };
    await assert.rejects(
      client.termResize({ groupId: 'g_1', actorId: 'a_1', cols: 120, rows: 40 }),
      (error: unknown) => error instanceof DaemonAPIError && error.code === 'permission_denied',
    );
    assert.deepEqual(calls.map(({ op }) => op), ['term_resize']);
  });

  it('does not emit parameters removed from the current contract', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.actorNewSession({ groupId: 'g_1', actorId: 'a_1' });
    await client.groupCopyExportFile({ groupId: 'g_1' });
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1', actor_id: 'a_1', by: 'user' });
    assert.deepEqual(calls[1]?.args, { group_id: 'g_1', by: 'user' });
  });

  it('accepts the bounded resize alias during compatibility probing', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
    });
    const operations: string[] = [];
    client.callRaw = async (op: string) => {
      operations.push(op);
      if (op === 'ping') {
        return { v: 1, ok: true, result: { ipc_v: 1, capabilities: {} } };
      }
      if (op === 'term_resize') {
        throw new DaemonAPIError('unknown_op', 'unknown');
      }
      if (op === 'terminal_resize') {
        throw new DaemonAPIError('invalid_request', 'missing args');
      }
      throw new Error(`unexpected op: ${op}`);
    };
    await client.assertCompatible({ requireOps: ['term_resize'] });
    assert.deepEqual(operations, ['ping', 'term_resize', 'terminal_resize']);
  });

  it('does not probe side-effectful operations whose arguments are all optional', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
    });
    const operations: string[] = [];
    client.callRaw = async (op: string) => {
      operations.push(op);
      if (op === 'ping') {
        return { v: 1, ok: true, result: { ipc_v: 1, capabilities: {} } };
      }
      throw new Error(`unsafe compatibility probe: ${op}`);
    };
    await client.assertCompatible({
      requireOps: [
        'group_create',
        'registry_reconcile',
        'capability_allowlist_reset',
        'remote_access_start',
        'group_space_provider_auth',
      ],
    });
    assert.deepEqual(operations, ['ping']);
  });
});
