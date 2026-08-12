use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};

use crate::identity::{bind_identity, AuthenticatedPrincipal, WorkloadIdentityHook};
use crate::{CCCCClient, Error, Result};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Event {
    #[serde(alias = "event_id")]
    pub id: String,
    pub ts: String,
    pub kind: String,
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
}

#[derive(Clone, Debug, Deserialize)]
pub struct InboxPage {
    #[serde(default)]
    pub messages: Vec<Event>,
    pub cursor: InboxCursor,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MarkReadResult {
    pub cursor: InboxCursor,
    #[serde(default)]
    pub event: Option<Event>,
    #[serde(default)]
    pub replayed: bool,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MessageWriteResult {
    pub event: Event,
    #[serde(default, alias = "duplicate")]
    pub replayed: bool,
}

#[derive(Debug, Deserialize)]
struct MessageReadStatus {
    #[serde(default)]
    read_status: BTreeMap<String, bool>,
}

#[derive(Debug, Deserialize)]
struct LedgerWindow {
    #[serde(default)]
    events: Vec<Event>,
    #[serde(default)]
    has_more_after: bool,
}

/// Result of querying the daemon cursor before reconciling `inbox_mark_read`.
#[derive(Clone, Debug)]
pub struct MarkReadReconciliation {
    pub cursor: InboxCursor,
    pub wrote: bool,
    pub result: Option<MarkReadResult>,
}

/// Durable storage for the last fully processed inbox event.
pub trait CursorStore {
    fn load(&self) -> Result<Option<InboxCursor>>;
    fn save(&self, cursor: &InboxCursor) -> Result<()>;
}

/// JSON cursor file written by a same-directory temporary file + atomic replace.
#[derive(Clone, Debug)]
pub struct FileCursorStore {
    path: PathBuf,
}

impl FileCursorStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl CursorStore for FileCursorStore {
    fn load(&self) -> Result<Option<InboxCursor>> {
        match fs::read(&self.path) {
            Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(Error::Io(error)),
        }
    }

    fn save(&self, cursor: &InboxCursor) -> Result<()> {
        validate_cursor(cursor)?;
        if let Some(parent) = self
            .path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(local_write_error)?;
        }
        let parent = self
            .path
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let bytes = serde_json::to_vec(cursor)?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(local_write_error)?;
        temp.write_all(&bytes).map_err(local_write_error)?;
        temp.as_file().sync_all().map_err(local_write_error)?;
        temp.persist(&self.path)
            .map_err(|error| local_write_error(error.error))?;
        #[cfg(unix)]
        fs::File::open(parent)
            .and_then(|directory| directory.sync_all())
            .map_err(local_write_error)?;
        Ok(())
    }
}

fn local_write_error(source: io::Error) -> Error {
    Error::Io(source)
}

/// Identity-bound API exposing only the P0 chat/inbox operations.
///
/// There is deliberately no generic `call`, daemon shutdown, configuration,
/// or credential operation on this adapter.
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

    /// Send with a daemon-stable caller key. Reuse the same key to reconcile
    /// an `Unknown` write outcome; never generate a new key for that retry.
    pub fn send_idempotent(
        &self,
        group_id: &str,
        text: &str,
        idempotency_key: &str,
    ) -> Result<MessageWriteResult> {
        validate_key(idempotency_key)?;
        self.call_typed(
            "send",
            object([
                ("group_id", Value::String(group_id.into())),
                ("text", Value::String(text.into())),
                ("client_id", Value::String(idempotency_key.into())),
            ]),
        )
    }

    pub fn reconcile_send(
        &self,
        group_id: &str,
        text: &str,
        idempotency_key: &str,
    ) -> Result<MessageWriteResult> {
        self.send_idempotent(group_id, text, idempotency_key)
    }

    pub fn reply_idempotent(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        idempotency_key: &str,
    ) -> Result<MessageWriteResult> {
        validate_key(idempotency_key)?;
        self.call_typed(
            "reply",
            object([
                ("group_id", Value::String(group_id.into())),
                ("reply_to", Value::String(reply_to.into())),
                ("text", Value::String(text.into())),
                ("client_id", Value::String(idempotency_key.into())),
            ]),
        )
    }

    pub fn reconcile_reply(
        &self,
        group_id: &str,
        reply_to: &str,
        text: &str,
        idempotency_key: &str,
    ) -> Result<MessageWriteResult> {
        self.reply_idempotent(group_id, reply_to, text, idempotency_key)
    }

    pub fn inbox_list(&self, group_id: &str, actor_id: &str, limit: u32) -> Result<InboxPage> {
        self.call_typed(
            "inbox_list",
            object([
                ("group_id", Value::String(group_id.into())),
                ("actor_id", Value::String(actor_id.into())),
                ("limit", Value::from(limit)),
            ]),
        )
    }

    pub fn mark_read_idempotent(
        &self,
        group_id: &str,
        actor_id: &str,
        cursor: &InboxCursor,
        idempotency_key: &str,
    ) -> Result<MarkReadResult> {
        validate_key(idempotency_key)?;
        self.call_typed(
            "inbox_mark_read",
            object([
                ("group_id", Value::String(group_id.into())),
                ("actor_id", Value::String(actor_id.into())),
                ("event_id", Value::String(cursor.event_id.clone())),
                ("idempotency_key", Value::String(idempotency_key.into())),
            ]),
        )
    }

    /// Query the daemon cursor and issue `inbox_mark_read` only when the target
    /// is not already covered. This closes the write-then-disconnect window
    /// even for daemon builds that do not replay `idempotency_key` themselves.
    pub fn reconcile_mark_read(
        &self,
        group_id: &str,
        actor_id: &str,
        cursor: &InboxCursor,
        idempotency_key: &str,
    ) -> Result<MarkReadReconciliation> {
        validate_cursor(cursor)?;
        validate_key(idempotency_key)?;
        let page = self.inbox_list(group_id, actor_id, 1)?;
        match self.remote_cursor_relation(group_id, actor_id, &page.cursor, cursor)? {
            CursorRelation::Covers => Ok(MarkReadReconciliation {
                cursor: page.cursor,
                wrote: false,
                result: None,
            }),
            CursorRelation::Behind => {
                let result =
                    self.mark_read_idempotent(group_id, actor_id, cursor, idempotency_key)?;
                Ok(MarkReadReconciliation {
                    cursor: result.cursor.clone(),
                    wrote: true,
                    result: Some(result),
                })
            }
        }
    }

    fn remote_cursor_relation(
        &self,
        group_id: &str,
        actor_id: &str,
        remote: &InboxCursor,
        target: &InboxCursor,
    ) -> Result<CursorRelation> {
        if remote.event_id == target.event_id {
            return Ok(CursorRelation::Covers);
        }
        if remote.event_id.is_empty() {
            return Ok(CursorRelation::Behind);
        }

        let status: MessageReadStatus = self.call_typed(
            "message_read_status",
            object([
                ("group_id", Value::String(group_id.into())),
                ("event_id", Value::String(target.event_id.clone())),
            ]),
        )?;
        if let Some(read) = status.read_status.get(actor_id) {
            return Ok(if *read {
                CursorRelation::Covers
            } else {
                CursorRelation::Behind
            });
        }

        self.remote_cursor_relation_from_ledger(group_id, remote, target)
    }

    fn remote_cursor_relation_from_ledger(
        &self,
        group_id: &str,
        remote: &InboxCursor,
        target: &InboxCursor,
    ) -> Result<CursorRelation> {
        // `message_read_status` is authoritative for chat messages. Native
        // daemon 0.4.33 omits system notifications from that result, so prove
        // their order against the immutable ledger without comparing IDs.
        self.ledger_window(group_id, &target.event_id, 0)?;
        let mut center = remote.event_id.clone();
        for _ in 0..10_000 {
            let page = self.ledger_window(group_id, &center, 200)?;
            if page.events.iter().any(|event| event.id == target.event_id) {
                return Ok(CursorRelation::Behind);
            }
            if !page.has_more_after {
                return Ok(CursorRelation::Covers);
            }
            let next = page
                .events
                .last()
                .map(|event| event.id.clone())
                .filter(|event_id| !event_id.is_empty() && event_id != &center)
                .ok_or_else(|| {
                    Error::ReconciliationRequired(
                        "ledger cursor scan did not advance while reconciling inbox state".into(),
                    )
                })?;
            center = next;
        }
        Err(Error::ReconciliationRequired(
            "ledger cursor scan exceeded 2,000,000 events".into(),
        ))
    }

    fn ledger_window(&self, group_id: &str, center: &str, after: u32) -> Result<LedgerWindow> {
        self.call_typed(
            "ledger_window",
            object([
                ("group_id", Value::String(group_id.into())),
                ("center", Value::String(center.into())),
                ("kind", Value::String("all".into())),
                ("before", Value::from(0)),
                ("after", Value::from(after)),
            ]),
        )
    }

    pub fn persistent_inbox<S: CursorStore>(
        &self,
        group_id: impl Into<String>,
        actor_id: impl Into<String>,
        store: S,
    ) -> PersistentInbox<'_, H, S> {
        PersistentInbox {
            client: self,
            group_id: group_id.into(),
            actor_id: actor_id.into(),
            store,
            reconciled: false,
        }
    }
}

/// At-least-once inbox consumer with a durable, caller-owned checkpoint.
pub struct PersistentInbox<'a, H, S> {
    client: &'a IdentityBoundClient<H>,
    group_id: String,
    actor_id: String,
    store: S,
    reconciled: bool,
}

impl<H: WorkloadIdentityHook, S: CursorStore> PersistentInbox<'_, H, S> {
    pub fn poll(&mut self, limit: u32) -> Result<InboxPage> {
        if !self.reconciled {
            if let Some(cursor) = self.store.load()? {
                self.client.reconcile_mark_read(
                    &self.group_id,
                    &self.actor_id,
                    &cursor,
                    &cursor_key(&self.group_id, &self.actor_id, &cursor),
                )?;
            }
            self.reconciled = true;
        }
        self.client
            .inbox_list(&self.group_id, &self.actor_id, limit)
    }

    /// Commit only after the event's side effect has completed. The local
    /// checkpoint is stored first, so a crash cannot make a processed event
    /// disappear merely because daemon cursor state moved ahead.
    pub fn commit(&mut self, event: &Event) -> Result<MarkReadResult> {
        let incoming = InboxCursor {
            event_id: event.id.clone(),
            ts: event.ts.clone(),
        };
        validate_cursor(&incoming)?;
        let (cursor, needs_mark) = match self.store.load()? {
            Some(current) => match local_cursor_relation(&current, &incoming)? {
                CursorRelation::Covers => (current, false),
                CursorRelation::Behind => {
                    self.store.save(&incoming)?;
                    (incoming, true)
                }
            },
            None => {
                self.store.save(&incoming)?;
                (incoming, true)
            }
        };
        if !needs_mark {
            return Ok(MarkReadResult {
                cursor,
                event: None,
                replayed: true,
            });
        }
        let result = self.client.mark_read_idempotent(
            &self.group_id,
            &self.actor_id,
            &cursor,
            &cursor_key(&self.group_id, &self.actor_id, &cursor),
        );
        if result.is_err() {
            self.reconciled = false;
        }
        result
    }
}

fn cursor_key(group_id: &str, actor_id: &str, cursor: &InboxCursor) -> String {
    format!("cursor:{group_id}:{actor_id}:{}", cursor.event_id)
}

enum CursorRelation {
    Covers,
    Behind,
}

fn local_cursor_relation(remote: &InboxCursor, target: &InboxCursor) -> Result<CursorRelation> {
    if remote.event_id == target.event_id || remote.ts > target.ts {
        return Ok(CursorRelation::Covers);
    }
    if remote.ts < target.ts || (remote.ts.is_empty() && remote.event_id.is_empty()) {
        return Ok(CursorRelation::Behind);
    }
    Err(Error::ReconciliationRequired(format!(
        "daemon and local cursors have the same timestamp but different event IDs: remote={}, local={}",
        remote.event_id, target.event_id
    )))
}

fn deserialize_nullable_string<'de, D>(deserializer: D) -> std::result::Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

fn validate_key(key: &str) -> Result<()> {
    if key.trim().is_empty() || key.len() > 256 {
        return Err(Error::Incompatible(
            "idempotency key must contain 1..=256 bytes".into(),
        ));
    }
    Ok(())
}

fn validate_cursor(cursor: &InboxCursor) -> Result<()> {
    if cursor.event_id.trim().is_empty() || cursor.ts.trim().is_empty() {
        return Err(Error::Incompatible(
            "persisted inbox cursor needs non-empty event_id and ts".into(),
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
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[derive(Clone)]
    struct SignedIdentity;

    impl WorkloadIdentityHook for SignedIdentity {
        fn principal(&self) -> Result<AuthenticatedPrincipal> {
            AuthenticatedPrincipal::new("workload:aquant", "test-spiffe")
        }

        fn evidence(
            &self,
            operation: &str,
            _args: &Map<String, Value>,
        ) -> Result<crate::WorkloadIdentityEvidence> {
            crate::WorkloadIdentityEvidence::new(
                "workload_identity",
                serde_json::json!({"scheme": "test", "signature": format!("sig:{operation}")}),
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

    fn fixture_response(operation: &str, name: &str) -> &'static str {
        match (operation, name) {
            ("inbox_list", "fresh_response") => concat!(
                r#"{"v":1,"ok":true,"result":{"messages":[],"cursor":{"event_id":null,"ts":""}}}"#,
                "\n"
            ),
            ("inbox_list", "remote_ahead_response") => concat!(
                r#"{"v":1,"ok":true,"result":{"messages":[],"cursor":{"event_id":"e8","ts":""}}}"#,
                "\n"
            ),
            ("message_read_status", "covered_response") => concat!(
                r#"{"v":1,"ok":true,"result":{"event_id":"e7","read_status":{"a1":true}}}"#,
                "\n"
            ),
            ("send", "initial_response") => concat!(
                r#"{"v":1,"ok":true,"result":{"event":{"id":"e1","ts":"2026-08-05T01:00:00Z","kind":"chat.message","by":"workload:aquant","data":{"text":"hello","client_id":"send:stable-1"}},"delivery":{"accepted":true,"state":"queued"}}}"#,
                "\n"
            ),
            ("send", "duplicate_response") => concat!(
                r#"{"v":1,"ok":true,"result":{"event":{"id":"e1","ts":"2026-08-05T01:00:00Z","kind":"chat.message","by":"workload:aquant","data":{"text":"hello","client_id":"send:stable-1"}},"delivery":{"accepted":true,"state":"duplicate"},"duplicate":true}}"#,
                "\n"
            ),
            _ => panic!("unknown fixture response: {operation}.{name}"),
        }
    }

    fn event_json(duplicate: bool) -> &'static str {
        fixture_response(
            "send",
            if duplicate {
                "duplicate_response"
            } else {
                "initial_response"
            },
        )
    }

    #[test]
    fn identity_is_bound_and_send_reconciliation_reuses_the_key() {
        let first = event_json(false);
        let replay = event_json(true);
        let (endpoint, requests, handle) = server(vec![first, replay]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");

        client
            .send_idempotent("g1", "hello", "send:stable-1")
            .expect("send");
        let result = client
            .reconcile_send("g1", "hello", "send:stable-1")
            .expect("reconcile");
        assert!(result.replayed);
        handle.join().expect("server");

        let requests = requests.lock().expect("lock");
        for request in requests.iter() {
            assert_eq!(request["args"]["by"], "workload:aquant");
            assert_eq!(request["args"]["client_id"], "send:stable-1");
            assert_eq!(request["args"]["workload_identity"]["scheme"], "test");
        }
    }

    #[test]
    fn persisted_cursor_queries_before_replaying_an_unknown_mark() {
        let truncated = "";
        let remote_behind = fixture_response("inbox_list", "fresh_response");
        let marked = "{\"v\":1,\"ok\":true,\"result\":{\"cursor\":{\"event_id\":\"e7\",\"ts\":\"2026-08-05T01:00:00Z\"},\"event\":null}}\n";
        let page = "{\"v\":1,\"ok\":true,\"result\":{\"messages\":[],\"cursor\":{\"event_id\":\"e7\",\"ts\":\"\"}}}\n";
        let (first_endpoint, first_requests, first_handle) = server(vec![truncated]);
        let client = IdentityBoundClient::new(CCCCClient::new(first_endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        let mut first = client.persistent_inbox("g1", "a1", store.clone());
        let event = Event {
            id: "e7".into(),
            ts: "2026-08-05T01:00:00Z".into(),
            kind: "chat.message".into(),
            by: "peer".into(),
            data: Value::Null,
            extra: Map::new(),
        };
        let error = first.commit(&event).expect_err("disconnect after write");
        assert!(matches!(error, Error::OutcomeUnknown { .. }));
        assert_eq!(
            store.load().expect("load"),
            Some(InboxCursor {
                event_id: "e7".into(),
                ts: "2026-08-05T01:00:00Z".into(),
            })
        );
        first_handle.join().expect("first server");

        // A new process freshly discovers a different endpoint and reuses only
        // the durable cursor and the stable workload identity.
        let (second_endpoint, second_requests, second_handle) =
            server(vec![remote_behind, marked, page]);
        let restarted_client =
            IdentityBoundClient::new(CCCCClient::new(second_endpoint), SignedIdentity)
                .expect("restarted client");
        let mut restarted = restarted_client.persistent_inbox("g1", "a1", store);
        restarted.poll(50).expect("query, reconcile, then poll");
        second_handle.join().expect("second server");
        let first_requests = first_requests.lock().expect("first lock");
        let second_requests = second_requests.lock().expect("second lock");
        assert_eq!(first_requests[0]["op"], "inbox_mark_read");
        assert_eq!(second_requests[0]["op"], "inbox_list");
        assert_eq!(second_requests[1]["op"], "inbox_mark_read");
        assert_eq!(second_requests[2]["op"], "inbox_list");
        assert_eq!(
            first_requests[0]["args"]["idempotency_key"],
            second_requests[1]["args"]["idempotency_key"]
        );
        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn reconciliation_does_not_repeat_an_already_applied_mark() {
        let covered = "{\"v\":1,\"ok\":true,\"result\":{\"messages\":[],\"cursor\":{\"event_id\":\"e7\",\"ts\":\"\"}}}\n";
        let page = covered;
        let (endpoint, requests, handle) = server(vec![covered, page]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        store
            .save(&InboxCursor {
                event_id: "e7".into(),
                ts: "2026-08-05T01:00:00Z".into(),
            })
            .expect("seed cursor");
        client
            .persistent_inbox("g1", "a1", store)
            .poll(50)
            .expect("reconcile");
        handle.join().expect("server");
        assert!(requests
            .lock()
            .expect("lock")
            .iter()
            .all(|request| request["op"] == "inbox_list"));
        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn ambiguous_out_of_order_cursor_fails_closed() {
        let remote = InboxCursor {
            event_id: "remote".into(),
            ts: "2026-08-05T01:00:00Z".into(),
        };
        let local = InboxCursor {
            event_id: "local".into(),
            ts: remote.ts.clone(),
        };
        assert!(matches!(
            local_cursor_relation(&remote, &local),
            Err(Error::ReconciliationRequired(_))
        ));
    }

    #[test]
    fn fresh_actor_poll_accepts_native_nullable_cursor() {
        let fresh = fixture_response("inbox_list", "fresh_response");
        let (endpoint, requests, handle) = server(vec![fresh]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let page = client
            .persistent_inbox("g1", "a1", FileCursorStore::new(&path))
            .poll(50)
            .expect("fresh poll");
        handle.join().expect("server");
        assert_eq!(page.cursor.event_id, "");
        assert_eq!(page.cursor.ts, "");
        assert_eq!(requests.lock().expect("lock")[0]["op"], "inbox_list");
        assert!(!path.exists());
    }

    #[test]
    fn remote_ahead_cursor_uses_read_status_without_repeating_mark() {
        let remote_ahead = fixture_response("inbox_list", "remote_ahead_response");
        let read = fixture_response("message_read_status", "covered_response");
        let page = remote_ahead;
        let (endpoint, requests, handle) = server(vec![remote_ahead, read, page]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        store
            .save(&InboxCursor {
                event_id: "e7".into(),
                ts: "2026-08-05T01:00:00Z".into(),
            })
            .expect("seed cursor");
        client
            .persistent_inbox("g1", "a1", store)
            .poll(50)
            .expect("remote cursor covers local target");
        handle.join().expect("server");
        let operations = requests
            .lock()
            .expect("lock")
            .iter()
            .map(|request| request["op"].as_str().unwrap_or_default().to_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            operations,
            ["inbox_list", "message_read_status", "inbox_list"]
        );
        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn notification_cursor_falls_back_to_provable_ledger_order() {
        let remote_ahead = "{\"v\":1,\"ok\":true,\"result\":{\"messages\":[],\"cursor\":{\"event_id\":\"e8\",\"ts\":\"\"}}}\n";
        let no_chat_status =
            "{\"v\":1,\"ok\":true,\"result\":{\"event_id\":\"e7\",\"read_status\":{}}}\n";
        let target = "{\"v\":1,\"ok\":true,\"result\":{\"center_id\":\"e7\",\"center_index\":0,\"events\":[{\"id\":\"e7\",\"ts\":\"2026-08-05T01:00:00Z\",\"kind\":\"system.notify\",\"by\":\"peer\",\"data\":{}}],\"has_more_before\":true,\"has_more_after\":true,\"count\":1}}\n";
        let remote = "{\"v\":1,\"ok\":true,\"result\":{\"center_id\":\"e8\",\"center_index\":0,\"events\":[{\"id\":\"e8\",\"ts\":\"2026-08-05T02:00:00Z\",\"kind\":\"chat.message\",\"by\":\"peer\",\"data\":{}}],\"has_more_before\":true,\"has_more_after\":false,\"count\":1}}\n";
        let page = remote_ahead;
        let (endpoint, requests, handle) =
            server(vec![remote_ahead, no_chat_status, target, remote, page]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        store
            .save(&InboxCursor {
                event_id: "e7".into(),
                ts: "2026-08-05T01:00:00Z".into(),
            })
            .expect("seed cursor");
        client
            .persistent_inbox("g1", "a1", store)
            .poll(50)
            .expect("notification cursor order");
        handle.join().expect("server");
        let requests = requests.lock().expect("lock");
        assert_eq!(requests[2]["op"], "ledger_window");
        assert_eq!(requests[2]["args"]["center"], "e7");
        assert_eq!(requests[3]["op"], "ledger_window");
        assert_eq!(requests[3]["args"]["center"], "e8");
        assert!(requests
            .iter()
            .all(|request| request["op"] != "inbox_mark_read"));
        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn file_cursor_store_replaces_an_existing_checkpoint() {
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        let first = InboxCursor {
            event_id: "e1".into(),
            ts: "2026-08-05T01:00:00Z".into(),
        };
        let second = InboxCursor {
            event_id: "e2".into(),
            ts: "2026-08-05T02:00:00Z".into(),
        };
        store.save(&first).expect("first save");
        store.save(&second).expect("atomic replace");
        assert_eq!(store.load().expect("load"), Some(second));
        fs::remove_file(path).expect("cleanup");
    }

    #[test]
    fn duplicate_or_older_commit_never_regresses_the_local_cursor() {
        let (endpoint, requests, handle) = server(vec![]);
        let client = IdentityBoundClient::new(CCCCClient::new(endpoint), SignedIdentity)
            .expect("bound client");
        let path = temp_path();
        let store = FileCursorStore::new(&path);
        let latest = InboxCursor {
            event_id: "e8".into(),
            ts: "2026-08-05T02:00:00Z".into(),
        };
        store.save(&latest).expect("seed");
        let older = Event {
            id: "e7".into(),
            ts: "2026-08-05T01:00:00Z".into(),
            kind: "chat.message".into(),
            by: "peer".into(),
            data: Value::Null,
            extra: Map::new(),
        };
        client
            .persistent_inbox("g1", "a1", store.clone())
            .commit(&older)
            .expect("commit is monotonic");
        handle.join().expect("server");
        assert_eq!(store.load().expect("load"), Some(latest));
        assert!(requests.lock().expect("lock").is_empty());
        fs::remove_file(path).expect("cleanup");
    }

    fn temp_path() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "cccc-sdk-cursor-{}-{nonce}.json",
            std::process::id()
        ))
    }
}
