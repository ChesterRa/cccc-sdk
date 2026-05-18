# CCCC SDK — Adaptation Plan

This document tracks remaining work to keep `cccc-sdk` aligned with the
current CCCC daemon IPC surface.

The completed portion for the latest release lives in `CHANGELOG.md`.

## Coverage snapshot (vs. cccc 0.4.18 daemon)

The SDK now includes the 0.4.18 Hermes runtime setup helpers and the
daemon-owned Voice Secretary recording lease, in addition to the 0.4.17
contract-alignment wrappers. The remaining gaps are concentrated in the
families below.

## Remaining op families

### 1. Voice Secretary / Assistant Voice remaining ops

Daemon ops (under `daemon/assistants/assistant_ops.py`):

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

Mostly dict-in/dict-out; the contracts in
`contracts/v1/assistant.py` are stable. Suitable for one
self-contained PR. The transcript/document state should
be reflected as data classes on the TS side.

### 2. Memory ReMe remaining ops

```
memory_reme_layout_get
memory_reme_write
memory_reme_index_sync
memory_reme_context_check
memory_reme_compact
memory_reme_daily_flush
```

`memory_reme_search` and `memory_reme_get` have thin wrappers already.
The remaining ops cover layout/indexing, write, context-check, and
compaction/flush. The shape is documented inline in
`daemon/memory/memory_ops.py`. Pure dict-in/dict-out;
about half a day's work.

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

The two `runtime_*` ops are the only ones an external
automation client typically needs. Browser ops are
operator-facing. Streaming attach variants share the
need for a generalized bidirectional socket helper (see
§5).

### 4. IM bridge management + Remote Access (9 ops)

```
im_bind_chat / im_list_authorized / im_list_pending /
im_reject_pending / im_revoke_chat
remote_access_state / remote_access_configure /
remote_access_start / remote_access_stop
```

Admin/operator-side. Trivial dict-in/dict-out. One
short PR.

### 5. Streaming socket-special ops (8 ops)

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

These do not fit the request/response transport. They
return a streaming socket after the initial handshake.
Implementation work:

- Generalize `open_events_stream` (Py) / `openEventsStream`
  (TS) into a generic `open_attach_stream(op, args)`
  helper that returns a duplex stream after handshake
  validation.
- Wire up the eight ops above on top of that helper.
- `*_vnc_attach` returns raw RFB bytes; the SDK can
  expose the duplex socket directly and let callers
  forward to a VNC client.
- `term_resize` is regular request/response and can ship either as a small
  standalone wrapper or together with `term_attach`.

This is the only category that needs new transport
design; everything else above is mechanical.

## Suggested ordering

1. Streaming attach helper + the 8 streaming ops
   (unlocks a whole UX category).
2. Voice Secretary remaining ops (biggest single block; full
   contract is in `contracts/v1/assistant.py`).
3. Web Model runtime ops (depends on streaming helper
   for browser ops; the two `runtime_*` ops can ship
   standalone).
4. Memory ReMe remaining ops.
5. IM bridge + Remote Access 9 ops.

## Contract details that may grow

Watch the daemon for these (non-blocking now, but worth
keeping in sync):

- `Reference.kind` literal in `contracts/v1/message.py`.
  Currently the typed union is `file | url | commit |
  text`, but the runtime also emits `task_ref` and
  `presentation_ref`. If the daemon ever narrows the
  literal, the SDK's `MessageRef` union should follow.
- `AgentRuntime` literal in `contracts/v1/actor.py`.
- `EventKind` literal in `contracts/v1/event.py` (new
  `assistant.*` and `presentation.*` kinds have already
  shipped).
- Async-result envelope shape in
  `contracts/v1/async_result.py` — currently optional
  fields; if any become required, update
  `AsyncResultEnvelope` in `ts/src/types.ts`.
