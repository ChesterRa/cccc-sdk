//! Official Rust client for CCCC daemon IPC v1.
//!
//! The client discovers the daemon from `CCCC_HOME`, sends one NDJSON request
//! per connection, and exposes both a generic JSON API and focused helpers for
//! common workflows.

mod client;
mod endpoint;
mod error;
mod identity;
mod protocol;
mod reliable;

pub use client::{CCCCClient, CompatibilityRequirements};
pub use endpoint::{discover_endpoint, DaemonEndpoint};
pub use error::{DaemonError, Error, Result};
pub use identity::{AuthenticatedPrincipal, WorkloadIdentityEvidence, WorkloadIdentityHook};
pub use protocol::{
    ContextDetail, DaemonRequest, DaemonResponse, MessageHistoryMode, MessageMode, PingResult,
    ReplyMessageMode, TerminalHistoryOptions, TerminalHistoryResult, TerminalResizeResult,
    TerminalSinceHistory, TerminalSinceOptions, TerminalSinceResult, TerminalSnapshotOptions,
    TerminalSnapshotResult, WebModelDeliveryMode, WebModelDeliveryPreference,
    WebModelDeliveryPreferencesResult, WebModelRecoveredTurn, WebModelRecoveredTurnDelivery,
    WebModelRuntimeRecoverTurnResult,
};
pub use reliable::{Event, IdentityBoundClient, InboxCursor, InboxPage, MessageWriteResult};
