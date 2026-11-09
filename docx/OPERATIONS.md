# 运维手册

## Composio 托管应用目录权限（待授权验证）

生产原项目密钥调用会话创建接口时返回 403，缺少 `session_management` 写权限。用户更新受保护配置后，已在 `/srv/rakazo` 使用 `infra/compose/docker-compose.prod.yml` 和 `/etc/rakazo/compose/production.overlay.yml` 滚动重建 API、Worker：新服务健康并加载配置，旧 Worker 完成退出。直接验证会话创建和目录接口成功；应用内目录、真实 Gmail 授权与只读调用仍待验证。确认无误后再由管理员处理旧密钥；不要将密钥写入文档或聊天。原生 MCP OAuth 客户端配置独立于 Composio 项目密钥。

## Web 注册密码（待部署验证）

本次代码调整后，新用户在 Web 注册填写密码和确认密码；已配置事务邮件时，应先打开注册验证邮件中的链接，再使用密码登录。登录页仍支持邮箱验证码。已有仅通过验证码注册的账户不会自动获得密码，可尝试登录页“忘记密码”设置；真实邮件投递和无密码账户设置密码的完整流程尚未验证。部署后需使用受控测试邮箱检查注册、验证链接、登出、密码重登及重置；不在日志或记录中保存邮箱验证码、密码或验证链接。无需新增环境变量或数据库迁移，本次修改尚未部署。

2026-11-08：Web 聊天背景及双方文字颜色保存在当前浏览器的 `sydney-chat-appearance` IndexedDB 中，不上传服务器或跨设备同步；清除站点数据会丢失设置。更新后每个浏览器首次读取外观时清除其旧气泡、图片和搭配记录，保留背景及独立文字颜色；本次清理不可从应用恢复。尚未打开更新后应用的浏览器不会自动清理。原生移动端独立存储未改，部署和真实浏览器持久化未验证。

## 任务耗时观测（待部署验证）

应用更新后，Worker 会通过现有日志输出 `model.call_timing`，包含运行 ID、操作类型、模型流耗时、首个输出耗时及结果类别，不包含模型端点、提示词、工具参数或密钥。模型流耗时截至终止事件，不包含终止事件后的用量结算；首个输出也可能是思考或工具调用，并非一定是用户可见回复。未开始模型请求时不会生成该记录；请求未结束时尚无最终耗时。原有工具完成事件仍保存在加密事件中，不应为排查输出原始工具参数或结果。

对比同一类任务时，分别核对 Run 的创建、开始、首次可见回复及完成时间，结合模型调用耗时、工具完成事件和审批／执行尝试时间。尝试之间的间隔可能包含等待确认与调度，不能直接等同于人工审批耗时；模型调用耗时也不是整个任务耗时。采用既有日志访问控制和保留策略，真实模型及部署后的采集、对比和回滚待验证。

## 2026-11-08 PR #4 自动部署

PR #4 在提交 `1eae0e09bf7d7049de0813f6c4ada9e35dfeb6c8` 的网页两分片、单元、类型检查、PostgreSQL、原生电脑和生产构建检查通过后合入 main。合并版本 `3e51aed60d20a12ea2222d9041833bd98fdab9bc` 经 Actions `42448630939` 的既有生产流程部署成功；日志确认使用该版本发布镜像，API 和 PostgreSQL 健康。公网 `/health` 返回 200 和 `{"ok":true}`，`/build-id` 为 `20261108045522`。

本次没有手动修改生产环境文件、Composio 凭据、native-linux Provider 或安装示例 overlay。Gmail 独立 MCP 的 OAuth 客户端配置和 Platform 托管连接仍需单独配置及真实授权验证；部署成功不代表应用授权已修复。手机实机布局、人格职责遵循及真实电脑接管仍待验收。回滚继续使用已有固定 revision 的部署入口；本次未演练回滚。

## Hersona 人格库（待部署验证）

人格卡片保存在新增的 `personality_presets` 数据库表，按账号隔离；已应用到 Bot 的指令是独立快照。部署此版本需要使用项目现有数据库迁移流程执行对应 Prisma 迁移，先按既有流程备份数据库，再核对迁移结果、运行角色权限与行级隔离；本次未执行迁移。回滚应用版本不会删除新表，但旧版本无法管理人格卡片；不要为回滚直接删除表。整库备份应包含该表，目前应用账户导出尚未包含人格卡片，不能依赖账户导出备份它们。真实部署、两账号隔离和跨设备使用均待验证。

## 2026-11-07 生产 Compose 本地 overlay（代码已实现，未部署）

native-linux 草案位于 `infra/native-linux/production.overlay.example.yml`，不是已安装的生产配置。它以
`996:986` 运行代理，将真实驱动 socket 的目录只读挂载给代理；API/Worker 只读挂载代理目录并通过
附加组 `986` 连接。宿主机屏幕桥使用 Unix socket 连接 host 网络的 `127.0.0.1:6080`，web 网络命名空间内
另一个桥只监听 `127.0.0.1:16080`。无公开端口。目录的属主、组、遍历及写入权限必须在目标机确认：
代理需要创建 socket，应用用户需要遍历并连接；应用不得能修改代理目录或访问真实 socket。核对 Docker
是否使用用户命名空间映射及实际应用 UID/附加组，不能仅凭示例数字假定权限正确。

维护窗口中先核对生产版本、现有 launcher 和环境配置，再安装包含支持标记的 launcher；管理员审阅草案后
将其安装为 `/etc/rakazo/compose/production.overlay.yml`，属主 root、权限 0640，并确保部署用户可读。
在持久 `.env` 中配置 `RAKAZO_COMPOSE_OVERLAY_FILE`、`RAKAZO_UPDATE_SERVICES=native-screen-web-loopback`、
`SYDNEY_NATIVE_DRIVER_SOCKET=/run/rakazo-native/driver.sock`、`SYDNEY_NATIVE_SCREEN_PORT=16080` 和
`SYDNEY_NATIVE_SCREEN_USER_ID`、`SYDNEY_NATIVE_SCREEN_SPACE_ID`；按授权需要设置可选的
`SYDNEY_NATIVE_SCREEN_BOT_ID`，沿用现有 `SCREEN_PROXY_SECRET`。实际值不得写入仓库。
先验证合并结果、代理权限、屏幕票据和回滚，再经授权切换 `SANDBOX_PROVIDER=native-linux`。
上述配置及次序为待验证草案，不是已执行操作。

关键阻塞：`network_mode: service:web` 与现有 deploy-main 双 web 滚动替换及 updater 重建的实际行为尚未
验证；updater 当前执行的是普通 `compose up`，不显式强制重建该桥，即使服务列表包含它，也不能证明其绑定新的 web 容器。必须在隔离 Linux 环境实测
首次部署、web 替换、更新失败恢复和回滚，确认每个服务流量可达且无旧命名空间残留；未解决前不得上线。

生产本地 overlay 的持久路径是 `/etc/rakazo/compose/production.overlay.yml`，位于
checkout 外部，不会被部署脚本的 `git reset` 覆盖。安装时由管理员创建目录和文件，建议
`root:deploy`、`0640`；文件必须是普通 YAML 文件，不能是符号链接，不能 group/world
可写或 world 可读。生产 `.env` 中设置：

```env
RAKAZO_COMPOSE_OVERLAY_FILE=/etc/rakazo/compose/production.overlay.yml
```

部署 launcher、`deploy-main.sh`、Compose 配置检查、滚出、健康恢复、失败恢复和 updater
都使用基础生产 Compose 文件加该 overlay 的相同顺序。updater 将目录只读挂载。变量留空
时保持旧的单文件行为；配置缺失、路径非法、权限不合规或 Compose 合并失败必须中止并
保留明确错误。

安装或更新持久 launcher：

```bash
sudo install -m 0755 infra/compose/deploy-launcher.sh /usr/local/sbin/rakazo-deploy-main
```

回滚前确认目标 revision 包含 `RAKAZO_LOCAL_COMPOSE_OVERLAY_SUPPORT=1`。目标是旧
revision 且 overlay 已配置时，launcher 会拒绝执行，不能临时删掉 overlay 继续回滚；
应先升级部署脚本或准备经过审阅的兼容入口。overlay 内容和密钥不写入日志，线上真实
权限、Compose 合并、安装和回滚尚未验证。

后续 native-linux 同机 sidecar 应放在该 overlay 中，但继续通过现有 Provider、授权、
租约和 generation 校验接入。sidecar 只能连接受限 socket 代理，不能挂载
`/var/lib/sydney-tunnel-jail/run/driver.sock`、修改 `0600` 或开放公网端口。屏幕链路
仍需单独验证，因宿主机 `127.0.0.1:6080` 不等于容器内的 loopback。

## 2026-11-07 云电脑桌面链路模板（未部署）

仓库新增 `infra/native-linux/sydney-screen-vnc.service`、`sydney-screen-websockify.service` 和 `sydney-screen-tunnel.service`，并提供 `screen.env.example` 与 `screen-tunnel.env.example`。云电脑侧服务只监听回环地址，VNC 使用 `-viewonly`；后台屏幕隧道只把本机 `127.0.0.1:16080` 转发到云电脑回环 `127.0.0.1:6080`。隧道目标、SSH 配置、主机密钥和私钥必须放在服务器 `/etc/sydney/`，不写入仓库。

部署前必须在授权维护窗口核对当前桌面 `DISPLAY`、`XAUTHORITY`、服务账号、noVNC 静态目录和 SSH 转发账号权限；模板默认使用仓库内 Xvfb 的 `:99`，历史 XRDP `:10` 环境需要通过服务器环境文件调整并实测。部署后按 API 屏幕票据、`/novnc` 页面、WebSocket、RFB 握手、截图、输入拒绝和断线恢复顺序验收。本轮未执行安装、启用、重启、端口修改或线上配置变更。

## 2026-11-07 媒体出站限制（未部署）

候选代码对媒体队列提交和轮询增加公网 DNS/IP 出站校验，并禁止自动跟随重定向。原先依赖私网、回环或重定向的 `MEDIA_GENERATION_BASE_URL` 部署在升级后可能无法工作；升级前核对端点及网络策略并在目标环境验证。尚未部署、未执行真实媒体生成和回滚演练。

## 2026-11-07 生产注册邮件配置

复用用户旧项目中保留的 QQ SMTP 配置，在生产 `/srv/rakazo/.env` 配置 SMTP 提供方、隐式 TLS 地址和发件人；凭据不进入仓库。变更前配置保存在 `/srv/rakazo/.env.before-qq-smtp-20261107`，两个文件均为 `0600`。API 容器已重建，其他容器未重建。

部署后公网认证能力显示邮箱验证码和密码找回已启用，健康检查正常；SMTP 服务连接及认证验证通过，未发送真实邮件。回滚前先核对是否有后续配置变更，保留当前配置，再恢复备份并重建 API、复查健康及认证能力；回滚未演练。真实验证码收取、注册和登录尚待验收。

## 2026-11-07 旧后台停用与数据删除

用户明确要求删除旧后台及其数据。旧后台 `sydney-api`、`sydney-worker`、`sydney-tunnel`、`sydney-screen-tunnel` 和 `sydney-web-forward.socket` 已停止并禁用；旧 `sydney` PostgreSQL 数据库、`/var/lib/sydney-control`、`/opt/sydney`、`/etc/sydney`、旧发布快照及指定 Sydney 备份已删除。旧后台系统 PostgreSQL 和独立的 `super-sydney-cloud` 服务保留并 active。

云电脑已删除隔离数据库 `sydney_migration_drill_20261107` 和旧数据迁移副本 `/var/backups/sydney-migration-20261107/source`，该目录下新生产数据库及数据卷的备份仍保留。旧 `sydney-web-cloud` 和 `sydney-web-cloud-link` 已停止并禁用；桌面驱动、VNC/noVNC 保留运行，旧 Web 程序目录和已停用服务定义尚未删除。当前生产 Compose API、Web、Worker 和 PostgreSQL healthy，Caddy 运行中，公网 `/health` 正常。

旧账号、聊天、附件与模型凭据未迁入新生产；已删除的旧数据不能依赖上述迁移备份恢复。未审计其他位置或外部备份，不能保证不存在其他历史副本。当前生产的电脑 Provider 为 `none`，桌面驱动保留不代表新生产已接入云电脑。

## 2026-11-07 旧后台迁移备份与隔离演练

旧后台数据库和数据目录备份位于旧后台 `/var/backups/sydney-migration-20261107/{source.dump,source-data.tgz}`，受限权限副本保存在生产服务器同目录的 `source/` 下。生产数据库及应用数据备份位于生产服务器 `/var/backups/sydney-migration-20261107/{production.dump,production-data.tgz}`。这些备份含敏感数据，应限制访问并安排加密异地保存；源库在备份后仍可写，正式迁移时须重新捕获一致性快照。

旧数据库备份已恢复到生产 PostgreSQL 内的隔离数据库 `sydney_migration_drill_20261107`，并核对 89 条消息和 4 个空间密钥。该隔离库包含真实敏感数据，仅限管理员访问，不是生产库；待演练完成并确认无需保留后安全清理。两端 `ENCRYPTION_KEY` 不同，旧空间密钥、模型凭据和附件不能直接依靠新环境密钥解密；不能覆盖生产密钥或盲目整体恢复。两端备份仅检查归档可读性和隔离恢复，未完成包含文件及解密的恢复演练。

本次尚未向生产数据库或应用数据卷导入任何旧数据，没有改变生产服务或配置。需先验证空间密钥重封装、凭据迁移、附件可读性、现有生产记录合并及 `waiting_input` 任务处理；登录方式和受控真实登录也尚未恢复。

## 2026-11-07 消息操作栏部署

提交 `3dcac9a956b1545cafc6d8039aa2ea9c0ecc2f6b` 通过 GitHub Actions 运行 `42352970919` 发布到生产 Compose 栈，Tailnet 加入和 `deploy-production` 均成功；公网 Web 构建标识 `20261107075223`。服务器 `/srv/rakazo/.last-deployed-revision` 确认为该提交，API、Web、Worker 和 PostgreSQL 容器 healthy，Caddy 运行中；公网首页、`/health` 和认证会话接口返回 200。

部署使用现有 `infra/compose/deploy-main.sh` 镜像发布与回滚流程；未手动修改配置或数据。真实手机长按、桌面鼠标交互和人工回滚尚未验收。

## 2026-11-07：确认生产部署需要 Tailnet

提交 `59b5cfe58` 的源码已将生产入口统一为 `pc.zxlup.xin`。Run `42343223472` 的检查和镜像发布成功，但 `deploy-production` 在 Tailscale OIDC 加入步骤失败，未连接生产机，也未执行回滚或服务变更。随后临时移除 Tailnet 的 Run `42344169631` 进入 SSH 步骤，但以退出码 `255` 失败。

当前部署工作流恢复使用 Tailnet：GitHub Runner 先通过 OIDC 加入 Tailscale，再使用 `production` Environment 中的 SSH 字段连接服务器并执行 `deploy-main <commit>`。`pc.zxlup.xin` 只作为应用和 GitHub Environment 展示地址，不作为 SSH 主机。Tailscale 变量和 `tag:ci` 信任配置需要在外部管理控制台修正后才能继续部署。

## 2026-11-07 提交 f7297933c 全量部署

提交 `f7297933c580131e8473cafff1159bdd215a536c` 已确认工作区干净并推送到 `origin/main`。云电脑在 `/opt/sydney-web-build-f7297933c` 使用现有 Node `22.23.2` 和依赖构建 Web，构建标识为 `20261107042307`，运行目录已切换到 `/opt/sydney-web-stage/apps/web/dist`。

切换前 Web 完整目录保留为 `/opt/sydney-web-stage/apps/web/dist.before-f7297933c`，新产物合并保留上一版 `assets` 哈希资源。后台在 `/opt/sydney-release-f7297933c` 构建 API 和 Worker，运行产物切换前备份到 `/var/backups/sydney-release-f7297933c/{api-dist.before,worker-dist.before}`。本次没有执行数据库迁移，没有修改环境文件、端口、权限或数据目录；数据库 Run 状态没有 `queued` 或 `running`，保留 1 条 `waiting_input` 记录。

部署后云电脑 `sydney-web-cloud`、`sydney-web-cloud-link`、`sydney-pc-nginx` active；后台 `sydney-api`、`sydney-worker`、`sydney-tunnel`、`sydney-screen-tunnel` active。后台 `/ready` 返回 `{"ok":true,"degraded":false}`，Worker 心跳检查通过；公网 `/build-id` 返回 `20261107042307`，首页、认证会话接口和三张 `/avatar-library/{blue-maid,lilac-dragon,orange-flower}.webp` 素材均返回 200，素材类型为 `image/webp`。

回滚时先确认没有后续发布，保留当前 Web 与后台产物，再恢复 `dist.before-f7297933c` 和 `/var/backups/sydney-release-f7297933c/{api-dist.before,worker-dist.before}`，分别重启云电脑 Web、API 和 Worker，并复查公网 `/build-id`、首页、认证会话、后台 `/ready` 及 Worker 心跳；本次未演练人工回滚。

## 2026-11-06 固定头像与个人头像库发布

Web 版本 `20261106131423` 已切换到云电脑 `/opt/sydney-web-stage/apps/web/dist`；前一版完整目录保留为 `/opt/sydney-web-stage/apps/web/dist.before-avatar-library-20261106-r3`，更早候选备份为同级 `dist.before-avatar-library-20261106-r2`。本次发布包含三张 `avatar-library/*.webp` 固定素材、头像库界面和 Web 端 IndexedDB 头像保存逻辑，后台 API、Worker、数据库和环境文件未修改。

头像库数据保存在用户当前浏览器的 IndexedDB 数据库 `sydney-avatar-library`，不会自动同步到其他浏览器、设备或服务器，也不在后台数据库备份中。清除站点数据会删除用户自定义头像。回滚需恢复上述 Web 目录、重启 `sydney-web-cloud` 并复查版本及三张素材，完整回滚尚未演练。

## 2026-11-06 提交 ce7ecaeb8 上线

提交 `ce7ecaeb8` 的 Web、API 和 Worker 已部署；当前仓库随后新增的 `ea2821720` 只包含 GitHub Actions 与文档修订，不包含运行时代码。Web 在云电脑 `/opt/sydney-web-stage/apps/web` 使用现有 Node 22.23.2 和依赖构建，构建标识为 `20261106063543`，运行目录已切换到 `dist`。

切换前旧 Web 目录保留为 `/opt/sydney-web-stage/apps/web/dist.before-ce7ecaeb8`。后台 API 和 Worker 产物切换前备份到 `/var/backups/sydney-release-ce7ecaeb8/{api,worker}`。本次没有执行数据库迁移，没有修改环境文件、端口、权限或数据目录。

部署后重启 `sydney-web-cloud-link.service`、`sydney-web-cloud.service`、`sydney-worker.service` 和 `sydney-api.service`。云电脑 Web、链路、驱动、VNC、noVNC 和 HTTPS 代理均 active；后台 API、Worker、转发 socket 和屏幕隧道均 active。后台 `/ready` 返回 `{"ok":true,"degraded":false}`，Worker 心跳检查通过。

公网 `https://pc.zxlup.xin/build-id` 返回 `20261106063543`，首页、认证会话接口和 POST `/rpc/health` 均正常。部署期间后台资源紧张，首次 API/Worker 构建无输出并导致 SSH banner 暂时超时；未在服务未核对前重启，待后台恢复连接后完成构建、语法检查、服务重启和健康复核。

回滚时先确认没有后续发布，保留当前 `dist`，恢复 `dist.before-ce7ecaeb8` 并重启 `sydney-web-cloud.service`；API 和 Worker 恢复 `/var/backups/sydney-release-ce7ecaeb8/{api,worker}` 后分别重启并复查 `/ready`、Worker 心跳和公网 RPC。完整人工回滚未演练。

## 2026-11-05 手机首屏白屏优化发布

Web 版本 `20261105134933` 基于上一版 `20261105134539` 快照，仅加入首屏 HTML、启动脚本及样式和 PWA 插件调整。构建将启动样式与标志嵌入 HTML，手机主样式由 `mobile-startup.js` 在下载完成后启用；必须将完整 HTML、启动脚本、样式和 `sw.js` 一并发布，不可单独替换 HTML。`theme.js` 加入 PWA 预缓存；未改变 CSP、后台或依赖。

上一版完整产物保留于 `/opt/sydney-web-stage/apps/web/dist.before-first-paint-20261105`，新目录保留旧版哈希资源。回退前核对后续发布、保留当前产物，再恢复备份、重启 `sydney-web-cloud` 并核对版本及接口；完整回退未演练。预览期间使用的回环临时 HTTP 服务和 SSH 转发已停止；公网首屏、会话及健康接口正常，真实 iPhone 与 PWA 缓存更新待验收。

## 2026-11-05 手机新建 Bot 更新

当时云电脑 Web 版本为 `20261105134539`，基于此前在线的 `20261105133934` 快照构建，仅叠加本次新建弹窗、头像选择与侧栏修复。前一版完整目录位于 `/opt/sydney-web-stage/apps/web/dist.before-mobile-bot-sheet-20261105`，新目录保留旧版哈希资源；后台未重新发布。回退需恢复备份、重启 `sydney-web-cloud` 并复查版本及服务，尚未演练。手机 PWA 缓存更新和真实创建尚未验证。

## 2026-11-05 iPhone 搜索栏底部间距发布

Web 版本 `20261105133934` 仅更新手机搜索栏底部间距；上一版完整产物保留于 `/opt/sydney-web-stage/apps/web/dist.before-iphone-bottom-20261105`，新版本保留旧哈希资源。回退前核对后续发布、保留当前产物，再恢复备份并重启 `sydney-web-cloud`，核对公网版本及接口；回退未演练。Web 及隧道 active，公网首页、健康接口、认证会话和新资源返回 200；真实 iPhone 与 PWA 更新待验收。

## 2026-11-05 iPhone 首页视口定位发布

Web 版本 `20261105132910` 基于上一版发布快照更新手机侧栏视口定位；上一版产物保留于 `/opt/sydney-web-stage/apps/web/dist.before-iphone-viewport-20261105`，新版本保留旧哈希资源。回退前需核对后续发布并保留当前产物，再恢复备份、重启 `sydney-web-cloud` 并核对版本和接口；回退尚未演练。云端 Web、隧道和公网首页、健康接口、认证会话及新资源均正常；真实 iPhone 和 PWA 缓存更新尚未验证。

## 2026-11-05 手机首页安全区修复发布

Web 版本 `20261105131952` 基于上一版发布快照，仅更新侧栏和账号入口的重复安全区偏移；上一版完整产物保留在 `/opt/sydney-web-stage/apps/web/dist.before-mobile-safe-area-20261105`，新版本保留旧哈希资源。回退前应核对后续发布并保留当前产物，再恢复备份、重启 `sydney-web-cloud`、核对版本和接口；回退尚未演练。

发布后公网静态资源正常，认证会话接口超时；排查发现云端到后台的隧道无响应，后台 API 健康和会话接口正常。重启 `sydney-web-cloud-link` 和 `sydney-web-cloud` 后，隧道与公网会话接口均返回 200。真实手机及 PWA 缓存更新尚未验证。

## 2026-11-05 手机首页布局发布

当时云电脑 Web 版本为 `20261105131324`，基于上一版发布源码快照仅更新手机首页侧栏、账号入口及样式并在云端构建；运行目录为 `/opt/sydney-web-stage/apps/web/dist`，上一版完整产物保留于 `/opt/sydney-web-stage/apps/web/dist.before-mobile-layout-20261105`，新产物保留旧版哈希资源。后台 API 和 Worker 未更新。

回退时先确认没有后续发布，保留当前产物，再恢复上述备份、重启 `sydney-web-cloud` 并检查公网版本和接口；完整回退尚未演练。公网首页、认证会话、健康接口和新资源返回 200；已安装 PWA 的缓存更新和真实手机视觉尚未验证。

## 2026-11-05 手机启动体验更新

当时云电脑 Web 版本为 `20261105130710`，基于上一版发布快照仅更新 `mobile-startup.js` 和 `mobile-startup.css` 后重新构建；前一版完整目录位于 `/opt/sydney-web-stage/apps/web/dist.before-mobile-startup-20261105-2107`，新版保留旧版哈希资源。后台未重新发布。回退需恢复该目录、重启 `sydney-web-cloud` 并核对版本与资源；尚未演练。已安装 PWA 的缓存更新和真实手机效果尚未验证。

## 2026-11-05 Web 与后台发布

本次运行版本基于 `5e6c5be05` 和部署时的未提交工作区快照。Web 构建版本为 `20261105124011`，运行目录为云电脑 `/opt/sydney-web-stage/apps/web/dist`，旧版完整目录为同级 `dist.before-release-20261105-2036`；新版资源目录同时保留旧版哈希资源。API 和 Worker 运行产物位于后台 `/opt/sydney/apps/{api,worker}/dist/index.js`，旧文件及旧 source map 备份于 `/var/backups/sydney-release-20261105-2036`。新版 source map 名为 `index.release-20261105.js.map`。

后台候选构建的外部依赖指向 `/opt/sydney-release-20261105-2036/source` 中的依赖快照，该目录是运行依赖，不得清理；生产环境文件和数据目录未更改，数据库 schema 一致，未执行迁移。Web 和后台已分别重启并完成基础健康检查。回滚需协调恢复旧 Web 目录及 API、Worker 备份，重启对应服务并复查健康；完整回滚尚未演练。原生手机应用未发布。

本次启用了邮箱验证相关逻辑，已有未验证账户可能无法继续使用旧会话；公网能力接口显示邮箱验证码可用，真实 QQ 邮件收取和账号验证尚未验收。下方较早记录中的产物哈希、待部署状态均为历史状态。

## 手机网页启动动画（历史记录）

网页构建需一并发布 `mobile-startup.js`、`mobile-startup.css` 与 `sydney-mark.png`，它们加入 PWA 首屏预缓存；首次启动仍受现有网页资源及网络条件影响。当前仅完成本地离线验证，未构建或部署；需在授权服务器构建后核对资源、PWA 更新、手机首屏及加载失败恢复。回滚沿用既有完整 Web 产物回退流程，尚未针对本次演练。

## Bot 创建兼容修复（API 已部署）

API 已切换至 SHA-256 为 `e77b86f1ff58663ac18142168cfc733969b6cdfbc4a635047f13b2c1649d69a0` 的候选产物，source map 保留为 `index.bot-avatar-candidate.js.map`；头像契约源码也已同步。旧产物、source map 和源码分别保存在原目录下的 `.before-bot-avatar-20261105` 文件。切换脚本条件分支解析失败，随后手动重启服务并确认健康；回滚需要恢复上述备份、重启 API 并验证，尚未演练。真实账号创建和 Worker 运行待验。

Worker 随后基于旧运行产物应用头像契约最小补丁并重启，当前产物 SHA-256 为 `7351ea7cde000a84665bd752a79217a89e43657c7491fb83a70f42c0874c7713`，旧 Worker 产物及 source map 保存在对应的 `.before-bot-avatar-20261105` 文件。补丁不改变行数，但旧 source map 在修改行的列位置可能不精确；下次正常发布应从同步源码完整重建。回滚需恢复 Worker 备份并重启、检查心跳，尚未演练；若 API 仍接受 `fluid`，旧 Worker 契约可能不兼容，应协调回滚。真实账号创建和任务运行仍待验收。

## 注册验证码修复（待部署）

本次修改尚未部署。上线需同时更新 Web 产物与后台认证代码并重启相关服务，部署后用受控真实邮箱验收验证码收取、错误码拒绝及成功登录。已有未验证账号在启用邮件能力后不能使用旧会话；邮箱验证码证明所有权时会清理此前未证明的密码及其他凭据。部署前应核对现有账号状态并准备回滚；未执行服务器操作。

## 注册开放配置（2026-11-05）

注册开放步骤和验收顺序见 [注册开放实施清单](design/REGISTRATION_ROLLOUT.md)。后台 `/etc/sydney/backend.env` 原先使用 `SIGNUPS_ENABLED=false`，本次备份为 `/etc/sydney/backend.env.before-signups-20261105` 后只改为 `SIGNUPS_ENABLED=true` 并重启 `sydney-api`；不把 SMTP、Resend API key 或真实发件人凭据写入仓库和文档。

注册开放后，复用旧项目 QQ 邮箱 SMTP：转换为 `EMAIL_PROVIDER=smtp`、`SMTP_URL=smtps://...`、`EMAIL_FROM=...` 写入 `/etc/sydney/backend.env`，配置前备份为 `/etc/sydney/backend.env.before-qq-smtp-20261105`。重启后 `/ready` 正常，认证能力接口显示密码认证、邮箱验证码和密码找回开启；密钥和发件人地址不写入仓库或文档。

用 `example.invalid` 临时地址验证发送钩子时产生了 QQ 邮箱退信，已删除两个临时账号和验证记录；后续不得用会触发真实外部投递的地址做回归。用户截图发现认证邮件仍带上游品牌；仓库邮件模板已改为 Sydney，源码已同步到后台，但重建 API 期间服务器 SSH 超时，构建是否完成、运行产物是否更新及重启状态未复核。恢复邮件配置可还原 `backend.env.before-qq-smtp-20261105`，恢复构建产物可使用 `index.js.before-sydney-email-brand-20261105`，完整回滚未演练。

邮箱验证链接点击、邮箱验证码登录、密码找回、allowlist 首个账号准入、欢迎邮件、线上新邮件标题和正式浏览器视觉均未完成真实验收。服务器恢复后应先检查构建状态、`index.js` 品牌字符串、`/ready` 和认证能力接口，再用不会触发外部投递的方式验证邮件模板。

## 云电脑文字输入驱动修复

2026-11-05 云电脑 `/opt/sydney-native/driver.py` 已修复 `xclip` 后台进程导致的输出管道超时，并重启 `sydney-driver.service`；服务与 socket 状态正常。部署前文件备份为 `/opt/sydney-native/driver.py.before-clipboard-20261105`。如需回滚，应先核对后续驱动改动，再恢复备份并重启驱动；回滚尚未演练。独立剪贴板读写已验证，实际网页粘贴和 Agent 端到端验收仍待完成。普通剪贴板不提供凭据隔离。

## PC 启动动画资源（待打包验证）

桌面静态资源复制脚本将 `apps/desktop/src/splash.html`、`splash.css` 和 `apps/web/public/sydney-mark.png` 复制到 `apps/desktop/dist/`，由 Electron 本地加载；无需增加服务器配置。静态复制已执行，安装包包含这些资源及真实客户端启动尚未验证；部署前须通过现有桌面打包流程确认。

## Google 头像绑定配置（待验证）

该功能复用现有唯一 OIDC 提供方，需在 Google 创建 OAuth Web 客户端并登记 `BETTER_AUTH_URL` 对应的 `/api/auth/callback/oidc` 回调，再为 API 配置 `OIDC_ISSUER=https://accounts.google.com`、`OIDC_NAME=Google`、`OIDC_CLIENT_ID` 和 `OIDC_CLIENT_SECRET`；保留 `AUTH_PASSWORD_ENABLED=true` 可继续使用邮箱登录。密钥只放服务器密钥配置，不写入仓库。切换发行方会影响已有 SSO 绑定，并启用现有 SSO 登录入口，配置前需确认部署现状。上述 Google 配置、回调及部署均未实测；完成部署后需用匹配邮箱的已验证账户测试授权、头像显示与原有邮箱登录。

## 提交 a36741a41 云端部署与服务重启（2026-11-05）

代码提交 `a36741a41` 已推送 `origin/main`。云端网页运行目录 `/opt/sydney-web-stage/apps/web/dist` 已切换到本地构建标识 `20261105092721` 的完整 Web 产物；新产物同步时校验 325 个文件且不含“获取移动应用 / Get the mobile app”。旧产物完整备份为 `/opt/sydney-web-stage/apps/web/dist.before-a36741a41`，新目录同时保留旧 `assets` 哈希资源，避免已打开页面请求旧文件失败。回滚时先保留当前 `dist`，恢复该备份并重启 `sydney-web-cloud.service`，再核对 `/build-id`、首页、会话接口与 API `/ready`；本次完整人工回滚未演练。

本轮重启顺序为云端 `sydney-web-cloud-link.service`、`sydney-web-cloud.service`，后台 `sydney-worker.service`、`sydney-api.service`。状态检查：`systemctl is-active sydney-web-cloud sydney-web-cloud-link sydney-api sydney-worker sydney-web-forward.socket sydney-screen-tunnel`；API 健康：`curl -fsS http://127.0.0.1:3100/ready`；公网检查：`https://pc.zxlup.xin/build-id`、`/`、`/api/auth/get-session` 和 `/ready`。用户明确不启动本机开发服务，本机 `pnpm dev`、Web、API、Worker 和 supervisor 保持未启动；Docker 中已有的开发数据库容器不属于该服务栈。

## UI 重做部署（2026-11-05）

提交 `4d49b063d` 的 Web 产物在 `/opt/sydney-web-build-4d49b063d` 使用现有依赖和 Node 22.23.2 构建，当前运行目录为 `/opt/sydney-web-stage/apps/web/dist`，构建标识 `20261105061136`；上一版位于 `/opt/sydney-web-stage/apps/web/dist.before-4d49b063d`，并将旧资源保留于新产物中。需回滚时先保留当前产物，恢复该备份并重启 `sydney-web-cloud`，再核对 `/build-id` 和 API 健康；人工回滚尚未演练。当前用量热力图误采用日历样式，尚不符合用户提供的 Cohort retention 参考。

## PC 界面部署（2026-11-05）

Web 静态产物由源码提交 `f8133e602` 在云电脑 `/opt/sydney-web-build-f8133e602` 复用 `/opt/sydney-web-stage` 现有依赖构建；运行目录为 `/opt/sydney-web-stage/apps/web/dist`，构建标识为 `20261105035626`。替换时把上一版资源一并保留在新目录，减少已打开页面请求旧哈希文件失败的风险；上一版完整产物保留在 `/opt/sydney-web-stage/apps/web/dist.before-f8133e602`。

仅在确认需要回滚时，先保留当前 `dist`，将 `dist.before-f8133e602` 移回 `dist`，重启 `sydney-web-cloud`，再检查公网 `/build-id`、首页、POST `/rpc/health` 和 API `/ready`；此前首次切换失败时自动恢复过上一版，但完整人工回滚步骤尚未演练。该次只更新静态产物，没有更新服务器源码、依赖或后台 API；真实登录和聊天功能待验。

PC 聊天气泡图片与背景一样保存在当前浏览器的 `sydney-chat-appearance` IndexedDB 中，不上传后台；清除该站点的浏览器数据会丢失这些本地素材和外观配置。不同浏览器、设备或 Electron 的独立存储不会自动同步，实际客户端存储路径和迁移方式尚未验证。

## PC 域名源站 HTTPS（2026-11-05）

后台 `sydney-api.service.d/30-pc-origin.conf` 最后加载 `/etc/sydney/pc-origin.env`，将 `WEB_ORIGIN` 与 `BETTER_AUTH_URL` 设置为正式域名；保留原 `/etc/sydney/backend.env`。systemd 的 `EnvironmentFile` 会覆盖 `Environment`，更改时需核对加载顺序。回滚时先备份并移除该 drop-in，执行 `systemctl daemon-reload` 与 `systemctl restart sydney-api`，再验证 `/ready` 和所需登录入口；回滚会短暂中断 API，尚未演练。当前旧回环网页来源不再被视为受信任来源，正式登录和其他认证方式验收见 V-054。

云电脑部署 `sydney-pc-nginx.service`，配置为 `/etc/nginx/sydney-pc.conf`，以 `sydney-web-stage` worker 访问 `/run/sydney-web-stage/web.sock`。80 端口仅提供 ACME webroot `/var/lib/sydney-pc-acme`，443 使用 `/etc/letsencrypt/live/sydney-pc/` 的证书并转发 `pc.zxlup.xin`。云端当前使用 `sydney-web-cloud.service.d/30-pc-host.conf` 设置 `RAKAZO_ALLOWED_HOSTS`；仓库的 `PC_BACKEND_HOSTNAME` 接线尚未部署。

自动续期使用 `certbot.timer`、webroot 和 `/etc/letsencrypt/renewal-hooks/deploy/sydney-pc-reload`，续期演练见 V-053。状态检查：`systemctl status sydney-pc-nginx sydney-web-cloud sydney-web-cloud-link certbot.timer`；配置检查：`nginx -t -c /etc/nginx/sydney-pc.conf`。正式证书签发时没有设置邮件，需通过定时检查监测证书和续期状态。

用户将 Cloudflare 全局模式调整为 Full (strict) 后，公网页面与 API 健康检查返回 200；真实客户端和 WebSocket 尚未验收。回滚 HTTPS 入口可停止并禁用 `sydney-pc-nginx.service`；移除 Host 附加配置前先备份，再重启云端 Web 恢复原配置，Web 会短暂中断。停用入口后证书自动续期将无法经 webroot 完成，恢复入口或调整续期前应检查 `certbot.timer` 和该证书续期配置；上述完整回滚尚未演练。旧的本地转发链路及后台服务不依赖该公网入口。

## 云端 Web 与只读屏幕当前运行形态（2026-11-05）

当前 Web/PC 后台由云电脑上的 `sydney-web-cloud.service` 运行，服务通过 `sydney-web-cloud-link.service` 与后台 API、屏幕隧道及本地入口连接；后台 `sydney-web.service` 是旧的本机预览服务，当前停用，避免与 `sydney-web-forward.socket/service` 争用入口端口。正式 HTTPS 主机名配置为 `PC_BACKEND_HOSTNAME` 后，云端 Vite 预览服务才会接受该 Host。查看状态应同时检查云端 Web、云端链路、后台转发、API 和 `sydney-screen-tunnel.service`。

网页静态产物已同步到云端运行目录，旧版本保留在云端 `apps/web/dist.before-v045`。升级云端 Web 时先构建完整产物、保留上一版、切换后重启 `sydney-web-cloud.service`，再通过本机转发登录和检查 Bot 页面。云端桥接服务内部使用独立端口，不能直接把该内部端口当作公网入口。

原生 `native-linux` 屏幕始终按只读方式签发，不携带控制租约或输入令牌；即使数据库中存在控制租约，也不能借此开启交互。当前已验证全屏 iframe 可创建，Canvas/WebSocket 长时间稳定性和撤销仍待验证。

## 手动启动租约与预览移除（2026-11-05）

原生电脑的手动启动改用当前执行租约，运行号前缀为 `boot_`（驱动只接受字母、数字、下划线和连字符）。修改已随后台 API 产物部署并完成一次真实启动；后台备份位于 `/var/backups/sydney-manual-boot-20261104`。部署时须以 `install -m 644` 写入产物，避免服务账号读不到文件。

侧栏电脑预览已移除，桌面画面只在全屏窗口加载。该网页改动只在本地构建，尚未同步到云电脑上的运行目录；云端目录是一次部署快照，升级必须先同步构建与依赖并保留旧版本，可复现流程仍未演练。

## 原生只读屏幕部署与限制（2026-11-04）

后台已启用独立 `sydney-screen-tunnel.service`，API 通过 `/etc/sydney/native-screen.env` 和 systemd drop-in 配置限定身份及屏幕端口；API 产物和源码部署前备份位于 `/var/backups/sydney-screen-20261104`。相关服务和 API `/ready` 已检查正常。恢复备份前应核对现有部署版本及后续变更，使用服务可读取的产物权限；完整回滚未演练。

云电脑 `sydney-screen-vnc.service` 为服务端只读，`sydney-screen-websockify.service` 与 VNC 均绑定回环；回环不能隔离云电脑上的其他本地用户。真实 Web 电脑启动目前因原生运行租约缺失失败，尚不能显示画面；不要直接修改数据库状态或取消租约检查。手动启动租约、安全停止及重启恢复均待验证。

## 任务工作台移除（2026-11-04）

当前源码已移除独立任务工作台和专用任务 API，旧 `/app/tasks` 地址将跳转聊天。此改动尚未部署；部署前须核查是否存在正在运行或需要处理的受管任务，移除 API 后将无法通过该接口控制或核对这些任务。未删除数据库中的任务、运行或授权记录；未验证部署与回滚流程。

## 截图图片回传 Web（2026-11-04）

`computer_observe` 和带观察结果的 `computer_act` 在拿到新画面后，会通过现有 ArtifactStore 保存 PNG，并在当前线程发布 `image` 消息块。Web 从该消息块读取附件并显示真实图片；相同 `frameId` 的重复画面仍只供模型复用，不重复发布附件。

本次已在后台 `/opt/sydney` 更新适配器并重建 `sydney-api`、`sydney-worker`；验证命令为 `systemctl is-active sydney-api sydney-worker sydney-web sydney-tunnel` 和 `curl -fsS http://127.0.0.1:3100/ready`。更新前的源码备份为 `/opt/sydney/packages/adapters/src/run-tools-computer.ts.before-screenshot-fix-20261104`，回滚前应先停止 API/Worker、恢复源码并重新构建，完整回滚尚未演练。

截图附件使用现有上传上限；上传失败只记录后台日志并保留模型工具结果，不应据此判断截图已显示。需要确认用户可见结果时，应在 Web 中检查消息是否存在图片元素且图片自然尺寸大于零，不能只看模型文字。

## 存储分层迁移准备（2026-11-04）

已连接一台后台和一台云电脑进行只读盘点。后台数据目录约 452 KiB，可用内存约 65 MiB；主要内存压力来自 API、Worker 和 Web 进程。暂缓对象存储部署和文件迁移，优先调查服务减压；具体边界见 [存储划分与迁移方案](design/STORAGE_SPLIT_MIGRATION.md)。

后台环境未配置对象存储 bucket 或 endpoint，云电脑未发现对象存储服务。云电脑 Ubuntu 24.04.4，约 3.6 GiB 内存、约 2.3 GiB available、根分区剩余约 48 GiB；Sydney 驱动、VNC/noVNC 和代理保持 active。云电脑 UFW inactive，全局 SSH 配置允许 TCP forwarding；专用账号限制见 ADR-0010。后台随后 SSH 握手超时，尚未实施服务调整。

用户授权并通过控制台执行 `systemctl stop sydney-web` 后，可用内存由约 26 MiB 回升到约 504 MiB；API、Worker 和隧道显示 active，Web 显示 failed，主进程退出状态 143。随后经云电脑中转连接后台 SSH 22 成功，主机密钥校验通过，API `/ready` 返回正常；Web 页面仍不可用。Web 依赖预览中间件及远程桌面代理，迁移方案和重启恢复尚未验证。

后续复核发现 Web 已于 22:19 重新启动，首页及认证会话接口返回 200。API 于 22:21 曾因部署产物读取权限错误重试，随后恢复 active，`/ready` 返回正常；Worker 和隧道也为 active。当时可用内存约 400 MiB，swap 未使用。API 部署产物在核查期间发生外部变更，本次未覆盖该产物、未修改服务配置，实际迁移及长期资源表现仍待验证。

Web 已迁至云电脑试运行：云电脑 `/opt/sydney-web-stage` 是当前运行目录，`sydney-web-cloud` 和 `sydney-web-cloud-link` 均已启用；前者使用独立网络命名空间，后者通过仅服务账号可访问的 `/run/sydney-web-stage` 套接字连接后台。云电脑系统账号 `sydney-web-stage` 的配置在 `/var/lib/sydney-web-stage`，仅持有独立屏幕代理密钥和受限 SSH 密钥；后台 root 的该公钥只允许访问 API、屏幕目标和指定回环监听，不能执行命令或连接数据库。临时归档传输密钥及其后台授权已移除，原有维护密钥保留。

后台 `sydney-web-forward.socket` 已启用，在原回环地址 5173 经 `sydney-web-forward.service` 转发到云电脑；原 `sydney-web.service` 已停止并禁用，应用文件保留。切换期间设置的五分钟自动回滚计时器在登录和服务检查通过后取消。需要恢复旧 Web 时，在后台执行 `/usr/local/sbin/sydney-web-forward-rollback`，它会停用转发并启用原 Web；脚本语法已检查，但完整回滚尚未演练。恢复后如不再使用云端服务，可在云电脑停用 `sydney-web-cloud` 和 `sydney-web-cloud-link`；撤销后台专用公钥和清理目录前先确认不再需要，维护公钥不能一并移除。

当前云端目录是一次部署快照，后台 `/opt/sydney/apps/web` 的后续构建不会自动同步。Web 升级必须先同步匹配的构建和依赖到云电脑、保留旧版本并验证后切换；可复现的升级与回退流程尚未验证。当前登录、Bot 列表、首页、屏幕通道和无效授权拒绝已验证；重启云端 Web 服务后入口恢复。没有运行中的电脑，真实授权屏幕页面、两机整机重启及长期负载尚未验证。见 [ADR-0013](../docs/adr/0013-isolated-cloud-web-proposal.md)。

用户要求长期保留的维护私钥位于本机用户目录 `.ssh/sydney-codex-cloud-20261104`，公钥为同名 `.pub`；私钥 ACL 已去继承，仅授予当前 Windows 用户读取。两台服务器 root 已授权该公钥；当前本机经云电脑中转后台 SSH 22，使用固定的主机密钥校验。撤销时先确保其他管理入口可用，再从两台服务器的 `authorized_keys` 精确移除对应公钥，并按用户要求处理本机私钥；不要将私钥或凭据提交仓库。

未验证项：云电脑对象存储安装或端点、网络与 TLS、实际迁移 counts、服务重启、断线恢复、备份恢复、清理和资源复测。未验证命令不得作为生产安装步骤直接复制执行。

## Web 模型与云电脑复测（2026-11-04）

用户配置模型后，Web 文本模型请求和只读云电脑截图均已验证通过。模型凭据只通过应用的加密存储使用；不要从数据库导出密文或把 API 密钥写入日志、命令和文档。测试结束时云电脑保持运行，若不继续使用，应从 Web 正常停止；当前 native-linux Provider 的 `stop`/`destroy` 仍不支持，不能用服务重启代替安全停止。

本轮清理了单人测试库中的登录限流计数，以解除自动化测试的 15 分钟登录限制；没有删除用户、模型凭据或任务数据。数据库现有失败 Run 保留用于排查，后续清理前应确认不再需要诊断记录。复测时后台可用内存约 81 MiB，运行更多模型任务前应先观察内存和交换空间。

## 云电脑截图故障修复（2026-11-04）

后台 API/Worker 已重新构建，包含团队 home key 身份校验修复及驱动超时方法标识。上一版编译产物和原 Provider 文件位于后台机 `/var/backups/sydney-native-fix-20261104`；还原需先停止相关服务、核对版本和数据兼容性，回滚步骤未演练。

云电脑 `/opt/sydney-native/driver.py` 已更新以修复命令连接检测阻塞；原文件备份为同目录的 `driver.py.before-socket-fix-20261104`。驱动重启会改变 generation，执行前须确认没有活动任务，不能把重启视为远端工作已安全停止。运行状态可用 `systemctl status sydney-driver.service sydney-driver.socket` 检查，重启或回滚后的完整恢复流程未演练。

Web 真实截图任务完成，原生 stop/destroy、可信停止和断线恢复仍不可用或未验证；应用报回滚失败时不可直接推断远端没有副作用。后台内存仍紧张，实测可用内存约 119 MiB。

## Web 个人测试（2026-11-04）

后台机 `sydney-web.service` 运行已构建的 Web 预览服务，只监听 `127.0.0.1:5173`，API 继续监听本机 3100；Web 通过现有 Vite 代理连接 API，未修改公网 Caddy 配置。服务使用 `/etc/sydney/backend.env`，并可写入 Web 的 `.vite-temp` 和 `asset-archive` 目录。使用 `systemctl status sydney-web sydney-api sydney-worker sydney-tunnel` 检查服务；`systemctl stop sydney-web` 可停止 Web。服务设置为开机启动，重启恢复尚未实测。

当前 Windows 本机通过临时 SSH 本地转发访问 `http://127.0.0.1:5173/`，该连接不是开机自动恢复；断开后可按现有 SSH 管理配置重新转发本机 5173 至后台机回环 5173。已创建个人测试账号，初始凭据保存在本机用户目录 `.ssh/sydney-web-test-login.txt`，服务器临时明文凭据文件已删除，仓库不保存凭据。注册仍关闭；模型尚未配置。

本次 Web 基线为提交 `b7c91915d`，额外包含部署时工作区四个未提交的 Web 文件；后续更新须记录源码快照及构建结果。构建期间曾暂停 API 和 Worker 并在结束后恢复。服务运行时后台机可用内存约 246 MiB，真实模型任务可能产生更大压力；外网访问、任务闭环和恢复仍待验收。

## 永久清除旧项目数据（2026-11-04）

用户要求释放存储空间后，已删除 Sydney Myself 数据目录、旧回滚目录、此前创建的恢复备份，以及 Infinite Canvas 的 WebDAV 数据和配置；同时删除两个项目对应的 Docker 镜像。此前保留的数据和恢复备份现已不可用，下面的旧项目移除记录仅描述清除前的状态。Caddy 的历史配置备份仍存在，不包含本次已清除的数据目录。

清除后根分区可用空间约 23 GiB，Sydney API 就绪及 Worker 心跳检查通过，后台、隧道、数据库和其他已检查服务保持 active。未执行恢复或其他业务功能回归。

## 移除两个旧项目（2026-11-04）

按用户要求移除 Sydney Myself 个人网站及 Infinite Canvas 画布的部署：停用并删除个人网站的两个 systemd 服务和两个应用目录，删除画布及其 WebDAV 容器；Caddy 的原有画布和 WebDAV 代理已替换为 HTTP 404，Caddy 自身继续运行。两个容器镜像未删除。

当时保留了个人网站数据、画布 WebDAV 数据、旧回滚目录及恢复备份；这些内容随后按用户要求删除，见上方永久清除记录。

移除后 Sydney API `/ready` 和 Worker 心跳检查通过，Sydney 服务、隧道、PostgreSQL、Caddy、Docker、Super-Sydney 云同步及站点统计服务保持 active；其他项目业务功能未回归。

## 后台部署（2026-11-04）

后台机运行提交 `b7c91915d` 的 API 和 Worker，应用目录 `/opt/sydney`，systemd 服务为 `sydney-api.service`、`sydney-worker.service`，依赖已有 `sydney-tunnel.service`；Worker 在 `/etc/systemd/system/sydney-worker.service.d/health.conf` 获准写入 `/tmp` 心跳。API 仅监听 `127.0.0.1:3100`，数据库仅监听本机 5432；没有修改现有反向代理或开放公网。`systemctl status sydney-api sydney-worker sydney-tunnel`、`curl -fsS http://127.0.0.1:3100/ready` 可检查状态；Worker 心跳检查为 `sudo -u sydney-control node /opt/sydney/apps/worker/dist/health-check.js`。

原生 PostgreSQL 18 数据位于 `/var/lib/postgresql/18/main`，应用数据库为 `sydney`，迁移 owner 和受 RLS 限制的运行角色分离。`/etc/sydney/backend.env` 保存运行配置，`/etc/sydney/migration.env` 保存仅 root 可读的迁移凭据；应用数据在 `/var/lib/sydney-control/data`。同目录下原有 `.ssh` 是双机隧道所需密钥，不得覆盖。新增 PostgreSQL 签名源 `/etc/apt/sources.list.d/sydney-pgdg.list` 指向阿里云镜像；系统 `libpq5`、`libpq-dev` 已升级，详见 ADR-0011。

启动和停止分别使用 `systemctl start sydney-api sydney-worker` 和 `systemctl stop sydney-api sydney-worker`；停止后台不会自动删除数据。更新、重新迁移及回滚操作尚未演练，更新前应备份数据库、应用数据和受保护的环境文件，并保存旧版本；恢复需要同时保留数据库、加密密钥和隧道材料。不要使用删除数据库、数据目录或 PostgreSQL 服务作为简单回滚。尚未建立异机备份或验证恢复。

后台部署时服务器可用内存曾降至约 279 MiB，Worker 队列有并发与连接池告警，真实任务可能触发内存或交换压力。当时尚未创建账户或部署 Web；后续 Web 测试状态见上方记录。真实模型、公开访问、完整任务和重启恢复仍需单独验收。

## 双机隧道试接（2026-11-04）

后台机创建 `sydney-control` 系统账号，其私钥、固定的云电脑主机密钥和连接文件位于 `/var/lib/sydney-control/.ssh`；`sydney-tunnel.service` 使用 `/run/sydney-tunnel/driver.sock`，现已启用并设置开机启动，当前截图检查通过。服务状态可用 `systemctl status sydney-tunnel.service` 查看；停用可执行 `systemctl disable --now sydney-tunnel.service`，实际停用和重新启用恢复尚未演练。

云电脑安装 `xdotool`、`xclip`、`imagemagick` 及系统依赖；驱动位于 `/opt/sydney-native/driver.py`，`sydney-driver.socket` 监听 `/var/lib/sydney-tunnel-jail/run/driver.sock`，由独立 `sydney-tunnel` 用户连接；驱动以 `sydney-desktop` 用户运行，工作区位于 `/home/sydney-desktop/.local/share/sydney/workspaces`。驱动服务当前绑定 `DISPLAY=:10` 和该桌面账号的 `.Xauthority`，且通过 drop-in 允许写 `/tmp`；桌面会话变更后不可假设其仍然有效。

云电脑 `/etc/ssh/sshd_config` 末尾添加了专用账号的 Match 配置，原配置备份为 `/etc/ssh/sshd_config.sydney-tunnel-backup`；本次放宽前另备份为 `/etc/ssh/sshd_config.sydney-before-personal-trial`（保留实际文件名）。受限账号公钥文件为 `/etc/ssh/sydney-authorized-keys/sydney-tunnel`。按单人使用要求，该账号现允许本地 TCP 转发，并可能访问云电脑可达的其他 TCP 服务；仍禁止交互终端、代理及 X11 转发并启用 chroot，详见 ADR-0010。此前的调试日志设置及临时日志挂载已撤销。

需要停止使用时先停用后台隧道，再于云电脑将专用账号 Match 段的 `AllowTcpForwarding local` 改为 `AllowTcpForwarding no`，执行 `sshd -t` 验证后重载 SSH；以上停用和回滚尚未演练。变更 SSH 前先保留云控制台和既有管理连接，检查当前配置及备份，避免覆盖后续修改。

后台与云电脑分别为本次管理临时添加了公钥；任务结束后确认不再需要管理连接，再按公钥注释核对并删除对应行。本机专用私钥和后台隧道私钥均未写入仓库。已建立连接所需的部分服务和配置，但没有部署后台应用，也没有验收生产运行、重启恢复或任务闭环。

## 本机品牌预览记录（2026-11-04）

用户授权后，在 Windows 本机使用已有 Node 24 恢复依赖，并启动 Docker 中的 `rakazo-dev-postgres` 开发数据库及 Web、API、Worker 和 supervisor。数据库使用本机回环端口 54318，Web 预览为 `http://127.0.0.1:5173`；这是临时开发环境，不是双机部署。

项目 `pnpm dev` 在 Windows 的数据库迁移步骤遇到 `spawnSync pnpm ENOENT`，本次对新建开发数据库分别执行 Prisma 迁移、队列迁移和运行角色初始化后启动各服务。该绕行流程尚未整理为可复现的运维命令；不要将其作为服务器部署步骤。原生安装包和图标的系统兼容性尚未验证。

## 后台机桌面清理（2026-11-04）

按用户要求清理后台机的桌面组件，只保留运行中的项目。目标机为 Ubuntu 22.04、2 核约 1.7 GiB，通过云控制台添加临时公钥、经 SSH 443 端口操作；本次未使用密码或长期密钥。

清理前核实：运行项目为 `site_total`、`super-sydney-cloud`、`sydney-myself-api`、`caddy`、`docker`；容器 `canvas-webdav`、`infinite-canvas`；项目目录与依赖中不存在 `xrdp`、`xfce`、`Xvfb` 或 `DISPLAY=` 引用；`super-sydney` 实际以无界面 `uvicorn` 云同步 API 运行，其他服务同样无图形依赖。因此判定桌面组件不被项目使用。

已执行：结束活动桌面会话 `c6` 并停止 `xrdp`、`xrdp-sesman`；`apt-get purge` 移除 `xrdp`、`xorgxrdp`、`xfce4`、`xfce4-session`、`xfce4-panel`、`xfdesktop4`、`xfwm4`、`plank` 共 8 个软件包。随后结束 `sydney-desktop` 的遗留 systemd 用户会话（含 pipewire、dbus、gvfs、gnome-keyring 及 geoclue agent），`snap remove --purge` 移除 Firefox 及其孤立内容快照 `gnome-46-2404`、`mesa-2404`、`gtk-common-themes`，并执行 `apt-get autoremove` 清理孤立 X11 与桌面依赖。

清理结果：可用内存由清理前约 81 MiB 升至约 1066 MiB，负载由约 3.56 降至约 0.1，磁盘占用由 14 GB 降至 13 GB。`site_total`、`super-sydney-cloud`、`sydney-myself-api`、`caddy`、`docker`、`ssh` 全部保持 active；本地接口复测正常（canvas 200、cloud `/docs` 200、webdav 401、myself-api 根路径 404）。`snap list` 仅剩 `bare`、`core20`、`core22`、`core24`、`lxd`、`snapd`。后续复查发现仍有 XFCE 插件、工具和库，`/usr/share/xfce4` 也仍存在；模拟继续卸载会引入 85 个新软件包，因此未执行，需先分析依赖。

过程中一次 `snap remove firefox --purge` 被误启动，识别后立即执行 `snap abort`，变更状态为 `Undone`，数据未丢失；随后在确认无项目依赖后重新执行并成功移除。之后按用户确认执行 `userdel -r sydney-desktop`，账号及其家目录（约 17 MB）已删除，相关用户进程与登录会话一并消失。该删除不可恢复，且不再保留图形登录。xrdp 配置随卸载移除，`/etc/xrdp/xrdp.ini.sydney-backup` 一并消失，如需恢复桌面须重新安装并配置。

回滚：重新安装 `xrdp xorgxrdp xfce4 xfce4-session xfce4-panel xfdesktop4 xfwm4 plank`，重新安装所需 snap（Firefox 及其内容快照），重新创建 `sydney-desktop` 并重设密码，恢复 xrdp 监听策略；未演练。临时公钥 `sydney-temporary-cleanup` 仍在 `/root/.ssh/authorized_keys`，本次暂未移除；确认不再需要维护连接后，应删除该文件中对应的整行并复验 SSH 登录策略。

## 双机部署方向

首版改为后台和云电脑分机，见 [双机实施方案](design/TWO_HOST_DEPLOYMENT.md)。本节以下既有同机 systemd、socket、账号和服务路径为历史草案，不可直接套用于双机。SSH 转发、远端账号、身份校验、服务管理、备份和回滚命令均尚未在两机验证；实际安装或配置变更发生后再记录确切步骤和结果。本次没有连接服务器或修改服务。

## 新服务器轻量桌面迁移（2026-11-04）

测试服务器为 Ubuntu 24.04，2 核、约 3.6 GiB 内存。安装 XFCE、Thunar、xfce4-terminal、Plank、xrdp、xorgxrdp 和 dbus-x11；软件源索引过期导致首次下载失败，刷新索引后安装成功。安装期间软件包维护脚本重启了云管理服务；安装后 SSH、Docker、containerd 和 xrdp 均显示运行。

新建无 sudo 权限的 `sydney-desktop`，家目录为 `/home/sydney-desktop`，密码由用户交互设置。`.xsession` 启动 XFCE；壁纸位于 `~/Pictures/sydney-wallpaper.png`，用户登录自启动脚本设置壁纸、隐藏桌面图标和自动隐藏面板，Plank 启动器配置在 `~/.config/plank/dock1/launchers/`。

后续登录验证：桌面账号已成功通过 xrdp 登录，壁纸和桌面会话正常显示。用户截图显示默认底部 XFCE 面板与 Plank 重叠，已通过 XFCE 配置保留上方面板并移除底部面板，原面板配置备份在同目录 `xfce4-panel.xml.sydney-backup`；调整后的视觉效果待用户确认。

用户再次反馈重叠后，检查 X 窗口发现旧的底部面板仍留在当前会话；重启 XFCE 面板进程加载新配置后，窗口列表仅显示顶部 XFCE 面板和 Plank。启动脚本改为只配置保留的顶部面板，用户侧最终视觉效果仍待确认。

窗口拖动卡顿排查：用户确认面板重叠已恢复。空闲时检查约 2.5 GiB 可用内存、CPU 基本空闲，远程桌面分辨率为 2880×1800；该快照不能排除操作时的资源或网络瓶颈。已在桌面账号的 XFCE 窗口管理器中将 `/general/use_compositing` 从 `true` 改为 `false`，用户反馈窗口拖动明显流畅；Dock 外观变化尚未确认。回滚时在该账号的图形会话内运行 `xfconf-query -c xfwm4 -p /general/use_compositing -s true`；回滚尚未演练。

按用户要求改用 Chrome：从 Google 官方下载并安装 `google-chrome-stable` 157.0.8103.38，安装程序新增 `/etc/apt/sources.list.d/google-chrome.sources`，临时安装包已删除；已请求取消之前的 Firefox Snap 安装，回滚状态待确认。Plank 的 `chrome.dockitem` 指向 `/usr/share/applications/google-chrome.desktop`。以桌面用户启动后观察到 Chrome 空白窗口；Dock 点击、网页访问及重新登录后的表现仍待验证。若需卸载 Chrome，应先备份用户浏览器数据并核对软件包及其软件源，避免误删其他软件依赖；尚未演练卸载。

用户截图显示网页中文为方块；检查发现系统没有中文字体，已安装 `fonts-noto-cjk`，fontconfig 可匹配简体中文字体，用户确认显示正常。如需回滚，可评估其他应用的字体依赖后卸载该包，尚未演练。

桌面迁移后的临时管理密钥清理曾尝试执行，但命令被执行策略拦截；不能假设服务器公钥或本机私钥已经删除，后续需通过允许的方式核实清理。现有远程桌面使用 SSH 隧道，调整访问密钥前应保留可用的服务器管理入口。

## 测试服务器后台代理（2026-11-04）

按用户要求安装 Mihomo 1.19.33，以独立系统账号运行 `sydney-mihomo.service` 并设为开机启动。程序位于 `/usr/local/bin/sydney-mihomo`，配置为 `/etc/sydney-mihomo/config.yaml`，状态目录为 `/var/lib/sydney-mihomo`；服务仅监听 `127.0.0.1:7890`，未修改全局代理或防火墙。安装前校验下载文件的 SHA-256，服务状态及通过本机代理访问测试网站已验证。当前规则仅为 `MATCH,DIRECT`，没有导入订阅，无法视为节点代理已配置；Chrome 尚未接入。

使用 `systemctl status sydney-mihomo` 检查服务，使用 `systemctl stop sydney-mihomo` 可停止服务，使用 `systemctl disable --now sydney-mihomo` 可停用并关闭开机启动；停止和重新启用尚未演练。删除前须先备份所需配置并确认无程序依赖代理。不得将订阅链接或节点凭据写入仓库、运维记录或聊天。

后续已通过受限文件导入用户提供的订阅，配置为本机 HTTP 代理、订阅节点选择及私网直连；配置和订阅含敏感信息，权限仅允许 root 及服务账号所需访问。空配置备份为 `/etc/sydney-mihomo/config.direct-backup.yaml`。通过本机代理测试百度和 Google 均返回 HTTP 200，SSH、xrdp、Docker 等服务保持运行；节点选择、费用、订阅续期及长时间稳定性未验证。

桌面账号的 Chrome 启动器 `~/.local/share/applications/google-chrome.desktop` 和 Plank 的 Chrome 项已配置本机代理参数，系统全局环境和现有进程未修改；需要完全退出所有 Chrome 窗口后重新启动才能验证新的代理设置。恢复时将该 Plank 项指向 `/usr/share/applications/google-chrome.desktop` 并移除用户级 Chrome 启动器，完全退出 Chrome 后重启；恢复操作尚未演练。订阅 URL 已出现在聊天中，建议用户在服务商处更换或重置订阅链接，之后重新导入。

用户随后要求服务器流量按规则使用代理。已启用 Mihomo TUN 自动路由：私网及云 DNS 路由例外直连，SSH 服务端 TCP 回程规则优先使用主路由表，其他匹配流量走节点。规则模式不等于按国内外自动分流，当前没有地区分流规则。服务的 systemd drop-in 位于 `/etc/systemd/system/sydney-mihomo.service.d/10-tun.conf`，授予 `CAP_NET_ADMIN` 和 `CAP_NET_RAW`，权限风险和适用范围见 [ADR-0009](../docs/adr/0009-test-host-proxy-network-permissions.md)。

启用时设置了三分钟自动回滚保护；初次普通程序访问 Google 失败，启用 HTTP/TLS 域名嗅探后 root 和桌面账号的 HTTPS 测试均成功。另测得新 SSH 登录、现有远程桌面隧道、本机代理及现有服务正常，私网目标走主网卡。通过上述测试后取消了自动回滚定时器，未执行回滚演练。手动回滚入口为 root 执行 `/etc/sydney-mihomo/rollback-tun.sh`，该脚本恢复 TUN 之前的配置、移除服务 drop-in 与 SSH 回程规则并重启代理；运行前保留云控制台管理入口。备份和脚本中可能涉及敏感配置，不应写入仓库。

系统 DNS 没有整体接管；域名嗅探不能覆盖所有协议，也不保证 DNS 隐私。Docker 容器流量、IPv6、非 HTTP/TLS 协议、故障恢复及重启后的路由尚未验证，当前测试不能证明所有流量均按预期代理。

`/etc/xrdp/xrdp.ini` 已改为监听 `127.0.0.1:3389`，原文件备份为 `/etc/xrdp/xrdp.ini.sydney-backup`；未改动防火墙规则。通过本地 SSH 隧道测试端口连接成功，尚未验证完整 RDP 登录。测试访问需要先建立到服务器 SSH 22 的本地转发，再连接本地转发端口；桌面账号密码应由管理员在服务器控制台运行 `passwd sydney-desktop` 交互设置，不要写入文档或聊天。

回滚前确认当前配置及桌面用户数据：若恢复 xrdp 安装后默认监听，核对备份与当前配置，再恢复备份并重启 xrdp；默认配置可能公开监听，须先处理访问控制。若不再使用此桌面，可先备份用户数据并评估共享依赖，再移除专门安装的软件和用户；未执行卸载或数据删除。临时 SSH 管理密钥仅用于迁移，任务结束后应移除。

## 测试桌面浏览器（2026-11-04）

在一台已有 Ubuntu 22.04、xrdp 和 XFCE 的测试服务器上，桌面账号的 Firefox Snap 从独立桌面 D-Bus 会话启动失败；将启动进程的 `DBUS_SESSION_BUS_ADDRESS` 指向该用户的 `/run/user/<UID>/bus` 后，已观察到 Firefox 进程和窗口。该发现仅覆盖此次桌面测试，不代表本项目已在服务器部署或 P4 验收完成；实际网页访问、重新登录后的启动和用户点击 Dock 尚待验证。

此次仅为该桌面账号建立 `~/.local/share/applications/sydney-firefox.desktop`，并将 Plank 的浏览器项与 HTTP、HTTPS、HTML 的默认处理器指向它。启动器中的 UID 对应该测试账号，迁移到其他账号时必须核对；不要直接复制硬编码地址。原 Dock 浏览器项备份在 `~/.local/state/sydney-browser.dockitem.backup`，原 `~/.config/mimeapps.list` 存在时备份在同目录的 `sydney-mimeapps.list.backup`。回滚前核对备份和当前关联，通过桌面设置恢复首选浏览器，并恢复对应 Dock 项；不要覆盖其他用户后续修改。

## 原生 Linux 驱动初版

原生桌面基础操作使用 X11、`xdotool`、`xclip` 和截图命令；文字输入通过桌面剪贴板及粘贴快捷键完成，剪贴板可能被桌面账号其他进程读取，不能将其作为凭据隔离机制。原生终端命令最长 8 秒；超时、连接中断或截图失败时已发生的动作可能无法确定，不自动重试。图形能力不表示实时屏幕流、人工接管或可信停止可用；以上仍需目标 Linux 与实际桌面实测。

任务重试现在沿用首次派工的任务截止时间和已记录的调用、token 预留；过期任务拒绝重新派工。旧代码曾在重试时清零这些计数，历史任务可能低估用量，不能根据当前累计值断言历史成本上限；需要重新创建任务或人工核对历史账单。此修订尚未通过真实数据库验证。

指针动作的类型和按钮在移动鼠标前校验；多动作请求不是事务，某项失败时前面的动作可能已经执行，应先检查桌面状态再决定后续操作。该行为仅经离线替身验证，尚未在目标 Linux 验证。

源码和部署草案均位于当前仓库根目录；下文中的服务路径仍需在目标 Linux 服务器核对。应用服务通过 `SYDNEY_NATIVE_DRIVER_SOCKET` 指定 Unix socket，示例值为 `/run/sydney-driver.sock`。

systemd 草案按源码在 `/opt/sydney` 根目录部署编写，不包含独立 `/app` 子目录；实际安装路径须随服务器制品布局调整并实测。

应用仓库 `infra/native-linux/` 包含 systemd 文件和 `desktop-proxy.env.example`。这些文件是尚未在目标 Linux 验证的部署草案，当前不可照搬宣称生产可用。目录和账号分别是 `/var/lib/sydney-control`、`/var/lib/sydney-desktop`、`sydney-control`、`sydney-desktop`；后者不能读取后台环境文件、数据库和备份。套接字 `/run/sydney-driver.sock` 由 systemd 建立并只允许控制账号连接，驱动再次校验对端 UID。

桌面代理单独配置，示例地址仅为占位；不要把模型密钥或带口令的代理地址写进桌面用户可读配置。Provider 的命令限制为八秒且不会自动重放失联请求；浏览器流、交互式接管和可信后台进程静止证明尚不可用。桌面用户本身可操作其有权限访问的环境，同账号进程不构成相互隔离；在目标机完成隔离和对抗性验证前不得用于生产。

2026-11-04 模块审计补充：Provider `stop()`/`destroy()` 已改为明确返回 unsupported；driver `cancelRunWork`/`inspectBackgroundWork` 已接线，但 inspect 不能证明 idle，运行进程清理和 Linux 行为仍待验证。Executor 已给 Provider 注入 Run owner/fence/期限。managed state RPC 现检查版本，cancel 不可恢复，pause 恢复前检查 effect；managed model/tool guard 显式切回 tenant context。上述新增代码和测试未运行，生产 PostgreSQL/Linux 仍待验。不得把 cancel 请求成功解释为进程已清理，也不得把 unknown 映射为 idle；UI 手动确认仍不是服务端静止证明。详见 [Native Linux 审计](../docs/audit/native-linux.md)、[DB 审计](../docs/audit/db-task-execution.md) 和 [Pi 审计](../docs/audit/pi-adapters.md)。

租约修订：native 动作前现查询 Run 的 owner/fence/到期时间，并在存在共享电脑租约时查询该租约；请求期限不超过所查到期时间或八秒。依赖查询后发请求，不能保证即时撤销，也未在真实 PostgreSQL/Linux 验证。模型/工具的 managed guard 现拒绝过期 Run 租约；检查失败时动作不可继续，不应通过手工延长租约绕过。

控制与工具限制：managed runtime 运行期间约每两秒读取控制状态，状态不允许或数据库读取异常时中断运行信号；native 在途请求随信号断开。暂停不保证终止已发出的外部副作用或脱组进程，停止确认及暂停后恢复仍不可用。managed 暂不暴露 helper、`ask_user` 和接管等 Pi 直通入口，也不运行自动模型审核；普通 Run 的这些能力不因此关闭。本批代码尚未进行真实环境验证。

启动准备阶段：Run/电脑租约取得并创建 Attempt 后，managed 控制轮询在模型和连接准备之前启动；控制拒绝或读取失败会中止准备并尝试记录失败。更早的租约领取与已发出的准备请求仍不能保证即时终止；不得据 Run 失败推断电脑进程已停止。该调整未做真实服务回归。

排队任务取消：服务端在 Task 行锁事务中仅取消仍处于 `queued` 且属于 `managed_task` 的当前 Run，并清理其可恢复状态；若 Worker 已抢先领取，控制状态保留未确认，不能人工修改为已停止。完成结果必须有独立完成证据；历史不完整或存在任意 Run 未结算副作用时不得确认成功。

排队取消现在同事务记录 `run.cancelled` 并在提交后尽力通知，通知失败由订阅方按游标追赶；事务锁竞争与通知尚未在服务器验证。派工重复请求尝试保留已有作业的唤醒，失败由现有队列修复器处理，此行为未做真实队列演练。内部 checkpoint 不作为待核对外部效果。

失败 Run 本身不构成后台静止证明；未静止或存在未知效果时，工作台不开放重试。停止证据尚不可用时，不要修改控制状态来强行重试。

授权续期只适用于仍处于 queued/leased/running/waiting 状态的当前 Run；已完成、失败或取消的 Run 不得用旧 mandate 续期。waiting 状态的桌面与外部副作用边界需在 Linux 服务器演练后确认。

原生驱动对工作区文件列举、读取、写入和导出请求会再次验证 Run lease、短期限和 fence；Provider 预检查通过不代表请求一定成功。桌面截图预览可以走只读路径，取消和 inspect 仍返回保守结果；未在目标 Linux 验证前，不得据此宣称已实现可信急停或完整账号隔离。

## 新任务门禁的部署要求（2026-11-03）

新 Task.executionState、Run.taskMandate 迁移为增量列。本地尚未执行迁移。生产启用前停止所有旧 Worker，再迁移和部署新版 API/Worker，最后开放新任务入口。旧 Worker 不识别授权门禁，不能依靠 schema 向后兼容允许其混跑新任务。

任务接口只操作显式创建的新任务；普通聊天仍保留上游行为。暂停和撤销写入控制意图，受门禁保护的后续动作会被拒绝；runtime 期间轮询触发尽力中断，但并非即时。`quiesced=false` 表示没有证据确认工作静止；当前停止确认接口拒绝成功，暂停后无法通过该入口恢复或核对副作用。不要手动重放未知的外部副作用。主执行预算显示预留值，实际用量与费用仍以原用量记录为准；缺失值为未知。

状态：规划与填写框架，尚未部署服务器；本文件当前不提供已验证的生产安装或启动命令。

关联需求：PA-009、PA-010、PA-013 至 PA-017。技术方向见 [ADR-0008](../docs/adr/0008-separate-control-and-desktop-hosts.md)。

## 1. 目标部署形态

后台 Linux 服务器原生运行 Web、API、Worker、Pi 和 PostgreSQL；独立云电脑运行浏览器、桌面和驱动，不以 Docker 电脑为首版运行方式。跨机通信及两机的账号、服务名、路径和端口将在 P4 定义并实测。

后台与桌面使用不同运行账号。Agent 默认不持有后台密钥、数据库文件、后台服务管理权限或任一服务器 root 权限；主机分离不代替认证和网络隔离。

当前本机只保留源码、依赖和文档，不自动重启已停止的 Docker 或恢复服务；不通过绕过上游生产保护完成原生接入。

## 2. 资产与配置登记

| 项目 | 当前状态 | 形成实测记录的阶段 |
| --- | --- | --- |
| 服务器、系统版本、资源和地区 | 已登录用户指定的新测试服务器，确认 Ubuntu 24.04、2 核和约 3.6 GiB 内存；项目尚未部署 | P1、P4 |
| 部署代码版本与制品 | 固定底座已记录；Sydney 运行制品未生成 | P3、P4 |
| Node.js、包管理器、PostgreSQL 与系统依赖 | 服务器版本及安装流程待验证 | P4 |
| 后台、Worker、桌面驱动运行账号 | 测试桌面账号已创建；后台及数据库运行账号和隔离验权尚未完成 | P1、P4 |
| systemd 服务名与启动顺序 | 已有设计候选，尚未实现或验证，不提供启动命令 | P4 |
| 数据、文件、浏览器配置与日志目录 | 设计候选见原生 Linux 文档，尚未创建和验权 | P1、P4 |
| 模型、App 和系统密钥配置方式 | 待确定；文档只写字段与来源，不写真实值 | P1、P5 |
| 域名、TLS、反向代理与认证 | 待确定 | P4、P5 |
| 代理、包源和模型出站网络 | 按服务器实际网络验证 | P4、P5 |
| 文件、数据库、密钥备份与恢复 | 待定义保留期、存储位置及演练 | P6 |

## 3. 后续必须补齐的操作说明

每一项先写前提、权限、影响范围和回退方式，再附已验证的命令与结果；不从开发脚本猜测生产操作。

| 运维场景 | 必须记录的内容 |
| --- | --- |
| 首次安装 | 系统前提、依赖来源、固定版本、用户与目录权限、配置生成、数据库初始化 |
| 启动与停止 | 实际服务、依赖顺序、健康检查、超时、停止对当前任务的影响 |
| 桌面接管 | 如何观看、接管、交还，命令残留与敏感输入如何处理 |
| 升级 | 旧版本、目标版本、迁移兼容性、维护窗口与成功检查 |
| 回滚 | 制品与数据库兼容条件，禁止在无法兼容时仅替换程序 |
| 备份 | 数据库、产物、浏览器配置与密钥各自的范围，保留期和访问权限 |
| 恢复 | 在隔离环境恢复并验证任务、文件和授权；未知副作用不自动重放 |
| 凭据轮换 | 受影响服务、旧数据解密依赖、撤销流程与复验 |
| 资源与费用 | CPU、内存、磁盘、进程、任务时限、模型用量与费用未知的处理 |
| 故障排查 | 模型失败、数据库不可达、桌面离线、任务卡住、磁盘满和代理异常 |
| 数据删除 | 记忆、对话、执行记录、文件及备份各自的删除范围 |

## 4. 当前可确认的限制

- 完整服务、原生桌面驱动和真实任务尚未验收。
- 尚无可用生产回滚或恢复演练结果。
- 原有 Docker 试点记录保留作历史，不作为本目标部署的安装指南。
- 后台机的实际连接与授权范围尚未确认，不扫描本地私人 SSH 凭据或自动连接推测的服务器。
- 独立主机不会自动提供可信的远端停止保证；停止 Agent 输入、取消任务与停止服务器是不同能力，按实际实现展示。

## 5. 本轮策略开发的运维影响

P1 设计细节见 [原生 Linux 方案](design/NATIVE_LINUX_DESIGN.md)：候选系统、账号、路径、端口、签名协议、服务和备份流程全部待 P4 授权服务器验证。当前不据此执行安装、开端口、创建账号或签发凭据。

P2 在应用核心包新增纯派工和授权判定，未增加配置项、依赖、数据库列或生产服务，暂不影响现有运行行为。没有部署制品，因此不执行生产升级或回滚。`maxRuns` 是策略输入，不是已支持的环境变量，也不等于 token 上限。

实际集成前必须检查：历史读取与派工在同一事务中、授权从可信存储获取且执行前复核、取消/接管及旧 fence 被阻断、未知副作用不会自动重放。现有应用尚未调用新策略，不能依靠它保护生产工具。

本机验证选择已安装 Node.js 24.15.0，只运行指定核心文件的 Vitest 单 worker、核心包类型检查及指定文件的 Biome；不启动 Docker、PostgreSQL、桌面或真实模型。具体执行与失败记录以 [验证记录](VALIDATION.md) 为准。

## 云电脑实时桌面服务（2026-11-04）

云电脑服务器已确认运行 Ubuntu 24.04。桌面当前由 XRDP 创建在 `DISPLAY=:10`，桌面用户为 `sydney-desktop`。已安装 Ubuntu 软件包 `x11vnc`、`websockify` 和 `novnc`，并启用以下两个云电脑侧服务：

- `sydney-screen-vnc.service`：以 `sydney-desktop` 用户读取 `DISPLAY=:10`，仅监听 `127.0.0.1:5900`。
- `sydney-screen-websockify.service`：将 noVNC 静态页面和 WebSocket 代理提供在 `127.0.0.1:6080`，转发到本机 `5900`。

已验证 `x11vnc` 能读取当前 X11 桌面；通过 SSH 本地端口转发访问 `vnc.html` 返回 200，并完成 WebSocket 到 VNC 的 RFB `003.008` 握手。端口没有对公网开放，后台服务器仍需通过受控的跨机隧道访问 `6080`。

查看状态使用 `systemctl status sydney-screen-vnc.service sydney-screen-websockify.service`。本次未执行停止、回滚、重启恢复或公网访问配置；已安装的软件包和 systemd 单元属于服务器状态，不等于仓库中的应用 Provider 已完成屏幕会话接线。XRDP 会话变化后必须重新确认 `DISPLAY`、`.Xauthority` 和服务状态。

后台侧的 `sydney-tunnel.service` 仍只验证了原有驱动 Unix socket 转发；本轮没有后台管理密钥，未修改其配置来转发云电脑的 `6080`。接入屏幕前必须在后台服务器以现有运维身份增加受控的本地端口转发，确认 Web/API 的屏幕目标生成和回环访问，再做重启恢复验证。不要把云电脑本机的 `6080` 直接开放公网。

后续进展：后台另设 `sydney-screen-tunnel.service`，以 `sydney-control` 身份复用现有专用密钥及固定主机密钥，将 `127.0.0.1:16080` 转发到云电脑回环 `6080`；未重启原驱动隧道。云电脑 `/etc/systemd/system/sydney-screen-vnc.service.d/10-view-only.conf` 将 VNC 服务设为服务端只读。后台页面、WebSocket 握手和 RFB 标识已通过，重启与断线恢复未测。查看状态可使用 `systemctl status sydney-screen-tunnel.service`；如需停止屏幕隧道可使用 `systemctl disable --now sydney-screen-tunnel.service`，该停用命令尚未实测。隧道和云电脑屏幕端口仅监听回环，但无独立认证，同机其他账号可能读取画面；应用认证、授权和隔离接线未完成前不能将其视为安全的公开服务。

可选配置为 `SYDNEY_NATIVE_SCREEN_USER_ID`、`SYDNEY_NATIVE_SCREEN_SPACE_ID`、`SYDNEY_NATIVE_SCREEN_BOT_ID` 和 `SYDNEY_NATIVE_SCREEN_PORT`，四项均配置时才启用对应身份的只读屏幕 URL；后台已部署，重启恢复待验。不得将真实身份标识写进仓库或将它们视作凭据；API 仍需执行现有用户与屏幕票据授权。建连和连接复核时检查驱动代次，真实连接在驱动重启时的失效行为仍待验证。

后续部署尝试：后台 `/var/backups/sydney-screen-20261104/source.tar` 与 `index.js` 为本次屏幕接线前的备份，五个源文件已暂存。候选构建仅计划写入 `apps/api/dist/index.screen-new.js`，执行后 SSH 握手超时，实际运行状态未知；未执行正式产物替换、API 重启或屏幕身份配置。重连后先检查候选构建进程、API/Worker/Web 和原隧道状态、内存及日志，再决定继续或回滚；备份恢复尚未演练。

实时屏幕问题记录（2026-11-05）：用户复测仍无法连接实时画面。已确认云电脑 Web 使用独立网络命名空间，宿主机看不到 `5174` 属正常；应在 Web 进程命名空间内检查 `5174`、`3100`、`16080`。当前已确认三个端口和 `/run/sydney-web-stage/api.sock`、`screen.sock`、`web.sock` 存在，API `/ready` 与本机 `5173` 页面均返回 200。曾重启 `sydney-web-cloud-link.service` 和 `sydney-web-cloud.service`，重启后基础状态恢复，但不能据此判断实时屏幕已恢复。

后续排查必须保留一个已登录浏览器会话，单次记录 `computer/screenUrl`、`/novnc/.../vnc.html`、`/novnc/.../websockify` 的请求和 WebSocket 关闭码，并同步查看云电脑 `sydney-web-cloud`、云电脑 SSH link、后台 `sydney-web-forward` 和 API 日志。重点区分 API 屏幕票据复核、后台 `15173` 反向转发、WebSocket 握手和云电脑 `6080` 上游四个阶段。不要继续高频创建登录会话；本轮排查已触发测试账号登录限流 429。未确认断点前，不恢复已停用的旧 `sydney-web.service`，不开放公网 VNC/noVNC 端口，不修改数据库状态。详细验证记录见 V-049。

## 6. 状态投影与只读历史适配

新增 `readTaskExecutionHistory` 仅在现有匹配的 tenant 上下文中读取数据，拒绝无上下文、其他租户或 system 上下文；不能为了调用方便关闭 RLS 或增加系统绕过。它通过 RepeatableRead 单事务读取元数据，当前尚无真实 PostgreSQL 验证或 API 入口接线。

默认每次最多返回 100 个 Run、1,000 个 Attempt、1,000 个普通 Effect；任一超限即标记历史不完整。通过函数参数可以在 1 至 10,000 范围调整每类数量，没有新增环境变量。后续运维遇到 history incomplete 时，应按授权分页/补读取方案修复，不能直接改标志为完整或据可见片段执行重试。当前尚未实现分页入口。

数据库异常直接返回错误路径，不用空历史掩盖故障。查询不选择提示词、错误详情、checkpoint 或工具原文，仍需按现有日志和租户策略保护元数据。

界面后续接线时必须保留 cancelling/pausing/interrupted 与原因。数据库 Run.cancelled、租约过期和收到取消请求均不等于进程已清理；只有可信停止确认才能显示完成取消。Run.completed 仍需独立完成证据才能显示任务成功。不要通过修改 Task.status 或 completionEvidence 布尔值来手工“修好”任务。

本轮没有 schema、迁移、服务、依赖或部署配置变化；未部署、无需执行生产回滚。代码只读模块的升级/启用仍需后续发布验证，不能宣称已有线上状态投影。

## 7. 恢复演练清单（待服务器验证）

恢复执行补记（2026-11-03）：`native-linux` Provider 已注册进 sandbox 工厂，`/app/tasks` 任务路由已挂载。运维侧配置仍遵循本清单；启用时需设置 `SANDBOX_PROVIDER=native-linux` 和 `SYDNEY_NATIVE_DRIVER_SOCKET`，部署匹配的 Linux 驱动及 systemd 单元，并先在目标机完成隔离验证。部署顺序仍为：停旧 Worker → 执行迁移 → 启动新版 API/Worker → 启用新任务。

以下清单是 P6 执行要求，当前没有任何一项在目标服务器验证。每项先在隔离或维护环境演练，记录实际命令、结果和偏差后，才能写入生产操作说明。

| 场景 | 演练要求 | 禁止的误判 |
| --- | --- | --- |
| 控制面断线 | 断开 API/Worker 与数据库、驱动或浏览器的连接；确认活动任务进入保守状态，恢复后按租约和版本继续或标为未知 | 不能把 UI 恢复当成子进程已停止 |
| Worker/API 重启 | 重启服务后确认旧 Run 租约、fence、授权到期和控制意图仍被校验 | 不能重放 requestId 或未决外部副作用 |
| 桌面/驱动重启 | 重启显示、驱动或浏览器会话，确认新代次拒绝旧请求，旧截图和输入队列不跨代复用 | 不能把新桌面画面当作旧任务已恢复 |
| 取消请求 | 取消活动 Run 后核对进程、文件和外部请求；无法确认时必须保留 unknown/residual | 不能用“已发送取消”当作“已停止” |
| 撤销授权 | 撤销后尝试旧工具、旧 URL 和旧桌面动作，确认全部拒绝；续期仅影响显式新授权 | 不能通过旧聊天上下文重新获得权限 |
| 重复 nonce | 重放 create/dispatch 请求；相同载荷返回原记录，不同载荷冲突 | 不能把幂等回执当成新执行 |
| 结果未知 | 对超时的外部副作用先核对后 reconcile；未核对不得标记成功 | 不能自动重试不可幂等请求 |
| 数据库备份恢复 | 备份后在新隔离环境恢复，核对任务、Run、Attempt、授权、产物和用量记录 | 不能把 dump 成功当成业务恢复成功 |
| 文件与配置恢复 | 恢复 workspace、浏览器 profile 和后台配置；分别核对权限与可用性 | 不能恢复桌面不可读取的后台密钥到桌面环境 |
| 升级回滚 | 按“停旧 Worker、迁移、新 API/Worker”顺序演练；验证旧制品不兼容新门禁时只能回滚到兼容迁移 | 不能混跑旧 Worker 和新任务 |

演练前必须准备：隔离恢复环境、加密备份、受限数据库账号、桌面与后台账号、模型替身或明确同意的真实模型、已知外部测试目标。每轮演练后清理测试授权与外部资源。

## 插件宿主离线试点

2026-11-04：仓库增加仅由测试显式启动的固定样例子进程，不新增配置、服务、生产进程、数据路径或部署步骤。该样例以执行测试的账号运行，不是安全沙箱；不要将其用于加载未知插件。生产启用、资源限制、升级与回滚流程尚未设计完成或验证。

## 聊天外观本地数据

2026-11-04：Web 首版代码将聊天背景图片、气泡样式及搭配保存在当前浏览器的 IndexedDB 数据库 `sydney-chat-appearance`，不新增服务器配置或后台数据路径。设置中可取消预览、恢复默认或删除单项并保存；浏览器清除站点数据会删除该数据库，不跨浏览器或设备同步，也不包含在服务器备份中。恢复此前数据须依赖浏览器自身的备份能力，尚未演练；新前端部署及真实浏览器持久化尚未验证。

## 移动端工作台玻璃样式

2026-11-06：Web 移动端新增搜索框、连接应用、新建 Bot、侧栏列表、账号菜单和集成弹窗的玻璃质感样式。该变更只涉及前端 CSS 与组件类名，不新增环境变量、服务、数据库、权限、数据目录或部署步骤。`backdrop-filter` 不支持时由主题背景和边框样式回退；真实浏览器和手机实机视觉仍待验证。

## Bot 人格库

2026-11-06：人格库是 Web 前端的静态预设，创建或切换人格时复用 Bot 已有的 `instructions` 更新接口和指令历史，不新增数据库、环境变量、服务、权限或数据路径。部署前需重新构建 Web 资源；回滚前端即可移除人格选择入口，已保存的 `instructions` 数据仍按原有 Bot 指令逻辑保留。
