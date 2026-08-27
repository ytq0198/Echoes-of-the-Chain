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
./infra/fabric-native/ledger-info.sh
.tools/node/bin/corepack pnpm --filter @chaingrade/api seed:native
```

首次安装使用 `deploy`；以后在账本重启后使用 `start`，它只连接既有链码定义，
不会重复执行生命周期提交。`deploy` 本身也会检测已提交定义，因此可安全重复执行。
播种命令会确保固定演示凭证为 `ACTIVE`，并确保其轻量申诉为 `OPEN`；重复执行只校验
公共承诺、私有成绩可读性和验真结论，不重复创建交易。

## 账本冷备份与恢复

```bash
./infra/fabric-native/backup-runtime.sh
./infra/fabric-native/verify-backup.sh \
  /mnt/localDisk3/weizian/chaingrade-backups/native-ledger-<UTC>.tar.gz
```

备份脚本会短暂停止链码、Peer 与 Orderer，生成 SHA-256 校验文件，验证归档路径，
随后按原状态重启网络并核对双组织账本。恢复是受保护操作，只有传入显式确认参数才执行：

```bash
./infra/fabric-native/restore-runtime.sh \
  /mnt/localDisk3/weizian/chaingrade-backups/native-ledger-<UTC>.tar.gz \
  --confirm-restore
```

恢复前的运行目录不会删除，而会移动到带 UTC 时间戳的
`.runtime/native-fabric.pre-restore-*` 目录，以便人工回退。

The backup contains peer/orderer/application MSP private keys and therefore remains outside Git with mode `0600`. Docker-owned Fabric CA server internals are deliberately excluded; they are not required to restart the retained nodes. Set `CHAINGRADE_BACKUP_ROOT` only to another directory below `/mnt/localDisk3/weizian`.

The native runtime is written to `.runtime/native-fabric` and is excluded from Git. `up` derives a fresh localhost channel block, starts one Raft orderer and two peers, then joins both peers. It never invokes Docker. Chaincode-as-a-Service lifecycle commands are added separately after the native nodes pass their health checks.

`reset` removes only the validated `.runtime/native-fabric` disposable ledger after stopping managed nodes. It does not touch retained MSP/TLS materials or recovery archives.
