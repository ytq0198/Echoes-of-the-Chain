#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=versions.env
source "${SCRIPT_DIR}/versions.env"

NETWORK_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/test-network"
NETWORK_SCRIPT="${NETWORK_ROOT}/network.sh"
CHAINCODE_STAGE="${PROJECT_ROOT}/.tools/chaincode-stage/grade-contract"

if [[ ! -x "${NETWORK_SCRIPT}" ]]; then
  echo "Fabric samples are missing. Run infra/fabric/bootstrap.sh first." >&2
  exit 1
fi

export PATH="${PROJECT_ROOT}/.tools/node/bin:${PROJECT_ROOT}/.tools/bin:${PROJECT_ROOT}/.tools/fabric-samples/bin:${PATH}"
export FABRIC_CFG_PATH="${PROJECT_ROOT}/.tools/fabric-samples/config"

case "${1:-}" in
  up)
    (cd "${NETWORK_ROOT}" && ./network.sh up createChannel -ca -s leveldb \
      -c "${CHANNEL_NAME}" -i "${FABRIC_VERSION}" -cai "${CA_VERSION}")
    "${SCRIPT_DIR}/enroll-identities.sh"
    ;;
  deploy)
    rm -rf -- "${CHAINCODE_STAGE}"
    mkdir -p "${CHAINCODE_STAGE}"
    cp "${PROJECT_ROOT}/chaincode/grade-contract/package.json" \
      "${PROJECT_ROOT}/chaincode/grade-contract/package-lock.json" \
      "${PROJECT_ROOT}/chaincode/grade-contract/tsconfig.json" \
      "${CHAINCODE_STAGE}/"
    cp "${PROJECT_ROOT}/tsconfig.base.json" "${PROJECT_ROOT}/.tools/tsconfig.base.json"
    cp -R "${PROJECT_ROOT}/chaincode/grade-contract/src" "${CHAINCODE_STAGE}/src"
    (cd "${NETWORK_ROOT}" && ./network.sh deployCC \
      -c "${CHANNEL_NAME}" -ccn "${CHAINCODE_NAME}" \
      -ccp "${CHAINCODE_STAGE}" -ccl typescript \
      -ccv 0.1 -ccs 1 -ccep "OR('Org1MSP.peer','Org2MSP.peer')")
    ;;
  down)
    (cd "${NETWORK_ROOT}" && ./network.sh down)
    docker volume rm compose_orderer.example.com compose_peer0.org1.example.com \
      compose_peer0.org2.example.com 2>/dev/null || true
    ;;
  status)
    docker ps --filter 'label=com.docker.compose.project=fabric_test' \
      --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
    ;;
  *)
    echo "Usage: $0 {up|deploy|status|down}" >&2
    exit 2
    ;;
esac
