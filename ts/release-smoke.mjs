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
      'connect_send', 'connect_send_files', 'context_sync', 'term_resize'],
  });
  const groupId = (await client.groupCreate({ title: 'SDK release fixture' })).group.group_id;
  await client.groupSetState(groupId, 'paused');
  await client.attach(project, groupId);
  await client.actorAdd({
    groupId, actorId: 'fixture', runtime: 'custom', command: [process.execPath, '-e', ''],
  });
  const { event } = await client.send({ groupId, text: 'release mail', mode: 'mail', to: ['fixture'] });
  await client.inboxRead({ groupId, actorId: 'fixture' });
  await client.reply({ groupId, replyTo: event.id, text: 'reply', by: 'fixture' });
  await client.connectCatalog({ groupId });
  await assert.rejects(client.contextSync({
    groupId, by: 'user', ifVersion: 'stale',
    ops: [{ op: 'coordination.brief.update', objective: 'must not persist' }],
  }), error => error.code === 'version_conflict');
  await assert.rejects(client.assertCompatible({ requireOps: ['connect_direct_configure'] }),
    IncompatibleDaemonError);

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
  console.log('Installed npm artifact: Actor, Mail, reply, catalog, conflict, safe probes and stream passed');
} finally {
  await fs.rm(project, { recursive: true, force: true });
}
