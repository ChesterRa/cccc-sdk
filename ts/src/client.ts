/**
 * CCCC SDK client
 */

import type {
  DaemonEndpoint,
  DaemonRequest,
  DaemonResponse,
  CCCCClientOptions,
  CompatibilityOptions,
  ActorAddOptions,
  ActorUpdateOptions,
  GroupResetOptions,
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
  CapabilityVisibilityOptions,
  CapabilityInstallTargetOptions,
  CapabilitySourceDeleteOptions,
  GroupAutomationUpdateOptions,
  GroupAutomationManageOptions,
  GroupAutomationResetBaselineOptions,
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
  MemoryWriteOptions,
  MemoryHealthOptions,
  MemoryProfileGetOptions,
  MemoryRemeSearchOptions,
  MemoryRemeGetOptions,
  TrackedSendOptions,
  TaskListOptions,
  HeadlessStatusOptions,
  HeadlessSetStatusOptions,
  HeadlessAckMessageOptions,
  GroupCopyExportOptions,
  GroupCopyPreviewImportOptions,
  GroupCopyImportOptions,
  PresentationGetOptions,
  PresentationPublishOptions,
  PresentationClearOptions,
  PresentationBrowserOpenOptions,
  PresentationBrowserInfoOptions,
  PresentationBrowserCloseOptions,
  AssistantStateOptions,
  AssistantVoiceRecordingLeaseOptions,
  AssistantSettingsUpdateOptions,
  AssistantStatusUpdateOptions,
  ObservabilityUpdateOptions,
  BrandingUpdateOptions,
  DebugSnapshotOptions,
  DebugTailLogsOptions,
  DebugClearLogsOptions,
  TerminalTailOptions,
  TerminalHistoryOptions,
  TerminalClearOptions,
  LedgerSnapshotOptions,
  LedgerCompactOptions,
  StreamEmitOptions,
  SystemNotifyOptions,
  RegistryReconcileOptions,
  GroupDetachScopeOptions,
  RuntimeHermesPrepareOptions,
  RuntimeHermesMcpTestOptions,
} from './types.js';
import {
  DaemonAPIError,
  IncompatibleDaemonError,
} from './errors.js';
import { isStreamEvent } from './types.js';
import {
  discoverEndpoint,
  callDaemon,
  openEventsStream,
  readLines,
} from './transport.js';
import { installCCCC0430Ops, type CCCC0430Ops } from './client_0430_ops.js';
import { installGroupSpaceOps, type GroupSpaceOps } from './client_group_space_ops.js';
import { installChatOps, type ChatOps } from './client_chat_ops.js';

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

    if (!response.ok && response.error) {
      throw new DaemonAPIError(
        response.error.code ?? 'error',
        response.error.message ?? 'daemon error',
        response.error.details ?? {},
        response
      );
    }

    return response;
  }

  /**
   * Send an IPC request and return only the result payload.
   * @param op - The IPC operation name.
   * @param args - Operation arguments.
   * @returns The `result` field from the daemon response (empty object if absent).
   * @throws {DaemonAPIError} If the daemon returns an error.
   * @throws {DaemonUnavailableError} If the connection fails.
   */
  async call(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.callRaw(op, args);
    return response.result ?? {};
  }

  /**
   * Assert that the connected daemon meets the caller's compatibility requirements.
   * Checks IPC version, capabilities, and operation support by probing.
   * @param options - Required IPC version, capabilities, and operations.
   * @returns The ping result from the daemon.
   * @throws {IncompatibleDaemonError} If any compatibility check fails.
   * @throws {DaemonUnavailableError} If the connection fails.
   */
  async assertCompatible(options: CompatibilityOptions = {}): Promise<Record<string, unknown>> {
    const pingResult = await this.ping();
    const rawIpcV = pingResult['ipc_v'];
    const ipcV = typeof rawIpcV === 'number' ? rawIpcV : 0;
    const rawCaps = pingResult['capabilities'];
    const capabilities = (rawCaps !== null && typeof rawCaps === 'object' && !Array.isArray(rawCaps))
      ? rawCaps as Record<string, boolean>
      : {};

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
    const reservedOps = new Set([
      'ping',
      'shutdown',
      'term_attach',
      'presentation_browser_attach',
      'presentation_browser_vnc_attach',
      'web_model_browser_attach',
      'web_model_browser_vnc_attach',
      'space_provider_auth_browser_attach',
      'space_provider_auth_browser_vnc_attach',
      'runtime_hermes_prepare',
      'runtime_hermes_mcp_test',
    ]);
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
   * Ping the daemon and return diagnostic information (ipc_v, capabilities, etc.).
   * @returns Daemon ping result.
   * @throws {DaemonUnavailableError} If the daemon is not reachable.
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

  /** Replace a group with a clean group while preserving selected configuration. */
  async groupReset(options: GroupResetOptions): Promise<Record<string, unknown>> {
    if (options.confirmGroupId !== options.groupId) {
      throw new DaemonAPIError(
        'invalid_args',
        'groupReset requires confirmGroupId to equal groupId',
        {},
      );
    }
    return this.call('group_reset', {
      group_id: options.groupId,
      confirm: options.confirmGroupId,
      by: options.by ?? 'user',
    });
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
      throw new DaemonAPIError('invalid_args', 'groupAutomationManage requires a non-empty actions array', {});
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
   * Add an actor to a group.
   * @param options - Actor configuration (id, runtime, runner, etc.).
   * @returns The daemon result (includes assigned actor id).
   * @throws {DaemonAPIError} On invalid group or duplicate actor id.
   */
  async actorAdd(options: ActorAddOptions): Promise<Record<string, unknown>> {
    const optionalFields: Record<string, unknown> = {
      actor_id: options.actorId,
      title: options.title,
      runtime: options.runtime,
      runner: options.runner,
      command: options.command,
      env: options.env,
      env_private: options.envPrivate,
      capability_autoload: options.capabilityAutoload,
      capability_hidden: options.capabilityHidden,
      profile_id: options.profileId,
      profile_scope: options.profileScope,
      profile_owner: options.profileOwner,
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

    return this.call('actor_add', args);
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

  /** Start a fresh provider session for a supported Claude, Codex, or Grok PTY actor. */
  async actorNewSession(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>;
  async actorNewSession(options: {
    groupId: string;
    actorId: string;
    by?: string;
    clearSavedSession?: boolean;
  }): Promise<Record<string, unknown>>;
  async actorNewSession(
    optionsOrGroupId: string | { groupId: string; actorId: string; by?: string; clearSavedSession?: boolean },
    actorId?: string,
    by = 'user',
  ): Promise<Record<string, unknown>> {
    const options = typeof optionsOrGroupId === 'string'
      ? { groupId: optionsOrGroupId, actorId: String(actorId ?? ''), by }
      : optionsOrGroupId;
    return this.call('actor_new_session', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
      clear_saved_session: 'clearSavedSession' in options ? options.clearSavedSession : undefined,
    }));
  }

  async runtimeHermesStatus(): Promise<Record<string, unknown>> {
    return this.call('runtime_hermes_status', {});
  }

  async runtimeHermesPrepare(options: RuntimeHermesPrepareOptions = {}): Promise<Record<string, unknown>> {
    return this.call('runtime_hermes_prepare', compactRecord({
      cwd: options.cwd,
      auto_enable_tools: options.autoEnableTools,
      force_mcp: options.forceMcp,
    }));
  }

  async runtimeHermesMcpTest(options: RuntimeHermesMcpTestOptions = {}): Promise<Record<string, unknown>> {
    return this.call('runtime_hermes_mcp_test', compactRecord({
      cwd: options.cwd,
      group_id: options.groupId,
      actor_id: options.actorId,
    }));
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
  async capabilitySearch(options: CapabilitySearchOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.actorId) args['actor_id'] = options.actorId;
    if (options.query) args['query'] = options.query;
    if (options.kind !== undefined) args['kind'] = options.kind;
    if (options.sourceId) args['source_id'] = options.sourceId;
    if (options.trustTier) args['trust_tier'] = options.trustTier;
    if (options.qualificationStatus !== undefined) args['qualification_status'] = options.qualificationStatus;
    if (options.includeExternal !== undefined) args['include_external'] = options.includeExternal;
    if (options.limit !== undefined) args['limit'] = options.limit;
    return this.call('capability_search', args);
  }

  /**
   * Enable or disable a capability.
   */
  async capabilityEnable(options: CapabilityEnableOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      capability_id: options.capabilityId,
      scope: options.scope ?? 'session',
      enabled: options.enabled ?? true,
      cleanup: options.cleanup ?? false,
      by: options.by ?? 'user',
    };
    if (options.reason) args['reason'] = options.reason;
    if (options.ttlSeconds !== undefined) args['ttl_seconds'] = options.ttlSeconds;
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_enable', args);
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
  async capabilityState(options: CapabilityStateOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_state', args);
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
    return this.call('memory_search', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      query: options.query,
      limit: options.limit,
      max_results: options.maxResults,
      vector_weight: options.vectorWeight,
      candidate_multiplier: options.candidateMultiplier,
      min_score: options.minScore,
      tags: options.tags,
      target: options.target,
    }));
  }

  async memoryGet(options: MemoryGetOptions): Promise<Record<string, unknown>> {
    return this.call('memory_get', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      path: options.path,
      target: options.target,
      date: options.date,
      offset: options.offset,
      limit: options.limit,
    }));
  }

  async memoryWrite(options: MemoryWriteOptions): Promise<Record<string, unknown>> {
    return this.call('memory_write', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      target: options.target,
      content: options.content,
      tags: options.tags,
      source_refs: options.sourceRefs,
      idempotency_key: options.idempotencyKey,
      dedup_intent: options.dedupIntent,
      dedup_query: options.dedupQuery,
    }));
  }

  async memoryHealth(options: MemoryHealthOptions): Promise<Record<string, unknown>> {
    return this.call('memory_health', compactRecord({
      group_id: options.groupId,
    }));
  }

  async memoryProfileGet(options: MemoryProfileGetOptions): Promise<Record<string, unknown>> {
    return this.call('memory_profile_get', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      user_id: options.userId,
      tags: options.tags,
    }));
  }

  /** Call the lower-level ReMe search operation explicitly. */
  async memoryRemeSearch(options: MemoryRemeSearchOptions): Promise<Record<string, unknown>> {
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

  /** Call the lower-level ReMe file-slice operation explicitly. */
  async memoryRemeGet(options: MemoryRemeGetOptions): Promise<Record<string, unknown>> {
    return this.call('memory_reme_get', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      path: options.path,
      offset: options.offset,
      limit: options.limit,
    }));
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

  private contextOp(
    groupId: string,
    op: Record<string, unknown>,
    by = 'system',
    dryRun = false
  ): Promise<Record<string, unknown>> {
    return this.contextSync({ groupId, by, dryRun, ops: [op] });
  }

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

  async coordinationNoteAdd(options: CoordinationNoteAddOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, compactRecord({
      op: 'coordination.note.add',
      kind: options.kind,
      summary: options.summary,
      task_id: options.taskId,
    }), options.by, options.dryRun);
  }

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

  async taskMove(options: TaskMoveOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'task.move',
      task_id: options.taskId,
      status: options.status,
    }, options.by, options.dryRun);
  }

  async taskRestore(options: TaskRestoreOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'task.restore',
      task_id: options.taskId,
    }, options.by, options.dryRun);
  }

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
    }), options.by, options.dryRun);
  }

  async agentStateClear(options: AgentStateClearOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'agent_state.clear',
      actor_id: options.actorId,
    }, options.by, options.dryRun);
  }

  async metaMerge(options: MetaMergeOptions): Promise<Record<string, unknown>> {
    return this.contextOp(options.groupId, {
      op: 'meta.merge',
      data: options.data,
    }, options.by, options.dryRun);
  }

  // ============================================================
  // Convenience methods: tracked delegation
  // ============================================================

  /**
   * Atomically create a tracked task and send the linked chat message. Daemon
   * handles task.create + send in one transaction. Use `idempotencyKey` to make
   * retries safe (the daemon replays the previous result on duplicate keys).
   */
  async trackedSend(options: TrackedSendOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      text: options.text,
      by: options.by ?? 'user',
    };
    if (options.title) args['title'] = options.title;
    if (options.insight) args['insight'] = options.insight;
    if (options.to) args['to'] = options.to;
    if (options.path) args['path'] = options.path;
    if (options.priority) args['priority'] = options.priority;
    if (options.messagePriority) args['message_priority'] = options.messagePriority;
    if (options.taskPriority) args['task_priority'] = options.taskPriority;
    args['reply_required'] = options.replyRequired ?? true;
    if (options.idempotencyKey) args['idempotency_key'] = options.idempotencyKey;
    if (options.outcome) args['outcome'] = options.outcome;
    if (options.status) args['status'] = options.status;
    if (options.waitingOn) args['waiting_on'] = options.waitingOn;
    if (options.taskType) args['task_type'] = options.taskType;
    if (options.checklist) args['checklist'] = options.checklist;
    if (options.notes) args['notes'] = options.notes;
    if (options.blockedBy) args['blocked_by'] = options.blockedBy;
    if (options.handoffTo) args['handoff_to'] = options.handoffTo;
    if (options.assignee) args['assignee'] = options.assignee;
    if (options.refs) args['refs'] = options.refs;
    if (options.insight) args['insight'] = options.insight;
    if (options.requirePeerInsight !== undefined) args['require_peer_insight'] = options.requirePeerInsight;
    return this.call('tracked_send', args);
  }

  /**
   * List all tasks in a group, or fetch a single task (with children) by id.
   */
  async taskList(options: TaskListOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = { group_id: options.groupId };
    if (options.taskId) args['task_id'] = options.taskId;
    return this.call('task_list', args);
  }

  // ============================================================
  // Convenience methods: headless runtime control
  // ============================================================

  async headlessStatus(options: HeadlessStatusOptions): Promise<Record<string, unknown>> {
    return this.call('headless_status', {
      group_id: options.groupId,
      actor_id: options.actorId,
    });
  }

  async headlessSetStatus(options: HeadlessSetStatusOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      actor_id: options.actorId,
      status: options.status,
    };
    if (options.taskId) args['task_id'] = options.taskId;
    return this.call('headless_set_status', args);
  }

  async headlessAckMessage(options: HeadlessAckMessageOptions): Promise<Record<string, unknown>> {
    return this.call('headless_ack_message', {
      group_id: options.groupId,
      actor_id: options.actorId,
      message_id: options.messageId,
    });
  }

  // ============================================================
  // Convenience methods: group copy (export/import)
  // ============================================================

  async groupCopyExport(options: GroupCopyExportOptions): Promise<Record<string, unknown>> {
    return this.call('group_copy_export', { group_id: options.groupId });
  }

  async groupCopyExportFile(options: GroupCopyExportOptions): Promise<Record<string, unknown>> {
    return this.call('group_copy_export_file', { group_id: options.groupId });
  }

  async groupCopyPreviewImport(
    options: GroupCopyPreviewImportOptions
  ): Promise<Record<string, unknown>> {
    const packageB64 = options.packageB64;
    const packagePath = options.packagePath;
    if (Boolean(packageB64) === Boolean(packagePath)) {
      throw new DaemonAPIError(
        'invalid_args',
        'exactly one of packageB64 or packagePath is required',
        {},
      );
    }
    return this.call('group_copy_preview_import', compactRecord({
      package_b64: packageB64,
      package_path: packagePath,
    }));
  }

  async groupCopyImport(options: GroupCopyImportOptions): Promise<Record<string, unknown>> {
    const packageB64 = options.packageB64;
    const packagePath = options.packagePath;
    if (Boolean(packageB64) === Boolean(packagePath)) {
      throw new DaemonAPIError(
        'invalid_args',
        'exactly one of packageB64 or packagePath is required',
        {},
      );
    }
    const args: Record<string, unknown> = compactRecord({
      package_b64: packageB64,
      package_path: packagePath,
    });
    if (options.workspaceRoot) args['workspace_root'] = options.workspaceRoot;
    if (options.title) args['title'] = options.title;
    return this.call('group_copy_import', args);
  }

  // ============================================================
  // Convenience methods: capability extensions
  // ============================================================

  async capabilityVisibility(options: CapabilityVisibilityOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      capability_id: options.capabilityId,
      hidden: options.hidden ?? true,
      by: options.by ?? 'user',
    };
    if (options.actorId) args['actor_id'] = options.actorId;
    if (options.reason) args['reason'] = options.reason;
    return this.call('capability_visibility', args);
  }

  async capabilityInstallTarget(
    options: CapabilityInstallTargetOptions
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      target: options.target,
      scope: options.scope ?? 'actor',
      by: options.by ?? 'user',
    };
    if (options.actorId) args['actor_id'] = options.actorId;
    if (options.ttlSeconds !== undefined) args['ttl_seconds'] = options.ttlSeconds;
    if (options.reason) args['reason'] = options.reason;
    return this.call('capability_install_target', args);
  }

  async capabilitySourceDelete(
    options: CapabilitySourceDeleteOptions
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      source_id: options.sourceId,
      by: options.by ?? 'user',
    };
    if (options.sourceInstanceKey) args['source_instance_key'] = options.sourceInstanceKey;
    if (options.reason) args['reason'] = options.reason;
    if (options.actorId) args['actor_id'] = options.actorId;
    return this.call('capability_source_delete', args);
  }

  // ============================================================
  // Convenience methods: presentation workspace
  // ============================================================

  async presentationGet(options: PresentationGetOptions): Promise<Record<string, unknown>> {
    return this.call('presentation_get', { group_id: options.groupId });
  }

  async presentationPublish(options: PresentationPublishOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.slot) args['slot'] = options.slot;
    if (options.title) args['title'] = options.title;
    if (options.summary) args['summary'] = options.summary;
    if (options.sourceLabel) args['source_label'] = options.sourceLabel;
    if (options.sourceRef) args['source_ref'] = options.sourceRef;
    if (options.cardType) args['card_type'] = options.cardType;
    if (options.content) args['content'] = options.content;
    if (options.path) args['path'] = options.path;
    if (options.url) args['url'] = options.url;
    if (options.blobRelPath) args['blob_rel_path'] = options.blobRelPath;
    if (options.table) args['table'] = options.table;
    return this.call('presentation_publish', args);
  }

  async presentationClear(options: PresentationClearOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.slot) args['slot'] = options.slot;
    return this.call('presentation_clear', args);
  }

  async presentationBrowserOpen(
    options: PresentationBrowserOpenOptions
  ): Promise<Record<string, unknown>> {
    return this.call('presentation_browser_open', {
      group_id: options.groupId,
      slot: options.slot,
      url: options.url,
      width: options.width ?? 1280,
      height: options.height ?? 800,
      by: options.by ?? 'user',
    });
  }

  async presentationBrowserInfo(
    options: PresentationBrowserInfoOptions
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = { group_id: options.groupId };
    if (options.slot) args['slot'] = options.slot;
    return this.call('presentation_browser_info', args);
  }

  async presentationBrowserClose(
    options: PresentationBrowserCloseOptions
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'user',
    };
    if (options.slot) args['slot'] = options.slot;
    return this.call('presentation_browser_close', args);
  }

  // ============================================================
  // Convenience methods: built-in assistants (PET / Voice Secretary)
  // ============================================================

  async assistantState(options: AssistantStateOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = { group_id: options.groupId };
    if (options.assistantId) args['assistant_id'] = options.assistantId;
    if (options.promptRequestId) args['prompt_request_id'] = options.promptRequestId;
    return this.call('assistant_state', args);
  }

  async assistantVoiceRecordingLease(
    options: AssistantVoiceRecordingLeaseOptions
  ): Promise<Record<string, unknown>> {
    return this.call('assistant_voice_recording_lease', compactRecord({
      group_id: options.groupId,
      action: options.action,
      by: options.by ?? 'user',
      owner_id: options.ownerId,
      lease_id: options.leaseId,
      ttl_seconds: options.ttlSeconds,
      capture_mode: options.captureMode,
      recognition_backend: options.recognitionBackend,
    }));
  }

  async assistantSettingsUpdate(
    options: AssistantSettingsUpdateOptions
  ): Promise<Record<string, unknown>> {
    return this.call('assistant_settings_update', {
      group_id: options.groupId,
      assistant_id: options.assistantId,
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  async assistantStatusUpdate(
    options: AssistantStatusUpdateOptions
  ): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      assistant_id: options.assistantId,
      lifecycle: options.lifecycle,
    };
    if (options.health) args['health'] = options.health;
    if (options.by) args['by'] = options.by;
    return this.call('assistant_status_update', args);
  }

  // ============================================================
  // Convenience methods: daemon core
  // ============================================================

  /** Trigger graceful daemon shutdown (no-args). */
  async shutdown(): Promise<Record<string, unknown>> {
    return this.call('shutdown', {});
  }

  async observabilityGet(): Promise<Record<string, unknown>> {
    return this.call('observability_get', {});
  }

  async observabilityUpdate(
    options: ObservabilityUpdateOptions
  ): Promise<Record<string, unknown>> {
    return this.call('observability_update', {
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  async brandingGet(): Promise<Record<string, unknown>> {
    return this.call('branding_get', {});
  }

  async brandingUpdate(options: BrandingUpdateOptions): Promise<Record<string, unknown>> {
    return this.call('branding_update', {
      patch: options.patch,
      by: options.by ?? 'user',
    });
  }

  // ============================================================
  // Convenience methods: diagnostics
  // ============================================================

  async debugSnapshot(options: DebugSnapshotOptions): Promise<Record<string, unknown>> {
    return this.call('debug_snapshot', {
      group_id: options.groupId,
      by: options.by ?? 'user',
    });
  }

  async debugTailLogs(options: DebugTailLogsOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      component: options.component,
      by: options.by ?? 'user',
      lines: options.lines ?? 200,
    };
    if (options.groupId) args['group_id'] = options.groupId;
    return this.call('debug_tail_logs', args);
  }

  async debugClearLogs(options: DebugClearLogsOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      component: options.component,
      by: options.by ?? 'user',
    };
    if (options.groupId) args['group_id'] = options.groupId;
    return this.call('debug_clear_logs', args);
  }

  async terminalTail(options: TerminalTailOptions): Promise<Record<string, unknown>> {
    return this.call('terminal_tail', {
      group_id: options.groupId,
      actor_id: options.actorId,
      max_chars: options.maxChars ?? 8000,
      strip_ansi: options.stripAnsi ?? true,
      compact: options.compact ?? true,
      by: options.by ?? 'user',
    });
  }

  async terminalHistory(options: TerminalHistoryOptions): Promise<Record<string, unknown>> {
    return this.call('terminal_history', compactRecord({
      group_id: options.groupId,
      actor_id: options.actorId,
      before: options.before,
      limit_bytes: options.limitBytes ?? 64_000,
      strip_ansi: options.stripAnsi ?? false,
      compact: options.compact ?? false,
      by: options.by ?? 'user',
    }));
  }

  async terminalClear(options: TerminalClearOptions): Promise<Record<string, unknown>> {
    return this.call('terminal_clear', {
      group_id: options.groupId,
      actor_id: options.actorId,
      by: options.by ?? 'user',
    });
  }

  // ============================================================
  // Convenience methods: maintenance (ledger)
  // ============================================================

  async ledgerSnapshot(options: LedgerSnapshotOptions): Promise<Record<string, unknown>> {
    return this.call('ledger_snapshot', {
      group_id: options.groupId,
      by: options.by ?? 'user',
      reason: options.reason ?? 'manual',
    });
  }

  async ledgerCompact(options: LedgerCompactOptions): Promise<Record<string, unknown>> {
    return this.call('ledger_compact', {
      group_id: options.groupId,
      by: options.by ?? 'user',
      reason: options.reason ?? 'auto',
      force: options.force ?? false,
    });
  }

  // ============================================================
  // Convenience methods: stream / system notify (low-level)
  // ============================================================

  /**
   * Emit a chat.stream event (`op` = 'start' | 'update' | 'end').
   * For 'start', a new stream_id is generated and returned. For
   * 'update'/'end', supply the stream_id you got from 'start'.
   */
  async streamEmit(options: StreamEmitOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by,
      op: options.op,
      format: options.format ?? 'plain',
      seq: options.seq ?? 0,
    };
    if (options.streamId) args['stream_id'] = options.streamId;
    if (options.text !== undefined) args['text'] = options.text;
    if (options.to) args['to'] = options.to;
    if (options.replyTo) args['reply_to'] = options.replyTo;
    if (options.clientId) args['client_id'] = options.clientId;
    return this.call('stream_emit', args);
  }

  async systemNotify(options: SystemNotifyOptions): Promise<Record<string, unknown>> {
    const args: Record<string, unknown> = {
      group_id: options.groupId,
      by: options.by ?? 'system',
      kind: options.kind ?? 'info',
      priority: options.priority ?? 'normal',
      requires_ack: options.requiresAck ?? false,
    };
    if (options.message) args['message'] = options.message;
    if (options.title) args['title'] = options.title;
    if (options.targetActorId) args['target_actor_id'] = options.targetActorId;
    if (options.context) args['context'] = options.context;
    return this.call('system_notify', args);
  }

  // ============================================================
  // Convenience methods: registry / group admin
  // ============================================================

  async registryReconcile(
    options: RegistryReconcileOptions = {}
  ): Promise<Record<string, unknown>> {
    return this.call('registry_reconcile', {
      remove_missing: options.removeMissing ?? false,
    });
  }

  async groupDetachScope(options: GroupDetachScopeOptions): Promise<Record<string, unknown>> {
    return this.call('group_detach_scope', {
      group_id: options.groupId,
      scope_key: options.scopeKey,
      by: options.by ?? 'user',
    });
  }

  // ============================================================
  // Event stream
  // ============================================================

  /**
   * Subscribe to the group event stream (Server-Sent Events style, long-lived connection).
   * Yields {@link EventStreamItem} objects as they arrive. The socket is destroyed
   * when the generator is returned or thrown.
   * @param options - Group ID, event filters, and optional since cursor.
   * @yields {EventStreamItem} Each event or heartbeat from the stream.
   * @throws {DaemonAPIError} If the handshake fails.
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
          const parsed: unknown = JSON.parse(line);
          if (parsed !== null && typeof parsed === 'object' && 't' in (parsed as Record<string, unknown>)) {
            yield parsed as EventStreamItem;
          }
        } catch {
          // Skip invalid JSON lines.
        }
      }
    } finally {
      socket.destroy();
    }
  }
}

export interface CCCCClient extends CCCC0430Ops, GroupSpaceOps, ChatOps {}

installCCCC0430Ops(CCCCClient.prototype);
installGroupSpaceOps(CCCCClient.prototype);
installChatOps(CCCCClient.prototype);
