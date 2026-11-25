# GitHub 个人主页与开源探索模块实施方案

当前范围与阶段以 [总计划](../PLAN.md#追加目标github-上线与项目工作区可用闭环pa-022pa-024) 为准，本文保留原 PC 方案并补充手机原生接线。
更新日期：2026-11-20。
关联需求：PA-004、PA-010、PA-017、PA-018、PA-022、PA-023、PA-024。  
架构决策：[ADR-0023](../../docs/adr/0023-github-module-integration.md)。

## 1. 范围与目标

在 PC 工作台新增独立「GitHub 模块」（路由 `/app/github`），融合以下核心能力：

1. **无回调依赖的账号连接**：支持 Personal Access Token（Fine-grained / Classic PAT）校验绑定、更换与断开，密文经 `SecretStore` 持久化，状态栏展示 `@login`、高危 Scope 提醒与剩余 API 配额。
2. **个人主页与提交记录热力图**：展示头像（遵循远程图片隐私开关）、个人简介、社交与仓库统计、置顶/近期活跃仓库，以及基于 GitHub GraphQL `contributionsCollection` 的 **52/53 周提交贡献热力图**（支持年份切换、连续活跃天数计算、悬停/键盘无障碍详情）。
3. **我的远端项目**：支持关键词过滤、归属角色（Owner / Collaborator / Organization）、可见性（Public / Private / Fork / Archived）、排序切换与分页浏览；顶部提供 **「隐藏私有仓库」** 快捷隐私开关。
4. **搜索开源项目**：支持关键词 + 语言、最低 Star 数、活跃时间范围、Topic 标签与排序组合检索；已连接账号复用认证配额，未连接账号支持公开匿名检索降级。
5. **仓库速览抽屉与 Agent 能力融合**：
   - 点击任意远端或开源仓库展开右侧速览抽屉（`README.md` 安全渲染、近期 Commits、最新 Release、HTTPS/SSH 克隆地址复制、自有仓库 Webhook 提示）；
   - 支持 **「交给 Bot 分析」**，将结构化仓库上下文安全写入选定 Bot 的会话草稿并跳转对话；
   - 在 Agent 执行层注册 4 个直连只读工具：`github_get_profile`、`github_list_my_repos`、`github_search_repos`、`github_read_repo`，仅在用户已连接且未被 Bot 禁用时按权限暴露。

## 2. 模块拆分与写集边界

下表保留原开发阶段的模块划分。2026-11-20 续作由当前窗口独立执行，不调用子代理，实际归属以 [窗口分工](../WORKSTREAMS.md) 为准：

| 模块 | 负责范围与写集 | 依赖 | 验收条件 |
| --- | --- | --- | --- |
| **G0/Foundation（主窗口）** | `packages/contracts/src/{github.ts,builtin-tools.ts,analytics.ts,rpc.ts,index.ts}`、`packages/adapter-kit/src/{github.ts,index.ts}`、`packages/core/src/{action-approval.ts,product-analytics.ts}` 及测试、`packages/db/prisma/schema.prisma` 与迁移 SQL、`apps/web/src/pages/github/types.ts` 及组件占位、计划与设计文档 | 无 | 共享契约、Prisma 客户端类型与前端跨切片接口通过 `tsc --noEmit` |
| **M1 适配层与 Agent 工具** | `packages/adapters/src/{github-client.ts,github-emulator.ts,github-connections.ts,github-tools.ts,builtin-tools.ts,run-tool-selection.ts,executor.ts,index.ts}` 及对应单测（不触碰 `user-device-client.*`） | Foundation | GraphQL 热力图、REST 仓库/搜索/详情、固定源防重定向、Token 脱敏、缓存隔离、Emulator 与 4 个只读工具通过定向单测及 `@rakazo/adapters` `tsc` |
| **M2 服务端 API 与安全审计** | `apps/api/src/routes/github.ts`、`apps/api/src/{router.ts,security-audit.ts,security-audit.test.ts,env.ts,github-router.test.ts}` | Foundation | 登录隔离、连接/解绑审计事件、匿名搜索降级、错误脱敏与状态码映射通过单测及 `@rakazo/api` `tsc` |
| **M3 前端壳层、主页与热力图** | `apps/web/src/pages/GithubPage.tsx`、`apps/web/src/pages/github/{GithubConnectDialog.tsx,GithubProfileOverview.tsx,GithubContributionHeatmap.tsx}`、`apps/web/src/{App.tsx,components/SidebarFooter.tsx,components/PageBreadcrumb.tsx,pages/shell/shell-sidebar.tsx}` 及测试 | Foundation | `/app/github` 路由与侧栏入口、PAT 连接弹窗、隐私开关、个人主页及 52 周热力图年份切换通过组件测试与类型检查 |
| **M4 远端仓库、开源检索与速览抽屉** | `apps/web/src/pages/github/{GithubRepoList.tsx,GithubExploreSearch.tsx,GithubRepoDrawer.tsx,GithubExploreAndRepos.test.tsx}` | Foundation | 远端仓库多维筛选与隐藏私有项、开源项目结构化检索、README/Commits/Release 抽屉及「交给 Bot 分析」草稿跳转通过单测 |
| **M5 主窗口总装、独立复审与文档收口** | `apps/api/src/app.ts`、`apps/worker/src/index.ts` 实例装配、跨包联测、独立只读审查修复及 `PLAN.md` / `DEVELOPMENT_LOG.md` / `VALIDATION.md` / `OPERATIONS.md` 同步 | M1–M4 | 全链路受影响包测试、`tsc --noEmit` 与 Biome 通过，只读复审无遗留 P1/P2 |

## 3. 安全、隐私与运维边界

- **凭据不落地前端与日志**：Token 仅保存在服务端 `SecretStore`，前端连接成功后仅接收脱敏身份信息；不提供明文回显接口。
- **SSRF 与跨源隔离**：服务端客户端硬编码目标主机 `https://api.github.com`，禁用跨源重定向转发凭据，单次请求设超时与响应体大小上限。
- **外部内容防注入**：README、Commit 说明与仓库简介均视为不可信外部数据；Agent 工具返回结果附带显式不可信数据边界提示。
- **可选环境变量（待服务器验证）**：`GITHUB_PROVIDER`（默认 `github`，可选 `emulator` 或 `none`）。

## 4. 后续 Agent 接续实施与验证指引

后续接管或在服务器部署此模块的 Agent，请依据以下具体指引推进工作：

### 4.1 现有生产 PostgreSQL 的定向迁移准备
- **文件位置**：`packages/db/prisma/migrations/20261118150000_github_connections/migration.sql`
- **执行边界**：仅筛选本项新增迁移，核对已有迁移账本与备份后再准备生产命令；不得直接应用所有待迁移。当前尚未执行迁移，方案见 [运维手册](../OPERATIONS.md#github-与项目工作区发布边界2026-11-20)。
- **关键核验**：
  - 检查 `github_connections` 表是否成功建立；
  - 核对 `github_connections_tenant` 和 `github_connections_system` 策略，并以应用运行角色验证两个测试用户的连接隔离。

### 4.2 真实环境公网联调与验收清单
- **前置配置** 服务端可出站访问 `api.github.com:443`，使用默认 Provider 或设置 `GITHUB_PROVIDER=github`。
- **联调步骤**：
  1. 在 PC 前端 `/app/github` 点击「绑定 GitHub」，使用授权范围限定到指定测试仓库的 Fine-grained PAT，按交接指引核对接口所需的只读权限。检查状态栏显示 `@用户名` 及剩余配额，核对连接记录中的密文句柄和前端 `localStorage`，确认后者无 Token 明文。
  2. **个人主页与 52 周热力图**：验证 GraphQL `contributionsCollection` 正常返回，切换年份（如 2026、2025），桌面悬停显示日贡献天数；验证隐私开关即时隐藏私有仓库及已打开的私有详情。贡献统计可能仍含私有贡献，不把列表隐藏解释成所有统计均被清除。
  3. **远端项目与开源检索**：测试项目列表的多维筛选（按归属角色、公开/私有状态、主要语言排序）；切换到「搜索开源项目」Tab，执行关键词与复合筛选（最低 Star、活跃时间），测试匿名与已连接配额下的正常响应。
  4. **仓库抽屉与安全预览**：点击任意仓库，抽屉应展开并展示纯 React 渲染的 README 预览、近期 Commits 与 Release；点击「复制克隆链接」与「交给 Bot 分析」，验证跳转会话页且草稿框已安全填入结构化仓库信息。
  5. **Agent 工具执行调用**：在聊天中向 Bot 提问（例如：“列出我最近更新的 3 个 GitHub 项目”或“帮我查一下 GitHub 上 Rust 编写的终端工具”），验证 `github_list_my_repos` 与 `github_search_repos` 工具成功被 Bot 调度，返回结果带有安全提示。

### 4.3 既有 PC／API／工具离线回归套件
在本地修改或扩展功能后，运行以下单测集进行回归：
```bash
pnpm exec vitest run packages/contracts/src/github.test.ts packages/core/src/action-approval.test.ts packages/core/src/product-analytics.test.ts packages/adapters/src/github-client.test.ts packages/adapters/src/github-connections.test.ts packages/adapters/src/github-tools.test.ts packages/adapters/src/builtin-tool-bridge.test.ts packages/adapters/src/index.test.ts apps/api/src/security-audit.test.ts apps/api/src/github-router.test.ts apps/web/src/pages/GithubPage.test.tsx apps/web/src/pages/github/GithubContributionHeatmap.test.tsx apps/web/src/pages/github/GithubExploreAndRepos.test.tsx apps/web/src/components/SidebarFooter.test.tsx apps/web/src/components/PageBreadcrumb.test.tsx --maxWorkers=1
```

## 5. 手机原生接线补充（PA-024）

手机通过固定底栏「GitHub」或设置进入 `/github` 原生页面，复用既有 RPC 与服务端凭据，不使用 WebView。底栏三个入口固定为应用／项目／GitHub，模块主页面显示，仓库详情按焦点隐藏并在返回列表后恢复；头部返回先退出详情。`use-github.ts` 按服务器、账号会话、Space 选择代次和页面焦点固定请求；离焦取消读取，旧请求不覆盖新选择。PAT 使用密文输入、提交即清空、离开页面清空；页面不持久化 PAT。

2026-11-20 发布预检对齐了连接表迁移：系统访问调用现有 `app_rls_bypass()`，沿用生产已有密钥校验；新增运行角色跨账号与伪造旁路的 PostgreSQL 事务回滚测试，真实执行通过。16:04 已完成唯一 GitHub 迁移和匹配 API／Worker 上线，真实公开 GitHub 搜索与 README 读取通过。客户端仍未发布，真实 PAT 和 iPhone 待验，见 [专项测评](../MOBILE_NAV_GITHUB_EVALUATION.md) 和 [运维](../OPERATIONS.md#手机导航与-github-候选2026-11-20)。

主页、年份与原生贡献格、我的仓库归属／可见性／语言／排序筛选、公开搜索语言／Topic／Star／更新时间筛选、分页及仓库速览均复用共享契约。README、提交和版本说明以原生可选中文本展示，不执行 HTML、不加载外部 README 图片；手机不照搬桌面的悬停、右抽屉或复制控件。

「交给 Bot 分析」按用户操作加载当前首页 Bot，提交前再次校验 Bot 可访问性，只写入当前服务器和账号的草稿。已有草稿或持久化失败时保留原状态，不跳转、不自动发消息；项目 Bot 的分析入口不混入首页列表。真实 PAT、GitHub 联网、手机布局及升级仍需服务器和实际设备证据。

