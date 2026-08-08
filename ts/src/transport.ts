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
import {
  DaemonConnectionError,
  DaemonUnavailableError,
  IncompatibleDaemonError,
  OutcomeUnknownError,
  RequestTooLargeError,
} from './errors.js';

// ============================================================
// Constants
// ============================================================

export const MAX_LINE_SIZE = 4_000_000; // 4MB
export const MAX_REQUEST_SIZE = 2_000_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_PORT = 65_535;

function normalizeTcpConnectHost(rawHost: string | undefined): string {
  let host = String(rawHost ?? '').trim();
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1).trim();
  }
  if (!host || host === 'localhost' || host === '0.0.0.0') {
    return '127.0.0.1';
  }
  if (host === '::') {
    return '::1';
  }
  return host;
}

// ============================================================
// Endpoint discovery
// ============================================================

/**
 * Get the default CCCC home directory path.
 * Uses `$CCCC_HOME` if set, otherwise `~/.cccc`.
 * @returns Absolute path to the CCCC home directory.
 */
export function defaultHome(): string {
  return process.env['CCCC_HOME'] || path.join(os.homedir(), '.cccc');
}

/**
 * Discover the daemon IPC endpoint by reading `ccccd.addr.json`.
 * Falls back to the default Unix socket path if the address file is missing or unreadable.
 * @param home - Optional CCCC home directory override.
 * @returns The resolved {@link DaemonEndpoint} (TCP or Unix).
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
        if (!Number.isInteger(port) || port <= 0 || port > MAX_PORT) {
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
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const cleanup = () => {
      socket.removeAllListeners();
      signal?.removeEventListener('abort', onAbort);
    };

    const rejectAndDestroy = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onError = (err: Error) => rejectAndDestroy(new DaemonConnectionError(err.message));
    const onTimeout = () => rejectAndDestroy(new DaemonConnectionError('Connection timeout'));
    const onAbort = () => rejectAndDestroy(new DaemonUnavailableError('Event stream aborted'));

    const onConnect = () => {
      if (settled) {
        socket.destroy();
        return;
      }
      settled = true;
      cleanup();
      resolve(socket);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.setTimeout(timeoutMs);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    if (endpoint.transport === 'tcp') {
      socket.connect(endpoint.port, endpoint.host, onConnect);
    } else if (endpoint.transport === 'unix') {
      socket.connect(endpoint.path, onConnect);
    } else {
      rejectAndDestroy(
        new DaemonConnectionError(`Invalid endpoint transport: ${endpoint.transport}`),
      );
    }
  });
}

// ============================================================
// IPC calls
// ============================================================

/**
 * Send a single IPC request to the daemon and return the response.
 * Opens a new socket, sends the JSON-line request, reads exactly one JSON-line response,
 * then destroys the socket.
 * @param endpoint - The daemon endpoint to connect to.
 * @param request - The IPC request envelope.
 * @param timeoutMs - Connection and response timeout in milliseconds.
 * @returns The parsed {@link DaemonResponse}.
 * @throws {DaemonUnavailableError} On connection, write, or parse failure.
 */
export async function callDaemon(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<DaemonResponse> {
  const line = JSON.stringify(request) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_SIZE) {
    throw new RequestTooLargeError(`Daemon request exceeds ${MAX_REQUEST_SIZE} bytes`);
  }
  const socket = await connect(endpoint, timeoutMs);

  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let resolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
    };

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex !== -1 && !resolved) {
        resolved = true;
        const responseBytes = buffer.subarray(0, newlineIndex);
        cleanup();
        socket.destroy();

        if (responseBytes.length > MAX_LINE_SIZE) {
          reject(new OutcomeUnknownError(request.op, 'Response too large'));
          return;
        }

        try {
          const parsed: unknown = JSON.parse(responseBytes.toString('utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            reject(new OutcomeUnknownError(request.op, 'Response must be a JSON object'));
            return;
          }
          const response = parsed as DaemonResponse;
          if (response.v !== 1) {
            reject(new IncompatibleDaemonError(
              `Daemon response uses unsupported IPC version: ${String(response.v)}`,
            ));
            return;
          }
          resolve(response);
        } catch {
          reject(new OutcomeUnknownError(request.op, 'Invalid JSON response'));
        }
      }

      if (newlineIndex === -1 && buffer.length > MAX_LINE_SIZE) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Response too large'));
      }
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, err.message));
      }
    });

    socket.on('close', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Connection closed unexpectedly'));
      }
    });

    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Response timeout'));
      }
    });

    // Send request.
    socket.write(line, (err) => {
      if (err && !resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, `Write failed: ${err.message}`));
      }
    });
  });
}

// ============================================================
// Event stream
// ============================================================

/** Event stream connection result */
export interface EventsStreamConnection {
  socket: net.Socket;
  handshake: DaemonResponse;
  initialBuffer: Buffer;
}

/**
 * Open a long-lived event stream connection to the daemon.
 * Sends the request, reads the handshake response, and returns the socket
 * for continued streaming via {@link readLines}.
 * @param endpoint - The daemon endpoint to connect to.
 * @param request - The IPC request envelope (op should be `events_stream`).
 * @param timeoutMs - Connection and handshake timeout in milliseconds.
 * @returns The socket, handshake response, and any buffered data after the handshake.
 * @throws {DaemonUnavailableError} On connection or handshake failure.
 */
export async function openEventsStream(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<EventsStreamConnection> {
  if (signal?.aborted) {
    throw new DaemonUnavailableError('Event stream aborted');
  }
  const line = JSON.stringify(request) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_SIZE) {
    throw new RequestTooLargeError(`Daemon request exceeds ${MAX_REQUEST_SIZE} bytes`);
  }
  const socket = await connect(endpoint, timeoutMs, signal);
  if (signal?.aborted) {
    socket.destroy();
    throw new DaemonUnavailableError('Event stream aborted');
  }

  // Send the request and read the handshake under one listener set so an
  // immediate socket error or response cannot race the handshake setup.
  const { handshake, remainingBuffer } = await new Promise<{
    handshake: DaemonResponse;
    remainingBuffer: Buffer;
  }>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let resolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new DaemonUnavailableError('Event stream aborted'));
      }
    };

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex !== -1 && !resolved) {
        resolved = true;
        cleanup();
        const responseBytes = buffer.subarray(0, newlineIndex);
        const remaining = buffer.subarray(newlineIndex + 1);
        if (responseBytes.length > MAX_LINE_SIZE) {
          socket.destroy();
          reject(new OutcomeUnknownError(request.op, 'Handshake response too large'));
          return;
        }
        try {
          const parsed: unknown = JSON.parse(responseBytes.toString('utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            socket.destroy();
            reject(new OutcomeUnknownError(request.op, 'Handshake must be a JSON object'));
            return;
          }
          const handshake = parsed as DaemonResponse;
          if (handshake.v !== 1) {
            socket.destroy();
            reject(new IncompatibleDaemonError(
              `Daemon stream handshake uses unsupported IPC version: ${String(handshake.v)}`,
            ));
            return;
          }
          resolve({
            handshake,
            remainingBuffer: remaining,
          });
        } catch {
          socket.destroy();
          reject(new OutcomeUnknownError(request.op, 'Invalid handshake JSON'));
        }
      }
      if (newlineIndex === -1 && buffer.length > MAX_LINE_SIZE) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Handshake response too large'));
      }
    };

    socket.on('data', onData);
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.once('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, err.message));
      }
    });
    socket.once('close', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Connection closed during handshake'));
      }
    });
    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, 'Handshake timeout'));
      }
    });
    socket.write(line, (error) => {
      if (error && !resolved) {
        resolved = true;
        cleanup();
        socket.destroy();
        reject(new OutcomeUnknownError(request.op, `Write failed: ${error.message}`));
      }
    });
  });

  // Remove timeout after handshake.
  socket.setTimeout(0);

  return { socket, handshake, initialBuffer: remainingBuffer };
}

/**
 * Async generator that yields newline-delimited lines from a socket.
 * Handles buffering and splits on `\n`. Empty/whitespace-only lines are skipped.
 * @param socket - The connected socket to read from.
 * @param initialBuffer - Any data already buffered before this generator starts.
 * @yields Each non-empty line as a string (without the trailing newline).
 */
export async function* readLines(
  socket: net.Socket,
  initialBuffer: string | Buffer = ''
): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buffer = typeof initialBuffer === 'string'
    ? initialBuffer
    : decoder.decode(initialBuffer, { stream: true });

  const ensureBounded = (line: string): void => {
    if (Buffer.byteLength(line, 'utf8') > MAX_LINE_SIZE) {
      throw new DaemonUnavailableError(
        `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`,
      );
    }
  };

  // Handle lines from initial buffer.
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    ensureBounded(line);
    if (line.trim()) {
      yield line;
    }
  }

  // Continue reading from socket.
  for await (const chunk of socket) {
    buffer += decoder.decode(chunk as Buffer, { stream: true });

    if (buffer.indexOf('\n') === -1 && Buffer.byteLength(buffer, 'utf8') > MAX_LINE_SIZE) {
      throw new DaemonUnavailableError(
        `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`
      );
    }

    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      ensureBounded(line);
      if (line.trim()) {
        yield line;
      }
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    ensureBounded(buffer);
    yield buffer;
  }
}
