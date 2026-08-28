# Echoes of the Chain

面向区块链课程大作业与 CCF 大学生区块链技术与创新应用竞赛的学生团队项目。

当前阶段：Iteration 12 统一交付与答辩彩排。真实 Fabric 2.5 LTS 网络、三类属性身份、Fastify Gateway 与四角色 Web 工作台已经贯通；在共享 Docker 故障下，原生双组织 Fabric 继续稳定运行，并新增答辩级前后端预检/启停、7 分钟课程故事线、匿名竞赛材料骨架、证据索引和匿名文本安全门。

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
- `HttpOnly + SameSite=Strict` 短期签名会话、同源检查和 CSRF 防护
- 学生本人属性证书约束的私有成绩读取，响应强制 `Cache-Control: no-store`
- 可信成绩工作台、统一设计 Token、Phosphor 图标与桌面/移动端浏览器视觉验收
- 自托管中文展示字体、完整角色界面系统及不暴露成绩明文的二维码验真入口
- 学生可撤销的限时/限次字段披露授权，令牌明文仅在创建时返回一次
- transient 令牌绑定校验、链上原子消费计数和 `Cache-Control: no-store` 最小字段响应
- UTF-8 CSV 本地预检、批内去重和单笔 Fabric 交易原子批量草稿写入
- Docker 无关的原生 Fabric 启停、双 Peer 一致性查询、冷备份、校验与受保护恢复
- 可重复执行且不重复写链的答辩演示凭证/申诉播种工具
- 只管理项目 PID、从 Git 外私有文件加载认证环境的一键演示预检/启停工具
- 课程与竞赛共用证据索引、7 分钟课程脚本和竞赛匿名文本扫描

## 工程结构

```text
apps/api                    Fastify 业务 API
apps/web                    Vue 3 Web 应用
packages/shared             共享 Schema 与领域类型
chaincode/grade-contract    Hyperledger Fabric 成绩链码
infra/fabric               固定版本的 Fabric 开发网络与部署脚本
design                      产品、架构、安全与阶段设计
reports                     实验、测试与项目进程记录
deliverables                同一项目的课程/竞赛材料编排与演示手册
```

## 本地验证

要求 Node.js 22+ 和 pnpm 11.19.0。

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm delivery:check-anonymity
```

Linux 上启动真实开发账本：

```bash
./infra/fabric/bootstrap.sh
./infra/fabric/pull-images.sh
./infra/fabric/network.sh up
./infra/fabric/network.sh deploy
FABRIC_ENABLED=true CHAINGRADE_PROJECT_ROOT="$PWD" pnpm dev:api
```

启用受控演示认证时，复制 [`.env.example`](.env.example) 的变量到私有 shell 环境，替换所有密码和会话密钥，并设置 `AUTH_ENABLED=true`。正式 HTTPS 部署必须同时设置 `AUTH_SECURE_COOKIE=true`；仓库不会自动加载或保存真实 `.env` 文件。

没有可用 Fabric 网络时，可启动明确标注的进程内演示账本。该模式用于离线演示和 UI 验收，不生成 Fabric 交易证据，也不会在界面中冒充真实链上连接：

```bash
DEMO_ENABLED=true pnpm dev:api
pnpm dev:web
```

启动普通前端与 API（未设置 `FABRIC_ENABLED` 或 `DEMO_ENABLED` 时，业务 API 会返回不可用；Vite 会把 `/api` 代理至本机 3000 端口）：

```bash
pnpm dev:web
pnpm dev:api
```

## 项目资料

- `design/`：阶段设计、总体设计、架构与决策记录
- `reports/`：阶段实验报告、测试记录和项目进程
- `deliverables/`：共同证据、课程答辩、匿名竞赛材料与演示运行手册

## 团队

- 组长：魏子安
- 队员：强璞、阳震

> 注意：竞赛函评材料实行匿名评审，正式竞赛提交物不得包含学校、指导教师或队员身份信息。
