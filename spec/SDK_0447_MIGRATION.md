# CCCC SDK 0.4.47 migration

This version targets CCCC 0.4.47. The four mirrored standards and the
revision in `core.json` describe that core release. Package version equality
does not prove runtime compatibility.

## Read a specific message

`message_history_exact` (Python/Rust) and `messageHistoryExact` (TypeScript)
read one visible message or targeted notice for an Actor without consuming Mail.
The result contains one event in `messages`, `has_more: false`, and
`delivery_text`, which may be null. Visibility and generation rules are daemon
owned; an unavailable event returns the daemon's `event_not_found` error.

```python
result = client.message_history_exact(group_id="g_1", actor_id="worker", event_id="e_1")
event, rendered = result["messages"][0], result["delivery_text"]
```

```ts
const result = await client.messageHistoryExact({ groupId: 'g_1', actorId: 'worker', eventId: 'e_1' });
const event = result.messages[0];
```

```rust
let result = client.message_history_exact("g_1", "worker", "e_1", "user")?;
```

These helpers send no list filters or pagination fields. Daemons before
0.4.46 may silently ignore `event_id` and return the newest history page. The
SDK verifies both the returned event ID and the exact-read result shape and
raises an incompatibility error if it cannot establish an exact result. Generic
`call` remains available, but does not provide this guard.

## Summarize current awaiting Mail

`inbox_summary` / `inboxSummary` reports current awaiting and overdue counts
for each Group Actor. Its RFC3339 `cutoff` is inclusive and must not be in the
future. It filters the current awaiting state; it is not a historical snapshot.
Oldest timestamps and ages can be null. The operation is read-only and does
not advance cursors or start Actors. The daemon enforces Group-wide access:
users, system and Foreman may request it; peers cannot.

```python
summary = client.inbox_summary(group_id="g_1", cutoff="2026-11-02T00:00:00Z")
```

```ts
const summary = await client.inboxSummary({ groupId: 'g_1', cutoff: '2026-11-02T00:00:00Z' });
```

```rust
let summary = client.inbox_summary("g_1", "2026-11-02T00:00:00Z", "user")?;
```

The operation was added in CCCC 0.4.46; older daemons return `unknown_op`.
An explicitly requested `assert_compatible` check may safely probe it with
empty arguments; it is not a new default requirement for older daemons.

Python `actor_add(model_label=...)` and TypeScript `actorAdd({ modelLabel })`
also expose the operator-maintained Actor model label. Daemons before 0.4.46
silently ignore that field, even when Actor creation succeeds. Check the
returned Actor if supporting older daemons.

## Pinned messages

CCCC 0.4.47 adds Group message pins for a trusted user. The SDK does not add
dedicated pin helpers; a local user client can invoke `message_pins_list` and
`message_pins_set` through the generic `call` method. These operations do not
expose pins to Actors or read-only exhibit Web sessions. Pins are shared within
the Group and are not included when a Group is copied.

## Voice Secretary IPC changes

These Python/TypeScript helpers retain their source signatures but now raise
`IncompatibleDaemonError` locally; the daemon removed their operations in
0.4.43. No request is sent and the SDK does not silently switch transports:

- `assistant_settings_update` / `assistantSettingsUpdate`
- `assistant_status_update` / `assistantStatusUpdate`
- `assistant_voice_document_input_read` / `assistantVoiceDocumentInputRead`
- `assistant_voice_prompt_draft_submit` / `assistantVoicePromptDraftSubmit`
- `assistant_voice_request` / `assistantVoiceRequest`

Voice Secretary configuration is instance-wide; there is no per-Group enable
toggle. Trusted local clients may use generic `call` for the current
`voice_secretary_settings_get` and `voice_secretary_settings_update` IPC
operations, with their current argument schemas. CCCC manages assistant
lifecycle and health. Use CCCC Web's current Voice workflow for interactive
input and prompts; the removed operations have no automatic SDK replacement.

## Grok and ChatGPT Web Models

`grok_web_model` is a Grok Bot using a native Webhook Routine and the remote MCP
connector, not a CCCC-managed browser session. CCCC Web configures the existing
Bot URL and Routine credentials; the `grok` Runtime is a separate CLI. ChatGPT's
`web_model` continues to use its browser path. Delivery-preference helpers and
`web_model_runtime_recover_turn` apply to ChatGPT browser Actors, not Grok.
See the core [Grok Bot guide](https://github.com/ChesterRa/cccc/blob/main/docs/guide/grok-web-model-runtime.md)
for setup and operational boundaries. The SDK does not handle credentials or
start a provider on behalf of these helpers.
