#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/native-fabric"
ARCHIVE="${1:-}"
CONFIRMATION="${2:-}"

[[ -n "${ARCHIVE}" && "${CONFIRMATION}" == "--confirm-restore" ]] || {
  echo "Usage: $0 <native-ledger-backup.tar.gz> --confirm-restore" >&2
  echo "The current runtime is preserved as a timestamped pre-restore directory." >&2
  exit 2
}
"${SCRIPT_DIR}/verify-backup.sh" "${ARCHIVE}"

runtime_parent="${PROJECT_ROOT}/.runtime"
mkdir -p -- "${runtime_parent}"
runtime_parent_real="$(readlink -f "${runtime_parent}")"
[[ "${runtime_parent_real}" == "${PROJECT_ROOT}/.runtime" ]] || {
  echo "Refusing unexpected runtime parent: ${runtime_parent_real}" >&2
  exit 1
}

"${SCRIPT_DIR}/deploy-chaincode.sh" stop || true
"${SCRIPT_DIR}/native-network.sh" down || true

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
previous="${runtime_parent}/native-fabric.pre-restore-${timestamp}"
failed="${runtime_parent}/native-fabric.failed-restore-${timestamp}"
if [[ -e "${RUNTIME_ROOT}" ]]; then
  mv -- "${RUNTIME_ROOT}" "${previous}"
fi

restore_succeeded=false
rollback_on_exit() {
  local result=$?
  if [[ "${restore_succeeded}" != true ]]; then
    if [[ -e "${RUNTIME_ROOT}" ]]; then
      mv -- "${RUNTIME_ROOT}" "${failed}" || true
    fi
    if [[ -e "${previous}" ]]; then
      mv -- "${previous}" "${RUNTIME_ROOT}" || true
    fi
  fi
  exit "${result}"
}
trap rollback_on_exit EXIT

tar -C "${PROJECT_ROOT}" -xzf "$(readlink -f "${ARCHIVE}")"
"${SCRIPT_DIR}/native-network.sh" up
"${SCRIPT_DIR}/deploy-chaincode.sh" start
"${SCRIPT_DIR}/ledger-info.sh"
restore_succeeded=true
trap - EXIT
echo "RESTORED $(readlink -f "${ARCHIVE}")"
if [[ -d "${previous}" ]]; then
  echo "PREVIOUS_RUNTIME ${previous}"
fi
