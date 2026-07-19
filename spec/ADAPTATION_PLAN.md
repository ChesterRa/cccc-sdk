# CCCC SDK — Adaptation Plan

This plan is based on an operation-by-operation audit of CCCC v0.4.18 versus
v0.4.32 performed on 2026-07-19. The SDK source packages now target v0.4.32;
the work remains unreleased until the normal package release process is run.

The goal is contract alignment, not one wrapper per daemon implementation
detail. Public SDK methods should represent stable capabilities that an
external application can use safely. Internal relay operations and
operator-only mechanisms stay out of the default client unless a real SDK
consumer establishes a durable contract for them.

## v0.4.32 alignment status

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

### Validation evidence (2026-07-19)

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

### 1. Voice Secretary / Assistant Voice (18 ops)

```
assistant_voice_input_append
assistant_voice_transcribe
assistant_voice_model_install
assistant_voice_model_remove
assistant_voice_runtime_install
assistant_voice_runtime_remove
assistant_voice_transcript_append
assistant_voice_document_list
assistant_voice_document_select
assistant_voice_document_input_read
assistant_voice_document_save
assistant_voice_document_instruction
assistant_voice_document_archive
assistant_voice_prompt_draft_submit
assistant_voice_prompt_draft_ack
assistant_voice_instruction_feedback
assistant_voice_ask_requests_clear
assistant_voice_request
```

These operations are mostly request/response, but they form a product workflow
rather than a bag of independent calls. Add them only alongside a consumer
flow, typed document/transcript states, and end-to-end workflow tests. If the
dedicated MCP/workflow interface remains the supported integration boundary,
duplicating it in the general SDK would add maintenance without reducing
consumer complexity.

### 2. Low-level ReMe controls (6 ops)

The first-class local-memory API is complete for normal callers. The SDK keeps
explicit `memory_reme_search` and `memory_reme_get` compatibility wrappers for
advanced source controls and raw ReMe response shapes. The remaining daemon
controls are:

```
memory_reme_layout_get
memory_reme_write
memory_reme_index_sync
memory_reme_context_check
memory_reme_compact
memory_reme_daily_flush
```

These expose storage and maintenance policy. They should not become the normal
memory API. Add individual methods only for an operator or diagnostics client
that needs them, with the distinction from first-class memory documented in
`SDK_LOCAL_MEMORY_API.md`.

### 3. ChatGPT Web Model runtime (7 ops)

```
web_model_runtime_wait_next_turn
web_model_runtime_complete_turn
web_model_browser_open
web_model_browser_info
web_model_browser_close
web_model_browser_attach              # streaming
web_model_browser_vnc_attach          # streaming
```

The two turn operations may suit an automation client. Browser lifecycle and
attach operations are operator-facing and should be designed with the client
that will actually consume them.

### 4. IM bridge management + Remote Access (9 ops)

```
im_bind_chat
im_list_authorized
im_list_pending
im_reject_pending
im_revoke_chat
remote_access_state
remote_access_configure
remote_access_start
remote_access_stop
```

These belong to an administrative control plane. Keep them out of the main
surface until an SDK-based operator client needs them; at that point, group
them under an explicit admin API rather than mixing them into everyday chat
and actor workflows.

### 5. Socket-special and terminal operations

```
term_attach
term_resize
presentation_browser_attach
presentation_browser_vnc_attach
web_model_browser_attach
web_model_browser_vnc_attach
space_provider_auth_browser_attach
space_provider_auth_browser_vnc_attach
```

`term_resize` is regular request/response. The attach operations switch from a
JSON request/response exchange to a duplex byte stream after the handshake.
They require a deliberate transport abstraction, ownership and close
semantics, backpressure behavior, and binary-stream tests in both languages.

Do not generalize `open_events_stream` merely to reduce wrapper duplication.
First identify a real terminal, browser, or VNC consumer and design the
smallest transport contract that supports its lifecycle correctly.

## Recommended next iterations

1. **Finalize v0.4.32 alignment.** Review the validated diff as a public API
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
