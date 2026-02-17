import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { discoverEndpoint, defaultHome, MAX_LINE_SIZE, DEFAULT_TIMEOUT_MS } from '../src/transport.js';

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

  it('normalizes IPv6 host to 127.0.0.1', async () => {
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
      assert.equal(endpoint.host, '127.0.0.1');
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
