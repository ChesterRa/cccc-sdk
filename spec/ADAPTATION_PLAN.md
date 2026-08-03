# CCCC SDK — Adaptation Plan

This plan is based on operation-by-operation audits through CCCC v0.4.33,
completed on 2026-08-03. The SDK source packages now target v0.4.33;
the work remains unreleased until the normal package release process is run.

The goal is contract alignment, not one wrapper per daemon implementation
detail. Public SDK methods should represent stable capabilities that an
external application can use safely. Internal relay operations and
operator-only mechanisms stay out of the default client unless a real SDK
consumer establishes a durable contract for them.

## v0.4.33 alignment status

The v0.4.33 pass preserves the complete v0.4.32 public surface and adds the
current Rust-daemon contracts for:

```
group_preamble_get / group_preamble_set / group_preamble_reset
terminal_since / terminal_resize
assistant_voice_* document, input, prompt, and request workflows
memory_reme_* maintenance controls
web_model_runtime_wait_next_turn / web_model_runtime_complete_turn
im_* management / remote_access_* administration
```

Chat helpers now map `require_peer_insight`, actor profiles map the current
profile marker, and compatibility checks probe `events_stream` itself rather
than trusting a capability advertisement. The old `assistant_voice_transcribe`
IPC operation is deliberately rejected locally with migration guidance because
the Rust daemon moved transcription to its supported HTTP workflow.

Client implementations are split into operation-family mixins to keep each
module focused while preserving the existing public client classes.

### Validation evidence (2026-08-03)

- Python: 52 tests passed; source compilation and wheel build succeeded.
- TypeScript: 89 tests passed; typecheck, build, and npm package dry-run
  succeeded.
- A live Rust 0.4.33 daemon accepted the current group-preamble and terminal
  operations. It advertised `events_stream` but returned `unknown_op` to an
  operation probe; the SDK now detects and reports that mismatch before a
  message workflow begins.

## v0.4.32 baseline retained

Compared with v0.4.18, the daemon added 13 regular request/response operations
and removed the three PET decision operations.

The SDK now covers the stable public part of that release delta:

```
memory_search
memory_get
memory_write
memory_profile_get
memory_health
actor_new_session
group_reset
group_copy_export_file
terminal_history
```

It also aligns the surrounding contracts:

- chat messages expose `insight`, source attribution, remote-reply metadata,
  and `suggested_user_message`;
- `chat.cross_group_receipt` has a typed TypeScript event shape and guard;
- group-copy preview/import accepts exactly one of base64 package content or a
  package path;
- the runtime and internal-assistant catalogs reflect v0.4.32;
- the removed PET methods and obsolete context `resume_hint` are no longer in
  the SDK surface.

Four new daemon operations are intentionally not exposed as first-class SDK
methods:

- `group_bridge_receive_remote_send` and `relay_user_delegation` are internal
  routing operations;
- `remote_send` and `remote_delivery_status` are lower-level bridge operations
  without a public standard contract. Applications should use
  `send_cross_group`, whose acknowledgement and receipt semantics are public.

This distinction matters: matching implementation op counts is not the same as
maintaining a coherent public API.

### Baseline validation evidence (2026-07-19)

- Python: 48 tests passed; sdist and wheel built successfully.
- TypeScript: 84 tests passed; typecheck and package build succeeded.
- The three mirrored standards match the v0.4.32 core files byte-for-byte.
- An isolated v0.4.32 daemon probe exercised first-class memory, structured
  message metadata, file-path group copy, guarded group reset, operation
  recognition for fresh sessions and terminal history, and removal of PET
  operations.

## Remaining capability families

These are older gaps rather than regressions introduced by v0.4.32. They
should be added only when a concrete external SDK use case justifies their
contract and support burden.

### 1. ChatGPT Web Model browser lifecycle (5 ops)

```
web_model_browser_open
web_model_browser_info
web_model_browser_close
web_model_browser_attach              # streaming
web_model_browser_vnc_attach          # streaming
```

The runtime turn operations are wrapped. Browser lifecycle and attach
operations remain operator-facing and should be designed with the client that
will actually consume them.

### 2. Socket-special operations

```
term_attach
presentation_browser_attach
presentation_browser_vnc_attach
web_model_browser_attach
web_model_browser_vnc_attach
space_provider_auth_browser_attach
space_provider_auth_browser_vnc_attach
```

Terminal resize is wrapped through the daemon's `terminal_resize` operation.
The attach operations switch from a
JSON request/response exchange to a duplex byte stream after the handshake.
They require a deliberate transport abstraction, ownership and close
semantics, backpressure behavior, and binary-stream tests in both languages.

Do not generalize `open_events_stream` merely to reduce wrapper duplication.
First identify a real terminal, browser, or VNC consumer and design the
smallest transport contract that supports its lifecycle correctly.

## Recommended next iterations

1. **Finalize v0.4.33 alignment.** Review the validated diff as a public API
   change, then commit only after explicit approval. Tagging and publishing
   remain separate release actions.
2. **Add drift detection.** Turn the operation/type comparison used for this
   audit into a repeatable CI report. It should classify added/removed daemon
   operations as public, internal, lower-level, or intentionally deferred;
   equality of raw op sets must not be the pass condition.
3. **Choose one consumer-backed capability slice.** Voice Secretary, Web
   Model, admin controls, or duplex attach should proceed only with a named
   consumer and an end-to-end acceptance flow. Without that evidence, keeping
   the SDK smaller is the more stable choice.

## Release gate

For each core upgrade:

1. diff regular and socket-special daemon operation registries against the
   previous supported core tag;
2. diff public message, actor/runtime, event, context, and async-result
   contracts;
3. verify Python/TypeScript method parity and intentional-exclusion notes;
4. verify the three mirrored standards byte-for-byte against CCCC core;
5. run both test suites, TypeScript typecheck/build, and package builds;
6. run isolated live-daemon probes for new and destructive operations;
7. review documentation and changelog wording as an external consumer would.

## Contract watch points

- `Reference.kind` and remote/cross-group message metadata in
  `contracts/v1/message.py`.
- `AgentRuntime` and internal-assistant identifiers in
  `contracts/v1/actor.py`.
- `EventKind`, especially new chat receipt, assistant, and presentation events.
- Context state fields such as `open_loops`; removed fields must stop being
  emitted rather than lingering as compatibility noise.
- Async-result envelope fields in `contracts/v1/async_result.py`; update the
  TypeScript shape if optionality changes.
