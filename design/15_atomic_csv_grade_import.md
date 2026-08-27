# 原子 CSV 成绩批量导入设计

日期：2026-08-27

## 1. 范围与防跑偏结论

本阶段补齐 M3“成绩管理应用”的批量录入能力，仍服务于教师签发、独立复核、学生持有与公开验证的同一条业务链。它不会建立独立的教务系统，也不会提前进入 BBS+、跨校互认或复杂密码学证明。

选择本阶段的原因：真实课程成绩通常按教学班批量产生；如果只能逐条填写，产品虽然能证明链路可行，却不足以支撑课程答辩中的实际管理场景。批量导入同时能展示 Fabric 单笔交易的原子性，而不是用 API 循环伪装批处理。

## 2. 输入格式

教师端接受 UTF-8 CSV 文本，固定表头：

```text
credentialId,subjectHash,courseHash,courseName,score,grade,schemaVersion,salt
```

约束：

- 每批 1–50 条；
- `credentialId` 在批内唯一，且账本中不能已存在；
- 学生与课程只接收 64 位小写 SHA-256，不接收学号、姓名或课程明文标识；
- 分数为 0–100，等级长度为 1–16；
- 每行盐值至少 16 字符；
- 支持 BOM、CRLF、带逗号的双引号字段和 `""` 转义；
- 任一行解析或 Schema 校验失败时不允许提交。

CSV 只在浏览器内解析为结构化请求；API 不保存原始文件或原始 CSV 文本。

## 3. 原子交易设计

新增链码交易 `CreateCredentialBatch`：

1. 公开参数 `batchJson` 只包含 credentialId、subjectHash、courseHash、detailHash 和 schemaVersion；
2. transient key `gradeBatch` 包含按 credentialId 索引的规范化私有详情 Base64；
3. 链码先完成角色、条数、批内重复、标识、哈希、账本重复和每条私有详情哈希校验；
4. 全部预检通过后，才写公共状态、状态/主体复合索引和隐式私有集合；
5. 所有记录共享同一个 Fabric transactionId；任何错误使整笔交易失效，不产生“前几条成功、后几条失败”。

上限 50 条用于控制 transient payload、读写集和背书延迟；它不是吞吐上限，较大教学班应拆分为多个明确批次。

## 4. API 与权限

新增 `POST /api/v1/credentials/imports`：

- issuer 会话、同源与 CSRF 保护；
- Zod 在进入 Gateway 前完成整批验证和 credentialId 去重；
- 每行详情先规范化，再计算 SHA-256；
- Gateway 只提交一次 `CreateCredentialBatch`；
- 成功返回所有 `PENDING_REVIEW` 公共记录，HTTP 201；
- 不在响应中回显成绩、盐值或 CSV 原文。

## 5. UI 信息架构

教师工作台增加“批量导入成绩草稿”面板：

- CSV 文本区与格式说明；
- 本地解析按钮；
- 预览表显示凭证标识、课程名、分数、等级与校验状态；
- 明确提示“单笔原子提交”和记录数量；
- 解析失败显示行号，不允许提交；
- 成功后只展示公共状态和同一交易 ID 的缩略值。

UI 不出现小组、答辩、竞赛或开发阶段提示词。

## 6. 验收条件

- CSV 引号、BOM、空行、错误表头、错误分数和批内重复均有测试；
- 链码证明成功批次共享 transactionId，重复标识或哈希错误整批失败；
- API 证明只调用一次批量 Gateway 方法且响应不含私有字段；
- 桌面与 390×844 移动端预览/结果状态无溢出；
- 浏览器 console、Vite 编译输出、类型检查、测试、构建和 `git diff --check` 均通过；
- 服务器 Docker 未恢复前，只报告离线演示账本结果，不声称 `grade 0.9` 已真实部署。
