# GitHub 模块（PA-024）后续 Agent 实施与交接指引

> **创建日期**：2026-11-18  
> **关联任务**：PA-024 GitHub 个人主页与开源探索模块（路由 `/app/github`）  
> **基线提交**：`5bff060a7`（已推送到 `origin/cursor/integrate-remote-branches-7334`）  
> **当前状态**：离线实现与全量单测验收完成（15 个测试文件 203 项全部 PASS），待部署至授权服务器执行 PostgreSQL 数据库迁移与公网 PAT 联网验收。

---

## 1. 模块交付物与关键代码位置

| 层级 | 关键文件 | 职能说明 |
| --- | --- | --- |
| **共享契约** | `packages/contracts/src/github.ts` | Zod Schema 契约、类型定义、仓库名与文件路径防穿越校验 |
| **工具与安全注册** | `packages/contracts/src/builtin-tools.ts`<br>`packages/core/src/action-approval.ts` | 注册 4 个 GitHub 只读工具（免人工审批只读白名单） |
| **数据模型与迁移** | `packages/db/prisma/schema.prisma`<br>`packages/db/prisma/migrations/20261118150000_github_connections/migration.sql` | `GithubConnection` 租户隔离模型与 PostgreSQL RLS 迁移脚本 |
| **适配层与仿真器** | `packages/adapters/src/github-client.ts`<br>`packages/adapters/src/github-emulator.ts`<br>`packages/adapters/src/github-connections.ts`<br>`packages/adapters/src/github-tools.ts` | REST/GraphQL 客户端、5分钟租户隔离缓存、离线仿真器、SecretStore 加密凭据存储、4个只读 Agent 工具 |
| **服务端 RPC 路由** | `apps/api/src/routes/github.ts`<br>`apps/api/src/security-audit.ts` | 7 个 `/rpc/github/*` 路由、连接审计事件、400 业务错误映射（防止误报 401 注销会话） |
| **PC 端工作台前端** | `apps/web/src/pages/GithubPage.tsx`<br>`apps/web/src/pages/github/*` | `/app/github` 页面、52/53周热力图、项目多维筛选、开源搜索、AST 安全速览抽屉、Bot 草稿联动 |

---

## 2. 后续 Agent 必须执行的未完成事项

### 任务 1：PostgreSQL 数据库迁移（必须在授权服务器运行）
- **前提**：连接真实 PostgreSQL 数据库（本地离线未启动数据库，使用 SQLite/内存/仿真运行）。
- **执行命令**：
  ```bash
  pnpm --filter @rakazo/db migrate
  ```
- **检查项**：
  - 确认数据库中生成 `github_connections` 表；
  - 确认 `ENABLE ROW LEVEL SECURITY` 和策略 `github_connections_user_isolation` 生效。

### 任务 2：真实 GitHub Personal Access Token (PAT) 连通性联调
- **前提**：服务器出站网络允许请求 `https://api.github.com`（端口 443）。
- **联调步骤**：
  1. 准备一个真实的 GitHub PAT（仅需 `read:user` 和 `repo` 只读权限，严禁 `admin:*`）；
  2. 启动服务后访问 `/app/github`，点击「绑定 GitHub」输入该 PAT；
  3. 验证个人主页、活跃项目、以及基于真实 GraphQL 的 52/53 周提交记录热力图正确展示；
  4. 测试「隐藏私有仓库」开关，验证私有项目是否被安全遮罩；
  5. 切换到「搜索开源项目」，验证真实关键字检索与 Star/活跃度筛选；
  6. 点击任意项目打开抽屉，验证 README.md 安全 Markdown 预览、Commits、Release 及「交给 Bot 分析」草稿跳转；
  7. 开启一个 Agent 对话，测试 Bot 调用 `github_list_my_repos` 与 `github_search_repos` 的能力。

### 任务 3：长期演进项（可选）
- **GitHub OAuth Device Flow**：契约中已预留 `authKind: "oauth_device"`，后续可基于 GitHub Device Authorization Grant 实现免手动复制 PAT 的体验。

---

## 3. 本地回归验证命令（离线可用）

在对本模块进行任何扩展或重构后，请运行以下套件确保无破坏：
```bash
# 1. 运行 GitHub 模块 15 个测试文件全量回归（203 项）
pnpm exec vitest run packages/contracts/src/github.test.ts packages/core/src/action-approval.test.ts packages/core/src/product-analytics.test.ts packages/adapters/src/github-client.test.ts packages/adapters/src/github-connections.test.ts packages/adapters/src/github-tools.test.ts packages/adapters/src/builtin-tool-bridge.test.ts packages/adapters/src/index.test.ts apps/api/src/security-audit.test.ts apps/api/src/github-router.test.ts apps/web/src/pages/GithubPage.test.tsx apps/web/src/pages/github/GithubContributionHeatmap.test.tsx apps/web/src/pages/github/GithubExploreAndRepos.test.tsx apps/web/src/components/SidebarFooter.test.tsx apps/web/src/components/PageBreadcrumb.test.tsx --maxWorkers=1

# 2. 静态检查
pnpm exec biome check apps/web/src/pages/github apps/web/src/pages/GithubPage.tsx apps/api/src/routes/github.ts packages/adapters/src/github-client.ts packages/adapters/src/github-connections.ts packages/adapters/src/github-emulator.ts packages/adapters/src/github-tools.ts packages/contracts/src/github.ts
```
