# CCCC TypeScript SDK 设计文档

## 1. 概述

本文档描述 CCCC TypeScript SDK 的详细设计，该 SDK 是 Python 参考实现的 TypeScript 移植版本。

### 1.1 设计目标

- **API 一致性**：与 Python SDK 保持相同的方法签名和行为
- **类型安全**：充分利用 TypeScript 的类型系统
- **异步优先**：所有 I/O 操作使用 async/await
- **零运行时依赖**：仅使用 Node.js 内置模块

### 1.2 支持的 Node.js 版本

- Node.js 16.x LTS
- Node.js 18.x LTS
- Node.js 20.x LTS

---

## 2. 项目结构

```
ts/
├── package.json              # NPM 包配置
├── tsconfig.json             # TypeScript 配置
├── tsconfig.build.json       # 构建配置
├── vitest.config.ts          # 测试配置
├── src/
│   ├── index.ts              # 公开 API 导出
│   ├── client.ts             # CCCCClient 主类
│   ├── transport.ts          # 传输层（socket）
│   ├── errors.ts             # 异常类定义
│   └── types.ts              # 类型定义
├── examples/
│   ├── ping.ts               # 心跳测试
│   ├── send.ts               # 发送消息
│   ├── stream.ts             # 事件流订阅
│   ├── compat-check.ts       # 兼容性检查
│   └── werewolf/             # AI 狼人杀 Demo
│       ├── index.ts
│       ├── game.ts
│       ├── roles.ts
│       ├── ai-player.ts
│       ├── prompts.ts
│       └── config.ts
├── __tests__/
│   ├── transport.test.ts
│   ├── client.test.ts
│   └── mocks/
└── dist/                     # 构建输出
    ├── esm/                  # ES Modules
    ├── cjs/                  # CommonJS
    └── types/                # 类型声明
```

---

## 3. 核心类型定义 (`types.ts`)

```typescript
// ============================================================
// IPC 协议类型
// ============================================================

/** IPC 请求包 */
export interface DaemonRequest {
  v: 1;
  op: string;
  args?: Record<string, unknown>;
}

/** IPC 响应包 */
export interface DaemonResponse {
  v: 1;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: DaemonErrorPayload;
}

/** 错误载荷 */
export interface DaemonErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================
// 端点配置
// ============================================================

/** 守护进程端点 */
export interface DaemonEndpoint {
  readonly transport: 'unix' | 'tcp' | '';
  readonly path: string;      // Unix socket 路径
  readonly host: string;      // TCP 主机
  readonly port: number;      // TCP 端口
}

/** 地址描述符 (ccccd.addr.json) */
export interface AddressDescriptor {
  v: 1;
  transport: 'unix' | 'tcp';
  path?: string;
  host?: string;
  port?: number;
  pid?: number;
  version?: string;
  ts?: string;
}

// ============================================================
// 事件流类型
// ============================================================

/** 事件流项 */
export type EventStreamItem =
  | { t: 'event'; event: CCCSEvent }
  | { t: 'heartbeat'; ts: string }
  | { t: string; [key: string]: unknown };

/** CCCS 事件 */
export interface CCCSEvent {
  event_id: string;
  ts: string;
  kind: string;
  group_id: string;
  data: Record<string, unknown>;
}

// ============================================================
// 客户端选项
// ============================================================

/** 客户端初始化选项 */
export interface CCCCClientOptions {
  ccccHome?: string;
  endpoint?: DaemonEndpoint;
  timeoutMs?: number;  // 默认 30000
}

/** 兼容性检查选项 */
export interface CompatibilityOptions {
  requireIpcV?: number;
  requireCapabilities?: Record<string, boolean>;
  requireOps?: string[];
}

// ============================================================
// 操作参数类型
// ============================================================

export interface SendOptions {
  groupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'high';
  path?: string;
}

export interface ActorAddOptions {
  groupId: string;
  actorId?: string;
  title?: string;
  runtime?: string;
  runner?: string;
  command?: string[];
  env?: Record<string, string>;
  defaultScopeKey?: string;
  submit?: string;
  by?: string;
}

export interface EventsStreamOptions {
  groupId: string;
  by?: string;
  kinds?: Set<string>;
  sinceEventId?: string;
  sinceTs?: string;
  timeoutMs?: number;
}

// ... 更多操作参数类型
```

---

## 4. 异常类定义 (`errors.ts`)

```typescript
/**
 * SDK 基础异常
 */
export class CCCCSDKError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CCCCSDKError';
  }
}

/**
 * 守护进程不可用
 */
export class DaemonUnavailableError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'DaemonUnavailableError';
  }
}

/**
 * 守护进程 API 错误
 */
export class DaemonAPIError extends CCCCSDKError {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly raw?: DaemonResponse;

  constructor(
    code: string,
    message: string,
    details: Record<string, unknown> = {},
    raw?: DaemonResponse
  ) {
    super(`${code}: ${message}`);
    this.name = 'DaemonAPIError';
    this.code = code;
    this.details = details;
    this.raw = raw;
  }
}

/**
 * 守护进程版本不兼容
 */
export class IncompatibleDaemonError extends CCCCSDKError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleDaemonError';
  }
}
```

---

## 5. 传输层 (`transport.ts`)

```typescript
import * as net from 'net';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { DaemonEndpoint, DaemonRequest, DaemonResponse, AddressDescriptor } from './types';
import { DaemonUnavailableError } from './errors';

// ============================================================
// 常量
// ============================================================

const MAX_LINE_SIZE = 4_000_000;  // 4MB
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================
// 端点发现
// ============================================================

/**
 * 获取默认 CCCC 主目录
 */
export function defaultHome(): string {
  return process.env.CCCC_HOME || path.join(os.homedir(), '.cccc');
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
async function connect(
  endpoint: DaemonEndpoint,
  timeoutMs: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    const onError = (err: Error) => {
      socket.destroy();
      reject(new DaemonUnavailableError(err.message));
    };

    const onTimeout = () => {
      socket.destroy();
      reject(new DaemonUnavailableError('Connection timeout'));
    };

    socket.once('error', onError);
    socket.once('timeout', onTimeout);

    const onConnect = () => {
      socket.removeListener('error', onError);
      socket.removeListener('timeout', onTimeout);
      resolve(socket);
    };

    if (endpoint.transport === 'tcp') {
      socket.connect(endpoint.port, endpoint.host, onConnect);
    } else if (endpoint.transport === 'unix') {
      socket.connect(endpoint.path, onConnect);
    } else {
      reject(new DaemonUnavailableError('Invalid endpoint'));
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

    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');

      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
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
      reject(new DaemonUnavailableError(err.message));
    });

    socket.on('close', () => {
      if (!buffer.includes('\n')) {
        reject(new DaemonUnavailableError('Connection closed'));
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

/**
 * 打开事件流连接
 */
export async function openEventsStream(
  endpoint: DaemonEndpoint,
  request: DaemonRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<{ socket: net.Socket; handshake: DaemonResponse }> {
  const socket = await connect(endpoint, timeoutMs);

  // 发送请求
  const line = JSON.stringify(request) + '\n';
  socket.write(line);

  // 读取握手响应
  const handshake = await new Promise<DaemonResponse>((resolve, reject) => {
    let buffer = '';

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        socket.removeListener('data', onData);
        const responseLine = buffer.slice(0, newlineIndex);
        try {
          resolve(JSON.parse(responseLine) as DaemonResponse);
        } catch {
          reject(new DaemonUnavailableError('Invalid handshake'));
        }
      }
    };

    socket.on('data', onData);
    socket.once('error', (err) => reject(new DaemonUnavailableError(err.message)));
  });

  // 握手后移除超时
  socket.setTimeout(0);

  return { socket, handshake };
}
```

---

## 6. 客户端类 (`client.ts`)

```typescript
import {
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  CCCCClientOptions,
  CompatibilityOptions,
  SendOptions,
  ActorAddOptions,
  EventsStreamOptions,
  EventStreamItem,
} from './types';
import {
  CCCCSDKError,
  DaemonAPIError,
  DaemonUnavailableError,
  IncompatibleDaemonError,
} from './errors';
import {
  discoverEndpoint,
  callDaemon,
  openEventsStream,
} from './transport';

/**
 * CCCC 客户端
 */
export class CCCCClient {
  private readonly _endpoint: DaemonEndpoint;
  private readonly _timeoutMs: number;

  constructor(options: CCCCClientOptions = {}) {
    this._timeoutMs = options.timeoutMs ?? 30_000;

    // 同步初始化需要提前发现端点，或使用懒加载
    // 这里简化处理，实际可能需要 async factory
    if (options.endpoint) {
      this._endpoint = options.endpoint;
    } else {
      // 注意：这里需要异步处理，可以使用静态工厂方法
      throw new Error('Use CCCCClient.create() for async initialization');
    }
  }

  /**
   * 异步工厂方法
   */
  static async create(options: CCCCClientOptions = {}): Promise<CCCCClient> {
    const endpoint = options.endpoint ?? await discoverEndpoint(options.ccccHome);
    return new CCCCClient({ ...options, endpoint });
  }

  get endpoint(): DaemonEndpoint {
    return this._endpoint;
  }

  // ============================================================
  // 低级 API
  // ============================================================

  /**
   * 发送原始 IPC 请求
   */
  async callRaw(op: string, args?: Record<string, unknown>): Promise<DaemonResponse> {
    const request: DaemonRequest = {
      v: 1,
      op,
      args: args ?? {},
    };

    const response = await callDaemon(this._endpoint, request, this._timeoutMs);

    if (!response.ok && response.error) {
      throw new DaemonAPIError(
        response.error.code,
        response.error.message,
        response.error.details,
        response
      );
    }

    return response;
  }

  /**
   * 发送 IPC 请求并返回结果
   */
  async call(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.callRaw(op, args);
    return response.result ?? {};
  }

  /**
   * 兼容性检查
   */
  async assertCompatible(options: CompatibilityOptions = {}): Promise<Record<string, unknown>> {
    const pingResult = await this.ping();
    const ipcV = (pingResult.ipc_v as number) ?? 0;
    const capabilities = (pingResult.capabilities as Record<string, boolean>) ?? {};

    // 检查 IPC 版本
    if (ipcV < (options.requireIpcV ?? 1)) {
      throw new IncompatibleDaemonError(
        `IPC version ${ipcV} < required ${options.requireIpcV}`
      );
    }

    // 检查能力
    for (const [cap, required] of Object.entries(options.requireCapabilities ?? {})) {
      if (required && !capabilities[cap]) {
        throw new IncompatibleDaemonError(`Missing capability: ${cap}`);
      }
    }

    // 检查操作支持
    const reservedOps = new Set(['ping', 'shutdown', 'events_stream', 'term_attach']);
    for (const op of options.requireOps ?? []) {
      if (reservedOps.has(op)) continue;
      try {
        await this.callRaw(op, {});
      } catch (e) {
        if (e instanceof DaemonAPIError && e.code === 'unknown_op') {
          throw new IncompatibleDaemonError(`Operation not supported: ${op}`);
        }
        // 其他错误（如 missing_group_id）说明操作是支持的
      }
    }

    return pingResult;
  }

  // ============================================================
  // 便利方法：诊断
  // ============================================================

  async ping(): Promise<Record<string, unknown>> {
    return this.call('ping');
  }

  // ============================================================
  // 便利方法：Group 操作
  // ============================================================

  async groups(): Promise<Record<string, unknown>> {
    return this.call('groups');
  }

  async groupShow(groupId: string): Promise<Record<string, unknown>> {
    return this.call('group_show', { group_id: groupId });
  }

  async groupCreate(options: {
    title?: string;
    topic?: string;
    by?: string;
  } = {}): Promise<Record<string, unknown>> {
    return this.call('group_create', {
      title: options.title ?? '',
      topic: options.topic ?? '',
      by: options.by ?? 'user',
    });
  }

  async groupDelete(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_delete', { group_id: groupId, by });
  }

  async groupStart(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_start', { group_id: groupId, by });
  }

  async groupStop(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_stop', { group_id: groupId, by });
  }

  // ============================================================
  // 便利方法：Actor 操作
  // ============================================================

  async actorList(groupId: string): Promise<Record<string, unknown>> {
    return this.call('actor_list', { group_id: groupId });
  }

  async actorAdd(options: ActorAddOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };

    if (options.actorId) args.actor_id = options.actorId;
    if (options.title) args.title = options.title;
    if (options.runtime) args.runtime = options.runtime;
    if (options.runner) args.runner = options.runner;
    if (options.command) args.command = options.command;
    if (options.env) args.env = options.env;
    if (options.defaultScopeKey) args.default_scope_key = options.defaultScopeKey;
    if (options.submit) args.submit = options.submit;

    return this.call('actor_add', args);
  }

  async actorStart(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_start', { group_id: groupId, actor_id: actorId, by });
  }

  async actorStop(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_stop', { group_id: groupId, actor_id: actorId, by });
  }

  async actorRemove(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_remove', { group_id: groupId, actor_id: actorId, by });
  }

  // ============================================================
  // 便利方法：消息
  // ============================================================

  async send(options: SendOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
    };

    if (options.to) args.to = options.to;
    if (options.path) args.path = options.path;

    return this.call('send', args);
  }

  async reply(options: {
    groupId: string;
    replyTo: string;
    text: string;
    by?: string;
    to?: string[];
    priority?: 'normal' | 'high';
  }): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      reply_to: options.replyTo,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
    };

    if (options.to) args.to = options.to;

    return this.call('reply', args);
  }

  async chatAck(
    groupId: string,
    actorId: string,
    eventId: string,
    by?: string
  ): Promise<Record<string, unknown>> {
    return this.call('chat_ack', {
      group_id: groupId,
      actor_id: actorId,
      event_id: eventId,
      by: by ?? actorId,
    });
  }

  // ============================================================
  // 便利方法：收件箱
  // ============================================================

  async inboxList(options: {
    groupId: string;
    actorId: string;
    by?: string;
    limit?: number;
    kindFilter?: string;
  }): Promise<Record<string, unknown>> {
    return this.call('inbox_list', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit: options.limit ?? 50,
      kind_filter: options.kindFilter ?? 'all',
    });
  }

  // ============================================================
  // 便利方法：Context
  // ============================================================

  async contextGet(groupId: string): Promise<Record<string, unknown>> {
    return this.call('context_get', { group_id: groupId });
  }

  async contextSync(options: {
    groupId: string;
    ops: Record<string, unknown>[];
    by?: string;
    dryRun?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.call('context_sync', {
      group_id: options.groupId,
      ops: options.ops,
      by: options.by ?? 'system',
      dry_run: options.dryRun ?? false,
    });
  }

  // ============================================================
  // 事件流
  // ============================================================

  /**
   * 订阅事件流
   */
  async *eventsStream(options: EventsStreamOptions): AsyncGenerator<EventStreamItem> {
    const request: DaemonRequest = {
      v: 1,
      op: 'events_stream',
      args: {
        group_id: options.groupId,
        by: options.by ?? 'user',
      },
    };

    if (options.kinds) {
      (request.args as Record<string, unknown>).kinds = Array.from(options.kinds);
    }
    if (options.sinceEventId) {
      (request.args as Record<string, unknown>).since_event_id = options.sinceEventId;
    }
    if (options.sinceTs) {
      (request.args as Record<string, unknown>).since_ts = options.sinceTs;
    }

    const { socket, handshake } = await openEventsStream(
      this._endpoint,
      request,
      options.timeoutMs ?? this._timeoutMs
    );

    if (!handshake.ok) {
      socket.destroy();
      throw new DaemonAPIError(
        handshake.error?.code ?? 'unknown',
        handshake.error?.message ?? 'Handshake failed',
        handshake.error?.details,
        handshake
      );
    }

    let buffer = '';

    try {
      for await (const chunk of socket) {
        buffer += chunk.toString('utf-8');

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.trim()) {
            try {
              yield JSON.parse(line) as EventStreamItem;
            } catch {
              // 跳过无效 JSON
            }
          }
        }
      }
    } finally {
      socket.destroy();
    }
  }
}
```

---

## 7. 公开 API (`index.ts`)

```typescript
export { CCCCClient } from './client';
export {
  CCCCSDKError,
  DaemonAPIError,
  DaemonUnavailableError,
  IncompatibleDaemonError,
} from './errors';
export { discoverEndpoint, defaultHome } from './transport';
export * from './types';

export const version = '0.4.0-rc.1';
```

---

## 8. 使用示例

### 8.1 基础使用

```typescript
import { CCCCClient } from '@cccc/sdk';

async function main() {
  const client = await CCCCClient.create();

  // 检查兼容性
  await client.assertCompatible({
    requireIpcV: 1,
    requireOps: ['send', 'groups'],
  });

  // 创建组
  const group = await client.groupCreate({ title: 'Test Group' });
  console.log('Created group:', group);

  // 发送消息
  await client.send({
    groupId: group.group_id as string,
    text: 'Hello from TypeScript!',
  });
}

main().catch(console.error);
```

### 8.2 事件流订阅

```typescript
import { CCCCClient } from '@cccc/sdk';

async function main() {
  const client = await CCCCClient.create();

  for await (const item of client.eventsStream({ groupId: 'my-group' })) {
    if (item.t === 'event') {
      console.log('Event:', item.event);
    } else if (item.t === 'heartbeat') {
      console.log('Heartbeat:', item.ts);
    }
  }
}

main().catch(console.error);
```

---

## 9. 与 Python SDK 对照表

| Python 方法 | TypeScript 方法 | 说明 |
|-------------|-----------------|------|
| `__init__()` | `CCCCClient.create()` | 异步工厂方法 |
| `call_raw()` | `callRaw()` | camelCase |
| `call()` | `call()` | 相同 |
| `assert_compatible()` | `assertCompatible()` | camelCase |
| `events_stream()` | `eventsStream()` | AsyncGenerator |
| `group_create()` | `groupCreate()` | camelCase |
| `actor_add()` | `actorAdd()` | camelCase |
| ... | ... | ... |

---

## 10. 构建与发布

### 10.1 构建命令

```bash
# 开发
pnpm dev       # watch 模式

# 构建
pnpm build     # ESM + CJS + 类型声明

# 测试
pnpm test      # 单元测试
pnpm test:ci   # CI 测试 + 覆盖率
```

### 10.2 发布

```bash
# 发布到 npm
npm publish --access public
```

---

## 11. 后续计划

1. **Phase 1**：核心 SDK 实现（本文档范围）
2. **Phase 2**：狼人杀示例移植
3. **Phase 3**：Web 环境支持（WebSocket adapter）
4. **Phase 4**：Deno / Bun 兼容
