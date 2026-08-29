# CCCC TypeScript SDK Design

## Goal

Provide a small, contract-first Node.js client for CCCC daemon IPC v1 with:
- predictable request/response mapping,
- strong TypeScript ergonomics,
- parity with the Python SDK on core operations.

## Scope

In scope:
- endpoint discovery (`ccccd.addr.json` and unix fallback),
- IPC request helpers (`callRaw`, `call`),
- compatibility probing (`ipc_v`, capabilities, op support),
- group/actor/message/inbox/context/automation convenience methods,
- events stream (NDJSON line protocol).

Out of scope:
- daemon lifecycle orchestration,
- storage/ledger ownership,
- non-IPC business logic.

## Package layout

- `src/transport.ts`: endpoint discovery, socket I/O, events stream handshake.
- `src/client.ts`: high-level SDK methods.
- `src/client_0434_ops.ts`: current terminal/Web Model contract additions.
- `src/types.ts`: IPC-facing option and payload types.
- `src/errors.ts`: typed error hierarchy.
- `src/index.ts`: public exports and package version.

## Contract mapping rules

- SDK uses daemon canonical field names at the wire level (`group_id`, `message_mode`, ...).
- Public API uses camelCase option names (`groupId`, `sourceEventId`, ...).
- New messages require one strict mode: `'mail' | 'send' | 'request_reply'`.
- Reply and tracked-send helpers do not expose a second delivery/obligation control.
- `groupAutomationManage` is strict `actions[]` mode (no legacy alias fields).

## Error model

- Connection-establishment failures -> `DaemonConnectionError` and one safe
  endpoint rediscovery for auto-discovered clients.
- Failures after exchange begins -> `OutcomeUnknownError` and no automatic replay.
- Oversized requests -> `RequestTooLargeError` before connecting.
- Daemon `ok:false` responses -> `DaemonAPIError` with `code/message/details/raw`.
- Compatibility failures -> `IncompatibleDaemonError`.

## Compatibility strategy

SDK version tracks CCCC major/minor, but release cadence is independent.
Runtime compatibility is asserted via:
- `ping.ipc_v`,
- `ping.capabilities`,
- probing required operations and rejecting `unknown_op`.

## Testing strategy

- Python SDK unit tests validate transport and payload-shape parity.
- TS CI enforces `typecheck + build` for every change under `ts/`.
- Cross-repo daemon integration remains available via workflow dispatch.
