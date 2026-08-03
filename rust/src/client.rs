use std::collections::BTreeMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde_json::{json, Map, Value};

use crate::{
    discover_endpoint, DaemonEndpoint, DaemonRequest, DaemonResponse, Error, PingResult, Result,
};

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_REQUEST_BYTES: usize = 2_000_000;
const MAX_RESPONSE_BYTES: usize = 4 * 1024 * 1024;

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
    timeout: Duration,
}

impl CCCCClient {
    /// Discover the currently running daemon.
    pub fn discover() -> Result<Self> {
        Self::discover_in(None)
    }

    /// Discover a daemon under an explicit `CCCC_HOME`.
    pub fn discover_in(cccc_home: Option<&Path>) -> Result<Self> {
        Ok(Self::new(discover_endpoint(cccc_home)?))
    }

    pub fn new(endpoint: DaemonEndpoint) -> Self {
        Self {
            endpoint,
            timeout: DEFAULT_TIMEOUT,
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn endpoint(&self) -> &DaemonEndpoint {
        &self.endpoint
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

        match &self.endpoint {
            DaemonEndpoint::Tcp { host, port } => {
                let address = (host.as_str(), *port)
                    .to_socket_addrs()?
                    .next()
                    .ok_or_else(|| {
                        Error::InvalidEndpoint(format!("cannot resolve {host}:{port}"))
                    })?;
                let mut stream = TcpStream::connect_timeout(&address, self.timeout)?;
                stream.set_read_timeout(Some(self.timeout))?;
                stream.set_write_timeout(Some(self.timeout))?;
                exchange(&mut stream, &encoded)
            }
            DaemonEndpoint::Unix(path) => self.call_unix(path, &encoded),
        }
    }

    #[cfg(unix)]
    fn call_unix(&self, path: &Path, encoded: &[u8]) -> Result<DaemonResponse> {
        use std::os::unix::net::UnixStream;

        let mut stream = UnixStream::connect(path)?;
        stream.set_read_timeout(Some(self.timeout))?;
        stream.set_write_timeout(Some(self.timeout))?;
        exchange(&mut stream, encoded)
    }

    #[cfg(not(unix))]
    fn call_unix(&self, _path: &Path, _encoded: &[u8]) -> Result<DaemonResponse> {
        Err(Error::UnixSocketUnsupported)
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

    pub fn send(&self, group_id: &str, text: &str, by: &str) -> Result<Map<String, Value>> {
        self.call(
            "send",
            object([
                ("group_id", json!(group_id)),
                ("text", json!(text)),
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
        self.call(
            "reply",
            object([
                ("group_id", json!(group_id)),
                ("reply_to", json!(reply_to)),
                ("text", json!(text)),
                ("by", json!(by)),
            ]),
        )
    }

    pub fn inbox_list(
        &self,
        group_id: &str,
        actor_id: &str,
        limit: Option<u32>,
    ) -> Result<Map<String, Value>> {
        let mut args = object([("group_id", json!(group_id)), ("actor_id", json!(actor_id))]);
        if let Some(limit) = limit {
            args.insert("limit".into(), json!(limit));
        }
        self.call("inbox_list", args)
    }

    pub fn context_get(&self, group_id: &str) -> Result<Map<String, Value>> {
        self.call("context_get", object([("group_id", json!(group_id))]))
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
    use std::net::TcpListener;
    use std::thread;

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

    #[test]
    fn sends_a_valid_ping_envelope() {
        let (endpoint, server) = server_once(
            "{\"v\":1,\"ok\":true,\"result\":{\"version\":\"0.4.33\",\"ipc_v\":1,\"capabilities\":{}}}\n",
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
    fn never_probes_destructive_or_streaming_operations() {
        assert!(operation_probe_is_unsafe("shutdown"));
        assert!(operation_probe_is_unsafe("term_attach"));
        assert!(!operation_probe_is_unsafe("group_show"));
    }
}
