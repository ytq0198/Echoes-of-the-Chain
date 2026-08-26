# 角色化链上任务查询设计

## 目标

把凭证与申诉从“知道标识后单条查询”推进为可实际使用的任务工作台，同时保持最小披露与链上权限约束。课程大作业和竞赛版本仍是同一个 ChainGrade 项目，本设计直接服务于签发、复核、学生持有与申诉闭环。

## 查询视图

| 视图 | 链码入口 | 证书约束 | 索引前缀 |
| --- | --- | --- | --- |
| 本组织签发记录 | `ListIssuedCredentials` | `app.role=issuer`、当前 MSP | `credential~status` |
| 凭证复核队列 | `ListReviewCredentials` | `app.role=reviewer`、当前 MSP | `credential~status` |
| 我的凭证 | `ListMyCredentials` | `app.role=student`、`subject.hash` | `credential~subject` |
| 申诉复核队列 | `ListReviewAppeals` | `app.role=reviewer`、当前 MSP | `appeal~status` |
| 我的申诉 | `ListMyAppeals` | `app.role=student`、`subject.hash` | `appeal~subject` |

所有索引使用 Fabric 复合键，兼容 LevelDB，不依赖 CouchDB 富查询。索引值不复制业务明文，只保存一个占位字节；读取索引后再按业务主键读取公共记录。

## 状态一致性

链码在同一交易内完成业务记录与索引变更：

1. 创建草稿时写入 `PENDING_REVIEW` 状态索引及学生归属索引；
2. 批准、驳回、撤销或版本替代时删除旧状态索引，再写入新状态索引；
3. 创建申诉时写入 `OPEN` 状态索引和学生归属索引；
4. 处理申诉时删除 `OPEN` 索引并写入对应结论状态索引。

Fabric 的交易原子性保证记录与索引不会只更新一半。`RebuildIndexes` 仅允许本组织 reviewer 证书执行，用于升级后给历史记录建立索引，并在重建时补齐旧申诉的 `issuerMspId`。

## 分页协议

- `pageSize` 限制为 1–50，当前界面默认每次读取 8 条；
- `bookmark` 是 Fabric 返回的不可解释游标，API 只负责校验长度并原样透传；
- 返回统一为 `{ items, bookmark, fetchedRecordsCount }`；
- 空字符串表示没有下一页，界面据此隐藏“载入更多”。

## 隐私与越权控制

网页会话角色只负责第一层路由保护，真正的数据范围由参与 Fabric 背书的 X.509 证书属性决定。即使绕过网页直接调用 Gateway，学生证书也只能使用自身 `subject.hash` 构造复合键前缀，不能指定其他学生哈希；issuer/reviewer 的索引前缀固定包含当前 MSP。

## 界面行为

- 登录角色工作台后自动读取对应链上队列；
- 教师与复核员可按状态筛选；
- 点击列表项直接进入复核、查看或申诉处理上下文；
- 提交、批准、处理申诉后立即刷新相应索引视图；
- 桌面端使用三列任务行，移动端折叠为两列并保持状态和主操作可见。
