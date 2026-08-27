#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/native-fabric"
BACKUP_ROOT="${CHAINGRADE_BACKUP_ROOT:-$(cd -- "${PROJECT_ROOT}/.." && pwd)/chaingrade-backups}"

runtime_real="$(readlink -f "${RUNTIME_ROOT}")"
[[ "${runtime_real}" == "${PROJECT_ROOT}/.runtime/native-fabric" ]] || {
  echo "Refusing unexpected runtime path: ${runtime_real}" >&2
  exit 1
}
[[ -d "${RUNTIME_ROOT}/data" ]] || {
  echo "Native ledger runtime does not exist: ${RUNTIME_ROOT}" >&2
  exit 1
}
mkdir -p -- "${BACKUP_ROOT}"
backup_real="$(readlink -f "${BACKUP_ROOT}")"
project_parent="$(cd -- "${PROJECT_ROOT}/.." && pwd)"
case "${backup_real}" in
  "${project_parent}"/*) ;;
  *) echo "Refusing backup root outside project parent: ${backup_real}" >&2; exit 1 ;;
esac

network_was_running=false
chaincode_was_running=false
"${SCRIPT_DIR}/native-network.sh" status >/dev/null 2>&1 && network_was_running=true
"${SCRIPT_DIR}/deploy-chaincode.sh" status >/dev/null 2>&1 && chaincode_was_running=true

restart_services() {
  if [[ "${network_was_running}" == true ]]; then
    "${SCRIPT_DIR}/native-network.sh" up
    if [[ "${chaincode_was_running}" == true ]]; then
      "${SCRIPT_DIR}/deploy-chaincode.sh" start
    fi
  fi
}

restart_on_exit=true
on_exit() {
  local result=$?
  if [[ "${restart_on_exit}" == true ]]; then
    restart_services || true
  fi
  exit "${result}"
}
trap on_exit EXIT

if [[ "${chaincode_was_running}" == true ]]; then
  "${SCRIPT_DIR}/deploy-chaincode.sh" stop
fi
if [[ "${network_was_running}" == true ]]; then
  "${SCRIPT_DIR}/native-network.sh" down
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="${backup_real}/native-ledger-${timestamp}.tar.gz"
tar -C "${PROJECT_ROOT}" -czf "${archive}" .runtime/native-fabric
chmod 600 "${archive}"
(cd -- "${backup_real}" && sha256sum "$(basename -- "${archive}")" >"$(basename -- "${archive}").sha256")
chmod 600 "${archive}.sha256"
"${SCRIPT_DIR}/verify-backup.sh" "${archive}"

restart_services
restart_on_exit=false
trap - EXIT
if [[ "${network_was_running}" == true ]]; then
  "${SCRIPT_DIR}/ledger-info.sh"
fi
echo "BACKUP ${archive}"
