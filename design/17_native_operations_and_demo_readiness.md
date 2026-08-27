# 原生 Fabric 可运维化与答辩演示就绪设计

日期：2026-08-27

## 1. 目标与范围

本阶段继续服务同一个 ChainGrade 课程大作业与竞赛项目，不新增脱离成绩管理主线的模块。目标是把已经跑通的无 Docker Fabric 网络提升为可重复启动、可验证备份、可保护恢复、可重复播种和可在鉴权模式下演示的系统。

本阶段不声称恢复共享 Docker 故障前丢失的旧 volume，也不修改学校服务器 Docker data-root、内核参数或其他用户目录。

## 2. 运行状态机

原生运行环境分为四层：

1. `native-network.sh up/down/status` 管理 Orderer 与双 Peer；
2. `deploy-chaincode.sh deploy` 负责首次安装与提交，发现目标 version/sequence 已提交时跳过生命周期交易；
3. `deploy-chaincode.sh start` 只重建确定性 CCAAS 包、校验双 Peer 已安装并启动外部链码；
4. `ledger-info.sh` 同时读取 Org1/Org2 高度与 current/previous block hash，任一不一致即失败。

CCAAS 归档固定文件顺序、mtime、owner 与 group，因此重启后 package ID 不变。网络始终复用首次生成的稳定通道区块，避免创世区块重新生成造成 PreviousHash 分叉。

## 3. 冷备份与受保护恢复

`backup-runtime.sh` 的一致性边界是完整停机后的 `.runtime/native-fabric`：

- 记录网络与链码是否运行；
- 依次停止链码、双 Peer 与 Orderer；
- 仅将项目内精确路径 `.runtime/native-fabric` 写入归档；
- 生成权限为 `0600` 的归档和 SHA-256 sidecar；
- 调用 `verify-backup.sh` 检查哈希、gzip/tar 可读性、绝对路径和 `..` 穿越、归档根范围；
- 按原运行状态重启，并用 `ledger-info.sh` 核对双 Peer。

`restore-runtime.sh` 默认拒绝执行，只有提供 `--confirm-restore` 才进入恢复。恢复前先验证归档，再把当前运行目录移动为 `.runtime/native-fabric.pre-restore-<UTC>`；恢复或启动失败时，脚本将失败目录移开并自动把原目录放回。成功恢复后仍保留旧目录，删除由人工在独立维护窗口决定。

备份根默认固定在仓库父目录的 `chaingrade-backups`，脚本拒绝越出项目父目录，保证所有写操作仍位于 `/mnt/localDisk3/weizian`。

## 4. 确定性演示数据

`pnpm --filter @chaingrade/api seed:native` 维护一组固定业务状态：

- `cred:demo:blockchain-2026`：成绩凭证，最终必须为 `ACTIVE`；
- `appeal:demo:blockchain-2026`：关联轻量申诉，最终必须为 `OPEN`；
- 私有成绩通过 transient data 写入，公共承诺由规范 JSON 的 SHA-256 生成；
- 学生匿名标识与应用学生证书的 `subject.hash` 一致。

播种器先读后写。对象不存在时创建、批准或提交；已存在时严格比对 subject/course/detail commitment 与 schema。最后同时执行公开验真和学生私有详情读取。既有数据与预期不符时立即失败，绝不覆盖或伪装成功。

## 5. 鉴权演示边界

浏览器验收采用启用 `FABRIC_ENABLED=true` 与 `AUTH_ENABLED=true` 的同一 API：

- 账号口令与会话密钥仅存在于临时进程环境，不写入 Git、截图或报告；
- Cookie 为 HttpOnly、SameSite=Strict，状态变更需要精确 Origin 与 CSRF token；
- issuer、reviewer、student 工作台均验证角色匹配；公开验真无需登录；
- 学生私有读取由 HTTP session 与 Fabric `subject.hash` 属性双重约束；
- 浏览器只通过 SSH localhost 隧道访问，服务不暴露到校园网。

## 6. 验收门槛

- 无损重启前后双 Peer 高度和两个哈希完全一致；
- 冷备份、SHA-256 校验、实际恢复及回退副本存在性均通过；
- 第二次播种前后高度与哈希完全不变；
- 未登录、错误来源、错误角色、缺少 CSRF 分别返回预期 401/403；
- 1280×720 桌面和 390×844 移动端验证关键页面，无横向溢出、console warning/error 为 0；
- 只有验收通过的截图进入阶段报告。

## 7. 防跑偏检查

本阶段增强的是部署可靠性、成绩凭证/申诉演示可复现性和角色安全，不改变课程题目的成绩管理主体。Docker 修复后，容器网络可作为第二种部署方式；原生网络不是另一个产品或另一套答辩项目。
