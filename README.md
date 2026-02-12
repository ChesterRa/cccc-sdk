# CCCC SDK 0.4.x (RC) — Client SDKs for the CCCC daemon

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md)

> Status: **0.4.x RC** (Release Candidate). Contracts and SDK ergonomics are still being hardened.

CCCC SDK is a set of **client SDKs** for building higher-level applications on top of the
**CCCC daemon** (the single-writer collaboration kernel).

Typical use cases:
- Reactive UI / IDE plugins that need real-time updates (`events_stream`)
- Bots/services that watch groups and respond automatically
- Internal tools that create/manage groups, actors, and shared context programmatically

**Important:** the SDK does **not** ship a daemon. CCCC remains the source of truth:
- The daemon owns the ledger/context/presence storage under `CCCC_HOME` (default `~/.cccc/`).
- SDKs are clients that call the daemon over **Daemon IPC v1**.

If the SDK and the Web UI point to the **same `CCCC_HOME`**, everything the SDK writes
(messages, ACKs, context ops, etc.) will show up in the Web UI.

---

## Quick start (Python)

1) Start CCCC (daemon + web):

```bash
cccc
```

2) Install the SDK (RCs are typically published to TestPyPI first):

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rcN
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

## Versioning (why RC numbers may not match CCCC)

SDK versions match **CCCC major/minor** (`0.4.0`), but the **RC sequence is SDK-owned**:
- Example: `cccc-sdk==0.4.0rcN` can be compatible with `cccc==0.4.x`.

Compatibility is enforced by **contracts**, not by strict RC number matching:
- IPC version (`ipc_v`)
- capability discovery (`capabilities`)
- operation probing (reject `unknown_op`)

See `python/examples/compat_check.py`.

---

## Repository layout

- `spec/` — contract documents mirrored for SDK development
- `python/` — Python package (`cccc-sdk`, import `cccc_sdk`)
- `ts/` — TypeScript SDK (Node.js)

---

## Specs (contracts)

For CCCC v0.4.x, the canonical contract documents live in the main CCCC repo (so spec and daemon evolve together).
This repo keeps a mirror under `spec/`:

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
```

---

## Security note

CCCC daemon IPC has **no authentication**. Only expose it on local transports, or use a secure tunnel/VPN.
