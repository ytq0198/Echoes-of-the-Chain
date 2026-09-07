#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/benchmark"
BIN_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/bin"
CONFIG_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/config"
SAMPLES_ROOT="${PROJECT_ROOT}/.tools/fabric-samples"
NODE_ROOT="${PROJECT_ROOT}/.tools/node/bin"
ORG_ROOT="${RUNTIME_ROOT}/organizations"
PID_ROOT="${RUNTIME_ROOT}/pids"
LOG_ROOT="${RUNTIME_ROOT}/logs"
DATA_ROOT="${RUNTIME_ROOT}/data"
CHANNEL_ROOT="${RUNTIME_ROOT}/channel"
PACKAGE_ROOT="${RUNTIME_ROOT}/chaincode-package"
CHANNEL_NAME=chaingrade-benchmark
CHAINCODE_NAME=grade
CHAINCODE_VERSION=1.0
CHAINCODE_SEQUENCE=1
CHAINCODE_LABEL=grade_1.0_benchmark
CHAINCODE_ADDRESS=127.0.0.1:19999
export FABRIC_CFG_PATH="${CONFIG_ROOT}"

mkdir -p "${PID_ROOT}" "${LOG_ROOT}" "${DATA_ROOT}" "${CHANNEL_ROOT}" "${PACKAGE_ROOT}"

wait_port() {
  local port="$1" name="$2"
  for _ in $(seq 1 120); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      exec 3>&-
      echo "${name} is listening on ${port}"
      return 0
    fi
    sleep 1
  done
  echo "${name} did not open port ${port}; inspect ${LOG_ROOT}/${name}.log" >&2
  return 1
}

is_running() {
  local name="$1" pid_file="${PID_ROOT}/$1.pid"
  [[ -s "${pid_file}" ]] && kill -0 "$(<"${pid_file}")" 2>/dev/null
}

stop_process() {
  local name="$1" pid_file="${PID_ROOT}/$1.pid" pid
  if ! is_running "${name}"; then rm -f -- "${pid_file}"; echo "STOPPED ${name}"; return; fi
  pid="$(<"${pid_file}")"
  kill "${pid}"
  for _ in $(seq 1 30); do kill -0 "${pid}" 2>/dev/null || break; sleep 1; done
  if kill -0 "${pid}" 2>/dev/null; then echo "${name} did not stop" >&2; return 1; fi
  rm -f -- "${pid_file}"
  echo "STOPPED ${name}"
}

prepare_channel_block() {
  [[ -s "${CHANNEL_ROOT}/${CHANNEL_NAME}.block" ]] && return
  local config_dir="${RUNTIME_ROOT}/configtx"
  mkdir -p "${config_dir}"
  sed \
    -e "s#\.\./organizations#${ORG_ROOT}#g" \
    -e 's/orderer\.example\.com:7050/localhost:17050/g' \
    -e 's/Host: orderer\.example\.com/Host: localhost/' \
    -e 's/Port: 7050/Port: 17050/' \
    "${SAMPLES_ROOT}/test-network/configtx/configtx.yaml" >"${config_dir}/configtx.yaml"
  FABRIC_CFG_PATH="${config_dir}" "${BIN_ROOT}/configtxgen" \
    -profile ChannelUsingRaft -outputBlock "${CHANNEL_ROOT}/${CHANNEL_NAME}.block" \
    -channelID "${CHANNEL_NAME}"
}

start_orderer() {
  if is_running orderer; then echo "orderer already running"; return; fi
  local base="${ORG_ROOT}/ordererOrganizations/example.com/orderers/orderer.example.com"
  mkdir -p "${DATA_ROOT}/orderer/ledger" "${DATA_ROOT}/orderer/wal" "${DATA_ROOT}/orderer/snapshot"
  (
    export FABRIC_CFG_PATH="${CONFIG_ROOT}" FABRIC_LOGGING_SPEC=INFO
    export ORDERER_GENERAL_LISTENADDRESS=127.0.0.1 ORDERER_GENERAL_LISTENPORT=17050
    export ORDERER_GENERAL_LOCALMSPID=OrdererMSP ORDERER_GENERAL_LOCALMSPDIR="${base}/msp"
    export ORDERER_GENERAL_TLS_ENABLED=true ORDERER_GENERAL_TLS_PRIVATEKEY="${base}/tls/server.key"
    export ORDERER_GENERAL_TLS_CERTIFICATE="${base}/tls/server.crt" ORDERER_GENERAL_TLS_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE="${base}/tls/server.crt"
    export ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY="${base}/tls/server.key"
    export ORDERER_GENERAL_CLUSTER_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_GENERAL_BOOTSTRAPMETHOD=none ORDERER_CHANNELPARTICIPATION_ENABLED=true
    export ORDERER_ADMIN_TLS_ENABLED=true ORDERER_ADMIN_TLS_CERTIFICATE="${base}/tls/server.crt"
    export ORDERER_ADMIN_TLS_PRIVATEKEY="${base}/tls/server.key" ORDERER_ADMIN_TLS_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_ADMIN_TLS_CLIENTROOTCAS="[${base}/tls/ca.crt]" ORDERER_ADMIN_LISTENADDRESS=127.0.0.1:17053
    export ORDERER_OPERATIONS_LISTENADDRESS=127.0.0.1:19443 ORDERER_METRICS_PROVIDER=disabled
    export ORDERER_FILELEDGER_LOCATION="${DATA_ROOT}/orderer/ledger"
    export ORDERER_CONSENSUS_WALDIR="${DATA_ROOT}/orderer/wal" ORDERER_CONSENSUS_SNAPDIR="${DATA_ROOT}/orderer/snapshot"
    nohup "${BIN_ROOT}/orderer" >"${LOG_ROOT}/orderer.log" 2>&1 & echo $! >"${PID_ROOT}/orderer.pid"
  )
  wait_port 17053 orderer
  if ! "${BIN_ROOT}/osnadmin" channel list -o localhost:17053 \
    --ca-file "${base}/tls/ca.crt" --client-cert "${base}/tls/server.crt" \
    --client-key "${base}/tls/server.key" 2>/dev/null | grep -q "${CHANNEL_NAME}"; then
    "${BIN_ROOT}/osnadmin" channel join -o localhost:17053 --channelID "${CHANNEL_NAME}" \
      --config-block "${CHANNEL_ROOT}/${CHANNEL_NAME}.block" --ca-file "${base}/tls/ca.crt" \
      --client-cert "${base}/tls/server.crt" --client-key "${base}/tls/server.key"
  fi
  wait_port 17050 orderer-consensus
}

wait_orderer_ready() {
  local root="${ORG_ROOT}/peerOrganizations/org1.example.com"
  local orderer_ca="${ORG_ROOT}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
  for _ in $(seq 1 45); do
    if FABRIC_CFG_PATH="${CONFIG_ROOT}" CORE_PEER_LOCALMSPID=Org1MSP \
      CORE_PEER_MSPCONFIGPATH="${root}/users/Admin@org1.example.com/msp" \
      CORE_PEER_TLS_ENABLED=true "${BIN_ROOT}/peer" channel fetch newest \
      "${CHANNEL_ROOT}/readiness.block" -c "${CHANNEL_NAME}" -o localhost:17050 \
      --ordererTLSHostnameOverride localhost --tls --cafile "${orderer_ca}" \
      >/dev/null 2>&1; then
      echo "orderer has an active Raft leader"
      return 0
    fi
    sleep 1
  done
  echo "orderer did not elect a Raft leader" >&2
  return 1
}

start_peer() {
  local org="$1" msp="$2" peer_port="$3" cc_port="$4" ops_port="$5"
  local name="peer0.org${org}" base="${ORG_ROOT}/peerOrganizations/org${org}.example.com/peers/peer0.org${org}.example.com"
  if is_running "${name}"; then echo "${name} already running"; return; fi
  mkdir -p "${DATA_ROOT}/${name}" "${DATA_ROOT}/${name}/snapshots"
  (
    export FABRIC_CFG_PATH="${CONFIG_ROOT}" FABRIC_LOGGING_SPEC=INFO CORE_PEER_ID="${name}.example.com"
    export CORE_PEER_ADDRESS="localhost:${peer_port}" CORE_PEER_LISTENADDRESS="127.0.0.1:${peer_port}"
    export CORE_PEER_CHAINCODEADDRESS="localhost:${cc_port}" CORE_PEER_CHAINCODELISTENADDRESS="127.0.0.1:${cc_port}"
    export CORE_PEER_GOSSIP_BOOTSTRAP="" CORE_PEER_GOSSIP_EXTERNALENDPOINT="localhost:${peer_port}"
    export CORE_PEER_LOCALMSPID="${msp}" CORE_PEER_MSPCONFIGPATH="${base}/msp"
    export CORE_PEER_TLS_ENABLED=true CORE_PEER_TLS_CERT_FILE="${base}/tls/server.crt"
    export CORE_PEER_TLS_KEY_FILE="${base}/tls/server.key" CORE_PEER_TLS_ROOTCERT_FILE="${base}/tls/ca.crt"
    export CORE_PEER_FILESYSTEMPATH="${DATA_ROOT}/${name}" CORE_LEDGER_SNAPSHOTS_ROOTDIR="${DATA_ROOT}/${name}/snapshots"
    export CORE_OPERATIONS_LISTENADDRESS="127.0.0.1:${ops_port}" CORE_METRICS_PROVIDER=disabled
    export CORE_CHAINCODE_EXTERNALBUILDERS="[{\"name\":\"ccaas_builder\",\"path\":\"${SAMPLES_ROOT}/builders/ccaas\",\"propagateEnvironment\":[\"CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG\"]}]"
    export CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG="{\"peername\":\"peer0org${org}\"}"
    nohup "${BIN_ROOT}/peer" node start >"${LOG_ROOT}/${name}.log" 2>&1 & echo $! >"${PID_ROOT}/${name}.pid"
  )
  wait_port "${peer_port}" "${name}"
}

configure_org() {
  local org="$1" msp="$2" port="$3" root="${ORG_ROOT}/peerOrganizations/org$1.example.com"
  export FABRIC_CFG_PATH="${CONFIG_ROOT}" CORE_PEER_LOCALMSPID="${msp}"
  export CORE_PEER_MSPCONFIGPATH="${root}/users/Admin@org${org}.example.com/msp"
  export CORE_PEER_ADDRESS="localhost:${port}" CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_TLS_ROOTCERT_FILE="${root}/peers/peer0.org${org}.example.com/tls/ca.crt"
}

join_peer() {
  local org="$1" msp="$2" port="$3"
  configure_org "${org}" "${msp}" "${port}"
  if ! "${BIN_ROOT}/peer" channel list 2>/dev/null | grep -qx "${CHANNEL_NAME}"; then
    "${BIN_ROOT}/peer" channel join -b "${CHANNEL_ROOT}/${CHANNEL_NAME}.block"
  fi
}

package_chaincode() {
  rm -rf -- "${PACKAGE_ROOT:?}/source" "${PACKAGE_ROOT:?}/outer"
  mkdir -p "${PACKAGE_ROOT}/source" "${PACKAGE_ROOT}/outer"
  printf '%s\n' "{\"address\":\"${CHAINCODE_ADDRESS}\",\"dial_timeout\":\"10s\",\"tls_required\":false}" >"${PACKAGE_ROOT}/source/connection.json"
  printf '%s\n' "{\"type\":\"ccaas\",\"label\":\"${CHAINCODE_LABEL}\"}" >"${PACKAGE_ROOT}/outer/metadata.json"
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -C "${PACKAGE_ROOT}/source" -czf "${PACKAGE_ROOT}/outer/code.tar.gz" connection.json
  tar --sort=name --mtime='UTC 1970-01-01' --owner=0 --group=0 --numeric-owner -C "${PACKAGE_ROOT}/outer" -czf "${PACKAGE_ROOT}/${CHAINCODE_LABEL}.tgz" metadata.json code.tar.gz
  PACKAGE_ID="$("${BIN_ROOT}/peer" lifecycle chaincode calculatepackageid "${PACKAGE_ROOT}/${CHAINCODE_LABEL}.tgz")"
  export PACKAGE_ID
}

start_ccaas() {
  package_chaincode
  if is_running ccaas; then echo "ccaas already running"; return; fi
  (
    export PATH="${NODE_ROOT}:${PATH}"
    cd "${PROJECT_ROOT}/chaincode/grade-contract"
    "${NODE_ROOT}/node" node_modules/typescript/bin/tsc -p tsconfig.json
    nohup node_modules/.bin/fabric-chaincode-node server \
      --chaincode-id "${PACKAGE_ID}" --chaincode-address "${CHAINCODE_ADDRESS}" \
      >"${LOG_ROOT}/ccaas.log" 2>&1 & echo $! >"${PID_ROOT}/ccaas.pid"
  )
  wait_port 19999 ccaas
}

install_package() {
  local org="$1" msp="$2" port="$3"
  configure_org "${org}" "${msp}" "${port}"
  "${BIN_ROOT}/peer" lifecycle chaincode queryinstalled 2>/dev/null | grep -Fq "${PACKAGE_ID}" || \
    "${BIN_ROOT}/peer" lifecycle chaincode install "${PACKAGE_ROOT}/${CHAINCODE_LABEL}.tgz"
}

definition_committed() {
  configure_org 1 Org1MSP 17051
  "${BIN_ROOT}/peer" lifecycle chaincode querycommitted --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}" 2>/dev/null | \
    grep -Fq "Version: ${CHAINCODE_VERSION}, Sequence: ${CHAINCODE_SEQUENCE}"
}

deploy_chaincode() {
  package_chaincode
  install_package 1 Org1MSP 17051
  install_package 2 Org2MSP 19051
  start_ccaas
  if ! definition_committed; then
    local orderer_ca="${ORG_ROOT}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
    for spec in '1 Org1MSP 17051' '2 Org2MSP 19051'; do
      read -r org msp port <<<"${spec}"; configure_org "${org}" "${msp}" "${port}"
      "${BIN_ROOT}/peer" lifecycle chaincode approveformyorg -o localhost:17050 --ordererTLSHostnameOverride localhost --tls \
        --cafile "${orderer_ca}" --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
        --version "${CHAINCODE_VERSION}" --package-id "${PACKAGE_ID}" --sequence "${CHAINCODE_SEQUENCE}" \
        --signature-policy "OR('Org1MSP.peer','Org2MSP.peer')"
    done
    configure_org 1 Org1MSP 17051
    "${BIN_ROOT}/peer" lifecycle chaincode commit -o localhost:17050 --ordererTLSHostnameOverride localhost --tls \
      --cafile "${orderer_ca}" --channelID "${CHANNEL_NAME}" --name "${CHAINCODE_NAME}" \
      --version "${CHAINCODE_VERSION}" --sequence "${CHAINCODE_SEQUENCE}" \
      --signature-policy "OR('Org1MSP.peer','Org2MSP.peer')" \
      --peerAddresses localhost:17051 --tlsRootCertFiles "${ORG_ROOT}/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
      --peerAddresses localhost:19051 --tlsRootCertFiles "${ORG_ROOT}/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
  fi
  definition_committed
}

start_api() {
  if is_running api; then echo "api already running"; return; fi
  # shellcheck disable=SC1090
  source "${RUNTIME_ROOT}/secrets.env"
  local org1="${ORG_ROOT}/peerOrganizations/org1.example.com"
  (
    export PATH="${NODE_ROOT}:${PATH}" PORT=17300 HOST=127.0.0.1 FABRIC_ENABLED=true
    export CHAINGRADE_PROJECT_ROOT="${PROJECT_ROOT}" FABRIC_CHANNEL_NAME="${CHANNEL_NAME}" FABRIC_CHAINCODE_NAME="${CHAINCODE_NAME}"
    export FABRIC_NETWORK_ROOT="${RUNTIME_ROOT}" FABRIC_PEER_ENDPOINT=localhost:17051 FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
    export FABRIC_TLS_CERT_PATH="${org1}/peers/peer0.org1.example.com/tls/ca.crt"
    export FABRIC_ISSUER_MSP_PATH="${org1}/users/BenchmarkIssuer@org1.example.com/msp"
    export FABRIC_REVIEWER_MSP_PATH="${org1}/users/BenchmarkReviewer@org1.example.com/msp"
    export FABRIC_STUDENT_MSP_PATH="${org1}/users/BenchmarkStudent@org1.example.com/msp"
    export AUTH_ENABLED=true AUTH_SESSION_SECRET="${API_SESSION_SECRET}" AUTH_ALLOWED_ORIGINS=http://127.0.0.1:17300
    export AUTH_ALLOW_NON_BROWSER_CLIENTS=true AUTH_SECURE_COOKIE=false AUTH_TTL_SECONDS=28800
    export AUTH_ISSUER_USERNAME=benchmark-issuer AUTH_ISSUER_PASSWORD="${API_ISSUER_PASSWORD}"
    export AUTH_REVIEWER_USERNAME=benchmark-reviewer AUTH_REVIEWER_PASSWORD="${API_REVIEWER_PASSWORD}"
    export AUTH_STUDENT_USERNAME=benchmark-student AUTH_STUDENT_PASSWORD="${API_STUDENT_PASSWORD}"
    export AUTH_STUDENT_SUBJECT_HASH="$(printf %s benchmark-synthetic-student-v1 | sha256sum | cut -d ' ' -f 1)"
    cd "${PROJECT_ROOT}/apps/api"
    nohup "${NODE_ROOT}/node" node_modules/tsx/dist/cli.mjs src/server.ts >"${LOG_ROOT}/api.log" 2>&1 & echo $! >"${PID_ROOT}/api.pid"
  )
  wait_port 17300 api
}

query_org() {
  local org="$1" msp="$2" port="$3"
  configure_org "${org}" "${msp}" "${port}"
  "${BIN_ROOT}/peer" channel getinfo -c "${CHANNEL_NAME}" 2>/dev/null | sed -n 's/^Blockchain info: //p'
}

ledger_info() {
  local org1 org2 consistent
  org1="$(query_org 1 Org1MSP 17051)"; org2="$(query_org 2 Org2MSP 19051)"
  [[ -n "${org1}" && -n "${org2}" ]] || { echo "Unable to query both ledgers" >&2; return 1; }
  [[ "${org1}" == "${org2}" ]] && consistent=true || consistent=false
  printf '{"channel":"%s","org1":%s,"org2":%s,"consistent":%s}\n' "${CHANNEL_NAME}" "${org1}" "${org2}" "${consistent}"
  [[ "${consistent}" == true ]]
}

status() {
  local failed=0 name
  for name in orderer peer0.org1 peer0.org2 ccaas api; do
    if is_running "${name}"; then echo "RUNNING ${name} pid=$(<"${PID_ROOT}/${name}.pid")"; else echo "STOPPED ${name}"; failed=1; fi
  done
  if [[ "${failed}" -eq 0 ]]; then
    "${NODE_ROOT}/node" -e "fetch('http://127.0.0.1:17300/health').then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(x=>console.log(JSON.stringify(x)))"
    definition_committed
    ledger_info
  fi
  return "${failed}"
}

start_all() {
  CHAINGRADE_ALLOW_MANAGED_PORTS=true "${NODE_ROOT}/node" "${SCRIPT_DIR}/preflight.mjs"
  "${SCRIPT_DIR}/materials.sh"
  prepare_channel_block
  start_orderer
  wait_orderer_ready
  start_peer 1 Org1MSP 17051 17052 19444
  start_peer 2 Org2MSP 19051 19052 19445
  join_peer 1 Org1MSP 17051
  join_peer 2 Org2MSP 19051
  deploy_chaincode
  start_api
  status
}

case "${1:-}" in
  start) start_all ;;
  status) status ;;
  stop)
    stop_process api; stop_process ccaas; stop_process peer0.org2; stop_process peer0.org1; stop_process orderer
    ;;
  start-peer2) start_peer 2 Org2MSP 19051 19052 19445 ;;
  stop-peer2) stop_process peer0.org2 ;;
  start-ccaas) start_ccaas ;;
  stop-ccaas) stop_process ccaas ;;
  start-orderer) start_orderer; wait_orderer_ready ;;
  stop-orderer) stop_process orderer ;;
  ledger-info) ledger_info ;;
  *) echo "Usage: $0 {start|status|stop|start-peer2|stop-peer2|start-ccaas|stop-ccaas|start-orderer|stop-orderer|ledger-info}" >&2; exit 2 ;;
esac
