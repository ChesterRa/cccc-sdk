# CCCC 0.4.54 SDK alignment

The Python, TypeScript and Rust packages target the CCCC revision in
[core.json](core.json). The daemon IPC envelope remains version 1. This
alignment adds TypeScript read fields and mirrors the contracts introduced
since 0.4.51; it does not change conversation selection or add resume helpers.

## Reading that a saved conversation was not resumed

The `actor_list` result can include these fields on each Actor:

```json
{
  "id": "peer",
  "runtime_session_replaced_at": "2026-11-10T10:00:00Z",
  "runtime_session_replaced_reasons": ["launch_path"]
}
```

The time is when CCCC recorded the replacement, not when the provider created
either conversation. A saved receipt proves there was a saved conversation,
not that it contained work. First starts, New session and disabled resume do
not create this record. The record persists until New session or another
replacement; the successor of a session that never received a prompt keeps
an existing record unchanged. Both fields are `null` without a record and
can be absent on older daemons.

Reasons are an open array of strings and may be empty. Known values include
`runtime`, `transport`, `record_version`, `workspace`, `command`, `model`,
`launch_path`, `cccc_cli` and `launch_identity`. Ignore unknown values when
rendering labels, while retaining the replacement fact. `launch_identity`
means launch settings or environment; it can still include PATH or CCCC's
program location when either compared receipt lacks the recognized split.
Only when both records contain that detail can those changes be named
separately. A successful start records the detail for later comparisons.

Python's `actor_list`, TypeScript's `actorList` and Rust's generic
`call("actor_list", ...)` preserve the result fields. TypeScript's exported
`ActorInfo` declares the two fields as optional and nullable, with `string[]`
for reasons. The `actorList` method still returns an open result object; its
return type has not been narrowed. No SDK exposes the earlier provider ID or
the receipt's internal hashes as new public fields.

After attaching the new launch, the daemon also attempts to write one
`system.notify` addressed to `user`, which an enabled IM bridge can forward.
This is best effort and later starts do not repeat it. It does not enter
members' Inboxes and is not a reliable notification stream. CCCC Web's chat
does not show that event as a message; Web provides the information mark on
the member page and terminal title bar instead.

## Message writes reject unknown arguments from CCCC 0.4.53

Generic callers must use the accepted top-level keys listed for their
operation in [daemon IPC §8.6](CCCC_DAEMON_IPC_V1.md#86-chat-messaging).
An extra key produces `unknown_arguments` with
`details: { unknown: string[], new_side_effects: false }`; the list contains
key names, not values. This validation also applies before an old request is
replayed by `client_id`. Nested objects follow their own validation rules.

Remove unsupported application metadata from the IPC arguments. For example,
`scope_key` and caller-built sender snapshots do not belong in `send`.
Keep the SDK's existing typed helper arguments rather than adding arbitrary
keys through generic calls. The SDK does not strip keys or automatically
retry a rejected call.

After an uncertain result, retain the original `client_id` and arguments;
never invent a new key to force a send through. If an older accepted request
is retried with a now-rejected key, follow the daemon's documented replay
rules: retrying without the key can replay by the same `client_id`, except
that a question's full normalized message comparison can return
`idempotency_conflict`. Do not silently change or downgrade a question.

## Other contract updates

Context reads now omit working-state entries for Actors removed from the
Group, including entries saved by earlier versions. States of members still
in the Group remain eligible when disabled or stopped. This changes the read
projection, not the stored context or the version used for optimistic writes.
Use `actor_list` for membership; `agent_states` contains reported working
states and does not guarantee one entry for every member.

The mirrored IPC standard includes CCCC 0.4.52's `memory_trim` diagnostic
record and 0.4.53's message provenance boundaries. These remain daemon-owned;
there is no new SDK memory-management or runtime-control helper. Existing
structured-answer examples remain in the [0.4.51 guide](SDK_0451_MIGRATION.md).
