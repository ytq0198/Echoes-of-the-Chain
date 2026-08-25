#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
# shellcheck source=versions.env
source "${SCRIPT_DIR}/versions.env"

TOOLS_ROOT="${PROJECT_ROOT}/.tools"
SAMPLES_ROOT="${TOOLS_ROOT}/fabric-samples"
DOWNLOAD_ROOT="${TOOLS_ROOT}/downloads"
ARCH="$(uname -m)"

if [[ "${ARCH}" != "x86_64" ]]; then
  echo "Unsupported architecture: ${ARCH}. This bootstrap currently targets linux-amd64." >&2
  exit 1
fi

mkdir -p "${DOWNLOAD_ROOT}"

download() {
  local url="$1"
  local output="$2"
  if [[ ! -f "${output}" ]]; then
    curl --fail --location --retry 3 --output "${output}.part" "${url}"
    mv "${output}.part" "${output}"
  fi
}

SAMPLES_ARCHIVE="${DOWNLOAD_ROOT}/fabric-samples-${FABRIC_SAMPLES_COMMIT}.tar.gz"
FABRIC_ARCHIVE="${DOWNLOAD_ROOT}/hyperledger-fabric-linux-amd64-${FABRIC_VERSION}.tar.gz"
CA_ARCHIVE="${DOWNLOAD_ROOT}/hyperledger-fabric-ca-linux-amd64-${CA_VERSION}.tar.gz"
JQ_BINARY="${DOWNLOAD_ROOT}/jq-linux-amd64-${JQ_VERSION}"

download \
  "https://github.com/hyperledger/fabric-samples/archive/${FABRIC_SAMPLES_COMMIT}.tar.gz" \
  "${SAMPLES_ARCHIVE}"
download \
  "https://github.com/hyperledger/fabric/releases/download/v${FABRIC_VERSION}/hyperledger-fabric-linux-amd64-${FABRIC_VERSION}.tar.gz" \
  "${FABRIC_ARCHIVE}"
download \
  "https://github.com/hyperledger/fabric-ca/releases/download/v${CA_VERSION}/hyperledger-fabric-ca-linux-amd64-${CA_VERSION}.tar.gz" \
  "${CA_ARCHIVE}"
download \
  "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-linux-amd64" \
  "${JQ_BINARY}"

if [[ ! -d "${SAMPLES_ROOT}/test-network" ]]; then
  temporary_root="$(mktemp -d "${TOOLS_ROOT}/fabric-samples.XXXXXX")"
  trap 'rm -rf -- "${temporary_root}"' EXIT
  tar -xzf "${SAMPLES_ARCHIVE}" --strip-components=1 -C "${temporary_root}"
  mv "${temporary_root}" "${SAMPLES_ROOT}"
  trap - EXIT
fi

tar -xzf "${FABRIC_ARCHIVE}" -C "${SAMPLES_ROOT}"
tar -xzf "${CA_ARCHIVE}" -C "${SAMPLES_ROOT}"
mkdir -p "${TOOLS_ROOT}/bin"
cp "${JQ_BINARY}" "${TOOLS_ROOT}/bin/jq"
chmod 0755 "${TOOLS_ROOT}/bin/jq"

echo "Fabric ${FABRIC_VERSION}, Fabric CA ${CA_VERSION}, and samples ${FABRIC_SAMPLES_COMMIT} are ready."
