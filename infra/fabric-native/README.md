# Native Fabric fallback

This fallback runs Fabric directly from the pinned binaries already downloaded by `infra/fabric/bootstrap.sh`. It does not access Docker.

```bash
./infra/fabric-native/preflight.sh
./infra/fabric-native/backup-materials.sh
```

The backup contains private MSP keys and therefore remains outside Git with mode `0600`. Set `CHAINGRADE_BACKUP_ROOT` only to another directory below `/mnt/localDisk3/weizian`.

Orderer, peer, channel lifecycle and Chaincode-as-a-Service commands will be added after the preflight and recovery archive pass on the school server.
