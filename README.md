# Echoes of the Chain

面向区块链课程大作业与 CCF 大学生区块链技术与创新应用竞赛的学生团队项目。

当前阶段：Iteration 0 架构与链码技术尖峰。项目实现基于 Hyperledger Fabric 的完整 B/S 应用，并在同一产品主线上持续增强安全、隐私和真实场景价值。

课程答辩和 CCF 竞赛提交始终对应同一个项目、同一仓库和同一套架构；课程验收只是连续开发过程中的一个里程碑。

## 当前能力

- 成绩草稿通过 transient data 写入签发组织的隐式私有集合
- 教师提交与院系复核职责分离
- 不可覆盖的成绩修订和版本链
- 凭证撤销、状态核验
- 学生本人申诉及复核结论留痕
- Fastify API 与 Vue 3 响应式产品首页骨架

## 工程结构

```text
apps/api                    Fastify 业务 API
apps/web                    Vue 3 Web 应用
packages/shared             共享 Schema 与领域类型
chaincode/grade-contract    Hyperledger Fabric 成绩链码
design                      产品、架构、安全与阶段设计
reports                     实验、测试与项目进程记录
```

## 本地验证

要求 Node.js 22+ 和 pnpm 11.19.0。

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

启动当前前端与 API 骨架：

```bash
pnpm dev:web
pnpm dev:api
```

## 项目资料

- `design/`：阶段设计、总体设计、架构与决策记录
- `reports/`：阶段实验报告、测试记录和项目进程

## 团队

- 组长：魏子安
- 队员：强璞、阳震

> 注意：竞赛函评材料实行匿名评审，正式竞赛提交物不得包含学校、指导教师或队员身份信息。
