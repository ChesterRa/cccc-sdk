use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::{Error, Result};

/// Transport endpoint advertised by the CCCC daemon.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DaemonEndpoint {
    Unix(PathBuf),
    Tcp { host: String, port: u16 },
}

#[derive(Debug, Deserialize)]
struct EndpointDescriptor {
    v: u32,
    transport: String,
    #[serde(default)]
    path: String,
    #[serde(default)]
    host: String,
    #[serde(default)]
    port: u16,
}

/// Discover a daemon endpoint under `cccc_home`, `CCCC_HOME`, or `~/.cccc`.
pub fn discover_endpoint(cccc_home: Option<&Path>) -> Result<DaemonEndpoint> {
    let home = match cccc_home {
        Some(path) => path.to_path_buf(),
        None => default_cccc_home()?,
    };
    let descriptor_path = home.join("daemon").join("ccccd.addr.json");

    if let Ok(contents) = fs::read_to_string(&descriptor_path) {
        let descriptor: EndpointDescriptor = serde_json::from_str(&contents)
            .map_err(|error| Error::InvalidEndpoint(error.to_string()))?;
        return endpoint_from_descriptor(descriptor);
    }

    #[cfg(unix)]
    {
        let socket = home.join("daemon").join("ccccd.sock");
        if socket.exists() {
            return Ok(DaemonEndpoint::Unix(socket));
        }
    }

    Err(Error::EndpointNotFound(
        descriptor_path.display().to_string(),
    ))
}

fn default_cccc_home() -> Result<PathBuf> {
    if let Some(path) = env::var_os("CCCC_HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let user_home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .ok_or_else(|| Error::EndpointNotFound("HOME/USERPROFILE is not set".into()))?;
    Ok(PathBuf::from(user_home).join(".cccc"))
}

fn endpoint_from_descriptor(descriptor: EndpointDescriptor) -> Result<DaemonEndpoint> {
    if descriptor.v != 1 {
        return Err(Error::InvalidEndpoint(format!(
            "descriptor version must be 1, got {}",
            descriptor.v
        )));
    }
    match descriptor.transport.as_str() {
        "unix" if !descriptor.path.is_empty() => {
            Ok(DaemonEndpoint::Unix(PathBuf::from(descriptor.path)))
        }
        "tcp" if descriptor.port > 0 => Ok(DaemonEndpoint::Tcp {
            host: normalize_tcp_host(&descriptor.host),
            port: descriptor.port,
        }),
        transport => Err(Error::InvalidEndpoint(format!(
            "invalid transport or address: {transport}"
        ))),
    }
}

fn normalize_tcp_host(host: &str) -> String {
    match host.trim() {
        "" | "0.0.0.0" | "::" | "[::]" | "localhost" => "127.0.0.1".into(),
        value => value.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_home() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        env::temp_dir().join(format!("cccc-sdk-endpoint-{}-{nonce}", std::process::id()))
    }

    #[test]
    fn discovers_and_normalizes_tcp_descriptor() {
        let home = temp_home();
        let daemon = home.join("daemon");
        fs::create_dir_all(&daemon).expect("create daemon dir");
        fs::write(
            daemon.join("ccccd.addr.json"),
            r#"{"v":1,"transport":"tcp","host":"0.0.0.0","port":43123}"#,
        )
        .expect("write descriptor");

        let endpoint = discover_endpoint(Some(&home)).expect("discover endpoint");
        assert_eq!(
            endpoint,
            DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: 43123,
            }
        );
        fs::remove_dir_all(home).expect("cleanup");
    }

    #[test]
    fn rejects_unknown_descriptor_versions() {
        let result = endpoint_from_descriptor(EndpointDescriptor {
            v: 2,
            transport: "tcp".into(),
            path: String::new(),
            host: "127.0.0.1".into(),
            port: 43123,
        });
        assert!(matches!(result, Err(Error::InvalidEndpoint(_))));
    }
}
