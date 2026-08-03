use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;

/// Structured application error returned by the CCCC daemon.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct DaemonError {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub details: Value,
}

impl fmt::Display for DaemonError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for DaemonError {}

/// Errors produced while discovering, connecting to, or calling CCCC.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("CCCC daemon endpoint was not found: {0}")]
    EndpointNotFound(String),

    #[error("invalid CCCC daemon endpoint descriptor: {0}")]
    InvalidEndpoint(String),

    #[error("Unix sockets are unavailable on this platform")]
    UnixSocketUnsupported,

    #[error("CCCC daemon I/O failed: {0}")]
    Io(#[from] std::io::Error),

    #[error("CCCC daemon returned invalid JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("CCCC daemon response exceeded {0} bytes")]
    ResponseTooLarge(usize),

    #[error("CCCC daemon request exceeded {0} bytes")]
    RequestTooLarge(usize),

    #[error("CCCC daemon closed the connection without a response")]
    EmptyResponse,

    #[error("CCCC daemon response used unsupported IPC version {0}")]
    UnsupportedIpcVersion(u32),

    #[error("CCCC daemon error {0}")]
    Daemon(#[from] DaemonError),

    #[error("incompatible CCCC daemon: {0}")]
    Incompatible(String),
}

pub type Result<T> = std::result::Result<T, Error>;
