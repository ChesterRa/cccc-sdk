#!/usr/bin/env bash
set -euo pipefail

CCCC_REPO="${1:-../cccc}"
SRC="${CCCC_REPO%/}/docs/standards"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${ROOT}/spec"

if [[ ! -d "${SRC}" ]]; then
  echo "error: cannot find CCCC specs at: ${SRC}" >&2
  exit 2
fi

status=0
for name in CCCS_V1.md CCCC_DAEMON_IPC_V1.md CCCC_CONTEXT_OPS_V1.md; do
  if ! cmp -s "${SRC}/${name}" "${DST}/${name}"; then
    echo "error: spec/${name} has drifted from CCCC core" >&2
    diff -u "${DST}/${name}" "${SRC}/${name}" || true
    status=1
  fi
done

if [[ "${status}" -ne 0 ]]; then
  exit "${status}"
fi

echo "All mirrored CCCC standards match core."
