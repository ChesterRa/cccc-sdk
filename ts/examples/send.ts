/**
 * Create a temporary paused Group, deliver Mail and reply without starting AI.
 * Run from ts/: npx tsx examples/send.ts
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CCCCClient } from '../src/index.js';

async function main() {
  const client = await CCCCClient.create();
  const project = await mkdtemp(join(tmpdir(), 'cccc-sdk-example-'));
  let groupId: string | undefined;
  try {
    const group = await client.groupCreate({ title: 'TS SDK example' });
    assert.equal(typeof group['group_id'], 'string');
    groupId = group['group_id'] as string;
    await client.groupSetState(groupId, 'paused');
    await client.attach(project, groupId);
    await client.actorAdd({
      groupId,
      actorId: 'bot-1',
      runtime: 'custom',
      command: [process.execPath, '-e', ''],
    });
    const sent = await client.send({
      groupId, text: 'Hello from TypeScript SDK!', mode: 'mail', to: ['bot-1'],
    });
    console.log('Message sent:', sent);
    await client.inboxRead({ groupId, actorId: 'bot-1', by: 'bot-1' });
    const event = sent['event'] as { id: string };
    const reply = await client.reply({
      groupId, replyTo: event.id, text: 'Mail received.', by: 'bot-1',
    });
    console.log('Reply sent:', reply);
  } finally {
    try {
      if (groupId) await client.groupDelete(groupId);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
