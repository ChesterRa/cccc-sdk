# CCCC SDK — Official Client SDKs for CCCC

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md)

> Status: **contract-first SDK for CCCC daemon IPC v1**. Source packages on
> `main` target CCCC 0.4.32; publishing remains a separate release step. See
> `CHANGELOG.md` and `spec/ADAPTATION_PLAN.md` for exact scope.

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
- `spec/CCCC_*.md` and `spec/CCCS_V1.md` — mirrored CCCC contract docs
- `spec/SDK_*.md` — SDK-owned surface notes that are not yet core standards

Typical use cases:
- Reactive UI / IDE plugins that need real-time updates (`events_stream`)
- Bots/services that watch groups and respond automatically
- Internal tools that create/manage groups, actors, shared context, capability policy, and Group Space programmatically
- Workflow integrations that use `tracked_send`, Context Ops v3 task/agent state updates, capability discovery, and first-class local memory

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

SDK releases follow daemon contracts, not strict daemon version strings:
- Python and TypeScript package versions track the current SDK release line, while RC sequencing remains SDK-owned.
- Use `assert_compatible(...)` with required capabilities/ops for runtime gating.

Compatibility is enforced by **contracts**, not by strict version string matching:
- IPC version (`ipc_v`)
- capability discovery (`capabilities`)
- operation probing (reject `unknown_op`)

See `python/examples/compat_check.py`.

## Specs (contracts)

For the current CCCC daemon line, the canonical contract documents live in the main CCCC repo (so spec and daemon evolve together).
This repo keeps a mirror under `spec/`:

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

The sync command intentionally replaces only the three mirrored standards.
SDK-specific surfaces are documented separately, for example in
`spec/SDK_LOCAL_MEMORY_API.md`.

---

## Security note

CCCC daemon IPC has **no authentication**. Only expose it on local transports, or use a secure tunnel/VPN.
