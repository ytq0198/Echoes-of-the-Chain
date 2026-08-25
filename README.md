# Echoes of the Chain

面向区块链课程大作业与 CCF 大学生区块链技术与创新应用竞赛的学生团队项目。

当前阶段：Iteration 2 修订与申诉闭环。真实 Fabric 2.5 LTS 网络、三类属性身份、链码生命周期、Fastify Gateway 与四角色 Web 工作台已经贯通；成绩修订、学生本人申诉和隐私复核结论均已通过真实账本验证。

课程答辩和 CCF 竞赛提交始终对应同一个项目、同一仓库和同一套架构；课程验收只是连续开发过程中的一个里程碑。

## 当前能力

- 成绩草稿通过 transient data 写入签发组织的隐式私有集合
- 教师提交与院系复核职责分离
- 不可覆盖的成绩修订和版本链
- 凭证撤销、状态核验
- 学生本人申诉及复核结论留痕
- Vue 3 响应式产品首页与教师、复核员、学生、公开验证者四类工作台
- 真实 Fabric Gateway 成绩提交、复核、读取与哈希验真 API
- 成绩修订的原子版本替换，以及基于学生证书属性的轻量申诉闭环
- Fabric peer 业务错误到稳定 HTTP 错误码的安全映射

## 工程结构

```text
apps/api                    Fastify 业务 API
apps/web                    Vue 3 Web 应用
packages/shared             共享 Schema 与领域类型
chaincode/grade-contract    Hyperledger Fabric 成绩链码
infra/fabric               固定版本的 Fabric 开发网络与部署脚本
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

Linux 上启动真实开发账本：

```bash
./infra/fabric/bootstrap.sh
./infra/fabric/pull-images.sh
./infra/fabric/network.sh up
./infra/fabric/network.sh deploy
FABRIC_ENABLED=true CHAINGRADE_PROJECT_ROOT="$PWD" pnpm dev:api
```

启动前端与 API（Vite 会把 `/api` 代理至本机 3000 端口）：

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
