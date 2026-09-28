# CCCC SDK 0.4.41 migration

Python, TypeScript/npm and Rust source packages target CCCC 0.4.41 at the reviewed
revision in [core.json](core.json). Compatibility still depends on IPC v1 and
required operations, not exact package-version equality. Publication is separate
from this source update.

## Voice document library

All three SDKs expose these daemon operations:

| IPC / Python / Rust | TypeScript |
| --- | --- |
| `assistant_voice_document_library` | `assistantVoiceDocumentLibrary` |
| `assistant_voice_document_library_update` | `assistantVoiceDocumentLibraryUpdate` |
| `assistant_voice_document_delete` | `assistantVoiceDocumentDelete` |

The library read returns `folders`, `root_order` and `documents`, including
archived entries and excluding deleted ones. It reads the stored index;
`assistant_voice_document_list` separately performs discovery/reconciliation.

Library actions are `create_folder`, `rename_folder`, `remove_folder`,
`reorder_root`, `rename`, `move` and `restore`. Removing a folder returns its
documents to root. Renaming changes the display title, not the Markdown path.
An empty move destination means root; an empty root order clears ordering.
Metadata updates return the library without appending a ledger event.

**Archive retains the file. Delete permanently removes it.** Restore applies
only to archived documents; it preserves their folder. Deleted paths cannot be
restored or revived by a stale save. The daemon enforces writer permissions and
rejects deletion during an active recording lease. SDKs preserve these errors
and do not manipulate files or replay failed exchanges themselves.

Python example, using an existing registered document:

```python
library = client.assistant_voice_document_library(group_id=group_id)
library = client.assistant_voice_document_library_update(
    group_id=group_id, action="create_folder", name="Meetings",
)
folder_id = next(f["folder_id"] for f in library["folders"] if f["name"] == "Meetings")
client.assistant_voice_document_library_update(
    group_id=group_id, action="move", document_path="notes/meeting.md",
    folder_id=folder_id,
)
```

TypeScript uses `VoiceDocumentLibraryUpdateOptions` and returns
`VoiceDocumentLibraryResult`. Rust takes `VoiceDocumentLibraryAction` and returns
`VoiceDocumentLibrary`; use `None` for the default local-user caller:

```rust
use cccc_sdk::VoiceDocumentLibraryAction;
let library = client.assistant_voice_document_library_update(
    "g_xxx",
    &VoiceDocumentLibraryAction::ReorderRoot { root_order: vec![] },
    None,
)?;
```

## ChatGPT and Grok Bot Actors

- `web_model` is ChatGPT; `grok_web_model` is Grok Bot. Multiple Actors can
  coexist. `grok` is the separate Grok CLI runtime.
- Configure browser login and the provider's shared connector in CCCC Web.
  Existing Actor-specific ChatGPT connectors require migration to the shared
  connector and reconnection of each conversation. Normal restarts reuse bindings.
- Each Grok Actor requires an existing `https://grok.com/bot/<UUID>` URL saved
  through its Web settings, including Actors linked to a Runtime Profile.
  CCCC creates neither Bots nor a ChatGPT-style pairing exchange for Grok.
- `actor_add` / `actorAdd` and Actor updates persist runtime configuration;
  selecting `grok_web_model` alone does not configure its Bot or grant tool access.
  Configure an Actor in a paused Group when it must not start before setup.
- `image_compat` is ChatGPT-only. Grok uses `standard`; the daemon rejects the
  incompatible mode. Existing delivery-preference helpers retain this error.
- Connector credentials, verified conversation bindings, draft-safe navigation
  and browser submission belong to core/Web. This release adds no typed setup
  shortcuts, HTTP transport or credential injection to normal SDK messages.
  Generic IPC calls remain available to trusted local integrations, but raw
  binding calls are not substitutes for Web's page/receipt checks and lifecycle.

## File tools and other changes

The MCP tools now separate `cccc_file` (read) from `cccc_file_send` (delivery).
Daemon SDK operations `send_files` / `sendFiles` and `connect_send_files` /
`connectSendFiles` keep their existing names and contracts; SDK users do not need
to rename them to MCP tool names.

Runtime trust handling, provider approvals, browser delivery recovery, recipient
selection and Dock rendering are core/Web behavior. No duplicate implementation
is required in an IPC client. Actor configuration changes still take effect through
explicit lifecycle operations; saving a configuration is not proof of a restarted
or connected Actor.
