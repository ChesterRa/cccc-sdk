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
  it('sendFiles maps paths into one daemon operation', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.sendFiles({
      groupId: 'g_1',
      paths: ['reference.png', 'candidate.png'],
      text: 'inspect',
      to: ['seat-design'],
      priority: 'attention',
    });

    assert.equal(calls[0]?.op, 'send_files');
    assert.deepEqual(calls[0]?.args?.['paths'], ['reference.png', 'candidate.png']);
    assert.deepEqual(calls[0]?.args?.['to'], ['seat-design']);
    assert.equal(calls[0]?.args?.['priority'], 'attention');

    await assert.rejects(client.sendFiles({ groupId: 'g_1', paths: [] }), /non-empty paths/);
    await assert.rejects(
      client.sendFiles({ groupId: 'g_1', paths: ['reference.png', '  '] }),
      /non-empty paths/,
    );
  });

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

// =================================================================
// cccc 0.4.17 alignment — new ops and contract extensions
// =================================================================

describe('message ops (cccc 0.4.17)', () => {
  it('send forwards refs, attachments, clientId', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.send({
      groupId: 'g_1',
      text: 'see ref',
      refs: [{ kind: 'task_ref', task_id: 't_42' }],
      attachments: [{ kind: 'file', path: 'blobs/a.txt' }],
      clientId: 'cl_1',
      insight: 'Rollback remains unverified.',
      suggestedUserMessage: 'Please confirm the rollback evidence.',
    });
    assert.equal(calls[0]?.op, 'send');
    assert.deepEqual(calls[0]?.args?.['refs'], [{ kind: 'task_ref', task_id: 't_42' }]);
    assert.deepEqual(calls[0]?.args?.['attachments'], [{ kind: 'file', path: 'blobs/a.txt' }]);
    assert.equal(calls[0]?.args?.['client_id'], 'cl_1');
    assert.equal(calls[0]?.args?.['insight'], 'Rollback remains unverified.');
    assert.equal(calls[0]?.args?.['suggested_user_message'], 'Please confirm the rollback evidence.');
  });

  it('reply forwards refs', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.reply({
      groupId: 'g_1',
      replyTo: 'e_origin',
      text: 'roger',
      refs: [{ kind: 'presentation_ref', slot_id: 'slot-1' }],
      insight: 'The current frame may be too narrow.',
      suggestedUserMessage: 'Should we widen the frame?',
    });
    assert.equal(calls[0]?.op, 'reply');
    assert.deepEqual(calls[0]?.args?.['refs'], [{ kind: 'presentation_ref', slot_id: 'slot-1' }]);
    assert.equal(calls[0]?.args?.['insight'], 'The current frame may be too narrow.');
    assert.equal(calls[0]?.args?.['suggested_user_message'], 'Should we widen the frame?');
  });

  it('sendCrossGroup uses only cross-runtime message fields', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.sendCrossGroup({
      groupId: 'g_src',
      dstGroupId: 'g_dst',
      text: 'relay',
      insight: 'The destination should challenge this plan independently.',
    });
    assert.equal(calls[0]?.op, 'send_cross_group');
    assert.equal(calls[0]?.args?.['refs'], undefined);
    assert.equal(calls[0]?.args?.['attachments'], undefined);
    assert.equal(
      calls[0]?.args?.['insight'],
      'The destination should challenge this plan independently.',
    );
  });
});

describe('actor fields (cccc 0.4.17)', () => {
  it('actorAdd forwards capabilityHidden and profile scope/owner', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.actorAdd({
      groupId: 'g_1',
      actorId: 'a_reviewer',
      capabilityHidden: ['skill:x'],
      profileScope: 'user',
      profileOwner: 'alice',
    });
    assert.equal(calls[0]?.op, 'actor_add');
    assert.deepEqual(calls[0]?.args?.['capability_hidden'], ['skill:x']);
    assert.equal(calls[0]?.args?.['profile_scope'], 'user');
    assert.equal(calls[0]?.args?.['profile_owner'], 'alice');
  });

  it('actorUpdate can set runtime_state_source via patch', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.actorUpdate({
      groupId: 'g_1',
      actorId: 'a1',
      patch: { runtime_state_source: 'app_server' },
    });
    assert.equal(calls[0]?.op, 'actor_update');
    assert.deepEqual(calls[0]?.args?.['patch'], { runtime_state_source: 'app_server' });
  });
});

describe('cccc lifecycle safety contracts', () => {
  it('maps actorNewSession and guarded groupReset', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.actorNewSession('g_1', 'grok-1');
    assert.equal(calls[0]?.op, 'actor_new_session');
    assert.equal(calls[0]?.args?.['actor_id'], 'grok-1');

    await client.groupReset({ groupId: 'g_1', confirmGroupId: 'g_1' });
    assert.equal(calls[1]?.op, 'group_reset');
    assert.equal(calls[1]?.args?.['confirm'], 'g_1');

    await assert.rejects(
      client.groupReset({ groupId: 'g_1', confirmGroupId: 'g_wrong' }),
      /confirmGroupId/,
    );
    assert.equal(calls.length, 2);
  });

  it('maps group preamble operations and validates destructive inputs', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.groupPreambleGet({ groupId: 'g_1' });
    assert.equal(calls[0]?.op, 'group_preamble_get');
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1' });

    await client.groupPreambleSet({
      groupId: 'g_1',
      content: 'Wait for the targeted mission.\n',
    });
    assert.equal(calls[1]?.op, 'group_preamble_set');
    assert.equal(calls[1]?.args?.['content'], 'Wait for the targeted mission.\n');

    await client.groupPreambleReset({ groupId: 'g_1', confirm: 'preamble' });
    assert.equal(calls[2]?.op, 'group_preamble_reset');
    assert.equal(calls[2]?.args?.['confirm'], 'preamble');

    await assert.rejects(
      client.groupPreambleSet({ groupId: 'g_1', content: '  ' }),
      /non-empty/,
    );
    await assert.rejects(
      client.groupPreambleSet({ groupId: 'g_1', content: 'x'.repeat(512 * 1024 + 1) }),
      /512 KiB/,
    );
    await assert.rejects(
      client.groupPreambleReset({ groupId: 'g_1', confirm: 'wrong' as 'preamble' }),
      /confirm/,
    );
    assert.equal(calls.length, 3);
  });
});

describe('tracked delegation', () => {
  it('trackedSend maps all fields', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.trackedSend({
      groupId: 'g_1',
      text: 'please fix bug',
      title: 'Fix bug',
      to: ['@alice'],
      priority: 'attention',
      taskPriority: 'attention',
      idempotencyKey: 'idem-1',
      outcome: 'bug closed',
      status: 'planned',
      waitingOn: 'actor',
      taskType: 'standard',
      checklist: [{ label: 'repro' }, { label: 'patch' }],
      notes: 'see ticket',
      blockedBy: ['t_0'],
      handoffTo: 'alice',
      assignee: 'alice',
      refs: [{ kind: 'url', url: 'https://example.com/issue/1' }],
      insight: 'We may be optimizing the wrong layer.',
    });
    assert.equal(calls[0]?.op, 'tracked_send');
    const args = calls[0]?.args ?? {};
    assert.equal(args['title'], 'Fix bug');
    assert.deepEqual(args['to'], ['@alice']);
    assert.equal(args['idempotency_key'], 'idem-1');
    assert.equal(args['task_type'], 'standard');
    assert.deepEqual(args['checklist'], [{ label: 'repro' }, { label: 'patch' }]);
    assert.deepEqual(args['blocked_by'], ['t_0']);
    assert.equal(args['handoff_to'], 'alice');
    assert.equal(args['insight'], 'We may be optimizing the wrong layer.');
  });

  it('trackedSend omits unset optionals', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.trackedSend({ groupId: 'g_1', text: 'quick task' });
    const args = calls[0]?.args ?? {};
    assert.equal(args['group_id'], 'g_1');
    assert.equal(args['text'], 'quick task');
    assert.equal(args['by'], 'user');
    assert.equal(args['reply_required'], true);
    assert.equal(args['idempotency_key'], undefined);
    assert.equal(args['checklist'], undefined);
  });

  it('taskList with and without taskId', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.taskList({ groupId: 'g_1' });
    assert.equal(calls[0]?.op, 'task_list');
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1' });

    await client.taskList({ groupId: 'g_1', taskId: 't_3' });
    assert.equal(calls[1]?.args?.['task_id'], 't_3');
  });
});

describe('headless control', () => {
  it('headlessStatus / setStatus / ackMessage', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.headlessStatus({ groupId: 'g_1', actorId: 'a1' });
    assert.equal(calls[0]?.op, 'headless_status');

    await client.headlessSetStatus({ groupId: 'g_1', actorId: 'a1', status: 'working', taskId: 't_9' });
    assert.equal(calls[1]?.op, 'headless_set_status');
    assert.equal(calls[1]?.args?.['status'], 'working');
    assert.equal(calls[1]?.args?.['task_id'], 't_9');

    await client.headlessAckMessage({ groupId: 'g_1', actorId: 'a1', messageId: 'msg_42' });
    assert.equal(calls[2]?.op, 'headless_ack_message');
    assert.equal(calls[2]?.args?.['message_id'], 'msg_42');
  });
});

describe('group copy', () => {
  it('export/preview/import map fields', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.groupCopyExport({ groupId: 'g_1' });
    assert.equal(calls[0]?.op, 'group_copy_export');
    assert.deepEqual(calls[0]?.args, { group_id: 'g_1', by: 'user' });

    await client.groupCopyExportFile({ groupId: 'g_1' });
    assert.equal(calls[1]?.op, 'group_copy_export_file');

    await client.groupCopyPreviewImport({ packageB64: 'ZZZ=' });
    assert.equal(calls[2]?.op, 'group_copy_preview_import');
    assert.equal(calls[2]?.args?.['package_b64'], 'ZZZ=');

    await client.groupCopyPreviewImport({ packagePath: '/tmp/group.zip' });
    assert.equal(calls[3]?.args?.['package_path'], '/tmp/group.zip');

    await client.groupCopyImport({ packageB64: 'ZZZ=', workspaceRoot: '/tmp/x', title: 'Restored' });
    assert.equal(calls[4]?.op, 'group_copy_import');
    assert.equal(calls[4]?.args?.['workspace_root'], '/tmp/x');
    assert.equal(calls[4]?.args?.['title'], 'Restored');

    await client.groupCopyImport({ packagePath: '/tmp/group.zip', title: 'Restored from file' });
    assert.equal(calls[5]?.args?.['package_path'], '/tmp/group.zip');
    assert.equal(calls[5]?.args?.['title'], 'Restored from file');
  });
});

describe('capability extensions', () => {
  it('capabilityVisibility maps fields', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.capabilityVisibility({
      groupId: 'g_1',
      capabilityId: 'skill:x',
      hidden: true,
      actorId: 'a1',
      reason: 'dup',
      by: 'a1',
    });
    assert.equal(calls[0]?.op, 'capability_visibility');
    assert.equal(calls[0]?.args?.['capability_id'], 'skill:x');
    assert.equal(calls[0]?.args?.['hidden'], true);
  });

  it('capabilityInstallTarget maps scope and ttl', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.capabilityInstallTarget({
      groupId: 'g_1',
      target: 'github:owner/repo',
      actorId: 'a1',
      scope: 'session',
      ttlSeconds: 600,
      reason: 'trial',
    });
    assert.equal(calls[0]?.op, 'capability_install_target');
    assert.equal(calls[0]?.args?.['target'], 'github:owner/repo');
    assert.equal(calls[0]?.args?.['scope'], 'session');
    assert.equal(calls[0]?.args?.['ttl_seconds'], 600);
  });

  it('capabilitySourceDelete stays within the cross-runtime source contract', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.capabilitySourceDelete({
      groupId: 'g_1',
      sourceId: 'github_import',
      reason: 'remove stale import',
    });
    assert.equal(calls[0]?.op, 'capability_source_delete');
    assert.equal(calls[0]?.args?.['source_id'], 'github_import');
    assert.equal(calls[0]?.args?.['reason'], 'remove stale import');
    assert.equal(calls[0]?.args?.['source_instance_key'], undefined);
  });
});

describe('presentation', () => {
  it('presentation lifecycle ops', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.presentationGet({ groupId: 'g_1' });
    assert.equal(calls[0]?.op, 'presentation_get');

    await client.presentationPublish({
      groupId: 'g_1',
      slot: 'slot-1',
      title: 'Demo',
      cardType: 'markdown',
      content: '# hi',
    });
    assert.equal(calls[1]?.op, 'presentation_publish');
    assert.equal(calls[1]?.args?.['slot'], 'slot-1');
    assert.equal(calls[1]?.args?.['card_type'], 'markdown');
    assert.equal(calls[1]?.args?.['content'], '# hi');

    await client.presentationClear({ groupId: 'g_1', slot: 'slot-1' });
    assert.equal(calls[2]?.op, 'presentation_clear');

    await client.presentationBrowserOpen({
      groupId: 'g_1',
      slot: 'slot-1',
      url: 'https://example.com',
      width: 1024,
      height: 768,
    });
    assert.equal(calls[3]?.op, 'presentation_browser_open');
    assert.equal(calls[3]?.args?.['width'], 1024);

    await client.presentationBrowserInfo({ groupId: 'g_1', slot: 'slot-1' });
    assert.equal(calls[4]?.op, 'presentation_browser_info');

    await client.presentationBrowserClose({ groupId: 'g_1', slot: 'slot-1' });
    assert.equal(calls[5]?.op, 'presentation_browser_close');
  });
});

describe('assistant', () => {
  it('assistant state/settings/status ops', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.assistantState({ groupId: 'g_1', assistantId: 'voice_secretary' });
    assert.equal(calls[0]?.op, 'assistant_state');
    assert.equal(calls[0]?.args?.['assistant_id'], 'voice_secretary');

    await client.assistantSettingsUpdate({
      groupId: 'g_1',
      assistantId: 'voice_secretary',
      patch: { enabled: true },
    });
    assert.equal(calls[1]?.op, 'assistant_settings_update');
    assert.deepEqual(calls[1]?.args?.['patch'], { enabled: true });

    await client.assistantStatusUpdate({
      groupId: 'g_1',
      assistantId: 'voice_secretary',
      lifecycle: 'working',
      health: { ok: true },
    });
    assert.equal(calls[2]?.op, 'assistant_status_update');
    assert.equal(calls[2]?.args?.['lifecycle'], 'working');
  });
});

describe('daemon core', () => {
  it('shutdown / observability / branding', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.observabilityGet();
    assert.equal(calls[0]?.op, 'observability_get');

    await client.observabilityUpdate({ patch: { log_level: 'info' } });
    assert.equal(calls[1]?.op, 'observability_update');
    assert.deepEqual(calls[1]?.args?.['patch'], { log_level: 'info' });

    await client.brandingGet();
    assert.equal(calls[2]?.op, 'branding_get');

    await client.brandingUpdate({ patch: { product_name: 'Demo' } });
    assert.equal(calls[3]?.op, 'branding_update');

    await client.shutdown();
    assert.equal(calls[4]?.op, 'shutdown');
  });
});

describe('diagnostics & maintenance', () => {
  it('debug + terminal + ledger', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.debugSnapshot({ groupId: 'g_1' });
    assert.equal(calls[0]?.op, 'debug_snapshot');

    await client.debugTailLogs({ component: 'daemon', lines: 50 });
    assert.equal(calls[1]?.op, 'debug_tail_logs');
    assert.equal(calls[1]?.args?.['lines'], 50);

    await client.debugClearLogs({ component: 'web' });
    assert.equal(calls[2]?.op, 'debug_clear_logs');

    await client.terminalTail({ groupId: 'g_1', actorId: 'a1', maxChars: 4000 });
    assert.equal(calls[3]?.op, 'terminal_tail');
    assert.equal(calls[3]?.args?.['max_chars'], 4000);

    await client.terminalHistory({
      groupId: 'g_1',
      actorId: 'a1',
      before: 12_000,
      limitBytes: 32_000,
      stripAnsi: true,
      compact: true,
    });
    assert.equal(calls[4]?.op, 'terminal_history');
    assert.equal(calls[4]?.args?.['before'], 12_000);
    assert.equal(calls[4]?.args?.['limit_bytes'], 32_000);

    await client.terminalClear({ groupId: 'g_1', actorId: 'a1' });
    assert.equal(calls[5]?.op, 'terminal_clear');

    await client.ledgerSnapshot({ groupId: 'g_1', reason: 'manual' });
    assert.equal(calls[6]?.op, 'ledger_snapshot');
    assert.equal(calls[6]?.args?.['reason'], 'manual');

    await client.ledgerCompact({ groupId: 'g_1', force: true });
    assert.equal(calls[7]?.op, 'ledger_compact');
    assert.equal(calls[7]?.args?.['force'], true);
  });
});

describe('stream / notify / admin', () => {
  it('streamEmit + systemNotify + registry + detach', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);
    await client.streamEmit({ groupId: 'g_1', op: 'start', by: 'a1', text: 'hello', seq: 1 });
    assert.equal(calls[0]?.op, 'stream_emit');
    assert.equal(calls[0]?.args?.['op'], 'start');
    assert.equal(calls[0]?.args?.['format'], 'plain');

    await client.systemNotify({
      groupId: 'g_1',
      message: 'hello',
      title: 'Heads up',
      requiresAck: true,
      targetActorId: 'a1',
    });
    assert.equal(calls[1]?.op, 'system_notify');
    assert.equal(calls[1]?.args?.['requires_ack'], true);
    assert.equal(calls[1]?.args?.['target_actor_id'], 'a1');

    await client.registryReconcile({ removeMissing: true });
    assert.equal(calls[2]?.op, 'registry_reconcile');
    assert.equal(calls[2]?.args?.['remove_missing'], true);

    await client.groupDetachScope({ groupId: 'g_1', scopeKey: 'scope_a' });
    assert.equal(calls[3]?.op, 'group_detach_scope');
    assert.equal(calls[3]?.args?.['scope_key'], 'scope_a');
  });
});

describe('cccc 0.4.18 runtime and voice ops', () => {
  it('maps Hermes runtime and Voice Secretary recording lease operations', async () => {
    const calls: CallCapture[] = [];
    const client = await makeClient(calls);

    await client.runtimeHermesStatus();
    assert.equal(calls[0]?.op, 'runtime_hermes_status');
    assert.deepEqual(calls[0]?.args, {});

    await client.runtimeHermesPrepare({
      cwd: '/repo',
      autoEnableTools: true,
      forceMcp: true,
    });
    assert.equal(calls[1]?.op, 'runtime_hermes_prepare');
    assert.deepEqual(calls[1]?.args, {
      cwd: '/repo',
      auto_enable_tools: true,
      force_mcp: true,
    });

    await client.runtimeHermesMcpTest({
      cwd: '/repo',
      groupId: 'g_1',
      actorId: 'hermes-1',
    });
    assert.equal(calls[2]?.op, 'runtime_hermes_mcp_test');
    assert.deepEqual(calls[2]?.args, {
      cwd: '/repo',
      group_id: 'g_1',
      actor_id: 'hermes-1',
    });

    await client.assistantVoiceRecordingLease({
      groupId: 'g_1',
      action: 'acquire',
      ownerId: 'tab-1',
      ttlSeconds: 30,
      captureMode: 'push_to_talk',
      recognitionBackend: 'browser',
    });
    assert.equal(calls[3]?.op, 'assistant_voice_recording_lease');
    assert.deepEqual(calls[3]?.args, {
      group_id: 'g_1',
      action: 'acquire',
      by: 'user',
      owner_id: 'tab-1',
      ttl_seconds: 30,
      capture_mode: 'push_to_talk',
      recognition_backend: 'browser',
    });
  });
});
