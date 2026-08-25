# Iteration 2 阶段实验：修订与申诉真实 Fabric E2E

日期：2026-08-25

## 1. 实验目标

在不重置既有账本的条件下升级链码，验证不可覆盖的成绩修订、学生本人申诉、隐私复核结论和稳定业务错误映射，并通过同一 Vue 产品完成真实浏览器操作。

## 2. 链码升级

- 升级前：`grade 0.2 / sequence 2`。
- 升级后：`grade 0.3 / sequence 3`。
- 包 ID：`grade_0.3:2a831070fadbc5e79d800652b6f9c511623165f62a8f65daba4985e2caea4f1d`。
- Org1/Org2 均批准；定义提交交易：`17b578506f5c71a4ab96c5bcff2502f88d71144177f62ebcec19ee55af97c8ff`。
- 升级增加申诉复核结论的 transient 哈希校验与隐式私有集合写入，未重置已有状态。

## 3. 修订结果

- 原凭证：`cred:2026:web01`，修订前为 `ACTIVE / v1`。
- 新凭证：`cred:2026:web01-v2`，`previousCredentialId=cred:2026:web01`，版本为 v2。
- 新详情哈希：`9ec95491b3fe70c2f6f219f4c025856e429834c65b4d64b5580116101a10f989`。
- 批准交易：`0797785eefae6b10b554d313c2fac71fa26b4bdfe9bf44971398a049060bd5b8`。
- 同一交易后，新版为 `ACTIVE`，旧版为 `SUPERSEDED`，两者交易 ID 和更新时间一致，验证了原子替换。

## 4. 申诉结果

- 申诉：`appeal:2026:web01`，关联新版凭证。
- student 身份哈希：`1872f4d6d72e070494e53e2ff69b693769c6d7dc6dd6d811d16f982919057ce1`。
- 理由承诺：`e5edd03ecc84ac881b9576155116eead86be548919713ce955783b2ec8cc9437`。
- 复核结果：`RESOLVED_ACCEPTED`。
- 结论承诺：`286b3f8bb330a6e716a4205a5be315699fdcad1f97c684e57c3144aa10e2c75f`。
- 复核交易：`45e59c6c3d81bbd74d5edc112abdfbe1b413f40fc388dc076592bdaa3534d463`。
- 交易成功要求 `appealResolution` transient 内容与结论哈希一致，证明新版私有结论路径被实际执行。

## 5. 负向与界面验证

- 对已 `SUPERSEDED` 的旧凭证再次提交申诉，链码拒绝。
- 首次真实测试暴露 Gateway 顶层错误不含业务码；改为解析 peer details 后返回 HTTP 409：`{"code":"INVALID_STATE","message":"记录当前状态不允许此操作"}`。
- 桌面端完成修订、批准、学生申诉和申诉复核。
- 390×844 移动端操作面板宽度适配，无横向溢出；console warning/error 为 0。

## 6. 工程与账本结果

- 类型检查、生产构建通过。
- 25 项自动测试通过：共享 Schema 2、链码 12、API 11。
- 链码覆盖率：语句/行 91.47%，分支 73.91%，函数 100%。
- E2E 完成后账本高度：20。
- Org1、Org2 的 `grade_0.3` 链码容器均正常运行。

## 7. 结论

本阶段把原有链码单元测试能力提升为真实用户界面、三类 CA 属性身份、Gateway、peer 与私有数据交易闭环。当前固定证书映射仍只适合受控演示，后续认证与本人私有详情授权未完成，不能描述为生产上线。
