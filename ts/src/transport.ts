/**
 * CCCC SDK 传输层 - Unix socket / TCP
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
// 常量
// ============================================================

const MAX_LINE_SIZE = 4_000_000; // 4MB
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================
// 端点发现
// ============================================================

/**
 * 获取默认 CCCC 主目录
 */
export function defaultHome(): string {
  return process.env['CCCC_HOME'] || path.join(os.homedir(), '.cccc');
}

/**
 * 发现守护进程端点
 */
export async function discoverEndpoint(home?: string): Promise<DaemonEndpoint> {
  const ccccHome = home || defaultHome();
  const addrPath = path.join(ccccHome, 'daemon', 'ccccd.addr.json');

  try {
    const content = await fs.readFile(addrPath, 'utf-8');
    const descriptor: AddressDescriptor = JSON.parse(content);

    if (descriptor.v === 1) {
      if (descriptor.transport === 'tcp' && descriptor.host && descriptor.port) {
        return {
          transport: 'tcp',
          host: descriptor.host,
          port: descriptor.port,
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
    // 忽略读取错误，尝试回退
  }

  // 回退到 Unix socket
  const sockPath = path.join(ccccHome, 'daemon', 'ccccd.sock');
  return {
    transport: 'unix',
    path: sockPath,
    host: '',
    port: 0,
  };
}

// ============================================================
// Socket 连接
// ============================================================

/**
 * 创建 socket 连接
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
// IPC 调用
// ============================================================

/**
 * 发送单次 IPC 请求
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

    // 发送请求
    const line = JSON.stringify(request) + '\n';
    socket.write(line);
  });
}

// ============================================================
// 事件流
// ============================================================

/** 事件流连接结果 */
export interface EventsStreamConnection {
  socket: net.Socket;
  handshake: DaemonResponse;
  initialBuffer: string;
}

/**
 * 打开事件流连接
 */
export async function openEventsStream(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<EventsStreamConnection> {
  const socket = await connect(endpoint, timeoutMs);

  // 发送请求
  const line = JSON.stringify(request) + '\n';
  socket.write(line);

  // 读取握手响应
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

  // 握手后移除超时
  socket.setTimeout(0);

  return { socket, handshake, initialBuffer: remainingBuffer };
}

/**
 * 从 socket 创建行读取器（异步生成器）
 */
export async function* readLines(
  socket: net.Socket,
  initialBuffer: string = ''
): AsyncGenerator<string> {
  let buffer = initialBuffer;

  // 处理初始缓冲区中的行
  let newlineIndex: number;
  while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);
    if (line.trim()) {
      yield line;
    }
  }

  // 继续读取 socket
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
