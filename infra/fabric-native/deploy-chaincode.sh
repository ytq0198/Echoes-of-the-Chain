#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SAMPLES_ROOT="${PROJECT_ROOT}/.tools/fabric-samples"
NETWORK_ROOT="${SAMPLES_ROOT}/test-network"
BIN_ROOT="${SAMPLES_ROOT}/bin"
CONFIG_ROOT="${SAMPLES_ROOT}/config"
NODE_ROOT="${PROJECT_ROOT}/.tools/node/bin"
ORGANIZATIONS="${NETWORK_ROOT}/organizations"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/native-fabric"
PACKAGE_ROOT="${RUNTIME_ROOT}/chaincode-package"
PID_ROOT="${RUNTIME_ROOT}/pids"
LOG_ROOT="${RUNTIME_ROOT}/logs"
CHAINCODE_ROOT="${PROJECT_ROOT}/chaincode/grade-contract"
CHANNEL_NAME=chaingrade
CHAINCODE_NAME=grade
CHAINCODE_VERSION=0.9
CHAINCODE_SEQUENCE=1
CHAINCODE_LABEL=grade_0.9_native
CHAINCODE_ADDRESS=127.0.0.1:9999
PACKAGE_FILE="${PACKAGE_ROOT}/${CHAINCODE_LABEL}.tgz"

mkdir -p "${PACKAGE_ROOT}" "${PID_ROOT}" "${LOG_ROOT}"
export FABRIC_CFG_PATH="${CONFIG_ROOT}"

configure_org() {
  local org="$1"
  local msp="$2"
  local port="$3"
  local root="${ORGANIZATIONS}/peerOrganizations/org${org}.example.com"
  export FABRIC_CFG_PATH="${CONFIG_ROOT}"
  export CORE_PEER_LOCALMSPID="${msp}"
  export CORE_PEER_MSPCONFIGPATH="${root}/users/Admin@org${org}.example.com/msp"
  export CORE_PEER_ADDRESS="localhost:${port}"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_TLS_ROOTCERT_FILE="${root}/peers/peer0.org${org}.example.com/tls/ca.crt"
}

package_chaincode() {
  rm -rf -- "${PACKAGE_ROOT}/source" "${PACKAGE_ROOT}/outer"
  mkdir -p "${PACKAGE_ROOT}/source" "${PACKAGE_ROOT}/outer"
  printf '%s\n' \
    "{\"address\":\"${CHAINCODE_ADDRESS}\",\"dial_timeout\":\"10s\",\"tls_required\":false}" \
    >"${PACKAGE_ROOT}/source/connection.json"
  printf '%s\n' \
    "{\"type\":\"ccaas\",\"label\":\"${CHAINCODE_LABEL}\"}" \
    >"${PACKAGE_ROOT}/outer/metadata.json"
  tar -C "${PACKAGE_ROOT}/source" -czf "${PACKAGE_ROOT}/outer/code.tar.gz" connection.json
  tar -C "${PACKAGE_ROOT}/outer" -czf "${PACKAGE_FILE}" metadata.json code.tar.gz
}

install_for_org() {
  local org="$1"
  local msp="$2"
  local port="$3"
  configure_org "${org}" "${msp}" "${port}"
  if ! "${BIN_ROOT}/peer" lifecycle chaincode queryinstalled 2>/dev/null | grep -q "${PACKAGE_ID}"; then
    "${BIN_ROOT}/peer" lifecycle chaincode install "${PACKAGE_FILE}"
  fi
}

start_server() {
  local pid_file="${PID_ROOT}/grade-chaincode.pid"
  if [[ -s "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
    echo "grade chaincode server is already running"
    return
  fi
  (
    export PATH="${NODE_ROOT}:${PATH}"
    cd "${CHAINCODE_ROOT}"
    "${NODE_ROOT}/node" node_modules/typescript/bin/tsc -p tsconfig.json
    nohup node_modules/.bin/fabric-chaincode-node server \
      --chaincode-id "${PACKAGE_ID}" --chaincode-address "${CHAINCODE_ADDRESS}" \
      >"${LOG_ROOT}/grade-chaincode.log" 2>&1 &
    echo $! >"${pid_file}"
  )
  for _ in $(seq 1 180); do
    if ss -ltnH 'sport = :9999' | grep -q .; then
      echo "grade chaincode server is listening on 9999"
      return
    fi
    sleep 1
  done
  echo "chaincode server failed; inspect ${LOG_ROOT}/grade-chaincode.log" >&2
  return 1
}

approve_for_org() {
  local org="$1"
  local msp="$2"
  local port="$3"
  configure_org "${org}" "${msp}" "${port}"
  "${BIN_ROOT}/peer" lifecycle chaincode approveformyorg \
    -o localhost:7050 --ordererTLSHostnameOverride localhost --tls \
    --cafile "${ORGANIZATIONS}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" --package-id "${PACKAGE_ID}" \
    --sequence "${CHAINCODE_SEQUENCE}" \
    --signature-policy "OR('Org1MSP.peer','Org2MSP.peer')"
}

commit_definition() {
  configure_org 1 Org1MSP 7051
  "${BIN_ROOT}/peer" lifecycle chaincode commit \
    -o localhost:7050 --ordererTLSHostnameOverride localhost --tls \
    --cafile "${ORGANIZATIONS}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
    --version "${CHAINCODE_VERSION}" --sequence "${CHAINCODE_SEQUENCE}" \
    --signature-policy "OR('Org1MSP.peer','Org2MSP.peer')" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "${ORGANIZATIONS}/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "${ORGANIZATIONS}/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
}

query_definition() {
  configure_org 1 Org1MSP 7051
  "${BIN_ROOT}/peer" lifecycle chaincode querycommitted \
    --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}"
}

case "${1:-deploy}" in
  deploy)
    "${SCRIPT_DIR}/native-network.sh" status >/dev/null
    package_chaincode
    PACKAGE_ID="$("${BIN_ROOT}/peer" lifecycle chaincode calculatepackageid "${PACKAGE_FILE}")"
    export PACKAGE_ID
    echo "Package ID: ${PACKAGE_ID}"
    install_for_org 1 Org1MSP 7051
    install_for_org 2 Org2MSP 9051
    start_server
    approve_for_org 1 Org1MSP 7051
    approve_for_org 2 Org2MSP 9051
    commit_definition
    query_definition
    ;;
  status)
    query_definition
    pid_file="${PID_ROOT}/grade-chaincode.pid"
    [[ -s "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null
    echo "RUNNING grade-chaincode pid=$(cat "${pid_file}")"
    ;;
  stop)
    pid_file="${PID_ROOT}/grade-chaincode.pid"
    if [[ -s "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
      kill "$(cat "${pid_file}")"
    fi
    rm -f -- "${pid_file}"
    ;;
  *) echo "Usage: $0 {deploy|status|stop}" >&2; exit 2 ;;
esac
