# Fabric 真实网络与 Gateway 集成设计 v0.1

日期：2026-08-25

## 1. 设计目标

课程答辩与竞赛使用同一个 ChainGrade 产品。本阶段把已通过模拟测试的领域链码部署到真实 Hyperledger Fabric，并打通浏览器后端到链上交易的最短可信路径；后续页面、修订、申诉和隐私增强均在该路径上迭代。

## 2. 当前开发拓扑

| 层次 | 当前实现 | 连续演进方向 |
| --- | --- | --- |
| Fabric | 2.5.16 LTS，Org1/Org2，各 1 peer，单 Raft orderer | 竞赛部署扩展为学校/院系/监督方三组织与多节点 |
| 通道 | `chaingrade` | 保持领域通道名称，按部署环境调整组织成员 |
| 状态库 | LevelDB | 出现富查询需求后增加 CouchDB 索引 |
| CA | Fabric CA 1.5.17 | 接入正式密钥托管、轮换和吊销策略 |
| 链码 | `grade`，TypeScript | 同一链码通过 lifecycle sequence 连续升级 |
| API | Fastify + Fabric Gateway 1.12 | 增加会话认证、错误映射、审计和限流 |

官方 test-network 仅作为开发与演示拓扑，不作为生产就绪声明。

## 3. 身份与职责

- `ChaingradeIssuer@org1.example.com`：证书含 `app.role=issuer`，提交成绩草稿。
- `ChaingradeReviewer@org1.example.com`：证书含 `app.role=reviewer`，独立复核。
- `ChaingradeStudent@org1.example.com`：证书含 `app.role=student` 与合成 `subject.hash`，供下一阶段学生查询/申诉使用。
- API 按业务动作选择身份连接，不允许请求方直接指定任意 MSP 私钥路径。

当前身份口令和 test-network CA 只用于开发演示，严禁用于正式部署。

## 4. 数据路径

1. API 用递归键排序生成成绩详情的 canonical JSON。
2. API 计算 SHA-256，公共记录只携带 `detailHash`、匿名化学生/课程 hash、状态和审计字段。
3. 详情字节通过 transient data 传给 `CreateCredentialDraft`。
4. 链码复算 hash，并把详情写入签发组织 `_implicit_org_Org1MSP`；公共账本写入待复核记录。
5. reviewer 以不同证书执行 `ApproveCredential`，链码同时校验角色、组织和禁止自审规则。
6. 公开验真调用 `VerifyCredential(credentialId, expectedDetailHash)`，仅返回真实性与有效状态，不返回成绩详情。

## 5. 生命周期与背书

当前开发策略为 `OR('Org1MSP.peer','Org2MSP.peer')`。它允许 Org1 对自身隐式私有集合完成背书，而不要求把成绩明文发送给 Org2。双组织仍需分别批准链码定义。

竞赛拓扑将评估按记录设置 state-based endorsement：成绩签发与修订由签发学校/院系共同约束，监督方只验证公共状态与审计承诺。该增强不能破坏隐式集合的数据隔离。

## 6. 可复现与安全边界

- 版本统一记录于 `infra/fabric/versions.env`。
- 镜像使用显式版本拉取，校验容器内版本后才建立 samples 所需的本地 `latest` 别名。
- jq、Node、pnpm、samples、证书和 staging 均位于仓库 `.tools/`，不依赖服务器系统安装。
- staging 只复制 manifest、lockfile、TypeScript 配置和源码，避免 pnpm 符号链接进入链码镜像。
- 所有测试数据均为合成值；运行证书、私钥、账本卷和下载物不进入 Git。

## 7. 下一阶段接口扩展

- 把 `CreateAmendmentDraft`、`RejectCredential`、`RevokeCredential` 与申诉交易接入 Gateway API。
- 引入面向四类角色的会话身份映射，禁止由前端传文件路径或 Fabric 身份名。
- 将 Fabric gRPC/链码错误转换为稳定业务错误码。
- 完成教师录入、复核队列、学生凭证和公开验证页面的浏览器 E2E。
