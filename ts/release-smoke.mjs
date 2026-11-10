// Run only with a disposable daemon; imports resolve the installed package.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CCCCClient, discoverEndpoint, IncompatibleDaemonError } from 'cccc-sdk';

assert.ok(process.env.CCCC_HOME, 'An isolated CCCC_HOME is required');
const client = await CCCCClient.create();
const project = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-sdk-release-'));
try {
  // Preserve wildcard TCP descriptor coverage without touching the real home.
  const fakeHome = path.join(project, 'fake-home');
  await fs.mkdir(path.join(fakeHome, 'daemon'), { recursive: true });
  await fs.writeFile(path.join(fakeHome, 'daemon', 'ccccd.addr.json'),
    JSON.stringify({ v: 1, transport: 'tcp', host: '0.0.0.0', port: 12345 }));
  assert.equal((await discoverEndpoint(fakeHome)).host, '127.0.0.1');

  await client.assertCompatible({
    requireIpcV: 1,
    requireCapabilities: { events_stream: true },
    requireOps: ['groups', 'send', 'tracked_send', 'send_files', 'events_stream', 'connect_catalog',
      'connect_send', 'connect_send_files', 'context_sync', 'term_resize',
      'assistant_voice_document_library', 'assistant_voice_document_library_update', 'assistant_voice_document_delete', 'inbox_summary'],
  });
  const groupId = (await client.groupCreate({ title: 'SDK release fixture' })).group.group_id;
  await client.groupSetState(groupId, 'paused');
  await client.attach(project, groupId);
  const { actor: fixture } = await client.actorAdd({
    groupId, actorId: 'fixture', runtime: 'custom', command: [process.execPath, '-e', ''],
    modelLabel: 'SDK fixture model',
  });
  assert.equal(fixture.model_label, 'SDK fixture model');
  const listed = (await client.actorList(groupId)).actors.find(row => row.id === 'fixture');
  assert.equal(listed.runtime_session_replaced_at, null);
  assert.equal(listed.runtime_session_replaced_reasons, null);
  await assert.rejects(client.call('send', {
    group_id: groupId, by: 'user', to: ['fixture'], message_mode: 'mail',
    text: 'must not be sent', scope_key: 'unsupported-sdk-argument',
  }), error => {
    assert.equal(error.code, 'unknown_arguments');
    assert.deepEqual(error.details, { unknown: ['scope_key'], new_side_effects: false });
    return true;
  });
  const { event } = await client.send({ groupId, text: 'release mail', mode: 'mail', to: ['fixture'] });
  const summary = await client.inboxSummary({ groupId, cutoff: '2020-01-01T00:00:00Z' });
  assert.equal(summary.actors.find(row => row.actor_id === 'fixture').awaiting_count, 1);
  const exact = await client.messageHistoryExact({ groupId, actorId: 'fixture', eventId: event.id });
  assert.equal(exact.messages[0].id, event.id);
  assert.match(exact.delivery_text, /release mail/);
  await client.inboxRead({ groupId, actorId: 'fixture' });
  await client.reply({ groupId, replyTo: event.id, text: 'reply', by: 'fixture' });
  await client.connectCatalog({ groupId });
  await assert.rejects(client.contextSync({
    groupId, by: 'user', ifVersion: 'stale',
    ops: [{ op: 'coordination.brief.update', objective: 'must not persist' }],
  }), error => error.code === 'version_conflict');
  await assert.rejects(client.assertCompatible({ requireOps: ['connect_direct_configure'] }),
    IncompatibleDaemonError);

  const ask = async () => (await client.call('send', {
    group_id: groupId, by: 'fixture', to: ['user'], message_mode: 'request_reply', text: '',
    question: { v: 1, prompt: 'Which route?', options: [{ label: 'First' }, { label: 'Second' }] },
  })).event.id;
  const note = '  中文 and a condition\n';
  const args = {
    group_id: groupId, source_event_id: await ask(), by: 'user', client_id: 'npm-answer-note',
    answer: { v: 2, option_id: 'B', note },
  };
  const answer = await client.call('reply_request_answer', args);
  assert.deepEqual(answer.event.data.answer, args.answer);
  assert.equal(answer.event.data.text, `Selected B: Second\n\nNote: ${note}`);
  assert.equal((await client.call('reply_request_answer', args)).event.id, answer.event.id);
  await assert.rejects(client.call('reply_request_answer', {
    ...args, answer: { ...args.answer, note: 'different' },
  }), error => error.code === 'idempotency_conflict');
  await assert.rejects(client.call('reply_request_answer', {
    ...args, client_id: 'npm-closed',
  }), error => error.code === 'reply_request_closed');
  for (const [index, value] of [{ v: 1, option_id: 'A' }, { v: 1, text: '  Other\n' }].entries()) {
    const result = await client.call('reply_request_answer', {
      group_id: groupId, source_event_id: await ask(), by: 'user',
      client_id: `npm-v1-${index}`, answer: value,
    });
    assert.deepEqual(result.event.data.answer, value);
  }

  // Reading an existing event proves the real NDJSON stream without a send race.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    let found = false;
    for await (const item of client.eventsStream({
      groupId, by: 'user', sinceEventId: event.id, signal: controller.signal,
    })) {
      if (item.t === 'event') {
        assert.ok(item.event.id);
        found = true;
        break;
      }
    }
    assert.ok(found, 'Expected a canonical stream event');
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const documentPath = 'notes/sdk.md';
  await client.assistantVoiceDocumentSave({ groupId, documentPath, content: '# SDK fixture' });
  let library = await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'create_folder', name: 'Meetings' });
  const folderId = library.folders[0].folder_id;
  await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'rename_folder', folderId, name: 'Notes' });
  await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'rename', documentPath, name: 'Summary' });
  await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'move', documentPath, folderId });
  await client.assistantVoiceDocumentArchive({ groupId, documentPath });
  library = await client.assistantVoiceDocumentLibrary({ groupId });
  assert.equal(library.documents[0].status, 'archived');
  assert.equal(await fs.readFile(path.join(project, documentPath), 'utf8'), '# SDK fixture');
  library = await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'restore', documentPath });
  assert.equal(library.documents[0].status, 'active');
  assert.equal(library.documents[0].folder_id, folderId);
  await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'move', documentPath, folderId: '' });
  const rootOrder = [`folder:${folderId}`, `document:${documentPath}`];
  library = await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'reorder_root', rootOrder });
  assert.deepEqual(library.root_order, rootOrder);
  library = await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'reorder_root', rootOrder: [] });
  assert.deepEqual(library.root_order, []);
  await client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'remove_folder', folderId });
  const deleted = await client.assistantVoiceDocumentDelete({ groupId, documentPath });
  assert.equal(deleted.event.data.action, 'deleted');
  await assert.rejects(fs.access(path.join(project, documentPath)), { code: 'ENOENT' });
  assert.deepEqual((await client.assistantVoiceDocumentLibrary({ groupId })).documents, []);
  await assert.rejects(client.assistantVoiceDocumentLibraryUpdate({ groupId, action: 'restore', documentPath }));
  for (const [actorId, runtime] of [['chat1', 'web_model'], ['chat2', 'web_model'], ['bot', 'grok_web_model']]) {
    const { actor } = await client.actorAdd({ groupId, actorId, runtime });
    assert.equal(actor.runtime, runtime);
    assert.equal(actor.runner, 'headless');
  }
  assert.equal((await client.groupShow(groupId)).group.state, 'paused');
  console.log('Installed npm artifact: messaging, V1/V2 answers, conflicts, safe probes, stream, Voice library lifecycle and Web Model configuration passed');
} finally {
  await fs.rm(project, { recursive: true, force: true });
}
