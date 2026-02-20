import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CCCCClient } from '../src/client.js';

type CallCapture = { op: string; args?: Record<string, unknown> };

async function makeClient(calls: CallCapture[]): Promise<CCCCClient> {
  const client = await CCCCClient.create({
    endpoint: {
      transport: 'tcp',
      host: '127.0.0.1',
      port: 9000,
      path: '',
    },
  });

  const callFn = async (op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> => {
    calls.push({ op, args });
    return {};
  };

  (client as unknown as { call: typeof callFn }).call = callFn;
  return client;
}

describe('client contract parity', () => {
  it('actorAdd maps profileId to profile_id', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorAdd({
      groupId: 'g_1',
      actorId: 'a_1',
      profileId: 'ap_123',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_add');
    assert.equal(calls[0]?.args?.['profile_id'], 'ap_123');
  });

  it('actorUpdate supports profileAction with empty patch', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorUpdate({
      groupId: 'g_1',
      actorId: 'a_1',
      profileAction: 'convert_to_custom',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_update');
    assert.equal(calls[0]?.args?.['profile_action'], 'convert_to_custom');
    assert.deepEqual(calls[0]?.args?.['patch'], {});
  });

  it('actorProfileUpsert maps expectedRevision to expected_revision', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorProfileUpsert({
      profile: {
        name: 'Codex',
        runtime: 'codex',
        runner: 'pty',
      },
      expectedRevision: 4,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_profile_upsert');
    assert.equal(calls[0]?.args?.['expected_revision'], 4);
  });

  it('actorProfileSecretUpdate maps set/unset payload', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorProfileSecretUpdate({
      profileId: 'ap_123',
      set: { OPENAI_API_KEY: 'x' },
      unset: ['OLD_KEY'],
      clear: false,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_profile_secret_update');
    assert.equal(calls[0]?.args?.['profile_id'], 'ap_123');
    assert.deepEqual(calls[0]?.args?.['set'], { OPENAI_API_KEY: 'x' });
    assert.deepEqual(calls[0]?.args?.['unset'], ['OLD_KEY']);
  });

  it('actorProfileSecretCopyFromActor maps args', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorProfileSecretCopyFromActor({
      profileId: 'ap_123',
      groupId: 'g_1',
      actorId: 'a1',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_profile_secret_copy_from_actor');
    assert.equal(calls[0]?.args?.['profile_id'], 'ap_123');
    assert.equal(calls[0]?.args?.['group_id'], 'g_1');
    assert.equal(calls[0]?.args?.['actor_id'], 'a1');
  });
});
