#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_ROOT="${CHAINGRADE_BACKUP_ROOT:-$(cd -- "${PROJECT_ROOT}/.." && pwd)/chaingrade-backups}"
ARCHIVE="${1:-}"

[[ -n "${ARCHIVE}" ]] || {
  echo "Usage: $0 <native-ledger-backup.tar.gz>" >&2
  exit 2
}
[[ -d "${BACKUP_ROOT}" ]] || {
  echo "Backup root does not exist: ${BACKUP_ROOT}" >&2
  exit 1
}

backup_real="$(readlink -f "${BACKUP_ROOT}")"
archive_real="$(readlink -f "${ARCHIVE}")"
case "${archive_real}" in
  "${backup_real}"/*) ;;
  *) echo "Refusing archive outside backup root: ${archive_real}" >&2; exit 1 ;;
esac
[[ -f "${archive_real}" && -f "${archive_real}.sha256" ]] || {
  echo "Archive or checksum sidecar is missing" >&2
  exit 1
}

(cd -- "${backup_real}" && sha256sum -c "$(basename -- "${archive_real}").sha256")
list_file="$(mktemp)"
trap 'rm -f -- "${list_file}"' EXIT
tar -tzf "${archive_real}" >"${list_file}"
[[ -s "${list_file}" ]] || { echo "Archive is empty" >&2; exit 1; }
if grep -Eq '(^/|(^|/)\.\.(/|$))' "${list_file}"; then
  echo "Archive contains unsafe paths" >&2
  exit 1
fi
if awk '$0 !~ /^\.runtime\/native-fabric(\/|$)/ {exit 1}' "${list_file}"; then
  :
else
  echo "Archive contains entries outside .runtime/native-fabric" >&2
  exit 1
fi
tar -tzf "${archive_real}" >/dev/null
echo "VERIFIED ${archive_real}"
