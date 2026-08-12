#!/usr/bin/env bash
set -euo pipefail

CCCC_REPO="${1:-../cccc}"
CCCC_REF="${2:-}"
SRC="${CCCC_REPO%/}/docs/standards"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="${ROOT}/spec"

if [[ -n "${CCCC_REF}" ]] && ! git -C "${CCCC_REPO}" rev-parse --verify "${CCCC_REF}^{commit}" >/dev/null 2>&1; then
  echo "error: unknown CCCC git ref: ${CCCC_REF}" >&2
  exit 2
fi

if [[ -z "${CCCC_REF}" && ! -d "${SRC}" ]]; then
  echo "error: cannot find CCCC specs at: ${SRC}" >&2
  exit 2
fi

status=0
for name in CCCS_V1.md CCCC_DAEMON_IPC_V1.md CCCC_CONTEXT_OPS_V1.md; do
  if [[ -n "${CCCC_REF}" ]]; then
    if git -C "${CCCC_REPO}" show "${CCCC_REF}:docs/standards/${name}" | cmp -s - "${DST}/${name}"; then
      continue
    fi
    echo "error: spec/${name} has drifted from CCCC core" >&2
    diff -u "${DST}/${name}" <(git -C "${CCCC_REPO}" show "${CCCC_REF}:docs/standards/${name}") || true
    status=1
  elif ! cmp -s "${SRC}/${name}" "${DST}/${name}"; then
    echo "error: spec/${name} has drifted from CCCC core" >&2
    diff -u "${DST}/${name}" "${SRC}/${name}" || true
    status=1
  fi
done

if [[ "${status}" -ne 0 ]]; then
  exit "${status}"
fi

if [[ -n "${CCCC_REF}" ]]; then
  echo "All mirrored CCCC standards match ${CCCC_REPO}@${CCCC_REF}."
else
  echo "All mirrored CCCC standards match core."
fi
