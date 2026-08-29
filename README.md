# CCCC SDK — Official Client SDKs for CCCC

**English** | [中文](README.zh-CN.md) | [日本語](README.ja.md)

> Status: **contract-first SDK for CCCC daemon IPC v1**. Source packages on
> `main` target the current CCCC daemon contract. Publishing remains a separate release step.
> See `CHANGELOG.md` and `spec/ADAPTATION_PLAN.md` for exact scope.

CCCC SDK provides **client SDKs** for building applications on top of the CCCC platform.

## Relationship to CCCC Core

- CCCC core repository: https://github.com/ChesterRa/cccc
- `cccc` (core) ships one native Rust daemon/web/CLI product and owns runtime
  state in `CCCC_HOME`.
- `cccc-sdk` (this repo) provides Python, TypeScript, and Rust clients for **Daemon IPC v1**.
- SDK language is independent of the daemon implementation: Python and
  TypeScript applications connect to the same native daemon as Rust applications.
- The SDK is not a standalone framework. It always talks to a running CCCC daemon.

If SDK clients and CCCC Web use the same `CCCC_HOME`, all writes are shared immediately
(messages, Inbox reads, context operations, automation updates, etc.).

## What This Repo Contains

- `python/` — Python package (`cccc-sdk`, import name `cccc_sdk`)
- `ts/` — TypeScript package (`cccc-sdk`)
- `rust/` — Rust crate (`cccc-sdk`, crate name `cccc_sdk`)
- `spec/CCCC_*.md` and `spec/CCCS_V1.md` — mirrored CCCC contract docs
- `spec/SDK_*.md` — SDK-owned surface notes that are not yet core standards

Typical use cases:
- Reactive UI / IDE plugins that need real-time updates (`events_stream`)
- Bots/services that watch groups and respond automatically
- Reliable Rust workers that need identity-bound idempotent writes and atomic Mail consumption
- Internal tools that create/manage groups, actors, shared context, capability policy, and Group Space programmatically
- Workflow integrations that use `tracked_send`, Context Ops v3 task/agent state updates, capability discovery, and first-class local memory

For language-specific details:
- Python SDK: `python/README.md`
- TypeScript SDK: `ts/README.md`
- Rust SDK: `rust/README.md`

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
    require_ops=["groups", "send", "reply", "inbox_read", "context_get", "context_sync"],
)
print("OK: daemon is compatible")
PY
```

4) Run demos (from this repo):

```bash
# send a message
python python/examples/send.py --group g_xxx --text "hello" --mode send

# subscribe to the live event stream
python python/examples/stream.py --group g_xxx

# put useful non-urgent information in the recipient Inbox
python python/examples/send.py --group g_xxx --text "FYI" --mode mail
```

## Quick start (Rust)

```toml
[dependencies]
cccc-sdk = "0.0.2"
```

```rust
use cccc_sdk::{CCCCClient, CompatibilityRequirements};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = CCCCClient::discover()?;
    client.assert_compatible(&CompatibilityRequirements {
        minimum_ipc_version: 1,
        operations: vec!["groups", "send", "reply", "context_get"],
        ..Default::default()
    })?;
    println!("{:#?}", client.groups()?);
    Ok(())
}
```

---

## Versioning and compatibility

SDK releases follow daemon contracts, not strict daemon version strings:
- Python and TypeScript package versions track the current SDK release line; the
  Rust crate is on the `0.0.x` line while its public API settles.
- Use `assert_compatible(...)` with required capabilities/ops for runtime gating.

Compatibility is enforced by **contracts**, not by strict version string matching:
- IPC version (`ipc_v`)
- capability discovery (`capabilities`)
- operation probing (reject `unknown_op`)

The bundled CCCC daemon reports `implementation="rust"`. Third-party compatible
daemons still need to satisfy the same IPC and capability contract; clients do
not infer compatibility from the implementation label alone.

See `python/examples/compat_check.py`.

## Specs (contracts)

For the current CCCC daemon line, the canonical contract documents live in the main CCCC repo (so spec and daemon evolve together).
This repo keeps a mirror under `spec/`:

```bash
./scripts/sync_specs_from_cccc.sh ../cccc
# Reproduce a tagged mirror when auditing an older contract:
./scripts/sync_specs_from_cccc.sh ../cccc v0.4.35
```

The sync command intentionally replaces only the three mirrored standards.
SDK-specific surfaces are documented separately, for example in
`spec/SDK_LOCAL_MEMORY_API.md`.

---

## Security note

CCCC daemon IPC has **no authentication**. Only expose it on local transports, or use a secure tunnel/VPN.
