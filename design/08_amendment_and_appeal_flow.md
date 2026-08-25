# 不可变成绩修订与轻量申诉设计 v0.1

日期：2026-08-25

## 1. 目标与统一产品边界

本阶段在现有 ChainGrade 项目内完成“发现问题—学生申诉—院系复核—教师修订—新版生效”的可信闭环。课程答辩展示基础签发与修订/申诉，竞赛版本继续在相同状态机、API 和页面上增加认证、查询模型与隐私证明，不创建第二套系统。

## 2. 修订状态机

1. 仅 `ACTIVE` 凭证可以创建修订草稿。
2. API 读取原凭证并继承 `subjectHash`、`courseHash`，前端不能修改这两个身份字段。
3. 修订详情通过 `gradeDetails` transient data 写入签发组织隐式私有集合。
4. 新版本先处于 `PENDING_REVIEW`，原版本继续 `ACTIVE`，避免未批准修订提前失效。
5. reviewer 批准新版本的同一交易中，新版本变为 `ACTIVE`，原版本变为 `SUPERSEDED`。
6. 若原版本在批准前失效，链码返回 `STALE_AMENDMENT`，禁止旧草稿覆盖当前版本。

## 3. 申诉状态机

| 动作 | Fabric 身份 | 链码约束 | 结果 |
| --- | --- | --- | --- |
| 提交申诉 | student | ACTIVE、同组织、证书 `subject.hash` 等于凭证 subjectHash | `OPEN` |
| 读取申诉 | reviewer Gateway 查询身份 | 只返回公共承诺和审计字段 | 状态不变 |
| 处理申诉 | reviewer | 同组织、状态为 OPEN、结论哈希匹配 transient data | `RESOLVED_ACCEPTED` 或 `RESOLVED_REJECTED` |

申诉理由使用 `appealDetails` transient key，复核结论使用 `appealResolution` transient key。链码分别复算 SHA-256，并把明文写入 `_implicit_org_Org1MSP`；公共记录只保存 `reasonHash`、`resolutionHash`、身份哈希、状态、时间和交易 ID。

## 4. API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/credentials/:credentialId/amendments` | 创建修订草稿 |
| POST | `/api/v1/credentials/:credentialId/appeals` | 学生提交本人申诉 |
| GET | `/api/v1/appeals/:appealId` | 读取公共申诉记录 |
| POST | `/api/v1/appeals/:appealId/review` | 提交私有复核结论与公共承诺 |

后端对私有对象使用递归键排序的 canonical JSON 后计算 SHA-256。Fabric 身份由动作固定映射为 issuer、reviewer、student，客户端不能提交证书路径或任意 MSP 身份。

## 5. 稳定错误边界

Zod 字段错误返回 `400 VALIDATION_ERROR`。链码业务码需要从 Fabric Gateway 的 peer `details[].message` 解析，而非只读顶层错误；`FORBIDDEN`/职责分离映射为 403，`NOT_FOUND` 为 404，状态冲突/重复标识/过期修订为 409。未知异常只返回通用 `INTERNAL_ERROR`，不向浏览器泄露 gRPC 地址、证书路径或 peer 内部消息。

## 6. 当前边界与后续增强

当前后端仍是演示环境的固定动作—证书映射，不等同于终端用户登录。下一阶段必须增加会话主体、角色授权、学生本人私有详情读取；列表和待办需要独立查询模型，避免为页面富查询而扩大公共账本隐私面。
