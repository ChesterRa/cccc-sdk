/**
 * CCCC SDK client
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
 * CCCC client
 */
export class CCCCClient {
  private readonly _endpoint: DaemonEndpoint;
  private readonly _timeoutMs: number;

  private constructor(endpoint: DaemonEndpoint, timeoutMs: number) {
    this._endpoint = endpoint;
    this._timeoutMs = timeoutMs;
  }

  /**
   * Async factory method: create a client instance
   */
  static async create(options: CCCCClientOptions = {}): Promise<CCCCClient> {
    const endpoint = options.endpoint ?? await discoverEndpoint(options.ccccHome);
    const timeoutMs = options.timeoutMs ?? 30_000;
    return new CCCCClient(endpoint, timeoutMs);
  }

  /**
   * Get the current endpoint
   */
  get endpoint(): DaemonEndpoint {
    return this._endpoint;
  }

  // ============================================================
  // Low-level API
  // ============================================================

  /**
   * Send raw IPC request and return the full response
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
   * Send IPC request and return only result payload
   */
  async call(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.callRaw(op, args);
    return response.result ?? {};
  }

  /**
   * Compatibility check
   */
  async assertCompatible(options: CompatibilityOptions = {}): Promise<Record<string, unknown>> {
    const pingResult = await this.ping();
    const ipcV = (pingResult['ipc_v'] as number) ?? 0;
    const capabilities = (pingResult['capabilities'] as Record<string, boolean>) ?? {};

    // Check IPC version
    const requiredV = options.requireIpcV ?? 1;
    if (ipcV < requiredV) {
      throw new IncompatibleDaemonError(`IPC version ${ipcV} < required ${requiredV}`);
    }

    // Check capabilities
    for (const [cap, required] of Object.entries(options.requireCapabilities ?? {})) {
      if (required && !capabilities[cap]) {
        throw new IncompatibleDaemonError(`Missing capability: ${cap}`);
      }
    }

    // Check operation support by probing
    const reservedOps = new Set(['ping', 'shutdown', 'events_stream', 'term_attach']);
    for (const op of options.requireOps ?? []) {
      if (reservedOps.has(op)) continue;
      try {
        await this.callRaw(op, {});
      } catch (e) {
        if (e instanceof DaemonAPIError && e.code === 'unknown_op') {
          throw new IncompatibleDaemonError(`Operation not supported: ${op}`);
        }
        // Other errors (e.g. missing_group_id) imply the operation exists.
      }
    }

    return pingResult;
  }

  // ============================================================
  // Convenience methods: diagnostics
  // ============================================================

  /**
   * Ping daemon
   */
  async ping(): Promise<Record<string, unknown>> {
    return this.call('ping');
  }

  // ============================================================
  // Convenience methods: group operations
  // ============================================================

  /**
   * List all groups
   */
  async groups(): Promise<Record<string, unknown>> {
    return this.call('groups');
  }

  /**
   * Show group details
   */
  async groupShow(groupId: string): Promise<Record<string, unknown>> {
    return this.call('group_show', { group_id: groupId });
  }

  /**
   * Create group
   */
  async groupCreate(options: GroupCreateOptions = {}): Promise<Record<string, unknown>> {
    return this.call('group_create', {
      title: options.title ?? '',
      topic: options.topic ?? '',
      by: options.by ?? 'user',
    });
  }

  /**
   * Update group
   */
  async groupUpdate(options: GroupUpdateOptions): Promise<Record<string, unknown>> {
    return this.call('group_update', {
      group_id: options.groupId,
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  /**
   * Delete group
   */
  async groupDelete(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_delete', { group_id: groupId, by });
  }

  /**
   * Use group (set active scope)
   */
  async groupUse(groupId: string, path: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_use', { group_id: groupId, path, by });
  }

  /**
   * Set group state
   */
  async groupSetState(groupId: string, state: 'active' | 'idle' | 'paused', by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_set_state', { group_id: groupId, state, by });
  }

  /**
   * Update group settings
   */
  async groupSettingsUpdate(
    groupId: string,
    patch: Record<string, unknown>,
    by = 'user'
  ): Promise<Record<string, unknown>> {
    return this.call('group_settings_update', { group_id: groupId, patch, by });
  }

  /**
   * Read group-level automation state (rules, snippets, next run, ...)
   */
  async groupAutomationState(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_automation_state', { group_id: groupId, by });
  }

  /**
   * Replace group-level automation (rules + snippets)
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
   * Incrementally manage group-level automation (actions[])
   */
  async groupAutomationManage(options: GroupAutomationManageOptions): Promise<Record<string, unknown>> {
    const actions = options.actions;
    if (actions.length === 0) {
      throw new Error('groupAutomationManage requires a non-empty actions array');
    }
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
      actions,
    };
    if (options.expectedVersion !== undefined) args['expected_version'] = options.expectedVersion;
    return this.call('group_automation_manage', args);
  }

  /**
   * Reset group-level automation to baseline
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
   * Start group
   */
  async groupStart(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_start', { group_id: groupId, by });
  }

  /**
   * Stop group
   */
  async groupStop(groupId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('group_stop', { group_id: groupId, by });
  }

  /**
   * Attach path to group
   */
  async attach(path: string, groupId = '', by = 'user'): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = { path, by };
    if (groupId) args['group_id'] = groupId;
    return this.call('attach', args);
  }

  // ============================================================
  // Convenience methods: actor operations
  // ============================================================

  /**
   * List actors in group
   */
  async actorList(groupId: string): Promise<Record<string, unknown>> {
    return this.call('actor_list', { group_id: groupId });
  }

  /**
   * Add actor
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
   * Update actor
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
   * Remove actor
   */
  async actorRemove(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_remove', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * Start actor
   */
  async actorStart(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_start', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * Stop actor
   */
  async actorStop(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_stop', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * Restart actor
   */
  async actorRestart(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_restart', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * List actor private env keys (without values)
   */
  async actorEnvPrivateKeys(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_env_private_keys', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * Update actor private env vars (runtime-only; values are never echoed)
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
  // Convenience methods: messaging
  // ============================================================

  /**
   * Send message
   */
  async send(options: SendOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;
    if (options.path) args['path'] = options.path;

    return this.call('send', args);
  }

  /**
   * Send message across groups
   */
  async sendCrossGroup(options: SendCrossGroupOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      dst_group_id: options.dstGroupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;

    return this.call('send_cross_group', args);
  }

  /**
   * Reply message
   */
  async reply(options: ReplyOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      reply_to: options.replyTo,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;

    return this.call('reply', args);
  }

  /**
   * Acknowledge chat message
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
  // Convenience methods: inbox
  // ============================================================

  /**
   * List inbox
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
   * Mark message as read
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
   * Mark all messages as read
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
  // Convenience methods: notifications
  // ============================================================

  /**
   * Acknowledge notification
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
  // Convenience methods: context
  // ============================================================

  /**
   * Get group context
   */
  async contextGet(groupId: string): Promise<Record<string, unknown>> {
    return this.call('context_get', { group_id: groupId });
  }

  /**
   * Sync context
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
  // Event stream
  // ============================================================

  /**
   * Subscribe to event stream
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
          // Skip invalid JSON lines.
        }
      }
    } finally {
      socket.destroy();
    }
  }
}
