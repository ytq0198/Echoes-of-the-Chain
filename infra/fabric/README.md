# ChainGrade Fabric development network

This directory provisions the real ledger used by both the course-delivery milestone and the competition milestone. It is one product and one repository; the official Fabric test network is only the current development topology.

## Pinned stack

- Hyperledger Fabric 2.5.16 LTS
- Fabric CA 1.5.17
- Fabric samples commit recorded in `versions.env`
- Two peer organizations, Raft ordering, LevelDB, channel `chaingrade`

## Commands

Run from the repository root on Linux:

```bash
./infra/fabric/bootstrap.sh
./infra/fabric/pull-images.sh
./infra/fabric/network.sh up
./infra/fabric/network.sh deploy
./infra/fabric/network.sh status
```

For an in-place chaincode upgrade, increment both lifecycle values, for example:

```bash
CHAINCODE_VERSION=0.4 CHAINCODE_SEQUENCE=4 ./infra/fabric/network.sh deploy
```

To stop and remove only this test network's generated containers and material:

```bash
./infra/fabric/network.sh down
```

`up` also enrolls three development identities (issuer, reviewer, and student) with certificate attributes. Their fixed passwords and the official test-network CA are strictly for local/server demonstrations, never production deployment.

The development endorsement policy is `OR('Org1MSP.peer','Org2MSP.peer')`. This permits an Org1 issuer to write its implicit private collection without disclosing the private grade payload to Org2. The competition topology will replace this with per-record/state-based endorsement and organization-specific access policies.

LevelDB is sufficient for the current key-based credential workflow and keeps the reproducible development environment small. A CouchDB index is deferred until rich-query requirements are introduced.

Deployment copies only the chaincode manifest, lockfile, TypeScript config, and source into `.tools/chaincode-stage`. This prevents pnpm workspace symlinks from leaking into Fabric's isolated npm chaincode image.
