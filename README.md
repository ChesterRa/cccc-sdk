# CCCC SDK 0.4.x — Official Client SDKs for CCCC

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md)

> Status: **stable for CCCC 0.4.x**. RC builds remain available for preview testing.

CCCC SDK provides **client SDKs** for building applications on top of the CCCC platform.

## Relationship to CCCC Core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` (core) ships the daemon/web/CLI and owns runtime state in `CCCC_HOME`.
- `cccc-sdk` (this repo) provides Python/TypeScript clients for **Daemon IPC v1**.
- The SDK is not a standalone framework. It always talks to a running CCCC daemon.

If SDK clients and CCCC Web use the same `CCCC_HOME`, all writes are shared immediately
(messages, ACKs, context operations, automation updates, etc.).

## What This Repo Contains

- `python/` — Python package (`cccc-sdk`, import name `cccc_sdk`)
- `ts/` — TypeScript package (`cccc-sdk`)
- `spec/` — mirrored contract docs used for SDK development

Typical use cases:
- Reactive UI / IDE plugins that need real-time updates (`events_stream`)
- Bots/services that watch groups and respond automatically
- Internal tools that create/manage groups, actors, and shared context programmatically

For language-specific details:
- Python SDK: `python/README.md`
- TypeScript SDK: `ts/README.md`

---

## Quick start (Python)

1) Start CCCC (daemon + web):

```bash
cccc
```

2) Install the SDK (stable):

```bash
pip install -U cccc-sdk

# RC channel (optional, TestPyPI first)
pip install -U --pre --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk
```

3) Compatibility check (recommended):

```bash
python - <<'PY'
from cccc_sdk import CCCCClient

c = CCCCClient()
c.assert_compatible(
    require_ipc_v=1,
    require_capabilities={"events_stream": True},
    require_ops=["groups", "send", "reply", "inbox_list", "context_get", "context_sync"],
)
print("OK: daemon is compatible")
PY
```

4) Run demos (from this repo):

```bash
# send a message
python python/examples/send.py --group g_xxx --text "hello"

# subscribe to the live event stream
python python/examples/stream.py --group g_xxx

# auto-ACK attention messages (as user)
python python/examples/auto_ack_attention.py --group g_xxx --actor user
```

---

## Versioning and compatibility

SDK versions track **CCCC major/minor** (`0.4.x`), while patch/RC cadence is SDK-owned:
- Stable: `cccc-sdk==0.4.0` with `cccc==0.4.x`
- RC preview: `cccc-sdk==0.4.1rc1` can still be compatible with `cccc==0.4.x`

Compatibility is enforced by **contracts**, not by strict version string matching:
- IPC version (`ipc_v`)
- capability discovery (`capabilities`)
- operation probing (reject `unknown_op`)

See `python/examples/compat_check.py`.

## Specs (contracts)

For CCCC v0.4.x, the canonical contract documents live in the main CCCC repo (so spec and daemon evolve together).
This repo keeps a mirror under `spec/`:

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## Security note

CCCC daemon IPC has **no authentication**. Only expose it on local transports, or use a secure tunnel/VPN.
