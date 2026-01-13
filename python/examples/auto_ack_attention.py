from __future__ import annotations

import argparse
import json

from cccc_sdk import CCCCClient, DaemonAPIError


def _is_attention_for_user(ev: dict) -> bool:
    data = ev.get("data")
    if not isinstance(data, dict):
        return False
    if str(data.get("priority") or "normal").strip() != "attention":
        return False
    to = data.get("to")
    to_tokens = [str(x).strip() for x in to] if isinstance(to, list) else []
    return "user" in {t for t in to_tokens if t}


def main() -> int:
    ap = argparse.ArgumentParser(description="Auto-ACK attention messages for a recipient.")
    ap.add_argument("--group", required=True, help="group_id to subscribe")
    ap.add_argument("--actor", default="user", help="recipient actor_id (default: user)")
    args = ap.parse_args()

    c = CCCCClient()
    kinds = {"chat.message"}

    for item in c.events_stream(group_id=args.group, by=args.actor, kinds=kinds):
        if str(item.get("t") or "") != "event":
            continue
        ev = item.get("event")
        if not isinstance(ev, dict):
            continue
        if str(ev.get("kind") or "") != "chat.message":
            continue

        if args.actor == "user":
            if not _is_attention_for_user(ev):
                continue
        else:
            data = ev.get("data")
            if not isinstance(data, dict) or str(data.get("priority") or "normal").strip() != "attention":
                continue

        event_id = str(ev.get("id") or "").strip()
        if not event_id:
            continue
        try:
            res = c.chat_ack(group_id=args.group, actor_id=args.actor, event_id=event_id)
            print(json.dumps({"acked": True, "event_id": event_id, **res}, ensure_ascii=False))
        except DaemonAPIError as e:
            # Best-effort: ignore "already" or other benign races; print for visibility.
            print(json.dumps({"acked": False, "event_id": event_id, "error": str(e)}, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

