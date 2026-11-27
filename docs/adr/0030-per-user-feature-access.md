# ADR-0030: 按账号功能权限管理与受限模块后端／客户端双层隔离

- 状态：已采纳（2026-11-28）
- 关联需求：PA-026、PA-004、PA-015、PA-021、PA-022、PA-024

## 背景

用户计划将 Sydney 安装包与现有自托管后台分享给朋友注册使用，希望采用**单一代码库、单一安装包与单一 OTA 通道**，不再维护分叉客户端分支，同时防止朋友账号误入或访问个人专属高危能力（尤其是单机单 UID 共享桌面的 `native-linux` 云电脑，以及项目工作区、GitHub、连接应用与 MCP 插件），并支持管理员按账号随时单独放行或关闭。

此前仅有 `RAKAZO_ADMIN_EMAILS` 管理员判定与少量部署级 `requireAdmin` 接口，缺少按用户维度的模块开关；仅在客户端隐藏入口无法阻止聊天中模型调用云电脑终端／截屏或直连后台 RPC。

## 决策

1. **四项受控能力与角色默认策略（`packages/contracts/src/feature-access.ts`）**：
   - 受控能力集合固定为 `computer`（云电脑）、`projects`（项目工作区）、`github`（GitHub）、`integrations`（连接应用与 MCP 插件）；聊天、群聊、人格、陪伴灵动岛、记账、地图天气、外观换肤与默认部署模型调用保持对所有账号开放。
   - 管理员（邮箱已验证且位于 `RAKAZO_ADMIN_EMAILS`）始终全开，且禁止经管理接口限制管理员自身，避免误锁。
   - 普通账号默认策略由 `isFeatureAccessRestrictedByDefault` 判定：显式配置 `SYDNEY_FEATURE_ACCESS_RESTRICTED=true/false` 优先；未配置时，若 `SANDBOX_PROVIDER=native-linux` 且已配置 `RAKAZO_ADMIN_EMAILS`，自动默认受限（4 项全关），保障单机云电脑安全，同时不影响单用户部署及现有测试套件。

2. **数据库按账号独立覆盖表与只读租户 RLS（`UserFeatureAccess`）**：
   - 新增 `user_feature_access` 表（迁移 `20261128120000_user_feature_access`），列 `computer`、`projects`、`github`、`integrations` 均为可空布尔值（`null` 继承角色默认，`true`/`false` 显式覆盖），外键关联 `user.id`（`ON DELETE CASCADE`），并加入 `ROW_SECURITY_MODELS`。
   - PostgreSQL 行级安全策略对普通租户仅授予 `FOR SELECT` 读取本人行，禁止用户经租户上下文改写自身权限；管理员查询全部成员与修改覆盖统一经 `requireAdmin` 鉴权后通过 `runAsSystem` 执行，并写入 `admin.feature_access.updated` 安全事件。

3. **后端 API 路由与 Worker／Executor 双层强拦截**：
   - `me` RPC 返回 `featureAccess`（旧服务端缺失时客户端按全开向后兼容）。
   - API 层新增 `computerAuthed`、`projectsAuthed`、`githubAuthed`、`integrationsAuthed` 中间件，分别拦截 `computer/*`、`bots/setComputer`、`projectWorkspaces/*`（云目录绑定同时校验 `computer`）、`github/*`、`connections/*`、`mcp/*`、`capabilities/*`、`marketplace/*`、`integrationSetup/*`（保留 `onboarding/*` 不受影响）。
   - API 内嵌执行器与独立 `apps/worker` 进程均注入 `resolveFeatureAccess`：当 `projects` 关闭时终止项目工作区 Run；当 `computer` 关闭时跳过 `computerExecutionLease` 申请、`selectBuiltinToolsForRun` 剔除全部 `COMPUTER_SANDBOX_TOOL_NAMES`、`runComputer`/`getRunComputer` 硬拒绝启动沙箱、跳过宿主机环境探测与电脑系统提示；当 `github`/`integrations` 关闭时不拉取连接器／MCP 工具；`dispatchTool` 再做一层纵深拒绝防御。

4. **移动端自动显隐与管理员手机管理页**：
   - 移动端通过零原生依赖的 `apps/mobile/lib/feature-access.ts` 订阅 `queryClient` 缓存的 `me`（并随 `saved-chats.ts` 缓存减少冷启动闪烁）：未授权时自动隐藏底部「项目」Tab、首页 GitHub 与连接应用磁贴及后台拉取、设置页电脑／应用入口、对话菜单与 Bot 资料／设置页的电脑／项目项，直接访问受限路由渲染统一受限提示页。
   - 仅当 `me.isAdmin === true` 时在「设置 → 账户」展示「成员功能权限」入口，进入 `/(settings)/feature-access` 逐账号开关 4 项能力或恢复默认。

## 后果

- 无需为朋友维护独立客户端分支或独立 IPA 签名通道，前后端一套代码即可按账号差异化开放功能，并从后端与执行器彻底封堵单机 `native-linux` 云电脑跨账号越权路径。
- 服务端上线前必须执行 `20261128120000_user_feature_access` 数据库迁移，并在 API 与 Worker 共用的 `/etc/sydney/backend.env` 中配置 `RAKAZO_ADMIN_EMAILS=<管理员已验证邮箱>`（如需在非 `native-linux` 环境下默认关闭普通账号受限功能，另配置 `SYDNEY_FEATURE_ACCESS_RESTRICTED=true`）。真实 PostgreSQL RLS 集成测试、服务器部署迁移与 iPhone 真机联调仍待后续实测验收。
