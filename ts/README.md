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
- `insight`: visible provisional perspective for peer-facing messages
- `requirePeerInsight`: opt-in daemon profile gate for peer-facing messages

Supported in:
- `send(options)`
- `reply(options)`
- `sendCrossGroup(options)`
- `trackedSend(options)`

## Workflow helpers

Current CCCC workflow contracts are exposed as focused wrappers over daemon IPC:

```typescript
await client.trackedSend({
  groupId,
  title: 'Update SDK',
  text: 'Please handle the compatibility update.',
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

## CCCC 0.4.33 JSON alignment

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

// Current request/response JSON helpers
await client.send({
  groupId,
  text: 'Next step',
  suggestedUserMessage: 'Run the checks',
  insight: 'The compatibility gate is the release-critical part.',
});
await client.actorNewSession({ groupId, actorId: 'codex-1', clearSavedSession: true });
await client.groupCopyExportFile({ groupId, includeBlobs: true });
await client.groupPreambleSet({ groupId, content: 'Project-specific startup guidance' });
await client.terminalHistory({ groupId, actorId: 'codex-1', limitBytes: 64_000 });
await client.terminalSince({ groupId, actorId: 'codex-1', after: 0 });
await client.termResize({ groupId, actorId: 'codex-1', cols: 120, rows: 40 });
await client.blueprintGenerate({ groupId, taskId: 'task-1' });
await client.memoryRemeSearch({ groupId, query: 'release notes' });
await client.imListAuthorized({ platform: 'dingtalk' });
await client.remoteAccessState({ groupId });
```

## CCCC 0.4.17 surface — new op families

```typescript
const client = await CCCCClient.create();

// Tracked delegation — atomic task.create + send with idempotent replay
const tracked = await client.trackedSend({
  groupId,
  title: 'Fix login race',
  text: 'Please pick this up — see issue link',
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

// Built-in assistant lifecycle (PET / Voice Secretary)
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

The current request/response JSON ops are wrapped in the Python and TypeScript
clients. Still deferred: streaming socket-special attach ops such as PTY,
browser, VNC, and web-model attach flows; those need a shared duplex transport
instead of a plain `call()` / `callRaw()` wrapper. See
`spec/ADAPTATION_PLAN.md` for the roadmap.

## Events stream

Require the operation explicitly before relying on it. This probes the daemon
instead of trusting a capability flag that may be stale or incorrect:

```typescript
await client.assertCompatible({ requireOps: ['events_stream'] });

for await (const item of client.eventsStream({ groupId })) {
  if (item.t === 'event') {
    console.log(item.event.kind, item.event.id);
  }
}
```

`sendAndWaitForReply()` performs the same probe before sending, so an unavailable
stream cannot produce a sent message followed by an `unknown_op` failure.

Voice transcription is no longer a daemon JSON operation in Rust CCCC. Use the
HTTP Voice Secretary transcription endpoint; the deprecated
`assistantVoiceTranscribe()` helper now fails locally with a migration message.

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
