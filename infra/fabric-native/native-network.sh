#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
SAMPLES_ROOT="${PROJECT_ROOT}/.tools/fabric-samples"
NETWORK_ROOT="${SAMPLES_ROOT}/test-network"
BIN_ROOT="${SAMPLES_ROOT}/bin"
CONFIG_ROOT="${SAMPLES_ROOT}/config"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/native-fabric"
PID_ROOT="${RUNTIME_ROOT}/pids"
LOG_ROOT="${RUNTIME_ROOT}/logs"
DATA_ROOT="${RUNTIME_ROOT}/data"
CHANNEL_ROOT="${RUNTIME_ROOT}/channel"
GENERATED_CONFIG="${RUNTIME_ROOT}/configtx"
ORGANIZATIONS="${NETWORK_ROOT}/organizations"
CHANNEL_NAME="chaingrade"

mkdir -p "${PID_ROOT}" "${LOG_ROOT}" "${DATA_ROOT}" "${CHANNEL_ROOT}"

wait_port() {
  local port="$1"
  local name="$2"
  for _ in $(seq 1 60); do
    if ss -ltnH "sport = :${port}" | grep -q .; then
      echo "${name} is listening on ${port}"
      return 0
    fi
    sleep 1
  done
  echo "${name} did not open port ${port}; inspect ${LOG_ROOT}/${name}.log" >&2
  return 1
}

is_running() {
  local name="$1"
  local pid_file="${PID_ROOT}/${name}.pid"
  [[ -s "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null
}

prepare_channel_block() {
  mkdir -p "${GENERATED_CONFIG}"
  ln -sfn "${ORGANIZATIONS}" "${RUNTIME_ROOT}/organizations"
  sed -e 's/Host: orderer\.example\.com/Host: localhost/' \
    -e 's/- orderer\.example\.com:7050/- localhost:7050/' \
    "${NETWORK_ROOT}/configtx/configtx.yaml" >"${GENERATED_CONFIG}/configtx.yaml"
  FABRIC_CFG_PATH="${GENERATED_CONFIG}" "${BIN_ROOT}/configtxgen" \
    -profile ChannelUsingRaft -outputBlock "${CHANNEL_ROOT}/${CHANNEL_NAME}.block" \
    -channelID "${CHANNEL_NAME}"
}

start_orderer() {
  if is_running orderer; then
    echo "orderer is already running"
    return
  fi
  local base="${ORGANIZATIONS}/ordererOrganizations/example.com/orderers/orderer.example.com"
  mkdir -p "${DATA_ROOT}/orderer/ledger" "${DATA_ROOT}/orderer/wal" \
    "${DATA_ROOT}/orderer/snapshot"
  (
    export FABRIC_CFG_PATH="${CONFIG_ROOT}"
    export FABRIC_LOGGING_SPEC=INFO
    export ORDERER_GENERAL_LISTENADDRESS=127.0.0.1
    export ORDERER_GENERAL_LISTENPORT=7050
    export ORDERER_GENERAL_LOCALMSPID=OrdererMSP
    export ORDERER_GENERAL_LOCALMSPDIR="${base}/msp"
    export ORDERER_GENERAL_TLS_ENABLED=true
    export ORDERER_GENERAL_TLS_PRIVATEKEY="${base}/tls/server.key"
    export ORDERER_GENERAL_TLS_CERTIFICATE="${base}/tls/server.crt"
    export ORDERER_GENERAL_TLS_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE="${base}/tls/server.crt"
    export ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY="${base}/tls/server.key"
    export ORDERER_GENERAL_CLUSTER_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_GENERAL_BOOTSTRAPMETHOD=none
    export ORDERER_CHANNELPARTICIPATION_ENABLED=true
    export ORDERER_ADMIN_TLS_ENABLED=true
    export ORDERER_ADMIN_TLS_CERTIFICATE="${base}/tls/server.crt"
    export ORDERER_ADMIN_TLS_PRIVATEKEY="${base}/tls/server.key"
    export ORDERER_ADMIN_TLS_ROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_ADMIN_TLS_CLIENTROOTCAS="[${base}/tls/ca.crt]"
    export ORDERER_ADMIN_LISTENADDRESS=127.0.0.1:7053
    export ORDERER_OPERATIONS_LISTENADDRESS=127.0.0.1:9443
    export ORDERER_METRICS_PROVIDER=disabled
    export ORDERER_FILELEDGER_LOCATION="${DATA_ROOT}/orderer/ledger"
    export ORDERER_CONSENSUS_WALDIR="${DATA_ROOT}/orderer/wal"
    export ORDERER_CONSENSUS_SNAPDIR="${DATA_ROOT}/orderer/snapshot"
    nohup "${BIN_ROOT}/orderer" >"${LOG_ROOT}/orderer.log" 2>&1 &
    echo $! >"${PID_ROOT}/orderer.pid"
  )
  wait_port 7053 orderer

  if ! "${BIN_ROOT}/osnadmin" channel list -o localhost:7053 \
    --ca-file "${base}/tls/ca.crt" --client-cert "${base}/tls/server.crt" \
    --client-key "${base}/tls/server.key" | grep -q "${CHANNEL_NAME}"; then
    "${BIN_ROOT}/osnadmin" channel join -o localhost:7053 \
      --channelID "${CHANNEL_NAME}" --config-block "${CHANNEL_ROOT}/${CHANNEL_NAME}.block" \
      --ca-file "${base}/tls/ca.crt" --client-cert "${base}/tls/server.crt" \
      --client-key "${base}/tls/server.key"
  fi
  wait_port 7050 orderer-consensus
}

start_peer() {
  local org="$1"
  local msp="$2"
  local peer_port="$3"
  local chaincode_port="$4"
  local operations_port="$5"
  local name="peer0.org${org}"
  local base="${ORGANIZATIONS}/peerOrganizations/org${org}.example.com/peers/peer0.org${org}.example.com"
  if is_running "${name}"; then
    echo "${name} is already running"
    return
  fi
  mkdir -p "${DATA_ROOT}/${name}" "${DATA_ROOT}/${name}/snapshots"
  (
    export FABRIC_CFG_PATH="${CONFIG_ROOT}"
    export FABRIC_LOGGING_SPEC=INFO
    export CORE_PEER_ID="${name}.example.com"
    export CORE_PEER_ADDRESS="localhost:${peer_port}"
    export CORE_PEER_LISTENADDRESS="127.0.0.1:${peer_port}"
    export CORE_PEER_CHAINCODEADDRESS="localhost:${chaincode_port}"
    export CORE_PEER_CHAINCODELISTENADDRESS="127.0.0.1:${chaincode_port}"
    export CORE_PEER_GOSSIP_BOOTSTRAP=""
    export CORE_PEER_GOSSIP_EXTERNALENDPOINT="localhost:${peer_port}"
    export CORE_PEER_LOCALMSPID="${msp}"
    export CORE_PEER_MSPCONFIGPATH="${base}/msp"
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_TLS_CERT_FILE="${base}/tls/server.crt"
    export CORE_PEER_TLS_KEY_FILE="${base}/tls/server.key"
    export CORE_PEER_TLS_ROOTCERT_FILE="${base}/tls/ca.crt"
    export CORE_PEER_FILESYSTEMPATH="${DATA_ROOT}/${name}"
    export CORE_LEDGER_SNAPSHOTS_ROOTDIR="${DATA_ROOT}/${name}/snapshots"
    export CORE_OPERATIONS_LISTENADDRESS="127.0.0.1:${operations_port}"
    export CORE_METRICS_PROVIDER=disabled
    export CORE_CHAINCODE_EXTERNALBUILDERS="[{\"name\":\"ccaas_builder\",\"path\":\"${SAMPLES_ROOT}/builders/ccaas\",\"propagateEnvironment\":[\"CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG\"]}]"
    export CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG="{\"peername\":\"peer0org${org}\"}"
    nohup "${BIN_ROOT}/peer" node start >"${LOG_ROOT}/${name}.log" 2>&1 &
    echo $! >"${PID_ROOT}/${name}.pid"
  )
  wait_port "${peer_port}" "${name}"
}

join_peer() {
  local org="$1"
  local msp="$2"
  local peer_port="$3"
  local org_root="${ORGANIZATIONS}/peerOrganizations/org${org}.example.com"
  export FABRIC_CFG_PATH="${CONFIG_ROOT}"
  export CORE_PEER_LOCALMSPID="${msp}"
  export CORE_PEER_MSPCONFIGPATH="${org_root}/users/Admin@org${org}.example.com/msp"
  export CORE_PEER_ADDRESS="localhost:${peer_port}"
  export CORE_PEER_TLS_ENABLED=true
  export CORE_PEER_TLS_ROOTCERT_FILE="${org_root}/peers/peer0.org${org}.example.com/tls/ca.crt"
  if ! "${BIN_ROOT}/peer" channel list 2>/dev/null | grep -qx "${CHANNEL_NAME}"; then
    "${BIN_ROOT}/peer" channel join -b "${CHANNEL_ROOT}/${CHANNEL_NAME}.block"
  fi
}

stop_process() {
  local name="$1"
  local pid_file="${PID_ROOT}/${name}.pid"
  if ! is_running "${name}"; then
    rm -f -- "${pid_file}"
    echo "${name} is stopped"
    return
  fi
  local pid
  pid="$(cat "${pid_file}")"
  kill "${pid}"
  for _ in $(seq 1 20); do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "${pid}" 2>/dev/null; then
    echo "${name} did not stop after SIGTERM" >&2
    return 1
  fi
  rm -f -- "${pid_file}"
  echo "${name} stopped"
}

status() {
  local failed=0
  for name in orderer peer0.org1 peer0.org2; do
    if is_running "${name}"; then
      echo "RUNNING ${name} pid=$(cat "${PID_ROOT}/${name}.pid")"
    else
      echo "STOPPED ${name}"
      failed=1
    fi
  done
  return "${failed}"
}

case "${1:-}" in
  up)
    CHAINGRADE_ALLOW_OCCUPIED_PORTS=true "${SCRIPT_DIR}/preflight.sh"
    prepare_channel_block
    start_orderer
    start_peer 1 Org1MSP 7051 7052 9444
    start_peer 2 Org2MSP 9051 9052 9445
    join_peer 1 Org1MSP 7051
    join_peer 2 Org2MSP 9051
    status
    ;;
  status) status ;;
  down)
    stop_process peer0.org2
    stop_process peer0.org1
    stop_process orderer
    ;;
  logs)
    tail -n 80 "${LOG_ROOT}"/*.log
    ;;
  *) echo "Usage: $0 {up|status|down|logs}" >&2; exit 2 ;;
esac
