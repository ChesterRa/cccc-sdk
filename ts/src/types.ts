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

/** Event stream item: event */
export interface EventStreamEvent {
  t: 'event';
  event: CCCSEvent;
}

/** Event stream item: heartbeat */
export interface EventStreamHeartbeat {
  t: 'heartbeat';
  ts: string;
}

/** Event stream item: unknown type (forward-compatible) */
export interface EventStreamUnknown {
  t: string;
  [key: string]: unknown;
}

/** Event stream item (discriminated on `t`) */
export type EventStreamItem =
  | EventStreamEvent
  | EventStreamHeartbeat
  | EventStreamUnknown;

/** CCCS event */
export interface CCCSEvent {
  id: string;
  ts: string;
  kind: string;
  group_id: string;
  scope_key?: string;
  by?: string;
  data: Record<string, unknown>;
}

// ============================================================
// Strongly-typed event data (B3)
// ============================================================

/** Data payload for `chat.message` events */
export interface ChatMessageEventData {
  text: string;
  format?: string;
  insight?: string | null;
  priority?: 'normal' | 'attention';
  reply_required?: boolean;
  to?: string[];
  reply_to?: string | null;
  quote_text?: string | null;
  src_group_id?: string | null;
  src_event_id?: string | null;
  dst_group_id?: string | null;
  dst_to?: string[] | null;
  refs?: unknown[];
  attachments?: unknown[];
  thread?: string;
  client_id?: string | null;
}

/** Data payload for `chat.read` events */
export interface ChatReadEventData {
  actor_id: string;
  event_id: string;
}

/** Data payload for `notify.reminder` events */
export interface NotifyReminderEventData {
  rule_id: string;
  title?: string;
  message?: string;
  snippet?: string;
  priority?: string;
  requires_ack?: boolean;
}

/** A chat.message event with strongly-typed data */
export interface ChatMessageEvent extends CCCSEvent {
  kind: 'chat.message';
  data: ChatMessageEventData & Record<string, unknown>;
}

/** A chat.read event with strongly-typed data */
export interface ChatReadEvent extends CCCSEvent {
  kind: 'chat.read';
  data: ChatReadEventData & Record<string, unknown>;
}

/** Type guard: is this event a chat.message? */
export function isChatMessageEvent(event: CCCSEvent): event is ChatMessageEvent {
  return event.kind === 'chat.message';
}

/** Type guard: is this event a chat.read? */
export function isChatReadEvent(event: CCCSEvent): event is ChatReadEvent {
  return event.kind === 'chat.read';
}

/** Type guard: is this stream item an event? */
export function isStreamEvent(item: EventStreamItem): item is EventStreamEvent {
  return item.t === 'event' && 'event' in item;
}

/** Type guard: is this stream item a heartbeat? */
export function isStreamHeartbeat(item: EventStreamItem): item is EventStreamHeartbeat {
  return item.t === 'heartbeat';
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

/**
 * Structured chat-message reference (task_ref, presentation_ref, file/url/commit/text).
 * Daemon accepts arbitrary `kind` values; the typed forms are the most common.
 */
export type MessageRef =
  | { kind: 'file'; path: string; title?: string; sha?: string; bytes?: number; [extra: string]: unknown }
  | { kind: 'url'; url: string; title?: string; [extra: string]: unknown }
  | { kind: 'commit'; sha: string; title?: string; [extra: string]: unknown }
  | { kind: 'text'; title?: string; [extra: string]: unknown }
  | { kind: 'task_ref'; task_id: string; title?: string; status?: string; waiting_on?: string; handoff_to?: string; [extra: string]: unknown }
  | { kind: 'presentation_ref'; slot_id?: string; title?: string; source_label?: string; source_ref?: string; [extra: string]: unknown }
  | { kind: string; [extra: string]: unknown };

/** Chat-message attachment metadata (payload stored under blobs/) */
export interface MessageAttachment {
  kind?: 'text' | 'image' | 'file';
  path?: string;
  title?: string;
  mime_type?: string;
  bytes?: number;
  sha256?: string;
  [extra: string]: unknown;
}

/** Send message options */
export interface SendOptions {
  groupId: string;
  text: string;
  by?: string;
  to?: string[];
  priority?: 'normal' | 'attention';
  replyRequired?: boolean;
  path?: string;
  refs?: MessageRef[];
  attachments?: MessageAttachment[];
  clientId?: string;
  suggestedUserMessage?: string;
  insight?: string;
  requirePeerInsight?: boolean;
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
  refs?: MessageRef[];
  attachments?: MessageAttachment[];
  insight?: string;
  requirePeerInsight?: boolean;
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
  refs?: MessageRef[];
  attachments?: MessageAttachment[];
  clientId?: string;
  suggestedUserMessage?: string;
  insight?: string;
  requirePeerInsight?: boolean;
}

/**
 * Tracked-delegation: atomically create a task and send the linked chat message.
 * Daemon ensures task.create + send happen as one unit with idempotency replay.
 */
export interface TrackedSendOptions {
  groupId: string;
  text: string;
  /** Falls back to a compact derivation from text if omitted. */
  title?: string;
  by?: string;
  to?: string[];
  path?: string;
  /** Top-level priority (default 'normal'). Applies to message unless messagePriority overrides. */
  priority?: 'normal' | 'attention';
  messagePriority?: 'normal' | 'attention';
  taskPriority?: 'normal' | 'attention';
  /** Defaults to true (a tracked delegation always expects a reply). */
  replyRequired?: boolean;
  /** Used to dedupe retries. Daemon caches the result of the first successful call. */
  idempotencyKey?: string;
  outcome?: string;
  /** Initial task status. Default 'planned'. */
  status?: string;
  /** What the task is waiting on. Default 'actor' when assignee is set, else 'none'. */
  waitingOn?: string;
  /** 'free' | 'standard' | 'optimization'. Default 'standard'. */
  taskType?: string;
  checklist?: Array<Record<string, unknown>>;
  notes?: string;
  blockedBy?: string[];
  handoffTo?: string;
  assignee?: string;
  refs?: MessageRef[];
  insight?: string;
  requirePeerInsight?: boolean;
}

/** Task list (returns either all tasks or one task plus its children). */
export interface TaskListOptions {
  groupId: string;
  taskId?: string;
}

/** Built-in actor kind flag (PET / Voice Secretary). */
export type ActorInternalKind = 'pet' | 'voice_secretary';

/** Source of runtime activity state for an actor. */
export type ActorRuntimeStateSource = 'terminal' | 'app_server';

/** Known agent runtimes. Allow string for forward compatibility. */
export type AgentRuntime =
  | 'amp'
  | 'auggie'
  | 'claude'
  | 'codex'
  | 'droid'
  | 'gemini'
  | 'kimi'
  | 'neovate'
  | 'web_model'
  | 'custom'
  | (string & {});

/** Add actor options */
export interface ActorAddOptions {
  groupId: string;
  actorId?: string;
  title?: string;
  runtime?: AgentRuntime;
  runner?: 'pty' | 'headless' | (string & {});
  command?: string[];
  env?: Record<string, string>;
  envPrivate?: Record<string, string>;
  capabilityAutoload?: string[];
  capabilityHidden?: string[];
  profileId?: string;
  profileScope?: 'global' | 'user';
  profileOwner?: string;
  defaultScopeKey?: string;
  submit?: 'enter' | 'newline' | 'none' | (string & {});
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

/** Headless-actor runtime status. */
export type HeadlessStatus = 'idle' | 'working' | 'waiting' | 'stopped';

/** Headless status read options */
export interface HeadlessStatusOptions {
  groupId: string;
  actorId: string;
}

/** Headless set-status options */
export interface HeadlessSetStatusOptions {
  groupId: string;
  actorId: string;
  status: HeadlessStatus;
  taskId?: string;
}

/** Headless ack-message options */
export interface HeadlessAckMessageOptions {
  groupId: string;
  actorId: string;
  messageId: string;
}

/** Group copy: export the current group as a portable package. */
export interface GroupCopyExportOptions {
  groupId: string;
}

/** Group copy: preview what would be imported from a package. */
export interface GroupCopyPreviewImportOptions {
  packageB64: string;
}

/** Group copy: apply a previously exported package as a new group. */
export interface GroupCopyImportOptions {
  packageB64: string;
  workspaceRoot?: string;
  title?: string;
}

/** Capability visibility (per-actor hide/show). */
export interface CapabilityVisibilityOptions {
  groupId: string;
  capabilityId: string;
  hidden?: boolean;
  actorId?: string;
  reason?: string;
  by?: string;
}

/** Capability install target — accepts capability_id or a remote source URI. */
export interface CapabilityInstallTargetOptions {
  groupId: string;
  target: string;
  actorId?: string;
  scope?: 'actor' | 'group' | 'session';
  ttlSeconds?: number;
  reason?: string;
  by?: string;
}

/** Capability source delete. */
export interface CapabilitySourceDeleteOptions {
  groupId: string;
  sourceId: string;
  sourceInstanceKey?: string;
  reason?: string;
  actorId?: string;
  by?: string;
}

/** Presentation table content. */
export interface PresentationTableData {
  columns: string[];
  rows: string[][];
}

/** Presentation card types supported by the daemon. */
export type PresentationCardType =
  | 'markdown'
  | 'table'
  | 'image'
  | 'pdf'
  | 'file'
  | 'web_preview';

/** Presentation get. */
export interface PresentationGetOptions {
  groupId: string;
}

/** Presentation publish options. Pick one content source. */
export interface PresentationPublishOptions {
  groupId: string;
  by?: string;
  slot?: string;
  title?: string;
  summary?: string;
  sourceLabel?: string;
  sourceRef?: string;
  cardType?: PresentationCardType;
  content?: string;
  path?: string;
  url?: string;
  blobRelPath?: string;
  table?: PresentationTableData;
}

/** Presentation clear options. */
export interface PresentationClearOptions {
  groupId: string;
  slot?: string;
  by?: string;
}

/** Open a browser-backed presentation surface. */
export interface PresentationBrowserOpenOptions {
  groupId: string;
  slot: string;
  url: string;
  width?: number;
  height?: number;
  by?: string;
}

export interface PresentationBrowserInfoOptions {
  groupId: string;
  slot?: string;
}

export interface PresentationBrowserCloseOptions {
  groupId: string;
  slot?: string;
  by?: string;
}

/** Built-in assistant lifecycle. */
export type AssistantLifecycle =
  | 'disabled'
  | 'idle'
  | 'running'
  | 'working'
  | 'waiting'
  | 'failed';

/** Read assistant state. */
export interface AssistantStateOptions {
  groupId: string;
  assistantId?: string;
  promptRequestId?: string;
}

export type AssistantVoiceRecordingLeaseAction = 'acquire' | 'heartbeat' | 'release' | 'status';

/** Acquire, refresh, release, or inspect the daemon-owned Voice Secretary recording lease. */
export interface AssistantVoiceRecordingLeaseOptions {
  groupId: string;
  action: AssistantVoiceRecordingLeaseAction;
  by?: string;
  ownerId?: string;
  leaseId?: string;
  ttlSeconds?: number;
  captureMode?: string;
  recognitionBackend?: string;
}

/** Update assistant settings (patch). */
export interface AssistantSettingsUpdateOptions {
  groupId: string;
  assistantId: string;
  patch: Record<string, unknown>;
  by?: string;
}

/** Update assistant runtime status. */
export interface AssistantStatusUpdateOptions {
  groupId: string;
  assistantId: string;
  lifecycle: AssistantLifecycle;
  health?: Record<string, unknown>;
  by?: string;
}

/** Global observability settings update. */
export interface ObservabilityUpdateOptions {
  patch: Record<string, unknown>;
  by?: string;
}

/** Branding settings update. */
export interface BrandingUpdateOptions {
  patch: Record<string, unknown>;
  by?: string;
}

/** Daemon-wide diagnostics snapshot. */
export interface DebugSnapshotOptions {
  groupId: string;
  by?: string;
}

/** Tail logs from a daemon component. */
export interface DebugTailLogsOptions {
  component: string;
  groupId?: string;
  lines?: number;
  by?: string;
}

/** Clear logs for a daemon component. */
export interface DebugClearLogsOptions {
  component: string;
  groupId?: string;
  by?: string;
}

/** Read PTY transcript tail. */
export interface TerminalTailOptions {
  groupId: string;
  actorId: string;
  maxChars?: number;
  stripAnsi?: boolean;
  compact?: boolean;
  by?: string;
}

/** Clear PTY backlog. */
export interface TerminalClearOptions {
  groupId: string;
  actorId: string;
  by?: string;
}

/** Ledger snapshot (durable point-in-time). */
export interface LedgerSnapshotOptions {
  groupId: string;
  by?: string;
  reason?: string;
}

/** Ledger compaction. */
export interface LedgerCompactOptions {
  groupId: string;
  by?: string;
  reason?: string;
  force?: boolean;
}

/** Emit a chat.stream event (start/update/end). */
export interface StreamEmitOptions {
  groupId: string;
  op: 'start' | 'update' | 'end';
  by: string;
  streamId?: string;
  text?: string;
  format?: 'plain' | 'markdown';
  seq?: number;
  to?: string[];
  replyTo?: string;
  clientId?: string;
}

/** Write a system.notify event directly. */
export interface SystemNotifyOptions {
  groupId: string;
  message?: string;
  title?: string;
  kind?: string;
  priority?: 'normal' | 'attention';
  targetActorId?: string;
  requiresAck?: boolean;
  context?: Record<string, unknown>;
  by?: string;
}

/** Reconcile the group registry against on-disk state. */
export interface RegistryReconcileOptions {
  removeMissing?: boolean;
}

/** Detach a scope from a group. */
export interface GroupDetachScopeOptions {
  groupId: string;
  scopeKey: string;
  by?: string;
}

/** PET cached-decisions read. */
export interface PetDecisionsGetOptions {
  groupId: string;
}

/** PET cached-decisions replace. */
export interface PetDecisionsReplaceOptions {
  groupId: string;
  actorId: string;
  decisions: Array<Record<string, unknown>>;
  by?: string;
}

/** PET cached-decisions clear. */
export interface PetDecisionsClearOptions {
  groupId: string;
  actorId: string;
  by?: string;
}

/** Prepare the selected Hermes profile with the CCCC MCP server. */
export interface RuntimeHermesPrepareOptions {
  cwd?: string;
  autoEnableTools?: boolean;
  forceMcp?: boolean;
}

/** Run Hermes' MCP probe for the configured CCCC server. */
export interface RuntimeHermesMcpTestOptions {
  cwd?: string;
  groupId?: string;
  actorId?: string;
}

/**
 * Async-result envelope merged into many long-running ops' results.
 *
 * Consumers typically check `completed`; if `false`, the operation was accepted
 * and clients should subscribe to `events_stream` for `completion_signal` rather
 * than poll. See `spec/CCCC_DAEMON_IPC_V1.md` for details.
 */
export interface AsyncResultEnvelope {
  accepted: boolean;
  completed: boolean;
  queued?: boolean;
  background?: boolean;
  completion_signal?: string;
  recommended_next_action?: string;
  polling_discouraged?: boolean;
  wait_guidance?: string;
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
  groupId?: string;
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
  groupId?: string;
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
  groupId?: string;
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

/** Common context_sync wrapper options. */
export interface ContextWrapperOptions {
  groupId: string;
  by?: string;
  dryRun?: boolean;
}

/** Update the shared coordination brief (Context Ops v3). */
export interface CoordinationBriefUpdateOptions extends ContextWrapperOptions {
  objective?: string;
  currentFocus?: string;
  constraints?: string[];
  projectBrief?: string;
  projectBriefStale?: boolean;
}

/** Add a compact coordination note. */
export interface CoordinationNoteAddOptions extends ContextWrapperOptions {
  kind: 'decision' | 'handoff';
  summary: string;
  taskId?: string | null;
}

/** Create/update/move/restore task options for Context Ops v3. */
export interface TaskCreateOptions extends ContextWrapperOptions {
  title: string;
  outcome?: string;
  status?: 'planned' | 'active' | 'done' | 'archived';
  parentId?: string | null;
  assignee?: string | null;
  priority?: string;
  blockedBy?: string[];
  waitingOn?: 'none' | 'user' | 'actor' | 'external';
  handoffTo?: string | null;
  taskType?: 'free' | 'standard' | 'optimization';
  notes?: string;
  checklist?: Array<{ id?: string; text: string; status?: 'pending' | 'in_progress' | 'done' }>;
}

export interface TaskUpdateOptions extends ContextWrapperOptions {
  taskId: string;
  title?: string;
  outcome?: string;
  status?: 'planned' | 'active' | 'done' | 'archived';
  assignee?: string | null;
  priority?: string;
  blockedBy?: string[];
  waitingOn?: 'none' | 'user' | 'actor' | 'external';
  handoffTo?: string | null;
  notes?: string;
  checklist?: Array<{ id?: string; text: string; status?: 'pending' | 'in_progress' | 'done' }>;
}

export interface TaskMoveOptions extends ContextWrapperOptions {
  taskId: string;
  status: 'planned' | 'active' | 'done' | 'archived';
}

export interface TaskRestoreOptions extends ContextWrapperOptions {
  taskId: string;
}

/** Update or clear per-actor working memory. */
export interface AgentStateUpdateOptions extends ContextWrapperOptions {
  actorId: string;
  activeTaskId?: string;
  focus?: string;
  nextAction?: string;
  whatChanged?: string;
  blockers?: string[];
  openLoops?: string[];
  commitments?: string[];
  environmentSummary?: string;
  userModel?: string;
  personaNotes?: string;
  resumeHint?: string;
}

export interface AgentStateClearOptions extends ContextWrapperOptions {
  actorId: string;
}

export interface MetaMergeOptions extends ContextWrapperOptions {
  data: Record<string, unknown>;
}

/** Event stream options */
export interface EventsStreamOptions {
  groupId: string;
  by?: string;
  kinds?: Set<string> | string[];
  sinceEventId?: string;
  sinceTs?: string;
  timeoutMs?: number;
  /** AbortSignal to tear down the stream. When aborted the async generator returns. */
  signal?: AbortSignal;
}

// ============================================================
// Result types (daemon response payloads)
// ============================================================

/** Result of send / reply / sendCrossGroup */
export interface SendResult {
  event: CCCSEvent;
  ack_event: CCCSEvent | null;
}

/** Options for sendAndWaitForReply */
export interface SendAndWaitOptions extends SendOptions {
  /** Actor ID that will listen for the reply (used to open events stream). */
  listenAs: string;
  /** Timeout in ms to wait for a reply (default 60_000). */
  waitTimeoutMs?: number;
  /** AbortSignal to cancel the wait. */
  signal?: AbortSignal;
}

// ============================================================
// B6: Strongly-typed result types for all methods
// ============================================================

/** Actor descriptor returned by daemon */
export interface ActorInfo {
  id: string;
  role?: string;
  title?: string;
  enabled?: boolean;
  running?: boolean;
  runner?: string;
  runtime?: string;
  submit?: string;
  unread_count?: number;
  updated_at?: string;
  created_at?: string;
}

/** Scope descriptor */
export interface ScopeInfo {
  scope_key: string;
  url: string;
  label?: string;
  git_remote?: string;
}

/** Group descriptor returned by daemon */
export interface GroupInfo {
  group_id: string;
  title?: string;
  topic?: string;
  state?: string;
  running?: boolean;
  active_scope_key?: string;
  created_at?: string;
  updated_at?: string;
  scopes?: ScopeInfo[];
}

/** Result of ping */
export interface PingResult {
  ipc_v: number;
  version?: string;
  capabilities?: Record<string, boolean>;
  [key: string]: unknown;
}

/** Result of groups list */
export interface GroupsResult {
  groups: GroupInfo[];
}

/** Result of group_show */
export interface GroupShowResult {
  group: GroupInfo;
  actors?: ActorInfo[];
}

/** Result of group_create */
export interface GroupCreateResult {
  group: GroupInfo;
}

/** Result of actor_list */
export interface ActorListResult {
  actors: ActorInfo[];
}

/** Result of actor_add */
export interface ActorAddResult {
  actor_id: string;
}

/** Result of inbox_list */
export interface InboxListResult {
  messages: CCCSEvent[];
  cursor?: {
    event_id: string;
    ts: string;
  };
}

export interface CapabilityUseOptions extends CapabilityEnableOptions {
  toolName?: string;
  toolArguments?: Record<string, unknown>;
}

/** Local CCCC memory operation options. */
export interface MemorySearchOptions {
  groupId?: string;
  actorId?: string;
  query: string;
  limit?: number;
  tags?: string[];
  target?: 'memory' | 'daily';
}

export interface MemoryWriteOptions {
  groupId?: string;
  actorId?: string;
  target: 'memory' | 'daily';
  content: string;
  tags?: string[];
  sourceRefs?: string[];
  idempotencyKey?: string;
  dedupIntent?: 'new' | 'update' | 'supersede' | 'silent';
  dedupQuery?: string;
}

export interface MemoryGetOptions {
  groupId?: string;
  actorId?: string;
  path?: string;
  target?: 'memory' | 'daily';
  date?: string;
  offset?: number;
  limit?: number;
}

export interface MemoryHealthOptions {
  groupId?: string;
}

export interface MemoryProfileGetOptions {
  groupId?: string;
  actorId?: string;
  userId?: string;
  tags?: string[];
}

/** Result of context_get */
export interface ContextGetResult {
  version: string;
  vision?: string | null;
  sketch?: string | null;
  milestones?: unknown[];
  notes?: unknown[];
  references?: unknown[];
  tasks_summary?: {
    total: number;
    done: number;
    active: number;
    planned: number;
  };
  active_task?: unknown;
  presence?: {
    agents: unknown[];
  };
}
