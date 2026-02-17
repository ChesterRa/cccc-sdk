/**
 * CCCC SDK transport layer - Unix socket / TCP
 */

import * as net from 'node:net';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  AddressDescriptor,
} from './types.js';
import { DaemonUnavailableError } from './errors.js';

// ============================================================
// Constants
// ============================================================

const MAX_LINE_SIZE = 4_000_000; // 4MB
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeTcpConnectHost(rawHost: string | undefined): string {
  const host = String(rawHost ?? '').trim();
  if (!host || host === 'localhost' || host === '0.0.0.0') {
    return '127.0.0.1';
  }
  // Daemon IPC currently uses AF_INET only; avoid writing IPv6 hosts into client dial path.
  if (host.includes(':')) {
    return '127.0.0.1';
  }
  return host;
}

// ============================================================
// Endpoint discovery
// ============================================================

/**
 * Get default CCCC home path
 */
export function defaultHome(): string {
  return process.env['CCCC_HOME'] || path.join(os.homedir(), '.cccc');
}

/**
 * Discover daemon endpoint
 */
export async function discoverEndpoint(home?: string): Promise<DaemonEndpoint> {
  const ccccHome = home || defaultHome();
  const addrPath = path.join(ccccHome, 'daemon', 'ccccd.addr.json');

  try {
    const content = await fs.readFile(addrPath, 'utf-8');
    const descriptor: AddressDescriptor = JSON.parse(content);

    if (descriptor.v === 1) {
      if (descriptor.transport === 'tcp' && descriptor.port) {
        const port = Number(descriptor.port);
        if (!Number.isInteger(port) || port <= 0) {
          throw new Error(`invalid daemon tcp port: ${descriptor.port}`);
        }
        return {
          transport: 'tcp',
          host: normalizeTcpConnectHost(descriptor.host),
          port,
          path: '',
        };
      }
      if (descriptor.transport === 'unix' && descriptor.path) {
        return {
          transport: 'unix',
          path: descriptor.path,
          host: '',
          port: 0,
        };
      }
    }
  } catch {
    // Ignore read errors and try fallback.
  }

  // Fallback to Unix socket.
  const sockPath = path.join(ccccHome, 'daemon', 'ccccd.sock');
  return {
    transport: 'unix',
    path: sockPath,
    host: '',
    port: 0,
  };
}

// ============================================================
// Socket connection
// ============================================================

/**
 * Create socket connection
 */
function connect(
  endpoint: DaemonEndpoint,
  timeoutMs: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const cleanup = () => {
      socket.removeAllListeners();
    };

    const onError = (err: Error) => {
      cleanup();
      socket.destroy();
      reject(new DaemonUnavailableError(err.message));
    };

    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(new DaemonUnavailableError('Connection timeout'));
    };

    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    const onConnect = () => {
      cleanup();
      resolve(socket);
    };

    if (endpoint.transport === 'tcp') {
      socket.connect(endpoint.port, endpoint.host, onConnect);
    } else if (endpoint.transport === 'unix') {
      socket.connect(endpoint.path, onConnect);
    } else {
      reject(new DaemonUnavailableError(`Invalid endpoint transport: ${endpoint.transport}`));
    }
  });
}

// ============================================================
// IPC calls
// ============================================================

/**
 * Send a single IPC request
 */
export async function callDaemon(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DaemonResponse> {
  const socket = await connect(endpoint, timeoutMs);

  return new Promise((resolve, reject) => {
    let buffer = '';
    let resolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
    };

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');

      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1 && !resolved) {
        resolved = true;
        const line = buffer.slice(0, newlineIndex);
        cleanup();
        socket.destroy();

        if (line.length > MAX_LINE_SIZE) {
          reject(new DaemonUnavailableError('Response too large'));
          return;
        }

        try {
          resolve(JSON.parse(line) as DaemonResponse);
        } catch {
          reject(new DaemonUnavailableError('Invalid JSON response'));
        }
      }
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new DaemonUnavailableError(err.message));
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new DaemonUnavailableError('Connection closed unexpectedly'));
      }
    });

    // Send request.
    const line = JSON.stringify(request) + '\n';
    socket.write(line);
  });
}

// ============================================================
// Event stream
// ============================================================

/** Event stream connection result */
export interface EventsStreamConnection {
  socket: net.Socket;
  handshake: DaemonResponse;
  initialBuffer: string;
}

/**
 * Open event stream connection
 */
export async function openEventsStream(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<EventsStreamConnection> {
  const socket = await connect(endpoint, timeoutMs);

  // Send request.
  const line = JSON.stringify(request) + '\n';
  socket.write(line);

  // Read handshake response.
  const { handshake, remainingBuffer } = await new Promise<{
    handshake: DaemonResponse;
    remainingBuffer: string;
  }>((resolve, reject) => {
    let buffer = '';
    let resolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1 && !resolved) {
        resolved = true;
        cleanup();
        const responseLine = buffer.slice(0, newlineIndex);
        const remaining = buffer.slice(newlineIndex + 1);
        try {
          resolve({
            handshake: JSON.parse(responseLine) as DaemonResponse,
            remainingBuffer: remaining,
          });
        } catch {
          socket.destroy();
          reject(new DaemonUnavailableError('Invalid handshake JSON'));
        }
      }
    };

    socket.on('data', onData);
    socket.once('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new DaemonUnavailableError(err.message));
      }
    });
    socket.once('close', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new DaemonUnavailableError('Connection closed during handshake'));
      }
    });
  });

  // Remove timeout after handshake.
  socket.setTimeout(0);

  return { socket, handshake, initialBuffer: remainingBuffer };
}

/**
 * Create line reader from socket (async generator)
 */
export async function* readLines(
  socket: net.Socket,
  initialBuffer: string = ''
): AsyncGenerator<string> {
  let buffer = initialBuffer;

  // Handle lines from initial buffer.
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    if (line.trim()) {
      yield line;
    }
  }

  // Continue reading from socket.
  for await (const chunk of socket) {
    buffer += (chunk as Buffer).toString('utf-8');

    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.trim()) {
        yield line;
      }
    }
  }
}
