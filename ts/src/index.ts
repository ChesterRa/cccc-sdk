/**
 * CCCC SDK - TypeScript Client for CCCC Daemon (IPC v1)
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version?: string };

// 导出客户端类
export { CCCCClient } from './client.js';

// 导出异常类
export {
  CCCCSDKError,
  DaemonAPIError,
  DaemonUnavailableError,
  IncompatibleDaemonError,
} from './errors.js';

// 导出传输层工具函数
export {
  discoverEndpoint,
  defaultHome,
} from './transport.js';

// 导出所有类型
export type {
  // 核心类型
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  DaemonErrorPayload,
  AddressDescriptor,
  // 事件类型
  EventStreamItem,
  CCCSEvent,
  // 客户端选项
  CCCCClientOptions,
  CompatibilityOptions,
  // 操作参数类型
  SendOptions,
  SendCrossGroupOptions,
  ReplyOptions,
  ActorAddOptions,
  ActorUpdateOptions,
  ActorEnvPrivateUpdateOptions,
  GroupCreateOptions,
  GroupUpdateOptions,
  AutomationNotifyPriority,
  AutomationTriggerInterval,
  AutomationTriggerCron,
  AutomationTriggerAt,
  AutomationTrigger,
  AutomationActionNotify,
  AutomationActionGroupState,
  AutomationActionActorControl,
  AutomationAction,
  AutomationRule,
  AutomationRuleSet,
  AutomationManageCreateRule,
  AutomationManageUpdateRule,
  AutomationManageSetRuleEnabled,
  AutomationManageDeleteRule,
  AutomationManageReplaceAllRules,
  AutomationManageAction,
  GroupAutomationUpdateOptions,
  GroupAutomationManageOptions,
  GroupAutomationResetBaselineOptions,
  InboxListOptions,
  ContextSyncOptions,
  EventsStreamOptions,
} from './types.js';

/** SDK 版本 */
export const version = String(pkg.version || '0.0.0');
