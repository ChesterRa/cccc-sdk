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
    requireCapabilities: { events_stream: true },
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
await client.memorySearch({ groupId, query: 'recent decisions' });
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
