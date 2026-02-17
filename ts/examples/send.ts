/**
 * Example: create group and send messages
 *
 * Run: npx tsx examples/send.ts
 */

import { CCCCClient, DaemonUnavailableError, DaemonAPIError } from '../src/index.js';

async function main() {
  try {
    console.log('Connecting to daemon...');
    const client = await CCCCClient.create();

    // Create group.
    console.log('\nCreating group...');
    const group = await client.groupCreate({ title: 'TS SDK Test Group' });
    const groupId = group['group_id'] as string;
    console.log('Group created:', groupId);

    // Show group details.
    console.log('\nLoading group details...');
    const groupInfo = await client.groupShow(groupId);
    console.log('Group info:', JSON.stringify(groupInfo, null, 2));

    // Add actor.
    console.log('\nAdding actor...');
    const actor = await client.actorAdd({
      groupId,
      actorId: 'bot-1',
      title: 'Test Bot',
      runtime: 'external',
    });
    console.log('Actor added:', actor);

    // Send message.
    console.log('\nSending message...');
    const sendResult = await client.send({
      groupId,
      text: 'Hello from TypeScript SDK!',
      by: 'user',
    });
    console.log('Message sent:', sendResult);

    // Reply message.
    const eventId = ((sendResult['event'] as { id?: string } | undefined)?.id ?? '') as string;
    if (eventId) {
      console.log('\nSending reply...');
      const replyResult = await client.reply({
        groupId,
        replyTo: eventId,
        text: 'This is a reply.',
        by: 'bot-1',
      });
      console.log('Reply sent:', replyResult);
    }

    // List all groups.
    console.log('\nCurrent groups:');
    const groups = await client.groups();
    console.log(JSON.stringify(groups, null, 2));

    // Cleanup: delete test group.
    console.log('\nDeleting test group...');
    await client.groupDelete(groupId);
    console.log('Group deleted.');

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('Daemon unavailable:', error.message);
      console.error('Please make sure ccccd is running.');
    } else if (error instanceof DaemonAPIError) {
      console.error('API error:', error.code, error.message);
      console.error('Details:', error.details);
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
