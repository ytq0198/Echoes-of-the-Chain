# Iteration 10 阶段实验：无 Docker 原生 Fabric 恢复

日期：2026-08-27

## 1. 阶段目标

学校服务器共享 Docker data-root 持续出现 `layer does not exist`，且旧容器、镜像和 named volumes 不可见。本阶段不清理共享 Docker，也不把故障作为项目停工条件，而是在同一 ChainGrade 仓库中建立完全位于 `/mnt/localDisk3/weizian` 的原生 Fabric 备用运行方式。

恢复网络用于同一个课程大作业与竞赛项目，不改变产品、链码状态机或四角色界面。旧 Docker 账本 transaction ID 无法伪造恢复；本报告记录的是新恢复网络产生的真实 Fabric 证据。

## 2. 恢复资产与安全边界

服务器保留 Fabric 2.5.16 的 `peer`、`orderer`、`osnadmin`、`configtxgen` 和 CCAAS builder，以及 Org1、Org2、Orderer MSP/TLS 与应用身份。TLS SAN 包含 `localhost`，所需端口空闲，项目分区剩余约 1.8 TB。

恢复材料已归档到：

```text
/mnt/localDisk3/weizian/chaingrade-backups/
fabric-recovery-materials-20260827T111947Z.tar.gz
```

归档权限为 `0600`，SHA-256 校验通过。Docker-owned CA server 内部私钥因权限不可读且不是节点重启必需材料，因此明确排除。

## 3. 原生网络实现

运行拓扑：

```text
orderer 127.0.0.1:7050 / admin 7053
  ├── peer0.org1 127.0.0.1:7051 / chaincode 7052
  └── peer0.org2 127.0.0.1:9051 / chaincode 9052
                     │
                     └── grade Node.js CCAAS 127.0.0.1:9999
```

- orderer、peer 数据、LevelDB、snapshot、WAL、日志和 PID 均写入 `.runtime/native-fabric`；
- localhost 通道区块只在首次启动生成，重启不覆盖，避免 genesis hash 分叉；
- CCAAS 包固定文件顺序、mtime、owner 和 group，保证 package ID 可重复；
- `reset` 只允许删除解析后精确等于项目 `.runtime/native-fabric` 的一次性运行目录；
- 原 MSP/TLS、恢复归档和 Docker data-root 不在删除范围；
- 外部 Node.js 链码由 `fabric-chaincode-node server` 运行，不调用 Docker daemon。

调试阶段曾发现两项真实问题：首次 peer snapshot 默认写 `/var/hyperledger` 导致权限拒绝；重复生成 genesis block 导致 peer 检测 PreviousHash 不一致并退出。前者通过 `CORE_LEDGER_SNAPSHOTS_ROOTDIR` 定向到用户目录修复，后者通过稳定区块与一次性重建失败运行目录修复。最终日志无 panic。

## 4. 链码生命周期证据

原生网络提交结果：

```text
Committed chaincode definition for chaincode 'grade' on channel 'chaingrade':
Version: 0.9, Sequence: 1,
Approvals: [Org1MSP: true, Org2MSP: true]
```

commit transaction：

```text
49133981b086c9ffddcc8ef4de41fbd9d771831eb7c019ca5a5060a50d57fb22
```

两个 peer 均报告 `VALID`。最终区块状态：

| 节点      | Height | Current block hash                             | Previous block hash                            |
| --------- | -----: | ---------------------------------------------- | ---------------------------------------------- |
| Org1 peer |      9 | `8Z+CBx1ohkXkCoe9eNnaSsm3nx+qxCBQgr4t6h+M22A=` | `5e9bw7rivpuIP8ZQ5ptUXuSqIaymjW7SwZBGCM72RK4=` |
| Org2 peer |      9 | `8Z+CBx1ohkXkCoe9eNnaSsm3nx+qxCBQgr4t6h+M22A=` | `5e9bw7rivpuIP8ZQ5ptUXuSqIaymjW7SwZBGCM72RK4=` |

## 5. 真实 Gateway 业务验收

临时 Gateway API 只监听服务器 `127.0.0.1:3101`，以 `ledgerMode=fabric` 运行；验收完成后已停止，不留下无认证服务。

单条闭环：

| 操作              | 结果                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| issuer 创建草稿   | HTTP 201，真实 transaction ID `e83ea7ee5658706be649e7ee9bc5e8c10d5f21ca4ce9ee57e16c520d73edcb2f`           |
| reviewer 独立批准 | HTTP 200，状态 `ACTIVE`，transaction ID `c7f5827e87f1a1964e89d38b8621aa255f5aa3369f9853422a48c5e92becf7a7` |
| 公开验真          | HTTP 200，`valid=true`，状态 `ACTIVE`                                                                      |

0.9 原子批量闭环：

| 用例                        | 结果                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| 两条合法记录                | HTTP 201，`importedCount=2`                                                     |
| 交易一致性                  | 两条记录共享 `fe1cd817308b9a18fb4375a9f53f99c97f9ec9cc1e971f66b4fef11a378c0cce` |
| 私有内容扫描                | 响应不含盐值或 private text                                                     |
| 新记录 + 已存在记录混合批次 | HTTP 409 `ALREADY_EXISTS`                                                       |
| 冲突后查询批内新记录        | HTTP 404 `NOT_FOUND`，无部分写入                                                |

## 6. 结论与后续

Docker 故障已不再阻塞项目：ChainGrade 现在有一套可重复、真实、双组织、无容器的 Fabric 2.5.16 运行路径，且 grade 0.9 原子批处理已取得真实链上证据。旧账本历史仍不可声称恢复，但业务场景与后续演示数据可以在新网络重新播种。

下一步是在该网络上增加确定性演示数据播种和运行态备份/恢复脚本，并用启用角色会话的 API/Web 完成浏览器复验。Docker 修复后可保留容器网络作为第二部署方式，不再是唯一依赖。
