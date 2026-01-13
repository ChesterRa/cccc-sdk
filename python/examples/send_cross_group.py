from __future__ import annotations

import argparse
import json

from cccc_sdk import CCCCClient


def main() -> int:
    ap = argparse.ArgumentParser(description="Send a message to another group via send_cross_group.")
    ap.add_argument("--src", required=True, help="source group_id")
    ap.add_argument("--dst", required=True, help="destination group_id")
    ap.add_argument("--text", required=True, help="message text")
    ap.add_argument("--by", default="user", help="principal id (default: user)")
    ap.add_argument("--to", default="", help="comma-separated destination recipient tokens (optional)")
    ap.add_argument("--priority", default="normal", choices=["normal", "attention"], help="message priority")
    args = ap.parse_args()

    to = [t.strip() for t in args.to.split(",") if t.strip()] if args.to else None

    c = CCCCClient()
    res = c.send_cross_group(group_id=args.src, dst_group_id=args.dst, text=args.text, by=args.by, to=to, priority=args.priority)
    print(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

