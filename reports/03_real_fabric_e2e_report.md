# Iteration 1 阶段实验：真实 Fabric 与 Gateway 端到端验证

日期：2026-08-25

## 1. 实验范围

在学校服务器允许目录 `/mnt/localDisk3/weizian/Echoes-of-the-Chain` 内，从固定版本工具、CA 身份、通道和链码生命周期开始，验证一条真实的“教师提交—独立复核—查询—哈希验真”链路。

## 2. 环境

- Hyperledger Fabric 2.5.16 LTS
- Fabric CA 1.5.17
- Fabric Gateway Node 1.12.0
- Node.js 24.19.0，pnpm 11.19.0，jq 1.7.1
- `chaingrade` 通道，Org1/Org2，Raft，LevelDB
- 合成凭证：`cred:2026:real01`

服务器无法直连 GitHub 443，因此源码继续由本机生成 Git bundle、SCP 传输并在服务器执行 `git merge --ff-only`；依赖、工具和账本材料始终位于项目目录。

## 3. 链码生命周期结果

- 初始定义 `grade 0.1 / sequence 1` 在 Org1、Org2 均批准并提交。
- 真实验真暴露参数反射问题后，通过标准升级提交 `grade 0.2 / sequence 2`。
- 升级 commit 交易：`13b668f21875b885a7f0d11ff83f39fd9f24d6166656b81a0a8dd4199b509e71`。
- 最终包 ID：`grade_0.2:fb42bd5ef682210d8e5dc21350779c7629c2ab3810a968cc5356839eb7d4bd8d`。
- 实验结束账本高度：11；Org1 peer 上 0.2 链码容器处于运行状态。

## 4. 业务交易结果

### 提交

- HTTP：`POST /api/v1/credentials/drafts` → 201。
- 状态：`PENDING_REVIEW`。
- 详情 hash：`ebc3ed396f7fba90bd55c28ed6233ac446b164bd0cade67435494980cb5e128e`。
- 提交交易：`d6bcbbac4550a3adc5e87d3c5d622945d5d541bc2ce512ffdc8bcace2a9cbb64`。

### 复核

- HTTP：`POST /api/v1/credentials/cred:2026:real01/approve` → 200。
- 状态：`ACTIVE`。
- 复核交易：`52ddff39d5371dcf0c5310b3af422cb7771dbe5f802e1c5ecd155b9b7fd9b5a4`。
- `submittedByIdentityHash` 与 `reviewedByIdentityHash` 不同，证明使用两张独立应用证书。

### 查询与验真

- 读取公开凭证 → 200，未返回成绩明文字段。
- 使用正确 detail hash → `authentic: true, valid: true`。
- 使用错误的 64 位 hash → `authentic: false, valid: true`。

## 5. 自动验证

- 本机类型检查通过。
- 本机 18 项工作区测试通过：共享 Schema 2、链码 12、API 6。
- 本机生产构建通过。
- 服务器类型检查、同 18 项测试和生产构建通过。

## 6. 发现与修复

1. samples Compose 固定写 `latest`：显式拉取锁定版本并在校验后建立本地别名。
2. 服务器缺少 jq/npm：使用项目 `.tools/bin` 和 `.tools/node/bin`，不修改系统目录。
3. samples 清理脚本的 Compose 卷前缀不匹配：wrapper 精确清理本项目 3 个生成卷。
4. pnpm 链接进入链码镜像后失效：新增隔离 staging 与链码专用 npm lockfile。
5. TypeScript 默认参数影响 Fabric Contract API 运行时参数数目：改为显式字符串参数并通过 lifecycle sequence 2 升级。

## 7. 结论与边界

核心签发闭环已从模拟 Context 提升为真实 peer、真实 CA 身份、真实链码容器和真实 Gateway 交易。当前仍是开发拓扑：尚未实现终端登录、页面业务流、结构化 Fabric 错误、PostgreSQL 查询模型，以及真实三组织生产部署，不能描述为完整上线系统。
