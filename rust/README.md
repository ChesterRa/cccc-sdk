# CCCC Rust SDK

Official blocking Rust client for the native CCCC Daemon IPC v1. SDK language
does not constrain application architecture; Python and TypeScript clients use
the same daemon contract.

## Install

```toml
[dependencies]
cccc-sdk = "0.0.1"
```

## Quick start

```rust
use cccc_sdk::{CCCCClient, CompatibilityRequirements, MessageMode, ReplyMessageMode};

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
    client.send("g_xxx", "FYI", MessageMode::Mail, "user")?;
    client.reply_with_mode(
        "g_xxx",
        "e_request",
        "quiet follow-up",
        ReplyMessageMode::Mail,
        "peer-1",
    )?;
    Ok(())
}
```

The client discovers `${CCCC_HOME}/daemon/ccccd.addr.json`, supports Unix
sockets and TCP, and falls back to `${CCCC_HOME}/daemon/ccccd.sock` on Unix.

Common helpers include `ping`, `groups`, `group_show`, `send`, `reply`,
`inbox_peek`, `inbox_read`, `message_history`, `message_deliver`, `reply_request_cancel`,
`context_get`, `context_get_with_detail`, `context_sync`, cursor-based terminal
reads, and Web Model delivery-preference/recovery operations. Use `call`
for every other non-streaming operation:

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

Terminal helpers return typed cursor payloads. `term_resize` uses the standard
operation name and falls back to the compatibility
`terminal_resize` alias only after `unknown_op`; the legacy success payload is
normalized to the standard typed result:

```rust
use cccc_sdk::{CCCCClient, TerminalSnapshotOptions};

let client = CCCCClient::discover()?;
let snapshot = client.terminal_snapshot(
    "g_xxx",
    "web-model",
    &TerminalSnapshotOptions {
        limit_bytes: Some(512_000),
        by: Some("user".into()),
    },
)?;
println!("cursor={}", snapshot.end_cursor);
# Ok::<(), Box<dyn std::error::Error>>(())
```

Clients created by `discover` / `discover_in` re-read `ccccd.addr.json` after
a connection-establishment failure. Once request exchange begins, failures are
reported as `Error::OutcomeUnknown` and are never replayed automatically.
Clients created with `new(endpoint)` keep that explicit endpoint.

`assert_compatible` probes requested operation names and rejects an advertised
capability whose actual operation returns `unknown_op`.

Streaming upgrade operations such as `events_stream` and `term_attach` are not
exposed as iterators in 0.0.1. `assert_compatible` deliberately skips unsafe
duplex probes; a reusable stream API will be added only with stable ownership,
close, and backpressure semantics.
