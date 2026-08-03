//! Official Rust client for CCCC daemon IPC v1.
//!
//! The client discovers the daemon from `CCCC_HOME`, sends one NDJSON request
//! per connection, and exposes both a generic JSON API and focused helpers for
//! common workflows.

mod client;
mod endpoint;
mod error;
mod protocol;

pub use client::{CCCCClient, CompatibilityRequirements};
pub use endpoint::{discover_endpoint, DaemonEndpoint};
pub use error::{DaemonError, Error, Result};
pub use protocol::{DaemonRequest, DaemonResponse, PingResult};
