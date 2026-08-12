#!/usr/bin/env bash
set -euo pipefail

CCCC_REPO="${1:-../cccc}"
CCCC_REF="${2:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${ROOT}/spec"
TMP=""

cleanup() {
  if [[ -n "${TMP}" && -d "${TMP}" ]]; then
    rm -rf -- "${TMP}"
  fi
}
trap cleanup EXIT

if [[ -n "${CCCC_REF}" ]]; then
  if ! git -C "${CCCC_REPO}" rev-parse --verify "${CCCC_REF}^{commit}" >/dev/null 2>&1; then
    echo "error: unknown CCCC git ref: ${CCCC_REF}" >&2
    exit 2
  fi
  TMP="$(mktemp -d)"
  git -C "${CCCC_REPO}" archive "${CCCC_REF}" \
    docs/standards/CCCS_V1.md \
    docs/standards/CCCC_DAEMON_IPC_V1.md \
    docs/standards/CCCC_CONTEXT_OPS_V1.md | tar -x -C "${TMP}"
  SRC="${TMP}/docs/standards"
  SOURCE_LABEL="${CCCC_REPO}@${CCCC_REF}"
else
  SRC="${CCCC_REPO%/}/docs/standards"
  SOURCE_LABEL="${SRC}"
fi

if [[ ! -d "${SRC}" ]]; then
  echo "error: cannot find CCCC specs at: ${SRC}" >&2
  echo "hint: ./scripts/sync_specs_from_cccc.sh /path/to/cccc [git-ref]" >&2
  exit 2
fi

mkdir -p "${DST}"
cp -f "${SRC}/CCCS_V1.md" "${DST}/CCCS_V1.md"
cp -f "${SRC}/CCCC_DAEMON_IPC_V1.md" "${DST}/CCCC_DAEMON_IPC_V1.md"
cp -f "${SRC}/CCCC_CONTEXT_OPS_V1.md" "${DST}/CCCC_CONTEXT_OPS_V1.md"

echo "Synced specs from ${SOURCE_LABEL} -> ${DST}"
