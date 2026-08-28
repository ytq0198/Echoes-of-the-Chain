# ChainGrade 演示运行手册

## 1. 服务端预检与启动

所有命令只在 `/mnt/localDisk3/weizian/Echoes-of-the-Chain` 内执行。首次准备私有认证环境：

```bash
mkdir -p .runtime/private
cp deliverables/demo/preview.env.example .runtime/private/preview.env
chmod 600 .runtime/private/preview.env
# 用编辑器替换四个 secret/password 占位值
```

预检不会修改 Docker，也不会启动或停止 Fabric：

```bash
./infra/demo/preview.sh check
```

若原生 Fabric 已停止，依次恢复既有账本和链码，再启动前后端：

```bash
./infra/fabric-native/native-network.sh up
./infra/fabric-native/deploy-chaincode.sh start
.tools/node/bin/corepack pnpm --filter @chaingrade/api seed:native
./infra/demo/preview.sh start
```

`start` 会执行生产构建、启用真实 Fabric 和角色会话，并只监听服务器回环地址。它不会打印私有口令。查看状态或日志：

```bash
./infra/demo/preview.sh status
./infra/demo/preview.sh logs
```

## 2. 本机 SSH 隧道

在 Windows PowerShell 运行：

```powershell
ssh -N -p 9961 -L 5173:127.0.0.1:5173 weizian@10.98.36.128
```

浏览器访问 `http://127.0.0.1:5173/`。隧道只转发 Web 端口，API 请求经 Vite 同源代理进入服务器的 `127.0.0.1:3000`。

## 3. 演示结束

```bash
./infra/demo/preview.sh stop
```

该命令只停止脚本记录且命令行属于当前项目的 API/Web PID，不停止 Fabric。需要完整关闭时再执行：

```bash
./infra/fabric-native/deploy-chaincode.sh stop
./infra/fabric-native/native-network.sh down
```

## 4. 故障回退

| 现象 | 现场动作 | 对外表述边界 |
| --- | --- | --- |
| Docker 报 `layer does not exist` | 不操作 Docker，使用已验证的原生 Fabric 路径 | 这是 Fabric 2.5.16 双组织真实网络，不是模拟账本 |
| API 无法启动 | 查 `preview/logs/api.log`，确认 3000 端口与私有环境文件权限 | 不切换为未标注的演示数据 |
| Web 无法启动 | 查 `preview/logs/web.log`，确认 5173 端口 | 可直接展示已录制视频与报告证据 |
| Fabric 短时不可用 | 展示备份校验、双 Peer 账本高度和已有交易证据 | 不把离线 Demo transaction ID 称为链上证据 |
| 校园网/隧道中断 | 使用本地录屏和报告截图完成讲解 | 明确说明网络链路故障，避免现场改账本 |

答辩前保留一份屏幕录制、最新截图和校验过的冷备份；现场不执行 `reset`、`restore`、Docker 清理或链码重新部署。
