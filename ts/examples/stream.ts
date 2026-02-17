/**
 * Example: subscribe to event stream
 *
 * Run: npx tsx examples/stream.ts [group-id]
 */

import { CCCCClient, DaemonUnavailableError, DaemonAPIError } from '../src/index.js';
import type { CCCSEvent } from '../src/index.js';

async function main() {
  const groupId = process.argv[2];

  if (!groupId) {
    console.log('Usage: npx tsx examples/stream.ts <group-id>');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx examples/stream.ts my-group');
    process.exit(1);
  }

  try {
    console.log('Connecting to daemon...');
    const client = await CCCCClient.create();

    console.log(`\nSubscribing to event stream for group "${groupId}"...`);
    console.log('Press Ctrl+C to exit.\n');

    for await (const item of client.eventsStream({ groupId })) {
      if (item.t === 'heartbeat') {
        console.log(`[heartbeat] ts=${item.ts}`);
      } else if (item.t === 'event') {
        const event = item.event as CCCSEvent;
        console.log(`[event] ${event.kind} | id=${event.id}`);
        console.log(`  Group: ${event.group_id}`);
        console.log(`  Time: ${event.ts}`);
        if (event.data) {
          console.log(`  Data: ${JSON.stringify(event.data)}`);
        }
        console.log('');
      }
    }

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('Daemon unavailable:', error.message);
      console.error('Please make sure ccccd is running.');
    } else if (error instanceof DaemonAPIError) {
      console.error('API error:', error.code, error.message);
      if (error.code === 'group_not_found') {
        console.error(`Group "${groupId}" not found.`);
      }
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
