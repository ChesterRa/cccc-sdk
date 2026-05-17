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
  TrackedSendOptions,
  SendCrossGroupOptions,
  ReplyOptions,
  ActorAddOptions,
  ActorUpdateOptions,
  ActorEnvPrivateUpdateOptions,
  ActorProfileUpsertOptions,
  ActorProfileSecretUpdateOptions,
  ActorProfileSecretCopyFromActorOptions,
  ActorProfileSecretCopyFromProfileOptions,
  GroupCreateOptions,
  GroupUpdateOptions,
  CapabilityOverviewOptions,
  CapabilitySearchOptions,
  CapabilityEnableOptions,
  CapabilityBlockOptions,
  CapabilityStateOptions,
  CapabilityAllowlistGetOptions,
  CapabilityAllowlistValidateOptions,
  CapabilityAllowlistUpdateOptions,
  CapabilityAllowlistResetOptions,
  CapabilityImportOptions,
  CapabilityUninstallOptions,
  CapabilityToolCallOptions,
  GroupAutomationUpdateOptions,
  GroupAutomationManageOptions,
  GroupAutomationResetBaselineOptions,
  GroupSpaceStatusOptions,
  GroupSpaceSpacesOptions,
  GroupSpaceCapabilitiesOptions,
  GroupSpaceBindOptions,
  GroupSpaceIngestOptions,
  GroupSpaceQueryOptions,
  GroupSpaceSourcesOptions,
  GroupSpaceArtifactOptions,
  GroupSpaceJobsOptions,
  GroupSpaceSyncOptions,
  GroupSpaceProviderCredentialStatusOptions,
  GroupSpaceProviderCredentialUpdateOptions,
  GroupSpaceProviderHealthCheckOptions,
  GroupSpaceProviderAuthOptions,
  InboxListOptions,
  ContextSyncOptions,
  CoordinationBriefUpdateOptions,
  CoordinationNoteAddOptions,
  TaskCreateOptions,
  TaskUpdateOptions,
  TaskMoveOptions,
  TaskRestoreOptions,
  AgentStateUpdateOptions,
  AgentStateClearOptions,
  MetaMergeOptions,
  EventsStreamOptions,
  EventStreamItem,
  FileSendOptions,
  LedgerTailOptions,
  TerminalTailOptions,
  CCCSEvent,
  SendResult,
  SendAndWaitOptions,
  PingResult,
  GroupsResult,
  GroupShowResult,
  GroupCreateResult,
  ActorListResult,
  ActorAddResult,
  InboxListResult,
  ContextGetResult,
  CapabilityUseOptions,
  MemorySearchOptions,
  MemoryGetOptions,
} from './types.js';
import {
  DaemonAPIError,
  IncompatibleDaemonError,
  ErrorCodes,
} from './errors.js';
import { isStreamEvent } from './types.js';
import {
  discoverEndpoint,
  callDaemon,
  openEventsStream,
  readLines,
} from './transport.js';

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

/**
 * Client for communicating with the CCCC daemon over IPC (Unix socket or TCP).
 *
 * Use the async factory {@link CCCCClient.create} to instantiate:
 * ```ts
 * const client = await CCCCClient.create();
 * const result = await client.ping();
 * ```
 */
export class CCCCClient {
  private readonly _endpoint: DaemonEndpoint;
  private readonly _timeoutMs: number;

  private constructor(endpoint: DaemonEndpoint, timeoutMs: number) {
    this._endpoint = endpoint;
    this._timeoutMs = timeoutMs;
  }

  /**
   * Create a new client instance, auto-discovering the daemon endpoint.
   * @param options - Client configuration (ccccHome, endpoint override, timeout).
   * @returns A connected CCCCClient instance.
   * @throws {DaemonUnavailableError} If the daemon endpoint cannot be discovered.
   */
  static async create(options: CCCCClientOptions = {}): Promise<CCCCClient> {
    const endpoint = options.endpoint ?? await discoverEndpoint(options.ccccHome);
    const timeoutMs = options.timeoutMs ?? 30_000;
    return new CCCCClient(endpoint, timeoutMs);
  }

  /** The resolved daemon endpoint this client connects to. */
  get endpoint(): DaemonEndpoint {
    return this._endpoint;
  }

  // ============================================================
  // Low-level API
  // ============================================================

  /**
   * Send a raw IPC request and return the full daemon response envelope.
   * @param op - The IPC operation name (e.g. `'ping'`, `'send'`).
   * @param args - Operation arguments.
   * @returns The complete {@link DaemonResponse} including `ok`, `result`, and `error`.
   * @throws {DaemonAPIError} If the daemon returns `ok: false`.
   * @throws {DaemonUnavailableError} If the connection fails.
   */
  async callRaw(op: string, args?: Record<string, unknown>): Promise<DaemonResponse> {
    const request: DaemonRequest = {
      v: 1,
      op,
      args: args ?? {},
    };

    const response = await callDaemon(this._endpoint, request, this._timeoutMs);

    if (!response.ok) {
      throw new DaemonAPIError(
        response.error?.code ?? 'error',
        response.error?.message ?? 'daemon error',
        response.error?.details ?? {},
        response
      );
    }

    return response;
  }

  /**
   * Send an IPC request and return only the result payload.
   * @typeParam T - Expected result type (defaults to `Record<string, unknown>`).
   * @param op - The IPC operation name.
   * @param args - Operation arguments.
   * @returns The `result` field from the daemon response, cast to `T`.
   * @throws {DaemonAPIError} If the daemon returns an error.
   * @throws {DaemonUnavailableError} If the connection fails.
   */
  async call<T = Record<string, unknown>>(op: string, args?: Record<string, unknown>): Promise<T> {
    const response = await this.callRaw(op, args);
    return (response.result ?? {}) as T;
  }

  /**
   * Assert that the connected daemon meets the caller's compatibility requirements.
   * Checks IPC version, capabilities, and operation support by probing.
   * @param options - Required IPC version, capabilities, and operations.
   * @returns The ping result from the daemon.
   * @throws {IncompatibleDaemonError} If any compatibility check fails.
   * @throws {DaemonUnavailableError} If the connection fails.
   */
  async assertCompatible(options: CompatibilityOptions = {}): Promise<PingResult> {
    const pingResult = await this.ping();
    const ipcV = pingResult.ipc_v ?? 0;
    const capabilities = pingResult.capabilities ?? {};

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
        if (e instanceof DaemonAPIError && e.code === ErrorCodes.UNKNOWN_OP) {
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
   * Ping the daemon and return diagnostic information (ipc_v, capabilities, etc.).
   * @returns Daemon ping result.
   * @throws {DaemonUnavailableError} If the daemon is not reachable.
   */
  async ping(): Promise<PingResult> {
    return this.call<PingResult>('ping');
  }

  // ============================================================
  // Convenience methods: group operations
  // ============================================================

  /**
   * List all groups
   */
  async groups(): Promise<GroupsResult> {
    return this.call<GroupsResult>('groups');
  }

  /**
   * Show group details
   */
  async groupShow(groupId: string): Promise<GroupShowResult> {
    return this.call<GroupShowResult>('group_show', { group_id: groupId });
  }

  /**
   * Create group
   */
  async groupCreate(options: GroupCreateOptions = {}): Promise<GroupCreateResult> {
    return this.call<GroupCreateResult>('group_create', {
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
      throw new DaemonAPIError(ErrorCodes.INVALID_ARGS, 'groupAutomationManage requires a non-empty actions array', {});
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
  async actorList(groupId: string): Promise<ActorListResult> {
    return this.call<ActorListResult>('actor_list', { group_id: groupId });
  }

  /**
   * Add an actor to a group.
   * @param options - Actor configuration (id, runtime, runner, etc.).
   * @returns The daemon result (includes assigned actor id).
   * @throws {DaemonAPIError} On invalid group or duplicate actor id.
   */
  async actorAdd(options: ActorAddOptions): Promise<ActorAddResult> {
    const optionalFields: Record<string, unknown> = {
      actor_id: options.actorId,
      title: options.title,
      runtime: options.runtime,
      runner: options.runner,
      command: options.command,
      env: options.env,
      env_private: options.envPrivate,
      capability_autoload: options.capabilityAutoload,
      profile_id: options.profileId,
      default_scope_key: options.defaultScopeKey,
      submit: options.submit,
    };

    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    for (const [key, value] of Object.entries(optionalFields)) {
      if (value != null) args[key] = value;
    }

    return this.call<ActorAddResult>('actor_add', args);
  }

  /**
   * Update actor
   */
  async actorUpdate(options: ActorUpdateOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      actor_id: options.actorId,
      patch: options.patch ?? {},
      by: options.by ?? 'user',
    };
    if (options.profileId != null) args['profile_id'] = options.profileId;
    if (options.profileAction != null) args['profile_action'] = options.profileAction;
    return this.call('actor_update', args);
  }

  /**
   * Remove actor
   */
  async actorRemove(groupId: string, actorId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_remove', { group_id: groupId, actor_id: actorId, by });
  }

  /**
   * Start actor.
   * @param groupId - Group ID.
   * @param actorId - Actor ID.
   * @param options - Optional settings. Pass `{ idempotent: true }` to suppress errors when the actor is already running.
   * @returns The daemon result.
   * @throws {DaemonAPIError} On error (unless idempotent and actor already running).
   */
  async actorStart(
    groupId: string,
    actorId: string,
    options?: string | { by?: string; idempotent?: boolean }
  ): Promise<Record<string, unknown>> {
    const by = typeof options === 'string' ? options : (options?.by ?? 'user');
    const idempotent = typeof options === 'object' && options?.idempotent === true;

    try {
      return await this.call('actor_start', { group_id: groupId, actor_id: actorId, by });
    } catch (e) {
      if (idempotent && e instanceof DaemonAPIError && e.code === ErrorCodes.CONFLICT) {
        return {};
      }
      throw e;
    }
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
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      clear: options.clear ?? false,
    };
    if (options.set) args['set'] = options.set;
    if (options.unset) args['unset'] = options.unset;
    return this.call('actor_env_private_update', args);
  }

  /**
   * List global actor profiles.
   */
  async actorProfileList(by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_profile_list', { by });
  }

  /**
   * Get one actor profile and current usage.
   */
  async actorProfileGet(profileId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_profile_get', { profile_id: profileId, by });
  }

  /**
   * Create/update one actor profile.
   */
  async actorProfileUpsert(options: ActorProfileUpsertOptions): Promise<Record<string, unknown>> {
    const profile: Record<string, unknown> = { ...options.profile };
    if ('capabilityDefaults' in profile) {
      const rawDefaults = profile['capabilityDefaults'];
      delete profile['capabilityDefaults'];
      if (rawDefaults != null && typeof rawDefaults === 'object' && !Array.isArray(rawDefaults)) {
        const defaults = rawDefaults as Record<string, unknown>;
        profile['capability_defaults'] = {
          ...(defaults['autoloadCapabilities'] !== undefined
            ? { autoload_capabilities: defaults['autoloadCapabilities'] }
            : {}),
          ...(defaults['defaultScope'] !== undefined
            ? { default_scope: defaults['defaultScope'] }
            : {}),
          ...(defaults['sessionTtlSeconds'] !== undefined
            ? { session_ttl_seconds: defaults['sessionTtlSeconds'] }
            : {}),
        };
      } else {
        profile['capability_defaults'] = rawDefaults;
      }
    }
    const args: Record<string, unknown> = {
      profile,
      by: options.by ?? 'user',
    };
    if (options.expectedRevision !== undefined) args['expected_revision'] = options.expectedRevision;
    return this.call('actor_profile_upsert', args);
  }

  /**
   * Delete one actor profile (rejected when still in use).
   */
  async actorProfileDelete(profileId: string, by = 'user', forceDetach = false): Promise<Record<string, unknown>> {
    return this.call('actor_profile_delete', { profile_id: profileId, by, force_detach: forceDetach });
  }

  /**
   * List profile-level secret keys and masked previews.
   */
  async actorProfileSecretKeys(profileId: string, by = 'user'): Promise<Record<string, unknown>> {
    return this.call('actor_profile_secret_keys', { profile_id: profileId, by });
  }

  /**
   * Update profile-level private env.
   */
  async actorProfileSecretUpdate(options: ActorProfileSecretUpdateOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      profile_id: options.profileId,
      by: options.by ?? 'user',
      clear: options.clear ?? false,
    };
    if (options.set) args['set'] = options.set;
    if (options.unset) args['unset'] = options.unset;
    return this.call('actor_profile_secret_update', args);
  }

  /**
   * Copy one actor's runtime env (public + private) into a profile's private env.
   */
  async actorProfileSecretCopyFromActor(options: ActorProfileSecretCopyFromActorOptions): Promise<Record<string, unknown>> {
    return this.call('actor_profile_secret_copy_from_actor', {
      profile_id: options.profileId,
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
    });
  }

  /**
   * Copy one profile's secrets into another profile.
   */
  async actorProfileSecretCopyFromProfile(
    options: ActorProfileSecretCopyFromProfileOptions
  ): Promise<Record<string, unknown>> {
    return this.call('actor_profile_secret_copy_from_profile', {
      profile_id: options.profileId,
      source_profile_id: options.sourceProfileId,
      by: options.by ?? 'user',
    });
  }

  // ============================================================
  // Convenience methods: capabilities
  // ============================================================

  /**
   * Read the global capability overview snapshot.
   */
  async capabilityOverview(options: CapabilityOverviewOptions = {}): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {};
    if (options.query) args['query'] = options.query;
    if (options.limit !== undefined) args['limit'] = options.limit;
    if (options.includeIndexed !== undefined) args['include_indexed'] = options.includeIndexed;
    return this.call('capability_overview', args);
  }

  /**
   * Search the capability registry for one group/caller scope.
   */
  async capabilitySearch(options: CapabilitySearchOptions = {}): Promise<Record<string, unknown>> {
    return this.call('capability_search', compactRecord({
      group_id: options.groupId,
      by: options.by,
      actor_id: options.actorId,
      query: options.query,
      kind: options.kind,
      source_id: options.sourceId,
      trust_tier: options.trustTier,
      qualification_status: options.qualificationStatus,
      include_external: options.includeExternal,
      limit: options.limit,
    }));
  }

  /**
   * Enable or disable a capability.
   */
  async capabilityEnable(options: CapabilityEnableOptions): Promise<Record<string, unknown>> {
    return this.call('capability_enable', compactRecord({
      group_id: options.groupId,
      capability_id: options.capabilityId,
      scope: options.scope,
      enabled: options.enabled,
      cleanup: options.cleanup,
      by: options.by,
      reason: options.reason,
      ttl_seconds: options.ttlSeconds,
      actor_id: options.actorId,
    }));
  }

  /**
   * Block or unblock a capability.
   */
  async capabilityBlock(options: CapabilityBlockOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      capability_id: options.capabilityId,
      scope: options.scope ?? 'group',
      blocked: options.blocked ?? true,
      by: options.by ?? 'user',
    };
    if (options.ttlSeconds !== undefined) args['ttl_seconds'] = options.ttlSeconds;
    if (options.reason) args['reason'] = options.reason;
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_block', args);
  }

  /**
   * Read effective capability exposure for one caller scope.
   */
  async capabilityState(
    options: CapabilityStateOptions | string = {},
    actorId?: string
  ): Promise<Record<string, unknown>> {
    const args = typeof options === 'string'
      ? { group_id: options, actor_id: actorId }
      : {
          group_id: options.groupId,
          by: options.by,
          actor_id: options.actorId,
        };
    return this.call('capability_state', compactRecord(args));
  }

  /**
   * Read capability allowlist default, overlay, and effective snapshots.
   */
  async capabilityAllowlistGet(options: CapabilityAllowlistGetOptions = {}): Promise<Record<string, unknown>> {
    return this.call('capability_allowlist_get', {
      by: options.by ?? 'user',
    });
  }

  /**
   * Dry-run capability allowlist overlay validation without persistence.
   */
  async capabilityAllowlistValidate(
    options: CapabilityAllowlistValidateOptions = {}
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      mode: options.mode ?? 'patch',
    };
    if (options.patch !== undefined) args['patch'] = options.patch;
    if (options.overlay !== undefined) args['overlay'] = options.overlay;
    return this.call('capability_allowlist_validate', args);
  }

  /**
   * Persist capability allowlist overlay with optional optimistic concurrency.
   */
  async capabilityAllowlistUpdate(
    options: CapabilityAllowlistUpdateOptions = {}
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      by: options.by ?? 'user',
      mode: options.mode ?? 'patch',
    };
    if (options.expectedRevision) args['expected_revision'] = options.expectedRevision;
    if (options.patch !== undefined) args['patch'] = options.patch;
    if (options.overlay !== undefined) args['overlay'] = options.overlay;
    return this.call('capability_allowlist_update', args);
  }

  /**
   * Reset capability allowlist overlay to empty/default state.
   */
  async capabilityAllowlistReset(options: CapabilityAllowlistResetOptions = {}): Promise<Record<string, unknown>> {
    return this.call('capability_allowlist_reset', {
      by: options.by ?? 'user',
    });
  }

  /**
   * Import one structured capability record, with optional readiness probe.
   */
  async capabilityImport(options: CapabilityImportOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      record: options.record,
      by: options.by ?? 'user',
      dry_run: options.dryRun ?? false,
    };
    if (options.actorId) args['actor_id'] = options.actorId;
    if (options.probe !== undefined) args['probe'] = options.probe;
    if (options.enableAfterImport !== undefined) args['enable_after_import'] = options.enableAfterImport;
    if (options.scope) args['scope'] = options.scope;
    if (options.ttlSeconds !== undefined) args['ttl_seconds'] = options.ttlSeconds;
    if (options.reason) args['reason'] = options.reason;
    return this.call('capability_import', args);
  }

  /**
   * Uninstall a capability from the target group scope.
   */
  async capabilityUninstall(options: CapabilityUninstallOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      capability_id: options.capabilityId,
      by: options.by ?? 'user',
    };
    if (options.reason) args['reason'] = options.reason;
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_uninstall', args);
  }

  /**
   * Call one enabled dynamic capability tool through daemon IPC.
   */
  async capabilityToolCall(options: CapabilityToolCallOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      tool_name: options.toolName,
      by: options.by ?? 'user',
    };
    if (options.arguments) args['arguments'] = options.arguments;
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_tool_call', args);
  }

  // ============================================================
  // Convenience methods: messaging
  // ============================================================

  /**
   * Send a chat message to a group.
   * @param options - Message content, recipients, and priority.
   * @returns The created event and optional ack event.
   * @throws {DaemonAPIError} On invalid group, missing permissions, etc.
   */
  async send(options: SendOptions): Promise<SendResult> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;
    if (options.path) args['path'] = options.path;

    return this.call<SendResult>('send', args);
  }

  /**
   * Send message across groups.
   * @returns The created event and optional ack event.
   */
  async sendCrossGroup(options: SendCrossGroupOptions): Promise<SendResult> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      dst_group_id: options.dstGroupId,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;

    return this.call<SendResult>('send_cross_group', args);
  }

  /**
   * Create a durable task and send one linked visible message.
   */
  async trackedSend(options: TrackedSendOptions): Promise<Record<string, unknown>> {
    const args = compactRecord({
      group_id: options.groupId,
      title: options.title,
      text: options.text,
      outcome: options.outcome,
      assignee: options.assignee,
      handoff_to: options.handoffTo,
      waiting_on: options.waitingOn,
      checklist: options.checklist,
      notes: options.notes,
      by: options.by ?? 'user',
      to: options.to,
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? true,
      path: options.path,
    });
    return this.call('tracked_send', args);
  }

  /**
   * Reply to a message.
   * @returns The created event and optional ack event.
   */
  async reply(options: ReplyOptions): Promise<SendResult> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      reply_to: options.replyTo,
      text: options.text,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };

    if (options.to) args['to'] = options.to;

    return this.call<SendResult>('reply', args);
  }

  /**
   * Send a message and wait for a reply to it.
   * Opens the event stream **before** sending to avoid race conditions,
   * then yields control to the stream until a matching reply arrives.
   *
   * @param options - Send options plus `listenAs` (the actor to listen as) and optional `waitTimeoutMs`.
   * @returns The reply event (a `chat.message` whose `reply_to` matches the sent event ID).
   * @throws {DaemonAPIError} On send/stream errors.
   * @throws {Error} If the timeout elapses or the signal is aborted before a reply arrives.
   */
  async sendAndWaitForReply(options: SendAndWaitOptions): Promise<CCCSEvent> {
    const waitTimeout = options.waitTimeoutMs ?? 60_000;
    const deadline = Date.now() + waitTimeout;

    // Open stream FIRST (with sinceTs = now) to avoid missing replies
    // that arrive between send() returning and stream connecting.
    const stream = this.eventsStream({
      groupId: options.groupId,
      by: options.listenAs,
      kinds: ['chat.message'],
      sinceTs: new Date().toISOString(),
      signal: options.signal,
    });
    let nextItem = stream.next();

    // Now send the message
    const sendResult = await this.send(options);
    const sentEventId = sendResult.event.id;

    try {
      while (true) {
        if (options.signal?.aborted) {
          throw new Error('sendAndWaitForReply aborted');
        }
        if (Date.now() > deadline) {
          throw new Error(`sendAndWaitForReply timed out after ${waitTimeout}ms`);
        }
        const { value: item, done } = await nextItem;
        if (done) break;
        nextItem = stream.next();
        if (isStreamEvent(item)) {
          const evt = item.event;
          if (evt.kind === 'chat.message') {
            const data = evt.data as Record<string, unknown>;
            if (data['reply_to'] === sentEventId) {
              return evt;
            }
          }
        }
      }
    } finally {
      await stream.return(undefined as unknown as EventStreamItem);
    }

    throw new Error('sendAndWaitForReply: stream ended without reply');
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

  /**
   * Send a file as a chat attachment.
   * @param options - File path (relative to scope root), optional caption and recipients.
   * @returns The created event and optional ack event.
   */
  async fileSend(options: FileSendOptions): Promise<SendResult> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      path: options.path,
      by: options.by ?? 'user',
      priority: options.priority ?? 'normal',
      reply_required: options.replyRequired ?? false,
    };
    if (options.text) args['text'] = options.text;
    if (options.to) args['to'] = options.to;
    return this.call<SendResult>('file_send', args);
  }

  /**
   * Get recent chat messages from the ledger.
   * @param options - Group ID, limit, and max chars.
   * @returns The ledger tail result.
   */
  async ledgerTail(options: LedgerTailOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.limit !== undefined) args['limit'] = options.limit;
    if (options.maxChars !== undefined) args['max_chars'] = options.maxChars;
    return this.call('ledger_tail', args);
  }

  /**
   * Get recent terminal output from an actor.
   * @param options - Group ID, actor ID, and line count.
   * @returns The terminal tail result.
   */
  async terminalTail(options: TerminalTailOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
    };
    if (options.lines !== undefined) args['lines'] = options.lines;
    return this.call('terminal_tail', args);
  }

  // ============================================================
  // Convenience methods: inbox
  // ============================================================

  /**
   * List inbox
   */
  async inboxList(options: InboxListOptions): Promise<InboxListResult> {
    return this.call<InboxListResult>('inbox_list', {
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
  async contextGet(groupId: string): Promise<ContextGetResult> {
    return this.call<ContextGetResult>('context_get', { group_id: groupId });
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

  private contextOp(
    groupId: string,
    op: Record<string, unknown>,
    by = 'system',
    dryRun = false
  ): Promise<Record<string, unknown>> {
    return this.contextSync({ groupId, by, dryRun, ops: [op] });
  }

  /** Update the shared coordination brief (Context Ops v3). */
  async coordinationBriefUpdate(options: CoordinationBriefUpdateOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'coordination.brief.update',
      objective: options.objective,
      current_focus: options.currentFocus,
      constraints: options.constraints,
      project_brief: options.projectBrief,
      project_brief_stale: options.projectBriefStale,
    }), options.by, options.dryRun);
  }

  /** Add a compact coordination decision or handoff note. */
  async coordinationNoteAdd(options: CoordinationNoteAddOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'coordination.note.add',
      kind: options.kind,
      summary: options.summary,
      task_id: options.taskId,
    }), options.by, options.dryRun);
  }

  /** Create a Context Ops v3 task. */
  async taskCreate(options: TaskCreateOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'task.create',
      title: options.title,
      outcome: options.outcome,
      status: options.status,
      parent_id: options.parentId,
      assignee: options.assignee,
      priority: options.priority,
      blocked_by: options.blockedBy,
      waiting_on: options.waitingOn,
      handoff_to: options.handoffTo,
      task_type: options.taskType,
      notes: options.notes,
      checklist: options.checklist,
    }), options.by, options.dryRun);
  }

  /** Update a Context Ops v3 task. */
  async taskUpdate(options: TaskUpdateOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'task.update',
      task_id: options.taskId,
      title: options.title,
      outcome: options.outcome,
      status: options.status,
      assignee: options.assignee,
      priority: options.priority,
      blocked_by: options.blockedBy,
      waiting_on: options.waitingOn,
      handoff_to: options.handoffTo,
      notes: options.notes,
      checklist: options.checklist,
    }), options.by, options.dryRun);
  }

  /** Move a task through the canonical lifecycle operation. */
  async taskMove(options: TaskMoveOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'task.move',
      task_id: options.taskId,
      status: options.status,
    }, options.by, options.dryRun);
  }

  /** Restore an archived task. */
  async taskRestore(options: TaskRestoreOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'task.restore',
      task_id: options.taskId,
    }, options.by, options.dryRun);
  }

  /** Update per-actor working memory. */
  async agentStateUpdate(options: AgentStateUpdateOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'agent_state.update',
      actor_id: options.actorId,
      active_task_id: options.activeTaskId,
      focus: options.focus,
      next_action: options.nextAction,
      what_changed: options.whatChanged,
      blockers: options.blockers,
      open_loops: options.openLoops,
      commitments: options.commitments,
      environment_summary: options.environmentSummary,
      user_model: options.userModel,
      persona_notes: options.personaNotes,
      resume_hint: options.resumeHint,
    }), options.by, options.dryRun);
  }

  /** Clear per-actor working memory. */
  async agentStateClear(options: AgentStateClearOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'agent_state.clear',
      actor_id: options.actorId,
    }, options.by, options.dryRun);
  }

  /** Merge restricted projection metadata. */
  async metaMerge(options: MetaMergeOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'meta.merge',
      data: options.data,
    }, options.by, options.dryRun);
  }

  // ============================================================
  // Convenience methods: capability use and memory
  // ============================================================

  async capabilityUse(options: CapabilityUseOptions): Promise<Record<string, unknown>> {
    const enableResult = await this.capabilityEnable(options);
    if (!options.toolName) return enableResult;
    return this.call('capability_tool_call', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by,
      tool_name: options.toolName,
      arguments: options.toolArguments ?? {},
    }));
  }

  async memorySearch(options: MemorySearchOptions): Promise<Record<string, unknown>> {
    return this.call('memory_reme_search', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      query: options.query,
      max_results: options.maxResults ?? options.limit,
      vector_weight: options.vectorWeight,
      candidate_multiplier: options.candidateMultiplier,
      min_score: options.minScore,
      sources: options.sources,
    }));
  }

  async memoryGet(options: MemoryGetOptions): Promise<Record<string, unknown>> {
    return this.call('memory_reme_get', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      path: options.path,
      offset: options.offset,
      limit: options.limit,
    }));
  }

  // ============================================================
  // Convenience methods: Group Space
  // ============================================================

  /**
   * Read Group Space provider and binding status.
   */
  async groupSpaceStatus(options: GroupSpaceStatusOptions): Promise<Record<string, unknown>> {
    return this.call('group_space_status', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  }

  /**
   * List available remote spaces for binding.
   */
  async groupSpaceSpaces(options: GroupSpaceSpacesOptions): Promise<Record<string, unknown>> {
    return this.call('group_space_spaces', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  }

  /**
   * Read the provider capability matrix for a group.
   */
  async groupSpaceCapabilities(options: GroupSpaceCapabilitiesOptions): Promise<Record<string, unknown>> {
    return this.call('group_space_capabilities', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
    });
  }

  /**
   * Bind or unbind one Group Space lane.
   */
  async groupSpaceBind(options: GroupSpaceBindOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'bind',
      by: options.by ?? 'user',
    };
    if (options.remoteSpaceId) args['remote_space_id'] = options.remoteSpaceId;
    return this.call('group_space_bind', args);
  }

  /**
   * Enqueue one Group Space ingest action.
   */
  async groupSpaceIngest(options: GroupSpaceIngestOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      kind: options.kind ?? 'context_sync',
      by: options.by ?? 'user',
    };
    if (options.payload) args['payload'] = options.payload;
    if (options.idempotencyKey) args['idempotency_key'] = options.idempotencyKey;
    return this.call('group_space_ingest', args);
  }

  /**
   * Query Group Space knowledge for one lane.
   */
  async groupSpaceQuery(options: GroupSpaceQueryOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      query: options.query,
    };
    if (options.options) args['options'] = options.options;
    return this.call('group_space_query', args);
  }

  /**
   * Manage remote sources in the bound Group Space lane.
   */
  async groupSpaceSources(options: GroupSpaceSourcesOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.sourceId) args['source_id'] = options.sourceId;
    if (options.newTitle) args['new_title'] = options.newTitle;
    return this.call('group_space_sources', args);
  }

  /**
   * List, generate, or download Group Space artifacts.
   */
  async groupSpaceArtifact(options: GroupSpaceArtifactOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.kind) args['kind'] = options.kind;
    if (options.options) args['options'] = options.options;
    if (options.wait !== undefined) args['wait'] = options.wait;
    if (options.saveToSpace !== undefined) args['save_to_space'] = options.saveToSpace;
    if (options.outputPath) args['output_path'] = options.outputPath;
    if (options.outputFormat) args['output_format'] = options.outputFormat;
    if (options.artifactId) args['artifact_id'] = options.artifactId;
    if (options.timeoutSeconds !== undefined) args['timeout_seconds'] = options.timeoutSeconds;
    if (options.initialInterval !== undefined) args['initial_interval'] = options.initialInterval;
    if (options.maxInterval !== undefined) args['max_interval'] = options.maxInterval;
    return this.call('group_space_artifact', args);
  }

  /**
   * List or manage Group Space jobs.
   */
  async groupSpaceJobs(options: GroupSpaceJobsOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'list',
      by: options.by ?? 'user',
    };
    if (options.jobId) args['job_id'] = options.jobId;
    if (options.state) args['state'] = options.state;
    if (options.limit !== undefined) args['limit'] = options.limit;
    return this.call('group_space_jobs', args);
  }

  /**
   * Read or run Group Space synchronization for one lane.
   */
  async groupSpaceSync(options: GroupSpaceSyncOptions): Promise<Record<string, unknown>> {
    return this.call('group_space_sync', {
      group_id: options.groupId,
      provider: options.provider ?? 'notebooklm',
      lane: options.lane,
      action: options.action ?? 'status',
      force: options.force ?? false,
      by: options.by ?? 'user',
    });
  }

  /**
   * Read provider credential status.
   */
  async groupSpaceProviderCredentialStatus(
    options: GroupSpaceProviderCredentialStatusOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.call('group_space_provider_credential_status', {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
    });
  }

  /**
   * Update provider credentials.
   */
  async groupSpaceProviderCredentialUpdate(
    options: GroupSpaceProviderCredentialUpdateOptions = {}
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
      clear: options.clear ?? false,
    };
    if (options.authJson) args['auth_json'] = options.authJson;
    return this.call('group_space_provider_credential_update', args);
  }

  /**
   * Run provider health check.
   */
  async groupSpaceProviderHealthCheck(
    options: GroupSpaceProviderHealthCheckOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.call('group_space_provider_health_check', {
      provider: options.provider ?? 'notebooklm',
      by: options.by ?? 'user',
    });
  }

  /**
   * Control provider auth flow.
   */
  async groupSpaceProviderAuth(options: GroupSpaceProviderAuthOptions = {}): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      provider: options.provider ?? 'notebooklm',
      action: options.action ?? 'status',
      by: options.by ?? 'user',
    };
    if (options.timeoutSeconds !== undefined) args['timeout_seconds'] = options.timeoutSeconds;
    return this.call('group_space_provider_auth', args);
  }

  // ============================================================
  // Event stream
  // ============================================================

  /**
   * Subscribe to the group event stream (Server-Sent Events style, long-lived connection).
   * Yields {@link EventStreamItem} objects as they arrive. The socket is destroyed
   * when the generator is returned or thrown.
   * @param options - Group ID, event filters, optional since cursor, and optional AbortSignal.
   * @yields {EventStreamItem} Each event or heartbeat from the stream.
   * @throws {DaemonAPIError} If the handshake fails.
   */
  async *eventsStream(options: EventsStreamOptions): AsyncGenerator<EventStreamItem> {
    // Check abort before connecting
    if (options.signal?.aborted) return;

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

    // Wire up AbortSignal to destroy the socket
    const onAbort = () => { socket.destroy(); };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      for await (const line of readLines(socket, initialBuffer)) {
        if (options.signal?.aborted) return;

        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          // Non-JSON line from daemon; surface as an error so callers know
          // something unexpected happened instead of silently losing data.
          throw new DaemonAPIError(
            'invalid_stream_data',
            `Unparseable event stream line: ${line.slice(0, 200)}`,
            {}
          );
        }

        if (parsed !== null && typeof parsed === 'object') {
          const obj = parsed as Record<string, unknown>;
          // Daemon may send error objects in the stream (ok: false).
          if ('ok' in obj && obj['ok'] === false) {
            const err = obj['error'] as Record<string, unknown> | undefined;
            throw new DaemonAPIError(
              (err?.['code'] as string) ?? 'stream_error',
              (err?.['message'] as string) ?? 'Daemon sent error in event stream',
              (err?.['details'] as Record<string, unknown>) ?? {},
              obj as unknown as DaemonResponse
            );
          }
          if ('t' in obj) {
            yield parsed as EventStreamItem;
          }
        }
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      socket.destroy();
    }
  }
}
