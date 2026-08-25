# 角色会话与学生本人私有披露设计 v0.1

日期：2026-08-25

## 1. 目标

本阶段把“后端按动作固定选择 Fabric 证书”提升为“终端会话角色 + 后端证书映射 + 链码属性校验”三层授权。课程答辩和竞赛仍使用同一个 ChainGrade 项目；公开验真保持匿名，私有成绩读取只服务于凭证本人。

## 2. 安全依据

- OWASP Session Management Cheat Sheet 建议会话标识使用 HttpOnly、Secure、SameSite，并避免存入 Web Storage。
- OWASP CSRF Prevention Cheat Sheet 将 SameSite 视为纵深防御，状态变更还应校验自定义请求头、Origin 或 Fetch Metadata。
- Fabric 私有数据文档允许使用 `_implicit_org_<MSPID>` 和链码客户端身份逻辑控制 `GetPrivateData`。

参考：[OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)、[OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)、[Fabric Private Data](https://hyperledger-fabric.readthedocs.io/en/latest/private-data-arch.html)。

## 3. 会话设计

会话载荷包含账号、应用角色、可选学生 subjectHash、随机 192 位 CSRF token、签发和过期时间。载荷使用 HMAC-SHA256 签名并放入 HttpOnly Cookie，不进入 localStorage/sessionStorage。默认有效期 1 小时，配置只允许 5 分钟至 8 小时。

开发 HTTP Cookie 名为 `chaingrade_session`；正式 HTTPS 设置 `AUTH_SECURE_COOKIE=true` 后使用 `__Host-chaingrade_session; Secure; HttpOnly; SameSite=Strict; Path=/`。登录响应和会话恢复响应返回 CSRF token，前端只保存在 Vue 内存状态中。

## 4. 请求授权

| API 类别 | 会话要求 | 额外约束 |
| --- | --- | --- |
| 公开验真、健康检查、公共凭证读取 | 无 | 不得改变状态 |
| 教师草稿/修订 | issuer | Origin/Fetch Metadata + CSRF |
| 凭证批准、申诉复核 | reviewer | Origin/Fetch Metadata + CSRF |
| 学生申诉 | student | Origin/Fetch Metadata + CSRF，链码 subject.hash |
| 学生私有成绩读取 | student | 链码再次校验 MSP、角色与 subject.hash，响应 no-store |

浏览器来源必须精确匹配 `AUTH_ALLOWED_ORIGINS`。`cross-site` 与不受信任的 `same-site` 请求直接拒绝；非浏览器客户端默认关闭，确有需要时只能显式设置 `AUTH_ALLOW_NON_BROWSER_CLIENTS=true`。

## 5. 私有成绩读取

`ReadPrivateCredential` 的执行顺序为：校验 `app.role=student`；读取公共凭证；校验调用者 MSP 等于签发 MSP；校验证书 `subject.hash` 等于凭证 subjectHash；从签发组织隐式集合读取 `credential:<id>`。任一步失败均不返回明文。

HTTP 学生会话不能替代链码校验。即使 API 层配置错误，错误学生证书或 reviewer 证书仍会被链码拒绝。成功响应设置 `Cache-Control: no-store`，页面隐藏盐值且不持久化详情。

## 6. 配置与失效

认证默认关闭；启用时，会话密钥、三个角色密码、学生 subjectHash 和精确允许来源缺一即启动失败。会话密钥至少 32 字符，密码至少 12 字符。当前为无状态短期会话，主动全局失效通过轮换进程会话密钥完成。

## 7. 未完成边界

这是受控演示认证，不是生产身份系统。尚未接入学校统一身份、密码限速、MFA、单会话撤销、密钥托管和审计告警；竞赛部署应优先对接 OIDC/SAML 身份提供方，而不是扩展仓库内演示账号。
