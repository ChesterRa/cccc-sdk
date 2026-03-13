/**
 * CCCC SDK type definitions
 */

// ============================================================
// IPC protocol types
// ============================================================

/** IPC request envelope */
export interface DaemonRequest {
  v: 1;
  op: string;
  args?: Record<string, unknown>;
}

/** IPC response envelope */
export interface DaemonResponse {
  v?: 1;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: DaemonErrorPayload;
}

/** Error payload */
export interface DaemonErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ============================================================
// Endpoint configuration
// ============================================================

/** Daemon endpoint */
export interface DaemonEndpoint {
  readonly transport: 'unix' | 'tcp' | '';
  readonly path: string;
  readonly host: string;
  readonly port: number;
}

/** Address descriptor (ccccd.addr.json) */
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
// Event stream types
// ============================================================

/** Event stream item */
export type EventStreamItem =
  | { t: 'event'; event: CCCSEvent }
  | { t: 'heartbeat'; ts: string }
  | { t: string; [key: string]: unknown };

/** CCCS event */
export interface CCCSEvent {
  id: string;
  ts: string;
  kind: string;
  group_id: string;
  data: Record<string, unknown>;
}

// ============================================================
// Client options
// ============================================================

/** Client initialization options */
export interface CCCCClientOptions {
  ccccHome?: string;
  endpoint?: DaemonEndpoint;
  timeoutMs?: number;
}

/** Compatibility check options */
export interface CompatibilityOptions {
  requireIpcV?: number;
  requireCapabilities?: Record<string, boolean>;
  requireOps?: string[];
}

// ============================================================
// Operation argument types
// ============================================================

/** Send message options */
export interface SendOptions {
  groupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'attention';
  replyRequired?: boolean;
  path?: string;
}

/** Send-cross-group options */
export interface SendCrossGroupOptions {
  groupId: string;
  dstGroupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'attention';
  replyRequired?: boolean;
}

/** Reply message options */
export interface ReplyOptions {
  groupId: string;
  replyTo: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'attention';
  replyRequired?: boolean;
}

/** Add actor options */
export interface ActorAddOptions {
  groupId: string;
  actorId?: string;
  title?: string;
  runtime?: string;
  runner?: string;
  command?: string[];
  env?: Record<string, string>;
  envPrivate?: Record<string, string>;
  capabilityAutoload?: string[];
  profileId?: string;
  defaultScopeKey?: string;
  submit?: string;
  by?: string;
}

/** Update actor options */
export interface ActorUpdateOptions {
  groupId: string;
  actorId: string;
  patch?: Record<string, unknown>;
  profileId?: string;
  profileAction?: 'convert_to_custom';
  by?: string;
}

/** Actor private env vars (secrets, runtime-only) */
export interface ActorEnvPrivateUpdateOptions {
  groupId: string;
  actorId: string;
  by?: string;
  set?: Record<string, string>;
  unset?: string[];
  clear?: boolean;
}

/** Actor profile payload (upsert/get/list item core fields) */
export interface ActorProfileCapabilityDefaults {
  autoloadCapabilities?: string[];
  defaultScope?: 'actor' | 'session';
  sessionTtlSeconds?: number;
}

/** Actor profile payload (upsert/get/list item core fields) */
export interface ActorProfile {
  id?: string;
  name: string;
  runtime: string;
  runner: 'pty' | 'headless';
  command?: string[] | string;
  submit?: 'enter' | 'newline' | 'none';
  env?: Record<string, string>;
  capabilityDefaults?: ActorProfileCapabilityDefaults | null;
  created_at?: string;
  updated_at?: string;
  revision?: number;
  usage_count?: number;
}

/** Actor profile usage record */
export interface ActorProfileUsage {
  group_id: string;
  actor_id: string;
}

/** Actor profile upsert options */
export interface ActorProfileUpsertOptions {
  profile: ActorProfile;
  by?: string;
  expectedRevision?: number;
}

/** Actor profile secret update options */
export interface ActorProfileSecretUpdateOptions {
  profileId: string;
  by?: string;
  set?: Record<string, string>;
  unset?: string[];
  clear?: boolean;
}

/** Copy one actor's runtime env (public + private) into a profile's private env */
export interface ActorProfileSecretCopyFromActorOptions {
  profileId: string;
  groupId: string;
  actorId: string;
  by?: string;
}

/** Copy one profile's secret map into another profile */
export interface ActorProfileSecretCopyFromProfileOptions {
  profileId: string;
  sourceProfileId: string;
  by?: string;
}

/** Create group options */
export interface GroupCreateOptions {
  title?: string;
  topic?: string;
  by?: string;
}

/** Update group options */
export interface GroupUpdateOptions {
  groupId: string;
  patch: Record<string, unknown>;
  by?: string;
}

/** Capability overview options */
export interface CapabilityOverviewOptions {
  query?: string;
  limit?: number;
  includeIndexed?: boolean;
}

/** Capability search options */
export interface CapabilitySearchOptions {
  groupId: string;
  actorId?: string;
  by?: string;
  query?: string;
  kind?: 'mcp_toolpack' | 'skill' | '';
  sourceId?: string;
  trustTier?: string;
  qualificationStatus?: 'qualified' | 'unavailable' | 'blocked' | '';
  includeExternal?: boolean;
  limit?: number;
}

/** Capability enable/disable options */
export interface CapabilityEnableOptions {
  groupId: string;
  capabilityId: string;
  scope?: 'group' | 'actor' | 'session';
  enabled?: boolean;
  cleanup?: boolean;
  reason?: string;
  ttlSeconds?: number;
  by?: string;
  actorId?: string;
}

/** Capability block/unblock options */
export interface CapabilityBlockOptions {
  groupId: string;
  capabilityId: string;
  scope?: 'group' | 'global';
  blocked?: boolean;
  ttlSeconds?: number;
  reason?: string;
  by?: string;
  actorId?: string;
}

/** Capability state options */
export interface CapabilityStateOptions {
  groupId: string;
  actorId?: string;
  by?: string;
}

/** Capability allowlist overlay merge mode */
export type CapabilityAllowlistMode = 'patch' | 'replace';

/** Capability allowlist read options */
export interface CapabilityAllowlistGetOptions {
  by?: string;
}

/** Capability allowlist dry-run validation options */
export interface CapabilityAllowlistValidateOptions {
  mode?: CapabilityAllowlistMode;
  patch?: Record<string, unknown>;
  overlay?: Record<string, unknown>;
}

/** Capability allowlist update options */
export interface CapabilityAllowlistUpdateOptions {
  by?: string;
  mode?: CapabilityAllowlistMode;
  expectedRevision?: string;
  patch?: Record<string, unknown>;
  overlay?: Record<string, unknown>;
}

/** Capability allowlist reset options */
export interface CapabilityAllowlistResetOptions {
  by?: string;
}

/** Capability import options */
export interface CapabilityImportOptions {
  groupId: string;
  record: Record<string, unknown>;
  by?: string;
  actorId?: string;
  dryRun?: boolean;
  probe?: boolean;
  enableAfterImport?: boolean;
  scope?: 'group' | 'actor' | 'session';
  ttlSeconds?: number;
  reason?: string;
}

/** Capability uninstall options */
export interface CapabilityUninstallOptions {
  groupId: string;
  capabilityId: string;
  reason?: string;
  by?: string;
  actorId?: string;
}

/** Capability dynamic-tool call options */
export interface CapabilityToolCallOptions {
  groupId: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  actorId?: string;
  by?: string;
}

/** Supported Group Space provider */
export type GroupSpaceProvider = 'notebooklm';

/** Group Space lane */
export type GroupSpaceLane = 'work' | 'memory';

/** Group Space status options */
export interface GroupSpaceStatusOptions {
  groupId: string;
  provider?: GroupSpaceProvider;
}

/** Group Space spaces options */
export interface GroupSpaceSpacesOptions {
  groupId: string;
  provider?: GroupSpaceProvider;
}

/** Group Space capability matrix options */
export interface GroupSpaceCapabilitiesOptions {
  groupId: string;
  provider?: GroupSpaceProvider;
}

/** Group Space bind options */
export interface GroupSpaceBindOptions {
  groupId: string;
  lane: GroupSpaceLane;
  action?: 'bind' | 'unbind';
  remoteSpaceId?: string;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Group Space ingest options */
export interface GroupSpaceIngestOptions {
  groupId: string;
  lane: GroupSpaceLane;
  payload?: Record<string, unknown>;
  kind?: 'context_sync' | 'resource_ingest';
  idempotencyKey?: string;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Group Space query options */
export interface GroupSpaceQueryOptions {
  groupId: string;
  lane: GroupSpaceLane;
  query: string;
  options?: Record<string, unknown>;
  provider?: GroupSpaceProvider;
}

/** Group Space source-management options */
export interface GroupSpaceSourcesOptions {
  groupId: string;
  lane: GroupSpaceLane;
  action?: 'list' | 'refresh' | 'rename' | 'delete';
  sourceId?: string;
  newTitle?: string;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Group Space artifact options */
export interface GroupSpaceArtifactOptions {
  groupId: string;
  lane: GroupSpaceLane;
  action?: 'list' | 'generate' | 'download';
  kind?: 'audio' | 'video' | 'report' | 'study_guide' | 'quiz' | 'flashcards' | 'infographic' | 'slide_deck' | 'data_table' | 'mind_map';
  options?: Record<string, unknown>;
  wait?: boolean;
  saveToSpace?: boolean;
  outputPath?: string;
  outputFormat?: 'json' | 'markdown' | 'html';
  artifactId?: string;
  timeoutSeconds?: number;
  initialInterval?: number;
  maxInterval?: number;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Group Space job-management options */
export interface GroupSpaceJobsOptions {
  groupId: string;
  lane: GroupSpaceLane;
  action?: 'list' | 'retry' | 'cancel';
  jobId?: string;
  state?: 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled';
  limit?: number;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Group Space sync options */
export interface GroupSpaceSyncOptions {
  groupId: string;
  lane: GroupSpaceLane;
  action?: 'status' | 'run';
  force?: boolean;
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Provider credential status options */
export interface GroupSpaceProviderCredentialStatusOptions {
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Provider credential update options */
export interface GroupSpaceProviderCredentialUpdateOptions {
  provider?: GroupSpaceProvider;
  by?: string;
  authJson?: string;
  clear?: boolean;
}

/** Provider health check options */
export interface GroupSpaceProviderHealthCheckOptions {
  provider?: GroupSpaceProvider;
  by?: string;
}

/** Provider auth flow options */
export interface GroupSpaceProviderAuthOptions {
  provider?: GroupSpaceProvider;
  action?: 'status' | 'start' | 'cancel';
  timeoutSeconds?: number;
  by?: string;
}

/** Automation notify priority */
export type AutomationNotifyPriority = 'low' | 'normal' | 'high' | 'urgent';

/** Automation trigger (interval) */
export interface AutomationTriggerInterval {
  kind: 'interval';
  every_seconds: number;
}

/** Automation trigger (cron) */
export interface AutomationTriggerCron {
  kind: 'cron';
  cron: string;
  timezone?: string;
}

/** Automation trigger (one-time) */
export interface AutomationTriggerAt {
  kind: 'at';
  at: string;
}

/** Automation trigger */
export type AutomationTrigger =
  | AutomationTriggerInterval
  | AutomationTriggerCron
  | AutomationTriggerAt;

/** Automation action (notify) */
export interface AutomationActionNotify {
  kind: 'notify';
  title?: string;
  snippet_ref?: string | null;
  message?: string;
  priority?: AutomationNotifyPriority;
  requires_ack?: boolean;
}

/** Automation action (group state) */
export interface AutomationActionGroupState {
  kind: 'group_state';
  state: 'active' | 'idle' | 'paused' | 'stopped';
}

/** Automation action (actor control) */
export interface AutomationActionActorControl {
  kind: 'actor_control';
  operation: 'start' | 'stop' | 'restart';
  targets?: string[];
}

/** Automation action */
export type AutomationAction =
  | AutomationActionNotify
  | AutomationActionGroupState
  | AutomationActionActorControl;

/** Automation rule */
export interface AutomationRule {
  id: string;
  enabled?: boolean;
  scope?: 'group' | 'personal';
  owner_actor_id?: string | null;
  to?: string[];
  trigger?: AutomationTrigger;
  action?: AutomationAction;
}

/** Automation ruleset */
export interface AutomationRuleSet {
  rules: AutomationRule[];
  snippets: Record<string, string>;
}

/** Automation manage action: create rule */
export interface AutomationManageCreateRule {
  type: 'create_rule';
  rule: AutomationRule;
}

/** Automation manage action: update rule */
export interface AutomationManageUpdateRule {
  type: 'update_rule';
  rule: AutomationRule;
}

/** Automation manage action: toggle rule */
export interface AutomationManageSetRuleEnabled {
  type: 'set_rule_enabled';
  rule_id: string;
  enabled: boolean;
}

/** Automation manage action: delete rule */
export interface AutomationManageDeleteRule {
  type: 'delete_rule';
  rule_id: string;
}

/** Automation manage action: replace all */
export interface AutomationManageReplaceAllRules {
  type: 'replace_all_rules';
  ruleset: AutomationRuleSet;
}

/** Automation manage action */
export type AutomationManageAction =
  | AutomationManageCreateRule
  | AutomationManageUpdateRule
  | AutomationManageSetRuleEnabled
  | AutomationManageDeleteRule
  | AutomationManageReplaceAllRules;

/** Group automation update options */
export interface GroupAutomationUpdateOptions {
  groupId: string;
  ruleset: AutomationRuleSet;
  by?: string;
  expectedVersion?: number;
}

/** Group automation incremental-manage options */
export interface GroupAutomationManageOptions {
  groupId: string;
  by?: string;
  expectedVersion?: number;
  actions: AutomationManageAction[];
}

/** Group automation reset options */
export interface GroupAutomationResetBaselineOptions {
  groupId: string;
  by?: string;
  expectedVersion?: number;
}

/** Inbox list options */
export interface InboxListOptions {
  groupId: string;
  actorId: string;
  by?: string;
  limit?: number;
  kindFilter?: string;
}

/** Context sync options */
export interface ContextSyncOptions {
  groupId: string;
  ops: Record<string, unknown>[];
  by?: string;
  dryRun?: boolean;
}

/** Event stream options */
export interface EventsStreamOptions {
  groupId: string;
  by?: string;
  kinds?: Set<string> | string[];
  sinceEventId?: string;
  sinceTs?: string;
  timeoutMs?: number;
}
