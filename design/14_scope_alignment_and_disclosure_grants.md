# 范围校准与限时披露授权设计

日期：2026-08-27

## 1. 偏航审计

### 1.1 不变目标

ChainGrade 仍是一个基于 Hyperledger Fabric 的学生成绩存证、查询、修订与验证应用。课程答辩和 CCF 竞赛使用同一个仓库、领域模型、部署体系与界面，不创建课程版/竞赛版分叉。

### 1.2 已完成主线

- 成绩草稿、独立复核、驳回、撤销和不可变修订；
- 学生本人私有成绩读取与轻量申诉；
- 角色会话、CSRF、Fabric 属性证书和公共验真；
- 角色化链上任务队列、二维码入口与统一响应式界面；
- 真实双组织 Fabric lifecycle 和浏览器 E2E。

### 1.3 当前缺口

现有二维码只携带凭证标识与详情哈希，能够证明凭证状态与承诺一致，却没有实现产品需求 Epic E 中的“学生选择字段、用途、验证者、过期时间和最大使用次数”。因此它应被称为公开验真入口，而不能被表述为完整的最小披露授权。

M3 仍缺 CSV 导入、限时授权、部署健康检查、完整交付材料；M4 的 BBS+/匿名凭证、跨机构互认和 Caliper 尚未开始。按照课程实用度/完整性 60% 的权重和方向 A 的隐私主张，应先补限时披露，再进入高级密码学。

## 2. 本阶段边界

本阶段实现可运行的 bearer capability：学生为自己的 ACTIVE 凭证创建授权，选择可披露字段，并限制用途、验证者、过期时间和使用次数；持有授权令牌的验证者消费一次授权后获得被选字段。

本阶段不声称实现不可链接匿名凭证，也不自研零知识证明。Bearer token 方案是 M3 的产品闭环，BBS+/AnonCreds 仍属于同一项目后续 M4 技术尖峰。

## 3. 数据模型

公共世界状态 `disclosure:<grantId>`：

```text
docType              gradeDisclosureGrant
grantId              学生指定的唯一标识
credentialId         关联凭证
subjectHash          学生匿名标识
issuerMspId          签发组织
tokenHash            随机令牌 SHA-256
purposeHash          规范化用途 SHA-256
verifierHash         规范化验证者 SHA-256
selectedFields       courseName | score | grade 的非空子集
expiresAt            ISO 8601 UTC
maxUses / usedCount  1..10 / 已消费次数
status               ACTIVE | CONSUMED | REVOKED
createdAt/updatedAt   Fabric 确定性时间
transactionId        最近状态交易
```

公共记录不包含令牌明文、用途明文、验证者明文或成绩值。令牌使用 32 字节密码学随机数，只在创建 API 响应中返回一次。

## 4. 交易与权限

### CreateDisclosureGrant

- 仅 `app.role=student`；
- 关联凭证必须为本人、同组织且为 ACTIVE；
- 过期时间必须晚于交易时间且不超过 30 天；
- `maxUses` 为 1–10；
- 禁止选择 `salt` 或任意未批准字段；
- 建立 `disclosure~subject` 复合键索引。

### ConsumeDisclosureGrant

- 由公开 API 使用受控 Gateway 身份提交；
- token、purpose、verifier 通过 transient data 进入背书节点；
- 链码分别计算哈希并与公共承诺比对；
- 授权必须 ACTIVE、未过期、未耗尽，关联凭证仍须 ACTIVE；
- 成功后原子增加 `usedCount`，达到上限时状态变为 CONSUMED；
- 交易只返回更新后的公共授权记录，不返回成绩明文。

API 先以相同 transient 授权调用只读 `EvaluateDisclosureGrant`；链码完成令牌、用途、验证者、期限、次数和凭证状态校验后，直接从隐式私有集合筛出 `selectedFields`。随后 API 提交 `ConsumeDisclosureGrant` 原子增加使用次数，只有消费成功才返回先前得到的最小字段。响应使用 `Cache-Control: no-store`。成绩不会进入公共交易参数、世界状态或提交交易的链码响应，错误令牌也不会触发私有成绩读取。

### RevokeDisclosureGrant / ListMyDisclosureGrants

- 仅授权所属学生可撤销或列出；
- 已 CONSUMED 或 REVOKED 的授权不能再次撤销；
- 凭证被撤销或替代后，即使授权记录仍为 ACTIVE，消费交易也必须失败。

## 5. API

- `POST /api/v1/credentials/:credentialId/disclosures`：学生创建授权；返回 `{ grant, token }`。
- `GET /api/v1/disclosures/mine`：学生查看本人授权历史。
- `POST /api/v1/disclosures/:grantId/revoke`：学生主动撤销。
- `POST /api/v1/disclosures/:grantId/consume`：公开验证者提交 token、purpose、verifier，返回最小字段与公共审计结果。

创建与撤销要求 student 会话、同源和 CSRF；消费接口无需登录，但有严格输入长度、链码状态机与次数限制。

## 6. UI

学生凭证页把“生成验真入口”拆分为：

1. 公共验真：只验证状态与详情哈希，不披露成绩；
2. 授权披露：选择字段、用途、验证者、有效期和次数，生成只显示一次的链接/二维码；
3. 授权历史：查看 ACTIVE、CONSUMED、REVOKED，并可撤销 ACTIVE 授权。

公开验证页增加授权消费区，明确列出披露字段、授权状态、剩余次数和凭证有效性。失败信息不得暴露令牌是否存在以外的额外私有信息。

## 7. 验收与防偏航门

- 共享 Schema、链码、API 先写失败测试再实现；
- 真实 Fabric 验证创建、一次消费、超限、过期、错误用途/验证者、撤销和凭证失效；
- 检查公共账本不含令牌、用途、验证者和成绩明文；
- 桌面 1280×720 以上与移动 390×844 完成 UI 视觉验收并嵌入阶段报告；
- 阶段结束再次回答三个问题：是否仍服务成绩存证/查询，是否形成真实可演示闭环，是否避免提前进入 M4 高风险扩展。
