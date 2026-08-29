use cccc_sdk::{
    AuthenticatedPrincipal, CCCCClient, IdentityBoundClient, MessageMode, ReplyMessageMode, Result,
    WorkloadIdentityEvidence, WorkloadIdentityHook,
};
use serde_json::{json, Map, Value};

struct LiveTestIdentity(&'static str);

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
fn current_daemon_replays_writes_and_consumes_only_mail() {
    if std::env::var_os("CCCC_RUN_LIVE_RELIABILITY").is_none() {
        return;
    }

    let raw = CCCCClient::discover().expect("discover live daemon");
    let created = raw
        .call(
            "group_create",
            object([
                ("title", json!("cccc-sdk live reliability test")),
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

        let sender = IdentityBoundClient::new(raw.clone(), LiveTestIdentity("user"))?;
        let recipient = IdentityBoundClient::new(raw.clone(), LiveTestIdentity("sdk-live"))?;

        let send_key = format!("cccc-sdk-live:{group_id}:mail");
        let first = sender.send_idempotent(
            &group_id,
            "live Mail idempotency probe",
            MessageMode::Mail,
            &["sdk-live"],
            &send_key,
        )?;
        let replay = sender.reconcile_send(
            &group_id,
            "live Mail idempotency probe",
            MessageMode::Mail,
            &["sdk-live"],
            &send_key,
        )?;
        if first.event.id != replay.event.id || !replay.replayed {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "stable Mail client_id did not replay the original event".into(),
            ));
        }

        let peeked = recipient.inbox_peek(&group_id, "sdk-live", 10)?;
        if peeked
            .messages
            .iter()
            .all(|event| event.id != first.event.id)
        {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "Mail event was absent from inbox_peek".into(),
            ));
        }
        let consumed = recipient.inbox_read(&group_id, "sdk-live", 10)?;
        if consumed
            .messages
            .iter()
            .all(|event| event.id != first.event.id)
        {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "atomic inbox_read did not return the Mail event".into(),
            ));
        }
        if !recipient
            .inbox_read(&group_id, "sdk-live", 10)?
            .messages
            .is_empty()
        {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "Mail event remained unread after atomic inbox_read".into(),
            ));
        }

        let reply_key = format!("cccc-sdk-live:{group_id}:reply");
        let reply = recipient.reply_idempotent(
            &group_id,
            &first.event.id,
            "live reply idempotency probe",
            ReplyMessageMode::Send,
            &["user"],
            &reply_key,
        )?;
        let replay_reply = recipient.reconcile_reply(
            &group_id,
            &first.event.id,
            "live reply idempotency probe",
            ReplyMessageMode::Send,
            &["user"],
            &reply_key,
        )?;
        if reply.event.id != replay_reply.event.id || !replay_reply.replayed {
            return Err(cccc_sdk::Error::ReconciliationRequired(
                "stable reply client_id did not replay the original event".into(),
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
