# Operations 审计

结论：阻塞。范围：目标 Linux 原生部署草案、服务账号、socket、数据路径、代理、升级、备份和恢复。

## 已确认现状

- 目标方向为非 Docker 的原生 Linux 后台与专用桌面；仓库提供 `infra/native-linux/` systemd/socket 草案。
- 配置入口包含 `SANDBOX_PROVIDER=native-linux` 与 `SYDNEY_NATIVE_DRIVER_SOCKET`；相关服务路径以仓库根目录布局书写。
- 新 schema 增量迁移要求先停止旧 Worker，再迁移，再部署新版 API/Worker 后开放入口。
- 当前云代理示例只用于桌面出站设置；模型/DB/控制面凭据不得进入桌面环境。

## 风险与缺口

- 所有 systemd unit、用户/组、路径、依赖、端口、环境文件和安全加固均是草案，未在目标发行版运行。
- Unix socket SO_PEERCRED、目录权限、systemd socket activation、桌面 X11、Xauthority、浏览器 sandbox 和不同 UID 限制未在 Linux 验收。
- 没有已验证安装、升级/回滚、监控、备份密钥、备份恢复、数据保留或灾难恢复流程。
- 服务器最低 CPU/RAM/磁盘没有测量依据；个人单任务可作为测量目标，但不是可承诺最低规格。
- 代理设置要分别覆盖系统包源、npm/pnpm、模型端点、MCP/App 出站和桌面浏览器；代理本身可能成为网络边界绕行，必须服务端控制并记录。
- 原生桌面与后台同机时，桌面 UID 不是 VM 隔离；不能让 Agent 拥有 sudo、Docker group、服务管理权限或读后台配置。

## 验证与状态

- 操作步骤和恢复清单位于 [运维手册](../../docx/OPERATIONS.md)；本轮未运行安装命令或启动任何服务。
- PostgreSQL、Linux、代理、资源峰值、备份恢复：全部待授权服务器。
- 状态：阻塞，不可按现有 unit 草案直接宣称生产部署完成。
