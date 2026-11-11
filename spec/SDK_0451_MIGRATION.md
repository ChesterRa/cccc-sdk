# CCCC 0.4.51 SDK alignment

All three packages target the released CCCC revision in [core.json](core.json).
The IPC envelope remains version 1. An answer's `v: 2` identifies its own shape,
not a new transport protocol.

## Upgrading directly from 0.4.47

The 0.4.50 and 0.4.51 alignments were not published as SDK packages.
SDK 0.4.54 includes both. When upgrading from 0.4.47, update calls to the
removed Python or TypeScript helpers and arguments listed below. Existing Rust
typed helper signatures are unchanged; generic calls to the retired daemon
memory operations must be migrated in any language.

- The Group memory and ReMe helpers are removed, because CCCC 0.4.50 removed
  those operations. See the [memory migration guide](SDK_LOCAL_MEMORY_API.md).
- Capability search keeps `query` and drops the filters the daemon never
  applied: `kind`, `source_id`, `trust_tier`, `qualification_status`,
  `include_external` and `limit` (camelCase in TypeScript). TypeScript's
  `capabilitySearch` now requires `groupId`.

The 0.4.50 additions, such as running a saved notification rule now, Group
activity and the optional `message_history` sender filter, are listed in the
[CHANGELOG](../CHANGELOG.md#0450).

## Structured answers through the generic call

V1 keeps its mutually exclusive `{v: 1, option_id}` and `{v: 1, text}` forms.
V2 adds `{v: 2, option_id, note}`. A note must contain a non-whitespace character
and at most 4000 Unicode scalar values; preserve its spacing and newlines.
Use V1 when there is no note. V1 cannot contain `note`, even null; V2 cannot
contain `text`, even null.

The following snippets answer an existing open question as the local user.
Replace the Group, request event ID and client ID with values from your own
workflow. Never invent or reset the client ID when retrying an uncertain outcome.

Python:

```python
from cccc_sdk import CCCCClient

client = CCCCClient()
args = {
    "group_id": "g_your_group",
    "source_event_id": "e_request",
    "by": "user",
    "client_id": "your-stable-answer-id",
    "answer": {"v": 2, "option_id": "B", "note": "  Keep the old URL.\n"},
}
result = client.call("reply_request_answer", args)
```

TypeScript:

```typescript
import { CCCCClient, type ReplyAnswerV2 } from 'cccc-sdk';

const client = await CCCCClient.create();
const answer: ReplyAnswerV2 = { v: 2, option_id: 'B', note: '  Keep the old URL.\n' };
const args = {
  group_id: 'g_your_group', source_event_id: 'e_request', by: 'user',
  client_id: 'your-stable-answer-id', answer,
};
const result = await client.call('reply_request_answer', args);
```

Rust (inside a function returning `Result`):

```rust
use cccc_sdk::CCCCClient;
use serde_json::json;

let client = CCCCClient::discover()?;
let args = json!({
    "group_id": "g_your_group", "source_event_id": "e_request", "by": "user",
    "client_id": "your-stable-answer-id",
    "answer": {"v": 2, "option_id": "B", "note": "  Keep the old URL.\n"}
});
let result = client.call("reply_request_answer", args.as_object().unwrap().clone())?;
```

The daemon authorizes, validates and records the answer. It generates the
receipt as `Selected <id>: <label>`, a blank line, then `Note: <note>`.
Do not synthesize that receipt with ordinary `reply`: it would bypass the
structured answer operation. A recorded answer does not prove delivery.

Retry with the same arguments and client ID to obtain the same event; changing
the note under that ID produces `idempotency_conflict`. SDK transport never
automatically replays an exchange after bytes may have been sent. Older daemons
can reject V2 with `invalid_answer`; the SDK does not silently downgrade it.

TypeScript exports `ReplyQuestionV1`, `ReplyAnswerV1`, `ReplyAnswerV2` and their
`ReplyAnswer` union, and adds `question` and `answer` to `ChatMessageEventData`.
These are shape declarations. `isChatMessageEvent` checks the event kind, not
the validity of a stored question. Before showing a structured choice UI, apply
the shape and generated-text reading rule in [CCCS §6.4](CCCS_V1.md#64-questions-to-the-user).
Python and Rust continue to expose these event fields as open JSON values.

## Capability discovery and source privacy

The daemon excludes historical SkillsMP search snapshots when their source is
`skillsmp_remote`, tags include `remote_search`, and `sync_state` is not
`imported`. It does not delete records or revoke direct access. Overview rows
include `legacy_search_unverified`; search results can include `sync_state`.
The SDK preserves these fields and does not repeat the server's filter.

For skills, HTTP(S) source URLs returned by overview, search and state omit
userinfo, query and fragment. Import also redacts stored/returned `source_uri`
and `source_record_id`, including dry runs. `capability_install_target` downloads
using the caller's original URL, then stores and returns a redacted source.
Pass the download URL unchanged; removing credentials or a query in the SDK
would change which resource can be downloaded. These rules do not rewrite old
catalog files or apply to MCP toolpack metadata. They require the updated daemon.

## DeepSeek and message modes

DeepSeek uses existing Actor/Profile private environment settings:
`DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL`. A member whose
`DEEPSEEK_MODEL` is blank, or unset both in its own settings and in the daemon's
environment, uses `deepseek-flash` from its next launch. The daemon owns managed
ACP installation, loopback proxy exclusions and diagnostic redaction.
`credential_rejected` differs from `credential_unavailable`; SDK callers keep
the daemon's error/diagnostic fields instead of guessing provider state.

The SDK still sends explicit `message_mode` for new messages and uses `paths`
for file sends. MCP's conditional `mode` defaults and singular `path` argument
belong to the MCP boundary. They do not change the SDK or Connect IPC contract.
