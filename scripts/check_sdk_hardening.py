#!/usr/bin/env python3
from __future__ import annotations

import ast
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def python_method(source: str, name: str) -> ast.FunctionDef | None:
    tree = ast.parse(source)
    return next(
        (node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == name),
        None,
    )


def main() -> int:
    errors: list[str] = []

    # Web Model completion remains an idempotent write. Keep its caller-stable
    # replay key required even though the daemon can synthesize a default.
    required = {"group_id", "actor_id", "turn_id", "delivery_id"}
    python_source = read("python/src/cccc_sdk/client_0430_runtime_ops.py")
    method = python_method(python_source, "web_model_runtime_complete_turn")
    if method is None:
        errors.append("Python completion wrapper is missing")
    else:
        parameters = {
            arg.arg
            for arg in (*method.args.posonlyargs, *method.args.args, *method.args.kwonlyargs)
        }
        if not required.issubset(parameters):
            errors.append("Python completion wrapper does not require delivery_id")
        if not any(
            isinstance(node, ast.Dict)
            and any(isinstance(key, ast.Constant) and key.value == "delivery_id" for key in node.keys)
            for node in ast.walk(method)
        ):
            errors.append("Python completion wrapper does not map delivery_id")

    ts_types = read("ts/src/types.ts")
    ts_runtime = read("ts/src/client_0430_runtime_ops.ts")
    if not re.search(r"\bdeliveryId\s*:\s*string\s*;", ts_types):
        errors.append("TypeScript deliveryId is missing or optional")
    if not re.search(r"delivery_id\s*:\s*options\.deliveryId\b", ts_runtime):
        errors.append("TypeScript completion wrapper does not map deliveryId")

    transport = read("ts/src/transport.ts")
    transport_markers = {
        "remainingTimeout(deadline)": "TypeScript transport does not share one deadline",
        "signal?.removeEventListener('abort', onAbort)": "TypeScript abort cleanup is missing",
        "assertBufferedLineLimit(remaining)": "TypeScript stream remainder is not byte-capped",
        "initialBuffer: Buffer": "TypeScript stream buffering is not byte-accurate",
        "OutcomeUnknownError": "TypeScript exchange failures lack an outcome-unknown boundary",
    }
    for marker, message in transport_markers.items():
        if marker not in transport:
            errors.append(message)
    if "removeAllListeners" in transport:
        errors.append("TypeScript transport still removes unrelated socket listeners")

    reliable = read("rust/src/reliable.rs")
    required_reliable_markers = {
        "MessageMode": "Rust reliable send does not require an explicit message mode",
        "ReplyMessageMode": "Rust reliable reply does not constrain reply modes",
        '"client_id"': "Rust reliable writes do not carry a stable client_id",
        '"inbox_peek"': "Rust reliable adapter lacks non-consuming Mail inspection",
        '"inbox_read"': "Rust reliable adapter lacks atomic Mail consumption",
        'alias = "duplicate"': "Rust does not expose daemon duplicate replay state",
    }
    for marker, message in required_reliable_markers.items():
        if marker not in reliable:
            errors.append(message)

    retired_markers = {
        '"inbox_list"': "retired inbox_list leaked into the Rust adapter",
        '"inbox_mark_read"': "retired inbox_mark_read leaked into the Rust adapter",
        '"message_read_status"': "legacy per-message read status leaked into the Rust adapter",
        "FileCursorStore": "a competing local Mail cursor remains in the Rust adapter",
        "PersistentInbox": "legacy persistent inbox emulation remains in the Rust adapter",
    }
    for marker, message in retired_markers.items():
        if marker in reliable:
            errors.append(message)

    workflows = {
        name: read(f".github/workflows/{name}")
        for name in ("python-integration.yml", "ts-ci.yml", "rust-ci.yml")
    }
    for name, workflow in workflows.items():
        if "repository: ChesterRa/cccc" not in workflow:
            errors.append(f"{name} does not test against the current CCCC repository")
        if "cargo install cccc --version '=0.4.33'" in workflow:
            errors.append(f"{name} still pins the retired pre-message-cut daemon")

    rust_ci = workflows["rust-ci.yml"]
    for marker, message in (
        ('toolchain: "1.74.0"', "Rust CI does not enforce the declared 1.74 MSRV"),
        ("runs-on: windows-latest", "Rust CI does not test Windows"),
        ('CCCC_RUN_LIVE_RELIABILITY: "1"', "Rust CI does not run live reliability checks"),
        ("--test live_reliability", "Rust CI does not run the live reliability test"),
    ):
        if marker not in rust_ci:
            errors.append(message)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("SDK hardening contract OK: replay keys, transport safety, atomic Mail, current native CI")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
