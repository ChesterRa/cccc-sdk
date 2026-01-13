#!/usr/bin/env bash
set -euo pipefail

CCCC_REPO="${1:-../cccc}"
SRC="${CCCC_REPO%/}/docs/standards"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${ROOT}/spec"

if [[ ! -d "${SRC}" ]]; then
  echo "error: cannot find CCCC specs at: ${SRC}" >&2
  echo "hint: pass the CCCC repo path explicitly: ./scripts/sync_specs_from_cccc.sh /path/to/cccc" >&2
  exit 2
fi

mkdir -p "${DST}"
cp -f "${SRC}/CCCS_V1.md" "${DST}/CCCS_V1.md"
cp -f "${SRC}/CCCC_DAEMON_IPC_V1.md" "${DST}/CCCC_DAEMON_IPC_V1.md"
cp -f "${SRC}/CCCC_CONTEXT_OPS_V1.md" "${DST}/CCCC_CONTEXT_OPS_V1.md"

echo "Synced specs from ${SRC} -> ${DST}"

