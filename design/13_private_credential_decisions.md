# 凭证驳回与撤销的私有决定设计

## 目标

补齐复核员对成绩凭证的三类决定：批准待复核草稿、驳回待复核草稿、撤销当前有效凭证。驳回和撤销必须可审计，但不得把包含业务判断的理由正文公开上链。

## 数据边界

- 公共世界状态：凭证状态、`reasonHash`、reviewer 身份哈希、更新时间和交易 ID；
- transient data：规范化后的 `{ reason, salt }`；
- 隐式私有集合：`credential:<id>:decision` 保存决定正文；
- 公共 `reasonHash` 必须与 transient payload 的 SHA-256 一致，否则交易失败。

## 状态机

| 当前状态 | 操作 | 下一状态 |
| --- | --- | --- |
| `PENDING_REVIEW` | 批准 | `ACTIVE` |
| `PENDING_REVIEW` | 驳回 | `REJECTED` |
| `ACTIVE` | 撤销 | `REVOKED` |

其他组合均由链码返回 `INVALID_STATE`。驳回继续执行职责分离校验，提交草稿的身份不能审核自己提交的记录。

## 接口与界面

- `POST /api/v1/credentials/:id/reject`
- `POST /api/v1/credentials/:id/revoke`
- 请求体统一为 `{ reason, salt }`，理由 10–2000 字、盐值至少 16 字符；
- 复核详情中按状态只展示当前合法操作；危险操作使用独立的暖红色私有决定面板；
- 成功后立即刷新链上队列，记录从旧状态筛选中消失并进入新状态筛选。
