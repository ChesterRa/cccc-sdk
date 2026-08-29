# CCCC Python SDK

This package is the **Python client SDK** for CCCC daemon (Daemon IPC v1).

## Relationship to CCCC core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` core owns the native Rust daemon/web/CLI and runtime state under `CCCC_HOME`.
- `cccc-sdk` provides client APIs only and must connect to a running daemon.

It requires a running CCCC daemon. The SDK does **not** ship a daemon.

## Versioning

This SDK follows daemon contracts rather than strict daemon version strings:
- Use `assert_compatible(...)` with required capabilities/ops for runtime gating.
- Newer workflow helpers cover `tracked_send`, Context Ops v3 task/agent state operations, capability discovery, and first-class local memory.

The current message contract is an intentional atomic cut. Upgrade the SDK and
daemon together; old attention/ACK fields are not mapped or silently downgraded.

`send` and `reply` also accept `suggested_user_message`: a visible proposed
next message for the human user. The daemon stores it as message metadata and
never sends it automatically.

## Daemon endpoint discovery

The SDK connects to the daemon endpoint described by:

- `${CCCC_HOME}/daemon/ccccd.addr.json` (preferred, cross-platform), or
- `${CCCC_HOME}/daemon/ccccd.sock` (POSIX AF_UNIX fallback)

## Install

### Stable (PyPI)

```bash
pip install -U cccc-sdk
```

### RC preview (optional, TestPyPI first)

```bash
pip install -U --pre --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk
```

### From source (development)

```bash
pip install -e .
```

## Usage

```bash
python - <<'PY'
from cccc_sdk import CCCCClient

c = CCCCClient()
c.assert_compatible(
    require_ipc_v=1,
    require_ops=["groups", "send", "reply", "tracked_send", "context_sync"],
)

groups = c.groups()
print(groups)
PY
```

Context Ops v3 helpers:

```python
c.coordination_brief_update(group_id="g_xxx", objective="Ship SDK updates", by="user")
c.task_move(group_id="g_xxx", task_id="t_xxx", status="done", by="user")
c.agent_state_update(group_id="g_xxx", actor_id="peer-impl", focus="testing", by="peer-impl")
```

## Examples (repo)

This repository includes runnable examples under `python/examples/`:

```bash
python examples/compat_check.py
```

Stream events for a group:

```bash
python examples/stream.py --group g_xxx
```

Send a message:

```bash
python examples/send.py --group g_xxx --text "hello" --mode send
```

Message delivery uses one explicit mode:

```python
c.send(group_id="g_xxx", text="FYI", message_mode="mail")
c.send(group_id="g_xxx", text="Stop: wrong branch", message_mode="send")
c.send(
    group_id="g_xxx",
    text="Which option should we use?",
    message_mode="request_reply",
    to=["peer-1"],
)
messages = c.inbox_read(group_id="g_xxx", actor_id="peer-1", by="peer-1")
history = c.message_history(
    group_id="g_xxx",
    actor_id="peer-1",
    mode="send",
)
```

`mail` stores without an immediate runtime prompt, `send` performs a
best-effort immediate Push, and `request_reply` adds a concrete reply request.
`inbox_read` returns and consumes only Mail. Use the non-consuming
`message_history` helper when past Send, Send + Reply, or Mail traffic is needed.
Replies default to Send. Use `message_mode="mail"` for a non-urgent reply to
agent-only recipients; both modes fulfill the original reply request. Generic
ACK operations no longer exist.

Use `context_get(..., detail="overview" | "summary" | "full")` to control the
projection cost. `task_list` supports exact batches, filters, atomic status
pages, and pagination. Legacy `group_space_sync` is read-only status; use
explicit ingest/source operations for mutations.

Add a coordination note to shared context:

```bash
python examples/context_add_note.py --group g_xxx --kind decision --content "Promote this path"
```

Cross-group send:

```bash
python examples/send_cross_group.py --src g_src --dst g_dst --text "hello from src"
```

## Actor Profiles (global reusable runtime presets)

`cccc` supports global Actor Profiles so you can reuse runtime/runner/command/env across groups.

```python
from cccc_sdk import CCCCClient

c = CCCCClient()

# list profiles
profiles = c.actor_profile_list()

# create or update a profile
profile = c.actor_profile_upsert(
    profile={
        "name": "Codex PTY",
        "runtime": "codex",
        "runner": "pty",
        "command": ["codex", "exec"],
        "submit": "enter",
        "env": {"CODEX_MODEL": "gpt-5"},
        "capability_defaults": {
            "autoload_capabilities": ["pack:space"],
            "default_scope": "actor",
        },
    }
)
profile_id = str((profile.get("profile") or {}).get("id") or "")

# create actor from profile
c.actor_add(group_id="g_xxx", actor_id="reviewer", profile_id=profile_id)

# profile secrets (write-only values)
c.actor_profile_secret_update(profile_id=profile_id, set={"OPENAI_API_KEY": "..."})
```

## Current high-value surfaces

```python
from cccc_sdk import CCCCClient

c = CCCCClient()

# Capability exposure for one caller scope
caps = c.capability_state(group_id="g_xxx", actor_id="foreman")

# Capability policy / allowlist overlay
policy = c.capability_allowlist_get()
preview = c.capability_allowlist_validate(
    mode="patch",
    patch={"defaults": {"source_level": {"skillsmp_remote": "indexed"}}},
)

# Group Space / Notebook status
space = c.group_space_status(group_id="g_xxx")

# First-class group-local memory
health = c.memory_health(group_id="g_xxx")
hits = c.memory_search(
    group_id="g_xxx",
    query="recent decisions",
    limit=5,
    min_score=0.2,
    target="memory",
)

# Context v3: add a compact shared decision or handoff
c.context_sync(
    group_id="g_xxx",
    by="user",
    ops=[{"op": "coordination.note.add", "kind": "decision", "summary": "Use the simpler path"}],
)
```

The first-class helpers call `memory_search`, `memory_get`, `memory_write`,
`memory_profile_get`, and `memory_health`. For raw ReMe result shapes or source
selection, use the explicit `memory_reme_search` / `memory_reme_get` helpers.
See `spec/SDK_LOCAL_MEMORY_API.md` in the repository root.

If you need an op that does not have a dedicated helper yet, use `call()` / `call_raw()`.

## Current native-daemon compatibility surface

```python
# Capture the bounded ANSI screen and exact raw cursor boundary.
snapshot = c.terminal_snapshot(
    group_id="g_xxx",
    actor_id="web-model",
    limit_bytes=512_000,
)

# Read or change the durable delivery mode for a Web Model actor.
preference = c.web_model_delivery_preferences_get(
    group_id="g_xxx",
    actor_id="web-model",
)
c.web_model_delivery_preferences_update(
    group_id="g_xxx",
    actor_id="web-model",
    mode="image_compat",
)

# Inspect a committed legacy turn without moving the actor cursor.
recovered = c.web_model_runtime_recover_turn(
    group_id="g_xxx",
    actor_id="web-model",
    event_ids=["e_xxx"],
)
```

`term_resize()` sends the standard `term_resize` operation. For older compatible
daemon builds that expose `terminal_resize`, the SDK falls back only
after receiving a structured `unknown_op`; transport failures are never
replayed, and the legacy result is normalized to the standard shape.
Auto-discovered clients re-read `ccccd.addr.json` when connection
establishment fails before any request bytes are sent. Explicit endpoints are
never replaced.

This alignment pass also corrects the exact ReMe, global Remote Access,
group-scoped IM authorization, Voice model installation, group-copy, and chat
wire fields. `capability_source_delete()` is deliberately source-scoped: the
current daemon does not implement instance-scoped deletion and callers should
not assume otherwise.

## CCCC 0.4.33 compatibility delta

```python
# Deliberately rotate provider session metadata for Claude/Codex/Grok PTY.
c.actor_new_session(group_id="g_xxx", actor_id="reviewer")

# Page through retained PTY output by cursor.
page = c.terminal_history(
    group_id="g_xxx",
    actor_id="reviewer",
    before=None,
    limit_bytes=64_000,
)

# Large group copies use a daemon-local package path instead of base64 IPC.
exported = c.group_copy_export_file(group_id="g_xxx")
preview = c.group_copy_preview_import(package_path=exported["package_path"])
copied = c.group_copy_import(package_path=exported["package_path"])

# Manage the startup body delivered to the next fresh provider session.
c.group_preamble_set(
    group_id="g_xxx",
    content="This initialization is not a task. Wait for the targeted mission.\n",
)
preamble = c.group_preamble_get(group_id="g_xxx")
c.group_preamble_reset(group_id="g_xxx", confirm="preamble")

# Upload active-scope files and append one message with daemon-owned attachments.
c.send_files(
    group_id="g_xxx",
    paths=["reference.png", "candidate.png"],
    text="Inspect these files",
    to=["reviewer"],
)

# Current terminal operations.
recent = c.terminal_since(group_id="g_xxx", actor_id="reviewer", after=0)
c.term_resize(group_id="g_xxx", actor_id="reviewer", cols=120, rows=40)
```

A changed preamble applies on its next delivery; it is not reinjected into a
session that already received one. `group_reset` creates a new group id and
does not carry the override forward. If the preamble establishes a standby
boundary, wait until the actor returns to `waiting` or `idle` before sending
the authoritative mission. `send_files` accepts only regular files beneath
the group's active scope and validates every path before appending the message.

`events_stream` compatibility is verified by probing the operation itself;
the SDK does not rely only on the daemon's advertised capability flag.

`group_reset` is destructive: it creates a clean replacement and removes the
old group after copying selected configuration. The explicit confirmation must
equal the source group id:

```python
c.group_reset(group_id="g_xxx", confirm="g_xxx")
```

## CCCC 0.4.18 surface — Hermes runtime and Voice Secretary lease

```python
# Hermes runtime setup diagnostics and MCP preparation
status = c.runtime_hermes_status()
c.runtime_hermes_prepare(cwd=".", auto_enable_tools=True)
c.runtime_hermes_mcp_test(group_id="g_xxx", actor_id="hermes-1")

# Cross-tab Voice Secretary recording guard
lease = c.assistant_voice_recording_lease(
    group_id="g_xxx",
    action="acquire",
    owner_id="browser-tab-1",
    ttl_seconds=30,
)
```

## CCCC 0.4.17 surface — new op families

```python
from cccc_sdk import CCCCClient

c = CCCCClient()

# Tracked delegation — atomic task.create + send with idempotent replay
res = c.tracked_send(
    group_id="g_xxx",
    title="Fix login race",
    text="Please pick this up — see issue link",
    insight="The proposed fix may target the symptom rather than the ownership boundary.",
    to=["alice"],
    idempotency_key="fix-login-race-1",
    refs=[{"kind": "url", "url": "https://example.com/issue/42"}],
)
task_id = res["task_id"]

# Task list / per-task drill-down
tasks = c.task_list(group_id="g_xxx")
task = c.task_list(group_id="g_xxx", task_id=task_id)

# Structured refs on chat
c.send(
    group_id="g_xxx",
    text="Looking at the demo deck",
    insight="The deck may make the current option set look more settled than it is.",
    refs=[{"kind": "presentation_ref", "slot_id": "slot-1"}],
)

# Presentation workspace (slot-based viewer)
c.presentation_publish(
    group_id="g_xxx",
    slot="slot-1",
    title="Plan",
    card_type="markdown",
    content="# Sprint plan\n- ...",
)

# Built-in Voice Secretary lifecycle
state = c.assistant_state(group_id="g_xxx", assistant_id="voice_secretary")
c.assistant_settings_update(
    group_id="g_xxx", assistant_id="voice_secretary", patch={"enabled": True}
)

# Copy a group for migration / backup
pkg = c.group_copy_export(group_id="g_xxx")
preview = c.group_copy_preview_import(package_b64=pkg["package_b64"])
new_group = c.group_copy_import(package_b64=pkg["package_b64"])

# Headless runtime control (Claude/Codex headless and beyond)
c.headless_set_status(group_id="g_xxx", actor_id="reviewer", status="working", task_id=task_id)

# Capability Center extensions
c.capability_visibility(group_id="g_xxx", capability_id="skill:foo", hidden=True, actor_id="reviewer", by="reviewer")
c.capability_install_target(group_id="g_xxx", target="github:owner/repo", actor_id="reviewer", scope="session", ttl_seconds=600)

# Operator-side: terminal tail, ledger snapshot, branding/observability
c.terminal_tail(group_id="g_xxx", actor_id="reviewer", max_chars=4000)
c.ledger_snapshot(group_id="g_xxx", reason="manual")
c.branding_update(patch={"product_name": "My CCCC"})
```

Use `call()` for intentionally low-level or newly added non-streaming ops that
do not yet have a dedicated helper. Duplex browser/VNC/PTY attach operations
remain outside this request/response client and require a separate streaming
transport contract. See `spec/ADAPTATION_PLAN.md` for the exact boundary.
