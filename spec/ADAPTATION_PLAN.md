# CCCC SDK — Adaptation Plan

This plan is based on an operation-by-operation audit of current CCCC `main`
(the v0.4.34 release-candidate line plus subsequent commits), refreshed on
2026-08-11 at core revision `7943724bf1025265d0716b2b181b3890efe24051`.
The SDK source tree targets that contract; Python, TypeScript, and Rust package
publication remains a separate release process.

The goal is contract alignment, not one wrapper per daemon implementation
detail. Public SDK methods should represent stable capabilities that an
external application can use safely. Internal relay operations and
operator-only mechanisms stay out of the default client unless a real SDK
consumer establishes a durable contract for them.

## v0.4.34 release-candidate alignment status

The three SDKs now expose focused helpers for the current public delta:

```
terminal_snapshot
web_model_delivery_preferences_get
web_model_delivery_preferences_update
web_model_runtime_recover_turn
task.delete (Python/TypeScript convenience wrapper; generic in Rust)
```

Python and TypeScript removed non-contract `clear_saved_session` and
`include_blobs` request fields and use the normative `term_resize` operation
first.
All three clients accept the temporary Rust-daemon `terminal_resize` alias only
after a structured `unknown_op` and normalize its shorter success payload to the
standard result. TypeScript includes `cline` in its known runtime literals and
its `INVALID_REQUEST` constant now matches the daemon's `invalid_request` code.

The same operation-by-operation pass corrected the ReMe maintenance, global
Remote Access, group-scoped IM authorization, Voice model installation, group
copy, and chat argument maps. Cross-group sends now stay within the portable v1
field set, while capability-source deletion no longer accepts a misleading
instance key that the daemon ignores before deleting the whole source.

The latest core sync also extends existing Python and TypeScript surfaces with
Voice Secretary request/input idempotency, general Voice Secretary instruction
input, explicit system-notification IM visibility, opaque string IM thread IDs,
candidate provider-health credentials, projected/disconnect provider auth, and
the complete artifact download-format set. Newly documented group-help,
actor-note, terminal-replay, and assistant feedback/history operations remain
available through the generic non-streaming call surface; no consumer-backed
first-class wrapper was added merely to mirror implementation operation count.

Transport behavior is also aligned with the current normative safety language:
requests are bounded before connecting, explicit response IPC versions are
validated, auto-discovered endpoints are refreshed only after a pre-write
connection failure, and failures after exchange begins are never replayed.
Connectable IPv6 descriptor hosts are preserved in all three SDKs, while IPv4
and IPv6 wildcard hosts are converted to matching loopback addresses. Rust and
TypeScript expose explicit outcome-unknown errors; Python provides the same
distinction, including malformed post-write response envelopes, while retaining
`DaemonUnavailableError` compatibility. TypeScript cancellation also covers
the TCP connection phase instead of beginning only after the stream handshake.

### Current core-side parity blockers

These cannot be repaired honestly inside an external SDK and remain visible in
live compatibility probes:

- Python daemon does not recognize `terminal_since` or `terminal_snapshot`;
  Rust recognizes both.
- Rust daemon recognizes `terminal_resize` instead of standard `term_resize`.
- Rust advertises `events_stream=true` but returns `unknown_op`, and still lacks
  several Python-only assistant and Presentation browser lifecycle operations.

The SDK therefore provides safe resize compatibility and generic non-streaming
calls, but does not claim that the two core daemon implementations are already
operation-for-operation equivalent.

### Current core-standard omissions

The byte-identical SDK mirror cannot document fields that are absent from the
authoritative CCCC standard. Current daemon handlers nevertheless accept
additional SDK-used fields, including actor profile scope/owner, advanced
`tracked_send` task metadata, message reliability fields on `send`/`reply`,
`reply_required` on cross-group send, and Python's `prompt_request_id` filter on
`assistant_state`. These helpers remain available because they are backed by
current core handlers and tests, but the authoritative standard should be
expanded before they are described as normative cross-implementation v1.

### Validation evidence (2026-08-11)

- Python: 77 contract/transport tests, source compilation, sdist, and wheel
  build passed.
- TypeScript: 114 tests, strict source and exported-option fixture typechecks,
  build, and npm package dry-run passed.
- Rust: formatting, warning-free clippy, 12 tests, and locked crate packaging
  passed.
- All three mirrored standards match core revision
  `7943724bf1025265d0716b2b181b3890efe24051` byte-for-byte; scheduled CI now
  detects future drift.
- In the 2026-08-08 live probe, a current Rust daemon bound to the IPv6 loopback
  wrote a connectable `::1`
  descriptor, and Python, TypeScript, and Rust clients all discovered it and
  completed IPC v1 compatibility calls against CCCC 0.4.34-rc2.
- The 2026-08-08 isolated Python-daemon probes passed through all eight corrected
  Python ReMe helpers plus Remote Access and IM authorization, with matching
  representative TypeScript calls. Earlier isolated Python/Rust daemon probes
  also passed all three compatibility examples and Web Model
  delivery-preference round trips. A compiled Rust SDK probe against the current
  Rust daemon additionally passed typed terminal snapshot/since and the
  normalized legacy resize fallback.
- Known implementation gaps above remain release blockers for core parity, not
  hidden SDK fallbacks.

## v0.4.33 alignment status

The v0.4.33 pass preserves the complete v0.4.32 public surface and adds the
current Rust-daemon contracts for:

```
group_preamble_get / group_preamble_set / group_preamble_reset
send_files
terminal_since / terminal resize compatibility
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

Group preamble management has a concrete external consumer: a fresh provider
session can enter bounded standby before its targeted mission arrives. The SDK
requires non-empty, at-most-512-KiB content and makes reset confirmation an
explicit caller action. Preamble delivery and the following mission are not
atomic, so consumers using standby as an execution boundary must observe the
actor return to `waiting` or `idle` before sending the authoritative mission.

`send_files` is the consumer-backed upload boundary for active-scope files. It
asks the daemon to validate and read every path, store the blobs, and append one
normal chat event. SDK consumers therefore do not write `state/blobs/` directly
or manufacture attachment records.

### Validation evidence (2026-08-03)

- Python: 52 tests passed; source compilation and wheel build succeeded.
- TypeScript: 89 tests passed; typecheck, build, and npm package dry-run
  succeeded.
- A live Rust 0.4.33 daemon accepted the current group-preamble and terminal
  operations. It advertised `events_stream` but returned `unknown_op` to an
  operation probe; the SDK now detects and reports that mismatch before a
  message workflow begins.

### Reconciliation validation (2026-08-06)

- Python: 54 tests passed; source compilation, sdist, and wheel builds passed.
- TypeScript: 91 tests passed; typecheck, build, and npm package dry-run passed.
- Rust: formatting, warning-free clippy, 5 tests, and locked package
  verification passed.
- All three mirrored standards match the current CCCC core files byte-for-byte.
- An isolated current-core daemon completed Python and TypeScript preamble and
  `send_files` round trips. A mixed valid/missing file batch appended no chat
  event; the following valid two-file batch appended exactly one event with two
  attachments. The Rust compatibility example also recognized `send_files`.

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

### 1. ChatGPT Web Model browser lifecycle (2 ops)

```
web_model_browser_attach              # streaming
web_model_browser_vnc_attach          # streaming
```

Delivery preferences and recovery are wrapped. Browser attach operations remain
operator-facing and should be designed with the client that will consume the
duplex surface.

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

Terminal resize is wrapped through standard `term_resize`, with the bounded
legacy alias fallback described above.
The attach operations switch from a
JSON request/response exchange to a duplex byte stream after the handshake.
They require a deliberate transport abstraction, ownership and close
semantics, backpressure behavior, and binary-stream tests in both languages.

Do not generalize `open_events_stream` merely to reduce wrapper duplication.
First identify a real terminal, browser, or VNC consumer and design the
smallest transport contract that supports its lifecycle correctly.

## Recommended next iterations

1. **Close core daemon parity gaps.** Fix standard-op recognition and truthful
   capability advertisement in CCCC core, then run the SDK integration matrix
   against both implementations.
2. **Review and release deliberately.** Treat the validated SDK diff as a
   public API change; commit, tag, and publish remain separate approval gates.
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
5. run all three test suites, TypeScript typecheck/build, Rust clippy/format,
   and package builds;
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
