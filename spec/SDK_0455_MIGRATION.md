# CCCC 0.4.55 SDK alignment

The Python, TypeScript and Rust packages align with the CCCC 0.4.55 contracts.
The reviewed core release revision is pinned in [core.json](core.json).
Daemon IPC remains version 1; runtime gating uses capabilities and operations,
not an exact daemon-version comparison.

## Removed coordination-note interfaces

The daemon no longer implements `coordination.note.add`. Python's
`coordination_note_add`, TypeScript's `coordinationNoteAdd` and
`CoordinationNoteAddOptions`, and TypeScript's obsolete `recent_decisions` and
`recent_handoffs` result fields are removed. Generic `context_sync` still passes
operations through, so sending the retired operation fails as unknown; it is
not redirected to another write.

Remove calls and result-field dependencies. Existing notes stay in the daemon's
stored context file, but context reads and bootstrap no longer return them.
The shared coordination brief remains available through
`coordination_brief_update` / `coordinationBriefUpdate`. Updating that brief is
a different operation; it does not create a decision or handoff history.

## Task sources and the repository Backlog

Python and TypeScript task create/update helpers accept a `source` object:

```json
{"scope_key": "s_project", "path": "BACKLOG.md", "entry_id": "entry-id-from-backlog-read"}
```

Use the scope, configured path and stable entry ID returned by the daemon;
validation and authorization remain daemon-owned. Omitting `source` on update preserves the
association; explicit `None` / `null` clears it. TypeScript exports the
`BacklogSource` type. Rust uses generic `call` with the documented task or
context operations.

Backlog operations use generic `call` / `call_raw` (`callRaw` in TypeScript) in
all three clients. Consult
the mirrored [daemon IPC standard](CCCC_DAEMON_IPC_V1.md) for the operation's
arguments and file-hash precondition. A write may report partial success; do
not assume that creating a task and changing a file is one transaction. Task
completion asks for a source update; it does not close the Backlog topic.

## Read projections and message outcomes

- Task reads can return `open_blocked_by`, derived from the stored dependencies.
  Use it for unresolved dependencies when present. An empty list is meaningful;
  do not replace it with the stored `blocked_by` list.
- Native exact message reads pass through `delivery_text` unchanged. Later own
  reads may carry only the receiving-context header and message when the daemon
  has already given the Group rules. The SDK adds no frequency cache or delivery
  acknowledgment.
- A failed delivery with `retryable: false` has exhausted its automatic budget.
  The SDK adds no automatic retry; explicit `message_deliver` remains a separate
  caller choice. Old receipts without the flag keep their daemon semantics.
- Connector creation no longer rotates an active credential; rotation must be
  explicit. Generic result handling preserves the daemon's outcome and optional
  secret fields without inventing one when none was returned.
- Generic Connect message/file calls reject unknown top-level arguments before
  acceptance. Use the canonical `client_id`, keep it and the same arguments after
  an uncertain result, and never create a new key just to force a send through.

## Upgrading directly from 0.4.47

Also apply the [0.4.51 direct-upgrade guidance](SDK_0451_MIGRATION.md#upgrading-directly-from-0447)
for earlier removed helpers and arguments, and the
[0.4.54 guidance](SDK_0454_MIGRATION.md) for message validation and optional
Actor replacement fields. This alignment includes those source changes, so you
can upgrade straight from 0.4.47.
