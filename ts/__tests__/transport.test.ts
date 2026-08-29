import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as net from 'node:net';
import { Readable } from 'node:stream';
import {
  callDaemon,
  discoverEndpoint,
  defaultHome,
  openEventsStream,
  readLines,
  MAX_LINE_SIZE,
  DEFAULT_TIMEOUT_MS,
} from '../src/transport.js';
import type { DaemonEndpoint, DaemonRequest } from '../src/types.js';

interface TestServer {
  endpoint: DaemonEndpoint;
  sockets: Set<net.Socket>;
  close(): Promise<void>;
}

async function startServer(onConnection: (socket: net.Socket) => void): Promise<TestServer> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    onConnection(socket);
    socket.resume();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server did not bind a TCP port');
  }
  return {
    endpoint: {
      transport: 'tcp',
      host: '127.0.0.1',
      port: address.port,
      path: '',
    },
    sockets,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
  };
}

const streamRequest: DaemonRequest = {
  v: 1,
  op: 'events_stream',
  args: { group_id: 'g1', by: 'user' },
};

describe('defaultHome', () => {
  it('returns CCCC_HOME env if set', () => {
    const original = process.env['CCCC_HOME'];
    try {
      process.env['CCCC_HOME'] = '/tmp/test-cccc';
      assert.equal(defaultHome(), '/tmp/test-cccc');
    } finally {
      if (original !== undefined) {
        process.env['CCCC_HOME'] = original;
      } else {
        delete process.env['CCCC_HOME'];
      }
    }
  });

  it('falls back to ~/.cccc', () => {
    const original = process.env['CCCC_HOME'];
    try {
      delete process.env['CCCC_HOME'];
      assert.equal(defaultHome(), path.join(os.homedir(), '.cccc'));
    } finally {
      if (original !== undefined) {
        process.env['CCCC_HOME'] = original;
      }
    }
  });
});

describe('exported constants', () => {
  it('MAX_LINE_SIZE is 4MB', () => {
    assert.equal(MAX_LINE_SIZE, 4_000_000);
  });

  it('DEFAULT_TIMEOUT_MS is 30s', () => {
    assert.equal(DEFAULT_TIMEOUT_MS, 30_000);
  });
});

describe('discoverEndpoint', () => {
  it('falls back to unix socket for missing addr file', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.transport, 'unix');
      assert.equal(endpoint.path, path.join(tmpHome, 'daemon', 'ccccd.sock'));
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('reads TCP endpoint from addr file', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: '192.168.1.1', port: 8080 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.transport, 'tcp');
      assert.equal(endpoint.host, '192.168.1.1');
      assert.equal(endpoint.port, 8080);
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('normalizes 0.0.0.0 host to 127.0.0.1', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: '0.0.0.0', port: 12345 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.host, '127.0.0.1');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('normalizes localhost to 127.0.0.1', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: 'localhost', port: 9999 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.host, '127.0.0.1');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('preserves a connectable IPv6 host', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: '::1', port: 5555 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.host, '::1');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('normalizes an IPv6 wildcard host to IPv6 loopback', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: '[::]', port: 5555 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.host, '::1');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('reads Unix socket endpoint from addr file', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'unix', path: '/tmp/custom.sock' }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      assert.equal(endpoint.transport, 'unix');
      assert.equal(endpoint.path, '/tmp/custom.sock');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });

  it('falls back on invalid port (> 65535)', async () => {
    const tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'cccc-test-'));
    const daemonDir = path.join(tmpHome, 'daemon');
    await fs.mkdir(daemonDir, { recursive: true });
    await fs.writeFile(
      path.join(daemonDir, 'ccccd.addr.json'),
      JSON.stringify({ v: 1, transport: 'tcp', host: '127.0.0.1', port: 70000 }),
      'utf-8'
    );
    try {
      const endpoint = await discoverEndpoint(tmpHome);
      // Should fall back to unix socket because port validation throws
      assert.equal(endpoint.transport, 'unix');
    } finally {
      await fs.rm(tmpHome, { recursive: true });
    }
  });
});

describe('openEventsStream abort handling', () => {
  const endpoint = {
    transport: 'tcp' as const,
    host: '127.0.0.1',
    port: 43123,
    path: '',
  };
  const request = { v: 1 as const, op: 'events_stream', args: {} };

  it('aborts while the TCP connection is still pending', async () => {
    const originalConnect = net.Socket.prototype.connect;
    let pendingSocket: net.Socket | undefined;
    net.Socket.prototype.connect = function (this: net.Socket): net.Socket {
      pendingSocket = this;
      return this;
    } as typeof net.Socket.prototype.connect;

    try {
      const controller = new AbortController();
      const streamPromise = openEventsStream(endpoint, request, 10_000, controller.signal);
      controller.abort();

      await assert.rejects(streamPromise, /Event stream aborted/);
      assert.equal(pendingSocket?.destroyed, true);
    } finally {
      net.Socket.prototype.connect = originalConnect;
    }
  });

  it('rechecks abort after connect resolves and before handshake listeners attach', async () => {
    const originalConnect = net.Socket.prototype.connect;
    let connectedSocket: net.Socket | undefined;
    net.Socket.prototype.connect = function (
      this: net.Socket,
      ...args: unknown[]
    ): net.Socket {
      connectedSocket = this;
      const callback = args[args.length - 1];
      if (typeof callback === 'function') callback();
      return this;
    } as typeof net.Socket.prototype.connect;

    let guard: NodeJS.Timeout | undefined;
    try {
      const controller = new AbortController();
      const streamPromise = openEventsStream(endpoint, request, 10_000, controller.signal);
      controller.abort();
      const guardedPromise = Promise.race([
        streamPromise,
        new Promise<never>((_resolve, reject) => {
          guard = setTimeout(() => reject(new Error('abort was not observed promptly')), 250);
        }),
      ]);

      await assert.rejects(guardedPromise, /Event stream aborted/);
      assert.equal(connectedSocket?.destroyed, true);
    } finally {
      if (guard !== undefined) clearTimeout(guard);
      net.Socket.prototype.connect = originalConnect;
    }
  });
});

describe('daemon response deadlines', () => {
  it('times out after TCP connect when the daemon never responds', async () => {
    const server = await startServer(() => undefined);
    const started = Date.now();
    try {
      await assert.rejects(
        callDaemon(server.endpoint, { v: 1, op: 'ping', args: {} }, 50),
        /Response timeout/,
      );
      assert.ok(Date.now() - started < 1_000, 'response timeout should be bounded');
    } finally {
      await server.close();
    }
  });
});

describe('event stream handshake safety', () => {
  it('rejects a daemon that accepts the socket but never handshakes', async () => {
    const server = await startServer(() => undefined);
    const started = Date.now();
    try {
      await assert.rejects(
        openEventsStream(server.endpoint, streamRequest, 50),
        /Handshake timeout/,
      );
      assert.ok(Date.now() - started < 1_000, 'handshake timeout should be bounded');
    } finally {
      await server.close();
    }
  });

  it('honors AbortSignal while waiting for the handshake', async () => {
    const server = await startServer(() => undefined);
    const controller = new AbortController();
    try {
      const pending = openEventsStream(server.endpoint, streamRequest, 5_000, controller.signal);
      setTimeout(() => controller.abort(), 20);
      await assert.rejects(pending, /aborted/);
      const closeDeadline = Date.now() + 1_000;
      while (server.sockets.size !== 0 && Date.now() < closeDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(server.sockets.size, 0, 'aborting the handshake must close the socket');
    } finally {
      await server.close();
    }
  });

  it('applies the byte cap to data buffered with the handshake', async () => {
    const socket = Readable.from([]) as unknown as net.Socket;
    const lines = readLines(socket, Buffer.alloc(MAX_LINE_SIZE + 1, 0x78));
    await assert.rejects(lines.next(), /Stream line exceeds MAX_LINE_SIZE/);
  });
});

describe('readLines', () => {
  it('preserves UTF-8 code points split across socket chunks', async () => {
    const encoded = Buffer.from('{"text":"中文"}\n', 'utf8');
    const split = encoded.indexOf(Buffer.from('中')) + 1;
    const socket = Readable.from([
      encoded.subarray(0, split),
      encoded.subarray(split),
    ]) as unknown as net.Socket;
    const lines: string[] = [];
    for await (const line of readLines(socket)) lines.push(line);
    assert.deepEqual(lines, ['{"text":"中文"}']);
  });

  it('rejects an oversized line even when its newline is already buffered', async () => {
    const socket = Readable.from([
      Buffer.from(`${'x'.repeat(MAX_LINE_SIZE + 1)}\n`, 'utf8'),
    ]) as unknown as net.Socket;
    await assert.rejects(async () => {
      for await (const _line of readLines(socket)) {
        // The generator must reject before yielding this line.
      }
    }, /Stream line exceeds MAX_LINE_SIZE/);
  });
});
