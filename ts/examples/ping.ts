/**
 * Example: ping daemon
 *
 * Run: npx tsx examples/ping.ts
 */

import { CCCCClient, DaemonUnavailableError } from '../src/index.js';

async function main() {
  try {
    console.log('Connecting to daemon...');
    const client = await CCCCClient.create();
    console.log('Endpoint:', client.endpoint);

    console.log('\nPinging daemon...');
    const info = await client.ping();
    console.log('Daemon info:');
    console.log('  - IPC version:', info['ipc_v']);
    console.log('  - PID:', info['pid']);
    console.log('  - Timestamp:', info['ts']);
    console.log('  - Capabilities:', info['capabilities']);

    // Compatibility check
    console.log('\nChecking compatibility...');
    await client.assertCompatible({ requireIpcV: 1 });
    console.log('Compatibility check passed!');

  } catch (error) {
    if (error instanceof DaemonUnavailableError) {
      console.error('Daemon unavailable:', error.message);
      console.error('Please make sure ccccd is running.');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
