#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
NETWORK_ROOT="${PROJECT_ROOT}/.tools/fabric-samples/test-network"
CA_CLIENT="${PROJECT_ROOT}/.tools/fabric-samples/bin/fabric-ca-client"
ORG_ROOT="${NETWORK_ROOT}/organizations/peerOrganizations/org1.example.com"
export FABRIC_CA_CLIENT_HOME="${ORG_ROOT}"

if [[ ! -x "${CA_CLIENT}" || ! -d "${ORG_ROOT}" ]]; then
  echo "Fabric network material is missing. Run network.sh up first." >&2
  exit 1
fi

CA_URL="https://admin:adminpw@localhost:7054"
CA_TLS_CERT="${NETWORK_ROOT}/organizations/fabric-ca/org1/tls-cert.pem"
STUDENT_HASH="$(printf '%s' 'chaingrade-demo-student-v1' | sha256sum | cut -d ' ' -f 1)"

register_identity() {
  local name="$1"
  local secret="$2"
  local attributes="$3"
  local output

  if output="$("${CA_CLIENT}" register --id.name "${name}" --id.secret "${secret}" \
    --id.type client --id.attrs "${attributes}" --tls.certfiles "${CA_TLS_CERT}" 2>&1)"; then
    printf '%s\n' "${output}"
  elif [[ "${output}" == *"already registered"* ]]; then
    echo "Identity ${name} is already registered; continuing."
  else
    printf '%s\n' "${output}" >&2
    return 1
  fi
}

enroll_identity() {
  local name="$1"
  local secret="$2"
  local directory_name="$3"
  local msp_path="${ORG_ROOT}/users/${directory_name}@org1.example.com/msp"

  if [[ ! -d "${msp_path}/signcerts" ]]; then
    "${CA_CLIENT}" enroll -u "https://${name}:${secret}@localhost:7054" \
      --caname ca-org1 --mspdir "${msp_path}" --tls.certfiles "${CA_TLS_CERT}"
    cp "${ORG_ROOT}/msp/config.yaml" "${msp_path}/config.yaml"
  fi
}

register_identity cgissuer cgissuerpw 'app.role=issuer:ecert'
register_identity cgreviewer cgreviewerpw 'app.role=reviewer:ecert'
register_identity cgstudent cgstudentpw "app.role=student:ecert,subject.hash=${STUDENT_HASH}:ecert"

enroll_identity cgissuer cgissuerpw ChaingradeIssuer
enroll_identity cgreviewer cgreviewerpw ChaingradeReviewer
enroll_identity cgstudent cgstudentpw ChaingradeStudent

echo "Application identities enrolled. Demo student subjectHash: ${STUDENT_HASH}"
