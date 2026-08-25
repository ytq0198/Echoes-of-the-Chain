# 系统架构设计 v0.1

日期：2026-08-25

## 1. 总体架构

```text
教师/复核员工作台 ─┐
学生凭证钱包 ──────┼─> Web (Vue 3) ─> API (Fastify) ─> Fabric Gateway
公开验证页 ────────┘          │               │
                              │               ├─> Fabric 多组织网络
                              │               │   ├─ 公共状态/审计事实
                              │               │   └─ 私有数据集合
                              │               ├─> PostgreSQL
                              │               └─> 加密对象存储（后续）
                              └─> 二维码/可验证展示
```

## 2. Fabric 拓扑

首个可运行网络使用三个模拟组织：

- `UniversityA`：课程教师与院系复核员。
- `UniversityB`：模拟跨校签发与后续互认。
- `VerifierOrg`：可信签发者注册、审计和跨组织验证。

网络包含一个应用通道、每组织至少一个 peer、Raft orderer 和 CouchDB。开发环境可使用单 orderer；演示/基准环境扩展为三 orderer，避免把单节点演示误称为高可用。

链码级默认背书由教育组织共同批准安装；单条凭证的关键状态转换通过身份属性和状态级背书进一步约束。成绩与申诉详情使用 Fabric 的 `_implicit_org_<MSPID>` 每组织隐式私有集合隔离，避免 UniversityA 与 UniversityB 默认读取彼此明文；公共状态仍可被联盟共同核验。

## 3. 组件职责

| 组件                       | 职责                                               |
| -------------------------- | -------------------------------------------------- |
| `apps/web`                 | 多角色 UI、表单校验、凭证钱包与公开验证页          |
| `apps/api`                 | 鉴权、业务编排、Fabric Gateway、披露授权、链下查询 |
| `packages/shared`          | API DTO、Zod Schema、领域枚举和错误码              |
| `chaincode/grade-contract` | 凭证/申诉状态机、角色约束、承诺验证和不可变版本链  |
| `infra/fabric`             | 网络配置、证书、通道、链码部署和本地开发脚本       |
| `tests/e2e`                | 浏览器与真实网络端到端测试                         |
| `benchmarks`               | Caliper 配置与可复现实验负载                       |

## 4. 凭证状态机

```text
PENDING_REVIEW ──approve──> ACTIVE ──revoke──> REVOKED
       │                       │
       └────reject────> REJECTED
                               └─approved amendment──> SUPERSEDED
```

- 修订创建新的 `PENDING_REVIEW` 凭证并引用旧凭证。
- 修订通过时同一交易内激活新版本并将旧版本改为 `SUPERSEDED`。
- 终态记录不得恢复或覆盖。

## 5. 申诉状态机

```text
OPEN ──review(ACCEPTED)──> RESOLVED_ACCEPTED ──> 新修订流程
  └────review(REJECTED)──> RESOLVED_REJECTED
```

申诉通过只表示允许更正，不直接改变成绩，避免绕过复核职责分离。

## 6. 关键技术选择

- TypeScript 单仓库降低三人协作和 DTO 漂移成本。
- Fabric 2.5 链码/客户端生态成熟；网络版本在部署尖峰后锁定具体补丁号。
- Fastify 提供轻量 API 与 JSON Schema 生态，避免首版引入过重框架。
- PostgreSQL 只保存可重建的业务索引、授权和用户界面状态；链上状态为凭证有效性的权威来源。
- 所有链码时间使用 Fabric 交易时间戳，禁止使用各 peer 的本地系统时间。
- 密码学输入采用确定性序列化；首版承诺哈希为明确版本化结构，后续可替换为标准 VC 证明。

## 7. 部署边界

- 本机用于编辑、单测、静态检查和前端预览。
- 学校服务器在 `/mnt/localDisk3/weizian/Echoes-of-the-Chain` 中运行容器化 Fabric 和全栈服务。
- 不修改服务器其他目录，不依赖系统级 Node/Go，不在仓库保存生成的生产证书或私钥。
