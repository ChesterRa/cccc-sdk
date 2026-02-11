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
  envPrivate?: Record<string, string>;
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

/** Actor 私有环境变量（secrets，runtime-only） */
export interface ActorEnvPrivateUpdateOptions {
  groupId: string;
  actorId: string;
  by?: string;
  set?: Record<string, string>;
  unset?: string[];
  clear?: boolean;
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

/** Automation 通知优先级 */
export type AutomationNotifyPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Automation 触发器（间隔） */
export interface AutomationTriggerInterval {
  kind: 'interval';
  every_seconds: number;
}

/** Automation 触发器（日程） */
export interface AutomationTriggerCron {
  kind: 'cron';
  cron: string;
  timezone?: string;
}

/** Automation 触发器（一次性） */
export interface AutomationTriggerAt {
  kind: 'at';
  at: string;
}

/** Automation 触发器 */
export type AutomationTrigger =
  | AutomationTriggerInterval
  | AutomationTriggerCron
  | AutomationTriggerAt;

/** Automation 动作（通知） */
export interface AutomationActionNotify {
  kind: 'notify';
  title?: string;
  snippet_ref?: string | null;
  message?: string;
  priority?: AutomationNotifyPriority;
  requires_ack?: boolean;
}

/** Automation 动作（组状态） */
export interface AutomationActionGroupState {
  kind: 'group_state';
  state: 'active' | 'idle' | 'paused' | 'stopped';
}

/** Automation 动作（Actor 控制） */
export interface AutomationActionActorControl {
  kind: 'actor_control';
  operation: 'start' | 'stop' | 'restart';
  targets?: string[];
}

/** Automation 动作 */
export type AutomationAction =
  | AutomationActionNotify
  | AutomationActionGroupState
  | AutomationActionActorControl;

/** Automation 规则 */
export interface AutomationRule {
  id: string;
  enabled?: boolean;
  scope?: 'group' | 'personal';
  owner_actor_id?: string | null;
  to?: string[];
  trigger?: AutomationTrigger;
  action?: AutomationAction;
}

/** Automation 规则集 */
export interface AutomationRuleSet {
  rules: AutomationRule[];
  snippets: Record<string, string>;
}

/** Automation 管理动作：创建规则 */
export interface AutomationManageCreateRule {
  type: 'create_rule';
  rule: AutomationRule;
}

/** Automation 管理动作：更新规则 */
export interface AutomationManageUpdateRule {
  type: 'update_rule';
  rule: AutomationRule;
}

/** Automation 管理动作：启停规则 */
export interface AutomationManageSetRuleEnabled {
  type: 'set_rule_enabled';
  rule_id: string;
  enabled: boolean;
}

/** Automation 管理动作：删除规则 */
export interface AutomationManageDeleteRule {
  type: 'delete_rule';
  rule_id: string;
}

/** Automation 管理动作：全量替换 */
export interface AutomationManageReplaceAllRules {
  type: 'replace_all_rules';
  ruleset: AutomationRuleSet;
}

/** Automation 管理动作 */
export type AutomationManageAction =
  | AutomationManageCreateRule
  | AutomationManageUpdateRule
  | AutomationManageSetRuleEnabled
  | AutomationManageDeleteRule
  | AutomationManageReplaceAllRules;

/** Automation 更新组选项 */
export interface GroupAutomationUpdateOptions {
  groupId: string;
  ruleset: AutomationRuleSet;
  by?: string;
  expectedVersion?: number;
}

/** Automation 增量管理组选项 */
export interface GroupAutomationManageOptions {
  groupId: string;
  by?: string;
  expectedVersion?: number;
  op?: 'create' | 'update' | 'enable' | 'disable' | 'delete' | 'replace_all';
  rule?: AutomationRule;
  ruleId?: string;
  ruleset?: AutomationRuleSet;
  actions?: AutomationManageAction[];
}

/** Automation 重置组选项 */
export interface GroupAutomationResetBaselineOptions {
  groupId: string;
  by?: string;
  expectedVersion?: number;
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
