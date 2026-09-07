#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/benchmark"
BIN_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/bin"
ORG_ROOT="${RUNTIME_ROOT}/organizations"
CA_ROOT="${RUNTIME_ROOT}/fabric-ca"
PID_ROOT="${RUNTIME_ROOT}/pids"
LOG_ROOT="${RUNTIME_ROOT}/logs"
SECRETS_FILE="${RUNTIME_ROOT}/secrets.env"
STUDENT_HASH="$(printf %s benchmark-synthetic-student-v1 | sha256sum | cut -d ' ' -f 1)"

mkdir -p "${CA_ROOT}" "${PID_ROOT}" "${LOG_ROOT}"
if [[ -s "${ORG_ROOT}/peerOrganizations/org1.example.com/users/BenchmarkStudent@org1.example.com/msp/signcerts/cert.pem" ]]; then
  echo "Reusing isolated benchmark crypto material"
  exit 0
fi

if [[ ! -s "${SECRETS_FILE}" ]]; then
  {
    printf 'CA_BOOTSTRAP_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORG1_PEER_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORG2_PEER_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORDERER_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORG1_ADMIN_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORG2_ADMIN_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ORDERER_ADMIN_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'ISSUER_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'REVIEWER_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'STUDENT_SECRET=%q\n' "$(openssl rand -hex 24)"
    printf 'API_SESSION_SECRET=%q\n' "$(openssl rand -hex 32)"
    printf 'API_ISSUER_PASSWORD=%q\n' "$(openssl rand -hex 18)"
    printf 'API_REVIEWER_PASSWORD=%q\n' "$(openssl rand -hex 18)"
    printf 'API_STUDENT_PASSWORD=%q\n' "$(openssl rand -hex 18)"
  } >"${SECRETS_FILE}"
  chmod 600 "${SECRETS_FILE}"
fi
# shellcheck disable=SC1090
source "${SECRETS_FILE}"

wait_port() {
  local port="$1"
  for _ in $(seq 1 60); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then exec 3>&-; return 0; fi
    sleep 1
  done
  echo "CA did not listen on port ${port}" >&2
  return 1
}

start_ca() {
  local key="$1" name="$2" port="$3" ops_port="$4" home="$5"
  mkdir -p "${home}"
  (
    export FABRIC_CA_SERVER_HOME="${home}"
    nohup "${BIN_ROOT}/fabric-ca-server" start -b "admin:${CA_BOOTSTRAP_SECRET}" \
      --port "${port}" --ca.name "${name}" --tls.enabled \
      --operations.listenaddress "127.0.0.1:${ops_port}" \
      >"${LOG_ROOT}/${key}.log" 2>&1 &
    echo $! >"${PID_ROOT}/${key}.pid"
  )
  wait_port "${port}"
}

stop_cas() {
  local key pid
  for key in ca-org1 ca-org2 ca-orderer; do
    if [[ -s "${PID_ROOT}/${key}.pid" ]]; then
      pid="$(<"${PID_ROOT}/${key}.pid")"
      kill "${pid}" 2>/dev/null || true
      rm -f -- "${PID_ROOT:?}/${key}.pid"
    fi
  done
}
trap stop_cas EXIT

start_ca ca-org1 ca-org1 17054 19543 "${CA_ROOT}/org1"
start_ca ca-org2 ca-org2 19054 19544 "${CA_ROOT}/org2"
start_ca ca-orderer ca-orderer 17055 19545 "${CA_ROOT}/orderer"

client() {
  local home="$1" port="$2" ca_name="$3"; shift 3
  if ! FABRIC_CA_CLIENT_HOME="${home}" "${BIN_ROOT}/fabric-ca-client" "$@" \
    --caname "${ca_name}" --tls.certfiles "${CA_ROOT}/${ca_name#ca-}/ca-cert.pem" \
    >>"${LOG_ROOT}/fabric-ca-client.log" 2>&1; then
    echo "Fabric CA client operation failed; inspect the private runtime log" >&2
    return 1
  fi
}

write_node_ous() {
  local msp="$1" ca_file
  ca_file="$(find "${msp}/cacerts" -maxdepth 1 -type f -printf '%f\n' | head -1)"
  cat >"${msp}/config.yaml" <<YAML
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/${ca_file}
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/${ca_file}
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/${ca_file}
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/${ca_file}
    OrganizationalUnitIdentifier: orderer
YAML
}

copy_one() {
  local source_dir="$1" target="$2" source
  source="$(find "${source_dir}" -maxdepth 1 -type f | head -1)"
  [[ -n "${source}" ]] || { echo "No file found in ${source_dir}" >&2; return 1; }
  cp "${source}" "${target}"
}

enroll_tls() {
  local home="$1" port="$2" ca_name="$3" user="$4" secret="$5" output="$6" host="$7"
  client "${home}" "${port}" "${ca_name}" enroll \
    -u "https://${user}:${secret}@localhost:${port}" -M "${output}" \
    --enrollment.profile tls --csr.hosts "${host}" --csr.hosts localhost
  copy_one "${output}/tlscacerts" "${output}/ca.crt"
  copy_one "${output}/signcerts" "${output}/server.crt"
  copy_one "${output}/keystore" "${output}/server.key"
}

create_peer_org() {
  local org="$1" port="$2" peer_secret="$3" admin_secret="$4"
  local domain="org${org}.example.com" ca_name="ca-org${org}"
  local root="${ORG_ROOT}/peerOrganizations/${domain}"
  local ca_cert="${CA_ROOT}/org${org}/ca-cert.pem"
  mkdir -p "${root}"
  client "${root}" "${port}" "${ca_name}" enroll \
    -u "https://admin:${CA_BOOTSTRAP_SECRET}@localhost:${port}" -M "${root}/msp"
  write_node_ous "${root}/msp"
  mkdir -p "${root}/msp/tlscacerts" "${root}/tlsca" "${root}/ca"
  cp "${ca_cert}" "${root}/msp/tlscacerts/ca.crt"
  cp "${ca_cert}" "${root}/tlsca/tlsca.${domain}-cert.pem"
  cp "${ca_cert}" "${root}/ca/ca.${domain}-cert.pem"

  client "${root}" "${port}" "${ca_name}" register --id.name peer0 --id.secret "${peer_secret}" --id.type peer
  client "${root}" "${port}" "${ca_name}" register --id.name "org${org}admin" --id.secret "${admin_secret}" --id.type admin
  client "${root}" "${port}" "${ca_name}" enroll \
    -u "https://peer0:${peer_secret}@localhost:${port}" \
    -M "${root}/peers/peer0.${domain}/msp"
  cp "${root}/msp/config.yaml" "${root}/peers/peer0.${domain}/msp/config.yaml"
  enroll_tls "${root}" "${port}" "${ca_name}" peer0 "${peer_secret}" \
    "${root}/peers/peer0.${domain}/tls" "peer0.${domain}"
  client "${root}" "${port}" "${ca_name}" enroll \
    -u "https://org${org}admin:${admin_secret}@localhost:${port}" \
    -M "${root}/users/Admin@${domain}/msp"
  cp "${root}/msp/config.yaml" "${root}/users/Admin@${domain}/msp/config.yaml"
}

create_peer_org 1 17054 "${ORG1_PEER_SECRET}" "${ORG1_ADMIN_SECRET}"
create_peer_org 2 19054 "${ORG2_PEER_SECRET}" "${ORG2_ADMIN_SECRET}"

ORG1_HOME="${ORG_ROOT}/peerOrganizations/org1.example.com"
for spec in \
  "benchmark-issuer|${ISSUER_SECRET}|BenchmarkIssuer|app.role=issuer:ecert" \
  "benchmark-reviewer|${REVIEWER_SECRET}|BenchmarkReviewer|app.role=reviewer:ecert" \
  "benchmark-student|${STUDENT_SECRET}|BenchmarkStudent|app.role=student:ecert,subject.hash=${STUDENT_HASH}:ecert"; do
  IFS='|' read -r user secret directory attributes <<<"${spec}"
  client "${ORG1_HOME}" 17054 ca-org1 register --id.name "${user}" --id.secret "${secret}" --id.type client --id.attrs "${attributes}"
  client "${ORG1_HOME}" 17054 ca-org1 enroll \
    -u "https://${user}:${secret}@localhost:17054" \
    -M "${ORG1_HOME}/users/${directory}@org1.example.com/msp"
  cp "${ORG1_HOME}/msp/config.yaml" "${ORG1_HOME}/users/${directory}@org1.example.com/msp/config.yaml"
done

ORDERER_HOME="${ORG_ROOT}/ordererOrganizations/example.com"
mkdir -p "${ORDERER_HOME}"
client "${ORDERER_HOME}" 17055 ca-orderer enroll \
  -u "https://admin:${CA_BOOTSTRAP_SECRET}@localhost:17055" -M "${ORDERER_HOME}/msp"
write_node_ous "${ORDERER_HOME}/msp"
mkdir -p "${ORDERER_HOME}/msp/tlscacerts" "${ORDERER_HOME}/tlsca"
cp "${CA_ROOT}/orderer/ca-cert.pem" "${ORDERER_HOME}/msp/tlscacerts/ca.crt"
cp "${CA_ROOT}/orderer/ca-cert.pem" "${ORDERER_HOME}/tlsca/tlsca.example.com-cert.pem"
client "${ORDERER_HOME}" 17055 ca-orderer register --id.name orderer --id.secret "${ORDERER_SECRET}" --id.type orderer
client "${ORDERER_HOME}" 17055 ca-orderer register --id.name ordererAdmin --id.secret "${ORDERER_ADMIN_SECRET}" --id.type admin
client "${ORDERER_HOME}" 17055 ca-orderer enroll \
  -u "https://orderer:${ORDERER_SECRET}@localhost:17055" \
  -M "${ORDERER_HOME}/orderers/orderer.example.com/msp"
cp "${ORDERER_HOME}/msp/config.yaml" "${ORDERER_HOME}/orderers/orderer.example.com/msp/config.yaml"
mkdir -p "${ORDERER_HOME}/orderers/orderer.example.com/msp/tlscacerts"
cp "${CA_ROOT}/orderer/ca-cert.pem" "${ORDERER_HOME}/orderers/orderer.example.com/msp/tlscacerts/ca.crt"
enroll_tls "${ORDERER_HOME}" 17055 ca-orderer orderer "${ORDERER_SECRET}" \
  "${ORDERER_HOME}/orderers/orderer.example.com/tls" orderer.example.com
client "${ORDERER_HOME}" 17055 ca-orderer enroll \
  -u "https://ordererAdmin:${ORDERER_ADMIN_SECRET}@localhost:17055" \
  -M "${ORDERER_HOME}/users/Admin@example.com/msp"
cp "${ORDERER_HOME}/msp/config.yaml" "${ORDERER_HOME}/users/Admin@example.com/msp/config.yaml"

echo "Generated fresh benchmark-only Fabric identities"
