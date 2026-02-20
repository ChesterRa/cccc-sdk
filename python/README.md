# CCCC Python SDK

This package is the **Python client SDK** for CCCC daemon (Daemon IPC v1).

## Relationship to CCCC core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` core owns daemon/web/CLI and runtime state under `CCCC_HOME`.
- `cccc-sdk` provides client APIs only and must connect to a running daemon.

It requires a running CCCC daemon. The SDK does **not** ship a daemon.

## Versioning

This SDK tracks **CCCC major/minor** (`0.4.x`), while patch/RC cadence is SDK-owned:
- Stable example: `cccc-sdk==0.4.0` with `cccc==0.4.x`
- RC preview example: `cccc-sdk==0.4.1rc1` with `cccc==0.4.x`

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

Add a note to shared context:

```bash
python examples/context_add_note.py --group g_xxx --content "remember to do X"
```

Cross-group send:

```bash
python examples/send_cross_group.py --src g_src --dst g_dst --text "hello from src"
```

## Actor Profiles (global reusable runtime presets)

`cccc` 0.4.x supports global Actor Profiles so you can reuse runtime/runner/command/env across groups.

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
    }
)
profile_id = str((profile.get("profile") or {}).get("id") or "")

# create actor from profile
c.actor_add(group_id="g_xxx", actor_id="reviewer", profile_id=profile_id)

# profile secrets (write-only values)
c.actor_profile_secret_update(profile_id=profile_id, set={"OPENAI_API_KEY": "..."})
```
