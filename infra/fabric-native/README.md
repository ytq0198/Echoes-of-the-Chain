# Native Fabric fallback

This fallback runs Fabric directly from the pinned binaries already downloaded by `infra/fabric/bootstrap.sh`. It does not access Docker.

```bash
./infra/fabric-native/preflight.sh
./infra/fabric-native/backup-materials.sh
./infra/fabric-native/native-network.sh up
./infra/fabric-native/native-network.sh status
./infra/fabric-native/native-network.sh logs
./infra/fabric-native/native-network.sh down
./infra/fabric-native/deploy-chaincode.sh deploy
./infra/fabric-native/deploy-chaincode.sh status
```

The backup contains peer/orderer/application MSP private keys and therefore remains outside Git with mode `0600`. Docker-owned Fabric CA server internals are deliberately excluded; they are not required to restart the retained nodes. Set `CHAINGRADE_BACKUP_ROOT` only to another directory below `/mnt/localDisk3/weizian`.

The native runtime is written to `.runtime/native-fabric` and is excluded from Git. `up` derives a fresh localhost channel block, starts one Raft orderer and two peers, then joins both peers. It never invokes Docker. Chaincode-as-a-Service lifecycle commands are added separately after the native nodes pass their health checks.

`reset` removes only the validated `.runtime/native-fabric` disposable ledger after stopping managed nodes. It does not touch retained MSP/TLS materials or recovery archives.
