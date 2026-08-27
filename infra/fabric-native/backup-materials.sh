#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
NETWORK_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/test-network"
BACKUP_ROOT="${CHAINGRADE_BACKUP_ROOT:-/mnt/localDisk3/weizian/chaingrade-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="${BACKUP_ROOT}/fabric-recovery-materials-${STAMP}.tar.gz"

case "$(readlink -f "${BACKUP_ROOT}")" in
  /mnt/localDisk3/weizian/*) ;;
  *) echo "Backup root must stay under /mnt/localDisk3/weizian" >&2; exit 1 ;;
esac

mkdir -p "${BACKUP_ROOT}"
umask 077
trap 'rm -f -- "${ARCHIVE}" "${ARCHIVE}.sha256"' ERR
tar -C "${NETWORK_ROOT}" -czf "${ARCHIVE}" \
  organizations/peerOrganizations \
  organizations/ordererOrganizations \
  channel-artifacts
sha256sum "${ARCHIVE}" >"${ARCHIVE}.sha256"
chmod 0600 "${ARCHIVE}" "${ARCHIVE}.sha256"
tar -tzf "${ARCHIVE}" >/dev/null
trap - ERR
echo "Created verified recovery archive: ${ARCHIVE}"
