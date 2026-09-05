# 工作包 A：标准凭证互操作与验证体验 —— 最小凭证配置设计（Q1）

负责人：强璞
日期：2026-09-02
阶段：Iteration 14（VC 互操作）
状态：设计已定稿，Q2–Q7 已实现

## 1. 目标

在现有 Fabric 成绩凭证之上增加可导出、可传递、可独立验证的标准化凭证层。该层不替换公共账本和私有数据集合，而是把当前 ACTIVE 凭证映射成可下载 JSON，并把签名、链上状态和详情承诺一起纳入验证。

默认二维码只包含验证地址、凭证 ID 和摘要，不包含课程名、分数、等级、盐值或完整凭证文件。

## 2. 诚实性边界

- 本实现为 VC 2.0 风格的数据结构，仅对「通过实际测试」的能力作声明。
- 不声明 W3C VC 2.0 完全合规；不声明 W3C Data Integrity 注册项合规。
- 不声明 BBS+、零知识证明或不可链接选择性披露。
- BBS+ 仅允许在完成必做项后，于独立尖峰目录研究。

## 3. 设计决策摘要

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 数据模型 | VC 2.0 风格 | 满足「只有通过测试的部分才能表述为支持」 |
| 规范化 | JCS（RFC 8785），独立新模块 | 链上 detailHash 依赖既有 canonicalJson，禁改 |
| 签名算法 | Ed25519（node:crypto 原生） | 零外部依赖、易测试 |
| 签名值编码 | 128 位小写 hex | 零依赖、可读、可固定 |
| 签名范围 | 文档去掉 proof.proofValue 后的 JCS 规范化字节 | 除签名值外所有字段均受保护 |
| 密钥注入 | 私钥/公钥仅经环境变量（Git 外）加载 | 密钥不入库 |
| 信任模型 | 验证方用配置的受信公钥，不信任文件内密钥 | 满足负向测试「未知验证方法/错误公钥失败」 |
| 匿名 | issuer 用 did:example:，context 用 .example 保留域名 | 竞赛匿名评审要求 |
| 状态查询 | credentialStatus 只放查询指针，验证时实时查链 | 避免「过期快照被判有效」 |
| 有效期 | 只设 validFrom，不设 validUntil | 成绩凭证不设过期 |
| 盐值 | 绝不进入导出凭证/二维码 | 只存在于 detailHash 承诺 |

## 4. 最小凭证结构（字段规范表）

顶层字段（JCS 字典序，@ 在前）：

| 字段 | 必填 | 类型 | 取值/来源 |
| --- | --- | --- | --- |
| @context | 是 | string[] | 固定两项 |
| id | 是 | string | 凭证 credentialId |
| type | 是 | string[] | 固定两项 |
| issuer | 是 | object | { "id": "did:example:chaingrade-issuer" } |
| validFrom | 是 | string(ISO8601) | 链上 issuedAt |
| credentialSchema | 是 | object | 版本化 |
| credentialSubject | 是 | object | 学生标识 + 勾选字段 |
| credentialStatus | 是 | object | 链上状态查询指针 |
| evidence | 是 | object | Fabric 锚定 |
| proof | 是 | object | Ed25519 签名 |

### 4.1 credentialSubject（只含勾选字段）

| 字段 | 必填 | 类型 | 来源 |
| --- | --- | --- | --- |
| id | 是 | string | did:example:chaingrade-subject:<subjectHash> |
| subjectHash | 是 | string(64hex) | 链上 subjectHash |
| courseName | 条件 | string(1–200) | 勾选后导出 |
| score | 条件 | number(0–100) | 勾选后导出 |
| grade | 条件 | string(1–16) | 勾选后导出 |

未勾选任何字段时禁止导出（防空凭证）。

### 4.2 credentialStatus（查询指针）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | urn:chaingrade:credential:<credentialId>#status |
| type | string | ChainGradeFabricStatusV1 |
| credentialId | string | 锚定到链上记录 |
| statusEndpoint | string | 公开查询端点 |

### 4.3 evidence（Fabric 锚定）

| 字段 | 类型 | 来源 |
| --- | --- | --- |
| type | string | ChainGradeFabricAnchorV1 |
| channel | string | chaingrade |
| chaincode | string | grade |
| credentialId | string | 链上 credentialId |
| issuerMspId | string | 链上 issuerMspId（Org1MSP） |
| schemaVersion | string | 链上 schemaVersion |
| detailHash | string(64hex) | 链上公共 detailHash |
| transactionId | string | 链上 transactionId |
| version | number | 链上 version |
| previousCredentialId | 可选 | 仅 SUPERSEDED 版本链出现 |

### 4.4 proof

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| type | string | ChainGradeEd25519Signature2026 |
| created | string(ISO8601) | 签名创建时间 |
| verificationMethod | string | did:example:chaingrade-issuer#key-1 |
| proofPurpose | string | assertionMethod |
| canonicalization | string | RFC 8785（JCS） |
| proofValue | string(128hex) | Ed25519 签名的小写 hex |

## 5. 规范化与签名契约

1. 规范化：对「文档去掉 proof.proofValue」执行 JCS（RFC 8785）——键字典序、原始 UTF-8、最短数字、拒绝重复键。
2. 签名输入：signingInput = JCS(去掉 proofValue 的完整文档)。
3. 签名：proofValue = hex(Ed25519_Sign(signingInput, issuerPrivateKey))。
4. 验证：重算 signingInput，用受信公钥验签；再查链上状态 + 比对 detailHash/subjectHash。

实测锚点：

- courseHash = 3789008875cfc5c25130d2f654ae4f271888b9e7a5f9d036d7ba346cc951188d
- detailHash = 1b0825a03e8c0d12e90e8ea1125c8432845322c86ed561cff757d4dec5ede1d5
- subjectHash = e21b5e0c1a136d1c910aea031527936cb024a4ea95ea1a236b5383056d466926

## 6. 验证三段结论（Q4/Q6 接口形状）

```json
{
  "conclusion": "valid",
  "signature": { "valid": true, "verificationMethod": "did:example:chaingrade-issuer#key-1" },
  "chainStatus": { "credentialId": "cred:2026:demo01", "status": "ACTIVE", "version": 1, "issuerMspId": "Org1MSP" },
  "anchor": { "detailHashMatch": true, "subjectHashMatch": true }
}
```

## 7. 安全与负向约束

1. 修改课程、分数或 Fabric 锚定后签名失败。
2. 未知验证方法或错误公钥失败。
3. 签名正确但链上 REVOKED/SUPERSEDED，结论不得显示「当前有效」。
4. detailHash 与公共账本不一致时锚定失败。
5. 上传超限（64 KiB）、非 JSON、重复键、缺失必填字段时拒绝。
6. 导出与验证响应 Cache-Control: no-store，日志不记凭证正文。
7. 二维码默认不出现分数、课程名和完整 token；盐值不进入导出凭证。

## 8. 示例文件

见 `design/assets/iteration-14-vc/` 下三个示例（ACTIVE / REVOKED / SUPERSEDED）。

## 9. 落盘位置与后续任务

- 本文件：`design/27_vc_interoperability_profile.md`
- 示例：`design/assets/iteration-14-vc/*.example.json`
- 环境变量：`.env.example`（`VC_ISSUER_PRIVATE_KEY` / `VC_ISSUER_PUBLIC_KEY`）
- Q2–Q7 已实现：shared vc 模块、api vc 模块、导出/验证端点、前端 UI、验收报告。

## 10. 未决事项

按默认值执行，无未决：

- proof 类型命名：ChainGradeEd25519Signature2026
- 签名值编码：128 位小写 hex
- issuer DID：did:example:chaingrade-issuer
