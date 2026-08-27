#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SAMPLES_ROOT="${PROJECT_ROOT}/.tools/fabric-samples"
NETWORK_ROOT="${SAMPLES_ROOT}/test-network"
BIN_ROOT="${SAMPLES_ROOT}/bin"

required_bins=(peer orderer osnadmin configtxgen)
required_files=(
  "${NETWORK_ROOT}/channel-artifacts/chaingrade.block"
  "${NETWORK_ROOT}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt"
  "${NETWORK_ROOT}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/server.crt"
  "${NETWORK_ROOT}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/server.crt"
)
reserved_ports=(7050 7051 7052 7053 9051 9052 9443 9444 9445 9999)

failures=0
for name in "${required_bins[@]}"; do
  path="${BIN_ROOT}/${name}"
  if [[ -x "${path}" ]]; then
    echo "OK binary ${name}"
  else
    echo "FAIL binary ${name}: ${path}" >&2
    failures=$((failures + 1))
  fi
done

for path in "${required_files[@]}"; do
  if [[ -s "${path}" ]]; then
    echo "OK material ${path#"${PROJECT_ROOT}/"}"
  else
    echo "FAIL material ${path}" >&2
    failures=$((failures + 1))
  fi
done

for port in "${reserved_ports[@]}"; do
  if ss -ltnH "sport = :${port}" | grep -q .; then
    echo "FAIL port ${port} is already listening" >&2
    failures=$((failures + 1))
  else
    echo "OK port ${port}"
  fi
done

available_kib="$(df -Pk "${PROJECT_ROOT}" | awk 'NR == 2 {print $4}')"
if [[ "${available_kib}" -lt 10485760 ]]; then
  echo "FAIL less than 10 GiB free under project filesystem" >&2
  failures=$((failures + 1))
else
  echo "OK free-space $((available_kib / 1024 / 1024)) GiB"
fi

for cert in "${required_files[@]:1}"; do
  if openssl x509 -in "${cert}" -noout -checkend 86400 >/dev/null 2>&1; then
    echo "OK certificate $(basename "$(dirname "${cert}")") valid beyond 24h"
  else
    echo "FAIL certificate expired or unreadable: ${cert}" >&2
    failures=$((failures + 1))
  fi
done

if [[ "${failures}" -ne 0 ]]; then
  echo "Native Fabric preflight failed with ${failures} issue(s)." >&2
  exit 1
fi

echo "Native Fabric preflight passed. Docker was not accessed."
