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
    #[serde(default)]
    pub implementation: Option<String>,
    #[serde(default)]
    pub compatibility: Option<String>,
}
