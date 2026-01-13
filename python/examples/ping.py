from __future__ import annotations

import json

from cccc_sdk import CCCCClient, __version__


def main() -> int:
    c = CCCCClient()
    resp = c.ping()
    print(f"cccc-sdk {__version__}")
    print(f"daemon endpoint: {c.endpoint}")
    print(json.dumps(resp, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
