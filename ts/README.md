# CCCC TypeScript SDK

TypeScript/Node.js client for the CCCC daemon (IPC v1).

## Relationship to CCCC core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` core provides daemon/web/CLI and owns runtime state.
- `cccc-sdk` provides Node.js client APIs that call the daemon over IPC.

## Installation

```bash
npm install cccc-sdk
```

Compatibility is determined by Daemon IPC v1 contracts and operation probing, not by strict package-version matching.

Omitting the optional `insight` property remains compatible with older IPC v1 daemons. Supplying it requires a daemon whose `chat.message` contract includes `insight`; upgrade the SDK and daemon together when adopting this field.

## Quick start

```typescript
import { CCCCClient } from 'cccc-sdk';

async function main() {
  const client = await CCCCClient.create();

  await client.assertCompatible({
    requireIpcV: 1,
    requireOps: ['groups', 'send', 'reply', 'tracked_send', 'context_sync'],
  });

  const group = await client.groupCreate({ title: 'TS demo' });
  const groupId = group.group.group_id;

  await client.send({
    groupId,
    text: 'Please check this and reply.',
    priority: 'attention',
    replyRequired: true,
  });
}

main().catch(console.error);
```

## Message semantics

- `priority`: `'normal' | 'attention'`
- `replyRequired`: `boolean` (maps to daemon `reply_required`)
- `insight`: optional visible, provisional sender perspective for independent recipient judgment
- `suggestedUserMessage`: optional proposed next human message; stored visibly and never auto-sent

Supported in:
- `send(options)`
- `reply(options)`
- `sendCrossGroup(options)`
- `trackedSend(options)`

`suggestedUserMessage` is supported by `send(options)` and `reply(options)`.

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
await client.memoryHealth({ groupId });
const profile = await client.memoryProfileGet({
  groupId,
  actorId: 'dingtalk-worker',
  tags: ['dingtalk-profile', 'reply-style'],
});
const hits = await client.memorySearch({
  groupId,
  actorId: 'dingtalk-worker',
  query: 'How should I reply to this message?',
  limit: 5,
  minScore: 0.2,
  target: 'memory',
});
await client.memoryWrite({
  groupId,
  actorId: 'dingtalk-worker',
  target: 'daily',
  content: 'user: ...\nassistant: ...',
  tags: ['dingtalk-auto-reply'],
  sourceRefs: ['dingtalk:message:m1'],
  idempotencyKey: 'dingtalk-reply:m1',
});
```

Local memory helpers use daemon `memory_*` ops and are intended for fast local
CCCC memory access. They do not depend on Group Space / NotebookLM bindings.
For raw ReMe result shapes or source selection, use `memoryRemeSearch` and
`memoryRemeGet`. See `spec/SDK_LOCAL_MEMORY_API.md` in the repository root.

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

## Actor Profiles (global reusable runtime presets)

```typescript
const client = await CCCCClient.create();

const upsert = await client.actorProfileUpsert({
  profile: {
    name: 'Codex PTY',
    runtime: 'codex',
    runner: 'pty',
    command: ['codex', 'exec'],
    submit: 'enter',
    env: { CODEX_MODEL: 'gpt-5' },
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

## CCCC 0.4.33 compatibility delta

```typescript
// Deliberately rotate provider session metadata for Claude/Codex/Grok PTY.
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

// Built-in Voice Secretary lifecycle
await client.assistantSettingsUpdate({
  groupId,
  assistantId: 'voice_secretary',
  patch: { enabled: true },
});

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

Not yet wrapped (use `call()` for now): remaining Voice Secretary document/transcribe/prompt ops, remaining Memory ReMe write/index/compaction ops, ChatGPT Web Model runtime, IM bridge management, Remote Access, and the streaming socket-special browser/PTY attach ops. See `spec/ADAPTATION_PLAN.md` for the roadmap.

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
