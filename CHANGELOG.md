# Changelog

`cccc-sdk` tracks the `cccc` daemon version. Each release targets a specific
CCCC line and exposes the IPC surface available on that line.

## [0.4.18] — Aligned with CCCC 0.4.18

Focused compatibility release for the CCCC 0.4.18 daemon line.

### Added

- **Hermes runtime setup** — `runtime_hermes_status`,
  `runtime_hermes_prepare`, and `runtime_hermes_mcp_test` in both Python and
  TypeScript clients.
- **Voice Secretary recording lease** —
  `assistant_voice_recording_lease` for the daemon-owned cross-tab recording
  guard.

### Changed

- Resynced the standards snapshots from the current CCCC repo.
- Reconciled the remote 0.4.17 contract-alignment work with the local broader
  wrapper surface, retaining Context Ops v3 helpers, `capability_use`, and
  ReMe `memory_search` / `memory_get`.
- `tracked_send` now emits `reply_required=true` by default, matching the
  daemon contract and current CCCC behavior.
- Removed TS-only `file_send` / `ledger_tail` wrappers from the merge result
  because they are not current Daemon IPC ops.

### Tests

- Added Python and TypeScript parity coverage for the 0.4.18 Hermes and
  Voice Secretary lease wrappers.

## [0.4.17] — Aligned with CCCC 0.4.17

Refresh of the SDK against the CCCC daemon's current IPC surface. Coverage of
public daemon ops moves from ~58 to ~108 ops.

### Specs
- Resynced `spec/CCCC_DAEMON_IPC_V1.md`, `spec/CCCC_CONTEXT_OPS_V1.md`, and
  `spec/CCCS_V1.md` from the CCCC daemon repo.
- Added `spec/ADAPTATION_PLAN.md` documenting the gap analysis and staged
  roadmap.

### Added — new daemon ops wrapped

- **Tracked delegation** — `tracked_send`, `task_list`. Atomic
  `task.create + send` with idempotency replay and structured `task_ref`.
- **Headless runtime control** — `headless_status`, `headless_set_status`,
  `headless_ack_message`. Used by Claude / Codex / generalized headless
  runners.
- **Copy Groups** — `group_copy_export`, `group_copy_preview_import`,
  `group_copy_import`.
- **Capability Center extensions** — `capability_visibility`,
  `capability_install_target`, `capability_source_delete`.
- **Presentation workspace** — `presentation_get`, `presentation_publish`,
  `presentation_clear`, `presentation_browser_open`,
  `presentation_browser_info`, `presentation_browser_close`. Streaming
  attach variants (`*_attach`, `*_vnc_attach`) deferred until a
  bidirectional transport helper lands.
- **Built-in assistant lifecycle** — `assistant_state`,
  `assistant_settings_update`, `assistant_status_update`.
- **Daemon core** — `shutdown`, `observability_get`, `observability_update`,
  `branding_get`, `branding_update`.
- **Diagnostics** — `debug_snapshot`, `debug_tail_logs`,
  `debug_clear_logs`, `terminal_tail`, `terminal_clear`.
- **Maintenance** — `ledger_snapshot`, `ledger_compact`.
- **Low-level chat / notify** — `stream_emit`, `system_notify`.
- **Registry / admin** — `registry_reconcile`, `group_detach_scope`.
- **PET assistant decisions** — `pet_decisions_get`,
  `pet_decisions_replace`, `pet_decisions_clear`.

### Changed — existing ops extended

- `send`, `reply`, `send_cross_group` now accept structured `refs`
  (e.g. `task_ref`, `presentation_ref`) and `attachments`. `send` / `reply`
  also accept `client_id` for client-side idempotency.
- `actor_add` now accepts `capability_hidden`, `profile_scope`,
  `profile_owner`. `runtime_state_source` is settable via
  `actor_update.patch` (per the daemon's allowed-patch keys).
- TypeScript `AgentRuntime` literal widened to include
  `amp | auggie | droid | kimi | neovate | web_model | custom` alongside
  `claude | codex | gemini`. Plain strings still accepted.
- `assert_compatible` (Py) and `assertCompatible` (TS) skip lists expanded
  so streaming socket-special ops (`*_browser_attach`, `*_browser_vnc_attach`,
  `term_attach`, `term_resize`) no longer surface as `unknown_op` false
  negatives.
- New shared TS types: `MessageRef`, `MessageAttachment`,
  `AsyncResultEnvelope`, `HeadlessStatus`, `AgentRuntime`,
  `ActorInternalKind`, `ActorRuntimeStateSource`, `AssistantLifecycle`,
  `PresentationCardType`.

### Not yet wrapped (planned for follow-up releases)

- **Voice Secretary** — 21 ops (document/transcribe/prompt-draft/feedback).
- **Memory (ReMe)** — 8 ops (per-actor persistent memory CRUD + search).
- **ChatGPT Web Model runtime** — 7 ops (wait/complete-turn + browser
  surface).
- **IM bridge management** — `im_bind_chat`, `im_list_*`,
  `im_reject_pending`, `im_revoke_chat`.
- **Remote Access** — `remote_access_*` (Tailscale / manual tunnel).
- **Streaming socket-special ops** — `*_browser_attach`,
  `*_browser_vnc_attach`, `term_attach`, `term_resize`. Need a bidirectional
  transport helper distinct from `events_stream`.

### Async-result envelope

Long-running ops now merge fields from `build_async_result_fields()` into
their result (`accepted`, `completed`, `queued?`, `background?`,
`completion_signal?`, `recommended_next_action?`, `polling_discouraged?`,
`wait_guidance?`). Prefer subscribing to `events_stream` for
`completion_signal` over polling.

### Tests
- Python: 37 tests (added 17 new ops + contract extensions).
- TypeScript: 50 tests (added 17 new ops + contract extensions).

## [0.4.3] — 2026-03-15

Last sync against CCCC 0.4.3 (actor profiles, group space, automation,
capability allowlist).
