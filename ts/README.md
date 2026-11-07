# CCCC TypeScript SDK

TypeScript/Node.js client for the CCCC daemon (IPC v1).

## Relationship to CCCC core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` core provides one native Rust daemon/web/CLI product and owns runtime state.
- `cccc-sdk` provides Node.js client APIs that call the daemon over IPC.

## Installation

```bash
npm install cccc-sdk
```

Compatibility is determined by Daemon IPC v1 contracts and operation probing,
not by strict package-version matching. The current message contract is an
intentional atomic cut: upgrade SDK and daemon together.

## Quick start

```typescript
import { CCCCClient } from 'cccc-sdk';

async function main() {
  const client = await CCCCClient.create();

  await client.assertCompatible({
    requireIpcV: 1,
    requireOps: ['groups', 'send', 'reply', 'tracked_send', 'context_sync'],
  });

  // Use an existing Group and an Agent ID from that Group.
  const groupId = 'g_your_group_id';

  await client.send({
    groupId,
    text: 'Please check this and reply.',
    mode: 'request_reply',
    to: ['peer-1'],
  });
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

## Message semantics

- `mode`: `'mail' | 'send' | 'request_reply'` (required for new messages)
- `insight`: optional visible, provisional sender perspective for independent recipient judgment
- `suggestedUserMessage`: optional proposed next human message; stored visibly and never auto-sent

Supported in:
- `send(options)`
- `sendCrossGroup(options)`

`mail` stores without an immediate runtime prompt, `send` performs a
best-effort immediate Push, and `request_reply` adds a concrete reply request.
`reply(options)` defaults to Send and accepts `mode: 'mail'` for an agent-only,
non-urgent reply; both modes fulfill the original reply request. The visible
message emitted by `trackedSend(options)` remains Send. Generic ACK operations no longer exist; consume Inbox contents
with `inboxRead(options)`. Inbox contains only Mail; inspect past direct or Mail
traffic without changing the Mail cursor through `messageHistory(options)`.
The optional `sender` filter requires CCCC 0.4.50 or later; older daemons
silently ignore it. `groupActivity` reports review leads, not member value;
scheduled notices do not prove delivery or a model turn.

`suggestedUserMessage` is supported by `send(options)` and `reply(options)`.

`contextGet(groupId, detail)` accepts `overview`, `summary`, or `full`.
`taskList(options)` supports exact batches, filters, atomic status pages, and
pagination. `groupSpaceSync(options)` is a read-only legacy-status call; use
explicit ingest/source operations for mutations.

## Workflow helpers

Current CCCC workflow contracts are exposed as focused wrappers over daemon IPC:

```typescript
await client.trackedSend({
  groupId,
  title: 'Update SDK',
  text: 'Please handle the compatibility update.',
  insight: 'The compatibility plan may preserve an obsolete boundary.',
  outcome: 'Tests and live compat pass',
  assignee: 'peer-impl',
});

await client.coordinationBriefUpdate({
  groupId,
  objective: 'Ship SDK updates',
  currentFocus: 'context v3 compatibility',
});

await client.taskMove({ groupId, taskId: 't_xxx', status: 'done' });
await client.agentStateUpdate({ groupId, actorId: 'peer-impl', focus: 'testing' });
await client.capabilitySearch({ groupId, query: 'docs' });
```

## Automation semantics

`groupAutomationManage` is action-list based (canonical daemon shape):

```typescript
await client.groupAutomationManage({
  groupId,
  actions: [
    {
      type: 'create_rule',
      rule: {
        id: 'standup',
        enabled: true,
        scope: 'group',
        to: ['@foreman'],
        trigger: { kind: 'interval', every_seconds: 900 },
        action: { kind: 'notify', snippet_ref: 'standup' },
      },
    },
  ],
});
```

Run a saved notification rule once without changing its schedule or run limit:

```typescript
await client.groupAutomationRunNow({ groupId, ruleId: 'standup', expectedVersion: 7 });
```

This creates real notifications and may wake members and use model credits.
The returned Actor IDs identify notices written to the ledger, not confirmed
deliveries. If the response is lost, the outcome may be unknown; do not
silently retry.

## Actor Profiles (global reusable runtime presets)

```typescript
const client = await CCCCClient.create();

const upsert = await client.actorProfileUpsert({
  profile: {
    name: 'Codex',
    runtime: 'codex',
    command: ['codex'],
    submit: 'enter',
    capabilityDefaults: {
      autoloadCapabilities: ['pack:space'],
      defaultScope: 'actor',
    },
  },
});

const profile = upsert.profile as { id?: string } | undefined;
const profileId = String(profile?.id ?? '');

await client.actorAdd({
  groupId,
  actorId: 'reviewer',
  profileId,
});

await client.actorProfileSecretUpdate({
  profileId,
  set: { OPENAI_API_KEY: '...' },
});
```

## Current high-value surfaces

```typescript
const client = await CCCCClient.create();

const caps = await client.capabilityState({
  groupId,
  actorId: 'foreman',
});

const policy = await client.capabilityAllowlistGet();
const preview = await client.capabilityAllowlistValidate({
  mode: 'patch',
  patch: { defaults: { source_level: { skillsmp_remote: 'indexed' } } },
});

const space = await client.groupSpaceStatus({
  groupId,
});

await client.contextSync({
  groupId,
  by: 'user',
  ops: [
    { op: 'coordination.note.add', kind: 'decision', summary: 'Use the simpler path' },
  ],
});
```

If you need a daemon op that does not have a dedicated helper yet, you can always fall back to `call()` / `callRaw()`.

## Current native-daemon compatibility surface

```typescript
// Capture the bounded ANSI screen and exact raw cursor boundary.
const snapshot = await client.terminalSnapshot({
  groupId,
  actorId: 'web-model',
  limitBytes: 512_000,
});

// Read or change the durable delivery mode for a Web Model actor.
const preference = await client.webModelDeliveryPreferencesGet({
  groupId,
  actorId: 'web-model',
});
await client.webModelDeliveryPreferencesUpdate({
  groupId,
  actorId: 'web-model',
  mode: 'image_compat',
});

// Inspect a committed legacy turn without moving the actor cursor.
const recovered = await client.webModelRuntimeRecoverTurn({
  groupId,
  actorId: 'web-model',
  eventIds: ['e_xxx'],
});
```

`termResize()` sends the standard `term_resize` operation. For older compatible
daemon builds that expose `terminal_resize`, the SDK falls back only
after receiving a structured `unknown_op`; transport failures are never
replayed, and the legacy result is normalized to the standard shape.
Auto-discovered clients re-read `ccccd.addr.json` when connection
establishment fails before any request bytes are sent. Explicit endpoints are
never replaced.

`capabilitySourceDelete()` is deliberately source-scoped: the
current daemon does not implement instance-scoped deletion and callers should
not assume otherwise.

## CCCC 0.4.33 compatibility delta

```typescript
// Deliberately rotate provider session metadata for Claude, Codex and Grok.
await client.actorNewSession(groupId, 'reviewer');

// Page through retained PTY output by cursor.
const page = await client.terminalHistory({
  groupId,
  actorId: 'reviewer',
  limitBytes: 64_000,
});

// Large group copies use a daemon-local package path instead of base64 IPC.
const exported = await client.groupCopyExportFile({ groupId });
const packagePath = String(exported.package_path);
const preview = await client.groupCopyPreviewImport({ packagePath });
const copied = await client.groupCopyImport({ packagePath });

// Manage the startup body delivered to the next fresh provider session.
await client.groupPreambleSet({
  groupId,
  content: 'This initialization is not a task. Wait for the targeted mission.\n',
});
const preamble = await client.groupPreambleGet({ groupId });
await client.groupPreambleReset({ groupId, confirm: 'preamble' });

// Upload active-scope files and append one message with daemon-owned attachments.
await client.sendFiles({
  groupId,
  paths: ['reference.png', 'candidate.png'],
  text: 'Inspect these files',
  to: ['reviewer'],
});

// Current terminal operations.
const recent = await client.terminalSince({ groupId, actorId: 'reviewer', after: 0 });
await client.termResize({ groupId, actorId: 'reviewer', cols: 120, rows: 40 });
```

A changed preamble applies on its next delivery; it is not reinjected into a
session that already received one. `groupReset` creates a new group id and
does not carry the override forward. If the preamble establishes a standby
boundary, wait until the actor returns to `waiting` or `idle` before sending
the authoritative mission. `sendFiles` accepts only regular files beneath
the group's active scope and validates every path before appending the message.

`events_stream` compatibility is verified by probing the operation itself;
the SDK does not rely only on the daemon's advertised capability flag.

`groupReset` is destructive: it creates a clean replacement and removes the
old group after copying selected configuration. `confirmGroupId` must equal
`groupId`:

```typescript
await client.groupReset({ groupId, confirmGroupId: groupId });
```

## CCCC 0.4.18 surface — Hermes runtime and Voice Secretary lease

```typescript
// Hermes runtime setup diagnostics and MCP preparation
const status = await client.runtimeHermesStatus();
await client.runtimeHermesPrepare({ cwd: '.', autoEnableTools: true });
await client.runtimeHermesMcpTest({ groupId, actorId: 'hermes-1' });

// Cross-tab Voice Secretary recording guard
const lease = await client.assistantVoiceRecordingLease({
  groupId,
  action: 'acquire',
  ownerId: 'browser-tab-1',
  ttlSeconds: 30,
});
```

## CCCC 0.4.17 surface — new op families

```typescript
const client = await CCCCClient.create();

// Tracked delegation — atomic task.create + send with idempotent replay
const tracked = await client.trackedSend({
  groupId,
  title: 'Fix login race',
  text: 'Please pick this up — see issue link',
  insight: 'The proposed fix may target the symptom rather than the ownership boundary.',
  to: ['alice'],
  idempotencyKey: 'fix-login-race-1',
  refs: [{ kind: 'url', url: 'https://example.com/issue/42' }],
});

// Per-task drill-down
const task = await client.taskList({ groupId, taskId: String(tracked.task_id) });

// Structured refs on chat
await client.send({
  groupId,
  text: 'Looking at the demo deck',
  insight: 'The deck may make the current option set look more settled than it is.',
  refs: [{ kind: 'presentation_ref', slot_id: 'slot-1' }],
});

// Presentation workspace (slot-based viewer)
await client.presentationPublish({
  groupId,
  slot: 'slot-1',
  title: 'Plan',
  cardType: 'markdown',
  content: '# Sprint plan\n- ...',
});

// Read instance-wide Voice Secretary settings
const voiceSettings = await client.call('voice_secretary_settings_get', {});

// Copy a group for migration / backup
const pkg = await client.groupCopyExport({ groupId });
const newGroup = await client.groupCopyImport({ packageB64: String(pkg.package_b64) });

// Headless runtime control
await client.headlessSetStatus({ groupId, actorId: 'reviewer', status: 'working' });

// Capability Center extensions
await client.capabilityInstallTarget({
  groupId,
  target: 'github:owner/repo',
  actorId: 'reviewer',
  scope: 'session',
  ttlSeconds: 600,
});

// Operator-side: terminal tail, ledger snapshot, branding/observability
await client.terminalTail({ groupId, actorId: 'reviewer', maxChars: 4000 });
await client.ledgerSnapshot({ groupId, reason: 'manual' });
await client.brandingUpdate({ patch: { product_name: 'My CCCC' } });
```

Use `call()` for intentionally low-level or newly added non-streaming ops that
do not yet have a dedicated helper. Duplex browser/VNC/PTY attach operations
remain outside this request/response client and require a separate streaming
transport contract. See `spec/ADAPTATION_PLAN.md` for the exact boundary.

## Events stream

```typescript
for await (const item of client.eventsStream({ groupId })) {
  if (item.t === 'event') {
    console.log(item.event.kind, item.event.id);
  }
}
```

## Build and checks

```bash
npm ci
npm run typecheck
npm run build
```

## Requirements

- Node.js 18+
- Running CCCC daemon

## License

Apache-2.0

## CCCC compatibility

All three SDK package versions target CCCC 0.4.50. `spec/core.json` pins the
reviewed core revision. See the
[0.4.47 migration guide](https://github.com/ChesterRa/cccc-sdk/blob/main/spec/SDK_0447_MIGRATION.md)
for exact message reads, Inbox summaries, removed Voice operations and daemon
version limitations. Matching version numbers do not replace capability checks.
For removed Group memory helpers, see the
[memory migration guide](https://github.com/ChesterRa/cccc-sdk/blob/main/spec/SDK_LOCAL_MEMORY_API.md).

Qualified Connect sends require a stable caller-owned retry key:

```ts
await client.connectSend({ groupId: 'local', instanceId: 'remote-instance', targetGroupId: 'remote-group',
  clientId: 'retained-caller-key', text: 'Please review', mode: 'mail' });
```

Use `connect_catalog` / `connectCatalog` to read authorized cached peers and
`connect_send_files` / `connectSendFiles` to send files from the daemon's project
scope. Accepted means queued locally, not confirmed delivery. Keep the same key
and body after an uncertain result; the SDK never automatically replays a send.
Connect replies use the local received event ID with the ordinary reply helper.

`context_sync(if_version=...)` / `contextSync({ ifVersion })` rejects stale
updates with `version_conflict`. Reload before deciding whether to reapply.
Terminal history accepts `render_before` / `renderBefore` alongside `before`.

Compatibility requirements that lack an advertised capability and an audited
safe probe now fail instead of being executed or silently skipped. Retired
Presentation browser and Voice model-install helpers fail locally with migration
guidance; their interactive replacement belongs to CCCC Web, not daemon IPC.

## Voice library and Web Models

Use `assistantVoiceDocumentLibrary`, `assistantVoiceDocumentLibraryUpdate` and
`assistantVoiceDocumentDelete` for the stored Voice document library.
`VoiceDocumentLibraryUpdateOptions` and `VoiceDocumentLibraryResult` are exported.
Updates organize folders/documents and restore archives; delete permanently
removes the Markdown file. Empty `rootOrder: []` clears ordering and
`folderId: ''` moves a document to root. The daemon enforces all permissions.

`actorAdd({ runtime: 'grok_web_model', ... })` configures a Grok Bot Actor; `grok`
is the separate CLI runtime. CCCC Web sets up its Bot URL, native Webhook
Routine credentials and remote MCP connector. Grok delivery uses no CCCC-managed
browser login. ChatGPT `web_model` uses its separate browser path.
