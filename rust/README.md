# CCCC Rust SDK

Official blocking Rust client for CCCC Daemon IPC v1.

## Install

```toml
[dependencies]
cccc-sdk = "0.0.1"
```

## Quick start

```rust
use cccc_sdk::{CCCCClient, CompatibilityRequirements};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = CCCCClient::discover()?;
    let requirements = CompatibilityRequirements {
        minimum_ipc_version: 1,
        operations: vec!["groups", "send", "reply", "context_get"],
        ..Default::default()
    };
    let daemon = client.assert_compatible(&requirements)?;
    println!("connected to CCCC {}", daemon.version);

    let groups = client.groups()?;
    println!("{groups:#?}");
    Ok(())
}
```

The client discovers `${CCCC_HOME}/daemon/ccccd.addr.json`, supports Unix
sockets and TCP, and falls back to `${CCCC_HOME}/daemon/ccccd.sock` on Unix.

Common helpers include `ping`, `groups`, `group_show`, `send`, `reply`,
`inbox_list`, `context_get`, and `context_sync`. Use `call` for every other
non-streaming CCCC 0.4.33 operation:

```rust
use cccc_sdk::CCCCClient;
use serde_json::{json, Map};

let client = CCCCClient::discover()?;
let args: Map<String, _> = [("group_id".into(), json!("g_xxx"))]
    .into_iter()
    .collect();
let preamble = client.call("group_preamble_get", args)?;
# Ok::<(), Box<dyn std::error::Error>>(())
```

`assert_compatible` probes requested operation names and rejects an advertised
capability whose actual operation returns `unknown_op`.

Streaming upgrade operations such as `events_stream` and `term_attach` are not
exposed as iterators in 0.0.1. `assert_compatible` deliberately skips unsafe
duplex probes; a reusable stream API will be added only with stable ownership,
close, and backpressure semantics.
