# CCCC Python SDK

This package is the **Python client SDK** for the CCCC daemon (Daemon IPC v1).

It requires a running CCCC daemon. The SDK does **not** ship a daemon.

## Versioning

This SDK matches **CCCC major/minor** (`0.4.0`), but the **RC sequence is SDK-owned**:
- Example: `cccc-sdk==0.4.0rcN` can be compatible with `cccc==0.4.x`.

## Daemon endpoint discovery

The SDK connects to the daemon endpoint described by:

- `${CCCC_HOME}/daemon/ccccd.addr.json` (preferred, cross-platform), or
- `${CCCC_HOME}/daemon/ccccd.sock` (POSIX AF_UNIX fallback)

## Install

### From TestPyPI (recommended for RCs)

```bash
python -m pip install --index-url https://pypi.org/simple \
  --extra-index-url https://test.pypi.org/simple \
  cccc-sdk==0.4.0rcN
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
