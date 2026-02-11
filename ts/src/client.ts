/**
 * CCCC SDK 客户端
 */

import type {
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  CCCCClientOptions,
  CompatibilityOptions,
  SendOptions,
  SendCrossGroupOptions,
  ReplyOptions,
  ActorAddOptions,
  ActorUpdateOptions,
  ActorEnvPrivateUpdateOptions,
  GroupCreateOptions,
  GroupUpdateOptions,
  GroupAutomationUpdateOptions,
  GroupAutomationManageOptions,
  GroupAutomationResetBaselineOptions,
  InboxListOptions,
  ContextSyncOptions,
  EventsStreamOptions,
  EventStreamItem,
} from './types.js';
import {
  DaemonAPIError,
  IncompatibleDaemonError,
} from './errors.js';
import {
  discoverEndpoint,
  callDaemon,
  openEventsStream,
  readLines,
} from './transport.js';

/**
 * CCCC 客户端
 */
export class CCCCClient {
  private readonly _endpoint: DaemonEndpoint;
  private readonly _timeoutMs: number;

  private constructor(endpoint: DaemonEndpoint, timeoutMs: number) {
    this._endpoint = endpoint;
    this._timeoutMs = timeoutMs;
  }

  /**
   * 异步工厂方法 - 创建客户端
   */
  static async create(options: CCCCClientOptions = {}): Promise<CCCCClient> {
    const endpoint = options.endpoint ?? await discoverEndpoint(options.ccccHome);
    const timeoutMs = options.timeoutMs ?? 30_000;
    return new CCCCClient(endpoint, timeoutMs);
  }

  /**
   * 获取当前端点
   */
  get endpoint(): DaemonEndpoint {
    return this._endpoint;
  }

  // ============================================================
  // 低级 API
  // ============================================================

  /**
   * 发送原始 IPC 请求，返回完整响应
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
   * 发送 IPC 请求，仅返回结果
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
    const ipcV = (pingResult['ipc_v'] as number) ?? 0;
    const capabilities = (pingResult['capabilities'] as Record<string, boolean>) ?? {};

    // 检查 IPC 版本
    const requiredV = options.requireIpcV ?? 1;
    if (ipcV < requiredV) {
      throw new IncompatibleDaemonError(`IPC version ${ipcV} < required ${requiredV}`);
    }

    // 检查能力
    for (const [cap, required] of Object.entries(options.requireCapabilities ?? {})) {
      if (required && !capabilities[cap]) {
        throw new IncompatibleDaemonError(`Missing capability: ${cap}`);
      }
    }

    // 检查操作支持（通过探测）
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

  /**
   * Ping 守护进程
   */
  async ping(): Promise<Record<string, unknown>> {
    return this.call('ping');
  }

  // ============================================================
  // 便利方法：Group 操作
  // ============================================================

  /**
   * 列出所有组
   */
  async groups(): Promise<Record<string, unknown>> {
    return this.call('groups');
  }

  /**
   * 查看组详情
   */
  async groupShow(groupId: string): Promise<Record<string, unknown>> {
    return this.call('group_show', { group_id: groupId });
  }

  /**
   * 创建组
   */
  async groupCreate(options: GroupCreateOptions = {}): Promise<Record<string, unknown>> {
    return this.call('group_create', {
      title: options.title ?? '',
      topic: options.topic ?? '',
      by: options.by ?? 'user',
    });
  }

  /**
   * 更新组
   */
  async groupUpdate(options: GroupUpdateOptions): Promise<Record<string, unknown>> {
    return this.call('group_update', {
      group_id: options.groupId,
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  /**
   * 删除组
   */
  async groupDelete(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_delete', { group_id: groupId, by });
  }

  /**
   * 使用组（设置活动作用域）
   */
  async groupUse(groupId: string, path: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_use', { group_id: groupId, path, by });
  }

  /**
   * 设置组状态
   */
  async groupSetState(groupId: string, state: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_set_state', { group_id: groupId, state, by });
  }

  /**
   * 更新组设置
   */
  async groupSettingsUpdate(
    groupId: string,
    patch: Record<string, unknown>,
    by = 'user'
  ): Promise<Record<string, unknown>> {
    return this.call('group_settings_update', { group_id: groupId, patch, by });
  }

  /**
   * 读取组级 Automation 状态（规则、片段、下次触发等）
   */
  async groupAutomationState(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_automation_state', { group_id: groupId, by });
  }

  /**
   * 全量更新组级 Automation（rules + snippets）
   */
  async groupAutomationUpdate(options: GroupAutomationUpdateOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
      ruleset: options.ruleset,
    };
    if (options.expectedVersion !== undefined) {
      args['expected_version'] = options.expectedVersion;
    }
    return this.call('group_automation_update', args);
  }

  /**
   * 增量管理组级 Automation（支持 simple op 或 actions[]）
   */
  async groupAutomationManage(options: GroupAutomationManageOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.expectedVersion !== undefined) args['expected_version'] = options.expectedVersion;
    if (options.op) args['op'] = options.op;
    if (options.rule) args['rule'] = options.rule;
    if (options.ruleId) args['rule_id'] = options.ruleId;
    if (options.ruleset) args['ruleset'] = options.ruleset;
    if (options.actions) args['actions'] = options.actions;
    return this.call('group_automation_manage', args);
  }

  /**
   * 将组级 Automation 重置为默认基线
   */
  async groupAutomationResetBaseline(options: GroupAutomationResetBaselineOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.expectedVersion !== undefined) {
      args['expected_version'] = options.expectedVersion;
    }
    return this.call('group_automation_reset_baseline', args);
  }

  /**
   * 启动组
   */
  async groupStart(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_start', { group_id: groupId, by });
  }

  /**
   * 停止组
   */
  async groupStop(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_stop', { group_id: groupId, by });
  }

  /**
   * 附加路径到组
   */
  async attach(path: string, groupId = '', by = 'user'): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = { path, by };
    if (groupId) args['group_id'] = groupId;
    return this.call('attach', args);
  }

  // ============================================================
  // 便利方法：Actor 操作
  // ============================================================

  /**
   * 列出组内的 Actor
   */
  async actorList(groupId: string): Promise<Record<string, unknown>> {
    return this.call('actor_list', { group_id: groupId });
  }

  /**
   * 添加 Actor
   */
  async actorAdd(options: ActorAddOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };

    if (options.actorId) args['actor_id'] = options.actorId;
    if (options.title) args['title'] = options.title;
    if (options.runtime) args['runtime'] = options.runtime;
    if (options.runner) args['runner'] = options.runner;
    if (options.command) args['command'] = options.command;
    if (options.env) args['env'] = options.env;
    if (options.envPrivate) args['env_private'] = options.envPrivate;
    if (options.defaultScopeKey) args['default_scope_key'] = options.defaultScopeKey;
    if (options.submit) args['submit'] = options.submit;

    return this.call('actor_add', args);
  }

  /**
   * 更新 Actor
   */
  async actorUpdate(options: ActorUpdateOptions): Promise<Record<string, unknown>> {
    return this.call('actor_update', {
      group_id: options.groupId,
      actor_id: options.actorId,
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  /**
   * 删除 Actor
   */
  async actorRemove(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_remove', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * 启动 Actor
   */
  async actorStart(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_start', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * 停止 Actor
   */
  async actorStop(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_stop', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * 重启 Actor
   */
  async actorRestart(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_restart', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * 列出 actor 私有环境变量 keys（不返回 values）
   */
  async actorEnvPrivateKeys(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_env_private_keys', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * 更新 actor 私有环境变量（runtime-only；values 永不回显）
   */
  async actorEnvPrivateUpdate(options: ActorEnvPrivateUpdateOptions): Promise<Record<string, unknown>> {
    return this.call('actor_env_private_update', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      set: options.set ?? undefined,
      unset: options.unset ?? undefined,
      clear: options.clear ?? false,
    });
  }

  // ============================================================
  // 便利方法：消息
  // ============================================================

  /**
   * 发送消息
   */
  async send(options: SendOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
    };

    if (options.to) args['to'] = options.to;
    if (options.path) args['path'] = options.path;

    return this.call('send', args);
  }

  /**
   * 跨组发送消息
   */
  async sendCrossGroup(options: SendCrossGroupOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      dst_group_id: options.dstGroupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
    };

    if (options.to) args['to'] = options.to;

    return this.call('send_cross_group', args);
  }

  /**
   * 回复消息
   */
  async reply(options: ReplyOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      reply_to: options.replyTo,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
    };

    if (options.to) args['to'] = options.to;

    return this.call('reply', args);
  }

  /**
   * 确认聊天消息
   */
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

  /**
   * 列出收件箱
   */
  async inboxList(options: InboxListOptions): Promise<Record<string, unknown>> {
    return this.call('inbox_list', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      limit: options.limit ?? 50,
      kind_filter: options.kindFilter ?? 'all',
    });
  }

  /**
   * 标记消息已读
   */
  async inboxMarkRead(
    groupId: string,
    actorId: string,
    eventId: string,
    by = 'user'
  ): Promise<Record<string, unknown>> {
    return this.call('inbox_mark_read', {
      group_id: groupId,
      actor_id: actorId,
      event_id: eventId,
      by,
    });
  }

  /**
   * 标记所有消息已读
   */
  async inboxMarkAllRead(
    groupId: string,
    actorId: string,
    by = 'user',
    kindFilter = 'all'
  ): Promise<Record<string, unknown>> {
    return this.call('inbox_mark_all_read', {
      group_id: groupId,
      actor_id: actorId,
      by,
      kind_filter: kindFilter,
    });
  }

  // ============================================================
  // 便利方法：通知
  // ============================================================

  /**
   * 确认通知
   */
  async notifyAck(
    groupId: string,
    actorId: string,
    notifyEventId: string,
    by?: string
  ): Promise<Record<string, unknown>> {
    return this.call('notify_ack', {
      group_id: groupId,
      actor_id: actorId,
      notify_event_id: notifyEventId,
      by: by ?? actorId,
    });
  }

  // ============================================================
  // 便利方法：Context
  // ============================================================

  /**
   * 获取组 Context
   */
  async contextGet(groupId: string): Promise<Record<string, unknown>> {
    return this.call('context_get', { group_id: groupId });
  }

  /**
   * 同步 Context
   */
  async contextSync(options: ContextSyncOptions): Promise<Record<string, unknown>> {
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
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };

    if (options.kinds) {
      args['kinds'] = options.kinds instanceof Set
        ? Array.from(options.kinds)
        : options.kinds;
    }
    if (options.sinceEventId) {
      args['since_event_id'] = options.sinceEventId;
    }
    if (options.sinceTs) {
      args['since_ts'] = options.sinceTs;
    }

    const request: DaemonRequest = {
      v: 1,
      op: 'events_stream',
      args,
    };

    const { socket, handshake, initialBuffer } = await openEventsStream(
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

    try {
      for await (const line of readLines(socket, initialBuffer)) {
        try {
          yield JSON.parse(line) as EventStreamItem;
        } catch {
          // 跳过无效 JSON
        }
      }
    } finally {
      socket.destroy();
    }
  }
}
