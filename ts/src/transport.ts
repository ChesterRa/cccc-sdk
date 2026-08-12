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
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      socket.removeListener('connect', onConnect);
      socket.removeListener('error', onError);
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
    timer = setTimeout(onTimeout, timeoutMs);
    socket.once('connect', onConnect);
    socket.once('error', onError);

    try {
      if (endpoint.transport === 'tcp') {
        socket.connect(endpoint.port, endpoint.host);
      } else if (endpoint.transport === 'unix') {
        socket.connect(endpoint.path);
      } else {
        rejectAndDestroy(
          new DaemonConnectionError(`Invalid endpoint transport: ${endpoint.transport}`),
        );
      }
    } catch (error) {
      rejectAndDestroy(new DaemonConnectionError(
        error instanceof Error ? error.message : String(error),
      ));
    }
  });
}

function remainingTimeout(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

function appendChunk(buffer: Buffer, chunk: Buffer): Buffer {
  return buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
}

function assertBufferedLineLimit(buffer: Buffer): void {
  let start = 0;
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf(0x0a, start)) !== -1) {
    if (newlineIndex - start > MAX_LINE_SIZE) {
      throw new DaemonUnavailableError(
        `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`,
      );
    }
    start = newlineIndex + 1;
  }
  if (buffer.length - start > MAX_LINE_SIZE) {
    throw new DaemonUnavailableError(
      `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`,
    );
  }
}

function decodeLine(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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
  const deadline = Date.now() + timeoutMs;
  const line = JSON.stringify(request) + '\n';
  if (Buffer.byteLength(line, 'utf8') > MAX_REQUEST_SIZE) {
    throw new RequestTooLargeError(`Daemon request exceeds ${MAX_REQUEST_SIZE} bytes`);
  }
  const socket = await connect(endpoint, timeoutMs);

  return new Promise((resolve, reject) => {
    let buffer: Buffer = Buffer.alloc(0);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      if (settled) return;
      buffer = appendChunk(buffer, chunk);
      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex !== -1) {
        settled = true;
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
        fail(new OutcomeUnknownError(request.op, 'Response too large'));
      }
    };

    const onError = (err: Error) => fail(new OutcomeUnknownError(request.op, err.message));
    const onClose = () => fail(
      new OutcomeUnknownError(request.op, 'Connection closed unexpectedly'),
    );

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
    timer = setTimeout(
      () => fail(new OutcomeUnknownError(request.op, 'Response timeout')),
      remainingTimeout(deadline),
    );

    // Send request.
    try {
      socket.write(line, (err) => {
        if (err) fail(new OutcomeUnknownError(request.op, `Write failed: ${err.message}`));
      });
    } catch (error) {
      fail(new OutcomeUnknownError(
        request.op,
        error instanceof Error ? error.message : String(error),
      ));
    }
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
  const deadline = Date.now() + timeoutMs;
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
    let buffer: Buffer = Buffer.alloc(0);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
      signal?.removeEventListener('abort', onAbort);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      socket.destroy();
      reject(error);
    };

    const onAbort = () => fail(new DaemonUnavailableError('Event stream aborted'));

    const onData = (chunk: Buffer) => {
      if (settled) return;
      buffer = appendChunk(buffer, chunk);
      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex !== -1) {
        const responseBytes = buffer.subarray(0, newlineIndex);
        const remaining = buffer.subarray(newlineIndex + 1);
        if (responseBytes.length > MAX_LINE_SIZE) {
          fail(new OutcomeUnknownError(request.op, 'Handshake response too large'));
          return;
        }
        try {
          const parsed: unknown = JSON.parse(responseBytes.toString('utf8'));
          if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            fail(new OutcomeUnknownError(request.op, 'Handshake must be a JSON object'));
            return;
          }
          const handshake = parsed as DaemonResponse;
          if (handshake.v !== 1) {
            fail(new IncompatibleDaemonError(
              `Daemon stream handshake uses unsupported IPC version: ${String(handshake.v)}`,
            ));
            return;
          }
          assertBufferedLineLimit(remaining);
          settled = true;
          cleanup();
          resolve({
            handshake,
            remainingBuffer: remaining,
          });
        } catch (error) {
          fail(error instanceof DaemonUnavailableError
            ? error
            : new OutcomeUnknownError(request.op, 'Invalid handshake JSON'));
        }
      }
      if (newlineIndex === -1 && buffer.length > MAX_LINE_SIZE) {
        fail(new OutcomeUnknownError(request.op, 'Handshake response too large'));
      }
    };

    const onError = (err: Error) => fail(new OutcomeUnknownError(request.op, err.message));
    const onClose = () => fail(
      new OutcomeUnknownError(request.op, 'Connection closed during handshake'),
    );

    socket.on('data', onData);
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.once('error', onError);
    socket.once('close', onClose);
    timer = setTimeout(
      () => fail(new OutcomeUnknownError(request.op, 'Handshake timeout')),
      remainingTimeout(deadline),
    );
    try {
      socket.write(line, (error) => {
        if (error) fail(new OutcomeUnknownError(request.op, `Write failed: ${error.message}`));
      });
    } catch (error) {
      fail(new OutcomeUnknownError(
        request.op,
        error instanceof Error ? error.message : String(error),
      ));
    }
  });

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
  let buffer = typeof initialBuffer === 'string'
    ? Buffer.from(initialBuffer, 'utf8')
    : initialBuffer;

  // Handle lines from initial buffer.
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf(0x0a)) !== -1) {
    if (newlineIndex > MAX_LINE_SIZE) {
      throw new DaemonUnavailableError(
        `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`,
      );
    }
    const line = decodeLine(buffer.subarray(0, newlineIndex));
    buffer = buffer.subarray(newlineIndex + 1);
    if (line.trim()) {
      yield line;
    }
  }
  assertBufferedLineLimit(buffer);

  // Continue reading from socket.
  for await (const chunk of socket) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    buffer = appendChunk(buffer, bytes);

    while ((newlineIndex = buffer.indexOf(0x0a)) !== -1) {
      if (newlineIndex > MAX_LINE_SIZE) {
        throw new DaemonUnavailableError(
          `Stream line exceeds MAX_LINE_SIZE (${MAX_LINE_SIZE} bytes)`,
        );
      }
      const line = decodeLine(buffer.subarray(0, newlineIndex));
      buffer = buffer.subarray(newlineIndex + 1);
      if (line.trim()) {
        yield line;
      }
    }
    assertBufferedLineLimit(buffer);
  }

  if (buffer.length > 0) {
    assertBufferedLineLimit(buffer);
    const line = decodeLine(buffer);
    if (line.trim()) yield line;
  }
}
