# CCCC TypeScript SDK

TypeScript/Node.js client for the CCCC daemon (IPC v1).

## Installation

```bash
npm install cccc-sdk
```

## Quick Start

```typescript
import { CCCCClient } from 'cccc-sdk';

async function main() {
  // Create client (auto-discovers daemon endpoint)
  const client = await CCCCClient.create();

  // Check compatibility
  await client.assertCompatible({ requireIpcV: 1 });

  // Ping daemon
  const info = await client.ping();
  console.log('Daemon info:', info);

  // Create a group
  const group = await client.groupCreate({ title: 'My Group' });
  console.log('Created group:', group);

  // Send a message
  await client.send({
    groupId: group.group_id as string,
    text: 'Hello from TypeScript!',
  });
}

main().catch(console.error);
```

## Events Stream

```typescript
import { CCCCClient } from 'cccc-sdk';

async function main() {
  const client = await CCCCClient.create();

  // Subscribe to events
  for await (const item of client.eventsStream({ groupId: 'my-group' })) {
    if (item.t === 'event') {
      console.log('Event:', item.event);
    } else if (item.t === 'heartbeat') {
      console.log('Heartbeat:', item.ts);
    }
  }
}

main().catch(console.error);
```

## API Reference

### CCCCClient

#### Factory Method

```typescript
static async create(options?: CCCCClientOptions): Promise<CCCCClient>
```

Options:
- `ccccHome?: string` - Custom CCCC home directory
- `endpoint?: DaemonEndpoint` - Manual endpoint configuration
- `timeoutMs?: number` - Request timeout (default: 30000)

#### Low-Level Methods

```typescript
async callRaw(op: string, args?: Record<string, unknown>): Promise<DaemonResponse>
async call(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>
async assertCompatible(options?: CompatibilityOptions): Promise<Record<string, unknown>>
```

#### Group Methods

```typescript
async groups(): Promise<Record<string, unknown>>
async groupShow(groupId: string): Promise<Record<string, unknown>>
async groupCreate(options?: GroupCreateOptions): Promise<Record<string, unknown>>
async groupDelete(groupId: string, by?: string): Promise<Record<string, unknown>>
async groupStart(groupId: string, by?: string): Promise<Record<string, unknown>>
async groupStop(groupId: string, by?: string): Promise<Record<string, unknown>>
```

#### Actor Methods

```typescript
async actorList(groupId: string): Promise<Record<string, unknown>>
async actorAdd(options: ActorAddOptions): Promise<Record<string, unknown>>
async actorStart(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>
async actorStop(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>
async actorRemove(groupId: string, actorId: string, by?: string): Promise<Record<string, unknown>>
```

#### Messaging Methods

```typescript
async send(options: SendOptions): Promise<Record<string, unknown>>
async reply(options: ReplyOptions): Promise<Record<string, unknown>>
async chatAck(groupId: string, actorId: string, eventId: string, by?: string): Promise<Record<string, unknown>>
```

#### Events Stream

```typescript
async *eventsStream(options: EventsStreamOptions): AsyncGenerator<EventStreamItem>
```

### Error Classes

```typescript
class CCCCSDKError extends Error
class DaemonUnavailableError extends CCCCSDKError
class DaemonAPIError extends CCCCSDKError {
  code: string
  details: Record<string, unknown>
  raw?: DaemonResponse
}
class IncompatibleDaemonError extends CCCCSDKError
```

## Examples

See the `examples/` directory for runnable examples:

```bash
# Ping the daemon
npx tsx examples/ping.ts

# Create group and send messages
npx tsx examples/send.ts

# Subscribe to event stream
npx tsx examples/stream.ts <group-id>
```

## Requirements

- Node.js 16+
- CCCC daemon running (`ccccd`)

## License

Apache-2.0
