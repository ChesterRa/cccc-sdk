use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::{json, Map, Value};

use crate::{
    discover_endpoint, ContextDetail, DaemonEndpoint, DaemonRequest, DaemonResponse, Error,
    MessageHistoryMode, MessageMode, PingResult, ReplyMessageMode, Result, TerminalHistoryOptions,
    TerminalHistoryResult, TerminalResizeResult, TerminalSinceOptions, TerminalSinceResult,
    TerminalSnapshotOptions, TerminalSnapshotResult, WebModelDeliveryMode,
    WebModelDeliveryPreferencesResult, WebModelRuntimeRecoverTurnResult,
};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_REQUEST_BYTES: usize = 2_000_000;
const MAX_RESPONSE_BYTES: usize = 4_000_000;

enum CallAttemptError {
    Connect(Error),
    Exchange(Error),
}

/// Capabilities and operations required by [`CCCCClient::assert_compatible`].
#[derive(Clone, Debug, Default)]
pub struct CompatibilityRequirements<'a> {
    pub minimum_ipc_version: u32,
    pub capabilities: BTreeMap<&'a str, bool>,
    pub operations: Vec<&'a str>,
}

/// Blocking CCCC Daemon IPC v1 client.
#[derive(Clone, Debug)]
pub struct CCCCClient {
    endpoint: DaemonEndpoint,
    rediscovered_endpoint: Arc<RwLock<Option<DaemonEndpoint>>>,
    timeout: Duration,
    discovery_home: Option<PathBuf>,
    rediscover_on_connect_failure: bool,
}

impl CCCCClient {
    /// Discover the currently running daemon.
    pub fn discover() -> Result<Self> {
        Self::discover_in(None)
    }

    /// Discover a daemon under an explicit `CCCC_HOME`.
    pub fn discover_in(cccc_home: Option<&Path>) -> Result<Self> {
        Ok(Self {
            endpoint: discover_endpoint(cccc_home)?,
            rediscovered_endpoint: Arc::new(RwLock::new(None)),
            timeout: DEFAULT_TIMEOUT,
            discovery_home: cccc_home.map(Path::to_path_buf),
            rediscover_on_connect_failure: true,
        })
    }

    pub fn new(endpoint: DaemonEndpoint) -> Self {
        Self {
            endpoint,
            rediscovered_endpoint: Arc::new(RwLock::new(None)),
            timeout: DEFAULT_TIMEOUT,
            discovery_home: None,
            rediscover_on_connect_failure: false,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// The endpoint supplied to `new` or found during initial discovery.
    pub fn endpoint(&self) -> &DaemonEndpoint {
        &self.endpoint
    }

    /// The endpoint currently used for calls, including a successful
    /// rediscovery after daemon restart.
    pub fn current_endpoint(&self) -> DaemonEndpoint {
        self.rediscovered_endpoint
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
            .unwrap_or_else(|| self.endpoint.clone())
    }

    /// Call any non-streaming daemon operation and return its result object.
    pub fn call(&self, op: &str, args: Map<String, Value>) -> Result<Map<String, Value>> {
        let response = self.call_raw(op, args)?;
        if response.v != 1 {
            return Err(Error::UnsupportedIpcVersion(response.v));
        }
        if response.ok {
            return Ok(response.result);
        }
        Err(Error::Daemon(response.error.unwrap_or_else(|| {
            crate::DaemonError {
                code: "error".into(),
                message: "daemon returned ok=false without an error".into(),
                details: json!({}),
            }
        })))
    }

    /// Call an operation and retain the full response envelope.
    pub fn call_raw(&self, op: &str, args: Map<String, Value>) -> Result<DaemonResponse> {
        if op.trim().is_empty() {
            return Err(Error::Incompatible("operation name cannot be empty".into()));
        }
        let request = DaemonRequest {
            v: 1,
            op,
            args: &args,
        };
        let mut encoded = serde_json::to_vec(&request)?;
        encoded.push(b'\n');
        if encoded.len() > MAX_REQUEST_BYTES {
            return Err(Error::RequestTooLarge(MAX_REQUEST_BYTES));
        }

        let endpoint = self.current_endpoint();
        let response = match self.call_at(&endpoint, &encoded) {
            Ok(response) => Ok(response),
            Err(CallAttemptError::Connect(_)) if self.rediscover_on_connect_failure => {
                let endpoint = discover_endpoint(self.discovery_home.as_deref())?;
                *self
                    .rediscovered_endpoint
                    .write()
                    .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(endpoint.clone());
                self.call_at(&endpoint, &encoded)
                    .map_err(|retry_error| finish_attempt_error(op, retry_error))
            }
            Err(error) => Err(finish_attempt_error(op, error)),
        }?;
        if response.v != 1 {
            return Err(Error::UnsupportedIpcVersion(response.v));
        }
        Ok(response)
    }

    fn call_at(
        &self,
        endpoint: &DaemonEndpoint,
        encoded: &[u8],
    ) -> std::result::Result<DaemonResponse, CallAttemptError> {
        match endpoint {
            DaemonEndpoint::Tcp { host, port } => {
                let address = (host.as_str(), *port)
                    .to_socket_addrs()
                    .map_err(|error| CallAttemptError::Connect(error.into()))?
                    .next()
                    .ok_or_else(|| Error::InvalidEndpoint(format!("cannot resolve {host}:{port}")))
                    .map_err(CallAttemptError::Connect)?;
                let mut stream = TcpStream::connect_timeout(&address, self.timeout)
                    .map_err(|error| CallAttemptError::Connect(error.into()))?;
                stream
                    .set_read_timeout(Some(self.timeout))
                    .map_err(|error| CallAttemptError::Connect(error.into()))?;
                stream
                    .set_write_timeout(Some(self.timeout))
                    .map_err(|error| CallAttemptError::Connect(error.into()))?;
                exchange(&mut stream, encoded).map_err(CallAttemptError::Exchange)
            }
            DaemonEndpoint::Unix(path) => self.call_unix(path, encoded),
        }
    }

    #[cfg(unix)]
    fn call_unix(
        &self,
        path: &Path,
        encoded: &[u8],
    ) -> std::result::Result<DaemonResponse, CallAttemptError> {
        use std::os::unix::net::UnixStream;

        let mut stream =
            UnixStream::connect(path).map_err(|error| CallAttemptError::Connect(error.into()))?;
        stream
            .set_read_timeout(Some(self.timeout))
            .map_err(|error| CallAttemptError::Connect(error.into()))?;
        stream
            .set_write_timeout(Some(self.timeout))
            .map_err(|error| CallAttemptError::Connect(error.into()))?;
        exchange(&mut stream, encoded).map_err(CallAttemptError::Exchange)
    }

    #[cfg(not(unix))]
    fn call_unix(
        &self,
        _path: &Path,
        _encoded: &[u8],
    ) -> std::result::Result<DaemonResponse, CallAttemptError> {
        Err(CallAttemptError::Connect(Error::UnixSocketUnsupported))
    }

    pub fn ping(&self) -> Result<PingResult> {
        self.call_typed("ping", Map::new())
    }

    pub fn groups(&self) -> Result<Map<String, Value>> {
        self.call("groups", Map::new())
    }

    pub fn group_show(&self, group_id: &str) -> Result<Map<String, Value>> {
        self.call("group_show", object([("group_id", json!(group_id))]))
    }

    pub fn send(
        &self,
        group_id: &str,
        text: &str,
        message_mode: MessageMode,
        by: &str,
    ) -> Result<Map<String, Value>> {
        self.call(
            "send",
            object([
                ("group_id", json!(group_id)),
                ("text", json!(text)),
                ("message_mode", json!(message_mode.as_str())),
                ("by", json!(by)),
            ]),
        )
    }

    pub fn reply(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        by: &str,
    ) -> Result<Map<String, Value>> {
        self.reply_with_mode(group_id, reply_to, text, ReplyMessageMode::Send, by)
    }

    pub fn reply_with_mode(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        message_mode: ReplyMessageMode,
        by: &str,
    ) -> Result<Map<String, Value>> {
        self.call(
            "reply",
            object([
                ("group_id", json!(group_id)),
                ("reply_to", json!(reply_to)),
                ("text", json!(text)),
                ("message_mode", json!(message_mode.as_str())),
                ("by", json!(by)),
            ]),
        )
    }

    pub fn reply_request_cancel(
        &self,
        group_id: &str,
        source_event_id: &str,
        by: &str,
    ) -> Result<Map<String, Value>> {
        self.call(
            "reply_request_cancel",
            object([
                ("group_id", json!(group_id)),
                ("source_event_id", json!(source_event_id)),
                ("by", json!(by)),
            ]),
        )
    }

    pub fn message_deliver(
        &self,
        group_id: &str,
        source_event_id: &str,
        actor_ids: &[&str],
        by: &str,
        force_ambiguous: bool,
    ) -> Result<Map<String, Value>> {
        if actor_ids.is_empty() || actor_ids.iter().any(|actor_id| actor_id.trim().is_empty()) {
            return Err(Error::InvalidArgument(
                "message_deliver requires one or more non-empty actor_ids".into(),
            ));
        }
        self.call(
            "message_deliver",
            object([
                ("group_id", json!(group_id)),
                ("source_event_id", json!(source_event_id)),
                ("actor_ids", json!(actor_ids)),
                ("by", json!(by)),
                ("force_ambiguous", json!(force_ambiguous)),
            ]),
        )
    }

    pub fn inbox_peek(
        &self,
        group_id: &str,
        actor_id: &str,
        by: &str,
        limit: Option<u32>,
    ) -> Result<Map<String, Value>> {
        let mut args = object([
            ("group_id", json!(group_id)),
            ("actor_id", json!(actor_id)),
            ("by", json!(by)),
        ]);
        if let Some(limit) = limit {
            args.insert("limit".into(), json!(limit));
        }
        self.call("inbox_peek", args)
    }

    pub fn inbox_read(
        &self,
        group_id: &str,
        actor_id: &str,
        by: &str,
        limit: Option<u32>,
    ) -> Result<Map<String, Value>> {
        let mut args = object([
            ("group_id", json!(group_id)),
            ("actor_id", json!(actor_id)),
            ("by", json!(by)),
        ]);
        if let Some(limit) = limit {
            args.insert("limit".into(), json!(limit));
        }
        self.call("inbox_read", args)
    }

    /// Inspect actor-visible chat history without consuming Mail.
    #[allow(clippy::too_many_arguments)]
    pub fn message_history(
        &self,
        group_id: &str,
        actor_id: &str,
        by: &str,
        mode: MessageHistoryMode,
        query: Option<&str>,
        before_event_id: Option<&str>,
        limit: Option<u32>,
    ) -> Result<Map<String, Value>> {
        let mut args = object([
            ("group_id", json!(group_id)),
            ("actor_id", json!(actor_id)),
            ("by", json!(by)),
            ("mode", json!(mode.as_str())),
        ]);
        if let Some(query) = query.filter(|value| !value.is_empty()) {
            args.insert("query".into(), json!(query));
        }
        if let Some(before_event_id) = before_event_id.filter(|value| !value.is_empty()) {
            args.insert("before_event_id".into(), json!(before_event_id));
        }
        if let Some(limit) = limit {
            args.insert("limit".into(), json!(limit));
        }
        self.call("message_history", args)
    }

    pub fn context_get(&self, group_id: &str) -> Result<Map<String, Value>> {
        self.context_get_with_detail(group_id, ContextDetail::Full)
    }

    pub fn context_get_with_detail(
        &self,
        group_id: &str,
        detail: ContextDetail,
    ) -> Result<Map<String, Value>> {
        self.call(
            "context_get",
            object([
                ("group_id", json!(group_id)),
                ("detail", json!(detail.as_str())),
            ]),
        )
    }

    pub fn context_sync(
        &self,
        group_id: &str,
        by: &str,
        operations: Vec<Value>,
    ) -> Result<Map<String, Value>> {
        self.call(
            "context_sync",
            object([
                ("group_id", json!(group_id)),
                ("by", json!(by)),
                ("ops", Value::Array(operations)),
            ]),
        )
    }

    pub fn terminal_history(
        &self,
        group_id: &str,
        actor_id: &str,
        options: &TerminalHistoryOptions,
    ) -> Result<TerminalHistoryResult> {
        let mut args = object([("group_id", json!(group_id)), ("actor_id", json!(actor_id))]);
        if let Some(before) = options.before {
            args.insert("before".into(), json!(before));
        }
        if let Some(limit_bytes) = options.limit_bytes {
            args.insert("limit_bytes".into(), json!(limit_bytes));
        }
        if let Some(strip_ansi) = options.strip_ansi {
            args.insert("strip_ansi".into(), json!(strip_ansi));
        }
        if let Some(compact) = options.compact {
            args.insert("compact".into(), json!(compact));
        }
        if let Some(by) = options.by.as_deref() {
            args.insert("by".into(), json!(by));
        }
        self.call_typed("terminal_history", args)
    }

    pub fn terminal_since(
        &self,
        group_id: &str,
        actor_id: &str,
        after: u64,
        options: &TerminalSinceOptions,
    ) -> Result<TerminalSinceResult> {
        let mut args = object([
            ("group_id", json!(group_id)),
            ("actor_id", json!(actor_id)),
            ("after", json!(after)),
        ]);
        if let Some(limit_bytes) = options.limit_bytes {
            args.insert("limit_bytes".into(), json!(limit_bytes));
        }
        if let Some(by) = options.by.as_deref() {
            args.insert("by".into(), json!(by));
        }
        self.call_typed("terminal_since", args)
    }

    pub fn terminal_snapshot(
        &self,
        group_id: &str,
        actor_id: &str,
        options: &TerminalSnapshotOptions,
    ) -> Result<TerminalSnapshotResult> {
        let mut args = object([("group_id", json!(group_id)), ("actor_id", json!(actor_id))]);
        if let Some(limit_bytes) = options.limit_bytes {
            args.insert("limit_bytes".into(), json!(limit_bytes));
        }
        if let Some(by) = options.by.as_deref() {
            args.insert("by".into(), json!(by));
        }
        self.call_typed("terminal_snapshot", args)
    }

    /// Resize a PTY using the normative op, with a compatibility fallback for
    /// Rust daemon builds that temporarily exposed `terminal_resize` instead.
    pub fn term_resize(
        &self,
        group_id: &str,
        actor_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<TerminalResizeResult> {
        let args = object([
            ("group_id", json!(group_id)),
            ("actor_id", json!(actor_id)),
            ("cols", json!(cols)),
            ("rows", json!(rows)),
        ]);
        match self.call_typed("term_resize", args.clone()) {
            Err(Error::Daemon(error)) if error.code == "unknown_op" => {
                let legacy = self.call("terminal_resize", args)?;
                let resolved_cols = legacy
                    .get("cols")
                    .and_then(Value::as_u64)
                    .and_then(|value| u32::try_from(value).ok())
                    .unwrap_or(cols);
                let resolved_rows = legacy
                    .get("rows")
                    .and_then(Value::as_u64)
                    .and_then(|value| u32::try_from(value).ok())
                    .unwrap_or(rows);
                Ok(TerminalResizeResult {
                    group_id: group_id.to_owned(),
                    actor_id: actor_id.to_owned(),
                    cols: resolved_cols,
                    rows: resolved_rows,
                })
            }
            result => result,
        }
    }

    pub fn web_model_delivery_preferences_get(
        &self,
        group_id: &str,
        actor_id: &str,
    ) -> Result<WebModelDeliveryPreferencesResult> {
        self.call_typed(
            "web_model_delivery_preferences_get",
            object([("group_id", json!(group_id)), ("actor_id", json!(actor_id))]),
        )
    }

    pub fn web_model_delivery_preferences_update(
        &self,
        group_id: &str,
        actor_id: &str,
        mode: WebModelDeliveryMode,
        by: &str,
    ) -> Result<WebModelDeliveryPreferencesResult> {
        self.call_typed(
            "web_model_delivery_preferences_update",
            object([
                ("group_id", json!(group_id)),
                ("actor_id", json!(actor_id)),
                ("mode", json!(mode)),
                ("by", json!(by)),
            ]),
        )
    }

    pub fn web_model_runtime_recover_turn(
        &self,
        group_id: &str,
        actor_id: &str,
        event_ids: &[String],
    ) -> Result<WebModelRuntimeRecoverTurnResult> {
        if event_ids.is_empty() || event_ids.iter().any(|event_id| event_id.trim().is_empty()) {
            return Err(Error::InvalidArgument(
                "event_ids must contain at least one non-empty event id".into(),
            ));
        }
        self.call_typed(
            "web_model_runtime_recover_turn",
            object([
                ("group_id", json!(group_id)),
                ("actor_id", json!(actor_id)),
                ("event_ids", json!(event_ids)),
            ]),
        )
    }

    /// Validate protocol, advertised capabilities, and actual op recognition.
    pub fn assert_compatible(
        &self,
        requirements: &CompatibilityRequirements<'_>,
    ) -> Result<PingResult> {
        let ping = self.ping()?;
        let minimum = requirements.minimum_ipc_version.max(1);
        if ping.ipc_v < minimum {
            return Err(Error::Incompatible(format!(
                "daemon ipc_v={} is below required ipc_v={minimum}",
                ping.ipc_v
            )));
        }
        for (name, required) in &requirements.capabilities {
            if *required && ping.capabilities.get(*name).and_then(Value::as_bool) != Some(true) {
                return Err(Error::Incompatible(format!(
                    "daemon capability {name}=true is required"
                )));
            }
        }
        for operation in &requirements.operations {
            if operation_probe_is_unsafe(operation) {
                continue;
            }
            match self.call(operation, Map::new()) {
                Err(Error::Daemon(error)) if error.code == "unknown_op" => {
                    if *operation == "term_resize" {
                        match self.call("terminal_resize", Map::new()) {
                            Err(Error::Daemon(alias_error)) if alias_error.code == "unknown_op" => {
                            }
                            Err(Error::Daemon(_)) | Ok(_) => continue,
                            Err(error) => return Err(error),
                        }
                    }
                    return Err(Error::Incompatible(format!(
                        "daemon does not support operation {operation}"
                    )));
                }
                Err(Error::Daemon(_)) | Ok(_) => {}
                Err(error) => return Err(error),
            }
        }
        Ok(ping)
    }

    fn call_typed<T: DeserializeOwned>(&self, op: &str, args: Map<String, Value>) -> Result<T> {
        let result = self.call(op, args)?;
        Ok(serde_json::from_value(Value::Object(result))?)
    }
}

fn operation_probe_is_unsafe(operation: &str) -> bool {
    matches!(
        operation,
        "ping"
            | "shutdown"
            | "group_create"
            | "registry_reconcile"
            | "capability_allowlist_update"
            | "capability_allowlist_reset"
            | "remote_access_configure"
            | "remote_access_start"
            | "remote_access_stop"
            | "group_space_provider_credential_update"
            | "group_space_provider_auth"
            | "term_attach"
            | "presentation_browser_attach"
            | "presentation_browser_vnc_attach"
            | "web_model_browser_attach"
            | "web_model_browser_vnc_attach"
            | "space_provider_auth_browser_attach"
            | "space_provider_auth_browser_vnc_attach"
            | "runtime_hermes_prepare"
            | "runtime_hermes_mcp_test"
    )
}

fn finish_attempt_error(op: &str, error: CallAttemptError) -> Error {
    match error {
        CallAttemptError::Connect(error) => error,
        CallAttemptError::Exchange(error) => Error::OutcomeUnknown {
            op: op.to_owned(),
            message: error.to_string(),
        },
    }
}

fn object<const N: usize>(entries: [(&str, Value); N]) -> Map<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect()
}

fn exchange<S: Read + Write>(stream: &mut S, request: &[u8]) -> Result<DaemonResponse> {
    stream.write_all(request)?;
    stream.flush()?;

    let mut reader = BufReader::new(stream);
    let mut response = Vec::new();
    let read = reader
        .by_ref()
        .take((MAX_RESPONSE_BYTES + 1) as u64)
        .read_until(b'\n', &mut response)?;
    if read == 0 {
        return Err(Error::EmptyResponse);
    }
    if response.len() > MAX_RESPONSE_BYTES {
        return Err(Error::ResponseTooLarge(MAX_RESPONSE_BYTES));
    }
    Ok(serde_json::from_slice(&response)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::fs;
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn server_once(response: &'static str) -> (DaemonEndpoint, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("local address");
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            let mut request = String::new();
            BufReader::new(&mut stream)
                .read_line(&mut request)
                .expect("read request");
            stream
                .write_all(response.as_bytes())
                .expect("write response");
            request
        });
        (
            DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: address.port(),
            },
            handle,
        )
    }

    fn server_sequence(
        responses: Vec<&'static str>,
    ) -> (DaemonEndpoint, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("local address");
        let handle = thread::spawn(move || {
            responses
                .into_iter()
                .map(|response| {
                    let (mut stream, _) = listener.accept().expect("accept client");
                    let mut request = String::new();
                    BufReader::new(&mut stream)
                        .read_line(&mut request)
                        .expect("read request");
                    stream
                        .write_all(response.as_bytes())
                        .expect("write response");
                    request
                })
                .collect()
        });
        (
            DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: address.port(),
            },
            handle,
        )
    }

    fn temp_home(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        env::temp_dir().join(format!(
            "cccc-sdk-client-{label}-{}-{nonce}",
            std::process::id()
        ))
    }

    fn write_tcp_descriptor(home: &Path, port: u16) {
        let daemon = home.join("daemon");
        fs::create_dir_all(&daemon).expect("create daemon directory");
        fs::write(
            daemon.join("ccccd.addr.json"),
            format!(r#"{{"v":1,"transport":"tcp","host":"127.0.0.1","port":{port}}}"#),
        )
        .expect("write descriptor");
    }

    #[test]
    fn sends_a_valid_ping_envelope() {
        let (endpoint, server) = server_once(
            "{\"v\":1,\"ok\":true,\"result\":{\"version\":\"0.4.33\",\"implementation\":\"rust\",\"ipc_v\":1,\"capabilities\":{}}}\n",
        );
        let ping = CCCCClient::new(endpoint).ping().expect("ping");
        assert_eq!(ping.version, "0.4.33");
        assert_eq!(ping.ipc_v, 1);

        let request: Value =
            serde_json::from_str(&server.join().expect("server thread")).expect("request JSON");
        assert_eq!(request, json!({"v": 1, "op": "ping", "args": {}}));
    }

    #[test]
    fn preserves_structured_daemon_errors() {
        let (endpoint, server) = server_once(
            "{\"v\":1,\"ok\":false,\"result\":{},\"error\":{\"code\":\"unknown_op\",\"message\":\"unknown\",\"details\":{}}}\n",
        );
        let error = CCCCClient::new(endpoint)
            .call("future_op", Map::new())
            .expect_err("daemon error");
        assert!(matches!(
            error,
            Error::Daemon(crate::DaemonError { ref code, .. }) if code == "unknown_op"
        ));
        server.join().expect("server thread");
    }

    #[test]
    fn maps_current_message_delivery_and_inbox_operations() {
        let response = "{\"v\":1,\"ok\":true,\"result\":{}}\n";
        let (endpoint, server) = server_sequence(vec![response; 7]);
        let client = CCCCClient::new(endpoint);

        client
            .send("g_1", "FYI", MessageMode::Mail, "user")
            .expect("send Mail");
        client
            .reply_with_mode(
                "g_1",
                "e_request",
                "quiet follow-up",
                ReplyMessageMode::Mail,
                "peer-1",
            )
            .expect("reply with Mail");
        client
            .reply_request_cancel("g_1", "e_request", "user")
            .expect("cancel reply request");
        client
            .message_deliver("g_1", "e_mail", &["peer-1"], "user", true)
            .expect("deliver existing message");
        client
            .inbox_peek("g_1", "peer-1", "user", Some(5))
            .expect("peek Inbox");
        client
            .inbox_read("g_1", "peer-1", "peer-1", Some(3))
            .expect("read Inbox");
        client
            .message_history(
                "g_1",
                "peer-1",
                "user",
                MessageHistoryMode::Send,
                Some("decision"),
                Some("e_before"),
                Some(7),
            )
            .expect("read message history");

        let requests: Vec<Value> = server
            .join()
            .expect("server thread")
            .iter()
            .map(|request| serde_json::from_str(request).expect("request JSON"))
            .collect();
        assert_eq!(requests[0]["args"]["message_mode"], "mail");
        assert_eq!(requests[1]["op"], "reply");
        assert_eq!(requests[1]["args"]["message_mode"], "mail");
        assert_eq!(requests[2]["op"], "reply_request_cancel");
        assert_eq!(requests[3]["args"]["actor_ids"], json!(["peer-1"]));
        assert_eq!(requests[3]["args"]["force_ambiguous"], true);
        assert_eq!(requests[4]["op"], "inbox_peek");
        assert_eq!(requests[5]["op"], "inbox_read");
        assert_eq!(requests[6]["op"], "message_history");
        assert_eq!(requests[6]["args"]["mode"], "send");
        assert_eq!(requests[6]["args"]["query"], "decision");
        assert_eq!(requests[6]["args"]["before_event_id"], "e_before");
        assert_eq!(requests[6]["args"]["limit"], 7);
        assert!(matches!(
            client.message_deliver("g_1", "e_mail", &[], "user", false),
            Err(Error::InvalidArgument(_))
        ));
    }

    #[test]
    fn context_get_uses_the_current_projection_contract() {
        let (endpoint, server) = server_once("{\"v\":1,\"ok\":true,\"result\":{}}\n");
        CCCCClient::new(endpoint)
            .context_get_with_detail("g_1", ContextDetail::Summary)
            .expect("summary context");
        let request: Value =
            serde_json::from_str(&server.join().expect("server thread")).expect("request JSON");
        assert_eq!(
            request,
            json!({"v": 1, "op": "context_get", "args": {"group_id": "g_1", "detail": "summary"}})
        );
    }

    #[test]
    fn never_probes_destructive_or_streaming_operations() {
        assert!(operation_probe_is_unsafe("shutdown"));
        assert!(operation_probe_is_unsafe("group_create"));
        assert!(operation_probe_is_unsafe("remote_access_start"));
        assert!(operation_probe_is_unsafe("term_attach"));
        assert!(!operation_probe_is_unsafe("group_show"));
    }

    #[test]
    fn call_raw_rejects_an_unsupported_response_version() {
        let (endpoint, server) = server_once("{\"v\":2,\"ok\":true,\"result\":{}}\n");
        let error = CCCCClient::new(endpoint)
            .call_raw("ping", Map::new())
            .expect_err("unsupported version");
        assert!(matches!(error, Error::UnsupportedIpcVersion(2)));
        server.join().expect("server thread");
    }

    #[test]
    fn maps_current_terminal_and_web_model_operations() {
        let preference = "{\"v\":1,\"ok\":true,\"result\":{\"group_id\":\"g_1\",\"actor_id\":\"web-1\",\"preference\":{\"mode\":\"image_compat\",\"updated_at\":\"now\",\"updated_by\":\"user\"}}}\n";
        let (endpoint, server) = server_sequence(vec![
            "{\"v\":1,\"ok\":true,\"result\":{\"data\":\"screen\",\"start_cursor\":1,\"end_cursor\":7}}\n",
            preference,
            preference,
            "{\"v\":1,\"ok\":true,\"result\":{\"status\":\"recovered\",\"turn\":{\"turn_id\":\"turn-1\",\"group_id\":\"g_1\",\"actor_id\":\"web-1\",\"event_ids\":[\"e_1\"],\"latest_event_id\":\"e_1\",\"latest_ts\":\"now\",\"messages\":[],\"coalesced_text\":\"hello\",\"system_prompt\":\"system\",\"delivery\":{\"mode\":\"recovery_no_cursor_mutation\",\"cursor_committed\":true,\"web_model_mode\":\"image_compat\"}}}}\n",
        ]);
        let client = CCCCClient::new(endpoint);

        let snapshot = client
            .terminal_snapshot(
                "g_1",
                "web-1",
                &TerminalSnapshotOptions {
                    limit_bytes: Some(4096),
                    by: Some("user".into()),
                },
            )
            .expect("terminal snapshot");
        assert_eq!(snapshot.end_cursor, 7);
        let preference = client
            .web_model_delivery_preferences_get("g_1", "web-1")
            .expect("preference get");
        assert_eq!(
            preference.preference.mode,
            WebModelDeliveryMode::ImageCompat
        );
        client
            .web_model_delivery_preferences_update(
                "g_1",
                "web-1",
                WebModelDeliveryMode::ImageCompat,
                "user",
            )
            .expect("preference update");
        let recovered = client
            .web_model_runtime_recover_turn("g_1", "web-1", &["e_1".into()])
            .expect("recover turn");
        assert_eq!(recovered.status, "recovered");

        let requests: Vec<Value> = server
            .join()
            .expect("server thread")
            .iter()
            .map(|request| serde_json::from_str(request).expect("request JSON"))
            .collect();
        assert_eq!(
            requests
                .iter()
                .map(|request| request["op"].as_str().expect("op"))
                .collect::<Vec<_>>(),
            vec![
                "terminal_snapshot",
                "web_model_delivery_preferences_get",
                "web_model_delivery_preferences_update",
                "web_model_runtime_recover_turn",
            ]
        );
        assert_eq!(requests[0]["args"]["limit_bytes"], 4096);
        assert_eq!(requests[2]["args"]["mode"], "image_compat");
        assert_eq!(requests[3]["args"]["event_ids"], json!(["e_1"]));
    }

    #[test]
    fn term_resize_prefers_the_standard_op_and_falls_back_for_unknown_op() {
        let (endpoint, server) = server_sequence(vec![
            "{\"v\":1,\"ok\":false,\"result\":{},\"error\":{\"code\":\"unknown_op\",\"message\":\"unknown\",\"details\":{}}}\n",
            "{\"v\":1,\"ok\":true,\"result\":{\"resized\":true,\"cols\":120,\"rows\":40}}\n",
        ]);
        let resized = CCCCClient::new(endpoint)
            .term_resize("g_1", "a_1", 120, 40)
            .expect("resize");
        assert_eq!(resized.group_id, "g_1");
        assert_eq!(resized.actor_id, "a_1");
        assert_eq!(resized.cols, 120);
        let requests = server.join().expect("server thread");
        let operations: Vec<String> = requests
            .iter()
            .map(|request| {
                serde_json::from_str::<Value>(request).expect("request JSON")["op"]
                    .as_str()
                    .expect("op")
                    .to_owned()
            })
            .collect();
        assert_eq!(operations, vec!["term_resize", "terminal_resize"]);
    }

    #[test]
    fn compatibility_probe_accepts_the_bounded_resize_alias() {
        let (endpoint, server) = server_sequence(vec![
            "{\"v\":1,\"ok\":true,\"result\":{\"version\":\"test\",\"implementation\":\"rust\",\"ipc_v\":1,\"capabilities\":{}}}\n",
            "{\"v\":1,\"ok\":false,\"result\":{},\"error\":{\"code\":\"unknown_op\",\"message\":\"unknown\",\"details\":{}}}\n",
            "{\"v\":1,\"ok\":false,\"result\":{},\"error\":{\"code\":\"invalid_request\",\"message\":\"missing args\",\"details\":{}}}\n",
        ]);
        let requirements = CompatibilityRequirements {
            minimum_ipc_version: 1,
            operations: vec!["term_resize"],
            ..Default::default()
        };
        CCCCClient::new(endpoint)
            .assert_compatible(&requirements)
            .expect("legacy alias is usable through the SDK");
        let operations: Vec<String> = server
            .join()
            .expect("server thread")
            .iter()
            .map(|request| {
                serde_json::from_str::<Value>(request).expect("request JSON")["op"]
                    .as_str()
                    .expect("op")
                    .to_owned()
            })
            .collect();
        assert_eq!(operations, vec!["ping", "term_resize", "terminal_resize"]);
    }

    #[test]
    fn rediscovers_endpoint_after_connect_failure_before_exchange() {
        let home = temp_home("rediscover");
        let stale = TcpListener::bind("127.0.0.1:0").expect("bind stale port");
        let stale_port = stale.local_addr().expect("stale address").port();
        drop(stale);
        write_tcp_descriptor(&home, stale_port);
        let client = CCCCClient::discover_in(Some(&home)).expect("discover stale endpoint");

        let listener = TcpListener::bind("127.0.0.1:0").expect("bind live server");
        let live_port = listener.local_addr().expect("live address").port();
        write_tcp_descriptor(&home, live_port);
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            let mut request = String::new();
            BufReader::new(&mut stream)
                .read_line(&mut request)
                .expect("read request");
            stream
                .write_all(b"{\"v\":1,\"ok\":true,\"result\":{\"implementation\":\"rust\",\"ipc_v\":1,\"capabilities\":{}}}\n")
                .expect("write response");
        });

        assert_eq!(client.ping().expect("ping").ipc_v, 1);
        assert_eq!(
            client.current_endpoint(),
            DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: live_port,
            }
        );
        server.join().expect("server thread");
        fs::remove_dir_all(home).expect("cleanup");
    }

    #[test]
    fn exchange_failure_is_reported_as_outcome_unknown_without_replay() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
        let address = listener.local_addr().expect("local address");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            let mut request = String::new();
            BufReader::new(&mut stream)
                .read_line(&mut request)
                .expect("read request");
        });
        let client = CCCCClient::new(DaemonEndpoint::Tcp {
            host: "127.0.0.1".into(),
            port: address.port(),
        });
        assert!(matches!(
            client.call("non_idempotent_write", Map::new()),
            Err(Error::OutcomeUnknown { ref op, .. }) if op == "non_idempotent_write"
        ));
        server.join().expect("server thread");
    }
}
