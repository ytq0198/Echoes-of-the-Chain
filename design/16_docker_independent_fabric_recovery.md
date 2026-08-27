# Docker 无关的 Fabric 恢复设计

日期：2026-08-27

## 1. 背景与目标

学校服务器 Docker data-root `/mnt/localDisk3/docker-data` 的 BuildKit/overlay2 元数据持续返回 `layer does not exist`。本项目不清理共享 data-root，也不等待该故障作为继续开发的前置条件。

备用方案在同一 ChainGrade 仓库内直接运行 Fabric 2.5.16 的 orderer、两个 peer 和 Node.js Chaincode-as-a-Service。所有新增账本、私有数据、日志、PID 与备份都位于 `/mnt/localDisk3/weizian`，不读写服务器其他用户目录。

## 2. 已确认的恢复资产

- `peer`、`orderer`、`osnadmin`、`configtxgen` 和 Fabric CA 原生二进制；
- Org1、Org2、Orderer MSP/TLS 与三类应用身份，共 214 个材料文件；
- `chaingrade.block` 和现有通道配置导出；
- TLS 证书 SAN 同时包含节点域名和 `localhost`；
- 7050、7051、7052、7053、9051、9052、9443–9445、9999 端口当前空闲；
- 用户目录所在分区仍有约 1.8 TB 可用空间。

## 3. 目标拓扑

```text
orderer (7050/7053)
  ├── peer0.org1 (7051/7052)
  └── peer0.org2 (9051/9052)
             │
             └── grade 0.9 Node.js CCAAS (9999)
```

peer 使用 LevelDB；外部构建器只发布 `connection.json`，Node 链码通过 `fabric-chaincode-node server` 运行。该模式是 Fabric 2.x 官方能力，不要求 Docker daemon。

## 4. 数据恢复边界

旧 Docker volume 未恢复时，无法重建原 transaction ID、区块时间与完整区块历史。可以复用身份并重新创建通道，然后由确定性播种脚本重新生成课程演示所需的凭证、复核、修订、申诉、撤销和披露场景。新结果必须表述为“恢复网络上的新交易证据”，不得冒充旧账本历史。

## 5. 安全步骤

1. 对 MSP/TLS 和通道材料制作 `0600` 权限的校验归档；
2. 预检二进制、端口、证书、通道区块和磁盘空间；
3. 在 `.runtime/native-fabric` 中生成节点专用配置和数据目录；
4. 启动 orderer、双 peer，加入新通道；
5. 部署 CCAAS 链码并执行真实 E2E；
6. 增加停止、状态、备份、恢复与确定性播种命令；
7. UI 截图和报告明确标记真实原生 Fabric 运行模式。

任何步骤失败都保留日志，不回退到清理共享 Docker。
