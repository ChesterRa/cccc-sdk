use serde::Serialize;
use serde_json::{Map, Value};

use crate::{CCCCClient, Error, MessageMode, Result};

/// Qualified directory read. This does not refresh peers or start Actors.
#[derive(Clone, Debug, Serialize)]
pub struct ConnectCatalogOptions {
    pub group_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instance_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

/// Durable remote acceptance is not proof of delivery. Retain client_id on retry.
#[derive(Clone, Debug, Serialize)]
pub struct ConnectSendOptions {
    pub group_id: String,
    pub instance_id: String,
    pub target_group_id: String,
    pub client_id: String,
    pub text: String,
    pub message_mode: MessageMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub insight: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<Value>>,
}

impl ConnectSendOptions {
    fn arguments(&self) -> Result<Map<String, Value>> {
        if self.client_id.trim().is_empty() || self.client_id.len() > 128 {
            return Err(Error::InvalidArgument(
                "client_id must be non-empty and at most 128 UTF-8 bytes".into(),
            ));
        }
        Ok(serde_json::from_value(serde_json::to_value(self)?)?)
    }
}

impl CCCCClient {
    pub fn connect_catalog(&self, options: &ConnectCatalogOptions) -> Result<Map<String, Value>> {
        self.call(
            "connect_catalog",
            serde_json::from_value(serde_json::to_value(options)?)?,
        )
    }

    pub fn connect_send(&self, options: &ConnectSendOptions) -> Result<Map<String, Value>> {
        self.call("connect_send", options.arguments()?)
    }

    /// Paths are read by the daemon within the source Group's active scope.
    pub fn connect_send_files(
        &self,
        options: &ConnectSendOptions,
        paths: &[String],
    ) -> Result<Map<String, Value>> {
        if paths.is_empty() || paths.iter().any(|path| path.trim().is_empty()) {
            return Err(Error::InvalidArgument(
                "paths must contain one or more non-empty paths".into(),
            ));
        }
        if options.attachments.is_some() {
            return Err(Error::InvalidArgument(
                "connect_send_files takes paths, not attachments".into(),
            ));
        }
        let mut args = options.arguments()?;
        args.insert("paths".into(), serde_json::to_value(paths)?);
        self.call("connect_send_files", args)
    }
}
