/**
 * CCCC SDK 类型定义
 */

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
  v?: 1;
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
  readonly path: string;
  readonly host: string;
  readonly port: number;
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
  timeoutMs?: number;
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

/** 发送消息选项 */
export interface SendOptions {
  groupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'high';
  path?: string;
}

/** 跨组发送选项 */
export interface SendCrossGroupOptions {
  groupId: string;
  dstGroupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'high';
}

/** 回复消息选项 */
export interface ReplyOptions {
  groupId: string;
  replyTo: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'high';
}

/** 添加 Actor 选项 */
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

/** 更新 Actor 选项 */
export interface ActorUpdateOptions {
  groupId: string;
  actorId: string;
  patch: Record<string, unknown>;
  by?: string;
}

/** 创建组选项 */
export interface GroupCreateOptions {
  title?: string;
  topic?: string;
  by?: string;
}

/** 更新组选项 */
export interface GroupUpdateOptions {
  groupId: string;
  patch: Record<string, unknown>;
  by?: string;
}

/** 收件箱列表选项 */
export interface InboxListOptions {
  groupId: string;
  actorId: string;
  by?: string;
  limit?: number;
  kindFilter?: string;
}

/** Context Sync 选项 */
export interface ContextSyncOptions {
  groupId: string;
  ops: Record<string, unknown>[];
  by?: string;
  dryRun?: boolean;
}

/** 事件流选项 */
export interface EventsStreamOptions {
  groupId: string;
  by?: string;
  kinds?: Set<string> | string[];
  sinceEventId?: string;
  sinceTs?: string;
  timeoutMs?: number;
}
