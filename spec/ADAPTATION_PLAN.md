# CCCC SDK adaptation boundary

Updated 2026-08-29 for the CCCC 0.4.36 native-only transition. This document
describes source compatibility work; package version changes and publication
remain separate release decisions.

## Product boundary

- CCCC ships one native Rust daemon/web/CLI product and owns runtime state under
  `CCCC_HOME`.
- This repository ships Python, TypeScript, and Rust client SDKs. An SDK's
  implementation language does not select, embed, or replace the daemon.
- The three files mirrored from `cccc/docs/standards/` are authoritative.
- Compatibility is determined by `ipc_v`, capabilities, and safe operation
  probes, not by exact product-version or implementation-label equality.

## Current public alignment

The 0.4.36 source target makes one atomic messaging cut:

- every new message selects `send`, `request_reply`, or `mail`;
- one message addresses the human user or agents, never both audience domains;
- Mail is agent-only, enters the Mail Inbox, and does not immediately prompt a
  runtime;
- replies select `send` or `mail`; both fulfill the original reply request;
- `inbox_peek` and atomic `inbox_read` replace the retired generic ACK/read
  model;
- non-consuming history, manual delivery, and reply-request cancellation use
  their current daemon operations.

The Rust identity-bound adapter follows the same boundary. Stable `client_id`
values reconcile ambiguous send/reply writes, while Mail consumption delegates
to the daemon's atomic `inbox_read` transaction. It does not emulate removed
`inbox_list`, `inbox_mark_read`, or per-message ACK operations.

Transport behavior follows the normative safety rules: requests are bounded
before connecting, response IPC versions are validated, auto-discovered
endpoints refresh only after a pre-write connection failure, and failures after
exchange begins are reported as outcome-unknown without automatic replay.

Context and Group Space helpers follow the current contract:

- `context_get` exposes `overview`, `summary`, and `full` projections;
- task-list helpers support exact lookup/batches, filters, atomic status pages,
  and pagination;
- `group_space_sync` is legacy read-only status; explicit ingest/source
  operations remain the mutation path.

## Intentional generic-only operations

Public SDK quality is not measured by wrapper count. These boundaries remain
generic until a concrete external consumer requires a stable typed API:

- `message_upload_preflight`, which coordinates Web-owned temporary uploads;
- internal Group Bridge relay/record operations;
- duplex browser, terminal, and attachment upgrades that require dedicated
  stream ownership and backpressure semantics;
- administrative or provider internals without a portable external workflow.

All non-streaming operations remain reachable through `call` / `call_raw`.
Compatibility probing skips operations that mutate state or open an upgraded
stream.

## Source and release gates

Before committing an alignment change:

1. `scripts/check_specs_against_cccc.sh` proves all mirrored standards are
   byte-identical to the selected committed CCCC revision.
2. Python, TypeScript, and Rust contract/transport suites pass.
3. Source compilation/type checking, package builds, Rust formatting, clippy,
   MSRV, and packaging checks pass.
4. Current-daemon integration covers the atomic message modes and Mail Inbox.
5. Examples and READMEs describe one native daemon and three client languages;
   obsolete dual-engine, ACK/read, and `ccccd` guidance is absent.
6. No sync task tags, publishes, or deploys artifacts.

Rollback is repository-local: revert the SDK commit without changing the CCCC
runtime or `CCCC_HOME`. Contract alignment must never mutate daemon state during
ordinary build or unit-test gates.
