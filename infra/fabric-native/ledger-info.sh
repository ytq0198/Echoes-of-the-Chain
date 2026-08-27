#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SAMPLES_ROOT="${PROJECT_ROOT}/.tools/fabric-samples"
NETWORK_ROOT="${SAMPLES_ROOT}/test-network"
BIN_ROOT="${SAMPLES_ROOT}/bin"
CONFIG_ROOT="${SAMPLES_ROOT}/config"
ORGANIZATIONS="${NETWORK_ROOT}/organizations"
CHANNEL_NAME=chaingrade

query_org() {
  local org="$1"
  local msp="$2"
  local port="$3"
  local root="${ORGANIZATIONS}/peerOrganizations/org${org}.example.com"
  FABRIC_CFG_PATH="${CONFIG_ROOT}" \
    CORE_PEER_LOCALMSPID="${msp}" \
    CORE_PEER_MSPCONFIGPATH="${root}/users/Admin@org${org}.example.com/msp" \
    CORE_PEER_ADDRESS="localhost:${port}" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_ROOTCERT_FILE="${root}/peers/peer0.org${org}.example.com/tls/ca.crt" \
    "${BIN_ROOT}/peer" channel getinfo -c "${CHANNEL_NAME}" 2>/dev/null |
    sed -n 's/^Blockchain info: //p'
}

org1="$(query_org 1 Org1MSP 7051)"
org2="$(query_org 2 Org2MSP 9051)"
[[ -n "${org1}" && -n "${org2}" ]] || {
  echo "Unable to read both peer ledgers" >&2
  exit 1
}

printf '{"channel":"%s","org1":%s,"org2":%s,"consistent":%s}\n' \
  "${CHANNEL_NAME}" "${org1}" "${org2}" "$([[ "${org1}" == "${org2}" ]] && echo true || echo false)"
[[ "${org1}" == "${org2}" ]]
