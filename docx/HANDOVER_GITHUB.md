# GitHub 模块（PA-024）后续 Agent 实施与交接指引

> **创建日期**：2026-11-18  
> **关联任务**：PA-024 GitHub 个人主页与开源探索模块（路由 `/app/github`）  
> **基线提交**：`5bff060a7`（已推送到 `origin/cursor/integrate-remote-branches-7334`）  
> **接续说明（2026-11-20）**：用户已追加手机 GitHub 与项目工作区目标，现阶段安排见 [总计划](PLAN.md#追加目标github-上线与项目工作区可用闭环pa-022pa-024)。原 203 项为历史基线；本轮回归与手机接线结果另记 [验证记录](VALIDATION.md#github-与项目会话续作2026-11-20)，不以历史通过数替代当前验证或生产验收。

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
| **手机原生页面** | `apps/mobile/app/github.tsx`<br>`apps/mobile/lib/use-github.ts`<br>`apps/mobile/components/github-bot-analysis.tsx` | 设置入口、PAT、原生贡献图、筛选与分页、文字速览；验证首页 Bot 归属后写入分析草稿，保留已有草稿且不自动发送 |

---

## 2. 后续 Agent 必须执行的未完成事项

### 任务 1：PostgreSQL 数据库迁移（必须在授权服务器运行）
- **前提** 当前只有生产环境。先准备可审查的单项迁移、备份与恢复候选，在获确认的本次维护范围内执行；不要再等待不存在的测试环境，也不要直接执行应用全部待迁移的命令。
- **本次新增迁移**：仅 `20261118150000_github_connections`，与项目迁移分开。筛选目录、角色、服务／客户端版本与回退边界见 [运维发布方案](OPERATIONS.md#github-与项目工作区发布边界2026-11-20)。服务器执行命令尚未验证，本轮未迁移。
- **检查项**：
  - 确认数据库中生成 `github_connections` 表并启用 RLS，核对 `github_connections_tenant` 和 `github_connections_system` 策略。
  - 以应用运行角色验证两个测试用户各自只能访问自己的连接记录。

### 任务 2：真实 GitHub Personal Access Token (PAT) 连通性联调
- **前提** 服务器可出站访问 `api.github.com:443`。使用默认 Provider，或显式设置 `GITHUB_PROVIDER=github`。
- **联调步骤**：
  1. 使用隔离测试账号的 Fine-grained PAT，仅授权指定测试仓库及所需的只读权限。仓库权限从 Metadata 和 Contents 的只读权限开始，按接口验证结果核对其他权限需求。
  2. 在已安装的 `Sydney-partner` 内打开 GitHub，或手机 `Sydney` 的「设置 → GitHub」连接 PAT；`/app/github` 是桌面包内路由，不要求恢复公网 Web；
  3. 验证个人主页、活跃项目、以及基于真实 GraphQL 的 52/53 周提交记录热力图正确展示；
  4. 测试「隐藏私有仓库」开关，验证私有项目是否被安全遮罩；
  5. 切换到「搜索开源项目」，验证真实关键字检索与 Star/活跃度筛选；
  6. 点击任意项目打开抽屉，验证 README.md 安全 Markdown 预览、Commits、Release 及「交给 Bot 分析」草稿跳转；
  7. 开启一个 Agent 对话，验证 Bot 调用 `github_list_my_repos` 与 `github_search_repos`。
  8. 解绑后检查连接状态和密文清理，确认后续私有仓库请求失去原有访问权限，并撤销本轮测试令牌。
  9. 手机单独验证离开页面清除未提交 PAT、账号／服务器／Space 切换不回写旧请求、私有列表和详情即时隐藏、分析草稿不覆盖原稿且不自动发送。贡献图的私有统计仍由 GitHub 响应决定，隐藏仓库不代表删除所有私有贡献统计。

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
