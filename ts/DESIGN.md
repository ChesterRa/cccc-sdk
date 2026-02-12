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
- `src/types.ts`: IPC-facing option and payload types.
- `src/errors.ts`: typed error hierarchy.
- `src/index.ts`: public exports and package version.

## Contract mapping rules

- SDK uses daemon canonical field names at the wire level (`group_id`, `reply_required`, ...).
- Public API uses camelCase option names (`groupId`, `replyRequired`, ...).
- Message priority is strict: `'normal' | 'attention'`.
- `groupAutomationManage` is strict `actions[]` mode (no legacy alias fields).

## Error model

- Transport/connect failures -> `DaemonUnavailableError`.
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
