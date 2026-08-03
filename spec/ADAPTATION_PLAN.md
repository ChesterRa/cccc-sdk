# CCCC SDK — Adaptation Plan

This document tracks remaining work to keep `cccc-sdk` aligned with the
current CCCC daemon IPC surface.

The completed portion for each release lives in `CHANGELOG.md`.

## Coverage snapshot (vs. Rust cccc 0.4.33 daemon)

The SDK mirrors the current CCCC standards snapshots and wraps the current
request/response JSON op listed in `spec/CCCC_DAEMON_IPC_V1.md`, except for
streaming socket-special attach operations that require a duplex transport.

Newly aligned in the 0.4.33 SDK line:

- `insight` / `require_peer_insight` across message helpers
- `group_preamble_get`, `group_preamble_set`, `group_preamble_reset`
- cursor-based `terminal_history`, `terminal_since`, and Rust
  `terminal_resize` dispatch compatibility
- current Voice Secretary transcript/document/request and prompt-refinement ops
- removal-safe migration error for the former `assistant_voice_transcribe` IPC
- real `events_stream` op probing, including pre-send protection in
  `sendAndWaitForReply`

## Remaining op family

### Streaming socket-special ops

These operations intentionally remain outside the thin request/response helper
set because they upgrade the daemon connection after the initial handshake:

```
term_attach
presentation_browser_attach
presentation_browser_vnc_attach
web_model_browser_attach
web_model_browser_vnc_attach
space_provider_auth_browser_attach
space_provider_auth_browser_vnc_attach
```

Implementation work:

- Generalize `open_events_stream` (Python) / `openEventsStream` (TypeScript)
  into a shared `open_attach_stream(op, args)` helper that validates the
  handshake and returns a duplex stream/socket.
- Add attach helpers on top of that transport.
- Keep `*_vnc_attach` as raw byte streams so callers can bridge to an RFB/VNC
  client without the SDK owning UI protocol semantics.

Terminal resize is not streaming and is already wrapped. The public helper
retains the historical `termResize` / `term_resize` name while targeting the
Rust daemon's `terminal_resize` operation.

## Watch list

The CCCC source tree contains some source-only operations that are not currently
listed in the standards snapshot. Do not treat them as SDK contract
requirements until they enter `docs/standards/CCCC_DAEMON_IPC_V1.md` or are
explicitly promoted by CCCC core.

Watch especially:

- Web Model runtime/browser request-response ops.
- Group Bridge internal relay/status ops.
- `Reference.kind`, `AgentRuntime`, `EventKind`, and `AsyncResultEnvelope`
  literal/schema growth in `contracts/v1`.
