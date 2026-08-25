#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=versions.env
source "${SCRIPT_DIR}/versions.env"

for image in peer orderer ccenv baseos; do
  docker pull "hyperledger/fabric-${image}:${FABRIC_VERSION}"
  docker tag "hyperledger/fabric-${image}:${FABRIC_VERSION}" "hyperledger/fabric-${image}:latest"
done

docker pull "hyperledger/fabric-ca:${CA_VERSION}"
docker tag "hyperledger/fabric-ca:${CA_VERSION}" hyperledger/fabric-ca:latest

peer_version="$(docker run --rm hyperledger/fabric-peer:latest peer version | sed -n 's/^ Version: //p')"
ca_version="$(docker run --rm hyperledger/fabric-ca:latest fabric-ca-client version | sed -n 's/ Version: //p' | head -1)"

if [[ "${peer_version}" != "${FABRIC_VERSION}" || "${ca_version}" != "${CA_VERSION}" ]]; then
  echo "Image version check failed: peer=${peer_version}, ca=${ca_version}" >&2
  exit 1
fi

echo "Pinned Fabric images are ready: peer=${peer_version}, ca=${ca_version}."
