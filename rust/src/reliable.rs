use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

use crate::identity::{bind_identity, AuthenticatedPrincipal, WorkloadIdentityHook};
use crate::{CCCCClient, Error, MessageMode, ReplyMessageMode, Result};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Event {
    #[serde(alias = "event_id")]
    pub id: String,
    pub ts: String,
    pub kind: String,
    #[serde(default)]
    pub group_id: String,
    #[serde(default)]
    pub by: String,
    #[serde(default)]
    pub data: Value,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct InboxCursor {
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub event_id: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub ts: String,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct InboxPage {
    #[serde(default)]
    pub messages: Vec<Event>,
    pub cursor: InboxCursor,
    #[serde(default)]
    pub event: Option<Event>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MessageWriteResult {
    pub event: Event,
    pub message_mode: String,
    #[serde(default, alias = "duplicate")]
    pub replayed: bool,
}

/// Identity-bound adapter for the current message contract.
///
/// The adapter deliberately exposes no generic call, daemon lifecycle,
/// configuration, or credential operations. Stable `client_id` values are the
/// reconciliation boundary for writes. Mail reads delegate to the daemon's
/// atomic `inbox_read` transaction instead of emulating the retired ACK/cursor
/// operations.
pub struct IdentityBoundClient<H> {
    client: CCCCClient,
    identity: H,
    principal: AuthenticatedPrincipal,
}

impl<H: WorkloadIdentityHook> IdentityBoundClient<H> {
    pub fn new(client: CCCCClient, identity: H) -> Result<Self> {
        let principal = identity.principal()?;
        if principal.subject.trim().is_empty() || principal.issuer.trim().is_empty() {
            return Err(Error::Incompatible(
                "authenticated principal subject and issuer must be non-empty".into(),
            ));
        }
        Ok(Self {
            client,
            identity,
            principal,
        })
    }

    pub fn principal(&self) -> &AuthenticatedPrincipal {
        &self.principal
    }

    fn call(&self, operation: &str, mut args: Map<String, Value>) -> Result<Map<String, Value>> {
        let current = bind_identity(&self.identity, operation, &mut args)?;
        if current != self.principal {
            return Err(Error::Incompatible(
                "workload identity principal changed during the session".into(),
            ));
        }
        self.client.call(operation, args)
    }

    fn call_typed<T: for<'de> Deserialize<'de>>(
        &self,
        operation: &str,
        args: Map<String, Value>,
    ) -> Result<T> {
        Ok(serde_json::from_value(Value::Object(
            self.call(operation, args)?,
        ))?)
    }

    /// Append a message with a daemon-stable `client_id`.
    ///
    /// Reuse the exact mode, recipients, content, and key after
    /// [`Error::OutcomeUnknown`]. Never generate a new key for that retry.
    pub fn send_idempotent(
        &self,
        group_id: &str,
        text: &str,
        message_mode: MessageMode,
        recipients: &[&str],
        client_id: &str,
    ) -> Result<MessageWriteResult> {
        validate_client_id(client_id)?;
        validate_recipients(recipients)?;
        let mut args = object([
            ("group_id", Value::String(group_id.into())),
            ("text", Value::String(text.into())),
            ("message_mode", Value::String(message_mode.as_str().into())),
            ("client_id", Value::String(client_id.into())),
        ]);
        insert_recipients(&mut args, recipients);
        self.call_typed("send", args)
    }

    pub fn reconcile_send(
        &self,
        group_id: &str,
        text: &str,
        message_mode: MessageMode,
        recipients: &[&str],
        client_id: &str,
    ) -> Result<MessageWriteResult> {
        self.send_idempotent(group_id, text, message_mode, recipients, client_id)
    }

    /// Append a reply with a daemon-stable `client_id`.
    ///
    /// Replies may use Send or Mail but cannot create another reply request.
    pub fn reply_idempotent(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        message_mode: ReplyMessageMode,
        recipients: &[&str],
        client_id: &str,
    ) -> Result<MessageWriteResult> {
        validate_client_id(client_id)?;
        validate_recipients(recipients)?;
        let mut args = object([
            ("group_id", Value::String(group_id.into())),
            ("reply_to", Value::String(reply_to.into())),
            ("text", Value::String(text.into())),
            ("message_mode", Value::String(message_mode.as_str().into())),
            ("client_id", Value::String(client_id.into())),
        ]);
        insert_recipients(&mut args, recipients);
        self.call_typed("reply", args)
    }

    pub fn reconcile_reply(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        message_mode: ReplyMessageMode,
        recipients: &[&str],
        client_id: &str,
    ) -> Result<MessageWriteResult> {
        self.reply_idempotent(
            group_id,
            reply_to,
            text,
            message_mode,
            recipients,
            client_id,
        )
    }

    /// Inspect unread Mail without moving the daemon-owned cursor.
    pub fn inbox_peek(&self, group_id: &str, actor_id: &str, limit: u32) -> Result<InboxPage> {
        self.call_typed(
            "inbox_peek",
            object([
                ("group_id", Value::String(group_id.into())),
                ("actor_id", Value::String(actor_id.into())),
                ("limit", Value::from(limit)),
            ]),
        )
    }

    /// Atomically return and consume the next unread Mail prefix.
    pub fn inbox_read(&self, group_id: &str, actor_id: &str, limit: u32) -> Result<InboxPage> {
        self.call_typed(
            "inbox_read",
            object([
                ("group_id", Value::String(group_id.into())),
                ("actor_id", Value::String(actor_id.into())),
                ("limit", Value::from(limit)),
            ]),
        )
    }
}

fn insert_recipients(args: &mut Map<String, Value>, recipients: &[&str]) {
    if !recipients.is_empty() {
        args.insert(
            "to".into(),
            Value::Array(
                recipients
                    .iter()
                    .map(|value| Value::String((*value).into()))
                    .collect(),
            ),
        );
    }
}

fn deserialize_nullable_string<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

fn validate_client_id(client_id: &str) -> Result<()> {
    if client_id.trim().is_empty() || client_id.len() > 256 {
        return Err(Error::InvalidArgument(
            "client_id must contain 1..=256 bytes".into(),
        ));
    }
    Ok(())
}

fn validate_recipients(recipients: &[&str]) -> Result<()> {
    if recipients
        .iter()
        .any(|recipient| recipient.trim().is_empty())
    {
        return Err(Error::InvalidArgument(
            "message recipients must be non-empty".into(),
        ));
    }
    Ok(())
}

fn object<const N: usize>(entries: [(&str, Value); N]) -> Map<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WorkloadIdentityEvidence;
    use serde_json::json;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;

    #[derive(Clone)]
    struct SignedIdentity(&'static str);

    impl WorkloadIdentityHook for SignedIdentity {
        fn principal(&self) -> Result<AuthenticatedPrincipal> {
            AuthenticatedPrincipal::new(self.0, "test-spiffe")
        }

        fn evidence(
            &self,
            operation: &str,
            _args: &Map<String, Value>,
        ) -> Result<WorkloadIdentityEvidence> {
            WorkloadIdentityEvidence::new(
                "workload_identity",
                json!({"scheme": "test", "signature": format!("sig:{operation}")}),
            )
        }
    }

    fn server(
        responses: Vec<&'static str>,
    ) -> (
        crate::DaemonEndpoint,
        Arc<Mutex<Vec<Value>>>,
        thread::JoinHandle<()>,
    ) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let handle = thread::spawn(move || {
            for response in responses {
                let (mut stream, _) = listener.accept().expect("accept");
                let mut request = String::new();
                BufReader::new(&mut stream)
                    .read_line(&mut request)
                    .expect("request");
                captured
                    .lock()
                    .expect("lock")
                    .push(serde_json::from_str(&request).expect("JSON request"));
                stream.write_all(response.as_bytes()).expect("response");
            }
        });
        (
            crate::DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: address.port(),
            },
            requests,
            handle,
        )
    }

    fn message_response(id: &str, mode: &str, duplicate: bool) -> String {
        serde_json::json!({
            "v": 1,
            "ok": true,
            "result": {
                "event": {
                    "id": id,
                    "ts": "2026-08-29T01:00:00Z",
                    "kind": "chat.message",
                    "group_id": "g1",
                    "by": "workload:aquant",
                    "data": {"text": "hello", "message_mode": mode}
                },
                "message_mode": mode,
                "duplicate": duplicate
            }
        })
        .to_string()
            + "\n"
    }

    #[test]
    fn maps_current_modes_and_reconciles_with_client_id() {
        let responses = vec![
            Box::leak(message_response("e1", "mail", false).into_boxed_str()) as &'static str,
            Box::leak(message_response("e1", "mail", true).into_boxed_str()),
            Box::leak(message_response("e2", "send", false).into_boxed_str()),
            Box::leak(message_response("e2", "send", true).into_boxed_str()),
        ];
        let (endpoint, requests, handle) = server(responses);
        let client =
            IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity("workload:aquant"))
                .expect("client");

        let first = client
            .send_idempotent("g1", "hello", MessageMode::Mail, &["peer1"], "send-1")
            .expect("send");
        let replay = client
            .reconcile_send("g1", "hello", MessageMode::Mail, &["peer1"], "send-1")
            .expect("replay send");
        assert_eq!(first.event.id, replay.event.id);
        assert!(replay.replayed);

        let first_reply = client
            .reply_idempotent(
                "g1",
                "e1",
                "done",
                ReplyMessageMode::Send,
                &["user"],
                "reply-1",
            )
            .expect("reply");
        let replay_reply = client
            .reconcile_reply(
                "g1",
                "e1",
                "done",
                ReplyMessageMode::Send,
                &["user"],
                "reply-1",
            )
            .expect("replay reply");
        assert_eq!(first_reply.event.id, replay_reply.event.id);
        assert!(replay_reply.replayed);

        handle.join().expect("server");
        let requests = requests.lock().expect("requests");
        assert_eq!(requests[0]["op"], "send");
        assert_eq!(requests[0]["args"]["message_mode"], "mail");
        assert_eq!(requests[0]["args"]["client_id"], "send-1");
        assert_eq!(requests[0]["args"]["to"], json!(["peer1"]));
        assert_eq!(requests[0]["args"]["by"], "workload:aquant");
        assert_eq!(
            requests[0]["args"]["workload_identity"]["signature"],
            "sig:send"
        );
        assert_eq!(requests[2]["op"], "reply");
        assert_eq!(requests[2]["args"]["message_mode"], "send");
    }

    #[test]
    fn uses_atomic_mail_inbox_operations() {
        let peek = concat!(
            r#"{"v":1,"ok":true,"result":{"messages":[{"id":"e1","ts":"now","kind":"chat.message","group_id":"g1","by":"user","data":{"message_mode":"mail"}}],"cursor":{"event_id":"","ts":""}}}"#,
            "\n"
        );
        let read = concat!(
            r#"{"v":1,"ok":true,"result":{"messages":[{"id":"e1","ts":"now","kind":"chat.message","group_id":"g1","by":"user","data":{"message_mode":"mail"}}],"cursor":{"event_id":"e1","ts":"now","updated_at":"now"},"event":{"id":"r1","ts":"now","kind":"mail.read","group_id":"g1","by":"peer1","data":{"event_id":"e1"}}}}"#,
            "\n"
        );
        let (endpoint, requests, handle) = server(vec![peek, read]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity("peer1"))
            .expect("client");

        assert_eq!(
            client
                .inbox_peek("g1", "peer1", 5)
                .expect("peek")
                .messages
                .len(),
            1
        );
        let consumed = client.inbox_read("g1", "peer1", 5).expect("read");
        assert_eq!(consumed.messages.len(), 1);
        assert_eq!(consumed.cursor.event_id, "e1");
        assert_eq!(consumed.event.expect("read event").kind, "mail.read");

        handle.join().expect("server");
        let requests = requests.lock().expect("requests");
        assert_eq!(requests[0]["op"], "inbox_peek");
        assert_eq!(requests[1]["op"], "inbox_read");
        assert_eq!(requests[1]["args"]["by"], "peer1");
    }

    #[test]
    fn rejects_unstable_keys_and_blank_recipients_before_connecting() {
        let client = IdentityBoundClient::new(
            CCCCClient::new(crate::DaemonEndpoint::Tcp {
                host: "127.0.0.1".into(),
                port: 1,
            }),
            SignedIdentity("peer1"),
        )
        .expect("client");

        assert!(matches!(
            client.send_idempotent("g1", "x", MessageMode::Send, &[], ""),
            Err(Error::InvalidArgument(_))
        ));
        assert!(matches!(
            client.send_idempotent("g1", "x", MessageMode::Send, &["  "], "key"),
            Err(Error::InvalidArgument(_))
        ));
    }
}
