# 验证记录

2026-11-08（PA-018）：Node 24.15.0 下 Web TypeScript 检查通过；电脑面板、电脑窗口、语言激活、中文目录和页面标题的定向 Vitest 共 5 文件、17 项通过。Lingui 中文及英文目录编译成功，改动文件 Biome 检查通过。Windows 本机 Docker 引擎未运行，没有启动 PostgreSQL 或执行完整浏览器 E2E；真实屏幕、手机横竖屏和所有页面标题未验收。

2026-11-08（PR #2 检查排查）：`8ad5977a` 的单元测试三分片和 PostgreSQL journeys 两分片通过；Lint 因两处格式失败，Web E2E 两分片分别失败 16 项和 3 项。已修正两处格式和两处过期定位，尚未重新运行完整 E2E 或确认最新 CI。

2026-11-07（PR #2 第二轮检查修复，未合并、未部署）：模拟邮箱改从 `API_URL/__e2e/emails` 读取，避免打到网页返回的 HTML。用量热力图测试改为断言 84 个可用日期按钮和“用量等级”文字。未登录 RPC 穷举补上人格四个入口，testkit 类型检查通过。macOS 截图工作流里的应用包名从已不存在的 `Rakazo.app` 改为当前 `productName` `Sydney.app`，并匹配已改名的首启测试。网页端到端整套仍未在本机跑。

2026-11-07（PR #2 失败修复，未合并、未部署）：隔离库 `rakazo_rls` 跑完迁移后，`personality_presets_system` 的 `qual` 为 `app_rls_bypass()` 且没有 `WITH CHECK`；行级安全 Vitest 17 项通过。Biome `check` 退出码 0（仍有既有 warning/info，不再有 error）。桌面 Electron 套件 44 项在本机 xvfb 通过：启动闪屏关闭后才取窗口，可见文案按现有 `t()` 显示 Sydney。网页端到端注册修复还没在本机跑完整浏览器套件。

2026-11-07（PR #2 检查，未合并、未部署）：人格表的系统策略改为只有 `USING`，以便既有 `20261114120000` 迁移把它改写成 `app_rls_bypass()`；`PersonalityPreset` 列入行级安全模型。网页听写测试改为只断言仍保留的中文和 English。本地听写测试 86 项通过。没有在本机重跑 PostgreSQL 行级安全测试，也没有合并或部署。

2026-11-07（分支整合，未部署）：云端只看到远端 `main`（`747dbb52`）和 `codex/compose-local-overlay`（`e4a43af4`）。二者在 `fa87868d` 后分叉，`main` 的合并提交与 `fa87868d` 树相同，因此把 overlay 分支合并到以 `main` 为第一父提交的整合分支没有冲突，合并结果树与 `e4a43af4` 相同。随后只做检查所需的格式、目录提取和 overlay 测试类型收窄。Node 22.23.4 下定向 Vitest 17 个文件、148 项通过，覆盖人格目录、人格 RPC、人格库、新建 Bot、指令设置、面包屑、中英文目录、引导和模型设置、媒体出站校验、updater 与 native overlay 示例。`@rakazo/contracts`、`@rakazo/api`、`@rakazo/web`、`@rakazo/adapters`、`@rakazo/updater`、`@rakazo/db` 及被它们带上的依赖类型检查通过。`lingui extract --clean` 可重复，仍在源码中的译文没有被改写；中文目录仍有 55 条缺译。没有启动数据库、执行人格迁移、跑浏览器 E2E、连接生产或加载示例 overlay。

2026-11-07（PA-018）：Hersona 属性目录、账号作用域 RPC、人格库组件、新建 Bot 和 Bot 指令设置的定向 Vitest 共 5 个文件、7 项通过；包含冲突属性拒绝、越权更新和删除被拒、保存后应用快照。contracts、API 和 Web TypeScript 检查通过，新增文件的 Biome 检查通过。当前 Node 为 22.22.0，低于项目声明的 22.22.2；`pnpm --filter @rakazo/db generate` 因引擎限制失败，改用已安装 Prisma CLI 直接生成客户端用于本地检查。未启动数据库、执行迁移、验证 PostgreSQL 行级策略或真实跨设备/手机行为，未部署。

2026-11-07（PA-010、PA-012、PA-017、PA-018）：adapters 类型检查通过；工厂、环境、API/Web 屏幕代理和屏幕票据定向测试共 5 个文件、118 项通过。原生 Provider 相关核心用例另行通过 12 项，覆盖新 Bot 屏幕授权、越权用户拒绝、未配置屏幕错误和驱动代次。完整原生测试文件在 Windows 下有 2 个 Unix socket 用例失败，报 `Server is not running`；Python 驱动测试 16 项通过、2 项跳过，Web bridge 测试因 Windows `socketserver` 缺少 `ThreadingUnixStreamServer` 失败。`git diff --check` 通过；Biome 检查发现原生文件既有导入/格式及 `exportWorkspace` 生成器规则问题，本轮未扩大范围修复；Windows 没有 `systemd-analyze`，服务单元语法未执行。未启动 Linux systemd、Docker、数据库或真实桌面，未部署。

2026-11-07（PA-009、PA-018）：adapters TypeScript 检查通过，媒体 Provider 和生成工具定向测试 35 项通过，包含私网及重定向检查；无真实外部媒体生成测试，未部署。

2026-11-07（PA-018、PA-009）：尝试将设置页新建供应商限制为自定义服务后，现有模型设置测试有 10 项失败；该限制已撤回，避免破坏既有连接管理。保留已验证的端点预设移除；设置页全面改造和用户级媒体配置仍未完成。

2026-11-07（PA-018、PA-009）：Web TypeScript 检查、模型引导与设置 48 项定向测试和 `git diff --check` 通过；更新后的浏览器 E2E 未运行，服务端门禁和用户媒体配置未实现，未部署。

2026-11-07（PA-018、PA-009）：Web TypeScript 检查、首次引导 3 项测试及 `git diff --check` 通过，覆盖空端点、未填模型不能继续、保存后模型不可用时停留。没有执行生产数据库、用户级媒体配置或真实生成验证。

2026-11-07（PA-018、PA-009）：Web TypeScript 检查通过；首次模型引导及现有模型设置 47 项定向测试通过，包含默认端点为空和未填写时不可继续。模型状态复查的失败路径、真实注册与媒体生成未验收。测试时曾尝试隐藏已有供应商导致 12 项失败，撤回后全部恢复通过；相关旧 E2E 用例仍待更新。

2026-11-07（PA-018、PA-009）：Web TypeScript 检查、账户菜单和引导现有定向测试共 29 项及 `git diff --check` 通过；测试输出有 React act 环境警告，未单独覆盖引导初始化失败。自定义模型全链路、图像和视频生成未实现或验收，尚未部署。

2026-11-07（PA-018）：使用 Lingui 与生产相同的目录编译接口验证截图中六个编号及页面标题编号在中文和 English 中均有正确文本，编译错误为零；Web TypeScript 检查、四个定向测试文件共 7 项及 `git diff --check` 通过。真实生产构建、手机浏览器和线上验收未执行。

2026-11-07（PA-018）：移动页面标识的 TypeScript 检查通过，页面标识、设置、群聊和语言目录定向测试共 27 项通过；尚未进行真实手机、完整页面浏览或部署验证。

2026-11-07（PA-018）：Web TypeScript 检查、语言资源及切换相关 6 个测试文件共 16 项和 `git diff --check` 通过；pnpm 命令因本机 Node 版本低于仓库要求而未运行，检查改用现有编译器及 Vitest 直接执行。真实注册、默认头像渲染、手机浏览器及线上验证未完成，各模块标题仍待完整核对。

## 2026-11-07：生产注册 SMTP 配置

- API 容器重建后 healthy；公网 `/health` 正常，认证能力返回 `passwordAuth=true`、`emailCode=true`、`passwordReset=true`。
- 在 API 容器中仅执行 SMTP 连接及认证验证，结果通过；没有发送测试邮件。真实 Gmail 收件、验证码页面、注册及密码找回尚未验证。

## 2026-11-07：旧后台停用验证

- 旧 API、Worker、两个隧道和 Web 转发 socket 已停止禁用；旧 `sydney` 数据库不再列出，旧数据目录和已识别的旧迁移备份已删除。
- 云电脑旧迁移隔离数据库及源备份副本已删除，旧 Web 服务已停用；生产备份保留。新生产 API、Web、Worker、PostgreSQL 容器 healthy，公网 `/health` 返回 `{"ok":true}`。
- 旧后台 PostgreSQL 和 Super-Sydney 服务 active；云电脑驱动、VNC/noVNC active。未验证新生产账号登录、电脑操作或外部历史备份是否仍存在。

## 2026-11-07：旧数据导入追加核查

- 隔离库包含 2 条模型凭据、4 条空间密钥、48 条旧会话、1 个 `waiting_input` Run，以及 2 台状态为 `running` 的旧电脑；没有例行任务。直接导入这些运行状态可能使新环境误认仍有运行中的电脑或任务，处理方式尚未验证。
- 当前生产使用本地内容密钥提供方与加密凭据存储，但未配置 SMTP；新环境的邮箱验证码和密码重置不可用。未执行密钥重封装、模型凭据转换、附件读取或账号登录验证，也未向生产导入旧数据。

## 2026-11-07：旧后台迁移备份与隔离恢复

- 两端数据库转储通过 `pg_restore -l`，数据归档通过 `tar -tzf`；传输后的旧库和数据归档 SHA-256 与源端一致。
- 旧库快照成功恢复到 `sydney_migration_drill_20261107`，隔离库中消息计数 89、空间密钥计数 4。未验证附件提取、加密内容解密、凭据重加密及完整应用恢复。
- 两端 `ENCRYPTION_KEY` 不一致；生产业务数据库和应用数据卷未导入旧数据，未更改生产密钥或账号。隔离库和备份含敏感信息，须保持访问限制。

## 2026-11-07：旧后台迁移只读盘点

- 两端 PostgreSQL 均为 18.6，已完成迁移名称集合的哈希一致；生产 API、Web、Worker、PostgreSQL 容器 healthy，旧后台 API、Worker、PostgreSQL active。
- 精确计数：旧库 2 用户、4 空间、4 Bot、5 线程、89 消息、10 附件及 2 条模型凭据；新库用户、空间、消息均为 0，但部署设置 1 条、验证记录 3 条，不能当作完全空库覆盖。
- 旧库有 1 个 `waiting_input` Run；旧数据目录约 3.9 MiB，生产应用数据目录约 4 KiB。未进行备份恢复演练、密钥兼容验证、实际迁移或登录验证。

## 2026-11-07：消息操作栏部署验证

- GitHub Actions `42352970919` 中 Lint and typecheck、三个单测分片、两个 PostgreSQL 分片、镜像发布及 `deploy-production` 成功；Web E2E 跳过。
- 服务器 `/srv/rakazo/.last-deployed-revision` 为 `3dcac9a956b1545cafc6d8039aa2ea9c0ecc2f6b`；API、Web、Worker、PostgreSQL healthy，Caddy 运行中。
- 公网 `/health` 返回 `{"ok":true}`，首页和认证会话接口返回 200，`/build-id` 为 `20261107075223`；真实设备交互与回滚未验证。

## 2026-11-07：消息操作栏显示条件

- `MessageHoverMetadata.test.tsx`、`message-view.test.tsx` 共 14 项测试通过；Web TypeScript 检查和 `git diff --check` 通过。
- 更新手机端 Playwright 场景以检查默认隐藏及长按显示，但没有运行该场景；未验证真实手机、iOS 文字选择或菜单交互。
- Biome 检查仍报告消息行 `role="group"` 的语义元素建议；`transcript.tsx` 还存在原有格式差异，未进行整文件格式化。

## 2026-11-07：SidebarFooter 焦点测试修复验证

- 失败证据：Run `42345018949` 的 Unit tests shard 1 仅在 `apps/web/src/components/SidebarFooter.test.tsx` 的连接按钮焦点断言失败；其他单元测试分片、静态检查、Postgres journeys 和镜像发布均通过。
- 修复验证：为测试提供 `menuOpen` 参数，并在该可访问性测试中关闭默认账户菜单；本地该测试文件 27 项通过。
- 已执行：`pnpm exec vitest run apps/web/src/components/SidebarFooter.test.tsx`、`git diff --check`；完整 CI、生产部署和公网版本检查待新提交后执行。

## 2026-11-07：生产部署通道核对

- 线上失败证据：Run `42343223472` 的检查、Postgres journeys、单元测试和镜像发布均成功；`deploy-production` 在 `Join the tailnet` 步骤失败，后续 SSH 步骤被跳过。
- 直接 SSH 对照：临时移除 Tailnet 后的 Run `42344169631` 成功完成 SSH 密钥准备，但部署步骤以退出码 `255` 失败；`pc.zxlup.xin` 的 Cloudflare 公网入口 TCP 22 不可用。
- 结论：生产 SSH 主机不能从 GitHub Runner 直接访问，不能继续使用无 Tailnet 的部署方式；工作流已恢复 Tailscale OIDC 加入和 `tag:ci` 配置。
- 待处理：在 Tailscale 管理控制台确认 `tag:ci` 已创建且信任凭据允许该标签，并核对 GitHub OIDC audience/subject；修正后重新运行 CI，再检查 `https://pc.zxlup.xin/health`。

## 2026-11-07：提交 f7297933c 全量部署验证

- 提交验证：工作区干净，`main` 与 `origin/main` 同步到 `f7297933c580131e8473cafff1159bdd215a536c`；执行 `git push origin main` 返回 `Everything up-to-date`。
- Web：云电脑构建成功，版本 `20261107042307`；切换前完整产物保留为 `dist.before-f7297933c`，新产物保留上一版 `assets` 哈希资源。
- API/Worker：后台构建成功，两个入口 `node --check` 通过；产物切换前备份到 `/var/backups/sydney-release-f7297933c`，未执行数据库迁移。
- 服务：云电脑 Web、Web 链路和 HTTPS 代理 active；后台 API、Worker、隧道和屏幕隧道 active；后台 `/ready` 返回 `{"ok":true,"degraded":false}`，Worker 心跳退出码为 0。
- 公网：`https://pc.zxlup.xin/build-id` 返回 `20261107042307`；首页和 `/api/auth/get-session` 返回 200；`avatar-library/blue-maid.webp`、`lilac-dragon.webp`、`orange-flower.webp` 返回 200 且类型为 `image/webp`。
- 任务安全：部署前数据库 Run 仅有 `cancelled=1`、`completed=24`、`failed=3`、`waiting_input=1`，没有 `queued` 或 `running`；未进行人工回滚、真实用户流程和手机实机验收。

## 2026-11-06：移动网页页面面包屑

- 静态核对：路由页面继续由 `PageBreadcrumb` 按路径显示具体界面，根路径欢迎页返回空结果。
- 静态核对：创建群聊、群聊设置、Bot 设置、电脑、例行任务、例行任务编辑和导入 Agent 均在移动面板内显示对应 `Sydney / 具体界面`。
- 已执行：相关 Biome 检查、`pnpm exec tsc --noEmit -p apps/web/tsconfig.json`、`git diff --check`。
- 待执行：真实手机浏览器视觉检查。

## 2026-11-06：固定头像与个人头像库

- 头像库、Bot 创建、头像编辑、PWA 和共享头像渲染共 6 个定向测试文件通过，合计 45 项；Web 与 ui-web TypeScript 检查通过。
- 云电脑 Web 构建成功，版本 `20261106131423`；公网版本号一致，三张 `/avatar-library/*.webp` 素材均返回 HTTP 200 和 `image/webp`，PWA 预缓存包含三张素材。
- Web、云电脑链路、后台 API、Worker 和隧道均 active，API `/ready` 正常；本次未修改后台和数据库。
- 未执行真实手机视觉、真实上传、多张头像在刷新后的 IndexedDB 恢复、跨设备同步和真实 Bot 创建；Biome 仍报告共享样式中的既有 `!important`/选择器规则，未将无关样式重构纳入本次范围。

## 2026-11-06：连接应用空目录前端状态修复

- 静态核对：`PluginsOverlay.tsx` 在 `catalog.length === 0` 时仍渲染五个常用应用占位卡片，并显示目录未配置提示；占位卡片带 `aria-disabled="true"`，不触发连接流程。
- 数据核对：服务器返回目录项时仍沿用原有 `renderCatalogTile`、应用图标、OAuth 连接和连接状态逻辑。
- 静态核对：`apps/api/src/routes/connections.ts` 的目录分支在捕获提供方异常后记录错误日志，返回值仍为空数组，接口输出结构和权限逻辑未变。
- 文档核对：`docs/self-host-integrations.md` 与 `.env.example` 写明 Composio Platform 项目 API Keys 页地址和 `ak_...` 密钥前缀，并说明 For You 的 MCP/`ck_...` 不适用。
- 静态核对：`IntegrationSetup.tsx` 的 Composio 快速入口固定 MCP 地址，提交 `x-consumer-api-key`，并复用 `mcp.servers.create` 的加密存储与 Bot 分配流程。
- 已执行：API 类型检查、Web 类型检查、相关 Biome 检查、`git diff --check`。
- 待执行：浏览器视觉、真实 Composio/Pipedream 目录和 OAuth 验证。

## 2026-11-06：GitHub Actions Runner 修复

- 范围：`.github/workflows/ci.yml` 和 `.github/workflows/playwright.yml` 的通用 Linux 检查任务。
- 线上证据：`ci #14` 的镜像构建 6 项和镜像发布 3 项均成功；Lint、3 个单测分片和 2 个 PostgreSQL 分片均因 `incredibuild-ubuntu-latest` 无可用 Runner 保持 pending。
- 本地改动：10 个通用 Linux 任务改用 `ubuntu-latest`；macOS/Windows 原生任务、arm64 镜像任务和镜像发布逻辑未改动。
- 推送后观察：`ci #15` 的镜像构建/发布 9 项成功；6 个公共检查任务进入 pending，随后确认旧 queued 运行仍占用 `ci-checks-main`、`ci-unit-*` 和 `ci-postgres-*` 并发锁。
- 补充修复：主分支上述检查锁启用 `cancel-in-progress`，新提交会取消旧排队任务，让最新 revision 优先执行。
- 未执行：补充修复推送后的 GitHub Actions 复跑、完整工作区构建和真实 Runner 资源验证；需以最新提交的线上运行结果为准。

## 2026-11-06：移动网页单 Bot 聊天布局对齐群聊

- 代码核对：`Shell.tsx` 和 `composer.tsx` 为移动聊天增加 `data-mobile-chat` 标记；`grok-workbench.css` 将标题栏、助手正文和输入栏的共用移动样式从群聊条件扩展到所有移动聊天。
- 保留行为：单 Bot 继续显示顶部 Bot 头像；群聊继续隐藏群组头像并显示移动 `@` 成员按钮，普通 Bot 对话不显示该按钮。
- 输入栏核对：移动聊天范围内的 textarea 清除通用半透明背景、阴影和边框，由外层输入栏统一提供视觉表面，避免内部出现色差框。
- 实际执行：Composer 与 MessageView 定向测试 2 个文件、103 项通过；`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过；`Shell.tsx` 与 `composer.tsx` 的 Biome 检查通过；`git diff --check` 通过。
- 未执行：真实浏览器、手机键盘、截图对照和部署验证。

## V-056：提交 ce7ecaeb8 部署验证

- 日期：2026-11-06；关联需求：PA-018；状态：基础上线验证通过。
- Web：云电脑使用现有 Node 22.23.2 和依赖完成生产构建，构建标识 `20261106063543`；切换前旧目录保留为 `dist.before-ce7ecaeb8`，新目录共 326 个构建文件并保留旧 assets 资源。
- API/Worker：同一提交源码在后台完成构建；两个入口通过 `node --check`。旧产物备份到 `/var/backups/sydney-release-ce7ecaeb8`；未执行数据库迁移。
- 服务：云电脑 `sydney-web-cloud`、`sydney-web-cloud-link`、`sydney-driver`、`sydney-screen-vnc`、`sydney-screen-websockify`、`sydney-pc-nginx` active；后台 `sydney-api`、`sydney-worker`、`sydney-web-forward.socket`、`sydney-screen-tunnel` active。
- 健康检查：公网 `/build-id` 返回 `20261106063543`；首页返回 200；POST `/rpc/health` 返回 `{"json":{"ok":true,"version":"0.1.0"}}`；认证会话接口返回 `null`；后台 `/ready` 返回 `{"ok":true,"degraded":false}`；Worker 心跳检查退出 0。
- 数据安全检查：部署前 PostgreSQL Run 状态仅有 `cancelled=1`、`completed=24`、`failed=3`，没有 queued/running Run；没有变更数据库、环境配置、端口、权限或数据目录。
- 过程失败：首次后台构建长时间无输出并造成 SSH banner 暂时超时；未重启或切换不确定产物。后台连接恢复后构建、服务重启和健康复核完成。
- 未执行：真实账户登录、Bot 创建、联网回答、手机实机、PWA 缓存刷新、Electron、WebSocket 长连接稳定性和人工回滚演练；线上基础检查不等同完整验收。

## 2026-11-06：GitHub Actions GHCR 镜像名修复

- 检查范围：`.github/workflows/publish-server-image.yml` 的 validate、GitHub native build、Depot build 和 publish jobs。
- 失败证据：GitHub 运行 `42015640320`、`42014768764` 和 `41990556951` 中，app、updater、computer 的 amd64/arm64 job 均在构建步骤失败；Job 日志接口返回 403，未取得具体构建输出，但失败时间接近启动时间且跨镜像、跨架构一致。
- 代码核对：仓库 `zxl3305479573-max/Sydney-personal-agent` 的 `github.repository` 含大写 `Sydney`；原工作流直接将其拼入 GHCR 镜像路径。已改为各 job 运行 Bash 小写化 `${REPOSITORY,,}`，并复用输出值完成镜像标签、推送、检查和 digest 发布。
- 实际执行：`python -c "import yaml; yaml.safe_load(...)"` 解析工作流通过；`git diff --check -- .github/workflows/publish-server-image.yml` 通过；检索确认没有遗留直接拼接 `${{ github.repository }}` 的镜像引用。
- 未执行：未推送、未重跑 GitHub Actions，未在本机执行 Docker 多架构构建；因此尚未证明 GHCR 权限、Depot 项目或 runner 网络状态已恢复。
- 限制：根因判断基于工作流引用、仓库名和六个 job 的一致性失败模式；由于 GitHub Job 日志受 403 限制，仍需下一次 CI 运行的真实日志作最终确认。

## 2026-11-06：手机新建 Bot 弹窗视觉复刻

- `apps/web/src/pages/shell/create-bot-dialog.test.tsx`：2 项通过，覆盖形状与颜色联动、流体头像颜色及创建输入契约。
- `apps/web` TypeScript 检查通过。
- Biome 已格式化 `create-bot-dialog.tsx`、`avatar-studio-popover.tsx` 和 `grok-workbench.css`；检查仍报告该 CSS 文件既有 `!important` 与选择器降级告警，以及两个既有头像默认色硬编码提示，未处理无关告警。
- 未执行真实手机、软键盘、弹窗滚动、视觉截图、深色主题和部署验证，不能标记为移动端视觉验收完成。

## 2026-11-06：网页端移动页面顶部标识

- Web TypeScript 检查通过；`PageBreadcrumb.tsx` 与 `App.tsx` 的 Biome 检查通过，`git diff --check` 通过。
- 未执行真实浏览器、移动视口截图、深浅色、页面长标题和部署验证。

## 2026-11-06：网页端移动群聊输入与成员提及

- `pnpm exec vitest run apps/web/src/pages/shell/composer.test.tsx apps/web/src/pages/shell/use-composer-mentions.test.tsx apps/web/src/pages/shell/message-view.test.tsx`：3 个文件、104 项通过，覆盖移动群聊 `@` 按钮、光标处插入、成员选择、Bot 对话不显示该按钮及消息正文无气泡。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过；6 个改动文件的 Biome 检查通过，`git diff --check` 通过。
- 未执行真实浏览器 E2E、网页手机键盘和截图对照、深浅色视觉、PWA 更新或部署验证；原生 `apps/mobile` 不属于本轮范围。

## 2026-11-06：界面字体统一（衬线 + 英文斜体）

- `@rakazo/web` 与 `@rakazo/ui-web` 的 `tsc --noEmit` 通过。`SidebarFooter`、`Auth`、`Artifacts`、`ActivityList`、`GroupPanel`、`SpaceSearch`、`bot-avatar`、`sydney-bot-avatar` 共 8 个测试文件、86 项通过。
- `packages/ui-web/src/bot-avatar.test.tsx` 10 项失败：断言的是工作区中未完成的头像渲染重构产物（`rakazo-organic-avatar`、`bot-character-eyes`），当前实现已不再渲染。该测试文件与对应源码同属未完成改动，与本次字体变更无关，未处理。
- 使用本机 Tailwind 4.3.3 编译字体片段核对：`@theme` 内的 `var()` 字体引用可用，`font-sans`、`font-serif`、`font-script` 三个工具类均按预期生成，`--default-font-family` 继承 `--font-sans`。
- 19 个改动文件 Biome 检查通过（`bot-picker.tsx` 既有未使用导入告警保留），`git diff --check` 通过。
- 浏览器核对：在本机临时启动 `apps/web` 的 Vite 预览（`127.0.0.1:4173`），用本机 Chrome 以 393×852 视口访问；`/api/auth/get-session` 和 `/api/monitoring/config` 分别以空会话和禁用监控的本地响应替代，未启动 API、Worker、数据库或 Docker，临时预览在核对后关闭。
- Chrome 平台字体接口实测（当前 Windows 环境，修改前）：欢迎页品牌字标与 `.rk-script-type` 使用 `Segoe Script`，中文段落 23 个字形落在 `STSong`，拉丁部分落在 `Palatino Linotype`/`Book Antiqua`；随后根据用户参考图将 `.rk-script-type` 改为同一衬线栈并启用斜体。登录页同样命中衬线基础字体。
- 已登录界面：`/app` 在仅模拟会话、接口返回空数据时进入错误边界，但错误页中文仍渲染为 `STSong`，说明衬线基础字体已覆盖应用外壳；侧栏名称、聊天标题栏等斜体应用点只做了静态核对（类名与类型检查），未取得登录态视觉证据。
- 未执行：真实手机、软键盘、深色主题、已登录界面视觉和部署验证，不能标记为视觉验收完成。

## 2026-11-06：手机首页列表布局复修

- Web TypeScript 检查通过；空间分组、账户页和移动侧栏相关定向测试共 3 个文件、44 项通过。移动侧栏新增布局测试选择器，相关新增测试文件和移动列表文件的 Biome 检查通过，`git diff --check` 通过。
- 已静态核对移动侧栏的 DOM 顺序为账户入口、新建 Bot、Bot 区、群聊区、底部连接应用和搜索；群聊新建按钮触发现有 `create-group` 面板，Bot 新建按钮复用现有创建弹窗。
- 未运行真实浏览器 E2E、手机实机、软键盘、深浅色视觉、PWA 更新或部署验证；当前改动不能标记为移动端视觉验收完成。

## 2026-11-05：手机首屏白屏优化

- 启动、PWA 插件、Service Worker 和 App 定向 Vitest 共 4 个文件、34 项通过，覆盖慢页面、迟到脚本、未完成/已缓存样式、回调、错误及减少动态效果；Web 类型检查、5 个相关文件 Biome 及 `git diff --check` 通过。首轮格式和测试清理回调检查问题已修正。
- 云端候选构建成功。临时预览使用 Chromium 模拟 393×852 手机并额外延迟样式 2 秒：首次内容绘制约 168ms，两个样式分别约 2.8 和 3.2 秒完成，随后启用样式并进入登录页；桌面预览亦进入登录页，无应用脚本异常。该数据来自本机转发预览，不代表手机或公网加载时长。
- 公网检查确认启动图标早于主样式绘制，匿名访问进入登录页，两张样式均启用；第二次样本首次内容绘制约 576ms、最后样式约 1.4 秒完成，非稳定性能承诺。首次检查脚本因站点注入的 Cloudflare 分析脚本被既有 CSP 拒绝而报错，调整为检验应用异常后通过，未放宽 CSP。
- Web 版本 `20261105134933` 已发布，Web 及隧道 active，健康接口、会话及启动脚本返回 200。真实 iPhone、登录后 Bot 列表、PWA 更新和回退未验收。

## 2026-11-05：手机新建 Bot 弹窗

- 新建 Bot、Sydney 头像及手机侧栏的 3 个定向测试文件共 12 项通过，覆盖形状与颜色提交、契约解析及已保存形状渲染；Web 和 ui-web TypeScript 检查通过。
- 云电脑 Web 构建成功，公网和后台转发均返回版本 `20261105134539`，公网首页返回 200；Web、连接服务、API、Worker 和隧道状态正常，API `/ready` 正常。
- 新增手机端端到端场景用于检查弹窗打开时侧栏保持及关闭后状态，但未运行该场景；未验证真实手机动画、键盘、不同屏幕尺寸、实际 Bot 创建或回滚。相关文件 Biome 检查仍报告既有格式和颜色规则问题，未整体改写。

## 2026-11-05：iPhone 搜索栏底部间距

- 定向 Vitest 共 2 个文件、32 项通过；端到端断言已更新但未运行，最初格式检查提示的新差异已修正。
- 使用新构建 CSS、静态结构和 Chromium 模拟 393×852 视口，模拟底部安全区为 34px 与 0px 时，搜索框底距分别为 34px 与 12px，头像顶部仍为 71px；并非实际 iOS 或完整应用测试。
- 云端构建与发布成功，公网版本 `20261105133934`，首页、健康接口、认证会话、新 CSS 和脚本均返回 200，服务 active；实机、软键盘及 PWA 缓存更新待验收。

## 2026-11-05：iPhone 首页视口定位复修

- 侧栏和账号定向 Vitest 共 2 个文件、32 项通过；相关 Biome 检查通过并提示既有冗余片段，`git diff --check` 通过。
- 使用 Chromium 模拟 393×852 视口，以新构建 CSS 和静态结构人为模拟 59px 顶部、34px 底部安全区：侧栏顶部为 0、底部为 852px，头像顶部为 71px，搜索框底部距视口底部 46px。该测试不等于实际 iOS Safari 或完整应用测试；端到端断言未运行。
- 云端构建成功并发布 `20261105132910`，Web 及隧道服务 active，公网首页、健康接口、会话接口和新样式、脚本返回 200。真实手机、软键盘和 PWA 更新仍待用户验证。

## 2026-11-05：手机首页安全区修复

- 侧栏和账号定向 Vitest 共 2 个文件、32 项通过；修改的端到端测试和侧栏源码通过 Biome 检查（提示既有冗余片段），`git diff --check` 通过。模拟安全区的端到端断言已添加但未运行。
- 云端构建和发布成功；公网首页、新 CSS、Shell 脚本及健康接口返回 200。认证会话接口最初因云端隧道无响应而超时，后台直接访问正常；重启云端隧道与 Web 后，隧道及公网会话接口返回 200。
- 未进行手机实机、软键盘或 PWA 缓存更新验证；回退未演练。

## 2026-11-05：手机首页布局发布

- 云端 Web 构建成功；`sydney-web-cloud`、`sydney-web-cloud-link` 为 active。公网版本为 `20261105131324`，首页、`/ready`、认证会话、新 CSS 和 Shell 脚本及启动脚本均返回 200。
- 未进行真实手机视觉、登录后操作或 PWA 更新验证；人工回退未演练。

## 2026-11-05：手机首页字号和图标

- 账号菜单和搜索相关 Vitest 共 2 个文件、29 项通过；修改的侧栏及样式通过 Biome 检查，提示原有冗余片段；`git diff --check` 通过。
- 未执行浏览器或手机实机视觉验证，图标缩放、长文字截断和窄屏布局效果待验收；未部署。

## 2026-11-05：手机网页首页布局

- 账号菜单和搜索相关 Vitest 共 2 个文件、29 项通过；Web TypeScript 检查通过。侧栏、标题、测试及样式的 Biome 检查通过并提示原有冗余片段；账号组件有既有格式差异。
- 未运行真实浏览器或手机实机验证，视觉、软键盘、深浅色及部署效果待验收。

## 2026-11-05：手机启动居中与等待修复

- 启动交接、PWA 插件及根应用的 3 个定向测试文件共 19 项通过，覆盖快速加载、延迟加载、加载界面晚出现、失败、恢复入口及减少动态效果。首次运行有 1 项定时器边界断言失败，调整测试等待后重跑通过。
- 云电脑 Web 构建成功，公网及后台转发版本均为 `20261105130710`；公网启动脚本和样式包含新等待与居中逻辑。Web、连接服务、API、Worker 和隧道状态正常，API `/ready` 正常。
- 未进行真实手机视觉、实际加载耗时、弱网、PWA 更新或回滚演练；定向测试不代表网络请求或 Bot 列表加载本身变快。

## 2026-11-05：Web 与后台上线验证

- Web 在云电脑构建成功，版本 `20261105124011`；API 和 Worker 候选构建及 `node --check` 通过，候选中的相对外部依赖路径均存在。上线前查询 Run 状态，未发现运行或排队任务。
- 后台 API、Worker、隧道与 Web 转发 socket 以及云电脑 Web 和连接服务 active；API `/ready` 正常，Worker 心跳检查成功。公网首页、启动脚本与样式返回 200，公网和后台转发的版本号一致；PWA 脚本包含启动资源和标志。
- 公网认证能力接口显示邮箱验证码和密码找回可用，但未发送真实邮件；也未操作真实账号验证登录、Bot 创建或联网回答，未做手机实机、PWA 更新、负载和回滚演练。
- 上线前定向测试 176 项通过、10 项失败；失败位于旧头像测试，断言原版渐变、形状和动画，当前 Sydney 新头像测试通过。不同 Bot 身份的视觉区分仍需单独验收。

## 2026-11-05：手机网页启动动画

- 手机启动交接、PWA 清单、Web 根路由及桌面就绪检测的 4 个定向测试文件共 27 项通过；覆盖慢加载、快速加载、错误、减少动态效果及超时刷新入口。
- Web TypeScript 检查和本次相关文件 Biome 检查通过；未执行真实手机浏览器、PWA 安装、弱网视觉或部署验收。

## 2026-11-05：联网来源网址展示

- Web/原生 Markdown、模型指令、手机消息及 Web 聊天 Markdown 的 5 个定向测试文件共 324 项通过；Web 和手机 TypeScript 检查通过。
- 测试覆盖完整地址、带标题的链接、图标加载及 URL 凭据隐藏；未执行实际联网搜索、真机和浏览器视觉验证，未部署。

## 2026-11-05：Worker 头像契约兼容

- Worker 最小候选通过 `node --check` 及契约执行检查，覆盖 `fluid` 类型、颜色解析、合法和非法头像值；差异仅限头像契约。
- 部署前查询无排队或运行中的 Run；部署后 API、Worker active，API `/ready` 正常，Worker 心跳检查退出码为 0；Worker 运行文件哈希与候选一致。
- 未执行真实 Bot 创建和任务运行的端到端验证。

## 2026-11-05：Bot 创建契约部署

- 部署前查询无排队或运行中 Run；部署后 API、Worker 均 active，API `/ready` 返回 `ok: true`、`degraded: false`。运行文件 SHA-256 与候选一致。
- 重启后首次健康重试耗尽，随后复查 API 已监听且健康；切换脚本条件分支未运行，已手动完成重启与健康复核。
- 未用真实账号创建 Bot；Worker 当前仍是旧契约，其候选构建存在无关变化未部署，因此尚未验证完整任务链。

## 2026-11-05：Bot 创建兼容性续查

- 创建对话框、共享头像契约与数据库头像选择的三个测试文件合计 28 项通过。
- 服务器当前 API/Worker 均 active，`/ready` 正常；当前运行产物只接受 `organic`、`rakazo`。候选产物 `node --check` 通过，与当前运行产物的差异限头像契约和 source map 文件名。
- 候选产物尚未部署；没有捕获用户实际创建失败请求，也没有执行真实账号创建，尚不能判定全部故障已解决。

## 2026-11-05：Grok Bot UI 首批接入

- `pnpm exec vitest run apps/web/src/pages/shell/composer.test.tsx`：90 项通过；`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过。
- `pnpm --filter @rakazo/web check` 未执行成功：本机 Node.js 22.22.0 低于仓库要求的 22.22.2；未安装或升级依赖。
- 未进行真实浏览器、移动端、截图对照或部署验收；动态头像与完整界面迁移尚未完成。

## 2026-11-05：Bot 创建与头像透明排查

- 线上 `sydney-api`、`sydney-worker` 均 active，后台 `/ready` 返回正常。只读检查显示线上 API 源码的头像类型仅含 `organic`、`rakazo`，运行产物没有 `fluid_`；400 日志未识别具体请求，真实创建故障仍需结合用户操作验证。
- 上传头像圆形裁切与透明容器相关定向测试 4 项通过。此前同轮创建和头像相关测试有 15 项失败；运行期间相关文件被其他窗口修改，不能据此认定全部失败的当前状态或将旧测试断言直接视为产品需求。
- 未部署本次头像修改，未验证真实浏览器、流体图像背景透明、Bot 创建或登录后的完整流程。

## 2026-11-05：选色和注册验证修复

- `identity-trust.test.ts` 60 项、单独执行的 `index.test.ts` 21 项通过；选色、Web 注册、手机注册及密码策略 4 个文件共 54 项通过。认证、Web 和手机 TypeScript 检查通过。
- 首次将认证测试合并运行时，不同文件的数据库适配器模拟互相污染；拆开运行后通过。Biome 对选色组件及认证文件报告既有颜色常量、ARIA 和格式问题，本次未整体重排或修改其既有交互。
- 未运行真实浏览器定位、SMTP 收件、线上注册或部署验证。

## 2026-11-05：Web Bot 头像视觉调整

- 定向 Vitest：新增默认头像兼容、独立颜色、图片、安全回退、浅色辨识及群聊成员测试，并运行头像选择和新建 Bot 测试，共 3 文件 6 项通过。
- `pnpm exec tsc --noEmit -p packages/ui-web/tsconfig.json` 与 `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过。未运行旧头像全量回归：既有部分测试仍期待此前有机头像，须另行更新；本次不将其算作通过。
- 未运行浏览器视觉、手机网页、原生移动端、生产构建或部署；运行中动效和减少动态效果尚未在浏览器实测。

## 2026-11-05：Arc 小组件续做与聊天字体

- 定向命令：`pnpm exec vitest run --root . packages/ui-web/src/segmented-control.test.tsx packages/ui-web/src/icon-morph.test.tsx packages/ui-web/src/rolling-number.test.tsx apps/web/src/components/ChatAppearanceSettings.test.tsx apps/web/src/components/ToolActivityDisclosure.test.tsx apps/web/src/pages/shell/composer.test.tsx apps/web/src/pages/shell/message-view.test.tsx --maxWorkers=1`；首次运行发现受控分段控件的键盘测试未更新值、工具卡片运行结束后展开状态未同步，修复后 7 文件 132 项通过。测试环境仍提示未实现 Canvas 上下文，未阻止通过。
- `pnpm exec tsc --noEmit -p packages/ui-web/tsconfig.json` 与 `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 均通过；`git diff --check` 通过。
- 新增的 `segmented-control`、`icon-morph`、`index` 与 CSS 文件执行 Biome 检查通过；`ChatAppearanceSettings.tsx`、`message-view.tsx` 仍有提交前版本的整文件格式差异，未对整文件自动重排，以免混入无关改动。`ToolActivityDisclosure.tsx` 和 `composer.tsx` 的 Biome 检查通过。
- 未运行全量 UI 套件、全工作区构建、真实浏览器截图、深浅主题、中文换行比对、iPhone 或服务器部署；Grokbot 字体为视觉近似，不能宣称与官方一致。

## 2026-11-05：注册开放部署验证

- 已确认本地 `.env` 的 `SIGNUPS_ENABLED=true`；后台环境原值为 `SIGNUPS_ENABLED=false`，且未发现 `EMAIL_PROVIDER`、`SMTP_URL` 或发件人配置。
- 备份 `/etc/sydney/backend.env` 后，将 `SIGNUPS_ENABLED` 改为 `true` 并重启 `sydney-api`；服务 active，后台 `/ready` 返回 `{"ok":true,"degraded":false}`。
- 使用正式 HTTPS 来源的临时账号完成密码注册（200）、会话读取（200）和账号删除（200）；使用旧回环来源的请求按预期返回 403 `INVALID_ORIGIN`。未执行独立密码登录、登出和正式浏览器注册表单验证；临时账号和测试凭据已清理。
- 公网认证能力接口返回 `passwordAuth=true`、`emailCode=false`、`passwordReset=false`，与当前没有事务邮件配置一致。
- 本次不宣称邮箱验证、邮箱验证码、密码找回、allowlist、正式浏览器表单视觉、深浅主题和登录限流通过；这些项目需要配置事务邮件服务或真实浏览器后继续验证。

## 2026-11-05：QQ SMTP 与邮件品牌验证

- 旧项目 QQ 邮箱 SMTP 配置转换为当前项目变量后写入后台受保护环境文件；重启 API 后 `/ready` 正常，能力接口返回 `passwordAuth=true`、`emailCode=true`、`passwordReset=true`。
- `example.invalid` 临时注册触发了真实发信和 QQ 邮箱退信，说明验证邮件发送钩子已生效；已删除两个临时账号及对应验证记录，未验证收件、点击验证链接和验证码登录。
- 用户提供的退信截图显示标题 `Verify your Rakazo email`；仓库邮件模板、13 个语言文件和相关测试中的用户可见品牌已改为 Sydney。`pnpm exec vitest run --maxWorkers=1 packages/auth/src/email.test.ts packages/auth/src/index.test.ts apps/api/src/marketing-email.test.ts`：3 个文件、52 项通过；`packages/auth` 与 `apps/api` 的 TypeScript 检查通过。
- 后台邮件模板源码已同步；使用现有 `node scripts/build-server.mjs ...` 重建期间服务器 SSH 超时，未确认构建完成、`index.js` 品牌字符串、重启后 `/ready` 和新邮件标题。该部分记录为中断，未宣称线上生效。

## 2026-11-05：Arc 图标规范与滚动数字

- 滚动数字组件新增 3 项定向测试；用量设置、热力图、消息输入框和弹窗测试共 118 项通过。测试环境仍提示未实现 Canvas 上下文，未阻止通过。
- `pnpm exec tsc --noEmit -p packages/ui-web/tsconfig.json` 和 `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 均通过；本机 Node 22.22.0 仍低于仓库要求的 22.22.2，包级 `pnpm --filter` 检查命令受引擎校验阻止。
- `pnpm exec biome check` 对新增的 `rolling-number.tsx` 和 `rolling-number.test.tsx` 无问题（仓库使用 Biome，此前误用 Prettier 检查）。`UsageHeatmap.tsx` 和 `AccountSettingsOverlay.tsx` 仍有既有问题：前者有 a11y 语义与格式差异，后者有多行 import 折叠差异和 import 排序，均不在本次改动行上，未顺手修改。
- 单独运行 `apps/web/src/pages/shell/composer.test.tsx` 与 `shell-overlay.test.ts` 后，本轮定向测试合计 129 项通过。
- `packages/ui-web` 的头像测试（`bot-avatar` 16 项、`group-avatar` 4 项、`logo-avatar` 2 项）在本工作区失败：渲染结果是流体头像 canvas，测试仍期望 `rakazo-organic-avatar`。这些文件本次未修改，与图标和滚动数字改动无关，未调查其根因。
- 未在浏览器或 iPhone 查看描边变化、滚动数字动画、深浅主题和减少动态效果；未部署，不能认定线上已生效。

## 2026-11-05：手机网页布局离线验证

- 用量设置、热力图和消息输入框现有定向测试共 115 项通过；加入覆盖弹窗与工作台的 `shell-overlay.test.ts` 后为 126 项通过。测试环境提示未实现 Canvas 上下文，未阻止测试通过。本机 Node 22.22.0 低于仓库要求的 22.22.2，包级检查命令因此被引擎校验阻止。
- 再次执行 `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 时 `Shell.tsx:348` 报错：该行以函数形式调用 `setMobileSidebarOpen`，而 `use-mobile-sidebar.ts` 当前版本已把该 setter 收窄为只接受布尔值。该文件属于同工作区另一处未提交改动，本次布局修改未涉及该行；错误未修复，也未据此认定本次改动类型不通过。
- 未在浏览器或 iPhone 实测排版、长数字、集成名称、单列与双列切换、键盘弹出和收起、缩放及安全区域；未部署，不能认定线上已修复。
- 该轮曾用 Prettier 检查并报不通过，但仓库实际使用 Biome 格式化，结论作废；未对整份文件执行自动格式化，以避免混入无关格式改动。`git diff --check` 通过。

## 2026-11-05：手机网页登录慢初步排查

- 从本机分别访问现有正式域名和通过临时解析直连现有云电脑，三次首页总耗时分别约为 1.14–1.54 秒和 0.06–0.07 秒；另一次现有入口会话请求约 2.23 秒、入口 JS 约 6.31 秒。结果仅代表当时本机网络，不代表 iPhone 网络或长期性能。
- 云电脑服务状态正常，检查时负载较低；网页初始化等待会话结果。未改动 DNS、代理或服务器配置，未在 iPhone 实测，具体瓶颈尚未确认。
- 用户反馈 iPhone 的 Wi-Fi 和手机流量均约 7 秒。本地调整路由懒加载和语言包并发后，`App.test.tsx` 与 `i18n-activate.test.ts` 共 17 项通过；未执行生产构建、服务器部署和 iPhone 复测，不能断言加载时间已改善。
- 用户补充反馈手机切换界面也慢，具体页面和阶段待确认。本机三次匿名会话请求经现有入口约 2.35–2.97 秒，指定源站直连约 0.70–1.83 秒；该检查不代表登录后的页面或线程接口耗时。现有群聊快照优化尚未证明已部署，不能视为线上生效。
- 用户明确慢的入口是设置和连接应用。本地添加延迟预加载后，`ErrorBoundary.test.tsx` 和 `SettingsOverlay.test.tsx` 共 14 项通过；这些测试未直接测量预加载效果。`shell-overlays.tsx` 的 Biome 检查报告既有格式差异，提交前版本同样未通过；未重排无关代码。未构建、部署或在 iPhone 上复测。

## 2026-11-05：手机网页 Bot 与群聊列表首页

- 关联 PA-018。手机列表状态、聊天直达状态、返回列表逻辑和现有懒加载/设置回归共 5 个定向测试文件、35 项通过；Web TypeScript 检查通过，6 个本轮文件的 Biome 检查通过。`mobile-sidebar-swipe.spec.ts` 已改写为列表首页场景，未执行。
- 未执行生产构建、服务器部署和 iPhone 实机验证。一次扩大到 Web 页面目录的全量 Vitest 运行出现 25 个文件失败、3 个运行时错误，错误涉及其他组件测试的 mock/资源环境；未将其归因于本轮改动，也未修改无关测试。

## 2026-11-05：PC 群聊加载离线验证

- 线程同步、订阅及事件相关测试 129 项通过；随后新增跨群缓存隔离测试，线程同步文件 6 项通过。Web TypeScript 和改动文件格式检查通过。
- 定向测试覆盖群列表未返回时启动请求、群信息到达后不重建订阅、旧请求返回时不覆盖当前群，以及匹配缓存、历史跳转和跨群缓存隔离。
- 未使用真实账号或服务器测试首次加载时间、慢连接、权限拒绝与用户实际操作；未部署。

## 2026-11-05：云电脑文字输入

- 关联 PA-011、PA-012。云电脑桌面用户在独立 X11 选择区复现 `xclip` 捕获输出时超时；关闭输出捕获后正常退出。部署后使用驱动完成独立选择区中英文文本往返，服务与 socket 均为 active。
- Windows 本机执行 `python -m unittest infra.native-linux.test_driver`：17 项中 15 项通过、2 项跳过。未在真实网页或 Agent 会话中验证粘贴，未验证浏览器通过命令启动。

## 2026-11-05：PC 消息发送即时反馈离线验证

- 发送、输入框、线程事件、临时气泡和 API 线程目标相关定向测试首轮 274 项通过；新增事件标识检查后复跑相关四个文件 185 项通过，消息与对话渲染测试另有 13 项通过。Web 和 API TypeScript 检查通过。
- 相关输入框测试环境报告 Canvas 接口未实现，不影响上述测试结果；旧有 `message-view.tsx` 和 `transcript.tsx` 全文件格式检查存在既有排版差异，本次未整体改写。
- 未连接真实服务或部署，实际网络延迟、视觉和浏览器滚动尚未验收；旧 API 与新 Web 混用时的实时消息可能短暂重复，待同步部署验证。

## 2026-11-05：上游宣传入口清理验证

- Web 聊天输入及侧栏定向测试 116 项通过；邮件模板测试 22 项通过；Web TypeScript 检查通过。测试环境不支持 Canvas，出现相关提示，未验证头像绘制。
- 未进行真实浏览器、邮件发送、移动端或部署验证。旧头像渲染测试此前 20 项失败仍未解决；不能认定整个品牌与头像清理完成。

## 2026-11-05：旧头像清理（未完成）

- PC 创建和头像设置两项更新后的定向测试通过，Web TypeScript 检查通过；七个删除的 SVG 在源码中未找到文件名引用。
- 旧头像渲染测试 30 项中 20 项失败，涉及已移除的旧图形、工作状态和活动动画；不能判定功能回归通过。Canvas 真实效果、移动端与官网未验证。

## 2026-11-05：PC 启动动画离线验证

- 移除可见文字后重新执行本地静态资源复制；调整仅涉及页面内容和样式，未重新运行 Electron 或安装包验证。
- 启动交接、应用文档状态、启动配置和窗口选项定向测试共 81 项通过，桌面 TypeScript 和相关文件格式检查通过；静态资源复制脚本执行成功。
- 本地无头 Chrome 打开复制后的启动页，检查约 650 毫秒中间帧和完成帧，分别观察到部分笔画和完整图标。该检查不验证 Electron 窗口交接、实际动画流畅度、系统减少动态效果或服务器慢连接。
- 未启动 Electron、构建安装包、部署或验证真实失败回退；相关测试仍需在授权环境完成。

## 2026-11-05：Google 头像绑定离线验证

- OIDC 及账户设置定向测试 2 个文件、115 项通过，覆盖匹配邮箱绑定、无效头像、不同邮箱拒绝绑定及原名称保留；认证包和 Web TypeScript 检查通过。
- 使用模拟的 Google 签名和 OIDC 服务，未验证真实 Google 授权、服务器配置、图片网络可达性、已绑定账号更新或部署。

## 2026-11-05：登录注册外观离线验证

- 登录页面定向测试 16 项通过，Web TypeScript 检查通过。
- 未启动浏览器或服务器，实际视觉、深浅主题、窄屏、真实认证及部署均未验收；现有测试不证明与参考完全一致。

## 2026-11-05：侧栏连接应用入口离线验证

- 使用本地 Vitest 运行 `apps/web/src/components/SidebarFooter.test.tsx`：26 项通过，覆盖连接操作、头像回退、按钮焦点和应用图标数量；Web TypeScript 检查通过。
- 测试环境不渲染实际布局，悬停展开动画、窄侧栏、减少动态效果和与参考图的视觉一致性尚未在浏览器验收；未部署。

## 2026-11-05：PC 流体 Bot 头像离线验证

- 契约、既有头像和颜色选择器定向测试 36 项通过；创建 Bot 与头像设置定向测试 11 项通过。Web 和共享 Web UI TypeScript 检查通过。
- 本机 `pnpm` 命令因 Node 版本为 22.22.0、项目要求至少 22.22.2 而拒绝执行；上述检查通过已有的本地工具直接运行，未安装依赖。
- 测试环境没有 Canvas 绘图实现，未验证真实绘制、鼠标动画、不同颜色效果和性能；未运行浏览器、移动端或服务器部署验证。

## 2026-11-05：主 Bot 展示精简验证

- 侧栏分组和拖拽定向测试 2 个文件、23 项通过；Web TypeScript 检查及本次相关文件的 `git diff --check` 通过。
- 上述测试未覆盖实际渲染，主 Bot 头像、名称及无障碍状态提示仍需浏览器验收；未部署。

## 2026-11-05：UI 重做部署及参考核对

- 云电脑以提交 `4d49b063d` 隔离构建 Web，Node 22.23.2，构建标识 `20261105061136`；构建成功并有大分包提示。旧产物保留在 `/opt/sydney-web-stage/apps/web/dist.before-4d49b063d`。
- 重启后公网首页、`/build-id` 和 POST `/rpc/health` 返回 200；云端 Web、链路、HTTPS 代理、驱动和屏幕服务为 active，后台 API、Worker、隧道和转发 socket 为 active，云端与后台 API `/ready` 均正常。
- 复核原始附件发现参考是付费 Cohort retention 三角图；本轮错误地使用 Activity heatmap 日历图。未完成所需参考复刻，也未验收真实登录后的页面、窄屏或键盘交互。

## 2026-11-05：UIArc 参考组件离线验证

- `pnpm exec vitest run --maxWorkers=1 packages/ui-web/src/fields.test.tsx packages/ui-web/src/list-search-input.test.tsx apps/web/src/components/AppearanceColorPicker.test.tsx apps/web/src/components/UsageHeatmap.test.tsx apps/web/src/components/ChatAppearanceSettings.test.tsx apps/web/src/pages/shell/transcript-render.test.tsx`：6 个文件、25 项通过，覆盖输入字段、搜索清空/焦点恢复、颜色预设与无效 HEX、热力图、外观设置和聊天渲染回归。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过；`pnpm exec tsc --noEmit -p packages/ui-web/tsconfig.json`：通过。本机 Node 22.22.0 低于仓库声明的最低 22.22.2。
- 已对照用户提供的 UIArc Input、Search field、Color picker 和 Activity heatmap registry 结构检查实现；未执行真实登录后的浏览器截图比对、窄窗口交互、屏幕取色或服务器切换验证。

## 2026-11-05：PC 界面部署验证

- 代码提交 `f8133e602` 已推送 `origin/main`；云电脑使用该提交在 `/opt/sydney-web-build-f8133e602` 复用已有依赖执行 Vite 生产构建，Node 22.23.2，构建成功，构建标识 `20261105035626`；构建有大文件分块提示。
- 首次切换后立即检查时返回空响应，切换脚本恢复旧版本并确认服务正常；增加启动就绪重试后再次切换成功。现有 Web、Web 链路、HTTPS 代理、驱动、VNC 和 WebSocket 代理均为 active；后台 API、Worker、隧道和转发 socket 为 active，后台及云端 API `/ready` 正常。
- 公网首页、新构建标识和设置资源返回 200，健康 RPC 使用 POST 返回 200；GET 该 RPC 返回 405。独立无登录 Chromium 打开首页返回 200，标题为 Sydney，页面正常渲染且未捕获页面异常。
- 未使用用户登录会话，未验证登录后的用量、聊天外观、图片上传、键盘、真实屏幕、Electron 或回滚演练；已有聊天外观测试跨文件状态隔离问题仍待解决。

## 2026-11-05：PC 气泡颜色选择离线验证

- `pnpm exec vitest run --maxWorkers=1 apps/web/src/components/AppearanceColorPicker.test.tsx apps/web/src/components/ChatAppearanceSettings.test.tsx`：2 个文件、7 项通过，覆盖新建黑底白字、预设选择、无效 HEX 和外观存储交互。
- `pnpm exec vitest run --maxWorkers=1 apps/web/src/pages/shell/transcript-render.test.tsx`：3 项通过。三个文件联合运行时，聊天渲染测试因其他外观测试遗留状态与测试环境的对象 URL 不兼容而失败；尚未解决跨文件隔离问题。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。本机 Node 22.22.0 低于项目要求的 22.22.2。真实浏览器取色、键盘交互、外观视觉和服务器部署未验收。

## 2026-11-05：PC 搜索框离线验证

- `pnpm exec vitest run --maxWorkers=1 packages/ui-web/src/list-search-input.test.tsx apps/web/src/pages/shell/chat-model-picker.test.tsx apps/web/src/pages/model-settings/compatible-model-fields.test.tsx`：3 个文件、14 项通过，涵盖普通及命令式搜索清空、焦点恢复、输入法保护和模型选择回归。
- 初次执行中测试环境缺少 `ResizeObserver`，以及命令组件实际使用 text 类型的断言不匹配；补齐模拟并按组件实际行为调整后通过。另一次弹层测试出现未复现的失败，后续两次运行通过。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。本机 Node 22.22.0 低于项目要求的 22.22.2。真实浏览器、侧栏按钮、键盘操作和服务器部署未验收。

## 2026-11-05：PC 单行输入框离线验证

- `pnpm exec vitest run --maxWorkers=1 packages/ui-web/src/fields.test.tsx apps/web/src/pages/AccountSettingsOverlay.test.tsx`：2 个文件、33 项通过，覆盖标签、说明和错误关联、账号名称编辑及密码显示回归。首次执行因账号页测试模拟缺少新组件失败，补齐模拟后复测通过。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。本机 Node 22.22.0 低于项目要求的 22.22.2；直接检查不代表满足运行环境要求。
- 未执行真实浏览器视觉、键盘操作、响应式尺寸和服务器部署验收。

## 2026-11-05：PC 用量趋势图离线验证

- `pnpm exec vitest run apps/web/src/components/UsageHeatmap.test.tsx apps/web/src/pages/AccountSettingsOverlay.test.tsx apps/web/src/pages/SettingsOverlay.test.tsx`：3 个文件、35 项通过，包含 UTC 日期聚合、图表切换、空状态和失败提示。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。本机 Node 为 22.22.0，低于仓库声明的最低 22.22.2；直接检查通过不代表满足运行环境要求。
- 接口仅提供最近 100 条记录；尚未验证实际服务器数据、浏览器显示、键盘操作或部署。

## 侧栏顶部机器人展示验证（2026-11-05）

- Web 侧栏分组、置顶拖放与排序定向测试共 23 项通过；Web TypeScript 类型检查、相关文件 Biome 检查与 `git diff --check` 通过。
- 未执行真实浏览器视觉、鼠标拖放、不同侧栏宽度或服务器部署验收；既有每空间四个置顶名额保持不变。

## V-055：PC 预置入口启动探测

- 日期：2026-11-05；用户反馈正式域名账号登录测试完成。本窗口未读取账号密码或独立操作其登录会话。
- Electron 为 `SYDNEY_PC_BACKEND_URL` 单独识别来源，启动时先规范化地址并探测 Sydney 健康契约；失败返回设置页，显式开发地址保持原行为。
- 本机桌面配置 Vitest 50 项、桌面 TypeScript 检查通过；真实公网 `/rpc/health` 返回预期健康格式。Node 版本 22.22.0 低于项目引擎要求，检查使用 `npm_config_engine_strict=false`。
- 已增加成功、不可达、地址错误和非 Sydney 响应的 Electron 端到端用例；本机缺少桌面构建产物和 Electron 可执行文件，这些用例未执行。未执行打包、真实 Electron 登录、WebSocket、附件或屏幕验收。

## 2026-11-05：PC 聊天双外观离线验证

- `pnpm exec vitest run apps/web/src/components/ChatAppearanceSettings.test.tsx apps/web/src/pages/shell/transcript-render.test.tsx`：2 个文件、8 项通过，涵盖模式切换、素材保留和模拟存储重载等。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。`pnpm --filter @rakazo/web check` 因本机 Node 22.22.0 低于项目要求的 22.22.2 未运行；直接调用检查不代表满足项目运行环境要求。
- 未验证真实图片上传及解码、浏览器视觉和键盘操作、Electron、移动端、服务器部署和跨设备同步。

## V-054：正式域名登录来源修复

- 日期：2026-11-05；用户登录请求在认证日志中返回 `403 INVALID_ORIGIN`；后台原 `WEB_ORIGIN` 和 `BETTER_AUTH_URL` 均为回环地址。未读取或验证用户密码。
- 通过 systemd 附加配置最后加载 `/etc/sydney/pc-origin.env`，将两个地址设为正式 HTTPS 域名；原 `/etc/sydney/backend.env` 保留。检查 Run 状态无进行中记录后重启 API，API `/ready`、Worker 和隧道正常。
- 公网正式域名来源的虚构账号登录返回 `401 INVALID_EMAIL_OR_PASSWORD`，非信任来源返回 `403 INVALID_ORIGIN`。这表明正式来源已通过来源检查，不代表用户密码正确或真实登录成功。
- 未验收真实账号登录、原回环入口登录、OAuth、passkey、WebSocket 或会话恢复；回环 URL 不再处于原有受信任网页来源之列。

## V-053：PC 域名源站 HTTPS 与续期

- 日期：2026-11-05；用户确认 Cloudflare 记录指向云电脑并开放 443。云电脑安装系统包 Nginx、Certbot，以专用 systemd 服务运行反向代理；`sydney-web-cloud` 加入目标 Host 并短暂重启。
- Let's Encrypt 正式证书签发成功，证书到期日为 2027-02-03；本机强制连接云电脑回环的 HTTPS 返回 200 且证书验证通过，HTTPS 转发的 `/rpc/health` 返回 200。
- `certbot renew --dry-run --cert-name sydney-pc --run-deploy-hooks --non-interactive --no-random-sleep-on-renew` 成功；证书定时器、反向代理、Web 和 SSH 链路 active。
- 公网 `https://pc.zxlup.xin/` 和 `/rpc/health` 返回 Cloudflare 404，表现与源站 HTTP 80 的 404 相同，但尚不能排除其他 Cloudflare 规则或回源目标问题。未验证公网登录、真实 WebSocket、附件、屏幕或 Electron。
- 源站 HTTP 80 仅服务 ACME 验证，其余请求返回 404；源站 HTTPS 接受目标 Host 并转发到既有 Web socket。Nginx worker 使用既有 Web 服务账号。
- 后续用户确认 Cloudflare SSL/TLS 当前为 Flexible；一次公网 HTTPS 测试期间，云电脑抓包观察到 Cloudflare 地址向源站 TCP 80 发起连接，公网仍返回 404，与当前 HTTP 端口仅提供 ACME 的配置一致。需在 Cloudflare 为该主机名设置严格 HTTPS 回源后再次验证；未修改 Cloudflare 配置。
- 用户随后确认已将域名全局模式调整为 Full (strict)；公网 HTTPS 页面与 `/rpc/health` 返回 200，客户端证书验证通过；无登录状态调用 `/rpc/me` 返回 401，无效屏幕地址返回 403。未登录、附件拒绝和无效 Host 检查不能代替真实用户流程或完整安全审计。

## V-055：提交推送与云端服务重启验证（2026-11-05）

- 日期：2026-11-05；关联需求：PA-018；状态：通过。
- 代码：提交 `a36741a41` 包含 76 个已修改/新增文件，推送到 `origin/main` 成功；`git diff --cached --check` 通过，`main` 与 `origin/main` 一致。
- 云端静态产物：新目录含 325 个文件，`build-id=20261105092721`，全量检索中英文旧菜单文案命中 0；切换前旧产物备份为 `dist.before-a36741a41`，并保留旧哈希资源减少已打开页面加载失败风险。
- 服务：云电脑 `sydney-web-cloud`、`sydney-web-cloud-link`、`sydney-driver`、`sydney-screen-vnc`、`sydney-screen-websockify` 均为 active；`/run/sydney-web-stage` 的 `api.sock`、`screen.sock`、`web.sock` 存在。后台 `sydney-api`、`sydney-worker`、`sydney-web-forward.socket`、`sydney-screen-tunnel` 均为 active。
- 健康检查：后台 API `/ready` 返回 `{"ok":true,"degraded":false}`；公网首页 200、入口脚本 `index-JOo88klc.js` 200 且不含旧文案、`/build-id` 返回 `20261105092721`、`/api/auth/get-session` 200、公网 `/ready` 200。
- 未完成：登录后的真实账户菜单视觉、手机主屏幕缓存刷新、已安装桌面客户端内置资源、实时屏幕 WebSocket 逐跳和长时间稳定性未验收；浏览器 Service Worker 缓存仍可能短期提供旧资源。

## 2026-11-05：“获取移动应用”入口清理复核

- 源码检查：`apps/web/src/components/SidebarFooter.tsx` 无下载按钮、手机图标及 App Store/APK 跳转；`rg` 对已跟踪源码未发现“获取移动应用 / Get the mobile app”文案，仅保留新增回归断言中的英文原字符串。
- 线上资源：请求 `https://pc.zxlup.xin/` 并抓取入口脚本及其公开 JS 依赖共 15 个，未发现该中英文文案；`/build-id` 返回 `20261105061136`。
- 本机产物：`pnpm --config.engine-strict=false --filter @rakazo/web build` 通过，构建标识 `20261105092721`；对 `apps/web/dist` 全量检索未发现该中英文文案，旧含文案的 JS 和 source map 已被新构建替换。`dist` 仍由 `.gitignore` 排除，未提交，也未部署到线上或打进新桌面安装包。
- 定向验证：`SidebarFooter.test.tsx` 与手机列表定向测试共 2 个文件、31 项通过；格式修正后 `SidebarFooter.test.tsx` 单独 26 项通过、Biome 通过；`@rakazo/web check` 和 `git diff --check` 通过。
- 未执行：登录后的真实账户菜单视觉、手机端账户菜单、桌面端打包和正式部署复验；已安装桌面客户端及浏览器 Service Worker 缓存可能仍使用旧资源，需要新构建发布或清缓存后复查。

## 手机端并行验证（2026-11-05）

- 本机单 worker 定向 Vitest：保险箱、敏感输入和主题 5 个文件 71 项通过；服务器地址、登录、群聊和电脑页 4 个文件 101 项通过；新增聊天外观保存和重载 2 项通过。测试使用替身，不等同真实设备。
- `node node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json` 通过；本机 Node 为 22.22.0，低于仓库声明的 22.22.2 最低版本。
- 未安装依赖、构建 iOS、连接 iPhone、访问真实登录信息或验收真实服务器；现有 Expo 项目、iOS 包标识和签名归属需要配置，服务入口需由手机可达。

## V-052：PC 正式域名接入前检查

- 日期：2026-11-05；公共 DNS 服务器对 `pc.zxlup.xin` 返回 Cloudflare IPv4 地址，不能据此确认 Cloudflare 后台配置的源站目标。
- 云电脑现有 `sydney-web-cloud` 与 `sydney-web-cloud-link` 为 active，API socket `/ready` 返回 200；以 `pc.zxlup.xin` 作为 Host 访问 Web socket 返回 403。
- 检查时云电脑没有公网 80/443 监听，未发现 nginx、Caddy、certbot 命令或现有 Let's Encrypt 证书；未测试 HTTPS、登录、WebSocket 和屏幕代理。
- 仅执行只读检查；未发布公网入口、变更主机名白名单、修改防火墙或重启服务。公网接入需完成源站 TLS、权限边界及回滚设计与验收。
- 用户随后确认 Cloudflare 中 `pc` 的源站为云电脑 IP；经域名请求返回 Cloudflare 521。云端当前部署的 Vite 配置尚无 `PC_BACKEND_HOSTNAME` 接线；仓库已有相关改动，但尚未同步到云端。本轮未确认云厂商安全组的 80/443 入方向配置。

## V-051：中转连接与双机只读检查

- 日期：2026-11-05 10:15（服务器时间）；本机直连后台 SSH 超时，通过云电脑中转登录成功。后台 `sydney-api`、`sydney-worker`、`sydney-tunnel` 和 `sydney-web-forward.socket` 为 active。
- 后台内存：总量 1.7 GiB、available 233 MiB，swap 使用 0；该值是单次快照，不代表峰值或长期容量。
- 云电脑 `sydney-driver`、VNC、noVNC、`sydney-web-cloud` 和 `sydney-web-cloud-link` 为 active；云端 API socket 的 `/ready` 返回 `{"ok":true,"degraded":false}`。云电脑 available 内存约 2.0 GiB。
- 本轮仅执行只读检查及计划文档整理；未运行模型、真实任务、Electron、重启或恢复演练。未确认本机 SSH 直连超时的根因。

## V-050：任务 API 与云电脑 PC 后台配置接线

- 日期：2026-11-05；范围：任务统一 RPC 接线、云电脑 PC 后台主机名配置和双机只读健康检查。
- 代码验证：`packages/contracts`、`apps/api`、`apps/web`、`apps/desktop` TypeScript 检查通过；任务执行定向测试 16 项通过；`apps/api/src/router.test.ts` 单项路由构造测试通过；Vite 配置测试 3 项通过。
- 受影响包的 `packages/db`、`packages/core`、`packages/adapters` TypeScript 检查通过；本机没有可调用的 Prisma CLI，`prisma validate` 未执行。
- 云电脑验证：直接 SSH 只读检查确认 Ubuntu 24.04、约 `2.1 GiB` available、Sydney 驱动、VNC/noVNC、云端 Web 和 SSH link active；Unix socket `/run/sydney-web-stage/{api,screen,web}.sock` 存在，API `/ready` 返回 `{"ok":true,"degraded":false}`。
- Host 边界验证：通过未登记的 `pc-backend.local` 访问云端 Web socket 返回 Vite Host 拒绝；说明正式域名必须先写入 `PC_BACKEND_HOSTNAME` 后再验收 HTTPS、Cookie、WebSocket 和 Electron。
- 账号边界验证：云电脑上的 `sydney-web-stage` 和 `sydney-desktop` 均无法读取后台环境文件、数据库目录、维护密钥或 Web/驱动 Unix socket；socket 文件保持 `0700` 且归 `sydney-web-stage`。
- 后台限制：从本机直连 `47.99.159.146:22` 超时，经云电脑中转也未完成 root SSH banner；本轮没有修改后台服务、数据库、迁移、端口或密钥。
- 未完成：正式域名/TLS、Electron 真实登录、真实模型、屏幕长连接、双机断线恢复、后台重启恢复、备份恢复和 P5 文件整理摘要闭环。

## V-048：PC 后台部署方向规划

- 日期：2026-11-05；范围：用户新增的“后期 PC 端后台运行在云电脑”部署方向。
- 已形成：新增 [ADR-0015](../docs/adr/0015-pc-backend-on-cloud-computer.md)，将目标拓扑划分为 PC Electron 客户端、云电脑 PC 后台和主后台控制服务；同步 PC 客户端计划、双机方案、项目架构、总计划和文档入口。
- 已明确：云电脑 PC 后台只负责渲染产物、PC 专用 BFF、WebSocket/屏幕代理；主后台继续保存认证主数据、任务状态、授权、审计、模型凭据、数据库和 Worker。
- 未执行：未实现 PC 后台、未修改 systemd、SSH、端口、认证或数据路径；未测量云电脑同时运行桌面、浏览器、驱动、Web 和 PC 后台时的资源。
- 限制：该记录是架构规划，不代表三层拓扑已经部署；PC 后台到主后台的认证转发协议、公开入口、重启恢复和回滚仍待设计与实机验收。
- 代码补充：Electron 已增加 `SYDNEY_PC_BACKEND_URL` 启动入口，测试覆盖其优先于保存配置且不覆盖显式 `RAKAZO_WEB_URL`；`setup-config` 定向测试 50 项通过。
- 类型检查：`pnpm --filter @rakazo/desktop check` 首次被项目 Node 引擎门禁拒绝；设置 `npm_config_engine_strict=false` 后两个 TypeScript 配置检查通过。当前 Node 为 `22.22.0`，项目要求 `^22.22.2 || ^24.0.0 || >=26.0.0`。
- 未执行：未验证真实云电脑 URL、Electron 窗口登录、模型聊天、打包产物或服务器部署；未把环境降级检查当作完整发布验收。

## V-047：PC 客户端联调规划

- 日期：2026-11-05；范围：现有 Electron 客户端与后台入口、登录、Bot、模型、聊天、云电脑画面和后续 Web 静态服务移除顺序。
- 已核对：`apps/desktop/package.json` 的 Electron 开发、检查和打包脚本；`setup-config` 的已有实例探测、服务器地址校验、会话分区和请求头范围；现有 Electron 设置及本地栈 E2E 覆盖。
- 已形成：新增 [PC 客户端联调计划](design/PC_CLIENT_INTEGRATION.md)，并同步总计划、开发记录、窗口分工和文档入口。计划把工作拆为 PC-01 至 PC-05，明确真实服务器入口、WebSocket、OAuth、附件、屏幕和打包验收依赖。
- 未执行：未启动 Electron、后台服务、数据库或模型；未连接真实账号；未运行客户端 E2E、打包或服务器命令。因此本条是规划核对，不代表 PC 客户端联调通过。
- 限制：云电脑画面已有一次真实 iframe 验证，但稳定性、撤销和整机重启恢复仍待另一窗口继续验收；Web 服务移除前必须完成 Electron 内置渲染与远程 API 分离。

## V-046：云端 Web 部署与原生只读屏幕复核

- 日期：2026-11-05；确认网页运行在云电脑的 `sydney-web-cloud.service`，后台旧的 `sydney-web.service` 已停用，后台入口由 `sydney-web-forward.socket/service` 转发到云端 Web；云端 Web、云端 SSH 链路、后台 API 和屏幕隧道均为 active。
- 本机 Web 生产构建成功并同步到云端网页运行目录，旧静态资源保留为 `dist.before-v045`；重启云端 Web 后页面登录和 Bot 列表正常。侧栏电脑不再创建 iframe 预览，页面只显示状态和“打开”入口。
- 原生屏幕接口此前因残留控制租约按交互模式请求而返回 `native_screen_unsupported`；API 已将 `native-linux` 屏幕固定为只读，不携带控制令牌或控制租约，重新构建部署后真实浏览器一次验证全屏 iframe 已创建，未显示错误提示。
- 仍未完成稳定的 noVNC Canvas/WebSocket 长时间验收；本轮未执行鼠标、键盘、终端或写入操作。云端 Web 重启恢复和后台 API 重启已分别验证，整机重启、连接撤销和长期负载仍待验收。

## V-045：原生手动启动租约修复与预览移除

- 日期：2026-11-05；范围：原生手动启动的租约传递、侧栏电脑预览。手动启动的原生电脑不再调用没有租约的工作区准备；启动改用驱动可接受的 `boot_` 前缀运行号，并把当前执行租约作为校验回调交给适配器，校验失败即拒绝操作。
- 新增 2 个定向用例覆盖租约校验通过、代次变化后拒绝以及无租约时拒绝启动；`computer-boot` 10 项、电脑相关 Web 3 个文件 10 项通过，API 与 Web 类型检查通过，改动文件 Biome 检查通过。仓库全量 Web 与 API 套件存在与本改动无关的既有失败，未一并修复。
- 已移除侧栏电脑预览的 iframe，改为状态与打开入口，桌面画面只在全屏窗口加载；Web 生产构建成功，构建产物仅保存在本机。
- 租约修复此前已部署到后台 API 并完成一次真实启动：电脑由 `error` 转为 `running`，屏幕地址接口返回 200。随后后台 SSH 持续握手超时，本轮未能同步网页改动、复核服务或验证真实桌面画面；预览移除尚未部署，云电脑桌面显示、连接撤销与重启恢复仍未验收。

## V-044：云电脑隔离运行 Web

- 2026-11-04：原 Web 位于后台，切换前可用内存约 232 MiB；将 Web 切至云电脑后一次测得约 334 MiB，swap 为零。资源值为快照，不能推断峰值；后台 socket 代理运行时约 1.2 MiB，云端 Web 服务约 146 MiB。
- 云端转发组件在独立网络命名空间中通过双向转发和 Unix 套接字权限测试。运行文件清单一致；Node、Web 配置、build-id 及旧版静态资源校验一致，未逐字节校验全部依赖。
- 切换前后首页及认证接口正常，真实测试账号登录和 Bot 列表成功；API `/ready` 正常，Worker 心跳通过，API、Worker、隧道、PostgreSQL 和 Caddy active。
- 切换后重启云端 Web 服务，后台原入口重新返回 200；切换前重启云端隧道后也恢复。两机整机重启未演练。
- 屏幕底层 HTTP 返回 200、WebSocket 升级成功，无效屏幕授权返回 403；受限隧道不允许执行命令或连接数据库，桌面账号不能读取配置或访问套接字。曾重启云端隧道并确认恢复。
- 后台原 Web 已停用但保留，切换计时回滚保护在验收后取消；临时传输密钥和授权已清除。真实授权屏幕页面因没有运行中电脑未验证；完整回滚、两机重启、升级同步和长期负载未验证。

## V-043：只读屏幕部署与浏览器启动检查

- 日期：2026-11-04；后台受限构建成功并部署 API，初次部署产物权限错误导致 API 无法读取，恢复后修正权限并重新部署；API 就绪检查正常，API、Worker、Web、驱动隧道和屏幕隧道均为 active。
- 云电脑驱动及只读屏幕服务均为 active，屏幕端口监听回环；后台到屏幕服务的 HTTP、WebSocket 及 RFB 握手通过。这些检查不代表真实浏览器画面已可用。
- 浏览器登录成功，但电脑预览显示启动失败；确认没有活动运行和未过期执行租约后，从界面重试，启动接口返回 500，未生成屏幕 iframe。日志指向工作区准备时缺少原生运行租约。
- 尚未修复手动启动租约问题，未验收真实桌面画面、旧连接撤销、重启恢复及交互；未修改数据库状态来绕过失败。

## V-038：移除独立任务工作台

- 日期：2026-11-04；Web 路由测试 9 项通过，含旧地址跳转聊天；Web、API、数据库、核心和契约包类型检查通过。
- 受影响 TypeScript 文件 Biome 检查通过；首次检查发现核心包导出顺序不符，调整后通过。检查使用 `engine-strict=false`，本机 Node 22.22.0 低于要求的 22.22.2。
- 未部署或执行真实浏览器、数据库和在途任务验收；数据库记录未删除，受管任务执行及授权校验代码仍保留。

## V-037：移除侧栏任务入口

- 日期：2026-11-04；侧栏文件 Biome 检查、Web 类型检查及 `git diff --check` 通过。
- 本机 Node 22.22.0 低于项目要求的 22.22.2，类型检查使用 `engine-strict=false`；未部署或进行浏览器验收。

## V-036：侧栏主 Bot 区

- 日期：2026-11-04；范围：侧栏分组、拖放决策、Bot 更新及名额校验。
- 本机定向测试初次发现原置顶测试替身未适配新增事务，调整测试并补充分组用例后，3 个文件、32 项通过；Web、数据库和 API 类型检查通过。
- 本机 Node 22.22.0 低于项目声明最低版本 22.22.2，检查使用 `engine-strict=false`；未安装依赖或启动本地服务。
- 只读检查发现后台机可用内存约 114 MiB，Web、API、Worker 均为 active；本轮未在资源紧张时构建或重启，未部署服务器。
- 未执行浏览器交互、真实 PostgreSQL 并发及多设备同步验收；历史超限数据不会自动移除。

## V-035：截图图片回传 Web

- 日期：2026-11-04；范围：`computer_observe`、带观察结果的 `computer_act`、附件存储和 Web 消息渲染。
- 代码验证：`pnpm exec vitest run packages/adapters/src/computer-tools.test.ts packages/adapters/src/thread-artifacts.test.ts`，2 个测试文件、33 项通过；`pnpm --config.engine-strict=false --filter @rakazo/adapters check` 通过。首次类型检查被本机 Node `22.22.0` 低于项目要求 `22.22.2` 拦截，未安装或更新依赖。
- 部署验证：后台 `/opt/sydney` 更新适配器源码，API/Worker 构建成功并重启；`sydney-api`、`sydney-worker`、`sydney-web`、`sydney-tunnel` 均为 active，API `/ready` 返回 `ok: true` 且 `degraded: false`。
- Web 验证：通过本机 SSH 转发登录测试账号，发送只读截图请求；页面新增消息包含真实图片元素，浏览器加载尺寸为 1920×1080，图片附件名为 `shot-*.png`，同时保留文字说明。
- 本轮没有执行点击、键盘、终端或文件写入；没有读取或记录模型 API 密钥。云电脑仍保持 running，原生 stop/destroy、断线恢复、重启恢复和可信停止未验收。
- 限制：截图作为线程附件持久化，每个新画面会增加一条图片消息；后台可用内存有限，未做高并发或大尺寸截图压力测试。

## V-034：存储分层迁移准备

- 日期：2026-11-04。
- 后台只读盘点：可用内存约 65 MiB，数据目录约 452 KiB；API、Worker、Web 服务内存分别约 542、361、139 MiB。对象存储 bucket 和 endpoint 未配置。
- 后续用户控制台报告可用内存降至约 26 MiB；按用户授权停止 Web 后约 504 MiB，交换空间使用为零，API、Worker、隧道 active，Web failed 原因待查。SSH 重试被拒绝，未完成进一步检查。
- 随后通过云电脑中转后台 SSH 22 成功并校验既有主机密钥；后台 API `/ready` 为 ok 且未降级，Web 退出状态为 143。Web 仍停用；迁移及重启恢复未验证。
- 再次检查时 Web 已重新启动，首页和认证会话接口均为 200；API 曾因部署产物权限错误重试后恢复，`/ready` 正常，Worker、Web 和隧道 active，可用内存约 400 MiB。部署产物发生外部变更，本次未覆盖；未迁移服务或验证长期负载。
- 云电脑隔离转发组件在 `PrivateNetwork` 下通过双向转发与套接字权限测试；受限 SSH 隧道经 Unix 套接字访问后台 `/ready` 正常，桌面账号无法读取专用配置或访问该套接字。依赖传输及实际 Web、认证、屏幕、切换与恢复测试未完成。
- 本机持久密钥已用于两台服务器登录；随后后台 SSH 从本机及经云电脑中转均握手超时。云电脑维护 SSH 和驱动、屏幕、代理服务仍可访问或 active。
- Web preview 含 CSP、noVNC 代理等中间件，尚不能直接以静态服务替换；本次未调整服务、未实施迁移或完成减压。
- 已完成：静态盘点 `createAgentHomeStore`、`createArtifactStore`、`home-storage migrate` 和 `shared-storage artifacts`，确认现有代码支持本地与对象存储并行读取及可重复迁移。
- 已完成：文档划分后台控制数据、云电脑活动工作区、对象存储文件内容和敏感凭据边界。
- 已执行：`pnpm exec vitest run packages/adapters/src/artifact-store-factory.test.ts packages/adapters/src/home-object-store.test.ts`，2 个测试文件、63 项测试通过；仅为本机离线测试。
- 已执行：通过用户提供的 root SSH 入口只读盘点云电脑；确认 Ubuntu 24.04.4、约 3.6 GiB 内存、约 2.3 GiB available、根分区剩余约 48 GiB，现有 Sydney 驱动、VNC/noVNC 和代理服务 active。
- 已确认：云电脑未安装或运行 MinIO、SeaweedFS、Garage 等对象存储服务，当前 Sydney 工作区约 452 KiB；没有在云电脑安装新服务或开放新端口。
- 已确认：云电脑 UFW 当前 inactive，全局 SSH 配置允许 TCP forwarding 且未限制 `permitopen`；专用账号实际限制另见 ADR-0010。在确定后台网络路径和访问策略前，不应把对象存储绑定到公网或直接开放新端口。
- 未执行：云电脑对象存储端点配置、服务器 dry-run、home/artifact 实际迁移、服务重启、备份恢复和后台资源复测。
- 限制：尚无远程对象存储，未释放后台文件或进程内存。

## V-032：Web 模型与云电脑复测

- 日期：2026-11-04。用户已配置的 DeepSeek 提供商凭据存在，凭据内容未读取；Web 登录成功后，文本提示测试返回预期“模型连接正常”，页面未出现模型错误或浏览器页面异常。
- 同一 Web 入口发起只读云电脑观察测试，页面未出现“模型提供商返回了错误”或 `Computer provisioning failed`；后台日志显示 `native-linux` provision 成功，Run 完成，电脑状态为 `running` 且 `restorePending=false`。
- `native-linux-sandbox.test.ts` 改为真实临时 Unix socket 后，服务器 12 项全部通过；API、Worker、Web、隧道和 PostgreSQL 保持 active，API `/ready` 与 Worker 心跳通过。
- 本轮没有执行点击、键盘、终端或文件写入；旧的 3 个失败 Run 保留，未执行清理。后台可用内存约 81 MiB，继续运行真实任务有内存压力；重启恢复、断线恢复、可信停止和完整负载未验收。

## V-031：云电脑截图故障修复

- 日期：2026-11-04。现场日志先显示团队工作区身份校验失败；修复后出现原生驱动 `execute` 超时，定位到驱动在有 socket 超时配置时的连接断开检测。零等待就绪检查修复后，云电脑侧 Python 测试 14 项通过，包括空闲连接快速命令及断开连接拒绝。
- 后台服务器 Provider 定向测试 5 项通过，覆盖团队 home key 的空间和用户匹配、其他身份拒绝、代次及租约检查。完整文件测试 12 项中 10 项通过、2 项失败，失败原因为已有 `node:net` ESM 导出无法被 `vi.spyOn` 模拟；未将完整套件记为通过。
- 跨机只读截图返回有效 PNG；随后经 Web、真实模型及 `computer_observe` 发起一次截图任务，日志显示电脑创建成功，任务状态为 completed，电脑为 running 且恢复标志已清除。该验证不等于截图已作为附件展示，也不代表键鼠、终端的完整使用、断线恢复或可信停止通过。
- 原生 Provider 的 stop 和 destroy 仍不支持；当创建阶段发生其他错误时，失败回滚仍可能产生聚合错误。测试期间构建后台时服务短暂停止并恢复；未验证重启恢复或高负载。

## V-030：Web 测试部署

- 日期：2026-11-04。后台机以 `b7c91915d` 为基础叠加四个当前工作区 Web 修改，Web 生产构建成功；构建提示部分分包超过 500 kB。`sydney-web` 为 enabled、active，仅监听服务器回环端口 5173。
- 本机 SSH 转发后的 Web 首页返回 200，浏览器渲染 Sydney 首页，认证接口经代理返回 200；测试账号接口登录、会话读取和退出成功。本机无头浏览器提交登录后进入 `/onboarding/model`。
- API `/ready` 正常、Worker 心跳通过，后台、隧道及其他已检查服务保持 active。验证时后台机可用内存约 246 MiB；尚未配置模型，未验收真实任务、云电脑界面交互、外网访问、服务器重启或 SSH 转发重连。
- 一次浏览器命令直接调用未能获得退出状态，改用现有 Playwright 和 Edge 后验证通过；初次登录后立即检查页面过早，等待后确认已进入模型配置页。

## V-029：旧项目数据清除

- 日期：2026-11-04。个人网站数据、旧回滚目录、恢复备份及画布 WebDAV 目录已不存在，两个项目的 Docker 镜像已删除；根分区可用空间约 23 GiB。
- Sydney API `/ready` 正常，Worker 心跳检查通过，后台、隧道、数据库和其他已检查服务为 active。未执行其他业务接口回归；Caddy 历史配置备份仍存在。

## V-028：旧项目移除

- 日期：2026-11-04。个人网站的两个部署目录和服务文件已移除，画布及 WebDAV 容器已删除，原项目监听端口 3000、4331 和 8080 未再出现；画布代理已从当前 Caddy 配置撤销。
- Sydney API `/ready` 返回正常，Worker 心跳检查通过；Sydney、隧道、数据库及其他现有服务保持 active。数据和备份保留，未验证恢复及其他项目业务接口。

## V-027：后台部署

- 日期：2026-11-04；后台机 Node 22.23.2、pnpm 9.15.0 和 PostgreSQL 18；提交 `b7c91915d` 的 API、Worker 构建成功，207 项 Prisma 迁移及队列、运行账号初始化成功。
- API `/health` 和 `/ready` 返回 `ok: true`，就绪结果 `degraded: false`；Worker 内置心跳检查通过。运行数据库账号非超级用户、无绕过 RLS、建库或建角色权限；服务账号可连接隧道 Unix socket。
- API 与数据库仅监听回环；API、Worker、隧道均为 enabled 和 active，既有 Caddy、Docker、站点及相关项目服务为 active。未对既有业务接口做功能回归。
- 首次 Worker 心跳因服务文件系统只读失败，开放 `/tmp` 写入并重启后通过；一次 socket 检查路径拼写错误，修正后通过。旧版 Docker 拉取尝试因仓库连接不稳定停止；系统自带 PostgreSQL 14 不满足项目要求。
- 检查时可用内存约 279 MiB，交换空间已使用约 69 MiB；Worker 日志存在队列并发与连接池大小警告。未执行真实模型、账户登录、端到端任务、重启恢复、负载测试或备份恢复演练。

## V-026：单人使用双机隧道

- 日期：2026-11-04；根据用户确认的单人使用范围启用较宽 SSH 转发。云电脑 `sshd -t` 通过，专用账号有效配置为 `AllowTcpForwarding local`，保留 chroot 与禁用终端；后台隧道服务为 enabled、active。
- 从后台专用账号通过 Unix socket 验证 provision、generation/status、无租约文件请求拒绝，以及真实桌面截图的 PNG 格式；未记录截图画面。后台隧道目录和 socket 属于 `sydney-control`，分别为 0700 和 0600。
- 后台既有 SSH、Docker、Caddy 及三个现有项目服务均为 active；服务状态不等于业务接口验收。首次对尚未加载的隧道执行 `reset-failed` 失败，随后直接启用成功。
- 当时未验证两机重启、隧道断线重连、会话重登、键鼠输入、真实模型任务或可信停止；后台随后已部署，见 V-027。TCP 转发权限的实际范围与风险见 ADR-0010。

## V-025：PC 任务工作台

- 日期：2026-11-04；关联 PA-001、PA-003、PA-006、PA-018。任务页和中文目录定向 Vitest：2 个文件、13 项通过；使用模拟 API 数据在本机无头 Edge 检查 1440×900 空状态和 1280×720 任务详情，后者无水平溢出，未同意数据发送时派工按钮禁用。
- 未使用真实账号执行完整创建、派工与审批流程；未验证双机、模型、实时画面和原生客户端，界面状态不能代表真实任务验收通过。

## V-024：双机驱动与隧道试接

- 日期：2026-11-04；用户授权的两台 Linux 服务器。后台到云电脑 SSH 可达，云电脑主机密钥与用户从控制台提供的 SHA256 指纹一致；两机时间同步状态正常。
- 云电脑部署 Python 驱动、systemd socket 及受限 SSH 账号；安装 `xdotool`、`xclip`、`imagemagick` 和依赖。后台创建专用账号、密钥和 SSH 隧道服务；已有服务检查正常。
- 临时允许 SSH TCP 本地转发时，跨机 provision、generation/status、无租约文件请求拒绝和当前 X11 会话的 PNG 截图均通过。截图仅验证 PNG 和字节数，未记录画面内容。截图首次失败因 systemd 只读文件系统禁止 ImageMagick 写 `/tmp`，增加驱动服务 `/tmp` 写权限后通过。
- 当时的失败与限制：当 `AllowTcpForwarding no` 时，尽管 `AllowStreamLocalForwarding local`，实测 Unix socket 请求被拒绝；使用 `permitopen` 约束 TCP 也拒绝 Unix socket。当时已禁用并停止隧道；后续按单人使用授权启用较宽转发，当前结果见 V-026。

## V-024：浏览器标签图标缓存

- 日期：2026-11-04；关联 PA-018。使用本机无头 Edge 打开开发页面，验证标签图标的新版本地址均返回 HTTP 200，页面标题为 Sydney；`git diff --check` 通过。
- 未控制用户当前浏览器标签或读取其图标缓存，刷新后实际显示仍待用户确认；未运行桌面或移动端打包。

## V-023：Sydney 品牌和本地预览

- 日期：2026-11-04；关联 PA-009、PA-018。图标导出脚本成功运行；5 个定向 Vitest 文件共 69 项通过，覆盖 Web、桌面和移动端名称相关逻辑及现有本地化回归；11 个相关源码文件的 Biome 检查和 `git diff --check` 通过。
- 本地浏览器检查中文及英文登录页，标题分别为“登录 Sydney”和“Sign in to Sydney”，页面标题为 Sydney，显示透明原标志。Web 及移动端图标抽样尺寸、透明通道和透明角像素检查通过。
- 根据用户授权运行本地 Docker PostgreSQL、API、Worker、桌面监督和 Web；自动迁移入口在 Windows 上因 `spawnSync pnpm ENOENT` 失败，改为对新建本地数据库分别运行 Prisma 迁移、队列迁移和运行角色初始化。
- 未进行原生桌面打包、Android/iOS 构建、Apple Icon Composer、平台图标显示和真实任务验收；上游营销站、邮件及云服务仍有原品牌。浏览器预览和本地数据库不代表服务器部署验收。

## V-023：后台机清理后复核

- 日期：2026-11-04；SSH 只读复核显示桌面账号及家目录不存在，五个项目及基础服务 active，两个既有容器运行中；可用内存约 1092 MiB，根分区已用 13 GB、可用 25 GB。
- 清理后早前接口检查显示 canvas 与 cloud 文档返回 200、webdav 返回 401、myself-api 根路径返回 404；本次复核未重新测试接口业务功能。
- 仍有 XFCE 相关软件包。对候选卸载运行 APT 模拟时，计划引入 85 个新包，未执行实际卸载；不能认定桌面依赖已全部清除。

## V-022：桌面 Agent 基础操作

- 日期：2026-11-04；关联 PA-004、PA-010、PA-011、PA-012、PA-017。Windows 上以 Python 标准库执行 `python -m unittest discover -s infra/native-linux -p test_driver.py -q`，12 项通过；截图、鼠标、粘贴和滚动均使用替身。
- 新增 Provider 能力和命令超时的 Vitest 断言未运行；尝试使用此前存在的 TypeScript 6.0.3 缓存进行语法转译，但模块文件已缺失，命令失败。未运行类型检查，没有安装依赖。
- 未连接 X11、浏览器、模型、PostgreSQL 或远程服务器；不能由替身结果推断中文粘贴、运行时图形工具暴露、命令清理或双机操作已正常。

## V-021：双机方案文档核对

- 日期：2026-11-04；关联 PA-004、PA-005、PA-006、PA-009 至 PA-018。根据用户新部署方向与当前 `native-linux` Provider/socket、驱动 peer UID 及既有运维记录核对方案。
- 检查本轮文档差异空白和新增主要相对链接；没有执行应用测试、类型检查或双机运行。
- 未连接两台服务器，未验证 SSH 转发、身份、网络、资源、数据库、模型、桌面或恢复；已有本地 socket 代码与单机 systemd 草案不构成双机验收证据。

## V-020：重试保留任务预算

- 日期：2026-11-04；关联 PA-005、PA-006。实现及新增测试文件经现有 TypeScript 6.0.3 语法转译无诊断；这不是类型检查。
- 新增数据库替身用例检查重试时保留用量和截止时间、截止后不创建 Run；由于现有 Vitest 依赖缺失，测试未运行。
- 未连接 PostgreSQL 或模型；旧版已被清零的历史用量不能恢复，真实并发、辅助模型和费用仍待验收。

## V-019：创建幂等预算检查

- 日期：2026-11-04；关联 PA-001、PA-004、PA-005。使用现有 TypeScript 6.0.3 对数据库实现和新增测试进行语法转译，均无诊断；不是类型检查。
- 新增测试覆盖相同 nonce 和预算的重放、分别修改五个预算字段的拒绝；Vitest 因现有依赖缺失无法启动，测试未运行。
- 未启动或连接 PostgreSQL，未验证唯一约束、并发 upsert 和事务隔离；没有安装依赖。

## V-018：桌面指针校验与需求清单

- 日期：2026-11-04；关联 PA-010、PA-012；Windows 使用 Python 标准库，未启动驱动或桌面服务。
- 运行 `python -m unittest discover -s infra/native-linux -p test_driver.py -v`：8 项通过，包含非法指针动作不调用桌面命令、正常点击先移动后点击，以及既有租约和路径策略检查。测试使用替身，不执行真实鼠标操作。
- 需求清单依据当前代码、计划与模块审计整理，不构成新的功能测试或真实验收；Linux、X11、多动作部分执行、服务账号和数据库尚未验证。

## V-017：受管工具分发中断检查

- 日期：2026-11-04；关联 PA-005、PA-006、PA-010；Windows、Node.js 22.22.0，未安装依赖或启动服务。
- 对 `run-tools.ts` 和对应测试使用现有 TypeScript 6.0.3 的 `transpileModule` 执行语法转译，均无诊断；这不是类型检查或行为测试。
- 尝试从现有 pnpm 缓存运行 `run-tools.test.ts` 的单文件 Vitest，启动失败：缺少 `@vitest/utils`；新增用例与普通 Run 回归均未执行。
- 未验证 PostgreSQL、真实审批、模型、Linux 进程或外部副作用。审批门禁内部及已发出请求的取消竞态仍存在，不可作为停止证明。

## V-016：启动准备阶段控制传播

- 日期：2026-11-04；关联 PA-005、PA-006、PA-014。
- 新增 executor 替身测试：控制读取不可用时，应在模型和连接准备前结束 Attempt，且不自动重新排队；新增 watcher 预中止测试。Vitest 未能启动，测试未执行。
- watcher 内存替身检查 4 项通过：控制拒绝、读取异常、预先中止不读取，以及读取未结束时关闭不再中止。
- 4 个受影响 TypeScript 文件语法转译无诊断，不是完整类型检查；定向 Vitest 启动失败，缺少 `node_modules/vitest/vitest.mjs`。
- 未执行普通 Run 回归、真实 PostgreSQL 行锁与竞争、Linux 进程清理、Pi 或外部服务；控制轮询不能证明在途操作停止。
- `git diff --check` 及 6 份相关文档的尾随空白、冲突标记和相对文件链接检查通过。

## V-014：数据库边界、历史上限与排队事件

- 日期：2026-11-04；关联 PA-003、PA-005、PA-006、PA-010。
- 对照 Prisma schema 和生成的 `ExternalEffectWhereInput` 核查 effect 查询字段；用户归属经关联 Run 限制，排除内部 checkpoint。此为静态核查，不是数据库类型或 RLS 验证。
- 使用缓存 TypeScript 6.0.3 对 8 个相关 TS/TSX 文件做语法转译，诊断数为 0；不等同于类型检查。
- 用内存替身执行投影和历史读取检查：当前 Run 指针、缺失当前 Run、恰好达到历史上限、超限截断共 4 项通过；不等同于 Vitest、真实事务或并发测试。
- 排队事件、事务回滚、通知以及队列重放只完成代码与测试编写和静态检查，尚未运行集成测试。任务行与线程行锁顺序需通过 PostgreSQL 并发测试验证。
- 定向 Vitest 重试仍未启动：`pnpm exec vitest ...` 报 `Cannot find module node_modules/vitest/vitest.mjs`；没有安装或恢复依赖。
- `git diff --check` 通过；另对 6 份本轮文档检查尾随空白、冲突标记和相对文件链接，未发现问题。Git 检查不覆盖未跟踪文件。
- 未执行 Vitest、完整类型检查、真实 PostgreSQL、队列、Linux 桌面、模型及浏览器联调；当前 Node 版本低于项目要求，Vitest 依赖不完整，未安装或恢复依赖。

## V-013：任务控制、结果投影与排队取消修复

- 日期：2026-11-04；关联 PA-003、PA-005、PA-006、PA-010、PA-014。
- 代码修复：排队取消在 Task 行锁事务内增加 `managed_task`/`queued` 条件和可恢复状态清理；Worker 抢先领取时保持未确认；完成验证查询同一 Task 全部 Run 的未结算 effect；历史读取排除 `reconciled` effect；完成 Run 无 evidence 返回 `completion_unverified`，历史不完整时 API 不进入成功/确认路径；managed 工作台不再发送 `ask_user` 授权。
- 替身行为验证通过：排队取消、Worker 抢占竞争、跨 Run 未结算 effect、任务投影的未确认/已确认/活动取消状态。
- TypeScript/TSX 语法检查：7 个改动文件，错误数 0。未做完整类型检查。
- 定向 Vitest 尝试失败：启动时仍缺少 `@vitest/utils`，测试没有执行；没有安装或恢复依赖。
- 未执行：真实 PostgreSQL 行锁与迁移、API/Worker/Pi 集成、浏览器 E2E、Linux 驱动、模型/App、备份恢复和资源测量。
- `git diff --check` 已执行通过；不覆盖未跟踪文件，文档另做静态检查。

## V-015：授权续期与原生文件准入

- 日期：2026-11-04；关联 PA-004、PA-005、PA-010、PA-012、PA-014。
- `infra/native-linux/test_driver.py` 执行 6 项 Python unittest，全部通过；覆盖文件操作缺少/过期 lease、旧 fence、授权请求到达处理器、路径和桌面互斥。
- 使用缓存 TypeScript 6.0.3 对 `packages/db/src/task-execution.ts` 和对应测试做语法转译，诊断数为 0；不等同于完整类型检查。
- 内存替身检查通过 4 项：终态续期拒绝、续期状态竞争拒绝、条件更新成功、已有 Run 时 `retry=false` 拒绝。
- 未执行 Vitest、完整类型检查、真实 PostgreSQL/RLS/并发、Linux systemd/socket/账号权限、普通 Run 回归、Pi、模型、App 和浏览器 E2E。
- `git diff --check` 和本轮 7 份文档尾随空白、冲突标记、相对链接检查通过。

## V-012：managed 工具暴露与尽力中断

- 日期：2026-11-04；关联 P2/P3/P4、PA-004、PA-005、PA-006、PA-010、PA-014。
- 使用已有 TypeScript 6.0.3 缓存的内存转译及 Node 22.22.0 运行三个轻量检查：工具过滤保留已授权受支持工具并排除 helper/直通入口；控制轮询在状态变化或读取失败时中断；socket 替身在 AbortSignal 触发时关闭连接。三个检查通过，均不连接真实数据库或 Linux 驱动。
- `python -B infra/native-linux/test_driver.py`：3 项策略测试通过；Windows 使用测试替身，未启动桌面或服务。
- 对 10 个本轮 TypeScript 文件做 `transpileModule` 语法诊断，错误数 0；未做类型检查。
- `git diff --check` 通过（仅已跟踪差异）；10 份相关 Markdown 的相对文件路径、尾随空白及冲突标记检查通过。
- 尝试运行 4 个 Vitest 定向测试文件时启动失败：缓存缺少 `@vitest/utils`，任何测试均未执行；未恢复或安装依赖。当前 Node 22.22.0 低于项目要求的 22.22.2。
- 未执行：Executor/DB/Pi 集成与普通 Run 回归、真实 PostgreSQL、Linux socket 和进程清理、真实模型及 App。故工具隔离和中断机制均尚未生产验收。
- 未启动 Docker、数据库或桌面服务，未调用模型，未提交或推送。

## V-011：原生电脑租约与 managed Run 过期检查

- 日期：2026-11-04；关联 P2/P3/P4、PA-004、PA-005、PA-006、PA-010、PA-012、PA-014。
- 轻量语法检查：使用已有 TypeScript 6.0.3 缓存的 `transpileModule` 对 7 个改动 TypeScript 文件做语法诊断，错误数为 0；这不是类型检查。
- 轻量行为检查：用同一缓存将 Provider 转译到内存，在 Node 22.22.0 中以替身 transport 验证首次有效租约可读取、第二次失效租约被拒绝且没有第二次 transport 调用；通过。该检查未调用 factory、Executor、真实数据库或驱动。
- 测试失败：直接运行现有缓存 Vitest 4.1.12 的两个定向测试文件，启动时缺少 `@vitest/utils`，测试没有执行；未安装或恢复依赖。当前进程的 Node 22.22.0 也不满足项目声明的最低 22.22.2，后续应在满足版本要求的授权环境运行。
- 静态检查：`git diff --check` 通过（仅已跟踪差异）；本轮涉及的 11 份 Markdown 相对文件路径、尾随空白和冲突标记检查通过。
- 未执行：项目类型检查、Biome、真实 PostgreSQL 并发、Linux 驱动、原版与定制版端到端对照、模型及 App 连接。未经这些验证不能把修复标记为生产可用。
- 无 Docker、数据库、桌面或模型调用；未提交或推送。

## V-010：控制边界与审计复核

- 日期：2026-11-04；范围：停止确认、取消后完成确认、Native 后台检查参数及相关文档。
- 静态复审：核对调用方传入 computer ID、driver 无目标 Run 时检查 Bot 全部已跟踪进程；该查询仍不能证明空闲。核对服务端在无法证明静止时拒绝停止确认。
- 新增及调整了数据库和 Provider 测试；未执行测试、类型检查、格式工具、真实数据库或 Linux 运行验证，不能据此声称修复已验证。
- 静态检查：`git diff --check` 通过（仅涵盖 Git 已跟踪差异）；另检查本轮涉及的 13 份 Markdown，相对文件链接、尾随空白和冲突标记均通过。
- 没有安装依赖、启动服务、调用模型、提交或推送。

## V-009：模块静态审计与架构文档

- 日期：2026-11-04；范围：源码入口审阅、模块权限/状态边界、Native Provider 与 Web 路由针对性修正、项目架构说明、文档导航与相对链接。
- 审阅模块：core/contracts、DB task execution/history、Pi executor/runtime/helper、Native Linux Provider/driver/systemd、Task API/Web、Connector/OAuth/Messaging、Operations。
- 实际验证：代码与文档按调用链静态阅读；历史 V-003 至 V-008 只作为既有离线证据，本轮没有重跑。依赖仍不可用，未安装或恢复依赖。
- 代码修订：补 `/app/tasks` Web lazy route 与路由测试；Task 状态入口增加 expectedVersion 与安全转换；managed model/tool guard 显式进入 tenant DB context；Native Provider 改为 stop/destroy 显式 unsupported、关闭 PTY capability、接出 cancel/inspect，并传入 Run owner/fence/期限；新增 Web、DB、Provider 测试。上述测试未运行，不能标记通过。
- 文档检查：新增项目架构说明和七份模块审计报告；`git diff --check` 通过；相对链接扫描首次脚本对仓库根文件路径处理有误，修正脚本后重跑通过；尾随空白、冲突标记扫描通过，必需文档入口存在。
- 审计结论：DB task execution、Pi adapters、Native Linux、Operations 阻塞；core/contracts、API/Web、Connectors 条件通过。详见 `docs/audit/README.md`。
- 未执行：测试、类型检查、Biome、构建、PostgreSQL、Linux/socket/systemd、真实模型、OAuth/MCP/App、浏览器 E2E、备份恢复和资源测量。
- 限制：静态审阅不证明并发/租户隔离或服务器能力；暂停/取消的即时服务端中断与真实进程静止证明、helper/辅助模型预算覆盖仍不完整。新增 Provider、路由和 DB 状态机测试均未运行，全部相关实现需回归后重新评估。
- 成本与副作用：没有模型调用或服务启动，无额外 token/云费用。
- 提交状态：未提交、未推送。

## V-008：根目录迁移核对与 Native Provider 身份修正

- 日期：2026-11-04；范围：源码根目录布局、原生 Provider 的 Bot/代数/租约请求绑定。
- 实际检查：`git diff --check` 通过；源码依赖目录存在，但根级 Vitest、TypeScript、Biome 命令链接均缺失。调用 pnpm 缓存中的 Vitest 失败，缺少 `@vitest/utils`；TypeScript 与 Biome 缓存包缺少 Windows 平台二进制。
- 测试与类型检查：未执行成功；未安装、下载或重建依赖。当前 Node 为 22.22.0，与先前记录的 24.15.0 环境不同。
- 改动：新增跨 Bot 拒绝和 socket 身份字段覆盖测试；生产 transport 以 `ComputerRef` 绑定 Bot 与 generation，保留字段最后合并；Provider 无进程级单 Bot/代数状态。systemd 草案改为仓库根路径和实际读取的 socket 环境变量名。
- 清理：删除仅含 `app/docs` 的空迁移目录，以及两份生成的 `.pyc` 缓存；源码未移动。Linux socket、systemd 与权限隔离未验证。
- 提交状态：未提交、未推送；本机未启动任何服务或容器。

## V-007：P5/P6 离线收尾验证

恢复执行后补记（2026-11-03）：修复 Provider 接口实现并注册 `native-linux` 到 sandbox 工厂；挂载任务路由并对齐 db 函数签名后重跑：10 个定向测试文件共 116 项通过（含 Web 工作台、run-tools 及 keyless/web 回归 79 项），Python 驱动 3 项通过；core、db、adapters、api、web 类型检查均通过；Prisma schema 校验通过；Biome 检查 9 个改动文件通过（首次 12 错误，修复后复验通过）。上述均为离线测试，不构成服务器或生产验收。

日期：2026-11-03。Node 24.15.0，Vitest 4.1.12，单 Worker；数据库、Provider 和复制数据库标志均显式清空。

修复 `Tasks.test.tsx`：任务列表未渲染前不要点击；改为等待列表和详情出现。随后运行 6 个定向测试文件，共 72 项通过；Python 驱动策略测试另行执行，3 项通过。

最终定向测试文件：`task-execution.test.ts`、`task-tool-resource.test.ts`、`task-runtime-guards.test.ts`、`run-tools.test.ts`、`native-linux-sandbox.test.ts`、`Tasks.test.tsx`。另跑 `keyless-http-web.test.ts` 18 项通过。格式化后复跑上述 TypeScript 定向测试，共 72 项通过。

类型检查通过：`packages/db`、`packages/core`、`packages/adapters`、`apps/api`、`apps/web`。在 `packages/db` 执行 Prisma schema 校验通过。Biome 检查本批 10 个 TypeScript/TSX 文件通过；首次报告格式问题，`--write` 修复后复验通过。

未执行：真实 PostgreSQL 迁移与并发、真实模型、浏览器 E2E、Linux 服务、桌面和备份恢复演练。本批格式化后复跑的是上述 TypeScript 测试；Python 测试不受格式化影响。离线测试不能证明生产部署验收。

## V-006：原生桌面适配离线子项

日期：2026-11-03。Node 24.15.0、Vitest 4.1.12、单 Worker：`native-linux-sandbox.test.ts` 6 项通过，验证租约拒绝、代数绑定、失联不重放和未支持能力声明。Python 3.13 在 Windows 运行策略测试 3 项通过，覆盖路径校验和桌面租约互斥；使用测试替身替代 Windows 不存在的 Linux `pwd` 模块。

首次 Python 测试因 Windows 无 `pwd` 未能加载，加入仅用于测试的替身后重跑通过。没有启动本机服务、桌面、数据库或容器。未验证 Linux 的 Unix 套接字对端 UID、文件系统防符号链接、X11、进程组、systemd、屏幕体验和真实权限隔离；这些不能从 Windows 替身测试推断。

## V-005：任务持久化与执行门禁定向测试

日期：2026-11-03。Node 24.15.0，Vitest 4.1.12，单 Worker，数据库和 Provider 验证开关均为空。

执行 `vitest run`，限定 `task-execution.test.ts`、`task-tool-resource.test.ts`、`task-runtime-guards.test.ts`、`run-tools.test.ts`：4 个文件、59 项通过，约 35 秒。包括既有工具审计回归；数据库部分为事务替身。

Prisma 7.10.1 客户端生成成功，未启动服务或执行迁移。第一次使用根目录 Prisma 路径失败，改用已安装的数据库包 CLI 后成功。首次数据库类型检查发现三个可空类型问题，已修正；随后适配器包类型检查通过，后续新增修改需在批次收尾复核。

尚未验证：真实数据库行锁/事务竞争、API 浏览器联调、模型发送、桌面和服务器部署。没有把定向测试等同于 P2/P3 整阶段验收。

只记录实际执行的验证。规划中的测试写在 [总计划](PLAN.md)，未执行、跳过、失败和通过分别说明，不用“计划覆盖”代替通过证据。

## 本机验证约束

- 纯文档改动只做相对链接、格式、状态和基线一致性检查，不运行应用测试。
- 后续代码验证优先运行受影响的确定性离线测试，限制并发与范围。
- 不自动运行全工作区构建、安装依赖、启动 Docker、数据库或桌面。
- 真实模型、外部副作用、Linux 桌面和部署验证在明确授权的环境执行，并记录成本及数据范围。
- 不在此粘贴密钥、连接串、原始运行日志或敏感内容；用命令、退出状态和结论描述证据。

## V-000：历史底座验证

- 日期：2026-11-03，来自前期已执行结果；本次未重跑。
- 环境：独立 Rakazo 代码副本，固定提交 `aebca9dcfd0cf734484ce41e3c5ad9521551659d`，当时使用 Node.js 24.15.0、pnpm 9.15.0。
- 通过：依赖安装、22 项静态检查任务、2 个文件中的 21 项 Pi 离线测试、Compose 配置语法检查。
- 失败或未完成：Linux 桌面镜像构建、PostgreSQL 镜像拉取、完整服务启动。
- 限制：不代表原生 Linux Provider、DSH 风格任务编排、真实模型或任何 Sydney 功能通过验收。
- 详细记录：[底座试点记录](../docs/rakazo-evaluation.md)。

## V-001：P0 文档结构与一致性

- 日期：2026-11-03。
- 范围：`docx/`、协作约定、文档导航及相关技术方向记录。
- 实际执行：使用 PowerShell 检查 10 份变更文档的相对文件链接及尾随空白，核对 `docx/` 五份必须文件；解析基线 JSON，通过 Git 核对固定提交与源码工作区状态。
- 实际结果：以上检查通过；固定提交与记录一致，独立 Rakazo 源码工作区无改动。
- 阶段状态：P0 仅文档体系完成，P1 至 P6 未开始；没有将业务或服务器能力标为完成。
- 未执行：业务测试、构建、依赖安装、服务启动和服务器操作；本次仅改文档，无需运行。
- 通过条件：链接有效、事实与基线一致、阶段状态有证据、不把占位运维项写成可执行方案。
- 限制：这是文档检查，不是应用测试或原生服务器运行验收；历史底座测试没有在本次重跑。

## V-002：P1 设计核对与文档检查

- 日期：2026-11-03；关联阶段：P1 技术子项；业务场景及服务器验收未完成。
- 实际核对：固定源码的 Prisma Task/Run/Attempt/Ticket/ExternalEffect、Run 状态机、审批、取消、电脑租约、Pi 工具入口及原生桌面相关 Provider。源码符号与定位见两份设计文档。
- 静态审查结论：可以复用现有执行和存储；现有 `desktop` 并非生产图形桌面；不删除生产保护、不启动旧 host runner 来替代新 Provider。
- 实际执行：PowerShell 检查当前仓库 26 份 Markdown 的相对文件链接、尾随空白和冲突标记；解析基线 JSON，与应用 HEAD `aebca9dcfd0cf734484ce41e3c5ad9521551659d` 比较。
- 结果：以上检查通过；JSON 新增当前部署方向，原 Docker Provider 字段保留为历史试点记录，不作为当前部署配置。
- 未执行：发行版支持周期/外部软件最新版本核验、服务器能力、目录权限、协议签名和 Linux 桌面实测。候选系统、服务、路径及参数只作为设计，不作为采购或生产可用声明。

## V-003：P2 派工与授权纯策略

- 日期：2026-11-03；关联需求：PA-001、PA-003 至 PA-006、PA-010；状态：纯策略子项通过，P2 整阶段未完成。
- 环境：Windows 本机、已安装 Node.js 24.15.0、Vitest 4.1.12；使用现有依赖，没有安装、下载或调用 pnpm 全工作区命令。
- 工作目录：项目仓库根目录。测试显式清空 VERIFY_DATABASE / VERIFY_PROVIDERS / COPY_TEST_DATABASE 的进程级标志，使用原离线测试配置。
- 测试命令：`node node_modules/vitest/vitest.mjs run packages/core/src/task-assignment.test.ts packages/core/src/task-mandate.test.ts packages/core/src/run-state.test.ts --project shared --maxWorkers 1`。
- 结果：3 个测试文件、150 项通过。覆盖派工去重、旧空 nonce、归属冲突、终态/活动状态、显式重试、历史完整性、未知副作用、次数上限；授权身份、来源、时间边界、撤销、缺失控制状态、租约、接管、审批和精确 scope 匹配。
- 类型检查命令：`node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json`；退出状态 0，只检查核心包，未运行全工作区构建。
- 格式及规则：对 `task-assignment.ts`、`task-assignment.test.ts`、`task-mandate.ts`、`task-mandate.test.ts`、`index.ts` 运行现有 Biome `check`；最终 5 文件通过。Git 跟踪差异空白检查通过，新增文件另由 Biome 检查。
- 过程失败：早期 Biome 检查报告测试/授权源码的格式换行差异；修复后复验通过。业务测试未出现失败；150 项结果包含既有 Run 状态机回归，不是 150 项端到端任务。
- 独立复核：子 Agent 对派工及授权模块只读审查；主 Agent 修复安全状态可缺省问题后复审无其他有证据的独立缺陷。静态审查不代替本次实际测试。
- 成本与副作用：未启动模型、数据库、Docker、桌面或应用服务；新策略本身无 I/O，不产生模型 token 费用。
- 限制：尚无可信授权入口、撤销存储读取、事务并发、真实 fence/路径/网络校验、Pi 接线或服务器运行验证。`reuse` 只返回已有 Run，不调度；`create` 只返回意图，不产生运行记录；允许结果不证明认证和生产授权有效。

## V-004：P2 状态投影与现有数据库读取适配

- 日期：2026-11-03；关联需求：PA-003、PA-005、PA-006、PA-010。
- 环境：Windows 本机、已安装 Node.js 24.15.0 与现有依赖；未安装或下载任何包。
- 新增范围：`packages/core/src/task-projection.test.ts`、`packages/db/src/task-execution-history.test.ts`；数据库测试使用确定性 Prisma 替身和现有 AsyncLocalStorage tenant 上下文，不连接数据库。
- 首轮测试：指定上述两个文件、shared 项目、单 worker，71 项通过。之后补控制意图保留、零 fence 及未结束记录的保守处理，进行最终回归。
- 最终测试命令：`node node_modules/vitest/vitest.mjs run packages/core/src/task-projection.test.ts packages/db/src/task-execution-history.test.ts packages/core/src/task-assignment.test.ts packages/core/src/task-mandate.test.ts packages/core/src/run-state.test.ts --project shared --maxWorkers 1`。
- 最终结果：5 个文件、222 项通过，其中本轮新增 72 项，前轮 150 项为实际重跑；耗时约 9 秒。进程级 VERIFY_DATABASE / VERIFY_PROVIDERS / COPY_TEST_DATABASE 标志显式清空。
- 覆盖：取消与暂停的请求/静止确认、正常在途与未知效果、租约 owner/fence/到期、状态和 Attempt 冲突、独立完成证据、旧历史保留；数据库上下文与跨归属拒绝、查询字段、checkpoint 过滤、每类数量上限、截断标志及错误传播；读取与投影的离线组合。
- 类型检查：分别运行 `node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json` 和 `node node_modules/typescript/bin/tsc --noEmit -p packages/db/tsconfig.json`，最终均退出 0。
- 格式/规则：本轮 4 个新增模块/测试及核心/数据库的 `index.ts` 共 6 个文件，现有 Biome `check` 最终通过。未运行全工作区构建或完整测试集。
- 失败保留：首次类型检查报告状态字符串类型和 mock 参数推断错误，修复后两包通过；格式检查先后报告导入排序/换行及新条件换行问题，修复后最终通过。业务测试本轮未失败。
- 文档验证：PowerShell 核对当前 28 份 Markdown 的相对文件链接、尾随空白与冲突标记，解析固定基线 JSON 并与应用 HEAD 核对，全部通过。应用 Git 跟踪差异空白检查及 4 个本轮新增文件的空白/冲突标记检查也通过。
- 未执行：真实 PostgreSQL 查询、RLS、RepeatableRead 并发隔离、迁移、Linux 服务/桌面、模型或完整用户任务。替身验证参数与逻辑，不能证明真实数据库隔离已经生效。
- 成本与副作用：未启动 Docker、数据库、应用或桌面服务，未调用真实模型；没有模型 token 费用。没有创建新对话窗口或调用子代理。
- 限制：读适配器和投影仅导出，API/Worker 尚未调用；currentRunId、控制静止和完成证据仍需可信存储与版本化接线，不能从展示状态推断实际进程已经停止。

## V-033：云电脑实时桌面服务

- 日期：2026-11-04；范围：用户指定的 Ubuntu 24.04 云电脑侧桌面画面服务。
- 已执行：安装 `x11vnc`、`websockify`、`novnc`；创建并启用 `sydney-screen-vnc.service`、`sydney-screen-websockify.service`；两个服务仅监听云电脑回环地址的 `5900`、`6080` 端口。
- 已验证：`x11vnc` 以 `sydney-desktop` 用户读取当前 `DISPLAY=:10` 成功；远端 noVNC 页面返回 HTTP 200；本机经 SSH 转发连接 WebSocket 后收到 RFB `003.008` 握手。
- 未执行：后台机到云电脑的屏幕端口持久化隧道、API 屏幕目标签发、Web 实际工作台实时画面和输入接管。现有 Provider 屏幕会话接线仍未完成。
- 限制：当前图形会话来自 XRDP，云电脑重启或 XRDP 会话变化后需重新核对 `DISPLAY` 与 `XAUTHORITY`；本次没有开放公网端口，没有执行重启恢复、回滚或高负载验证。

## V-039：后台屏幕隧道接入受阻

- 日期：2026-11-04；范围：后台服务器屏幕转发的只读核查。
- 已验证：云电脑可连接后台的 SSH、API 和 Web TCP 端口；云电脑现有 `sydney-tunnel` SSH 会话来自后台服务器且保持建立；本机无法直接连接后台 SSH。
- 未完成：使用本机现有密钥经云电脑跳板登录后台失败，因此没有修改或重启 `sydney-tunnel.service`，没有新增 `6080` 转发，也没有执行后台 Web 实时桌面验证。
- 结论：云电脑侧屏幕服务已通过 V-033；后台屏幕隧道和 Provider/Web 接线仍待后台管理密钥或双机联动窗口完成。

## V-040：后台只读屏幕隧道

- 日期：2026-11-04；范围：用户授权的两台服务器之间的屏幕传输。
- 云电脑 VNC 服务已启用 `-viewonly`；后台独立 `sydney-screen-tunnel.service` 为 enabled、active，后台 `127.0.0.1:16080` 转发至云电脑 `127.0.0.1:6080`，使用现有专用隧道账号与固定主机密钥。
- 后台经隧道请求 noVNC 页面返回 200，WebSocket 升级返回 101 且收到 RFB `003.008`；API、Worker、Web 和原驱动隧道保持 active。服务启动后的首次立即检查未等到端口就绪而退出，随后复查通过。
- 未验证 Web 实际显示、输入拒绝的端到端行为、身份与会话授权、隧道重连及服务器重启。回环端口无独立认证，同机其他可连接回环端口的进程可读取画面；不可视为完整访问控制。

## V-041：原生只读屏幕接线离线验证

- 日期：2026-11-04；范围：原生 Provider、屏幕配置映射和只读身份绑定。
- 本机 adapters TypeScript 类型检查通过；新增屏幕身份及配置映射的两个定向测试通过。完整的两个定向文件共 32 项中，先前运行有 29 项通过、2 项 Unix socket 测试在 Windows 失败；新增配置测试随后单独通过，不能将完整套件记为通过。
- Biome 检查未通过：原生文件包含既有格式和生成器规则问题，也有本轮测试格式问题；没有格式化其他窗口已有代码。`git diff --check` 另行检查。
- 后台有一个未归档 Bot，原生电脑当前未处于 running；空闲内存约 83 MiB。未部署应用代码、未绑定服务器配置、未构建或重启 API；Web 实时桌面、开放连接的驱动代次失效、只读输入拒绝和重启恢复均未验收。

## V-042：只读屏幕连接复核与部署中断

- 日期：2026-11-04。API 对原生屏幕票据复核时再次验证驱动代次、绑定身份及回环目标；代理与环境配置两个测试文件共 37 项通过，API TypeScript 类型检查通过。
- 后台源码逐文件与本机变更比较，确认仅含本次屏幕变动后，在 `/var/backups/sydney-screen-20261104` 备份相关源码及 API 产物，暂存五个改动源码文件；未修改 API 环境配置或当前正式产物。
- 启动 systemd 限制内存和 CPU 的候选 API 构建后，命令一直未返回；后台新 SSH 连接及从云电脑读取后台 SSH 标识超时。云电脑自身 SSH、VNC 和 noVNC 服务仍正常；后台进程、构建是否仍运行及原因未知。
- 未执行正式产物切换、API 重启、账户绑定、浏览器实测和回滚。恢复后台连接后须先核查状态与候选构建，不应重复启动构建或假定服务已停止。

## 后续验证记录格式

每条使用连续编号，包含日期、关联阶段与需求、版本和环境、命令或步骤、实际结果、失败原因、未执行项、成本或副作用及适用限制。修复后复验保留前一次失败结论，再追加最终结果。

## V-049：实时屏幕仍未完成端到端验收

- 日期：2026-11-05；关联需求：PA-010、PA-012、PA-017、PA-018；状态：未通过，问题保留。
- 环境：Windows 本机通过现有 SSH 隧道访问 `127.0.0.1:5173`；云电脑运行 `sydney-web-cloud`、`sydney-web-cloud-link`、`sydney-screen-vnc`、`sydney-screen-websockify`；后台运行 Web 转发、API、Worker 和 `sydney-screen-tunnel`。
- 已验证：云电脑 Web 独立网络命名空间内的 `5174`、`3100`、`16080` 均监听；桥接 `/ready` 返回 200；云电脑的 `api.sock`、`screen.sock`、`web.sock` 存在；本机页面、会话接口和监控配置均返回 200；后台 API 的屏幕票据复核请求返回 200；noVNC 页面及静态资源曾返回 200。
- 已执行修复：重启云电脑 `sydney-web-cloud-link.service` 和 `sydney-web-cloud.service`，重新生成运行时 socket；重启后服务均为 active，`5174`、`3100`、`16080` 和 `/ready` 复查通过。
- 实际结果：用户侧仍无法连接实时屏幕。自动浏览器复现可以取得 `computer/screenUrl` 并加载 noVNC 页面资源，但未稳定观察到最终屏幕 iframe/WebSocket 建立；用户在重建链路后仍反馈失败。
- 相关异常：此前云电脑 Web 日志出现 `screen.proxy.target_rejected` 的 `authority_unavailable`、`screen.proxy.recheck_unavailable`，云电脑 Web SSH 链路出现过 `channel open failed: connect failed: Connection refused`；重启链路后尚未形成通过用户浏览器的稳定成功证据。
- 副作用与限制：排查期间重复使用测试账号登录，触发过 API 登录限流 429；后续验证不得继续高频登录。没有提交或推送代码，没有修改数据库状态，没有开放公网屏幕端口。
- 未完成：浏览器 Network 中实际 WebSocket 握手的状态、后台 `15173` 反向转发与云电脑 Web 进程的逐跳关联、noVNC 自动重连原因、真实桌面画面和断线恢复仍未验收。
- 下一步：暂不继续重启服务；在下一轮使用一个已登录浏览器会话，记录单次 `computer/screenUrl`、`/novnc/.../websockify` 握手和关闭码，并同时对照云电脑 Web、后台转发和 API 日志，定位具体断点后再做最小修复。

## 聊天外观方案核对（2026-11-04）

- 本次仅核对现有深浅外观入口、共享样式变量和聊天气泡颜色位置，并同步需求、计划及历史决策；聊天外观功能尚未实现。
- 未运行应用、浏览器、测试或服务器验证；方案中的切换、保存、兼容及无障碍均待实现后验收。

## 聊天外观首版离线验证（2026-11-04）

- Web 定向 Vitest：设置、账号设置、消息和聊天渲染共 4 个文件、40 项通过；覆盖样式保存与取消、组合选择、缺失引用回退、模拟 IndexedDB 恢复和存储失败，以及聊天样式变量应用。加入上限保护后单独重跑设置测试 4 项通过。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过；7 个相关文件的 Biome 检查通过。`pnpm --filter @rakazo/web check` 因本机 Node 22.22.0 低于仓库要求 22.22.2 而未启动；改用现有 `pnpm exec tsc` 执行项目配置，不安装依赖。
- 一次联合测试因模拟 IndexedDB 的图片状态泄漏到其他测试文件导致 3 项失败；清理测试共享状态后重跑 40 项通过。运行时图片上传解码、真实 IndexedDB、浏览器视觉、无障碍和目标尺寸未验证；未部署或运行服务器。

## 移动端聊天外观接线验证（2026-11-04）

- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`：通过，覆盖移动端聊天外观存储、设置页、聊天页和消息气泡类型。
- `pnpm exec vitest run apps/mobile/lib/appearance.test.ts apps/mobile/lib/account-screen.test.tsx --maxWorkers=1`：2 个文件 20 项通过，覆盖既有移动端主题和账户设置回归；本次新设置页没有实机测试。
- 相关移动端非设置源码执行 Biome 检查，其中新增聊天存储、消息气泡和聊天页修改已修复格式；Windows shell 对带括号的设置路径无法稳定传给 Biome，设置页和设置布局未单独完成格式命令，类型检查仍通过。
- 未运行 Expo iOS/Android 构建、真机图片选择、应用重启后的文件恢复、SecureStore 真实读写、视觉/辅助功能和跨设备同步；移动端目前只与自身本地配置接通，未与 Web 配置同步。

## 热插拔插件离线契约验证（2026-11-04）

- 范围：`hot-plugin-lifecycle.ts` 状态转换及新调用准入；Node 22.22.0，本机无服务和外部请求。
- `pnpm exec vitest run packages/core/src/hot-plugin-lifecycle.test.ts --maxWorkers=1`：1 个文件 4 项通过；格式修复后重新运行仍通过。
- `pnpm exec biome check` 首次提示导入顺序和格式问题；对两个新增文件执行 `biome check --write` 后通过。pnpm 提示根配置部分字段不再读取；本次未安装或修改依赖。
- 未运行类型检查、真实进程、数据库、跨 Worker 并发、服务器隔离、现有插件安装回归或完整工作区测试；纯函数不验证宿主身份、原子性、授权或外部副作用。

## 热插拔固定宿主试点验证（2026-11-04）

- 环境：本机 Node 22.22.0；仅启动测试用固定 Node 子进程，无服务器、数据库、外部服务或真实工作区访问。
- `pnpm exec vitest run packages/adapters/src/hot-plugin-pilot.test.ts packages/core/src/hot-plugin-lifecycle.test.ts --maxWorkers=1`：2 个文件 12 项通过；覆盖真实子进程启停、在途排空、崩溃、超时、协议错误、输出上限和另一实例继续处理。
- 对新增文件运行 Biome 并修复格式；`pnpm exec tsc --ignoreConfig --noEmit --skipLibCheck --types node --target es2022 --module nodenext --moduleResolution nodenext packages/adapters/src/hot-plugin-pilot.ts packages/core/src/hot-plugin-lifecycle.ts` 通过。首次单文件类型检查缺少 `--ignoreConfig`，第二次缺少 `--types node`，修正参数后通过；不等同工作区类型检查。
- 未验证真实 Linux 权限、网络或资源隔离、进程树清理、强制终止竞态、目标服务器部署、持久化、安装升级和现有 Agent/审批链；pnpm 提示根配置部分字段不再读取，未更改或安装依赖。

## 移动端其他页面玻璃风格统一验证（2026-11-06）

- 范围：`SettingsRows`、`SettingsOverlay`、模型角色与供应商列表，以及活动、空间搜索、文件、消息设置和插件提交页面的移动端样式接线。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过；覆盖本轮新增的 React 类名和共享样式接入。
- `git diff --check`：通过；未发现尾随空格或补丁空白错误。
- 未运行 Web 服务、浏览器 E2E、截图对照、手机实机、软键盘、深色主题和部署验证；因此仅确认静态接线正确，不能标记为视觉验收完成。
- 未启动 Docker、数据库、桌面服务或真实模型；无安装、配置、权限、数据和运维路径变化。

## 移动端工作台组件玻璃质感验证（2026-11-06）

- 范围：移动端搜索框、连接应用入口、新建 Bot 入口与弹窗、Bot/群聊列表、账号入口、集成弹窗及通用移动端 Dialog/Popover 表面。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过；覆盖本轮新增的组件样式类名和 JSX 接线。
- `git diff --check`：通过；未发现补丁空白错误。
- `pnpm exec vitest run apps/web/src/components/SidebarFooter.test.tsx apps/web/src/pages/shell/create-bot-dialog.test.tsx apps/web/src/App.test.tsx --maxWorkers=1`：3 个文件、37 项通过。
- `pnpm --config.engine-strict=false --filter @rakazo/web build`：生产构建成功，Vite 完成 6,119 个模块转换；构建仅提示当前 Node `22.22.0` 低于仓库要求 `22.22.2`。
- 未启动 Web 服务，未执行真实浏览器截图、手机实机、软键盘、深色主题、`backdrop-filter` 降级和部署验证；因此不能将视觉效果标记为实机验收完成。
- 本轮没有修改安装、配置、启动、服务、权限或数据路径，也没有运行 Docker、数据库或全工作区构建。

## Bot 人格库验证（2026-11-06）

- 范围：人格预设库、新建 Bot 人格选择、Bot 设置中的人格切换和现有自定义指令兼容。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。
- `pnpm exec vitest run apps/web/src/lib/personality-library.test.ts apps/web/src/pages/shell/create-bot-dialog.test.tsx apps/web/src/pages/shell/bot-panel.test.tsx --maxWorkers=1`：3 个文件、35 项通过；覆盖人格预设识别、新建 Bot 请求包含所选人格指令以及原 Bot 设置回归。
- 相关新增和修改文件的 `pnpm exec biome check ...`：通过；`git diff --check`：通过。
- `pnpm --config.engine-strict=false --filter @rakazo/web build`：生产构建成功，Vite 完成 6,121 个模块转换；当前 Node `22.22.0` 低于仓库要求 `22.22.2`，构建输出保留引擎警告。
- 未运行真实 API/数据库、真实模型、浏览器视觉、手机实机、人格文案本地化和部署；没有验证人格指令对不同模型的实际输出质量。

## CI 失败修复离线验证（2026-11-06）

- `pnpm exec vitest run packages/auth/src/oidc.test.ts --maxWorkers=1`：105 项通过，覆盖 OIDC 登录、账户关联、重新认证和账户删除。
- `pnpm exec vitest run apps/web/src/call-routes.test.tsx apps/desktop/src/setup.test.ts --maxWorkers=1`：16 项通过，覆盖通话离开 Shell 后的路由和桌面启动页品牌文案。
- `pnpm exec vitest run apps/mobile/lib/i18n.test.ts apps/mobile/lib/settings-sheet.test.ts --maxWorkers=1`：26 项通过，覆盖新增聊天外观翻译键和设置页链接。
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`：通过；`pnpm exec turbo check --continue` 中除本地旧 Expo 依赖检查外的 21 个任务通过。
- 相关改动执行 `pnpm exec biome check`：通过；`git diff --check`：通过。
- 未完成：本机 `node_modules` 仍是 Expo 57.0.31 等旧补丁版本，移动端 `expo install --check` 因本机 Node 22.22.0 和旧安装失败；未重装依赖、未运行 PostgreSQL、Docker、浏览器 E2E、移动端实机或生产部署。锁文件已更新，需由 GitHub CI 的干净安装确认。

## CI 第二轮回归修复验证（2026-11-06）

- `pnpm exec vitest run apps/web/src/components/ChatAppearanceSettings.test.tsx apps/web/src/components/ai/CollaborationMarker.test.tsx apps/web/src/lib/index-html-theme.test.ts packages/ui-web/src/logo-avatar.test.tsx infra/updater/src/publish-workflow.test.ts infra/updater/src/compose-env.test.ts apps/mobile/lib/chat-appearance.test.ts --maxWorkers=1`：7 个文件、59 项通过。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过；相关文件的 Biome 检查和 `git diff --check`：通过。
- `pnpm exec vitest run --shard=2/3`：未作为成功验证，Windows 本地环境触发多个路径、权限、外部服务和 Linux 行为相关的既有失败后已停止；不代表 GitHub Linux 分片结果。
- GitHub 首轮新提交已确认失败原因并完成本轮修复；第二轮提交后的 CI 尚待运行完成，未将其标记为通过。

## CI 第三轮测试环境修复验证（2026-11-06）

- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`：通过。
- `pnpm exec tsc --noEmit -p packages/testkit/tsconfig.json`：通过。
- `pnpm exec vitest run apps/web/src/components/ChatAppearanceSettings.test.tsx apps/mobile/lib/chat-appearance.test.ts --maxWorkers=1`：2 个文件、7 项通过。
- 第三轮提交 `f956376f9` 已推送；GitHub API 查询随后触发匿名请求限流，CI 最终状态暂未取得，不能标记为通过。

## CI 第四轮回归修复验证（2026-11-07）

- `pnpm exec vitest run apps/mobile/lib/thread-sender-colors.test.tsx apps/mobile/lib/thread-card-width.test.tsx apps/mobile/lib/message-mention-accessibility.test.tsx packages/ui-web/src/group-avatar.test.tsx`：4 个文件、42 项通过。
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`：通过。
- `pnpm exec tsc --noEmit -p packages/ui-web/tsconfig.json`：通过。
- `pnpm exec turbo run check --filter=@rakazo/mobile --filter=@rakazo/ui-web --filter=@rakazo/desktop`：桌面、ui-web 及其依赖检查通过；移动端在本机 `node_modules` 的 Expo 补丁版本落后于锁文件时被 `expo install --check` 拒绝，随后直接运行移动端 TypeScript 检查通过。
- 批量移动端与 ui-web 测试的本地失败文件在共享测试环境中不稳定；与未改动基线比较，本轮没有新增失败。未将 Windows 本地批量结果作为 Linux CI 结论。
- GitHub CI 运行 `42337317748`（提交 `f7297933c`）：Lint/typecheck、Unit tests 1/3 至 3/3、Postgres journeys、服务器镜像构建和发布、Checks、移动端更新全部通过；不适用的 E2E/生产构建任务按变更范围跳过。
- `deploy-production` 被跳过：仓库没有 `PRODUCTION_DEPLOY_ENABLED=true`，且没有 `production` environment、生产部署变量或部署凭据；因此本次没有执行生产发布。
- `Invoke-WebRequest https://pc.zxlup.xin/health`：返回 HTTP 200 和 `{"ok":true}`；这是现有线上服务的健康检查，不是本次提交的部署证据。

## 生产域名切换验证（2026-11-07）

- 范围：GitHub production environment 链接、桌面默认云端地址、Web Passkey 域名测试、官网入口和部署验证记录。
- `pnpm exec vitest run apps/web/src/lib/passkeys.test.ts`：1 个文件、9 项通过。
- `pnpm exec vitest run apps/desktop/src/setup-config.test.ts`：1 个文件、50 项通过。
- `pnpm --config.engine-strict=false --filter @rakazo/www check`：0 错误、0 警告、1 个 Astro/Zod deprecation hint；普通命令因本机 Node `22.22.0` 低于仓库要求 `22.22.2` 被引擎门禁拒绝。
- 源码检索：未发现运行配置和用户入口仍使用上游默认域名。
- 未执行生产服务器 `.env`、DNS、Caddy/TLS、认证回调或真实浏览器 Passkey 的线上复核；本次只完成源码和文档切换。
# V-Overlay：生产 Compose 本地 overlay 离线验证

- 日期：2026-11-07；范围：部署 launcher、`deploy-main.sh`、Compose updater、失败恢复和旧 revision 兼容边界。
- 通过：`pnpm exec vitest run packages/core/src/compose-update.test.ts infra/updater/src/updater-logic.test.ts infra/updater/src/compose-service.test.ts --maxWorkers=1`，3 个文件、148 项通过；覆盖无 overlay 默认、有效 overlay 路径契约、缺失/非法路径、Compose 文件顺序、只读挂载、回滚和恢复参数复用。
- 通过：updater 相关新增恢复断言已写入 `infra/updater/src/fork-recovery.test.ts` 和 `infra/updater/src/index.test.ts`；Windows 下 fork recovery 被既有 `skipIf` 跳过。
- 未通过/未执行：`packages/testkit/src/deploy-script.test.ts` 在本机 Windows 因 `/bin/bash` 不存在无法执行，31 项均在进程启动阶段失败；不是脚本行为断言。使用 `C:\msys64\usr\bin\bash.exe -n infra/compose/deploy-main.sh` 和对应 launcher 命令检查通过。
- 未执行：Docker Compose 合并、真实文件所有权/权限、生产 launcher 安装、线上部署/回滚、native-linux socket sidecar、截图、输入、websockify 容器链路和断线恢复。
