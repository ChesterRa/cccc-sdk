#!/usr/bin/env python3
from __future__ import annotations

import ast
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "spec" / "SDK_DAEMON_TARGET_0_4_33.json"
FIXTURE_SHA256 = "616f0c81a73204c5478becfdfe671e4b28d70e232447263c0f594dc53ab78d51"


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

    fixture_bytes = FIXTURE.read_bytes()
    if hashlib.sha256(fixture_bytes).hexdigest() != FIXTURE_SHA256:
        errors.append("0.4.33 daemon fixture hash changed without an explicit contract review")
    fixture = json.loads(fixture_bytes)
    if fixture.get("target", {}).get("version") != "0.4.33":
        errors.append("daemon fixture must target exactly 0.4.33")

    completion = fixture.get("operations", {}).get("web_model_runtime_complete_turn", {})
    required = {"group_id", "actor_id", "turn_id", "delivery_id"}
    if not required.issubset(set(completion.get("required_args", []))):
        errors.append("completion fixture is missing required daemon arguments")
    request_args = completion.get("request", {}).get("args", {})
    result = completion.get("completion_response", {}).get("result", {})
    if (
        completion.get("replay_key") != "delivery_id"
        or result.get("delivery_id") != request_args.get("delivery_id")
    ):
        errors.append("completion fixture does not preserve delivery_id across replay")

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
        "signal?.removeEventListener('abort', onAbort)": "TypeScript handshake abort cleanup is missing",
        "assertBufferedLineLimit(remaining)": "TypeScript handshake remainder is not byte-capped",
        "initialBuffer: Buffer": "TypeScript stream buffering is not byte-accurate",
    }
    for marker, message in transport_markers.items():
        if marker not in transport:
            errors.append(message)
    if "removeAllListeners" in transport:
        errors.append("TypeScript transport still removes unrelated socket listeners")

    reliable = read("rust/src/reliable.rs")
    rust_markers = {
        'alias = "duplicate"': "Rust does not map duplicate to replayed",
        'deserialize_with = "deserialize_nullable_string"': "Rust cursor is not nullable-wire compatible",
        '"message_read_status"': "Rust remote-ahead reconciliation lacks read-status verification",
        '"ledger_window"': "Rust notification reconciliation lacks ledger-order fallback",
        "NamedTempFile::new_in": "Rust cursor writes do not use a unique same-directory temp file",
        ".persist(&self.path)": "Rust cursor writes do not atomically replace the checkpoint",
    }
    for marker, message in rust_markers.items():
        if marker not in reliable:
            errors.append(message)
    if 'tempfile = "=3.20.0"' not in read("rust/Cargo.toml"):
        errors.append("Rust tempfile dependency is not pinned for the declared MSRV")

    workflows = {
        name: read(f".github/workflows/{name}")
        for name in ("python-integration.yml", "ts-ci.yml", "rust-ci.yml")
    }
    install = "cargo install cccc --version '=0.4.33' --locked"
    for name, workflow in workflows.items():
        if install not in workflow:
            errors.append(f"{name} does not test the exact native 0.4.33 daemon")
    rust_ci = workflows["rust-ci.yml"]
    for marker, message in (
        ('toolchain: "1.74.0"', "Rust CI does not enforce the declared 1.74 MSRV"),
        ("runs-on: windows-latest", "Rust CI does not test Windows cursor replacement"),
        ('CCCC_RUN_LIVE_RELIABILITY: "1"', "Rust CI does not execute live reliability assertions"),
        ("--test live_reliability", "Rust CI does not run the native reliability test"),
    ):
        if marker not in rust_ci:
            errors.append(message)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print("SDK hardening contract OK: completion replay, stream safety, reliable cursor, CI matrix")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
