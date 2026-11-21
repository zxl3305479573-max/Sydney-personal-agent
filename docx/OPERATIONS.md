# 运维手册

## 欢迎卡片自由输入等待收口（2026-11-21）

候选交付目录 `/srv/rakazo-releases/onboarding-wait-20261121`。运行源码位于共享数据库包，但暂停与后续任务创建由 Worker 执行，因此必须同时替换 API 和 Worker 的 `dist/index.js`、map 及 `packages/db/src/events.ts`；只更新 API 源码不足以修复该时序。沿用各自线上源码、固定镜像和依赖，保留已有八个项目聊天源码挂载、配置和迁移账本，不部署主工作区其他改动。

隔离构建与 schema-only 数据库／HTTP 验证通过后，源码 `d7db91355` 已上线。切换前确认 queued／leased／running 为零、无有效电脑执行租约和线上基线未变化；当前 overlay 已备份至交付目录的 `production.before.yml`。只重建 API、Worker 及 API 画面回环桥，六个允许文件挂载之外的归一化 Compose 配置一致。产物哈希、API／Worker healthy、外部 health／ready 和迁移账本通过。失败时还原备份并重建同一组服务；人工回退演练未执行。

遗留状态维护调用同一 `retireSupersededIntroInTransaction`：在会话行锁内验证介绍等待、同一用户后续 Run 和原用户消息绑定，再让已有退休逻辑检查全部待回答块。不能按 Bot 名称、时间、卡片文字或首页状态直接批量取消；不能处理审批、凭据、接管或一般用户任务。服务器 `repair-before.json` 以 0600 权限备份精确候选 Run、Task、Attempt 与卡片，不将个人消息／备份提交仓库。结果 requested=3、retired=3、skipped=0，复核剩余候选为零；三个正常首页投影均 idle，旧卡片与活动 Run 已收口，原有另外两条真实等待未变。汇总证据为同目录 `repair-result.json` 和 `repair-verified.json`，通过正常 PostgreSQL fanout 通知最终游标。手机沿用 `1.0.21`，本批没有客户端改动，不新增 OTA。


## 项目聊天管理与 iPhone 1.0.21（2026-11-21）

在生产固定镜像中编译 API 单入口，交付目录 `/srv/rakazo-releases/project-chat-20261121-1021`。覆盖八个源码及两个编译产物，替换 `1.0.20` 的旧挂载并保持只读。保留生产模型同意范围。只重建 API 与其画面回环桥，校验挂载和产物摘要、健康状态和迁移账本。数据库结构、Worker、文件绑定和原生底座沿用运行版本。变更前的 overlay 备份 `production.before.yml` 用于恢复 `1.0.20` 的 API；恢复后按原 Compose 项目及 env 重建上述两服务。人工回退演练待执行。

后台于北京时间 17:50 切换并通过公开健康检查。手机沿用 `sideload`／`sydney-ios-ip-1`，Run `44891565107` 成功，线上 `1.0.21` 启动包和 55 项资源通过。用「设置 → 检查更新」重启 App，并在「关于」核对 `1.0.21`。上一版 `1.0.20` 更新 ID 为 `01a1fd35-3b12-712b-bafa-11fea72d4b81`，必要时沿用原 Expo 回退流程。验证既有聊天和临时 Bot 的步骤见 [iPhone 验收](ACCEPTANCE.md#iphone-项目-bot-验收pa-021pa-022)。

## 项目头像后台补丁与 iPhone 1.0.20（2026-11-21）

本次需同时交付后台名单头像与项目 Bot 设置接口，以及 iOS `sideload`／`sydney-ios-ip-1` 的 `1.0.20`。后台沿用生产固定镜像 `sha256:c96d99f5225c070881df3db541cda13a11060a02b6b8e33f7168e10d70ddd2e9` 与原有依赖、Prisma 结构和设备开关，不执行迁移、不更换 Worker。最小源码为 `project-workspace-read.ts`、contracts 的 `domain.ts`／`rpc.ts`／`project-workspace.ts`，以及 API 的 `routes/bots.ts`／`routes/project-workspaces.ts`。后者仅补 get／update／能力，保留生产 `uses: ["model"]`；不夹带其他候选的记忆同意或 router 变动。

服务器交付目录 `/srv/rakazo-releases/project-avatar-20261121-1020` 保存 `source/manifest.json` 源码清单／前后摘要、`compiled/` 单入口编译产物、`build-result.json` 隔离验证和 `deployment-result.json` 发布结果。因现有 Docker 镜像构建／commit 路径不可用，部署使用八个只读文件挂载：六个源码及 API `dist/index.js`／`.map`。仅调整 `/etc/rakazo/compose/production.overlay.yml` 的 API 挂载，变更前备份到交付目录 `production.before.yml`。北京时间 16:19 已执行：检查无排队／运行任务及有效设备租约，比较 Compose 归一化配置仅增加这些挂载；切换后连同 `native-screen-api-loopback` 重新绑定 API 命名空间，API／Worker 健康、产物摘要和迁移账本均通过。既有两个项目的图片头像只读回传核对通过。

手机源码 `e7d729212` 已提交推送，Run `44884608273` 于北京时间 16:24 发布 `1.0.20` 到 iOS `sideload`；更新 ID `01a1fd35-3b12-712b-bafa-11fea72d4b81`。线上版本／三语说明、Hermes 启动包及 55 项资源已验证。兼容 iPhone 在「设置 → 检查更新」下载并重启，再在「关于」核对 `1.0.20`；重新打开项目后应显示原来保存的图片，无需删除或重建 Bot。真机实际显示与键盘交互待验。[完整证据](VALIDATION.md#项目头像与聊天反馈补修2026-11-21)

回退使用交付目录的原 overlay 原子恢复，再沿原 Compose 项目及 env 文件重建 API 和 `native-screen-api-loopback`；Worker、数据库和数据卷不回滚。发布期间提供失败自动回退路径，尚未演练人工回退。服务器交付文件后续清理必须先解除挂载，不能直接删除当前版本文件。OTA 的上一版为 `1.0.19`，更新 ID `01a1fced-7d60-74d9-af35-765d13ae922c`；必要时沿已有 Expo 流程重新发布兼容内容。

## iPhone 1.0.19 OTA（2026-11-21）

`1.0.19` 已由 `mobile-ios-update.yml` Run `44878494306` 发布到 iOS `sideload`，源码 `8d40d7021`，runtime 为 `sydney-ios-ip-1`，更新 ID `01a1fced-7d60-74d9-af35-765d13ae922c`。依赖和原生底座未改，线上清单、启动包及 55 项资源校验通过。兼容的 iPhone 在「设置 → 检查更新」下载并重启，然后在「关于」核对 `1.0.19`；实际手机生效待验。项目成员设置继续取决于服务器的 `botSettings` 能力；本次不部署 API、Windows 包、Linux 驱动，也不启用项目设备工具。

上一版 `1.0.18` 源码为 `d2a818910`，更新 ID `01a1fc84-bbd8-75bb-8c53-5a8b64e9eaf7`。若需回退，使用现有 Expo 流程重新发布该版兼容内容；本批未执行回退。[验证](VALIDATION.md#iphone-1019-手机工作区发布2026-11-21)

## iPhone 1.0.18 OTA（2026-11-21）

`1.0.18` 已经由 `mobile-ios-update.yml` Run `44869546104` 发布到 iOS `sideload`。Runtime 为 `sydney-ios-ip-1`，更新 ID 为 `01a1fc84-bbd8-75bb-8c53-5a8b64e9eaf7`。原生底座、依赖、锁文件与 OTA 配置沿用 `1.0.17`。兼容手机从「设置 → 检查更新」下载，重启后在「关于」查看 `1.0.18`。项目小伙伴设置取决于服务器返回的 `botSettings` 能力。

上一线上版本为 `1.0.17`，源提交 `052c47f24`，更新 ID `01a1fbe6-1a66-745f-92b5-da7e2f8e5077`。需要回退时，发布以该版本为内容的兼容 OTA。回退未执行。[验证](VALIDATION.md#iphone-1018-ota2026-11-21)

## iPhone 1.0.17 OTA（2026-11-21）

用 `cursor/integrate-remote-branches-7334` 的 `mobile-ios-update.yml` 发布到 `sideload`，输入 runtime `sydney-ios-ip-1`。兼容的 iPhone 在「设置 → 检查更新」下载并重启，再在「关于」核对 `1.0.17`。上一版为 `ecd12301c` 的 `1.0.16`，通过既有 Expo 流程可重新发布该版。实际结果见 [验证记录](VALIDATION.md#iphone-1017-界面更新2026-11-21)。

已上线的 `1.0.17` 对应 Run `44854969470`，设备更新标识显示为 `sideload 01a1fbe6`。

## 双端 UI 发布（2026-11-21）

沿用 `cursor/integrate-remote-branches-7334` 的现有客户端工作流。`mobile-ios-update.yml` 以 `sydney-ios-ip-1` 发布 iPhone `1.0.16` 到 `sideload`。兼容手机打开「设置 → 检查更新」，下载并重启后在「关于」核对版本，无需连接 USB。上一版为 `b96d347bd` 发布的 `1.0.15`，恢复时使用同一通道的既有 Expo 发布流程。

`desktop-windows-build.yml` 生成未签名 `Sydney-partner-Setup-0.4.1.exe`，通过现有六项打包门禁后供覆盖安装。保留现有用户 profile 和已验证的 `0.4.0` 安装器用于回退。实际发版与安装结果见 [验证记录](VALIDATION.md#双端首页与聊天界面2026-11-20)。

iPhone OTA Run `44776686746` 已上线，可在应用内更新。Windows Run `44776693220` 的安装器已保存到本机 `.tmp/release-candidates/44776693220/`，并已覆盖安装。该目录下的 `before-install/` 保存安装前 profile 副本及上一个 `0.4.0` 安装器。需要回退时使用保留的安装器覆盖并核对连接和运行版本，旧 profile 副本仅供恢复。实际回退待演练。

## 双端首页与聊天本地验收候选（2026-11-20）

- Windows 未签名展开包位于 Windows worktree 的 `apps/desktop/out/home-chat-candidate/win-unpacked`。本地包使用已有 Electron，并将现有 `koffi.node` 放入 `resources/koffi/win32_x64`。通过 `.tmp/ui-home-chat-integration/.tmp/start-windows-ui-candidate.ps1` 启动，关闭自动更新，资料目录为同目录的 `windows-ui-profile`。包内渲染和登录入口已验证。用测试账号登录后执行首页和聊天 [测评](ACCEPTANCE.md#双端首页与聊天界面测评2026-11-20)。关闭候选即可返回现有安装版。
- iPhone 首页、底栏及聊天改动仅涉及 JS／TS，可优先通过现有 iOS `sideload` OTA 验收，无需 USB 连接或签名安装 IPA。未签名构建 6 位于 `.tmp/ui-home-chat-integration/.tmp/Sydney-1.0.12-6-UI-unsigned.ipa`，SHA-256 `2f873b4e772c25f9b2b6ead3e56df4d81858508bf105ba89176e97dfb0f6bc1d`；包内 `Expo.plist` 确认 OTA 已启用、runtime 为 `sydney-ios-ip-1`、channel 为 `sideload`。发布前须将 UI 提交叠加到已发布 `1.0.14` 的源码基线 `1960b1745`，保留 `apps/mobile/sydney-release.json` 的 `1.0.14` 信息；原 UI 分支基于 `633f5d019`，该文件仍为 `1.0.13`，不可直接作为当前 OTA 源码发布。通过 [现有 OTA 工作流](../.github/workflows/mobile-ios-update.yml) 发布后，打开 iPhone 上 Sydney 按应用内检查更新提示下载并重启，核对运行版本／updateId 后执行 [测评](ACCEPTANCE.md#双端首页与聊天界面测评2026-11-20)。该 `sideload` channel 面向所有匹配 runtime 的安装，不是单机预览；本轮未获发布授权，未向该通道发布候选。只有出现原生改动或已装 runtime 不匹配时才使用构建 6 IPA 作为签名覆盖备选。

## 个人生产首版发布顺序（2026-11-20）

现有生产是唯一部署环境，项目隔离测试使用生产主机上的隔离临时数据库和合成数据。沿 [退役 Web 运维](#删除退役-web2026-11-20) 核对当前 Compose、直连镜像和 API 画面桥，发布前保留配置、实际运行镜像、驱动文件和新鲜数据库备份。

1. 先确认持久 Compose 与覆盖层清理、生产候选构建和回退边界，按真实文件顺序检查有效配置。保留直连 API、认证回调、健康检查和原生画面。
2. 核对真实迁移账本，按 [项目迁移清单](#项目迁移依赖与保持关闭的部分) 生成筛选目录。在隔离临时库验证备份恢复。Worker 会主动扫描待执行 Run 和 Graphile 队列，因此用同一 PostgreSQL 版本、已核对的迁移及等效运行角色，在只有合成数据的隔离临时库执行 `packages/db/src/project-workspace.postgres.test.ts`、`packages/db/src/project-directory.postgres.test.ts` 与 `packages/adapters/src/tenant-jobs.postgres.test.ts`。用不同的 `DATABASE_URL`、`DATABASE_MIGRATION_URL` 和 `VERIFY_DATABASE=1`，核对运行角色受 RLS 约束且可进入系统上下文。另用同批真实 Worker 处理合成任务，取得实际模型回复并核对范围。真实 Linux 用 `python3 -B infra/native-linux/test_driver.py` 验证驱动，再经实际私有通道复核。
3. 通过预检后按批次应用所需迁移、驱动和 API／Worker 候选。安装 `Sydney-partner` Windows 候选及与实际底座兼容的 iPhone `Sydney` OTA 或签名 IPA。核对两端实际版本、登录数据和旧 Web 404，按 [首版必测表](ACCEPTANCE.md#个人生产首版测评) 逐项登记。
4. 项目入口启用条件和回退边界见迁移一节。保留回退安装包、可重新发布的 iPhone 更新或签名包、匹配的 API／Worker 镜像与驱动文件。版本回退与数据库备份恢复分别记录，并核对留存的数据与直连服务。

Windows 首版安装候选尚未打包。iPhone 已装 Sydney `1.0.12` 构建 `4`，可下载应用版本 `1.0.13` 的兼容 OTA，实际手机 `updateId` 待核对。生产持久配置清理、项目迁移、驱动更新、双端项目候选、首版真实验收与回退仍待执行。[当前证据](VALIDATION.md#个人生产首版复核2026-11-20)

## Windows 项目终端候选（2026-11-20）

需要匹配的 Worker、设备消息网关和 Windows 安装包。打开项目会话后由账号本人请求 `ver` 或 `chcp`，先核对会话卡上的电脑和命令，再在 Windows 原生对话框核对服务器、项目及任务。副作用范围限于本次诊断，输出为版本号或代码页。服务端取消、设备断开或原生拒绝会终止请求。固定诊断复用配对密钥和现有审批存储，随项目入口回退，无专用迁移或单独配置文件。安装版和生产 Worker 实际运行待验。[验证](VALIDATION.md#windows-项目终端授权2026-11-20)

## 云电脑项目目录候选（2026-11-20）

云端目录路径相对选中专属电脑的 Bot 工作区，目录须事先存在。Windows 或 iPhone 的项目详情选择本人在线的原生专属云电脑、路径和只读／允许新建 Markdown，撤销移除绑定并保留真实文件。运行中需要项目会话的一次性审批。正在运行别的任务、维护或人工控制的电脑拒绝分派。

候选迁移 `20261120160000_project_cloud_directories` 建立绑定表和项目 RLS。发布需在完成现有迁移账本核对后匹配 API、Worker、双端候选和新版私有原生驱动。上线前在真实 Linux 复核文件操作、断线和控制权，再核对双端下载。回退先关闭项目写入入口，再恢复兼容的 API／Worker／驱动与客户端版本，保留绑定和业务数据。上述候选发布和回退均待实测。[验证](VALIDATION.md#云电脑项目目录执行2026-11-20)

## 删除退役 Web（2026-11-20）

用户允许退役后直接删除，旧 Web 恢复／再次切流演练已取消。删除范围和客户端保留边界见 [ADR-0025](../docs/adr/0025-retired-web-removal.md)；当前验收见 [退役清单](ACCEPTANCE.md#停用-web-与恢复演练pa-023)。原有恢复命令仅为历史记录，不能继续作为本轮必执行步骤。

已执行：通过现有 `sydney-cloud-admin` SSH 连接检查 `rakazo-prod` 项目，逐一复核 `web`、`native-screen-web-loopback` 的 Compose 项目／服务标签及 `exited` 状态。北京时间 15:55:14 删除 `rakazo-prod-web-18`、`rakazo-prod-native-screen-web-loopback-1`，没有 `--force`、`--volumes` 或全项目删除。再次按标签查询两服务均无容器。API、Worker、PostgreSQL 仍 healthy，现用 API 画面桥、宿主桥、驱动代理与 Caddy 持续运行；IP `/health`、`/ready` 为 200，IP 和原域名 `/app` 为 404。

源码生产配置已删除 Web 服务及旧归档卷声明，Caddy 只依赖 API，认证／屏幕上游默认 API，浏览器应用路径显式 404，`/health` 与 `/ready` 保留。生产 updater 固定跳过 Web。客户端专用覆盖与原生 Linux 示例不再重新声明已删服务；开发预览和既有本地镜像拓扑不在此次生产删除范围。`apps/web` 是 Windows 包内界面的实际构建来源，继续保留；共用镜像、旧资源卷、数据库、工作区和备份未删除。

本次没有将整套源码配置部署到生产，没有重启、重载或重建活动服务。生产 `/srv/rakazo/infra/compose/docker-compose.prod.yml` 与 `/etc/rakazo/compose/production.overlay.yml` 中仍有由停用 profile 限制的历史定义；不再启用 `legacy-web`。后续发布新版源码配置前，先从持久 overlay 移除 `services.web` 与 `services.native-screen-web-loopback` 两项，防止覆盖层生成缺少 image／build 的残留服务；同时清理旧网关上游覆盖，按真实 `-f` 文件顺序执行 `config --quiet` 和 `config --services`，确认无旧服务，再沿既有 API／Worker 发布流程处理。不直接覆盖生产 overlay 中其他原生驱动、代理或数据设置。

删除容器不需要恢复网页；客户端必需链路的升级回退仍使用经核对的 API／Worker／客户端版本和数据备份。原网页恢复材料未清除，但不再为验证材料主动恢复旧入口。本次未执行设备重新登录、真实 OAuth、iPhone 画面或升级验收。

首版收尾候选使用 Compose `server` 构建目标，按 `SYDNEY_PREPARE_WUYING_ASSETS` 准备 API 无影 SDK，生产默认启用校验与准备。Sydney 发布工作流构建 `server`；开发 Web 和 Rakazo 上游预构建自托管镜像用 `self-host`。现有生产 API 已有 SDK。部署前用 `node scripts/wuying-web-sdk.mjs --check --target=api` 核对候选内文件，实际生产镜像构建与发布仍待验。

新版更新器默认更新 `api`／`worker`，过滤退役 `web` 与 `native-screen-web-loopback`。`SYDNEY_WEB_SERVICE_ENABLED=false` 暂传给仍可能运行的旧版 updater；新版忽略该变量。原生环境手动更换 API 时，依既有发布路径同步重建 `native-screen-api-loopback`。启用新版 updater 时，原生覆盖示例已把 API 画面桥加入 `RAKAZO_UPDATE_SERVICES`，并保留环境中追加的服务。使用已有生产覆盖时合并这一项，核对 `RAKAZO_COMPOSE_OVERLAY_FILE` 指向实际覆盖文件。先在获授权的 Linux 环境确认更新和回退后画面桥附着到当前 API，随后核对 SDK、回调、画面与 `/health`、`/ready`、`/app`。常规部署脚本拒绝现有或候选 Compose 启用退役服务，回退使用已验证的直连配置与先前镜像。该脚本会运行迁移服务，项目迁移范围尚待核准时继续使用按账本筛选的发布路径。

原生 Linux 覆盖示例令 `native-screen-api-loopback` 共享 API 网络命名空间。现行 `infra/compose/test-ip-proxy-routes.sh` 接收三个参数，依次为已有 Caddy 镜像 ID、Base64 编码的 `Caddyfile.ip.example`、同一文件的 SHA-256。在获授权的 Linux 环境使用无网络临时容器、自签证书及一个合成 API 上游，覆盖默认路由、认证回跳、画面 WebSocket、旧入口 404 和日志脱敏。脚本语法与模板转换已验证，隔离运行及更新器 HTTP 回退的 Linux 结果待登记。[退役验证](VALIDATION.md#退役配置与-ip-代理候选2026-11-20)

Windows `Sydney-partner` 安装候选保留 `resources/web`，移除 `resources/stack`。现有 `mode: "existing"` 沿用保存的连接；旧 `mode: "new"` 打开选服页面，选择预设生产地址或另填后台，连接和界面成功后才保存新的地址。保留旧用户目录及其中的数据文件。首版 Windows 在自动更新关闭时，通过受控安装包覆盖升级，保留 profile 并核对登录、版本及数据，回退使用已验证的同一应用安装包。实际覆盖升级与回退仍待验。

Windows 手动构建的 `build-metadata.json` 记录提交、运行号及安装器文件名、字节数和签名状态。验收包与回退包按对应提交和运行号登记。安装器与云端打包门禁待实际构建验证。

提交 `633f5d019` 的 Windows Run `44753883136` 在包内界面 Vite 配置加载阶段失败，没有生成安装器。配置入口的本机修复已通过仅加载检查和相关回归，尚未提交或推送。重跑须选择包含修复的候选；不把原 Run 当作安装或回退材料。

同提交的 iOS Run `44753557596` 已成功，未签名 IPA 位于 `.tmp/release-candidates/44753557596/Sydney-unsigned.ipa`。原生版本为 `1.0.12 (1)`，通道 `sideload`、runtime `sydney-ios-ip-1`，启动自动检查为 `NEVER`。当前手机此前确认安装 `1.0.12 (4)`，覆盖前先核对个人签名后的标识、最终构建号和可回退包，保留数据。结构检查已完成，摘要比对、签名、安装和设备运行未执行；实际加载的嵌入包或 OTA 标识应另行登记。[安装候选](VALIDATION.md#首版-ios-安装候选2026-11-20)

## 手机导航与 GitHub 候选（2026-11-20）

本轮已完成手机导航／路由源码、受控离线验证和 GitHub 后台发布，客户端尚未交付。手机主入口候选为底栏「应用／项目／GitHub」；应用页和旧 `integration-setup` 已从设置弹层移到主栈，设置中的应用／GitHub 链接仍保留并先关闭弹层。聊天／电脑／项目详情、应用连接与添加、GitHub 仓库详情不显示底栏。无新增客户端存储键、依赖或原生配置，不需要为本轮代码迁移用户手机数据。

发布与回退材料在服务器受限目录 `/srv/rakazo-releases/pa024-github-mobile-20261120/`（0700），包含 Dockerfile、补丁及清单、`preflight.json`、账本摘要、`filtered-migrations/`、原配置 `production.before.yml`、备份 `database-before.dump`、部署脚本及 `deployment-result.json`／`postverify.json`。正式 API／Worker 已共同运行 `sydney-pa024-github:20261120`，镜像摘要 `sha256:8b8bcb260be90f79da1e689a35230d75730c778170bdd283233692b85d7e8149`；它基于原 PA-023 API 镜像，仅补入 GitHub 与本轮必要数据库修正，没有部署本地项目目录／会话等未完成功能。

发布前 210 项已应用迁移与候选源码逐项匹配摘要，筛选目录只新增 `20261118150000_github_connections`。迁移尚未应用时将系统策略对齐既有 `app_rls_bypass()` 密钥验证，上下文诊断增加 `GithubConnection`；不可重新引入裸 `app.rls_bypass=on`。16:03:46—16:04:08（北京时间）先保存并验证自定义格式备份（2,519,456 字节），再通过迁移服务的 owner 凭据、只读挂载的筛选目录和 `RAKAZO_MIGRATIONS_PATH=/release-migrations` 直接运行 Prisma deploy；临时迁移容器以 root 读取受限挂载，不改变正式进程用户。实际只新增 GitHub 一项，账本变为 211、无未结束项；运行角色默认表权限和两条 RLS 均核验通过，没有重置角色或密钥。

服务器候选类型检查受 1536 MiB 限制终止后，已取回该镜像源码，核对锁文件与本机现有依赖完全一致，在隔离候选目录完成完整 API／Worker TypeScript；没有安装依赖或构建整个本地工作区。构建、GitHub 单测和真实 PostgreSQL 隔离也通过后，复核无 queued／running Run 或有效电脑租约，再原子更新 `/etc/rakazo/compose/production.overlay.yml` 中 api／worker／migrate 三个镜像引用，合并配置其余字段完全相同。使用 `up -d --no-deps --no-build --pull never --force-recreate --wait` 仅更新 API、Worker 和共享 API 网络命名空间的既有 `native-screen-api-loopback`；桥需随 API 重建重新附着，未修改其镜像／配置。未重启原生显示、桌面、VNC、noVNC 或驱动，项目开关未设置、项目表仍不存在，Web 根入口继续 404。

发布后 API／Worker 健康，真实匿名 GitHub 搜索、仓库详情／README 读取、公网健康／就绪 200 和未登录 GitHub RPC 401 通过。真实 PostgreSQL 隔离复测全部回滚，合成用户数 0；运行中的 API Prisma 在虚构账号上下文读取新表成功且可见 0 行，测试临时凭据文件已删除。真实 PAT、私人贡献／仓库及客户端运行不由这些结果替代。

必要时回退服务而保留 GitHub 表和连接数据。先核对原镜像标签仍对应备份前摘要（API `62df407f…`，Worker `31167f65…`，完整值见 `preflight.json`），确认原覆盖备份有效且期间无后续配置修改，再恢复 `production.before.yml` 并对同三项服务执行以下操作。本轮未实际演练回退，不删表、不回灌旧库，也不重复运行迁移部署脚本。

```sh
install -m 0600 /srv/rakazo-releases/pa024-github-mobile-20261120/production.before.yml /etc/rakazo/compose/production.overlay.yml
docker compose --project-name rakazo-prod --env-file /srv/rakazo/.env -f /srv/rakazo/infra/compose/docker-compose.prod.yml -f /etc/rakazo/compose/production.overlay.yml up -d --no-deps --no-build --pull never --force-recreate --wait --wait-timeout 120 api worker native-screen-api-loopback
```

旧侧载记录对应的 Run `44298985618` 源 IPA 内 `Expo.plist` 启用 OTA，启动策略 `ALWAYS`、通道 `sideload`、runtime `sydney-ios-ip-1`。后续 USB 已连通，安装代理按 Sydney 名称及设备侧载记录确认 `1.0.12` 构建 `1`。安装标识经签名调整，记录源包摘要匹配该 Run；实际运行中的 runtime／updateId 待验。更新请求初次为 204，后续以相同通道和 runtime 两次复查均为 HTTP 404，服务明确报告 `sideload` 通道不存在。当前进程没有 Expo 发布令牌，本机 Expo 状态无登录会话，也没有 EAS CLI。仓库远程工作流需 `EXPO_TOKEN`，只检出远程引用的源码。需要在获授权的 Expo 项目建立更新通道、发布候选，再按 [专项测评](MOBILE_NAV_GITHUB_EVALUATION.md) 核对下载重启、真实 PAT 和真机运行。

手机发布源码候选保存在本机忽略目录 `.tmp/mobile-ota-candidate`，基于 `0ca3357a5` 的可重放补丁为 `.tmp/mobile-ota-candidate-20261120.patch`（160,679 字节，SHA-256 `807fffcfa7d0a6968a014d7e1fdd7ab48079230fe60226e9ab8e58ff0216a6db`）。只含 `apps/mobile` 文件，已验证可应用在干净基线上。候选 Expo 公开配置与旧源 IPA 匹配；离线 iOS 产物在 `.tmp/mobile-ota-ios-export`，具有 Hermes bundle、资源、`assetmap.json` 与 `metadata.json`。远程工作流应在承载这份候选及可用 Expo 发布认证的受授权环境执行。尚无 OTA 发布 updateId。验证细节见 [候选验证](VALIDATION.md#手机固定导航github-与模型交付2026-11-20)。

签名侧载备选为 `.tmp/Sydney-1.0.12-2-unsigned.ipa`，26,002,217 字节，SHA-256 `1c443d7ae38d844b99e848572ce8635185e3a21dbe8a71abd26bdc857a477c6c`。构建号 `2` 用来区分手机上已有的构建 `1`。在沿用现有 iPASide Apple 账号和安装标识的前提下，个人签名后覆盖安装。保留构建 `1` 的源包和侧载记录，勿先卸载旧应用。安装后先用 USB 查构建号，再验证冷启动、新对话模型、三栏与 GitHub。尚未签名、覆盖安装或验证回退。OTA 通道仍需独立发布。

用户随后确认构建 `2` 安装并连接 GitHub。刷新反馈修复的未签名构建 `3` 位于 `D:/33054/sydney-ipa-output/Sydney-1.0.12-3-unsigned.ipa`，SHA-256 `7e545757e485a062e94c5f40dcda4fae2e8a6b02c815f054af49fd7c7b11e207`。使用构建 `2` 的签名账号与安装标识覆盖安装，然后核对 GitHub 仍已连接、筛选及翻页无自动下拉动画、主动下拉能刷新。构建 `3` 待签名和真机验证，未发布 OTA。

未签名构建 `4` 位于 `D:/33054/sydney-ipa-output/Sydney-1.0.12-4-unsigned.ipa`，SHA-256 `35305d0e9d3f8315fd68cfd285e4ac4a1749eb330f369f93ac82b73b549965b9`。沿用现有 iPASide 签名账号与安装标识覆盖安装。构建 `4` 包含构建 `3` 的刷新修复及四项新增手机体验。安装后按 [手机测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标) 验证 GitHub 重进及主动下拉、相册换头像及冷启动回显、双方气泡和半屏模型切换。侧载签名、真机操作和 OTA 发布均待执行。

当前 iOS `sideload` 更新为 `1.0.13`，由集成分支提交 `40328e108` 经 GitHub Actions `44750564292` 发布。Runtime 为 `sydney-ios-ip-1`，清单标识为 `01a1f94b-6b80-7974-88ca-88494c9f622a`。目标手机已装 `1.0.12 (4)`，可打开「设置 → 检查更新」下载并重启。重启后在「设置 → 版本更新」查看 `1.0.13` 及说明，在「设置 → 账号」核对安装包和 `sideload 01a1f94b`。设备运行标识仍待确认。[验证](VALIDATION.md#手机-1013-版本与更新说明2026-11-20)。

发布前在 `apps/mobile/sydney-release.json` 维护用户可见版本号、发布日期和简中、繁中、英文说明。应用通过清单中的 `extra.expoClient.extra.sydneyMobileRelease` 展示实际下载版本。首次从旧版升级到带说明的版本时，沿用旧版的重启提示，重启后可在设置回看本次说明。

`1.0.14` 候选的离线导出已验证。获授权后将对应手机版本配置推送到发布分支，按实际发布日复核日期，并用 `mobile-ios-update.yml` 手动发布到 `sideload`，确认参数 `runtime_version` 为 `sydney-ios-ip-1`。发布后用构建 `5` 的内嵌标识读取清单，核对发布时间晚于内嵌版本，检查 `1.0.14` 和三种语言说明，校验启动包及资源哈希。[候选验证](VALIDATION.md#手机-1014-ota-候选2026-11-20)。

未签名构建 `5` 位于 `D:/33054/sydney-ipa-output/Sydney-1.0.12-5-unsigned.ipa`。沿用构建 `4` 的 iPASide 签名账号及安装标识覆盖，首次打开到「设置 → 关于」核对应用 `1.0.13`，在账号页核对安装包 `1.0.12 (5)`。实际 `Expo.plist` 中 `EXUpdatesCheckOnLaunch = NEVER`。内嵌应用启动时由 JavaScript 检查清单，每条 OTA 首次发现时提示，稍后可从「设置 → 检查更新」打开。点「更新」后下载，再点「安装并重启」立即应用。下载后选择「暂不」，Expo 会在下次冷启动时应用已缓存版本。当前线上 OTA 仍为此前发布的 `1.0.13`。待覆盖安装和发布下一条兼容 OTA，再验证弹窗和下载流程。[验证](VALIDATION.md#手机启动更新提示与关于2026-11-20)。

GitHub 连接状态快照位于客户端系统缓存 `github-status-v1`，按已核验的服务器、账号与空间读取，凭据仍由既有服务端保管。退出或切换账号后，新会话只能读取其已核验范围。头像通过现有 `/api/auth/update-user` 保存至本人资料；旧后台省略 `me.image` 时，通过 `/api/auth/get-session` 读取当前用户的头像。省略字段兼容已在替身测试验证，无头像数据库迁移。

## GitHub 与项目工作区发布边界（2026-11-20）

构建 `4` 交付时复核生产 API 与 Worker 均健康，迁移账本 211 项已完成、0 项未结束，`project_workspaces` 表不存在，项目创建与会话开关均未设置。项目隔离测试和发布仍需项目生产维护授权，随后按本节准备筛选迁移、匹配服务候选和实际 Worker 验收。

项目任务取消候选新增 `projectWorkspaces/cancelRun`，与项目会话共用 `SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT`。发布需使用包含此过程的 API 及对应客户端，沿用现有 Run、Task、Attempt、租约和事件记录。取消后的设备侧停止继续按实际回执和文件核对验收。回退保留已经提交的任务终态和事件，不用旧版本重放已取消任务。见 [本批验证](VALIDATION.md#项目任务取消2026-11-20)。

Windows 文件候选在目录绑定迁移后增加 `20261120140000_project_directory_intent`，将既有绑定默认设为 `read-only`。原生确认后才能建立允许新建的绑定，已有绑定不能就地升级，应先撤销再重新选择。目录完整路径和已选目录身份留在本机，进程重启须重新选目录。生产设备连接使用 HTTPS，由 WSS 承载项目文件消息。Worker 必须按持久 Run 的范围及最新绑定固定设备，确认文件结果与完成帧后再交付；新建遇到断线或响应未知时先检查目标文件，勿自动重发。候选回退保留授权元数据和实际文件，原 Windows 进程退出后其目录授权即失效。Worker 入口、生产迁移和设备验收仍待完成。[本批验证](VALIDATION.md#windows-项目目录文件执行2026-11-20)

关联 PA-022、PA-024，阶段状态仅维护在 [总计划](PLAN.md#追加目标github-上线与项目工作区可用闭环pa-022pa-024)。当前只有现有生产环境，本机继续做编辑和离线验证，不要求另建测试环境。本节保留发布边界；GitHub 独立候选、备份、单表迁移和 API／Worker 已按上一节实际完成。项目迁移、客户端本轮安装与回退演练仍未执行。

### GitHub 的独立迁移范围

本次候选只需新增 [GitHub 连接表迁移](../packages/db/prisma/migrations/20261118150000_github_connections/migration.sql)。它依赖既有 `user` 表及数据库租户设置，新增连接表、用户唯一索引、级联外键和两条 RLS 策略；不依赖项目工作区迁移。生产此前只读复核确认表不存在，实际执行前仍需重新核对 `_prisma_migrations`、表／策略状态及可用备份。

`pnpm --filter @rakazo/db migrate` 与默认发布中的全量迁移会处理其他待执行迁移。本轮已在服务器逐项核对已应用迁移源码后，通过 `RAKAZO_MIGRATIONS_PATH` 指向包含“生产已应用迁移 + 唯一新增 GitHub 迁移”的筛选目录，再由 Prisma 维护迁移账本。发布结果和候选材料路径见上一节。

发布前已在上一节所列服务器受限目录保存数据库备份、迁移账本及原 API／Worker 版本，备份可读。`SecretStore` 配置及密钥沿用现有值，数据库地址、真实 PAT、密文及个人资料不进入仓库或终端回显。运行角色的必要权限和 RLS 通过真实 PostgreSQL 验证。

API 与 Worker 使用同一份经验证的契约／适配层候选，`GITHUB_PROVIDER` 默认 `github`，也可显式设为 `github`；使用 `emulator` 的结果不得计为公网验收。Windows 需重新打包内置界面，手机需构建兼容的 IPA／OTA 后实际安装验证。手机候选入口为底栏「GitHub」及「设置 → GitHub」的原生页面，桌面仍使用包内 `/app/github` 路由；不恢复公网 Web。Windows 应用名保持 `Sydney-partner`，iPhone 应用名保持 `Sydney`。

如候选失败，先停止本轮新入口／恢复原 API、Worker 及客户端候选，保留新增表和用户已创建的连接数据，不直接删表或回灌旧库。回退数据库会影响发布后产生的记录，必须另行核对数据保留范围；解绑和 PAT 撤销由正常账号流程执行。本轮未演练以上回退。

### 本机项目目录候选

本批仅完成 PA-022 本机目录的源码与离线验证，未执行生产维护，P2 整体仍未完成。Windows 安装名保持 `Sydney-partner`，iPhone 仍为 `Sydney`；需要分别重建包内界面和移动候选，不能认为已安装版本包含本批入口。

服务端增加 [目录绑定迁移](../packages/db/prisma/migrations/20261120120000_project_directory_bindings/migration.sql)，依赖既有设备表、配对会话及下表项目迁移链，含 `project_directory_bindings`、设备所有者唯一键／复合外键、项目所有者复合外键、项目范围 RLS 和应用角色授权。此迁移没有解除项目资源禁写，不与 GitHub 单表上线混跑；发布前仍需筛选迁移、备份与当前生产账本核对。不能直接执行全量 migrate，也不能只打开实验开关代替迁移和真实运行角色验证。新增 PostgreSQL 定向文件尚未在服务器运行。

目录能力复用关闭中的 `SYDNEY_PROJECT_CREATE_EXPERIMENT`，还要求 API 设备网关可用；不新增默认开启的变量。服务端入口为 `POST /api/devices/project-directory/scope`、`POST /api/devices/project-directory/bind` 和项目专属 `directoryCapability`／`directory`／`unbindDirectory` RPC。原生请求同时核对登录会话与设备 bearer 的账号及配对会话，选择前后均校验项目归属；页面不能提供路径、设备 bearer 或可信 userId。旧本机配对缺少身份时，明确选择目录会撤销旧 token 并重新配对，不改变整机许可。API／契约／数据库候选、设备协议和新桌面主进程必须配套发布；老桌面无法确认该协议时显示不可用，不能退回整机授权或假定已授权。

新增本机数据位于桌面实际 `userData` 下的 `workspace-grants/`，继续使用已有私有文件存储约定。完整规范路径仅写主进程私有记录，服务端只保存目录名、设备标识及不透明 grant。grant 只在创建它的桌面进程有效；重启后需先移除旧服务器绑定，再通过 OS 选择器重新选择。不得手改 JSON 或复制其他账号／设备的记录来恢复授权。本轮未在已安装客户端生成或检查这些新授权记录，具体本机权限仍待设备验收。

撤销先按当前项目和预期 grant 删除服务器绑定，防止误撤并发的新绑定，再向固定设备发送受限撤销请求。返回 `confirmed` 才表示本机已确认；离线、旧端或响应丢失返回 `pending`，页面明确表示本机撤销未确认，原 grant 随原桌面进程结束失效。没有新增后台撤销队列，不声称离线设备已删除本机记录；服务器无绑定时不得用于后续文件执行。操作不会删除真实目录或文件，审计只记录作用域标识和结果，不记录路径、目录名或凭据。有目录绑定的项目不能作为空项目删除。

双端详情定期或显式读取固定绑定设备的状态，区分设备离线、配对／grant 失效、目录不存在／不可确认与授权在线。目录检查只涉及已选路径的规范化和存在性；当前不开放项目文件或终端工具，不改变 P1 文字限制。真实云电脑目录绑定未包含在本批。

### Windows 项目文件与 Markdown 下载候选

候选 API、Worker、Windows 主进程与包内界面、iPhone 需配套。目录与会话开关仍按项目发布门槛处理。审批由 `projectWorkspaces/answerApproval` 核对当前项目会话和卡片，只接收一次允许或拒绝。在设置为从不询问审批的 Space，文件操作会直接拒绝。Worker 通过既有设备网关向当前绑定的 Windows 发送读文件或新建 Markdown 请求，执行中按秒检查持久授权和 Run 租约。撤权、取消、掉线或旧端不返回可信结束帧时，先检查目标路径，再提出新的创建请求。

电脑确认创建后，产物副本进入既有产物存储。`projectWorkspaces/getArtifact` 仅从产生该文件的项目会话下载。Windows 使用包内下载，iPhone 使用系统分享菜单。解绑保留设备源文件和已发布的会话副本。副本保存失败独立显示，原文件仍应核对。回退服务版本与项目开关，保留新增归属、已产生的副本和设备文件。服务、迁移及设备验证状态见 [分派验证](VALIDATION.md#windows-项目审批与-worker-分派2026-11-20) 和 [下载验证](VALIDATION.md#项目-markdown-产物下载2026-11-20)。

候选回退先关闭目录入口并恢复已验证的服务／客户端版本，保留新表和授权元数据，不直接删表、删目录或回灌旧库；退出本批桌面进程使本机 grant 失效。重新开放前仍需新选择与真实状态核对。以上部署、回退及 Windows／iPhone 操作尚未实测；按 [目录测评](ACCEPTANCE.md#本机项目目录授权pa-022) 逐项登记。

### 项目文字执行候选的权限范围

2026-11-20 已增加 Worker 文字范围候选：持久 Run 带项目标识时，只提供文字提问／回复、项目范围历史和当前 Bot 的文本身份编辑，不继承账号插件、整机／本机终端、共享技能／记忆／待办／看板或外部作业权限。即使创建上节的本机目录绑定候选，文字限制仍适用，不能以电脑在线、可见项目或路径文本作为文件执行授权。项目文字任务不获取电脑租约、不因电脑切换等待，也不主动探测设备／环境；首页原有能力保留。脚本运行器不开放项目会话，原生 MCP 直通、接管／助手事件及脚本文件／记忆产物不能绕过工具分派。

P1 文字执行器候选沿用现有权限记录与数据目录，开放迁移见下节。服务发布需包含同一套执行器、工具选择、分派和运行时事件处理；目录授权与后续文件操作保留独立权限边界。8 项定时唤醒测试已按生产 Worker 的租户上下文修正并通过，真实运行角色 RLS、项目 A／B／首页、Worker 续行和设备验收仍待执行。生产项目迁移未应用，两个开关保持关闭。见 [定向复测](VALIDATION.md#个人生产首版退役收尾2026-11-20)。

### 项目迁移依赖与保持关闭的部分

项目草案依次涉及以下迁移，不能只创建元数据表或设置开关就宣称聊天可用：

| 迁移名 | 作用与当前门禁 |
| --- | --- |
| `20261119120000_project_workspace_metadata` | 工作区元数据、所有者外键、RLS 和应用角色授权 |
| `20261119130000_project_resource_scope_columns` | Bot、群、Thread、Task、Run 归属列与外键；五个 `*_project_scope_disabled` CHECK 仍禁止非空项目归属 |
| `20261119140000_project_conversation_row_security` | 首页／项目范围限制性 RLS、群成员及事件归属检查 |
| `20261119150000_project_conversation_consistency` | 父子范围一致性、对象身份与目标不可换绑 |
| `20261119160000_project_external_operation_scope` | 云代理／购买的持久项目归属；这两类操作继续禁写项目数据 |
| `20261119170000_project_account_deletion_gate` | 账号删除声明列，配合元数据创建／删除生命周期 |
| `20261119180000_project_artifact_scope` | 产物归属与 RLS；项目产物仍禁写 |
| `20261119190000_project_memory_scope` | 记忆与修订按 Bot／项目限定范围 |
| `20261120120000_project_directory_bindings` | 本机目录授权元数据、项目与设备所有者约束及 RLS；不存完整路径 |
| `20261120130000_project_text_conversations` | 事务删除 Bot／群聊／Thread／Task／Run 的五个项目禁写 CHECK，保留归属外键、RLS 和一致性触发器；产物、云代理及购买禁写继续生效 |
| `20261120140000_project_directory_intent` | 事务增加两种受限目录授权意图，原有绑定和旧版写入默认只读 |
| `20261120150000_project_artifact_downloads` | 解除产物项目禁写，保留 RLS 和所有者外键，新增来源 Run、项目版本族和归属变更约束 |
| `20261120160000_project_cloud_directories` | 云目录绑定、专属电脑所有者外键和项目 RLS；与 Windows 绑定互斥 |

源码生产 Compose 默认将 `SYDNEY_PROJECT_CREATE_EXPERIMENT` 和 `SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT` 设为 `false`，两者均需显式配置。生产此前核对两开关未开启，本批只新增迁移和源码默认值，线上未变更。核验使用按生产账本筛选的迁移及匹配 API／Worker，在获授权的隔离临时数据库中以 `VERIFY_DATABASE=1` 和不同的运行／迁移账号执行 `project-workspace.postgres.test.ts`、`tenant-jobs.postgres.test.ts`。数据库恢复验证、项目 A／B／首页、真实 Worker 执行和样本设备验收通过后才开放；不能用全量迁移替代账本筛选。

新数据已经写入时，回退先停止项目入口和新增任务，核对在途 Run、备份并保留项目数据。两个开关置 `false`，回退至已验证且识别项目归属的匹配 API／Worker，保留 RLS、外键、触发器及目标数据。已有项目行时重新添加原项目禁写 CHECK 会拒绝现有数据，旧服务也需要验证对持久项目 Run 的处理；不得用删项目或覆盖数据库作为版本回退。实际回退步骤及停启顺序待生产候选确定后实测。

Windows 与原生云电脑目录已接入尚未上线的候选。项目详情分别通过 `projectWorkspaces/directory` 和 `projectWorkspaces/cloudDirectory` 查询真实绑定及可用性。移除绑定保留真实目录。Windows 路径来自本机选择对话框，云端路径相对绑定专属电脑的工作区。

## 云电脑全覆盖样式部署（2026-11-20）

用户明确要求部署全覆盖修复。本次只发布 `infra/native-linux/novnc-full-coverage.css` 到 `sydney-cloud-admin` 的 `/usr/share/novnc/app/styles/sydney-full-coverage.css`（0644），并在原生 `vnc.html`、`vnc_lite.html` 的 `</head>` 前增加以下引用：

```html
<link rel="stylesheet" href="app/styles/sydney-full-coverage.css?v=20261120">
```

北京时间 14:26:57 完成。原文件及存在性清单 `baseline.json`、发布结果 `result.json` 位于 `/srv/rakazo-releases/pa023-coverage-20261120T062657Z`（目录 0700，JSON 0600）。本轮使用受限发布脚本先备份、生成同目录临时文件，再原子替换；若回环 HTTP 校验失败，脚本恢复备份。实际页面和 CSS 均通过回环请求验证，Windows 原登录客户端实测三种窗口尺寸全覆盖和真实帧通过。无需构建客户端或重启画面／后台服务，已打开的画面需关闭电脑窗口再打开，以重新加载静态页。详见 [验证记录](VALIDATION.md#pa-023-云电脑画面全覆盖修复2026-11-20)。

这项样式将完整画面非等比填满可用区域，不改变远程桌面 1024×768 分辨率；只读设置不变。镜像用 `infra/sandboxes/computer/embed.html` 是另一条尚未发布的交付链，不能通过构建该镜像替代当前原生静态页维护。noVNC 包更新可能替换原生 HTML，升级后核对样式文件、引用以及客户端四边；仅原子替换 CSS 可更新后续样式，HTML 已存在本引用时不要重复添加。

需要回退时，先核对页面没有之后的其他更新，再执行以下限定原文件的恢复；此回退未演练。恢复后重新打开电脑画面，原等比留黑行为会恢复，不删除桌面用户数据。

```sh
release=/srv/rakazo-releases/pa023-coverage-20261120T062657Z
install -m 0644 "$release/vnc.html" /usr/share/novnc/vnc.html
install -m 0644 "$release/vnc_lite.html" /usr/share/novnc/vnc_lite.html
rm -f /usr/share/novnc/app/styles/sydney-full-coverage.css
```

## PA-023 云电脑画面恢复（2026-11-20）

本轮在既有生产 `sydney-cloud-admin` 恢复专属 `sydney-desktop` 账号的 `:10` 显示。随后按用户追加授权短停 Worker 并校准团队连接，Windows 专属／团队电脑实际画面和自动重连均通过；手机源码发布及 iPhone 实测仍未完成，见 [验证记录](VALIDATION.md#pa-023-云电脑画面恢复2026-11-20)。首次显示恢复未改数据库；后续仅校准团队连接单行，API、网关与驱动未重启或改配置，Web 未恢复。

### 当前部署与路径

- 针对现有 Xorg／xorgxrdp 的源码为 [显示单元](../infra/native-linux/xrdp/sydney-display.service)、[桌面单元](../infra/native-linux/xrdp/sydney-desktop.service) 和 [VNC 依赖覆盖](../infra/native-linux/xrdp/screen-display.conf)。不能把仓库其他使用 Xvfb `:99` 的草案直接覆盖到本机。
- 已安装 `/etc/systemd/system/sydney-display.service`、`/etc/systemd/system/sydney-desktop.service` 和 `/etc/systemd/system/sydney-screen-vnc.service.d/20-display-session.conf`。既有 VNC／websockify 主单元及 `10-view-only.conf` 未改；VNC 保持服务端 `-viewonly`。
- 使用已有 `/home/sydney-desktop/.Xauthority`，未生成或导出 cookie。Xorg 日志为 `/home/sydney-desktop/.local/state/sydney/Xorg.10.log`；专属运行目录 `/run/sydney-desktop` 由 systemd 创建，模式 0700。桌面代理继续可选读取既有 `/etc/sydney/desktop-proxy.env`。
- 新单元仅以专属账号运行，沿用共享 `/tmp` 的现有 X socket；`ProtectSystem=strict` 下需允许 `/tmp` 写入以创建 X 锁文件，显示单元另允许已有 `/run/xrdp/sockdir`。未新增外部监听；5900／6080 仍限回环，Xorg 禁止 TCP。
- 候选及本次原始备份在 `/srv/rakazo-releases/pa023-screen-20261120/`。`rollback/baseline.json` 记录变更前没有 display／desktop 单元，VNC 已启用但反复失败、websockify 已启用但 inactive。不要覆盖这份原始备份。

以下命令反映本次已成功执行的部署操作。仅适用于本机现有账号、Xauthority、Xorg 配置和原始备份；在之后发生其他配置变更时先核对差异。

```sh
release=/srv/rakazo-releases/pa023-screen-20261120
install -m 0644 "$release/sydney-display.service" /etc/systemd/system/sydney-display.service
install -m 0644 "$release/sydney-desktop.service" /etc/systemd/system/sydney-desktop.service
install -d /etc/systemd/system/sydney-screen-vnc.service.d
install -m 0644 "$release/screen-display.conf" /etc/systemd/system/sydney-screen-vnc.service.d/20-display-session.conf
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/sydney-display.service /etc/systemd/system/sydney-desktop.service /etc/systemd/system/sydney-screen-vnc.service
systemctl start sydney-screen-websockify.service
systemctl enable sydney-display.service sydney-desktop.service
systemctl is-active sydney-display sydney-desktop sydney-screen-vnc sydney-screen-websockify
systemctl is-enabled sydney-display sydney-desktop sydney-screen-vnc sydney-screen-websockify
```

目前四个服务均 active／enabled。启用只证明启动登记存在，服务器重启后的真实桌面恢复尚未演练。VNC 的累计重启计数含修复前失败历史，不能把累计值当作恢复后新失败次数。

### 停止与配置回退（待执行）

先确认本次桌面维护时段，避免中断正在使用桌面的客户端。以下只退回本次三份配置，不修改驱动、Xauthority、工作区、用户数据、VNC 主单元或其原 `10-view-only.conf`；尚未实际执行。

```sh
systemctl stop sydney-screen-websockify.service sydney-screen-vnc.service sydney-desktop.service sydney-display.service
systemctl disable sydney-desktop.service sydney-display.service
rm -f /etc/systemd/system/sydney-screen-vnc.service.d/20-display-session.conf
rm -f /etc/systemd/system/sydney-desktop.service /etc/systemd/system/sydney-display.service
systemctl daemon-reload
systemctl is-enabled sydney-screen-vnc.service sydney-screen-websockify.service
```

原 VNC／websockify 单元保持原启用状态。需要恢复被后续操作改动的原文件时，先逐一比较 `rollback/` 的备份。原始基线没有工作中的 `:10` 显示，因此配置回退不代表恢复可用画面；本次未执行主机重启、服务回退或 Web／网关流量恢复演练。

### 团队连接校准维护（已执行）

2026-11-20 用户明确允许此次短停维护。北京时间 12:27:50—12:28:05（含恢复健康等待）执行完毕。实际 Worker 为 `rakazo-prod-worker-16`，API 为 `rakazo-prod-api-21`；容器名称属于此次部署，后续执行前应重新识别，不直接套用旧编号。

1. 核对原 Worker 正常运行、无其他生产 Worker，专属／团队电脑均无运行中任务、有效执行租约或电脑更新；团队有一条 `waiting_input`，其接管已过期。驱动无直接子进程，inspect 的 unknown 仍按未知处理。
2. `docker stop --timeout=-1 rakazo-prod-worker-16` 优雅等待结束，退出码 0。没有使用强杀、取消任务或暂停驱动；API 继续接收正常请求。
3. 以 API 的既有应用运行环境访问数据库，设置配置限定的 space／user 租户上下文。将电脑、Bot、Run 状态及租约元数据保存至 `/srv/rakazo-releases/pa023-screen-20261120/team-reference-maintenance/20261120T042750Z-before.json`；同目录 `20261120T042750Z-result.json` 为维护结果。目录 0700、文件 0600，不复制到仓库；备份包含实际身份和引用，应按生产敏感数据管理。
4. 短事务内对 `computers`、`bots`、`runs`、`computer_execution_leases`、`computer_updates` 取 `SHARE ROW EXCLUSIVE` 锁，锁等待 3 秒、单语句 12 秒超时。锁短暂阻止这些表的并发写入；不能只依赖停止 Worker 或锁电脑单行，因为 API 仍可操作租约。读取快照与已保存备份逐项比较并再次检查任务、租约及维护状态。
5. 来源仅取同一 socket 上已通过 status 的现有专属引用，再以团队原 homeKey 验证当前代次。团队旧引用被拒、候选通过后，按原 id／providerRef／screenGeneration／updatedAt 作条件更新；仅替换 providerRef、screenGeneration 加 1 和更新 updatedAt。提交前核对其余记录全部保持并复核驱动 status。没有改电脑 state、账号、Run 或控制租约。
6. 在恢复分支执行 `docker start rakazo-prod-worker-16`，等待原容器 healthy；本次正常恢复，驱动 PID 未变、API healthy。通过正常已登录客户端打开团队电脑，screenUrl 从 500 恢复 200，真实帧与自动重连通过。

校准后既有 `expireStaleComputerControl`／过期清理链路能够成功撤销旧接管，最终只读复核显示过期的 controlLeaseId、controlLeaseExpiresAt、controlBotId 已清空；controlHolder 仍为 none，controlFence 未变。该变化发生于正常接口／后台过期处理，维护事务未主动清空接管。原团队 Run 状态全部保留，待回答任务仍为一条，不需要重答或重新创建。

原生驱动启动时生成新的 generation，因此本次没有重启驱动。以后若驱动重启再次失配，先复核其当前代次和在途工作，不能只改 state、借用其他账号、跳过 status 校验或盲目执行不受支持的 recover／destroy 来掩盖问题。

### 团队引用回退（未演练）

备份用于核对和受控恢复本次被修改的连接字段。若确需引用回退，先优雅停止实际 Worker、核对当前任务和租约，沿用上述短事务和快照／条件更新边界；从受限备份读取原 providerRef，仅在与当前驱动的关系及回退结果明确后执行。screenGeneration 应继续递增以失效已发出的画面票据，不能递减来重新启用旧票据，也不能把已过期的接管字段或整份电脑记录覆盖回去。原引用在维护前已被现有驱动拒绝，直接退回将恢复故障，不是恢复可用画面的常规步骤。本次没有执行引用回退或备份恢复。

### 手机端后续

手机端新增画面地址失败提示与重试，续签失败保留已有画面，成功读取后清除提示。这些仅在源码和离线测试中完成，已安装的 Sydney 不会自动获得未发布代码。团队连接的共同后台接口现已恢复；仍需发布可追溯的 IPA／OTA，并在 iPhone 分别实测预览、完整窗口、断线重连与前后台切换；不要将 Windows 通过视为手机已通过。

## 移动端多模式 UI（离线代码阶段，未发布）

- 客户端已选模式保存在 Expo `SecureStore` 键 `sydney.mobile.uiMode.v1`。明暗偏好和聊天外观仍用原各自存储，本次不覆盖原用户偏好或删除背景图片。
- 运行时只激活当前平台支持的模式。未知/注销/不支持的平台选择显示为 `classic`；扩展模式屏幕或根渲染异常时自动恢复到 `classic`。恢复注册后仍可再次选择已保存的模式。
- iPhone App 名称为 `Sydney`；源码中的 iOS「设置 → 界面模式」已支持经典／午夜预览、应用、取消及恢复经典。离开页面会取消未确认预览；默认经典，午夜使用深色外观和实体表面，保留原聊天背景与气泡设置。内置模式随客户端代码注册，无需服务端配置、数据库迁移或新增依赖。
- 本轮未构建/发布 IPA／OTA，也未完成该版本 iPhone 安装验收。已只读确认手机现有 Sydney 为 `1.0.12`（构建 `1`）；需要将本轮代码纳入兼容的客户端候选，再按测评清单进行签名安装、冷启动与升级验证。
- 若设备 SecureStore 写入失败，既有内核仅保留当前进程的模式选择，重开可能恢复上次写入成功的模式；本轮测试只证明正常存储下的持久化和主题恢复。手机设置「界面模式 → 恢复经典模式」为正常存储条件下的手动恢复入口，不需要清除原聊天外观数据。

### 已有 iPhone 查询工具（2026-11-20 实测）

本机已有 iPASide 内置 Python／pymobiledevice3，不应因默认 Python 或 `PATH` 缺少设备命令而重新安装依赖。在仓库根目录通过 PowerShell 执行以下只读镜像探针，实测连接成功并返回 iOS `27.0.1`、`personalized_image_found: false`。探针使用 `autopair=False`，不会请求自动配对或挂载开发者镜像：

```powershell
& "$env:LOCALAPPDATA\Programs\iPASide\engine\python\python.exe" -I -B .\scripts\iphone_image_readonly_probe.py
```

同一设备库的 InstallationProxy 查询已确认已安装 `Sydney 1.0.12`（构建 `1`）。侧载记录源包与既有云候选的摘要关联见 [设备与候选复核](VALIDATION.md#pa-023-环境与候选准备复核2026-11-20)。本轮没有启动 iPASide GUI、签名、续签、安装应用、挂载镜像或修改手机配置；现有安装可用于后续非升级验收，升级候选另行准备。

## GitHub 模块运维与部署（PA-024，2026-11-18）

1. **数据库迁移**：
   - 本次新增表 `github_connections`，包含了按用户隔离的连接元数据及 `secret_handle`；
   - 在生产/测试环境执行 Prisma 迁移命令：
     ```bash
     pnpm --filter @rakazo/db migrate
     ```
   - 迁移脚本位于 `packages/db/prisma/migrations/20261118150000_github_connections/migration.sql`。真实环境验收需核对 `github_connections_tenant`、`github_connections_system` 策略及应用运行角色下的行级隔离。
2. **环境变量与 Provider 配置**：
   - `GITHUB_PROVIDER` 默认为 `github`，通过 `https://api.github.com` 直连。离线测试可用 `emulator`，`none` 用于禁用 Provider。
3. **凭据安全与 SecretStore**：
   - 用户的 GitHub PAT 在进入 API 后直接通过 `SecretStore` 加密，数据库仅存储密文句柄 `secret_handle`，明文 Token 严禁进入日志、审计事件或返回前端；
   - 用户断开连接时，系统会自动在数据库将状态置为 `disconnected` 并同步物理删除 `SecretStore` 中的密文；
   - 联调优先使用限定到指定测试仓库、仅授予所需只读权限的 Fine-grained PAT。经典 PAT 的 `repo` 范围含写权限。
4. **网络与缓存机制**：
   - 服务端出站需允许访问 `api.github.com:443`；
   - GraphQL 贡献热力图数据在服务端内存中保持 5 分钟租户隔离缓存，防止重复请求耗尽 GraphQL 5000 points/hr 配额；
   - 匿名开源检索走 GitHub 公开 REST Search API（未授权限流 10 次/分钟），已连接用户走其专属 Token 配额（30 次/分钟）。


## 手机默认后台地址迁移（2026-11-16，源码待安装验收）

后续 iOS 侧载包以构建时的 `EXPO_PUBLIC_API_URL` 为默认后台；当前
生产构建默认值为 `https://124.221.182.39`。旧版本已保存的生产域名
会话在新源码启动时迁移会话来源元数据并连接该 IP；自定义服务器设置
继续保留，不随默认值改写。作用域损坏、不可读或绑定其他服务器时，
App 阻止启动并保留本地登录资料。当前已安装 IPA 不包含此修改，必须
构建、签名并安装新包后才生效；未完成 iPhone 登录与业务验收前，不停用
旧域名入口。未验证实际安装包、SecureStore 失败恢复和真机登录。

桌面独立渲染代理的候选代码可读取现有桌面服务器设置中的自定义
请求头，并在目标来源完全匹配时转发到固定后台；该代理仍未接入
正式 Electron 窗口，现有配置和生产行为不变。候选仅允许 HTTPS 或
loopback HTTP 携带配置头；正式桌面请求头钩子仍允许既有私网 HTTP
配置，接线前必须统一策略。不要把服务器配置头视作客户端身份或会话
隔离。代理 loopback 监听目前缺少调用者认证，同机其他进程可伪造
Host/Origin；解决并验证该边界前不得接入。正式切换前仍须验证不同后台
的独立 Electron session、登录/OAuth、稳定来源与旧数据迁移，并在
无网页依赖的隔离服务器上验证全部客户端流程和回滚。

2026-11-17 候选补充：独立代理已增加每次实例能力令牌，HTTP 与屏幕
WebSocket 入站校验，出站剥离。注入候选只对 app 窗口自身代理请求写入；
但该候选未接入 Electron，真实窗口对 WebSocket、worker、iframe、重定向
和导航的覆盖未测量。因此不要把该令牌当作生产调用者认证，也不要在覆盖
实验通过前接入正式窗口。现有配置和生产行为不变。

2026-11-18 Batch 2 桌面启动接线更新：打包桌面客户端连接现有远端服务器（`mode: "existing"`，含默认云地址与 `SYDNEY_PC_BACKEND_URL`）已正式切换为内置渲染器 + 本地固定端口 `StandaloneRendererProxy` 模式（可通过 `RAKAZO_DISABLE_BUNDLED_RENDERER=1` 紧急回退旧远程页面加载；`SYDNEY_STANDALONE_RENDERER_DIR` 仅在非打包开发/测试态生效，打包版固定读取 `resources/web`）。桌面应用在 `userData/standalone-origins.json` 按规范化后台 origin 持久化本地回环端口与 `persist:sydney-standalone-<摘要>` 分区：若该端口被本机其他进程占用（`EADDRINUSE`），客户端会拒绝启动并停留在设置恢复界面提示关闭冲突进程，不会自动改换端口以免丢失本地存储；若 `standalone-origins.json` 损坏，客户端保持原文件并提示修复或删除后重试。升级到独立模式后，因使用新的独立会话分区，用户首次需在桌面端重新登录。当前线上 `web` 服务仍不可停用：桌面/移动双端 Slack 与 MCP OAuth 回调闭环、认证 `buildTrustedOrigins` 的 `apiUrl` 放行、移动端启动自愈、云电脑画面容器网络与 Caddy/Compose/Updater 去 `web` 改造尚未完成部署验收。

2026-11-18 实验与全仓盘点更新：桌面能力注入候选与独立代理已完成首跳导航、错误页恢复、`<a download>` 下载、双令牌屏幕窄授权、固定回环端口选项与 120s 默认响应头超时修复，在锁定的 Electron 45 中直连强制 `403` 代理通过 13/13 项实验，并经独立子代理两轮复审；但 `main.ts` 正式窗口尚未切换，桌面安装包生产行为仍保持不变。同时全仓网页退役代码审查确认：下线线上 `web` 容器前，除完成桌面正式接线与双端 Slack/MCP 回调闭环外，还须在原生 Linux 部署配置补充 `service:api` 的 `127.0.0.1:16080 -> screen.sock` 画面桥接、在 Docker `supervisor` 支持将 `service=api` 加入隔离沙箱网络、在 Caddy 补齐 `/.well-known/*` 与 `/integrations/callback` 指向 `api:3100`，并解除 `docker-compose.prod.yml`（`caddy.depends_on.web`）、`deploy-main.sh` 与 `updater` 对 `web` 容器的强制依赖；未完成上述改造与隔离演练前，禁止直接停止线上 `web` 服务。

2026-11-17 实验更新：真实 Electron 实验确认页面内 fetch/XHR、WebSocket、
iframe 后续请求、Worker fetch 和同源重定向可注入，但首次主页面导航与
iframe 导航没有令牌，接入受保护代理会拒绝首次加载。该实验文件仅供复跑，
不是产品接线依据；不要在补齐首次导航授权并通过实验前启用能力校验的
正式窗口。

`SYDNEY_SIGN_IN_UPSTREAM` 控制三份 Caddy 模板的精确
`/sign-in` 上游，当前源码默认 `api:3100`；生产 Compose 透传该值，
并默认启用 `SYDNEY_LEGACY_SIGN_IN_RETURN_ON_API`。这一精确路由
保留客户端旧验证链接的返回处理，不提供网页登录界面。
源码默认变更未在本批整体部署，双端返回链路仍需实测。隔离网关脚本第五个
参数可选择 `unset`、`web` 或 `api`，默认 `unset` 以检查
未设置时的回退；需在授权服务器分别运行并检查日志及恢复。
隔离脚本把默认 Web 地址替换为回环替身，不代表验证生产 DNS。
当前未经实测，不更改生产配置。

`SYDNEY_LEGACY_SIGN_IN_RETURN_ON_API` 默认关闭，仅为网页退役
准备 API 的 `/sign-in` 提示页；单独启用不会更改现有网关路由。
拟切流时须先让所有 API 实例具备该页，再在隔离环境对每个仍受控
旧来源的精确 `/sign-in` 路由进行验证。该路径也用于普通网页登录、
深链及 OAuth 错误，切换后这些访问都会看到返回客户端提示，不能
按请求可靠区分；完整退役前不得切换。回滚顺序为先恢复并验证
Web，再将网关路由切回 Web，最后关闭 API 兼容开关；已发新邮件
所需的 API 返回页仍须保留。兼容入口的停用需核实所有发信实例、
历史令牌期限、邮件排队延迟和时钟偏差，并完成真实验收；上述
步骤尚未在服务器演练。

`SYDNEY_NATIVE_EMAIL_VERIFICATION_ON_API` 默认关闭；启用后
新发验证邮件回跳 API `/api/auth/email-verification-return`，
旧邮件仍回旧网页。启用前必须验证邮件中的验证和回跳地址均
为接收设备可访问的 HTTPS 来源、代理 `/api/*` 路由与日志脱敏，
并演练真实成功、失败、过期、旧邮件和回滚。本地回环仅供开发，
手机不能把电脑的 `127.0.0.1` 当成服务器；当前不在生产启用。
关闭开关只改变以后发送的邮件，不改写已发送链接。

桌面独立代理候选对无影资源追加完整策略并过滤站点状态
响应头，尚未接入产品；真实 SDK、Cookie 依赖及跨路径跳转
兼容均未验证，不能据此切换生产画面。

桌面独立代理候选新增 noVNC 沙箱 CSP 与响应头过滤，尚未接入
产品，无需更改生产。启用前须验证真实画面、认证及跳转兼容，
并确认最终部署的代理和 CDN 保留安全响应头。

`SYDNEY_MCP_NATIVE_CALLBACK_ORIGIN` 是新增候选配置，默认空；
仅接受不含路径的规范 HTTPS 来源，配置后仅显式请求原生回调的
客户端使用它。当前仍禁止在生产设置：先完成代理日志、提供商
回调登记、授权撤销和并发保护、真实设备及回退验证。清空该值
使后续新授权回到旧网页回调，已发起授权与回滚效果尚未实测。
已动态注册或预注册的服务商客户端可能只允许旧地址；切换前须
验证新地址的登记及客户端迁移策略，不能假定现有客户端可复用。

API 新增 `/api/mcp/oauth/callback` 静态回填页候选，默认授权
流程不使用它；不需要更改生产配置。启用前必须核验服务商
预注册回调、代理路由以及访问日志是否记录包含授权码的查询，
并验证旧客户端与旧回调的兼容和回退；目前均未验证。
静态审查发现现有 Caddy 字面参数过滤可能漏掉编码参数名，不得
在日志保护验证前启用；刷新回填页后需要重新开始授权。
仓库中三份 Caddy 模板已改为遮盖全部查询字符串，访问日志将
失去查询参数；此修改未部署，真实 Caddy 的替换行为及代理、
CDN、错误日志与收集器仍须隔离验证。回滚应恢复原配置并核实
日志策略，不能将源码修改视为线上已生效。

MCP 授权开始结果新增可选 `callbackUri`；旧客户端不必依赖该
字段。手机插件和集成页仅在 API 原生回调路径下提供手动回填；
默认网页回调继续原有浏览器行为。不能停网页或认为真实原生
授权已验收；不要在日志或文档中记录回调地址与授权码。

允许脚本的合成沙箱 iframe worker 也能绕过自定义协议实验门禁；
缺失的 Origin/Referer 不能用作可信身份。实验无产品接线，现有
配置不变；实际画面 CSP 与生产风险需独立验证。

Electron 自定义协议实验的 webRequest 门禁被合成外部 iframe
worker 绕过，不能启用或作为生产安全控制；现有部署不变。

自定义协议替身已复现外部页面通过共享 session 触发带合成 Cookie
的写请求；它不能作为产品接线或安全配置，现有部署保持不变。

自定义稳定来源仅为隐藏 Electron 实验，未启用或接线。替身中
Cookie 存在 loopback 而非自定义来源，不能据此认定认证或隔离
安全；实际部署配置无变化。

当前 loopback 候选使用动态端口；Electron 替身证实不同端口的
localStorage 不共享。不要将候选直接接入产品并承诺设置或缓存
重启后保留；稳定来源方案和迁移、回退尚未验收。

桌面独立界面分区当前只是未接线候选，按后台源使用独立的持久
分区名，和旧会话分开；若未来启用，原有登录不会自动迁移，可能
需要重新登录。现有分区与数据不删除；启用、登录和回退流程尚待
实际验证，现阶段无需操作。

桌面 loopback 候选在同一浏览器会话内的不同端口共享同主机 Cookie；
不得通过更换端口实现服务器会话隔离。Chrome 的独立上下文替身未
共享 Cookie，但产品 Electron 分区、旧 session 迁移及回退尚未验收。

桌面候选的可选 TLS 拒绝测试使用环境变量 `SYDNEY_TEST_OPENSSL`
指向已有 OpenSSL 程序；它仅生成并清理测试临时证书，不修改系统
信任。测试还会临时调整当前测试进程的信任列表并在结束时恢复；
缺少程序路径时跳过。测试通过不等于真实 TLS 验收。

## 桌面 noVNC WebSocket 候选（2026-11-14）

独立候选已支持受限的 noVNC WebSocket 转发，但未接入桌面产品或
生产；现有部署无需调整。HTTPS、授权撤销、真实画面、本机进程与
会话隔离仍待验，现有入口和网页服务保持不变。

## 桌面 noVNC 资源候选（2026-11-14）

仅离线候选支持 opaque 沙箱下能力路径的匿名只读资源；能力票据仍须
由后台验证。候选未连接产品，不需要改变现有配置；WebSocket 尚未
支持，真实云电脑不能据此视为可用。本机其他进程访问 loopback 和
不同端口 Cookie 共享等风险须在产品接线前解决并验证。

## 桌面 loopback 代理验证候选（2026-11-14）

代理尚未与桌面主进程或安装包接线，现有桌面入口不变。临时浏览器
合成实验发现无影 opaque frame 的资源跨来源请求需单独处理，候选
代理仅允许固定四个无影资源匿名 GET/HEAD，不转发会话凭据、任意
客户端头，也不接收这些响应的 Set-Cookie。其他后台路径继续限制
来源。Chrome 测试中的 loopback Secure Cookie 成功不代表 Electron、
现有会话迁移或跨服务器隔离可用；WebSocket 明确未支持，noVNC 的
沙箱资源、外部 OAuth、本机进程访问及真实画面仍须单独评估与验收。
不得启用或用该模块替换生产桌面入口。

## Slack 手机安装回跳候选（2026-11-14）

关联 PA-023。新手机显式发起 `returnTo: mobile`，后台仍使用原登记的
`/api/v1/messaging/install/slack/callback`，不需要因该候选修改 Slack
公网 redirect URI。API 校验 state/有效期并原子标记一次转交，只将
code/state 回跳到固定 `rakazo://messaging/slack/callback`；只有原登录
用户完成 authenticated complete 才会交换 code 并安装。公开回跳不
具备独立完成权限。旧客户端缺参及旧记录空列继续走原网页回调。

部署顺序候选：备份及隔离恢复验收后，先应用
`20261119200000_messaging_install_return_to` 并生成匹配 Client，再发布
API/adapter，最后发布手机端。迁移新增两列及返回目标约束，当前未
执行。即便仍使用 web 分支，新服务端也读写新增列，不能省略迁移。
原网页回调在桌面和旧会话迁移完成前继续保留。

手机授权会话最长十分钟，退出页面、切换服务器/账号、超时会取消等待；
应用进程被结束后不恢复授权，重新发起。回跳转交后断网或未能完成也
可能需要重试整个授权。自定义 scheme 无法证明接收 App 身份，仍有
截获/拒绝服务风险；不能把登录用户及 state 校验称为消除此风险。
当前只有替身和类型检查，未验证 Slack、iPhone 系统授权窗口、Postgres
并发及设备切服。回滚前先停止新手机授权，等待在途会话超过十分钟，
再回退 API/adapter；新增可空列保留，先核实再做清理。未部署或切流。

## 后台独立密码重置候选开关（2026-11-14，复审后修订）

`SYDNEY_NATIVE_PASSWORD_RESET_ON_API` 默认关闭，邮件继续使用现有
网页重置链接；显式设为 `true` 后，仅新申请的邮件改用 API 承载的
`/api/auth/native-reset?token=...`。这里是后台最小账号恢复页，不依赖
网页产品构建或服务；支持在浏览器设置密码，手机也可复制原始邮件
链接，在原生界面粘贴并设置密码。不会向自定义 scheme 传递凭据。

新链接先应用 `AUTH_PUBLIC_LINK_ORIGIN` 的既有可信来源映射，再构造
API 页面地址；要求公开 HTTPS，HTTP 仅允许 loopback 开发。映射来源
必须属于已有可信来源清单。页面使用固定脚本/样式 CSP 哈希、不反射
查询参数、不缓存、禁止嵌入、不加载第三方资源，载入后清除地址栏中
token，只在内存保留至关闭或刷新。刷新后需从原始邮件重新打开。

密码提交仍走公开的 `/api/auth/reset-password`，不要求已有登录态；
复用 Better Auth 原有一小时有效期、一次性消费、密码策略及生产限速，
既有请求大小限制保持在认证解析之前。GET/HEAD 不操作密码或数据库，
邮件扫描不消费 token。失败可重试，实际消费由认证层负责。此页不是
PKCE 或受验证应用链接方案，不承诺十分钟 state 或原生自动冷启动。

启用前确认所有 API 实例和网关支持该路径，运行用户配置的公开 HTTPS
来源可达，真实邮件、双端及失败重试通过。关开关只停发新格式邮件，
API 页继续支持已发链接；回滚至不含该页的版本前，应先停发并等待
底层 token 过期，或保留提供该页的实例与路由。旧邮件仍需保留旧
网页落地页直到过渡验收。原短时会话表及迁移未部署且已从候选源码
移除，无需执行新迁移；若另有环境曾应用该实验迁移，先核实，不直接
删表。生产未启用，真实 SMTP、iPhone 和桌面尚未验证。

## 无影画面脱离网页的候选部署（2026-11-14）

关联 PA-023。下述为源码支持的准备与切换顺序，未实际构建、部署或
验证真实 SDK/云电脑。现有入口及双端地址未改，无影与 noVNC 两种
画面分别切换，不能只开启 API 就停止网页。

| 配置 | 默认及用途 |
| --- | --- |
| `SYDNEY_PREPARE_WUYING_ASSETS` | 镜像构建参数，默认 `false`；`true` 才在 Compose/Railway Dockerfile 中下载并校验固定 SDK。源码 Compose 的四个应用构建入口及 Docker overlay 使用同值；预构建镜像不会因改此变量自动补资源。 |
| `SYDNEY_WUYING_ASSETS_ON_API` | API 运行开关，默认关闭；只有显式 `true` 才注册资源路由。 |
| `SYDNEY_WUYING_ASSETS_DIR` | 开启 API 路由时必填绝对路径；当前源码镜像候选为 `/app/packages/core/wuying-assets`，宿主运行需换成实际绝对目录，不能直接套用容器路径。 |
| `SYDNEY_WUYING_SCREEN_UPSTREAM` | 三种 Caddy 模板的独立上游，2026-11-20 源码默认改为 `api:3100`，与 `SYDNEY_SCREEN_PROXY_UPSTREAM` 分开。实际生产仍以生效配置为准，无影需要 API 镜像包含固定 SDK。 |

SDK 固定为 `2.13.22-asp3.18.14`，两份原始厂商文件的 SHA-256 沿用
准备脚本已有清单。仓库维护 screen.html、screen.js、storage.js；厂商
JS 和嵌套容器不提交，准备脚本按固定补丁在容器 head 后注入 storage
shim。普通网页构建不执行下载。仅在授权的准备环境、仓库根目录运行
以下命令；本轮只测试了合成内容，未执行真实下载：

```text
node scripts/wuying-web-sdk.mjs --target=api
node scripts/wuying-web-sdk.mjs --check --target=api
```

默认省略 target 时同时准备或检查 API 与兼容网页目录，`--target=web`
只处理旧目录。`--check` 不联网，检查三个自有资源存在、厂商摘要及
容器补丁；不能证明 SDK 运行兼容或外部 CDN 可达。全部下载通过校验
才暂存到目标目录，暂存全部成功后逐文件 rename；下载/校验失败不会
覆盖旧文件，发布阶段磁盘故障仍可能留下部分已替换文件，并非跨文件
事务。只在独立构建或离线准备目录执行，检查成功后再部署完整产物，
不对活动容器资源原地更新。目录需由运维控制、运行用户可读且不可由
应用用户/外部上传修改；真实路径检查不能防止有写权限者并发换链。

测试部署先保持 Caddy 指向网页，检查每个 API 实例能返回五个固定路径：
`/wuying/screen.html`、`screen.js`、`storage.js`、`WuyingWebSDK.js`
及 `/wuying/sdk/ASP/container.html`（中间三个均位于 `/wuying/`）。
入口在任一文件缺失或不可读时返回 503，单文件缺失返回 404；目录列表
和其他文件不对外提供。复验 CSP、opaque frame、控制权、失败及重连，
之后才评估无影网关切流。桌面本地资源覆盖现将无影路径交回服务器，
仍需真实桌面和 iPhone 验收；此修改未使桌面主界面独立。

网关模板仅对 `/wuying/sdk/ASP/container.html` 排除所加的
`X-Frame-Options: SAMEORIGIN`，其他路径保留；该容器位于 opaque
祖先下，SAMEORIGIN 会阻断加载。切换前检查最终公网响应，确认上游
或 CDN 未重新添加该头，并保留容器 CSP sandbox 与外层入口的
`frame-ancestors 'self'`。入口可读性预检以 API 身份只读打开并关闭
五个文件，不读取整个 SDK，也不等同于 SDK 摘要校验；生产权限仍需
用实际运行用户复验。无影响应保留 Reporting-Endpoints，但当前共享
无影 CSP 没有 report-to/report-uri，未启用或验收违规报告链路。

回退时先将无影网关上游改回保留的网页服务并验证，再关闭 API 路由；
不能先关闭已经承接流量的 API 路由。构建参数不改变活动容器，关闭它
也不是回滚。IP 隔离脚本的第四参数同时选择 noVNC 与无影的合成上游，
新增五个无影路径检查；脚本尚未在服务器运行，不验证真实 SDK、
Compose 注入、默认值或云电脑登录。

2026-11-13 IP 画面网关隔离演练（历史接口，现行用法见 [退役运维](#删除退役-web2026-11-20)）：`test-ip-proxy-routes.sh` 的前三个
参数不变，第四参数可选 `web` 或 `api`，省略为 `web`；要比较两条
路径需分别执行。脚本使用隔离网络、合成画面票据及合成上游，检查
HTTP、WebSocket 和日志脱敏。脚本尚未在服务器运行；它显式注入本地
测试上游，不验证生产 Compose 透传、实际上游或默认值，不能据此
切换生产。

2026-11-13 画面代理候选配置：`SYDNEY_SCREEN_PROXY_ON_API` 默认
关闭，显式设为 `true` 才让 API 监听画面 HTTP/升级请求，要求固定
`API_PORT`（1 至 65535）。生产 Caddy 候选模板的
`SYDNEY_SCREEN_PROXY_UPSTREAM` 默认 `web:5173`；只有 API 候选部署
并验证后才可评估切换为 `api:3100`，两项配置分别生效。API 内部以
自身监听地址和画面密钥访问原有权威检查接口。现有配置尚未部署，
Caddy 格式与双斜杠、WebSocket、日志脱敏、滚动升级、回滚及双端
均待测试环境验证；切换前保留网页与现有入口，不应按本文直接停服。

2026-11-13 画面代理本机替身验证：在 `apps/web` 目录使用 PowerShell
设置 `$env:SCREEN_TEST_BROWSER` 为本机已有 Chrome 可执行文件的完整
路径，运行 `pnpm exec playwright test --config playwright.screen-proxy.config.ts`。
不设置该变量时使用 Playwright 自己管理的浏览器。该配置不启动额外的
全局开发服务器，但用例会在本机启动临时 Vite、模拟授权及上游服务；
它不能验证生产。测试不录像。

2026-11-13 托管连接回跳迁移：新 API 代码提供
`/api/v1/integrations/callback` 和旧 `/integrations/callback`；默认
仍发起旧网页回跳。只有设置 `SYDNEY_INTEGRATION_API_CALLBACK=true`
才对新授权使用 API 路径，此时来源优先取已配置的
`AUTH_PUBLIC_LINK_ORIGIN`，否则取 `WEB_ORIGIN`。先部署关闭状态的代码，
确认所有 API 实例和公网路由支持新路径，再核实各服务商回调白名单、
旧路径代理及回滚后，才能评估打开开关；关闭开关不改变已发出的地址，
回滚至不支持新路径的 API 仍会影响进行中的新授权。未部署或实测。

2026-11-13 iPhone 连接：Windows 及现有设备库可识别一台设备，Apple
移动设备服务运行；两个已知应用标识未查到，不能据此判定未安装。
现有本地 IPA 不包含本轮修改，尚未生成新的真机验收包。

2026-11-13 iOS 陪伴模块构建：普通包通过 Expo 配置插件在生成的 Podfile
中传入模块排除参数；`SYDNEY_COMPANION_EXPERIMENT=1` 的隔离实验包
保留该模块，并要求独立侧载标识且禁用 OTA。切换模式后应重新生成并
检查 Podfile；遇到非预期的 `use_expo_modules!` 调用，插件会报错而非
修改。实际预构建、CocoaPods 和安装效果待验证。

2026-11-13 项目测试发送新增项目范围 AI 数据授权接口及服务端检查；
沿用现有账号和 Space 授权记录。相关接口仅限测试实验，真实授权、
项目 RLS、发送时序、权限与回滚尚未验证，生产保持关闭。

2026-11-13 项目事件流复用测试模式会话实验开关；每次拉取会查询
项目访问状态。该接口尚未测量开销或验证断连、撤权和资源回收，生产
保持关闭；首页事件流回归也须验证。

2026-11-13 项目文本发送 RPC 仅在既有项目会话实验测试开关下可达；
不代表审批、后台任务、数据隔离或写入准备完毕。相关 CHECK 仍阻止
项目任务和运行，生产保持关闭；迁移与回滚尚未验证。

2026-11-13 项目会话快照复用测试环境会话创建实验开关；只代表接口
可进入测试路径，不表示数据库隔离或项目对话可用。项目列、RLS、
回滚和跨项目读取尚未验证，生产不可启用。

2026-11-13 手机项目群聊创建实验通过独立能力 RPC 控制；服务端测试
开关不代表数据库写入可用。请求 UUID 暂仅在项目页面内保存，离开
页面或重启后结果未知的请求须先检查名单；默认及生产环境保持关闭。

2026-11-13 项目群聊实验创建接口新增必填请求 UUID；测试客户端重试
应保留同一 ID 和成员顺序。数据库限制依旧有效，部署、兼容性、并发、
迁移及恢复均未验证，不在生产启用。

2026-11-13 手机项目详情使用独立会话创建能力 RPC；该 RPC 反映测试
开关，并不证明数据库或对话链路可用。现有数据库 CHECK 仍拒绝项目
Bot 创建；生产和默认配置不开放，客户端、回滚及隔离环境尚未实测。

2026-11-13 `SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT=true` 仅在
`NODE_ENV=test` 启用项目 Bot 和群聊创建 RPC 草案；数据库项目写入
CHECK 仍有效，因此正常迁移状态下不能成功创建。不得在现有或生产数据
库移除此限制；隔离测试夹具、迁移、备份和回滚均未实施或验证。

2026-11-13 运行附件读取范围代码依赖附件项目范围列，不能先于
`20261119180000_project_artifact_scope` 迁移部署；升级和回滚顺序、
现有首页附件和真实运行均未验证。

2026-11-13 历史检索范围代码依赖运行、线程和附件的项目范围列；不能
先于对应迁移部署。范围迁移、旧数据、首页历史、后台运行及回滚尚未
在实际数据库验证，当前项目会话仍关闭。

2026-11-13 `20261119190000_project_memory_scope` 为未应用的记忆隔离
迁移草案，依赖 Bot 项目范围和 RLS 迁移；可能改变历史异常归属记忆的
可见性。上线前须备份、审计数据、验证角色及系统任务，并演练回滚；
尚未执行迁移或恢复演练。

2026-11-13 项目创建测试开关同时提供空项目移除实验，仅限隔离测试
环境；删除仅操作元数据，非空项目、外部文件及授权不由该实验清理。
不要在现有或生产数据库试用；测试、备份及回滚均未执行。

2026-11-13 测试环境项目创建能力新增独立 RPC；新版客户端查询失败
时保持创建关闭，不修改旧列表响应。仅在隔离测试环境确认开关、迁移和
认证后验证，新旧服务与客户端组合及回滚尚未实测。

2026-11-13 `SYDNEY_PROJECT_CREATE_EXPERIMENT=true` 仅在
`NODE_ENV=test` 时接通项目创建实验；默认关闭，开发及生产模式不生效。
此开关只供隔离测试环境，在备份、迁移、角色和数据隔离尚未验证时不得
指向现有或生产数据库；双端创建按钮仍禁用。相关测试尚未运行。

2026-11-13 桌面本地目录授权存储草案的范围加入 Space 和项目；旧草案
授权记录不兼容。当前模块未接入用户界面，重启后本来就需重新选择，
尚无已验证的升级或清理流程；不应手工复制旧授权记录。

2026-11-13 账号删除空间认领草案会在持有 Space 锁时检查全部项目；
检查失败可能留下先前的账号和空间认领，恢复方式与错误提示尚未验证。
禁止手工解除认领作为常规恢复方式。

2026-11-13 运行生成附件归属草案依赖运行和会话的项目范围列；未应用
相关迁移前不能部署该代码。上线前须验证历史运行、首页群聊绘图、后台
任务数据库访问和生成文件回滚，当前均未验证。

2026-11-13 附件版本查询代码草案开始读取附件项目范围列，不能先于
`20261119180000_project_artifact_scope` 迁移部署；代码与数据库的升级、
旧版本并行和回滚顺序尚待环境验证，不能仅据此执行迁移或上线。

2026-11-13 项目附件范围迁移草案未部署：
`20261119180000_project_artifact_scope` 依赖项目元数据及项目范围
基础迁移；运行前须完成数据库角色、RLS、既有附件兼容、备份和回滚验证。
非空项目附件继续禁写，不能仅执行迁移就开放项目附件或会话。

2026-11-13 项目账号删除门禁草案未部署：新增
`20261119170000_project_account_deletion_gate` 迁移，项目创建存储函数
依赖该列，账号删除入口也已接入声明草案，创建 RPC 继续关闭。该代码
不能先于迁移部署；不得仅凭迁移开放创建或手工写入/清除标记。部署前需完成恢复方案、角色权限、
数据库锁与并发验证，并确定代码及迁移顺序和回滚；迁移尚未执行。

2026-11-13 项目名单分页草案未部署：新契约使用独立 Bot/群聊游标，
每页每类最多 100 项，前后端需同时升级；旧版名单契约不兼容。上线前
验证当前用户和项目 RLS、重复/删除/归档时的分页表现及回退，不应
解除项目写入门禁。现有生产入口和客户端地址未改。

2026-11-13 项目名单 RPC 草案未部署：依赖项目元数据及 Bot、群聊项目
范围列与对应 RLS；客户端同时需要新服务端契约，旧服务端缺少该接口时
项目详情会加载失败。每类最多展示前 100 项，尚无续页。上线前需在授权
数据库验证角色/RLS、不同用户与项目、归档和项目撤销；项目创建和聊天
禁写约束不变，生产入口和双端地址未调整。

2026-11-13 桌面渲染隔离实验续项未运行、未部署：只扩展显式开启的
Electron 测试夹具，不新增产品配置。现有远端模式仍依赖服务器网页；
不得因实验代码存在而关闭网页服务或更换双端后台地址。

2026-11-13 群恢复锁调整草案未部署：配置电脑配额时先锁用户配额，
再锁候选 Bot 与群；成员在锁定过程中变化时返回冲突而不恢复。启用前
应在授权测试数据库验证群恢复、配额不足的事务回滚、并发成员变更、
删除及归档、RLS 和锁超时；项目数据库禁写保持不变。

2026-11-13 群成员更新草案未部署：新增候选 Bot 行锁及事务冲突重试，
影响首页和未来项目。上线前须覆盖群恢复、Bot 归档与删除、群更新、
锁等待和冲突返回，确认真实运行角色可锁定行及原有群聊行为；不解除
项目禁写，不改变生产入口。

2026-11-13 群聊创建改动草案未部署：创建时需依赖前序项目归属列及
数据库权限，并在原事务按 ID 锁定候选 Bot。启用前需在授权测试环境
核实运行角色、RLS、归档与删除竞态、锁等待及首页群聊回归；不能
以该改动解除项目写入约束。未修改生产入口、服务或双端后台地址。

2026-11-13 创建重试草案无新表或迁移：客户端创建契约要求 UUID，手机
只在当前页面内复用；服务端元数据函数仅在相同活动记录尚存时尝试
识别重放。不要依赖它处理物理删除后的重放、重命名或重启后的操作
恢复。路由仍固定拒绝，未部署，不提供开关。

2026-11-13 项目创建草案：服务端虽增加创建 RPC 契约及元数据插入草案，
路由固定返回 `SERVICE_UNAVAILABLE`，手机和桌面入口禁用；没有新增
启用开关。不得通过直接调用插入函数、绕过路由或手动写库开放项目，
需先完成账号/成员删除并发门禁、项目移除及重试恢复设计和验证。
该草案未部署、未迁移；现有生产入口和客户端后台地址没有更改。

2026-11-13 外部操作项目范围迁移（草案，未应用）：新增
`20261119160000_project_external_operation_scope`，依赖会话归属列、
RLS 及一致性函数。为 `cloud_agents` 和 `purchases` 增加范围快照、索引、
七表 CHECK 门禁与项目限制性策略；为 CloudAgent 补 tenant/system 策略，
让新 RLS 开始前已经存在的跨租户 worker/reconciler 在明确 bypass 下
继续工作。新服务引用字段前仍需迁移后重新生成 Prisma 客户端。

外部 provider 请求不能在项目删除流程中被当作数据库事务回滚。Cloud
Agent 即使原 Bot/Thread 已删除，依然按持久 Space/User/项目继续取消，
终态不写已失效会话；Purchase 保留既有 Space cascade 行为，未处理的
项目/Space 删除竞态仍是阻塞项。此快照表不自动授权新操作，创建仍须
解析实际 Thread/Bot/群成员和当前项目；项目切换后的旧 ID 不应被当作
有效上下文。不要移除 RLS、CHECK 或不变触发器来排障。

该草案没有改变现有生产地址或运行服务；未执行迁移或 worker 验证。
服务器启用前必须先备份并专门演练旧 worker 与新策略并存、失败回滚、
远端取消、已删聊天/账号及项目标记删除时作业如何继续。Space/账号删除
可能删除 Purchase 是既有级联关系，需在解决前保持项目功能关闭，不能
声称已做到外部副作用与账号删除原子协调。

2026-11-13 会话一致性迁移（草案，未应用）：新增
`20261119150000_project_conversation_consistency`，依赖范围列与核心
RLS 的前序迁移。它用事务包住触发器和函数创建，按调用者权限校验
父子对象归属，并固定已有会话身份和目标；系统 bypass 只影响 RLS，
不能跳过这些检查。没有新增依赖、环境开关或 Prisma 字段；未来生成
迁移时仍需保留手写触发器，不能以模型未表达为由移除。

此迁移也约束普通首页的身份与新关系写入，允许同值身份更新及普通
名称/状态变更，不支持通过改账号、Space、项目或目标迁移历史会话。
启用前在授权服务器维护环境核查旧数据一致性和旧服务写入方式；
不一致数据应另行制定修复方案，不能自行搬到首页或跳过检查。迁移
本身不扫描、不修复全部历史关系，也不阻止其他进程在验证期间写入。
先确定维护窗口和备份，再验证锁影响、合法创建/更新、错误关系、
外部会话、群成员移除、父对象删除、连接角色及并发。

五表 `*_project_scope_disabled` CHECK 继续保留；新触发器不能作为
解除它们的依据。现有 PostgreSQL 测试已补充合成首页和系统旁路约束
草案，未实际运行，需在专门测试数据库按原显式启用方式执行，不面向
生产运行。应用回退时保留列、触发器和禁写约束，旧版本是否兼容仍
需演练；不通过禁用触发器、改 RLS 或改运行角色绕过故障。本轮未迁移、
启动服务或改变现有生产入口及手机/桌面地址。

2026-11-13 会话与作业范围续项（代码草案，未部署）：核心新任务创建
先从存储的会话关联解析项目，Task 和 Run 在原事务保存同一归属。
Run、Thread 后台作业通过现有系统所有者读取取得项目；重新执行使用
记录中的范围，不使用当前手机、桌面选择或作业载荷里的项目字段。
电脑等非会话作业显式使用首页范围，其他作业如何取得项目仍需继续
适配；不能据此开放项目定时、云代理或支付功能。

这部分继续依赖范围列和核心 RLS 两个迁移以及 Prisma 客户端生成；
本轮没有实际执行。新建任务增加关系查询，延迟、查询计划及真实服务
负载待服务器验证。旧服务与新作业版本的回退行为、对象归属不可变
约束和删除恢复仍待完成；保留五表项目禁写 CHECK，不改生产入口。

同阶段创建接线还覆盖定时/重试、Bot 交接、技能试运行、云代理和支付
等回调，均是未部署代码。定时与技能作业经所属 Bot 取项目，不能采用
作业载荷或当前客户端选择。云代理与支付尚无持久项目恢复设计，清理
又必须能在原 Bot/Thread 删除后继续，不能仅因创建字段已补齐就开放。
跨 Space 通信开关只保留普通首页原规则，不能授权首页与项目、两个
项目之间互通；同项目通信还须同账号和 Space。依赖范围列迁移，无
新增运行开关，不能用环境变量绕过数据库项目禁写。以上均未服务器
验收；保留现有生产入口、客户端地址和已有数据。

2026-11-13 项目执行上下文及 RLS（草案，未部署）：服务端数据库上下文
增加 `app.project_workspace_id`，空字符串代表普通首页，项目选择需先
验证当前成员可见元数据。该值不能由未校验的请求头或模型输出直接设定；
账号、Space 和系统 bypass 的现有权限不变。项目执行入口用于数据库
事务外层，必须在借出事务连接之前选定范围，不能在已打开的事务中
仅靠切换 JavaScript 上下文来更改 SQL 连接范围。流式迭代和 worker
继承仍需适配，尚未对客户端开放此入口。

新增有事务包裹的 `20261119140000_project_conversation_row_security`，
须先完成 `20261119130000_project_resource_scope_columns`。它为五类
核心对象叠加限制性 RLS，为群聊、成员新增 RLS，事件依赖所属线程；
需在授权服务器验证实际运行角色、策略与旧服务兼容。缺少项目设置的
旧服务只走首页范围；已验证的系统 bypass 保持跨范围能力。仍保留
五表禁写 CHECK，不可手工解除；附件、记忆、后台、删除等路径未完成。
本轮未应用任何迁移或启动服务。回退应用时保留列、策略和禁写约束，
不得通过删除策略或改用表所有者来绕过故障，恢复流程待实际演练。

2026-11-13 首页查询版本依赖：新增首页范围查询读取五表归属迁移中的
字段，须先应用 `20261119130000_project_resource_scope_columns` 并按
现有构建流程生成 Prisma 客户端，再部署相关服务。缺列不可回退为
不带范围的查询。该代码未构建或部署，项目写入约束继续保留；回退
应用版本暂留数据库新增列和约束。未验证以上顺序的实际执行。

2026-11-13 手机项目导航草案：底部文件夹入口打开项目列表，选中项目
进入 `/projects/[workspaceId]`，切换按钮返回列表。两级项目路由在
宽屏也隐藏首页侧栏；详情绑定打开时的服务器、会话和 Space，切换后
需要从列表重新选择。路由参数中的范围标记仅用于阻止旧界面复用，
不是服务端授权。未新增依赖或更改后台地址；代码尚未构建、安装，
不开放项目内 Bot/群聊写入，不删除已有数据。

2026-11-13 项目会话归属迁移（草案，未应用）：新增
`20261119130000_project_resource_scope_columns`，依赖先完成项目元数据
迁移。为 Bot、群聊、线程、任务和运行表增加可空归属、复合外键及索引，
不回填旧记录。五张表均有 `*_project_scope_disabled` CHECK，强制归属
为空；不能通过开关或客户端参数启用项目会话，也不能手工去掉约束。
新增迁移用显式事务包住五表和索引变更，防止中途只更新部分表；实际
执行时可能持有多表锁，需先在服务器演练确认维护窗口。
Prisma 无法表达该 CHECK，后续迁移必须保留它，直到完整隔离及兼容
验收通过后再提交独立解除迁移。旧写入省略归属时仍为普通首页。

本轮未执行迁移、Prisma 生成、服务启动或部署。上线前应在授权服务器
核验迁移锁、备份恢复、运行角色、旧版本读写及约束；数据库迁移必须
先于引用新字段的服务版本。应用回退时暂留新增列和禁写约束，避免删除
数据；移除列、索引或外键须另行审批并验证备份。在解除约束并产生项目
数据后，不能直接回退到忽略归属的旧服务。本段为待验证操作顺序，不是
已验证命令或生产操作记录。

2026-11-13 项目只读入口（代码草案，未部署）：桌面当前渲染器底部
文件夹按钮进入 `/app/projects`，列表/详情经 `/rpc/projectWorkspaces/list`
和 `/rpc/projectWorkspaces/get` 读取当前账号、Space 的元数据。依赖
`20261119120000_project_workspace_metadata` 迁移和相应 RLS 配置，
本轮未应用或核实生产迁移；缺表、旧 API 或数据库故障应显示错误，
不可回退到首页列表。未提供项目创建、绑定、删除或项目内会话写入。
上线前需验证迁移、接口与客户端版本及回滚兼容，当前生产未改动。
手机底部也新增文件夹入口，进入 `/projects` 读取相同接口；该页面及
入口未安装验证，旧服务器缺少接口时只显示错误，不回退到首页会话。

2026-11-13 原生密码重置（代码草案，未验证）：在手机忘记密码发送邮件
后的界面，可以手动复制完整邮件链接并粘贴，填写两次新密码后提交给
原服务器。只接受当前服务器或其认证能力接口提供的重置来源；不自动
切换服务器、不记录链接或密码。响应不明确时先尝试用新密码登录，
失败再申请新链接。真实邮件及设备行为待验证，网页重置入口继续保留。

2026-11-13 手机头像库（代码草案，待真机验证）：用户选择的相册头像
尝试写入 App 文档目录下 `sydney-bot-avatars`，最多 40 个；同一设备的
App 账号共用，不随服务器账号同步。可在创建 Bot 界面移除本地副本；
已提交给服务端的 Bot 头像属于独立数据。系统备份、恢复及卸载后的
保留行为尚未实测，不能依赖该目录作为唯一备份。中断的写入可能留下
`.tmp` 文件，目前不会自动清理；不可把它视为已保存的头像。

2026-11-13 生产 IP 切换当前复核：本机只读公网探测确认
`https://124.221.182.39/health` 与 `https://pc.zxlup.xin/health`
均返回 200；IP 来源 RPC 健康返回 200；认证能力接口两种 Host 均返回
`https://124.221.182.39/reset-password`。IP TLS 证书通过系统信任链及 IP
身份校验，剩余约 156.7 小时（证书到期时间为北京时间 2026-11-20 02:12:44）；
生产 Caddy 实时管理配置为 IP subject 的 ACME `shortlived` 策略；维护
节点 timer 为 active，最近一次检查服务 `Result=success`、退出码 0，
但这仅证明检查执行成功，不代表发生过续期。未配置失败通知送达证据。
旧域名保持服务，不要删除或停用。当前 iOS unsigned IPA 可从
https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/43375597868
下载，artifact 为 `sydney-ios-unsigned-43375597868-1`，有效期 7 天；
安装包 SHA 对应提交 `45c9d2c352bbbc24e533bf5d27b8e1b8c821311f`，需用户
自行签名安装。真实手机登录、聊天和屏幕业务未由本轮验证；Windows 当前
安装包尚未构建。此前记录中的“未签发/未开放”是较早时点，以上当前探测
取代其线上状态描述。

2026-11-13 iOS 侧载 IP 候选：手动运行侧载工作流默认目标为
`https://124.221.182.39`，仍可选择旧域名。正式 bundle ID 对其他
服务器保持拒绝；IP 构建不传入原域名 OTA 项目变量，必须发布新
二进制。已有会话按令牌绑定来源继续连接旧域名或 IP；来源记录不可读、
损坏或与令牌不匹配时阻止启动。代码未推送或构建；不要据此覆盖
用户安装，亦未验证同 bundle 签名升级、钥匙串/outbox 保留或真实账号。

2026-11-13 生产 API 公共来源：`AUTH_PUBLIC_LINK_ORIGIN` 与
`SCREEN_PROXY_PUBLIC_ORIGIN` 均设为 `https://124.221.182.39`；生产
Compose overlay 备份为
`/etc/rakazo/compose/production.overlay.yml.before-ip-origins-8ba62d31fe0678ae11eb67f675ba6d2e`。
API 保持现有镜像和数据库，双实例健康切换完成，旧域名和 Caddy
代理继续提供服务。该专用部署脚本已使用且不是可重复部署命令；手工
回滚须先核验当前 overlay 身份、部署锁、API 容器和备份摘要，再恢复
备份并按 Compose 滚动替换，确认 IP/旧域名健康。此手工回滚未演练。
真实邮件、密码恢复和屏幕代理未通过已登录客户端验收。

2026-11-13 Windows 云端入口候选：源码中的 Windows 新配置快捷
入口使用 `https://124.221.182.39`；已保存的服务器配置不会自动
切换，旧域名设置在新界面中可能显示为自定义服务器。Passkey
默认关联域名仍为 `pc.zxlup.xin`，这不证明 IP 来源可用旧 Passkey。
代码尚未构建或安装，生产认证能力目前仍返回旧域名找回地址。

2026-11-13 桌面 IP 匿名探测使用旧 Windows 目录包和临时独立用户、
会话目录，通过首页登录链接进入生产 IP 登录页；没有修改正式
桌面配置或输入账号。旧包不是当前源码的安装器，也不代表真实
登录和同步已验证。客户端默认地址和旧入口保持现状。

2026-11-13 IP 证书定时检查：独立维护节点的
`sydney-ip-certificate-check.timer` 每小时启动
`sydney-ip-certificate-check.service`，使用系统信任库核验公网 IP
证书，剩余不足 72 小时返回非零。首次执行成功。检查状态可在维护
节点运行 `systemctl list-timers sydney-ip-certificate-check.timer`
及 `journalctl -u sydney-ip-certificate-check.service`。
脚本位于 `/usr/local/libexec/sydney/check-ip-certificate.py`，
单元位于 `/etc/systemd/system/`，仓库内保存相应单元。
停用检查可执行 `systemctl disable --now sydney-ip-certificate-check.timer`。
当前仅写系统日志，没有消息通知，也没有监控维护机离线或任务停运行；
不得将定时检查视为告警送达或实际续期已验证。

2026-11-13 生产 IP 业务入口已开放：IP HTTPS 使用原域名同等
代理路径，匿名页面、会话及 RPC 健康已公网验证；旧域名保留。
原 IP 健康配置副本为
`/etc/rakazo/Caddyfile.prod.before-ip-b53811764eaf0f69f06d630ce186a26e`。
`deploy-ip-health-guarded.py --business` 为本次专用变更，不可
重复执行；撤回须核对当前文件及 Caddy 挂载 inode、运行配置和
并发状态。真实业务、客户端及实际证书续期仍待验证。

2026-11-13 生产 API 已滚动使用镜像
`sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87`，
通过 Compose overlay 配置 IP 可信来源；原 overlay 副本为
`/etc/rakazo/compose/production.overlay.yml.before-ip-cd38108f47fa70a46b88b718bc6144fd`。
原镜像仍在生产缓存；回退须核对当前服务、overlay 及部署锁，
先恢复原 overlay 并启动健康旧 API，再停止新 API；上述生产
回退没有实际执行。新 overlay 固定 API 镜像 ID，后续常规部署
不会自动升级该服务，须先明确移除或替换覆盖并验证。

2026-11-13 陪伴头像尝试在状态改变时短暂缩放；减少动态效果
设置下关闭自定义动画。常亮显示时系统可能不播放动画，效果
尚未编译及真机验证。

2026-11-13 屏幕共享状态约每五秒检查；模型响应结束后至少
三十秒才发送下一次变化文字，冷却期不取走本机 OCR 结果。
结果过期或系统暂停时可能无可发送内容；模型速度、后台持续性
和设备耗电尚未实测。

2026-11-13 屏幕陪伴启动：客户端取消在服务端授权检查阶段
生效时，不会创建新会话；已创建后响应丢失仍可能保留到过期，
底层已发出的数据库或网络请求不保证撤销。此路径仅经模拟测试。

2026-11-13 陪伴链接：新实验包的灵动岛入口若活动已结束会
提示链接失效，请重新开启陪伴；旧包中未标识的普通对话链接无法
进行该校验。新实验包尚未实际构建及安装。

2026-11-13 iOS 实验预构建需 macOS 或 Linux，实际编译需 Xcode；
Windows 本机 Expo 拒绝生成 iOS。应在隔离环境按锁文件恢复依赖
后执行工作流并核对产物，不以 Windows 上已有版本替代正式验证。

2026-11-13 屏幕陪伴实验会话最长五分钟，到期后需用户重新
开启；客户端尝试在期限到达时停止，系统暂停或手机时钟偏差可能
影响显示。服务端验证会话期限，实际部署与设备仍待验证。

2026-11-13 陪伴状态：实验屏幕回应期间会尝试更新灵动岛为
“思考中”，完成或停止时恢复状态；系统可能延迟或省略显示。
此功能未真机验收，不能保证持续动画或后台实时刷新。

2026-11-13 陪伴状态刷新：返回 Bot 资料页或应用重新进入前台时
会重新读取本机活动和共享状态；如果共享指示与界面不一致，应以
iPhone 系统共享状态为准并手动停止。此行为尚未真机验证。

2026-11-13 陪伴实验个性：屏幕自动回应会将选定 Bot 的名称及
最多 2000 个字符的设定发送给已授权模型；请勿在 Bot 设定中
填写不希望模型接收的敏感信息。实验服务默认关闭且生产强制
关闭，相关数据库和真实模型尚未验证。

2026-11-13 陪伴实验安装包检查增加主应用 Live Activity 配置和
Widget 扩展类型校验；只有工作流真实执行通过才是对应产物证据，
目前未进行该构建或签名安装。

2026-11-13 陪伴扩展实验构建：工程插件尝试将扩展嵌入主应用
PlugIns，目标不符合预期时中止生成；已有复制阶段的合成验证
已通过，正式 IPA 仍须按构建流程检查扩展及签名，不能依据该测试
认定手机可安装或续签成功。

2026-11-13 屏幕共享异常：原陪伴活动消失后，若资料页显示
“停止屏幕识别”，仍可尝试停止；若提示停止失败或系统共享
指示仍存在，需在 iPhone 的系统共享界面检查并停止。该恢复路径
目前只经模拟验证，实际系统状态以设备指示为准。

2026-11-13 屏幕回应实验时限：客户端请求上限 20 秒，服务端
模型执行默认 15 秒；系统恢复前台后重新检查共享和会话到期。
时限依赖设备与服务端时间，设备时间偏差及实际网络环境尚未验证；
强制停止或已发送的请求仍无法保证远端立即停止。

2026-11-13 屏幕陪伴播报：启动自动回应时可选“仅文字”或
“同意并播报”；后者调用系统语音入口，应用不请求云端语音接口。
停止自动回应或启动通话会停止其播报；通话或其他应用内播报进行时
跳过该次回应。系统语音、锁屏及后台表现尚未在真实 iPhone 验证。

2026-11-13 屏幕陪伴授权：取消或停止在模型同意弹窗完成前生效时，
客户端不会继续提交该次同意或启动请求；已提交的请求无法保证在
服务端撤销。该行为目前仅经模拟验证，不代表真实设备已验收。

2026-11-13 IP 兼容镜像：维护机缓存
`sydney-ip-release-candidate:ffb6aa49baf18a8ea01f9be5` 指向已完成
构建的镜像
`sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87`；
公网合成 staging 已通过。生产仍使用原镜像；上线前核对实际镜像、
环境注入、迁移和可撤回步骤，勿执行未审查的全栈重建。

2026-11-13 手机屏幕自动回应实验：需先开启陪伴及系统屏幕共享，
再在 Bot 资料页单独确认自动回应；可从该页停止自动回应、屏幕识别
或陪伴。发送前检查模型同意，后台自动请求不会主动弹出新同意框。
实验后台默认关闭且生产强制关闭；仅供隔离测试，配置和手机行为
尚未实机验证。后台会话默认五分钟，客户端约 5 秒检查共享状态，
系统可能暂停；断网或开始请求丢失时撤销不保证立即到达。

2026-11-13 屏幕回应实验服务：仅 `NODE_ENV=test` 或 `development`
并设置 `SYDNEY_COMPANION_SCREEN_EXPERIMENT=true` 才接入，默认关闭，
生产环境即使设置开关也不启用。仅供隔离验证；不要用于生产，多
实例限流、真实模型同意及手机端仍未验收。
会话、撤销和账号冷却均只在单进程内有效，重启丢失；实验环境
不应依赖其提供跨实例保护。回应服务向上返回固定错误，但不能
据此推断模型供应商、代理或其他日志不含屏幕文字。
陪伴创建接口和定向结束接口包含原生桥改动，需重新编译并安装
匹配的应用与扩展，不能仅更新 JavaScript；构建和安装尚未验证。
2026-11-13 云构建只读核查发现远端工作流尚无陪伴输入，当前源码
尚未上传；运行 `42770297627` 的旧未签名产物仍可查询但不能用于
本次陪伴验收。应先准备包含主 App、模块、Widget、插件和对应工作流
的同一候选再编译；不可只触发旧远端分支并将其标记为新陪伴包。
“正在听”和“思考中”原生状态设置 90 秒过期提示；仅当系统更新
Widget 且报告过期时显示“状态待更新”，实际时效及恢复仍待实测。
陪伴活动存在时，根布局使用当前登录和工作区额外订阅该 Bot 的
最新单聊；该订阅不再因切到其他聊天、群聊或历史页而取消，聊天
页面自身的消息流仍独立服务于界面。屏幕自动回应期间取消陪伴
聊天订阅，自动回应结束后重新获取最新单聊。进入后台
通常取消，但用户已开启且原生报告正在进行屏幕共享时尝试保留；
不读取或发送屏幕文字，停止共享后取消。系统可能暂停程序或延迟
状态通知。服务拒绝时可能停止更新，网络故障按退避及服务器重试
间隔尝试；真实服务及 iPhone 后台行为尚未联调。
系统报告共享内容暂不可用时，显示暂停并停止自动回应；内容恢复
后可恢复本机识别，但模型自动回应需用户重新开启。暂停时仍可
点击“停止屏幕识别”尝试结束共享；必须以系统共享指示确认结果，
回调及停止流程尚未在 iPhone 上验证。

2026-11-13 无工具屏幕回应：实验入口抑制 Pi 遥测并拒绝启用会话
记录的运行器；此限制不涵盖模型服务商或其他系统日志。该功能尚未
接入运行服务，部署前仍需审查数据去向。

2026-11-13 生产 IP 健康入口：生产 Caddyfile 原位更新并加载，
正式证书和 IP `/health` 可从公网验证；IP 其他路径当前返回 404。
原文件副本为
`/etc/rakazo/Caddyfile.prod.before-ip-3cc5b0c9122f7068cbbf7aaff391a1b6`；
当前 Caddy 以文件绑定挂载，恢复时须保留挂载文件 inode、核对
当前运行版本和并发变更，不能仅重命名替换宿主文件后假设容器
看到新内容。`infra/compose/deploy-ip-health-guarded.py` 是本次
专用生产变更程序，不可重复执行；其计时回退为条件式，容器身份
或配置变化时会拒绝覆盖，需人工检查。证书自动管理策略与持久
存储已加载，真实续期和告警未验证；手机、桌面地址尚未切换。

2026-11-13 屏幕回应模型同意：已准备服务端精确匹配检查，但未
接入运行服务；不可仅凭客户端弹窗认为服务端已执行授权检查。
真实配置、同意撤销和多实例部署均待验证。

2026-11-13 屏幕回应登录复核：准备中的服务在开始及回应前后
检查原登录会话；推理期间不会主动轮询，撤销无法撤回已发出的
内容。功能未接入生产，真实登录撤销待验证。

2026-11-13 IP 健康入口候选：
`infra/compose/prepare-ip-health-caddyfile.py` 接收固定 IP、已有
正式 ACME 存储目录及原 Caddyfile SHA-256，从标准输入生成
健康接口候选；摘要不符则拒绝。当前候选只开放 `/health`，
其他 IP 路径返回 404，不可用作完整客户端后台；生成器不写入
生产或加载配置。语法及旧域名路由结构已只读核对；持久写入、
原配置保护与自动撤回、启动及续期均尚未验证，不得直接部署。

2026-11-13 正式 IP 证书：证书及 ACME 数据位于 Caddy 命名卷
`rakazo-prod_caddydata` 内的
`/data/sydney-ip-production-28c59232bfd078872e0d783a7d45a37a`；
目录含私钥，须保护，不得输出或提交。证书北京时间 2026-11-20
02:12:44 到期。签发驱动 `infra/compose/issue-production-ip-certificate.py`
会触发真实 CA 签发、短暂修改生产 Caddy 运行配置并保留新私钥，
不可当作健康检查或反复运行。该次自动恢复旧配置，因此证书未
持续对外提供，也没有配置自动续期；后续需完成受控持久配置、
续期与告警验证后再切换客户端。原有域名入口保持正常。

2026-11-13 屏幕回应会话：现有门控是未接线的单进程原型，
默认五分钟和账号级三十秒间隔；同进程重建会话不会重置间隔，
多进程不共享，不能作为生产限流。
停止只尝试中断模型调用，远端可能已接收内容。
同账号的传入任务未结束时不会启动下一次，但任务结束不证明
远端模型已停止。官方镜像清单列有预览标签 `xcode-27` 和 iOS 27.1
SDK；本仓库权限、额度、云端执行及签名安装仍待验证。

2026-11-13 IP 切换前复核：生产 SSH 目标 IPv4 对应的候选对照
保留旧域名 6 条内部路由及证书引用，未加载生产；日志存在 IP
分类及排除项差异。该 IPv4 的正式信任 TLS 探测在握手阶段失败，
不可直接改为客户端后台地址。需先确认目标 IP、完成正式证书、
持久代理配置、认证兼容和相关健康验证。

2026-11-13 切换优先级更新：用户要求先完成基础服务及 IP 入口，
不继续扩展用户数据备份或以快照隔离恢复演练作为前置。用户已
确认系统盘快照创建正常，但恢复能力未验证；保留现有数据、旧
入口与可撤回配置，切换时核对服务健康、证书和客户端兼容性。
正式证书及切换尚未执行或验收。

2026-11-13 屏幕回应后台服务：内部服务尚无生产路由或真实授权
接线，不会自动接收屏幕文字；超时或取消不能证明模型服务已停止。
上线前需验证授权撤销、用量记录、限频、运行器和设备。

2026-11-13 系统盘快照隔离恢复路线：用户确认 Sydney 系统盘
快照已正常创建；未独立登录控制台确认。腾讯云说明系统盘快照
不支持直接新建云硬盘，可创建自定义镜像；CreateImage 支持指定
系统盘快照。镜像再创建实例可能产生费用。克隆包含生产配置、
凭据及可能的用户数据；须先设计启动即生效的网络隔离及自动服务、
定时任务和外部写入防护，再做隔离恢复。不能让克隆连接生产数据库、
模型、邮件、云电脑或使用生产域名；不得对原生产盘执行快照回滚。
实际入口、权限、费用、隔离和恢复尚未验证。参考：
https://cloud.tencent.com/document/product/362/17820 ；
https://cloud.tencent.com/document/product/213/16726 。

2026-11-13 自动屏幕回应：无工具运行入口目前仅为内部实验代码，
已定义默认拒绝的后台路由，生产无服务注入且手机无自动开关，
不自动发送屏幕信息；不能用于生产验收。

2026-11-13 快照状态更新：用户报告已创建快照；仍需在控制台核对
来源为 Sydney 生产实例的系统盘、状态为创建完成，并确认隔离恢复
路径。尚未独立核实或执行恢复；不要对生产盘直接回滚。

2026-11-13 陪伴状态：当前对应单聊处于焦点时，通话可显示正在听
或思考中；静音时不显示正在听。切出对话后的持续更新和 iPhone
实际展示尚未验证，自动屏幕文字发送仍未启用。

2026-11-13 陪伴语音入口：打开语音对话需有对应 Bot 和工作区的
当前陪伴活动；确认期间如活动或工作区改变，需要重新进入。旧版
活动没有实例标识，需要停止后重新开启；系统跳转待真机验证。

2026-11-13 陪伴资料页：停止和屏幕识别入口仅对当前工作区的
对应 Bot 活动显示；弹窗停留期间活动改变时需重新选择。设备上的
活动状态和切换表现尚待真机验证。

2026-11-13 屏幕分享工作区：切换工作区后需重新查看并确认屏幕
文字；发送期间开始切换会尝试取消请求，但服务端可能已收到。
实机及真实网络条件尚未验证。

2026-11-13 staging Web 素材核查：维护机固定候选镜像的构建 JS
静态包含六种内置人格指令；这不等同生产网页资源或网页操作已
恢复。镜像仍为隔离候选，不可直接发布生产。

2026-11-13 陪伴停止：实验版先结束 Live Activity，再请求停止屏幕
共享；如果提示停止未确认，应检查 iPhone 系统共享指示并从系统
停止共享，活动消失本身不是采集已停止的证据。实机流程待验证。

2026-11-13 Bot 素材恢复补充：`apps/web/src/lib/personality-library.ts`
定义六种内置人格，发布后需验证对应 Web 构建资源存在且可用；
不能仅凭 API 镜像中的头像和属性目录认定这些网页资源已恢复。
个人预设关联账号，保存最终指令和属性选择；通过现有创建接口重建
时会用当时的属性目录重新生成指令。独立迁移前须保留原始最终指令、
核对目录版本及重建结果，避免效果变化；当前没有经过验证的个人
预设独立导出或导入流程。不要将此建议当作已验证的恢复命令。

2026-11-13 陪伴语音：从陪伴入口进入应用并确认通话后，可在通话
卡片分别控制麦克风及 Bot 语音播报；关闭播报不会关闭通话提示音，
开关随通话结束重置。实际权限提示和后台行为尚待 iPhone 验证。

2026-11-13 屏幕文字分享：实验界面查看 OCR 后可选择“发送给 Bot”；
确认界面展示文字并说明发送至后台及所选模型，消息会进入聊天历史。
系统采集停止或会话变化会尝试取消未完成请求；已经发出的网络请求
可能已被服务端接收。默认不自动发送或保存屏幕图像，端到端未实测。

2026-11-13 腾讯云系统盘快照准备：根据腾讯云“创建快照”文档，
先在控制台选择生产实例所在地域，进入云硬盘列表，核对目标硬盘
的挂载实例及系统盘属性；在其操作列选择“创建快照”，查看名称、
保留时间、费用及配额。应先确认目标系统盘，再协调停写与创建
时间；不要仅凭 `CLOUD_SSD` 元数据推断盘和实例关系。快照是
整盘范围，可能包含用户数据，并不包含其他机器或内存中未落盘的
数据；在线快照不自动保证 PostgreSQL 或多机一致。创建完成后要
检查状态并安排隔离恢复验证，不能直接对生产盘执行快照回滚：
回滚会覆盖快照之后写入的内容。当前尚未确认控制台权限、目标
盘或创建快照。官方文档：
https://cloud.tencent.com/document/product/362/5755 及
https://cloud.tencent.com/document/product/362/5756 。

2026-11-13 最小候选新镜像：维护机标签
`sydney-staging-ip-minimal:node-9b2c39780146` 指向
`sha256:53e74920f844b86ed90d5a28c6a5ff972b6b7cd4cd84b3707f520ca1600eff36`，
默认用户 node、工作目录 `/app`，由前述中间镜像通过未启动临时
容器修改元数据生成；API 和 schema 摘要一致，公网 staging 复验
及资源清理通过。只作为隔离候选，不是完整发布构建，不得绕过系统
恢复、生产回滚、证书及设备验收。

2026-11-13 屏幕识别实验（未编译或实机验证）：仅陪伴实验构建声明
`screen-capture` 后台模式。计划由 Bot 资料页先告知本机用途、再由
用户操作 iOS 系统选择器；界面提供状态、查看预览和停止，设计不
采集音频或保存画面，预览文字可经单次确认发送。停止失败会提示检查系统共享指示，
不得将界面动作视为系统已停止的证据。系统版本、免费签名及真实
设备能力均待验证；不对现有安装包启用。

2026-11-13 最小 IP 候选恢复库验证：
`python infra/compose/run-recent-restore-recheck.py --ip-candidate-groups`
只在维护机无外网临时数据库使用固定镜像交替验证群聊；会在临时库
创建合成群聊和会话，不能指向生产。本次成功且临时资源已清理，
不执行迁移或证明真实生产回滚；候选默认 root，仍禁止部署生产。

2026-11-13 陪伴实验头像：开启陪伴时会把当前 Bot 的精简头像带入
实时活动，头像可能显示在锁屏；照片预期只在内存缩小，无网络读取
或原图落盘，失败回退占位。照片缩略图与锁屏行为尚未在 iOS 上实测。

2026-11-13 IP 最小候选构建终态：维护机曾以固定生产应用镜像
和四个经摘要固定的源码文件构建
`sydney-staging-ip-minimal:b4b94402cf20429a20008f0d`；旧版 Docker
构建器提交层较慢，运行中不代表成功。首次参数不兼容未启动构建；
第二次因多次复制缓慢而按进程身份主动停止，检查无对应进程、标签
或容器。第三次 API 编译成功，但客户端等待 600 秒后超时，目标
标签未生成；后台构建进程和构建容器随后结束。已将编译后的中间
镜像标记为 `sydney-staging-ip-minimal:verified-root-default-9b2c39780146`。
其默认用户为 root，隔离演练显式指定 node；迁移树和 schema 与基底
一致，公网合成业务通过。它不是完整发布镜像，禁止用于生产。
后续构建前重新核对目标、磁盘和运行任务，不得仅因观察超时重启。

2026-11-13 陪伴实验隐私：开启时可选仅状态或展示短回复，后者可能
在锁屏出现；变更选择需停止并重新开启。当前只在对应单聊聚焦且
应用代码运行时尝试同步，无法保证切后台后持续更新。会话更换时
尝试结束活动，失败不会阻止账号操作；系统行为尚未真机验证。
语音入口打开应用并要求确认，实际录音和播报沿用现有通话配置。

2026-11-13 陪伴实验构建（仅准备，未实测）：iOS 侧载工作流新增手动
`companion_experiment` 参数；选择该参数时必须填写与现有 Sydney 不同的
bundle ID，且配置会关闭 OTA。预期产物包含陪伴 Widget 扩展；默认构建
仍不允许 PlugIns。免费账号对扩展的签名、安装位、续签和与现有 Sydney
共存均未验证，暂不能把实验包视为可安装交付。未更改生产入口。

2026-11-13 IP 来源演练：维护机执行
`python infra/compose/run-staging-ip-chat.py --public-probe` 时，
合成第二次登录附带三种伪造地址头；脚本要求返回会话记录的地址
非空且不等于这些值。本次通过，临时资源清理后标签容器、网络和
443 监听均为 0。不验证地址与客户端真实公网出口相等，也不覆盖
生产 CDN 或其他代理；不得据此改动生产可信代理配置。

2026-11-13 Caddy IP 候选时点复核：`compare-live-caddy-candidate.py`
现可输出候选 IP 与域名日志配置的差异字段；本次仅 `/include`
不同，其他日志设置相同。生产既有域名 6 条内部路由和证书引用
仍与示例候选一致，临时 HTTP-01 staging 候选只读结构审计通过。
示例仍须核查 CDN、可信代理、SNI、真实流量和回滚；没有加载配置、
签发正式证书或修改生产。

2026-11-13 人格应用恢复验证：
`python infra/compose/run-recent-restore-recheck.py --personality-app`
在维护机临时隔离数据库恢复既有数据库与应用数据，重置临时库
应用角色密码并创建短期签名会话，经隔离 API 读取预设、创建
合成 Bot；该命令会修改其临时数据库，不能对生产运行。本次成功，
容器及临时目录已清理；真实密码、账号重建和人格独立导入未验证。

2026-11-13 人格预设时点比对：
`python infra/compose/run-recent-restore-recheck.py --personality-compare`
先以只读事务从生产计算随机挑战摘要，再在维护机无网络临时库
恢复既有备份并比较，摘要和挑战仅用于本次进程及维护机临时内存
目录，不输出预设内容。本次首次运行比较成功但清理失败：挑战
变量覆盖了容器身份，已只读核实后定向清理；修复后复跑退出 0，
事后无该演练标签容器或临时内存目录。该对照是分时的，不保证
将来的生产内容，也不验证真实账号、登录或重新导入。

2026-11-13 人格预设数量抽查：运行
`python infra/compose/run-recent-restore-recheck.py --personality`
会在维护机无网络临时 PostgreSQL 恢复既有近期数据库密文，只输出
预设总数与缺失账号关联数；本次分别为 1 和 0，临时容器清理完成。
这是该分时备份的抽样结果，不证明实际预设内容与当前生产相同、
账号凭据可恢复或重新导入可用；该操作仍会在临时数据库恢复整份
既有数据库，不能指向生产。

2026-11-13 staging 素材验证：现有
`python infra/compose/run-staging-ip-chat.py --public-probe` 增加三张
内置头像与合成人格预设的公网检查。本机下载官方 staging 根失败时
从已授权维护机经 HTTPS 获取，并只用于本次进程证书校验，不修改系统
信任；维护机 SSH 及其系统信任链是该回退的依赖。演练会在维护机创建
临时容器、网络和测试证书，须先确认目标和端口空闲；本轮退出 0，
事后 staging 标签容器、网络及 443 监听检查均为 0。不涉及生产
切换，也不能替代真实素材恢复验证。

2026-11-13 Bot 创建素材补充范围：内置头像、性格属性和人格预设
需保留，已创建 Bot 不要求恢复；自定义头像和个人预设需先确认
存储及恢复依赖。代码中个人预设位于 `personality_presets` 并关联
用户，界面还存在浏览器本地头像库；这些不能简单视作系统镜像已
全部覆盖。须设计受保护的导出和隔离恢复或重新导入，验证创建
Bot 所需素材与配置可用；本次尚未导出或恢复任何数据。

2026-11-13 范围调整：本轮只验收系统恢复与配置回滚，不要求新备份
用户业务数据；已有备份继续保留，现有业务数据不得删除或覆盖。
镜像和部分配置已有异机副本，但 Caddy 卷、数据库全局角色、系统
整体恢复及生产回滚仍未验收，既有生产采集硬阻断不变。缺少用户
数据备份时，灾后无法保证找回账号、Bot、群聊、聊天、附件或项目。
生产切换前仍需核对版本、迁移兼容、恢复当前版本的步骤及服务影响。

腾讯云控制台候选操作：选择生产实例所在地域，在云硬盘列表核对
系统盘与实例的挂载关系；查看该盘“创建快照”及费用、配额与保留
时间。快照是整盘层级，可能包含用户数据；在线创建并不保证数据库
或多机一致性。先核对盘和一致性方案，再实际创建；创建后应查看
状态并在隔离环境验证恢复，不能直接回滚生产盘。本轮未创建快照。

2026-11-13 近期备份隔离密码登录演练：`python
infra/compose/run-recent-restore-recheck.py --cross-version-auth`
仅在维护机无外网临时恢复库中使用随机合成账号，验证当前版注册、
旧版及当前版登录和错误密码拒绝。本次演练为替换隔离数据库账号
密码，将其权限校验摘要同步绑定到合成密码；该操作仅在临时库执行，
不能直接用于生产。真实账号、正式客户端和真实生产回滚未验证。

2026-11-13 近期备份跨版本附件隔离演练：`python
infra/compose/run-recent-restore-recheck.py --cross-version-artifacts`
在维护机以固定镜像、无外网容器及同一临时 appdata 目录，按当前版、
旧版、当前版验证合成附件写入与读取；本次退出 0、临时资源复核
清理。仅限既有固定备份和恢复身份，不是生产回滚命令；异常强杀后
须核对标签容器及 `/dev/shm` 下的临时目录。明文经过内存及 tmpfs，
不保证不进入 swap 或安全擦除。

2026-11-13 近期备份跨版本隔离恢复：`python
infra/compose/run-recent-restore-recheck.py --cross-version-groups`
使用维护机固定的近期数据库及 appdata 密文、既有恢复身份和固定
镜像，在无外网的临时环境按当前版、旧版、当前版检查群聊；本次
退出 0 并复核临时容器及目录清理。每阶段重新提取 appdata，只验证
有限数据库群聊行为；这是分时副本，不含真实工作区，也不是生产
回滚命令。明文经过内存及 tmpfs，不保证不进入 swap 或安全擦除。

2026-11-13 部署目录路径只读比对：当时 5 条未跟踪文件及折叠后的
3 条忽略路径，与 HEAD、本地 `origin/main` 和记录中的历史旧修订
比较未发现相同或父子路径冲突；该旧修订不代表选定目标。未检查
全部未来目标、嵌套工作区或并发变化，操作前仍需重新核对。

2026-11-13 部署目录只读检查：Git 当时显示 5 条未跟踪记录、无
已跟踪文件状态记录；未枚举忽略文件或检查目标修订的路径冲突。
硬重置前仍需核对并保护这些文件及其他窗口的改动。

2026-11-13 回滚路径静态核查：本地部署脚本的失败处理包含硬重置、
镜像标签调整及重新发布，可能再次执行迁移，不会恢复数据库或文件。
生产 launcher 与本地摘要一致，从指定 Git 修订加载脚本；生产记录的
已部署修订脚本与本地摘要一致，但未来目标修订可能不同。不得仅凭
该脚本声称生产数据可回滚，使用前须核对
真实入口、未提交改动、迁移兼容性及一致恢复点。

2026-11-13 维护机只读复核：镜像备份接收目录当时为 ext4 挂载，
选定的旧镜像差量和基础镜像密文摘要与既有记录一致。未复核挂载的
后备设备身份或恢复身份，也未解密和启动服务；后续使用前仍须执行
既有身份及恢复门禁。

2026-11-13 正式入口只读检查：旧域名回环 HTTPS 健康请求返回 200；
本机直连生产公网 IP 时 TLS 握手返回 internal error，未进入证书
验证。保持现有客户端地址；正式签发、恢复和回滚仍须按门禁验收。

2026-11-13 手机手动切服：候选服务器设置页提示切换时重新登录及
待发送消息、附件可能被删除；提示尚未在设备上验证，不能保证数据
保留。旧队列迁移尚未完成，不应依靠手动切服进行正式迁移。

2026-11-13 staging 公网聊天探针：`run-staging-ip-chat.py
--public-probe` 在临时 Caddy 业务入口使用随机一次性令牌，转发前
移除令牌；本机进程仅加载 staging CA，不改系统信任。探针覆盖
合成单聊、群聊、第二会话读取和跨 Space 拒绝，仅使用合成
账号；维护机固定镜像、空闲 443 和本机公网出网为前提。正常退出
清理全部资源，独立计时器仅兜底移除 Caddy；异常中断仍须核查其他
容器、网络及临时内存目录。该流程不是正式证书签发或生产切换。

2026-11-13 staging IP 聊天演练：`infra/compose/run-staging-ip-chat.py`
使用维护机现有固定镜像、独立临时网络、内存数据库和 Let's Encrypt
staging CA；临时 Caddy 的业务路由仅允许演练 Web 容器来源，443
需空闲。独立计时器最多 10 分钟后移除该 Caddy，正常退出清理其他
资源；异常中断后仍须按 `sydney.stage` 标签、临时目录及端口核查
残留。临时目录位于内存文件系统，不能保证不进入 swap；演练仅用
合成数据。此脚本不是生产部署或回滚命令，不提供正式证书。

2026-11-13 手机队列提示：候选聊天界面在待发送队列恢复失败时提示
已保存消息未加载，并提示未送达的新消息关闭应用后可能丢失。提示
不迁移或恢复旧队列，尚未在真实设备或完整页面渲染中验证。

2026-11-13 staging 迁移核对：聊天演练 API 镜像的 209 项迁移与
本地当前文件摘要一致；Worker 映射中的 3 项生成文件仍有差异。
本次为只读比对，不代替重新核对生产迁移状态、备份或回滚验收。

2026-11-13 staging 候选时效：较旧规范化源码清单与当前 API、认证
源码存在差异，但聊天演练所用较新镜像的内嵌映射中，这三项源码与
当前一致。映射仍有 3 项 Prisma 生成文件与本地不同，本地生成文件
缺少当前 schema 中的工作区模型。此对照未覆盖全部源码、依赖或客户
端；后续构建及演练仍须核对纳入文件和迁移摘要，使用隔离资源并
重验清理。现有候选和生产配置均未改变。

2026-11-13 手机队列候选行为：待发送队列的服务器、账号或会话范围
与当前范围不一致时，候选代码拒绝加载并保留索引及附件；显式登出
或更换会话的现有清理仍可能删除队列。恢复失败后新消息仅在内存
发送，重启可能丢失。新行为尚未在实际设备验证，
不能视为跨服务器迁移或恢复手册。

2026-11-13 侧载运行时来源保护：构建侧载包需设置
`EXPO_PUBLIC_SYDNEY_SIDELOAD=1`，现有工作流已配置；新默认来源
遇到来源不明的旧会话时，候选代码停止启动并显示提示及重试界面，不
自动清除数据。生产用户的恢复或迁移流程尚未完成；不可据此替换
正式包或后台地址，实际构建与设备环境中的变量注入仍待验证。
候选代码仅对旧域名缺失来源记录保留兼容，记录读取失败或损坏会
阻止启动；缺失记录仍不能证明来源，旧二进制也没有这一检查。
不应将其当作已验证的客户端回退方案。

候选启动界面现在会提示服务器设置或保存的会话无法验证，并提供重试；
重试不会迁移会话。该界面尚未在真实 iPhone 验证。

2026-11-13 手机 IP 测试包候选：侧载应用配置拒绝非旧入口沿用工作流
默认标识 `xin.zxlup.sydney`；构建测试包须选择不同标识，并在签名、
安装前核实实际正式包和钥匙串访问组。规则不识别其他正式标识，
不同标识也不单独证明数据隔离；此项尚未执行实际构建或安装。

2026-11-13 手机候选启动行为：保存的服务器地址无法读取或无效时，
候选代码拒绝进入主界面并交由现有错误边界提供重试；不自动清除
地址和凭据。该行为尚未在实际安装包或设备上验证，仍未改变默认地址。

2026-11-13 桌面与浏览器界面演练：`run-staging-chat-drill.py
--desktop` 已在授权维护机及本机完成双输入框和回复显示验证，
退出 0 后核对临时容器、网络、内存目录、桌面数据和回环端口。
使用旧目录包、测试模型及回环 HTTP/SSH，不改变生产配置，也不
代替正式 IP 证书、真实客户端或生产恢复回滚验收。

2026-11-13 桌面输入框演练：桌面探针结束后，启动器通知临时 Web
容器，服务端随即继续演练和清理；若通知未到，最多等待约 100 秒
后失败并进入清理。桌面模式和浏览器独立模式均已分别复验通过；
该流程使用临时合成账号，不修改生产。

2026-11-13 桌面跨会话演练：现有 `run-staging-chat-drill.py
--desktop` 同时启动隔离桌面目录包和无头浏览器，以合成账号、
页面 RPC 和测试 Worker 验证双向聊天读取；结束后确认临时数据、
服务器资源及回环隧道端口已清理。此路径不连接生产账号。

2026-11-13 Windows 目录包隔离演练：`run-staging-chat-drill.py
--desktop` 启动现有目录包，使用单独生成的临时用户数据和本机
回环 SSH 隧道；退出后确认临时目录及隧道端口已清理。该目录包
未签名且并非安装器，演练不验证正式证书或生产账号。

2026-11-13 浏览器隔离演练：`run-staging-chat-drill.py --browser`
使用本机既有 Edge 和 Playwright，通过临时 SSH 隧道将本机回环
5173 端口连接至维护机临时 Web 容器；端口占用时不启动演练。
只用合成账号，浏览器探针结束后关闭隧道，演练完成后临时容器、
网络和内存目录已清理。本机回环 HTTP 不能代表正式 IP HTTPS。

2026-11-13 HTTPS 聊天演练：现有 `run-staging-chat-drill.py` 在
临时 Caddy 路径内增加合成聊天、群聊及跨 Space 拒绝检查；退出 0
后核对无相关容器、网络及临时目录。此演练不接入真实模型或生产
数据，不验证公网证书或真实设备。

2026-11-13 Caddy 隔离联调：使用
`infra/compose/run-staging-chat-drill.py` 向维护机传递演练脚本
及工作区 IP 代理候选；演练只在临时内部网络运行，生成自签名
证书，替换候选中的 ACME 签发并禁用管理接口，不开放主机端口。
容器、网络与临时内存目录已检查清理。该路径不签发正式证书，
不改生产配置，也不替代浏览器、真机和生产恢复验证。

2026-11-13 Web/API 隔离演练：`infra/compose/staging-chat-drill.sh`
使用临时内部网络、数据库和合成账号，也启动候选 Web 检查代理。
Windows PowerShell 文本管道曾在末尾附加回车，导致业务检查通过后
脚本异常退出；本次使用 Python `read_bytes()` 向 SSH 标准输入
传输原始脚本后成功退出。临时容器、网络和内存目录已核对清理；
该演练不构成生产部署或回滚。

2026-11-13 真实 Web 资源隔离探测：`infra/compose/staging-web-page-probe.js`
通过标准输入在维护机候选镜像的无网络临时容器内运行，进程仅请求
容器回环地址；容器已自动清理。该脚本依赖镜像内 Web 构建及 Node，
不适合作为生产健康、TLS 或浏览器业务验收。

2026-11-13 侧载 IP 包：Expo 应用配置和现有 CI 均限制仅旧域名
目标可启用当前侧载 OTA；IP 目标须关闭 OTA 配置。代码测试通过，
但未验证实际 IPA、远端环境变量优先级或更新投递；在独立更新
项目及通道完成验证前不得开放 IP 包 OTA。

2026-11-13 桌面 IP 切换注意：当前代码按服务器 origin 选择持久
会话分区，域名与 IP 不共享该分区；切换演练应准备重新登录，
并单独验证切回域名后的会话。此结论已有逻辑单测，尚未验证实际
Electron 安装包或生产服务器。

2026-11-13 手机 IP 切换注意：仅修改新安装包默认后台地址不足以
迁移已有设备；保存的自定义地址会优先使用，而默认地址升级不执行
手动切服的凭据清理。上线前需完成会话迁移策略与新装、升级、回退的
真机验证；现阶段不更改客户端默认地址或生产入口。源码分析与待验
场景见 `docx/design/CLIENT_ONLY_MIGRATION.md`。

2026-11-13 Caddy 信号处理候选：内部信号处理代码已修订，但尚未
独立审核和 Linux 验证；CLI 和生产采集仍保持硬阻断，不得用于
生产卷。退出处理不覆盖 SIGKILL 或主机崩溃。

2026-11-13 现有部分快照复验：
`infra/compose/run-recent-restore-recheck.py` 向维护机传输固定恢复
脚本，以无网络临时容器和内存目录重验既有数据库、应用数据及有限
业务读取，结束后删除临时资源。需要维护机既有受限恢复身份、固定
镜像和已核对挂载；仅用于该固定快照，不是生产恢复命令。异常中断后
须按标签和身份检查残留，明文 tmpfs 不保证不进入 swap。

2026-11-13 较新异机部分快照复核：接收挂载及数据库、appdata 密文
和元数据的现有摘要检查通过；`RECEIVE_FINISHED` 为目录。该快照
仍是 11 月 12 日在线部分采集，不是完整一致恢复点，使用前须重新
核对挂载身份、清单和恢复能力，不能据此执行生产回滚。

2026-11-13 认证代理合成复验：IP 示例的认证与页面路由及所测令牌
日志脱敏通过无网络模拟上游检查；上线前仍需真实页面、认证流程、
正式证书及生产回滚验收。

2026-11-13 Passkey 补验：独立 IP 邮件来源下，旧域名的软件认证器
注册和登录测试通过；不能替代既有用户凭据与真实设备验收。

2026-11-13 认证邮件候选：可选 `AUTH_PUBLIC_LINK_ORIGIN` 用于
邮箱验证和密码重置链接及能力接口返回的找回页面，必须为规范
HTTPS 来源，且等于 `WEB_ORIGIN` 来源或列在 `EXTRA_TRUSTED_ORIGINS`；
空值保持旧行为。它不修改 Passkey RP、SSO 或其他回调。配置前必须
验证目标证书、认证路径、登录及重置页面和真实邮件；修改生产前
仍需完整备份及回滚门禁。维护机候选镜像入口为 sleep，只允许用于
指定入口的隔离演练，不可部署生产。

2026-11-13 模拟 IP 找回：隔离开发 API 在示例 IP 规范来源下使用
内存邮件模拟器完成邮箱确认与密码重置，模拟旧来源的密码登录亦
通过；该来源下 Passkey RP 为空。演练仅访问容器回环，不发送实际
邮件或加载重置页面。生产不能直接照搬该配置；应先验证正式证书、
真实邮件和页面、双端及旧 Passkey/其他回调，并满足备份回滚门禁。

2026-11-13 认证切换限制：当次生产公开能力中的密码找回页面仍为
旧域名，且密码登录、找回和邮箱验证码显示启用。停止旧入口前须
保留找回链路或完成可用替代方案并真实验证；仅查看能力接口不能
证明发信或找回成功。源码对非回环 IP 不提供 Passkey relying
party，旧域名 Passkey 的迁移须单独处理，不能简单假定兼容。

2026-11-13 生产状态：当次核心应用及数据库容器健康，Caddy 以
容器运行；旧域名回环 HTTPS 返回 200，证书至 2027-02-03
01:42:34 UTC。宿主 systemd 为 degraded，失败的是已有临时截图
命令，尚未调查其业务影响；不要批量重置失败单元。certbot.timer
启用不证明旧域名证书已能续期后同步到 Caddy。

2026-11-13 隔离聊天演练：`infra/compose/staging-chat-drill.sh`
仅供具备现有指定镜像的授权 Linux 维护机使用，使用内部网络、无
公网端口、内存数据库和一次性合成凭据，覆盖合成单聊、群聊及
跨 Space 读取拒绝及合成双会话读取；正常退出时清理演练资源。
须以原始文件字节传输，避免 PowerShell 文本管道附加回车；中断后
应只读复核 `sydney-chat-` 前缀的容器、网络和 `/dev/shm` 临时目录，
确认归属后清理。禁止用于生产数据库或生产凭据。演练不证明真实
模型、设备、正式证书或生产恢复可用。

2026-11-13 staging Worker：维护机保留镜像
`sydney-staging-worker:20822b45fd42`，仅供后续隔离演练。该镜像
保存时的默认用户为 root，运行时必须显式指定受限用户，并设置隔离
网络及资源限额；它不是生产发布镜像，也未通过运行验证。

2026-11-13 IP 代理 WebSocket：`infra/compose/test-ip-proxy-routes.sh`
在维护机无网络临时容器中验证域名和 IP 的合成 WebSocket 握手及
双向帧，完成后清理容器；脚本使用自签证书和模拟上游，不能作为
真实屏幕、正式 CA、生产回滚或设备验收。运行需授权的 Linux
维护机及现有 Caddy 镜像，不能直接在生产环境使用。

2026-11-13 迁移换行修正：工作区历史迁移文件已规范化为 LF，当前
SHA-256 与此前读取的生产记录一致；旧 staging 镜像仍包含原混合
换行，规范化新镜像应优先用于隔离验证。生产 IP 代理示例与现网的
域名内部路由和证书引用只读对照相同，但存在日志映射及 SNI 差异；
未加载或验证生产候选，不可据此直接切换。

2026-11-13 staging IP HTTPS：维护机临时签发测试 IP 证书并代理
隔离 API，独立探针仅在进程中加载测试根；健康、RPC 及合成账号认证
通过。代理、测试证书存储、内存数据库、临时凭据和网络已清理，
443 端口释放，原 Caddy 服务仍运行。此结果不改变真实客户端信任、
正式证书、续期告警、备份恢复或生产回滚的未验收状态。

2026-11-13 隔离升级回退：在全新内存 PostgreSQL 中完成生产同 ID
旧镜像到规范化候选的迁移，并以合成 Bot、群聊验证新旧 API 交替
读写；临时资源已清理。该演练未还原真实生产数据库，也未回滚生产
部署或数据库，不能替代实际恢复点、权限及回滚验收。

2026-11-13 新 staging 候选：维护机私有目录
`/tmp/sydney-stage-normalized.JuCPBytq` 保存规范化源码及摘要清单；
`sydney-staging-api:20822b45fd42` 包含与生产记录一致的历史迁移
文件。它仅用于隔离演练，不得直接部署生产；旧 staging 镜像仍保留，
其历史迁移文件摘要不同，不能用于生产迁移。两者都尚未验证从实际
生产形态数据库升级和回滚，临时源码目录可能被系统清理。

2026-11-13 staging 候选迁移门禁：现有快照中的
`20261103090000_task_execution_state/migration.sql` 含一处 CRLF，
其文件摘要不同于生产已应用记录；规范化为 LF 后摘要一致。不要使用
当前 staging 镜像执行生产迁移，应以与生产记录一致的迁移文件重新
制备候选，并在隔离环境验证升级、回滚和业务。新项目工作区迁移在
当次生产记录中不存在；查询未改动生产数据库。

2026-11-13 staging 基础业务：已在维护机一次性内部网络和全新
内存数据库验证合成 Bot、群聊在两个 Space 的读取隔离和跨账号
拒绝；测试容器、网络及临时凭据已清理。该结果不覆盖项目文件夹、
聊天消息、真实设备及公网 IP TLS；候选镜像仍仅供隔离用途。

2026-11-13 应用 staging：维护机保留候选镜像
`sydney-staging-api:f06e3a8d4b73`，镜像 ID 为
`sha256:6d9abe1c203d5126571497010e2fef4a46109b6fa5857fd324f7fa6900494c39`；
其基于旧镜像叠加当前源码快照，只用于隔离环境，不得直接部署生产。
一次性内部网络、全新内存 PostgreSQL、合成账号和凭据已清理，实际
验证范围见验证记录；需要复验时重新创建隔离资源，不使用生产数据。
临时源码与产物仍在 `/tmp/sydney-stage-source.voFmi7YA`，可能被
系统清理。真实 IP TLS、设备、完整业务、生产回滚和发布构建未验收。

2026-11-12 Prisma 构建材料：维护机私有临时目录
`/tmp/sydney-stage-source.voFmi7YA` 新增 `api-index-prisma.js`、
source map 和 `prisma-generated` 目录；产物权限限于所有者。它们由
无网络容器对快照生成并构建，未运行数据库迁移、服务或真实认证，
也不是可直接部署的完整镜像。使用前重新核对路径、摘要及依赖；临时
目录可能被系统清理，构建容器已删除。

2026-11-12 API 隔离构建材料：维护机私有临时目录
`/tmp/sydney-stage-source.voFmi7YA` 保存源码归档、文件及摘要清单、
解压树、API `api-index.js` 和 source map；目录权限 700，产物权限
600。它们来自当前未提交工作区，可能因临时目录清理而丢失，不是
发布产物、生产备份或回滚材料。API 构建基于生产同 ID 镜像的依赖
并叠加快照；未验证基底残留文件、Prisma client、启动和认证，不得
直接用于部署。构建容器已移除；后续使用前须重核文件摘要和目录身份。

2026-11-12 维护机构建材料：仓库指定的 pnpm 9.15.0 已存在于
root 的 Corepack 缓存，即使不在 PATH 中；生产同 ID 镜像也已缓存。
无网络只读临时容器可见 Node 24.22.1、esbuild 和 API 构建脚本，
但未完成当前源码及依赖校验，不应以此宣称构建或 staging 可用。
临时检查容器已清理，未安装依赖或使用生产凭据。

2026-11-12 维护机应用 staging：只读检查时根分区可用约 15 GiB、
内存 available 约 1.1 GiB，无运行容器；Node 22.23.2 满足仓库
版本声明，`pnpm` 未在 PATH。实际搭建前须重新核对资源、隔离
源码及依赖，避免使用生产凭据或修改现有备份；未启动 staging。

2026-11-12 屏幕双入口限制：候选 `SCREEN_PROXY_PUBLIC_ORIGIN`
是服务级单一来源，用于所有客户端的屏幕和终端能力 URL，不按请求
或客户端自动区分。设置 IP 将同时影响仍使用旧域名的客户端；
旧、新客户端的屏幕、终端、证书信任及回滚均经验证前保持未设置。
Web/桌面还可能改用页面来源，需分别验证 `/novnc` 和 WebSocket。

2026-11-12 生产认证版本：API 当前运行打包入口，入口中额外认证
来源使用既有移动端列表，未发现工作区候选的两个 IP 接线变量。
新入口不能只依靠配置添加变量；须先核对兼容版本的构建、部署及
回滚，保留旧来源并验证认证和屏幕功能。本次未修改生产或客户端。

2026-11-12 IP 来源配置核查：生产 API 当前 `WEB_ORIGIN` 已设置，
`EXTRA_TRUSTED_ORIGINS` 与 `SCREEN_PROXY_PUBLIC_ORIGIN` 未设置。
API dist 字符串检查未发现后两项，依赖包完整搜索未完成；IP 入口
启用前应核对实际部署版本、来源配置、认证和屏幕路径，不得直接
据此更改生产。当前 Caddy 握手证书与其卷内证书指纹一致，但未来
续期后的复制和加载仍未验证。

2026-11-12 旧域名挑战路径：维护机对不存在的 HTTP ACME 路径
收到 DNS 服务商拦截页 302，生产回环 HTTP 则返回 HTTPS 308，
回环 HTTPS 返回 HTML；同次域名 HTTPS 健康接口正常。该探针
未放置真实挑战文件，不能替代 ACME 验证；旧证书 webroot 路由
和续期传播仍待查明，现有链路不可直接视为已验证。

2026-11-12 旧入口证书续期风险：生产 certbot 定时任务已启用，但
当前唯一 deploy hook 指向未运行且未启用的旧 nginx 服务；Caddy
使用 `/data/certs/fullchain.pem`，与 certbot 当前公开证书指纹
相同，到期时间为 2027-02-03 01:42:34 UTC。相同只代表检查时点，
不能证明续期后自动复制、加载或告警。certbot 使用 webroot，
当前挑战路径能否到达该目录尚未验证；查明完整链路并验证前，不要
将最近 certbot 任务成功视为旧入口续期保障。未修改定时任务、证书
或代理配置。
Caddy 命名卷中的公开证书为普通文件，certbot 路径则为归档符号链接；
更新 certbot 符号链接不会自动更新 Caddy 这份普通文件。

2026-11-12 IP 证书监控准备：新增
`infra/compose/check-ip-certificate.py`，使用 Python 默认信任配置连接
指定公网 IP，校验证书链与 IP 身份，并在证书剩余有效期不超过阈值时
退出 1；握手、信任或输入错误退出 2，正常退出 0。默认阈值 72 小时，
可用 `--warning-hours` 调整。使用示例（尚未在线验证）：
`python3 infra/compose/check-ip-certificate.py PUBLIC_IP --warning-hours 72`。
应从独立公网监控节点定期运行，确保其 Python 信任配置不含测试 CA，
为非零退出及任务未运行配置可送达的告警，并留足处理时间；还须单独
监控域名入口、续期失败和服务业务健康。脚本未部署、未接入调度或
通知，不能证明告警送达、自动续期、正式证书或生产回滚可用。

2026-11-12 生产 Caddy 存储：只读检查时 `/data`、`/config` 为
可写命名卷，应用数据目录为 `/data/caddy`、配置目录为
`/config/caddy`；生产 Caddyfile 为只读绑定。正式 IP 证书的持久
账户及证书依赖具体部署配置，生产卷备份与恢复尚未验收，不得把
维护机临时卷的演练视为生产卷可恢复的证明。

2026-11-12 staging 自动续期：维护机使用临时卷、5 秒扫描和 0.9999
续期窗口进行人为加速演练；证书自动更新后，HTTPS 握手提供的新
证书与存储文件一致，测试资源已清理。此参数仅用于实验，不能用于
推断生产默认续期时机；生产正式证书、续期及告警仍待验证。

2026-11-12 staging 账户存储演练：
`infra/compose/test-caddy-staging-volume.py` 在维护机临时命名卷
内验证 staging 账户及证书文件跨容器重建保持一致，新容器无网络
时可返回合成 HTTPS 响应；临时卷已清理。本次没有建立生产持久账户，
也未验证宿主重启、自动续期或证书私钥恢复。

2026-11-12 生产 IP HTTP-01 staging：使用临时候选关闭 TLS-ALPN，
生产成功签发测试证书，独立公网验证测试证书链、IP 和限定匿名
接口；原域名 HTTP 308 与 HTTPS 健康保持正常，原配置及临时资源
恢复清理。该测试与未部署示例的挑战方式一致，不代表正式证书、
持久账户、续期或双端已验收。

2026-11-12 生产 IP staging RPC 健康：短时开放固定匿名
`POST /rpc/health`，独立公网按手机探针格式验证证书链、IP 身份和
RPC 成功响应；测试后原配置恢复、临时资料清理。未切换客户端地址，
该探针不代表真实手机、认证或其他 RPC 已联调。

2026-11-12 生产 IP staging 匿名路由：临时只开放指定 GET 健康、
匿名会话、RPC 探针及首页路径；独立公网和生产回环检查与旧入口的
状态及类型一致，RPC GET 返回 405。测试后原配置恢复，临时证书和
恢复资源清理。该结果不代表真实认证或 RPC 业务可用，也不开放正式
IP 入口；客户端地址保持不变。

2026-11-12 生产 IP staging 健康路由：短时复用既有健康处理器，
维护机独立公网使用临时 staging 信任根验证 IP 证书及 `/health`；
生产回环、原域名健康与证书核对通过。测试完成后恢复原配置并清理
临时资料，未改变客户端地址。该测试没有开放或验证其他生产 IP
业务接口，正式证书和续期仍未配置。

2026-11-12 生产 IP staging 公网信任链：维护机从独立网络使用仅
进程内加载的官方 staging 根证书，成功验证生产公网 IP 测试证书链
和 IP 身份；生产机回环验证亦通过。测试结束后原配置恢复、临时
测试资料清理，未更改系统信任库或客户端地址。生产 IP 业务路由、
正式证书、续期及双端联调仍待完成。

2026-11-12 生产 IP staging：以
`infra/compose/run-caddy-staging-guarded.py` 配合候选生成器和独立
恢复器临时申请测试证书；签发与 IP SAN 检查成功，原运行配置恢复，
隔离测试证书存储、状态目录及计时器已清理。未更改客户端地址或
签发正式证书；该次未验证 staging 信任链、IP 业务路由、自动续期
及真实设备，不能作为正式切换完成的依据。

2026-11-12 手机已重新识别，续签源 IPA 的两个版本字段与设备报告相同；设备
用户应用中有 1 个报告调试授权。两者都是元数据线索，不能作为源包真实性、
恢复能力或免费安装位的证明；暂不执行真实签名、刷新或安装。

2026-11-12 续签来源核对：新增只读版本元数据工具，必须识别唯一 USB 设备、
匹配唯一应用和对应设备记录才比较；仅输出字段状态，不输出账号或设备标识。
当前设备未识别，实机比较尚未执行。即使字段一致也不能据此刷新 Sydney；
真实签名身份、源包内容、数据保留及恢复仍需单独验证。

2026-11-12 staging 签发与定时恢复组合演练：维护机以
`test-caddy-staging-reload.sh`、候选生成器及独立恢复器组合，
真实签发测试 IP 证书并由计时器恢复模拟原运行配置；状态文件及
临时资源已清理。该演练不能作为生产执行命令或完整回滚证明。

2026-11-12 staging 独立恢复保护：`infra/compose/caddy-staging-guard.py`
在受限状态目录中读取原配置和候选，并核对容器 ID、启动时间及当前
配置；仅当候选仍在运行时以 ETag 条件写入恢复。维护机合成演练覆盖
控制进程中断与已有并发修改；生产接线、宿主或容器重启及异常清理尚
未验证，不能将该工具单独视为完整生产回滚方案。

2026-11-12 staging 并发和保存：维护机合成实验表明管理接口可用 ETag
拒绝过期写入，`admin.config.persist=false` 候选加载期间未改动自动
保存文件；该次恢复原配置后合成自动保存内容与初始一致。生成器已对
候选关闭自动保存，但生产定时回滚、异步并发部署和异常场景尚未验证；
不要将 ETag 检查本身视为完整生产回滚方案。

2026-11-12 生产形态 staging 候选：
`infra/compose/prepare-caddy-staging-candidate.py` 限定运行配置结构，
仅生成临时 IP TLS、staging 签发和独立存储的候选；
`infra/compose/audit-caddy-staging-candidate.py` 只在生产主机内存中
对照当次运行配置，不加载候选。维护机以模拟文件证书和同一生成器完成
签发及运行态恢复，生产候选未经 Caddy 校验或加载。工具不提供生产
回滚保障，正式操作前仍须核对生产状态、恢复方案和并发配置变更。

2026-11-12 staging 并存及运行态恢复：
`infra/compose/test-caddy-staging-reload.sh` 曾在维护机空闲 TCP 443
上同时验证合成域名 HTTPS 和真实 staging IP 签发，并恢复原运行配置；
模拟域名响应与证书指纹保持一致。脚本使用临时内部 CA、host 网络及
限时清理，不是生产变更或持久态回滚工具；异常清理、真实生产证书和
生产 IP 尚未由本次演练验证。

2026-11-12 staging IP 策略专用存储：
`infra/compose/test-caddy-staging-policy-storage.sh` 曾在维护机临时
监听 TCP 443、使用 TLS-ALPN-01 和 staging CA 签发维护机 IP 证书，
并将其存入容器内策略专用临时目录；运行结束后容器和清理计时器未见
残留。该脚本会占用指定主机 443 并请求测试证书，仅适用于明确授权、
端口空闲的隔离演练环境，不能用于生产部署或正式证书签发；异常清理、
证书续期及信任链尚未由本次演练验证。

2026-11-12 IP 证书策略存储演练：`infra/compose/test-caddy-policy-storage.sh`
仅使用无网络容器、内部 CA 和容器内临时存储；模拟 IP 叶证书写入
策略目录，运行态配置恢复后模拟入口关闭。演练使用合成 HTTP 路由，
不接触生产卷或对外监听；不是生产部署、ACME 或持久态回滚命令。

2026-11-12 IP staging 存储预检：生产同摘要 Caddy 镜像的配置验证
识别 TLS 自动化策略下的独立 `file_system` 存储；无效存储模块被拒。
该机制目前只经过无网络合成配置验证，尚未验证实际证书写入与恢复，
不能将其作为生产配置或回滚操作指南。现有生产入口及双端地址未改变。

2026-11-12 IP 候选与现网对照：`infra/compose/compare-live-caddy-candidate.py`
仅只读获取运行配置和适配候选，不执行加载；在本次时点，调整后的候选保留
了现有域名的内部路由与证书引用，新增 IP logger 改变了日志映射及默认
排除列表。候选还有新增 SNI 检查，尚未在真实生产流量下验证；不能将本次
对照当作部署、生产回滚或生产 IP staging 成功。

2026-11-12 IP staging 路由：维护机使用
`infra/compose/prepare-staging-ip-integration.py` 由候选 Caddyfile 生成
临时演练配置，并由 `infra/compose/staging-ip-upstreams.py` 提供合成
回环 API 和 Web。使用进程专用 staging 根证书完成公网证书链、IP SAN、
四类路由和域名/IP 交叉拒绝检查；未向系统安装测试根。测试资源已清理；
这些脚本仅用于合成演练，不是生产部署或回滚命令。

2026-11-12 IP staging 重启检查：维护机独立测试使用宿主 `/run` 临时
目录作为 Caddy `/data`，容器手动重启后证书指纹不变且公网 HTTPS 可访问；
测试目录和证书已删除。`/run` 是 tmpfs，该结果不能视为跨主机重启的
持久化或自动续期验证。Caddy 的续期时间可能受 CA 的 ACME Renewal
Information 窗口影响，不能仅调大续期比例就断言会立即续期；正式方案须
验证实际存储、重启、续期和失败告警。

2026-11-12 IP staging 结果：`infra/compose/Caddyfile.ip-staging-isolated`
只用于独立公网 IP 和 Let’s Encrypt staging 的 TLS-ALPN-01 测试，不含
业务代理；维护机实测签发及无 SNI 公网 HTTPS 通过，测试容器和临时
证书已删除。生产 IP 未测试签发，其 HTTP 挑战路径仍重定向至当前握手
失败的 HTTPS。正式部署前需另行确认生产挑战接线、证书持久化及自动
续期、原域名可用性、双端业务与故障回退；不得将 staging 证书用于正式
客户端，也未改变现有入口。

2026-11-12 核心业务数据备份：数据库与应用数据密文在生产
`/var/backups/sydney-ip-staging/partial-online-20261112` 和维护机
`/var/backups/sydney-ip-migration/image-recv-20261111/partial-online-20261112`；
核心配置密文位于维护机
`/var/backups/sydney-ip-migration/pre-ip-20261111T054938Z/config-core.age`，
恢复身份保存在既有 root 受限目录。维护机已隔离恢复并抽样读取业务内容；
备份为分时在线采集，不能作为一致快照或完整生产回滚材料。使用前核对
未自动挂载的限额文件系统、密文摘要及恢复身份；真实数据库角色、全部
附件、项目文件和定期备份尚未验证，详见验证记录。

2026-11-12 设备重连：用户重启 Apple 设备服务后，设备工具恢复识别手机；
个性化开发者镜像查询为未挂载。手机上的 Sydney 匹配应用与本机一条续签记录
在安装标识和设备引用上匹配，记录未过期；这不能证明源 IPA 内容、数据恢复、
签名有效性或真实续签。继续保留应用和缓存，不据此执行刷新或侧载。

2026-11-12 连接补充：Windows 已显示 iPhone 和 Apple USB 设备正常，但
usbmux 仍返回零台；设备服务运行且本地端口监听。尝试重启服务未成功，
提示无法打开服务；需要在 Windows 服务管理界面排查权限并重启后再复查。
该现象尚不能确定根因，重启期间可能中断其他 Apple 设备连接。

2026-11-12 原生代理缓存在线副本：生产密文位于
`/var/backups/sydney-ip-staging/native-proxy-cache-online-20261112/cache.age`，
维护机副本位于
`/var/backups/sydney-ip-migration/image-recv-20261111/native-proxy-cache-online-20261112.age`；
两端密文 SHA-256 为
`69639c30359ecfbe5effd232f88d4fe33d23597db19f35cdd5a16cb753350799`。
已做临时文件内容和归档元数据对照；目标文件的原属主及权限、缓存实际加载
和服务恢复均未验证。两端挂载未配置自动挂载，访问前重新核对后备文件和
挂载；该在线副本不构成与其他数据一致的恢复点。

2026-11-12 连接诊断：Apple Mobile Device Service 运行时，设备探针仍为
零台，常见名称的 Windows 即插即用设备筛选也为零；仅凭这些结果不能定位
故障。先检查手机解锁、数据线与 USB 端口，重新连接后再查询；信任提示由
用户在手机上操作。不要为排查连接而卸载 Sydney 或清理其签名资料。

2026-11-12 续签源文件校验范围：iPASide 已检查的记录和刷新入口从保存的
路径重新读取 IPA，未看到记录源摘要或在该入口比较摘要。完整依赖链未核验；
不要将路径存在当作源包与原安装相同的证明。最近设备检查仍为零台。

2026-11-12 恢复维护窗口准备：生产存在证书续期、系统软件更新和安装等
systemd 定时任务；当次检查其对应服务未运行，不能保证维护时不会启动。
执行任何停写前须重新核对定时器、运行中任务及证书 hook，确定可逆的控制、
恢复和异常处置方案；目前该方案尚未演练，不应直接停用或启动这些任务。
驱动实际单元名为 `sydney-driver.service` 和 `sydney-driver.socket`；
不要依据不存在或误写的单元名判断驱动已停止。

2026-11-12 续签源码补充：安装版刷新函数会把记录中的安装标识传入侧载；
选项里没有显式覆盖不代表刷新时不指定标识。源文件与设备版本是否一致仍
未知，不应因此直接刷新。本次只读设备探针仍未发现连接的设备。

2026-11-12 Sydney 续签来源：本机一条匹配续签记录的源 IPA 存在，但其摘要
与此前记录的构建产物不同，源应用标识也与记录的安装标识不同。不能将该文件
当成设备当前安装包或可靠恢复包；不要据此刷新、卸载或覆盖 Sydney。须在设备
连接后继续核对，并另行验证数据保留及恢复；最近一次 usbmux 查询无设备。

2026-11-12 本机认证前置：测试进程默认 remote anisette，候选网络白名单
会阻断其服务；远程流程涉及发送身份相关数据。本地模式可能启动辅助进程并
改写或清理状态，源码还提示登录兼容性问题。未擅自切换模式或放行第三方，
真实认证路径与数据边界需单独验证；匿名 HEAD 成功不等于 Apple 登录成功。

2026-11-12 本机候选公开证书与固定摘要签名器内置证书存在可验证的签名
关系及时效；内置根尚未独立核验，官方证书下载尝试返回 HTTP 403。
该结果不等同 Apple 信任、证书未撤销或恢复能力，不能用于放行真实安装。

2026-11-12 Windows 签名器已在固定公开 runner 上用合成 CA 和开发证书
生成可验证的主应用及 XCTest CMS；不代表 Apple 信任、真实签名成功或可
安装。实验临时目录包含合成私钥，不应替换为真实证书使用；真实签名与
安装保护条件仍未满足。

2026-11-12 公开 runner 的 XCTest 签名槽为空，不能将其当作已具备有效
Apple 开发签名的安装包。合成 CMS 验证只检验命令的密码学对照，不能代替
真实签名、证书链及设备安装验收；实验脚本不提供真实安装功能。

2026-11-12 候选 requests 发送层默认拒绝非 Apple 开发者白名单流量及代理；
这是合成验证，可能阻断真实认证和 anisette。它不拦截底层 socket、原生
网络或其他进程，不可作为真实签名的系统隔离保证。

2026-11-12 候选安装保护只在进程内绑定设备并要求包验证回调；现有验证器
均为合成替身，不提供真实包验签。检查与安装之间的文件竞态及跨进程绕过
尚未解决；不得以该组件执行实际安装。

2026-11-12 候选签名上下文的资产准备限定 runner 和设备，但真实安装阶段
尚未独立绑定；iPASide 原侧载命令的 JSON 结果含设备及团队标识，真实入口
须过滤，不能直接输出或记录。合成测试不代表可以真实侧载。

2026-11-12 候选签名上下文会在目标隔离目录内生成身份及描述文件；当前仅
以合成材料验证，不保证 Windows ACL、文件清理或其他进程隔离，不能用于
实际账号。普通 iPASide GUI 不受其约束。

2026-11-12 受控签名策略组件仍为未接线候选：对传入策略的请求可以限制团队
及目标并拒绝撤销，但不拦截独立 GUI、直接网络或其他进程。策略自身不会核实
调用方提供的受保护应用清单完整性；不应直接用于真实签名或安装。

2026-11-12 侧载合成隔离：测试进程中的目录重定向与请求替身已同时贯穿
侧载命令入口，缓存失配时停止；它不影响用户正常 iPASide GUI，也不构成
真实签名保护。真实安装前仍须建立和验证独立进程的保护与数据恢复条件。

2026-11-12 iPASide 缓存覆盖：当前版本的签名资产准备会更新同账户固定的
描述文件、身份文件和 bundle 缓存。合成测试显示定向重定向该函数可保留
原目录，但不覆盖真实 GUI 或侧载的全部路径；未验证端到端隔离前，不要
以正常流程试签 runner 或清理 Sydney 签名缓存。

2026-11-12 设备签名线索：设备上存在与本机候选字节一致的描述文件，应用
报告的签名者名称也匹配候选证书主体通用名。此为只读关联，不能据此撤销
证书或认定实际代码签名、数据恢复及续签已通过。

2026-11-12 本机候选身份检查：同目录描述文件与缓存证书及私钥的公钥在
本机内存比较一致，且检查时均未过期；此结果不能证明设备当前使用该身份、
Apple 信任或数据可恢复。脚本会在内存读取敏感签名材料，输出仅限汇总，
不应把原始缓存、描述文件或密钥放入文档、日志或聊天。

2026-11-12 iPASide 本地描述文件筛选仅发现一份未过期的 Sydney/Rakazo
名称或标识候选，未验证 CMS、私钥、设备正在使用的身份及能否恢复；
不要凭此覆盖现有 Sydney 或认为其签名可以安全复用。

2026-11-12 iPhone 连接及恢复检查：本次 usbmux 没有发现设备，Apple Mobile
Device Service 在运行；手机应重新连接、解锁并在需要时由用户确认信任。常见
Windows 本机备份根目录未发现备份子目录，但未检查其他位置或 iCloud，不能将
此作为备份不存在或恢复可行的结论。不要为侧载删除 Sydney 或撤销现有证书。

2026-11-12 签名诊断限制：新增内存诊断函数只供离线字段一致性试验；
零错误不表示证书或描述文件可信，也不能作为真实签名、侧载或续签的放行
条件。没有新增安装步骤，也没有处理用户真实凭据。

2026-11-12 iPhone 签名续查：即使证书缓存匹配、无需撤销，后续仍可能向 Apple
注册设备、创建 App ID 或按配置修改应用组及能力；运行离线替身不保护正常
iPASide 进程。真实签名仍需验证保护、标识隔离、名额与恢复能力。
缓存序列号匹配本身不能证明缓存中证书及私钥有效或匹配；不得以此作为签名
或可恢复性的验收依据。

2026-11-12 iPhone 安装注意：iPASide 安装可能触发自动配对、临时 IPA 上传、
条件性配对资料投递及本机刷新记录；相同应用标识可能触发升级。上传中断时临时
文件清理未得到保证。上述为静态源码结论，不是操作授权或已验证的恢复流程；
证书保护、标识隔离、安装位和恢复能力验证前不要运行真实侧载。

2026-11-12 工作区大容量合成恢复终态：维护机单元日志显示 456609793 字节单文件合成恢复及重归档对照通过，1.5 GiB 加密暂存在重归档结束时采样空余约 153 MiB；测试设备与临时代码已核对清理。该容量不是面向真实工作区的保证，文件数量、元数据、并发和实际空余均会影响需求；恢复器空间优化及复测进行中，生产工作区采集保持禁用。

2026-11-12 工作区大容量合成恢复运行中：维护机 `sydney-workspace-large-20261112.service` 使用 `/run/sydney-workspace-large-code-20261112` 及仅含合成数据的临时目录，创建 1.5 GiB 加密环回暂存；单元有 12 分钟时限、私有挂载和 1 GiB 内存限制。运行中不是通过，断线后先核查相同单元、日志、环回设备、映射及临时目录，不要盲目重启或删除；生产采集硬阻断不变。

2026-11-12 工作区恢复与来源只读对照：维护机已在合成加密暂存验证非 root 数字 UID/GID 的目录、文件和符号链接恢复；并非生产账号验证。生产本次只读来源及暂存守卫通过，至少 896 MiB 可用仅为当时观察；下一次使用前必须重新核查。该检查未采集项目，工作区生产入口继续禁用。

2026-11-12 工作区加密暂存恢复候选：`workspace-encrypted-scratch-restore.py` 仅供合成内部调用、直接执行拒绝；调用方必须验证临时文件系统的加密映射、容量、目标隔离和密钥。它将解密结果写入该文件系统匿名文件，认证成功后提取并重归档对照；提取后失败可能留下部分目标，匿名文件关闭不保证安全擦除。真实项目、故障及生产身份映射尚未验证，不能直接作为生产恢复流程。

2026-11-12 工作区合成控制器中断：在发布前强杀完整合成控制器后，正式名称不存在，但随机候选密文残留；测试仅在核对原 inode 后清理自建合成文件。真实故障时应先核对服务终态、挂载、文件身份及恢复需求；不能按文件名前缀批量删除，也不能将残留候选当作完整备份。该对照不覆盖发布过程中强杀或生产数据。

2026-11-12 合成测试失败状态：上次强杀演练遗留的维护机瞬时单元已确认 MainPID=0 且无控制组，重置该特定测试单元后 systemd 恢复 running；测试清理已更新并复测。不要对不明失败单元批量执行 reset-failed。工作区候选密文权限异常路径已补充同 inode 清理，但异常中断仍可能留下密文，不能据此开放生产采集。

2026-11-12 工作区 systemd 合成监督：`workspace-systemd-supervisor.py` 内部接口在合成服务和独立 ext4 卷上复核来源 MainPID、启动时间及限额挂载；服务停止、后备文件不符或卸载时拒绝。强杀对照只测试底层合成加密流的子进程及正式文件，不证明完整生产控制器的故障清理；直接运行监督器拒绝，仍不得绕过生产工作区入口的硬阻断。

2026-11-12 iCTRL 离线资源检查：对照工具核验资源槽与 CodeResources 的绑定，
并统计 `files2` 中可识别普通文件摘要；本次合成输出内所查条目均匹配。检查不覆盖
规则完整性、嵌套代码签名或 Apple 信任，不改变真实签名和安装的阻断条件。

2026-11-12 iCTRL 离线 CodeDirectory 检查：对照工具现可核对受支持格式的代码页
和 Info.plist 摘要；合成输出中两组保留测试包的结果匹配，但这不是 Apple 信任、
资源封印或可安装性的证明。真实签名与侧载条件仍未解除。

2026-11-12 工作区受守卫发布候选：`workspace-capture-controller.py` 仅提供合成内部接口，来源校验、双遍加密和发布前重验已作定向对照；直接执行拒绝。调用方仍须固定 systemd MainPID、控制组、挂载及加密工具，监督进程并核对异常残留；SIGKILL 或发布后的 fsync 故障可能使文件状态未知。它不是生产命令，不得绕过现有工作区采集硬阻断。

2026-11-12 工作区来源身份候选：`workspace-source-identity.py` 的内部 pidfd 和目录描述符守卫仅在合成进程上验证，直接运行拒绝；需要调用方安全取得 systemd MainPID、预期 UID 与控制组并在最终发布前重验。生产某次只读观察与预期一致不代表后续仍一致；工作区采集入口继续硬阻断。

2026-11-12 iCTRL 离线对照工具：`scripts/iphone_runner_signing_probe.py` 只接受
固定公开 runner 摘要，使用指定 zsign 的 ad-hoc 模式在临时目录输出三组对照；
正常退出后清理临时输出，异常强制结束时可能残留。公开 IPA 保存在 Git 忽略的
`artifacts/ios/iphone-control-probe/`；不得向脚本提供用户私有 IPA 或证书。
观测到预对齐可让合成输出的两个标识一致，但未证明 Apple 签名、安装或启动；
真实签名仍须先解决证书撤销风险和安装位。不要将该脚本用于安装或续签。

2026-11-12 工作区双遍归档候选：`workspace-consistent-producer.py` 仅为合成内部组件，第一遍流出并计算摘要，第二遍重新归档比较摘要及计数；直接执行拒绝。变化检测失败时现有合成加密流会拒绝发布，但 SIGKILL 等异常可能遗留临时密文。双遍结果不等于原子快照，仍需可信根描述符、生产源及挂载身份、容量、生命周期监督与隔离恢复；不得绕过现有生产工作区采集阻断。

2026-11-12 工作区合成加密流容量：`globals-encrypted-stream.py` 的内部 `capture_workspace` 使用独立的 768 MiB、900 秒上限，原 globals `capture` 仍为 64 MiB、120 秒；维护机仅验证 65 MiB 合成数据和真实 age。两个接口均不是生产采集命令，不验证来源、目标挂载、空间预留或强杀清理；生产工作区硬阻断不变。

2026-11-12 工作区密文接收区：维护机 `/var/backups/sydney-ip-migration/workspace-recv-20261112` 对应独立 1.5 GiB 后备文件 `/var/backups/sydney-ip-migration/workspace-recv-20261112.ext4`，ext4 挂载选项含 `nodev,nosuid,noexec`，根权限 0700；未配置自动挂载。该目录目前没有工作区备份，未来仅供密文中转；使用前核对挂载、后备文件及余量，禁止在未挂载的底层目录写入。

2026-11-12 工作区恢复存储合成研究：维护机上 64 MiB 随机内存密钥 dm-crypt/ext4 夹具完成关闭映射后重新打开和读取，合成测试资源已按身份清理。该测试未验证异常中断、资源耗尽或真实项目，不是可直接运行的生产恢复流程；随机密钥丢失后临时加密数据不可恢复，内存、swap 和安全擦除仍需明确限制。工作区真实采集保持阻断。

2026-11-12 iOS 27 镜像状态：本轮设备名称筛选无匹配，usbmux 返回设备数 0，
实际镜像状态未知。
用户重连后，usbmux 识别 1 台；只读查询 `Personalized` 返回 false，cryptex
状态未查询，不要仅据此卸载或挂载镜像。
随后通过禁用自动配对和远程配对回退的临时 USB 用户态隧道查询 cryptex 列表，
未发现开发者 DDI 标识；该只读结果不等于已完成挂载准备。
设备库的自动挂载可能创建隧道、下载并安装镜像，不作为只读诊断运行；不要因某个
查询为空就卸载已有镜像。连接恢复后先确认只读查询范围和已有信任。

2026-11-12 iCTRL 描述文件续查：固定公开 runner 无嵌入的开发描述文件；上游
Mac 签名脚本检查描述文件覆盖、调试权限和证书匹配，并在签名前对齐测试包标识。
这些要求尚未在 Windows 免费签名或设备上验证，不能据此安装。

2026-11-12 iCTRL 标识风险：公开 runner 原始主应用和测试包标识相同；iPASide
可能改写主标识，zsign 参考源码的插件标识重写未包含 `.xctest`。实际二进制
行为、重签后标识及安装未验证；单纯关闭“移除扩展”不足以确认可用，不要据此
运行真实侧载或覆盖现有 Sydney。

2026-11-12 Docker exec 生命周期：维护机合成对照显示强杀宿主 docker exec 客户端后，容器内命令可能继续存在；仅杀宿主客户端不足以证明数据库侧进程已结束。所测合成命令在容器内 timeout 后消失，但这不能替代生产进程身份、超时、daemon 故障和清理监督。生产 globals 入口继续禁用。

2026-11-12 iPASide 侧载入口续验：合成实验已覆盖命令入口至证书准备，
拒绝撤销后未进入注册或签名；这不约束独立 GUI、自动刷新或其他工具进程。
不要将离线脚本作为真实账户保护或安装流程，禁止以它启动真实签名。
计划任务名称和路径筛选未找到 iPASide 匹配项，但其他名称或应用内调度未排除。

2026-11-12 iPASide 合成保护试验：同一进程的测试替身拒绝撤销后，可使当前
`_ensure_certificate` 分支停止且不提交新证书；该替身不影响正常运行的 iPASide，
不是可用的运维保护。真实资产准备和侧载继续禁止，直到存在可验证的保护机制。

2026-11-12 iPASide 证书限制：本机版本的真实签名资产准备可能在本地证书缓存缺失
或失配时自动撤销机器名为 `iPASide` 的服务端证书；该证书可能被现有应用使用。
用户禁止撤销，故在验证强制拒绝撤销机制和现有 Sydney 签名归属之前，不运行该工具的
真实资产准备或侧载，不清除缓存、不重新登录来“修复”该风险。源码和合成替身检查
未触及真实账户，不能判断当前缓存、证书或 Sydney 的实际归属。

2026-11-12 PostgreSQL globals 合成认证：维护机已对两个临时 PG18 实例验证合成角色导出、加解密、恢复与回环 SCRAM 正反认证；只适用于合成数据。生产 `backup-postgres-globals.sh` 仍明确禁用，不能通过其他路径绕过；真实角色及密码哈希的受控采集、隔离恢复、授权及一致性核验尚未完成。

2026-11-12 iCTRL 离线签名演练尚未通过：首次公开包下载中断，两条后续临时演练
命令被执行环境策略拒绝；未使用用户账号或证书。移除扩展开关及真实签名兼容性
仍待验证，不要据此覆盖 Sydney 或进行安装。

2026-11-12 Web 历史资源恢复结果：维护机已使用现有恢复身份从异机密文在无网络、私有挂载的临时 tmpfs 恢复并核对 12 批、1321 文件和数字元数据；日志记录校验完成及单元正常结束，临时明文恢复目录已清理。生产和维护机各自保留密文，维护机同时保留分块；两处均依赖未自动挂载的独立 ext4 环回文件，使用前复核后备文件及挂载。该在线资源副本未验证旧页面或完整 Web 服务，不含数据库、工作区及其他卷，不能单独用于生产回滚。

2026-11-12 Web 资源密文副本：维护机接收区 `capture-20261112` 已从 50 个分块重组 13 个文件，逐块和完整文件摘要与固定生产源清单一致。接收区与原分块均保留在同一未自动挂载的 768 MiB 环回文件系统；访问前复核挂载和后备文件。此时仍未解密或完成真实资源恢复。

2026-11-12 iCTRL 免费续签选择：用户接受七天有效期与后续续签。iPASide
v1.2.14 界面有默认开启的 Remove app extensions 开关，可关闭；zsign 参考源码
的默认移除选项会删除 PlugIns，iCTRL runner 所需 `.xctest` 正在该目录下。尚未
确认本机 zsign 的源码版本或以该设置成功签名；不要将关闭开关视为已经验证的
安装步骤，更不能借重签撤销现有 Sydney 的证书。

2026-11-12 Sydney 现有安装：用户确认应用可打开，设备只读匹配到其开发签名
线索；两个关联七天描述文件到期日均为 2026-11-17，实际生效描述文件与自动续签
尚未核实。汇总得到 1 个与未过期七天开发描述文件精确匹配的用户应用，不能直接
换算剩余安装位。iPASide 默认启用移除扩展选项，而 iCTRL runner 含 `.xctest`；
效果未验证，不应直接用默认选项安装。iOS 27 的 cryptex 挂载尚未实测。

2026-11-12 Web 隔离恢复准备：维护机 `/root/sydney-webassets-restore-code-20261112` 已暂存固定恢复驱动及依赖，驱动文件与本地 SHA-256 一致；真实备份尚在传输，驱动未运行。计划在私有网络与挂载、限时的 systemd 单元中使用 `/dev/shm` 临时目录；异常强杀可能留下明文临时目录，须核查后按明确身份清理，tmpfs 不保证无 swap 或安全擦除。

2026-11-12 iPhone 连接恢复：设备服务重新检查识别 1 台 USB 设备，系统为
iOS 27.0.1 且开发者模式开启；两个已知 Sydney 标识的定向查询未返回记录，
不能证明应用未安装。该系统的 iCTRL 安装与控制仍无实测证据；在确认应用身份、
签名及安装位前不覆盖或卸载应用，也不将 iOS 16+ 的项目声明当作 iOS 27 已验证。

2026-11-12 Web 资源续传第二次中断：生产 SSH 返回 255 后任务退出；重连核查两端挂载正常、维护机 14 个正式块且无部分块，随后已重试。返回码未提供更详细原因；如再中断，先检查任务终态、挂载、已有块和固定源摘要，不覆盖或删除未核实文件。

2026-11-12 iPhone 连接层现状：Windows 能显示 iPhone、Apple 移动设备服务运行，
但现有 iPASide 内置库的 usbmux 查询未列出设备；这不等同于已建立开发者连接。
先保持手机解锁并检查是否有“信任此电脑”提示，然后重新检查；若仍失败再排查数据线、
USB 接口及 Apple 服务，不自动重启服务或更改信任设置。

2026-11-12 Web 资源中转中断：上次中转进程已非零退出，维护机时点有 5 个正式块；生产瞬时采集单元已卸载，`not-found` 时的默认 Result/状态不能作为成功证明。已根据此前观察到的采集终态保留证据，并将采集后 13 个密文的分块清单摘要固定在中转脚本中；下一次续传重新校验现有分块和源摘要，失败原因仍需核查。不能以历史“运行中”记录推断当前还有活动进程。

2026-11-12 Web 资源接收区：维护机 `/var/backups/sydney-ip-migration/webassets-recv-20261112` 对应独立后备文件 `/var/backups/sydney-ip-migration/webassets-recv-20261112.ext4`，768 MiB ext4，未配置自动挂载；使用前复核挂载和后备文件。`infra/compose/webassets-transfer.py` 是固定本次两端和 12 个批次的分块中转工具，首次 3/50 块已校验，续传进行中；块文件、临时文件和完整密文不能等同已恢复数据。

2026-11-12 iCTRL 共存核对：本机检测到 iTunes、iCloud、AltServer 和 iPASide，
本次设备名称/类别匹配未发现 iPhone；具体签名和空闲安装位仍未知。直接用 Windows
签名工具安装 runner 可能避免 SideStore 占位，但 `.xctest` 重签及续签未验证；
使用电脑挂载开发者镜像可能避免手机挂载 App 占位，但需另验证具体系统、工具和
重启后的操作。这些不是可保证成功的安装流程，不要为尝试而删除 Sydney、撤销已有
证书或将配对文件上传。发布 IPA 的一次内存摘要与发布元数据匹配，真正安装前应
重新核对。无设备或名额不明时不执行安装，详见
[iPhone 操控方案](design/IPHONE_CONTROL_PLAN.md)。

2026-11-12 Web 真实采集终态：`sydney-webassets-capture-20261112.service` 已成功结束，密文批次及加密清单位于生产 `/var/backups/sydney-webassets-staging-20261112/capture-20261112`；共 12 批、1321 文件、184376589 字节。暂存依赖未自动挂载的环回文件，使用前重新核对；异机复制、解密、严格校验和实际恢复尚未完成，不得用此代替完整恢复或生产回滚依据。

2026-11-12 Web 真实采集运行中：生产 `sydney-webassets-capture-20261112.service` 使用固定卷与容器检查、独立暂存和已匹配的恢复收件人；单元设置 15 分钟时限、控制组回收、私有挂载、只读系统及内存限制。只读预检通过，首次观察为 active/running，尚无终态；目录可能含未完成密文，勿删除、重启或将其视为有效备份。若控制会话中断，先检查该单元终态与输出、暂存挂载和残留，再决定下一步。

2026-11-12 Web 资源暂存：生产 `/var/backups/sydney-webassets-staging-20261112` 对应独立后备文件 `/var/lib/sydney-backup/webassets-staging-20261112.ext4`，大小 768 MiB；本次挂载 ext4，选项含 `nodev,nosuid,noexec`，根目录 0700。没有配置开机自动挂载，使用前须重新核对 loop 后备文件、挂载点、权限和可用空间；不要向未挂载的同名底层目录写入。该区域当前没有资源备份，不能代替异机副本。

2026-11-12 iPhone 控制候选安装前置：Apple 免费开发描述文件有效期为七天，且有
App ID、设备与每台设备安装数量限制；iCTRL 项目描述 SideStore、必需 runner 和
无 Mac 挂载工具可能占满三个安装位，现有免费签名 Sydney 的共存尚未验证。无 Mac
挂载需要 RemotePairing 文件，不能直接用普通 lockdown 配对文件代替；文件应视为
敏感凭据，不入库、不记日志、不公开。候选还需开发者模式、LocalDevVPN、开发者
镜像及重启后重新挂载；具体步骤、兼容性、续签和清理均未在本机或手机执行，当前
不是可保证成功的安装操作手册。详见 [iPhone 操控方案](design/IPHONE_CONTROL_PLAN.md)。

2026-11-12 Web 分批隔离恢复候选：`webassets-batch-verify.py` 和 `webassets-batch-restore.py` 的内部接口只在可信合成数据上运行，直接执行会拒绝。恢复器要求调用方提供私有空目录描述符，先验证全部批次，再逐批重新解密、复核并创建文件，最后设置目录元数据；写入期间失败或强杀可能留下部分目标，不会自动清理。调用方须提供可信 age 和密钥、隔离目标及足够内存；非 root 只能还原同 UID，root 会按归档设置数字 UID/GID 和模式，不能在未核对账号及权限的环境使用。未验证真实资源与异机恢复，生产采集、恢复和回滚未放行。

2026-11-12 Web 资源分批候选：`webassets-batch.py` 仅有内部接口且直接运行拒绝，依赖受信的配置采集脚本、age、私有空输出目录和独立容量；文件内容及路径只进入 age 密文，内存与系统 swap 不保证安全擦除。批次采集中断可遗留密文，清单缺失表示未完成；清单存在本身不证明批次与清单匹配或可恢复。尚未验证生产源和挂载身份、密文异机传输、完整恢复器或恶意并发，不得将其当作生产备份命令。

2026-11-12 合成跨 UID 提取：`workspace-safe-extract.py` 内部接口新增显式 `privileged_owner=True`，只允许 root 将受信归档提取到 root 拥有的空 0700 目录，并恢复指定的非 root 数字 UID 与归档 GID；默认仍要求目标 UID 为当前用户。root 拥有对归档所列 GID 和模式的完全设置能力，提取后目标属主会改变，绝对链接及特权模式的使用会带来额外风险；该接口仅在可信隔离夹具中验证，不是生产恢复命令。需另行核验真实账号、组、来源可信度、数据一致性及异常残留。

2026-11-12 定时备份风险：生产未安装仓库默认 `rakazo-backup.timer` / `rakazo-backup.service`，所查 8 个 cron 文件无产品名称；不能据此排除其他调度或云端备份，也不得假设仓库定时方案已经运行。Web 资源卷仍未备份，采集前须重新核对来源、容量、并发写入及权限，并验证异机恢复；此前工作区和维护机暂存区挂载状态、空余空间均会变化，不能凭历史记录直接复用。

2026-11-12 恢复窗口前置复核：生产 PostgreSQL 当前 `archive_mode=off`，未配置 PostgreSQL 归档命令或归档库；不能依赖其现有配置假定 WAL 归档或 PITR 可用，也不能排除外部备份。排队/运行 Run 及有效电脑执行租约一次只读统计均为 0，仍需在实际维护窗口内重新核对所有写入方和用户活动；driver socket 可重新触发 driver service，API、Web、worker 的重启策略为 unless-stopped，不能只停止一个进程就宣称完成停写。任何停写、恢复或回滚流程须先验证一致恢复点及故障后的恢复步骤，本次未停止服务。

2026-11-12（语义分流实验开关）：代码支持服务端环境变量
`RAKAZO_TOOL_INTENT_ROUTING=1`，未设置或其他值均为关闭。开启将对符合保守条件的
消息额外调用一次已选模型并可能产生费用；该开关尚未部署，也未完成真实模型效果、
超时后计费和端到端性能验收，禁止据此在生产启用。部署环境变量的具体注入位置、
生效及关闭方式尚未在服务器验证；不影响现有生产入口和双端地址。

2026-11-12 工作区合成提取器：`infra/compose/workspace-safe-extract.py` 直接执行会拒绝，内部接口要求已认证的完整明文、可信且可定位的源、当前用户拥有的空 0700 目标；保留符号链接但提取时不跟随。失败或强杀可能留下部分文件，绝对链接可能被后续程序跟随，调用方须隔离目标并负责清理；它不是生产恢复命令，未验证真实项目或生产 UID/GID。

2026-11-12 Caddy sticky 合成研究：内部函数的显式试验选项只允许 root:root 1777 根，子项仍须符合原信任规则；维护机仅对自建夹具验证默认拒绝、非 root 注入检测及 root 文件 sticky 保护。生产 CLI 的非 root 限制和卷采集阻断未解除，不能据此采集真实 Caddy 卷或认为有一致备份。

2026-11-12 工作区合成加密流：仅在维护机合成目录验证已打开根描述符经子进程归档并流式加密、路径替换对照及来源失败清理；`globals-encrypted-stream.py` 的 `producer_fds` 仅应由可信调用方传递，组件不校验来源身份，也不保证强杀或崩溃后清理。真实工作区备份及恢复尚未完成，原生产采集阻断保持不变。

2026-11-12 工作区兼容性复核：只读时点遍历发现 1206 个目录（含根）、4766 个普通文件、6 个符号链接，未观察到不匹配属主、其他文件类型、多链接、扩展属性或嵌套挂载。此结果不是备份或原子快照，不排除并发变化；生产工作区采集入口继续禁用。

2026-11-12 跨版本群聊隔离对照：维护机固定恢复脚本支持 `--cross-version-groups`，在同一隔离恢复库先由当前版创建随机合成群聊，再由旧版读取并创建另一群聊，最后由当前版读取两者及成员；本次通过并销毁临时库。此模式会写入其目标数据库，只允许固定脚本创建的无外网临时库，绝不能指向生产；每次应用数据目录重新从快照提取，结果不证明文件变化或其他业务的双向兼容，也不是生产回滚。

2026-11-12 旧版隔离读取：维护机固定旧镜像在真实快照隔离恢复后，健康、短期合成会话、Bot、群聊、消息及三个附件读取抽样通过；应用及数据库容器、临时 appdata 与作业脚本目录已清理。此结果不能证明真实用户登录、业务写入、云电脑、跨源一致性或生产回滚；旧镜像依赖当前基底与差量密文重组。

2026-11-12 旧镜像维护机加载：已用现有恢复身份解密差量并与维护机当前镜像重组，Docker 加载旧镜像 `sha256:59ddeb7193b9fa63531dafb759752124c9cd391f603210668d84cde1d09692d2` 成功，基底 ID 未变。需保留基底镜像及差量密文，单靠差量不能恢复旧镜像；加载不是旧版应用或生产回滚验收。

2026-11-12 旧镜像差量密文副本：维护机 `/var/backups/sydney-ip-migration/image-recv-20261111/rollback-delta-20261112.age` 已按 19 块合并，大小 77423256 字节、SHA-256 `9bb6b8dd96da048c34300dd2394fe57b58fe5306a074e1c37102e8cf3bc75a2f`，与生产一致。接收文件系统未配置自动挂载，使用前须复核挂载、后备文件及空间；密文为差量，未重组或验证旧镜像，不能独立恢复服务。

2026-11-12 旧镜像差量接收进行中：维护机限额接收区 `rollback-delta-chunks-20261112` 内前 15/19 块已核对；本机 `infra/compose/image-delta-transfer.py` 为本次固定两端、固定源摘要及大小的受控工具，参数为本轮最多接收的块数。运行前需复核源文件、两端挂载和空间，脚本每次核验已有块；临时 `.partial-*` 可能因强制中断残留，不能将单块当作完整密文。完整汇总、age 解密和镜像 ID 恢复尚未完成。

2026-11-12 旧镜像差量暂存：生产 `/var/backups/sydney-image-staging-20261111/rollback-delta-20261112.age` 为以现有异机收件人加密的旧应用镜像差量，大小 77423256 字节、SHA-256 `9bb6b8dd96da048c34300dd2394fe57b58fe5306a074e1c37102e8cf3bc75a2f`；单元已正常结束。该 ext4 环回文件系统未配置自动挂载，使用前须重新核对挂载及后备文件。维护机已取得异机密文、重组并加载旧镜像，临时索引和作业目录已清理；此结果仍不能作为完整恢复或生产回滚验收。

2026-11-12 镜像差量研究：`infra/compose/image-delta.py` 为合成组件，直接运行拒绝；维护机六项测试及基于同一镜像层构造的不同合成镜像加载通过，未完成真实旧镜像、可续传传输和故障恢复验证，不能用作生产备份。Docker 删除临时镜像默认可能连带删除无标签父镜像；本次曾发生并从已有密文恢复，后续合成演练使用 `--no-prune` 并分别核对基底身份，禁止据此删除用户镜像。

2026-11-12 旧版镜像加载中断：本机直通 SSH 会话现不可访问，生产发送和维护机加载进程均已消失，维护机未检出目标旧镜像；未获得退出状态，不能将此作为加载成功。此前记录的“正在传输”仅为历史状态，后续传输需明确终态、镜像 ID 和清理证据。

2026-11-12 旧快照时效：快照从 2026-11-11 14:06:47 UTC 开始；本次只读观察消息、附件和 Bot 三表无创建时间在此之后的现存记录。不能从中推断其他表、既有记录、文件或权限未改变，仍须在计划回滚前取得并验证适用恢复点。

2026-11-12 PITR 状态：当前生产 Compose 项目未发现仓库可选 PITR 服务容器，数据库无复制槽和默认 PITR 角色；本次未检查其他归档机制或对象存储，不代表数据库可以按时间点恢复。不得将仓库可选功能描述为线上已启用。

2026-11-12 旧版隔离演练：固定维护环境的 `restore-acl-audit.py --rollback-image` 已接线到事先核对的旧版镜像 ID，仅可在授权的隔离恢复环境使用；截至本记录旧镜像尚在传输，命令未以旧版执行，不是经过验证的生产操作。默认当前镜像演练重新通过，容器清理成功；即使旧版日后启动通过，也不能替代生产回滚、业务写入和云电脑验证。

2026-11-12 回滚兼容性前置：生产时点 208 条有效 Prisma 迁移与旧 revision 208 个迁移文件的名称及 SHA-256 匹配；旧版与当前版数据库 schema 和迁移无差异，但 API 云电脑路由有改动。迁移历史一致不证明实际 schema、数据和业务兼容，不许可直接生产回滚。旧镜像正在经 SSH 管道加载维护机，未形成独立备份；须等待发送和接收终态、核对完整镜像 ID 后再用于隔离验证。

2026-11-12 合成 globals 流发布：`infra/compose/globals-encrypted-stream.py` 现在先写随机 `.capture-*.partial`，成功同步后以硬链接不覆盖发布正式文件；需私有目录及支持硬链接的文件系统。维护机真实 age 合成测试和 PG18 合成恢复通过，强杀后正式名称未出现，但临时密文会残留；必须由经过验证的外部监督与清理处理，不能将文件名前缀当作完整或已认证备份。此组件仍禁止直接用于生产，生产 globals 采集入口硬阻断不变。

2026-11-12 生命周期探查：维护机使用 cgroup v2、systemd running，生产为 cgroup v2、systemd degraded；生产只读检查发现 1 个因退出码失败的 transient service，单元名不含 Sydney、Rakazo、Caddy 或 Docker，Docker 和 containerd 均 active/running，失败的具体原因与影响未调查。维护机瞬时服务在合成主进程正常退出后，其另建会话子进程的 `/proc` 条目消失；对应单元及临时目录已清理。未验证系统崩溃、强杀、超时或 Docker daemon 生命周期，不能据此开放生产采集或假定生产 systemd 状态正常。

2026-11-12 Caddy 卷只读复核：运行容器的两个 local 卷根均为 root:root 1777；时点观察的子目录和普通文件均为 root 所有，未发现链接、扩展属性、跨设备条目或多链接普通文件。该观察不保证遍历一致或排除同设备 bind mount；现有合成采集器拒绝其他用户可写目录，不能直接套用于生产，也不能改动运行卷权限以绕过阻断。尚未完成卷备份及证书恢复验证。

2026-11-12 Web 资源后续准备：生产 Web 健康，`rakazo-prod_webassets` 仍为 local 卷；现有工作区暂存区与维护机镜像接收区分别时点空余约 958 MiB 和 509 MiB。容量会变化，且这不是资源卷备份；不可据此复用暂存区或认定在线采集安全，应先验证固定来源、受限容量、变更检测、故障清理和异机恢复。

2026-11-12 附件恢复抽样：固定维护环境演练脚本在隔离恢复库中为选定用户抽取最多 3 个不超过 1 MiB 的附件，以临时会话通过隔离 API 读取并在内存核对字节数和数据库摘要，本次 3 个通过。零样本不能视为通过；此脚本不是通用生产恢复命令，样本不证明完整附件、用户登录或一致性。明文短暂存在内存，不保证免于 swap 或安全擦除；生产工作区、数据库角色、Caddy 卷和历史 Web 资源等缺口仍须补齐，生产回滚尚未验证。

2026-11-12 恢复应用认证读取：维护机临时恢复库内使用随机合成会话和备份认证密钥，实际读取到选定工作区的 Bot、群聊与包含解密消息的线程；无会话及错误签名被拒。该方法直接插入临时会话，不验证真实密码或登录，只可用于用户授权的无外网恢复演练，凭据和内容不得输出；不能用于生产库。

2026-11-12 恢复数据隔离 API 演练：维护机以 `restore-acl-audit.py`、`restore-app-smoke.py` 和配套检查器在网络隔离容器恢复数据库、提取 appdata 并启动当前镜像；API `/health`、`/ready` 通过，暂停及恢复隔离数据库的就绪负向对照通过。演练更改了临时恢复库的占位角色并重设临时文件权限，真实凭据仅使用需要的备份加密及认证值，未验证真实登录或完整业务。脚本依赖固定备份路径、镜像、信任的本地 Docker 与 `/dev/shm`，不是通用生产恢复命令；异常崩溃或连接中断时须先核实随机标签容器和临时目录，不能假定已清理。

2026-11-12 恢复库消息抽样：通过仓库算法的独立检查器，在维护机内存中验证了恢复数据库的 25 个受大小限制的加密消息块，均能用备份配置与空间密钥解密并解析。该抽样不读取或输出明文到文件，不代表全部消息、附件、登录或应用自身恢复；明文仍短暂存在进程内存，不能承诺 swap 不参与或安全擦除。

2026-11-12 应用密钥恢复对照：核心配置密文中的四项关键配置与本次生产 API 运行值经临时 HMAC 对照一致；在隔离恢复数据库中，备份 `ENCRYPTION_KEY` 成功解封 1 条空间密钥。检查器独立复现仓库中的本地 HKDF/AES-GCM 算法，并非应用端到端运行验证；它不验证消息、附件、外部密钥提供方、其他秘密或分时快照一致性，不能作为完整恢复或回滚许可。

2026-11-12 真实数据库权限摘要：`infra/compose/restore-acl-audit.py` 在维护机新建临时 PG18 容器，恢复固定的既有数据库密文并执行 `restore-acl-audit.sql`；本次解密和导入均成功，所选 public 对象 ACL/owner/RLS 标志及策略摘要与生产事后查询一致。此脚本仅供本次固定环境核验，信任本地 Docker 和身份文件，未实现完整故障监督、生产校验或通用恢复；目标容器使用占位角色。摘要对照不能证明认证、全部权限、实际策略行为、跨源一致性或业务恢复。

2026-11-12 globals 加密流合成数据库演练：维护机在两台新的网络模式 none、只读根和 tmpfs PG18 容器中，对合成角色完成真实导出、age 加解密及目标恢复；仅处理同名引导角色的一条创建语句。该演练不证明生产角色及其认证、服务端身份、其他全局对象、完整权限和跨源一致性，不能解除生产采集禁令。

2026-11-12 globals 加密流组件：`infra/compose/globals-encrypted-stream.py` 只供合成测试，直接运行拒绝；组件不验证数据库或工具身份、收件人、配额及挂载，也不保证遭终止或崩溃后清理。不可用它替代生产 globals 备份门禁，不能将测试中的 tmpfs 或文件限额视为生产隔离容量。

2026-11-12 PostgreSQL globals 前置：生产 PG18 容器内可使用配置的引导身份经 Unix socket 建立默认只读事务；无密码 globals 导出到空设备的一次对照成功，时点查询未发现自定义表空间。这个账号仍为超级用户，事务设置不是持久权限约束；不含密码且未保存的输出不能恢复角色。实际采集、加密、隔离角色恢复及和数据库归档的一致性仍未完成，原生产采集入口继续禁用。

2026-11-12 基础服务镜像副本：维护机 `/var/backups/sydney-ip-migration/image-recv-20261111/base-images-20261112.age` 包含本次生产 Caddy 和 PostgreSQL 运行镜像，密文 SHA-256 `332dcf0939cf36b30c2ea019b0e46800b687265709b2a11fb23c18b20310d8e0`；已使用既有恢复身份解密并加载至原有 Docker 缓存。该接收区位于未配置自动挂载的 2 GiB 环回文件系统，使用前须复核挂载、后备文件和空间；副本不含数据库内容、角色、Caddy 卷或配置，不能单凭镜像执行生产回滚。

2026-11-12 工作区恢复探索：归档检查器和 age 演练仅供合成数据；它不负责提取、进程监督、解密完成前的临时数据隔离或恶意归档的全面安全性。演练使用 `/dev/shm` 存放临时合成身份和数据，swap 及安全擦除不保证；生产工作区采集和恢复仍未开放。

2026-11-12 工作区归档探索：`infra/compose/workspace-fd-archive.py` 仅为合成测试组件，直接运行会拒绝；输出未加密，也没有独立容量限制、端到端恢复器或进程故障监督，不得用于真实工作区。维护机观察到快速同长度写入可保持可见 mtime/ctime 不变；两次内容摘要对照也不能排除恢复原状或发生在检查之外的并发变化，更不能替代跨数据库一致性点。

2026-11-12 主镜像副本：生产密文保留在 `/var/backups/sydney-image-staging-20261111/application-image.age`，维护机已校验并保存在 `/var/backups/sydney-ip-migration/image-recv-20261111/application-image.age`，两端均依赖各自未配置自动挂载的限额 ext4 环回文件；访问前须重新核对挂载来源、权限与空间。维护机已用现有身份解密加载并核对镜像 ID，临时传输授权及密钥已删除；临时 age 工具保留供后续恢复，密文不包含业务数据，不能视为完整恢复或生产回滚材料。

2026-11-11 工作区元数据解析器仅用于后续隔离采集的开发：维护机合成测试通过，不是可独立使用的备份工具。调用方必须分别核验 find 的退出状态和来源隔离，检查扩展属性及并发变化，并处理归档与恢复；不得以元数据摘要替代文件内容核验或解除采集禁令。

2026-11-11 工作区隔离探索：维护机合成测试中 Docker 对 `/proc/<pid>/fd` bind 返回 `invalid argument`；root 私有只读 bind 在原路径替换后仍保留已固定目录，非 root 无网络容器未访问外部链接目标。此结果仅覆盖合成场景；实际生产采集、Docker 创建结果未知处理、归档及恢复尚未验证，禁止据此解除现有工作区候选阻断。

2026-11-11 工作区暂存与候选阻断：生产 `/var/lib/sydney-backup/workspace-staging-20261111.ext4` 已挂载到 `/var/backups/sydney-workspace-staging-20261111`，1 GiB ext4，根目录 700、`nodev,nosuid,noexec`，未配置自动挂载。`infra/compose/backup-native-workspace-encrypted.sh` 因并发目录/链接替换越界风险硬禁用，不得用于生产；尚无工作区归档。后续须先验证受限容器、固定来源、链接处理、恢复和清理，且每次写入前确认挂载和空间。

2026-11-11 原生工作区结构：时点观察为 4766 个普通文件、1205 个目录及 6 个符号链接，未发现嵌套挂载；一个链接指向工作区外 `/tmp` 中的 socket，另有两个链接目标不存在。备份必须保留并安全检查链接，不能解引用外部路径，也不能把临时 socket 当持久文件；统计不证明之后树或挂载未变化。

2026-11-11 原生工作区：生产活动 driver 的工作区根与 `/home/sydney-desktop/.local/share/sydney/workspaces` 规范路径一致，时点同文件系统 apparent-size 为 456609998 字节；该目录不在已知 API `/data` 归档范围内。该数字排除跨文件系统内容，不保证源文件一致性；未完成工作区加密备份、异机恢复或实际项目验收。

2026-11-11 原生运行依赖时点检查：三个辅助容器挂载共享目录和 Unix socket，来源并非简单 `/run` 或 `/var/run` 前缀；生产 driver service/socket 当时 active，历史文档中的两个 tunnel 服务在该机 not-found。不要假定历史拓扑仍适用；恢复前须重新识别挂载来源、主机账号、桌面会话和其他主机依赖。

2026-11-11 续传分段观察：真实镜像传输第一段按 1200 秒期限退出 124 后已启动第二段，目标文件继续增长；这是预期分段，不应仅因单次 124 判定整个单元失败，也不能因文件增长认定完整。继续以单元终态、目标摘要及实际解密加载为准。

2026-11-11 Web 历史资源：生产 `rakazo-prod_webassets` 的卷身份与 Web 容器视图已做时点核对，遍历时约 184 MB、1321 个普通文件；现有备份尚未覆盖它。资源可重建的假设不能替代真实恢复验证或保证已打开页面旧资源可用；必须评估在线写入及实际采集。旧 `rakazo-prod_pgdata` 卷 Docker 时点统计 0B，不等于可删除。

2026-11-11 驱动配置备份：生产 `/var/backups/sydney-ip-staging/native-driver-20261111/driver-config.age` 与维护机 `/var/backups/sydney-ip-migration/image-recv-20261111/native-driver-config.age` 的密文 SHA-256 均为 `bc326e9fa2b63dee3e4c1eb4ae6e93c5cfb8812b7988e4f6cddb68dda7877720`。四个驱动 service、drop-in、socket unit 和驱动源码已在维护机 tmpfs 解密恢复并重新读取，与事后生产内容及数字 UID/GID/模式一致；tmpfs 不保证安全擦除。该项不包含账号、显示会话、套接字、工作区及驱动启动验证，不能据此视为完整云电脑恢复。

2026-11-11 原生辅助配置对照：三个辅助容器的两份 Compose 文件在既有 `config-core.age` 归档中，事后生产文件的内容摘要及数字 UID/GID/模式与归档一致。此对照未验证环境变量、套接字与挂载源或云电脑端服务，不应据此认定原生电脑可恢复。

2026-11-11 原生辅助镜像副本：生产及维护机各有 `native-sidecar-image.age`，密文大小 4163768 字节、SHA-256 `3c8a49fec7243badd3125822ef07be01b30ffcb6cb8524095928e7236abb4e05`，分别位于两机的镜像暂存及接收文件系统；维护机已用现有恢复身份解密加载，Docker 镜像 ID 为 `sha256:a6be4c0262b339c53ddad723cdd178a1a13271e1137c65e27f90a08c16de02b8`。未验证辅助容器配置或运行；维护机临时解包工具 `/root/sydney-sidecar-age-20261111` 为主镜像恢复保留，完成后需核查并清理。

2026-11-11 真实镜像续传运行中：生产单元 `sydney-image-copy-20261111.service` 当前运行，使用 `/run/sydney-image-copy-job-20261111` 内的临时身份向维护机接收区写入 `application-image.age.partial`；维护机受限接收器位于 `/root/sydney-image-receiver-job-20261111`，授权标记 `sydney-image-copy-job-20261111` 的到期时间为维护机本地 2026-11-12 09:14:58。单元有 8 小时上限、每次 rsync 有 1200 秒上限并可续传。查询 `systemctl show` 的 ActiveState、Result 和 ExecMainStatus 及单元日志，运行中 Result 不代表成功；终止后分别核对目标 SHA-256、撤销授权、删除临时身份与接收器，再验证解密加载。重启会清空生产 `/run`，不能假定任务或身份会自动恢复；不要将 `.partial` 当作完整备份。

2026-11-11 受限续传合成对照：已验证一次生产到维护机的限时、限定来源和只写身份可以发送并续传小文件，摘要一致且拒绝 shell 与反向读取；首次清理因连接超时失败，重连确认内容和脚本摘要后完成。该结果不代表真实镜像已复制，后台续传必须具备可观察状态、有效期限、可校验摘要和结束后身份清理。

2026-11-11 合成挂载卸载对照：维护机临时合成卷验证宿主卸载后私有命名空间仍持有原卷，宿主底层目录不出现写入标记；这只覆盖该主机的一项隔离行为，接收脚本与 rsync 的真实传输及特权并发修改仍需分别验证。

2026-11-11 接收守卫续修：脚本现在先进入私有挂载命名空间，再核对接收挂载及后备文件；维护机定向对照通过，尚未实测并发卸载和 SSH 续传，也未部署。此前关于原草案检查后仍暴露宿主挂载变化的限制以此修订为准，但不能因此断言所有竞态已消除。

2026-11-11 镜像接收守卫草案：`infra/compose/receive-image-backup.sh` 检查指定接收文件系统后调用 `rrsync -wo -no-del`；维护机上已做语法及部分挂载正反检查，但脚本尚未部署或验证 SSH 限权和实际续传。挂载检查与实际写入之间仍有竞态，需在运行方案中处理；不应仅据此开放接收身份。

2026-11-11 镜像接收区：维护机 `/var/backups/sydney-ip-migration/image-recv-20261111.ext4` 已挂载至同父目录的 `image-recv-20261111`，2 GiB ext4，根目录 700、`nodev,nosuid,noexec`，尚无生产镜像密文。接收前与每次重连前都须核对挂载目标和 loop 后备文件；挂载消失时不得落到根盘。未设置自动挂载；受限续传身份和恢复验收尚未实现。

2026-11-11 生产镜像密文：`/var/backups/sydney-image-staging-20261111/application-image.age` 以现有维护机收件人加密，大小 1293641256 字节、SHA-256 `2910f426501f5330160da200ca7521bea5846fa1fd10b73aea6811d1214e0679`；捕获的镜像 ID 为 `sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`。其所在 ext4 根目录已收紧为 700，密文 600；该单份本地密文尚未异机传输或恢复验证，不得作为生产回滚凭据。受限临时 age 工具和收件人副本仍在 `/root/sydney-image-age-20261111`；完成必要操作后核实并清理。

2026-11-11 管理链路中断：镜像加密命令在 SSH 连接阶段超时，未执行；生产 SSH 重试超时，生产 80/443 TCP 可达而 22 未连接，维护机直接 SSH 也未连接。此前创建的镜像暂存挂载与 root 临时工具可能仍在，状态未知；恢复 SSH 后先核对服务和正在运行的捕获进程、挂载身份、目录内容及容量，不要盲目重试或删除。端口可达不等于业务健康。

2026-11-11 镜像独立暂存：生产新建 `/var/lib/sydney-backup/image-staging-20261111.ext4`，挂载至 `/var/backups/sydney-image-staging-20261111`，2 GiB ext4，选项 `nodev,nosuid,noexec`；仅是生产根盘上的容量边界，未配置自动挂载，也不是异地备份。每次写入前必须重新核对挂载目标、loop 后备路径及余量，防止未挂载时写入根盘。age 1.1.1 临时解包在 `/root/sydney-image-age-20261111`，收件人来自维护机既有受限文件，当前尚未清理；完成捕获后须核对并清理临时工具及收件人副本。

2026-11-11 镜像暂存容量：当前镜像 gzip 流实测 1270653622 字节，远超 `/var/backups/sydney-ip-staging` 当时约 438 MiB 可用空间；不要向该文件系统写入本镜像。生产根盘当时约 33 GiB 可用，但尚未建立本镜像的独立限额暂存区；创建前须重新核对可用量、设备身份、加密收件人、失败清理和空间余量。流式测量不是备份，业务影响未实测。

2026-11-11 限时镜像直传复试：用目标机本地时间设置到期后，真实认证成功、镜像字节开始传输，但带宽不足以在限定时间完成，人工停止源进程后两端均退出 1，加载报截断；临时授权标记和源端临时密钥路径复核不存在。不要将中断流视为完整镜像或回滚依据；后续方案须对敏感性、独立容量、断点续传和最终摘要及加载状态逐项核验。

2026-11-11 限时 SSH 诊断：维护机 OpenSSH 8.9 的 `expiry-time` 手册要求系统本地时区；隔离 sshd 上 UTC `Z` 形式被拒，本地时间形式可认证并执行强制命令。临时授权应在目标机按其本地时区计算到期值，并校验目标时钟及认证、清理结果；隔离验证不能替代生产连接验证。

2026-11-11 限时身份复查：第二个临时公钥可在授权文件解析，客户端已提供，服务端未接受；两次试验的授权标记事后均不存在，临时源文件清理命令均退出 0。维护机启用云平台 AuthorizedKeysCommand，不能据此推断拒绝原因；应先隔离诊断，不得关闭主机身份校验或扩大授权来强行传输。

2026-11-11 限时镜像直传尝试：使用固定主机公钥和强制镜像加载命令的一次性身份，远端认证失败，源/目标分别退出 141/255；临时授权与生产临时文件清理命令退出 0，维护机标记已复核不存在。原因待查，不能依此认为目标镜像可用或可以回滚；不得保留临时私钥或放宽 SSH 校验来绕过问题。

2026-11-11 应用镜像副本复试：本机中转传输因吞吐低主动中止，两端 `docker image save/load` 进程事后未发现，维护机按当前应用镜像 ID 查询仍无结果；两端退出码及全部缓存残留未知。生产到维护机 TCP 22 可达不代表认证可用或链路吞吐足够。保留现有备份，后续以受信身份和服务端主机密钥核验建立可断点续传、可校验的副本，并确认传输及加载结果；不得以本次尝试作为回滚依据。

2026-11-11 镜像异机传输中断或结果未知：原会话已不可访问，源/目标对应传输进程未发现，维护机未查到目标镜像 ID；不可把先前传输当作备份成功。不得仅按输出片段推断清理或成功，需评估目标缓存残留及重新传输方案；生产本地回滚标签仍不能替代异机副本。

2026-11-11 应用数据隔离恢复：`pre-ip-acl-20261111` 的 appdata 归档通过受限条目检查，在无网络 tmpfs 容器提取并经 GNU tar 对照；容器已清理。检查会拒绝链接、特殊文件及超额归档，可能拒绝合法数据；未单独验证 ACL/xattr、应用密钥及业务一致性，不可替代完整恢复验收。

2026-11-11 单表 ACL 差异复查：上次显式 ACL 计数相差一项的表，生产显式条目仅授予所有者，隔离端为默认 ACL；检查时所有者及权限、grantable 标志摘要一致。只消除该计数差异的一个疑点，不能据此认定全库授权或生产恢复通过。

2026-11-11 新数据库快照隔离导入：在维护机无网络临时 PG18 成功导入数据库，使用的是不具登录或 BYPASSRLS 的占位角色，容器及临时工具已清理。表总数和该角色 SELECT 表数与事后生产时点一致，显式 ACL 非空表数少一项，原因未确认；不代表真实角色、授权或应用恢复完成，不应以此放行生产回滚。

2026-11-11 角色恢复基线：生产数据库当时非系统角色中有两个可登录角色，一个超级用户和一个可绕过 RLS 的角色；成员关系表的三条记录包括系统角色。该统计不包含密码或授权明细，恢复必须核对角色属性、成员关系、认证及实际权限，不能用相同数量替代验证。

2026-11-11 ACL 快照目录：维护机统计到 127 条包含 ACL 标记的归档目录条目；该数量不是权限完整性的验证。恢复前仍需准备全局角色，并在全新隔离数据库中验证 owner、权限和实际访问。

2026-11-11 ACL 快照副本：维护机 `/var/backups/sydney-ip-migration/pre-ip-acl-20261111` 已完成密文校验与恢复身份解密、归档目录读取；备份仍缺角色、Caddy 等，未恢复数据或验证业务，且源端分时采集。必须保留相关密钥与既有快照，不得将读取目录当成恢复成功。

2026-11-11 ACL 加密快照：生产暂存区 `pre-ip-acl-20261111` 含数据库对象 owner/ACL 与应用数据密文，源端校验通过，维护机复制进行中；该快照不含角色 globals、配置、Caddy 等材料，在线跨源一致性、目标校验与隔离恢复尚未验证。不要删除既有快照或据此执行生产回滚。

2026-11-11 Caddy 卷来源检查：生产容器及两卷的名称、根目录和宿主／容器挂载身份在本次检查时通过；这不是备份、在线一致性或恢复证明。临时审计文件已清理，真实生产采集仍须满足既有门禁。

2026-11-11 当前运行镜像引用：生产新增 `rakazo-rollback:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，核对指向同名 SHA-256 镜像 ID；该本地标签不替代异机副本或生产回滚验证，也不应假定仍与未来运行版本一致。使用前须重新核对容器版本、数据库兼容性及恢复材料。

2026-11-11 运行镜像副本传输中：生产现行应用镜像通过 SSH 流向维护机 Docker 镜像缓存，尚未确认完成；不要清理或以未完成缓存作为回滚依据。该副本只包含镜像，不包含数据库、配置或持久卷；完成后需核验两端退出码与目标镜像 ID，并另验实际可运行及兼容性。

2026-11-11 globals 合成密码认证：无网络目标 PG18 临时容器的恢复后 SCRAM 正确密码登录及错误密码拒绝已验证，临时容器、工具和 pin 已清理。该实验不覆盖生产身份、真实备份或异常中断，不解除生产采集门禁。

2026-11-11 globals 合成演练：维护机已在无网络临时容器完成合成密码哈希和角色成员的真实 age 流式恢复并清理；此操作不保存生产或合成备份，不验证密码登录、故障清理或真实数据库恢复。生产 globals 采集仍保持禁用。

2026-11-11 globals 合成演练工具：候选允许从固定 `/root/sydney-pg18-drill-tools/usr/bin` 使用临时解包的 age，优先使用系统路径；路径与文件需为 root 所有且组和其他用户不可写，不能用符号链接或硬链接。维护机本轮临时解包 age 1.0.0、完成路径检查后已删除，并未安装软件；完整演练及生产 globals 采集仍未开放，必须先补齐其故障、清理和恢复前置验证。

2026-11-11 回滚基线补查：线上运行应用镜像为 revision `1993995e572fd4235c7684c533db23eb6cf0554e`，现有应用回滚标签指向旧 revision `1494048fbfac551a6401ec059c80fc95f418156e`，不等同当前版本的副本；数据库迁移及密文兼容性未验收。Web `webassets` 卷约 179 MiB，仓库说明其保存近期构建资源、可重建，但丢失可能影响仍打开旧页面的客户端；恢复方案须明确取舍。上述大小与状态为当时只读观察，后续操作前重新核对。

2026-11-11 手机流式回复：待发布的移动端代码在本机无已保存偏好时默认开启流式
回复；已明确关闭的用户继续保持关闭。现有已安装版本可在头像、设置的“高级”中
检查“流式回复”开关；该设置只影响实时文字显示，不调整模型推理耗时。实际发布、
更新接收和真机验证未执行。

2026-11-11 staging 回滚复跑：维护机无已运行的 staging Compose 项目；无网络合成 Caddy 容器演练已复跑并清理，未建立完整业务 staging。现有真实备份仍缺 Caddy 卷及数据库角色权限等材料，不能将演练结果作为生产入口变更或真实恢复的放行依据。

2026-11-11 PC 气泡：设置保存在当前 Web/Electron 浏览器环境的 IndexedDB，清除该环境数据会丢失本地外观，手机和其他设备不会自动同步。当前仅修改源码，未构建安装包或部署；桌面若加载远端 Web，须待该界面部署后才可能看到变更，部署及回滚流程尚未针对本次改动验证。

2026-11-11 IP 签发候选：未部署的 IP issuer 已关闭 TLS-ALPN，预期使用 HTTP-01。测试签发前须在 Caddy 启动环境核对公网 IP 和 staging 目录，验证公网 80 实际挑战响应、已验证备份和回滚；旧域名续期及手机、桌面地址保持现状。普通假 token 的 308 不代表真实挑战结果。按 Let's Encrypt 的 HTTP-01 文档，验证允许有限的 HTTP/HTTPS 重定向，但最终仍须获取正确挑战内容；此处未验证真实挑战及证书。

2026-11-11 备份演练限制：简化 age 合成管道对照已在维护机完成，软件包仅临时解包，没有安装；它不验证 globals 候选或真实备份恢复。Caddy 来源检查的新版本仍待审查，不得据此启用生产卷采集。生产回滚、正式 IP 证书和入口切换仍须完成各自门禁。

2026-11-11 iOS 侧载构建更新门禁（未运行）：工作流中任一 `SYDNEY_OTA_*` 项目、所有者或运行时变量非空时，构建地址必须精确为 `https://pc.zxlup.xin`；其他地址在隔离更新链完成前需将三项均留空，且侧载包在线更新关闭。此门禁只覆盖本仓库该构建工作流，不能证明其他构建、发布、已有安装包或 Expo 环境安全；实际构建及发布尚未验证。

2026-11-11 手机切服与账号删除：工作区内相关客户端修改仍是未经测试的草案，不应部署或用于删除真实账号。切服失败后账户本地清理、Space 恢复及删除失败后的推送恢复仍待完成；实际认证响应、数据保留与设备行为须单独验收。

2026-11-11 PG18 合成演练：维护机通过生产同摘要 PG18 镜像和全新无网络容器完成合成 ACL 恢复；身份 pin 由已配置严格主机密钥校验的同一 SSH 会话取得并在演练后移除，不属于独立物理认证。演练未覆盖真实备份、角色密码或生产恢复；详细结果见验证记录。

2026-11-11 Caddy 守卫生产只读核验：当前候选与守卫依赖的固定摘要在生产本机执行 `--guard-check` 成功；此入口只核验 Docker 身份，不采集卷。临时脚本已清理；生产采集入口仍禁用，不能把守卫通过当成备份恢复完成。

2026-11-11 Caddy 合成演练镜像：已通过 `docker save` / SSH 二进制流 / `docker load` 将生产 Caddy 运行镜像 `sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d` 复制到维护机镜像缓存，源和目标进程退出码均为 0，目标报告相同镜像 ID；不包含生产卷。合成重启和回滚演练尚未执行，本操作未修改生产容器或配置。

2026-11-11 IP 入口准备：现有 IP Caddy 示例不会自动继承部署中特定的 CDN 限制及可信代理规则；生产实际配置需在切换前核对并保留，不能由仓库示例推断线上现状。Compose 示例仅覆盖 Caddy，API 需另行配置候选 `EXTRA_TRUSTED_ORIGINS`，屏幕代理如需分源还需核对 `SCREEN_PROXY_PUBLIC_ORIGIN` 和 `/novnc` 可达性。两项均未部署，真实认证、重建后持久状态和回滚仍待验收。

2026-11-11 恢复说明纠正：`backup-drill.sh` 只检查摘要、解密和归档列表，不执行恢复。现有生产备份脚本排除对象 ACL；新环境中创建非登录 `rakazo_app` 占位角色不能恢复原角色认证、所有权和缺失授权。必须在隔离集群另行验证完整角色、数据库及对象权限，不能据此认定生产可恢复。

2026-11-11 数据库权限恢复限制：已有生产数据库快照采集使用 `pg_dump --no-privileges`，因此不能视为已备份对象 ACL；此前恢复也跳过 owner/privileges。角色全局对象另需加密保存，可能包含密码哈希；只能恢复到全新隔离 PostgreSQL 集群，不能导入维护机现有集群。全局角色与数据库归档分别在线采集时仍不保证一致。

2026-11-11 IP 签发审查补充：普通路径的 308 不足以判断 Caddy 自动处理的 HTTP-01 挑战是否失败，应以真实 staging 订单、挑战与公网结果为准。候选加载前须核对运行配置与下一次启动的 Compose 环境、挂载及证书路径；临时注入给 reload 的变量不会自动持久化到容器，`compose restart` 也不能假定应用了新环境。回滚验收同时覆盖运行态与重启后状态。

2026-11-11 屏幕来源配置复审限制：Web/桌面当前会把屏幕代理地址改回页面来源，且受现有 CSP 约束；配置独立屏幕来源时，须保证页面来源同样代理 `/novnc`，或先实现并验证其他兼容方案。不能仅因 API 返回了新来源就认为所有客户端可用。

2026-11-11 屏幕代理来源候选（未部署）：可选 `SCREEN_PROXY_PUBLIC_ORIGIN` 用于指定返回客户端的屏幕及终端代理 HTTPS 来源；必须是无路径、无尾随斜杠的规范 HTTPS origin，未设置则沿用 `WEB_ORIGIN`。启用前须确认该地址实际提供 `/novnc`、证书可信且所有现有客户端可访问；不要通过不可信请求头推断来源。代码、配置与线上行为尚待独立复审和部署验收。

2026-11-11 旧域名续期 webroot 补查：Certbot 续期使用 webroot，其目录存在但当时挑战子目录不存在，且未在运行容器的 Docker 挂载源内；生产 Caddyfile 未发现显式挑战路径或 file_server。须实证公网挑战转发及续期后证书同步、重载，不可仅凭 certbot.timer 启用认定续期可用；本次未修改线上文件或触发续期。

2026-11-11 续期链路复核：certbot.timer 处于 active/enabled，但已有 deploy hook 仅检查到 nginx 引用而无 Caddy 引用，nginx 当时 inactive；不应把定时器运行视为 Caddy 证书已自动更新。未触发实际续期、修改 hook 或重启服务。

2026-11-11 IP 证书切换剩余准备及验收顺序：

1. **Caddy 卷采集**：现有采集工具拒绝可写祖先目录；不得仅因观察到 root 所有而放宽检查，也不要修改正在运行的卷权限。先审查限定根目录、固定输入身份、目录替换与并发写入处理方案，使用合成目录和专用密钥验证后，再采集两个实际卷；加密复制到维护机、核对摘要，并隔离恢复检查证书链、权限及必要文件。卷可能在线变化，需记录一致性限制。
2. **恢复范围**：逐项核对数据库角色与授权、应用加密密钥、部署配置、卷及其他外部依赖；已有数据库、应用文件和核心配置是分时采集，不能当成跨源一致快照。独立恢复及应用启动、解密和登录未通过前，不称完整恢复。
3. **Caddy 回滚**：先确认运行镜像、持久配置和证书文件；准备受限的运行时配置快照、候选配置与明确回滚步骤，在隔离环境通过验证。此前合成容器回滚不代表生产回滚已经演练。
4. **申请与续期**：确认公网挑战能到达实际 Caddy、旧域名仍可服务；先用 ACME 测试环境完成 IP 验证并检查证书 SAN，再申请正式证书，并验证自动续期、部署和失败告警。旧域名证书续期到 Caddy 的链路也须单独核实。
5. **切换与验收**：保留旧入口，依次核对 IP TLS、认证来源和会话、聊天流、附件、屏幕与接管，再验证手机和桌面客户端及回滚。未通过的环节保持未完成，不以证书签发代替业务验收。

2026-11-11 核心配置恢复演练补充：维护机在受限 tmpfs 临时目录恢复四个核心配置，验证文件内容摘要和归档中的权限元数据后清理；未将配置部署或启动服务，不能视为完整系统恢复。

2026-11-11 核心配置备份（部分范围）：生产暂存目录及维护机对应批次各有 `config-core.age`，含四个明确选择的环境、Compose 和代理配置文件；两端摘要一致，维护机可解密并列出四个条目。加密工具仅临时解包运行，未安装为系统软件。生产 Caddy 两个卷存在 1777 粘滞目录，当前工具拒绝该路径，卷尚未备份；配置恢复、密钥可用性和完整恢复均未验证，不能据此进行入口切换。

2026-11-11 部分快照隔离恢复：维护机无网络临时 PostgreSQL 中，先创建演练专用 `rakazo_app` 后，部分快照的数据库恢复成功；文件归档也已在受限临时目录提取。首次未创建角色导致恢复失败；演练跳过 owner 和 privileges，未验证应用密钥、完整角色权限和业务数据。提取与临时容器已清理；生产配置、服务和数据库未修改。

2026-11-11 生产加密快照（部分范围）：使用受限 staging 文件系统创建 `pre-ip-20261111T054938Z`，数据库自定义归档及 API `/data` 已 age 加密，并复制到第二台维护主机 `/var/backups/sydney-ip-migration/pre-ip-20261111T054938Z`；两端密文校验和通过，维护机持有的身份可解密并列出数据库和文件归档。采集时服务在线，数据库与文件不保证同一时点；该批次不含配置、应用密钥、Caddy 卷、角色或其他卷，不能作为完整系统恢复点。未实际恢复数据库或文件，未切换生产入口。

2026-11-11 生产备份暂存容量：已在生产主机创建预分配 512 MiB 的镜像 `/var/lib/sydney-backup/ip-staging.ext4`，挂载到 `/var/backups/sydney-ip-staging`，ext4，选项 `nodev,nosuid,noexec`，挂载点 root 权限 700；`df` 显示可用约 452 MiB。该容量有文件系统边界但底层仍在生产根盘，不是异地备份；本次没有添加开机自动挂载，也尚未写入生产备份。服务未重启。故障或重启后须核对镜像和挂载状态，不能误向未挂载目录写入。

2026-11-11 备份恢复身份副本：已在本机当前 Windows 用户目录 `.codex/recovery-keys` 创建 `sydney-ip-migration.agekey.dpapi`，使用 Windows 当前用户 DPAPI 加密，并限制目录为当前用户及 SYSTEM；创建后本机解密比对成功。该副本依赖当前 Windows 用户的 DPAPI 凭据，不能假定迁移到其他账户或电脑后可解密；它与维护机的 root 限权原件分别位于不同机器，但尚无脱离这两台机器的恢复副本。未输出私钥。

2026-11-11 备份密钥准备：在第二台授权维护主机创建 root 专属目录 `/var/lib/sydney-backup-keys` 和独立 age 恢复身份 `ip-migration.agekey`，对应收件人保存在同目录 `ip-migration.pub`，文件权限 600；临时下载的工具已清理，未安装系统软件，密钥内容未输出。当前仅确认该主机上的单份密钥，尚无已验证的独立离线副本或真实生产备份；丢失密钥将无法解密以其加密的备份。

2026-11-11 备份候选清理：收件人临时目录清理失败时现会报告失败且不创建捕获完成标记；强制终止或断电仍可能留下该目录，需核验目录归属后按运维策略处理。完整模拟回归未完成，真实备份和恢复未验证，当前候选仍未用于生产。

2026-11-11 合成恢复实验：在维护机使用受限临时测试环境和 PostgreSQL 镜像完成合成数据库及文件加密恢复；未备份生产。实验发现脚本可能消耗调用方标准输入，正在修复；真实生产数据、配置密钥、独立副本及恢复验收仍未完成。

2026-11-11 隔离测试准备：已通过 SSH 流将生产正在使用的 PostgreSQL 镜像导入第二台维护主机 Docker 镜像缓存，用于合成数据恢复测试；传输的是镜像，不包含数据库卷。该操作新增测试主机镜像缓存，未创建生产数据库备份；实际隔离测试及清理尚待执行。

2026-11-11 备份工具环境不兼容：生产 Docker 使用 systemd socket activation，当前候选备份脚本的 socket 对端检查不接受该布局，尚不可在生产执行。隔离测试因外部镜像下载超时未完成；正在尝试传输现有 PostgreSQL 镜像，镜像本身不包含生产数据库卷数据。

2026-11-11 原域名证书续期核查：`certbot.timer` 已启用，但发现的 deploy hook 针对旧 nginx 服务，该服务当时 inactive；Caddy 使用持久卷内的证书文件。只读比较显示当前 Certbot lineage 证书与 Caddy 卷内证书指纹一致、有效期至 2027-02-03；尚未发现或验证续期后向 Caddy 卷同步及重载的完整链路，不能认定自动续期已生效。本次没有触发续期或修改 hook。

2026-11-11 staging IP 订单：CA 接受测试订单，但未配置 HTTP-01 或 TLS-ALPN-01 挑战，未生成证书、修改生产配置或切换流量。临时账户密钥已丢弃；后续申请应通过可持久续期的受控工具重新建立账户并验证续期，不复用本测试订单。

2026-11-11 附加认证来源候选（未部署）：`EXTRA_TRUSTED_ORIGINS` 为逗号分隔的精确 HTTPS 来源，新增配置进入 API 来源检查及 Better Auth；只应配置受控来源。生产 Compose 接收该变量，但尚未修改生产环境；现有规范地址、重置邮件、OAuth 和 Passkey 行为不会因此自动切换，实际登录及回滚待验收。

2026-11-11 加密备份候选：新增手动备份脚本与模拟测试，但独立审核指出磁盘容量、数据源身份、Docker 环境及恢复证明等缺口；正在修复，禁止将该草案当作可恢复生产备份或运行于生产。旧备份未被删除，本轮未产生新生产备份。

2026-11-11 旧备份目录可读性检查：数据库归档目录和应用数据归档可列出，不等于恢复成功；当前 Caddy 镜像有同摘要回滚标签，应用镜像的历史回滚仍需单独核对。旧归档日期和数据范围不满足本次新鲜备份要求。

2026-11-11 IP 入口续查：生产现有备份文件日期为 11 月 7 日；不能作为本次变更前新鲜备份或恢复证明。服务器存在 `rakazo-rollback` 镜像摘要标签，尚须比对运行镜像、数据库兼容性及演练，不能视为回滚已就绪。第二台已授权维护主机可用且有磁盘空间，但尚未建立加密异地副本或进行恢复演练；本次未创建备份或变更线上配置。

2026-11-11 IP 证书申请预检：用户已授权申请；当前 HTTP-01 路径跳转至握手失败的 IP HTTPS，Certbot 2.9.0 的 IP 短期证书支持未验证，生产 Caddy 占用 80/443。现有生产恢复能力尚未验收，未改配置、写入挑战文件、申请订单或生成证书。准备挑战方案时需保留域名链路并验证备份与回滚。

2026-11-11 无 SNI 实验：`infra/compose/test-ip-certificate-selection.sh` 在服务器以无网络临时容器和合成证书测试；默认无 SNI 时未提取到证书 SAN 且收到 TLS alert，指定测试 IP `default_sni` 后获得 IP 证书和合成站点 HTTP 200。已将该选项加入未部署草案；公网 NAT、未知 SNI、安全策略及真实 CA 仍需独立验证。

2026-11-11 现有域名证书只读核验：生产 Caddy 的 `/data` 为持久 Docker 卷，当前域名证书及私钥路径在该容器内可读；证书 SAN 仅包含现有域名，不包含 IP。文件可读不证明证书续期、重载或备份恢复成功；未读取或输出私钥内容。

2026-11-11 IP 接线草案：`infra/compose/docker-compose.ip.example.yml` 仅供与基础 Compose 合并审查，不能单独启动；新增变量均须明确设置，证书和密钥路径指容器内已有文件，示例不会复制或挂载它们。路径必须以目标运行容器的实际卷和证书续期方式核验；文件未部署，签发、无 SNI、服务回滚及数据恢复尚未验收。

2026-11-11 IP HTTPS 草案：`infra/compose/Caddyfile.ip.example` 未部署；生产当前使用域名证书文件，Caddy 数据为持久卷。服务器侧探测中标准备份目录不存在、备份定时器未激活，`age` 和宿主机 `pg_restore` 不可用；不能据此排除其他备份。草案的地址、证书路径、CA 目录、日志及无 SNI 行为均需在隔离环境验证，不能直接覆盖生产配置；尚无恢复演练结果。

2026-11-11 无域名直连核查：仅对生产容器映射和现有网络做只读检查，未修改服务或证书。公网 IP 的 HTTPS 握手目前失败；Tailscale IP 的 HTTP 重定向及 HTTPS 握手同样未形成可用入口。新入口必须在备份恢复与回滚可验证、证书签发和续期可用后再实施；手机是否加入私有网络尚未确认。现有域名入口继续作为回滚，当前客户端配置未变。

2026-11-11 生产备份和回滚核查：仅发现 11 月 7 日数据库和应用数据备份文件，覆盖范围、完整性和可恢复性未验证；标准备份目录不可见或无权访问，未发现备份定时器，并不排除其他位置或机制。未找到 `rakazo-rollback` 镜像标签，也不排除其他回滚方式。任何生产变更前须核实当前数据库及应用数据的新鲜备份、必要密钥和异地副本，在隔离环境验证恢复，并确认可用回滚镜像、数据库迁移兼容性及操作步骤；本次未执行这些操作。

2026-11-11 Windows 安装器：当前配置仍使用上游应用标识，直接制作并安装可能影响同身份应用的安装或卸载记录；不应将现有目录包当作独立安装器。独立身份、旧数据迁移、允许选择 D 盘路径以及安装与回滚方案均待实现和验证；目前未安装。

安装路径与应用数据路径是不同概念：选择 D 盘安装不自动改变 Electron `userData` 目录。独立 YAML 直接继承现有 `package.json` 的 `build` 字段不可按当前 builder 加载方式假定可行；上游发布源及包内更新元数据也需审查。尚未生成独立配置、安装器或迁移用户数据。

2026-11-11 Windows 本机目录包：用户已明确允许本次 D 盘定向构建与测试。Web、桌面构建及 Windows x64 非发布目录包已成功，启动文件为 `D:\33054\Sydney-personal-agent\apps\desktop\out\win-unpacked\Sydney.exe`，必须保留整个 `win-unpacked` 目录及资源，不能只复制 EXE。尚未生成或安装安装器，应用标识仍沿用既有上游配置，签名状态为 `NotSigned`。五项模拟连接及更新保护测试通过，扩展设置测试按用户要求中断；后续不自动继续测试。真实后台与项目工作区未验收，不把可启动目录包描述为全部功能可用。

2026-11-11 线上架构复核：两台维护主机均可连接；当前生产 Web、API、Worker 和 PostgreSQL 在云电脑上的 `rakazo-prod` Compose 容器运行并显示 healthy，公网健康检查为 200；旧双机 systemd 服务未运行，不应依据旧服务名直接重启。生产数据库尚无 `project_workspaces` 表，本次仅只读检查，未变更服务或数据库；后续部署前需重新核对实时容器、备份、迁移顺序及回滚。

2026-11-11 桌面工作区授权存储（未接入）：草案将目录路径保存在桌面应用用户数据目录的 `workspace-grants/<服务器与账号设备范围哈希>/<随机标识>.json`，路径属于敏感本地数据；摘要不包含目录路径。当前授权仅在创建它的进程内有效，重启后需要重新选择目录；删除失败可能仍在磁盘留下敏感记录。尚无系统目录选择或文件访问入口，Windows ACL、父目录链接和多进程安全未验收：其他实例撤销失败不能阻断原实例，文件被删除后若以原内容重建也可能再次被原实例接受。在具备可靠撤销与安全文件访问保障前不得启用。未改变现有应用运行或部署流程。

2026-11-10 D 盘 Electron 开发依赖：Electron 45 二进制已恢复到本仓库 `node_modules\.pnpm\electron@45.0.0\node_modules\electron\dist`，下载缓存及安装临时目录位于仓库 `.codex-cli-runs\electron-cache` 和 `.codex-cli-runs\electron-temp`，均在 D 盘。安装使用现有 Node 24.15.0；默认 Node 22.22.0 不满足仓库最低版本。缓存清理被执行策略拒绝，下载副本仍可能占用空间；未安装 Sydney 桌面程序，构建与实际启动仍待验收。重新安装或更换依赖可能覆盖该恢复结果。

2026-11-10 工作区删除前保护（未部署）：新代码会在 Space 或账号删除前查询 `project_workspaces` 并验证 `app_rls_bypass()`；必须先应用对应迁移，再启动新代码，否则删除请求因缺表失败。运行时 bypass 未正确配置时同样拒绝删除；应在授权环境核验运行角色、密钥及请求错误。工作区创建、并发删除门禁和完整清理尚未开放，旧 claim 与工作区共存需人工核查在途操作，不可直接解锁。

2026-11-10 PC 非发布构建连接门禁（待验证）：候选工作流将在上传目录包之前，用本地模拟服务验证打包客户端连接成功及不可达、地址无效、健康响应错误的处理。测试使用临时用户数据，未连接生产后台；审核发现 Electron 的宿主电脑服务仍可能监听所有网络接口，默认未获授权并使用随机令牌，运行环境需隔离，不能描述为只监听回环。工作流和测试尚未在 Windows runner 执行，失败时不应上传该轮产物；强制终止可能留下测试临时文件。

2026-11-10 项目工作区元数据（ADR-0022，未部署）：新增迁移仅建立用户私有的空元数据表，工作区功能未开放。上线前需验证非表所有者运行角色、RLS bypass 密钥和延迟迁移；现有成员、Space、账号删除尚未接入工作区清理，有工作区数据时外键会阻止删除，且外部清理可能已发生，因此不得提前启用工作区创建。迁移和回滚、备份及数据库隔离尚未在服务器实测。

2026-11-10 PC 非发布构建（待验证）：新增 `.github/workflows/desktop-windows-build.yml`，计划手动选择仓库中的提交，在 Windows runner 生成目录包并作为短期 Actions 产物保存，同时记录源码提交、构建运行编号、目录内文件 SHA-256 和顶层可执行文件签名状态；上传包含应用所需的隐藏环境模板。构建流程计划对打包客户端进行更新关闭检查，但尚未运行。它不发布 Release 或生成安装器，且无法包含工作区中未提交的修改；工作流尚未推送或运行，触发方式、产物及校验流程均待验证。不得使用现有正式发布工作流替代该验证。目录包继续使用上游应用标识，安装或启动前需先核对与现有应用及数据的隔离。

2026-11-10 PC 桌面更新边界（ADR-0021）：含本次修改的新构建默认关闭桌面自动及手动更新，界面通过现有状态提示不可用；现有打包配置仍包含上游更新源，不能用于证明 Sydney 发布可信。此修改不会改变已经安装的旧包；构建、安装和实际网络验证尚未执行。重新启用前须配置并验证用户控制的更新源及发布者身份。

2026-11-10（PA-021 手机安装包）：提交 `72c4211fc` 的云构建 `42770297627` 成功，未签名 IPA 已下载至 `D:\s\Sydney-42770297627.ipa`，SHA-256 与构建产物清单一致；包内标识为 `xin.zxlup.sydney`，资源路径最长 122 字符。iPhone 已被 Windows 识别；按用户最新要求仅准备安装包，未签名、未安装或启动。本包因未配置独立 Expo 项目而关闭在线更新。

## iPhone 侧载在线更新（待配置 Expo 项目及实机验证）

关联 PA-021、ADR-0020。2026-11-18 已将侧载 OTA 构建门禁与发布工作流统一切换至生产 IP（`https://124.221.182.39`）与 `xin.zxlup.sydney`，并补齐发布工作流的 `EXPO_PUBLIC_SYDNEY_SIDELOAD=1` 及 IPA 内 `Expo.plist` 自动核验。现有已安装的旧侧载 IPA 在线更新处于关闭状态，首次启用仍需配置 Expo 项目参数后重新构建、签名和安装底座 IPA：

1. 准备用户控制的免费 Expo 账号和独立项目 `sydney-sideload`，获取项目 UUID（`Project ID`）与账号名（`Owner`）；不要使用仓库原有上游 Expo 项目。
2. 在 GitHub 仓库 Settings → Secrets and variables → Actions 中：
   - 配置 3 个 **Repository variables**：`SYDNEY_OTA_PROJECT_ID`（UUID）、`SYDNEY_OTA_OWNER`（Expo 账号名）、`SYDNEY_OTA_RUNTIME_VERSION`（如 `sydney-ios-ip-1`），三者必须同时存在；
   - 配置 1 个 **Repository secret**：`EXPO_TOKEN`（Expo 个人访问令牌，切勿发到聊天或写进代码/文档）。
3. 通过侧载构建工作流（`mobile-ios-sideload.yml`）生成新的底座 IPA：构建步骤会自动校验 `Payload/Sydney.app/Expo.plist` 中 `EXUpdatesEnabled=True`、`EXUpdatesURL` 与 `EXUpdatesRuntimeVersion`；随后用 iPASide 签名安装并验证登录、聊天和设置内“检查更新”。
4. 仅当改动纯属 JS/TS、界面或普通静态资源且与已安装底座包的原生运行时兼容时，在 `main` 或 `cursor/integrate-remote-branches-7334` 分支手动运行 `Publish iOS sideload update`（`mobile-ios-update.yml`），输入与安装包一致的 `runtime_version` 及更新说明。工作流的版本确认不是自动原生兼容性检查，发布前仍需审查依赖、Expo SDK、原生配置和插件差异。
5. 在设备上验证启动/回前台自动下载或设置页手动“检查更新”、重启生效、离线失败与回滚。版本未按预期生效时停止继续发布，检查项目、通道、环境和运行时；不要将凭据或用户数据写入日志。

更改原生依赖或原生配置后需变更运行时版本并重新构建安装；OTA 不能替代侧载证书续期。更新服务额度、回滚与数据保留以实际验证为准。

2026-11-10（PA-021 修复后 iPhone 产物）：云运行 `42742221127` 的未签名 IPA 已校验并复制至 `D:\s\Sydney-fixed-42742221127.ipa`。在 iPASide 中选择该新文件进行签名和安装；无需删除旧包或旧应用。包内路径已缩短，但签名、安装及数据保留尚未在设备上验证。主分支部署 `42744299220` 已成功，具体检查见验证记录。

2026-11-09（PA-021 最新 iPhone 产物）：含头像设置分层的未签名 IPA 在 `artifacts/ios/42634529547/Sydney-unsigned.ipa`；云运行 `42634529547` 成功，文件 SHA-256 已与云端清单核对。安装包未签名，不能直接安装；免费签名、安装、升级与数据保留尚未验证。候选操作见 [iPhone 免费侧载操作指南](design/IOS_SIDELOAD_GUIDE.md)。

2026-11-09（PA-021 云构建产物）：运行 `42631137377` 成功构建设备架构未签名 IPA，已下载到本机忽略目录 `artifacts/ios/42631137377/Sydney-unsigned.ipa`，SHA-256 与同次产物清单一致。该包含右上角新建入口调整，不含之后的头像设置分层；未签名 IPA 不能直接安装，Windows 侧签名工具、普通 Apple 账号、iPhone 安装及续签均未验证。仓库忽略该目录，不把安装包纳入版本控制。

2026-11-09（PA-021 首次云构建）：运行 `42624234704` 的依赖与工程生成成功，检查发现生成文件保留 `aps-environment`，构建在签名权限检查处停止。侧载工作流已增加仅对生成主应用移除该项的步骤，后续仍检查关联域名和其他禁用权限；修复尚待复跑，不改变正常发行构建。没有 IPA 或已验证安装步骤。

2026-11-09（PA-021 免费原生侧载准备）：新增 `.github/workflows/mobile-ios-sideload.yml`，计划用 GitHub macOS runner 生成无签名设备架构 IPA。用户已授权提交和推送，本次工作流变更推送至当前分支时触发一次构建，也支持手动触发；输入为 HTTPS 服务 origin 和独立 iOS bundle ID。输出仅供后续用户自行签名，不能直接安装。侧载模式关闭上游 OTA、远程推送、Passkey 关联域名和 Widget/App Intents，首次安装及更新依赖用户侧签名工具和有效免费 Apple 账号；预期七天需刷新，但完整流程、数据保留和部署未验证。工作流准备推送、尚未运行，不记录账号密码；具体安装步骤以完成实机验证后为准。

2026-11-09（PA-021 iOS 预览构建准备）：`apps/mobile/app.config.ts` 在 `EAS_BUILD_PROFILE=preview` 时要求 `EXPO_PUBLIC_API_URL` 为有效 HTTPS URL 且非回环地址；未配置会报错。需在用户自己的 EAS preview 环境配置手机可访问的服务地址，不能使用上游项目配置；地址有效不保证可连接。本地解析时内置 profile 变量可能不可用，云端是否触发检查、实际取值及安装均待验证。没有更改线上服务或账号。

2026-11-09 外观遗漏补齐：本轮沿用浏览器 IndexedDB 保存全局和独立对话背景及统一组件不透明度，已有群成员变更继续通过现有 `groups.update` 保存，不新增环境变量、迁移、权限或服务。PR #8 合并版本 `1494048fbfac551a6401ec059c80fc95f418156e` 通过既有生产流程 `42613921092` 自动部署成功；北京时间 20:11 公网 `/health` 为 200，`/build-id` 更新为 `20261109120539`，线上共享样式、背景入口和群成员更新代码已核对。实际上传、切换、刷新、恢复全局及已有群加 Bot 在 CI 的手机宽度与电脑宽度回归中通过，真实手机与用户账户复测仍待完成。旧页面需重新打开以加载新版本，勿通过清除站点数据刷新版本，以免丢失本地背景；本次未演练人工回滚。

2026-11-09 PR #7 发布完成：合并版本 `343efad7a5008b5a2e3496af969888ba4a509bf4` 已通过既有 `main` 推送触发的生产流程 `42608790848` 自动部署，`deploy-production` 成功。北京时间 19:31 公网 `/health` 返回 200 和 `{"ok":true}`，`/build-id` 为 `20261109112537`，首页加载的新 CSS 已包含设置导航与组件不透明度规则。本次未手动改变服务、权限、生产配置或数据路径；回滚继续沿用已有固定 revision 部署入口，本次没有演练回滚。手机实机验收仍待进行，以下本轮相关待部署描述为发布前记录。

2026-11-09 原生电脑接管故障：宿主机旧驱动与应用新人工控制协议不兼容；已备份旧文件、同步仓库驱动并重启，服务 active，但数据库中的电脑引用仍为重启前 generation。重启前活动任务检查失败仍继续执行，事后检查无活动 Run、有效执行租约及人工接管；不能据此认定重启前无任务。当前接管未恢复，禁止直接修改数据库或未经确认执行可能丢失未保存工作的恢复流程；需先设计安全代次协调，核实驱动及工作区后验证真实桌面。详见 V-060。

2026-11-09：Web 在“聊天外观”中设置全局背景；打开单聊或群聊设置后，可为当前对话选择或上传背景，也可恢复“跟随全局背景”。独立选择及其图片仍保存在当前浏览器的 `sydney-chat-appearance` IndexedDB；清除站点数据会丢失，不跨设备同步。删除素材会同时清除引用它的对话设置。原生移动端未修改，部署和真实手机验收待完成。

同日补充：聊天外观的“组件不透明度”统一调整手机端新建小伙伴、连接应用、搜索及设置等共用玻璃组件，不影响对话列表和输入框；数值与其他外观设置一起保存在当前浏览器，预览可取消，保存后保留。

2026-11-09 PR #6：注册密码和手机深色主题已随合并版本 `6ded1a62ecce62a0df88b9b2771f166dd0695b37` 自动部署；公网健康检查正常，构建标识 `20261109023224`。真实邮箱注册、密码重登及手机实机仍待验收。下方相关条目的未部署状态为发布前记录。

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

以下旧 Web 画面桥及其更新名单为 2026-11-07 的草案。当前 API 画面桥配置见 [退役运维](#删除退役-web2026-11-20)。

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

## 原生云电脑人工接管输入（部署待验证）

2026-11-09：VNC/noVNC 仍保持服务端 `-viewonly`，人工点击、滚轮、键盘和文本不再尝试通过 VNC 输入。Web 全屏接管覆盖层把浏览器坐标映射到画布几何，经认证 `computer.input` RPC 发到 API；API 在事务中锁定 `computers` 并复核人工租约、Bot、providerRef、状态和 `controlFence`，再由 native-linux Adapter 使用 `control_input` 向驱动发送单条短期票据。退出接管使用 `control_revoke`，旧租约和旧输入票据会被拒绝。结果未知时不会自动重放，界面显示中文错误并要求重新接管。

部署顺序：先核对生产 Python 驱动实际路径（历史记录为 `/opt/sydney-native/driver.py`，仓库服务模板另使用 `/opt/sydney/infra/native-linux/driver.py`，两者不能直接假定相同）；保留驱动 socket 属主、`0600` 权限、`SO_PEERCRED` UID 校验和服务账号，不开放公网 VNC/noVNC 或驱动端口；发布新版 API、Worker、Web；把新版 `infra/native-linux/driver.py` 同步到实际路径后重启驱动 systemd 服务；确认 `sydney-screen-vnc.service` 仍带 `-viewonly`。`controlFence`、`controlLeaseId` 等字段已在初始迁移中，本次不需要新增数据库迁移，也不修改生产 `.env`。

回滚需同时回滚应用三件套和 Python 驱动；若只回滚应用，旧驱动会因为没有 `control_input` 而拒绝新输入，反之只部署驱动但未部署应用时不会改变现有行为。驱动重启会换 generation，部署前必须确认没有活动 Run 或人工接管，旧票据不得跨重启复用。

验收顺序：打开真实桌面 → 接管 → 点击已知控件 → 输入中文/英文 → 滚轮 → 退出 → 确认旧租约输入被拒绝 → 再次接管 → 释放后让 Agent 继续执行 → 模拟断线并确认中文错误且不自动重试 → 检查手机 Web 窄屏及横竖屏。以上实机步骤尚未执行，不能据本地测试宣称线上修复完成。

2026-11-10 本地补充手机原生 App 输入：画面仍为只读 VNC，单击、长按右键、滑动滚动和原生键盘通过带租约的 `computer/input` 发送；文本使用现有剪贴板输入接口，拖拽和多点手势暂不支持。需先确认线上 API、屏幕代理和驱动已部署上述人工接管协议，再构建、签名并安装含本次修改的手机包；现有安装包不会自动获得本修复。实际部署状态、新包、手机触控、键盘及租约释放均未验证。回滚手机端使用此前可用版本，服务器组件回滚仍遵循本节上述三件套及驱动要求。

## X MCP 接入调查

2026-11-10：X 官方 API MCP 的用户身份接入依赖开发者应用与 `xurl mcp` 桥接，不能保证现有远程 MCP 的自动 OAuth 流程兼容；应用身份 Bearer 路径只适用于部分不需要用户身份的读取能力。具体要求以 [X 官方文档](https://docs.x.com/tools/mcp)和 [API 计费页面](https://docs.x.com/x-api/getting-started/pricing)为准。本仓库 stdio MCP 受管理员身份、启用开关和允许命令约束；当前服务端策略及桥接尚未验证，不调整权限、不安装依赖、不保存真实凭据。X API 调用可能产生费用，不能宣称该方案完全免费。
# 2026-11-12 工作区恢复优化复测

维护机 `sydney-workspace-large-retest-20261112.service` 合成大容量恢复复测的日志显示正常结束，测试目录、同前缀 loop 和 dm 映射未见残留，`/run/sydney-workspace-large-retest-20261112` 代码及缓存经清单和摘要核对后清理。小规模合成测试及其代码清理也已完成；重归档时约 588 MiB 空余是一次采样，非真实多文件工作区的容量保证。生产工作区采集仍禁用。

# 2026-11-12 一致恢复点运维门禁

生产运行服务存在多个可写数据卷及数据库网络客户端；只读观察不构成停写。
恢复点和真实回滚的待验收条件见 `design/RECOVERY_CONSISTENCY_GATE.md`。
该文件尚非经过验证的执行手册；工作区、globals 和 Caddy 真实采集仍受各自
安全门禁限制，不能通过替代入口绕过。

# 2026-11-12 原生运行配置副本

生产密文位于 `/var/backups/sydney-ip-staging/native-runtime-20261112/runtime-config.age`，
维护机副本位于 `/var/backups/sydney-ip-migration/image-recv-20261111/native-runtime-config-20261112.age`；
两端 SHA-256 为 `6aaf99faf9291db5f755fe641ee863fa3c1dd43bb7999d31f080fd6bda8df6c0`。
恢复身份保存在既有受限密钥位置，使用前须重新核对暂存挂载、密文和身份。
仅恢复并核对五个 unit/drop-in，不代表包含本地代理配置、其余依赖或可重启
云电脑；不覆盖 ACL/xattr，避免将此副本作为完整恢复或回滚依据。

# 2026-11-12 原生代理配置副本

生产密文为 `/var/backups/sydney-ip-staging/native-proxy-config-20261112/proxy-config.age`，
维护机副本为 `/var/backups/sydney-ip-migration/image-recv-20261111/native-proxy-config-20261112.age`；
两端 SHA-256 为 `cd58d91b295d5e77054c7bba91bc763a04bea80ddf3e512c0112dab0fe4c3be5`。
配置含潜在敏感信息，仅以现有受限恢复身份在隔离环境处理；目标组身份及服务
依赖需另行核对。代理工作目录、二进制、恢复后启动和跨源一致性仍未验证。

# 2026-11-12 globals 来源守卫

`infra/compose/globals-source-identity.py` 是内部候选，直接运行拒绝；只读生产
来源检查不产生备份。其身份复核不能替代采集过程的监督、失败清理、真实恢复
或一致性控制；不得将其作为绕过现有 globals 采集硬阻断的入口。

# 2026-11-12 globals 合成采集控制器

`infra/compose/globals-capture-controller.py` 仅供合成验证，直接运行拒绝；
调用方必须提供受信工具、独立容量和生命周期监督。容器内 timeout 不能单独
证明异常强杀后所有后代已退出，密文发布也不能证明数据库与其他来源一致。
生产 globals 入口保持硬阻断，不得用候选绕过。

# 2026-11-12 globals 合成暂存监督

`infra/compose/globals-stage-supervisor.py` 复用工作区暂存守卫，直接运行拒绝；
调用方仍须提供可信工具及外部生命周期监督。维护机仅验证合成独立 ext4 和
合成数据库，空间检查不预留容量；强杀、真实采集及恢复尚未验证。

# 2026-11-12 globals 强杀残留

维护机发布前单一强杀演练显示正式文件未出现，但临时密文仍存在；清理前须
确认所属单元已停止及文件身份。此不是可执行生产清理规程，也不证明所有强杀
时点、主机崩溃或容器内子进程均安全，生产 globals 采集仍禁用。

# 2026-11-12 globals 阻塞子进程演练

合成加密器替身阻塞时强杀控制器，已跟踪的主进程和替身进程退出；临时文件
仍需核对清理。该次未运行真实 age，也不证明容器内后代或所有故障时点已处理；
生产 globals 采集继续禁用。

# 2026-11-12 globals 容器内生产者超时

合成演练中强杀控制器及其 Docker 客户端后，容器内 sleep 暂时继续运行，随后
由容器内 timeout 停止；真实 age 等待输入进程退出，临时密文需核对清理。
该结果不证明 pg_dumpall 等实际后代的全部故障均可清理，生产采集仍禁用。

# 2026-11-12 globals 来源复核补充

内部来源守卫增加查询后的容器和卷复核；维护机合成验证及生产只读检查通过。
检查结果只反映执行时点，不能取代冻结写入或生产恢复验证，现有采集入口仍禁用。

# 2026-11-12 Caddy 清单候选

`infra/compose/caddy-manifest-candidate.py` 只供合成内部调用，直接运行拒绝。
生成清单及复核不构成原子快照，也未核验生产挂载、加密、恢复和故障清理；
不得以该组件绕过 Caddy 卷生产采集硬阻断。

# 2026-11-12 较新在线部分快照

生产快照位于 `/var/backups/sydney-ip-staging/partial-online-20261112`，
维护机副本位于 `/var/backups/sydney-ip-migration/image-recv-20261111/partial-online-20261112`；
前者含 `CAPTURE_FINISHED`，后者含 `RECEIVE_FINISHED`。具体密文摘要与
隔离恢复结果见验证记录。两处挂载未设置自动挂载，使用前须重新核对
后备文件、挂载和清单。该在线批次只覆盖数据库和 appdata，真实角色、
工作区、Caddy 与跨源一致性仍缺，不得用于声称完整恢复或直接执行回滚。

`infra/compose/restore-acl-audit.py --recent-online` 为固定摘要的本次隔离
演练模式，会创建并写入其自建临时数据库，不是生产恢复命令；依赖受信
Docker、固定镜像及隔离条件。演练使用占位角色和合成会话。

# 2026-11-12 恢复驱动隔离演练

`infra/compose/restore-native-driver-isolated.py` 曾用固定密文恢复源码，在
维护机受限瞬时单元内以合成工作区验证对端身份和驱动重启代次变化。该脚本
依赖受信启动器提供宿主网络命名空间标识及 systemd 进程、网络和资源隔离，
不是生产启动或回滚命令；不验证真实任务停止、桌面或数据库代次协调。

# 2026-11-12 原生驱动重启边界

生产磁盘驱动源码时点检查含随机 generation 初始化，且既往重启曾造成
数据库旧引用失配。路径出现在运行参数不证明当前进程加载了同一版本；
驱动重启前仍须验证旧任务与外部操作状态、制定代次协调和恢复步骤。
本次没有完成代次协调或实际重启验证。

# 2026-11-12 原生代理隔离启动结果

`infra/compose/restore-native-proxy-isolated.py` 针对本次三份固定密文，
曾在维护机受限瞬时单元中验证配置与私有网络回环监听。启动器必须提供从
受信宿主读取的 PID 1 网络命名空间标识，并配置私有网络、无新特权、能力
及资源限制；脚本本身不足以建立完整隔离，不是生产启动或恢复命令。临时
配置关闭 TUN、DNS 和外部下载，不代表原配置、流量或生产路由已恢复。

# 2026-11-12 原生代理二进制副本

生产密文为 `/var/backups/sydney-ip-staging/native-proxy-binary-20261112/binary.age`，
维护机副本为 `/var/backups/sydney-ip-migration/image-recv-20261111/native-proxy-binary-20261112.age`；
密文 SHA-256 为 `bc43a70746673dbf476863d9619c8f670bd56234223c58f1e491f5b8e0b80026`。
已在维护机 tmpfs 解密恢复并核对文件摘要与数字权限，未执行二进制或恢复
服务、配置、账号和路由。两处暂存未设置自动挂载，使用前重新核对挂载、
后备文件和密文；单文件副本不能作为完整恢复或回滚的依据。

# 2026-11-12 原生代理提供方文件副本

生产密文为 `/var/backups/sydney-ip-staging/native-provider-20261112/provider.age`，
维护机副本为 `/var/backups/sydney-ip-migration/image-recv-20261111/native-provider-20261112.age`；
两端 SHA-256 均为 `ca4c24f595b31ddd4c4fc88a70f80cf056c1ebf271b4d6efea9ccedae7b03976`。
已用既有恢复身份在维护机隔离 tmpfs 恢复并核对内容和数字权限；文件可能
包含敏感订阅数据，仅在受限环境解密。备份为在线单文件，不含缓存或目录
元数据，也未验证账号映射、服务启动、跨源一致性或完整回滚。两处文件系统
未设置自动挂载，使用前须重新核对挂载、后备文件、收件人和密文。

# 2026-11-12 原生代理提供方文件

运行配置只读解析显示一个 HTTP 代理提供方，其本地数据文件位于代理目录且
与此前发现的配置类文件身份匹配。文件可能包含敏感订阅数据，不输出其内容
或地址；采集前需确认受信目录和文件身份、并发更新、加密接收方及容量。
重新下载和离线启动行为未验证，不可将单独启动配置作为完整代理恢复。
时点检查显示文件及部分祖先可由服务账号控制。现有配置备份工具的额外
可信 UID 选项要求完全信任该账号；不得把模式位检查当作并发写入或路径
替换已受控的证明。
当前配置启用 TUN，提供方设置 86400 秒更新间隔；停止代理可能影响路由。
采集前应验证独立管理通道和网络恢复方案，不能假设停服务后 SSH 保持可用。

# 2026-11-12 原生代理目录恢复缺口

运行中的代理曾持有数据目录缓存的可写描述符，目录还有与启动配置不同的
配置类文件；单独配置备份不覆盖该目录。恢复前须重新确认目录、文件身份、
敏感性、用途和一致性处理；本次观察不构成停写条件或可执行恢复步骤。

# 2026-11-12 维护窗口时间边界

生产 Worker 容器只读 inspect 的 `StopTimeout` 为 3000 秒；API 未显式设置。
计划维护窗口时须重新核对运行容器、信号和停止行为，并为任务排空及失败恢复
预留时间。该数字不是停止命令、排空证明或已经验证的回滚操作步骤。

# 2026-11-12 Caddy 合成衔接用例

`infra/compose/caddy-manifest-encrypted-synthetic.test.py` 尚未执行；依赖
非 root Linux、可信的 `/usr/bin/age` 和 `/usr/bin/age-keygen`，维护机当前
不存在这两个路径。按候选说明先完成独立审查，再在受控隔离环境安排测试、
确认工具来源及清理；不得以此用例采集真实卷或解除生产硬阻断。

# 2026-11-17 / 2026-11-18 获取 iOS 侧载包

构建工作流 `.github/workflows/mobile-ios-sideload.yml` 在推送 `apps/mobile/**`
改动时自动运行，也可手动 `workflow_dispatch` 指定 `api_url` 与 `bundle_id`。
产物为无签名 IPA，需由用户自行签名安装。

- 最新 Run（2026-11-18，启用 OTA + 内置头像修复底座包）：`44263086859`（提交 `2b613f98f`），产物 `sydney-ios-unsigned-44263086859-1`（Artifact ID `14410575873`，保留 7 天），已开启 `sideload` 通道在线热更新（`EXUpdatesRuntimeVersion=sydney-ios-ip-1`）并修复全部 9 个包内静态资源目录映射。
- 最新下载地址（需登录仓库账号）：
  `https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44263086859`
- 本机最新解包位置：`D:\33054\sydney-ipa-output\Sydney-unsigned.ipa`（`25,984,466` 字节，SHA256 `6a5629f2ec8ad4c5d8f9b0922d1c9e0cff525bc9eeb2528caf23dd5515e52e15`），同目录含 `SHA256.txt` 与 `sydney-ios-unsigned-44263086859-1.zip`。
- 该目录不属于仓库工作区，不会进入版本控制；如需长期保留，请自行复制到其他位置。
- 产物内默认后台地址为构建变量注入的 `https://124.221.182.39`，不包含旧域名默认入口。
- 未验证：签名、安装、真机登录与功能验收均由用户侧完成，本机无法代做。
## 网页退役 Batch 3 客户端兼容

`SYDNEY_INTEGRATION_API_CALLBACK` 支持 `true` 和 `false`，默认关闭。原生密码重置入口优先使用 `AUTH_PUBLIC_LINK_ORIGIN`，未设置时使用 `BETTER_AUTH_URL` 对应的有效认证源。

`RAKAZO_MIN_CLIENT_BUILD` 支持独立的 `desktop=<构建时间戳>` 门槛。已带 `desktop` 标识的安装包收到 HTTP 426 时会提示更新安装包。启用生产门槛前需验收实际安装包的版本标识与提示。

独立桌面端的 MCP OAuth 自动回填要求 `SYDNEY_MCP_NATIVE_CALLBACK_ORIGIN` 与桌面所配置的服务器来源一致，并能访问该来源的 `/api/mcp/oauth/callback`。真实服务商联调待验证。

独立桌面端的 Slack 自动回填要求 Slack 登记的安装回调与桌面服务器来源一致。网关直接将两条客户端关联路径交给 API。`/integrations/callback` 的 `SYDNEY_INTEGRATION_CALLBACK_UPSTREAM` 源码默认已改为 `api:3100`，保留客户端必要返回链路，不再回到旧网页服务；真实 Slack 联调仍待验证。

发布脚本按有效 Compose 声明的服务滚动更新。当前源码生产 Compose 已移除 `web`，生产 updater 配置固定跳过 Web；发布前须同步清理服务器持久 overlay 的旧定义，不能只替换基础文件。

客户端专用覆盖 `infra/compose/docker-compose.client-only.yml` 保留 API 能力、更新器与网关配置，不再声明 `web`。`infra/native-linux/client-only.overlay.example.yml` 仅声明 API 回环画面桥；已有生产 overlay 的旧 Web 桥定义须在发布前独立移除。使用 Docker supervisor 的环境配置 `SANDBOX_SCREEN_PEER_SERVICE=api`，并验证运行中的隔离网络只接入同项目 API。需要无影时，API 镜像必须已包含固定 SDK。

旧 Web 及专用桥容器已于 2026-11-20 按授权删除。后续验收保留客户端登录、回调、只读画面、更新及客户端／后台版本回退；不再恢复旧 Web。不得仅凭 profile 改动宣称容器已删除，实际结果见本文件顶部的退役记录。

后台或客户端版本回退前记录部署版本、镜像 ID、Compose 文件顺序、持久 `.env` 的覆盖配置和现用 API 画面桥。自动失败回退使用进程启动时读取的 Compose 文件清单，因此升级及回退都须核对有效配置；使用保留的 API／Worker／客户端候选及数据备份，不以重启旧 Web 为回退条件。

### PA-023 切换与恢复顺序

> 以下为 2026-11-19 历史切换记录；其中恢复旧 Web 的步骤已按 2026-11-20 用户要求取消。当前清理与发布前条件见 [退役删除运维](#删除退役-web2026-11-20)。

2026-11-19 用户确认没有独立测试环境，授权直接在现有生产切换。实际承载为 `sydney-cloud-admin` 的 `/srv/rakazo`，Compose 项目 `rakazo-prod`；`sydney-backend-admin` 不是这套应用的承载主机。先保留原配置和镜像，构建仅包含 PA-023 及其必要依赖的候选再切换。逐项结果见 [验证记录](VALIDATION.md#pa-023-切换前验收预检)。以下通用恢复步骤保留，尚未执行的双端验收和恢复演练不能视为通过。

Windows 安装测试从对应的候选源码开始。在获授权且依赖已就绪的 Windows 构建环境，沿用现有工作流构建 Web 和桌面，再使用桌面包配置的 NSIS 目标生成安装器。以下为标准构建命令；本轮实际沿用已有 Web 构建、重新构建桌面，并使用本地 Electron 和现有 7-Zip 完成未签名 NSIS 打包及安装，具体产物见验证记录。

```powershell
pnpm --filter @rakazo/web build
pnpm --filter @rakazo/desktop build
pnpm --filter @rakazo/desktop exec electron-builder --win --x64 --publish never
```

桌面安装名为 `Sydney-partner`。候选 `desktop-windows-build.yml` 在 Windows runner 生成 `apps/desktop/out/Sydney-partner-Setup-<version>.exe` 与展开目录，先通过展开包的现有连接、旧 profile 和更新关闭测试，再分别上传 `sydney-windows-installer-<commit>` 和 `sydney-windows-unpacked-<commit>`。安装器附 `build-metadata.json`，核对提交、运行号、大小及签名状态。应用标识 `dev.rakazo.desktop` 和协议沿用现值。Run `44753883136` 的配置加载失败及本机修复见 [当前运维](#删除退役-web2026-11-20)，新安装器、覆盖安装、生产直连和版本回退待验。

本机 Windows 安装位置为 `%LOCALAPPDATA%\Programs\rakazo\Sydney-partner.exe`，卸载项显示 `Sydney-partner 0.4.0`。另一个项目的 `D:\33054\Sydney\Sydney.exe` 和卸载项保持原样。新打包版 Windows 用户数据改用 `%USERPROFILE%\.sydney-partner`，会话目录为其下的 `session`；测试时显式指定的 profile 优先。本机 Roaming 和 LocalAppData 目录中同目录原子重命名均实际返回 `EXDEV`，首次安装曾因此无法保存服务配置；用户主目录下已验证同目录原子重命名成功，调整后的安装包实际结果以验证记录为准。不删除原 AppData profile 或旧项目数据。真实旧数据迁移需另验。

本轮用已有编译产物生成的未签名测试安装器位于 `apps/desktop/out/pa-023-validation/Sydney-Setup-0.4.0.exe`。它未安装或发布，正式验收须确认其产物与测试环境版本匹配。

1. **保留基线。** 记录目标 Compose 项目名、原 `-f` 文件顺序和启用的 profiles、运行镜像 ID、持久启动配置与原画面桥。用原配置运行 `docker compose … config --services` 和 `docker compose … ps -a`，确认 Web 可恢复。先从客户端验证测试账号登录和目标画面，保留初始结果用于回滚比对。
2. **核对候选。** 用目标环境的 Compose 文件顺序解析客户端专用组合，确认 `web` 不在默认服务清单中、Caddy 的画面及回调上游指向 API。`deploy-main.sh` 只从 `RAKAZO_COMPOSE_OVERLAY_FILE` 加载一份受控覆盖。若需要组合现有拓扑与客户端专用覆盖，须在目标环境验证部署脚本和启用时的 updater 实际读取等效配置。启用无影时核对候选 API 镜像包含 SDK。原生 Linux 的回环画面桥须使用 `service:api`，Docker 沙箱使用指向 API 的屏幕对端配置。
3. **切换并验收。** 按候选配置协调 API、网关、画面桥及启用的更新器，确认 API 健康且所需回调和画面路由经 API 可达。按原项目配置显式停用仍在运行的 `web`，原生 Linux 同时处理旧 Web 回环画面桥。用 `ps -a` 核对实际服务状态，从外部验证浏览器入口已关闭，再执行 [双端停用 Web 用例](ACCEPTANCE.md#停用-web-与恢复演练pa-023)。
4. **恢复并复验。** 本次切换引入的必测链路故障应恢复原配置；切换前已有故障单独记录。恢复原 Compose 覆盖、环境和画面桥设置，先启动原 Web 和所需画面桥，健康后恢复网关上游及启用的更新器。复查旧入口、登录、画面和原服务清单。实际恢复与仅保留回退材料分别记录，不将未执行的恢复演练标记通过。

#### 2026-11-19 生产配置与回退入口

本次实际生效文件为 `/srv/rakazo/infra/compose/docker-compose.prod.yml`、`/etc/rakazo/compose/production.overlay.yml` 和 `/etc/rakazo/Caddyfile.prod`。原 `.env` 已指向这份覆盖，无须串接第二份持久覆盖。生产 API 和迁移容器使用 `sydney-pa023-api:20261119`，原生产基线 `1993995e572fd4235c7684c533db23eb6cf0554e` 的源文件及依赖保留，仅回补 PA-023 所需部分。源码清单、候选配置、执行脚本、构建和测评摘要保留在 `/srv/rakazo-releases/pa023-direct-20261119/`。

原配置、环境、部署脚本和数据库备份在上述目录的 `rollback/`，目录权限 `0700`、备份文件 `0600`。实际执行前已验证备份可被 `pg_restore --list` 读取，但未执行恢复。以下针对本次部署的回退命令尚未演练；用于发生本次切换引入的故障时恢复旧入口，不用于修复原先缺失的主机桌面会话。

##### PA-023 后续维护演练与再切换方案

> 历史方案：2026-11-20 用户允许直接删除退役 Web，本节旧 Web 恢复及再次切流步骤取消，不再执行或作为验收条件。最新操作见 [退役删除记录](#删除退役-web2026-11-20)；API／Worker／客户端的发布回退继续保留。

2026-11-19 继续验收时生产已处于直连态。用户本条要求生产切换前确认，以下改变服务或网关的步骤均未执行，须在确认的维护窗口操作。当前没有独立测试环境，不将生产预检称为测试环境演练。整体验收仍要求 [必测用例](ACCEPTANCE.md#停用-web-与恢复演练pa-023) 通过及真实恢复成功。

实际预检已确认：原覆盖能解析出 Web 和旧桥；原 API、Web、桥的镜像仍在服务器本地；当前 `.env` 与 `rollback/deploy.env` 内容一致，覆盖路径均为 `/etc/rakazo/compose/production.overlay.yml`。通过当前 Caddy 容器校验原配置成功，适配后的原配置包含 `web:5173` 和 `api:3100`，直连候选仅包含 `api:3100`。这些结果不证明服务已恢复。

执行前先准备已登录的 Windows 验收账号和安装签名候选的 iPhone，配置真实 Slack／MCP 授权条件，并恢复专属桌面的原 `:10` 会话，使画面有可比较的基线。确认升级候选和旧版本的组合。维护期间记录各阶段开始时间、版本、旧入口、登录及画面结果。不要重跑发布目录中的首次 `switch.sh`：它包含首次迁移和保存旧部署脚本的逻辑，重复运行会覆盖原回退脚本；本次使用下面的独立步骤。

1. **在 `sydney-cloud-admin` 准备命令上下文并预检。** 以下变量对应本次实际部署。`compose ps -q` 解析真实容器，不假设 API 的数字后缀。`test -S` 和画面服务检查在当前故障状态下会失败，先处理授权桌面，再安排完整演练。当前配置如与上述复核结果发生变化，应先更新本次方案。

```bash
set -Eeuo pipefail
release=/srv/rakazo-releases/pa023-direct-20261119
base=/srv/rakazo/infra/compose/docker-compose.prod.yml
overlay=/etc/rakazo/compose/production.overlay.yml
gateway=/etc/rakazo/Caddyfile.prod
compose() {
  docker compose --env-file /srv/rakazo/.env -p rakazo-prod \
    -f "$base" -f "$overlay" "$@"
}
gateway_container="$(compose ps -q caddy)"
test -n "$gateway_container"
test -s "$release/rollback/database.dump"
docker exec -i "$gateway_container" caddy validate --config - --adapter caddyfile \
  < "$release/rollback/Caddyfile.prod"
docker exec -i "$gateway_container" caddy validate --config - --adapter caddyfile \
  < "$release/Caddyfile.client-only"
test -S /tmp/.X11-unix/X10
systemctl is-active sydney-screen-vnc.service sydney-screen-websockify.service
curl --fail --max-time 15 -o /dev/null http://127.0.0.1:6080/vnc.html
```

2. **恢复原 Compose、Web 和旧桥，健康后恢复网关。** 先停依附于 API 网络命名空间的新桥，防止 API 更换后残留旧命名空间。原服务通过健康等待后重建依附于 Web 的桥；再次检查 API 就绪，再 reload 网关。原文件采用重定向写回，以保留单文件 bind mount 的 inode。当前 `.env` 未改变，不需要覆盖账号或密钥配置。

```bash
compose stop native-screen-api-loopback
cat "$release/rollback/production.overlay.yml" > "$overlay"
compose up -d --no-deps --wait --wait-timeout 120 api web
compose up -d --no-deps --force-recreate native-screen-web-loopback
api_container="$(compose ps -q api)"
test -n "$api_container"
docker exec "$api_container" node -e 'fetch("http://127.0.0.1:3100/ready").then(async response => { if (!response.ok || (await response.json()).degraded) process.exit(1); }).catch(() => process.exit(1))'
cat "$release/rollback/Caddyfile.prod" > "$gateway"
docker exec "$gateway_container" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
cat "$release/rollback/deploy-main.sh" > /srv/rakazo/infra/compose/deploy-main.sh
curl --fail --max-time 15 https://124.221.182.39/health
curl --fail --max-time 15 -o /dev/null -w 'legacy app=%{http_code}\n' https://124.221.182.39/app
curl --fail --max-time 15 -o /dev/null -w 'legacy domain app=%{http_code}\n' https://pc.zxlup.xin/app
compose ps -a
```

恢复验收需实际看到原 Web 健康、旧桥运行、网关包含 Web 上游，外部旧入口正常，并完成旧入口登录与原画面加载、只读及重连。HTTP 可达只记录为入口检查。任一步失败时先读取真实配置和服务状态，记录中断点，完成对应恢复后再继续，不盲目重跑整个首次发布脚本。

3. **在用户确认的范围内切回直连。** 完成恢复证据后，才执行本段；若确认仅覆盖恢复演练，则先停在旧 Web 状态，等待再切换确认。本段沿用已应用的两项兼容迁移，不再次迁移，不覆盖 `rollback/` 中的原材料。新 API 健康后重建 API 回环桥，网关改到 API 后再停旧 Web 与旧桥。

```bash
cat "$release/production.client-only.yml" > "$overlay"
compose up -d --no-deps --wait --wait-timeout 120 api
compose up -d --no-deps --force-recreate native-screen-api-loopback
api_container="$(compose ps -q api)"
test -n "$api_container"
docker exec "$api_container" node -e 'fetch("http://127.0.0.1:3100/ready").then(async response => { if (!response.ok || (await response.json()).degraded) process.exit(1); }).catch(() => process.exit(1))'
cat "$release/Caddyfile.client-only" > "$gateway"
docker exec "$gateway_container" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl --fail --max-time 15 https://124.221.182.39/health
curl --fail --max-time 15 https://124.221.182.39/ready
test "$(curl --max-time 15 -s -o /dev/null -w '%{http_code}' https://124.221.182.39/app)" = 404
test "$(curl --max-time 15 -s -o /dev/null -w '%{http_code}' https://pc.zxlup.xin/app)" = 404
compose --profile legacy-web stop web native-screen-web-loopback
cat "$release/deploy-main.sh" > /srv/rakazo/infra/compose/deploy-main.sh
compose ps -a
```

再切换后重做双端真实登录、Slack／MCP 完成与取消、目标环境启用的画面加载与重连、更新及升级后数据恢复。失败项必须修复复验，或在维护窗口恢复原服务；不将服务切回直连记为全体验收通过。生产目前没有运行 updater，本段不启动它。

Web 与旧画面桥容器已停止但保留。两项新增 Slack 返回字段兼容旧版本，不在应用回退时删除或回灌数据库；全库恢复只作为另行授权的灾难恢复操作。生产目前未运行 updater；生效覆盖中已设置跳过 Web，部署脚本已改为从启用的 Compose 服务清单选择服务并通过语法检查。

生产原生画面链路为 API 网络内 `127.0.0.1:16080` → `/var/lib/rakazo-native/run/screen.sock` → 主机 `127.0.0.1:6080`。最后一段当前不可用：`sydney-screen-vnc.service` 等待 `/tmp/.X11-unix/X10`，该会话不存在，依赖它的 `sydney-screen-websockify.service` 未运行。恢复授权的 `sydney-desktop` 原有 `:10` 会话后再启动并验证上述两项服务；不要改用现存其他用户或其他用途的 X 显示。本次没有改动这些 systemd 服务。

移动端启动遇到空字符串服务器配置时使用构建默认地址，并执行已保存会话来源校验。暂时无法读取安全存储时，可从错误页重试。真机恢复待验收。

桌面安装包迁移验收应保留旧应用 profile，用原账号打开有草稿和专属背景的会话，核对图片、工作区归属及已有编辑。目标已保存外观时，迁移在图片库容量内补入缺失图片。合并后仍缺少对应图片时，跳过该会话的背景映射。验收时同时检查清除背景后重新打开会话、切换账号和中断后重试。真实安装包和旧 profile 尚待验证。
