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

## Quick start

```typescript
import { CCCCClient } from 'cccc-sdk';

async function main() {
  const client = await CCCCClient.create();

  await client.assertCompatible({
    requireIpcV: 1,
    requireCapabilities: { events_stream: true },
    requireOps: ['groups', 'send', 'reply', 'group_automation_manage'],
  });

  const group = await client.groupCreate({ title: 'TS demo' });
  const groupId = String(group.group_id || '');

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

- Node.js 16+
- Running CCCC daemon

## License

Apache-2.0
