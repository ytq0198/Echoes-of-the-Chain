# ChainGrade 功能与证据索引

本索引只引用同一个 ChainGrade 项目的可复验证据。状态分为“已验证”“原型边界”和“后续增强”，防止材料把规划写成已完成。

| 能力 | 实现位置 | 自动/链上证据 | UI 证据 | 状态 |
| --- | --- | --- | --- | --- |
| Fabric 成绩存证与公开验真 | `chaincode/grade-contract`、`apps/api` | 双组织 Fabric 2.5.16，`grade 0.9 / sequence 1`，双 Peer 高度与哈希一致 | `reports/assets/iteration-11/00-*`、`06-*` | 已验证 |
| 三类属性身份与四角色界面 | `apps/api/src/auth`、`apps/web` | 鉴权/授权自动测试与真实 HTTP 验收 | `iteration-11/01-*` 至 `05-*` | 已验证 |
| 私有成绩详情 | 隐式私有数据集合、学生本人查询 | 公共状态只保留承诺；本人证书属性校验 | `iteration-11/05-*` | 已验证 |
| 独立复核、驳回与撤销 | 链码状态机、复核队列 | 合法/非法转换测试 | `iteration-7/final/` | 已验证 |
| 成绩修订与轻量申诉 | 凭证版本链、申诉状态机 | 真实 Fabric 完整业务闭环 | `iteration-5/final/02-*`、`03-*` | 已验证 |
| 原子 CSV 批量导入 | `CreateCredentialBatch` | 成功批次单 transaction ID；混合冲突整批回滚 | `iteration-9/` | 已验证 |
| 有限字段授权披露 | disclosure grant API/UI | 用途、验证者、期限、次数约束及负向测试 | `iteration-8/` | 已验证的 bearer capability |
| 二维码公开验真 | Web 验真链接 | URL 不含成绩、盐值或申诉正文 | `iteration-5/final/10-*` | 已验证 |
| 无 Docker 运维、备份与恢复 | `infra/fabric-native` | 冷备份 SHA-256、恢复后双 Peer 哈希一致、播种幂等 | `reports/14_native_operations_auth_ui_e2e.md` | 已验证 |
| BBS+/不可链接匿名凭证 | 未合入主线 | 无 | 无 | 后续增强，不得宣称完成 |
| 跨校联盟互认、Caliper | 未合入主线 | 无 | 无 | 后续增强，不得宣称完成 |

答辩和报告引用某项能力时，应同时给出实现、测试/账本与 UI 三类证据中的至少两类；涉及“真实链上”的结论必须引用真实 Fabric 证据而非进程内演示账本。
