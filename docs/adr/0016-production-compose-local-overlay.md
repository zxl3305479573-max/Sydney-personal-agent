# ADR-0016：生产 Compose 本地 Overlay 的持久化与回滚边界

- 状态：已接受，代码已实现，生产尚未部署验证
- 日期：2026-11-07
- 关联需求：PA-018、后续 native-linux 同机 sidecar 部署

## 背景

生产 API、Worker、Web 使用 Docker Compose，桌面驱动和 VNC/websockify 使用宿主机
systemd。部署 launcher 从目标 revision 读取 `deploy-main.sh`，部署脚本随后会 reset
仓库。因此将额外 Compose 文件放进 checkout，或只手动修改生产 checkout，都不能保证
后续部署和回滚继续加载它。

驱动 socket、驱动身份校验、应用容器 UID 和公网端口属于其他边界。本 ADR 不修改这些
边界，也不启用 `SANDBOX_PROVIDER`。

## 决策

1. 本地 overlay 使用服务器 checkout 之外的固定路径：
   `/etc/rakazo/compose/<name>.yml` 或 `.yaml`。
2. `RAKAZO_COMPOSE_OVERLAY_FILE` 是唯一的 overlay 配置项，放在持久的
   `/srv/rakazo/.env` 中供 Compose、updater、launcher 和 deploy script 使用。它不放进
   `/etc/rakazo/deploy.env`，这样所有入口只能得到同一份文件集合。
3. overlay 必须是普通文件，路径不能穿越，扩展名必须是 `.yml` 或 `.yaml`，且不能被
   group/world 写入或 world 读取。updater 额外拒绝符号链接和缺失文件；部署脚本在
   调用 Compose 前执行同等文件检查。overlay 目录以只读方式挂载到 updater。
4. Compose 文件集合由基础生产文件加本地 overlay 组成，顺序固定。部署、Compose
   配置检查、滚出、健康恢复和回滚都通过同一集合调用，未设置 overlay 时仍只使用
   原基础文件。
5. launcher 作为服务器持久入口检查目标 `deploy-main.sh` 的
   `RAKAZO_LOCAL_COMPOSE_OVERLAY_SUPPORT=1` 标记。目标 revision 不支持该标记时，
   已配置 overlay 的部署或回滚直接失败，不能静默退回基础 Compose。
6. 不使用 `eval` 或任意 `source` 解析 `/etc/rakazo/deploy.env`。只接受受控的
   `RAKAZO_*` 简单赋值；overlay 内容不写日志，updater 将带 overlay 的 Compose
   失败输出替换为通用错误。

## 后续 sidecar 接入

native-linux sidecar 后续应作为 overlay 中的受限服务加入，使用已有 Provider、驱动、
授权和租约接口。sidecar 需要通过同机 `sydney-tunnel` 身份访问受限代理入口，不能挂载
驱动原始 socket、修改 `0600` 权限或改变驱动 peer UID 校验。屏幕链路继续单独验证：
宿主机 websockify 的 `127.0.0.1:6080` 不能直接被容器内的 `127.0.0.1` 代替。

## 兼容边界

未配置 overlay 时，旧 revision 继续按原单文件行为运行。已配置 overlay 时，旧
revision 由持久 launcher 明确拒绝；管理员必须先升级到包含支持标记的部署脚本，或
提供经过审阅的服务器侧兼容入口，再执行回滚。此边界有意让回滚失败并提示人工处理，
不自动删除或绕过 overlay。

## 验证限制

本次只完成本地代码、定向测试和静态核对。没有连接生产服务器，没有读取或修改线上
`.env`，没有创建 overlay，未启动 Docker、systemd、驱动或桌面服务。因此 overlay
权限、Compose 合并语义、sidecar socket 代理、截图、输入、断线恢复和真实回滚仍待
授权维护窗口实机验证。
