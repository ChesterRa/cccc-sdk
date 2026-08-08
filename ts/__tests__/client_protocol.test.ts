import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { CCCCClient } from '../src/client.js';
import {
  IncompatibleDaemonError,
  OutcomeUnknownError,
  RequestTooLargeError,
} from '../src/errors.js';

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server did not bind a TCP port');
  }
  return address.port;
}

async function close(server: net.Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function writeDescriptor(home: string, port: number): Promise<void> {
  const daemonDir = path.join(home, 'daemon');
  await fs.mkdir(daemonDir, { recursive: true });
  await fs.writeFile(
    path.join(daemonDir, 'ccccd.addr.json'),
    JSON.stringify({ v: 1, transport: 'tcp', host: '127.0.0.1', port }),
    'utf8',
  );
}

describe('client protocol resilience', () => {
  it('rejects an explicit unsupported response IPC version', async () => {
    const server = net.createServer((socket) => {
      socket.once('data', () => {
        socket.end('{"v":2,"ok":true,"result":{}}\n');
      });
    });
    const port = await listen(server);
    try {
      const client = await CCCCClient.create({
        endpoint: { transport: 'tcp', host: '127.0.0.1', port, path: '' },
      });
      await assert.rejects(client.ping(), IncompatibleDaemonError);
    } finally {
      await close(server);
    }
  });

  it('rejects an oversized request before connecting', async () => {
    const client = await CCCCClient.create({
      endpoint: { transport: 'tcp', host: '127.0.0.1', port: 1, path: '' },
    });
    await assert.rejects(
      client.callRaw('send', { text: 'x'.repeat(2_000_000) }),
      RequestTooLargeError,
    );
  });

  it('rediscovers an automatic endpoint after a pre-write connection failure', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-sdk-ts-rediscover-'));
    const stale = net.createServer();
    const stalePort = await listen(stale);
    await close(stale);
    await writeDescriptor(home, stalePort);

    const live = net.createServer((socket) => {
      socket.once('data', () => {
        socket.end('{"v":1,"ok":true,"result":{"ipc_v":1,"capabilities":{}}}\n');
      });
    });
    const livePort = await listen(live);
    try {
      const client = await CCCCClient.create({ ccccHome: home });
      await writeDescriptor(home, livePort);
      const ping = await client.ping();
      assert.equal(ping['ipc_v'], 1);
      assert.equal(client.endpoint.port, livePort);
    } finally {
      await close(live);
      await fs.rm(home, { recursive: true });
    }
  });

  it('never rediscovers and replays after request exchange begins', async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-sdk-ts-no-replay-'));
    const first = net.createServer((socket) => {
      socket.once('data', () => socket.destroy());
    });
    const firstPort = await listen(first);
    await writeDescriptor(home, firstPort);

    let replayConnections = 0;
    const replacement = net.createServer((socket) => {
      replayConnections += 1;
      socket.destroy();
    });
    const replacementPort = await listen(replacement);
    try {
      const client = await CCCCClient.create({ ccccHome: home });
      await writeDescriptor(home, replacementPort);
      await assert.rejects(
        client.ping(),
        (error: unknown) => error instanceof OutcomeUnknownError && error.op === 'ping',
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.equal(replayConnections, 0);
    } finally {
      await close(first);
      await close(replacement);
      await fs.rm(home, { recursive: true });
    }
  });
});
