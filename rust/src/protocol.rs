use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::DaemonError;

/// Daemon IPC v1 request envelope.
#[derive(Clone, Debug, Serialize)]
pub struct DaemonRequest<'a> {
    pub v: u32,
    pub op: &'a str,
    pub args: &'a Map<String, Value>,
}

/// Daemon IPC v1 response envelope.
#[derive(Clone, Debug, Deserialize)]
pub struct DaemonResponse {
    pub v: u32,
    pub ok: bool,
    #[serde(default)]
    pub result: Map<String, Value>,
    #[serde(default)]
    pub error: Option<DaemonError>,
}

/// Stable fields returned by `ping`; unknown fields remain available through
/// [`CCCCClient::call`](crate::CCCCClient::call).
#[derive(Clone, Debug, Deserialize)]
pub struct PingResult {
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub pid: u64,
    #[serde(default)]
    pub ts: String,
    #[serde(default)]
    pub ipc_v: u32,
    #[serde(default)]
    pub capabilities: Map<String, Value>,
    pub implementation: String,
    #[serde(default)]
    pub compatibility: Option<String>,
}

/// Delivery policy for a newly stored chat message.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageMode {
    Send,
    RequestReply,
    Mail,
}

/// Delivery policy for a reply. Replies cannot create another reply obligation.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplyMessageMode {
    Send,
    Mail,
}

impl ReplyMessageMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Send => "send",
            Self::Mail => "mail",
        }
    }
}

/// Projection requested from `context_get`.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextDetail {
    Overview,
    Summary,
    Full,
}

impl ContextDetail {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::Summary => "summary",
            Self::Full => "full",
        }
    }
}

/// Optional mode filter for non-consuming message history reads.
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageHistoryMode {
    All,
    Send,
    RequestReply,
    Mail,
}

impl MessageHistoryMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Send => "send",
            Self::RequestReply => "request_reply",
            Self::Mail => "mail",
        }
    }
}

impl MessageMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Send => "send",
            Self::RequestReply => "request_reply",
            Self::Mail => "mail",
        }
    }
}

/// Optional arguments for `terminal_history`.
#[derive(Clone, Debug, Default)]
pub struct TerminalHistoryOptions {
    pub before: Option<u64>,
    pub limit_bytes: Option<u64>,
    pub strip_ansi: Option<bool>,
    pub compact: Option<bool>,
    pub by: Option<String>,
}

/// Optional arguments for `terminal_since`.
#[derive(Clone, Debug, Default)]
pub struct TerminalSinceOptions {
    pub limit_bytes: Option<u64>,
    pub by: Option<String>,
}

/// Optional arguments for `terminal_snapshot`.
#[derive(Clone, Debug, Default)]
pub struct TerminalSnapshotOptions {
    pub limit_bytes: Option<u64>,
    pub by: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TerminalSnapshotResult {
    pub data: String,
    pub start_cursor: u64,
    pub end_cursor: u64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TerminalHistoryResult {
    pub group_id: String,
    pub actor_id: String,
    pub warning: String,
    pub hint: String,
    pub text: String,
    pub start_cursor: u64,
    pub end_cursor: u64,
    pub has_more: bool,
    pub cursor_expired: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TerminalSinceHistory {
    pub data: String,
    pub start_cursor: u64,
    pub end_cursor: u64,
    pub has_more: bool,
    pub cursor_expired: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TerminalSinceResult {
    pub history: TerminalSinceHistory,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TerminalResizeResult {
    pub group_id: String,
    pub actor_id: String,
    pub cols: u32,
    pub rows: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WebModelDeliveryMode {
    Standard,
    ImageCompat,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WebModelDeliveryPreference {
    pub mode: WebModelDeliveryMode,
    pub updated_at: String,
    pub updated_by: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WebModelDeliveryPreferencesResult {
    pub group_id: String,
    pub actor_id: String,
    pub preference: WebModelDeliveryPreference,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WebModelRecoveredTurnDelivery {
    pub mode: String,
    pub cursor_committed: bool,
    pub web_model_mode: WebModelDeliveryMode,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WebModelRecoveredTurn {
    pub turn_id: String,
    pub group_id: String,
    pub actor_id: String,
    pub event_ids: Vec<String>,
    pub latest_event_id: String,
    pub latest_ts: String,
    pub messages: Vec<Value>,
    pub coalesced_text: String,
    pub system_prompt: String,
    pub delivery: WebModelRecoveredTurnDelivery,
}

#[derive(Clone, Debug, Deserialize)]
pub struct WebModelRuntimeRecoverTurnResult {
    pub status: String,
    pub turn: WebModelRecoveredTurn,
}
