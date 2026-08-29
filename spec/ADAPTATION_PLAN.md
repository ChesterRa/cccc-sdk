# CCCC SDK adaptation boundary

Updated 2026-08-29 for the CCCC 0.4.36 native-only transition. This document
describes source compatibility work; package version changes and publication
are separate release decisions.

## Product boundary

- CCCC ships one native Rust daemon/web/CLI product and owns all runtime state
  under `CCCC_HOME`.
- This repository ships Python, TypeScript, and Rust **client** SDKs. An SDK's
  implementation language does not select, embed, or replace the daemon.
- The three files mirrored from `cccc/docs/standards/` are authoritative. SDK
  helpers may improve language ergonomics but must preserve their wire shapes.
- Compatibility is determined by `ipc_v`, capabilities, and safe operation
  probes. The bundled daemon reports `implementation="rust"`, but clients do
  not treat that label alone as a compatibility proof.

## Current public alignment

The 0.4.36 source target makes one atomic messaging cut:

- every new message selects `send`, `request_reply`, or `mail`;
- one audience domain is allowed per message: human user or agents, never both;
- Mail is agent-only, enters the Mail Inbox, and does not immediately prompt a
  runtime;
- replies select `send` (default) or `mail`; both fulfill the original reply
  request, and replies cannot create another generic reply request;
- Inbox peek/read, non-consuming message history, manual delivery, and
  reply-request cancellation use their current daemon operations;
- retired generic ACK/read operations and legacy delivery fields are not
  translated or silently downgraded.

Context and Group Space helpers follow the same current contract:

- `context_get` exposes `overview`, `summary`, and `full` projections;
- existing task-list helpers support exact lookup/batches, filters, atomic
  status pages, and pagination;
- `group_space_sync` is legacy read-only status. Explicit ingest/source
  operations are the mutation path.

## Intentional generic-only operations

Public SDK quality is not measured by wrapper count. These boundaries remain
generic unless an external consumer requires a stable typed API:

- `message_upload_preflight`, which coordinates Web-owned temporary uploads;
- internal Group Bridge relay/record operations;
- duplex browser, terminal, and attachment upgrade operations that require a
  dedicated streaming ownership model;
- administrative or provider internals without a portable external workflow.

All non-streaming operations remain reachable through `call` / `call_raw`.
Compatibility probing must skip operations whose probe would mutate state or
open an upgraded stream.

## Source and release gates

Before committing an alignment change:

1. `scripts/check_specs_against_cccc.sh` must prove that all mirrored standards
   are byte-identical to the selected CCCC checkout.
2. Python, TypeScript, and Rust contract/transport suites must pass.
3. Source compilation/type checking, package builds, Rust formatting, clippy,
   and packaging checks must pass.
4. Examples and READMEs must describe one native daemon and three independent
   client languages; obsolete dual-engine or `ccccd` command guidance must not
   remain.
5. Package manifests stay unchanged until the release version is explicitly
   chosen. No sync task may tag, publish, or deploy artifacts.

Rollback is repository-local: revert the SDK commit without changing the CCCC
runtime or `CCCC_HOME`. Because this repository contains clients only, contract
alignment must never mutate daemon state during build or test.
