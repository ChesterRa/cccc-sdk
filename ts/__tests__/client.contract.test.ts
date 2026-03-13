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

  it('actorAdd maps capabilityAutoload to capability_autoload', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorAdd({
      groupId: 'g_1',
      actorId: 'a_1',
      capabilityAutoload: ['pack:space'],
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_add');
    assert.deepEqual(calls[0]?.args?.['capability_autoload'], ['pack:space']);
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

  it('actorProfileUpsert maps capabilityDefaults to capability_defaults', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorProfileUpsert({
      profile: {
        name: 'Codex',
        runtime: 'codex',
        runner: 'pty',
        capabilityDefaults: {
          autoloadCapabilities: ['pack:space'],
          defaultScope: 'actor',
          sessionTtlSeconds: 600,
        },
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_profile_upsert');
    assert.deepEqual(calls[0]?.args?.['profile'], {
      name: 'Codex',
      runtime: 'codex',
      runner: 'pty',
      capability_defaults: {
        autoload_capabilities: ['pack:space'],
        default_scope: 'actor',
        session_ttl_seconds: 600,
      },
    });
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

  it('actorProfileSecretCopyFromProfile maps args', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorProfileSecretCopyFromProfile({
      profileId: 'ap_dst',
      sourceProfileId: 'ap_src',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'actor_profile_secret_copy_from_profile');
    assert.equal(calls[0]?.args?.['profile_id'], 'ap_dst');
    assert.equal(calls[0]?.args?.['source_profile_id'], 'ap_src');
  });

  it('capabilityEnable maps ttl and actor scope args', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.capabilityEnable({
      groupId: 'g_1',
      capabilityId: 'pack:space',
      scope: 'session',
      ttlSeconds: 600,
      actorId: 'foreman',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'capability_enable');
    assert.equal(calls[0]?.args?.['capability_id'], 'pack:space');
    assert.equal(calls[0]?.args?.['scope'], 'session');
    assert.equal(calls[0]?.args?.['ttl_seconds'], 600);
    assert.equal(calls[0]?.args?.['actor_id'], 'foreman');
  });

  it('capabilityAllowlistGet maps by', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.capabilityAllowlistGet({ by: 'user' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'capability_allowlist_get');
    assert.equal(calls[0]?.args?.['by'], 'user');
  });

  it('capabilityAllowlistValidate maps patch mode payload', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.capabilityAllowlistValidate({
      mode: 'patch',
      patch: { defaults: { source_level: { skillsmp_remote: 'indexed' } } },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'capability_allowlist_validate');
    assert.equal(calls[0]?.args?.['mode'], 'patch');
    assert.deepEqual(calls[0]?.args?.['patch'], {
      defaults: { source_level: { skillsmp_remote: 'indexed' } },
    });
  });

  it('capabilityAllowlistUpdate maps revision and overlay', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.capabilityAllowlistUpdate({
      by: 'user',
      mode: 'replace',
      expectedRevision: 'r1',
      overlay: { allow: { packs: ['pack:space'] } },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'capability_allowlist_update');
    assert.equal(calls[0]?.args?.['by'], 'user');
    assert.equal(calls[0]?.args?.['mode'], 'replace');
    assert.equal(calls[0]?.args?.['expected_revision'], 'r1');
    assert.deepEqual(calls[0]?.args?.['overlay'], {
      allow: { packs: ['pack:space'] },
    });
  });

  it('capabilityAllowlistReset maps by', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.capabilityAllowlistReset({ by: 'user' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'capability_allowlist_reset');
    assert.equal(calls[0]?.args?.['by'], 'user');
  });

  it('groupSpaceBind maps lane and remote space id', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.groupSpaceBind({
      groupId: 'g_1',
      lane: 'work',
      action: 'bind',
      remoteSpaceId: 'nb_123',
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'group_space_bind');
    assert.equal(calls[0]?.args?.['lane'], 'work');
    assert.equal(calls[0]?.args?.['action'], 'bind');
    assert.equal(calls[0]?.args?.['remote_space_id'], 'nb_123');
  });

  it('groupSpaceProviderAuth maps timeout', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.groupSpaceProviderAuth({
      provider: 'notebooklm',
      action: 'start',
      timeoutSeconds: 120,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.op, 'group_space_provider_auth');
    assert.equal(calls[0]?.args?.['provider'], 'notebooklm');
    assert.equal(calls[0]?.args?.['action'], 'start');
    assert.equal(calls[0]?.args?.['timeout_seconds'], 120);
  });
});
