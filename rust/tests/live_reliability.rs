use cccc_sdk::{
    AuthenticatedPrincipal, CCCCClient, CursorStore, IdentityBoundClient, InboxCursor, Result,
    WorkloadIdentityEvidence, WorkloadIdentityHook,
};
use serde_json::{json, Map, Value};

struct LiveTestIdentity(&'static str);

#[derive(Clone, Copy)]
struct EmptyCursorStore;

impl CursorStore for EmptyCursorStore {
    fn load(&self) -> Result<Option<InboxCursor>> {
        Ok(None)
    }

    fn save(&self, _cursor: &InboxCursor) -> Result<()> {
        Ok(())
    }
}

impl WorkloadIdentityHook for LiveTestIdentity {
    fn principal(&self) -> Result<AuthenticatedPrincipal> {
        AuthenticatedPrincipal::new(self.0, "cccc-sdk-live-test")
    }

    fn evidence(
        &self,
        operation: &str,
        _args: &Map<String, Value>,
    ) -> Result<WorkloadIdentityEvidence> {
        WorkloadIdentityEvidence::new(
            "workload_identity",
            json!({"test_only": true, "operation": operation}),
        )
    }
}

fn object(entries: impl IntoIterator<Item = (&'static str, Value)>) -> Map<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value))
        .collect()
}

#[test]
fn daemon_0433_replays_real_writes_and_reconciles_mark_read() {
    if std::env::var_os("CCCC_RUN_LIVE_RELIABILITY").is_none() {
        return;
    }

    let raw = CCCCClient::discover().expect("discover live daemon");
    let created = raw
        .call(
            "group_create",
            object([
                ("title", json!("cccc-sdk 0.0.2 live reliability test")),
                ("by", json!("user")),
            ]),
        )
        .expect("create disposable group");
    let group_id = created["group_id"].as_str().expect("group_id").to_owned();

    let result = (|| {
        raw.call(
            "group_start",
            object([("group_id", json!(group_id)), ("by", json!("user"))]),
        )?;
        raw.call(
            "actor_add",
            object([
                ("group_id", json!(group_id)),
                ("actor_id", json!("sdk-live")),
                ("runtime", json!("custom")),
                ("runner", json!("headless")),
                ("command", json!(["/usr/bin/true"])),
                ("by", json!("user")),
            ]),
        )?;
        let client = IdentityBoundClient::new(raw.clone(), LiveTestIdentity("user"))?;
        let peer = IdentityBoundClient::new(raw.clone(), LiveTestIdentity("sdk-live"))?;
        let fresh = peer
            .persistent_inbox(&group_id, "sdk-live", EmptyCursorStore)
            .poll(1)?;
        if !fresh.cursor.event_id.is_empty() || !fresh.cursor.ts.is_empty() {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "fresh native daemon cursor was not normalized to empty strings".into(),
            ));
        }

        let send_key = format!("cccc-sdk-live:{group_id}:send");
        let first = client.send_idempotent(&group_id, "live idempotency probe", &send_key)?;
        let replay = client.reconcile_send(&group_id, "live idempotency probe", &send_key)?;
        if first.event.id != replay.event.id {
            return Err(cccc_sdk::Error::ReconciliationRequired(format!(
                "send key produced two events: {} and {}",
                first.event.id, replay.event.id
            )));
        }
        if !replay.replayed {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "native duplicate=true was not exposed as replayed=true".into(),
            ));
        }

        let second_key = format!("cccc-sdk-live:{group_id}:send:second");
        let second =
            client.send_idempotent(&group_id, "live remote-ahead cursor probe", &second_key)?;

        let reply_key = format!("cccc-sdk-live:{group_id}:reply");
        let first_reply = peer.reply_idempotent(
            &group_id,
            &first.event.id,
            "live reply idempotency probe",
            &reply_key,
        )?;
        let replay_reply = peer.reconcile_reply(
            &group_id,
            &first.event.id,
            "live reply idempotency probe",
            &reply_key,
        )?;
        if first_reply.event.id != replay_reply.event.id {
            return Err(cccc_sdk::Error::ReconciliationRequired(format!(
                "reply key produced two events: {} and {}",
                first_reply.event.id, replay_reply.event.id
            )));
        }
        if !replay_reply.replayed {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "native reply duplicate=true was not exposed as replayed=true".into(),
            ));
        }

        let first_cursor = InboxCursor {
            event_id: first.event.id.clone(),
            ts: first.event.ts.clone(),
        };
        let second_cursor = InboxCursor {
            event_id: second.event.id,
            ts: second.event.ts,
        };
        let second_mark_key = format!("cccc-sdk-live:{group_id}:mark:{}", second_cursor.event_id);
        peer.mark_read_idempotent(&group_id, "sdk-live", &second_cursor, &second_mark_key)?;
        let first_mark_key = format!("cccc-sdk-live:{group_id}:mark:{}", first_cursor.event_id);
        let reconciled =
            peer.reconcile_mark_read(&group_id, "sdk-live", &first_cursor, &first_mark_key)?;
        if reconciled.wrote {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "remote-ahead read cursor repeated an older mark_read".into(),
            ));
        }
        Ok::<(), cccc_sdk::Error>(())
    })();

    let cleanup = raw.call(
        "group_delete",
        object([("group_id", json!(group_id)), ("by", json!("user"))]),
    );
    result.expect("live reliability assertions");
    cleanup.expect("delete disposable group");
}
