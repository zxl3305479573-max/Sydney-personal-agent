# ADR-0023：GitHub 个人主页与开源探索模块的直连适配与凭据边界

- 状态：已接受（离线实现中，待授权服务器验收）
- 日期：2026-11-18
- 关联需求：PA-004、PA-010、PA-017、PA-018、PA-022、PA-023、PA-024
- 替代或被替代记录：无

## 背景

Sydney 需要新增独立的「GitHub 模块」，融合个人开发者主页、提交记录热力图、远端仓库浏览、全网开源项目检索及 Bot 协同解读能力。当前约束如下：

1. 仓库处于离线内核开发与网页退役（`PA-023`）推进阶段，桌面端采用回环独立渲染代理，不应新增强依赖公网 Web 页面重定向的 OAuth 回调入口。
2. 现有 Composio 托管目录需要外部平台项目密钥（`COMPOSIO_API_KEY`），无法在自托管单人环境开箱提供个人主页或完整 365 天提交贡献日历。
3. 协作规范要求不擅自引入重型供应商 SDK 依赖，且界面与 Agent 核心不得直接耦合外部 HTTP 细节。

## 候选方案

1. **方案 A：完全依赖 Composio / MCP 外部连接器**
   - 优点：复用第三方工具目录。
   - 缺点：无个人主页 UI 与 52 周贡献热力图结构化契约；强依赖外部平台密钥或本地子进程配置，无法开箱使用。
2. **方案 B：前端直连 GitHub REST / GraphQL API，浏览器本地保存 Token**
   - 优点：无后端路由开发成本。
   - 缺点：违反 `docs/security.md` 与 `docs/frontend.md`（不在浏览器持久化供应商密钥、CSP `connect-src 'self'` 严格收口），且 Bot 服务端执行器无法共享该连接。
3. **方案 C：服务端统一 `GithubProvider` 适配层（Node 原生 `fetch` 调用 REST v3 + GraphQL v4）+ `SecretStore` 加密存储 PAT（预留 Device Flow）**
   - 优点：零新增 npm 依赖；保持 `connect-src 'self'` 与桌面独立代理兼容；GraphQL 一次请求即可取得完整年度逐日贡献日历与置顶仓库；UI 模块与 Agent 只读工具共享同一加密凭据与安全边界；可通过内存 Emulator 完成 100% 离线测试。
   - 缺点：需维护精简的 REST/GraphQL Zod 响应映射与速率限制处理。

## 决策

采用 **方案 C**：

1. **接口隔离**：在 `@rakazo/contracts` 定义前后端共享契约与 `github.*` RPC，在 `@rakazo/adapter-kit` 定义供应商无关的 `GithubProvider` 与 `GithubAccountService` 契约，在 `@rakazo/adapters` 实现基于原生 `fetch` 的直连客户端与离线 `GithubEmulator`。
2. **认证与存储**：新增用户级 `github_connections` 表（启用 RLS，绑定 `userId`），仅存非敏感账号展示元数据与 `SecretStore` 密文句柄（`ciphertext`）；首期实现 Fine-grained / Classic PAT 验证绑定，结构上保留 `authKind` 供后续扩展无需公网回调的 OAuth Device Flow。
3. **数据获取分工**：个人主页、置顶仓库与 52/53 周提交记录热力图使用 GitHub GraphQL API（`POST https://api.github.com/graphql`）；远端仓库筛选、全网开源仓库检索、README、近期提交与最新 Release 使用 GitHub REST API（`2022-11-28`）。
4. **安全与读写边界**：首期 UI 与 Agent 直连工具（`github_get_profile`、`github_list_my_repos`、`github_search_repos`、`github_read_repo`）均为**只读能力**；外部仓库文本按不可信数据处理并强制长度上限；高危 Token Scope（如 `delete_repo`、`admin:org`）在界面显著提示收窄权限；远端仓库浏览不自动触发本地或云电脑 `git clone`。

## 影响与限制

- **零新依赖**：不修改 `package.json` 第三方运行时依赖。
- **路由兼容**：前端使用单段路径 `/app/github` 配合查询参数（`?tab=...&repo=...`），无需改动桌面独立代理规则。
- **已知限制**：未连接账号时无法读取个人主页、贡献日历与私有仓库，但仍支持受 GitHub 匿名速率限制约束的公开开源仓库搜索；PostgreSQL 迁移与真实 GitHub API 联网需在用户授权的服务器环境单独验收。

## 验证与重新评估

- **离线验证**：通过契约测试、GraphQL/REST 解析与脱敏单测、Emulator 一致性测试、API 路由权限与审计测试、前端热力图与模块交互单测，以及各受影响包 `tsc --noEmit` 与 Biome 检查。
- **重新评估条件**：当后续需要开放创建 Issue/PR、推送分支等写操作，或需要多 GitHub 账号并存绑定时，另行立项设计写操作审批幂等契约与多账号切换模型。
