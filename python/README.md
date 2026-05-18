# CCCC Python SDK

This package is the **Python client SDK** for CCCC daemon (Daemon IPC v1).

## Relationship to CCCC core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` core owns daemon/web/CLI and runtime state under `CCCC_HOME`.
- `cccc-sdk` provides client APIs only and must connect to a running daemon.

It requires a running CCCC daemon. The SDK does **not** ship a daemon.

## Versioning

This SDK follows daemon contracts rather than strict daemon version strings:
- Use `assert_compatible(...)` with required capabilities/ops for runtime gating.
- Newer workflow helpers cover `tracked_send`, Context Ops v3 task/agent state operations, capability discovery, and ReMe memory search.

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
c.assert_compatible(require_ipc_v=1, require_capabilities={"events_stream": True})

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
python examples/send.py --group g_xxx --text "hello"
```

Auto-ACK attention messages (as a recipient):

```bash
python examples/auto_ack_attention.py --group g_xxx --actor user
```

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

# Context v3: add a compact shared decision or handoff
c.context_sync(
    group_id="g_xxx",
    by="user",
    ops=[{"op": "coordination.note.add", "kind": "decision", "summary": "Use the simpler path"}],
)
```

If you need an op that does not have a dedicated helper yet, use `call()` / `call_raw()`.

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

# Built-in assistant lifecycle (PET / Voice Secretary)
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

Not yet wrapped (use `call()` for now): remaining Voice Secretary document/transcribe/prompt ops, remaining Memory ReMe write/index/compaction ops, ChatGPT Web Model runtime, IM bridge management, Remote Access, and the streaming socket-special browser/PTY attach ops. See `spec/ADAPTATION_PLAN.md` for the roadmap.
