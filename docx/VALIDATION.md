# 验证记录

## 移动端未读状态、对话状态显示与退出对话持续态修复（2026-11-25）

关联 PA-018／PA-021／PA-022。

- **首轮发现与修复**：
  - `group-avatar.tsx` 首次引入 `mobileTokens` 触发 `expo-modules-core` 导入链路导致 `group-avatar.test.tsx` 在 jsdom 导入失败；改为仅通过 `useThemedStyles` 接收可选 `tokens` 参数后通过。
  - `projects/[workspaceId].tsx` 中 `previewSnippet(item.preview, 40)` 在无预览字段的 roster 项上抛出 `undefined.replace` 与 `TS2345`；改为 `item.preview ? previewSnippet(item.preview, 40) : ""` 后通过。
  - `thread-feedback.ts` 中 `attempt.state !== "pending"` 因 TS 流分析收窄报 `TS2367`，以及新增测试 `chat-header-title.test.tsx`（复用前序未清理的 `thread-1` 标题键）与 `thread-read.test.tsx`（未先 flush 队列微任务）均已修正。
- **最终已执行并通过（`origin/main` `54556e275` 干净隔离工作树复验）**：
  - `@rakazo/mobile` 全包 TypeScript 类型检查（`npx tsc --noEmit -p apps/mobile/tsconfig.json`）：**0 错误通过**。
  - 移动端定向 Vitest（19 个文件、266 项测试，全部通过、0 失败）：`conversation-status.test.ts`（2）、`thread-session-cache.test.tsx`（17）、`thread-read.test.tsx`（5）、`bot-avatar-render.test.tsx`（18）、`group-avatar.test.tsx`（4）、`chat-header-title.test.tsx`（12）、`chat-title-label.test.tsx`（4）、`chat-title-avatar.test.tsx`（13）、`thread-header.test.ts`（6）、`home-hub.test.tsx`（4）、`use-open-notification-thread.test.tsx`（4）、`use-inbox-chat-actions.test.tsx`（28）、`foreground-poll.test.tsx`（7）、`thread-feedback.test.tsx`（51）、`use-project-thread.test.tsx`（10）、`project-pages-state.test.tsx`（7）、`inbox-spaces.test.ts`（33）、`inbox-swipe.test.tsx`（16）、`main-navigation.test.tsx`（25）。
  - Biome lint（40 个变更／测试文件）：**0 错误**（仅保留 2 条未改行既有 warning：`projects/[workspaceId].tsx` `canvasBg`、`projects/[workspaceId]/chat.tsx` `useOptionalChain`，以及 1 条 `index.tsx` 既有无用 Fragment info）；`git diff --check` 全部改动 **0 警告通过**。
- **附带基线说明（`origin/main` 既有未在本批范围的问题）**：
  - 附带跑到的 `inbox-render.test.tsx` 有 2 项既有失败（行头像断言 `size === "56"` 与 `origin/main` 当前 `44` 及置顶 `aria-label`），`project-chat-screen.test.tsx` 有 5 项既有失败（`bot-actions-modal.tsx` 未在测试替身中导出 `StyleSheet`），`unsent-sends.test.ts` 在导入 `saved-chats.ts` 时因缺少 `Platform` 替身失败；均早于本批改动存在，未计入本批通过项。
- **未执行项**：未执行 iPhone 真机退页持续状态、后台回前台自动消未读、弱网发送未落库前退页、旧版后台实机联调、OTA 构建及服务端部署。

## 全分支整合收口：`backend` 分支合入 `main` 与跨包回归（2026-11-25）

关联 PA-018／PA-021／PA-022／PA-023／P2／P3。将本地 `backend` 分支（`ceac00bb5`，完整覆盖 `butterflyray` 全部有效改动并额外包含 PA-022 非空项目删除、P2/P3 任务执行审计、MCP 原生回调并发修复与 Native Linux 驱动状态持久化）推送至 `origin/backend` 并合入集成分支与 `main`（合并提交 `a121af6f9`）。解决 `infra/native-linux/driver.py` 常量冲突，补齐 5 处合入后类型与真实字段缺陷（含 `packages/db/src/project-workspace-deletion.ts` 补齐 `lease.fence`/`runId`、`packages/adapters/src/native-linux-sandbox.ts` 请求基对象类型窄化、`apps/mobile/lib/startup.ts` 补齐 `"notifications"` 启动步骤等）并修复 18 项测试替身与共享记忆断言差异（含顺手修复 `packages/db/src/groups.test.ts` 的 `query.join is not a function`）。

- **已执行并通过**：
  - Prisma 客户端生成与四包类型检查：`packages/db`、`packages/adapters`、`apps/api`、`apps/mobile` `tsc --noEmit` 全部 **0 错误通过**。
  - Python Native Linux 驱动单测：`python -m unittest infra/native-linux/test_driver.py` **37 项（33 通过、4 项 Linux 专属跳过）通过**。
  - 跨包 Vitest 回归（22 个文件：`project-workspace`、`account-deletion-response`、`groups`、`project-account-lifecycle`、`project-workspace-deletion`、`project-workspace-read`、`task-execution`、`background-job-handlers`、`executor-lazy-computer`、`executor`、`mcp-oauth`、`native-linux-sandbox`、`run-project-policy`、`run-tools-project-files`、`run-tools`、`account-deletion-claim-recovery`、`api/project-workspace-deletion`、`project-workspace-thread`、`project-workspaces`、`tasks`、`thread-read`、`web/Projects`）：**604 项通过、2 项既有跳过、0 失败**。
  - `git diff --check` 通过。
- **未执行项**：未在授权生产服务器执行新增 PostgreSQL 迁移、后台 API／Worker 重建部署及真机验收；历史旧原型 `codex/linux-computer-onboarding` 与已由 `ui` 替代的旧双端方案 `razorbill` 未混入主分支。

## 个人中枢首页「后台陪伴」组件（2026-11-25）

关联 PA-021。

- 定向 Vitest（2 个文件，5 项通过、0 失败）：
  - `apps/mobile/lib/home-companion-card.test.tsx`（2 项通过：覆盖切换伙伴、一键开启／停止后台陪伴、触发屏幕陪伴，以及原生扩展不可用时降级提示与直达对话）
  - `apps/mobile/lib/home-hub.test.tsx`（3 项通过：覆盖首页完整渲染与既有 Bento 卡片零回归）
- `git diff --check`（本批修改文件）：0 警告通过。
- 未执行：带原生 `SydneyCompanion` 扩展的 Xcode 构建、iPhone 真机灵动岛展示与屏幕共享交互验收。

## 手机 App 首次进入通知弹窗与消息通知设置（2026-11-25）

关联 PA-021；专项评测见 [NOTIFICATION_SETTINGS_EVALUATION.md](NOTIFICATION_SETTINGS_EVALUATION.md)。

- 核心通知定向 Vitest（7 个文件，40 项通过、0 失败）：
  - `apps/mobile/lib/notification-preferences.test.ts`（7 项通过，覆盖 `NOTIF-01`–`NOTIF-03`）
  - `apps/mobile/lib/use-first-launch-notification-prompt.test.tsx`（3 项通过，覆盖 `NOTIF-01`）
  - `apps/mobile/lib/notifications-screen.test.tsx`（2 项通过，覆盖 `NOTIF-04`）
  - `apps/mobile/lib/live-notifications.test.ts`（12 项通过，覆盖 `NOTIF-03`）
  - `apps/mobile/lib/push.test.ts`（4 项通过）、`apps/mobile/lib/open-notification.test.ts`（8 项通过）、`apps/mobile/lib/use-open-notification-thread.test.tsx`（4 项通过，覆盖 `NOTIF-05`）
- 附带回归 `apps/mobile/lib/live-notifications-android.test.ts`：13 项通过、1 项失败（`resumes the native poller with the normalized server and the active UI locale`，属于既有 URL 校验行为，本批未触碰 `resumeLiveNotifications` 或 `endpoint.ts`）。
- `git diff --check`（本批修改文件）：0 警告通过。
- `@rakazo/mobile` 全包 `tsc --noEmit` 仍被工作区既有 7 个无关 UI 文件的合并冲突标记（`TS1185`）阻断，未顺带修改无关文件。
- 未执行（环境受限）：iPhone 真机冷启动首次弹窗、系统通知权限框、前台/后台本地横幅与提示音、以及从系统设置返回刷新状态（`NOTIF-06`）。

## 未实现功能分批规划与第 2、3、4 项定向实现（2026-11-25）

关联 PA-004、PA-005、PA-006、PA-010、PA-012、PA-014、PA-021、PA-022；评测矩阵见 [PARTIAL_IMPLEMENTATION_EVALUATION.md](PARTIAL_IMPLEMENTATION_EVALUATION.md)。

- 定向 Vitest（11 个文件，168 项通过、2 项 Linux-only 跳过、0 失败）：
  - `packages/contracts/src/project-directory.test.ts`（14 项通过，覆盖 `EVAL-A1`）
  - `packages/adapters/src/windows-project-files.test.ts`（12 项通过，覆盖 `EVAL-A2`）
  - `packages/adapters/src/run-tools-project-files.test.ts`（22 项通过，覆盖 `EVAL-A4`）
  - `packages/adapters/src/run-project-policy.test.ts`（34 项通过，首轮因硬编码旧工具列表失败 3 项，同步纳入 `project_search_files` 后复验全过）
  - `apps/desktop/src/project-directory.test.ts`（28 项通过）
  - `apps/mobile/lib/companion-thread-watch.test.tsx`（9 项通过，覆盖 `EVAL-B1`／`EVAL-B2`）
  - `packages/adapters/src/pi-runtime-subagent-budget.test.ts`（4 项通过，覆盖 `EVAL-C1`）
  - `packages/adapters/src/managed-task-control.test.ts`（4 项通过）、`managed-task-tools.test.ts`（1 项通过）、`native-linux-sandbox.test.ts`（24 项通过、2 项 Linux-only 跳过）、`packages/db/src/task-execution.test.ts`（16 项通过，覆盖 `EVAL-C2`）
- Python 原生驱动单测：`python -m unittest infra/native-linux/test_driver.py -v` 23 项通过、4 项 Linux-only 跳过（覆盖 `EVAL-A3` 请求校验与 `EVAL-C3`）。
- TypeScript 类型检查：`@rakazo/contracts`、`@rakazo/adapters`、`@rakazo/desktop` 的 `tsc --noEmit` 均 0 错误通过；`@rakazo/mobile` 全包 `tsc --noEmit` 因工作区既有未修改的 7 个 UI 文件残留合并冲突标记（`TS1185`：`app/(settings)/skills.tsx`、`app/bot-profile.tsx`、`app/bot-settings.tsx`、`app/integrations.tsx`、`components/home-styles.ts`、`components/thread-composer.tsx`、`components/thread/special-message-card.tsx`）而失败，本批未顺带改动无关文件。
- `git diff --check`（本批全部修改文件）：0 警告通过。
- 未执行（环境受限）：真实 Linux 主机 `O_NOFOLLOW`/dirfd 目录搜索实跑、真实 PostgreSQL 行锁与 RLS 并发验收、Bubblewrap／WSL 2 隔离客体负向实测、Xcode 原生扩展编译签名与 iPhone 真机后台验证、生产部署与客户端发版。

## 手机端个人中枢首页（`ui`）与换肤插件增强（`ui-plugin`）合入主分支回归（2026-11-25）

关联 PA-019／PA-020／PA-021／PA-022／PA-023／PA-024。在 `ui`（`6ac016e4a`）合入后，继续将 `ui-plugin`（`f408c1c`）合入集成分支与 `main`，完成 41 个页面与文档文件融合（未启用自定义主题时保持清透暖瓷默认风格与个人中枢首页／三项文字底栏；启用自定义主题或页面作用域覆盖时按 `ScopedTheme` 规则接管背景、几何圆角、边框与材质），并为新增的 `apps/mobile/app/chats.tsx` 接入 `useScreenBackground`。

- **已执行并通过**：
  - 移动端类型检查：`pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` **0 错误通过**。
  - 移动端全套定向回归（合并覆盖 `ui` 与 `ui-plugin` 全部核心套件，含 `home-hub`、`main-navigation`、`screen-theme-coverage`、`theme-controls`、`theme-contrast`、`theme-presets`、`theme-pack`、`theme-manager`、`scoped-theme`、`home-styles`、`ui-mode-screen`、`ui-mode`、`ui-mode-store`、`ui-mode-registry`、`ui-mode-provider`、`ui-mode-slots`、`settings-group`、`glass-surface`、`app-error-boundary`、`account-screen`、`chat-appearance-screen`、`github-screen`、`bot-avatar-render`、`native-action-button`、`thread-composer`）：**25 个测试文件共 282 项全部通过**。
  - 静态与格式检查：101 个改动／新增 `.ts`/`.tsx` 文件 Biome `check` **0 错误通过**；`git diff --check` 通过；PC 端零改动。
- **未执行项**：未触发新的 iOS OTA／未签名 IPA 发布，未进行 iPhone 真机视觉、换肤导入／卸载与触控实测。

## 工作区提交、主分支合并与 iPhone OTA（2026-11-25）

关联 PA-021、PA-023、REL-01。本轮按用户授权提交、推送现有工作区改动，将完整集成分支合入 `main`，并从合并提交发布现有 iPhone 侧载版本。

- 提交 `92b1ee8359f30819a5765cf6318dcc340c69934f` 已推送到 `cursor/integrate-remote-branches-7334`，包含既有 17 文件 CI 清理及文档；[PR #10](https://github.com/zxl3305479573-max/Sydney-personal-agent/pull/10) 已合并，合并提交 `6c47e8836a89d25be17bbcf94103d2d7485da192` 与集成分支的源码树无差异。该 PR 共 48 个提交、848 个文件，覆盖此前尚未合入主分支的客户端及配套共享逻辑，不仅是最后一笔 CI 清理。
- `git diff --check` 通过。`.github/scripts/changed-areas.test.py` 的默认 Bash 调用及在 Bash 中调用 Windows Python 的尝试均未完成；定位到 Windows 子进程选中缺少 `/bin/bash` 的 WSL 转发后，仅在本次运行的 Python 子进程调用中将 `bash` 指向已有 `D:\cxdownload\Git\bin\bash.exe`，3 项测试通过，耗时 91.347 秒。未修改测试断言、安装依赖或启动本机服务。
- [iOS OTA Run 45600236960](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45600236960) 成功，发布日志中的提交为 `6c47e8836a89d25be17bbcf94103d2d7485da192`，branch／channel 为 `sideload`，runtime 为 `sydney-ios-ip-1`。更新组 `abb1e9a2-e636-4857-8589-662987a4c5b6`，iOS 更新 ID `01a2125e-c869-7ab4-a278-e6b0e178a73c`。本次重新发布已有可见版本 `1.0.24`，版本说明日期继续为 `2026-11-22`，原生版本保持 `1.0.12`。
- 线上 multipart 清单返回 HTTP `200`，更新 ID、更新组、runtime、三语版本说明及 55 项资源与发布结果一致。首次不带清单资源授权头请求 CDN 返回 `403`；读取 multipart `extensions.assetRequestHeaders` 并按每个资源携带其授权头后，启动包与 55 项资源共 56 项全部 HTTP `200`，SHA-256 与清单的 base64url 摘要全部一致。启动包大小 10,644,616 字节，SHA-256 `7182984b27b5192824e6a0a9d75a688f77030f573b5cb2d3aed5cf4cb2324fb5`。授权信息只在内存中使用，没有写入仓库或记录内容。
- 合并后自动启动的[常规 CI Run 45599990966](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45599990966) 已有类型检查、三个单测分片和两个 PostgreSQL 集成分片失败。已读日志包含 `query.join is not a function`、品牌及参数断言不一致，以及注册夹具 `INVALID_ORIGIN`。不能据此声称整仓 CI 通过，未扩展到这些问题的修复。独立的[macOS 截图 Run 45599990970](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45599990970) 在图标核对失败后没有生成目标截图。CI 的服务器镜像构建仍有任务进行中；本窗口未主动部署后台或执行生产迁移。
- 未执行：全工作区本机构建、Windows 新包、iOS 原生签名包、App Store／Android 发布、生产数据库迁移与回退、iPhone 实际下载重启和真机视觉／交互验收。OTA 分发成功与真机生效分别记录。

## GitHub CI 移除退役 Web E2E（2026-11-24）

本轮删除 GitHub Actions 的 Web Playwright E2E、夜间 Web 截图和 PR 截图报告发布工作流，以及只被这些工作流使用的报告辅助代码。`apps/web` 仍保留为 Windows 包内界面构建来源，桌面 Electron E2E 与移动端截图工作流未删除。

- 已静态检查工作流与仓库引用，确认不再存在 `ci.yml` 对 Web E2E 的调用、夜间验证对 Playwright 工作流的调用或 PR 报告发布工作流对 `Web E2E / Web E2E` 的查询。
- `.github/scripts/changed-areas.test.py`：3 个测试通过。Windows 默认 `bash` 解析到缺少 `/bin/bash` 的 WSL 转发，使用本机已有 MSYS2 Bash 作为测试子进程后完成验证，未修改测试逻辑。
- `git diff --check`：通过。
- 未执行 GitHub Actions、全工作区构建、数据库、Docker 或客户端发布验证。

## 手机 App 个人中枢首页与全界面风格统一离线校验（2026-11-24，2026-11-25 补齐主工作区回归与合入）

关联 PA-019／PA-020／PA-021／PA-022／PA-023／PA-024。源码已由 `ui` 分支（`6ac016e4a`）合入集成分支与 `main`，并在具备完整 `node_modules` 的主工作区补跑完整静态检查与单元测试，同时修复 4 处问题（`apps/mobile/app/index.tsx` 离线缓存 `me` 可选 `email` 类型与 `loadFailure?.kind === "session"` 笔误、`apps/mobile/components/home-hub.tsx` `buildGreeting` 可选 `email` 类型、`apps/mobile/app/(settings)/archived-bots.tsx` 条件调用 `useResolvedAppearance` Hook 违规，以及 `apps/mobile/lib/main-navigation.test.tsx` 暖瓷底栏样式断言与 mock）：

- **已执行并通过**：
  - 移动端类型检查：`pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` **0 错误通过**。
  - 移动端定向单元测试：`pnpm exec vitest run apps/mobile/lib/home-hub.test.tsx apps/mobile/lib/main-navigation.test.tsx apps/mobile/lib/glass-surface.test.tsx apps/mobile/lib/settings-group.test.tsx apps/mobile/lib/github-screen.test.tsx apps/mobile/lib/bot-avatar-render.test.tsx apps/mobile/lib/account-screen.test.tsx apps/mobile/lib/chat-appearance-screen.test.tsx --maxWorkers=1` **8 个测试文件共 104 项全部通过**。
  - 格式与 lint 检查：全部 74 个新增／修改 `.ts`/`.tsx` 文件执行 Biome `check`，**0 错误通过**（保留 10 条既有 `useOptionalChain` warning 与 1 条 `index.tsx` 既有 info）；`git diff --check` 通过；PC 端（`apps/web`、`apps/desktop`、`packages/ui-web`）保持零改动。
  - 前序离线对比度与 AST 门禁（`ui` 工作树 2026-11-24）：138 项对比度与令牌同步断言、76 文件 AST 与零字体违规扫描通过。
- **未执行项（不声称已通过）**：
  - 未执行 iOS OTA／未签名 IPA 打包及 iPhone 真机在全模块页面上的视觉、深浅色切换、Dynamic Type 大字号、分屏与侧滑返回实测。

## iPhone 换肤插件作用域隔离、背景层叠、材质消费与错误本地化（2026-11-24）

关联 PA-019、PA-020、PA-021。工作区为 `ui-plugin` 分支（基于合并提交 `95de23355` 之上续作）。

- 首轮失败与修复记录：
  - `apps/mobile/lib/theme-controls.test.ts` 首次运行失败 1 项：`localizeThemeError` 中 `/JSON/i` 匹配早于 `.sydney-theme.json`，导致文件后缀错误被误报为 JSON 语法错误；调整分支顺序后通过。
  - `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` 首次检出新增测试 `apps/mobile/lib/scoped-theme.test.tsx` 的 `vi.hoisted` 缺少 `currentRenderRoute` 属性；补齐后通过。
- 最终已执行并通过：
  - 移动端定向回归（两批覆盖全部 19 个相关测试文件、151 项测试，均在最终代码上有效）：
    - 19 文件首轮通过的 18 个未改文件 140 项：`project-chat-screen.test.tsx`（21）、`account-screen.test.tsx`（28）、`settings-group.test.tsx`（16）、`ui-mode.test.ts`（9）、`ui-mode-slots.test.tsx`（7）、`app-error-boundary.test.tsx`（5）、`glass-surface.test.tsx`（5）、`appearance.test.ts`（6）、`home-route.test.tsx`（5）、`ui-mode-provider.test.tsx`（2）、`ui-mode-store.test.ts`（12）、`chat-appearance.test.ts`（6）、`home-styles.test.ts`（2）、`ui-mode-registry.test.ts`（9）、`theme-manager.test.ts`（3）、`theme-pack.test.ts`（4）——以及修复后重跑通过的 3 个文件 11 项：`theme-controls.test.ts`（4）、`ui-mode-screen.test.tsx`（5）、`scoped-theme.test.tsx`（2），合计 **19 个文件 151 项全部通过**。
  - 移动端类型检查：`pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` 通过（0 错误）。
  - 格式与 lint 检查：本批 14 个源码／测试文件执行 Biome `check`，0 错误（`index.tsx:1017` 保留既有未改行的单条无用 Fragment info 提示）；`git diff --check` 通过。
- 未执行项：
  - 真实 iPhone 视觉、大字体、VoiceOver、分屏往返、背景共存、导入／替换／卸载实机交互及 OTA 构建：**未执行**，离线回归不能替代真机验收。

## iPhone 换肤插件状态统一与设置页重构（2026-11-24）

关联 PA-019、PA-020、PA-021。工作区为 `ui-plugin` 分支（已先合并对齐 `cursor/integrate-remote-branches-7334` 至 `95de23355`）。

- 已执行并全部通过：
  - 经用户明确授权执行 `pnpm install --offline --frozen-lockfile` 恢复本工作树离线依赖（2,113 包从本机 store 离线链接完成；可选原生包 `cpu-features` 编译提示失败但不影响安装退出码 0 及移动端离线验证）。
  - 移动端定向回归：`pnpm exec vitest run --maxWorkers=1` 执行 `apps/mobile/lib/` 下 `theme-pack.test.ts`（4 项）、`theme-manager.test.ts`（3 项）、`theme-controls.test.ts`（3 项）、`ui-mode-screen.test.tsx`（5 项）、`ui-mode.test.ts`（9 项）、`ui-mode-store.test.ts`（12 项）、`ui-mode-registry.test.ts`（9 项）、`ui-mode-provider.test.tsx`（2 项）、`ui-mode-slots.test.tsx`（7 项）、`appearance.test.ts`（6 项）、`app-error-boundary.test.tsx`（5 项）、`glass-surface.test.tsx`（5 项）、`account-screen.test.tsx`（28 项），**13 个文件共 98 项全部通过**。
  - 移动端类型检查：`pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` 通过（0 错误）。
  - 静态格式与 lint 检查：全部 19 个新增／修改源码及测试文件执行 Biome `check`，0 错误。
  - 空白与补丁检查：`git diff --check` 通过。
- 未执行项：
  - 真实 iPhone 视觉、大字体、VoiceOver、导入／替换／卸载实机交互及 OTA 构建：**未执行**，离线回归不能替代真机验收。

## PostgreSQL 记忆共享迁移与 RLS（2026-11-22）

本机 `.env` 指向 `127.0.0.1:54318/rakazo` 的 `rakazo-dev-postgres` 容器。目标生产数据库地址不在本机配置中，本轮没有连接或修改生产数据库。

- 首次状态检查发现本机数据库有 208 条已完成迁移，源码有一个本机空迁移目录 `20261114220000_native_password_reset_session`，该目录没有被 Git 跟踪且没有 `migration.sql`。清理空目录后使用完整源码迁移目录继续执行。
- Prisma `migrate deploy` 按顺序补齐 18 条待执行迁移，包括 `20261122120000_shared_memory_across_projects`。最终 `prisma migrate status` 报告 `Database schema is up to date`，账本记录目标迁移已完成。
- `memory_documents` 与 `memory_revisions` 均确认启用 RLS。目标迁移创建的 `memory_documents_project_scope` 和 `memory_revisions_project_scope` 均存在，前者按当前 `userId + spaceId` 允许同租户 Bot 记忆，后者沿用文档归属校验。
- 使用 `rakazo_app` 非超级用户、非 RLS bypass 角色验证，当前用户和 Space 可以读到样本记忆；切换为其他用户和 Space 后 `memory_documents` 与 `memory_revisions` 均返回 0 条。
- 本轮未执行并发写入、revision 冲突、生产数据库备份、生产迁移或服务重启。迁移执行期间本机数据库已经发生变化，生产环境仍需单独按运维流程执行。

## Bot 状态、记忆共享与 App 发布（2026-11-22）

本批提交 `fc2f9d13ab3e2a258a62a26da1d58115395f2e20` 已推送到 `cursor/integrate-remote-branches-7334`。源码覆盖普通／项目会话的 Run 状态恢复、未读头像标记、项目与 GitHub 页面状态缓存，以及同用户同 Space 下普通 Bot 与项目 Bot 的持久记忆共享。

- Windows 工作流 Run [44978766434](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44978766434)：成功。Release [Sydney Windows 0.4.4](https://github.com/zxl3305479573-max/Sydney-personal-agent/releases/tag/sydney-desktop-v0.4.4) 已公开，Release ID `454171797`，包含安装包、`SHA256SUMS` 和 `build-metadata.json`。安装包 `Sydney-partner-Setup-0.4.4.exe`，133,981,118 字节，SHA-256 `763df8627e4ec8e603e86e12654d36f5fd328919e5f29f855561e54a34710614`。`build-metadata.json` 确认源码提交、Windows x64 产物和未签名状态。
- iOS 未签名底座工作流 Run [44978723093](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44978723093)：成功。IPA SHA-256 `f379b20f3c4b044a8f484bfc4d16e1474f7dfd5ab505f445761403cced7b63ee`，Bundle ID `xin.zxlup.sydney`，原生版本 `1.0.12`，OTA runtime `sydney-ios-ip-1`，OTA URL 指向 Sydney 独立项目，未包含 Widget 扩展，9 个资源目录均被主 bundle 引用。
- iOS OTA 工作流 Run [44978769113](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44978769113)：成功。更新组 `6cfe7f68-0bc8-40b4-85e2-81a4f9929593`，iOS 更新 ID `01a20136-1ba5-7848-9d7f-518e379615c9`，runtime 与已安装底座匹配。
- 发布核对只使用内存中的 Git Credential Manager 凭据，没有输出或保存 token。下载的构建工件放在仓库忽略目录 `.tmp/release-check/`，未进入提交。
- 尚未执行 PostgreSQL 迁移及 RLS／并发实测，未部署 API／Worker；Windows 覆盖安装、iPhone OTA 生效、系统重启、断线恢复和跨入口记忆互读仍待真实设备或隔离环境验收。

## Bot 未读头像标记与 GitHub 导航修补（2026-11-22）

用户要求 Bot 有未回复或未读消息时，头像持续保留小绿点。`BotAvatar` 复用现有 `unread` 字段，普通 Bot 行、置顶卡片和滑动预览均传入该状态；运行中和未读同时存在时只渲染一个标记。GitHub 顶部导航固定为等宽三栏，点击高度固定，选中态不再推动布局。

- `pnpm exec vitest run apps/mobile/lib/bot-avatar-render.test.tsx apps/mobile/lib/github-screen.test.tsx`：2 个文件 27 项通过。
- `pnpm --config.engine-strict=false --filter @rakazo/mobile exec tsc --noEmit -p tsconfig.json`：通过。直接执行因本机 Node `22.22.0` 低于仓库要求 `22.22.2` 被 pnpm 拒绝。
- 本批源码 Biome、Impeccable `detect --json --changed` 和 `git diff --check`：通过。
- `apps/mobile/lib/inbox-render.test.tsx` 因测试 mock 没有 `TurboModuleRegistry`／`ExpoSecureStore` 原生替身，在导入阶段失败，未将首页列表断言计入通过。
- 未启动本机服务或数据库，未执行真实 iPhone 视觉／导航。客户端发布结果已在本文件顶部的发布记录中核对。

## App 0.4.3／1.0.23 全量提交与发布（2026-11-22）

用户明确授权提交推送所有修改并发版 App。基线为原集成分支 `4897eaf85`，与远端同步；当前修改含手机 Bot／项目／GitHub 状态缓存、统一平面材质、Windows 目录及默认关闭的 WSL 项目命令候选、共享设备协议与文档。使用 release 技能参考版本和发行说明规则，沿用 Sydney 专用 Windows 工作流与 iOS OTA，不触发上游多平台标签或后台镜像部署。

发布前离线验证：首批 26 文件 369 项 Vitest 通过；补充 contracts 项目目录、core 项目会话、设备 Gateway／Emulator 与桌面设备入口 5 文件 88 项通过，合计 31 文件 457 项。7 项 WSL runner 参数单元测试通过；手机、desktop、contracts、core、adapters 五项 TypeScript 通过。76 个变更源码／测试／JSON 文件 lint 通过，首页已有的无用 Fragment 信息提示保留；全批差异检查通过。云端任务／产物记录随后同步。

本机没有 `gh` 可执行程序，复用现有 Git Credential Manager 的凭据在内存中调用 GitHub REST API，未输出或保存令牌。只触发既有客户端云工作流，不安装依赖、不启动本机服务或全仓构建。手机 `mobile-ui-sheets` 的原生动画导入失败是前批已记录的测试限制，本批未把该用例计为通过。真实 iPhone 视觉／手势和 WSL guest 验收保持待验。

发布与线上核验结果：提交 `7d2829aa34690f44d0884cbe5a9e64154117c8ac` 已推送到 `cursor/integrate-remote-branches-7334`，轻量标签 `sydney-desktop-v0.4.3` 已指向该提交。Windows 工作流 Run [44924368519](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44924368519) 首次因 `cpu-features` 原生依赖安装失败而缺少 Playwright 命令，重跑成功；安装包下载校验通过，大小 133,979,245 字节，SHA-256 `0045647e06c4905cdcd543ca5c10932436b057d872c0eaeb98d63dc4acff8d2f`，工件摘要 `sha256:9a90c7574eed65ed0a3db31f6d0ac8a06d0d4bbfa27d35fb2002bc43659f78b5`，打包的 `project-command-runner.py` 与源码一致。Windows Release ID `454106881` 已公开，发行页三项资产和公开 `SHA256SUMS` 已复核。iPhone 工作流 Run [44924402538](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44924402538) 成功，线上更新 ID `01a1feed-f697-7322-933e-a5c89e9ce8f1`，启动包 HTTP `200`、10,667,888 字节，55 项资源通过校验。两端均未执行真实设备覆盖安装、保留数据回退、侧滑返回或 WSL guest 验收。

## 手机界面玻璃效果统一收敛（2026-11-22）

关联 PA-020／PA-021。共用表面默认使用平面样式，只有聊天标题显式保留玻璃；主题 `solid-fallback` 与旧系统仍回退。设置、主模块卡片、聊天内容与输入附件、普通标题和按钮均移除玻璃材质；原生导航项隐藏共享玻璃底。源码检索确认 `apps/mobile` 产品代码只剩共用表面内受 `chatTitle` 条件保护的 `glassEffect`，唯一显式启用处是 `chat-title-content.tsx`。

- 定向回归第一批：`pnpm exec vitest run --maxWorkers=1` 后列出 `glass-surface.test.tsx`、`glass-title.test.tsx`、`native-action-button.test.tsx`、`chat-header-title.test.tsx`、`chat-route-header.test.tsx`、`settings-group.test.tsx`、`thread-header.test.ts`、`thread-edges.test.tsx`、`integrations-screen.test.tsx`、`project-chat-screen.test.tsx`、`thread-card-width.test.tsx`（均在 `apps/mobile/lib/`）：11 文件 165 项通过。
- 第二批：`pnpm exec vitest run --maxWorkers=1 apps/mobile/lib/ui-mode-registry.test.ts`：1 文件 9 项通过，合计 12 文件 174 项。覆盖默认无玻璃、标题例外、主题回退、按钮明暗／禁用／选中状态、设置分组、导航返回与侧栏、连接交互、项目聊天与消息宽度。
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json` 通过。测试 TEMP／TMP 仅当前进程指向既有忽略目录 `.tmp/bot-state-verification`。
- 本批 29 个源码／测试文件 Biome 通过；`new-group.tsx` lint 通过，全文件格式检查报告非本次修改行的既有排版差异，该文件仅修改原生导航项背景和 Next 的显示变体。未整体重排该文件。本批源码／文档差异检查通过。
- 11 月 21 日验证被用户中断，未把被中断命令计作通过。继续后的首轮中，返回按钮用例仍断言原系统返回按钮可见，实际已改为无玻璃原生项；更新断言并验证回调后通过。标题测试中一处可空项类型错误已修正，最终类型通过。
- 额外尝试的 `mobile-ui-sheets.test.tsx` 在导入 `react-native-reanimated/lib/module/ReanimatedModule` 时被 Node 拒绝目录式 ESM 导入，未执行断言；未改动画依赖或把它计入通过数量。
- 未启动本机服务、安装依赖、全仓构建、发布 OTA 或进行真机截图对比。真实 iPhone 的设置／主模块／聊天整体观感、大字体、主题切换、返回与侧滑返回及菜单仍待验；离线 DOM 与原生替身回归不能替代真实渲染验收。

## 应用对接登录按钮（2026-11-21）

关联 PA-021。应用目录、已安装连接与插件详情的登录／添加／连接操作复用 `variant="text"`，双平台文字按钮及 iOS 等待状态保留 44pt 最小高度。授权流程与连接状态逻辑未调整。

- `pnpm exec vitest run --maxWorkers=1 apps/mobile/lib/integrations-screen.test.tsx apps/mobile/lib/native-action-button.test.tsx apps/mobile/lib/native-controls.test.ts`：3 文件 57 项通过，覆盖现有应用连接交互与按钮禁用／主题／原生变体。
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`：通过。TEMP／TMP 仅本进程指向既有忽略目录 `.tmp/bot-state-verification`。
- 首次 Biome 命令因 pnpm Windows 启动器无法处理路径中的括号而未运行；改用现有 Biome 的 Node 入口后，发现目录页既有 import 排版与本次条件表达式需要整理，已局部调整。最终 4 个源码文件 Biome 检查及本批源码／文档差异检查通过。
- 本机没有可用的已运行手机画面或该页面截图基准，未进行真实渲染对比、iPhone 视觉与大字体验收；未启动服务、安装依赖、全仓构建或发布 OTA。连接行为回归通过不等同于视觉验收。

## 项目与 GitHub 页面状态保留（2026-11-21）

关联 PA-021／PA-022。本批范围是手机项目列表与分页、项目详情／归档成员、本机／云目录状态、项目文字聊天快照／身份，以及 GitHub 年份、仓库与探索筛选／分页／详情／搜索输入和浏览滚动位置。本次登录的页面数据保存在共享 QueryClient，后台请求校正，服务器明确拒绝时清除对应结果。

- 首轮项目 Hook／页面测试中 4 个文件在导入阶段失败：缓存模块通过请求层引入 Expo 原生依赖。拆出无原生依赖的同一 QueryClient 实例后，6 个文件 89 项通过；没有给产品代码添加原生模块替身。
- 新增整页回归首轮 4 项因测试遗漏 RefreshControl 替身失败，补齐后连同前批 Bot 缓存，10 个文件 124 项通过。最后增加线程重建与明确拒绝后的缓存清除回归，最终执行 `pnpm exec vitest run --maxWorkers=1 apps/mobile/lib/project-pages-state.test.tsx apps/mobile/lib/use-github.test.tsx apps/mobile/lib/use-project-thread.test.tsx apps/mobile/lib/use-project-directory.test.tsx apps/mobile/lib/project-chat-screen.test.tsx apps/mobile/lib/github-screen.test.tsx apps/mobile/lib/query.test.ts packages/core/src/project-thread-session.test.ts apps/mobile/lib/thread-session-cache.test.tsx apps/mobile/lib/saved-chats.test.ts`：10 个文件 128 项全部通过。
- 最终 `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`、`pnpm exec tsc --noEmit -p packages/core/tsconfig.json` 均通过；本批 18 个源码／测试文件 Biome 检查退出码为 `0`，本批差异检查通过。
- 使用命令级 TEMP／TMP 指向仓库忽略目录 `.tmp/bot-state-verification`，避开 C 盘临时空间不足；未修改系统配置或删除用户文件。
- 未执行客户端构建、安装、真实 iPhone 页面／滚动交互、系统杀进程／重启、服务器或数据库验证；未提交推送或发布 OTA。

## iPhone 对话运行状态缓存补修（2026-11-21）

关联 PA-018／PA-021。移动端增加登录会话内最近快照，首页普通列表与置顶 Bot 订阅执行状态；重新进入对话先显示已有快照，再由服务端读取校正。本地缓存保留 `run`／`activeRuns`，同步首页磁盘状态。完成、取消与清空收口，最新名单可校正关闭期间结束的任务；较旧名单不覆盖其请求期间的新状态。

- `pnpm exec vitest run --root . apps/mobile/lib/saved-chats.test.ts`：1 个测试文件、14 项通过，覆盖运行中状态保留、首页 Bot 状态同步、完成后恢复 idle、身份源文本保留和敏感问答缓存约束。
- `pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json`：移动端 TypeScript 检查通过。
- 最终执行 `pnpm exec vitest run --maxWorkers=1 apps/mobile/lib/thread-session-cache.test.tsx apps/mobile/lib/saved-chats.test.ts apps/mobile/lib/thread-foreground.test.ts apps/mobile/lib/thread-paging.test.tsx apps/mobile/lib/thread-snapshot.test.ts`：前 4 个文件 33 项通过，最后的线程快照测试因临时目录所在 C 盘空间不足（`ENOSPC`）在导入阶段失败。仅将补验命令的 TEMP／TMP 指向仓库忽略目录 `.tmp/bot-state-verification`，重跑 `pnpm exec vitest run --maxWorkers=1 apps/mobile/lib/thread-snapshot.test.ts`，3 项通过；合计 5 个文件 36 项通过。未清理用户文件或更改系统临时目录配置。
- 扩展执行 `apps/mobile/lib/inbox-render.test.tsx` 在导入阶段失败：缺少 `ExpoSecureStore` 的原生模块替身，断言未运行。未修改该测试或声称其通过。
- 7 个受影响源码／测试文件的 Biome 检查退出码为 `0`，首页既有单子节点 Fragment 信息提示保留；仅修改注释的 `apps/mobile/lib/api.ts` 单独 lint 通过。8 文件全量检查另报告 `api.ts` 两处未改代码的格式差异，HEAD 原文检查同样失败，未顺带修改。
- 未执行本机服务、数据库、客户端构建、安装包验证、真实 iPhone 交互或断线恢复。

## Windows 项目命令离线续接（2026-11-21）

修复工具选择阶段依赖 Windows 设备在线的问题。现在模型是否获得命令工具由本次 Run 固定的 Windows 目录和所有者范围决定；设备离线不会阻止创建项目审批。批准后请求未送达而设备离线时，原 Run 与批准状态进入既有 `run.queued` 续接路径。桌面端仍需在本机确认前通过 guest 状态检查，并在实际 WSL 启动时由 runner 再次检查；guest 不可用时不运行命令。已派发后失联继续按未知结果处理，不自动重试。

- `pnpm --config.engine-strict=false exec vitest run packages/adapters/src/run-project-policy.test.ts packages/adapters/src/run-tools-project-windows-command.test.ts apps/desktop/src/project-directory.test.ts apps/desktop/src/project-windows-command.test.ts`：4 个测试文件、73 项通过。覆盖不要求工具选择时设备在线、固定设备命令请求、离线续接分支、guest 不可用时不弹本机确认，以及桌面 runner 路径和取消后结束卡住的 WSL 客户端。
- `python -B infra/windows-wsl/project-command-runner.test.py`：7 项通过，覆盖请求路径及输入校验；没有执行 WSL guest。
- Adapters／Desktop TypeScript 检查及 5 个改动文件的 Biome 检查通过。Node `22.22.0` 低于仓库最低 `22.22.2`，使用命令级 `engine-strict=false`；未安装／切换依赖。
- 本机仍没有专属 WSL guest，只有 Docker Desktop 内部发行版；未做真实设备离线重连、客体隔离负向验证、打包安装或双端实测。生产设备开关保持关闭。

## Windows 隔离项目命令候选（2026-11-21）

关联 PA-022／PRJ-02／P02-09。工作范围是 Windows 项目命令协议、设备固定路由、模型工具能力探测、逐次双重审批、授权项目文件快照暂存、WSL runner 调用及结果／取消路径；运行时默认关闭。

- `python infra/windows-wsl/project-command-runner.test.py`：7 项通过，覆盖相对路径拒绝、重叠／重复文件、UTF-8 输入、单文件大小、超时及输入绑定。测试只运行请求校验，不执行 Bubblewrap 或实际命令。
- `pnpm --config.engine-strict=false exec vitest run packages/adapters/src/run-project-policy.test.ts packages/adapters/src/run-tools-project-windows-command.test.ts packages/adapters/src/user-device-client.test.ts apps/desktop/src/project-directory.test.ts apps/desktop/src/project-windows-command.test.ts`：5 个测试文件、94 项通过，覆盖能力关闭、固定设备、工具审批、设备通道、授权目录文件副本、guest 不可用／用户拒绝、取消信号及桌面调用器模拟。
- `pnpm --config.engine-strict=false --filter @rakazo/contracts check`、`... @rakazo/adapters check`、`... @rakazo/desktop check`：三项类型检查通过，桌面含主进程及 jsdom 配置。`biome check --write` 对 19 个受影响 TypeScript 文件完成格式整理。
- 默认执行 pnpm 时因本机 Node `22.22.0` 低于仓库要求而拒绝；以上检查仅以命令级 `engine-strict=false` 使用已安装依赖，没有切换 Node 或安装依赖。
- 客户端只接受格式受限的 `SYDNEY_PROJECT_WSL_DISTRIBUTION`，打包 Windows runner 并使用 argv 调用 WSL；当前没有可用专属发行版，只有 Docker Desktop 内部 WSL。未配置发行版变量，未执行隔离探针、测试命令、宿主路径／网络／interop 负向实测或进程残留检查。
- 未构建／安装 Windows 新版本，未配置或安装 WSL guest，未更改生产 API／Worker 或 `SYDNEY_PROJECT_DEVICE_TOOLS_ENABLED`。手机—Windows 项目消息／Run 完整同步、项目命令在真实 guest 运行及双端安装版验收均未完成。
- 当时的候选限制：工具能力探测需要绑定设备在线，因此工具选择前离线无法创建命令等待。该限制已由本节之后新增的“Windows 项目命令离线续接”更新；后续实现不以在线或历史 guest 状态作为安全证明，执行前仍必须通过实时检查。

测评项与目标 guest 验收步骤见 [手机与 Windows 项目同步测评](design/PROJECT_DEVICE_SYNC_EVALUATION.md)，隔离边界记录见 [ADR-0027](../docs/adr/0027-windows-project-command-isolation.md)。本次只证明离线候选接线与模拟／契约回归，不证明 Windows 任意项目命令已可用或安全验收完成。

## Sydney App 0.4.2／1.0.22 整合与发布（2026-11-21）

关联 PA-019／PA-021／PA-022／REL-01。原工作区基线 `2e4daa0a9`，冻结 505 个相关变更路径，在远端最新 `8e008d76a` 上三方整合。25 个冲突文件保留已上线项目聊天与原生取消兼容行为，主题管理接线另行合入。初轮类型和 lint 发现自动合并重复项、旧发布源断言及表单关联问题，已定点修复；没有关闭类型或 lint 规则。

使用已安装 Node `24.15.0`、pnpm `9.15.0`、Vitest `4.1.12`。候选仅链接现有依赖，执行 `pnpm --filter @rakazo/db generate` 生成隔离工作树的 Prisma 客户端，没有安装依赖或连接数据库。默认 Node `22.22.0` 不满足仓库 engines，已切换现有受支持版本后执行最终检查。

- 首批 22 个文件、560 项单 worker 定向回归全部通过，覆盖主题协议／管理／模式、项目头像与聊天管理、语音、输入栏、电脑操控、更新、桌面配置及共享组件。
- 手机、桌面主进程、桌面 jsdom、共享 Web 与 API 五项 TypeScript 检查退出码均为 `0`。
- 227 个受影响源码文件的 Biome lint 通过，未全局格式化；暂存及工作差异的空白检查通过。
- 补充 12 个文件、543 项回归通过，覆盖服务地址、账号切换、外观、项目列表与会话 Hook、项目 RPC、AI 同意、插件提交、桌面认证及更新。两批共 34 个不同文件、1,103 项通过。
- 源码提交 `24687d3c6f41d9504dab20df65c51d0873442cea` 共 474 个文件，已正常快进推送 `cursor/integrate-remote-branches-7334`；未改写远端历史，未推送上游仓库。

### Windows 云构建与公开发行资产

`desktop-windows-build.yml` Run [44899117690](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44899117690) 全部成功，源码 SHA 与上述提交一致。打包后六项实际安装版连接、错误后台处理、旧配置迁移及更新禁用保护测试均由工作流逐一验证通过。安装包工件 ID `14705565789`，ZIP SHA-256 为 `ee9ac892c83cb88a9f717bea192206321e15244c712a50e4b4982949438f1a50`，下载后与 GitHub 工件摘要一致；构建元数据中的 revision、runId 与安装包大小一致。

标签 `sydney-desktop-v0.4.2` 指向同一源码提交，已推送。[Windows 发行页](https://github.com/zxl3305479573-max/Sydney-personal-agent/releases/tag/sydney-desktop-v0.4.2)（Release ID `453645874`）于 `2026-11-21T11:35:19Z` 公开，GitHub latest 指向本发行版。安装包 `Sydney-partner-Setup-0.4.2.exe` 为 133,969,350 字节，SHA-256 `276c7ec5aeeecb9926c8628f998bdb515ea292ccdef9513865f5141ab0cde813`。构建记录和本机只读签名核对均为 `NotSigned`。安装包、`SHA256SUMS` 与 `build-metadata.json` 三项资产的远端状态、大小、SHA-256 均与本地核验值相同；无认证访问的公开摘要文件下载结果也一致。没有在本机执行安装程序。

### iPhone OTA 与实际更新协议

`mobile-ios-update.yml` Run [44899174271](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44899174271) 成功，源码 SHA 同上。使用已有侧载二进制的 Expo 更新配置请求实际分发地址：HTTP `200`，版本 `1.0.22`、三语说明、runtime `sydney-ios-ip-1` 与候选一致。更新 ID `01a1fddd-fb68-7080-97e2-bf37db62db76`，创建时间 `2026-11-21T11:29:05.896Z`，晚于内嵌基线。Hermes 启动包为 10,657,756 字节，SHA-256 `6312b3ceb0159f029471309334037cd1dc906a59d543d1ac6ef0242ad76efdf1`；启动包及全部 55 项资源摘要逐一校验通过。

### 仍待设备验收与本批边界

双端实际覆盖安装、iPhone 下载重启后的交互、主题 TH-12、大字号／键盘／VoiceOver、前后台及保留数据回退待验。不部署 API／Worker、数据库迁移、Linux 驱动或官网，不开启项目设备能力；Android 通知与 iOS 小组件等原生改动仅入库，不随 OTA 生效。冻结后其他窗口新增的 Windows WSL 命令实现保留在原工作区，未混入本次源码提交或发行包。本节不把发布成功解释为这些项目已验收。

原工作区同步已回读：分支与远端发布记录对齐，手机版本为 `1.0.22`、桌面版本为 `0.4.2`，发布及验证文档在原工作区可读。一次协议文件写入错误后，已确认文件内容未变、索引仍为原基线，再仅同步索引；没有重试覆盖该文件。剩余未提交内容属于冻结后新增的 WSL 执行器、协议与接线及其测试，保留交由原窗口继续验证。此工作区恢复不改变已发布标签、构建 SHA 或发行资产。

## iPhone 声明式主题包离线候选（2026-11-21）

关联 PA-019／PA-020／PA-021。新增主题包解析、资源限制、全局／页面类型分配、预览／应用／卸载／恢复及旧模式迁移。示例包位于 `docx/theme-packs/`，专项矩阵见 [iPhone 专项评测](THEME_PLUGIN_EVALUATION.md)。

- `node ./node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json`：通过。
- `node ./node_modules/vitest/vitest.mjs run apps/mobile/lib/theme-pack.test.ts apps/mobile/lib/theme-manager.test.ts apps/mobile/lib/ui-mode.test.ts apps/mobile/lib/ui-mode-store.test.ts apps/mobile/lib/ui-mode-screen.test.tsx --maxWorkers=1`：5 个文件、30 项通过；覆盖声明式字段拒绝、全局／局部继承、页面路由映射、导入、预览、应用、恢复、旧选择回退和无效绑定清理。
- 本轮改动文件的 Biome 检查通过，`git diff --check` 通过。
- 本轮未构建 IPA、未签名、未发布 OTA、未安装或操控 iPhone，未启动 Docker／数据库／桌面服务；TH-12 及其他真实设备验收保持待执行。
- 评测文档和设计、计划、需求、ADR、开发记录已同步。未执行的项目不能视为通过。

## 欢迎卡片自由输入等待收口（2026-11-21）

范围为 PA-018／PA-021，基线 `f9a59b8f6`，独立候选 `.tmp/onboarding-wait-fix`。生产 API／Worker 的状态机源码、schema 和锁文件与该基线一致。

- 根因复现：在不改动生产的无网络临时容器中，以原状态机运行新增的 7 个时序回归，只有“先输入、后欢迎卡片”的普通问答用例失败，其余 6 项通过。用户输入已由后续任务处理时，介绍仍留在等待。
- 修复回归：Windows 与 Linux 分别运行 `vitest run packages/db/src/events.test.ts packages/core/src/answerable-ask.test.ts --maxWorkers=1`，各 2 文件、172 项通过，包含 7 项新增时序回归；这两次运行是同一组用例，不累计为 344 项。
- 类型与静态检查：数据库包和 Worker 的 `tsc --noEmit`、两个改动文件的 Biome lint 通过。完整 Biome check 报告基线已有的导入排序及其他段落格式问题，未扩大范围重排。新增代码没有新增格式诊断。
- 真实 HTTP／隔离 PostgreSQL：从生产仅导出 schema，以合成账户和非绕过 RLS 登录验证普通及项目 Bot 的“先输入 → 后出卡片 → 回复完成 → 重开聊天 → 首页 idle”；同时验证先出卡片再自由回答、显式选项回答、权限／凭据问题保留等待、他人账户拒绝及旧状态修复幂等。没有接真实模型或使用生产用户数据。
- 扩展检查：`apps/api/src/thread-target.test.ts` 与 `apps/api/src/onboarding.test.ts` 合计 84 项通过、23 项失败；在未改动的 `1.0.21` 基线重跑结果相同。失败为既有项目隔离上下文 mock／查询断言问题，本批未修复，不能宣称全仓测试通过。
- 发布结果：源码 `d7db91355` 已推送。API、Worker 均从各自线上源码及固定镜像分别编译，仅新增本次共享状态机修复；编译产物、map 和共享源码哈希均核对一致。生产 API／Worker healthy，`/health` 返回 ok，`/ready` 返回 ok 且非降级；只读挂载之外的配置与迁移账本未变。
- 遗留状态：服务器受限目录备份候选 Run、Task、Attempt 与卡片后，调用同一持锁事务收口，requested=3、retired=3、skipped=0；剩余匹配候选为 0。以各自租户身份走正常列表与聊天快照回读，三个首页状态均为 idle，旧介绍均不在 activeRuns，原卡片均不再 pending。原有一条 routine 与一条 user 等待未变；实时通知使用提交后的最终游标。没有把权限／凭据卡片或用户任务取消。
- 实机边界：手机沿用 `1.0.21`，本批未改客户端、未触发 OTA；iPhone 更新显示和真实交互仍待用户复核，不能将数据库／HTTP 验证等同于真机通过。


## 项目 Bot 同步与聊天管理（2026-11-21）

React Native `abort-controller` 缺少 `throwIfAborted()`，iPhone 在读取名单前报错。按 `aborted` 判断后，实际 RN 取消信号回归确认标题和回复显示同一已选头像。Windows 两批定向回归 326 项通过，手机与 API TypeScript 及增量 lint 通过；Linux 同镜像 Bot 生命周期回归 46 项通过。合成账号的 PostgreSQL／HTTP 验证覆盖两个项目、两个账号，确认头像、改名、模型、未读、清空、复制、归档、恢复、群组变更、两种删除记忆选项及越界拒绝。

源码 `a9d7a341d` 已推送，生产 API 于北京时间 17:50 切换，公开 `/health` 和 `/ready` 正常，Worker 与迁移账本核对通过。`1.0.21` OTA Run `44891565107` 成功，17:53:49 发布，更新 ID `01a1fd86-c215-7547-9ad6-5079a0ddcfae`，runtime `sydney-ios-ip-1`。Hermes 启动包及 55 项资源摘要全部通过。USB 只读设备探针未发现可查询设备，手机实际加载及操作待验。

## 旧品牌 Bot 图案清理（2026-11-21）

移除了手机旧吉祥物组件、Web 旧矢量绘制组件与展示夹具，并删除对应资源及旧组件 E2E 入口。常规 Bot 头像和头像库继续使用 Sydney 渲染；预设紫晶、橙花、蓝羽以及自定义图片文件未改动。历史 `avatarSet` 值保留数据读取兼容并落到现有头像，不再调用旧图案。

六个手机和桌面预设头像的 Git blob 摘要与 `HEAD` 一致。Android 原生通知资源与已使用的 Sydney 通知 PNG 的 SHA-256 一致，原生通知和来电服务均改用新资源。移动端、桌面、Web、API 和适配器定向 TypeScript 检查通过。Astro 检查 39 个文件，零错误、零警告、零提示；独立官网静态构建通过。用本机 Chrome 检查桌面和 iPhone 尺寸的首页、品牌页、发布和侧载链接，已撤下的隐私、条款、支持、博客、集成及旧头像资源路径返回 404，官网源码及静态产物扫描无旧名称。

一轮 14 个 Vitest 文件共 241 项，240 项通过。唯一失败为手机语言目录缺少已有的 `Space changed. Please try again.` 文案，`HEAD` 已引用该文案。桌面语言、模型帮助、保留头像、旧头像回退、AI 数据同意、发布跳转及插件确认定向测试通过。随后 16 个文件的 640 项回归全部通过，覆盖隐私链接、后台提示、支付、MCP、桌面画面和其他适配器，包含重复执行的 AI 同意用例。用测试域名完成静态构建，核对站点地图和分享地址。`git diff --check` 通过。未运行 Android／iOS 原生构建、真实安装、生产后台或全工作区构建。内部包、应用协议、数据库里的旧值与部署来源仍见 [计划](PLAN.md)。

## 项目头像与聊天反馈补修（2026-11-21）

以用户四张 iPhone 截图为依据，运行生产源码确认名单查询只选取 `id`／`name`，已存 `color` 图片和 `avatarSet` 未回传。新增回归先复现漏字段，再修复项目 Bot 与群成员回传；手机复用 `ChatTitleContent`、普通消息卡片、输入栏 Dock、模型菜单及标题／键盘边距，设置与模型使用项目专属 get／update。源码提交 `e7d729212b01e24159c0b48cab67c7da7a618db3` 已正常推送原集成分支，其他窗口源码保留。

17 个定向文件共 304 项回归、手机和数据库 TypeScript、增量 lint 通过；末轮标题／键盘 36 项及普通标题 24 项复验通过，均为重叠受影响测试，不累加为独立总数。未启动本机服务、安装依赖或全工作区构建。在授权服务器只复制数据库结构，以两个合成账号／两个项目验证创建图片、名单与群成员、设置保存和重新打开；跨项目读写、跨账号修改及首页读取项目 Bot 均返回 404，RLS 强制启用，临时容器已清理。

北京时间 16:19 后台 API 健康上线，沿用原镜像，通过八个只读文件挂载交付六个必要源码和单入口编译包／map，Worker、环境及迁移账本不变。API 包 SHA-256 `60cc45f40476e7fd1c0d20f2f43baf87b14179fe0a71913d12eaa95b331973a3` 与 map `78b073218665c685aa97335e27166757a7f826bb65242e6b8cae41552a529d9b` 在线核对一致。之后以实际运行角色及 `default_transaction_read_only=on` 读两个既有验收项目，4 个已存图片头像和 2 个群成员逐一匹配保存值，未修改既有项目、Bot 或模型。末轮已读取数据库设置确认只读模式开启，公开 `/ready` 返回 `ok:true,degraded:false`，`/health` 返回 `ok:true`。

`mobile-ios-update.yml` Run `44884608273` 成功。线上清单 HTTP 200，版本 `1.0.20`、三语说明与候选一致；runtime `sydney-ios-ip-1`，更新 ID `01a1fd35-3b12-712b-bafa-11fea72d4b81`，创建时间 `2026-11-21T08:24:46.610Z`。Hermes 包 10,619,332 字节，SHA-256 `26b99f8cc1b1f7c183d18965c68fc11011611aed50eb833555d789b8912db0ef`，启动包与 55 项资源全部校验通过。iPhone 实际下载重启、头像显示与键盘交互仍待真机确认，不能以发布成功替代视觉验收。[运维与回退](OPERATIONS.md#项目头像后台补丁与-iphone-10202026-11-21)

## iPhone 1.0.19 手机工作区发布（2026-11-21）

按用户授权冻结全部当前手机及必要共享源码 43 个文件，在 `.tmp/ios-1.0.19-release` 基于远端 `6b3dd087b` 三方整合；28 个文件的改动已在 `1.0.18`、15 个文件有本次增量。解决 9 个文件冲突，保留已上线的聊天操作栏、模型菜单、长名称换行和电脑画面修复。封存后核对这些主工作区文件无后续变化。共享依赖链接指向候选源码，未重装依赖、启动服务或进行全工作区构建。

Node `24.22.3`、Vitest `4.1.12` 下，21 个定向手机及共享测试文件共 512 项通过，涵盖项目聊天共用消息／输入框、失败草稿、头像和分页身份、项目前台刷新、审批取消下载、模型菜单、电脑操作与鼠标箭头。手机、core、contracts 类型检查，15 个增量 TS／TSX 文件 Biome lint 和暂存差异空白检查通过。完整格式检查提示两个目录组件的全文件排版差异，本批未整体格式化；合并后遗留的旧 `styles` 传参已修正。没有原生配置、依赖或锁文件变更。

源码 `8d40d7021565a41fff34639f3d2f188bac2683ee` 已正常快进推送至 `cursor/integrate-remote-branches-7334`，既有 `mobile-ios-update.yml` Run `44878494306` 成功。北京时间 15:06 发布到 iOS `sideload`，清单 HTTP 200，三语说明与候选完全一致，版本 `1.0.19`、runtime `sydney-ios-ip-1`，更新 ID `01a1fced-7d60-74d9-af35-765d13ae922c`，创建时间 `2026-11-21T07:06:24.992Z`。Hermes 启动包 10,551,204 字节，SHA-256 为 `8f7f9643d2c8f19124958d2e5e116495205e97c930e4c59161c45735aa3e5be8`；启动包及全部 55 项资源摘要与清单一致。手机实际下载重启与交互待验，后台／Windows／Linux 驱动未随本批部署。

## 云电脑文件更新冲突与 Linux 复验（2026-11-21）

PA-022／PRJ-02。上一轮正式 Windows 实际键鼠落点属于进展。本轮先复核交付条件，发现维护机跳板连接仍在 SSH banner 阶段超时，同主机直连在认证前关闭，USB 无 iPhone。同期其他窗口完成文本版本更新候选，但其驱动本轮仅在 Windows 跳过 Linux 专属用例，因此补做当前源码的 Linux 实跑，再核对 Provider 消费结果。

### 当前驱动的真实 Linux 文件系统验证

只读截取 `infra/native-linux/driver.py` 与 `test_driver.py`，使用生产已缓存镜像的全新临时容器，以非 root 的 `node` 用户运行 `python3 -B test_driver.py -v`。容器无网络、无端口、无 Docker socket 或生产数据挂载，根文件系统只读，限 0.5 CPU、128 MiB、64 个进程及 32 MiB 临时目录。没有连接真实桌面或生产驱动服务。

24 项全部通过，无跳过，测试退出码 `0`、OOM 为 false。包括实际 Linux 临时目录中的读取摘要、正常文本更新、旧摘要冲突且文件保留、符号链接／硬链接和路径越界拒绝、授权目录替换拒绝，以及 Linux socket 下命令正常结束和断开拒绝。临时容器和源码目录已清理，快照与执行后本机源码摘要一致：

- `driver.py`：`13fea75a4292b1864b036803229ec8982e6ef4707731b6da4fb8739d12ffddd5`。
- `test_driver.py`：`fd919c81abee4287ce8803b5b7cc7bcd92be5bda79b28796e3ee3fd0d654fb62`。

执行入口保留在忽略目录 `.tmp/verify-current-driver-linux.py`。这些结果补齐下节原批次缺少的 Linux 证据，不证明生产驱动已更新或私有通道和项目真实任务通过。

### Provider 冲突结果修复

继续追踪发现 `NativeLinuxSandbox.executeProjectFile` 要求返回操作与请求操作同名，错误拒绝驱动为 `update` 返回的合法 `conflict`。上层原有冲突持久化路径因而收不到该结果，会进入写入结果未知的错误处理。先新增回归，修复前按预期出现一项失败；随后只放行 `update → conflict`，其他操作不匹配仍拒绝，不新增自动重试。

Node `24.22.3` 与既有依赖运行 `native-linux-sandbox.test.ts`、`run-tools-project-files.test.ts` 和 `user-device-client.test.ts`，三文件 48 项通过、2 项 Linux socket 用例在 Windows 跳过。新增用例覆盖正常更新和冲突的原样返回，以及读取／新建不能接收冲突结果。adapters 类型检查退出码 `0`，两个受影响 TypeScript 文件关闭 formatter／assist 的 Biome lint 通过。没有修改其他窗口的 Python 驱动或扩大其同步／目录枚举写集。

### 仍未满足的交付条件

生产只读核对 API、Worker、PostgreSQL 均 healthy，API／Worker 仍为 `sydney-pa022-project-text:20261121`，项目文字开关开启，两服务设备开关均关闭，生产没有已记录的独立 `server` 候选标签。现有 curl 方式检查 IP 和域名 `/ready` 均为 `200`，TLS 校验保留。Python urllib 探测曾返回 `403`，方式差异未定位，未据此更改配置。本机 `gh` 不可用，未取得云端构建记录或触发构建。

| 首版项 | 剩余条件 |
| --- | --- |
| WEB-01 | 恢复维护机或明确其他授权交付入口，完成独立后台最终候选交付和实际生产重建 |
| APP-01 | Windows 实际退出重登和 iPhone 基础功能、运行版本及前后台验收，需要用户配合真实登录和手机操作 |
| APP-02 | 团队接管、运行中 Agent 停止、真实 MCP 授权和 iPhone；保留现有等待任务，不能以合成回调代替授权 |
| GH-01 | 在客户端输入测试 PAT，完成新绑、上游撤销、确认解绑及 iPhone 同项；不撤销现有真实连接代替样本 |
| PRJ-01 | 配套后台发布后的项目设置及双端实际同步、重进和隔离 |
| PRJ-02 | 匹配后台、驱动和客户端的目录任务及隔离终端；生产开关继续关闭，其他窗口尚未完成的枚举、离线续接与 WSL 隔离不扩称为已完成 |
| REL-01 | 后台／iPhone 实际发布和保留数据回退、完整文件恢复；维护机上的恢复身份与材料当前不可达 |

本轮新增 Linux 证据及 Provider 修复已完成。维护机不可达已在连续三个 Goal 续作中复现，现有认领范围内可独立完成的补验已推进；剩余生产／实机交付需要外部状态、明确维护批次或用户配合。自动续作进入依赖阻塞，原七项首版目标保留，首版不标完成。没有安装依赖、切换生产服务、更新驱动、开放设备开关、提交或推送。

## 项目文件版本更新与双端在线刷新（2026-11-21）

本轮完成双端项目元数据前台自动刷新：手机项目列表、成员页与聊天标题在前台每 15 秒复读并在回到前台后即时更新；Windows 包内项目列表、名称及成员名单使用 Query 自动刷新，窗口显示时即时补读。项目消息、审批、Run 与成果仍以既有项目 SSE／快照游标为准，发送重试沿用 nonce。新增文件更新工具：读文件响应给出 SHA-256，Worker 将此摘要随已审批操作固定到设备请求；Windows 以持有的原生文件句柄读取并在同一句柄更新，云电脑驱动将文本写入同目录临时文件后原子替换；摘要不同则返回冲突且保留当前文件。更新成功沿用现有项目产物与下载通道。

Windows 真实文件系统和本机回环设备套接字的受影响回归最终为 8 个文件 139 项通过、2 项跳过（Linux 专属测试），覆盖原生文件读取、新建、版本更新、过期摘要冲突、设备消息往返、路径／重解析点／硬链接拒绝，以及手机聊天标题、Windows 项目聊天和文件审批。Python Linux 驱动单元共 24 项，21 项通过、3 项因 Windows 无 Linux 文件描述符能力跳过；驱动文本本轮未在 Linux 运行。

定向 TypeScript 检查：`@rakazo/contracts`、`@rakazo/adapters`、`@rakazo/desktop`、`@rakazo/web` 及手机 `tsc --noEmit` 通过。执行器 Node 为 `22.22.0`，仓库 engine 要求至少 `22.22.2`；仅本次本机验证命令使用 `--config.engine-strict=false`，未改依赖。`git diff --check` 待最终复核。

未验证项目：iPhone／正式安装版双端实机同步；API／Worker 生产发布；云电脑原生驱动上机及真实文本更新；项目目录枚举／搜索；设备离线任务排队与结果未知的持久恢复；Windows WSL 2 执行项目命令。本机 WSL 仅有已停止的 `docker-desktop`，没有可用通用发行版。API／Worker 生产设备开关仍为关闭，不能宣称此目标完整交付。[验收矩阵](ACCEPTANCE.md#pa-022-手机与-windows-项目同步及设备执行测评2026-11-21) · [执行边界](OPERATIONS.md#pa-022-本机项目任务执行边界2026-11-21)

## 项目目录枚举候选（2026-11-21）

在上述同步与文件更新基础上，新增只读工具 `project_list_files`，接入项目 Run 的授权、一次性审批、固定设备分派和结果持久化。只返回授权绑定目录内单层普通文件／文件夹名称，最多 500 项；不递归、不读文件内容、不列出重解析点或链接。读写意图均允许名称枚举；只读意图不能因此读写内容。设备侧仍重新核对目录身份、Run 租约、取消及在途授权。

Windows 执行使用相对父目录句柄和 `NtQueryDirectoryFile`，只在已有授权目录句柄内读取目录项；本机实际 Windows 临时目录测试覆盖根目录与子目录名称、外部 junction 隐藏、取消及既有路径防护。项目文件协议及设备链路 8 个定向文件共 223 项通过、2 项 Linux socket 条件跳过，覆盖目录列表审批、子目录范围校验和越界设备响应不外泄。Python 驱动测试在本机 Windows 运行 24 项，其中 21 项通过、3 项因缺少 Linux 目录描述符能力而跳过；新增真实 Linux 临时目录列表断言也因平台条件跳过。故 Linux 实际目录列表仍待 Linux 执行器验证。Contracts、Adapters、Desktop 类型检查、相关 Biome lint 及 `git diff --check` 通过。

未实现内容：目录内容全文检索、设备断线后安全排队／恢复、已派发未知副作用的设备核对流程，以及隔离 Windows 命令执行。生产设备能力开关仍关闭，未部署 API／Worker 或本机安装包，也未在 iPhone、正式 Windows 客户端和云电脑对端联调。详情见[验收矩阵](ACCEPTANCE.md#pa-022-手机与-windows-项目同步及设备执行测评2026-11-21)。

## 项目设备明确离线与结果未知区分（2026-11-21）

修复项目文件创建／更新的一种误分类：固定 Windows 设备连接记录不存在时，网关在任何设备消息发送前返回 `UserDeviceNotConnectedError`。Worker 仅在该明确错误、且效果此前处于 `approved` 或 `intended` 时，将执行中效果恢复到相同状态并标明 `notDispatched`，保留原审批以供安全续试；不将其记为完成或未知。转发失败、设备已连接后响应丢失及其他未分类异常仍按结果未知处理，不自动重放。若状态恢复的条件更新未成功，则保留原未知结果处理。

使用既有 Node `22.22.0` 与 Vitest `4.1.12`，设置当前命令的 `npm_config_engine_strict=false`（仓库要求 Node `22.22.2` 以上，未改配置），运行 `run-tools-project-files.test.ts`、`user-device-gateway.test.ts`、`user-device-client.test.ts`：3 个测试文件 58 项通过。`pnpm --filter @rakazo/adapters check` 通过。首次误用 Vitest 参数未能启动测试，改用环境变量后完成验证。此结果不证明 Worker 会持久等待设备、重连自动恢复、服务重启续接或设备端结果查询；这些协议尚未实现，生产及双端设备未验证。

## 项目 Run 固定设备和授权（2026-11-21）

PA-022／PRJ-02，P02-07。新增 `20261121170000_project_run_directory_pin`。项目用户消息和续行创建 Run 时由数据库保存当前设备类型、设备标识、grant 和权限意图，无绑定及迁移前 Run 保留空值。保存项不含目录内容或路径。Windows／云电脑文件和 Windows 固定诊断沿用既有审批，并按同一 Run 当前租约校验原授权。

使用工作区已有的 PGlite 在内存 PostgreSQL 执行实际迁移 SQL、Windows 及云电脑运行时查询。合成表和独立受限角色覆盖原 Windows 授权、旧租约、空绑定历史 Run、非任务触发、拒绝改写固定记录、RLS 范围拒绝、同设备换新 grant、切至云电脑及云电脑代次变化。该验证使用最小模式和 RLS 替身。完整迁移链及实际运行角色由既有 PostgreSQL 套件覆盖。

隔离 PostgreSQL 使用生产候选相同迁移程序和不同所有者／运行角色，按当前仓库应用 225 项迁移；运行角色非超级用户且没有 RLS bypass，数据库起始无用户。执行 `packages/db/src/project-directory.postgres.test.ts` 与 `packages/testkit/src/project-chat.postgres.test.ts`，9 项全部通过。项目会话集成覆盖单聊、`@everyone` 双 Bot 群发固定相同授权，批准设备离线文件请求并确认同一原 Run、效果、任务 pin 和 `wakeAt` 已保存。完全停止首个 Worker 后，连接原配对 Windows 回环客户端，再启动新 Worker；测试等候实际持久唤醒时间到期，没有更改数据库时钟或提前唤醒 Run。复核 Windows 仅接收原 Run／项目／grant 的一次请求、效果沿用原 ID、Run 完成且回复持久化；从审批前 SSE 游标重连后，排队和完成事件按游标递增补取，消息与快照一致。群消息任务取消不保留在测试库。九项集成 `2026-11-21` 通过，临时数据库、角色和全部容器由远端过程确认清理，无 OOM。

当次隔离环境选定两份已缓存的 API／PostgreSQL 镜像，确认依赖锁一致，并将当前候选 Prisma 生成客户端、迁移和相关源码单独只读挂载；测试容器无网络、应用只运行无特权 `node` 用户，服务根只读和资源有限制。此次镜像中的迁移目录正好有 225 项，已逐项应用至空临时库。数据库集成用例通过不代表 API／Worker 镜像已包含本批源码，也不表示生产已部署。实际云电脑专属私有链路、Windows 安装版、iPhone 和部署仍待验。

## 云端项目命令候选与目录枚举修复（2026-11-21）

PA-022／PRJ-02，P02-04／P02-08。原生驱动新增独立项目命令方法，Provider 检查专属电脑及有效 Run 租约。只把请求列出的普通 UTF-8 文件复制进临时目录，拒绝路径越界、重复输入和环境覆盖，命令结束后丢弃临时修改。模型工具已接入运行时能力检查、逐次审批和结果记录，运行时缺失时不注入。持久文件改动保留逐次审批和摘要校验。

命令工具、Linux Provider、项目策略和契约的 4 个 Vitest 文件共 75 项通过，Linux 专用用例 2 项按平台跳过。Contracts、Adapter Kit、Adapters 类型和目标 TypeScript 文件 lint 通过。沿用现有 Node 22.22.0，定向命令临时放宽仓库 engine 检查。

iPhone 与 Windows 共用界面的 7 个项目列表、目录、会话和事件测试文件另有 129 项通过。覆盖项目作用域、消息发送、审批和事件重连，使用客户端测试夹具。

复用既有缓存镜像，在非 root、无网络、只读根文件系统的独立 Linux 容器测试驱动。首轮实际目录测试发现合法 `list` 在分支校验时落入未知操作拒绝，修正后 25 项通过。客体隔离用例 1 项跳过。临时容器已清理，测试前后源码快照摘要一致。

SSH 只读检查所用云端主机，未找到 `bwrap` 或专用只读运行时。本机 WSL 当前只有运行中的 `docker-desktop` 内部发行版，未将其用作执行器。已准备授权客体的实跑用例，覆盖所选文件、项目外文件、桌面和代理环境、IPv4／Unix 套接字及子进程退出。本轮未执行该用例，也未安装依赖、改生产服务或发布。专属客体实际隔离和私有链路、Windows WSL 2、结果未知核对及双端实机继续待验。

## 项目命令执行隔离审查（2026-11-21）

PA-022／PRJ-02，P02-08。源码审查确认 `infra/native-linux/driver.py` 的 `run_command` 在普通桌面服务上下文中直接调用 `subprocess.Popen(argv, cwd=cwd, env=environment)`。相对 `cwd` 展开到 Bot 工作区；绝对路径只要是现有目录也接受，并没有限制命令访问该账号可读的其他路径。进程继承代理变量并获得 `DISPLAY`、`XAUTHORITY`。Run lease 和进程组结束可约束同时使用与生命周期，但不能隔离文件系统、网络、桌面服务、用户权限或共享进程空间。`sydney-driver.service` 的 `NoNewPrivileges`、`ProtectSystem=strict`、`ProtectHome`、`ReadWritePaths` 是对整项驱动服务的统一配置，不会创建每个 Run 独立的 namespace。

新增 `run-project-policy.test.ts` 回归：项目有读写目录授权且能使用 Windows 固定诊断时，项目 Run 仍只获得项目文件工具及固定诊断，不获得一般 Shell、Windows 通用命令或电脑控制。本机仅有已停止的 `docker-desktop` WSL 2 内部发行版，未用作执行器。本批未安装发行版、修改驱动或开生产设备开关。项目命令未提供，P02-08 **不通过**；以后须实现经逐 Run 隔离的 WSL 2／专属云电脑 OS 执行器，并在授权客体机上实测项目外文件、桌面／宿主访问、网络及子进程逃逸拒绝、取消和目录内写回。无网络测试容器仅证明集成测评外围环境不出网，不等于目标电脑命令的隔离证据。

最终专用负向回归：`run-project-policy.test.ts` 34 项通过；Adapters／Testkit 类型、11 个目标源码和测试文件 Biome lint、所列文件的 `git diff --check` 通过。本机仍使用 Node `22.22.0`，验证命令临时设置 `npm_config_engine_strict=false`。

## 项目文件回执与 Worker 重启候选（2026-11-21）

PA-022／PRJ-02，P02-05／P02-06。Worker 核对读取回执中的 SHA-256 与对应 UTF-8 内容，覆盖带 BOM 和中文的文件。更新回执须与已审批文本的 UTF-8 字节数及 SHA-256 一致。错误读取回执不把文本传给模型。已分派更新收到错误摘要时记为结果未知，保留设备端核对，未排队重放。旧读取回执可由 Worker 从文本计算摘要。

在现有隔离项目集成套件增加重启用例，使用实际项目绑定及审批接口、独立 Worker、设备转发和回环 Windows 协议客户端。用例断言第一次离线后 PostgreSQL 保留原审批、Run 和唤醒时间，终止旧进程后让新进程读取到期 Run，仅向原设备发出一次读取，请求和回执仍关联原审批。用例将已验证持久化的唤醒时间提前到期以缩短测试，不依赖等待约 30 秒。

本机 7 个定向测试文件中 6 个通过，350 项通过。2 项 Linux 套接字用例及 2 项 PostgreSQL 项目集成用例跳过。Adapters 与 Testkit TypeScript、3 个改动文件的 Biome lint 和差异检查通过。本机 Node `22.22.0`，临时放宽 engine 检查。维护机 SSH 在握手阶段超时，本机未配置隔离数据库连接，尚无新增 Worker 重启实测结果。Windows 仅列出已停止的 `docker-desktop` WSL 2 发行版。云电脑真实链路、Windows 隔离命令和双端实机仍待验。

## 云电脑项目文件离线续接（2026-11-21）

PA-022／PRJ-02。原生驱动传输仅把连接建立前的 `ENOENT` 或 `ECONNREFUSED` 识别为明确未派发。原 Run、审批和固定电脑随已有到期机制续接。驱动明确拒绝旧代次时提示重新绑定并审批。连接后丢失写入响应仍记录为结果未知，保留设备端核对的需要。

在 Windows 上实跑本机命名管道，覆盖地址不存在、驱动返回旧代次拒绝、收到写入请求后断开、重连成功回执。文件工具测试使用原生 Provider 和事务替身核对同一 Run 恢复原审批、写入前置摘要、原电脑标识、云电脑等待提示、换绑拒绝与已派发丢失响应不重放。连续两次云电脑离线时，原审批两次恢复，等待消息仅保留一条。原生适配器、项目文件、执行器审批、设备网关、任务对账与唤醒共 6 个测试文件，366 项通过，2 项 Linux 专用套接字用例在 Windows 跳过。Adapters 类型检查、4 个 TypeScript 文件 Biome lint 和 `git diff --check` 通过。本机沿用 Node `22.22.0`，验证命令临时放宽 engine 检查。

本批验证覆盖受控传输和执行器替身。独立 Worker／PostgreSQL 重启、实际云电脑私有链路、设备端结果查询、隔离命令和双端真机仍待验。

## 项目 Windows 文件任务离线续接（2026-11-21）

PA-022／PRJ-02。固定 Windows 设备明确未接到请求时，保存工具回合，事务恢复原审批、结束 Attempt、释放 Run 租约并持久保存约 30 秒后的唤醒时间。原项目、Run、设备及目录授权随审批继续使用。两端会话共用状态事件，重复等待只更新状态。重新连接后，审批重放再次检查授权并尝试派发。已发出但结果不明的写入继续保留未知状态。

执行器回归先复现文本更新未进入审批的错误。修复后以替身设备和仓储验证从同一 Run 的一次审批到离线排队再到原设备上完成版本更新，确认原始摘要随请求发往设备。专项用例另覆盖第二次离线不重复发等待消息、换绑拒绝、旧租约拒绝，以及双端共用会话逻辑只更新对应 Run。六个定向测试文件共 426 项通过，Adapters 与 Core 类型检查、8 个源码与测试文件的 Biome lint 及 `git diff --check` 通过。本机 Node 为 `22.22.0`，通过临时环境变量放宽 engine 检查，依赖与仓库配置未变。

等待事件曾使用项目私有 `thread.meta` 标记，不能稳定进入双端快照 reducer。本轮统一为持久 `run.queued` 事件并包含离线原因与 Run trigger；peer 转发新增该状态事件，后台会话只接收项目设备离线类型。Web 与手机按 Run ID 更新 queued 状态、保留兄弟 Run 并清理对应的陈旧进度；测试覆盖 SSE 转发和 reducers。

本轮回归：6 个定向测试文件共 482 项通过。Contracts、Core、Adapters、API、Web、Mobile 六个包的 TypeScript 检查通过。Biome 对 10 个目标文件检查时发现 `apps/mobile/lib/api.test.ts:452` 一个未使用参数提示，未改动无关测试代码；`git diff --check` 通过。命令使用临时 `npm_config_engine_strict=false` 运行，本机 Node `22.22.0` 仍低于仓库要求 `22.22.2`。

已提交等待事务的 Run 由现有到期扫描恢复。若 Worker 在等待事务提交前退出，已标为 `executing` 的操作继续走结果未知处理。独立 Worker 的 PostgreSQL 进程重启和真实 iPhone／Windows 联调待验。本批未开启生产设备能力，云电脑的离线续接、设备端结果核对与隔离命令仍待实现。

## Windows 专属电脑实际键鼠落点（2026-11-21）

PA-011／APP-02。继续使用正式安装的 `Sydney-partner 0.4.1`、原登录资料和生产 HTTPS。先通过客户端 RPC 检查当前空间九个原生电脑 Bot：没有 queued／leased／running 任务或用户接管租约；其中五个会话仍有等待状态，全部保留。再选择无活动或等待 Run 的已运行专属电脑，复查状态后经产品界面接管。没有启动电脑或取消用户任务。

为验证实际落点，在已有 `sydney-desktop` 用户的 `:10` 显示上临时运行随机命名的 `xev` 窗口，只订阅该窗口的事件。身份、显示、窗口范围与 `1024 × 768` 真实只读画面一致。通过安装版原生控制层依次左键点击、向下滚轮和按左方向键，仅放行目标 Bot、当次租约及预定种类／坐标的三条原始浏览器请求；没有发送字符或修改剪贴板。

最终三条生产 `computer/input` 均返回 `200`，客体窗口收到一次左键 ButtonPress、三次向下滚轮 ButtonPress 和 `Left` KeyPress，点击与滚轮落在测试窗口内。与先前拦截请求的映射用例不同，本轮确有客体 X 事件回读。接管和交还均返回 `200`，交还后持有者为 Bot、租约清空，画面在接管前、中、后均保持只读。探针正常退出。

调试期间曾出现探针用 APIRequest 代发请求返回 `403`，以及一次十秒的画面等待超时；改为继续浏览器原请求，并沿用已有三十五秒画面等待后通过。失败轮次均交还已取得的接管并关闭临时窗口，未据失败轮次宣称输入成功。本轮没有修改产品代码。尝试裁取的图片仅捕获模糊背景，未作为画面或落点证据；结论依据实际输入响应和测试窗口事件回读。

忽略目录保留 `.tmp/verify-installed-computer-control.mjs --actual-input` 与 `.tmp/app02-xev-guest.py`。客体临时进程已退出，复查对应 `xev` 为零，本机客户端进程为零，生产 `/ready` 为 `200`。维护机仍在 SSH 握手阶段超时。团队接管、运行中 Agent 停止输入、字符粘贴和 iPhone 同项仍待验；独立后台镜像交付及生产版本回退的阻塞未解除。

## 个人生产首版 Goal 续作与 Linux 验证（2026-11-21）

重新读取总计划、首版验收和手机专项测评后恢复 Goal，范围仍为 WEB-01、APP-01、APP-02、GH-01、PRJ-01、PRJ-02、REL-01。维护机再次在 SSH 握手阶段超时。生产仍运行 `sydney-pa022-project-text:20261121`，只有较早的 PA-023 API／基础镜像缓存，没有已验证的独立 `server` 候选。此前四套 Compose 的 GitHub 环境清单缺口已由现有源码补齐，本轮没有重复修改。

### Linux 部署脚本模拟

复用现有生产镜像 `sha256:c96d99f5225c070881df3db541cda13a11060a02b6b8e33f7168e10d70ddd2e9`，确认其 Node `24.22.1`、Git、Bash 和 Vitest 可用，锁文件与工作树逐字节一致。将当前 `deploy-script.test.ts`、`deploy-main.sh`、`deploy-launcher.sh` 只读挂载到无网络临时容器，以非 root、只读根、1 CPU／768 MiB 和临时可执行 `/tmp` 运行。Docker、sudo、curl 等由测试夹具替代；没有 Docker socket、生产目录、生产配置或凭据挂载。

`packages/testkit/src/deploy-script.test.ts` 全部 36 项通过，覆盖部署锁、固定提交、旧容器保留、迁移失败、健康失败回退、旧 Worker 排空、退役服务拒绝、生产覆盖和部署启动器。此前在 Windows 未完整通过的整套模拟，本次在 Linux 完成；无需修改产品脚本或断言。容器退出码为 0、OOM 为 false，临时容器为零。

### 当前源码的独立 Worker 项目聊天

从工作树封送 API、Worker、共享包及集成用例共 1,166 个源码／配置文件。既有镜像的依赖锁文件与 Prisma schema 均逐字节匹配，复用其中对应的生成客户端，不安装或重新生成依赖。既有镜像的迁移目录只有 211 份，本次临时迁移容器改用工作树完整的 224 份 SQL，未改现有镜像或生产目录。

以生产同摘要 PostgreSQL 镜像创建全新无网络、无端口、无宿主数据挂载的 256 MiB 临时集群；迁移和测试容器仅共享该临时网络命名空间，分别限 1 CPU／768 MiB，使用新生成的合成密码和密钥。实际应用 224 项 Prisma 迁移与 Graphile 结构。测试前用户表为零，运行角色不是超级用户且不能绕过 RLS。没有恢复或读取生产业务行。

`project-chat.postgres.test.ts` 的当前源码完整用例通过，用例约 32.5 秒，整文件约 40.7 秒。覆盖手机签名会话、项目 Bot 设置和名单回读、模型授权、先持久化 queued Run、独立 Worker 启动心跳、SSE 回复与完成事件、历史重读、重复发送幂等，以及另一项目、首页和另一账号的拒绝。模型为同一隔离网络内的替身，无真实模型调用。输出有 Graphile 默认池与并发配置警告，未做生产并发调整；测试退出码为 0、OOM 为 false。

两类随机标签的临时容器事后均为零，临时源目录由执行器清理。复查生产 API、Worker、PostgreSQL 均 healthy，Caddy 和 API 画面桥 running，生产 IP `/ready` 返回 `200`。探针保留于忽略目录 `.tmp/verify-rel01-linux.py` 与 `.tmp/verify-project-worker-isolated.py`。本批恢复了不依赖维护机的当前源码 Worker 复验路径，不构成独立 `server` 镜像构建、生产发布／回退、真实模型或双端设备任务验收；Goal 保持进行中。

## 双端项目聊天共用组件（2026-11-21）

PA-018／PA-021／PA-022。本轮只在现有工作树补齐项目消息与输入组件复用，保留其他窗口已有修改，没有拉取或合并落后的 5 个远端发布提交。

- 使用已有 Node `24.22.3` 和工作区依赖，定向 Vitest 11 个文件、265 项全部通过：手机项目页、手机输入栏、消息署名颜色、提及无障碍、消息卡片宽度、用户字面文本／Bot Markdown、项目会话 Hook、Windows 项目页、Windows 输入栏、普通消息视图及 core 项目会话。
- 新增验证覆盖共用组件接线、仅文字模式、禁止附件／语音／斜杠菜单入口、禁用态、单聊头像与名单分页、找不到目标不混用其他 Bot、取消后丢弃迟到名单、发送失败保留草稿、同名成员署名及指定 Run 取消、作用域切换，以及项目审批／下载回调。Bot 回复沿用普通聊天的 Markdown 与原始 HTML 忽略策略；用户消息保持字面文字。
- 手机、Web、core 的 `tsc --noEmit` 分别通过，受影响 15 个 TypeScript 文件 Biome 检查通过。
- 最后补齐手机禁用态透明度后，输入栏单文件 69 项复跑通过；四个受影响 Web 组件的 Impeccable 定向检测返回空列表，变更文件 `git diff --check` 通过。上述检查不代替浏览器渲染或设备视觉验收。
- 首轮 256 项中 6 项失败：1 项项目页仍预期 Bot 原始 HTML 逐字显示，改为核对普通聊天的安全 Markdown 行为并增加用户字面文本用例。另 5 项为既有消息无障碍与附件布局测试；用忽略目录内定向配置加载 HEAD 的原始 `message-bubble.tsx` 后仍复现同样失败，再仅修正玻璃组件替身和玻璃层圆角断言，原无障碍及附件隔离断言保留。

未安装依赖、启动服务、执行全工作区构建、发布后台、分发 OTA 或生成 Windows 安装器。Windows 安装版、iPhone 键盘与大字布局、真实头像加载、项目收发及双端同步尚未实测，本批不构成实机验收或本地集成完成证据。Guard 仍无本轮显式 `change` 生效证据。

## 生产 Docker 画面对端与交付恢复复核（2026-11-21）

PA-023／WEB-01／REL-01。为可选 `docker-compose.prod.docker.yml` 补入 API 对端回归，修复前单例按预期失败，实际默认值仍为 `web`。仅将该生产覆盖的默认值改为 `api` 并修正现有说明；supervisor 的通用默认值、开发和通用镜像拓扑保留。用 Node `24.22.3`、现有 Vitest `4.1.12` 及单 worker 运行 `compose-service.test.ts`、`compose-web-threads.test.ts` 和 `screen-peer-network.test.ts`，3 文件 46 项通过。覆盖默认配置、生产 API 画面代理开关、按同一 Compose 项目选择 API 对端、网络加入与重建后重连，以及 Web 退役边界。updater TypeScript 通过。禁用 formatter 与 assist 的 Biome 检查通过；完整 Biome 检查仅报告本轮未修改的项目功能门禁测试块格式差异，未自动整理该块。

维护机 SSH 使用既有配置和严格主机密钥校验，在握手阶段超时。从可登录的生产跳板连接维护机 TCP 22 成功，等待 5 秒仍未收到 SSH banner。生产 `rakazo-prod` 的 API／Worker 均为 `sydney-pa022-project-text:20261121` 且 healthy，PostgreSQL healthy，Caddy 和现用 API 画面桥 running；桥的网络命名空间精确指向当前 API，API 画面代理开关为 true。Compose 项目容器清单无旧 Web 或旧 Web 专用桥。按标签 `sydney-pa023-server-only:20261121-d7d81fcd91` 和已有候选镜像 ID 查询，生产均未找到候选。

从本机使用 TLS 校验请求已记录的生产 IP 与域名，两个入口的 `/health`、`/ready` 均为 `200`，`/app` 均为 `404`。此前在服务器内按运行时 `BETTER_AUTH_URL` 探测三个路径均为 `403`，未定位该探测路径的原因，不用其替代现用双入口结果。本机首轮并行探针因 CommonJS 顶层 await 未执行，改用 ES module 后上述六项实际请求完成。

本机封存源码包 `.tmp/pa023-server-rebuild-20261121-ba282448d498.tar.gz` 的 SHA-256 仍为 `ba282448d498e2c197e69acdcedf99579161355e87e832f223d4804153224033`，与既有记录一致。它是可重建输入，不是可直接导入的镜像。维护机恢复后先核对前次隔离容器和镜像，再按既定构建、隔离数据库／Worker 验证、生产切换及回退顺序继续。可选 Docker 电脑的实际画面未在本轮启动验收；生产现用的是原生 Linux 链路。本轮没有修改远端文件、迁移或服务，也未提交或推送。

## PA-022 项目同步与设备任务基线（2026-11-21）

实施前基线复核：源码已有项目同后台 RPC、SSE 游标续接、发送幂等、项目范围隔离、目录绑定、设备固定分派、有限大小 UTF-8 文件读取及新建 Markdown 候选；Windows 和云电脑目录读写仍受各自已授权目录与设备通道约束。设备工具生产开关在 API／Worker 均保持关闭。

已确认缺口：项目列表、成员名单及名称主要在页面聚焦时加载；项目文件协议仅支持读／新建，无目录枚举和已有文件修改；Windows 终端只执行固定 `ver`／`chcp` 诊断，未实现项目命令。项目任务离线排队与恢复、设备重连身份复核和已派发未知副作用核对没有端到端证据。因而不能把现有同步基础表述为完整目标已完成。

本机环境：Windows 11 家庭版，WSL 列表只见已停止的 `docker-desktop` 发行版；无可用通用 Linux 发行版供本次 WSL 执行隔离验证。没有安装新发行版、依赖或启用 Docker。Windows 安全命令执行、本机 WSL 隔离与用户确认的本机执行实测未运行。后续状态与测评见 [PA-022 验收矩阵](ACCEPTANCE.md#pa-022-手机与-windows-项目同步及设备执行测评2026-11-21)。

## 手机虚拟鼠标箭头（2026-11-21）

PA-011／PA-023／PC02。使用现有依赖运行虚拟鼠标、原生电脑控制和电脑画面 3 个定向测试文件，87 项通过。覆盖箭头渲染、尖端初始位置及相对移动、左键与右键、双指滚动，以及画面和触控层尺寸不同步时隐藏箭头。移动端 TypeScript 和变更文件 Biome 检查通过。待 OTA 和 iPhone 复测。

## 后台重建源码与生产账本复核（2026-11-21）

PA-023／PA-022／WEB-01／REL-01。使用当前工作树的 `server` Dockerfile 和已有后台源码白名单封存 2,006 个 Git 跟踪文件。源码含项目 Bot 设置、名单头像与群成员回读，以及 API／Worker 共用的项目设备门禁。包内无 Windows、手机或独立 Web 工作区。逐文件复查包内内容和权限，九个 `workspace:` 依赖均有对应清单。包名与摘要见[运维手册](OPERATIONS.md#删除退役-web2026-11-20)。

在生产 PostgreSQL 只读事务中读取迁移名与 SHA-256。224 条已应用记录与 `d2a818910`、当前工作树逐项一致，均无新增或缺失迁移，账本无未完成或已回滚行。再核对源码包的 224 份 SQL 与 `d2a818910` 逐字节一致。生产数据和服务未变更。

本机 API／Worker TypeScript 通过。退役 Compose、镜像发布工作流、项目工作区及项目会话四个定向文件 46 项通过。集成分支目前查到的近期 `publish-server-image` 运行均为旧 PR；`1.0.18` 发布提交里的 Dockerfile 仍会复制完整工作区。已封存的工作树补齐独立 `server` 构建输入及名单读回。维护机仍未完成 SSH 握手，尚未用本包构建镜像、复验数据库和 Worker 或执行生产切换。

## iPhone 1.0.18 线上分发与后台能力（2026-11-21）

PA-011／PA-021／PA-022／REL-01。GitHub Actions Run `44869546104` 从 `d2a818910` 发布成功。以既有侧载底座的请求头读取 iOS `sideload`，响应 `200`，runtime 为 `sydney-ios-ip-1`，更新 ID 为 `01a1fc84-bbd8-75bb-8c53-5a8b64e9eaf7`，清单创建时间为北京时间 13:11:59。清单内的三语说明与该提交的版本文件逐项一致。实际下载的 Hermes 启动包 10,546,004 字节，摘要 `7e4f937e12d5403d289d07675224431f8d368c6dd9218e7fcd625e851f4cc41b`，启动包和 55 项资源与清单 SHA-256 一致，字节码头与侧载底座一致。

发布提交相对 `3c688e34b` 没有移动端依赖、锁文件、原生目录或应用配置变动。该版包含项目卡片与聊天显示、输入栏模型菜单、云电脑预览和虚拟鼠标。现有 Windows `0.4.1` 登录会话只读查询生产 `projectWorkspaces/conversationCapabilities` 返回 `200`，`createBot` 为 `true`，未声明 `botSettings=true`。按手机候选的能力判断，当前生产仍允许创建项目 Bot，改名与换头像的设置入口需要配套后台。iPASide 只读枚举为零，未取得 iPhone 上运行的版本、实际操作或回退证据。[升级与回退](OPERATIONS.md#双端-ui-发布2026-11-21)

## Windows 安装版 GitHub 更换失败与取消解绑（2026-11-21）

PA-024／GH-01。以正式 `Sydney-partner 0.4.1` 的既有生产登录会话打开 GitHub，通过「更换 Token」提交一次随机生成的合成无效字符串。生产 `github/connect` 返回 `400 BAD_REQUEST`，对话框显示错误，响应和提示均未回显输入。取消后重开，密码框为空，浏览器本地与会话存储均未查到合成值。打开解绑确认再取消，观测到的 `github/disconnect` 请求为零。

前后两次连接查询返回 `200`，连接状态、身份和连接时间一致。随后请求 `github/profileOverview` 返回 `200`，个人主页仍可显示。首轮探针误选尚未连接时的按钮，未提交；第二轮收到 `400`，探针误读 RPC 的错误包结构。修正后整轮通过。探针只输出状态码和布尔结果，未读取或输出真实 Token。有效 Token 新绑、上游撤销及确认解绑仍待验。

## 手机云电脑虚拟鼠标（2026-11-21）

PA-011／PA-023／PC02。使用 Node `24.22.3`、现有依赖及单 worker 运行 7 个手机电脑相关 Vitest 文件，182 项通过。合成原生 Linux 与 Docker 状态均验证触屏默认、原地切换、输入路由及关闭窗口后移除操作层。手势用例验证相对移动、左键和右键、双指滚动、画面与触控层尺寸不同步时停止输入。输入队列验证合并等待发送的移动，点击和键盘保持顺序。

首轮类型检查发现接管租约字段可省略，统一为空值后手机 TypeScript 通过。变更文件 Biome 通过，保留画面测试中既有字符串模板提示。未启动云电脑服务或执行生产输入，未发布 OTA，iPhone 实际手势和光标体验待验。[真机测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标)

## 手机云电脑等比画面与操作栏（2026-11-21）

PA-011／PA-023／PC01。使用 Node `24.22.3`、现有依赖和单 worker 运行电脑画面、键盘栏、画面 URL、键盘命令、原生接管和折叠屏布局 6 个 Vitest 文件，177 项通过。覆盖实际画布尺寸上报、非画面来源及无效尺寸拒绝、按可用宽高适配 4∶3 和 16∶9、尺寸变化期间保持 WebView 连接、按键分组和方向键发送。首轮新增用例因 SafeArea 模拟层级不同触发断言失败，改为检查画面与键盘的顺序后通过。

手机 TypeScript、变更文件 Biome 和 `git diff --check` 通过。Biome 保留电脑画面测试文件内既有的一条字符串模板提示。未执行 iPhone 真机显示及触控验收，未发布 OTA。[真机测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标)

## 手机输入栏模型原位选择（2026-11-21）

PA-021／M03。普通 Bot 会话点输入栏当前模型时，直接由原生菜单呈现空间默认和可用模型；选中项带系统标记，供应商分组保留，选择后沿用 Bot 更新 RPC 和会话查询缓存。取消菜单不会离开当前会话或影响草稿。错误 Run 的恢复入口保留完整选择页。`thread-composer.test.tsx` 67 项及 `thread-route.test.tsx` 5 项通过；移动端 `tsc --noEmit`、变更文件 Biome 和 `git diff --check` 通过。

`chat-model-picker.test.tsx` 首轮在导入设置页时触发了相册适配器的 Expo 原生依赖，执行前失败。在该套模型测试中替换相册选择入口后，独立复测 62 项通过，覆盖模型回显、继承、保存成功／失败、搜索及供应商管理。合跑模型页、聊天输入栏、聊天路由、Bot 设置及项目聊天五个文件共 192 项通过，改动测试的 Biome lint 通过。未启动手机 App、未做 iPhone 真机视觉验收，也未发布 OTA。

## 聊天询问卡片继续任务（2026-11-21）

PA-018／PA-021。API 与 db 类型检查通过。数据库事件单元测试 158 项通过，API 定向测试 7 项通过。定向用例确认普通选项卡和后面已有消息的卡片可收到「没了」或「没了！」，卡片记录原文、原 Run 重新排队且不创建新任务，恢复提示要求使用已有信息。审批与密钥卡仍需专用确认。

扩大的 API 发送与图片测试有 29 项因夹具缺少租户上下文失败。取改动前的 API 源码及测试对照运行，复现相同 29 项失败。未执行 PostgreSQL、真实模型或 iPhone 验收，后台尚未部署。[测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标)

## Windows 安装版 MCP 原生回跳（2026-11-21）

PA-018／APP-02。以正式安装的 `Sydney-partner 0.4.1`、独立未登录资料和实际生产 HTTPS 后台运行。打开产品使用的 `rakazo-mcp-oauth` 命名弹窗，导航到生产 `/api/mcp/oauth/callback`，输入合成 `access_denied` 回调。返回页提示授权未完成，隐藏复制框并从地址移除查询串。桌面 IPC 未收到完成事件，手动关窗后原客户端仍可用。

在同一安装版用合成成功回调验证正常传输。客户端收到恰好一条匹配的桌面桥回调，弹窗自动关闭，监测到的令牌交换请求为零。未调用真实第三方授权、未使用真实回调码及状态、未保存或解绑 MCP 连接。正式 iPhone 及真实提供商授权验收仍待完成。

初轮探针绑定了尚未完成导航的弹窗，改为按生产回调地址定位实际弹窗后取消与合成成功均通过。合成资料目录已清理，现有用户连接配置字节一致。[生产回调预检](#windows-基础功能与生产退役落盘2026-11-21)

## 手机项目小伙伴与标题（2026-11-21）

PA-021／PA-022／P02。用户提供的 iPhone 截图显示项目单聊有发出消息与真实回复，也能看到泛称标题和项目名单的样式差异。截图没有运行版本、重进结果或隔离比对记录。

使用本机既有依赖和 Node `24.15.0`，mobile、API、contracts、db、testkit 的 `tsc --noEmit` 定向检查通过。Vitest 定向运行 121 项通过。验证覆盖项目聊天标题及设置跳转、图片保存请求、首页设置回归、项目会话、路由门禁、旧名单兼容和作用域。首轮修正了头像枚举的导入和会话目标的读取，随后修正了门禁异步返回和手机测试的作用域替身。34 项数据库依赖用例在该次本机运行中跳过，项目资料另见下方隔离复测。

候选使用现有的项目会话开关、头像数据与原生相册依赖。本机验证没有启动常驻服务。配套后台部署及 OTA 发布待执行，上线后按 P02 检查手机新增 Bot、换照片、返回和重进回显、跨项目隔离及单群聊项目名称。[测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标)

### P02 隔离 PostgreSQL 复测（2026-11-21）

维护机从授权备份仅恢复结构和迁移账本，核对 Prisma 224 项、Graphile 19 项。临时数据库无外网、无发布端口，无生产业务数据。探针在既有 `server` 镜像的临时容器内覆盖本地 P02 对应 API、契约及查询源码，与数据库共享隔离回环网络。使用两个合成手机账号和启用 RLS 的应用角色。临时库的系统密钥摘要表为空，本次验证范围为项目数据隔离。

创建项目 A／B，在 A 创建两个 Bot 及群聊。保存名称、颜色和预设头像，再换成合成 PNG。设置详情、项目名单和已存在群的成员分别回读正确。用 B 或另一账号尝试更新、从首页读取项目 Bot 均返回 `404`，再次回读确认图片未被覆盖、B 的名单仍空。探针退出码 `0`，临时容器清理后为零。未更改生产数据、服务或开关。

本机经 SSH 连接隔离库时，完整项目聊天 Vitest 用例两次达到 60 秒超时。缩小探针后见到 Prisma `P2028` 和 5 秒事务上限。同机复测通过 P02 的真实库读写与隔离。完整聊天用例此次未通过，独立 Worker 仍沿用 [先前通过记录](#项目-postgresql-与独立-worker-实测2026-11-21)。照片选择与界面回显仍待 iPhone 实机验证。

### P02 项目聊天与 Worker 续验（2026-11-21）

维护机用既有测试镜像加载工作树后台源码，并从同结构的 `server` 镜像取 Prisma 客户端。测试依赖锁文件与工作树一致。数据库只恢复结构和两份迁移账本，临时服务共用无外网的回环网络。本轮完整 `project-chat.postgres.test.ts` 通过资料保存、越界断言及 Run 入队，未收到聊天结束事件。补上 Worker 提前退出诊断后，第二次运行报告 Vitest 派生进程错误，库内复核有一条 Run，最终状态未取到。前两次实际启动的测试容器均已清理。

第三次尝试改用单测试线程，SSH 在测试期间失去响应，本地会话到期，后续两次仍未取得维护机 SSH 应答。第三次临时容器的最终状态和清理结果待核实。本机 testkit TypeScript 与改动测试的 Biome lint 通过，数据库环境校验 2 项通过、聊天集成用例按配置跳过。此前完整独立 Worker 通过结果适用于当时的源码，这一轮的后台源码还缺完整 Worker 复验。[先前通过记录](#项目-postgresql-与独立-worker-实测2026-11-21)

后续分段复核确认跳板 SSH 登录成功，跳板到维护机的 TCP 连接成功，但维护机在 5 秒内未返回 SSH 握手。暂时无法核对第三次临时容器，也无法从该主机交付后台镜像。生产 Docker 未找到已验证的 `server` 候选标签，现行 API／Worker 均为 healthy，API 画面桥仍在运行。[运维状态](OPERATIONS.md#删除退役-web2026-11-20)

### P02 Worker 启动与订阅分段验证（2026-11-21）

PA-022／PRJ-01。独立 Worker 先前在订阅建立后才启动，模块加载、连接和队列宿主启动会消耗同一 30 秒订阅时限。集成用例仍在启动 Worker 前打开真实 SSE，收到现有健康文件的首个心跳后才开始 30 秒的完成事件等待。启动最多等待 40 秒，进程提前退出时报告退出原因。用例继续要求收到同一 Run 的完成事件，随后回读回复并验证重试去重、跨项目及跨账号拒绝。外层隔离执行时限同步调整。

本机 testkit TypeScript、改动测试的 Biome lint 和远程探针语法检查通过。Worker 心跳与数据库隔离配置两个文件共 5 项通过。无数据库的 Worker 源码加载试跑在 18 秒内未退出，该结果无法定位之前的远端超时。项目聊天用例本机按配置跳过，维护机仍未返回 SSH 握手，未取得新的完整 SSE 或隔离 PostgreSQL 结果。

本机归档核查仅找到 PA-023 源码包，没有对应 Docker／OCI 镜像包。生产 Docker 既无候选标签，也无此前验证通过的同一镜像 ID。现行项目文字发布镜像仍在生产 Docker 中。[候选运维](OPERATIONS.md#删除退役-web2026-11-20)

## Windows 正式安装版云电脑重连（2026-11-21）

PA-011／APP-02。使用本机 `Sydney-partner 0.4.1` 的既有登录会话，通过所选 Bot 的 `computer/status` 分别核实团队、专属两种模式处于 `running`。两种模式均用正常电脑预览接收生产 noVNC 帧。主动关闭当前画面的 WebSocket 后，客户端分别新建画面连接，每条新连接观察到至少 19 条服务端消息。两种模式重连前后均显示 `1024×768` 画布、抽样 66 色，`viewOnly=true`。

本轮使用已运行电脑，未执行唤醒、接管、远程输入或服务重启。探针只统计显示和收包，不保存原始画面、帧内容或连接令牌。早期两种 WebSocket 插桩未取得初始帧，最后改用现有原生连接和被动收包计数，两个实际模式均通过。iPhone 和独立接管仍待验。[上一版实测](#团队连接维护与复验2026-11-20)

### Windows 正式安装版专属电脑接管与交还（2026-11-21）

PA-011／APP-02。以正式安装 `Sydney-partner 0.4.1` 的现有登录会话，选择已运行的原生 Linux 专属电脑。打开画面前和点击接管前，均检查无活动或等待任务、无用户租约且设备无忙碌标记。使用安装版的「接管控制权」和「交还控制权」按钮，生产 `computer/takeover` 与 `computer/release` 均返回 `200`。

接管后状态为 `user` 且匹配本次租约，原生控制层出现。退出后控制层消失、用户租约清空、控制权回到 `bot`。前、中、后均有 `1024×768` 的 noVNC 画布且 `viewOnly=true`。探针禁止本轮发起输入或启动电脑，实际输入请求为零。首轮把空闲 `bot` 持有者及交还后的 `bot` 状态误判为需返回 `none`，已按现行状态契约修正并完整复测。期间曾有一次 HTTPS 握手失败，随后双入口 `/ready` 和相关生产服务复核正常。

未执行有任务在跑时的 Agent 停止、远程键鼠、团队接管或 iPhone 接管。探针只记录状态和画布尺寸，无租约值或画面内容。

### Windows 专属电脑指针与租约撤销（2026-11-21）

PA-011／APP-02。再次以正式安装的 `Sydney-partner 0.4.1` 打开已运行的空闲原生 Linux 专属电脑。通过客户端按钮取得接管租约，复核没有活动或等待中的 Run 后，使用已登录客户端的会话向生产 `computer/input` 发送一次仅移动指针的请求。有效租约返回 `200` 且 `ok=true`。交还返回 `200`，控制层消失，状态回到 `bot` 且用户租约清空。同一路径使用已交还的租约再发送一次移动请求，返回 `403`。前、中、后的 `1024×768` noVNC 画面均为 `viewOnly=true`。

本次验证范围为生产输入接口接受有效租约，以及交还后拒绝旧租约。探针仅放行两次指针移动请求，未执行点击、滚轮、按键或剪贴板操作，也未核对屏幕上的实际指针落点。界面键鼠映射、运行中 Agent 停止、团队及 iPhone 接管仍待各自验收。

### Windows 专属电脑输入映射与团队接管预检（2026-11-21）

PA-011／APP-02。在正式 `Sydney-partner 0.4.1` 的空闲专属电脑上通过正常界面取得实际租约。显示 `1024×768` 只读画面后，通过控制层点击画面中心、向下滚动、按左方向键及输入字符 `a`。安装版按顺序发出四条请求，租约和 Bot 均正确。点击只发出一次，点击与滚轮坐标均落在画面中心三像素以内，`240` 滚动量映射为向下 `3`，左方向键映射为 `Left`，字符映射为剪贴板输入。探针在客户端拦截四条输入请求，转发数为零。交还返回 `200`，控制层消失，租约清空，画面仍为 `viewOnly=true`。一次运行被暂停中断，恢复后核对本机旧探针和客户端进程均已退出，再通过空闲检查完整执行。

团队电脑预检读取了当前空间八个团队 Bot 的会话与电脑状态，五个返回活动或等待状态，电脑状态另检出一个忙碌或待接管标记。未发现用户持有租约，团队本次未发起接管或输入，也未变更任务。实际画面键鼠落点、运行中 Agent 停止及团队、iPhone 接管继续待验。

## Windows 正式安装版旧资料直连（2026-11-21）

PA-023／WEB-01。本机实际进程来自正式 NSIS 安装的 `Sydney-partner 0.4.1`。改用独立的合成资料目录，写入 `mode: "new"` 的旧本地栈配置和样本文件。安装目录有 `resources/web/index.html`，无 `resources/stack`。启动显示直连选服，旧本地栈选项隐藏，旧栈启动和保存请求均被拒绝。通过选服界面提交无效地址后提示错误，两次失败后旧 `setup.json` 都逐字节保留。

在同一窗口选择现有服务，输入生产 HTTPS 端点。包内回环界面加载欢迎及登录页，未登录时 `/api/auth/get-session` 返回 `200`。成功后配置写为 `mode: "existing"`，目标与生产端点一致。退出并冷启动，原回环 origin 自动打开，无需再次选服，合成样本文件仍一致。真实账号的 `setup.json` 前后字节一致，合成资料目录已删除。未输入账号凭据或发起生产写入。

前两次探针分别误选启动画面和直连后的欢迎页。改为等待选服窗口、从欢迎页点击实际登录入口后，全流程通过。[安装及回退](#windows-正式安装器回退2026-11-21)

## API 画面桥重建与回退演练（2026-11-21）

PA-023／WEB-01／REL-01。本机现有 Compose 5.1.4 通过 SSH 操作维护机 Docker 29.1.3。隔离项目使用原生示例固定的 `alpine/socat` 摘要、`996:986`、回环端口 `16080` 和共享 API 网络模式。独立进程提供合成 Unix socket，API／Worker 进程为演练替身。API、Worker 和 socket 来源均无外网或公开端口。

用 `up -d --no-deps --no-build --pull never --force-recreate --wait` 同时重建 `api`、`worker`、`native-screen-api-loopback`，按维护机已有基线镜像、实际 `server` 候选镜像、基线镜像运行三个阶段。每阶段核对实际 API／Worker 镜像标识、三个容器更新、合成 socket 来源不重启，以及画面桥的 `container:<ID>` 指向当时的 API。三个阶段的合成 `/ready` 与回环 TCP 到 Unix socket 双向收发均通过。

首次探针在读取单条容器 JSON 时失败，清理后修正结果读取并完整重跑。演练结束同项目容器和临时卷均为零。实际生产 API／Worker、登录回调、真实画面及生产镜像回退仍待维护窗口验收。[生产运维](OPERATIONS.md#删除退役-web2026-11-20)

## 后台独立镜像 Worker 启停（2026-11-21）

PA-023／REL-01。维护机使用已构建的 `sydney-pa023-server-only:20261121-d7d81fcd91` 镜像，标识 `sha256:d4cc5c3456ee7c9bfbdff4728654c5d8a6c57aa1feb608b520f6286d13a93953`。从已授权的加密恢复点只导入数据库结构、Prisma 与 Graphile 迁移账本。Prisma 224 个迁移名与备份元数据逐项一致，Graphile 有 19 项。用户、Run 和 Graphile 作业表均为零行，运行角色、密码及应用密钥使用临时合成值。

PostgreSQL 无外网、无端口发布及宿主数据挂载，Worker 仅共享该临时库的回环网络。以生产 `WAKEUP_DRIVER=graphile` 和镜像实际 `dist/index.js` 启动，独立 `dist/health-check.js` 返回 `0`。两次采样之间，心跳与已完成协调时间戳均推进。PostgreSQL 观察到八条 `rakazo_app` 的 Worker 连接。发送正常停止信号后进程退出码 `0`，临时容器标签计数回到 `0`。

首次容器启动因临时本地日志保留文件数与默认压缩设置冲突而退出，改为两份后恢复。第二次在检查空库时用了错误的用户表名，修正后整轮通过。两次失败均确认临时容器清理。此次覆盖镜像启动与无在途任务时的停止，生产部署、实际任务及在途任务交接仍待各自验收。[候选构建](#后台独立镜像实际构建2026-11-21)

## 退役网关域名与 IP 隔离演练（2026-11-21）

PA-023／WEB-01。源码核对镜像工作流的 PR、GitHub 构建及 Depot 三条路径，Sydney 的 app 均选择 `server` 并准备 API 无影资源。生产 Compose 的 `migrate`、`api` 与 `worker` 使用 `server` 构建目标，新版 updater 默认更新 API／Worker，原生覆盖把 API 画面桥纳入更新名单。

维护机以已有 Caddy 镜像运行 `infra/compose/test-ip-proxy-routes.sh`，原样输入工作区 `Caddyfile.ip.example` 并通过 SHA-256 核对。演练在无网络容器中关闭自动 HTTPS，使用自签证书与合成 API 上游。域名与无 SNI 的 IP 均将健康、就绪、API、RPC、认证和集成回调、应用关联及画面请求转到 API，noVNC 的 WebSocket 完成握手与双向回显。旧 `/app` 与旧浏览器回调返回 `404`，两组域名／IP 错配返回 `421`，未知 Host 返回空 `200`。两组访问日志均核对合成令牌脱敏。脚本退出码为 `0`，复查演练标签容器数为 `0`。

此次验证路由和转发，真实证书、账号回跳和生产画面仍按生产维护批次验收。维护机无 Compose 插件及覆盖示例指定的 socat 镜像，本轮未进行共享 API 命名空间的三服务重建，生产配置、容器和数据未改。[运维](OPERATIONS.md#删除退役-web2026-11-20)

### 生产退役页面与原生回调复核（2026-11-21）

PA-023／WEB-01／APP-02。经生产 IP 和域名各检查 16 条匿名 HTTPS 路由。在两种入口，首页、`/app`、`/app/chat`、`/settings`、`/github`、旧 PWA 清单 `/site.webmanifest`、`/manifest.webmanifest`、Service Worker 和已知旧版本 CSS 均返回 `404`。`/health`、`/ready`、会话读取和 `/sign-in`、MCP 及通用集成回调均返回 `200`。会话和三个兼容或回调页面均带 `Cache-Control: no-store`。

两种入口的 Apple 应用关联文件均返回 `404`，容器内直接访问 API 也返回 `404`。生产未配置 Apple 应用关联，双入口的认证能力均报告 iOS 原生 Passkey 关闭、密码认证启用。此次回调只访问匿名返回页，真实 OAuth 登录、候选切换和回退待实测。生产无变更。

## 双端项目群同名成员区分（2026-11-21）

PA-022／PRJ-02。Windows `0.4.1` 的项目实测中，两个同名成员的取消按钮文案相同。修复按群成员名单的既有顺序显示 `Alpha (1)` 与 `Alpha (2)`，消息署名和取消按钮共用编号。双端组件回归核对点击后提交所选 Run ID，Windows 测试覆盖活动列表与成员名单顺序不同、另一 Run 离开列表后编号保留，手机测试覆盖草稿保留。核心测试覆盖不同名成员与旧快照无成员名单的回退。

Node `24.15.0`、Vitest `4.1.12` 在核心、Windows 项目页、手机项目页及项目会话 Hook 共四个文件 34 项通过。三处 TypeScript 和六个文件的 Biome lint 通过。Biome 全文件格式检查仍报告这六个文件在 `HEAD` 也有的格式差异。现有 iPhone `1.0.17` 发布线增量与本次变更文件无交集。此修复待纳入双端候选，已安装 Windows `0.4.1` 的取消实测见 [验证](#windows-项目文字任务取消2026-11-21)。

## iPhone 首版线上候选复核（2026-11-21）

远端发布线记录 `1.0.17` 由提交 `052c47f24` 的 Run `44854969470` 发布，源码为 `9d60c4f4a`。发布窗口记录 197 项定向回归通过，启动包和 55 项资源与清单摘要一致。当前窗口按 iOS `sideload`、`sydney-ios-ip-1` 和旧 `1.0.16` 更新标识请求 Expo，实得 `200`、新标识 `01a1fbe6-1a66-745f-92b5-da7e2f8e5077`。三语说明与发布源码一致，清单列出 55 项资源；本窗口沿用发布窗口的资源字节校验。

核对发布差异后更新测评预期，底栏包含可直返首页的「聊天」，GitHub 仓库整卡可进入详情，聊天编辑区与底部操作分行。Apple 移动设备通道只读查询返回设备数 `0`。实际手机版本、真机交互和 OTA 回退继续分项验收。[手机测评](MOBILE_NAV_GITHUB_EVALUATION.md#执行与完成判定)

### iPhone 界面模式 OTA 产物复核（2026-11-21）

PA-021／APP-01。使用原生构建 `5` 的更新配置和前版更新标识，从 `sideload` 实取 `1.0.17` 清单及启动包。清单为 runtime `sydney-ios-ip-1`、更新 `01a1fbe6-1a66-745f-92b5-da7e2f8e5077`。启动包大小为 10,590,968 字节，Hermes 文件头与原生构建一致。发布提交和启动包均确认包含设置入口、午夜模式、SecureStore 键，以及预览、应用、取消、恢复经典与午夜配色。发行状态更新为已分发。

本机模式页面、存储、注册表、宿主、外观及聊天偏好七个定向文件共 46 项通过。对应的运行源码与发布线 `9d60c4f4a` 一致。复查 iPASide 只读设备数仍为 `0`，此次无法确认手机正在运行的版本，也未实测预览、恢复经典或冷启动保留选择。

## Windows 正式安装器回退（2026-11-21）

REL-01。Windows `Sydney-partner` 的两份 NSIS 安装器与各自存档 ZIP 内文件逐字节一致。`0.4.0` 来自 Run `44775275913`，`0.4.1` 来自 Run `44776693220`。应用退出后备份原资料目录，副本有 464 个文件，`setup.json` 与原件一致。

本机正式安装经过 `0.4.1 → 0.4.0 → 0.4.1` 三次冷启动，两次覆盖安装均返回 `0`。各阶段实际进程版本、安装位置、资料目录、包内回环 origin 和保存的生产连接均核对。`/api/auth/get-session` 返回 `200`，三阶段对应同一既有登录账号，样本消息和回复可见，回退前录入的合成草稿保留。最后清除该草稿并重载确认，本机正式版本为 `0.4.1`。

本次沿用既有会话，退出后重新输入凭据仍待验。此次也未执行生产后台或 iPhone 回退。[安装及备份位置](OPERATIONS.md#双端-ui-发布2026-11-21)

## Windows 安装版普通聊天与记忆（2026-11-21）

APP-01／PA-007。以已安装的 `Sydney-partner 0.4.1` 和既有账号会话直连生产 `sydney-pa022-project-text:20261121`。创建独立样本 Bot，发送一条无敏感内容的消息与文本附件。`artifacts.create` 和 `threads.send` 均返回 `200`。Bot 文字回复包含附件特有的样本文字，重新打开会话仍可查看原消息及回复。点击会话附件触发 `artifacts.get`，返回 `200`；让 Electron 将实际下载保存到本机忽略目录，逐字节对照原文件通过。

另一独立样本 Bot 通过普通聊天写入一份有唯一文件名的共享记忆。发送前在记忆列表核对样本不存在。首次打开列表时尚未看到样本，重新打开原会话复查时，样本内容与请求一致。用客户端设置编辑并重新打开核对，通过确认删除移除样本；更新、删除和重开设置后的列表请求均返回 `200`，样本不再显示。

PA-007 后续检索使用新样本。普通聊天显式保存共享文档，并确认原本不存在、写入后内容一致。另一新建 Bot 的首条用户消息只给文件名，未包含验收码。首次界面气泡等待超时，重开后通过已登录客户端的 `threads.get` 确认该对话仅有一条用户消息，已持久化的 Bot 文字包含样本验收码。测试只读取对应样本会话，未再次发送。通过设置确认删除该文档，再让未接触验收码的样本会话查询同一文件，回复找不到，记忆列表也无该文档。

在样本 Bot 设置内切换至另一个可用模型，保存后重载，选中值保留。恢复原选项后再次重载核对，两次 `bots.update` 均返回 `200`。复用两个样本 Bot 创建普通群聊，收到样本文字回复，重载后回复仍然可见。`groups.create` 和群聊的 `threads.send` 均返回 `200`。

另用独立样本 Bot 切到 `openai-compatible::x-deepseek-v4.1-flash` 并请求生成 Markdown。该 Run 的用量记录显示所选模型为 `provider-rejected`，备用 `deepseek::deepseek-flash` 有实际输出。Bot 生成的 Markdown 可从对话下载，`artifacts.get` 返回 `200`，下载字节与原样本一致。随后通过客户端停止该 Run 的待确认状态，后台报告 `cancelled`。改为显式选择 `deepseek::deepseek-flash` 再发样本文字，收到真实回复，后台报告 `completed`，用量记录确认所选模型产生输出。OpenAI 兼容连接的拒绝原因待查。

发送重试用同一样本 Bot。首次发送由生产返回 `200`，桌面测试探针仅在收到这次成功响应后模拟响应丢失。输入栏显示发送错误并恢复原稿。重试沿用同一请求 nonce，服务器返回相同 Run 与消息序号。重开后该样本仅有一条用户消息和一条 Bot 回复。

GH-01。在样本 Bot 输入一段合成草稿，再从 GitHub 开源搜索打开 `octocat/Hello-World`，选该 Bot 和「总结近期提交与演进」。客户端返回目标会话，在原草稿后追加仓库和模板文字。全程未发出 `threads.send` 请求，验后清除本轮草稿。PAT 失效和解绑待验。

附件探针首轮等待最后一条消息出现目标文字时超时，复查按实际 Bot 文字气泡确认回复。附件和记忆的独立样本会话仍保留待确认提示，未提交其后续请求。样本 Bot、群聊及聊天保留。退出重登和 iPhone 同项仍待验。[首版测评](ACCEPTANCE.md#个人生产首版测评)

## Windows 安装版项目文字实测（2026-11-21）

PA-022／PRJ-01。用已安装的 `Sydney-partner 0.4.1` 和原登录会话直连 `sydney-pa022-project-text:20261121`。通过项目页面创建样本项目 A／B 和项目 Bot，在 A 发送无敏感内容的文字。实际收到模型回复，重进后两条消息及回复一致。用项目 B 打开 A 的会话时请求被拒、页面未展示消息；首页侧栏不显示项目 Bot。

在 A 创建两个成员的样本群。普通消息按既有规则仅唤醒默认成员；再发送带 `@everyone` 的样本文字，两位成员分别回复。重进后五条消息一致，跨项目读群会话被拒，首页不显示该项目群。生产只读汇总确认一个单聊 Run 和三个群聊 Run 均为 `completed` 且无错误，两个项目均无 Windows 目录绑定。项目电脑开关继续关闭。

首轮探针误等界面在任务结束后显示 `completed`，实际产品移除活动任务状态；以真实回复、无活动取消入口和后台终态分别验证。重进探针曾在名单加载完成前额外创建一个同名的样本 Bot，随后改按已记录的 Bot 链接定位，并复用两个样本 Bot 创建群聊。两个项目及测试会话留存供后续双端验收。本轮未使用个人原有聊天内容；另一账号和 iPhone 的实际项目会话仍待验，跨账号隔离沿用合成库证据。[首版测评](ACCEPTANCE.md#个人生产首版测评)

### Windows 项目文字任务取消（2026-11-21）

PRJ-02。用 `Sydney-partner 0.4.1` 打开现有合成项目群，发送一次 `@everyone` 样本文字，后台 `sendText` 返回 `200` 和两个 Run。界面同时出现两个取消入口。点击其中一个，`cancelRun` 返回 `200`，请求中的 Run 对应本次两个标识之一。因为样本成员同名，探针以实际请求标识区分目标。

在两项离开活动列表后再次请求取消同一 Run，返回 `200`。从提交前游标订阅至最新快照，取得所选 Run 唯一的 `run.cancelled`，另一 Run 唯一的 `run.completed`。生产 PostgreSQL 只读事务按样本项目、群和消息定位两项，确认源消息相同、选中项 Run／Task／唯一 Attempt 均为 `cancelled`，另一项均为 `completed`，两个 Attempt 都有结束时间。设备在途动作、撤权和跨端观察待实测。

## 后台独立镜像实际构建（2026-11-21）

PA-023／WEB-01／REL-01。维护机使用工作区 `infra/compose/Dockerfile` 原版、固定 Node `24.22.1` 基础镜像和 pnpm `9.15.0` 构建 `server`，`SYDNEY_PREPARE_WUYING_ASSETS=true`。13 个后台工作区的冻结依赖安装、无影 API 资源校验、Prisma 生成及 API／Worker 构建通过。首次远端缺 Buildx，改由本机现有 Buildx 连接远端 Docker；默认网桥缺失时指定该次构建的主机网络后完成。未启动本机 Docker 或变更维护机 Docker 配置。

镜像 `sydney-pa023-server-only:20261121-d7d81fcd91`，标识 `sha256:d4cc5c3456ee7c9bfbdff4728654c5d8a6c57aa1feb608b520f6286d13a93953`。最终默认用户为 `node`；镜像内有 API、Worker、迁移入口和生成的 Prisma Client，未包含独立 Web、Windows、移动端和 updater 目录。无网络容器再次通过 API 无影资源检查。在维护机恢复当前生产数据库，验证一个空间密钥及 25 个加密消息块，再用候选 API 启动，记录 `/health`、`/ready`、`/app` 分别 `200`、`200`、`404`。临时恢复容器、API 容器及相关临时配置均已清理。[恢复证据](#项目上线后数据库异机恢复2026-11-21)

生产复核时仍为项目文字发布镜像，API／Worker healthy，现用 API 画面桥运行，退役 Web 和专用桥无容器。用当前两份生产 Compose 叠加标准输入覆盖，以候选及现行回退镜像分别解析所有 profiles。候选只改变 `api`、`worker`、`migrate` 的镜像引用，回退配置与当前有效配置一致；项目电脑工具均保持关闭，API 画面桥仍共享 API 命名空间。候选仅在维护机，实际部署、网关／画面和镜像回退仍待验证。

## 项目上线后数据库异机恢复（2026-11-21）

PA-022／REL-01。按用户本轮允许的生产备份与隔离恢复范围，使用已有管理连接只读采集生产 PostgreSQL。北京时间 09:03:28 的数据库归档、逐表计数、权限目录和迁移账本共用一个导出的只读可重复读快照，账本为 224 项。另采集角色定义及密码、恢复所需的三个应用配置值；它们与数据库分时读取，不构成跨配置原子快照。明文仅经进程内存和管道处理，整个包用既有维护机收件人加密后，经本机内存转发至维护机的已核对限额 ext4 接收区。未计算新的文件摘要。

密文为 2,714,456 字节，权限 `0600`，通过完整 age 解密认证。随后在维护机使用与生产相同的 PostgreSQL `18.6` 镜像，新建无网络、无端口、只读根文件系统且数据仅在 tmpfs 的独立容器。先恢复真实角色，再以原数据库所有者 `rakazo` 恢复数据库及 ACL。118 张表共 7,136 行，逐表计数与采集快照完全一致；224 项已完成迁移、对象所有权、关系／函数／Schema 权限、默认权限及 RLS 策略核对通过。北京时间 09:14:32 完成验证，临时容器及其卷已删除，按本轮标签复查无残留。

首次采集因 `losetup` JSON 参数不兼容在接收端预检退出，目标仍为空；修正后完成采集。初次恢复目录对照未通过：所有者默认 ACL 的显式／隐式表示不同，一条项目云目录策略的同组 `AND` 括号被 SQL 解析器展开。最终对照按 PostgreSQL 默认所有者权限处理两项等价 ACL，并在隔离库中创建、读取、删除策略副本，用数据库自身解析原表达式后逐项比较；策略、角色和生产权限均未修改。恢复操作没有使用 `--no-owner` 或 `--no-privileges`。

采集后复核生产 API／Worker 均为 `sydney-pa022-project-text:20261121` 且 healthy，API 的项目创建和文字开关为 `true`，两服务电脑工具均为 `false`；只读账本为 224 项、0 项未结束。项目文字发布由另一现有窗口完成，本窗口未执行生产迁移、切换或重启。此备份是项目迁移后的恢复点，不能替代[文字发布](#手机项目文字生产开放2026-11-21)的迁移前备份。随后按相同过程恢复，再通过一个空间密钥、25 个加密消息块及候选 API 启动验证；未测试真实密码登录、附件、工作区或整机恢复。[材料与边界](OPERATIONS.md#项目上线后数据库恢复点2026-11-21)

## 更新器 Linux 回归（2026-11-21）

PA-023／WEB-01／REL-01。维护机使用已有 Node `24.22.1` 镜像及锁文件逐字节一致的既有依赖，挂载本轮 updater、共享源码和 Compose 夹具；没有安装依赖或接入 Docker socket。无网络临时容器执行 `index.test.ts`、`compose-service.test.ts`、`compose-web-threads.test.ts`，三个文件共 62 项全部通过，覆盖 HTTP 鉴权、串行更新、更新失败恢复、缓存镜像回退、API 画面桥保留、命令参数及退役服务配置。

首次执行 58 项通过、4 项失败：三项缺少补充的 Compose／原生覆盖夹具，一项临时脚本在默认不可执行的 tmpfs 失败。补齐仓库夹具并仅给测试 `/tmp` 添加 `exec` 后通过。产品源码和测试断言未改；未运行真实 updater、重建生产服务或切换镜像。此记录补齐了此前 Windows 平台无法执行的 HTTP／命令测试，真实生产更新与回退仍待验。

## 手机候选与生产接线复核（2026-11-21）

PA-021／PA-022／PA-024。Node `24.15.0`、Vitest `4.1.12` 单 worker 执行 15 个手机端定向文件，278 项全部通过，覆盖固定导航、应用入口、GitHub 缓存与草稿交接、新会话默认和对话内切换、项目聊天及更新确认。

按 iOS `sideload`／`sydney-ios-ip-1` 获取生产更新清单，确认更新 ID 为 `01a1f9db-d79d-7d5b-bdb9-9c5e93ecbf66`，应用读取的 `sydneyMobileRelease` 含 `1.0.16` 和仓库三语说明，原生配置版本为 `1.0.12`。直接请求启动资源返回 `403`，随后按清单的资源请求配置下载，启动包和全部 55 项资源的 SHA-256 均与线上清单一致。直连生产后台 `/ready` 返回 `200` 且 `degraded=false`，项目能力 RPC 返回 `401 UNAUTHORIZED`。

本机只读设备探针返回 0，未取得手机实际运行标识、实际账户默认模型或真实项目收发。兼容 OTA 和后台入口的线上探针均已通过。设备操作依照[手机测评](MOBILE_NAV_GITHUB_EVALUATION.md#执行与完成判定)登记。

再次验收时，设备管理器仅枚举到蓝牙 iPhone，安装工具的 Apple 移动设备通道仍返回 0。对生产项目表、会话和 Run 做只读汇总，项目、会话、完成、失败及在途 Run 计数均为 0，尚无实际项目会话可验。待目标手机提供连接或操作结果。

## 手机项目文字生产开放（2026-11-21）

PA-022／PRJ-01／P01。用户授权生产备份、隔离恢复及文字开放。备份使用生产 PostgreSQL `18.6` 的 `pg_dump` 自定义归档，输出 2,582,724 字节和 SHA-256。用同一 PostgreSQL 镜像在无外网、无生产卷的独立容器单事务恢复，复核 114 张表、211 项账本和 GitHub RLS。恢复时重建需要的角色名称及成员关系，使用临时身份，不使用生产密码。再次恢复到隔离容器后，实跑候选 Prisma 迁移，确认 13 项项目迁移、总账本 224 项及运行角色 RLS。两个恢复容器均已清理。备份和摘要保留在生产主机受限发布目录。

候选从现行 GitHub 镜像复用锁定依赖，叠加当前后台源码，重新生成 Prisma Client，并构建 API 和 Worker。候选镜像为 `sydney-pa022-project-text:20261121`，镜像标识 `sha256:c96d99f5225c070881df3db541cda13a11060a02b6b8e33f7168e10d70ddd2e9`。上线前 211 项数据库摘要逐项与候选 SQL 匹配。生产仅新增已筛选的 13 项迁移，共 224 项，无未结束记录。以运行角色复核项目元数据、云目录及 GitHub RLS，并核对项目表写入权限。

首轮服务切换后，部署核验脚本遇到 Docker 环境中没有 `=` 的未设置项而退出。自动恢复上一版服务和配置，保留已应用的数据库迁移。修正解析后，复核应用账本及备份，直接从服务切换阶段续发。先用关闭项目写入的候选验证健康，随后开放项目创建及文字会话。API、Worker 和 API 画面桥通过 Compose 健康门禁，API 和 Worker 的项目电脑工具均为 `false`。网关实际 `/health`、`/ready` 返回 `200`，旧 `/app` 返回 `404`。项目能力和 GitHub 状态均拒绝匿名请求，返回 `401`。

iPhone `1.0.16` 已包含项目入口。本次发布仅涉及后台。本机 USB 只读枚举为 0，尚未取得用户手机上的项目创建、真实模型回复、重进或实际 OTA 运行标识。实际用户会话和原生画面未在本次发布后操作。[生产运维](OPERATIONS.md#手机项目文字生产开放2026-11-21) · [手机测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标)

## Windows 展开包版本回退演练（2026-11-21）

PA-023／WEB-01／REL-01。使用 Run `44776693220` 的 `0.4.1` 展开包和 Run `44775275913` 的 `0.4.0` 展开包，在同一个临时 Windows 资料目录依次冷启动 `0.4.1 → 0.4.0 → 0.4.1`。三个进程均通过实际版本、打包状态及隔离路径检查，加载各自包内界面并沿用保存的连接。合成后台的旧页面入口为 `404`，三个阶段向其发送的 `/` 和 `/app` 请求为零。

首阶段写入合成草稿和持久 HttpOnly Cookie。回退和再次升级阶段沿用同一个回环 origin，均读取原草稿，后台均收到原合成 Cookie，`setup.json` 保留原连接。演练结束后关闭候选、清理临时资料。`before-install/` 内的回退安装器与 Run `44775275913` 原件逐字节一致。本机正式安装仍为 `0.4.1`，本轮未运行 NSIS 覆盖、未使用正式资料和真实会话。正式安装版回退及生产账号验证待执行。[回退材料](OPERATIONS.md#双端-ui-发布2026-11-21)

## 生产镜像后台依赖收口（2026-11-21）

PA-023／WEB-01。`server` 只复制后台工作区的清单和源码，保留 API 无影资源及 supervisor 本机电脑构建上下文。上游 `self-host` 在独立层安装完整工作区并构建 Web。用已有 pnpm `9.15.9` 在两个临时工作区执行离线 `--lockfile-only --frozen-lockfile --ignore-scripts`，后台 13 个项目和完整 21 个项目均通过，显式工作区依赖均能解析。实际 Dockerfile 固定 pnpm `9.15.0`，本次未安装依赖、构建镜像或启动容器。

首次扩大回归发现四套 Compose 环境白名单测试均要求透传测试 Worker 的心跳覆盖变量。将 `RAKAZO_WORKER_HEALTH_FILE` 记为本地集成测试专用，生产容器继续采用默认路径。Web 退役、原生覆盖、环境及生产服务四个测试文件共 52 项通过。[运维入口](OPERATIONS.md#删除退役-web2026-11-20)

## 项目迁移发布清单复核（2026-11-21）

PA-022／PRJ-01／REL-01。在当前生产 PostgreSQL 会话验证 `transaction_read_only=on` 后，只查询 Prisma 迁移账本。211 项均为已应用，无未结束或已回退记录。迁移名称与账本已有摘要逐项匹配上次发布保存的 210 项账本及 GitHub 单项发布记录。

通过内存传输将当前工作区 SQL 与上次发布的筛选目录逐字节比对，211 项均相同。当前工作区新增的 13 项 SQL 与[项目迁移清单](OPERATIONS.md#项目迁移依赖与保持关闭的部分)完全一致。此次复用留档摘要和实际 SQL 文件，未重新计算摘要。首次探针的 `psql` 表头使只读状态输出无法解析，切到仅记录输出后比对通过。未保存服务器候选文件、运行迁移或改变项目开关。当前生产备份及实际隔离恢复仍待执行。

## 原生驱动版本回退隔离演练（2026-11-21）

PA-022／PRJ-02／REL-01。取生产服务实际路径的磁盘驱动源码和仓库候选，以非特权账号在 `/dev/shm` 临时目录分别起旧版、候选、旧版三个隔离进程，经各阶段独立 Unix socket 验证。两个已有合成工作区均可用 `provision` 取得当前代次，再以同一身份用 `status` 复核。候选拒绝两条旧代次请求并返回专用错误码；回退后旧版拒绝两条候选代次请求。候选额外通过项目目录识别。三阶段代次不同，两个工作区的目录 inode 和样本文件内容均保持，三个进程正常结束，临时目录已清理。

首次演练因探针的 socket 路径参数与请求中的 `path` 同名而退出，修正探针后完整通过。演练使用驱动的真实协议处理及合成工作区，未启用 systemd 服务或写生产驱动、数据库引用和电脑数据；正式维护的状态协调、画面恢复及双端任务仍待验。[运维](OPERATIONS.md#云电脑项目目录候选2026-11-20)

## 项目设备生产预检（2026-11-21）

PA-022／PRJ-02。通过运行中的 Compose 容器核对 API 和 Worker，均配置 `native-linux`、Graphile 和有效的设备网关开关，未配置启用任何项目开关。此处核对配置，尚未执行设备配对和 Worker 项目电脑任务。

`sydney-driver.service` 的实际入口是 `/opt/sydney-native/driver.py`，服务和 socket 都为 `active`。只读解析生产源码确认缺少 `project_folder`、`project_file`，仓库候选两项均存在。结构比较确认候选 `Driver` 增加四个方法，修改 `read_file`、`dispatch` 和 `serve_connection`，无方法删除。与项目文件变更前的仓库基线相比，生产还没有 `GenerationChanged` 类及其分派和响应改动。未调用驱动文件协议，未更新文件、重启服务或调整电脑引用。

Node `24.15.0` 和 Vitest `4.1.12` 执行 API 环境、项目目录、文字会话与 Compose 四个定向文件，165 项全部通过。67 个变更中的相对文档链接和 `git diff --check` 通过。

Linux 候选驱动回归见[驱动与设备记录](#项目-linux-驱动与设备预检2026-11-21)。下一次设备批次验证包含实际服务接线、重启后代次与画面恢复、双端样本任务，以及关闭电脑能力后项目文字会话继续可用。[发布与回退顺序](OPERATIONS.md#项目迁移依赖与保持关闭的部分)

### Windows 安装包项目设备入口核对（2026-11-21）

只读解析本机正式安装目录的 `app.asar` 和包内项目页面。`Sydney-partner 0.4.1` 的主进程产物含本机选目录 IPC、项目文件处理和固定 Windows 诊断入口。项目渲染产物确认有八个调用入口，涵盖本机目录查询及解绑、云目录查询及绑定和解绑、任务取消、审批答复及产物下载。核查仅确认产物包含入口，实际配对、原生授权窗口、写文件、终端和下载仍待端到端验收。

生产 `rakazo-prod` 的 API 和 Worker 均为 `sydney-pa022-project-text:20261121` 且 `healthy`，文字开关启用，两个进程的项目设备开关均为 `false`。API 画面桥在运行，网络命名空间指向当前 API。两项退役服务各零容器，HTTPS `/health`、`/ready`、`/app` 依次为 `200`、`200`、`404`。本轮未改配置、容器、设备授权或账号数据。Windows 即插即用的当前设备未枚举到 Apple 手机，Apple Mobile Device Service 仍运行。iPhone 真机版本继续待核对。

## 生产镜像切换预检（2026-11-21）

PA-023／WEB-01／REL-01。使用生产服务器上的 Docker Compose 和现有两份生产文件，设置占位 `RAKAZO_IMAGE_TAG` 只解析配置。`api`、`worker`、`migrate` 三处均未跟随标签，当前运行的 updater 实例为零。

以标准输入追加第三份覆盖，仅将三个服务的 `image` 改为基础文件的仓库与标签表达式。升级、回退两个占位标签均解析出三个相同镜像引用。全 profiles 的解析结果逐项比对，仅这三个镜像引用有变化。旧 Web 和专用桥均未出现，现用 API 画面桥仍共享 `service:api` 网络命名空间。本轮只验证解析，未修改生产文件、拉取镜像、执行迁移或重建服务。

本机用 Node `24.15.0` 和 Vitest `4.1.12` 执行三个 updater 测试文件。两个 Compose 测试文件共 8 项通过。`index.test.ts` 中 12 项通过、15 项失败，其中 14 项因 Windows 临时夹具路径不满足 POSIX 部署路径，1 项因 POSIX 可执行文件替身未运行。真实 Linux 更新、回退和服务重建待验。

## 项目目录与会话回归（2026-11-21）

PA-022／PRJ-01／PRJ-02。Windows 包内项目目录测试补齐云目录查询、输入组件和绑定 RPC 替身。新增用例选择在线专属云电脑、输入相对目录 `reports`，提交后核对指定项目、设备、相对路径、只读授权和取消信号。目录页单测 9 项通过，测试文件 Biome 检查通过。

首次组合运行时，目录 API 的 10 项因项目电脑门禁返回 `503` 失败。当时 API 门禁与测试夹具正在更新。更新后的目录 API 单测 21 项通过。包含该文件的最终组合回归使用 Node `24.15.0`、Vitest `4.1.12` 及单 worker，26 文件中 23 文件通过、3 个 PostgreSQL／Graphile 文件跳过，合计 238 项通过、53 项跳过。范围涵盖项目路由、会话、共享目录、双端组件、Windows 原生目录与终端、项目工具策略，以及条件启用的数据库用例。

本轮使用现有本机依赖，生产部署及项目开关未改动。真实 PostgreSQL 和 Worker 的后续结果见 [隔离实测](#项目-postgresql-与独立-worker-实测2026-11-21)。双端项目任务、备份恢复及版本回退仍待验。[首版测评](ACCEPTANCE.md#个人生产首版测评)

续验：使用 Node `24.15.0`、Vitest `4.1.12` 与单 worker 重跑 26 个定向测试文件，24 个文件通过、2 个条件跳过，共 716 项通过、34 项跳过。API、Worker、适配层、测试工具、Web 与 updater 的六项 TypeScript 检查通过；22 个相关 TypeScript 文件的 Biome lint 规则检查通过（未启用 formatter 与 assist）。完整 Biome 检查仍报告格式／导入排序差异，未对整批文件自动格式化。`git diff --check` 通过。

本轮本机 Docker Desktop 服务为停止状态，Docker API 不可连接，当时未执行 PostgreSQL 与独立 Worker 用例。后续改在经授权的服务器临时库运行，见下节。

## 项目 PostgreSQL 与独立 Worker 实测（2026-11-21）

PA-022／PRJ-01／PRJ-02。经授权在现有 PostgreSQL `18.6` 实例创建空的临时库，从生产账本按迁移名称选取 211 项既有基线和 13 项项目迁移，共 224 项，全部应用成功。另一个无 SQL 的目录未纳入。这次比对覆盖迁移名称，未比较生产账本的文件摘要。Graphile 队列迁移通过。最终复测使用两个临时登录，运行角色受 RLS 约束且可以进入系统上下文。

四个定向集成文件 54 项全部通过。项目仓储覆盖同一 Space 的项目 A／B、首页和另一账号，含 Bot／群聊发送及重试；目录仓储覆盖本机与云端绑定。Graphile 用例从持久任务恢复项目 A／B 与首页的执行范围。独立 Worker 从手机签名 RPC 产生的排队 Run 恢复，使用本地模型替身产生回复，SSE 收到回复与结束事件，重进读到同一回复，并核对幂等和跨范围拒绝。

首轮使用了无效的内容加密设置，改为 `off` 后继续。为测试迁移登录准备系统上下文时，一条辅助记录误插入生产 RLS 配置表，随后按该记录精确删除一行，复核表内为一行。插入前未留行数或行集基线，现有证据仅能确认误插入的记录已删除，无法确认表内记录与操作前逐行一致。正式复测的辅助设置仅在临时库写入。Graphile 用例原夹具缺少外键要求的组织成员，补齐后四文件复测退出码为 `0`。

测试结束后移除临时转发、临时工作目录、数据库及两个登录，复查测试库与角色均为零。生产账本仍为 211 项，API、Worker、PostgreSQL 状态为 healthy，直连 `/health`、`/ready` 返回 `200`，旧 `/app` 返回 `404`。生产项目迁移、开关、备份还原、设备任务及双端现场验收均待执行。

续作使用已记录的隔离结果，并重新探测手机默认生产后台。`/health` 与 `/ready` 返回 `200`，`/rpc/projectWorkspaces/capabilities` 返回 `404`。本次仅发出 HTTPS 探针，没有重跑数据库测试或变更生产。生产账本与候选迁移的后续比对见[发布清单复核](#项目迁移发布清单复核2026-11-21)。

只读检查确认标准备份根目录 `/var/backups/rakazo` 不存在，生产根文件系统可用约 19 GB，未发现 `age` 与 `rclone`。GitHub 发布目录中的迁移前 `database-before.dump` 仍存在，大小 2,519,456 字节，权限 `0600`，早于当前 211 项迁移账本。本次只检查其元数据，未计算摘要、读取归档内容或执行恢复。其他存储位置未检查，本次发布所需的备份及隔离恢复仍待验。[历史备份记录](OPERATIONS.md#github-与项目工作区发布边界2026-11-20)

## 项目 Linux 驱动与设备预检（2026-11-21）

PA-022／PRJ-02。Windows 本机复测 `python -B infra/native-linux/test_driver.py`，共执行 24 项，21 项通过、3 项跳过。续在生产主机以非特权账号及 Python `3.12.3`，在 `/dev/shm` 的独立临时目录运行同一候选和测试，24 项全部通过。补验涵盖 Linux 目录描述符上的真实样本读取、独占新建、越界与链接拒绝、目录替换拒绝，以及空闲与断开 socket 的命令处理。运行不连接生产驱动 socket，使用合成文件与本地 socketpair，退出后临时目录已确认清理。服务和 socket 仍为 `active`，生产驱动部署、实际私有通道和双端任务待验。

iPASide 只读 USB 探针返回设备数 `0`。本轮未取得 iPhone 实际运行版本，`1.0.16` 仍只有 [OTA 分发证据](#双端首页与聊天界面2026-11-20)。

## 手机项目文字首版（2026-11-21）

PA-022／PRJ-01／P01。本轮未连接生产数据库。核对手机项目列表、详情和聊天依赖现有项目 RPC；项目创建与电脑授权原先共用开关，无法按文字首版单独开放。拆分后，API 和 Worker 可独立于文字开关关闭项目电脑能力。

| 检查 | 实际结果 |
| --- | --- |
| API、手机、数据访问与 Compose | Node `24.15.0` 和 Vitest `4.1.12` 单 worker 执行 15 个定向文件，288 项通过。涵盖项目路由及会话作用域、手机聊天及目录状态、启用文字但关闭目录、API／Worker 配置传递 |
| 执行器 | `executor-readonly-approval.test.ts` 共 244 项通过。新增两种开关状态，检查文字运行与历史工具均可用，目录查询、Windows 设备探测和项目终端工具只在启用时出现 |
| 类型与静态检查 | API、Worker、适配层及移动端 TypeScript、12 文件 Biome lint、差异检查通过 |
| 真实环境 | 定向运行中 46 项 PostgreSQL／Graphile 用例因缺隔离数据库连接跳过。未应用生产迁移、重启服务、发 OTA 或完成 iPhone 真机收发 |

续验：项目发送只查询模型授权，不要求为不会使用的外部记忆或云代理授权。API 授权、项目会话和移动端项目聊天的 4 文件共 39 项通过，API 与测试工具包 TypeScript 通过。补齐全量鉴权矩阵遗漏的 34 个 RPC 入口，类型级覆盖检查通过。新增 `project-chat.postgres.test.ts` 使用手机签名 Bearer 和真实 API 进程内执行器，Pi 只请求本地模型替身；检查建项目和 Bot、授权后发送、重复发送不重复入库、重新读取回复及拒绝跨项目和首页访问。该用例和鉴权集成用例共 34 项因无隔离数据库而跳过；独立 Worker 的队列恢复仍另验。iPASide 只读设备探针返回 0 台，未核对手机实际版本。未部署生产后台或发布新 OTA。

同轮生产只读检查：向当前手机默认后台发送匿名 RPC 请求，`/rpc/health` 返回 200、`/rpc/github/status` 返回 401、`/rpc/projectWorkspaces/capabilities` 返回 404。健康检查通过不代表项目 API 已部署；本次探针不检查实际数据库、开关或登录后的项目状态。

本轮按 P01 优先，将手机签名 Bearer 集成用例接到独立生产 Worker 入口。API 仍执行登录、建项目、授权和发送，测试暂缓 API 进程内继续执行，检查同一 Run 留在数据库中。随后以相同运行角色拉起独立 Worker，由其恢复、调用本地模型替身并持久化回复。用例同时检查原发送请求重试、会话重进及项目 B／首页隔离。Worker 心跳写入测试临时目录。

Node `24.15.0` 下测试工具包和 Worker TypeScript、两文件 Biome 检查通过。心跳和隔离连接配置共 5 项通过，独立 Worker 收发用例因没有隔离数据库连接而跳过。初次直接经 `fnm` 启动 `pnpm` 在 Windows 找不到命令，改由同一 Node 运行现有本地工具。未启动数据库、执行生产迁移、更新后台或验证 iPhone。

实时回复补测：手机签名会话在 Worker 启动前打开项目订阅。用例按 Run 读取 SSE，要求同线程先收到 Bot 回复、再收到完成事件，重读快照时回复 ID 一致，并检查另一账号无法读取项目。API 项目路由和手机项目会话共 21 项通过，测试工具包 TypeScript、该文件 Biome 与差异检查通过。用本机现有 oRPC 处理合成 Request，确认两个事件的 SSE 帧结构。真实 PostgreSQL／Worker／SSE 用例因无隔离数据库连接而跳过。另核对 `1.0.16` 的发布源码包含项目列表、详情和会话，当前对应移动代码与发布提交一致。本机可读到 224 个迁移 SQL 文件，其中 13 个是本批项目迁移，另 211 个是非项目迁移。数量与先前 211 项生产已完成记录一致，名称和 SHA-256 仍需对照当前生产账本。

可用性复核：生产匿名健康 RPC 返回 200，项目能力 RPC 仍返回 404。当前进程未配置隔离数据库运行或迁移连接。已保留既有离线证据，未运行数据库测试、读取生产账本或变更后台。待获准使用隔离临时库后执行项目收发、订阅和隔离验收。
本窗口为独立 Worker 收发用例补上另一已登录账号的读取隔离断言和数据库目标校验。授权、项目路由、设备门禁、执行器、Compose 和包内目录组件等定向回归共 445 项通过、1 项数据库集成跳过。最终连接配置用例两项通过，合成非隔离库名在连接前被拒绝。测试工具包 TypeScript 和覆盖新增测试的四个文件完整 Biome 检查通过。扩大检查的 17 个文件 lint 通过，完整格式检查仍报告既有格式和导入顺序问题。

## 双端首页与聊天界面（2026-11-20）

2026-11-21 用户授权先合并并发布。以当前发布线 `b81889095` 为基线，依次合入 iPhone `506123095` 与 Windows `57413d0fb`，准备手机 `1.0.16` OTA 和 Windows `0.4.1` 安装器。合并源码使用 Node `24.15.0` 与 Vitest `4.1.12`，手机导航、首页、输入、键盘、GitHub 和版本更新 7 个文件共 135 项通过。Windows 输入、侧栏、电脑面板及 Electron 相关 44 个文件共 834 项通过，11 项跳过。手机、渲染层、Electron 主进程与 DOM 的 TypeScript 及 11 个变更文件的 Biome 检查通过。

两端从发布提交 `ecd12301c` 构建。iPhone Run `44776686746` 已成功发布到 `sideload`。以 `1.0.15` 的现行标识请求同 runtime 后返回 `1.0.16`，更新 ID `01a1f9db-d79d-7d5b-bdb9-9c5e93ecbf66`。三语说明、Hermes 98 启动包和全部 55 项资源通过校验。启动包 SHA-256 为 `954c94ce072b9328e13098c61f53fb11967a3038233929bd47dc4c092e913101`。手机实际下载重启、导航、键盘、大字号、旁白、主题及收发待真机验收。

Windows Run `44776693220` 的六项打包测试通过。安装器产物 `14650466989` 的 ZIP 摘要、安装器版本、字节数和构建来源均已核对。安装器未签名，SHA-256 为 `84d8d6b22b43c546cbfbcb6f737267bb6a6c3c12c745cac6324ac64f37fe622f`。本机从 `0.4.0` 静默覆盖为 `0.4.1`，已安装二进制与产物元数据摘要一致，408 个 profile 文件安装前后摘要一致。使用已有 profile 冷启动，实际包内工作台显示会话列表和聊天输入框，Tab 进入输入框时轮廓可见。Windows 新建会话、真实消息发送及失败恢复仍待验证。生产 `/health`、`/ready` 均返回 200。

基线 `633f5d019`。候选提交为 iPhone `a6338221b` 与 Windows `a4bd7899f`。初改用 Impeccable 的现有界面精修流程，复核使用固定于 `672ae44` 的 `better-interface` 与七项专项技能。iPhone 改进底栏选中与点按态、首页会话未读和选中语义、输入提示及发送状态。Windows 改进侧栏焦点与选中态、长名称布局、输入焦点、占位提示和减少动态效果。

| 检查 | 实际结果 |
| --- | --- |
| Stop That Shit | 插件 55 项钩子测试通过。独立会话夹具通过真实钩子进程验证 `review agents=0` 会返回拒绝、`change agents=0` 会允许样本写操作。当前 Codex 会话已有实际工具调用事件，最近核对时处于 `unconfirmed` 观察模式。显式 `change` 的宿主证据待记录 |
| iPhone 离线 | 底栏、首页渲染、输入、键盘偏移和聊天外观定向回归 120 项通过。移动端 TypeScript 和变更文件 Biome 通过。默认 Node 22.14.0 低于仓库要求，改用已有 Node 24.22.3 和隔离 worktree 的现有依赖链接后通过 |
| iPhone 候选 | 以构建 5 的原生包嵌入本分支 Hermes bundle。字节码版本一致，52 个资源内容匹配，内嵌清单的 54 条路径均可解析，归档完整性通过。包见 [验收候选运行说明](OPERATIONS.md#双端首页与聊天本地验收候选2026-11-20)。Windows PnP 曾识别 iPhone，同轮两次 iPASide 只读查询均返回零台可用 USB 设备。签名安装、运行标识及实机操作待验 |
| Windows 离线 | 输入、侧栏分组与调整宽度、消息状态定向回归 123 项通过。渲染层 TypeScript、改动文件 Biome、Impeccable 探测及 Vite runner 模式生产渲染层构建通过。桌面壳 `build.mjs` 和静态资源复制通过。Electron 独立启动回归 1 项通过 |
| Windows 运行 | 用实际聊天头部及输入组件对比基线和候选，覆盖 680／1024 窗口内容宽度、浅色／深色、带长名称的群聊、输入焦点及样本发送、停止。前后截图保存至本地忽略目录 `.tmp/ui-home-chat-integration/.tmp/ui-evidence`。未签名展开包首次启动缺少 Koffi 原生模块，候选资源目录补入已安装的 Windows x64 模块后，从包内加载渲染资源，进入实际服务的登录界面。候选登录后的侧栏、新建会话、完整发送与失败恢复待验 |
| 续作复验 | 使用现有 Node `24.22.3`，手机底栏、首页会话和聊天输入 4 文件共 117 项通过；Windows 工作台输入与会话列表 2 文件共 102 项通过，桌面单测 723 项通过、11 项跳过。手机、Windows 渲染层和 Electron 主进程及 DOM TypeScript 检查通过，双端 9 个变更文件的 Biome 检查通过 |
| 手机扩大回归 | `apps/mobile/lib` 共 3,415 项通过、9 项失败，另有 1 个套件因 `ExpoSecureStore` 加载失败未运行。用同一 Node、Vitest `4.1.11` 及依赖在共同基线 `633f5d019` 复跑 7 个失败文件，复现同样失败。涉及词表、图片消息样式、Android 通知、提及读屏测试、SecureStore 模拟、设置路由及切换服务器后的错误文本。复跑结束已恢复手机候选分支 |

2026-11-21 按用户指示改用 OTA 作为手机验收路径，不要求 USB 连接。检查构建 6 的未签名 IPA，确认 `xin.zxlup.sydney`、版本 `1.0.12`、构建 `6`、OTA 启用、runtime `sydney-ios-ip-1`、channel `sideload`。候选仅改 JS／TS，与现有 runtime 兼容；构建 6 IPA 是原生不兼容时的备选，不作为本轮必需安装包。发现 iPhone 优化分支基于 `633f5d019`，`apps/mobile/sydney-release.json` 为 `1.0.13`；已发布的 `1.0.14` OTA 源提交 `1960b1745` 更新该文件。因此 OTA 候选必须以 `1960b1745` 为基础叠加 UI 提交，不能直接发布旧分支。现有 `mobile-ios-update.yml` 将更新发布到所有匹配 runtime 的共享 `sideload` channel；当前本地无 Expo token／EAS CLI，工作流也只允许 `main` 与指定集成远程分支，且本轮未授权发布，故未创建生产 OTA。实际手机仍需在发布获准后检查并安装更新、重启，核对运行 updateId 和主路径。Windows 候选窗口仍显示「登录」入口，待验收账号登录。两端验收通过后合并并复验。
## Windows 只读续验与退役配置预检（2026-11-21）

| 检查 | 实际结果 |
| --- | --- |
| Windows GitHub（GH-01） | 已安装 `e67603cbc` 的 `Sydney-partner` 使用原登录会话，从侧栏进入开源搜索，找到 `octocat/Hello-World` 并显示 README。搜索和速览 RPC 均为 200。页面显示已有 GitHub 连接，公开数据测试未新增、替换或解绑 PAT，未发分析消息 |
| Windows 电脑面板（PA-011／APP-02） | 冷打开已保存的面板，还原到运行占位但无画面请求。通过 Bot 设置按钮关闭再重开，请求 `computer.screenUrl` 返回 200，嵌入的 noVNC 收到 `1024×768` 真实帧，抽样 23 种颜色且 `viewOnly=true`。未点击启动或接管，未发送远程输入；本轮未复测其他电脑或断线重连 |
| 电脑面板修复 | 恢复当前 Bot 的电脑面板后，提交到界面再触发一次既有会话刷新。新增回归核对已显示正确面板时才刷新，重复渲染和另一 Bot 的普通布局不误触发。相关 5 文件 27 项、Web TypeScript 和三文件 Biome 均通过；新包未构建，安装版自动恢复仍待复验 |
| 生产退役预检（WEB-01） | 全 profiles 仍有 `web`、`native-screen-web-loopback`，两项均无容器，API、Worker、PostgreSQL 为 healthy。将两份现行 Compose 和 `.env` 的候选变更仅置于内存，核对移除两项服务、Caddy 的 `web` 依赖及 `webassets` 声明，更新名单改用 `native-screen-api-loopback`。Compose 全 profiles 解析成功，其余有效配置逐项相同。未写生产文件、移除卷或重建服务 |
| iPhone | 只读 USB 枚举返回 0，安装和真机验收仍待设备 |

## Windows 基础功能与生产退役落盘（2026-11-21）

| 检查 | 实际结果 |
| --- | --- |
| Windows 基础功能（APP-01） | 安装版 `e67603cbc` 的既有历史消息在界面重载后再次显示，核对同一条消息。合成文本附件能添加、移除且原草稿保留。当前模型与 5 项选项可见。未发送新消息或附件，未保存新模型 |
| GitHub（GH-01） | 原连接的个人主页、贡献图、年份切换、仓库列表和隐藏私有开关通过。个人主页两次 RPC 返回 200，开关操作后恢复原值。PAT 新绑、失效与解绑仍待验 |
| 生产配置（WEB-01） | 北京时间约 00:34 备份并写入两份 Compose 与 `.env`。全 profiles 的实际合并结果吻合候选。旧 Web、旧画面桥、Caddy 旧依赖及 `webassets` 声明已移除，更新名单使用 `native-screen-api-loopback`。API、Worker、PostgreSQL 健康，两项旧容器仍无，API、现用画面桥及 Caddy 连续运行。HTTPS `/health`、`/ready` 和 `/api/auth/capabilities` 均为 200，`/app` 为 404 |
| 已部署画面桥 | 落盘后 Windows 手动重开面板，画面 RPC 200，收到 `1024×768` 真实帧、抽样 23 色且 `viewOnly=true`。后台镜像重建、更新器执行和新安装包的自动恢复仍待验 |
| 项目迁移账本（PRJ-01） | 211 项已完成、0 项未结束。[项目迁移清单](OPERATIONS.md#项目迁移依赖与保持关闭的部分) 的 13 项均未应用，元数据、Windows 和云端目录绑定表均不存在。GitHub 及相邻两项 messaging 迁移均已完成且未回滚，运行 API 的两个项目开关均未设置。隔离库和 Worker 验证待执行 |

面板修复 `b81889095` 的 Windows 非发布 Run `44775275913`、Job `136423307734` 成功，六项展开包测试全部通过。已下载展开包 Artifact `14650022308` 和安装器 Artifact `14648967991`，两份归档的提交、运行号和平台匹配；Windows x64 安装器为 133,956,729 字节，未签名。展开包保留 `resources/web`，不含 `resources/stack`。

北京时间 00:45 使用新展开包和既有登录 profile 冷启动。未点击面板或重载页面，保存的电脑面板自动请求画面，`computer.screenUrl` 返回 200，noVNC 收到 `1024×768` 真实帧，抽样 23 色且 `viewOnly=true`。通过 `APP-02` 的 Windows 面板自动恢复子项。新 NSIS 候选尚未覆盖安装。iPASide 的只读探针返回 USB 和网络设备各 0，iPhone `1.0.15` 实际运行仍待真机确认。

提交 `ecd12301c` 的 Windows `0.4.1` 非发布 Run `44776693220` 已通过六项展开包门禁，并下载安装器 Artifact `14650466989` 与展开包 Artifact `14650407810`。并行窗口已覆盖安装，安装证据见提交 `2e4daa0a9`；本窗口复核已安装文件及 `before-install/` 回退材料。展开包与实际安装版使用原登录 profile 冷启动，均自动收到画面 RPC 200 和 `1024×768`、抽样 23 色的只读真实帧。生产 Compose、`server` 构建目标、原生画面桥及更新名单的 4 文件 93 项定向测试通过。实际版本回退待验。

同提交的 iPhone `1.0.16` OTA 已通过 Run `44776686746` 发布。以构建 `5` 的内嵌配置核对 `sideload` 通道，返回 HTTP `200`、更新标识 `01a1f9db-d79d-7d5b-bdb9-9c5e93ecbf66`，运行时 `sydney-ios-ip-1`。三语说明匹配源码，Hermes 启动包及 55 项资源通过分发校验。USB 和网络设备数仍为 0，手机实际更新和交互待验。

`APP-02` 生产授权路径复核：运行中的 API 启用了 API 回调及旧登录回跳，配置了 MCP 原生回跳 origin。请求生产 `/api/mcp/oauth/callback`，无回跳参数时返回 `200`，显示 Sydney 授权返回页，复制框默认隐藏，响应为 `no-store`。同次 `/app` 返回 `404`。Slack OAuth 客户端 ID、客户端密钥和签名密钥在运行配置中均未设置，Slack OAuth 本轮标记不适用；实际 MCP 授权完成及取消仍待验。

## 个人生产首版复核（2026-11-20）

用户本轮授权继续 Windows 修复提交／推送及非发布构建。核对远端集成分支 `1960b1745` 已包含 Vite 修复及测试后直接启动 Run `44760494659`，成功通过界面与桌面编译。NSIS 随后无法打开 pnpm 虚拟存储下的 274 字符模板路径，未生成可交付安装器。相同模板在本机现有依赖中存在；将虚拟存储目录名上限从默认 120 调为 60 后，该 runner 路径上界降为 214 字符。配置只用于 Windows 非发布构建。pnpm 配置读取、工作流 YAML 解析、9 项工作流测试及差异检查通过。

修订 `e67603cbc0f57370b2945948c5b76d88474664c3` 的 Run `44762361026`、Job `136377919809` 成功生成 `Sydney-partner` Windows x64 NSIS 和展开包。云端六项展开包测试全部通过，覆盖健康后台、不可达后台、无效地址、非 Sydney 健康响应、旧本地 profile 进入直连设置及关闭更新。使用 Node `24.22.3`、pnpm `9.15.0`。

安装器 Artifact `14641937705` 和展开包 Artifact `14641408374` 已下载到 `.tmp/release-candidates/44762361026/`。安装器 `Sydney-partner-Setup-0.4.0.exe` 为 133,956,374 字节，本机与 runner 均确认 `NotSigned`。两份归档元数据匹配提交、运行号和 Windows x64；展开包包含 `Sydney-partner.exe`、`resources/app.asar` 与 `resources/web/index.html`，未发现 `resources/stack`。安装前留存旧安装器及用户目录副本：325 个文件、30,193,006 字节，并另验证安装后全部文件逐一与副本相同。NSIS 退出码为 0；安装位置仍为 `%LOCALAPPDATA%\Programs\rakazo`，包内界面存在，`resources/stack` 不存在。两次完全关闭并启动已安装桌面应用，均以正式 renderer 加载生产账号首页 `/app/<id>`，显示 `bots-sidebar`，使用中的 SQLite／浏览器存储保留。

两次启动均在该桌面 renderer 的登录凭据下，请求生产 `/rpc/health` 与 `/api/auth/get-session` 成功，返回健康及既存会话；Electron 网络层直接请求生产 `/health`、`/ready`、`/api/auth/capabilities` 均为 200，浏览器 `/app` 为 404。`setup.json` 中 `mode=existing`、生产 origin `https://124.221.182.39` 安装后未变。每轮可见当前已登录账号首页，未触发登录表单或改动账号。没有在测试脚本中记录、读取或导出会话令牌。原 profile 和旧安装器备份、启动验证结果保留于 `.tmp/release-candidates/44762361026/before-install/` 及同一候选目录 `installed-verification.json`；该目录为 git-ignore。生产服务、Compose、数据库、迁移和 Worker 未修改。尚未实测真实消息发送、模型／GitHub／云电脑画面、Windows 项目读写或安装器版本回退。建议程序只验证过，不将这些功能记作通过。

提交 `633f5d019c4295147c2338b6604d0e374d787f76` 的 Windows 非发布构建 `44753883136` 在加载 `vite.config.ts` 时因 `novnc-proxy.ts` 相对导入的 `novnc-html.js` 无法解析而中止。本机 Node `24.15.0` 仅加载配置即复现同一错误。改为从配置入口直接导入现有代理源码，让 Vite 处理其相对 TypeScript 依赖后，同一加载命令通过。配置加载与屏幕代理相关 3 文件 65 项、Web TypeScript 及两文件 Biome 检查通过。同提交 iOS Run `44753557596` 随后成功，产物及未验范围见 [安装候选](#首版-ios-安装候选2026-11-20)。

| 检查 | 实际结果 |
| --- | --- |
| 生产退役和直连 | 默认 Compose 排除 `web` 与 `native-screen-web-loopback`，启用全部 profiles 时仍解析出两项旧定义。两服务当前无容器，API、Worker、PostgreSQL 为 healthy，现用 `native-screen-api-loopback` 运行。生产 IP 的 `/health`、`/ready`、`/api/auth/capabilities` 返回 200，`/app` 返回 404。仅只读检查 |
| Windows 安装 | `%LOCALAPPDATA%\Programs\rakazo\Sydney-partner.exe` 版本为 `0.4.0.0`，存在包内 `resources/web/index.html` 和旧 `resources/stack`，当时无 `Sydney-partner` 进程。新版安装与运行待验 |
| Windows 安装候选工作流 | Run `44762361026` 成功，六项展开包测试全通过。未签名 NSIS 已覆盖安装，325 项原 profile 文件逐一一致。两次冷启动恢复生产账号首页并获得健康、就绪、鉴权能力 200 与 RPC health 200；`/app` 404，更新器后台未开。云电脑／项目任务、依赖功能和回退待验 |
| iPhone 安装及发布 | USB InstallationProxy 确认 iOS `27.0.1` 上已装 Sydney `1.0.12` 构建 `4`。GitHub Actions `44750564292` 发布应用版本 `1.0.13`，已下载校验 `sideload` 更新 `01a1f94b-6b80-7974-88ca-88494c9f622a` 的启动包及 55 项资源。设备生效标识及功能仍待验，详见 [OTA 记录](#手机-1013-版本与更新说明2026-11-20) |
| 首页兼容 | 修正旧首页发送、队列续行及入站夹具的数据库上下文与首页归属结果。`events.test.ts` 与 `executor-readonly-approval.test.ts` 复测合计 398 项通过，覆盖此前失败的 20 项。数据库与适配层 TypeScript、两文件 Biome lint 及差异检查通过 |

仍需生产持久配置清理、真实项目 PostgreSQL／Worker、匹配的 Windows 与 iPhone 项目候选、双端功能及版本回退。已安装的构建 `4` 和本次发布的 OTA 覆盖手机基础体验。

## 首版 iOS 安装候选（2026-11-20）

Run `44753557596` 在北京时间 22:51:29 成功，提交为 `633f5d019c4295147c2338b6604d0e374d787f76`。下载 Artifact `14639661066`（`sydney-ios-unsigned-44753557596-1`，ZIP 25,835,984 字节），IPA 保存到本机忽略目录 `.tmp/release-candidates/44753557596/Sydney-unsigned.ipa`，26,065,269 字节。

ZIP／IPA 结构及 plist 检查通过。显示名 Sydney，原始标识 `xin.zxlup.sydney`，原生版本 `1.0.12`、构建 `1`。OTA 启用，通道 `sideload`、runtime `sydney-ios-ip-1`，启动自动检查为 `NEVER`。9 个 Sydney 资源目录均在启动包中有对应路径，最长内部路径 122 字符，无扩展插件或嵌入式签名描述文件。启动包包含生产 IP、项目发送、云目录、取消任务和午夜模式标识。

本轮未重新计算或比对摘要，结构检查不能替代摘要验证。IPA 尚未个人签名、安装或运行，不据包内字符串判定业务可用。原生构建 `1` 不能区分此候选和早期源包，覆盖安装前须核对最终签名标识、构建及旧数据保留；本次不改动已安装构建 `4`。项目后台迁移、真实 Worker 和双端验收仍待执行。

## 退役配置与 IP 代理候选（2026-11-20）

| 检查 | 实际结果 |
| --- | --- |
| 原生 Compose | 用合成必填环境值合并生产 Compose 与原生 Linux 覆盖示例，开启全部 profiles 后保留 API、Worker 和共享 API 网络命名空间的画面桥；服务名单无 `web` 或 `native-screen-web-loopback`。未启动容器 |
| 更新与回退 | 6 个 updater／Compose／Caddy 定向测试文件共 96 项通过，Biome lint 通过。扩展运行共 99 项通过、15 项失败，其中 14 项使用的 Windows 临时路径被 Linux 部署路径校验拒绝，1 项依赖 POSIX shebang 执行。更新器 HTTP 回退仍需 Linux 复验 |
| IP 代理演练 | 三参数脚本通过 Git Bash `bash -n`，6 个内嵌 Python 块通过语法检查，工作区 Caddyfile 模板转换通过。默认 API 上游的隔离运行、WebSocket 和日志断言尚未执行 |
| 生产只读回跳 | IP `/api/mcp/oauth/callback`、`/integrations/callback`、`/sign-in` 返回 200 和 `no-store`，旧浏览器 MCP 回调 404。运行 API 的原生 MCP 来源和 API 回调／画面开关已核对。真实 OAuth 授权完成与取消仍需客户端验收 |

合并复跑退役与 Windows 候选工作流相关 7 个文件，135 项通过。再次用全 profiles 检查源码 Compose 服务清单，保留 API 画面桥且无两项旧服务。核对本批相关文档 35 处本地链接和锚点，`git diff --check` 通过。

补测可选 updater 的原生覆盖。通过 Compose 合并解析确认 `RAKAZO_UPDATE_SERVICES` 未配置时包含 API 画面桥，已配置时保留追加服务，默认 profiles 仍不启动 updater。3 个定向测试文件共 88 项通过，覆盖更新名单去重、过滤旧服务和重建命令，变更测试的 Biome 检查通过。未运行容器、执行更新或验证真实命名空间重新附着。

生产配置与服务未改动，持久定义清理和重建仍待验收。[退役运维](OPERATIONS.md#删除退役-web2026-11-20)

## Windows 项目终端授权（2026-11-20）

8 个定向测试文件 230 项通过。覆盖项目作用域、固定 Windows 设备、一次性审批参数、真实 Windows `ver`／`chcp`、本机拒绝、取消后停在执行前、回环通道及旧的整机授权。7 个相关 TypeScript 项目和桌面 DOM 类型检查、9 个文件的 Biome lint 通过。原生对话框在测试中用了确认回调，安装版窗口及真实生产 Worker 待验。扩大回归另有 3 个入站邮件／Web 内容／Webhook 测试在发送阶段因缺少租户上下文失败。扩大回归当次 468 项通过。

发布准备另运行 Windows 安装设置、直连渲染代理和发布工作流 6 个文件，196 项通过、5 项跳过。核对本批 32 处 Markdown 锚点及 `git diff --check` 通过。生产发布前置条件及版本回退材料见 [发布顺序](OPERATIONS.md#个人生产首版发布顺序2026-11-20)。

## 云电脑项目目录执行（2026-11-20）

10 个定向测试文件中 9 个通过，合计 116 项通过、9 项跳过。覆盖专属 Provider 分派、项目 Run 上下文、双端目录相关回归和 Windows 文件路径。Python 执行 24 项，21 项通过、3 项跳过，Windows 上跳过依赖 Linux 文件系统的场景。相关七个 TypeScript 项目、Prisma 校验、七个变更文件的 Biome lint 及 `git diff --check` 通过。未执行生产迁移、驱动部署、真实 Linux 文件任务和双端下载。

## 项目 Markdown 产物下载（2026-11-20）

13 个定向文件中 12 个文件 152 项通过。覆盖设备确认写入但副本存储不可用、下载服务核对同一项目和来源会话、双端项目页面、原有产物与分享回归。项目真实 PostgreSQL 文件 42 项按条件跳过，候选迁移未执行。数据库、共享内核、契约、适配层、API、Windows 包内界面及 iPhone TypeScript 通过。两端安装、双端实际文件下载、项目 A／B／首页真实对照以及取消时事务落库均待验收。

## Windows 项目审批与 Worker 分派（2026-11-20）

15 个定向文件中 14 个文件 240 项通过，包括 Worker 固定设备、审批重放换绑拒绝、失去 Run 范围时取消、读取结束后撤权丢弃、创建结果不明，以及重新验证本机目录主进程、NT 句柄及回环设备。DB 审批事务另有 65 项定向通过。真实目录 PostgreSQL 6 项按条件跳过。扩大执行完整 `events.test.ts` 时，17 个旧收发／排队夹具在缺少租户上下文的范围解析处失败。一次并行 Node 选择被系统旧版本覆盖，按 `fnm exec --using=24.15.0` 重跑后通过定向组合。未执行生产项目迁移、目录实际生产 Worker 或双端候选安装。

## Windows 项目目录文件执行（2026-11-20）

| 范围 | 实际结果 |
| --- | --- |
| Windows 文件系统 | 实际临时目录读取 UTF-8、独占创建 Markdown、收到相同名称时保留原文件。9 项原生检查覆盖越界、目录 junction、硬链接、目录身份替换、非法路径、内容超限及写前取消。已安装 Electron 的 Node 模式实测能加载 NT API 并检查目录句柄 |
| 授权与传输 | 13 个定向文件共 177 项通过。包括回环设备 WebSocket 调用实际 Windows 文件执行、独立授权、拒绝只读写入、断开／取消请求不返回文件内容、绑定及撤销和双端目录状态 |
| 类型与迁移 | 契约、数据库、适配层、API、桌面、包内渲染及手机 TypeScript 通过，Prisma 静态校验与 21 文件 Biome lint 通过。5 项 PostgreSQL 按条件跳过，权限意图迁移未执行 |
| 旧整机回归 | 扩大验证时旧整机写入测试另有 3 项失败。两项本机不能创建文件 symlink，报 EPERM；一项 Windows `mkdir` 模拟预期抛错但实际未抛。项目文件的实际 junction 拒绝用例通过 |

本轮使用临时样本和本机回环测试。生产 Worker 尚无项目文件工具入口，未执行生产迁移、打包安装、双端实际任务、云电脑或真实停止。部署依赖与失败后核对见 [项目发布边界](OPERATIONS.md#github-与项目工作区发布边界2026-11-20)。

## 项目任务取消（2026-11-20）

| 范围 | 实际结果 |
| --- | --- |
| 定向回归 | `stopThreadRuns` 7 项通过，含活动／终态／越界 Run；项目 RPC、共享会话、Windows 渲染界面、iPhone 页面及传输共 7 文件 75 项通过。覆盖同一群聊保留其他活动 Run、重复点击、失联后以快照确认、切换作用域和保留草稿 |
| 扩大回归 | 全文件组合共 148 项通过、22 项失败。失败均在普通发送／反应测试的 RLS 执行范围解析，直接调用的旧夹具没有生产 RPC 提供的租户上下文；该发送／反应路径未改动 |
| 类型与检查 | API、契约、共享内核、Windows 包内界面及手机 TypeScript 通过，14 文件 Biome lint、`git diff --check` 及新增 5 处文档链接通过。手机 `check` 集成命令先在 `expo install --check` 报告 12 个现有包版本与 Expo 建议不一致，随后单独执行 TypeScript 通过。未升级或安装依赖 |
| 生产与设备 | 未执行真实 PostgreSQL、Worker、双端安装或设备停止验证，未执行生产更新。后台终态与电脑实际停止证据在 [首版测评](ACCEPTANCE.md#个人生产首版测评) 分别登记 |

## 项目文字会话开放候选（2026-11-20）

补测 Worker 预检。项目 Run 改在项目 Graphile 用例中创建，避免被此前首页唤醒场景的后台扫描领取。`VERIFY_DATABASE=1` 缺少双连接配置时，定向命令在连接前退出并报告错误。正常离线运行 67 项通过、4 项真实 PostgreSQL 用例跳过；适配层 TypeScript 与所改文件 Biome lint 通过。运行角色及系统上下文检查需实际连接后验证。没有运行数据库或 Worker 服务，备份恢复与执行器验收分开使用隔离临时库，见 [发布顺序](OPERATIONS.md#个人生产首版发布顺序2026-11-20)。

| 范围 | 结果 |
| --- | --- |
| 生产配置与文字会话离线回归 | 定向 10 文件，8 文件 203 项通过。覆盖生产 Compose 默认开关和环境变量清单、API 环境解析与项目路由、执行范围解析及 Worker 任务分派 |
| PostgreSQL 与 Graphile | 两文件共 46 项按 `VERIFY_DATABASE` 条件跳过。新增用例通过正常 Bot／群聊创建和发送写入数据，构造同账号同 Space 双项目、首页及跨账号对照；真实 Graphile 用例使用执行器替身观察范围恢复和禁止跨范围写入 |
| 类型及静态检查 | 首轮发现新测试文本块字段和 Space 成员 ID 两处类型错误。修正后数据库及适配层 TypeScript、三个测试文件 Biome lint 和 `git diff --check` 通过；本批新增的 7 处相对文档链接及锚点通过。合并生产源码与客户端覆盖，所有 profile 下仅列出 API、Worker、updater、Caddy、PostgreSQL、PITR 与迁移服务，未启动容器 |
| 迁移源码 | 核对 `20261120130000_project_text_conversations` 排在 `20261120120000_project_directory_bindings` 之后，事务仅删除五个项目禁写 CHECK。迁移未执行 |

2026-11-21 合并双端发布基线后，从根目录重跑项目/API/数据库/适配层相关 14 个测试文件。12 个文件 131 项通过，2 个 PostgreSQL 文件 49 项因未设置独立 `VERIFY_DATABASE` 连接而跳过；覆盖路由、项目范围、目录文件授权、Windows 终端和工具策略。此次只验证离线替身及本机 Windows 文件系统，不表示真实运行角色、项目会话、Worker 或生产迁移通过。

恢复后原本机测试会话句柄不可用，已重新执行定向验证。未迁移生产、打开开关或运行真实 PostgreSQL、Worker 执行器与双端验收。发布和数据保留回退见 [项目迁移依赖](OPERATIONS.md#项目迁移依赖与保持关闭的部分)。

## 个人生产首版退役收尾（2026-11-20）

本轮执行 [个人生产首版计划](PLAN.md#个人生产首版交付2026-11-20) 的退役收尾及项目文字回归，按 [首版测评](ACCEPTANCE.md#个人生产首版测评) 区分源码、实际生产和设备证据。

| 检查 | 实际结果 |
| --- | --- |
| 生产只读复核 | API、Worker、PostgreSQL 健康，现用 `native-screen-api-loopback` 正常运行。旧 `web` 和 `native-screen-web-loopback` 按标签查询均为 0；有效 Compose 服务名单无两项旧服务。生产 HTTPS IP `/health` 和 `/ready` 均为 200，`/app` 为 404。API 容器内标准路径存在无影 SDK |
| 持久配置 | `/srv/rakazo/infra/compose/docker-compose.prod.yml` 仍声明 `web`；`/etc/rakazo/compose/production.overlay.yml` 仍声明 `web` 和 `native-screen-web-loopback`，另有现用 API 桥。未写入、重载或重启生产，首个远端组合探针的 HTTP 段受命令换行影响未执行，分离后的本机 HTTPS 探针通过 |
| Compose、更新和桌面单元测试 | 12 文件 294 项通过。包括四套 Compose `GITHUB_PROVIDER` 校验、生产 `server` 构建目标、默认更新名单及旧服务过滤、Windows 旧本地栈配置直连回归。额外 7 项无影 SDK 脚本定向测试通过 |
| 项目和定时唤醒 | 5 文件 210 项通过，真实 PostgreSQL 2 文件 46 项按条件跳过。生产 Worker 原本就在 `asOwner` 中解析真实所有者并建立租户上下文；8 个旧失败用例改用相同上下文和范围查询测试数据，执行器、归属校验与 RLS 规则未放宽 |
| 生产迁移账本 | 独立只读事务确认已完成 211 项，未结束 0 项。GitHub 表存在；项目及目录绑定表均不存在，当前运行 API 的两个项目功能开关未设置 |
| 类型及脚本 | updater 和 Windows 桌面相关 TypeScript 通过。首次桌面检查在既有 Node `22.22.0` 因仓库最低版本限制未运行，切换本机已装的 `24.15.0` 后通过。生产部署与 PITR 脚本的 `bash -n` 通过 |
| 部署脚本模拟 | Windows Git Bash 首轮 36 项中 24 项通过、12 项失败。修正已部署时增加配置复核的测试预期，并为本机扩大用例超时后，定向复测 8 项通过，覆盖无变更、正常直连部署、拒绝旧服务及版本回退。首轮另有 Git 远端改写 128 退出及 6 项部署启动器用例未正常启动，未在 Linux 复验 |
| 源码合并 Compose | 使用 `docker compose config --no-interpolate --services` 核对生产与客户端覆盖、原生 API 桥示例，启用所有 profile 时仍无退役服务，现用 API 桥在名单中。未启动容器 |
| Windows 安装包验收 | 候选工作流新增检查，要求 `resources/web/index.html` 存在且 `resources/stack` 不存在；新增旧 profile 到直连设置、启动 IPC 被拒及 profile 原样保留的 Playwright 用例。`--list` 已确认能发现用例，实际打包、运行与安装回归未执行 |
| 手机离线回归 | 导航、GitHub、换肤、会话模型、画面与重试、产物入口、输入栏和目录状态共 11 文件 301 项通过，移动端 TypeScript 通过 |
| 设备只读复核 | 实际连着一台 iPhone，iOS `27.0.1`，安装代理返回 `Sydney 1.0.12` 构建 `1`。当前 Windows `Sydney-partner 0.4.0.0` 有包内渲染器及旧栈资源，未切到本轮候选。当前进程无 Expo 发布令牌，未签名、安装、发布或读取设备个人内容 |

本轮未构建或发布镜像、IPA 或 Windows 安装包，未执行项目迁移、真实 Worker 联调、版本回退或真机验收。生产历史定义的清理与发布路径见 [运维手册](OPERATIONS.md#删除退役-web2026-11-20)。

## 删除退役 Web（2026-11-20）

用户允许退役后直接删除，取消恢复旧 Web／再次切流演练；原目标面板已由用户清除。当前窗口独立执行，保留桌面共用 `apps/web`、API／Worker、认证与屏幕服务。仅编辑部署候选和相关文档，生产只删除两个原本已停止的专属容器，未部署其他工作区功能。

| 检查 | 实际结果与边界 |
| --- | --- |
| 生产删除前核对 | 通过现有 SSH 只读确认 `rakazo-prod-web-18` 与 `rakazo-prod-native-screen-web-loopback-1` 均属 `rakazo-prod`，服务分别为 `web`、`native-screen-web-loopback`，状态均 `exited`；删除前再次核对标签与状态 |
| 实际删除 | 北京时间 15:55:14 `docker rm` 两个明确容器成功，无强制删除或卷删除；随后按两项服务标签查询均无结果。共用应用／socat 镜像、旧资源卷、数据库、工作区和备份保留 |
| 运行健康与旧入口 | 删除后 API、Worker、PostgreSQL healthy；Caddy、API 画面桥、宿主桥及驱动代理仍运行。生产 IP `/health`、`/ready` 为 200，IP `/app` 为 404。首个组合命令末尾的域名 curl 因终端传输 URL 格式问题未执行成功；改用独立命令后原域名 `/app` 返回 404，两个删除目标再次查询仍为空 |
| 源码配置 | 生产 Compose 不再声明 `web` 与 `webassets`；网关只依赖 API，四条客户端认证／屏幕上游默认 API，浏览器应用兜底显式 404，健康及就绪探针保留。生产更新器不再重建 Web；客户端覆盖和原生 API 桥示例不声明旧服务。开发预览与本地镜像拓扑保留 |
| 网关语法 | 用生产现有 Caddy 二进制从标准输入执行源码 `Caddyfile.prod` 的 `caddy adapt`，退出 0；仅提示输入未按 `caddy fmt` 排版。没有载入或重载生产配置 |
| 首轮定向回归 | 网关日志、网关重试／入口、Compose 网页线程／退役与 updater-logic 四文件共 80 项通过；新增原生 API 桥断言后的收口结果在下方补记，不与本轮重叠计数 |
| 生产更新器服务 | `compose-service.test.ts` 限定生产 provider、Worker 配置和 updater 三组，21 项通过；PITR 组 5 项未选中。验证使用实际 `resolveUpdaterConfig` 解析生产停用 Web 的配置，没有执行镜像摘要计算或生产更新 |
| 扩展环境清单 | `compose-env.test.ts` 10 项通过、4 项失败，四套 Compose 的 API 清单均缺少既有 `GITHUB_PROVIDER` 声明；本批未改 GitHub Provider 或这些声明，没有补改其他拓扑，也不宣称扩展检查通过 |
| 类型与格式 | updater 的 `tsc --noEmit` 退出 0；四个改动测试文件 Biome 检查通过，部署／测试范围 `git diff --check` 通过。原生 API 桥新增断言后的检查另在收口补记 |

收口补记：增加原生 API 桥示例断言后，重新运行上述四个定向文件，81 项全部通过；同批 updater TypeScript 复查退出 0。格式检查发现新增断言的折行不符合 Biome，按提示修正折行，最终格式检查与文档链接结果见下方交付检查，不把本轮初次格式失败记为通过。

交付检查：四个改动测试文件最终 Biome 检查退出 0；相关源码与 10 份 Markdown 当前差异的 `git diff --check` 通过，新增 ADR 与两个未跟踪覆盖文件无行尾空白；检查这些文档当前新增／改动行的 122 条本地文件及标题链接，全部能解析。检查范围包含其他窗口同文件的既有差异，不把链接总数当作本批独占改动；未检查远端网址。Git 仅提示 PLAN 既有 CRLF 后续将规范为 LF，未改变全仓行尾策略。

实际定向命令为 `node ./node_modules/vitest/vitest.mjs run` 加 `infra/updater/src/{compose-web-threads,caddy-access-log,caddy-deploy-retry,updater-logic}.test.ts` 四个文件并设 `--maxWorkers=1`；生产服务单独运行 `infra/updater/src/compose-service.test.ts`，`-t 'the production computer provider|worker error reporting configuration|the updater compose service'`。花括号仅为文档缩写，PowerShell 实际逐项传入文件。类型检查为 `node ./node_modules/typescript/bin/tsc --noEmit -p infra/updater/tsconfig.json`，没有构建整工作区、安装依赖、迁移、提交或推送。

源码生产配置未整体发布；服务器持久文件仍保留停用 profile 下的历史定义，后续发布前须清理 overlay 中旧服务段并验证合并配置，步骤见 [运维](OPERATIONS.md#删除退役-web2026-11-20)。本次结果不覆盖 iPhone 真机、登录／OAuth／升级、GitHub 或项目模块上线；旧 Web 恢复演练已取消，不能标成执行通过。

## 手机固定导航、GitHub 与模型交付（2026-11-20）

关联 PA-021、PA-022、PA-024；用户要求先设定目标及测评，再按 Stop That Shit 技能实施。用例与设备完成条件见 [专项测评](MOBILE_NAV_GITHUB_EVALUATION.md)。当前窗口独立实施，没有子代理、提交、推送、依赖安装、本机服务启动或全工作区构建。既有授权服务器已完成独立 GitHub 候选、备份、唯一迁移及 API／Worker 切换；不恢复数据或打开项目开关，客户端尚未发布。

| 检查 | 实际结果 |
| --- | --- |
| 首轮手机回归 | 11 文件：232 项通过、2 项失败。失败为应用页 OAuth 测试仍断言旧 `mcp/oauth/begin` 参数与旧回调路径；按现有契约补入 `nativeCallback: true` 与 `/api/mcp/oauth/callback`，没有修改回调安全逻辑 |
| 路由与 OAuth 复测 | 13 文件 251 项通过；另一次移动／服务定向检查 14 文件 160 项通过。两批存在重叠，不相加计数 |
| 导航／模型／GitHub 联合回归 | 22 文件 334 项通过，包含根级三入口、选中与重复点击、模块替换及返回、详情焦点隐藏／恢复、GitHub 安全输入／错误／草稿／范围隔离、模型选择与会话、应用 OAuth、设置链接与首页原有交互，以及 GitHub API／契约／Provider／工具。应用连接详情随后补充回归，收口结果另附 |
| 应用详情与数据库补充收口 | 最后复跑 integrations-screen、main-navigation、settings-sheet、github-screen、row-security 及新 PostgreSQL 文件：5 文件 76 项通过，1 文件／1 项因本机未配数据库而跳过；随后移动端 TypeScript 退出 0。应用连接详情隐藏底栏、页头返回恢复主列表的新增用例通过；其余未改动测试沿用上行证据，不把重叠计数相加 |
| TypeScript | 手机与 db 的 `tsc --noEmit` 退出 0。服务器候选完整 API 及缩小发布入口的检查被 1536 MiB 容器终止（`Killed`），该两次不能算通过。随后从候选镜像导出源码到本机 `.tmp/mobile-github-candidate-source`，SHA-256 核对锁文件与本机依赖一致，仅将现有外部依赖链接入隔离源码、内部 `@rakazo/*` 均指回候选源码；通过候选完整 `apps/api/tsconfig.json` 和 `apps/worker/tsconfig.json`（包括各自测试），未修改工作区源码或重新安装依赖 |
| Biome 与差异 | 20 个本轮手机／数据库测试文件完整 Biome 通过；数据库 `row-security.ts` 的 lint 通过，只插入 GitHub 模型名，未顺带重排旧格式。限定写集 `git diff --check` 通过；Git 提示既有 PLAN 行尾将转 LF，不作为功能失败 |
| 数据库上下文回归 | 本机 `row-security.test.ts` 9 项通过；`github-connections.postgres.test.ts` 未配置数据库时整文件 1 项条件跳过，不启动本机数据库 |
| 生产只读复核 | 2026-11-20：API／Worker 健康，GitHub 连接表不存在，两服务镜像内没有 GitHub 契约源码；210 项已完成迁移、无未结束项，两个项目实验开关均未设置。运行角色非超级用户、非 BYPASSRLS；现有凭据表的系统策略调用 `app_rls_bypass()`，默认表权限已授予运行角色 |
| 独立服务候选 | 从生产 API 镜像 `sha256:62df407f3e70422b79b2bdf80a2a3ab783c51d803159613d00c201a917990698` 筛选原 GitHub 提交 `5bff060a7` 及本轮必要数据库修正，30 文件补丁 SHA-256 `cf7ced78af80087d814e619b5c7ffb5dfd9ac05b5a140f170e676fd0996a7ceb`。未纳入工作区项目目录／会话等修改；生产已含的 env 字段予以保留，旧 RLS 文件仅补 GitHub 模型名。API／Worker 构建通过，新候选标签 `sydney-pa024-github:20261120`，镜像摘要 `sha256:8b8bcb260be90f79da1e689a35230d75730c778170bdd283233692b85d7e8149` |
| 候选离线测试 | 在不挂生产数据卷、不注入凭据、禁网络的临时容器中运行 API GitHub 路由、共享契约、客户端、连接与工具 5 文件 30 项，通过。首试因 node 用户无法写 Vitest 临时配置而退出，改为仅该临时容器内 root 后通过；生产进程用户未改 |
| 真实 PostgreSQL | 15:39（北京时间）候选新增数据库测试 1 项通过：实际运行登录无超级／旁路权限；在 owner 事务中试建 GitHub 表与合成用户，切换到实际运行角色，逐项验证本人可读、另一账号读写不可见、换绑拒绝、伪造旁路密钥拒绝、空上下文不可见、合法系统密钥可读。最终 ROLLBACK；该测试不代表 Prisma 正式迁移或真实 PAT 绑定已完成 |
| 迁移与发布 | 发布前候选迁移源码与 210 项账本 SHA-256 逐项匹配，筛选目录只新增 GitHub，SQL 摘要 `0c3a002b4d54bdbf70d62765bb213741a37a9284cb5f2017e025f091e70535af`。16:03:46—16:04:08（北京时间）完成 2,519,456 字节自定义格式备份并用 `pg_restore --list` 检查可读，备份 SHA-256 `6b121a7ebbf4931371149c2265ef35793e8fe55669f9f7c9c7fbb2801c011f64`；直接 Prisma deploy 只应用 GitHub，账本增加唯一一项至 211。正式覆盖文件仅变更 api／worker／migrate 三个镜像引用，合并配置其余字段逐项相同 |
| 服务切换 | API／Worker 均已运行 `sha256:8b8bcb260be90f79da1e689a35230d75730c778170bdd283233692b85d7e8149` 并健康。因画面回环桥共享 API 网络命名空间，同时重建原桥以重新附着；桥镜像和配置未变。发布前无 queued／running Run 或有效电脑租约；项目表仍不存在、两个实验开关未设置；原生 display／desktop／VNC／noVNC 均 active，未重启这些原生服务 |
| 发布后真实验证 | 16:08 再次完成 PostgreSQL 1 项隔离测试，合成账号全部回滚，新表有两条 RLS 策略、密钥旁路函数和完整运行角色权限，无未结束迁移、无合成用户残留。运行中 API 的 Prisma 在虚构租户上下文读取 GitHub 表成功且可见 0 行。验证脚本首试误用不存在的 `db.close()`，查询已成功但清理时报错；改为现有 `$disconnect()`／`pool.end()` 后整套退出 0，未变更业务源码 |
| 真实 GitHub 与公网 | 运行中 API 的真实 `github` Provider 在无 PAT 时搜索 `octocat/Hello-World` 并读取公开仓库详情及 README 成功，明确 `authenticated=false`；不计真实个人账号／私有仓库／贡献图验收。公网 `/health` 和 `/ready` 为 200，未登录 `POST /rpc/github/status` 为 401，根入口 `/` 仍为 404，没有恢复 Web |
| 手机与发布条件 | USB 只读探针返回设备数 0；当前进程无 Expo 发布令牌，本机 `.expo/state.json` 没有 auth 会话。没有安装 EAS CLI 或重新安装依赖。以 `sideload`／`sydney-ios-ip-1` 查询更新端点，支持的 multipart Accept 请求返回 HTTP 204，无 manifest；初次不支持的 Accept 返回 406，未误记更新成功 |
| 原生兼容差异 | 只读打开旧侧载记录对应的 Run `44298985618` 源 IPA，`Expo.plist` 确认 OTA 启用、`ALWAYS` 启动检查、`sideload` 通道、`sydney-ios-ip-1` runtime，项目 URL 与现有配置一致。相对该构建提交 `0ca3357a5`，移动端依赖、Expo 配置、原生插件／模块、iOS 原生目录和锁文件无 Git 差异。复查 USB 仍为 0，无法读取已安装实例。远程发布工作流未触发 |

联合回归命令：

```powershell
node ./node_modules/vitest/vitest.mjs run --maxWorkers=1 apps/mobile/lib/main-navigation.test.tsx apps/mobile/lib/artifacts-navigation.test.tsx apps/mobile/lib/integrations-screen.test.tsx apps/mobile/lib/settings-sheet.test.ts apps/mobile/lib/settings-layout.test.tsx apps/mobile/lib/use-mcp-oauth-return.test.tsx apps/mobile/lib/github-screen.test.tsx apps/mobile/lib/use-github.test.tsx apps/mobile/lib/github-bot-analysis.test.tsx apps/mobile/lib/chat-model-picker.test.tsx apps/mobile/lib/thread-composer.test.tsx apps/mobile/lib/thread-route.test.tsx apps/mobile/lib/chat-title-avatar.test.tsx apps/mobile/lib/account-screen.test.tsx apps/mobile/lib/inbox-render.test.tsx apps/mobile/lib/unread-jump-overlay.test.tsx apps/api/src/github-router.test.ts packages/contracts/src/github.test.ts packages/adapters/src/github-client.test.ts packages/adapters/src/github-connections.test.ts packages/adapters/src/github-tools.test.ts packages/adapters/src/github-webhook-emulator.test.ts
```

尚未执行：真实 GitHub PAT／个人主页与私有仓库联调、OTA／IPA 发布、当前 iPhone runtime 与更新生效、布局／安全区／语音／键盘真机测评及本轮实际回退。模型设置扩展的 3 项失败已通过下方补测解决。整体手机交付目标保持未完成。

同日 OTA 候选核验。在脱离分支的 `.tmp/mobile-ota-candidate` 以 `0ca3357a5` 为基线复现旧底座的 lockfile 与原生配置，只选本轮手机导航、GitHub、应用回跳与模型改动。候选补丁以干净 Git 索引重放，重放后的二进制 diff 与原补丁完全一致。共享文件未夹带项目目录／会话或 UI 换肤写集。34 文件、SHA-256 `807fffcfa7d0a6968a014d7e1fdd7ab48079230fe60226e9ab8e58ff0216a6db`。附带已有设备设置路由分类和启动代码的类型收窄，启动空值和 UI 颜色类型使用对应测试夹具调整。

候选单 worker 移动端回归先修正设备设置路由分类，再测 19 文件 665 项通过、1 项失败。剩余失败为旧启动断言仍将空字符串视为错误。仅同步基线已实现的 null／空串回退行为后，`api.test.ts` 和 `settings-sheet.test.ts` 共 341 项通过，其余文件沿用 19 文件联合结果。TypeScript 通过，32 个受影响现存文件 Biome 检查通过。`api.test.ts` 保留基线的旧导入顺序、格式与一个未使用参数告警，差异检查通过。Expo CLI 在离线模式读取公开配置，输出的 bundle `xin.zxlup.sydney`、项目、更新 URL、runtime `sydney-ios-ip-1` 及通道 `sideload` 与旧源 IPA 一致。

使用现有 Expo CLI、同配置、单 worker 执行 `expo export --platform ios --max-workers 1 --dump-assetmap`，离线导出 `.tmp/mobile-ota-ios-export`。Metro 打包 3,639 个模块并退出 0。`metadata.json` 只描述 iOS，所指的 55 项资源均在目录内且非空。Hermes bundle 为 12,542,876 字节，SHA-256 `0fa5dc3ea10d0f5f22b92db2957f591b976deadb9846a56b38a3447d38e34b87`，头部 magic 和版本 `98` 与 Run `44298985618` 源 IPA 的嵌入字节码相同。未安装依赖、构建原生包或发布。

后续 USB 探针确认 iOS `27.0.1` 已连接，未挂载开发者镜像。基于安装代理和唯一匹配当前设备的 iPASide 记录，确认 Sydney `1.0.12` 构建 `1`；签名后的标识与未签源包不同，按未签标识精确查询为空。对应记录的源 IPA SHA-256 匹配 Run `44298985618`。此证据核对设备安装与记录，尚未读取运行中的 Expo runtime／updateId。更新服务同参数复查两次均为 404，响应明确报告项目中没有 `sideload` 通道，当前仍无认证执行通道管理及发布。

签名侧载备选：保持相同隔离源码、Expo 项目和 runtime，使用 `expo export:embed --platform ios --dev false --entry-file index.ts --bytecode --max-workers 1` 生成 `main.jsbundle` 及资源，使用同版 `expo-updates` 的原生构建清单生成器生成 `EXUpdates.bundle/app.manifest`。嵌入更新标识 `e9c9be2d-4cc4-4ea4-8fe7-b8b8773d930e`，Hermes 版本 `98`，字节码 SHA-256 `4e9d2abc5259edc5736abe8e82c0457e287bfd0cc3360a1201f9254e4781938c`。三栏、GitHub RPC、空间默认字节码标记存在，54 条清单均定位于 52 个非空资源文件，9 个目录均有 bundle 引用。旧包已有 `clear-icon.png` 和 `close-icon.png` 两组同路径别名，新包的别名哈希集合相同。

组装基于 SHA-256 已固定的 Run `44298985618` 未签名 IPA。替换嵌入 bundle、清单和资源，`Info.plist` 只把构建号变为 `2`。首次验证因原 ZIP 条目对象被写入修改而失败，复制条目后复测通过。最终产物 `.tmp/Sydney-1.0.12-2-unsigned.ipa`，SHA-256 `1c443d7ae38d844b99e848572ce8635185e3a21dbe8a71abd26bdc857a477c6c`。ZIP 完整、无重复条目、最长路径 122 字符，保留的 101 个归档项逐项与原包的内容一致，包括原生二进制、框架与 `Expo.plist`。本包缺个人签名与描述文件，尚无 iPhone 上的构建 `2` 或嵌入更新标识。OTA 通道同步复查依旧 404。

恢复目标后复查：首次 USB 查询无设备，随后识别 iOS `27.0.1`。安装代理仍只返回 Sydney `1.0.12` 构建 `1`，与当前设备的旧侧载记录一致。构建 `2` 未签名 IPA 和候选补丁摘要仍与上述记录一致。Expo 返回 404，确认 `sideload` 通道仍不存在，本机无发布令牌和 EAS CLI。等待个人签名覆盖安装或获得 Expo 发布条件，真机用例仍待执行。

追加 GitHub 后台加载修复：用户报告构建 `2` 已安装，GitHub 绑定成功，但点击操作会触发下拉动画。将 `RefreshControl` 的状态与一般读取分离，只有主动下拉才显示该指示，筛选请求继续保留旧结果。运行 `node ./node_modules/vitest/vitest.mjs run --maxWorkers=1` 定向检查 `use-github`、`github-screen`、`github-bot-analysis`、`main-navigation`，4 文件 42 项通过。4 个修改文件的 Biome 检查通过。隔离手机候选 TypeScript 通过；共享工作区的移动端 TypeScript 仍在并行项目会话文件 `app/projects/[workspaceId]/chat.tsx:140` 报参数类型不符，未纳入本批改动或构建。

在构建 `2` 的隔离源码追加上述四个文件，离线导出嵌入包，并使用同版本 Expo 工具生成嵌入清单。最初字符串探针误以为通用的 `pullToRefresh` 仅出现在新包，实际旧包也包含该名称，废弃此断言，改用候选源码内容比对及归档逐项核对。生成 `D:/33054/sydney-ipa-output/Sydney-1.0.12-3-unsigned.ipa`，26,002,317 字节，SHA-256 `7e545757e485a062e94c5f40dcda4fae2e8a6b02c815f054af49fd7c7b11e207`。嵌入更新 ID `fa21155e-4e4b-49fe-ba1a-fbad7d072249`。相较构建 `2`，只有嵌入 JS、更新清单和构建号条目发生变化，52 个资源、Hermes 版本和 Expo 配置均匹配。构建 `3` 未签名、安装或发布 OTA，iPhone 滚动和刷新手势待复测。

## 手机真机体验追加目标（2026-11-20）

按 [专项测评](MOBILE_NAV_GITHUB_EVALUATION.md#真机体验追加目标) 验证 GitHub 状态回显、本人头像、双方磨砂气泡、半屏模型选择和项目候选。使用现有 Node 24 与单 worker Vitest。首次使用 PATH 中的 Node 22.14.0 时，jsdom worker 因 undici 启动失败；改用本机 Node 24 后成功。账户页首轮测试缺少相册替身，按实际界面补齐。并行项目产物接线曾导致项目测试夹具和类型失败，随后对齐并复测，未计入成功数。

| 检查 | 实际结果 |
| --- | --- |
| 联合回归 | 12 文件 501 项通过，覆盖 GitHub 页面及 hook、集成缓存、账号设置、模型选择、消息外观、发送者气泡、手机 API、手机项目页与 hook、项目路由及共享项目会话 |
| 磁盘缓存补测 | `integrations-cache.test.ts` 14 项通过，包含 GitHub 状态写入、同账号同空间读回、隔离、剥除多余凭据字段及断开覆盖。与联合回归部分重叠，不相加 |
| 类型和静态检查 | `tsc --noEmit -p apps/mobile/tsconfig.json` 和对应 API 检查退出 0。追加客户端文件 Biome 完整检查通过，部分共享文件范围限定 lint 通过 |
| 交付状态 | 没有操作数据库、启用项目生产开关、部署头像 API、生成新 IPA 或发布 OTA。没有实测相册、缓存冷启动、玻璃效果、模型半屏、项目 Worker 或手机会话闭环 |

## 手机构建 4 与项目只读复核（2026-11-20）

| 检查 | 实际结果 |
| --- | --- |
| 构建候选 | 以构建 `3` 的隔离源码加 GitHub 状态缓存、个人相册头像、磨砂气泡及对话内半屏选择。设置首页与账号页复用头像读取；旧版 `me` 省略字段时通过现有会话回读，并核对返回用户。并行换肤与项目会话候选未混入。可重放补丁 `.tmp/mobile-experience-4-20261120.patch` 共 196,984 字节，SHA-256 `15718f1339aaee0e1186296d1d8c809d535b313d8c8ac4922785d7118892ca95`，在该候选执行反向应用检查通过 |
| 离线回归 | 隔离候选 10 文件 490 项通过，包含旧后台头像回显、错误用户拒绝及已有导航与 GitHub 流程。主工作区另有 7 文件 413 项通过，覆盖项目气泡、客户端作用域、项目会话 API、草稿和发送确认。两批包含重叠用例，分别记录。主工作区与隔离候选移动端 TypeScript 均通过。头像相关四文件完整 Biome 通过，项目页面与测试保留并行改动的既有格式，限定非格式检查通过 |
| 包体验证 | `D:/33054/sydney-ipa-output/Sydney-1.0.12-4-unsigned.ipa`，25,999,366 字节，SHA-256 `35305d0e9d3f8315fd68cfd285e4ac4a1749eb330f369f93ac82b73b549965b9`，嵌入更新 ID `933293db-3013-461e-af07-b52dec28133f`。ZIP 完整，54 条清单引用 52 个资源，Hermes 98，Expo runtime `sydney-ios-ip-1`。与构建 `3` 逐项比对，仅嵌入 JS、清单和构建号变化 |
| 项目只读复核 | 真实生产 API 和 Worker 均健康，账本 211 项已完成、0 项未结束，`project_workspaces` 不存在，两个项目开关均未设置。实际迁移、真实运行角色测试、Worker 执行及项目 A／B／首页隔离待执行 |
| 设备与 OTA | USB 只读 InstallationProxy 确认一台 iPhone 上装有 Sydney `1.0.12` 构建 `2`。构建 `4` 未签名、未安装，OTA 未发布。相册授权、覆盖后的冷启动、视觉效果和会话操作继续待 iPhone 实测 |

## 手机构建 4 OTA 发布准备（2026-11-20）

通过现有 Expo CLI 从构建 `4` 隔离源码导出 `.tmp/mobile-experience-4-ios-ota`。`metadata.json` 引用的 55 个资源均存在且非空，JS 含候选的 GitHub 状态缓存与头像会话回读，Hermes 98，与构建 `4` IPA 的字节码头匹配。OTA bundle SHA-256 `b2a34b1ebd6d5b07ee67ec898e2c185fd4f3cd797844a3c61a726125a8b3b482`。以安装包配置查询 Expo，`sideload` 返回 404 并明确提示通道不存在。

用户授权后，隔离候选提交 `bf5638ab7` 快进推送至 `cursor/integrate-remote-branches-7334`。对应的 `mobile-ios-update.yml` Run `44748053276` 运行完成并成功。构建 `4` 的原生 channel、runtime 和嵌入标识请求 Expo 获 HTTP 200，返回 `01a1f93c-8582-79e0-8919-a24122ab145c`，发布时间北京时间 2026-11-20 21:54:15，包含 55 项资源。普通 HTTP 探针首次读取 CDN 主程序返回 403，按 manifest `extensions.assetRequestHeaders` 补齐 Expo iOS 客户端所用的资源请求头后，下载成功。主程序 10,511,588 字节，Hermes 98，候选功能标记和清单 SHA-256 核验通过。

按清单下载的 55 个资源逐个核对 SHA-256，全部通过。USB 只读确认目标 iPhone 已安装 Sydney `1.0.12` 构建 `4`。设备实际下载、重启及账号页运行标识 `sideload 01a1f93c` 仍待确认。主工作区其他文件未进入该提交。

## 手机 1.0.13 版本与更新说明（2026-11-20）

主工作区与从 `bf5638ab7` 筛选的手机候选分别运行账号设置、客户端更新、版本号和 Expo 配置测试，两次各 79 项通过，移动端 TypeScript 均通过。本轮 13 个改动源码与测试文件经 Biome 检查通过。覆盖实际下载清单、旧清单缺少说明回退、下载失败不提示重启和设置中的版本与说明。

Expo 公开配置保留原生版本 `1.0.12`、通道 `sideload`、runtime `sydney-ios-ip-1`，附带应用发布版本 `1.0.13` 和简体中文、繁体中文、英文说明。隔离 iOS 导出 `.tmp/sydney-1.0.13-ios-ota`，Hermes 98，55 个引用资源均存在。字节码带版本说明解析与下载标题，SHA-256 `0e93c9d16e1c4fdfb60faef7c00cc02d88304794b4b6f99c95b010957bd5b28a`。

用户授权后，隔离提交 `40328e108` 快进推送至 `cursor/integrate-remote-branches-7334`。GitHub Actions `44750564292` 发布成功。按已安装的构建 `4` 请求，Expo 返回 HTTP 200、更新标识 `01a1f94b-6b80-7974-88ca-88494c9f622a` 和 runtime `sydney-ios-ip-1`，发布时间为北京时间 2026-11-20 22:10:31。清单版本 `1.0.13`、发布日期及三种语言的完整说明与源码配置一致。线上 Hermes 98 启动包共 10,420,340 字节，SHA-256 `de4f087bb017c9df9ac3e5e997c3a240c37a78a63211d8219ad6f1cf6d3a746e`，与清单一致。55 项资源逐项下载并通过 SHA-256 校验。真机下载、重启、版本说明和运行标识待核对。

## 手机启动更新提示与关于（2026-11-20）

Node 24 下合跑更新流程、版本号、Expo 配置、账号设置和设置导航共 5 个 Vitest 文件，89 项通过。覆盖启动和回前台检查只读清单、每条更新仅自动提示一次、取消不下载、设置可再打开、下载失败不提供重启、下载和重启各自确认、已缓存版本及「关于」显示当前运行版本。移动端 `tsc --noEmit` 和 11 个相关文件的 Biome 检查通过。

从现有构建 `4` 的 IPA 读取到 `EXUpdatesCheckOnLaunch = ALWAYS`。使用 Expo 公开配置与本机已安装的 iOS 配置插件离线生成新版 plist 字段，验证 `EXUpdatesEnabled = true`、`EXUpdatesCheckOnLaunch = NEVER`、通道 `sideload` 与 runtime `sydney-ios-ip-1`。尚未生成新版 IPA、推送 OTA 或在手机上验证弹窗及重启。

恢复目标后以已推送的 `633f5d019` 合跑导航、应用、GitHub、项目会话、模型、账号和更新相关 12 个文件，251 项通过，移动端 TypeScript 通过。生产 API 健康检查返回 HTTP 200。按构建 `4` 复查已发布 `1.0.13` 清单、启动包和 55 项资源，哈希一致。Windows 枚举到 iPhone，但 USB 应用安装代理所需的设备列表为空，本次未取得运行中的更新标识或应用界面证据。

集成分支提交 `633f5d019` 的 iOS 工作流 `44753557596` 已成功。核对下载归档的 GitHub SHA-256 和归档内原始 IPA 的 SHA-256 后，将未签名包的 `CFBundleVersion` 调整为 `5`。除 `Info.plist` 外各 ZIP 条目的 CRC 一致，完整性校验通过。新包为 `D:/33054/sydney-ipa-output/Sydney-1.0.12-5-unsigned.ipa`，26,062,610 字节，SHA-256 `b17be95126e3bfb1a90e04b40c8d5c7d3e8daa07f1856741c484f7cbfc41ab54`。实际 IPA 的 `EXUpdatesCheckOnLaunch` 为 `NEVER`，原生标识、Expo URL、`sideload` 和 `sydney-ios-ip-1` 与构建 `4` 一致。内嵌应用显示版本为 `1.0.13`，更新标识 `9d454355-48d2-4dcd-939f-b71daf107d31`，52 个资源路径存在，最长 ZIP 路径 122 字符，Hermes 版本与构建 `4` 匹配。包交付后再次只读查询，USB 设备列表仍为空。签名、覆盖安装、下一条 OTA 及手机端实际运行待验。

使用构建 `5` 的嵌入标识查询 Expo 返回 HTTP 200，清单 ID 仍为 `01a1f94b-6b80-7974-88ca-88494c9f622a`。其发布时间早于构建 `5` 的内嵌清单。手机安装这份 IPA 后可用内嵌版本验收导航、GitHub 和模型，更新弹窗验收需要更新的清单。Windows 当前识别到的 iPhone 记录属于蓝牙设备类。

## 手机 1.0.14 OTA 候选（2026-11-20）

以 `633f5d019` 的手机源码准备 `1.0.14` 和简中、繁中、英文更新说明。Expo 配置、客户端更新、账号、版本和设置布局共 5 个文件 89 项通过，发布配置的 Biome 检查通过。按构建 `5` 的 Expo 项目配置执行单 worker iOS 导出，输出至 `.tmp/sydney-1.0.14-ios-ota`。构建类型为 iOS，55 项清单资源均存在且非空。启动包含更新提示和重启动作，Hermes `98` 与构建 `5` 一致，SHA-256 为 `1204f82b0406a27ddea9f18fff38a711cd9952d90982ac02e1a2a1d1bde18655`。Expo 公开配置中的应用版本、三种语言说明、侧载标识、通道 `sideload` 及 runtime `sydney-ios-ip-1` 均匹配预期。

GitHub Actions Run [`44759982614`](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44759982614) 从 `1960b1745ac10bc7f0f2172323607b9b84a9c13c` 成功发布到 iOS `sideload` 通道。分别使用构建 `4` 和 `5` 的原生配置和嵌入标识请求 Expo，均返回 HTTP `200`。清单 ID 为 `01a1f981-2406-79a4-b79c-2b760ff2bb47`，创建于北京时间 2026-11-20 23:09:12，晚于两份 IPA 的内嵌清单。核对 `sydney-ios-ip-1`、`1.0.14`、发布日期和三种语言说明，验证 Hermes 启动包及 55 项资源的 SHA-256 均与清单一致。线上启动包 SHA-256 为 `0228dc6e7f22c761e22841522b6f3016c14a25bc9d8fa6f9f45fdfd078ae53dd`。

Apple 设备服务正常运行，连续三轮查询返回 USB 和网络设备数均为 `0`，Windows 只枚举到蓝牙 iPhone。构建 `5` 的签名覆盖安装、首次提示及下载重启交互、设备中的实际运行版本和 OTA 标识待验证。手机目标已记录为受阻，等设备可连接后继续验收。

用户随后确认手机已热更新至 `1.0.14`。同期 Apple 设备服务仍返回 USB 和网络设备数均为 `0`。运行版本来自用户实测，设备端 OTA 标识、原生构建号及更新弹窗交互仍待核对。

## 手机 GitHub 重进回显

PA-024／G08：用户在 `1.0.14` 报告退出再进入 GitHub 后仍需等待。源码确认原缓存只保存连接状态，默认个人主页在路由卸载后重新请求。补修使用现有内存查询缓存，首帧回显同范围的连接和默认主页，在后台更新；退出登录清除缓存，空间切换不复用，连接变化、失效或解绑清除旧主页。原有磁盘缓存仍只存连接状态。

Node `24.22.3` 限单 worker 执行 `use-github`、`github-screen`、`integrations-cache`、`query` 四个测试文件，38 项通过。覆盖卸载后重进且状态与主页请求都未完成、后台数据替换、不同空间隔离与不同 GitHub 连接清除旧主页。发布前加入 `app-config`、`app-version` 和 `client-update`，共 7 个文件 92 项通过。移动端 TypeScript 和 3 个补丁文件的 Biome 检查通过。

GitHub Actions Run [`44770957767`](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44770957767) 从提交 `b96d347bd6b44698a7a825f8fb0502373e380167` 成功发布 `1.0.15`。按构建 `4` 和 `5` 查询均返回 HTTP `200`，更新标识 `01a1f9bc-fe7b-7477-a437-0f302f403c2f`，创建于北京时间 2026-11-21 00:14:35，晚于两份 IPA 的内嵌清单和 `1.0.14` 线上清单。核对 `sideload`、`sydney-ios-ip-1`、三语说明、Hermes 启动包及 55 项资源哈希。启动包 SHA-256 为 `ce7654042c2379411cbc59470404828dcef47579375a373672a062f46993b820`。

发布后用户反馈 GitHub 重进体验可以了，记录为重进等待问题通过用户复测。未单独核对手机显示的运行版本、OTA 标识、主动下拉、冷启动或账号切换。

后续 iOS `1.0.16` 发布记录：工作流 [`44776686746`](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/44776686746) 从 `ecd12301cee206aa88ca3c39914276b5124ed9d7` 成功发布。发布源码保留 `1.0.15` 的 GitHub 重进实现；本次影响底栏与聊天输入栏的改动限于视觉和无障碍状态。分别按构建 `4`、`5` 请求 `sideload`、`sydney-ios-ip-1`，均获得 HTTP `200` 和更新 `01a1f9db-d79d-7d5b-bdb9-9c5e93ecbf66`，三语说明与源码一致，启动包和 55 项资源哈希通过。Apple 设备服务返回 USB 和网络设备数均为 `0`，没有据此判定手机已更新到 `1.0.16` 或新增真机通过项。

## 本机项目目录授权绑定（2026-11-20）

范围：PA-022／P2 的 Windows 本机目录候选、PC／手机共享状态与撤销；当前窗口独立实施，不调用子代理。使用已有 Windows 工作区依赖和单 Worker Vitest，不启动本机数据库、Docker 或桌面服务，不安装依赖，不执行生产操作。测试使用合成账号、目录与设备；原生对话框和生产连接未实测。

| 检查 | 实际结果与边界 |
| --- | --- |
| 收口定向回归 | 17 文件：16 通过、1 条件跳过；245 项通过、5 项跳过、0 失败。包含原生选择／作用域变化／冲突清理、独立目录配对、旧配对更新、预加载桥、真实私有 grant 存储、窗口权限、严格契约、数据库查询替身、API 身份与会话匹配、双端状态／撤销、设备连接和跨进程转发；不代表真实设备或 PostgreSQL 通过 |
| 真实数据库候选 | 新增 `project-directory.postgres.test.ts` 的 5 项：运行角色 RLS、同用户跨项目／首页及跨用户拒绝、幂等绑定与换绑拒绝、设备所有者外键、绑定项目删除限制及条件撤销。未提供授权服务器的数据库验证上下文，因此整个文件跳过，未启动本机数据库 |
| TypeScript | `node ./node_modules/typescript/bin/tsc --noEmit -p` 分别检查 contracts、db、adapters、api、desktop、web、mobile 的 `tsconfig.json`，7 项均退出 0；最后补齐旧配对更新后，桌面 TypeScript 和两文件 lint 再次通过。没有构建或生成客户端安装包 |
| Prisma 模型 | 在 `packages/db` 通过已有 `node_modules/.bin/prisma.cmd validate`，最终退出 0。首次校验提示一对一关系缺少完整复合唯一键，已同步补入模型和迁移索引后复测通过；没有运行 generate 或 migrate |
| 工具与格式限制 | 最初 `pnpm --filter @rakazo/db exec prisma validate` 被现有引擎检查拒绝：本机 Node 22.22.0 低于仓库要求的 22.22.2；未修改引擎要求或安装依赖，改用既有 Prisma 入口完成静态校验。新增 16 文件完整 Biome 通过；既有 24 文件关闭 formatter／assist 后 lint 通过。`Projects.tsx` 原创建表单的自定义 Input label 和混合类型导入仍有两条 lint 诊断，不为本批目录接线重排或改写原创建表单，不计该文件全量 lint 通过。首次新文件检查的生成器与控制字符规则已修正，未跳过新文件规则 |
| 运行边界 | 本批仍保留 P1 文字工具限制、项目数据库禁写 CHECK 和关闭的生产开关；目录存在性／规范路径检查不构成项目文件读取或执行验收。此前 P1 扩展回归的 8 项定时上下文失败未在本批修复，也未用本批测试替代 |

交付前检查本批 10 份相关 Markdown 当前 diff 新增的 106 条本地文件／标题链接，全部能解析；未检查远端网址。43 个相关源码／迁移／模型文件及上述文档的范围限定 `git diff --check` 退出 0，另检查 17 个未跟踪新增源码／迁移文件无行尾空白。范围不扩展到其他窗口的全部未提交写集。

收口实际命令（仓库根目录）：

```powershell
pnpm exec vitest run apps/desktop/src/project-directory.test.ts apps/desktop/src/user-device.test.ts apps/desktop/src/preload.test.ts apps/desktop/src/workspace-grants.test.ts apps/desktop/src/session-permissions.test.ts packages/contracts/src/project-directory.test.ts packages/db/src/project-directory.test.ts packages/db/src/project-directory.postgres.test.ts packages/db/src/project-workspace-read.test.ts apps/api/src/project-directories.test.ts apps/api/src/routes/project-workspaces.test.ts apps/api/src/routes/project-workspace-thread.test.ts apps/mobile/lib/use-project-directory.test.tsx apps/web/src/pages/ProjectDirectory.test.tsx packages/adapters/src/user-device-client.test.ts packages/adapters/src/user-device-gateway.test.ts packages/adapters/src/user-device-emulator.test.ts --maxWorkers=1
```

早期 6 文件 73 项、后续 3 文件 34 项、中间综合 171 项及补齐旧配对前的 244 项均已有通过结果，均被最后 245 项收口范围覆盖，不相加计数。补查发现旧本机配对可能缺少 userId／deviceId，最初无法进入可信目录范围；已在用户明确选择目录时撤销旧 token、串行清理旧配对后重新配对，不改变整机授权，增加对应回归并复测上述完整范围。待验：真实 PostgreSQL 迁移及 RLS、Windows OS 选择／重启与撤权、iPhone 前后台与离线状态、真实账号切换、生产双端安装、云电脑目录绑定、项目文件执行链；对应步骤见 [目录测评](ACCEPTANCE.md#本机项目目录授权pa-022) 和 [候选运维](OPERATIONS.md#本机项目目录候选)。

## 手机会话模型显示与切换（2026-11-20）

PA-021 的 Windows 工作区离线验证。`chat-model-picker.test.tsx`、`thread-composer.test.tsx`、`thread-route.test.tsx` 与 `chat-title-avatar.test.tsx` 共 147 项通过。覆盖 Bot 信息未到时解析空间默认模型、当前项标记、切换与恢复继承、缓存先于返回更新、保存失败、重复点击、保存期间离开，以及打开选择页保留输入草稿。移动端 TypeScript 与 7 个修改的源码／测试文件 Biome 检查通过。

`1.0.16` 续验：核对本地与发布提交 `ecd12301c` 的默认模型解析、会话入口、选择页及原生路由配置一致。Node `24.22.3` 使用单 worker 复跑 `chat-model-picker.test.tsx` 和 `thread-route.test.tsx`，67 项通过。iOS 配置声明半屏选择页；「默芯」取自当前空间的模型配置，不是客户端写死的名称。设备服务本轮未枚举到 iPhone，实际默认名称、半屏显示和切换后草稿仍待用户复测。

扩展加入 `model-settings.test.tsx` 时，5 文件共 171 项通过、3 项失败。失败集中于模型设置的「添加备用模型」连接选项及指定空间的供应商跳转，相关设置页和测试文件本轮未修改。未运行改动前的对照。尚未生成 IPA／OTA 或执行 iPhone 真机验收。

同日补测时，单跑 `model-settings.test.tsx` 复现 24 项通过、3 项失败。提交 `e3a16f580` 已将新增连接改为账号设置直接打开自定义 OpenAI 兼容表单，旧预设选项和跳转断言因此失效。更新测试和目录夹具，验证已有连接／部署提供的候选、账号表单无预填端点，以及 `models/setRole` 在目标 Space 请求上下文中保存备用模型。业务源码未改。以单 worker 合跑上述 5 文件，174 项通过；移动端 TypeScript、所改测试 Biome 及限定写集差异检查通过。另复查 USB 无设备，当前进程无 Expo 发布令牌及 EAS CLI，`sideload` 更新请求仍返回 204，响应体为空。

## 项目文字任务执行边界（2026-11-20）

范围：PA-022 的 P1 Worker 文字会话权限。当前 Windows 工作区、既有依赖、Vitest 单 Worker；没有启动数据库／服务、安装依赖、执行全量构建或生产操作。实现按持久 Run 项目标识区分首页与项目，不以界面显示、提示词或请求参数建立目录授权。

| 检查 | 实际结果 |
| --- | --- |
| 首批定向回归 | `run-project-policy.test.ts`、`run-tools.test.ts`、`executor-lazy-computer.test.ts` 共 3 文件 91 项通过；后续增加运行时／审批恢复用例，以收口结果为准 |
| 扩展执行器与首页兼容 | 13 文件共 332 项：324 通过、8 失败。失败均在 `executor.test.ts` 的定时唤醒用例，`run-routines.ts:230` 调用归属解析时没有数据库租户上下文，抛出 `IsolationError`。定时唤醒实现、归属解析和该测试文件均未修改；本轮未修复这些用例，也未运行改动前的完整对照，不能宣称整套回归通过 |
| 收口定向回归 | `run-project-policy.test.ts`、`run-tools.test.ts`、`executor-lazy-computer.test.ts`、`strategic-initiative-run.test.ts`、`executor-approval-replay.test.ts` 共 5 文件 120 项通过。覆盖文字工具及自身身份字段白名单、首页工具保留、原调用与旧审批恢复拒绝、电脑切换中继续文字回复、无租约／环境探测／插件发现／共享上下文、直接文件请求拒绝、脚本运行器不打开流、接管／助手事件拒绝及脚本文件／两类记忆不提交 |
| TypeScript | `node ./node_modules/typescript/bin/tsc --noEmit -p packages/adapters/tsconfig.json` 最后退出 0。接线期间先修正 MCP 原生运行参数的禁用值（应为 `undefined`，不能传数组），再修正新增测试的脚本字段（`assistant`）；此前两次类型失败不作通过证据 |
| 格式与 lint | 9 个本批文件完整 Biome 检查通过；`run-tools.ts` 仅执行关闭 formatter 的 lint 检查并通过。该文件原有托管任务块不符合 formatter 输出，保留其既有排版，未顺带重排。未检查全仓格式 |
| 数据库、发布与设备 | 未运行 PostgreSQL 集成、迁移、真实模型／Worker 项目闭环、PAT 或设备验收。项目 CHECK 与生产开关未改；没有构建／发布 Windows、IPA 或 OTA，不计 P1 整体完成 |

扩展回归另含：`executor.test.ts`、`builtin-tool-bridge.test.ts`、`github-tools.test.ts`、`native-computer-tools.test.ts`、`packages/db/src/history-retrieval.test.ts`、`memory-context.test.ts`、`background-job-handlers.test.ts`、`executor-mcp-session.test.ts`、`executor-start-timing.test.ts`，以及上述收口范围的前四个文件。各批有重叠，不能把 91、324 和 120 相加当作不同用例总数。

交付前检查 10 份相关 Markdown 当前改动中新增的 70 条本地文件／标题链接，均可解析；本批已跟踪代码与相关文档的 `git diff --check` 退出 0，仅提示 PLAN 既有 CRLF 将规范为 LF。检查不覆盖远端网址可用性。完整的项目隔离验收仍按 [测评清单](ACCEPTANCE.md#项目基础文字会话pa-022) 和 [运维边界](OPERATIONS.md#项目文字执行候选的权限范围) 继续。

## GitHub 与项目会话续作（2026-11-20）

范围：PA-022、PA-024 追加目标的离线实施。当前窗口复核既有 PC／API／GitHub 只读工具，新增手机原生 GitHub 与分析草稿，接入双端项目文字会话和共享状态，并同步实际发布依赖。运行环境为当前 Windows 工作区及既有依赖，Vitest 单 Worker；不启动服务、Docker 或数据库，不安装依赖，不执行全工作区构建、提交或推送。生产只读基线沿用本日上一轮记录：GitHub 连接表、项目元数据表不存在，两项目实验开关未配置；本轮未再次变更生产。

| 检查 | 实际结果 |
| --- | --- |
| 既有 GitHub 回归 | 15 文件首轮：14 文件 197 项通过，仓库检索／速览组件文件 6 项因测试缺少实际 `@lingui/react` Provider 失败。保留界面源码，仅补真实 I18nProvider 后，该文件 6 项单独复测通过；修正后的复测仅覆盖该文件 |
| 新增手机 GitHub | 3 文件 19 项通过，覆盖 scope 固定、匿名搜索、PAT 校验与绑定解绑、筛选分页、离焦取消、旧详情忽略、隐藏私有及撤销清缓存；页面覆盖密文输入与离焦清空、外部 HTML 只显示文字、重试／解绑；分析草稿覆盖验证 Bot、保留旧稿、存储失败、账号切换与空名单 |
| 项目及相关导航综合回归 | 19 文件首轮 475 项通过、8 项失败。失败集中在设置布局替身未提供 `locale`（7 项），及原设置注册表遗漏已有 `devices`／新 `ui-mode` 页面（1 项）。补齐替身、两条注册项，并增加 GitHub 根路由先关闭设置页的用例后，两文件 18 项复测通过。未变更的另外 17 文件 466 项继续使用首轮通过证据；合计 19 文件 484 个不同用例均有通过结果，修正后仅重跑这两个受影响文件 |
| 项目核心与双端 | 上述综合范围含共享会话 11 项、手机传输 5 项、手机页面 4 项和桌面页面 6 项。覆盖项目／群目标、旧账号及旧流忽略、慢快照不回退、文本渲染、授权确认不自动发送、重复提交、未知结果 nonce 复用、手机离焦回焦以及读断线重连；API 项目门禁、范围恢复和授权、数据库元数据／上下文替身、Worker 持久范围与共享记忆排除亦在综合范围。收口补齐读取明确拒绝后清除快照及授权显示，上述 4 文件 26 项再次复测通过，核心 TypeScript 与两文件 Biome 复核退出 0 |
| 移动 API 旧断言调整 | 更早一轮因空服务器设置仍断言应拒绝而出现 1 项失败。现有逻辑已将空设置视为默认地址，本轮只调整测试：保留存储不可读／非法地址拒绝，分别新增 null／空串回退默认地址；后续完整 API 文件通过。另补项目授权提示中取消后不得继续授权／发送，并将取消信号传入项目授权子请求 |
| TypeScript | `apps/mobile/tsconfig.json`、`apps/web/tsconfig.json`、`packages/core/tsconfig.json` 的 `tsc --noEmit` 均退出 0。新页面、RPC 参数及共享状态使用现有契约；未用构建或设备运行代替类型证据 |
| Biome | 21 个明确指定的新文件／已格式化的改动文件检查退出 0；不对原有整份未格式化的 `Projects.tsx` 或大型 API 测试进行全局格式重写 |
| 文档链接及空白 | 检查 11 份本轮相关 Markdown 改动中新增的 67 条本地链接／标题锚点，均能解析到文件或标题。`git diff --check` 退出 0；Git 仅提示 PLAN 现有 CRLF 将规范为 LF，未改变行尾策略 |
| 实际数据库与生产 | 未运行 PostgreSQL 集成测试、迁移或禁写解除；没有执行真实 GitHub PAT、模型／Worker 项目闭环或两个真实项目的数据库隔离测试。Windows／iPhone 尚未安装本轮代码，未做真机布局或升级验收 |

综合用例文件为：

- `packages/core/src/project-thread-session.test.ts`；`packages/contracts/src/project-workspace.test.ts`。
- `apps/mobile/lib/{use-project-thread.test.tsx,project-chat-screen.test.tsx,api.test.ts,use-github.test.tsx,github-screen.test.tsx,github-bot-analysis.test.tsx,settings-sheet.test.ts,settings-layout.test.tsx,project-workspace-list.test.tsx}`。
- `apps/web/src/pages/ProjectThread.test.tsx`；`apps/api/src/routes/{project-workspaces.test.ts,project-workspace-thread.test.ts,context-project-stream.test.ts}`。
- `packages/db/src/{project-workspace-read.test.ts,project-workspace-context.test.ts}`；`packages/adapters/src/{background-job-handlers.test.ts,memory-context.test.ts}`。

实际命令使用现有 `node ./node_modules/vitest/vitest.mjs run <上述逐项文件> --maxWorkers=1`；类型检查为 `node ./node_modules/typescript/bin/tsc --noEmit -p <对应 tsconfig>`。本节聚合经过整理的结果，不保存原始测试输出或个人数据。

当前缺口：项目资源迁移仍有明确非空禁写 CHECK，目录授权／后台绑定／真实连接状态未接通，项目高级操作和较早历史分页未实施。项目草稿及未确认发送状态只在当前页面生命周期保留，不承诺跨路由销毁／重启恢复。GitHub 手机速览为原生可选中文本，未实现桌面式 Markdown 抽屉或悬停，不据此推定双端视觉相同。部署筛选与回退边界见 [运维方案](OPERATIONS.md#github-与项目工作区发布边界2026-11-20)，各项测评见 [验收清单](ACCEPTANCE.md#项目基础文字会话pa-022)。

## PA-023 云电脑画面全覆盖修复（2026-11-20）

范围：修复 noVNC 远程桌面在宽屏容器中保持 4:3 比例而产生左右黑边的问题。`infra/sandboxes/computer/embed.html` 为 noVNC 画布设置容器宽高 100%、块级布局并取消等比 CSS 变换；VNC 连接、只读状态、远程输入和移动端键盘／触控板逻辑未改。资源测试新增嵌入页全覆盖规则断言。

上一轮离线验证：`mobile-keyboard.test.ts` 的 17 项通过，Biome 与差异空白检查通过；仅证明嵌入资源，不能证明生产生效。用户随后明确要求部署，发现原生生产使用 `/usr/share/novnc/vnc.html`，没有 `embed.html`；本轮新增 `infra/native-linux/novnc-full-coverage.css` 并接入实际原生页面，修正此前按电脑镜像交付的判断。

2026-11-20 北京时间 14:26:57 部署：备份现有 `vnc.html`、`vnc_lite.html` 后，原子写入新增样式和两页的引用；页面及 CSS 的回环 HTTP 校验通过。发布目录为 `/srv/rakazo-releases/pa023-coverage-20261120T062657Z`（0700），包含原文件、存在性基线与结果摘要；CSS SHA-256 为 `f75a4a855af8e1be50a104b6b49fb7585e7f7656d597285a92806717414cec01`。没有重建镜像、重启远程桌面／驱动／API／Worker 或修改数据库。

| 检查 | 实际结果 |
| --- | --- |
| 部署前 Windows 基线 | 已安装 Sydney-partner 原登录会话有效，通过正常电脑面板打开原生 noVNC；1024×768 画布，视口约 1267×743，画布左侧偏移 138.10px，尚无新增 CSS。首次采样仍为单色，不作为真实帧证据 |
| 部署后真实帧与全覆盖 | 同一客户端和正常画面路径，1024×768 像素缓冲不变；视口约 1267×743，显示画布约 1267.43×743.43，左上偏移均为 0，32×32 抽样网格发现 93 种颜色。已确认新增样式加载，noVNC `viewOnly=true` |
| 窗口变化 | 窗口调整为 1500×950、1180×900 后，画面视口分别约 1487×859、1167×809，画布显示尺寸分别约 1487.43×859.43、1167.43×809.14；四边误差小于 1 CSS 像素，抽样仍为 93 种颜色、只读保持 |
| 服务状态 | display、desktop、VNC、websockify 四服务 active；API、Worker、PostgreSQL 仍 healthy；公网 `/health` 返回 `ok=true`，无服务重启 |
| 本轮未执行 | iPhone 真机、接管后的输入与本轮主动断线重连、回退演练未执行；较早画面重连证据单列保留。非等比填满会改变显示比例，远程桌面内容完整保留；不声称是分辨率自适应 |

本次原生页面部署已验证 Windows 全覆盖；镜像 `embed.html` 改动仍未构建发布。noVNC 软件包升级可能覆盖页面引用，升级后需按 [运维记录](OPERATIONS.md#云电脑全覆盖样式部署2026-11-20) 重新核对。

收口检查：新增 CSS 的 Biome 检查退出 0，产生 6 条 `noImportantStyles` 警告；这些覆盖用于优先于 noVNC 在画布上写入的内联尺寸／边距，保留并记录，未静默屏蔽。相关文档的 `git diff --check` 通过。自动化客户端已正常退出，并以无调试参数的普通方式重新启动已安装客户端；未保存截图、会话内容或画面票据到文档。

## PA-023 云电脑画面恢复（2026-11-20）

范围：用户要求先恢复云电脑画面，随后明确手机端也需要修复。首次恢复现有专属账号的显示／画面服务，验证 Windows 已安装客户端，并修正移动端画面读取错误被吞掉的问题，未写数据库。之后用户明确回复“允许”，追加授权暂停生产 Worker、校准团队连接引用并恢复 Worker；续作证据单列在本节末尾。不含 Web 恢复演练或取消／回答用户任务。

| 用例 | 实际结果 |
| --- | --- |
| 故障定位 | 专属驱动运行，但 `/tmp/.X11-unix/X10` 缺失；VNC 在等待该 socket 时持续失败。服务器已有 Xorg／xorgxrdp、XFCE、xauth 和 xdpyinfo，没有可直接调用的 Xvfb；未借用其他账号的显示 |
| 专属服务恢复 | 部署 `infra/native-linux/xrdp/` 三个配置。Xorg、XFCE、VNC、websockify 均 active／enabled，运行期间未观察到新 display／desktop 重启；未执行主机重启验收 |
| 启动中断与修正 | 首次启动因 `ProtectSystem=strict` 禁止写入 `/tmp/.tX10-lock` 失败。核对失败进程和锁文件状态后，仅为新显示／桌面服务补齐 `/tmp` 写路径，再部署成功；未重启驱动、API 或 Worker |
| 画面上游 | 以专属账号运行 xdpyinfo 成功，1024×768；回环 VNC 的 RFB 003.008 握手和 ServerInit 成功；noVNC `vnc.html` 返回 200 |
| 监听边界 | 5900 仅监听 `127.0.0.1`／`::1`，6080 仅监听 `127.0.0.1`，未发现 X11 TCP 6010 监听；既有 VNC `10-view-only.conf` 和 `-viewonly` 保留 |
| Windows 真实加载 | 已安装 Sydney-partner 0.4.0 正常关闭后，使用原 profile 验证，登录会话保留。通过其正常电脑面板加载同一账号的专属电脑，画面地址 RPC 200；noVNC 页面及所需脚本 200，真实画布 1024×768、抽样颜色 443 种。观察到可选 `package.json` 探测 404，未影响实际连接 |
| Windows 自动重连 | 主动关闭当前画面 WebSocket 后，客户端重新签发／加载画面并自动连接，新连接重新收到非单色真实帧；关闭前／重连后分别记录 40／41 条服务端 WebSocket 消息。仅覆盖画面断线，不代表服务器或路由重启恢复 |
| 只读限制 | noVNC 运行态 `viewOnly=true`；通过已授权画面连接发送无按键指针移动请求，前后两次服务器指针坐标一致。未发送按键、点击、文本或剪贴板输入，不据此声称这些输入均做了端到端测试 |
| 未授权拒绝 | 公网无效签名路径 `/novnc/session/view/0.invalid/vnc.html` 返回 403；未签发合成能力或绕过正常画面授权 |
| 团队电脑首次定位 | 当时团队电脑画面地址 RPC 500，API 日志为原生驱动拒绝。只读事务使用配置限定的租户身份查询：专属电脑现有引用 status 成功，团队旧引用失败；团队 homeKey 与引用格式有效，使用同一 socket 上已验证的当前代次做只读 status 成功。首次定位未改数据库引用或电脑状态；后续修复见下表 |
| 首次维护边界 | 维护前团队电脑有一条 waiting_input Run、零有效执行租约、controlHolder 为 none 但保留旧 controlLeaseId；driver inspect 为 unknown，不能证明历史进程登记或旧任务已结束。首次定位保留任务、租约和引用，取得用户追加维护授权后再执行下述操作 |
| 手机端源码修复 | 画面读取失败通知页面并显示错误和重试；成功读取清除错误，保留原有可用 URL；异步失败在目标废弃后不回写。预览和完整窗口均展示失败；重试读取画面，不额外调用 boot 或 recover |
| iPhone | 沿用本日既有只读设备证据：Sydney 1.0.12（构建 1）、iOS 27.0.1，开发者镜像未挂载。未取得本轮真机 WebView／重连证据，未安装、发布 IPA／OTA；手机是否包含本轮修复保持未验证 |

本机执行 `node ./node_modules/vitest/vitest.mjs run apps/mobile/lib/computer-refresh.test.ts apps/mobile/lib/computer.test.ts apps/mobile/lib/computer-screen.test.tsx apps/mobile/lib/screen-navigation.test.ts --maxWorkers=1`：4 文件 165 项通过。`node ./node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json` 通过。Biome 检查 `computer-refresh.ts`、两个改动测试及 `app/computer.tsx` 退出 0，保留屏幕测试中既有一条字符串拼接 info，未作无关修改。

首次屏幕组件测试因现有 RN 替身缺少新模式宿主引入的 StyleSheet 而在收集阶段失败；将本测试的模式宿主替换为经典视图透传，模式宿主本身仍由其专属测试覆盖。新增重试用例最初把页面既有首次 boot 计为重试副作用，改为比较点击重试前后的调用数后，全量定向复测通过。未安装依赖或运行全工作区构建。

生产 `systemd-analyze verify` 对两份新单元及既有 VNC 单元退出 0；另有既有 `tat_agent.service` 的旧 PIDFile 路径提示，未修改该服务。12:14 完成最后一轮画面／重连检查后，关闭临时调试实例并以不带调试参数的已安装客户端重新启动。配置回退材料在 `/srv/rakazo-releases/pa023-screen-20261120/rollback/`，本轮未执行回退或 PA-023 完整恢复演练。

改动范围内 `git diff --check` 退出 0（PLAN 另有既有换行格式提示）；新增三个标题锚点、三个源码链接与新单元行尾空白检查通过。三份部署配置与仓库源码在规范化换行后逐字一致；哈希比较命令被当前 Guard 拒绝，实际采用直接文本比较。正常重启后的 Sydney-partner 进程存在，未带调试参数。

### 团队连接维护与复验（2026-11-20）

| 用例 | 实际结果 |
| --- | --- |
| 授权与前置复核 | 用户明确允许本次 Worker 短停和团队连接校准。原生专属／团队电脑均无 queued、leased、running Run、有效执行租约或进行中的电脑更新；团队保留一条 waiting_input，接管租约已过期且 holder 为 none。驱动无直接子进程；inspect 仍为 unknown，未将其解释为历史任务已结束 |
| Worker 停止与恢复 | 北京时间 12:27:50—12:28:05（含健康等待）完成维护。`rakazo-prod-worker-16` 使用无限等待的优雅停止，退出码 0，未强杀；原容器启动后恢复 healthy。API 保持 healthy，原生驱动 PID 不变 |
| 受限备份 | 服务器 `/srv/rakazo-releases/pa023-screen-20261120/team-reference-maintenance/20261120T042750Z-before.json` 保存电脑、Bot、Run 状态和租约元数据，不包含会话正文；对应 `20261120T042750Z-result.json` 保存维护结果。目录 0700、文件 0600，不写入仓库或回显实际身份／连接代次／控制令牌 |
| 事务校准 | 使用 API 运行环境和限定租户，在短事务内对 computers、bots、runs、computer_execution_leases、computer_updates 取 SHARE ROW EXCLUSIVE 锁；设置锁与语句超时。快照与备份一致且无有效租约／执行任务后，用相同驱动已验证的当前引用对团队身份复核 status。条件更新仅变更团队 providerRef、screenGeneration 加 1 和 updatedAt；提交前对照快照确认其他记录未变，更新后驱动 status 成功 |
| 过期接管处理 | 校准事务保留原任务和接管数据。恢复后正常画面读取／后台过期处理可以成功撤销旧接管，后续只读复核显示 controlLeaseId、controlLeaseExpiresAt、controlBotId 已清空，holder 仍为 none、controlFence 未变。这是既有过期清理链路恢复，不是维护脚本重置租约；未恢复过期令牌。原团队 Run 状态全部未变，waiting_input 仍为 1，有效执行租约仍为 0 |
| 双端共用画面接口 | 已登录 Windows 会话调用团队 computer/screenUrl 返回 200、有效画面地址和 rakazo-novnc；通过正常打开入口触发的 boot、heartbeat、screenUrl 均 200。没有模拟签名或跳过 generation／status 校验；此项只证明共用后台接口恢复，不代表 iPhone WebView 实测 |
| Windows 团队真实画面 | 使用已安装 Sydney-partner 0.4.0 和原登录 profile，点击电脑面板「打开」，完整窗口连接成功，真实画布 1024×768、48×48 网格抽样 135 种颜色；运行态 viewOnly=true |
| Windows 团队自动重连与预览 | 主动关闭该画面 WebSocket，自动建立新连接并重新收到非单色真实帧，仍为 1024×768、抽样 135 种颜色；新连接记录 50 条服务端消息，viewOnly=true。关闭完整窗口后，预览 iframe 再次 connected，分辨率 1024×768 |
| 自动化首次中断与修正 | 首次脚本仅等待团队预览 iframe，35 秒超时；当时界面显示「团队电脑／打开」，没有 iframe，不能判定画面加载通过。改为按用户正常入口点击「打开」，再验证完整窗口和返回预览，实际链路通过；未为测试修改产品代码 |
| 授权拒绝与清理 | 已登录客户端经正常代理访问无效画面能力返回 403。验证后正常关闭调试实例、普通启动已安装客户端，主进程存在且无 inspect／remote-debugging 参数，9315 无监听。Web 容器仍未运行；原驱动及四个画面服务 active |

本次续作未改新的移动端源码，复用上方仍适用的 165 项回归、类型和格式检查证据。未发布 IPA／OTA，未安装手机新版本，iPhone 首次加载、重连和前后台切换继续待验；未执行引用回退、主机重启或完整 Web 恢复演练。

续作文档验收：七份受影响文档的 `git diff --check` 退出 0，PLAN 仍有既有 CRLF 转 LF 提示；本轮相关章节中的 18 个本地文档／源码链接及目标标题锚点检查通过。未重新运行未发生源码变更的移动端回归。

## 移动端模式选择与内置皮肤离线验收（2026-11-20）

- 关联 PA-018、PA-020、PA-021。用户确认 iPhone App 名称为 `Sydney`；`apps/mobile/app.json` 中 `expo.name` 与之相符。Windows 包 `productName` 为 `Sydney-partner`，本轮未修改双端名称。
- 新增 iOS「设置 → 界面模式」页面及 `midnight`（午夜）内置模式。使用深蓝色令牌、深色外观锁和实体玻璃回退，沿用原聊天外观；不加载远程皮肤或新增依赖。默认仍为 `classic`。
- 执行 `node ./node_modules/vitest/vitest.mjs run apps/mobile/lib/ui-mode-screen.test.tsx apps/mobile/lib/ui-mode.test.ts apps/mobile/lib/ui-mode-store.test.ts apps/mobile/lib/ui-mode-registry.test.ts apps/mobile/lib/ui-mode-provider.test.tsx apps/mobile/lib/ui-mode-slots.test.tsx apps/mobile/lib/appearance.test.ts apps/mobile/lib/chat-appearance.test.ts apps/mobile/lib/chat-appearance-screen.test.tsx apps/mobile/lib/glass-surface.test.tsx apps/mobile/lib/app-error-boundary.test.tsx --maxWorkers=1`：11 个文件、64 项通过。新增覆盖界面预览不写盘、取消、应用后新建 store 水合恢复、离开／卸载页面取消预览、重置及 Android／Web 平台过滤；集成用例覆盖内置模式先注册后水合，以及恢复用户原明暗偏好。
- 执行 `node ./node_modules/typescript/bin/tsc --noEmit -p apps/mobile/tsconfig.json` 通过；Biome 检查 8 个本轮改动源码／测试文件通过。首次通过 `pnpm.cmd` 传递含括号路径在命令解析阶段失败，随后直接调用已安装工具入口；首次 Biome 报告测试替身的 radio 语义问题，改用原生 HTML radio 后单独复测页面文件，4 项通过。未安装或升级依赖。
- `git diff --check` 通过；本轮新增的 4 处文档链接及标题锚点检查通过。检查后再次运行移动端 TypeScript，通过。
- 以上为本机离线验证；未构建、发布或安装 IPA／OTA，未操作手机数据，未连接服务器或切换生产服务。后续只读查询已确认手机现有 Sydney 为 `1.0.12`（构建 `1`），具体设备和源包关联见下文准备复核；带本轮功能的候选、系统字号、切换视觉及升级仍按 [测评清单](ACCEPTANCE.md#iphone-多模式换肤pa-018pa-020pa-021) 待验。原内核在 SecureStore 写入失败时仅保留进程内模式，本轮未改变该行为；成功持久化用例不覆盖设备 Keychain 写入失败。

## 移动端多模式 UI 离线验收（2026-11-20）

- UI 模式存储、注册表、Provider、屏幕宿主、外观、聊天外观、设置页、玻璃表面和应用错误边界共 10 个定向测试文件，59 项全部通过。
- `pnpm --filter @rakazo/mobile exec tsc --noEmit -p tsconfig.json` 通过。
- Biome 检查本轮 21 个移动端源码和测试文件通过。
- 覆盖模式持久化/预览/恢复、平台门禁、主题 Provider 更新、同 ID 定义替换、页面插槽与 Hook 保序、屏幕崩溃回退、玻璃策略、根错误恢复及原聊天设置保留。
- 未执行 IPA／OTA 构建、签名、安装或 iPhone 真机验收；本机未启动 Docker、数据库或桌面服务。

## 续作测评记录

2026-11-19。操作与通过条件见 [续作测评清单](ACCEPTANCE.md#续作测评)，证据明细见 [历史验证记录](#历史验证记录)。

实测时写明日期、环境、API／Worker 版本及适用的客户端产物版本。按验收清单中的测评项逐条追加结果。证据可引用脱敏截图、Run 编号、构建号或健康检查摘要。失败时写入实际行为及复验条件。

### PA-023 环境与候选准备复核（2026-11-20）

#### 旧账号登录成功反馈（同日 11:15 更新）

用户先反馈此前注册的账号无法登录，随后明确回复“可以登录哦”，并提供 Windows 客户端已进入会话页面、显示既有会话的截图。本机只读核对：`%LOCALAPPDATA%\Programs\rakazo\Sydney-partner.exe` 已在运行，主窗口标题为 `Sydney`，本项目 profile 保存地址仍为生产 HTTPS 后台。另一个目录下 Sydney 进程的窗口标题为 `Sydney · 个人工作 OS`，不混用两者证据。

本项记为“旧账号登录成功、会话加载：用户实测及截图确认”，不再将账号无法登录或客户端未运行列为当前阻塞。未读取密码、会话令牌或复制聊天内容；未额外提交登录请求、重置账号或修改认证代码。截图不覆盖冷启动、退出重登、消息发送、双端隔离、Slack／MCP 回跳、画面、升级或 Web 恢复演练，相关项目仍逐项待验。以下较早的未运行、未登录状态保留为历史时点记录。

本机只读检查结果（补入同日实际设备查询）：

- Windows 即插即用当前枚举到状态为 `OK` 的 Apple iPhone，Apple Mobile Device Service 运行。通过已安装 iPASide 的内置 Python 与 `pymobiledevice3`，在 `autopair=False` 下成功只读查询 USB 设备和已安装应用：设备报告 iOS `27.0.1`，目标应用显示名与内部名称均为 `Sydney`，版本 `1.0.12`、构建 `1`；应用标识为 `xin.zxlup.sydney` 加重签后缀（脱敏）。本机存在可用设备库，不需要为了查询重新安装依赖。
- Windows 卸载登记显示 `Sydney-partner 0.4.0` 已安装，`%LOCALAPPDATA%\Programs\rakazo\Sydney-partner.exe` 存在，`%USERPROFILE%\.sydney-partner\setup.json` 保存后台 `https://124.221.182.39`。当前未运行该客户端；正在运行的 `D:\33054\Sydney\Sydney.exe` 属于另一桌面项目，不作为本项目验收证据。本轮未启动、安装或登录 Windows 客户端。
- `Sydney-partner 0.4.0` 安装候选存在，Authenticode 状态为 `NotSigned`。本地 iOS 构建 `44298985618` 的 IPA 未包含 `embedded.mobileprovision` 或 `_CodeSignature/CodeResources`，不能作为已签名可安装候选；此前 IPA 查找范围仅覆盖本仓库、指定候选目录、Downloads 和 Desktop，不代表整机没有其他签名包。
- 手机应用与当前 USB 设备精确匹配到 1 条本机侧载续签记录。记录源文件存在，为 `25,989,087` 字节，SHA-256 `5f4333747c6faf8775dc487ccdd452d218dfa4818f0a80f0d424508390bbc058`，与本地云构建 `44298985618` 的 `SHA256.txt` 一致。这证明记录源包对应既有候选，未读取已安装应用的可执行文件来证明其字节相同，也不代表包含本轮未发布的换肤代码。
- Misagent 只读返回 5 份与目标应用标识匹配的描述文件，查询时均未过期；未确定已安装应用实际嵌入哪一份，因此不据此承诺该安装的剩余有效期。现有 `scripts/iphone_image_readonly_probe.py` 实测为已连接、`personalized_image_found: false`；本轮未挂载开发者镜像、配对、签名、续签、启动或覆盖手机应用。
- SSH 配置中没有经确认的隔离测试环境入口；已知生产主机不能替代测试环境，另一个 SSH 别名也未核实为测试环境。本轮未连接任何服务器。当前工作区没有测试环境地址或登录凭据。
- 未登录真实测试账号，未执行 Windows/iPhone 登录、Slack/MCP 授权、云电脑画面或客户端升级测试。未执行 Compose/画面桥恢复、网关 reload 或任何生产流量修改。
- 本次仅补入设备与安装候选证据，`git diff --check` 和新增 2 处准备记录链接／标题锚点检查通过；没有为文档更新重跑应用测试。

结论：设备连接、已安装 Sydney 版本及记录源包的候选关联已补齐，不能继续将“未读取手机应用”列为阻塞。已安装 Sydney 可作为后续非升级用例的被测版本，升级用例仍需另备目标签名候选。没有新增登录、回跳、画面或恢复等 PA-023 必测用例通过；仍需获授权测试环境的明确入口、用户自行登录的 Windows 验收账号/profile，以及该环境可用的 Slack/MCP 和画面条件。若仍只有现有生产，恢复 Web 与再切回直连必须先确认本次维护范围和时段；此前已执行的首次生产切换不自动覆盖恢复演练。按 [验收清单](ACCEPTANCE.md#停用-web-与恢复演练pa-023) 逐项执行，不以设备元数据替代业务结果。

同日北京时间 10:45 的后续复核：Sydney-partner 进程数为 `0`，已安装 profile 的保存来源仍为 `https://124.221.182.39`。没有收到本次生产恢复／再切换的维护确认，也没有新的获授权测试环境入口。环境与账号条件在恢复目标后的连续续作中持续缺失；可独立推进的换肤离线代码和手机版本识别已经完成，当前无法执行剩余真实用例。目标工具已返回 `blocked`，不是 `complete`。本轮仅同步阻塞状态，未启动客户端、连接服务器、触发外部授权或更改生产流量；待条件落实后恢复同一完整目标。

| 测评范围 | 已有证据 | 本轮待执行 |
| --- | --- | --- |
| 发布基线 | GitHub 离线基线为 `5bff060a7`。iOS 已有 `0ca3357a5` 的候选产物 | 确认发布候选纳入的改动、对应定向回归及 API／Worker 与双端产物的版本组合 |
| GitHub 模块 | 基线离线回归 15 个测试文件、203 项通过 | 在授权 PostgreSQL 验证迁移与应用角色隔离，使用真实测试 PAT 完成页面、只读工具和解绑验收 |
| Windows | `Sydney-partner 0.4.0` 已安装并配置生产 API；此前健康 RPC 与认证能力接口均返回 `200`。同日 11:15 用户确认旧账号成功登录并提供会话页截图，本机确认该客户端正在运行、窗口标题为 `Sydney`。另有合成 profile 的旧数据迁移证据 | 冷启动、退出重登、消息发送、真实旧 profile 迁移和账号／工作区切换仍需分别记录；不再列账号无法登录为阻塞 |
| iPhone | 已通过 USB 只读确认 iOS `27.0.1` 上安装 `Sydney 1.0.12`（构建 `1`）；对应本机侧载记录的源包摘要与提交 `0ca3357a5` 的云构建 `44298985618` 校验文件一致 | 使用已安装版本验证冷启动、空服务器配置恢复、重新登录与会话隔离；升级另备目标签名候选并分项记录；未挂载开发者镜像 |
| 停用 Web 与恢复 | 生产已切换客户端直连，Web 和旧桥已停止，公网应用入口 `404`、API 就绪；配置和数据库备份已保留 | 双端真实授权与升级、恢复缺失的原生桌面会话并验证画面；实际恢复演练未执行 |

本轮文档检查核对了续作计划、测评清单和验证记录中的 13 处链接及标题锚点，确认 14 项测评用例和 5 条证据记录的表格格式正确。

### PA-023 切换前验收预检

2026-11-19。以前述停用 Web 用例为完成标准。执行与恢复顺序见 [运维手册](OPERATIONS.md#pa-023-切换与恢复顺序)。

#### PA-023 继续验收复核（2026-11-19）

北京时间约 22:25 起复核。现有环境只有生产，之前按用户授权完成的直连切换仍生效；本轮没有独立测试环境可用于恢复流量演练。按本条“生产切换须经用户确认后执行”的要求，未再次切换生产、重启服务或恢复旧入口。以下区分实际通过的预检与未完成的端到端验收。

| 必测项 | 本轮实际证据 | 结论与继续条件 |
| --- | --- | --- |
| 停用 Web 与 API 就绪 | `rakazo-prod` 中 API、Worker、PostgreSQL 健康，Web 和旧 Web 回环桥已退出；新 API 回环桥运行。HTTPS `/health` 和 `/ready` 均为 `200`，`degraded=false`，`/app` 为 `404`。当前覆盖的默认服务清单排除 Web 和旧桥 | 服务拓扑检查通过；不能替代双端业务验收 |
| Windows 安装与重新登录 | 本机 `Sydney-partner 0.4.0` 安装器仍为 137,081,069 字节、未签名。普通启动的已安装程序停在 `/sign-in`，邮箱输入框存在。从该窗口调用 `/api/auth/get-session` 为 `200`，返回无有效登录会话 | 登录、注销、重登及消息发送未执行。需用户在客户端登录验收账号；本轮未生成会话或绕过认证 |
| iPhone 候选与连接 | Apple Mobile Device Service 和 Bonjour 均运行；直接向本机 usbmux 查询成功，设备数为 `0`。本地仍有云构建 `44298985618` 的未签名 IPA | 当前无法进行设备操作，签名候选安装、冷启动、登录、聊天和附件均待实测。需连接并解锁 iPhone，确认安装的应用及构建号 |
| Slack 安装完成与取消 | 实际 API 容器的 `SLACK_CLIENT_ID`、`SLACK_CLIENT_SECRET` 等安装凭据均未设置；仅检查是否存在，没有读取或记录明文 | 未执行，当前缺少真实安装配置。Slack 是本目标必测项，不能以未配置改记为通过或免测 |
| MCP OAuth 完成与取消 | 已有返回页可达和离线用例证据；当前 Windows 无登录会话，iPhone 未连接，没有本轮真实 OAuth 事务 | 未执行。需登录后的双端、目标 MCP 服务和用户授权交互；返回页 `200` 不证明授权回跳完成 |
| 已启用的密码重置 | 生产认证能力实际返回 `passwordAuth=true`、`passwordReset=true`、`emailCode=true`，重置入口为 IP 原生页面 | 未执行真实重置。需受控验收邮箱，记录成功、取消／失效及客户端返回，不向未知邮箱发送邮件 |
| 原生 noVNC 画面及重连 | `sydney-screen-vnc.service` 处于失败自动重启，`sydney-screen-websockify.service` 未运行；`/tmp/.X11-unix/X10` 不存在。实际服务指定专属桌面账号、`DISPLAY=:10` 及 `-viewonly`，该账号没有运行中的 X 桌面进程 | 当前画面链路失败，既有故障仍未恢复。需恢复原授权桌面会话，再启 VNC／websockify，并在双端验证加载、只读及断线重连；不替换为其他 X 显示 |
| 无影画面及重连 | 本轮没有新的真实无影连接证据；已有 SDK 静态资源可达证据 | 待登录后核对目标账号实际启用的 Provider；启用无影时必须在双端实测，不能由 SDK 可达推断画面通过 |
| Windows 安装包升级与版本提示 | 已有同版本更新安装和更新防护合成测试证据，本轮没有跨版本升级或真实 `426` 交互 | 未执行真实升级与升级后会话／数据保留核验 |
| iPhone 签名升级及 OTA | 当前没有已连接的设备，本地产物为未签名候选 | 未执行签名升级、升级后恢复及启用时的 OTA 验收 |
| 原 Compose、Web 与旧桥恢复 | 以实际 `.env` 解析原覆盖，服务清单包含 `api`、`web`、`native-screen-web-loopback`；原 API、Web 和桥的镜像均仍可在服务器本地找到。生产 `.env` 与切换前 `deploy.env` 逐项比较相同 | 恢复预检通过；未执行服务协调、Web 健康检查或真实画面恢复 |
| 网关原流量恢复 | 通过现有 Caddy 容器的标准输入校验原 `Caddyfile.prod` 成功。备份配置、环境、脚本和 2,486,534 字节的数据库备份均存在、权限为 `0600` | 仅语法和材料预检通过；未 reload 旧配置，旧入口登录和画面流量未验收。完整维护演练等待生产操作确认 |

当前 API 运行容器由 Compose 的 `api` 服务解析，名称为 `rakazo-prod-api-21`；操作命令使用 `compose ps -q api`，不假设固定 `api-1`。已将原 Web 恢复、健康后恢复网关、再切回直连的操作顺序补入 [生产恢复与再切换方案](OPERATIONS.md#pa-023-后续维护演练与再切换方案)。该方案尚未实机执行；没有重新运行首次发布脚本，也没有覆盖切换前的回退材料。目标保持进行中。

2026-11-19 22:37 再次读取实际 Windows 窗口和会话：仍在 `/sign-in`，会话查询为 `200`、无登录会话；usbmux 查询成功但设备数仍为 `0`。完整验收目标在连续三轮遇到相同阻塞后标记为 `blocked`，不是验收完成。生产恢复与再切换的用户确认尚未收到；Slack 配置、原桌面会话、真实授权及升级条件尚未补齐。没有新的必测项通过，也没有执行生产流量变更。继续条件为用户登录 Windows 验收账号、连接安装签名候选的 iPhone、补齐实际 OAuth／桌面条件并确认维护演练范围；恢复后继续原完整清单。

文档校验：维护方案的 3 个 Bash 命令块合并后通过 `bash -n`，5 处新增文档链接及标题锚点核对通过，受影响文档的 `git diff --check` 通过。首次检查使用的默认 Git Bash 路径不存在，改用本机已安装 Git 目录后完成校验，没有安装依赖。上述命令块只检查语法，未执行其中的生产变更命令。

#### 2026-11-19 生产直连切换结果

用户确认只有生产环境并授权直接切换。北京时间约 21:35 在 `sydney-cloud-admin` 的 `rakazo-prod` 完成切换。生产原 API 为 `1993995e572fd4235c7684c533db23eb6cf0554e`，当前运行 `sydney-pa023-api:20261119`：基于原 API 镜像和既有锁定依赖，仅补入客户端回调、认证来源、API 画面代理及其必要契约。没有发布 PA-024、项目工作区模型或其他待应用迁移；Worker、数据库实例和云电脑驱动保持原版本。

| 实测项 | 结果与证据 |
| --- | --- |
| 候选构建与回归 | 在服务器构建候选，重新生成仅增加 Slack 返回字段的 Prisma Client。候选镜像在无网络、无生产数据挂载的临时容器中通过 12 个定向测试文件、343 项测试。首次误用镜像的生产模式导致认证测试夹具失败，明确使用 `NODE_ENV=test` 并同步对应网关模板后复验通过 |
| 备份与迁移 | 原覆盖、Caddy、部署环境及原部署脚本保留在 `/srv/rakazo-releases/pa023-direct-20261119/rollback/`。数据库自定义格式备份为 2,486,534 字节，`pg_restore --list` 可读取；没有执行数据库恢复。仅应用 `20261119200000_messaging_install_return_to` 和 `20261120000000_messaging_install_native_return` 两项兼容迁移 |
| 实际拓扑 | API 健康，`/ready` 为 `200` 且 `degraded=false`；Worker 和 PostgreSQL 保持健康。默认 Compose 服务清单排除 `web` 和 `native-screen-web-loopback`；原 Web 及旧桥实际状态均为 `Exited (143)`。`native-screen-api-loopback` 已运行并共享 API 网络命名空间 |
| 公网入口 | Windows 外部请求和服务器侧 HTTPS 检查均确认 IP `/health` 为 `200`、`/app` 为 `404`。服务器检查 IP `/` 为 `404`；原域名 `/health` 为 `200`、`/app` 为 `404`。未关闭证书校验 |
| 认证与回调 | 匿名 `/api/auth/get-session` 为 `200`，响应 `null`；`/rpc/health` 返回 Sydney 健康响应。MCP 返回页、两条集成返回页、邮箱验证返回页、旧 `/sign-in` 兼容页及原生密码重置页均为 `200`。认证能力返回 IP 原生重置地址，域名 Passkey RP 保持 `pc.zxlup.xin`。生产没有配置 Slack 安装凭据，该回调路由为 `404`，未声称真实 Slack 授权通过 |
| 画面依赖 | 五个无影静态资源均为 `200`，嵌套 SDK 容器没有 `X-Frame-Options`，其他页面保留限制。无效 noVNC 票据返回 `403`。API 到新桥的 TCP 连接成功，但桥后 `127.0.0.1:6080` 拒绝 HTTP 连接：主机原有 `sydney-screen-vnc.service` 依赖的 `/tmp/.X11-unix/X10` 不存在，已持续重启；`sydney-screen-websockify.service` 未运行。未新建桌面会话或将其他 X 显示替换为用户桌面，真实画面加载和重连待恢复既有 `:10` 会话后验证 |
| 持久配置与恢复 | 使用原 `.env` 指定的单份 `/etc/rakazo/compose/production.overlay.yml`，`migrate` 和 API 固定到候选镜像，Web 加入 `legacy-web` profile，更新器配置跳过 Web；生产当前没有运行 updater。部署脚本同步仅跳过未启用 Web 的改动，`bash -n` 通过。首次 Caddy 预检因只读根文件系统不能复制临时配置而中止，当时生产尚未更改；改为标准输入验证后切换成功。未执行切换后的 Web 或数据库恢复演练 |

生产发布源码清单、局部源文件、构建和验证摘要留在 `/srv/rakazo-releases/pa023-direct-20261119/`，只在服务器保留运维备份。实际运行版本是原生产基线加局部补丁，不是当前工作区 HEAD 的全量部署。双端登录、发送消息、真实 OAuth、签名 iPhone 升级及真实画面仍待逐项实测。

Windows 安装名已调整为 `Sydney-partner`，应用标识保持 `dev.rakazo.desktop`，与 `D:\33054\Sydney` 的另一个应用拥有不同卸载注册项。初次 NSIS 安装返回 `0`；包元数据检查和两项打包版 Playwright 用例通过。真实首次启动发现 Roaming 目录中配置文件原子重命名返回 `EXDEV`，用独立文件操作复现；改用 LocalAppData 后仍失败，因此放弃该路径。用户主目录下 `.sydney-partner` 的两次独立文件重命名均成功，最终 Windows 打包版默认使用此目录，保留原子写入，不删除旧 profile。

最终安装器为 `apps/desktop/out/pa-023-partner/Sydney-partner-Setup-0.4.0.exe`，137,081,069 字节，仍是本地未签名候选，未发布。桌面代码已重新构建，Web 使用已有内置构建；产物来自当前含既有未提交改动的工作区，不能据此声明为干净提交构建。桌面两套 TypeScript 检查通过，包元数据与配置存储两个测试文件合计 8 项通过、3 项按 Windows 平台条件跳过。

更新安装返回 `0`。通过 Playwright 从 `%LOCALAPPDATA%\Programs\rakazo\Sydney-partner.exe` 启动已安装程序，未设置测试 profile 覆盖，选择或恢复生产 `https://124.221.182.39` 后加载本地 `http://127.0.0.1:49366/sign-in`，邮箱登录表单可见；完全退出后再次启动，同一地址、端口和登录页均恢复，实际用户数据目录为 `%USERPROFILE%\.sydney-partner`。已查看登录页截图确认页面正常。没有输入账号凭据，不将登录页可见等同真实登录、聊天或 OAuth 验收。

用户随后提供连接失败的设置页截图。本轮核对正在运行的普通启动进程：可执行文件为上述 `Sydney-partner.exe`，原始命令行没有自动化参数，保存的服务器仍为生产 IP。读取实际窗口时，当前已显示本地注册／登录首页，没有设置页或连接错误。从该窗口发起 `/rpc/health` 与 `/api/auth/capabilities` 请求均返回 `200`，健康结果为 `ok: true`，确认内置界面经本地代理连接生产 API。随后切到登录页供用户操作。此次没有重新安装或改动连接代码，也没有复现截图中的失败；不为该次失败追加未经证实的新原因。

| 测评项 | 本轮观察 | 真实环境结果 |
| --- | --- | --- |
| 候选与设备 | Windows 已改名、生成未签名 `Sydney-partner-Setup-0.4.0.exe` 并安装，正常启动和冷启动后均可进入生产登录页。iPhone 云构建 `44298985618` 的未签名 IPA 为 `1.0.12`（构建 `1`），先前手机安装查询未返回对应应用标识 | Windows 真实账号登录、旧数据和跨版本升级待验；iPhone 已签名候选及真实生产逐项验收待确认 |
| 服务拓扑 | 用合成值及显式 `updater` profile 解析原部署的原生 Linux 组合，以及通用、原生 Linux、Docker 三种客户端专用组合。原配置包含 Web 和旧画面桥。三个候选均排除 Web，网关上游与更新器配置正确，原生 API 画面桥和 Docker supervisor 屏幕对端分别核对通过 | 已按用户授权在生产切换，运行态结果见上表；当前没有运行 updater |
| 双端认证与回调 | 先前 6 个离线文件 197 项通过；生产局部补丁候选 12 个文件 343 项通过。返回页已由生产 API 提供，Windows 从安装包显示登录页 | 逐项实测双端登录及已配置的真实授权。当前生产没有配置 Slack 安装凭据，不将该链路记为通过 |
| 双端云电脑画面 | 静态配置通过，API 侧画面桥已运行，无影静态资源可用 | 生产原有 `:10` 会话缺失，noVNC 上游不可用；需先恢复该授权桌面，再验证双端实际加载及重连 |
| 双端升级 | Windows 打包版更新防护首次因英文提示断言失败。改为核对 `unsupported` 状态、非空提示及未访问更新源后，用同一打包产物复测通过（1 项） | 待实测 Windows 安装包升级和 iPhone 签名候选升级，启用 OTA 时覆盖 OTA |
| 恢复 Web | 原配置、镜像、Web 容器及数据库备份已保留，切换失败处理与手工回退入口已记录 | 本次成功切换后未执行实际恢复演练，不将备份存在记为恢复成功 |

Windows 安装器位于 `apps/desktop/out/pa-023-validation/Sydney-Setup-0.4.0.exe`，大小为 137,080,912 字节，Authenticode 为 `NotSigned`。使用 Node 24.22.3、仓库已有的 Web 和桌面构建产物及 Electron 45.0.0 打包，核对了包内 `resources/web/index.html`。打包保留工作区其他改动，未重新构建 Web 或桌面，也未以此次打包证明产物对应某个干净的源码提交。默认 Node 引擎不匹配；改用现有 Node 24 后，先后遇到 Electron 下载停滞及工具缓存重命名错误，改用本地 Electron 和独立打包缓存后生成成功。

## 历史验证记录

PA-021 / PA-023 iOS 侧载候选包含空服务器配置恢复和启动错误重试。四个定向测试文件共 24 项通过。提交 `0ca3357a5` 的云构建 `44298985618` 成功，未签名 IPA 已下载并通过 SHA-256 校验。2026-11-18 用户反馈 iPhone 实测正常。冷启动、重新登录及停用 Web 后的授权回跳和画面仍需逐项确认。

移动端恢复复验通过四个测试文件共 24 项，覆盖默认服务器来源、启动任务、启动错误分类和错误边界。本机存在 2026-11-18 的未签名 OTA 底座 IPA（云构建 `44263086859`，提交 `2b613f98f`）和 2026-11-11 的 Windows 解包产物。退役恢复和迁移代码仍有未提交改动，缺少对应当前源码的验收包。本机设备清单未检出可用于本轮验收的 iPhone。iPhone 冷启动、重新登录与实际旧 profile 的安装包迁移仍待验收。

使用本机 Compose CLI 和合成环境变量分别解析基础、客户端专用、Docker 沙箱与原生 Linux 四套配置。基础配置包含 Web，Caddy 的五个浏览器、登录、回调和画面上游指向 Web，更新器启用 Web。三套客户端专用配置均排除 Web，五个上游改指 API，更新器禁用 Web。真实服务协调和流量恢复待目标环境验证。

发布脚本静态复核发现，失败回滚沿用进程启动时读取的 Compose 文件清单。既有替身用例验证由 Git 版本决定服务清单的回滚路径。独立于 Git 的持久覆盖恢复、Web 容器和网关流量待授权环境演练。

网页退役发布脚本的两项定向用例在 Windows Git Bash 上分别通过。Docker、磁盘检查和公网健康检查使用替身。仅客户端部署跳过 Web，候选公网健康检查失败时恢复上一 Git 版本，并按旧版本服务清单重新纳入 Web。其余部署脚本用例本轮未执行。真实网关、容器、流量和回滚仍待演练。

目标已有外观记录的 Electron 合成分区实验通过。迁移保留目标主题、全局背景选择和会话清除记录，旧图片的 MIME 类型和字节核对一致，重复调用未重复导入。

头像迁移读取及写入通过 Electron 临时 profile 实测，覆盖旧账号标记不匹配、匹配导入及重复导入。Web App 和头像库 11 项测试通过。真实服务端会话、旧 profile 和安装包触发仍需验收。

全局聊天外观的产品读取和导入函数通过 Electron 合成分区实验。导入后读取背景 Blob 和 MIME 类型并逐字节核对，重复导入保留已有外观。会话专属背景的定向回归覆盖目标已有映射、主动清除、素材缺失、会话切换及成功恢复。外观设置、工作区背景、编辑器及 App 共 116 项通过，桌面和 Web TypeScript 检查通过。真实旧 profile 及安装包待验收。

草稿、编辑器、头像库和 App 定向回归共 114 项通过。草稿用例覆盖成功恢复、用户开始编辑、切换工作区和切换账号。安装包通过真实后台核验会话权限的全链路待验收。

侧栏密度迁移产品读取和写入函数通过 Electron 临时 profile 验证。普通导航使用旧 Service Worker，迁移窗口读取合成旧值后导入新分区，旧 Worker 随后仍可服务。独立桌面入口的类型检查通过。真实旧 profile 与安装包冷启动仍待验收。

网页退役移动端恢复。默认来源保护、启动监听和错误页重试共 19 项通过。回归覆盖空字符串服务器配置下的已验证旧会话迁移与外部来源会话拒绝，以及偏好加载卡住时的服务器设置错误。变更的启动代码及 `api.ts` 通过 Biome 检查。真机冷启动与重新登录待验收。

Electron 合成迁移实验通过。旧 Service Worker 在普通导航中接管页面。迁移窗口启用绕过后读到受控文档及旧数据，拦截非允许路径，退出绕过后旧 Worker 恢复接管。第二个分区写入侧栏密度和合成 Blob，刷新后重试导入逐字节保留了已有值和 MIME 类型。实际头像和聊天外观结构、账号绑定草稿及真实 profile 仍待接线和验证。

2026-11-18 网页退役 Batch 3 定向验证。认证、API 配置及原生密码重置的 3 个测试文件共 167 项通过。版本门禁、Web 更新及 Slack 服务端和移动端回跳的 5 个测试文件共 90 项通过。Slack 回归首次运行有一项仍断言旧关闭页，按现有一次性原生回跳更新断言后通过。真实服务商、安装包及线上停服联调待执行。

Routine 编辑器现有 4 项测试通过，桌面 IPC 与各变更代码通过定向 Biome 检查。桌面安装包中的真实 IPC 调用待联调。

桌面和 Web 的主 `tsc --noEmit` 通过。MCP OAuth、原生回调及桌面弹窗权限的 5 个测试文件共 176 项通过，涵盖 MCP 回调同源限制和迁移前保留存量凭据。21 个变更源文件 Biome 检查通过。未运行 Caddy 配置加载及生产停服演练。

客户端专用部署静态验证通过。Compose 合并结果排除 `web`，Caddy 依赖 API，更新器跳过 `web`，原生画面桥使用 `service:api`。Git Bash 的发布脚本语法检查通过。认证与更新器合跑 148 项通过，更新器独立运行遇到契约初始化顺序错误。Supervisor 屏幕网络 10 项通过。部署脚本完整回归在 Windows 因固定 `/bin/bash` 路径无法运行，需在 Linux 重跑。未启动服务。

2026-11-18（PA-024 GitHub 个人主页与开源探索模块跨包验证）：
（1）跨包全量定向单元与集成测试：执行命令 `pnpm exec vitest run packages/contracts/src/github.test.ts packages/core/src/action-approval.test.ts packages/core/src/product-analytics.test.ts packages/adapters/src/github-client.test.ts packages/adapters/src/github-connections.test.ts packages/adapters/src/github-tools.test.ts packages/adapters/src/builtin-tool-bridge.test.ts packages/adapters/src/index.test.ts apps/api/src/security-audit.test.ts apps/api/src/github-router.test.ts apps/web/src/pages/GithubPage.test.tsx apps/web/src/pages/github/GithubContributionHeatmap.test.tsx apps/web/src/pages/github/GithubExploreAndRepos.test.tsx apps/web/src/components/SidebarFooter.test.tsx apps/web/src/components/PageBreadcrumb.test.tsx --maxWorkers=1`，**15 个测试文件共 203 项测试全部 PASS**（耗时 29.15s，0 失败）。
- 契约与防穿越：验证合法/非法仓库全名（`owner/name`）、52 周贡献天数合法范围与路径穿越防护（拦截 `../secret` 与反斜杠）；
- 核心策略：验证 4 个只读工具免人工审批与路由事件埋点；
- 适配层：验证 REST + GraphQL 客户端 1MB 响应保护、15s 超时、Token/Header 自动脱敏、5 分钟 GraphQL 租户隔离缓存、连续天数与周网格计算；验证离线仿真器对匿名/已连接状态的全部模拟；验证基于 `SecretStore` 与咨询锁的并发更新及解绑清理；验证 4 个工具包裹不可信数据标记与安全提示；
- 服务端 RPC：验证 7 个 `/rpc/github/*` 路由对未连接/未配置降级、PAT 格式校验、安全审计事件留痕与 400 业务错误映射（避免 401 注销会话）；
- 前端组件：验证选项卡切换与 URL `?tab=` 参数同步、隐藏私有仓库状态切换与遮罩、PAT 弹窗输入即清空、52/53 周热力图网格无障碍属性与色阶渲染、四维卡片数值、远端项目多维筛选与分页、开源结构化检索构造、抽屉纯 React AST Markdown 预览与防 `javascript:` 注入、以及一键带参数跳转 Bot 会话草稿。
（2）静态检查与 Prisma 代码生成：`packages/db` 执行 `prisma generate` 成功生成客户端代码，`packages/db`、`apps/api`、`apps/worker`、`apps/web` 执行 `tsc --noEmit` 0 错误；改动文件 `biome check` 0 错误。
（3）未执行与环境边界：本次为离线环境仿真与单测验收；未在公网真实网络直连 `https://api.github.com`、未执行真实用户的 PAT 联调、未连接真实 PostgreSQL 执行 `pnpm --filter @rakazo/db migrate`（迁移文件已生成在 `packages/db/prisma/migrations/20261118150000_github_connections/migration.sql`）；真实数据库迁移与生产连通性待后续授权服务器环境验收。

2026-11-18（PA-018、PA-023 网页退役 Batch 2 桌面独立启动链验证与三轮复审）：
（1）定向单元测试：运行 `standalone-origin-store.test.ts`、`standalone-session-hooks.test.ts`、`proxy-request-capability.test.ts`、`standalone-renderer-proxy.test.ts`、`i18n.test.ts`（含 13 语种全量词条完整性扫描）、`setup-config.test.ts` 与 `packages/adapters/src/user-device-client.test.ts` 共 **7 个文件 230 项通过、2 项既有跳过**。
（2）类型、格式与构建检查：`pnpm --filter @rakazo/desktop check`（双 tsconfig）、`pnpm --filter @rakazo/adapters check`、全部修改/新增文件的 `biome check` 以及 `pnpm --filter @rakazo/desktop build` 均 0 错误通过。
（3）真实 Electron 45 Playwright 端到端测试：运行 `standalone-startup.spec.ts`（5 项）、`smoke.spec.ts`（1 项）及 `setup.spec.ts` 回归集（6 项）共 **12 项全部 PASS**。实测证明：合成后台 `GET /` 固定返回 `404` 时桌面端零远端首页请求完成冷启动，跨重启复用 `standalone-origins.json` 中的同一回环端口并保留 `localStorage`（覆盖 H-01 基础重启项）；原端口被抢占时进入设置错误页且抢占进程收到 0 请求、原映射文件未被覆盖（覆盖 H-02 抢占项）；回环 HTTP 分区保留并回传 `__Secure-` + `Secure; HttpOnly; SameSite=Lax` 登录 Cookie（覆盖 H-07 合成项），主进程 `POST /api/v1/user-devices/pair` 与 `/api/monitoring/config` 成功携带该 Cookie 与自定义服务头且剥离能力头与 `x-sydney-main-nonce`；`A -> B` 加载失败、保存失败、`A -> A` 同端口更新配置头、`A -> A` 双重启动失败恢复后原独立会话能力钩子保持有效（`200`）及 `SYDNEY_PC_BACKEND_URL` 覆盖磁盘残留 `mode: "new"` 均通过实测（覆盖 H-06、H-11 合成项）。
（4）独立审查与未执行边界：只读审查子代理（`3003c81d-0459-48b6-b55b-6a92450d38c7`）经三轮审查确认全部问题清零（0 P0/P1/P2/P3）。未执行：本机未跑 `electron-builder` 打包产物 `Sydney.exe` E2E、未启动 Docker/PostgreSQL、未在授权公网服务器或真实阿里云无影/Slack/MCP 服务商上联调，不能视为线上网页已可停服。

2026-11-18（PA-021 生产 IP 侧载 OTA 底座包云构建 Run 44263086859 与产物验证）：（1）本机测试：`pnpm exec vitest run apps/mobile/lib/app-config.test.ts apps/mobile/lib/sideload-asset-path.test.ts --maxWorkers=1` 共 2 个文件 37 项通过，`@rakazo/mobile` `tsc --noEmit` 与 Biome 检查通过；（2）云端构建：提交 `2b613f98f` 触发 `mobile-ios-sideload.yml` Run `44263086859` 全部 29 步通过，下载产物 `sydney-ios-unsigned-44263086859-1`（Artifact ID `14410575873`，ZIP `25,755,483` 字节）解包至 `D:\33054\sydney-ipa-output\Sydney-unsigned.ipa`（`25,984,466` 字节），SHA256 为 `6a5629f2ec8ad4c5d8f9b0922d1c9e0cff525bc9eeb2528caf23dd5515e52e15`，与 `SHA256.txt` 一致；（3）包内结构核验：`Payload/Sydney.app/Expo.plist` 中 `EXUpdatesEnabled=True`、`EXUpdatesCheckOnLaunch=ALWAYS`、`EXUpdatesRequestHeaders={'expo-channel-name': 'sideload'}`、`EXUpdatesRuntimeVersion=sydney-ios-ip-1`、`EXUpdatesURL=https://u.expo.dev/c33e1434-f7d0-4c40-8839-78b050d41388`；`Payload/Sydney.app/assets/sydney/` 下全部 9 个哈希资源目录（含 `93a3d892dcb02b531b9997fa` 下的 `lilac-dragon.webp`、`orange-flower.webp`、`blue-maid.webp`）在 `main.jsbundle` 中缺失数为 `0`。未执行：iPASide 签名安装至 iPhone 真机、内置头像真机显示复测及首条 `eas update` 在线热更新实机验收。

2026-11-18（PA-021 iOS 侧载包资源路径修复本机验证）：使用已解包的 Run `44242990888` 产物复现并证实 `main.jsbundle` 中 9 个 `/assets/sydney/<hash>` 路径与 `Payload/Sydney.app/assets/sydney/<hash>` 物理目录全部因 `export_path` 前缀差异失配（如 `bot-avatars` 在 bundle 中为 `d31ffa076b14e343bc507d1e`、在包内目录为 `f0b6f8e5a304904459df2e3b`）。修复 `apps/mobile/sideload-asset-path.js` 并新增 `apps/mobile/lib/sideload-asset-path.test.ts`：运行 `pnpm exec vitest run apps/mobile/lib/sideload-asset-path.test.ts --maxWorkers=1`（3/3 通过，覆盖编译转换/落盘复制/开发服务三阶段路径一致、跨包图标幂等重入及查询前缀归一化），`@rakazo/mobile` `tsc --noEmit` 通过，Biome 检查通过；同步对 `.github/workflows/mobile-ios-sideload.yml` 内嵌 Python 校验逻辑做语法检查通过。未执行：重新触发云端 iOS IPA 构建及 iPhone 真机复测。

2026-11-18（iOS 侧载包云构建 Run 44242990888 与产物核验）：提交 `45992470f` 推送至 `cursor/integrate-remote-branches-7334` 后自动触发 `mobile-ios-sideload.yml`，Run `44242990888` 全流程通过（工程预生成、移除推送权限、Pod 安装、权限审计、Xcode Release 无签名编译、打包路径预算校验与上传）。下载产物 `sydney-ios-unsigned-44242990888-1`（ZIP `25,754,482` 字节，Artifact ID `14401216722`）并解包至 `D:\33054\sydney-ipa-output\Sydney-unsigned.ipa`（`25,984,169` 字节）：本机重算 SHA256 为 `75ccb5a73a6f6bdc4d4b88684998a3d65613d26d043e0777e914431c2c9d0a38`，与 `SHA256.txt` 完全一致；压缩包共 167 项，最长内部路径 122 字符（满足 200 字符上限），不含 `PlugIns/` 扩展；`Info.plist` 中 `CFBundleIdentifier=xin.zxlup.sydney`、`CFBundleShortVersionString=1.0.12`、`NSAllowsLocalNetworking=true`；`main.jsbundle` 包含默认后台 `124.221.182.39`、`ignoreSafeArea` 及 `chat-appearance-live-preview` 等新增界面标识，旧域名仅作为迁移守卫常量出现 1 次。未执行：IPA 个人证书签名、安装至 iPhone 真机及真机登录/云电脑/UI 验收。

2026-11-18（PA-018、PA-023 网页退役 Batch 1 桌面能力门禁与代理复验）：
（1）定向单元测试：`standalone-renderer-proxy.test.ts`、`standalone-screen-revocation.test.ts`、`proxy-request-capability.test.ts` 三个文件共 **116 项通过、2 项跳过**（既有 Windows 符号链接与显式 OpenSSL 条件跳过），覆盖双令牌隔离、固定端口绑定与 `EADDRINUSE`、120s 默认超时与 40ms 超时中止、`/sw.js` 404、顶层 `/artifacts/<含点ID>` 回退、ScreenSocket 大小写头归一化、错误页恢复导航、`<a download>` 与 `/api/csp-report`、`/html-viewer.html` 零令牌隔离及已销毁 `WebFrameMain` getter 抛错 Fail-Closed。
（2）静态检查：`pnpm --filter @rakazo/desktop check`（`tsconfig.json` 与 `tsconfig.jsdom.json`）及 6 个改动/新增文件的 Biome 检查全部通过。
（3）真实 Electron 45 强制 `403` 联测：在 `apps/desktop` 运行 `pnpm exec electron src/electron-proxy-capability-experiment.cjs`，连接开启 `requireCapability: true` 的真实 `StandaloneRendererProxy`，**13/13 项全部 PASS**（覆盖不透明错误页恢复 + 带点路由首跳 `200`、`<a download>` 触发 `will-download` 完整落盘、POST fetch 覆盖伪造头、XHR、同源 302 保留令牌、跨源 302 第二跳剥离已注入真令牌、主页面 Worker、`/sw.js` 404、无内联 CSP 的 `/html-viewer.html` 内 fetch/屏幕探测/Blob Worker 均无令牌且未达上游、noVNC 模块 + 双斜杠 WS 101 仅获 `screenToken` 且 `/api` 被拒、Wuying 脚本 + 嵌套 `container.html` 仅获 `screenToken` 且 `/api` 脚本被剥离令牌、同分区第二窗口 `403`、以及上游全程未见能力头且携带配置头）。
（4）独立审查与未验证边界：只读审查子代理（`3003c81d-0459-48b6-b55b-6a92450d38c7`）完成两轮代码复审，确认 0 P1 且 4 项 P2 全部关闭。本次仍属桌面独立模块与隐藏 Electron 实验，真实阿里云 `WuyingWebSDK.js` 请求参数、正式 `main.ts` 窗口切换、真实认证 Cookie/回调、跨后台迁移与停用服务器 `web` 容器尚未验收。

2026-11-18（PA-021、PA-022 手机端全模块 UI 优化与多语言补齐）：Windows 本机运行
15 个移动端定向测试文件（`mobile-ui-sheets`、`chat-appearance-screen`、
`chat-model-picker`、`artifacts-navigation`、`glass-surface`、`glass-title`、
`account-screen`、`computer-screen`、`thread-composer`、`i18n`、`inbox-render`、
`inbox-archived`、`unread-jump-overlay`、`share-route`、`use-mcp-oauth-return`）
共 314 项全部通过；新增 `mobile-ui-sheets.test.tsx` 覆盖 `ProjectGroupModal`
软键盘避让与多选建群、`CreateBotModal` 固定页眉关闭/头像上传格与创建门禁，扩充
`chat-appearance-screen` 综合实时预览与预设勾选断言，并修复此前 `i18n.test.ts`
在非英文词表缺失翻译项的遗留失败。`@rakazo/mobile` 全包 `tsc --noEmit` 通过，
33 个改动与新增文件的 Biome 检查通过。本次为本机离线测试与静态检查；云端 iOS
IPA 重新构建、签名安装及 iPhone 实机视觉交互仍待单独验收。

2026-11-18（PA-021、PA-022 手机端底部导航栏并排布局与覆盖修复）：Windows 本机运行
7 个移动端定向测试文件（`artifacts-navigation`、`glass-surface`、`glass-title`、
`inbox-archived`、`unread-jump-overlay`、`inbox-render`、`share-route`）共 62 项
通过；修复此前 `artifacts-navigation.test.tsx` 缺少 `useMobileTokens` mock 的遗留
失败，新增 `InboxQuickActions` 单行不换行双等宽胶囊并排、中英文项目入口路由、
`ProjectFolderCard` 无绝对定位重叠层以及 `GlassSurface` / `GlassTitle` 的
`ignoreSafeArea="all"` 断言。`@rakazo/mobile` 全包 TypeScript 类型检查
（`tsc --noEmit`）通过，9 个改动源码与测试文件的 Biome 检查通过。本次仅执行本机
离线测试与静态检查；未触发云端 iOS IPA 构建、签名安装或 iPhone 真机界面验收，
手机上已安装的旧 IPA 需重新构建安装后才会生效。

2026-11-17（PA-018 桌面独立后台能力令牌候选）：代理、屏幕撤销与注入
候选三个定向测试文件 104 项通过、2 项跳过；桌面 TypeScript 检查和五个
改动源码/测试文件 Biome 检查通过。覆盖 HTTP 与屏幕 WebSocket 的令牌
校验、伪造拒绝、正确令牌可达且不上传、每实例令牌不同、注入候选的同源
写入与跨源/跨窗口剥离。均为本机合成验证；真实 Electron 对 WebSocket/
worker/iframe/重定向的注入覆盖、正式窗口接线、生产屏幕和网页停用均未
验收。

2026-11-17（真实 Electron 能力注入实验，Epicurus）：实验文件为
`apps/desktop/src/electron-proxy-capability-experiment.cjs`，在
`apps/desktop` 通过 `pnpm exec electron src/electron-proxy-capability-experiment.cjs`
复跑。真实 Electron 观察到页面内 fetch/XHR、WebSocket、iframe 加载后的
fetch、Worker fetch 和同源重定向可注入令牌；跨源重定向剥离令牌。
关键 FAIL：首次主页面导航与 iframe 导航的 `frame` 为空，候选不注入，
受保护代理会拒绝首次加载。实验服务未强制令牌，iframe 后续请求成功不能
证明受保护代理下 iframe 加载正常。其他窗口隔离、正式代理联调和更多
Worker 类型未验证。该实验阻断正式窗口接线。

2026-11-24（剩余缺口总整改 G1–G5 — 多子代理并行与主代理收口）：
- **已执行并通过**：
  - `python -m py_compile infra/native-linux/driver.py infra/native-linux/test_driver.py`：退出码 `0`。
  - `python -m unittest -v infra/native-linux/test_driver.py`（Windows Python 离线）：**32 ran — 30 passed, 2 skipped, 0 failed**（含新增 5 项跨重启持久化、`MAX_SEEN_REQUEST_IDS` 截断、13 组损坏 JSON 降级与软链 load/save 拒绝单测；2 个跳过为既有 Linux 进程/socket 专用用例）。
  - Node v24 `module.stripTypeScriptTypes` 语法校验：全部 40 个改动/新增 `.ts` 文件通过（`failed: []`）。
  - 跨包导出/导入静态一致性核对（`@rakazo/db`、`@rakazo/adapters`、`@rakazo/contracts`、`@rakazo/adapter-kit`）及 `packages/auth/src/account-deletion-response.test.ts` 对 `apps/api/src/app.ts` 的源码顺序不变量检查通过。
  - 全工作区 `git diff --check`：退出码 `0`。
- **未执行**（本机无 `node_modules`，按协作约定未重装依赖或启动数据库/桌面/Linux 服务）：
  - 全量 TypeScript 类型检查（`pnpm typecheck`）与 Biome 检查（`pnpm biome check`）；
  - Vitest 离线单元测试（含 `project-account-lifecycle.test.ts`、`account-deletion-claim-recovery.test.ts`、`task-execution.test.ts`、`apps/api/src/routes/tasks.test.ts`、`run-tools.test.ts`、`executor.test.ts`、`apps/web/src/pages/Projects.test.tsx` 及全部前序 PA-022/PA-023 测试）；
  - 授权服务器 `pnpm --filter @rakazo/api db:migrate`（`20261124120000` + `20261124140000`）、`VERIFY_DATABASE=1` PostgreSQL 集成测试、Linux 实机 `SO_PEERCRED`/驱动重启/文件权限验收及移动端/Web 端实机联调。

2026-11-24（多子代理并行：Pi Adapters 加固 + Native Linux 加固 + `stop-that-shit` 全量评测与发现修复）：
- **已执行并通过**：
  - `python -m unittest -v infra/native-linux/test_driver.py`（Windows Python 3.13.13 离线）：25 passed，2 skipped（Linux 进程/socket 专用用例按标注跳过）；`python -m py_compile infra/native-linux/driver.py infra/native-linux/test_driver.py` 通过。
  - `stop-that-shit` 插件（独立临时 `PLUGIN_DATA`）：`node scripts/evaluate-cases.cjs` 24/24 PASS、`node scripts/sts.cjs doctor` PASS、52/57 零依赖测试文件（728 pass / 0 fail / 3 skip；5 个失败文件均因未装选装包 `effect`/`acorn`）、48 步 Antigravity Guard 端到端实测全部 exit 0（含 `agents=N`、`run_workflow`、`swarm`、文件锁、Hash/依赖拦截与诊断命令）。
  - 全工作区 `git diff --check` 通过（退出码 0）。
- **未执行**（本机无 `node_modules`，按约定未重装依赖或启动数据库/Linux 服务）：
  - `vitest` 定向测试（`executor.test.ts`、`executor-lazy-computer.test.ts`、`run-tools.test.ts`、`native-linux-sandbox.test.ts`、`project-workspace-deletion.test.ts`、`project-workspaces.test.ts`）
  - `@rakazo/adapters`、`@rakazo/api` TypeScript 类型检查与 Biome 检查
  - 授权 Linux/PostgreSQL 服务器实机验证（Unix socket `SO_PEERCRED`、真实符号链接 `cwd`、进程组清理、真实 Pi provider 与 PostgreSQL 并发）

2026-11-24（PA-022 非空项目删除、清理恢复与项目运行撤权闭环）：
本机已执行 `git diff --check` 通过，并静态核对 `20261124140000_project_workspace_deletion_claim`
迁移 SQL、`lockProjectWorkspaceForMutation` 锁顺序（Space 锁 → `project_workspaces` 行锁 → 业务行锁）、
`claim/renew/release/cancelRuns/listBots/finalize` 认领与 RESTRICT 逆序清理逻辑、
`background-job-handlers.ts` 统一项目存续守卫与僵尸 Run 取消收口、`project-workspace-deletion.ts`
受控 `runAsSystem` 拆卸流程及全部新增/更新测试文件。本机不存在 `node_modules`，按协作约定
未重装依赖或启动数据库，以下验证均**未执行**：
- `vitest` 定向离线测试（`packages/contracts/src/project-workspace.test.ts`、
  `packages/db/src/project-workspace-read.test.ts`、`packages/db/src/project-workspace-deletion.test.ts`、
  `packages/db/src/groups.test.ts`、`packages/adapters/src/background-job-handlers.test.ts`、
  `apps/api/src/project-workspace-deletion.test.ts`、`apps/api/src/routes/project-workspaces.test.ts`、
  `apps/api/src/routes/project-workspace-thread.test.ts`）
- `@rakazo/contracts`、`@rakazo/db`、`@rakazo/adapters`、`@rakazo/api` TypeScript 类型检查与 Biome 检查
- 授权服务器 `prisma migrate deploy` 与 `VERIFY_DATABASE=1` PostgreSQL 集成测试
  （`packages/db/src/project-workspace.postgres.test.ts`）及真实非空项目删除/崩溃恢复联调

2026-11-24（`backend` 工作区迁移 + PA-023 `mcp-oauth.ts` 两处并发窗口修复）：
本机已核对 `butterflyray` -> `backend` 迁移后 33 项文件集合与初始 `git diff` 哈希一致；
对 `packages/adapters/src/mcp-oauth.ts` 与 `packages/adapters/src/mcp-oauth.test.ts`
完成静态路径核对（`incrementRevisionOnIssue`、`committedTokens`、`disconnect()` 无密文行与
不可读密文行分支、`commitMaterial` 条件 `mcpServerSpace` 查询、既有断言与新增两项交错
回归测试）并执行 `git diff --check` 通过。本机不存在 `node_modules`，按协作约定未重装依赖
或启动服务，以下验证均**未执行**：
- `vitest` 定向测试（`packages/adapters/src/mcp-oauth.test.ts`、
  `packages/adapters/src/secret-persistence.test.ts`、
  `packages/adapters/src/mcp-oauth.postgres.test.ts` 及前述 PA-022/P3 定向测试）
- `@rakazo/adapters` 及相关包 TypeScript 类型检查与 Biome 检查
- 授权服务器 PostgreSQL 真实锁并发与真实 MCP OAuth 服务商端到端验收

2026-11-24（PA-022 / PA-023 / P3 后端三项按序补强）：本机已执行
`git diff --check` 通过，并静态核对认证组织拦截、`beforeRemoveMember`
钩子与 `TS6059` 修复、MCP OAuth 动态客户端回调绑定/暂存/revision 锁校验、
`executor.ts` `resolveModel` 预算包装以及 `tasks.ts` 通知与审计代码。本机
不存在 `node_modules`，按协作约定未重新安装依赖或启动服务，以下验证均**未执行**：
- `vitest` 定向测试（`packages/db/src/project-account-lifecycle.test.ts`、
  `packages/db/src/groups.test.ts`、`packages/auth/src/account-deletion-response.test.ts`、
  `packages/adapters/src/mcp-oauth.test.ts`、`apps/api/src/routes/tasks.test.ts`）
- `@rakazo/db`、`@rakazo/auth`、`@rakazo/adapters`、`@rakazo/api` TypeScript
  类型检查与 Biome 检查
- 真实 PostgreSQL 并发、真实 MCP OAuth 服务商回调/断开竞态、真实 Pi 运行时与
  managed task 中断/预算端到端验收

2026-11-24（PA-022 项目工作区与项目内会话后端闭环）：本机已执行
`git diff --check` 通过，并静态核对新增迁移 SQL、既有外键/RLS/触发器兼容、
`projectWorkspaces` 契约严格校验、API 路由门禁与错误映射、以及涉及测试
桩与断言（含修正 `thread-read.test.ts` 与 `groups.test.ts` 的
`projectWorkspaceId` 断言）。本机工作区不存在 `node_modules`（确认
`Test-Path node_modules` 为 `False`），按协作约定未重新安装依赖或启动
PostgreSQL/Docker，以下验证均**未执行**：
- `vitest` 定向离线测试（`packages/contracts/src/project-workspace.test.ts`、
  `packages/db/src/project-workspace-read.test.ts`、`packages/db/src/groups.test.ts`、
  `apps/api/src/thread-read.test.ts`、`apps/api/src/routes/project-workspaces.test.ts`、
  `apps/api/src/routes/project-workspace-thread.test.ts`）
- `@rakazo/contracts`、`@rakazo/db`、`@rakazo/api` TypeScript 类型检查与 Biome 检查
- 授权服务器 `prisma migrate deploy` 与 `VERIFY_DATABASE=1` PostgreSQL 集成测试
  （`packages/db/src/project-workspace.postgres.test.ts`）
- 真实数据库下的项目创建、重命名、项目内 Bot/群聊创建及文字聊天端到端联调

2026-11-16（PA-021 手机默认后台地址迁移）：静态核对默认来源及旧
会话绑定分支，更新专属测试以覆盖缺失、旧域名、IP、未知及损坏作用域；
按用户偏好未执行测试、类型检查、构建或真机验证。新 IPA 尚未生成，
现有安装包行为不会因源码修改改变。

2026-11-16（PA-018 桌面独立后台服务头候选）：代理及屏幕撤销两个
定向测试文件 98 项通过、2 项跳过；桌面 TypeScript 检查与三个改动
源码/测试文件 Biome 检查通过。覆盖配置快照、大小写覆盖、无效或不匹配设置、私网明文
密钥拒绝、loopback 兼容、匿名 noVNC/Wuying 页面凭据剥离、HTTP 与
WebSocket 跳转拒绝及 WebSocket 配置头。均为本机合成服务；未验证真实
账号/网关/屏幕、正式 Electron 接线、跨后台 session 隔离或生产网页
服务停用。独立 review 及复审确认上述修正逻辑成立；loopback 调用者
认证缺失仍构成正式接线阻断。

2026-11-14（旧登录网关候选）：Caddy 模板静态检查及 Compose
环境配置测试共 27 项通过，相关 Biome 检查和隔离脚本 Bash
语法检查通过。脚本新增未设置、显式 Web、显式 API 三种上游
模式及查询日志脱敏断言；未运行 Caddy、Docker 或真实 API，
不能证明路由、证书、响应头、容器更新或回滚在运行时通过。
初次调用系统 bash 因 WSL 缺少 `/bin/bash` 失败，改用本机
Git Bash 完成语法检查。子代理审查的网关与 API 开关错序、
普通网页登录受影响及路径匹配等问题仍需集成验收。
脚本中的 6 段 Python 代码也完成静态语法解析，未实际执行。
子代理复审提醒镜像可能预置上游变量；脚本已在 `unset` 模式
拒绝这类镜像，Bash 语法复查通过，实际镜像检查尚未执行。

2026-11-14（旧验证邮件与来源）：认证包离线测试 7 个文件共
230 项通过，包含启用新回跳后旧链接仍回 `/sign-in`、过期和
伪造令牌以及不可信回跳拒绝；API 兼容页与配置两个文件 99 项
通过，Biome 检查通过。Better Auth 在测试环境默认跳过来源及
相关 CSRF 校验，已显式开启后复测；生产默认行为按锁定版本
本就开启，不代表实际部署或移动端已验。兼容页是独立 Hono
测试，实际 API 组装、公开网关、真实邮件和回滚仍未验证。
API 类型检查随后以单进程条件单独重试，仍因 Windows 内存
分配失败退出，没有获得类型检查结论。

2026-11-14（邮箱验证网页依赖）：本地 Vitest 三个定向文件
162 项通过；子代理复审后补充错误参数和 token 不反射、重复
链接的地址与账户状态断言，相关 2 项复测通过、64 项跳过。
离线测试覆盖默认旧回跳、新邮件地址、伪造令牌、重复链接、
静态页面及配置校验；不覆盖真实邮件、过期令牌、线上代理、
真实手机和桌面。相关 Biome 检查通过。API TypeScript 检查
与测试并行运行时因 Windows 内存分配失败中止，未取得类型
检查结果；未部署、切换入口或启用开关。
随后单独运行认证包类型检查，因现有
`account-deletion-response.test.ts` 跨包引用超出该包 `rootDir`
而报 TS6059，故认证包类型检查亦未通过。

2026-11-14（会话替身复审）：子代理指出最初测试没有检查候选
侧模式复位及共享窗口并存；已增加第二个共享窗口和候选侧复位
后的请求检查，重跑 1 项通过。模式复位只是测试变量变化，
不等同正式失败回滚，也不证明真实登录或数据迁移可用。

2026-11-14（桌面会话切换替身）：Windows 本机 Playwright
启动 Electron、临时 profile 和合成回环服务，1 项通过：
共享 session 模式切换改变旧窗口读取结果；分开 session 时，
候选读取内置内容且旧窗口持续读取合成远端。它没有执行正式
`main.ts` 的切换或失败恢复，不验证 Cookie、登录、真实资源、
持久数据、权限和并发；不能据此宣布可接线或退役网页。
此前尝试的启动接线曾通过 68 项定向测试及类型检查，但因审查
发现未覆盖的风险而撤回，测试结果不代表现有正式链已改变。

2026-11-14（桌面启动准备）：Windows 本机候选代理定向测试
93 项通过、2 项跳过；桌面 TypeScript 检查通过。缺失入口、
目录入口和修复后重试已覆盖；合成服务仅响应健康请求，响应
通过正式 `isRakazoHealth` 校验，本地页面和脚本来自替身资源。
首次运行创建文件符号链接时报 EPERM；该越界符号链接用例在
Windows 跳过，另一项为既有跳过用例。真实服务、安装包、
Electron 启动和无网页服务的产品路径均未验证。

2026-11-14（无影根路径浏览器）：定向 Chrome 1 项通过，包含
直接导航和一次同前缀跳转；使用合成回环服务、无上游 CSP。
该测试验证脚本执行和本地存储拒绝，不验证真实 SDK、实际
Electron 桥、完整跳转链、真实账号或云电脑连接。
子代理静态复审指出不透明页面内跳转至入口及固定资源带查询串
可能被来源白名单拒绝；当前直接导航测试不能证明这两种路径
可用，真实请求头和实际 SDK 行为仍待验证。

2026-11-14（桌面无影响应候选）：代理测试 90 项通过、1 项
跳过；Chrome 合成浏览器 5 项通过，其中无影上游不提供 CSP。
子代理指出根路径缺失沙箱后修正并复测代理；Chrome 测试在
根路径修正前执行，不覆盖根路径、真实 SDK、直接打开和跳转。
相关资源是合成内容，未连接云电脑或生产。

2026-11-14（桌面屏幕 CSP 浏览器复验）：默认 Playwright 浏览器
缺失导致首次启动失败，改用本机 Chrome 后桌面代理浏览器测试
5 项通过，包含无上游 CSP、上游允许同源、合成 noVNC 模块及
WebSocket。该测试使用合成服务和临时目录，未证明真实 Electron
preload、真实画面、登录或生产/CDN 的行为。
子代理复审发现 `/novnc#section` 跳转被错误丢弃，改用 URL
pathname 检查后，含片段和查询的定向跳转测试 1 项通过（88 项
跳过）；尚未验证浏览器跟随跳转及 Wuying 缺少上游 CSP 的情况。

2026-11-14（桌面屏幕隔离候选）：代理测试 88 项通过、1 项
跳过，桌面 TypeScript 通过，覆盖上游无 CSP 或允许同源时追加
沙箱、移除 Cookie/清除数据头及屏幕跳转范围。隐藏 Electron
合成 iframe 实验表明不透明沙箱阻止直接读父桥；未验证实际
浏览器对候选代理 CSP 的作用、真实 noVNC、PDF 和屏幕兼容。

2026-11-14（桌面同源子页面借桥）：根据子代理审查扩展实验，
同源子 frame 直接调用自己的桥被拒，但调用父页面的桥成功，
合成后台收到第二次固定写入；隐藏 Electron 1 项通过，测试
明确断言这一风险。使用测试配置与自定义守卫，不能认定真实
产品存在同样的可利用路径；实际 iframe、CSP 和产品桥待验。

2026-11-14（桌面子 frame IPC 替身）：隐藏 Electron 定向 1 项
通过；首次因原断言只预期一个拒绝而失败，实际有同来源和沙箱
两个 frame 拒绝，明确断言两者后复测通过。测试特意启用子 frame
preload，不能推断产品配置或真实业务权限；worker 转发、导航
竞态、真实会话和撤销仍未验证。

2026-11-14（桌面 IPC 写入替身）：桌面目录运行 Playwright
隐藏 Electron 实验 1 项通过，合成后台仅收到一次固定认证写入，
第二窗口及导航后未新增写入；沙箱 iframe 可能无桥、worker 只
检查桥不存在。首次在仓库根运行解析到其他命令而失败，改在
桌面目录执行通过。未接真实业务、会话、后台或生产。
复审后增加门禁拒绝分类及服务端开始请求记录并复测通过；
仍未直接测试子 frame 发起 IPC、真实认证和请求在途撤销。

2026-11-14（桌面本地路由候选）：4 项定向测试通过（82 项
跳过），覆盖本地带点导航、缺失脚本和多层路径、HTML 零权重、
缺失本地文件及目录回退；相关 Biome 通过。使用合成代理与
上游，未验证真实 Electron 导航头、登录、生产或桌面包。

2026-11-14（MCP 会话消费过期）：定向两项通过（96 项跳过），
模拟读取会话后时间跨过十分钟并确认不发换码请求；adapters
TypeScript 和相关 Biome 通过。数据库是测试替身，未验证真实
PostgreSQL 时钟、并发、跨进程或撤销行为。客户端注册迁移为
子代理静态分析，未接真实服务商。
复审指出截止时间在发起删除前计算，数据库排队期间仍可能过期；
内存和数据库创建时间也可能不同，精确边界受定时器影响。当前
改动只收窄窗口，不保证数据库执行时严格过期，需真实数据库复验。

2026-11-14（MCP 回调接线候选）：服务端回调选择及环境校验
定向 6 项通过（466 项跳过），手机回调解析及 hook 23 项通过，
API 和手机 TypeScript 分别通过。测试使用替身，未验证实际
代理、服务商注册、旧版应用和真实设备；授权并发仍未解决。
复审后只允许 API 回调显示回填入口，首轮手机测试因夹具仍使用
旧网页路径失败；修正夹具后两组 24 项通过，覆盖网页回调不显示
回填入口。真实浏览器行为仍未验证。

2026-11-14（Caddy 查询串遮盖候选）：三份模板对应静态测试
10 项通过；使用 JavaScript 模拟配置正则验证编码参数、普通
查询及路径凭据，不等于真实 Caddy 验证。隔离代理脚本新增新旧
MCP 回调、编码参数、未知参数及上游原样接收检查，尚未执行；
本机未发现 Caddy，未启动 Docker 或检查生产、CDN 和日志采集。
子代理复审发现隔离脚本可能未等到回调日志即通过，已增加两个
站点的新旧回调日志存在断言及完整 Caddy 输出的合成秘密检查；
静态测试也分别核查 IP 模板两个站点。脚本仍未执行。

2026-11-14（MCP 独立回调页候选）：7 项定向测试通过，覆盖静态
响应安全头、不反射参数、不发起兑换、脚本清除地址栏以及正常和
异常参数；API TypeScript 通过。脚本在合成环境运行，非真实
浏览器或手机；尚未测试代理日志、真实服务商注册和端到端授权。
子代理进行了原手机回跳的静态审核，未连接生产或执行测试。
子代理复审新页面后补齐超长授权码和控制字符检查；刷新后地址
不可恢复，代理对编码参数名的日志过滤风险仍待隔离环境验证。

2026-11-14（MCP 手机回跳本地复验）：回调解析、共享 hook 与
集成页面三组定向测试共 53 项通过，覆盖错误地址、会话或空间
变化、旧服务端、失败、重复提交及捕获上下文时取消；手机
TypeScript 和 5 个相关文件 Biome 检查通过。插件页独立交互、
真实 OAuth 提供商、浏览器回跳及 iPhone 均未验证，不能证明
网页可退役；此前 API 定向两项通过的范围见下方记录。

2026-11-14（MCP 原生回跳契约）：后台两项定向测试通过（372 项
跳过），解析器 14 项通过；初次并行 API/手机类型检查因本机
内存不足失败，之后 `GOMAXPROCS=2` 串行分别通过。相关 Biome
检查通过；新解析器尚未接界面，未验证真实 OAuth、回调落地、
手机或生产。

2026-11-14（手机插件 MCP 授权参数）：后台现有“原生客户端省略
回调”定向用例 1 项通过（其余 372 项未执行），手机 TypeScript
及修改文件 Biome 通过。未运行插件页面交互测试、真实 OAuth 或
iPhone 验收；网页回调仍存在。

2026-11-14（既有桥来源行为）：badge 定向测试 15 项、桌面类型
及相关 Biome 通过，包含自定义 scheme 不被现有桥信任；静态核查
`safeOrigin` 可能返回字符串 `null`。未变更生产桥或做实际接线。

2026-11-14（IPC 身份隔离替身）：隐藏 Electron 临时 profile 的
合成 IPC 写入实验 1 项、相关 Biome 通过；仅可信主 frame 写入
计数为 1，沙箱 iframe、worker、外部窗口和导航后的调用未增加。
无真实认证、任意 RPC、文件流或画面数据；该结果不能推广为产品
安全验收，原自定义协议 worker 绕过风险仍存在。

2026-11-14（opaque 沙箱 worker）：首轮按预期拒绝的测试失败；
调整为风险复现后 Electron 1 项及 Biome 通过。合成 sandbox
`allow-scripts` iframe 的 worker 收到 200，上游记录合成 Cookie
写入；协议处理器请求没有 Origin 或 Referer。该夹具不包含产品
无影或 noVNC 的完整 CSP，真实风险尚未确认。

2026-11-14（Electron worker 门禁绕过）：初始期望门禁拒绝的
测试失败，确认外部 iframe 创建的 blob worker 得到 200 且合成
上游收到带 Cookie 的写请求，实验监听未捕获该 worker 请求；
调整为明确断言风险。隐藏 Electron、临时数据与合成服务，不代表
所有 Electron 版本或生产条件。门禁未通过安全验收。

2026-11-14（稳定来源跨进程）：隐藏 Electron 进程正常关闭重启，
同一临时 profile 和分区下合成 localStorage 与 IndexedDB 仍在；
1 项实验及 Biome 通过。未验证非正常退出、真实用户数据、Cookie
持久化、生产认证或实际产品接线。

2026-11-14（Electron 请求归属替身）：隐藏 Electron 中先复现
外部 iframe 和外部窗口各一次带合成 Cookie 的写入；启用实验
门禁后两者拒绝、上游写入次数保持 2，主 frame 合成请求正常。
iframe 与主窗口使用同一 webContentsId。1 项实验及 Biome 通过；
不代表所有 frame、worker、重定向和真实认证已安全。

2026-11-14（自定义协议跨来源风险复现）：同一临时 Electron session
中的合成外部页面调用实验协议，返回 200 且合成上游实际收到带
合成 Cookie 的写请求。1 项实验及 Biome 通过表示风险被复现，
不表示安全验收通过；不涉及真实账号或生产。

2026-11-14（自定义稳定来源 Electron 替身）：1 项通过，验证
临时协议、两端口、合成 localStorage/IndexedDB、Cookie 和 POST。
Cookie 存在 loopback 会话而非自定义来源，上游合成 POST 未收到
Origin；实验不验证真实登录、CSRF、OAuth、WebSocket、重定向、
后台凭据保护或应用重启后数据，不能视为完整方案。

2026-11-14（动态端口 IndexedDB 补验）：Electron 临时替身在第一
端口建立合成数据库，在相同分区的另一端口枚举不到该数据库；
定向用例与 Biome 通过。未测试实际素材迁移或安装升级。

2026-11-14（界面存储使用核查）：静态检查聊天草稿、头像库及
聊天外观源码，确认分别使用 localStorage 或 IndexedDB；未运行
真实用户数据迁移或验证 IndexedDB 跨端口行为。

2026-11-14（动态端口数据边界）：Electron 替身 1 项通过，覆盖
同一分区、同一合成后台、两个代理端口下 Cookie 共享与 localStorage
隔离；验证的是两个同时存在的端口，未执行真实安装升级或重启。
IndexedDB、服务工作线程及真实用户数据未测试。

2026-11-14（独立桌面会话分区）：配置测试 54 项、隐藏 Electron
替身 1 项、桌面 TypeScript 和相关 Biome 通过；不同后台分区未
共享合成 Cookie，同一分区会共享。仅使用临时用户目录和替身后台；
真实登录、OAuth、升级、旧数据迁移及本机进程攻击仍未验。

2026-11-14（不同后台 Cookie 隔离实验）：Chrome 使用临时合成
Cookie 和两个后台，观察同一上下文跨端口发送 Cookie、独立上下文
不发送；3 项浏览器测试及相关 Biome 通过。这是风险复现和浏览器
上下文实验，不是 Electron 分区、旧数据迁移或本机攻击防护验收。

2026-11-14（画面撤销联测）：桌面 loopback 与后台 noVNC 代理
串联，授权替身先允许后拒绝，观察握手成功、至少两次授权查询、
客户端与画面替身连接关闭；1 项通过，桌面类型和 Biome 通过。
授权服务是替身，未验证真实账号、票据校验或生产撤销。

2026-11-14（桌面画面可信 TLS 替身）：使用带本地 IP SAN 的
一次性证书，同一测试依次确认默认拒绝及测试进程临时信任后成功
升级；85 项通过。信任列表和临时文件在测试结束后恢复清理。
仍未验证真实 CA、生产证书、授权撤销或 Electron。

2026-11-14（桌面画面 TLS 拒绝）：使用本机 OpenSSL 生成一次性
自签证书和临时 HTTPS 上游，85 项代理测试通过，确认未到达上游
WebSocket 升级；桌面 TypeScript 与相关 Biome 通过。无 OpenSSL
路径时该项跳过。未测试可信 TLS 成功、真实服务或授权撤销。

2026-11-14（画面连接断线与超时）：定向代理测试 84 项通过，
涵盖上游升级后断开以及握手超时关闭两端；测试将 20 秒计时缩短
以验证行为，未等待实际 20 秒。测试类型错误修复后桌面 TypeScript
通过，相关 Biome 格式检查通过。真实网络与授权撤销尚未测试。

2026-11-14（WebSocket 补充复验）：增加上游拒绝时敏感响应头不
透传，以及代理停止时未完成握手的两侧连接关闭测试；代理测试
共 82 项通过。其余真实 HTTPS、授权撤销和设备验收限制不变。

2026-11-14（桌面画面 WebSocket 合成验证）：80 项代理单元测试
通过，包含双斜杠、双向数据、Cookie/Authorization 和 Set-Cookie
剥离、来源及路径拒绝、错误握手和停止；Chrome 两项替身测试通过，
其中 opaque 沙箱通过 WebSocket 收到合成消息。桌面 TypeScript
及相关文件 Biome 通过。真实 HTTPS、握手超时、后端票据撤销、
Electron、真实 noVNC 和云电脑尚未验证；不代表生产可用。

2026-11-14（桌面 WebSocket 设计核查）：静态阅读桌面升级拒绝、
后台 noVNC 双斜杠归一、能力校验与持续授权代码；没有执行真实
WebSocket、Electron 或云电脑测试，升级功能保持未实现。

2026-11-14（桌面 noVNC 资源合成验证）：修复前 Chrome 替身的模块
保持未加载；修复后 noVNC 与无影浏览器用例共 2 项通过，代理单元
77 项通过，桌面 TypeScript 检查和三个相关文件 Biome 格式检查通过。
使用临时上游及合成能力值，没有连接真实云电脑。真实票据授权、
Electron、WebSocket、现有会话和生产均未验证。

2026-11-14（网页退役 PA-023 桌面代理浏览器与定向验证）：本机 Chrome
搭配临时 loopback 代理及合成后台，首次复现无影 opaque 内层容器 403，
脚本未加载；修复后 1 项浏览器通过，固定资源实际执行、内层正文
可见、请求未携带 Cookie，合成 Secure/HttpOnly Cookie 可在 Chrome 的
127.0.0.1 保存并发给合成后台。此非 Electron、真实 HTTPS/SDK 或生产。
`standalone-renderer-proxy.test.ts` 75 项通过，包含匿名请求剥离
Cookie、Authorization、附加 API 密钥和上游 Set-Cookie，拒绝其他
路径/查询/目的地；桌面 `tsc --noEmit` 通过，四文件 Biome 通过。
验证未覆盖真实 noVNC、WebSocket、代理切服、现有登录迁移和本机其他
进程；代理未接线、未构建安装包，不据此停用网页。

2026-11-14（网页退役 PA-023 复审返修后的实际结果，替代本轮早期草案验收）：

- 无影 API/env/Compose 首轮定向复验 3 文件 114 项通过；EACCES 使用 `open` 替身注入，未验证 Linux 运行账号 ACL。浏览器指定本机 Chrome，`wuying-api-isolation.spec.ts` 4 项通过，包含模拟网关 SAMEORIGIN 与固定内层例外、内层实际正文、opaque 隔离和缺失 SDK 503。不是实际 Caddy 或厂商 SDK。
- 密码页/Auth/手机解析/登录界面/API 回归 5 文件 430 项通过；随后增加 HTTPS 开关校验、手机原生成功/跨服拒绝组件用例，与无影合并为 6 文件 204 项通过。最后补三种网关模板静态断言，并调整 Auth 测试的合成链接后，两文件再验 72 项通过。这些批次有重叠，不累加作为新增用例数量。
- `native-password-reset-api.spec.ts` 1 项浏览器测试通过：真实静态页的 CSP 哈希脚本可执行，重复 token 拒绝且不发请求，GET 不调用认证，地址栏查询清理，429 后可再次提交并成功清空密码。认证上游为合成夹具，不是完整产品 API。Auth 用例使用真实 Better Auth 路由和内存适配器，验证公开来源先映射、密码长度失败后可重试、成功后重放与过期拒绝、旧邮件生成兼容。
- Slack 4 文件 98 项替身复验通过，详见本文件下一条；API 与手机各自直接运行已安装的 `tsc --noEmit -p tsconfig.json` 通过。最初 API 检查发现新密码页 `context.body(string | null)` 不符合 Hono 重载，已拆分 HEAD/HTML 分支并复验通过。
- 本轮 19 个直接相关源码/测试文件最终 Biome 检查通过；最初格式/导入检查失败已按现有格式工具修正。相关已跟踪写集 `git diff --check` 通过；IP 演练脚本 Git Bash `bash -n` 通过，新增最终头断言未实际运行 Caddy。未重跑无改动的 SDK 脚本和桌面代理测试，保留其此前报告。
- 未运行 Postgres 迁移、Docker、全量构建、生产服务、真实 SMTP/Slack/SDK、iPhone 或产品 Electron。移除的是本地未部署的短时重置表草案，未删除任何真实表或数据；新实现无需该表。当前后台入口、双端地址和所有生产开关未改，网页不可停。

2026-11-14（网页退役 PA-023 Slack 交付复核）：当前窗口重跑
`apps/api/src/routes/messaging-install-return.test.ts`、
`packages/adapters/src/messaging-installations.test.ts`、
`apps/mobile/lib/messaging-install-return.test.ts`、
`apps/mobile/lib/messaging-screen.test.tsx`：4 文件 98 项全部通过。
覆盖原网页兼容、固定回跳与参数拒绝、会话归属/领取、取消、超时、
切服与重复流程，使用合成持久层及授权窗口。已静态阅读 API/adapter/
手机主路径，属于当前窗口复核；不是新增独立 review，也不能证明
真实数据库、Slack 或 iPhone 通过。新迁移、冷启动及实际设备均未验收。

2026-11-14（网页退役 PA-023 找回密码复审调整）：Rawls 返回多项 P1，
原“本地模块验证完成”和“当前服务器绑定”等结论撤回。原有通过记录
只表示当时测试通过，未覆盖真实安全组合。当前实现已改为 API 独立
重置页与原生手动粘贴，不再有 scheme/state/短时表。旧草案 68 项及
其余通过数量不能直接作为新实现验收，新的验证结果单独记录。

2026-11-14（网页退役 PA-023 无影独立复审）：Fermat 返回 1 项 P1
（网关 SAMEORIGIN 阻断 opaque 祖先下的嵌套容器）和 3 项 P2
（资源预检未检查可读性、无影 CSP 未启用报告、文档仍记旧部署失败）。
其浏览器负例已复现拦截；当前窗口开始返修，修复后的结果待记录。
复审与既有浏览器通过结果均不代表真实 Caddy 或云电脑已验收。

2026-11-14（网页退役 PA-023 原生找回密码，本地实际结果）：

- `pnpm exec vitest run packages/auth/src/identity-trust.test.ts apps/api/src/native-password-reset.test.ts --maxWorkers=1`：68 项通过，包含 Better Auth 离线邮件链接重写、默认旧链接、公开回跳、会话哈希和一次性原子领取、重复/畸形/过期/错误参数、关闭页安全头及原网页重置回归。测试使用内存适配器与合成数据库，不是真实 Postgres。
- `pnpm exec vitest run apps/mobile/lib/password-reset-link.test.ts apps/api/src/native-password-reset.test.ts --maxWorkers=1`：8 项通过，覆盖手机深链接格式、歧义参数、伪造来源及原有粘贴链接解析。
- `pnpm exec vitest run infra/updater/src/compose-env.test.ts --maxWorkers=1`：14 项通过；补齐此前遗漏的四个既有环境变量透传，并加入原生找回密码开关。四种部署组合的 API/Worker 允许清单一致。
- 运行已安装的 Prisma CLI 重新生成本地 Client；执行过一次因本机 Node 22.22.0 低于仓库 engines 而被 pnpm 拒绝，改用现有 CLI 成功。`apps/api` 的完整 TypeScript 检查在 Slack 子任务写入中间状态时曾出现其临时文件的 5 个错误；与本模块无关，待并行任务结束后统一复验。单独的本模块定向 Biome 检查通过，未把中间状态计入最终结果。
- 未运行数据库迁移、真实邮件投递、自定义 scheme 冷启动、iPhone 回跳、重复回调、切服实测或生产开关。P0/P1 安全结论以独立复审返回后再决定修复。

2026-11-14（网页退役 PA-023 无影画面，本地实际结果）：

- `pnpm exec vitest run apps/api/src/wuying-assets.test.ts apps/api/src/env.test.ts --maxWorkers=1`：99 项通过；最终加入部署环境检查的同轮重跑，这两文件仍全部通过。覆盖完整资源、GET/HEAD、缺失、编码路径、越界 junction 和配置缺失，资源副本比较使用确定性夹具，不依赖忽略文件是否下载。
- `node --test scripts/wuying-web-sdk.test.mjs`：7 项通过。使用合成内容和内存 HTTP 响应，无真实下载；验证双目标一致、补丁、离线检查、第二文件 HTTP/摘要/超时/缺少 head 时旧文件保留，以及暂存失败清理。超时用例注入 TimeoutError，并非实际等待 30 秒。
- `apps/web` 下指定本机 Chrome，执行 `pnpm exec playwright test --config playwright.screen-proxy.config.ts wuying-api-isolation.spec.ts`：3 项通过。使用真实新资源路由和自有 screen/storage 脚本、合成 SDK；外层和内层均不能读父页面或应用存储，应用接口请求被 CSP 阻止，查看/控制状态正确，授权片段未发至服务器，SDK 缺失返回 503。不是实际完整 API 启动、阿里云 SDK 或云电脑验收。
- `pnpm exec vitest run apps/desktop/src/renderer-assets.test.ts --maxWorkers=1`：10 项通过，包含无影入口、脚本、嵌套容器及编码路径不被本地页面覆盖。未启动产品 Electron 或构建桌面包。
- `apps/api` 下 `node ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`：通过。8 个本轮新模块/脚本及桌面资源文件的定向 Biome 检查通过；首次检查的格式和测试 Cookie 警告已修正。
- 四个 Compose 文件经已有 YAML 库解析及无影环境/构建参数断言通过；Git Bash `bash -n` 和 6 段内嵌 Python 编译通过。用当前 IP 模板在临时目录实际运行配置变换，保留两种画面上游占位符和 API/Web 的 loopback 映射，未启动 Caddy。IP 隔离脚本新增五条无影路由断言与合成上游注入，但未执行 Docker/Caddy 演练，静态解析不能代表网关兼容通过。相关文件差异空白检查通过。

扩展检查 `infra/updater/src/compose-env.test.ts`：14 项中 10 项通过、
4 项失败；与两份 API 测试合计 109 项通过、4 项失败。差异为四种
部署组合均遗漏既有 `RAKAZO_TOOL_INTENT_ROUTING`、
`SYDNEY_COMPANION_SCREEN_EXPERIMENT`、
`SYDNEY_PROJECT_CONVERSATION_CREATE_EXPERIMENT`、
`SYDNEY_PROJECT_CREATE_EXPERIMENT`；无影新配置在扫描及 YAML 断言中
存在。这是历史失败，后续已补齐透传并复验 14 项通过，见本文件上方
原生找回密码验证；未借此放开其他实验功能或修改其部署边界。
无真实 SDK 下载、镜像构建、数据库、生产切流、回滚或手机验证。

2026-11-13（画面网关演练脚本）：使用本机 Git Bash 的 `bash -n`
检查脚本，通过；6 段内嵌 Python 通过编译；使用当前 IP 模板和临时
目录运行配置变换，确认保留上游环境占位符及 API/Web 模拟端口。
子代理静态审核发现的问题已修正；未运行 Docker、Caddy、真实上游或
双端。脚本每次只验一种模拟上游，显式注入 loopback 地址，不验证
Compose 环境传递、Caddy 默认上游或实际服务地址。
复审指出 WebSocket 访问日志可能迟于客户端结束，脚本现限时等待画面
记录出现再校验脱敏；该时序修正尚未运行 Caddy 验证。

2026-11-13（画面代理复审复验）：根据子代理复审补齐 Cloudflare
示例、IP 演练脚本的默认网页上游变换，握手测试增加上游已接收及
超时原因断言，并覆盖上游返回非 101 后关闭。最终浏览器测试 27 项
通过、6 项按条件跳过；API 分流和环境测试 96 项通过，API TypeScript
检查通过。子代理再次静态复核未发现新的明确阻断问题；未运行 Caddy
或 IP 演练，演练脚本当前只覆盖默认网页上游，不代表 API 切流通过。

2026-11-13（网页退役画面转发候选）：API 路由分流和环境配置的
Vitest 测试 96 项通过；API TypeScript 直接运行已安装编译器通过。
代理迁移后的 Playwright 使用本机 Chrome、模拟授权与上游，网页开发、
网页预览及 API 分流替身共 26 项通过、4 项按测试条件跳过；覆盖页面
隔离、HTTP、WebSocket、撤权、断线和握手超时。专用超时用例因测试
上游 URL 含查询串最初超时，修正匹配后通过。子代理做静态审核，未将
模拟 API 视为真实 API 或生产证明。`pnpm --filter @rakazo/api check`
因本机 Node 22.22.0 低于仓库要求而被拒绝，改用已有编译器验证；
Caddy 配置尚未用 Caddy 校验，也未验证生产、真实 API 启动、桌面或
手机。线上回滚、双斜杠路由及已有 WebSocket 设备连接仍需实测。

2026-11-13（网页退役画面代理基线）：先按常规配置运行，6 项通过、
2 项跳过、10 项因缺少 Playwright 浏览器启动失败，且常规配置额外启动
了本地网页开发服务器。改用专用配置和本机 Chrome 后，因缺少 Playwright
录像组件失败；关闭专用配置录像后再次运行，16 项通过、2 项按原测试
规则跳过，覆盖模拟授权、HTTP、WebSocket、撤权和浏览器隔离。该结果
仅针对现有 Vite 代理和本机模拟服务，不证明独立代理、生产或真机通过。

2026-11-13（回调兼容复验）：子代理指出旧 `WEB_ORIGIN` 可包含路径；
关闭开关时恢复原字符串拼接并补充带路径样例。回调、环境和连接定向
测试共 7 项通过；子代理已静态复核该修正。未验证真实部署。

2026-11-13（托管连接回跳分阶段切换）：新增默认关闭的配置及 Compose
透传，定向测试 6 项通过，覆盖默认旧地址、新地址两种来源、新旧关闭
页、CSP 哈希和不反射参数；API 类型检查通过。未实际部署、运行 Compose、
访问第三方或验证混合版本，开启前仍需按运维步骤验收。

2026-11-13（网页退役 PA-023）：画面授权和 noVNC 处理迁至 core 后，
相关测试及 Vite 配置测试共 64 项通过，core 类型检查通过。托管连接
回跳最初因 Hono 不接受路径数组而出现 404，修复为逐路由注册后新旧
路径测试 2 项通过；连接创建的两个公开来源分支测试通过，API 类型
检查通过。以上为本地替身和定向检查；未验证真实授权、反向代理、
旧版 API 滚动升级、WebSocket 画面或生产环境。

2026-11-13（网页退役 PA-023 桌面图标）：共享图标与原网页图标的
SHA-256 一致；桌面静态复制脚本语法检查和相关差异空白检查通过。
未运行品牌资源批量导出、桌面构建或窗口视觉验收，尚不能视为桌面
不依赖网页。

2026-11-13（iPhone 连接核查）：Windows 显示 Apple iPhone 状态正常，
设备库查询到 1 台设备；两个候选应用标识的定向查询成功但无匹配。
设备连接不等于客户端功能验收；现有本地 IPA 日期早于本轮代码改动，
未验证当前代码在 iPhone 上的运行效果。

2026-11-13（手机自动链接复核）：增加非标准 Podfile 调用的保护测试后，
应用配置和自动链接插件 2 个文件共 35 项通过。此前直接 `search` 找到
陪伴模块只说明发现阶段包含该模块，不能证明 Podfile 最终没有排除它；
现已确认本机 Expo 的 CocoaPods 实现会把 Podfile 的 exclude 参数传入
解析命令，真实 CocoaPods 执行仍未验证。

2026-11-13（手机自动链接修复）：手机 TypeScript 检查通过；应用配置
与 Podfile 插件定向测试首轮 34 项通过。已安装的 Expo 自动链接器在
Apple 搜索中传入 `--exclude sydney-companion` 后不再列出该模块。
尚未执行真实 iOS 预构建、CocoaPods、Xcode 构建或设备安装。

2026-11-13（手机自动链接验证）：在手机项目目录执行已安装的
expo-modules-autolinking 57.0.16 的 `search --platform apple`，搜索结果
包含 sydney-companion；该结果验证了普通配置下模块仍被发现，不代表
Xcode 编译或安装结果。未运行原生构建。

2026-11-13（手机构建核查）：静态查阅已安装的
expo-modules-autolinking 57.0.16 源码，其配置加载器读取 package.json。
未执行 iOS 预构建或安装包构建，无法断言最终原生模块列表；现有
app.config.ts 排除策略和手机类型检查仍待修复及验证。

2026-11-13（基础验收续）：重新生成 Prisma Client 后
`pnpm exec tsc --noEmit -p apps/api/tsconfig.json` 通过；后续 5 个定向
测试文件共 419 项通过，包含服务端会话、手机 API 和模型选择测试。
两轮测试有重叠，且使用替身，不能作为真实数据库或设备验收。手机
类型检查因 ExpoConfig 不包含 autolinking 字段而失败；本机 Node 为
22.22.0，低于仓库要求的 22.22.2，pnpm 包脚本的生成命令被版本限制
拒绝，改用已有 Prisma CLI 直接生成。未启动数据库或部署。

2026-11-13（项目基础验收）：项目路由、环境开关与手机置顶的 5 个
定向离线测试文件共 156 项通过，使用替身而非真实数据库。API 类型
检查失败，包含实验开关类型缺失及生成的 Prisma 类型缺少项目字段；
手机类型检查在 ExpoConfig 的 autolinking 类型处失败。上述检查在补充
服务端开关传递前执行；数据库迁移、真实设备和生产均未验证。

2026-11-13（手机置顶弱网）：补充先前请求失败后发送最新选择的定向
测试；根据本阶段不运行测试的要求，本次未执行测试、类型检查或 iPhone
验证，也未部署。未验证真实网络异常及服务器断链问题是否解决。

2026-11-13（项目功能范围调整）：本次仅调整交付优先级，未运行测试、
数据库迁移或设备验证；项目写入限制和测试开关仍在，功能未开放。

2026-11-13（基础可用性盘点）：只做源码和现有计划静态查阅；未运行
测试、类型检查、构建，也未访问生产服务或连接设备。无法据此判断
登录、消息、置顶、模型切换或双端实际可用性，不能宣称问题已修复。

2026-11-13（PA-022 手机项目事件流传输）：增加请求路径、项目参数、
事件接收及范围失效拒绝的测试草案；未运行测试、类型检查或 iPhone。
首页流回归、分片、断线重连、失焦取消和项目事件隔离仍待验证。

2026-11-13（PA-022 项目 AI 数据授权）：增加手机拒绝授权、项目
范围查询与确认、服务端拒绝未授权发送的测试草案；未运行测试、类型
检查、数据库或真机。授权接收方变化、审批、存储与发送竞态以及首页
既有行为仍需验证。

2026-11-13（PA-022 项目会话流）：新增开关、分步范围及项目撤权的
替身测试草案；未运行测试、类型检查、数据库或真实事件流。首页订阅
回归、断连清理、空闲心跳、撤权竞态和双端实时展示待验证。

2026-11-13（PA-022 项目文本发送）：增加测试开关、项目不可访问与
租户范围传播的替身测试草案，以及文本、目标和幂等键的契约测试草案；
未运行测试、类型检查或数据库。提取
共享发送函数后的首页回归、跨项目发送、幂等、授权和真实回复待验证。

2026-11-13（PA-022 项目会话快照）：增加开关关闭、项目不可访问和
范围传播的替身测试草案；未运行测试、类型检查或数据库。真实跨项目
访问、快照中的消息及运行、项目删除与成员撤权竞态尚未验证。

2026-11-13（PA-022 桌面项目群聊创建接线）：静态检查项目范围、
能力关闭、分页选择和请求 UUID；未运行测试、类型检查、桌面打包或
数据库。弹窗、弱网恢复、跨项目切换和真实创建尚未验证。

2026-11-13（PA-022 桌面项目 Bot 创建接线）：静态检查能力失败关闭、
固定 Space 和组件卸载后的响应处理；未运行测试、类型检查、打包、
桌面或数据库。弱网重试、切换项目、登录切换和名单刷新尚未验证。

2026-11-13（PA-022 手机项目群聊创建接线）：扩展能力开关替身测试
草案，静态检查分页、成员选择、请求标识和范围判断；未运行测试、
类型检查、数据库或手机。弹窗、键盘、切换空间、失败重试及成员归档
竞态尚未验证。

2026-11-13（PA-022 项目群聊创建重试）：增加相同请求复用和成员
顺序不同时拒绝的替身测试草案；未运行测试、类型检查或真实数据库。
锁顺序、并发创建、删除、成员归档、跨项目冲突与断网恢复均待验证。

2026-11-13（PA-022 手机项目 Bot 创建接线）：增加能力开关替身测试
草案，静态检查账号、空间及焦点判断；未运行测试、类型检查、数据库
或 iPhone。创建响应丢失、项目删除竞态、项目列表分页及原生弹窗待验证。

2026-11-13（PA-022 项目会话创建 RPC）：增加默认关闭、项目不可访问
及项目上下文传播的替身测试草案；未运行测试、类型检查或数据库。
Bot 与群聊真实创建、并发删除、重复提交、跨项目隔离和客户端均未验证。

2026-11-13（PA-021 手机 Bot 人格选择）：静态比对六项网页人格名称与
用途说明；未运行测试、构建或 iPhone 验证，布局、无障碍朗读和创建后
指令仍需在设备及真实后台验证。

2026-11-13（PA-022 派生 Bot 重试范围）：更新已有替身测试的查找条件；
未运行测试、类型检查或数据库。跨项目相同创建键、并发重试、后台系统
上下文的项目传播与派生运行归属尚需真实验证。

2026-11-13（PA-021 手机创建 Bot）：更新名单阻塞和切换空间的测试草案，
静态检查创建与引导分支；未运行测试、类型检查或 iPhone。并发创建、
名单快照时序、断线重试和真实提速仍需验证。

2026-11-13（PA-022 手机项目列表状态）：静态检查项目页面焦点、成员
加载与分页分支；未执行测试、类型检查或 iPhone 验证，快速翻页、空间
切换及网络异常下的实际表现待验证。

2026-11-13（PA-022 运行附件读取范围）：新增首页和项目条件的文件、
图片查询测试草案；未运行测试、类型检查或数据库，历史图片、真实
附件内容及错误处理尚未验证。

2026-11-13（PA-022 项目运行续行门禁）：新增项目不可访问时不执行的
替身测试草案，更新项目范围恢复夹具。测试、数据库和任务队列未运行；
查询故障重试、运行状态收尾及撤权竞态尚未验证。

2026-11-13（PA-022 创建时切换页面）：静态检查焦点、导航记录与成功
响应判断；未运行测试、桌面或手机，返回页面后的请求恢复和切换竞态
仍须验证。

2026-11-13（PA-022 运行记忆和历史范围）：增加项目记忆不读取账户记忆
及历史 SQL 携带项目范围的单元测试草案。未执行测试、数据库、语义记忆
服务或真实运行；项目创建、跨项目搜索和系统旁路仍需端到端验证。

2026-11-13（PA-022 记忆范围）：新增首页 Bot 和用户记忆、版本在项目
范围不可见及项目上下文写入首页 Bot 记忆被拒的数据库测试草案。
未运行迁移或测试；项目 Bot 数据仍被禁写，无法据此验证不同项目间读写。

2026-11-13（PA-022 桌面空项目移除）：静态检查能力关闭、确认、
重复点击和切换项目后的分支；未运行类型检查、测试、桌面或数据库。
请求结果未知、登录切换及旧客户端兼容仍待验证。

2026-11-13（PA-022 空项目移除）：编写范围、空项目删除结果测试草案；
未运行测试、迁移、数据库 RLS、真实并发或手机。资源检查的权限可见性、
外键、创建竞争、未知结果恢复及目录不受影响均须环境验证。

2026-11-13（PA-022 项目创建能力与双端表单）：增加能力真假的服务端
测试草案，静态检查客户端失败关闭及旧服务兼容路径；未运行测试、
类型检查、数据库、桌面或手机。会话切换、网络失败和重复请求尚待实测。

2026-11-13（PA-022 项目创建测试接线）：编写默认关闭、环境限制和
模拟事务调用测试草案；未运行测试、迁移或真实数据库。未验证冲突、
重试、并发删除、跨租户访问或双端交互。

2026-11-13（PA-021 手机 Bot 创建交互）：静态检查提交、关闭、卸载及
空间变更的分支，未运行测试或 iPhone 验证；iOS 弹窗关闭回调、切换
时序、丢包及幂等重试仍需实测。

2026-11-13（PA-022 桌面目录授权范围）：扩展本机授权存储测试草案，
覆盖不同 Space、不同项目和无效标识。未运行测试或桌面程序，真实身份、
目录选择、授权撤销和设备通信均未验证。

2026-11-13（PA-022 账号删除空间门禁）：新增首次和重复认领遇到项目
时拒绝的测试草案；未运行测试、数据库并发或认证删除流程。权限角色、
部分认领失败恢复及错误响应均未验证。

2026-11-13（PA-022 账号删除门禁接线）：静态检查删除前调用顺序并
调整认证响应测试替身以支持事务。未运行测试或迁移，未验证真实认证、
数据库角色、并发、失败重试及持久标记恢复；不能据此开放项目创建。

2026-11-13（PA-022 运行附件归属）：新增缺失运行和群聊不匹配时不
存储字节的测试草案，调整现有生成附件替身；未运行测试、类型检查、
数据库或后台执行。未验证历史运行数据、RLS、并发删除和群聊绘图。

2026-11-13（PA-022 首页附件写入防护）：编写租户、项目、不同 Space
及系统上下文的单元测试草案，静态检查防护位于附件存储前。测试、真实
上传和后台任务均未运行；系统与无上下文的项目误写风险尚未消除。

2026-11-13（PA-022 手机项目创建重试）：静态检查成功、失败和范围变化
分支。未运行测试或真机验证，也未验证超时后的服务端幂等和空间切换竞态。

2026-11-13（PA-022 附件版本范围）：静态核对全部两个版本分配调用点，
增加项目范围查询的单元测试草案；测试、类型检查、迁移、数据库并发和
真实附件上传均未执行。项目锁隔离、旧新版本并发及数据一致性仍待验证。

2026-11-13（PA-022 附件项目范围）：静态核对迁移、Prisma 模型、RLS
及禁写条件，编写数据库负向测试草案。未运行测试、Prisma 生成或迁移，
也未验证现有附件访问、系统旁路、跨项目及版本族约束；不得据此开放。

2026-11-13（PA-022 项目订阅路由）：编写两项模拟路由测试，检查项目
上下文传播、撤权后事件和空闲心跳的关闭行为。未运行，不能认定 RPC
上下文传播或流关闭正常；真实 RLS、流并发及性能仍未验证。

2026-11-13（PA-022 项目订阅授权）：静态检查项目范围捕获、事件及
心跳前的检查与首页无查询分支；添加可见、撤权和数据库失败的替身测试
草案。未运行测试、数据库、流式连接或性能测试；未证明撤权与网络发送
之间无竞态，亦未验证账号会话撤销或其他流。

2026-11-13（PA-022 会话接管释放）：静态检查释放前运行查询条件、
单聊 Bot 限制及无运行时不释放分支；调整测试草案。未运行测试、类型
检查、数据库、电脑代理或双端，尚不能证明电脑接管与恢复未回归。

2026-11-13（PA-021/PA-022 手机群聊范围）：静态检查列表读取和创建的
请求上下文、范围变化后界面分支、返回结果检查及未知 Space 的缓存处理；
补充范围切换和返回竞态测试草案。未运行测试、类型检查、构建或真机；
未验证切换时真实网络结果、服务端授权、群聊幂等及项目隔离。

2026-11-13（PA-022 流式项目范围）：静态核对入口捕获和 next、return、
throw 的范围重入，添加项目流跨项目消费及首页流跨项目消费测试草案。
未运行测试、类型检查、数据库或真实客户端；内部嵌套项目作用域、撤权、
连接中断和所有流入口仍需单独审计及验证。

2026-11-13（PA-021 手机聊天标题）：静态核对标题的名称来源、无有效
名称时的视觉空白与无障碍标签，以及气泡色的缓存回退；增加旧路由名称、
不透明标识及未知 Bot 的测试草案。未运行测试、类型检查、构建或 iPhone
验证，无法证明首帧时序、头像图片解码及动态字体效果。

2026-11-13（PA-022 项目上下文隔离）：静态检查进入项目时的父租户比较
及拒绝先于查询，增加替身测试草案。未运行测试、类型检查、数据库或
设备验证；不能据此证明系统调用安全、撤权并发或完整项目隔离。

2026-11-13（PA-022 账号门禁 PostgreSQL 场景）：静态编写三项数据库
测试草案，包含两个独立客户端竞争及最终状态断言。未运行，不能证明
连接实际重叠、两种获锁顺序、角色权限、RLS 或业务删除链安全。

2026-11-13（PA-022 账号生命周期基础）：静态核对账号锁顺序、系统权限
检查、项目存在时拒绝声明及标记后的创建拒绝，增加替身测试草案。
未运行测试、类型检查、Prisma 生成、迁移或 PostgreSQL；替身不能验证
RLS、运行账号行锁权限、事务快照、死锁或并发删除。真实认证删除、
组织成员操作及恢复流程均未接入或验证。

2026-11-13（PA-021 创建前列表超时）：静态检查超时取消、计时器清理及
回退后原范围校验；补充未响应列表和超时期间切换 Space 的测试草案。
未运行测试、类型检查、构建或 iPhone 网络验证；超时取消是否到达底层
网络、提示时机及实际创建效果仍需验证。

2026-11-13（PA-022 名单授权修正）：静态检查同一 SQL 的可见性标记、
不存在项目与空项目的返回分支以及最终排序，补充替身与路由测试草案。
未运行测试、类型检查、数据库、构建或设备验证；不能证明实际 RLS、
权限撤销并发、分页或所有项目读写隔离。单条查询也无法阻止查询完成后
权限立即变化，后续操作仍需重新授权。

2026-11-13（PA-022 认证插件静态核查）：读取本机已安装 Better Auth
1.7.15 的组织路由实现、当前插件配置及 `/api/auth/*` 转发代码，核对
成员移除与退出组织的调用顺序。未发起真实请求，不证明权限、路由、
事务、数据库级联及并发行为；未运行测试、构建或迁移。

2026-11-13（PA-022 生命周期静态核查）：只读检查认证配置、删除钩子、
个人组织查询、Space 领取和数据库模型关联，并搜索应用代码中的组织
成员移除及退出调用；这不能证明插件端点不可访问，也不证明数据库
级联或并发安全。未运行测试、类型检查、构建、迁移或设备验证。

2026-11-13（PA-022 项目名单分页）：静态核对独立游标、项目/账号过滤、
每类分页上限及双端分页状态；补充游标参数化和非法输入测试草案。
未运行测试、类型检查、数据库迁移、构建、Electron 或 iPhone；不证明
实际数据库排序、并发分页一致性或数据隔离。

2026-11-13（PA-022 项目名单只读草案）：静态核对名单 SQL 的用户、
Space、项目、活跃成员及未删除状态条件、每类 101 条探测和客户端
截断提示；增加作用域参数、上下文和长度测试草案。未运行任何测试、
类型检查、Prisma 生成、数据库迁移、构建或设备验证。模拟结果不能证明
PostgreSQL RLS、不同项目的反向隔离或撤销并发安全。

2026-11-13（PA-021 手机新建 Bot 输入体验）：静态对照网页和手机创建
界面的名称、共享人格、内置头像及键盘布局；增加弹层键盘避让与安全区。
未运行测试、类型检查、构建或设备验证；不能认定不同键盘、屏幕尺寸、
动态字体和个人人格编辑下的布局正确。

2026-11-13（PA-023 桌面隔离实验续项）：在合成服务器/临时用户目录的
既有可选 Electron 实验中增加同源弹窗访问 opener 和 debugger 脱离后
重载远端文档的断言；其目的是检验候选方案的已知风险。未运行该实验、
测试、构建或真实桌面；不能宣称这些行为已被实测或安全边界已建立。

2026-11-13（PA-022 群恢复锁顺序）：静态核对电脑配额锁、Bot 删除、
群更新和恢复路径，恢复先取配额锁（如配置）、Bot 行锁及群锁，再比较
成员快照。补充成员变化时不恢复任何对象的测试草案，未运行；现有
PostgreSQL 恢复及配额回归也未运行。数据库连接角色、RLS、并发和锁
顺序只能在真实数据库验证；未执行类型检查、构建、迁移、部署或设备验证。

2026-11-13（PA-022 群成员更新范围）：静态对照 Bot 删除、群恢复、
群成员更新及创建的锁顺序，更新路径将成员范围验证移入事务并先于
群聊锁；补充候选成员不可锁定时不更新的测试草案。未运行测试、类型
检查、数据库或并发演练；群恢复先群后 Bot，其他路径可能形成锁环，
现有事务重试不能作为所有并发场景成功的证据。项目写入门禁保持关闭。

2026-11-13（PA-022 群聊创建成员范围）：静态核对成员去重、数量边界、
SQL 账号/Space/项目及活动状态条件、稳定锁顺序、事务内成员读取和
原顺序写入。增加无法锁定全部成员时拒绝创建的单元测试草案，并调整
既有顺序测试替身；测试均未执行。未验证实际 PostgreSQL 锁、RLS、并发、
死锁或归档行为，未执行类型检查、迁移、构建、部署和设备验证。

2026-11-13（PA-022 创建重试草案）：静态检查创建 UUID 契约、冲突时
租户条件和有效状态、手机页面范围，以及禁用按钮外的键盘入口。新增
契约与 PostgreSQL 草案覆盖相同 ID 重放、名称冲突、跨用户和删除中；
均未运行。PostgreSQL RLS 与并发冲突行为、账号删除、真实重启及物理
删除后重放均未验证；创建 RPC 继续关闭。未运行测试、类型检查、数据库、
构建、部署或设备验证。

2026-11-13（PA-022 项目创建草案）：静态核对创建函数使用的成员检查、
Space advisory lock、租户上下文与账号删除回调。账号删除的工作区预检
和外部清理不在同一持久生命周期门禁下，无法保证并发新建被拒绝；故
创建 RPC 固定返回不可用，客户端入口保持禁用。静态审阅不证明并发、
RLS、事务重试、响应丢失后的行为或客户端类型正确。未执行测试、类型
检查、数据库迁移、构建、部署或真机验证。最终差异空白检查结果另见
本次执行结果；项目会话禁写约束未解除。新增定向测试草案检查关闭的
创建路由拒绝请求且不查询数据库，该测试尚未运行。

2026-11-13（PA-022 外部作业持久项目范围）：静态核对 CloudAgent、
Purchase 创建、幂等重放、状态/密钥读取、worker poll、终态 wake 与
reconciler，添加不依赖父 Bot/Thread 外键的项目快照。两表 SQL 新增
系统/账号 RLS 策略、项目限制性策略及归属不可变触发器；Purchase 保持
原 Space cascade，Cloud Agent 保持现有独立生命周期。支付请求远端 I/O
前新读真实 Thread/Bot/成员关系和 generation，再写快照；外部结果未知
或聊天期间被清空不重放、不写入新会话。

补充购买纯单元替身的上下文模拟和项目过滤，增加范围重放、无效会话
不触发钱包、远端请求期间清空线程、新后台作业从持久项目恢复的测试
草案；现有 Cloud Agent PostgreSQL fixture 清理切换到系统 RLS 上下文，
元数据 PostgreSQL fixture 增加删除 Bot 后仍可按 Home 范围读取外部
操作行及七张禁写 CHECK 元数据检查。以上均未执行。

仅 `git diff --check` 通过；未执行测试、类型检查、Prisma 生成、迁移、
构建、服务器或设备验证。静态检查无法证明 RLS、触发器、事务重试、
付费外部副作用、项目被标记删除时的行为或类型正确。Space/账号删除
可能级联删除 Purchase（保持上游原 FK 行为），删除项目的待处理外部
作业及保留数据策略尚未实现；七表禁写 CHECK 未解除。

2026-11-13（PA-022 会话一致性迁移草案）：静态对照核心五表及
ExternalConversation 的外键、现有 Bot/群聊/外部会话创建顺序和账号
导入字段，编写身份/目标不可变及新写入父子检查。数据库触发器采用
调用者权限、固定搜索路径和显式 public 表，保留原 RLS、五表禁写及
父对象删除外键；没有变更 Prisma 模型或执行数据库操作。

在已有显式启用的 PostgreSQL 测试中增加合成首页关系、跨账号群成员、
父 Bot/线程/Task/Run 不匹配、系统 bypass 下身份与目标仍不可变、合法
首页创建与同值更新、五个禁写约束定义的测试草案。项目非空记录仍受
禁写约束，不通过删除约束取得测试便利；本草案不能证明两个真实项目
的正向创建或 RLS。既有伪造元数据更新断言同步为新增不可变错误。

本轮 `git diff --check` 通过。未执行任何测试、类型检查、Prisma 生成、迁移、构建或服务器/设备
验证。触发器 SQL 语法、运行权限、调用开销、旧版本兼容、历史不一致
数据和级联/并发行为均待验证。触发器只约束新写入或被检查字段变化，
不会自动验证所有既有行；解除禁写前须单独完成历史审计及全链路验收。

2026-11-13（PA-022 创建入口续项与跨项目通信）：静态检索 API、DB、
adapters 的 `task.create/upsert` 和 `run.create`，对照发现的 22 处运行时
组合，Task 保存解析或托管任务范围，Run 继承 Task。定时及技能作业
增加 Bot 所有者范围恢复；跨 Space 守卫增加项目一致和所有者检查。
新增首页/项目双向拒绝、不同项目、不同成员或 Space、缺失归属、邀请
拒绝不写出站消息及定时恢复范围的测试草案；均未运行。

当前仅完成静态审阅和差异空白检查；未执行测试、类型检查、Prisma
生成、数据库迁移、构建、部署或真实双端操作。部分既有创建测试的 SQL
替身不支持新归属查询，尚未全面适配，不能声称测试通过。系统旁路下
其他源/目标共享、父子约束、云代理/支付的持久作业归属、辅助 RLS 和
删除恢复仍未完成；不以守卫测试草案或静态检索作为解禁项目的证据。

2026-11-13（PA-022 会话创建及后台恢复）：静态对照核心八处 Task/Run
创建与事务边界，添加执行归属查询，检查线程/Bot/群成员/外部会话关联
及当前租户范围。新增有权项目、系统继续执行、缺少/多条/错误归属、
无上下文、数据库错误测试草案，并为后台作业添加存储范围覆盖当前
界面或伪造载荷字段的测试草案；均未执行。替身 SQL 断言不能证明
PostgreSQL RLS、成员撤销或真实执行安全。

既有 `events.test.ts`、API 会话/路由等单元测试替身尚未完整适配新增
归属查询和 Task 字段，后续需补齐；不能宣称现有测试保持通过。未执行
任何测试、类型检查、Prisma 生成、迁移、构建或服务器/设备验证。
新增查询的耗时、迁移兼容、所有者变更竞态、停止恢复、其他作业范围
及跨 Bot 通信仍待验证；项目写入门禁没有解除。

2026-11-13（PA-022 项目执行范围与 RLS 草案）：`git diff --check` 通过。
静态对照既有数据库
上下文、连接池设置、租户/系统策略、Bot/群聊仓储和托管任务路径。
新增项目上下文并发、同租户继承、换租户清除、回到首页、连接池范围
重设、无权限与查询故障不执行回调等测试草案；未执行。托管任务测试
替身补空项目字段及查询断言，同样未运行。静态检查不证明 PostgreSQL
策略语法、RLS 效果、连接复用或真实任务行为。

未执行 Prisma 生成、校验、类型检查、测试、数据库迁移、服务器请求、
构建或设备验证。核心 RLS 草案只覆盖五表、群聊成员和事件；既有
消息策略经 Thread 检查，但未验证真实效果。记忆、附件、外部交接、
后台作业、流式迭代与生命周期仍不完整。未修改客户端参数，未启用
项目创建或解除数据库项目禁写约束，不能宣称完整隔离通过。

2026-11-13（PA-022 首页查询范围草案）：静态核对 Bot/群聊的普通与
归档列表、跨 Space 预览和未读 SQL 新增空项目条件，保留已有所有者
限制。未运行测试、Prisma 生成、类型检查、数据库迁移或真实读取；
查询计划、旧部署兼容、实际计数及客户端回归待验证。局部列表过滤
不保护所有 ID 入口，不能作为解除数据库项目禁写约束的依据。

2026-11-13（PA-022 手机文件夹及独立详情）：静态核对路由范围、详情
ID 契约校验、发起时请求上下文、离焦取消和旧范围响应丢弃；详情页
不调用普通首页会话 API，宽屏布局明确隐藏首页侧栏。仅执行
`git diff --check`，通过；未运行任何测试、类型检查、Expo 路由生成、
构建、iPhone 或宽屏交互。玻璃文件夹拼接效果、辅助功能、字体缩放、
返回/切换项目、深链及账号切换行为均待实测；Bot/群聊创建仍未实现。

2026-11-13（PA-022 项目归属模型与迁移草案）：静态对照五类对象及
项目复合唯一键，补齐 Task、Run 反向关系；迁移与 Prisma 显式使用相同
外键和索引名，并为每张表加入禁止非空项目归属的约束。没有执行
Prisma 校验、客户端生成、PostgreSQL 迁移或测试；复合关系有效性、
迁移锁影响、约束行为、旧客户端兼容及回滚均待服务器验证。此草案
不能证明项目会话隔离，创建、切换后的聊天和删除验收仍未满足。

2026-11-13（PA-022 项目元数据与桌面入口）：只读对照现有
`project_workspaces` 模型、成员/RLS 和查询函数，新增详情参数化查询及
列表、详情 RPC。添加请求伪造字段、分页上限、查询无结果、无效 ID 和
错误传播测试草案，均未执行；测试替身不构成真实账号隔离证据。
桌面项目页未查询首页 Bot/群聊，创建按钮禁用；未验证渲染、缓存切换、
路由、数据库和成员撤销。未运行测试、类型检查、构建、Electron 或 iPhone。
目标中的项目创建、项目会话隔离及双端直连退役验收仍未满足。
手机新增页面的异步读取包含请求上下文、取消信号及原范围复核，但这些
只是源码保护；账户/服务器/Space 切换、返回、离线及分页均待实际验证。

2026-11-13（PA-021 原生找回密码）：静态对照既有认证接口及测试中的
邮件令牌路径，添加有效、跨来源、重复令牌和错误链接的测试草案；
另只读检查本地 Better Auth 1.7.15 的 `password.mjs`，确认邮件路径为
`/reset-password/:token`、回调将 token 放入 query、POST 成功返回
`status: true`。未运行测试、类型检查、真实邮件、服务器调用或真机验证。实际邮件
路径、令牌字符范围、过期、重放、重置后会话变化和切换服务器均待验证。

2026-11-13（PA-023 桌面渲染隔离实验）：新增默认跳过的隔离实验草案，
但未运行 Electron、Playwright、类型检查或构建，不能证明 CDP 帧标识
稳定、拦截生效或弹窗安全。当前已有桌面响应式测试由模拟服务器提供
网页资源，也不能作为不依赖服务器网页的证据。

2026-11-13（PA-021 创建界面布局）：静态对照网页与手机创建表单顺序；
未运行测试、构建或真机验证，不能据此认定视觉或交互一致。

2026-11-13（PA-021 手机头像库中断保护）：仅静态审阅临时文件写入、
移动及损坏 JSON 分支；未模拟中断、存储失败或验证移动原子性。
系统重启后的文件内容和临时文件残留仍待实际设备验证。

2026-11-13（PA-021 手机头像库）：静态核对头像值校验、保存数量、
文件名限制、删除目标和选择界面；没有运行测试、类型检查、构建或
真机操作。持久化与读写失败、系统备份行为、账号切换、空间不足、
头像显示和删除对已有 Bot 的影响均待验证。

2026-11-13（PA-021 创建重试）：静态查看服务端按 Space 和 `spawnKey`
查找已有 Bot 的路径及用户归属检查，并在手机创建请求中接入该字段。
新增透传断言未执行；未验证网络超时、并发、身份变更或服务端实际行为。
弹层关闭后重试键不会保留，不能承诺跨会话去重。

2026-11-13（PA-021 人格库迁移）：按当前阶段约束，仅静态对照人格契约、
手机组件和工作区保护逻辑，补充属性标识搜索；未运行测试、类型检查、构建、
服务端请求或 iPhone 验证。共享导出兼容性、人格读写、冲突校验、工作区
切换及真实视觉效果均待验证，不能据此认定迁移完成。

2026-11-13（手机 Bot 创建迁移准备）：静态核查手机创建入口、设置头像
选择和 Web 创建表单；预设迁入共享契约后未运行测试、类型检查、构建或
真机验证。当前安装包仍使用旧手机创建流程。

2026-11-13（生产 IP 与当前 iOS 产物）：只读公网探测中，
`https://124.221.182.39/health` 和旧域名 `/health` 均为 HTTP 200；
IP `/rpc/health` 为 HTTP 200、`ok=true`；IP 与域名
`/api/auth/capabilities` 均为 HTTP 200，`resetUrl` 均指向 IP。执行
`python infra/compose/check-ip-certificate.py 124.221.182.39 --warning-hours 72 --timeout 8`
返回证书受信且剩余 156.7 小时。GitHub Actions run `43375597868` 对 SHA
`45c9d2c352bbbc24e533bf5d27b8e1b8c821311f` 完成：Xcode unsigned app build、
IPA 校验打包、artifact 上传全部成功；artifact ID `14015445731`、名称
`sydney-ios-unsigned-43375597868-1`、大小 25,619,518 字节、未过期。前两次
run (`43371814189`、`43374030150`) 在 Xcode 构建退出码 65，无产物；日志
下载因当前 GitHub 身份缺少仓库管理员权限返回 403，因此未确认具体编译错误。
本轮仅运行移动 app-config 定向测试 34 项，第一次新增断言因测试漏设实验开关
失败，修正后 34 项通过；Expo 配置解析通过。未运行全量测试、未签名、未安装，
只读 SSH 查询生产 Caddy Admin JSON，确认自动管理 policy subject 为
`124.221.182.39`，issuer 为 ACME profile `shortlived`；未输出密钥或完整配置。
维护节点 `systemctl` 查询确认检查 timer active，最近一次检查于
2026-11-13 13:34:51 CST 返回 `Result=success`、退出码 0。它只验证检查器
运行成功，不代表证书自动续期已经发生。未验证真实账号、双端业务及失败通知。

2026-11-13（PA-021 阻塞复核）：GitHub 工作流内容仍没有陪伴
输入；最近十次运行中非终态数量为 0，本机 PATH 中 Xcode/Swift
命令数量为 0。git status 仍显示陪伴模块和 Widget 未跟踪，工作流
本地修改未上传。只读结果支持当前没有可继续等待的陪伴编译，
不证明所有外部 Mac 都不可用；需要新环境或明确上传授权。本轮
没有代码修改，未重复测试，未执行编译、签名、安装或手机读取。

2026-11-13（PA-021 云构建实时核查）：GitHub API 只读查询显示
当前远端分支与本机 HEAD 均为 `d4cf56599e370bb399959dfee0afdf5f136eef59`；
远端工作流不包含 `companion_experiment`。最近三次运行全部 completed，
最近运行 `42770297627` 成功但对应 `72c4211fcdfd24ffed74cb6920cfab10bb00119a`，
创建于 2026-11-10；其未签名 artifact 查询显示 1 项、未过期、
大小 25,558,037 字节，过期时间 2026-11-17T06:58:12Z。未下载检查
该产物，也不将其归为当前陪伴包。本机 git status 仍显示陪伴
模块和 Widget 未跟踪、工作流已修改；没有正在等待的陪伴构建。
此模块只核查构建可达性，未运行测试、Swift 编译、签名或安装。
来源：https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/42770297627 。

2026-11-13（PA-021 陪伴更新统一）：Node 24.22.1 下独立订阅、
快照选择、原生桥、屏幕自动回应、路由、线程反馈和通话七个文件
94 项通过，手机 TypeScript 检查通过。首次运行 92 项通过、2 项
失败，发现初始共享状态读取造成前台重复请求；修复可运行条件
依赖后复验全部通过。新增模拟覆盖页面切换保留同一连接、自动
回应交接时旧内容失效、停止后重新获取最新内容。HTTP、事件归约
和原生桥仍使用替身，不能证明真实 SSE、Swift 或 iPhone 可用。

2026-11-13（共享失活状态）：Node 24.22.1 下独立订阅、屏幕自动
回应、原生桥及资料页四个测试文件共 103 项通过；覆盖暂停事件
中断回应、忽略迟到内容和取消后台订阅，手机 TypeScript 检查
通过。不覆盖 Swift 的暂停与恢复回调。当前 PATH 未找到 Xcode、
Swift 编译器或设备命令；默认 Python 未安装 pymobiledevice3，
未连接设备或读取个人数据，也未安装依赖；其他工具内置环境未
在此检查。来源：https://developer.apple.com/documentation/screencapturekit/scstreamdelegate/streamdidbecomeinactive(_:) ；
https://developer.apple.com/documentation/screencapturekit/scstreamdelegate/streamdidbecomeactive(_:) 。

2026-11-13（共享期间后台陪伴订阅）：Node 24.22.1 下独立订阅、
原生桥、屏幕自动回应和展示快照四个定向测试文件共 33 项通过；
模拟后台开始共享、停止共享后取消，以及较晚的初始状态结果不
覆盖停止事件。手机 TypeScript 检查通过。未测试真实系统屏幕
共享、后台网络存活、状态通知时序、模型或 iPhone 电量。

2026-11-13（陪伴独立前台订阅）：Node 24.22.1 下订阅、快照、
原生桥、屏幕自动回应及线程路由五个定向测试文件共 36 项通过，
模拟无聊天页时收取事件、通话状态、切入聊天取消、旧作用域
丢弃、等待账号和工作区就绪，以及 429 重试间隔；手机 TypeScript
检查通过。测试使用替身事件和请求，未验证真实 SSE、断网恢复、
多个客户端、Swift 编译或 iPhone 后台调度。

2026-11-13（陪伴动态状态过期）：伴随模块、展示数据与插件三组
JavaScript 测试 15 项通过，仅覆盖既有 JS 逻辑，不验证本次 Swift
修改。苹果文档说明 `staleDate` 会使活动过期，Widget 可读取
`context.isStale`；未执行 Swift 编译、时间流逝或真机界面验证。
来源：https://developer.apple.com/documentation/activitykit/activitycontent/staledate ；
https://developer.apple.com/documentation/widgetkit/activityviewcontext/isstale 。

2026-11-13（离开聊天页前台陪伴）：Node 24.22.1 下陪伴快照、
原生桥、线程前台订阅、线程反馈和路由共 5 个测试文件 75 项
通过；覆盖快照规则及已有前台订阅逻辑，未对真实线程页面接线、
多页面同时存在或事件竞态做端到端测试。手机 TypeScript 检查
通过；页面被卸载或 App 进入后台时无持续更新保证。

2026-11-13（生产 IP 登录页）：使用临时无持久会话的无头浏览器，
只允许访问生产 IP 来源，访问 `/sign-in` 返回 200，邮箱与密码
输入框均出现，没有页面异常、失败响应或其他来源请求。另以公网
读取首页中的 21 个 JS/CSS 入口资源均返回 200。没有输入真实
账号或执行登录，不能替代 Electron、iPhone 和完整业务验证。

2026-11-13（陪伴创建中切换）：Node 24.22.1 下资料页、桥接逻辑、
构建插件三组定向测试共 84 项通过，模拟创建返回前切换时仅停止
对应新活动；手机 TypeScript 检查通过。测试替身不验证 Swift
返回值、ActivityKit 的实际结束行为或系统终止进程后的清理。

2026-11-13（公网 IP 来源负向认证）：使用随机不存在的合成邮箱与
随机密码各发起一次登录请求，IP 来源和 `rakazo://` 来源均返回
401，伪造不受信来源返回 403；IP 来源匿名会话及 RPC 健康返回
200，无会话访问 Space 列表返回 401。仅验证拒绝及来源过滤，不
验证真实账号成功登录、聊天或邮件。

2026-11-13（陪伴原生队列作用域）：Node 24.22.1 下资料页、原生
桥和屏幕自动回应三个定向测试文件共 93 项通过，模拟队列等待、
停止共享等待期间工作区失效，以及资料页检查函数使用的选择序号；
手机 TypeScript 检查通过。默认 Node 22.22.0 的 pnpm 类型检查
因不符合仓库引擎要求未运行。未编译 Swift，也未验证原生调用已
开始后的账号切换或真实设备行为。

2026-11-13（生产 IP 业务代理）：候选与原域名路由及 IP 路由的
处理器等价，允许 Caddy 内部组名称双射，旧证书引用一致；生产
Caddy 语法校验通过。部署时独立计时器已启动，生产域名和 IP
回环健康、独立公网 IP HTTPS 首页 200、匿名会话 200、RPC 健康
200 及 IP 来源 CORS 通过后保留；事后运行配置等于持久文件的
适配结果，服务 healthy，未列出相关恢复计时器。没有执行真实
登录、聊天、屏幕、手机或桌面验证，也未观察实际证书续期。

2026-11-13（生产 IP 兼容 API 发布）：生产 Compose 合并对照
仅 API 镜像和额外可信来源变化；部署前合成检查覆盖 overlay
原子还原、并发冲突及先恢复旧 API 后停止新 API。生产滚动
发布执行成功，新 API 直接使用 IP Origin 的匿名会话及 RPC
健康、CORS 响应通过，原域名健康通过；事后只有一个新 API
且 healthy，Worker、Web、PostgreSQL healthy，独立回退计时器
未列出。未执行数据库迁移、真实账号登录或 IP 公网业务代理。

2026-11-13（陪伴工作区确认）：Bot 资料页、陪伴桥和语音链接
守卫三组定向测试共 82 项通过，覆盖弹窗期间工作区切换并切回、
选择进行中拒绝开始或停止。使用 Node 22.22.0，低于仓库声明的
最低版本，pnpm 提示忽略部分仓库配置；未验证原生桥排队或真机。

2026-11-13（IP 兼容镜像生产接收）：维护机通过 SSH 压缩流传送
镜像，生产 Docker load 退出 0，导入的完整 ID 与 staging
镜像 `sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87`
一致；流 SHA-256 为
`bca20e74998cbab91c9aab892f6afa728a744ba0ac8dd8d227ed2b09643ee870`。
仅导入镜像，尚未证明生产服务运行该镜像。

2026-11-13（屏幕回应错误边界）：回应、协调器及会话三组定向
测试共 19 项通过，包含模拟依赖及模型异常携带屏幕文字时只
返回固定错误。运行环境 Node 22.22.0 低于仓库声明的最低
22.22.2，pnpm 提示忽略部分仓库配置；结果仅作本机定向证据。
未验证真实供应商、HTTP 日志、代理日志或跨进程行为。

2026-11-13（头像状态过渡）：3 个相关 JavaScript 测试文件共
17 项通过，仅验证配置和逻辑，不覆盖 Swift 动画。未执行 Xcode
编译、iPhone 系统显示、减少动态效果或常亮屏幕验证。

2026-11-13（冷却期间屏幕结果）：3 个定向测试文件共 25 项
通过，模拟验证冷却期不消耗结果、到时读取并发送；手机
TypeScript 检查通过。实际原生 OCR 更新和十秒有效期未真机验证。

2026-11-13（陪伴检查间隔）：3 个定向测试文件共 24 项通过，
模拟首次取字为空后五秒重试、变化文字遵守回应后冷却；手机
TypeScript 检查通过。未测 iPhone 实际帧率、后台调度、模型
耗时、耗电及多设备限频。

2026-11-13（陪伴启动取消）：4 个测试文件筛选运行 20 项通过、
366 项未运行；覆盖授权检查中取消及保留原会话、RPC 信号接线；
API TypeScript 检查通过。首次测试命令含管道字符，被 Windows
命令解释器拆开而失败，改用单一筛选词后通过；未进行真实网络
或模型取消验证。

2026-11-13（陪伴入口导航）：4 个定向测试文件共 27 项通过，
覆盖过期链接不切换工作区、有效链接切换和普通通知导航；
手机 TypeScript 检查通过。Swift Widget 生成链接、应用冷启动、
切账号及真实 iPhone 点击尚未验证。

2026-11-13（隔离预构建）：Node 24.22.1 能运行 Expo CLI，但
`prebuild --platform ios --no-install` 在 Windows 返回退出码 1，
说明须在 macOS 或 Linux 生成 iOS 工程；本次没有原生产物。
WSL 仅列出 docker-desktop，未启动 Docker。已有 Expo 为 57.0.31，
手机清单指定 57.0.32；无安装依赖或真实编译。

2026-11-13（屏幕陪伴到期）：3 个定向测试文件共 86 项通过，
模拟授权到期时及时停止并清理监听；手机 TypeScript 检查通过。
未验证真实 iPhone 定时器、设备时钟偏差及服务端实际部署。

2026-11-13（灵动岛状态）：4 个定向测试文件共 21 项通过，
覆盖思考到回应及停止后复位；手机 TypeScript 检查通过。Swift
Widget 未编译，真实灵动岛可见区域、动画、系统更新频率和后台
状态均未实测。

2026-11-13（陪伴状态恢复）：4 个定向测试文件共 93 项通过，
覆盖返回前台刷新和旧共享状态结果晚到；手机 TypeScript 检查
通过。系统结束 Live Activity、锁屏与实际共享恢复均未真机验证。

2026-11-13（陪伴个性）：五个定向测试文件共 86 项通过，覆盖
设定进入模型请求、资料缺失及读取期间撤销授权；手机与 API
TypeScript 检查通过。数据库范围查询、模型遵循情况、真实授权、
实际费用和第三方数据处理尚未实测。

2026-11-13（扩展源码路径）：真实 Xcode 工程库的合成工程中预置
同名源码及 Info.plist，检查扩展实际引用目录限定文件；相关配置
和插件共 35 项测试通过，手机 TypeScript 检查通过。新工作流产物
门禁、真实预构建和 iOS 编译未执行。

2026-11-13（陪伴扩展嵌入）：Expo 实际使用的 Xcode 工程库
合成对象测试覆盖已有复制阶段、PlugIns 目标、主应用依赖和重复
运行；连同配置测试共 35 项通过，手机 TypeScript 检查通过。
真实生成的 iOS 工程、Swift 编译、IPA 内容及签名安装尚未验证。

2026-11-13（屏幕停止入口）：4 个定向测试文件共 90 项通过，
覆盖活动消失后的运行及失败状态停止入口、自动发送提示和共享
确认作用域变更；手机 TypeScript 检查通过。未进行 iPhone 系统
选择器、系统共享指示或失败重试的真实验证。

2026-11-13（屏幕回应稳定性）：5 个定向测试文件共 89 项通过，
覆盖文字和表情长度边界、迟到回应与前台恢复检查；手机及 API
TypeScript 检查通过。未验证真实 iOS 生命周期、设备时钟偏差、
网络时延、模型响应或服务部署。

2026-11-13（屏幕回应语音原型）：4 个手机端测试文件共 206 项
通过，覆盖用户选择、已有播放或通话时跳过、通话开始时停止及
设备语音所属者隔离；手机 TypeScript 检查通过。均为模拟测试，
系统语音实际数据处理、静音开关、锁屏及后台效果未实测。

2026-11-13（陪伴模型授权取消）：4 个手机端定向测试文件共
399 项通过，覆盖弹窗期间取消、并发普通聊天授权和自动回应不借用
该弹窗；手机端 TypeScript 检查通过。未连接真实服务、模型或手机。
网络已发送请求的撤销、系统对话框与后台行为仍待真实环境验证。

2026-11-13（陪伴授权竞态）：4 个定向测试文件共 74 项通过，
包括确认期间作用域失效后拒绝启动；手机端 TypeScript 检查通过。
当前 Windows 环境未发现 `xcodebuild`、`xcrun`、`swift` 或 `gh`
命令，未编译 Swift、未运行云构建，测试不能证明原生扩展可安装。

2026-11-13（IP 兼容镜像构建与 staging）：旧构建脚本因工作区
`apps/api/src/app.ts` 摘要变化按设计拒绝。新构建从既有候选读取
四个固定摘要文件、从当前生产同 ID 基底无网络编译，Docker 构建
完成且产物默认 node、工作目录 `/app`。镜像 ID
`sha256:acc903c111681c8c69b71beb3dca6bebcb9681ef308d776d6723cafbd820fe87`
在维护机通过公网 staging：合成认证、头像、人格、单聊、群聊、
跨空间拒绝、第二会话、伪造来源头、合成密码恢复和旧来源登录；
退出 0，演练标签容器、网络及 443 监听检查为空。未验证真实邮件、
云电脑、真实账号或双端设备，也未发布生产。

2026-11-13（手机屏幕自动回应）：使用模拟依赖验证明确授权、
变化文本发送、重复内容跳过、无后台同意弹窗、停止及延迟响应；
五个定向测试文件共 403 项通过，手机端 TypeScript 检查通过。
未执行 iOS 编译、
真实后台、模型及设备测试；系统暂停、屏幕授权、断线和续签的实际
行为均待验收。原型不能保证持续后台运行或撤回已发送内容。

2026-11-13（IP 自动管理状态补充）：生产 Caddy 日志的自动 TLS
管理事件包含目标 IP；运行配置具有正式 ACME 短期证书策略、
HTTP 自动 HTTPS 默认配置与持久存储。此前直接检查静态
`certificates.automate` 没有目标 IP；该检查未覆盖 Caddy 的
自动 HTTPS 路径，不能单凭它断言管理未启用。尚未观察到正式
证书的实际续期或验证失败告警。

2026-11-13（屏幕回应实验开关）：路由定向测试两项通过，验证
默认拒绝和注入服务时登录会话绑定；环境开关测试首次因生产测试
夹具缺密钥失败，补齐模拟密钥后复验通过。API TypeScript 检查
通过；未启动服务或验证真实数据库、模型及多实例。

2026-11-13（无工具运行隐私）：Pi 遥测及工具意图两组测试 27 项
通过，覆盖遥测嵌套隔离和拒绝带会话记录器的实例；adapters
TypeScript 检查通过。未验证真实采集、第三方提供方或部署日志。

2026-11-13（生产 IP HTTPS 健康入口）：维护机合成验证了配置
回退及拒绝覆盖外部修改；生产部署时独立回退计时器已启动，
原域名健康、IP 回环正式信任 HTTPS `/health` 与本机独立公网
探测均通过，计时器停止并保留变更。独立证书检查通过，时点
剩余约 158.8 小时；运行配置与当前启动文件适配结果一致，
存在 IP 自动证书策略及指定持久存储，IP 根路径返回 404。
未重启服务、观察真实续期、验证告警或开放 IP 业务接口，不能
据此认定整个生产切换或客户端联调完成。Windows 本机执行 Linux
`fcntl` 合成检查失败，改在维护机执行并通过。

2026-11-13（屏幕回应模型同意）：同意检查、回应及协调器三组
模拟测试 10 项通过，覆盖未同意、缺少接收方及模型不匹配，并验证
解析模型在请求前后传入授权检查；API TypeScript 检查通过。
未验证真实数据库、模型配置变更、RPC 注入及设备。

2026-11-13（屏幕陪伴登录复核）：协调器、会话及回应服务三组
模拟测试 15 项通过，覆盖模型返回前登录授权撤销；API TypeScript
检查通过。真实 Better Auth 会话撤销和运行中取消未实测。

2026-11-13（屏幕陪伴 RPC）：未注入服务时三条入口均返回拒绝，
路由定向测试 1 项通过（其余 366 项跳过）；同意分类及协调器
测试 11 项通过，API TypeScript 检查通过。未测试真实注入、登录
撤销、模型调用、跨进程限流和手机端。

2026-11-13（IP 持久配置候选）：实际生产 Caddyfile 摘要固定，
生成器成功生成限定 `/health` 的 IP 候选，生产容器内 Caddy
`validate` 返回 0；候选指向既有正式 ACME 数据目录。对照运行
配置与候选适配结果，旧域名路由除分组名称可双射映射外一致，
域名及 IP 分组不重叠，旧文件证书引用一致。候选未加载，未
验证启动、正式公网证书、自动续期或 API 业务。首次目录列举
误用 BusyBox `find -printf` 失败，改用 `-print` 后完成只读查看。

2026-11-13（陪伴构建镜像资料）：GitHub Actions 官方 runner-images
清单列 `xcode-27` 为 arm64 预览标签；镜像说明版本
`20261104.0337.1` 列默认 Xcode 27.1、iOS SDK 27.1。镜像说明文件
最近提交 `c0f5743aeac97a0d687047af9f309b34c254b261`；清单和镜像
可能更新。未验证本仓库运行权限、额度、排队、构建、签名或安装。
来源：https://github.com/actions/runner-images/blob/main/README.md ；
https://github.com/actions/runner-images/blob/c0f5743aeac97a0d687047af9f309b34c254b261/images/macos/xcode-27-arm64-Readme.md 。

2026-11-13（屏幕会话未结束任务）：会话和协调器两组模拟测试
9 项通过，覆盖任务忽略取消、会话重建与冷却到期后拒绝重叠；
API TypeScript 检查通过。未验证实际模型停止或跨进程并发。

2026-11-13（屏幕回应内部串接）：协调器、会话和回应服务三组
模拟测试 13 项通过，覆盖跨登录身份、撤销、停止在途请求和
重建会话后的账号冷却；API TypeScript 检查通过。模拟授权不代表
真实模型同意、登录撤销或多实例限流已经接通。

2026-11-13（正式 IP 证书）：生产 IP 与实例元数据一致；临时
配置签发 Let's Encrypt 正式证书，在签发窗口使用系统信任链
验证 IP、匿名路径和 RPC 健康，旧域名健康和原配置恢复。随后
独立检查证书 IP 匹配、证书和私钥公钥一致；证书签发者为
Let's Encrypt YE1，有效期 2026-11-13 02:12:45 UTC 至
2026-11-19 18:12:44 UTC。生产 API、Web、Worker、PostgreSQL
healthy，未见本次恢复计时器。证书保存在 Caddy 命名数据卷，
临时配置恢复后未继续提供该证书，正式自动续期、持久代理、
外网正式入口及真机未验收。执行器输出中的 staging 字样来自
复用的脚本消息；实际 ACME 目录和信任根为正式环境。

2026-11-13（屏幕会话门控）：会话与回应服务两组模拟测试 9 项
通过，覆盖身份不匹配、并发、失败后间隔、停止、到期、替换及
停止后不启动排队任务；API TypeScript 检查在最后一项测试补充前
通过。未验证分布式限流、真实登录、模型调用或设备。

2026-11-13（IP 入口时点检查）：对生产 SSH 目标 IPv4 执行
`compare-live-caddy-candidate.py`，报告旧域名 6 条内部路由均
保留、证书引用一致，候选未加载；日志配置因新增 IP 分类和
排除项有差异。`check-ip-certificate.py` 连接该地址时 TLS 握手
返回 `tlsv1 alert internal error`，退出 1；未到可验证证书的阶段。
尚须确认 SSH 目标就是最终客户端 IP；该检查不证明其他入口、
正式签发、真实业务或客户端可用。

2026-11-13（范围调整）：用户要求优先基础服务与入口切换，不再
继续扩展用户数据备份；本次只调整计划与运维记录，未运行新
验证或修改生产。已有公网 staging 演练不代表正式 IP 证书或
真实手机、桌面已验收。

2026-11-13（内部屏幕回应服务）：服务与 Pi 无工具入口两组模拟
测试共 13 项通过，覆盖授权拒绝、撤销、输入限制、运行器不响应时
调用方取消及模型工具调用；API TypeScript 检查通过。真实授权、
用量入库、外部模型、限频、路由及 iPhone 均未验证。

2026-11-13（系统盘快照恢复路线）：用户确认快照创建正常且对应
Sydney 系统盘；未独立查看云控制台。腾讯云快照 FAQ 表明系统盘
快照不支持直接新建云硬盘、可创建自定义镜像；CreateImage API
文档说明可指定包含系统盘快照的快照集合。文档核查不证明账号
权限、实际入口、费用或隔离恢复成功。

2026-11-13（Pi 无工具入口）：运行器定向测试 8 项通过，模拟模型
返回未提供的工具调用时执行回调未触发；覆盖拒绝检查点、追加指令
和脚本；adapters TypeScript 检查通过。未测试真实提供商、服务端
请求、审计、并发及自动屏幕采集。

2026-11-13（快照用户反馈）：用户报告已创建快照；本次未访问云
控制台，尚未核对其对应实例、盘类型、状态或恢复能力，不能将
用户反馈视作隔离恢复通过。

2026-11-13（陪伴通话状态）：快照选择、陪伴桥和对话反馈三组
模拟测试共 61 项通过，覆盖对应 Bot 听取、静音、思考及其他 Bot
通话；移动端 TypeScript 检查通过。未验证原生活动或后台更新。

2026-11-13（语音链接实例绑定）：语音守卫、陪伴桥、插件及对话
反馈四组测试 60 项通过；增加桥接用例后守卫与桥接 9 项再次通过，
移动端 TypeScript 检查通过。测试不执行 Swift，活动解码、升级、
系统链接及真机行为待验证。

2026-11-13（陪伴语音活动校验）：语音守卫、陪伴桥及对话反馈
三组定向测试共 58 项通过，守卫覆盖活动消失、更换、Bot 与工作区
不匹配及工作区选择；移动端 TypeScript 检查通过。未验证真实
灵动岛跳转、权限对话框或麦克风。

2026-11-13（陪伴活动身份）：Bot 资料页、陪伴桥、屏幕分享三组
模拟测试共 73 项通过，包含其他工作区相同 Bot 和确认期间活动变更；
移动端 TypeScript 检查通过。未验证原生 ActivityKit 或真实工作区切换。

2026-11-13（屏幕分享工作区切换）：屏幕分享与 Bot 资料页两组
模拟测试共 65 项通过，新增覆盖切换再切回、选择期间预览及发送
过程中取消；移动端 TypeScript 检查通过。未验证真实网络竞争、
服务端接收结果或 iPhone 系统采集。

2026-11-13（staging 内置人格构建资源）：维护机确认候选镜像为
`sha256:53e74920f844b86ed90d5a28c6a5ff972b6b7cd4cd84b3707f520ca1600eff36`，
默认用户 `node`、工作目录 `/app`。无网络、只读根文件系统的临时
容器扫描 `/app/apps/web/dist/assets` 中 150 个 JS 文件，找到六种
源码内置人格各自的指令文本；容器以 `--rm` 运行且退出码为 0。
此为静态文本检查，不验证浏览器呈现、实际选择、真实生产当前
Web 资源或备份恢复后的资源。

2026-11-13（陪伴停止顺序）：原生代码静态检查确认结束活动位于
采集停止之前，采集停止异常仍向调用方传播；未编译 Swift，未验证
系统共享异常、活动清除时延或设备后台运行。陪伴桥、屏幕分享和
会话三组现有模拟测试共 51 项通过；这些测试不执行原生 Swift。

2026-11-13（Bot 素材恢复依赖源码核查）：检查 Web 人格库、属性
渲染函数、预设模型及 API 创建路径：源码中有六种内置人格；个人
预设既存储最终指令，也存储自定义指令与属性选择，创建时根据当前
目录重算最终指令。仅为本地源码静态核查，未检查当前生产或备份
Web 构建资源、真实预设内容，也未执行导出、重新导入或恢复验证。

2026-11-13（通话输入输出控制）：通话会话和通话卡片两组定向测试
共 96 项通过，移动端 TypeScript 检查通过；新增模拟覆盖播报中关闭、
麦克风静音时不重新录音、回复保留文字及恢复播报开关。未验证真实
麦克风、扬声器、权限拒绝、设备中断、后台和锁屏。

2026-11-13（屏幕文字单次分享）：屏幕发送、Bot 资料页、陪伴桥及
会话四文件定向测试 110 项通过，TypeScript 检查通过；模拟覆盖
预览前不发送、用户确认、活动与会话变化、采集停止及请求准备中
停止。未执行真实系统采集、模型调用、发送后的会话呈现或真机验证；
中止在途请求不能证明服务器没有接收。

2026-11-13（快照路径核查）：查阅腾讯云创建快照及回滚文档，
确认控制台可从目标云硬盘操作列创建快照，且快照仅包含已写盘
数据、回滚会覆盖之后写入的数据。未登录云控制台、确认实例盘
对应关系、执行快照或恢复；文档核查不构成备份恢复验证。

2026-11-13（最小候选运行身份修正）：从已验证中间镜像创建未启动、
无网络临时容器，仅将默认用户设置为 node、工作目录设置为 `/app`
后保存为镜像
`sha256:53e74920f844b86ed90d5a28c6a5ff972b6b7cd4cd84b3707f520ca1600eff36`；
检查其 parent 指向中间镜像，默认运行 UID 为 1000，API 产物及
schema 摘要与中间镜像一致。使用该 ID 和生产基底 Worker 重新运行
公网 IP staging，合成认证、头像、人格、聊天、群聊、跨 Space
拒绝、第二会话及密码恢复检查通过，退出 0；演练标签容器、网络、
镜像生成临时容器和 443 监听均为 0。演练显式指定 node；该镜像
来自中间镜像而非完整发布流程，未证明正式证书、真实设备或生产
回滚。

2026-11-13（屏幕识别实验离线验证）：五个定向文件共 113 项通过，
覆盖入口确认、账号变化阻止、预览与停止按钮、不可用状态和停止
失败时不替换活动；移动端 TypeScript 检查通过。仅 JS 桥和界面
模拟通过；未在 Xcode 编译原生 ScreenCaptureKit/Vision，未验证系统
选择器、真实授权、OCR、停止、锁屏、后台或音频捕获状态。原生停止
在启动阶段返回“尚未确认”，系统是否确已停止需实机确认。

2026-11-13（最小 IP 候选恢复库兼容）：生产基线与四个候选源码
的文本差异限认证来源、邮件来源、CORS 和屏幕来源接线。维护机
使用 `run-recent-restore-recheck.py --ip-candidate-groups` 将既有
分时备份恢复至无外网临时环境，依次运行生产基底、IP 候选和生产
基底：首版创建合成群聊，候选读取并创建第二个，返回基底后两者
均可读取；每次均检查临时会话、数据读取、外部账号拒绝及数据库
中断后的就绪状态，脚本退出 0。只读复核相关标签容器及临时内存
目录均为 0。此演练不运行迁移，使用合成会话、占位数据库角色和
恢复的分时备份，不覆盖真实用户登录、完整业务、正式 IP 配置、
屏幕链路或生产回滚；候选仍为默认 root 的中间镜像。

2026-11-13（无新增迁移 IP 最小候选）：维护机当前生产同 ID 镜像
的 4 个相关源码 Git blob 与部署修订一致；从经固定摘要核对的本地
源码排除工作区专属删除及协议逻辑，叠加该基底并编译 API，构建命令
及 `node --check` 退出 0。镜像构建因旧版 Docker 层提交慢超过
600 秒，完整镜像标签未产生；后台构建进程随后退出、构建容器
消失。保留的编译中间镜像
`sha256:9b2c39780146bdbb66218c6101782e79d3e95ec4b6b7b5aaaf8dcca82192832d`
默认 root，不可用于生产；无网络核对该镜像 schema 和迁移树摘要与
基底一致，编译产物包含三个 IP 来源变量。

指定该中间镜像并以 node 运行，搭配原生产同 ID Worker 和独立全新
内存数据库，经维护机公网 IP staging 证书完成认证、头像、人格、
单聊、群聊、跨 Space 拒绝、第二会话、伪造来源头及合成密码恢复
验证，退出 0；标签容器、网络及 443 监听均为 0。首次构建使用
不支持的参数未启动，第二次多层复制过慢主动停止并确认无残留；
上述均未修改生产。隔离结果不证明真实数据升级、生产回滚、正式
证书、实际邮件、云电脑或真机；镜像默认用户仍需修复并重新验证。

2026-11-13（陪伴头像补充）：定向测试四文件共 65 项通过，覆盖
Rakazo 轮廓编码、合法及超限照片数据的选择、头像桥接、资料页与
插件；TypeScript 检查通过。测试没有执行 UIImage 解码、缩放或
JPEG 编码，也没有执行 Swift、WidgetKit 或实机展示；不同图片格式
兼容性、真实包体与 4 KB 上限均待苹果环境验证。

2026-11-13（陪伴头像离线验证）：对十种有机头像家族检查轮廓编码、
原始坐标和角度，其中坐标量化误差不超过 0.25 单位；八种内置形状
生成不同的有界采样数据并携带眼睛颜色。模拟一个包含长标识和回复
的 JSON 小于 3500 字节，不代表 ActivityKit 实际序列化大小。头像、
桥接、资料页及插件四文件共 63 项通过，随后头像测试新增预算检查
共 4 项通过；Swift 绘制、系统 4 KB 限制与真机显示尚未验证。

2026-11-13（陪伴对话离线验证）：定向运行陪伴桥、快照筛选、
会话清理、Bot 资料页和语音范围保护五个文件，104 项通过；另一次
包含聊天语音与路由回归的八文件运行 143 项通过。移动端 TypeScript
检查通过。覆盖回复明确选择、不同 Bot/工作区拒绝、旧会话拒绝、
聊天状态与清理的模拟；未编译 Swift，未验证 iOS 系统跳转、录音、
灵动岛或后台运行。会话清理中的原生活动停止失败不会阻止登出，
也没有真实设备证据证明它一定成功。

2026-11-13（陪伴原型离线验证）：单进程 Vitest 定向运行三个文件、
38 项通过；移动端 TypeScript 检查通过；Expo 自动链接解析识别到
SydneyCompanion 模块。Node 检查配置插件语法通过。Windows 本机无
Apple SDK，本轮没有编译 Swift、生成 iOS 工程、构建、签名、安装或
真机运行；扩展识别、类型匹配、灵动岛展示和免费续签均未验证。
另以模拟 Xcode 项目运行插件测试，检查扩展目标仅创建一次、实验包
标识及共享属性文件复制；该测试不等同于真实 Xcode 工程或构建。

2026-11-13（陪伴显示模型）：Node 类型剥离模式直接执行断言，验证
默认文案、禁止显示回复和 emoji 长度限制通过。定向 Vitest 启动后
约 25 秒无测试输出，人工中止，不能认定测试套件通过；未执行 iOS
构建、签名或设备测试。显示模型尚未接入界面。

2026-11-13（公网 IP 转发头对照）：在维护机隔离 staging 申请测试
IP 证书，由公网合成账号登录时分别注入三种伪造的转发、内部客户端
及 CDN 地址头；返回会话的客户端地址非空且不同于三个伪造值。
同轮头像、人格、聊天、群聊、跨 Space 拒绝、第二会话及合成密码
恢复检查通过，演练退出 0；事后 staging 容器、网络及 443 监听均
为 0。此检查未独立对照请求的真实公网出口地址，不证明准确定位；
未覆盖生产 CDN、其他代理路径、真实设备或生产配置。

2026-11-13（Caddy 候选只读复核）：以生产当前运行配置适配示例，
域名 6 条内部路由及证书引用匹配；候选 IP 和域名各有日志配置，
二者差异路径仅为 `/include`，其余配置相同。新增检查首次误将
日志名称列表当作字符串导致只读工具异常，修正后复跑退出 0。
另一只读审计确认临时 HTTP-01 staging 候选保留原配置并仅加入
受限 IP 探针、TLS 测试策略与临时存储；未加载或校验该候选。
这些比较不覆盖全部 CDN、可信代理、真实流量、生产回滚或续期。

2026-11-13（陪伴交互资料核查）：Apple 文档说明展开实时活动支持
按钮和开关，Widget 通常不支持文本输入；语音快捷入口、后台录音和
播报未构建或在真机验证。

2026-11-13（人格预设应用恢复）：维护机使用
`run-recent-restore-recheck.py --personality-app` 在无外网临时库
恢复既有数据库和应用数据，以恢复的当前应用镜像及核心配置启动
隔离 API。为预设所属账号建立仅存在于临时库的签名会话后，
`personalities/list` 返回预设，使用该预设指令创建合成 Bot 成功；
未输出预设内容。健康、会话、未认证拒绝、其他账号拒绝和数据库
中断后的就绪状态检查也通过，脚本退出 0；事后两个演练标签容器
和临时内存目录均为 0。该验证使用临时重置的数据库角色密码及
签名会话，不证明真实密码登录、灾后账号重建、独立导入、正式
证书或生产回滚，亦不代表已建立新的备份。

2026-11-13（人格预设内容比对）：用一次随机挑战分别对生产只读
查询和既有密文隔离恢复库中的完整 `personality_presets` 行计算
摘要，结果一致；各一条且恢复库中关联账号未缺失。首次比较成功
后因挑战变量覆盖容器清理身份而退出失败；只读核实残留容器的完整
ID、标签、镜像和无网络状态后定向清理。修正变量名重新运行，比较
一致、容器清理成功、退出 0；事后演练标签容器和临时内存目录均
为 0。比较只证明分时采样的预设行摘要相同，不证明此后未变、账号
凭据或重新导入可用；未输出记录内容或修改生产。

2026-11-13（陪伴方案资料核查）：查阅三个开源仓库的公开项目说明、
Apple 文档及本仓库侧载配置；确认本仓库免费侧载配置过滤现有
Live Activity 插件并禁止 PlugIns。未安装或运行候选项目，未执行 iOS
构建、签名、屏幕采集、真机或续签验证；开源项目功能为其自述。

2026-11-13（系统镜像与人格预设恢复抽查）：只读检查时生产 API、
Worker、Web、PostgreSQL 健康，Caddy 和原生辅助容器在运行；
应用、Caddy、PostgreSQL、原生辅助镜像 ID 均可在维护机 Docker
缓存中找到。维护机已有应用、基础及原生辅助镜像密文的 SHA-256
均匹配既有记录；本轮未重新解密密文。无网络临时应用镜像中三张
内置头像和人格目录的 SHA-256 分别匹配本地源码文件。生产只读
查询人格预设数量为 1；`run-recent-restore-recheck.py --personality`
将既有近期数据库密文恢复到隔离临时 PostgreSQL，报告预设数量 1、
关联用户缺失数 0，并清理临时容器。两次查询为分时时点，数量相同
不证明具体内容一致、真实账号可登录或预设可重新导入；没有输出
人格及账号内容。未修改生产数据或服务。

2026-11-13（staging 创建 Bot 素材）：首次运行在本机获取官方测试
根证书时连接重置，尚未启动远程演练；增加经维护机 HTTPS 获取
根证书的回退后重试。公网 IP 使用 staging 信任链成功读取三张 WebP
内置头像，合成账号创建包含属性的人格预设、以其指令创建 Bot，
第二会话读取到一致的预设；单聊、群聊、跨 Space 拒绝、第二会话
读取与合成旧来源恢复检查也报告通过，演练退出 0。结束后只读检查
有 staging 标签的容器及网络均为 0，维护机 443 无监听。本次使用
隔离临时服务及合成数据，不证明真实人格或头像已备份、恢复，亦不
证明正式证书、真实客户端、生产回滚或生产服务当前状态。

2026-11-13（Bot 素材范围静态核查）：检查数据库 schema、人格路由
及界面文档，确认个人预设关联用户、界面包含浏览器本地头像库；
没有采集、导出或恢复素材，也未验证线上是否部署相同版本。

2026-11-13（范围调整）：复核现有计划及运维记录，已有基础镜像、
部分配置副本和隔离合成演练；生产 Caddy 卷与数据库全局角色采集
仍受阻，完整系统恢复及生产回滚没有通过证据。本次仅调整文档，
未运行新的恢复验证、创建快照或修改生产服务。

2026-11-13（云电脑状态只读关联）：用只读聚合查询关联未结束的
`computer_runs` 与 `computers`，得到 1 条 `running`、
`native-linux` 记录；未输出标识或内容。数据库状态不证明底层
进程、用户活动或外部任务已核实，不构成停写证明。

2026-11-13（恢复停写只读复核）：先前一次远程命令因 shell 引号
错误在执行 Docker 前失败；修正后以只读事务默认设置和 5 秒语句
时限查询，观察到 14 个其他数据库客户端、0 个活动事务及 0 个
active 客户端；`runs` 的 queued、leased、running、未过期租约
均为 0，云电脑有效执行租约及 running 云端任务为 0，未结束的
云电脑运行记录为 1。仅为各查询时点的聚合数据，不证明所有写入
已受控、记录与外部实际状态一致或可安全回滚。

2026-11-13（正式入口只读复核）：生产 Docker 显示 API、Worker、
Web 和 PostgreSQL healthy，Caddy 及原生辅助容器运行，驱动服务
active；生产机通过回环解析现有域名、正常验证 HTTPS 后请求
`/health` 返回 200。本机按 SSH 配置中的公网 IPv4 尝试系统信任
TLS，服务端返回 `TLSV1_ALERT_INTERNAL_ERROR`，未完成握手及证书
验证。该结果只反映检查时点，不证明真实用户业务、IP 证书签发
状态、完整备份或生产回滚。

2026-11-13（手机手动切服提示）：静态核对不同有效地址及当前
自定义地址下的提示条件，手机 TypeScript 检查退出 0；未运行页面
渲染或真实设备验证，也未验证数据迁移或保护。

2026-11-13（双端设备条件）：本机现有 Windows 目录包的可执行文件
修改时间为 11 月 11 日；只读查询当前即插即用设备，以 iPhone 和
Apple Mobile Device USB 名称筛选结果为零。名称筛选不覆盖所有
驱动命名及其他连接方式，未查询手机内容、安装或执行真实设备联调。

2026-11-13（staging 公网群聊与隔离）：运行
`infra/compose/run-staging-ip-chat.py --public-probe`，本机使用仅含
staging 根的信任库经公网 IP 验证合成单聊和群聊的用户消息、Bot
回复，以及第二会话读取两类消息；跨 Space 获取群聊返回 404。
演练退出 0，标签容器、网络、临时内存目录、计时器无残留，443 未
监听。使用合成账号和测试模型，不证明真实客户端或生产回滚。

2026-11-13（staging 公网 IP 聊天）：运行
`infra/compose/run-staging-ip-chat.py --public-probe`；首次本机使用
系统信任加 staging 测试根通过，随后改为仅使用进程内 staging 根
复验也通过。探针经维护机公网 IP 验证证书链与 IP 身份，使用合成
账号注册、创建 Bot、收发单聊及另一会话登录读取；容器内群聊和跨
Space 拒绝及无令牌网络拒绝检查也通过。复验退出 0，标签容器、
网络、临时内存目录、计时器无残留，443 未监听。此结果不证明公网
群聊、真实客户端、正式证书、完整恢复或生产回滚。

2026-11-13（staging IP 证书及聊天联合演练）：运行
`infra/compose/run-staging-ip-chat.py`；首次因维护机默认 Docker
网桥缺失失败，检查无残留后改用临时出口网络。随后两次退出 0；
容器内使用官方 staging 根验证测试证书链和实际 IP 身份，经同一
Caddy HTTPS 路径完成合成注册、会话、单聊、群聊、跨 Space 拒绝及
第二会话读取。复验中另一隔离网络请求获得 403；结束后标签容器、
网络、临时内存目录及计时器均无残留，443 未监听。业务探针位于
容器网络，未验证独立公网业务访问、真实设备、正式证书或生产回滚。

2026-11-13（手机队列恢复失败提示）：两个队列定向测试文件共 82 项
通过，覆盖三种模拟恢复失败时提示状态出现、清理后消失，且不覆盖
旧磁盘队列；手机 TypeScript 检查通过。未运行完整聊天页面渲染或
iPhone 设备验证，提示不处理恢复后单次保存失败的其他场景。

2026-11-13（staging 迁移及 Worker 对照）：在维护机只读、无网络
临时容器中计算聊天演练 API 镜像内数据库迁移摘要，与本地 209 项
逐项一致，双方没有独有迁移；Worker 镜像源码映射 631 项中 628 项
一致、3 项不同、无缺失，差异为 Prisma 生成文件。此结果不证明
依赖、映射外文件或生产数据库与当前版本一致，也未验证真实设备。

2026-11-13（staging 镜像源码补充核查）：此前聊天演练所用
`sydney-staging-auth-link:20261113` 镜像内嵌源码映射 760 项与本地
逐项比对，757 项一致、3 项不同、无缺失；不同均为 Prisma 生成
文件。此前快照不同的 `app.ts`、`env.ts` 和认证 `index.ts` 均与
镜像映射一致。镜像及本地 schema 摘要一致，镜像内嵌客户端包含
`ProjectWorkspace` 模型，本地生成客户端未包含；这不是完整生成物
等价性或服务端部署验证。源码映射外文件和客户端未纳入本次对照。

2026-11-13（staging 候选时效）：维护机 SSH 可连接；检查时 Docker
无运行容器、443 未监听。以现存规范化快照的 2098 项摘要逐项对照
本地对应文件：2093 项相同、5 项不同、无缺失；不同项包括
`apps/api/src/app.ts`、`apps/api/src/env.ts`、
`packages/auth/src/index.ts` 和两项测试。清单不覆盖新增或未列入
的本地文件，未重新构建或运行新候选；端口状态仅代表检查时点。

2026-11-13（手机候选类型检查）：使用本机现有 Node 24 执行
`tsc --noEmit -p apps/mobile/tsconfig.json`，退出 0；运行
`computer.test.ts` 和 `endpoint.test.ts`，2 个文件共 97 项通过。
未构建安装包或验证真实设备。

2026-11-13（待发送队列范围冲突接线）：Node 24 运行
`thread-feedback.test.tsx` 和 `outbox-disk.test.ts`，共 82 项通过。
模拟恢复失败后，新消息在内存中发送，不调用磁盘保存或清除；该
消息不保证跨进程持久化。真实设备、重启及显式登出未验收。

2026-11-13（浏览器独立 staging 复验）：运行已有
`run-staging-chat-drill.py --browser`，完成迁移、候选 Caddy 内部
自签 HTTPS、合成单聊群聊与跨 Space 拒绝；无头浏览器通过回环 SSH
隧道完成注册、退出和登录，脚本退出 0。服务器标签下容器、网络、
临时内存目录为空，本机 5173 端口可重新绑定。该次使用已有候选
镜像及测试模型，客户端使用回环 HTTP/SSH，不覆盖正式证书或真机。

2026-11-13（待发送队列来源保护）：Node 24 三文件定向测试 36 项
通过，模拟服务器、账号、缓存会话不匹配后回到原范围并读取附件，
以及混合范围时索引和附件不变。测试使用文件系统替身，不证明真机
进程中断、完整迁移或实际消息发送；显式会话清理仍可能删除队列。
`git diff --check` 通过。

2026-11-13（来源读取时序）：Node 24 五文件定向测试 376 项通过，
包括记录读取期间替换会话后严格读取拒绝；首次新增测试因测试模块
实例不一致而失败，修正测试引用后通过。读取完成后的并发写入、
跨进程及实际钥匙串行为未验证，缺失记录的旧域名兼容仍存在。

2026-11-13（手机启动失败提示）：错误边界、启动和来源保护定向
测试 3 文件 10 项通过，涵盖提示、普通错误和重试。手机 TypeScript
检查未通过，剩余 `computer.ts:45`、`endpoint.ts:39` 的可能未定义
错误；本轮修正了监控测试中的两处同类错误。未验证实际启动页面、
iPhone 或会话迁移；`git diff --check` 通过。

2026-11-13（旧域名记录读取修复）：Node 24 六文件定向测试 407 项
通过，模拟记录不存在、存储异常、空值、损坏及令牌不匹配；只有
不存在时保留旧域名兼容，异常情况阻止启动。`git diff --check`
通过；测试使用存储替身，旧包、实际钥匙串和设备回退尚未验证。

2026-11-13（侧载候选回退来源检查）：五文件定向测试 367 项通过，
覆盖旧域名匹配、明确不匹配及缺少已验证记录的兼容路径。记录
缺失或读取异常在旧域名兼容路径中不能区分，仍可能允许未知来源；
未验证旧二进制或真实设备回退。

2026-11-13（Windows 测试隔离修复）：Vitest 配置把 Node glob 的
Windows 反斜杠结果用于正斜杠匹配，导致本应隔离的测试进入共享
项目。规范化路径后，原先卡住的来源保护、API、配置、启动和监控
组合 5 文件 367 项通过；`vitest list` 抽查两个隔离文件和一个
共享文件归类正确，`git diff --check` 通过。未运行全仓测试，
该结果不代表设备或生产切换验证。

2026-11-13（侧载默认来源保护候选）：Node 24 下分别运行来源与 API
接线测试 1 项、API 与配置测试 355 项、启动与监控测试 11 项，均
通过。模拟旧来源、令牌不匹配、无会话、自定义地址与存储异常；
来源不匹配时检查未发出请求且未调用存储写入或删除。一次五文件
合并运行长时间无结果，已中断，原因未确定；不能称合并运行通过。
未验证真实构建变量、iPhone、旧包回退、全部原生网络或待发送数据
恢复，也未实现会话迁移。

2026-11-13（默认来源保护设计核查）：单独来源标记无法原子地证明
后续会话属于该来源，并发写入和进程中断可能留下误导性记录。候选
已撤回，未运行相关测试或更改设备数据；旧会话迁移仍未实现。

2026-11-13（手机 Space 恢复并发修复）：使用本机已有 Node 24 运行
`apps/mobile/lib/api.test.ts`，323 项通过；此前两项选择恢复失败
已通过，新增用例确认清理期间有切服排队时新选择被拒绝且切服完成。
`git diff --check` 通过。测试使用存储和请求替身，不证明真实设备、
多进程并发或服务端工作区隔离。

2026-11-13（手机侧载测试标识门禁）：使用本机已有 Node 24 运行
应用配置测试 31 项通过，覆盖 IP 目标与默认标识冲突、大小写变体、
独立测试标识及旧入口；`git diff --check` 通过。未构建、签名或
安装 IPA，未验证自定义正式标识、钥匙串访问组或设备数据隔离。

2026-11-13（手机待发送数据静态核查）：`clearSessionToken()` 经
`invalidateSessionCaches()` 调用 `clearFailedSends()`，后者清除内存
和已配置的磁盘队列；队列条目含来源、账号、空间和缓存会话范围。
未执行会话清理或访问实际设备数据，未验证附件或异常恢复。

2026-11-13（启动重试与 Space 失败定位）：使用本机已有 Node 24
运行启动、监控和现有错误边界测试，3 文件 12 项通过，包括地址
加载失败后由后续地址事件恢复监控会话，以及错误边界重试渲染。
错误边界为独立组件测试，非完整启动界面或 iPhone 验证。

上次两项 Space 测试的静态定位：恢复清理在 `enqueueEndpointMutation`
内运行，测试在清理存储回调中要求 `selectSpace` 成功；当前选择入口
在该互斥操作期间返回 false，测试断言抛错后被存储清理的错误处理
捕获。这解释了观察到的空选择；尚未确认该互斥语义是否符合产品预期，
两项仍失败，不因定位原因而标记通过。

2026-11-13（手机地址读取失败处理）：启动和监控逻辑 2 文件 10 项、
API 地址相关筛选 5 项通过，覆盖读取失败、空值、无效地址、并发加载
和监控会话等待。完整 API 测试 321 项中 2 项 Space 恢复失败，分别
为并发选择与恢复重存，复跑仍失败；原因及与本次修改的关系未确定。
错误边界的浏览器环境测试因本机 Node/undici 初始化错误未能启动；
尚未验证真实错误界面、iPhone 或旧凭据升级迁移。

2026-11-13（手机启动屏障首步）：直接调用本机已有 Vitest 运行
`apps/mobile/lib/startup.test.ts`，6 项通过，覆盖偏好失败时仍等待
延迟的服务器任务；`git diff --check` 通过。pnpm 启动器因无法
访问注册表校验其版本而失败，随后使用已有 Vitest 完成测试，未安装
依赖。测试不覆盖设备、地址读取失败或旧凭据迁移。

2026-11-13（手机启动屏障静态核查）：`LayoutContent` 对服务器及偏好
加载使用同一 `Promise.all` 并吞掉组错误；若其他任务先拒绝，后续
通知恢复与界面就绪不再等待地址加载。这是静态路径分析，未模拟错误
或在设备上验证；来源加载失败和旧凭据处理亦未验收。

2026-11-13（桌面与浏览器聊天界面双向演练）：隔离 staging 中，
现有 Windows 目录包与独立 Edge 会话分别通过聊天输入框发送合成
消息，并在两个界面检查对应 Bot 回复；演练退出 0。候选 Caddy
内部 HTTPS、合成聊天与空间隔离检查同轮通过。服务器临时容器、
网络及内存目录、本机临时桌面数据均已核对清理，回环端口可重新
绑定。桌面使用 11 月 11 日未签名目录包，客户端经回环 HTTP/SSH
连接，Worker 使用测试模型；不证明当前源码构建、正式 IP TLS、
iPhone、真实账号或完整生产回滚。

2026-11-13（桌面输入框隔离演练）：现有 Windows 目录包连接临时
staging，合成账号通过桌面聊天输入框输入、点击发送，并在桌面页面
看到发出的消息；服务器任务完成，独立浏览器会话读取到该消息及
对应 Bot 回复。浏览器页面再通过 RPC 发消息，桌面会话可读取消息
与回复。最终脚本退出 0；临时桌面数据、容器、网络和内存目录已
清理，回环隧道端口可重新绑定。

首次新增输入框演练在原 48 秒总时限内未完成；调整超时与完成通知
机制后复验通过。Bot 回复通过 RPC 核对，未断言回复在聊天界面可见；
测试使用未签名旧目录包、回环 HTTP/SSH、合成账号和测试模型，
不证明正式 IP TLS、真实设备或生产数据同步。

2026-11-13（桌面与浏览器跨会话聊天）：现有 Windows 目录包和独立
无头 Edge 通过回环 SSH 隧道连接同一隔离 staging，分别登录同一
合成账号，确认服务端会话 ID 不同且用户相同。桌面页面发起 RPC
创建 Bot 并发送消息，浏览器会话读取到该消息和同任务 Bot 回复；
浏览器页面再发消息，桌面会话读取到该消息和对应回复，两次任务
均完成。演练退出 0，临时桌面数据、容器、网络和内存目录已清理，
本机隧道端口可重新绑定。

该验证使用客户端页面发起 RPC，而非通过聊天输入框操作；桌面为
11 月 11 日未签名目录包，Worker 使用测试模型，连接是回环 HTTP
和 SSH。它不证明 iPhone、当前源码构建、正式 IP TLS、真实模型、
真实账号或生产数据同步。

2026-11-13（Windows 目录包隔离联调）：运行 11 月 11 日现有的
未签名 `Sydney.exe` 目录包，以独立临时用户数据、仅本机回环的
SSH 隧道连接维护机临时 Web/API。实际 Electron 主窗口渲染页面，
合成账号经界面注册、退出并重新登录，两次会话读取到相同用户；
未报告页面异常。客户端验证和服务器演练均退出 0。临时桌面数据、
容器、网络和内存目录已清理，本机隧道端口可重新绑定。

前两次探针在启动导航尚未稳定时遇到 `ERR_ABORTED`；等待启动窗口
结束及主窗口稳定后第三次通过。实际运行的可执行文件 SHA-256 为
`78deb190b7264e9651bcd9138acd6639285d897ffb95faf16d31ed1769b179e0`，
`app.asar` 为
`e614fbb9ed274c934c8d9e04c456ac8b0454e0c71e04924ec2a858d2e33037da`。
此为旧目录包与合成账户，使用回环 HTTP/SSH，未验证当前未提交
源码的构建、正式安装、真实 IP TLS、iPhone、真实账号或生产回滚。

2026-11-13（浏览器隔离联调）：使用本机现有无头 Edge，通过仅绑定
本机回环的 SSH 隧道访问维护机内部网络中的临时 Web/API。真实页面
渲染后，用合成账号经界面注册，再退出并经界面重新登录，两次会话
读取到相同用户；浏览器未报告页面异常。浏览器请求限制在回环来源，
未安装系统证书。完整演练退出 0；事后未发现临时容器、网络或内存
目录，本机隧道端口可重新绑定。

前两次浏览器探针因仅匹配英文标题而超时；诊断确认候选页面正常
显示中文标题、输入框，无页面异常及 HTTP 失败。调整探针兼容中文
后通过。该浏览器路径使用回环 HTTP 和 SSH 隧道，未经过 Caddy 的
IP HTTPS，也未验证正式证书、iPhone、Windows 桌面应用或生产数据。

2026-11-13（Caddy HTTPS 聊天联调）：维护机使用候选 Caddy、自签名
示例 IP 证书、候选 Web/API/Worker 和临时数据库，合成账号通过
HTTPS 创建 Bot 和群聊，单聊与群聊各自读取到用户消息、同一任务的
Bot 回复及完成状态；另一 Space 读取群聊返回 404，同账号第二次
登录可读取两种消息和对应回复。脚本退出 0，事后检查无对应临时
容器、网络和内存目录。脚本 SHA-256 为
`e3f0ae348b60c3ab5546f037bf376d3a09de9081a0536e0db3de5db4173e8adb`。
使用内部网络、测试模型和进程内信任的自签名证书，不证明正式 CA、
公网 IP、真实模型、真机或生产回滚。维护机 `/usr/bin/firefox`
实际为缺失 snap 的启动器，未安装浏览器或执行页面渲染测试。

2026-11-13（Caddy 与实际服务隔离联调）：维护机内部网络启动临时
PostgreSQL、候选 API、Worker、Web 和 Caddy，不开放主机端口。
基于 `Caddyfile.ip.example` 将 ACME 签发替换为示例 IP 的临时
自签名证书，并关闭自动 HTTPS 与管理接口；容器客户端显式信任该
证书，核对 IP 身份及错误 IP 的拒绝。经 Caddy 访问 Web 页面、
认证能力、RPC 健康、合成账户注册和会话读取均通过；既有直接 Web
代理、合成聊天、群聊、跨 Space 拒绝及密码找回演练也通过。
脚本退出 0；后续按标签检查无临时容器或网络，`/dev/shm` 无对应
临时目录。

候选 Caddyfile SHA-256 为
`900cf0e6d0cddd2f62063d363119bfc6022b5fa97b60d57c6b387ca902d99901`，
演练脚本为
`c8a069589312db9693fe55049c1162a57ac6cf441e8ae509839749d4c152da53`。
证书只用于该容器，未安装系统信任，也未使用真实生产数据；此次
未验证真实公网 IP、正式 CA、续期、浏览器渲染、设备或生产回滚。

2026-11-13（真实 Web 与后台隔离联调）：维护机在内部网络启动候选
Web、API、Worker 和临时 PostgreSQL，以示例 IP Host 请求 Web
页面、经 Web 代理获取认证能力和 RPC 健康，并以合成账户经代理
完成注册及会话读取，均通过。单聊、群聊、跨 Space 拒绝、第二
会话读取及模拟邮件找回也通过；脚本退出 0。事后按标签检查无
临时容器或网络，`/dev/shm` 无相应临时目录。

首次 Web 启动因将 shell 包装器作为 Node 脚本运行失败，修正后
第二次各业务检查通过，但 PowerShell 文本管道在末尾插入回车导致
脚本退出 127；随后以原始字节传输重新运行并退出 0。上述均使用
合成数据、测试模型及内部 HTTP；未验证 Caddy、真实 IP TLS、
页面浏览器渲染、真实邮件、真实设备或生产回滚。

2026-11-13（真实 Web 静态入口隔离探测）：维护机使用候选镜像
`sha256:50863f1b5a76c9da9c8525564e1b36c42f87bfea82b0ee6afe5e54715d5af4d4`
运行无网络、限资源的一次性容器，以示例 IP Host 请求 `/`、
`/login`、`/reset-password`，均返回 HTML，页面引用的脚本入口
均返回非空内容；命令退出 0，随后按标签检查无残留容器。
这是镜像内实际静态资源和 Vite 预览服务，不证明 SPA 路由实际渲染、
认证、代理、TLS、真实设备或部署通过。

2026-11-13（侧载更新配置门禁）：本机运行 `app-config.test.ts`，
29 项通过。覆盖旧域名显式 OTA 配置、IP 和其他域名在配置 OTA 时
拒绝，以及这些地址在不启用 OTA 时允许生成配置；未构建 IPA、
连接 Expo 或验证远端变量、实际更新与设备行为。

2026-11-13（双端地址定向测试）：使用现有本机 Node 和 Vitest 运行
手机 `endpoint.test.ts`、桌面 `setup-config.test.ts`，2 个文件
82 项通过。新增桌面测试覆盖公网 IP 的 HTTPS 规范化、拒绝 HTTP、
域名与 IP 的不同会话分区及 IP 端口区分；测试仅使用示例地址，
未联网、未启动应用，不能证明正式证书、已有会话迁移或真机可用。

2026-11-13（手机升级地址路径静态核查）：阅读 `server-config.ts`、
`api.ts`、`session.ts` 和启动加载路径，确认保存的自定义地址优先，
手动切服与启动时采用默认地址走不同路径，会话令牌单独读取。未执行
安装、升级、网络请求或真机验证；不能据此认定令牌一定被新来源接受。

2026-11-13（Caddy 合成采集本机基础测试）：使用现有 Python 执行
`caddy-synthetic-collection.test.py`，6 项中 5 项通过、1 项跳过；
跳过项需要 Linux，未验证实际 SIGTERM 及子进程清理。测试未连接
服务器或生产数据，也不能替代独立审核或解除采集硬阻断。

2026-11-13（Caddy 合成采集信号修订）：内部函数增加 SIGINT、
SIGTERM、SIGHUP 处理，测试控制器不再自行安装信号处理器。本机
Python AST 语法检查通过；首次 `python` 命令因 PATH 缺少该命令
未执行，随后使用本机现有 Python 运行语法检查。没有运行 Linux
测试、真实 age 或生产采集；独立审核和异常中断验证仍待完成，
不能据此解除原有硬阻断。

2026-11-13（较新在线部分快照隔离恢复复验）：维护机通过固定摘要
校验后，在无网络临时 PostgreSQL 18 恢复既有数据库密文；age 与
pg_restore 均退出 0。使用恢复配置核验 1 条空间密钥和 25 个加密
消息块，恢复 appdata 14 个文件。隔离 API 健康与就绪均 200，
合成签名会话可读取 4 个 Bot、1 个群聊、51 条消息，并核对 3 个
附件；未认证 RPC 返回 401，6 项跨账号拒绝通过。暂停隔离数据库
时就绪返回 503，恢复后返回 200。应用和数据库容器清理报告成功，
随后只读检查无相应标签容器或本次临时目录。

首次两条传输命令因本地及远程引号错误失败，未启动演练；新增
`run-recent-restore-recheck.py` 后执行成功，启动器 SHA-256 为
`d90ef0777ddacb8160fc1ec894731862ea0f038eabc0c9566847eeef98414ef9`。
本次使用占位数据库角色和临时合成会话，未验证真实密码登录、
完整授权、Caddy 卷、工作区、跨源一致性或生产回滚；明文经过内存
及 tmpfs，不保证不进入 swap 或安全擦除。

2026-11-13（较新异机密文只读复核）：维护机较新在线部分快照所在
挂载点为 `/dev/loop7` 上的 ext4，后备文件与记录路径一致，挂载
选项包含 `nosuid,nodev,noexec`；数据库、appdata 密文及元数据
按同目录 `SHA256SUMS` 校验均通过。首次以普通文件检查接收完成
标记未找到，随后目录列表确认 `RECEIVE_FINISHED` 是目录而非普通
文件；不应把首次检查结果误认为标记丢失。此核对未重新解密或恢复，
不证明清单自身可信、备份新鲜、一致性、生产角色和完整系统恢复。

2026-11-13（认证页面代理隔离验证）：维护机无网络 Caddy 容器以
自签证书和模拟上游验证域名及示例 IP 入口；邮箱验证和密码重置
令牌路径均转发模拟 API，登录及重置页面均转发模拟 Web，合成查询
及路径令牌未出现在代理访问日志。原路由、跨站拒绝和 WebSocket
合成检查亦通过，脚本退出 0；同标签容器无残留，维护机原 Caddy
active、443 无监听。脚本 SHA-256
`4ae3ec28f4d8ba5ea8e427af2fa5c4971c4c76d260fac3adff9dc42e5b6c6996`，
输入 Caddyfile SHA-256
`900cf0e6d0cddd2f62063d363119bfc6022b5fa97b60d57c6b387ca902d99901`。
上游为模拟服务，未验证真实 API、页面内容、正式证书或实际发信；
日志检查只覆盖本次合成令牌形式。

2026-11-13（独立邮件来源的 Passkey 合成验证）：维护机无网络、
限额容器使用认证 staging 候选和软件认证器，以旧域名作为 Web
来源、示例 IP 作为可信邮件来源，完成合成账号的 Passkey 注册
和登录，并核对用户身份。定向测试 1 项通过、其余 62 项跳过；
测试文件传输前后 SHA-256 均为
`0150a52295697639a1641fdac9fa78e8f86dd5b669444d187f0ba864adbcdba8`。
容器按标签核对后清理。此为内存适配器与软件认证器，不验证已有
生产凭据、浏览器、系统认证器、iPhone 或 Windows 真机。

2026-11-13（独立认证邮件来源）：从规范化 staging 候选叠加本轮
认证相关源码，在维护机无网络、768 MiB 容器构建 API，退出 0；
镜像 ID 为
`sha256:50863f1b5a76c9da9c8525564e1b36c42f87bfea82b0ee6afe5e54715d5af4d4`，
默认用户 node、入口为 sleep，仅供显式入口的隔离演练，不是生产镜像。
`NODE_ENV=test` 下环境配置及认证定向测试共 149 项通过；首次未
覆盖基底生产环境，认证内存适配器因缺少 rateLimit 模型而失败，
修正测试环境后通过。

全新内存数据库及回环开发 API 的模拟邮件演练中，规范 Web/Auth
来源保持合成旧域名，独立邮件来源设为受信示例 IP；邮箱确认与
密码找回链接指向 IP，确认、密码重置、旧密码拒绝、新密码登录及
旧来源登录通过，能力接口仍报告旧域名 Passkey RP。单聊、群聊、
跨 Space 拒绝和双会话读取复验通过，脚本退出 0；只读检查无对应
临时容器、网络和凭据目录。脚本 SHA-256
`164d9746f71ab863207c9f4cba37b478493a1af10a3523a7eb81e444074e07a3`。
未完成真实 Passkey 注册或登录、邮件投递、网页、IP TLS、设备、
生产迁移或完整回滚验证。候选基于叠加式镜像，不能视为干净发布包。

2026-11-13（模拟 IP 邮件验证及密码找回）：同一隔离演练完成聊天
检查后，停止聊天 API 和 Worker，启动仅监听容器回环的开发 API；
使用内存邮件模拟器，将 `WEB_ORIGIN`、`BETTER_AUTH_URL` 设为
文档示例 IP 的 HTTPS 来源，另将合成旧域名加入可信来源。合成账号
注册后的确认链接和找回链接均使用该 IP；处理确认链接、从旧来源
登录、请求找回、读取重置跳转、修改密码、拒绝旧密码及接受新密码
均通过。能力接口显示密码找回地址为 IP 页面、Passkey RP 为空。
脚本退出 0，后续只读复核没有本演练前缀的容器、网络及临时凭据
目录。脚本 SHA-256：
`415e6844f9784b011dfcd7910922aa648b718be8f00cd1635ed0485eed204727`。
仅使用模拟邮件、示例 IP 和容器内 HTTP，未打开实际找回网页、验证
真实邮件送达、IP TLS、真实客户端或旧 Passkey；更换规范来源对旧
客户端和其他回调的影响未全面验证，不能直接用于生产配置。

2026-11-13（生产认证能力只读核对）：通过旧域名回环 HTTPS 查询
公开认证能力，返回密码登录、密码找回和邮箱验证码启用，SSO 未
配置，原生 iOS/Android Passkey 能力均为 false；返回的密码找回
页面使用旧域名。静态代码核对显示手机使用服务端提供的找回页面，
且源码中的 Passkey relying party 对非回环 IP 返回空值。未提交
账号、触发邮件或执行密码登录；接口配置与源码核对不证明发信、
实际找回、生产运行代码与工作区一致或真机行为。

2026-11-13（隔离双会话聊天读取）：全新临时数据库中，合成账号
分别注册和登录，验证两个服务端会话 ID 不同且用户 ID 相同；
第二会话在指定 Space 下读取第一会话产生的单聊和群聊用户消息及
各自任务关联的 Bot 回复。原有单聊、群聊、任务完成和跨 Space
拒绝检查一并通过，脚本退出 0；只读复核无本演练前缀容器、网络
或 `/dev/shm` 凭据目录。脚本 SHA-256：
`e180162a41fb060d96a0dc50850eda852aa8b916af9d9d072b607279008fbc2b`。
这是两个合成 HTTP 会话，不代表真实设备、IP TLS、实时推送、真实
模型、项目文件夹隔离或生产回滚通过。

2026-11-13（生产状态只读复核）：Docker 和 containerd 为 active；
API、Web、Worker、PostgreSQL 容器报告 healthy，Caddy 容器运行。
使用旧域名及主机回环地址的 HTTPS 请求返回 200，证书名称匹配，
有效期至 2027-02-03 01:42:34 UTC。`certbot.timer` 为 active、
enabled。systemd 为 degraded，唯一失败项是 11 月 4 日启动的临时
截图命令，退出码 1；未读取其输出，未调查业务关联，也未重置单元。
这是时点状态，不证明生产数据备份、完整业务、证书未来续期同步、
生产回滚或公网设备访问。

2026-11-13（隔离群聊及跨 Space 验证）：在全新内存数据库和内部
网络中，合成账号创建两个 Bot 及群聊，向群聊发送指定 Bot 的消息。
读取到用户消息与相同 `runId` 的 Bot 回复，最近任务列表显示该
任务 completed；另建一个 Space 后，使用其 Space 标头读取原群聊
返回 404。单聊复验也通过，脚本退出 0；只读复核没有本演练前缀
的容器、网络或 `/dev/shm` 凭据目录。脚本 SHA-256：
`8ad1279dfaf8bee99b69171131626904df0a1d86ed138c492b9f858bb05b9b3a`。
这是模拟模型和容器内 HTTP，未验证真实账号、模型、设备、公网
IP、工作区文件夹、正式证书、生产恢复或回滚。

2026-11-13（隔离聊天演练）：维护机使用内部 Docker 网络、全新
内存 PostgreSQL、独立 API 和 Worker，分别以迁移角色和受限运行
角色完成迁移与启动。合成账号创建 Bot、发送消息；通过 Graphile
队列和 scripted 运行时处理后，读取到原用户消息和 `runId` 相同的
Bot 文本回复；经最近任务列表确认该任务状态为 completed。最终以
原始文件流运行脚本退出 0，脚本 SHA-256 为
`d0391c92848521a21a579a2f408503c1f345f053db4faff4fd20bb29469bf121`。
随后只读复核没有本演练前缀的容器、网络或 `/dev/shm` 凭据目录。
首次 API 因未配置临时屏幕代理密钥退出；补齐后第二次因验证脚本
误用 assistant 角色而超时；更正为 bot 并关联任务 ID 后，业务
通过但 PowerShell 管道附加回车造成退出 127，改用原始文件流复验
后退出 0。整个演练未使用真实账号、生产数据、真实模型、公网 IP
或真实设备，未验证群聊、WebSocket、正式证书及生产回滚。

2026-11-13（staging Worker 构建）：维护机以规范化 API 候选镜像
在无网络、768 MiB、1 CPU 的容器中构建 Worker 与健康检查，退出 0，
未 OOM。Worker 产物 SHA-256 为
`9a77b698acbc15186453b2cdd76350f8549310c90e9d59297cbed47482cacc19`；
保存镜像 ID 为
`sha256:e4cdb8d3f16aebd8efaae0902c29b22c98d0ecda3cac4a1e6bbb7b0ae72cf16c`。
重新以 node 用户读取产物摘要一致，健康检查产物存在；构建容器已
清理。镜像继承叠加式候选且默认用户为 root，不能用于生产；这次
没有启动 Worker，未验证消息处理、数据库连接或真实模型。

2026-11-13（IP 代理 WebSocket 隔离演练）：在维护机无网络临时
Caddy 容器中，使用输入示例 Caddyfile SHA-256
`900cf0e6d0cddd2f62063d363119bfc6022b5fa97b60d57c6b387ca902d99901`
及脚本 SHA-256
`9fd6d8309b5ddab8ed74c03a20e1f60804f76951703c86fd9e0b76b023be4df0`，
以临时自签证书和合成 Web 上游验证域名及无 SNI 的 IP 入口：
`/novnc/session/view/TEST/websockify` 均完成 WebSocket 101 握手、
客户端屏蔽帧发送及上游回显。现有健康、API、RPC、Web 路由、
跨域名/IP 组合拒绝和合成敏感日志脱敏检查通过；脚本退出 0。
首次传输有 base64 换行警告，第二次复验命令引号错误未执行演练；
随后以摘要校验传输并完整复验通过。按标签检查无残留容器，维护机
443 未监听、原 Caddy active。该演练不连接真实 noVNC、云电脑、
公网或真实客户端，也不证明正式证书和 HTTP/2 行为。

2026-11-13（迁移换行及代理对照）：将工作区历史迁移中唯一的 CRLF
规范化为 LF，`git diff` 无 SQL 内容差异，文件 SHA-256 为
`600b694e05b93fb76a8e0f53382b90e6db5af5c2f9f0f8d2dff9260909bd3ae0`，
与此前只读取得的生产迁移记录一致。再次使用只读对照工具检查当时
生产 Caddy 运行配置和 IP 示例：现有域名 6 条内部路由逐项相同、
证书文件引用相同；服务器日志映射及日志配置不同，原日志配置除
额外排除项外保留，示例还有新增 SNI 检查。此为结构对照，不证明
完整访问控制或实际业务兼容；未加载配置、签发证书或写入生产。

2026-11-13（staging IP HTTPS 与合成认证）：维护机新建内部 Docker
网络、全新内存 PostgreSQL 和规范化候选 API，数据库迁移成功。临时
Caddy 使用 TLS-ALPN-01、staging CA 和独立临时存储签发维护机公网 IP
证书；只允许指定探针来源访问健康和认证接口，并设置 5 分钟清理
计时器。另一台服务器将官方 staging 根仅加载至探针进程，从公网验证
证书链和 IP 身份，经 HTTPS 验证 `/health`、`POST /rpc/health`，
并用合成账号完成注册、登录和相同用户会话读取。

过程限制：首次访问返回 403，因为原假定的服务器入站地址与探针实际
出口不同；尝试通过外部 IP 查询服务确认出口被自动审批拒绝，未执行；
随后通过 staging 端观察已验证 TLS 连接的来源，更正临时代理范围并
重新签发测试证书后通过。API 的回环端口发布未能访问，临时 Caddy
改用 Docker 内部地址连接。测试后临时 Caddy、API、数据库、网络、
计时器及合成凭据已清理，443 端口释放，维护机原 Caddy 服务仍 active。
此测试不使用生产数据或正式 CA，不证明真实 iPhone/Windows 信任、
聊天、屏幕、完整业务、自动续期或生产回滚。

2026-11-13（隔离升级与版本回退）：维护机以生产同 ID 旧 API 镜像、
规范化新候选及 PostgreSQL 18 镜像，在内部网络、无公网端口的全新
内存数据库中演练。旧镜像初始迁移退出 0，并创建合成账号、两个 Bot
及群聊；停旧 API 后新候选迁移退出 0，报告应用
`20261119120000_project_workspace_metadata`。新 API 读取原 Bot
和群聊并创建新群聊；切回旧 API 后 `/ready` 正常，读取两组群聊及
Bot 并创建另一群聊；再次启动新 API 能读取旧版回退期间创建的群聊。
过程未使用真实用户或生产数据库。仅验证一组账号及有限群聊读写，
未涉及真实生产数据、全部业务、客户端、数据库还原或生产切换；临时
容器、内存数据库、网络和合成凭据已删除并按标签复核。

2026-11-13（规范化 staging 候选）：维护机校验原始归档及 2098 个
文件后在新的私有目录复制快照，仅规范化上述历史迁移的一处 CRLF；
新清单 SHA-256 为
`20822b45fd42be98362b111324b2de8baf157898545cdb9dc6b51253044bb408`，
逐文件摘要复核通过。无网络、限 768 MiB 容器生成 Prisma client
并构建 API 与迁移 CLI，退出 0 且未 OOM；保存镜像
`sha256:6f65032f2a4f7fb382b39526cca16ed8256694d3b01ae6c88717d934878befab`。
镜像标记仅供 staging，镜像内历史迁移摘要与当次生产记录一致；
构建容器已删除。未运行该镜像的数据库升级、业务或回滚验证；它仍
基于旧镜像叠加源码，不能视为干净发布构建。

2026-11-13（生产迁移摘要核查）：生产 `_prisma_migrations` 只读
统计为 208 条记录、0 条未完成记录、项目工作区迁移 0 条；将 208
条已完成迁移的名称及摘要与本地文件比较，207 条一致，1 条不一致，
没有缺失文件。不一致文件为
`packages/db/prisma/migrations/20261103090000_task_execution_state/migration.sql`：
工作区存在 1 处 CRLF，其他行为 LF；内存中将 CRLF 规范化为 LF 后，
SHA-256 与生产记录一致。现有 staging 快照清单使用的是未规范化
摘要，虽然此前空库迁移成功，不能证明从生产现状升级无迁移漂移。
首次查询因 shell 引号错误失败，改用标准输入后成功；未修改生产数据
或迁移文件。尚未检验使用规范化快照从生产形态数据库升级及回滚。

2026-11-13（staging Space 业务隔离）：使用候选镜像、独立内部
网络、无公网端口和全新内存 PostgreSQL，迁移及运行角色创建成功；
合成账号在两个 Space 共创建 4 个 Bot 和 2 个群聊，分别经模拟旧域名
和 IP Origin 读取时包含本空间对象且不包含对方对象。另用独立合成
对象核对：从错误 Space 读取群聊返回 404，另一账号访问目标 Space
返回 401。首次本机命令因 PowerShell 引号错误未启动远程脚本，
改为通过标准输入执行后成功。临时容器、数据库、网络和凭据已删除
并复核。本次使用容器内 HTTP、合成账号和同一服务端，未验证真实
客户端、项目文件夹、聊天消息、模型、WebSocket 或正式证书。

2026-11-13（应用 staging 迁移与认证）：维护机 legacy builder 不支持
`COPY --chmod`，首次镜像构建失败且未生成目标标签；随后在无网络、
768 MiB 限额容器中使用已核对快照生成 Prisma client 并构建 API 和
迁移 CLI，退出 0、未 OOM，再保存为仅供 staging 的镜像
`sha256:6d9abe1c203d5126571497010e2fef4a46109b6fa5857fd324f7fa6900494c39`。
镜像标签标明源码归档摘要，入口为非 root 用户；只读检查显示 API、
迁移 CLI 和 Prisma client 存在，API 摘要与前次生成结果一致。镜像
基于旧镜像叠加，可能保留快照之外的文件，不能视为干净发布构建。

使用 Docker 内部网络、无公网端口、内存 PostgreSQL 18 数据目录与
一次性合成凭据，迁移命令退出 0，报告所有迁移成功及运行角色创建。
API 以只读根文件系统、无额外能力启动，`/health`、`/ready`、
`POST /rpc/health` 均返回 200；旧来源和测试 IP 来源的 CORS 预检
分别允许对应来源，未受信来源没有允许来源响应头。全新合成账号
从旧来源注册返回 200，从 IP 来源登录返回 200，并读取到同一用户
会话。测试使用容器内 HTTP 回环和模拟 Origin，没有真实 TLS、真实
IP 连接或用户凭据；未验证真实设备、聊天、WebSocket、屏幕或生产
数据。临时 API、数据库、迁移及构建容器、内部网络、内存凭据目录
均已删除并复核；staging 镜像和私有源码快照保留。首次镜像 inspect
因不存在的 Volumes 模板字段报错，随后改用可用字段核查。

2026-11-12（Prisma 及 API 隔离构建）：重新核对快照归档摘要和解压
树的 2098 个文件；缓存镜像内 Prisma 可执行文件存在，检查的两个
dotenv 路径不存在。无网络、768 MiB、1 CPU 临时容器执行
`prisma generate` 和 API 构建，进程退出 0，未 OOM；Prisma 报告
生成 7.10.1 client。保存的 API SHA-256 为
`346df4c6f15fe0d7a8ef2d018d906a96c2849716785365b2788772f8c4f3d30c`，
产物中可找到两个候选来源变量及 `ProjectWorkspace` 字符串，生成
目录含 116 个文件。临时容器已删除并确认不可见。未运行数据库迁移、
应用、设备或认证验证；字符串存在不证明实际行为，基底旧文件仍可能
影响构建。

2026-11-12（API 隔离构建）：本地快照共 2098 文件，归档 SHA-256 为
`86040df17e0e03d5419c50d0f2865880f0c2d2134879222dc835ed62e4efc87f`；
本地归档逐文件对照清单通过，维护机归档及清单摘要一致，解压后逐项
SHA-256 核对通过。首次维护机核对因清单 CRLF 失败，转换输入换行
后通过；未修改源码。快照锁文件与生产镜像一致，临时无网络容器对
快照各 package.json 与基底镜像逐项比较未报告差异。基底为生产同
ID 镜像，限定 768 MiB、1 CPU、无网络及额外能力，运行
`node ../../scripts/build-server.mjs src/index.ts` 退出 0、未 OOM。
产物 SHA-256 为
`24a4e6f1e1639a9e920f18ef3c21ef4c2f8811186eb95232ce69a269de4db74b`，
包含两个候选环境变量字符串；容器删除后复查不可见。本次未生成
Prisma client、构建完整镜像、运行应用、测试认证或检查所有潜在
旧文件；文件名筛选不等于内容秘密扫描。

2026-11-12（维护机构建材料）：维护机本地存在 pnpm 9.15.0 的
Corepack 缓存及生产同 ID 应用镜像。使用该镜像启动无网络、只读、
限制能力和资源的临时容器，观察到 Node 24.22.1、esbuild、
`scripts/build-server.mjs` 和 API 源码；根 `node_modules/.bin/prisma`
不存在，不能据此推断 Prisma 在其他位置是否可用。容器退出 0，
随后按镜像查询未发现残留容器。没有构建当前工作区或启动应用。

2026-11-12（维护机应用 staging 资源只读核查）：当次 Docker 无运行
容器，根分区约 15 GiB 可用、内存约 1.1 GiB available；系统 Node
为 22.23.2、Corepack 为 0.34.6，`pnpm` 未在 PATH 中。仓库声明
Node `^22.22.2 || ^24.0.0 || >=26.0.0`，包管理器为 pnpm 9.15.0。
未确认包管理器缓存、隔离源码或依赖是否可用，也未构建、启动或验证
应用；容量为即时值，不保证构建资源足够。

2026-11-12（屏幕双入口静态核查）：候选电脑路由的屏幕与终端均使用
`screenProxyPublicOrigin ?? webOrigin` 生成代理能力 URL；该配置
并非按客户端切换。此次只修改配置说明，未运行测试、连接设备或
修改生产；旧、新客户端实际行为与 WebSocket 均未验收。

2026-11-12（生产认证候选部署核查）：API 容器配置启动
`node --enable-source-maps dist/index.js`；该文件包含打包代码和
`extraOrigins: MOBILE_AUTH_ORIGINS`，未发现
`EXTRA_TRUSTED_ORIGINS`、`SCREEN_PROXY_PUBLIC_ORIGIN` 字符串。
关联源码显示认证同时使用 Web 来源和认证基础地址；两变量也未在
所查 env 与 auth 源文件出现。镜像 revision 标签为
`1993995e572fd4235c7684c533db23eb6cf0554e`。这是静态核查，
未验证真实登录、其他扩展机制、源码与全部运行行为一致或新版本部署。

2026-11-12（生产来源配置与旧证书加载）：API 容器中 `WEB_ORIGIN`
非空，`EXTRA_TRUSTED_ORIGINS`、`SCREEN_PROXY_PUBLIC_ORIGIN`
未设置；API dist 范围未搜索到后两项变量名。扩大到整个应用与依赖包的
搜索耗时过长并中断，结果不完整；随后容器内未发现 grep 进程。不能
据此判定依赖包的实现或认证行为。Caddy 回环 TLS 握手证书指纹与
卷内公开证书当次一致，到期时间相同；不证明将来续期后自动加载。

2026-11-12（旧入口挑战路径只读探针）：维护机不使用代理请求域名下
不存在的 ACME HTTP 路径，收到 302，目标为 DNS 服务商的拦截页面；
同机 HTTPS 健康接口返回 200、JSON `ok=true`。生产回环带现有域名
Host 请求相同 HTTP 路径返回 308 跳转 HTTPS，使用证书信任验证访问
回环 HTTPS 路径返回 200、`text/html`。当次 Caddy 适配配置的 HTTPS
路由中没有该挑战路径专用处理，未匹配业务路由转发至 Web。未创建
挑战文件或申请证书；探针仅覆盖单次、单个不存在的路径和各自网络
视角，不能单独证明真实 ACME 挑战必定失败。

2026-11-12（旧入口续期链路只读检查）：生产 API、Web、Worker、
PostgreSQL 显示 healthy，Caddy 运行。`certbot.timer` 已启用，最近
任务退出 0；唯一 deploy hook 对匹配的 certbot lineage 执行
`systemctl reload sydney-pc-nginx.service`，目标当前 inactive、
disabled。certbot 公开证书与 Caddy `/data/certs/fullchain.pem`
当次 SHA-256 指纹一致、到期时间均为 2027-02-03 01:42:34 UTC；
检查范围内的 systemd、cron 和钩子文件名搜索未发现其他匹配脚本。
搜索未穷尽所有可能的传播机制，且任务成功不代表发生过续期；没有
执行续期、重载、告警或故障演练，也未读取私钥。一次 Docker 模板
查询因引号错误失败，后续分别取得挂载和证书信息。
续查显示 certbot 使用 webroot 验证，路径为
`/var/lib/sydney-pc-acme`，Caddyfile 中未发现字面量
`acme-challenge` 或 `webroot`；这不能排除上游代理提供挑战路径，
实际挑战路由及 webroot 可达性尚未验证。
另只读确认 Caddy 的 `/data` 为命名卷，卷内公开证书是普通文件；
certbot 的公开证书路径为指向归档的符号链接。两者不是同一文件路径，
certbot 更新链接本身不会更新 Caddy 卷内普通文件；尚未排除其他复制机制。

2026-11-12（IP 证书监控准备）：新增独立检查器，按用户此前要求未运行
测试或线上检查；尚未验证真实正式证书、默认信任配置、告警调度和送达。
该工具准备不代表生产续期、备份恢复或回滚通过。

2026-11-12（生产 Caddy 持久目录只读核查）：生产容器 inspect
显示 `/data` 和 `/config` 分别为可写 Docker 命名卷，
`/etc/caddy/Caddyfile` 为只读绑定；容器内 `caddy environ` 报告
`XDG_DATA_HOME=/data`、`XDG_CONFIG_HOME=/config`，应用数据和配置
目录分别为 `/data/caddy`、`/config/caddy`。此次只读取挂载类型和
目录配置，未读取或导出卷内密钥、创建正式账户或验证持久卷备份、
恢复和宿主重启；检查是时点结果。

2026-11-12（staging 自动续期加速演练）：维护机以生产同摘要 Caddy
镜像、独立临时命名卷和 staging CA 申请测试 IP 证书；仅在该演练配置
中将续期扫描间隔设为 5 秒、续期窗口比例设为 0.9999。观察到自动
续期成功事件，证书文件摘要变化、账户密钥文件摘要保持一致；复验时
进一步核对新证书 IP SAN、staging 签发者名称，以及实际无 SNI TLS
握手提供的证书指纹与新存储文件一致。HTTPS 返回预设响应，演练停止
并退出 0；按标签和名称检查未见临时容器、卷或计时器，维护机 Caddy
active、TCP 443 无监听。

该测试人为加速续期，使用维护机 IP、staging CA 和临时卷；不证明
生产默认时间窗口、正式 CA 自动续期、续期失败告警、宿主重启或证书
密钥恢复。测试材料已删除，没有更改生产配置或正式客户端信任。

2026-11-12（staging 账户和证书跨容器重建）：维护机在核对主机与
Docker 身份后，使用独立临时命名卷和空闲 443，通过 TLS-ALPN-01
签发测试 IP 证书；核对账户文件及证书文件的摘要，销毁签发容器后
以无网络新容器挂载同一卷。新容器可返回合成 HTTPS 响应，账户文件
和证书文件摘要与重建前一致；演练退出 0。事后按演练标签及名称未见
容器、卷或计时器，维护机 Caddy active，443 无监听。

首次运行已生成测试账户与证书，但使用 `wget` 连接回环地址时 TLS
握手失败，等待超时并清理；根因未确定。探针改为通过 IP 地址和回环
解析使用 `curl` 后复验通过。测试卷已删除，未保留 staging 账户；
该结果不证明生产持久存储、宿主重启、自动续期、证书私钥备份恢复或
正式 CA 账户可用。

2026-11-12（生产 IP HTTP-01 staging）：此前生产证书签发使用
TLS-ALPN-01，而待部署示例保留 HTTP-01。只读对照 HTTP-01 候选，
并在维护机模拟文件证书的独立容器内以同摘要 Caddy 校验候选，但没有
在维护机实际签发 HTTP-01。随后在生产预设独立恢复计时器，临时加载
关闭 TLS-ALPN 的 staging 候选；近期 Caddy 日志只输出统计时显示一条
`http-01` 挑战尝试，测试证书成功签发。维护机经公网仅在进程内加载
官方 staging 根，验证生产 IP 证书链、IP 身份、限定匿名路由和与手机
格式一致的 RPC 健康请求；生产回环也通过。

执行器检查旧域名 HTTP 308 重定向在加载前、期间及恢复后不变，HTTPS
健康和证书指纹保持一致。执行器主动恢复原运行配置并清理测试证书
目录；事后运行配置与启动配置、自动保存 JSON 相等，域名健康正常，
API、Web、Worker 和 PostgreSQL healthy，未见对应恢复目录、计时器
或 staging 存储。生产独立计时器此次没有实际触发；未验证正式证书、
持久账户、自动续期、真实登录及手机或桌面应用。

2026-11-12（生产 IP staging RPC 健康）：确认手机连接探针使用
`POST /rpc/health`、`rakazo://` 来源及合成空 JSON 请求，旧域名
入口返回成功的 RPC 健康结果。候选只为该固定 IP 路径增加匿名 POST
探针，并删除认证及 Cookie 请求头；生产配置经只读对照保留旧路由和
证书引用。维护机使用模拟旧证书先演练，再经独立公网以仅进程内加载
的官方 staging 根验证生产 IP 证书链、IP 身份和该 RPC 请求成功；
生产回环探针、先前限定的匿名路由和旧域名健康及证书核对通过。

执行器恢复原运行配置并清理测试存储；事后运行配置与启动配置和
自动保存 JSON 一致，域名健康正常，API、Web、Worker、PostgreSQL
healthy，未发现对应恢复目录、计时器或 staging 存储。首次本机
传递三个编码脚本超过 Windows 命令行长度，维护机演练未启动；
改用标准输入传输后成功。本次未让生产恢复计时器触发，未验证真实
手机、登录、其他 RPC、正式证书或自动续期。

2026-11-12（生产 IP staging 匿名路由）：只读检查原域名时，`/health`、
匿名 `/api/auth/get-session` 和网页首页分别返回 200，GET
`/rpc/health` 返回 405；前两者及 RPC 为 JSON 类型，首页为 HTML。
候选在 IP 下仅临时允许这些指定 GET 路径，业务探针复用原域名代理，
并删除 Authorization、Proxy-Authorization 和 Cookie 请求头；旧路由
及证书引用保持不变。维护机以合成旧证书先验证流程，再在独立公网
使用仅进程内加载的官方 staging 根连接生产 IP，四个路径的状态及
类型与上述结果一致，健康 JSON 为 ok；生产回环探针与原域名的状态、
类型一致。旧域名健康与证书指纹保持一致。

受保护执行器恢复原运行配置并删除测试证书存储；事后运行、启动和
自动保存配置一致，域名健康正常，API、Web、Worker、PostgreSQL
healthy，未发现对应恢复目录、计时器或 staging 存储。上述匿名请求
未携带真实用户凭据；405 只验证该 RPC 路径的响应与现有入口一致，
不证明 RPC 操作成功。未验证真实登录、带凭据会话、WebSocket、全部
业务路径、正式证书、自动续期或手机与桌面连接；临时恢复计时器此次
未实际触发。

2026-11-12（生产 IP staging 健康路由）：先只读对照生产运行配置，
临时候选仅新增复用现有健康处理器的 IP `/health` 路由、IP TLS
选择、staging 签发和独立存储，同时关闭候选自动保存；既有路由和
证书引用保留。维护机以模拟文件证书和健康处理器验证完整执行流程
后，生产短时加载候选，独立公网观察进程使用官方 staging 根验证
证书链、IP 身份及 `/health` 的 `ok` 响应；生产机回环同样通过。
旧域名健康接口和证书指纹保持一致。

执行器主动恢复原运行配置并清理临时证书存储；事后运行配置与启动
Caddyfile 适配结果及自动保存 JSON 一致，旧域名健康正常，API、Web、
Worker 和 PostgreSQL healthy；未发现对应恢复目录、计时器或 staging
存储目录。真实生产测试期间未触发定时器；未启用或验证其他生产 IP
业务路由、认证、正式证书、自动续期、真实手机和桌面连接。

2026-11-12（生产 IP staging 公网信任链）：先在维护机验证加入
staging 根证书校验后的受保护签发流程；随后维护机从 Let’s Encrypt
官方 HTTPS 地址取得测试根证书，仅载入本次观察进程。在生产临时启用
staging IP 证书期间，维护机经独立公网连接生产 IP，以测试根验证
证书链和 IP 身份，成功退出。生产机以相同来源的测试根进行回环链和
IP 身份验证亦成功；未将测试根安装到系统信任库。

生产执行器报告临时候选加载前已安排恢复计时器，旧域名健康及证书
保持一致，恢复原配置并删除独立测试证书存储后退出 0。事后只读对照
运行配置与启动配置、自动保存 JSON 相等；域名健康接口正常，API、
Web、Worker、PostgreSQL healthy，未发现对应恢复目录、计时器或
staging 存储目录。此次未让定时器实际触发，也未启用生产 IP 业务
路由、测试真实设备、签发正式证书或验证自动续期。

2026-11-12（生产 IP staging 签发）：先在维护机以模拟旧文件证书验证
`run-caddy-staging-guarded.py` 的完整流程，再检查生产 API、Web、
Worker、PostgreSQL healthy，生产 Caddy 运行、容器 `/tmp` 和宿主
`/run` 为临时存储，旧域名健康接口正常。检查是时点结果，不排除并发
操作。

生产测试在宿主受限临时目录保存原配置和候选并预设独立恢复计时器；
使用当前 ETag 加载不自动保存的 staging 候选。真实 IP 测试证书成功
签发，使用 OpenSSL 检查 SAN 及 staging 签发者名称，确认容器独立
临时存储内证书与无 SNI 握手提供的证书指纹及签发者一致；签发前后
旧域名健康接口正常、证书指纹一致。恢复器主动执行原配置恢复，健康
接口再次正常，测试证书目录被删除，控制流程退出 0；此次未等待定时器
实际触发。事后只读对照运行配置与启动 Caddyfile 适配结果、自动保存
JSON 均相等；四个主要容器 healthy，未发现本次恢复目录、计时器或
staging 证书目录。

本次未建立测试 CA 信任链或通过公网客户端验证证书，未开放生产 IP
业务路由，未执行客户端切换、正式证书签发、续期或生产异常回滚。
此前维护机测试过 staging 信任链和独立定时恢复，但不能代替以上
生产验证；测试证书已清理，现有域名入口仍保留。

2026-11-12（重连续签版本与安装位线索）：唯一 USB 设备上的 Sydney 匹配
应用与本机续签记录匹配后，源 IPA 和设备上报的 `CFBundleVersion`、
`CFBundleShortVersionString` 均为字符串且分别相同。只读汇总设备报告的
96 个用户应用，均含 entitlement 字典，其中 1 个声明 `get-task-allow`；
未输出应用名称或标识。字段一致不证明二进制、签名、数据或安装来源相同；
该计数不证明账号归属、Apple 服务器端 App ID 限额或剩余安装位。没有执行
签名、安装、续签、控制或数据恢复。

2026-11-12（续签源包版本工具）：使用已有 Python 运行 3 项合成测试通过，
覆盖版本一致、不一致、缺失、唯一应用与设备记录、歧义清单和无效记录，
并检查汇总不包含合成标识；默认 `python` 命令不存在，改用已有运行时。
随后用 iPASide 设备库执行工具，返回 USB 设备数 0，未读取真实续签记录或
IPA，也未进行版本比较。Windows 计划任务按 iPASide、AltServer 和 SideStore
名称筛选无匹配；未检查其他命名或启动方式。先前记录关联脚本调用的
`refresh.records()` 内部会对数据目录执行 `mkdir(..., exist_ok=True)`；
目录本已存在，但它并非严格无写入尝试，新工具直接读取记录文件。
版本字段一致仍不能证明二进制、签名、数据或续签一致。

2026-11-12（staging 签发与定时恢复组合演练）：维护机模拟文件证书
及旧域名 HTTPS，使用候选生成器和独立恢复器；在加载候选前将合成原
配置及候选写入 `/run` 的受限目录，设置带 `AccuracySec=1s` 的
55 秒定时器，再用 ETag 条件写入候选。staging IP 证书真实签发并
核对 SAN、签发者名称及无 SNI 回环指纹；模拟旧入口响应和证书指纹
保持一致。定时恢复器随后恢复原运行配置，IP 测试证书不再提供，原
入口响应及指纹保持一致；演练退出 0。事后未发现对应容器、计时器
及状态目录，维护机 Caddy active、TCP 443 无监听。

首次从 Windows 使用 `cmd` 传递两段编码脚本时超过命令行长度限制，
远端演练未启动；改用 PowerShell 管道传输后成功。本次控制进程未在
签发中被终止，异常中断与并发配置拒绝来自单独合成演练；没有验证
生产 IP、生产证书、重启恢复、CA 信任链或生产回滚。

2026-11-12（独立定时恢复与并发保护）：维护机临时 Caddy 容器使用
合成回环 HTTP 路由及临时卷，状态文件位于 `/run` tmpfs 的受限目录。
预先安排 systemd 计时器后，由单独控制进程加载临时候选并强制终止
该进程；计时器随后独立启动恢复器，条件写入恢复原配置，合成 HTTP
路由返回原响应。另模拟候选加载后发生其他配置更新，恢复器拒绝覆盖，
新配置仍可访问；随后按当前 ETag 恢复合成原配置。演练进程退出 0。

首次演练未在预期时间恢复：计时器未设置精度，等待超时后测试清理了
状态目录，随后定时服务因找不到状态失败。设置 `AccuracySec=1s`、
延长等待并在清理状态前停止定时服务后复验通过。已清除本次失败单元
状态；事后未发现演练容器、定时器或状态目录，维护机 Caddy active，
TCP 443 无监听。本次不验证生产容器重启、宿主重启、真实证书、
真实 IP 签发或生产回滚；定时恢复器仍未集成到生产执行流程。

2026-11-12（staging 并发与自动保存准备）：维护机临时 Caddy 容器
使用回环管理及 HTTP 端口和临时存储；对配置使用当前 ETag 写入候选
成功，使用旧 ETag 试图恢复时返回 412 且候选仍生效，使用新 ETag
恢复原配置成功。随后加载 `admin.config.persist=false` 的临时候选，
自动保存文件内容摘要不变；恢复原配置后，自动保存内容摘要与最初
一致。该演练只验证合成配置和顺序竞争，不证明生产定时恢复、并发
部署协调、异常终止或跨重启恢复。

首次三次临时容器未能启动，最后一次日志显示启动 Caddy 时 `Operation
not permitted`；为容器增加其执行所需的 `NET_BIND_SERVICE` 能力后
演练退出 0。另在生产主机内存只读比较，当次运行 JSON 与 Caddy 自动
保存 JSON 语义相等，运行配置未显式设置 persist。比较不保存或输出
配置内容，不能保证后续仍相等。

候选生成器现设置临时配置不自动保存；对当次生产配置重新只读对照通过，
未加载生产候选。维护机使用修改后的同一生成器再次完成真实 staging
IP 签发、模拟旧文件证书响应及指纹核对、原运行配置恢复，退出 0。
事后分别按两个演练标签未发现容器，两个计时器名称未见残留，维护机
Caddy active、TCP 443 无监听。仍未验证生产 IP、生产回滚或真实
设备的信任链。

2026-11-12（生产形态候选与维护机复验）：只读读取当次生产 Caddy 运行
JSON，在生产主机内存中使用 `prepare-caddy-staging-candidate.py` 生成
候选，并由独立对照脚本移除预期新增项后比较原配置；结果相等。新增项
仅为 IP TLS 选择、staging ACME 签发和随机命名的临时文件存储，HTTP
路由及旧证书引用未改变。候选未输出到终端、加载、保存或执行 Caddy
配置校验；这不保证线上请求行为或恢复可行。

维护机重新演练，模拟旧入口改为文件证书及与当次生产相同的 TLS 策略
形态；使用上述同一生成器加载临时候选，真实 staging IP 证书签发后，
无 SNI 回环握手获取到的证书指纹与策略目录的 IP 证书一致，旧域名
HTTPS 响应及其证书指纹保持一致。恢复原运行 JSON 后，旧入口响应及
指纹一致，无 SNI 握手不再提供该 IP 测试证书。演练退出 0；事后未见
对应容器和计时器，维护机 Caddy active、TCP 443 无监听。测试证书的
签发者名称和 IP SAN 已检查，未单独验证 CA 信任链、异常清理、真实
生产证书、生产 IP、持久态恢复或生产回滚。

2026-11-12（staging 并存及运行态恢复）：维护机空闲 TCP 443 上运行
临时 Caddy 容器，以内部 CA 签发的合成域名 HTTPS 作为原入口并读取
运行配置快照；动态加载附加维护机 IP、staging ACME 短期证书及独立
临时存储的配置，真实签发后以 `openssl x509 -checkip` 检查 IP SAN，
签发者名称含 staging 标记。容器内回环请求命中 IP 测试响应，合成域名
HTTPS 在加载后及签发后均返回预设响应，证书指纹与加载前一致。

重新加载快照后，合成域名响应及指纹仍一致，IP Host 的回环请求不再
返回测试响应。命令退出 0；事后演练标签的容器和对应限时清理计时器
未见残留，维护机 Caddy active、TCP 443 无监听。该实验未验证 staging
信任链、持续不中断、持久态恢复或异常清理；测试旧证书由临时内部 CA
管理，不能等同生产的文件证书。IP 请求跳过了证书信任检查。

另以生产 Caddy 管理接口只读检查时，配置含一个监听 443 的 HTTP
server、一个路由及两条 TLS 策略；第一条按 SNI 选择证书标签，第二条
无匹配条件。TLS 配置包含文件证书且未显式配置自动化策略。本次未加载
生产配置、操作生产证书或执行生产回滚。

2026-11-12（手机输入区模型入口）：使用本机已有 Node 24.22.1 和依赖执行
输入区及模型选择两份定向测试，127 项通过；覆盖保留草稿、保存选中模型、
恢复空间默认、保存失败及进入模型连接设置。7 个相关文件的 Biome 检查通过。
移动端 TypeScript 检查仍报 `computer.ts:45` 和 `endpoint.ts:39` 的可空
访问错误，均位于本次未修改文件；因此不能称整个移动端类型检查通过。
首次 pnpm 启动因无法从注册表核验 pnpm 版本而失败；系统默认 Node 22.14.0
运行测试时依赖启动失败，改用已有 Node 24 后通过。未构建、安装或执行真实
iPhone 验证，也未验证模型服务的实际调用及导航外观。

2026-11-12（staging IP 策略专用存储）：维护机在确认 TCP 443 空闲后，
以生产同摘要 Caddy 镜像运行 host 网络临时容器，关闭 HTTP-01、启用
staging ACME 短期证书及策略级 `/tmp/ip-stage` 文件存储，并设置限时
清理定时器。证书在超时前出现在策略目录，`openssl x509 -checkip`
确认 SAN 包含维护机公网 IP，签发者名称含 staging 标记；默认 `/data`
证书目录未发现叶证书。命令退出 0，事后按演练标签和计时器名称未见
对应资源，维护机 Caddy active 且 TCP 443 无监听。

此轮未独立验证 CA 信任链或公网业务响应，也未测试失败时的自动清理、
续期、重启或生产 IP；签发者名称检查本身不构成证书链验证。临时存储
随容器删除，生产 Caddy 配置、卷和客户端地址未修改。

2026-11-12（IP 策略存储和运行态恢复合成演练）：维护机使用生产同摘要
Caddy 镜像，在无网络、只读根文件系统和 `/data`、`/config`、`/tmp`
临时存储的容器内，先加载模拟原 HTTP 路由并保存运行 JSON；随后加载
新增模拟 IP HTTPS 路由，使用 Caddy 内部 CA 及独立文件存储签发证书。
容器内 HTTPS 得到预设响应，策略目录出现 `.crt` 文件，默认 `/data`
的证书目录未发现叶证书；模拟原 HTTP 路由始终返回预设内容。重新加载
保存的 JSON 后，原 HTTP 路由仍可访问，模拟 IP 监听不可访问。

首次通过 PowerShell 管道传输时，断言均通过但尾部换行转换触发额外
命令错误，整体退出码为 1；检查未见带演练标签的容器，维护机 Caddy
active 且 443 无监听。使用原始文件流重跑后退出码 0；事后再次未见
同标签容器，维护机 Caddy active 且 443 无监听。重跑后脚本增加了
HUP、INT、TERM 退出处理，该小改动未重跑。上述结果只覆盖模拟内部 CA、
单次运行态及临时存储，未验证真实 ACME 签发、叶证书身份的独立解析、
宿主重启、生产证书、持久态配置或生产回滚。

2026-11-12（IP staging 策略存储预检）：先只读核查两台现有 SSH 连接：
一台运行生产 Compose 容器，另一台运行既有 Caddy，443 当时空闲且
systemd 为 running。生产主机 systemd 为 degraded，失败项为截图相关
临时单元；未排查或修改该单元。生产 Compose 容器中 API、Web、Worker、
PostgreSQL 显示 healthy，检查不等同业务探测。

维护机使用生产同摘要 Caddy 镜像，在无网络、只读根文件系统且临时目录
为 tmpfs 的自动删除容器内，以合成 IP 验证 TLS 自动化策略的 `storage`
字段：`file_system` 模块与 `/tmp/ip-stage` 配置通过 `caddy validate`；
将模块改为不存在的名称后，验证明确报告无法加载该 TLS 存储模块并以
非零状态退出。另在无网络临时容器中成功适配 IP 示例配置。未启动该
TLS 策略、签发证书、写入生产卷或加载生产配置，无法据此证明测试证书
实际写入指定目录、其他策略不受影响、回滚或真实公网挑战。

2026-11-12（生产域名代理候选对照）：通过运行中的 Caddy 管理接口读取
配置，并使用其现有域名、证书引用和生产 IP 在容器内仅执行 `caddy adapt`；
没有加载候选或发起证书申请。初始候选中，现有域名的 6 条内部路由有
5 条与运行配置完全相同，另 1 条因响应头与压缩处理顺序和分组不同而
不完全相同；这不是已证明的外部行为故障。调整候选顺序后，6 条内部路由
及域名证书引用与该时点运行配置完全相同。域名 logger 相同；由于新增 IP
logger，整体日志映射及默认排除列表不同，既有 logger 其他设置相同且
原排除项仍包含在内。外层新增 SNI 检查和其他配置仍与线上不同，结构相同
不证明全部请求、权限或恢复行为一致。

维护机使用 Caddy 同摘要镜像，在无网络临时容器对修改后的候选运行
`test-ip-proxy-routes.sh`：合成域名与 IP 的健康、API、RPC、Web
路由、交叉 Host 拒绝及合成敏感日志字段脱敏通过；未知 Host 返回空 200
且未进入上游。临时容器按标签未见残留，验证脚本目录已清理。该演练
替换了证书和上游，不验证真实 ACME、生产网络、登录或 WebSocket。
一次诊断输出曾包含域名及 IP 形式的日志映射键；工具已调整为仅输出数量。

2026-11-12（IP staging 代理路由）：只读检查时生产 Caddy v2.11.4
运行，管理接口可达，运行 JSON 与当前只读挂载的 Caddyfile 适配结果一致；
当时 HTTP 配置含一个 443 服务器。比较不代表持久卷已备份或未来配置
不会变化。维护机以本地候选配置为基础，仅为演练关闭管理接口及自动
跳转、改用 TLS-ALPN-01 并将上游改到回环；合成旧域名使用临时自签名
证书，IP 使用 Let’s Encrypt staging 证书。Caddy 配置验证通过，两个
合成上游仅监听维护机回环端口，测试容器使用 host 网络及临时存储。

从 Let’s Encrypt 官方站点经 HTTPS 获取 staging 根证书，仅传入本次
测试进程，没有写入系统信任库。本机从公网使用该根证书验证测试 IP 的
证书链和 IP SAN，错误 IP 验证被拒；`/health`、`/api/`、`/rpc/` 分别
命中合成 API，上层网页路径命中合成 Web，均返回 200。用仅供本次测试
信任的自签名证书访问合成域名成功；IP 与模拟域名两种 SNI/Host 交叉
组合均返回 421。演练容器、回环上游、定时器及临时证书目录清理完成，
维护机原有 Caddy 仍 active。该结果仅覆盖维护机 IP、所述候选配置变换
和合成 HTTP 上游；未验证生产 IP 签发、自动续期、真实账号、WebSocket、
移动端或桌面端。

2026-11-12（维护机 IP staging 容器重启）：维护机 443 空闲且 `/run`
为 tmpfs；使用受限临时目录作为独立 Caddy 容器的 `/data`，配置、
镜像及 staging CA 与上次测试一致，签发测试 IP 证书后执行 `docker restart`。
重启前后无 SNI TLS 握手取得的证书 SHA-256 指纹均为
`C4:72:FA:3C:2A:0B:00:68:95:6E:5D:BD:F7:00:DC:08:B0:75:11:7A:EF:B8:C0:7C:77:99:88:CE:F9:6A:9F:DF`，
IP SAN 匹配；重启后从公网跳过 staging CA 信任校验访问得到预设内容和
HTTP 200。核对容器标签后移除容器，停止其超时清理定时器并删除临时目录；
维护机 443 无监听、原 Caddy 仍 active。`/run` 不保证宿主机重启后保留，
该测试只证明本次容器重启后可复用证书，不证明自动续期、持久磁盘、
生产 IP、正式 CA 信任或双端业务。

2026-11-12（维护机独立 IP staging）：维护机 80 端口已有 Caddy 使用，
443 起初空闲；临时 443 HTTP 探针从公网返回 404，证明当次端口可达，
探针停止后端口释放。临时配置以生产同摘要 Caddy v2.11.4 镜像执行
`caddy validate` 成功。首次文件传输的 base64 命令因输入换行报告错误，
但目标与本地 SHA-256 一致；首次启动使用 Docker 默认 bridge，因 docker0
设备不可用失败，容器未启动。复核端口后使用 host 网络、只读根、临时
存储、限制能力及内存的独立容器，禁用 HTTP-01，向 Let’s Encrypt
staging 申请短期 IP 证书；日志显示 TLS-ALPN-01 授权有效及签发成功。
证书 SAN 包含维护机公网 IP，有效期为 2026-11-12 07:17:31 UTC 至
2026-11-18 23:17:30 UTC，签发方明确为 staging。

首次无 SNI 握手失败，加入 `default_sni` 后重建临时容器并再次通过
staging 验证、签发和 IP SAN 核对；无 SNI OpenSSL 握手成功，本机通过
公网 IP HTTPS 取得 200 和预设响应。客户端使用跳过证书信任校验的选项，
因为 staging CA 不受系统默认信任；未证明正式 CA 信任。临时账户和
证书只在容器 tmpfs，容器停止后不保留，因此没有验证证书持久化、
到期续期、重启续期或告警。容器身份核对后停止并自动删除，清理定时器
停止，临时配置目录删除，维护机 443 不再监听且原有 Caddy 仍 active。

本次测试使用维护机 IP，不是生产 IP。对生产 IP 的外部只读检查显示
HTTP 挑战路径返回 308 并重定向至该 IP 的 HTTPS；本机 HTTPS 握手失败。
没有更改生产配置或客户端地址；不能据此认为生产 IP 已能签发、自动续期
或可切换，也没有验证双端认证、业务及生产回滚。

2026-11-12（核心备份收窄验收）：两机数据库密文 SHA-256 均为
`d29c427fdd4f2ff1afe1b0426914787067ea5696c3ad26a7c369eb2524a4026a`，
应用数据密文均为
`1a8bedaa0657ea97a3cb89221514d88bd6a8512a068e2bd16f1d3726bbdd37bb`。
维护机文件时间分别为北京时间 15:09:01 和 15:09:16；不同采集时间不能
构成一致快照。维护机核心配置密文 SHA-256 为
`7b9fcfd4c7808014cf816bea33dee227249f56ec962eda286af08d118a74a0e4`，
恢复身份文件为 root 0600；备份接收区的 ext4 loop 后备文件与记录一致。
一次只读 SSH 查询意外返回配置及身份路径不存在，后续在维护机复查路径、
摘要和权限均存在且与既有记录相符；该次异常原因未确定，不当作备份丢失
或已排除故障的证据。

中断前启动的维护机隔离演练日志显示 age 和数据库导入退出 0，恢复 14 个
应用数据文件，以备份配置解封一条空间密钥并检查 25 个加密消息块；隔离
应用读取 4 个 Bot、1 个群聊、51 条消息及 3 个附件，未认证请求返回 401。
合成的非成员会话验证有效后，针对目标空间的 6 次请求均返回拒绝状态；
这只是所选账号、空间及接口的抽样。日志记录隔离数据库和应用容器清理完成，
后续按标签未发现容器；已核对并删除本次受限脚本及缓存目录。临时库使用
占位数据库角色及合成会话，不验证真实账号登录、全部权限或完整附件；没有
执行生产恢复及回滚。生产检查时 API、Worker、Web、PostgreSQL healthy，
其他四个容器运行。

2026-11-12（设备重连与续签记录关联）：用户报告设备服务已重启，现有探针
连接到 iOS 27.0.1，查询个性化开发者镜像为未挂载。另以禁用自动配对的 USB
查询在内存比较：1 个名称或标识匹配 Sydney/Rakazo 的用户应用，其安装标识
与 1 条 iPASide 续签记录相等，记录设备标识与当前 USB 设备匹配；该记录按
其到期字段判断未过期。仅输出汇总；未校验实际代码签名、记录真实性、源 IPA
与安装包的内容一致性、可用安装位、数据恢复及真实续签。未读取手机个人内容、
签名、安装或执行控制。

2026-11-12（重新连接与服务诊断）：Windows 当前设备列表显示一个 Apple
iPhone 及 Apple USB 设备状态 OK；Apple Mobile Device Service 运行且其
进程监听本机 27015 端口，但两次 usbmux 只读探针均报告设备数 0。尝试
重启设备服务时因无法打开服务而失败，未确认具体权限或策略原因；服务重启
未执行。未自动配对、签名、安装或读取设备个人数据。

2026-11-12（原生代理缓存在线副本及恢复）：生产暂存区核对为受限 ext4
loop 挂载，维护机接收区和后备文件、两端收件人摘要及维护机身份派生公钥
一致；生产以既有配置工具采集正在运行的代理缓存，工具报告完成。命令末尾
的摘要操作因本机输入换行带入回车失败，随后独立只读核对密文成功，未重采。
密文 41160 字节，生产与维护机 SHA-256 均为
`69639c30359ecfbe5effd232f88d4fe33d23597db19f35cdd5a16cb753350799`。
传输脚本在两端私有挂载命名空间核对挂载和后备文件，目标使用独占创建；
维护机用既有身份解密，在 tmpfs 创建临时文件并重新读取，与事后生产缓存
时点内容及归档的数字 UID/GID/模式一致。临时文件创建为 0600，并未应用
归档中的属主或模式；事后未发现同名前缀临时目录。采集工具前后检查与
事后比对不能排除短暂并发写入或证明缓存内部事务一致；未验证缓存格式、
代理读取、业务和路由恢复。tmpfs、进程内存及 swap 不保证安全擦除。

2026-11-12（连接诊断复查）：只读探针再次返回 usbmux 设备数 0；Windows
Apple Mobile Device Service 显示运行，按 Apple iPhone 和 Apple Mobile Device
USB 名称筛选的当前即插即用设备数为 0。该名称筛选不覆盖所有驱动命名，不能
判断具体是线缆、手机、端口还是驱动问题；未重启服务、配对或修改设备。

2026-11-12（续签源文件校验范围复查）：本机只读探针再次返回 usbmux 设备数
0。静态检查安装版 iPASide 的 `refresh_record`、`run_sideload` 入口及成功
后的记录写入：刷新检查记录路径存在并传给侧载，侧载读取 IPA 元数据，所查
记录字段与入口未显示源文件摘要的保存或比较。这不覆盖所有依赖或运行分支，
不能证明完整流程无校验；未运行刷新、签名或安装。

2026-11-12（恢复维护窗口定时任务只读复核）：生产 Docker active；8 个
容器运行，API、Worker、Web、PostgreSQL 显示 healthy；`sydney-driver.service`、
`sydney-driver.socket`、`sydney-mihomo.service`、cron 和 `certbot.timer`
均 active。系统定时器列表包含证书续期、软件更新、日志轮转及清理等任务。
检查时 `certbot.service`、`apt-daily.service`、`apt-daily-upgrade.service`
均 inactive，其最近一次启动记录显示分别调用 `certbot -q renew
--no-random-sleep-on-renew`、`apt.systemd.daily update` 和
`apt.systemd.daily install`，三次记录的退出状态均为 0。定时器下一次
触发时刻可变；退出 0 不证明证书实际续期或相关 hook 完成预期工作，也不
证明软件没有变更。首次检查误用了 `sydney-native-driver` 单元名并返回
inactive，随后依据运维记录用 `sydney-driver` 实际单元名复核，前者不能
用于判断驱动状态。本次没有执行续期、更新、停写、恢复或生产回滚；未
检查外部调度及全部 hook，不能据此证明已识别所有写入者或服务业务正常。

2026-11-12（设备重查及续签源码复核）：现有 iPASide Python 的只读探针以
禁用自动配对方式查询，usbmux 返回设备数 0，未触发设备服务查询。静态检查
安装版 `refresh_record` 显示其取记录中源 IPA，并以记录的安装标识调用
`run_sideload`；后者仅在未提供该参数时生成团队范围标识。此前记录的“选项
没有显式标识覆盖”不能说明刷新时没有指定标识。没有运行刷新，也未证明记录
和设备安装一致、源包未被替换或续签后数据保留。

2026-11-12（续签记录及源包只读核查）：本机发现 1 条 Sydney 匹配的 iPASide
续签记录，其引用 IPA 存在，但 SHA-256 不同于此前记载的构建产物。只读检查
发现包内有一个顶层 App，其元数据匹配 Sydney/Rakazo，未内嵌描述文件；源应用
标识与记录的安装标识不同，记录没有显式标识覆盖，且启用移除扩展。最近一次
usbmux 查询返回设备数 0；没有验证设备实际安装来源、代码签名、续签、恢复或
可用安装位，也未签名、安装、删除应用或修改签名缓存。

2026-11-12（认证依赖及网络策略只读复核）：当前隔离 Python 进程的 iPASide
`provider_name()` 返回 remote，安装的 Anisette 包版本为 1.2.4；这不保证 GUI
启动时使用同一环境。源码显示远程取头向服务发送身份相关的
`identifier`、`adi_pb`，可能启动额外初始化及状态写入；这两项不应表述成
已经证实的手机配对文件。现有候选 requests 白名单不允许该远程服务，因此
无法假定真实开发者请求可用。本地模式源码显示可能启动辅助进程、下载组件、
保存状态以及加载失败时删除状态；源码还称本地登录可能被 Apple 拒绝，
并非本次实测。本轮未调用任一 anisette 流程、读取认证会话或上传身份数据。
对开发者服务根地址的匿名 HTTPS HEAD 返回 200，不证明登录或 API 可用。
当前进程 requests 环境只有 no-proxy 元数据键；修复候选策略将其误认作
有效代理的问题，17 项合成测试通过。公共 certifi 根库 118 份证书中没有
与签名器两份自签发 CA 字节指纹一致的证书；不证明该 CA 不可信或 Apple
官方信任状态。

2026-11-12（本机公开证书签名关系）：固定摘要的本机 zsign 包含 10 份 PEM
公开证书；本机一份按名称或标识筛选的候选描述文件包含 1 份公开证书，
其签名可由签名器内置颁发证书验证，该颁发证书又可由内置自签发 CA 验证，
三者在检查时均处于有效期内。旧 RSA SHA-1 根自签名被高层接口标为不支持，
只对自签发根使用 RSA PKCS#1 v1.5 低层校验回退；4 项合成测试覆盖正确链、
缺失根、同名错误公钥、过期及旧根回退篡改。首次执行因签名器大小超过错误
的 4 MiB 限制而未完成，修正为受限读取后重跑成功。尝试从 Apple 官方公开
证书路径获取两份证书均收到 HTTP 403，本机常见 Windows 证书库 Apple 名称
计数为零；故内置根未独立核验，不能作为已建立的 Apple 信任锚。未检查完整
PKIX 路径约束、用途、撤销、描述文件 CMS 或应用签名，未读取私钥、账户或
设备，也未执行真实签名或安装；输出只含汇总。

2026-11-12（Windows 合成开发签名对照）：固定公开 runner 和本机 zsign、
OpenSSL 的摘要；在临时目录生成合成 RSA 密钥、自签发 CA、开发证书及
合成描述文件，对预先对齐 XCTest 标识的 runner 签名。第一次仅用自签名
叶证书时 zsign 因无可用颁发者链退出非零；将合成 CA 加入合成 P12 后退出
码为 0。主应用和 XCTest 均保留且标识匹配合成目标；两者 CMS 分别经
OpenSSL `-noverify` 验证、签名者与合成叶证书一致，篡改各自 CodeDirectory
均被拒绝；现有解析器报告两者已检查代码页、Info.plist 和资源目录槽匹配。
工具 2 项测试通过，覆盖合成身份关系及拒绝非固定公开输入。临时文件含
合成私钥，由临时目录清理；没有做安全擦除或独立子进程网络监控。未使用
Apple 账号、真实证书或手机；未验证 CMS 可信链、全部资源和嵌套代码、
真实描述文件、设备安装、启动或续签。

2026-11-12（公开 runner CMS 结构及合成签名验证）：固定摘要公开 runner 的
XCTest 可执行文件含 CMS 类型槽，但槽内负载长度为 0；因此该组件的 CMS
验证和篡改对照均标记为未执行，不将空槽被拒绝当作签名防篡改证据。使用
内存生成的合成自签名证书对合成内容生成 detached CMS，本机 OpenSSL
3.0.16 `cms -verify -binary -noverify` 对原内容返回成功、篡改内容返回失败；
解析器及固定输入守卫 4 项测试通过。检查固定公开 IPA 及本机 OpenSSL 的
摘要，临时文件仅含公开或合成数据并由临时目录清理；子进程未做独立网络
监控。`-noverify` 不验证证书链，合成对照不证明 Apple 信任、真实开发签名、
资源封印或 iOS 安装；没有使用真实私钥或连接设备。

2026-11-12（候选网络发送层合成验证）：17 项策略测试通过；安装版实际
`developer._request` 构造请求并经候选发送层，底层 HTTP 由合成响应替身
提供，未连接 Apple。直接调用 requests 发送撤销请求被拒绝；另覆盖其他
主机、团队或参数、关闭 TLS 校验及代理的拒绝。仅允许固定 Apple 开发者
地址及候选策略允许的请求，其他 requests 流量一律拒绝；是否兼容真实
anisette、会话和本机网络未知。未覆盖原生库、底层 socket、替换后的 HTTP
适配器、子进程或其他进程，未做系统防火墙隔离、实际签名或设备安装。

2026-11-12（候选安装保护合成验证）：14 项策略测试通过，覆盖未准备资产、
设备不符、包验证返回失败或异常、安装替身异常后的再次调用被拒绝；在实际
iPASide 侧载入口中通过合成签名输出、合成包验证器和安装替身验证成功路径。
调用安装替身前验证目标设备、文件和回调结果，并在调用前消耗单次机会；
原合成缓存保持。未调用真实安装、验证器或手机，文件检查与安装之间仍有
替换竞态，所用回调不验证真实 CMS、签名链、描述文件、设备重连或目标应用。
进程内拦截可被其他进程或直接底层调用绕过，不能作为真实安装保护。

2026-11-12（签名目标绑定和侧载接线合成验证）：13 项定向测试通过；
受控资产准备拒绝不匹配的合成应用标识、设备标识、应用组及额外位置参数，
拒绝发生在附加开发者请求前。实际 iPASide `_cmd_sideload` 在进程内候选
上下文中调用实际资产准备；开发者服务、签名、安装、记录和设备值均为
替身，模拟完成后原合成缓存保持、签名参数未移除扩展。命令的合成输出
被捕获；源码显示真实 JSON 结果包含设备和团队标识，不能直接输出到日志。
未测试真实签名、手机安装、目标设备安装绑定、Apple 状态或其他进程绕过。

2026-11-12（候选进程内签名接线）：12 项合成测试通过，包含受保护应用
标识大小写冲突、嵌套/重叠或非空隔离目录拒绝、受控上下文中证书复用、
拒绝撤销及异常退出恢复原函数。将候选上下文接到安装版实际
`ensure_signing_assets`，通过内存开发者服务替身完成资产准备，合成原目录
不变，合成新身份及描述文件进入独立目录；模拟服务端无匹配证书时在设备
操作和文件写入之前拒绝。无真实账户、证书、设备或网络请求。目录检查存在
并发及路径替换竞态；尚未验证 Windows ACL、临时私钥文件保密和清理、
其他线程/进程或原生网络绕过。该上下文没有实际侧载入口，不能用于真实签名。

2026-11-12（签名策略组件合成验证）：8 项测试通过，覆盖缺少受保护标识、
目标冲突、跨团队、非目标 App ID、未知接口、撤销、CSR、删除、设备注册、
未发现目标即下载描述文件，以及私钥不匹配、证书过期、服务端缺证书或出现
重复等拒绝场景。显式替换安装版 iPASide 的 `developer._request` 时，实际
撤销、CSR 和删除函数被策略拒绝；底层请求为内存替身，没有连接 Apple。
策略允许为指定目标创建 App ID 并在确认目标 ID 后请求描述文件；这些请求
会有服务端副作用，本次没有真实执行。策略没有验证 CMS 或证书链，不能防止
绕过该函数的网络请求、子进程或其他程序，也没有实现真实受控侧载入口。

2026-11-12（侧载入口合成隔离接线）：以安装版 1.2.14 的实际侧载命令入口
执行两组纯合成对照，重定向签名目录并将开发者请求替换为只允许合成证书列表
的替身。合成缓存匹配时，流程抵达签名、安装和记录替身，原合成目录三份
文件不变，新合成签名资产写入隔离目录；失配时撤销请求被替身拒绝，签名、
安装、记录和新签名资产写入均未发生，原合成文件保持。扩展后的离线实验与
4 项既有工具测试通过；签名、安装、设备注册、证书请求及账户均为替身，
没有操作真实缓存、Apple 或手机。网络与子进程仅在 Python 进程内阻断，
没有系统级隔离；正常 GUI、真实证书和账户、进程竞争、异常恢复均未验证。

2026-11-12（iPASide 签名缓存覆盖及隔离合成对照）：安装版 1.2.14 的实际
`ensure_signing_assets` 配合合成证书、设备注册、App ID、描述文件及签名
替身执行，原有合成 `profile.mobileprovision`、`identity.p12` 和 `bundle.json`
均被新内容替换；重定向其 `paths.signing_dir` 到独立合成目录再次执行，
原目录三个文件保持原样，新内容写入独立目录。离线实验整体和 4 项既有
工具测试通过；未读取或覆盖真实缓存，临时合成目录由测试清理。Python
socket 与子进程进程内替身阻断，未进行系统级网络隔离。仅证明所测函数
的文件写入行为，不证明 GUI、全部侧载路径、并发、密钥隔离、系统崩溃
或真实 Sydney 续签及恢复安全。

2026-11-12（设备与本机描述文件只读对照）：手机重新连通，禁用自动配对，
查询用户应用和设备描述文件并仅在内存比较。筛得 1 个 Sydney/Rakazo 应用、
2 份与其应用标识精确匹配的设备描述文件，以及本机 iPASide 签名目录的
1 份对应描述文件；最初一对原始文件摘要及 UUID 一致，随后改为逐字节比较并
重新执行，结果同样有一对原始文件及 UUID 一致；两个设备候选都与该本机
候选存在证书交集。设备报告的签名者名称与本机候选证书主体通用名一致。
脚本只输出计数和布尔值，未输出或保存应用标识、设备标识、证书或配对资料；
本次未读取私钥。4 项合成测试覆盖相同、不同、缺少身份和签名者名称匹配。
这是描述文件及字符串比较，没有验证 CMS、应用代码签名、Apple 吊销状态、
当前生效的描述文件或数据恢复；未签名、安装或修改手机。

2026-11-12（本机 iPASide 身份关联只读检查）：先使用合成自签名材料执行
3 项测试，覆盖匹配、密钥不符、证书不在描述文件、坏缓存和无关描述文件。
随后用安装版 Python 隔离模式只读检查本机 iPASide 签名目录；名称或标识
匹配的 1 份候选与同目录证书缓存比较，证书位于描述文件列表、私钥公钥与
证书公钥一致，证书有效期和描述文件到期时间均覆盖检查时刻，错误数为 0。
真实缓存私钥仅在本地进程内存解析；未输出或另存身份、密钥、账号、描述文件
内容及设备标识，脚本未主动发起网络或手机请求，未做独立网络监控。描述文件的 XML 内容未验证 CMS，未核查
Apple 吊销状态、可信链、实际安装身份、目标 runner 描述文件或备份恢复；
不能作为真实侧载及续签验收。

2026-11-12（设备重查与本地描述文件筛选）：usbmux 再次返回设备数 0。
只读解析本机 iPASide 签名目录下的描述文件，以名称或应用标识是否包含
Sydney/Rakazo 筛选，发现 1 份且截至运行时到期时间尚未到；解析失败 0。
仅输出汇总数量，不输出标识、设备列表或描述文件内容；未读取证书私钥、
会话、Apple 账户或设备。描述文件解析未验证 CMS 签名、设备当前使用情况、
证书私钥匹配、在线吊销状态或真实恢复能力，也不覆盖其他本机目录。

2026-11-12（当前连接与本机备份目录只读复核）：现有只读探针报告 usbmux
设备数为 0，未发起自动配对；Windows Apple Mobile Device Service 查询为
Running。分别检查当前用户两个常见 MobileSync Backup 根目录，其中一个
存在且其直接子目录计数为 0，另一个不存在。未读取备份内容、设备标识或账号；
自定义备份路径、其他用户、iCloud 备份及恢复能力均未检查，不能推断没有任何
可用备份。设备连接、Sydney 数据恢复和侧载仍待验证。

2026-11-12（签名身份离线诊断）：安装版 iPASide Python 的 cryptography
50.0.2 生成合成自签名证书、私钥和内存描述文件字段，6 项 unittest 通过。
覆盖匹配、无效身份、密钥不匹配、描述文件不含证书、到期边界、团队及设备
不符、调试权限、限定通配符与无效字段；合成自签名也能得到空错误集合，
因此结果仅是字段一致性检查，不证明 CMS 真实性、Apple 证书链、吊销状态、
签名器接受、描述文件系统支持或设备安装。未读取真实账号、私钥、设备或
描述文件，未接入实际签名与安装，未验证真实证书保护。

2026-11-12（iPASide 缓存匹配续验）：通过已安装 1.2.14 Python 隔离模式运行
扩展后的离线实验，合成缓存与证书列表匹配时，实际侧载入口完成证书复用并
调用设备注册替身；替身主动拒绝后，App ID、输出目录、签名和密钥生成替身均
未调用，开发者请求替身只收到证书列表请求。原缓存缺失分支及六种证书状态、
三个拒绝请求仍通过；实验工具 4 项单元测试通过。Python 网络和子进程在进程内
阻断，未进行系统级隔离；没有实际设备注册或签名。源码表明后续可能注册设备、
创建 App ID，应用组配置还可能修改能力及组分配；尚未验证真实账户端的副作用、
其他进程及可恢复性。
另用相同序列号而证书、密钥均为空的合成缓存，实际 `_ensure_certificate`
直接返回空字节，未验证身份有效性。该对照仅证明本函数行为，并不证明后续
签名器会接受无效身份，也不说明用户实际缓存是否有效。

2026-11-12（iPASide 安装链静态复核）：只读检查本机 1.2.14 的
`sideload.py`、`apps.py`、`lockdown.py` 及内置设备库相关源码。侧载经 AFC
上传随机名称临时 IPA，再发送 Installation Proxy 的 Install 命令；安装监听
结束后尝试删除该临时文件，上传阶段异常时不保证进入该清理分支。接口明确支持
安装或升级，同标识存在覆盖风险。安装后代码可能按签名配置执行附加操作，且对
特定应用投递配对文件，并默认记录本机刷新信息。连接未显式关闭设备库默认的
自动配对。检查的安装调用链未见卸载调用，独立卸载接口存在；未穷尽依赖、系统
行为及竞态，因此不能证明无其他副作用。未执行安装、签名、配对或 Apple 请求。

2026-11-12（开发者 cryptex 只读查询）：已连接设备上通过进程内 USB 用户态
RSD 隧道调用 `copy_installed`，只汇总开发者 DDI 标识是否存在，返回 false；
程序退出码 0、隧道上下文正常结束。关闭自动配对与远程配对回退，未输出设备
标识、其他 cryptex 条目或配对文件；未安装、卸载或验证开发者服务。该结果是
查询时点的列表结果，不排除其他方式的镜像或后续状态变化。

2026-11-12（重连后只读镜像查询）：usbmux 返回 1 台；使用现有设备库、禁用
自动配对连接，报告 iOS 27.0.1，`is_image_mounted("Personalized")` 返回
false。没有输出设备标识、配对文件或镜像签名，也未修改镜像；该结果不覆盖
cryptex 和其他方式，不能作为设备兼容或未挂载任何镜像的证据。

2026-11-12（镜像状态查询准备）：授权后只读按设备友好名匹配 `Apple iPhone`
或 `Apple Mobile Device USB`，结果零项；服务状态为运行。该筛选不等同 usbmux
查询，不能证明手机必然断线。本机设备库源码显示镜像列表与 lookup 接口，及
iOS 27 自动挂载的 RSD/cryptex 路径；没有调用任何镜像查询或挂载，因此当前
镜像状态及设备兼容性仍未知。
随后以现有设备库只读查询 usbmux，设备数为 0；未输出设备标识或触发配对。

2026-11-12（iCTRL 签名要求静态核对）：公开 runner IPA 的 SHA-256 再次与固定值
`67450de1524837b137b1ba0175ed16c8850b951ef0127c7c765aa8f3c4702652` 一致，文件列表没有
`embedded.mobileprovision`。固定提交上游签名脚本检查描述文件的团队、到期、
标识覆盖和 `get-task-allow`，匹配证书后对齐 `.xctest` 标识，按嵌套顺序签名
并调用严格验证。该检查未执行上游 Mac 脚本，未验证用户设备的签名身份、
真实描述文件、Windows 免费签名或 iOS 安装。

2026-11-12（iPASide 实际侧载入口合成验证）：使用安装版 1.2.14 Python 的
隔离模式运行离线实验，六种合成缓存与证书状态均符合预期；直接撤销、提交 CSR、
未知开发者请求被替身拒绝。实际 `_cmd_sideload` 和 `run_sideload` 在合成账户、
设备、IPA 和缓存下到达证书准备，拒绝撤销后设备注册、App ID 注册、签名输出
目录和签名替身均未调用。定向工具测试 4 项通过。Python socket 与子进程调用被
进程内替换阻断，未执行系统级网络抓包或隔离；未读取真实缓存、会话或设备，未向
Apple 发起请求，也未签名或安装。先前扩展脚本后的两次命令被中断，随后上述实验
及测试实际运行通过；测试不能证明独立 GUI、刷新进程和其他版本受保护。
Windows 计划任务按名称和路径筛选 `ipaside` 未返回匹配；首次沙箱查询被拒绝，
授权后只读查询成功，不能证明没有其他名称的计划任务或应用内刷新。

2026-11-12（工作区大容量合成恢复终态）：维护机瞬时单元日志记录测试 1 项通过、正常结束，456609793 字节合成单文件经真实 age、1.5 GiB dm-crypt/ext4 暂存恢复，非 root 数字身份及重归档摘要对照通过；密文 456733752 字节，重归档完成时采样可用空间 160378880 字节，恢复器返回后可用 1073623040 字节，耗时约 48 秒。服务查询时单元已卸载，以日志而非 not-found 默认状态为依据。测试后同前缀夹具目录、loop 和映射为 0；临时代码经文件清单和摘要核对后删除，维护机 systemd running。此为单文件合成对照，不代表真实工作区目录、跨源一致性、故障或磁盘并发；采样并非完整峰值曲线，余量不保证。测试表明恢复器在重归档时同时保留原明文归档与恢复文件，后续修订以降低临时空间占用；生产采集硬阻断不变。

2026-11-12（工作区大容量合成恢复启动）：维护机启动 `sydney-workspace-large-20261112.service`，计划用 456609793 字节合成文件、真实 age 和 1.5 GiB 临时加密存储验证数字属主恢复及重归档；单元设置私有挂载、12 分钟时限和 1 GiB 内存限制，尚无终态或恢复证据。

2026-11-12（工作区加密恢复身份及生产只读守卫）：维护机私有挂载命名空间的 64 MiB 合成 dm-crypt/ext4 暂存中，使用真实 age 和仅含合成数据的归档，将 UID/GID 65534 的目录、普通文件及符号链接以 root 恢复；恢复后数字身份、文件内容、链接目标与重归档聚合摘要通过，原有错误密文拒绝和合成 root 对照仍通过，定向测试 1 项通过。事后同前缀临时目录、loop 和映射均为 0。另在生产 root 私有 `/run` 临时目录中加载当前来源守卫，在私有挂载命名空间只读核验 driver 的 systemd MainPID、启动时间、用户和控制组，固定源目录、pidfd、宿主/进程根视图与嵌套挂载，以及独立 ext4 暂存的后备身份、选项和至少 896 MiB 可用空间；结果 `production_readonly_guard=passed`，临时代码目录清理、driver active、API healthy。未遍历或读取项目内容，也未运行归档或加密采集；结果只反映查询时点，不保证采集时状态、权限映射、跨源一致、工具信任或崩溃恢复，生产工作区入口硬阻断不变。

2026-11-12（工作区加密暂存合成恢复）：维护机私有挂载命名空间以匿名内存随机密钥建立 64 MiB dm-crypt/ext4 合成暂存；真实 age 加密的合成工作区包含普通文件和指向外部的符号链接。候选先将密文解密到加密文件系统上的匿名临时文件，age 成功后受限提取，再以匿名文件重归档并对照条目、字节数及聚合摘要；合成文件和链接目标匹配。篡改密文被 age 拒绝，另一个目标目录保持空；关闭映射后原始后备文件未检出合成明文标记，再用同一内存密钥重新映射读取成功。重归档输出加入写入时上限后复跑，定向测试 1 项通过；事后同前缀测试目录、代码目录、loop 和 dm 映射均为 0。候选依赖调用方证明存储确为可信加密挂载及提供容量，未测试真实工作区、非 root 生产 UID、大容量、磁盘耗尽、断电、SIGKILL 或异常部分目标；内存、swap 和安全擦除不保证，链接后续使用须隔离。原生产采集硬阻断不变。

2026-11-12（工作区控制器发布前强杀）：维护机创建自建 systemd 合成来源服务，完整控制器使用固定进程/目录、双遍归档及真实 age 生成候选密文；在最终发布回调的合成屏障处确认候选存在且正式文件不存在，以 pidfd 跟踪并强杀控制器主进程。停妥采集单元后正式文件仍不存在，原候选密文仍存在且设备/inode 与强杀前相同；测试按已记录身份清理该合成候选。此项和既有底层加密流强杀对照共 2 项通过；事后同前缀临时目录、测试单元均为 0，维护机 systemd running。仅覆盖单个发布前窗口；强杀发生在链接、unlink 或 fsync 期间的结果未知，不能据此证明任意中断都没有正式文件或生产残留可自动清理；未采集真实工作区，生产硬阻断不变。

2026-11-12（工作区候选清理修复）：复查维护机 systemd 为 degraded，发现此前合成强杀测试自己的瞬时单元处于 failed、MainPID=0、无控制组；核对其标识及终态后仅重置该单元失败状态，维护机恢复 running。修订测试在停止自身随机命名单元后清除失败状态。另发现控制器在候选密文元数据检查失败时尚未记录 inode，可能遗留文件；修订为先记录候选身份，再检查权限等元数据并在失败时仅删除匹配 inode 的候选。维护机真实 age 合成控制器 6 项、systemd/限额暂存监督器 5 项、底层强杀 1 项通过；新增权限异常对照确认没有正式文件及候选残留，复查 systemd running、失败单元列表为空、临时代码目录计数 0。未验证 stat 前故障、文件被替换时的清理、完整控制器强杀、磁盘错误或真实工作区；生产采集硬阻断不变。

2026-11-12（工作区 systemd 与限额暂存合成接线）：维护机私有挂载命名空间使用自建 systemd 瞬时来源服务、128 MiB ext4 环回暂存及真实 age；控制器 5 项与监督器 5 项通过。覆盖稳定来源加密恢复、发布前来源服务停止、错误后备文件、初始未挂载及发布前懒卸载时拒绝；守卫检查 systemd MainPID、启动时间、用户、控制组、挂载、后备文件和容量。事后合成目录、环回设备及运行单元时点计数均为 0。另在独立 systemd 合成加密流单元确认两个子进程位于同一控制组，强杀主进程后通过 pidfd 观察所跟踪子进程退出且正式密文不存在；定向 1 项通过，临时目录及运行单元事后计数为 0。首次强杀测试因缺少 Python `sys` 导入在启动单元前失败，修正后通过。测试未覆盖生产工作区、完整控制器强杀、系统或 daemon 崩溃、PID/cgroup 和挂载恶意竞态、磁盘耗尽及异常残留清理；生产采集硬阻断不变。

2026-11-12（iCTRL 资源绑定与清单）：10 项定向测试通过，含合成 CodeResources
篡改，以及文件摘要匹配、不匹配、缺失、可选缺失和嵌套代码分类。公开 runner
的 ad-hoc 三组对照中，存在的主应用及测试包资源槽均匹配各自 CodeResources；
保留扩展及预对齐两组各核对主应用 26 项和测试包 5 项普通文件，移除组核对主
应用 18 项，均无已检查条目缺失或摘要不符。未评估未列出的文件、规则覆盖、
嵌套代码签名、CMS 证书链、Apple 描述文件或设备运行；不等同完整签名验证。

2026-11-12（iCTRL CodeDirectory 合成与公开包核验）：8 项定向测试通过，覆盖
合成代码和 Info.plist 篡改、未知摘要算法不标为通过等；固定公开 runner 的三组
ad-hoc 对照中，保留扩展和预对齐两组的主应用及测试包代码页摘要、Info.plist
摘要和各自 CodeDirectory 标识均匹配，移除组的剩余主应用亦匹配。检查仅覆盖
脚本识别的 Mach-O 与摘要算法，不验证 CMS 证书链、资源封印、开发描述文件、
Apple 签名或 iOS 运行。未使用用户凭据或接触手机。

2026-11-12（工作区来源守卫与发布合成接线）：新增内部控制器，固定合成进程及目录描述符，执行双遍归档与真实 age 加密到随机候选密文，复核来源进程与路径后才以不覆盖方式发布。维护机私有挂载命名空间中，来源守卫 6 项和控制器 4 项测试通过；稳定来源的密文可解密并校验，模拟最终发布前进程退出、来源路径替换均拒绝且候选目录清空，已有目标不被覆盖。仅覆盖自建合成进程和数据，不验证生产 systemd 身份取得、限额文件系统、特权并发、强杀、异常时清理失败或来源检查与发布之间的竞态；生产工作区入口仍硬阻断，未采集真实项目。

2026-11-12（工作区来源身份守卫）：生产只读核对 driver active，观察到其工作区环境变量与规范路径完全一致，全部 UID 字段与工作区属主一致，进程控制组、宿主/进程根视图的目录设备号及 inode 一致，pidfd 当时未报告退出；未读取项目内容。新增内部来源守卫，在固定描述符和 pidfd 上复核进程身份、环境、控制组、目录来源及嵌套挂载。维护机私有挂载命名空间合成测试 6 项通过，覆盖有效源、错误 UID/控制组/环境、路径替换为链接、进程退出、mountinfo 转义及真实嵌套 bind mount 拒绝。该守卫尚未自行绑定 systemd MainPID、检查来源变化后的输出发布或覆盖恶意特权进程、控制组迁移竞态；生产只读观察非持续保证，没有调用候选采集真实数据。

2026-11-12（iCTRL ad-hoc 三组对照）：公开 runner IPA 的 SHA-256 与固定值
`67450de1…` 一致，本机签名器 SHA-256 为 `fd861f8f…`；签名器三次均返回 0。
保留扩展但改主标识时，测试包保留、两个标识不一致；移除扩展时测试包消失；临时
副本预对齐测试包标识后，测试包保留且两个标识一致。两组保留测试包的 Mach-O
签名数据段均相对原包变化。对照使用 ad-hoc 签名和合成标识，未进行密码学验证、
未引入用户证书或描述文件，也未安装、启动或测试续签；未单独监控签名器网络。
工具的 6 项合成测试覆盖拒绝非固定 IPA、结构解析、标识对齐及签名结构边界。
先前因策略拒绝而未执行的尝试，与本轮经审批后的实际结果分别保留。

2026-11-12（工作区双遍归档合成对照）：新增固定根描述符双遍归档候选，第一遍同时写入输出并计算摘要，第二遍仅计算摘要；比较两遍内容、归档元数据及条目/字节统计。维护机 3 项组件测试覆盖稳定来源、两遍之间同大小文件内容变化（恢复原 mtime）和新增文件，均符合预期。另有 3 项真实 age 合成流测试通过：稳定双遍归档解密验证成功；在第一遍结束后修改合成文件时生产者失败，加密流未发布正式密文且可见临时密文已清理；既有固定描述符及失败对照通过。临时目录由测试清理。该方法不能排除检查前后变化、两遍间修改后恢复原状、跨源数据不一致、特权并发或强杀残留，未读取真实工作区；组件直接执行拒绝，生产采集入口硬阻断不变。

2026-11-12（工作区加密流容量合成对照）：维护机现有合成加密流增加独立工作区策略，使用 65 MiB 合成字节、真实 age 及 70 MiB 密文上限成功加密并解密到空设备；原 globals 接口仍拒绝超过 64 MiB 的配置，工作区接口拒绝超过 768 MiB 的配置。维护机定向加密流测试 6 项和现有工作区加密合成测试 2 项通过，临时目录清理。该测试未覆盖实际工作区、大数据文件变动、限额挂载耗尽、强杀残留、可信来源或真实异机恢复；组件直接执行仍拒绝，生产工作区入口硬阻断不变。

2026-11-12（工作区异机接收区）：维护机在 root 0700 父目录排他创建并预分配 1610612736 字节后备文件，格式化并挂载独立 ext4，核对 loop 后备路径、挂载目标、`nodev,nosuid,noexec`、后备文件 root 0600 及挂载根 root 0700；当时可用 1530249216 字节。未设置自动挂载，未接收工作区密文或写入真实项目；使用时需重新核验挂载、容量及文件身份。

2026-11-12（工作区恢复加密暂存合成对照）：维护机确认 `/dev/shm` 可用约 868 MiB、内存可用约 1.1 GiB 且 swap 存在；工作区约 456 MB 的归档和恢复树同时驻留 tmpfs 可能超限。仅用合成数据，在私有挂载命名空间内创建 64 MiB 独占预分配后备文件，以匿名 memfd 中的随机密钥建立 AES-XTS dm-crypt plain 映射、格式化 ext4 并挂载；写入合成标记、卸载并关闭映射后，在原始后备文件未检出该标记，使用同一内存密钥重新映射后读取一致。定向测试 1 项通过；按设备和后备文件身份核对后卸载、关闭映射、释放 loop 并删除合成文件，事后同前缀目录、映射及 loop 均为 0。原始文件中未找到标记不是完整密码学审计；未验证断电、SIGKILL、密钥丢失或清理失败、大容量资源占用、swap、安全擦除、真实数据和生产工作区。生产采集入口继续硬阻断。

2026-11-12（iCTRL 标识兼容预查）：公开 runner IPA 在内存计算摘要匹配固定值，
解析主 `.app` 和内部 `.xctest` 的 Info.plist，观察两者原始标识相同。本机
iPASide 源码默认为目标包生成团队后缀并传给 zsign；zsign 参考源码
`9299685…` 标识重写选择 `.app`、`.appex`，不选择 `.xctest`，另有测试包
签名遍历。该推断未对本机 zsign 实际输出或系统安装执行验证，不能断言真实重签
一定失败或测试组件没有签名。没有写入或操作手机数据。

2026-11-12（Docker exec 生命周期合成对照）：维护机以生产相同 PG18 镜像创建无网络、只读根、限时自清理的合成容器，容器内通过 `/usr/bin/timeout -k 1 8` 启动合成 sleep；确认命令存在后强杀宿主 docker exec 客户端，复查合成命令仍存在，随后在容器内超时时限后消失。定向测试 1 项通过，随机标签容器及临时代码目录事后计数均为 0；生产数据库容器只读检查存在 `/usr/bin/timeout`，未执行生产导出。首次传送测试时 base64 含换行导致未运行；第二次因 `docker top` 未请求 PID 列失败，清理代码又把短容器 ID 与完整 ID 直接比较而拒绝清理，合成容器随后按预设 40 秒寿命自动删除。修正 top 列及通过 inspect 核对完整 ID 后重跑通过。该对照只覆盖所测 Docker 和合成进程，不证明真实 pg_dumpall、Docker daemon/宿主崩溃、进程组逃逸、不可中断 I/O 或完整 globals 采集清理；生产入口仍禁用。

2026-11-12（证书拒绝撤销合成续验）：实际 `_ensure_certificate` 函数配全替身
测试三种场景：缓存与服务端序列号匹配时复用且不请求撤销；缓存缺失、缓存序列号
不匹配时撤销替身各调用一次并抛异常，密钥生成与提交替身均零调用。没有实际
读取用户缓存、调用 Apple、签名或安装；测试限定同一进程的已知函数分支，不证明
独立 GUI、并发、其他网络接口或未来版本受到保护。

2026-11-12（iPASide 撤销分支合成验证）：使用本机 iPASide Python 加载实际
`provision._ensure_certificate`；缓存对象、证书列表、撤销、CSR 和提交均为替身。
模拟缓存缺失且证书机器名为 `iPASide` 时撤销替身被调用 1 次，其他机器名为 0；
提交替身抛出合成异常终止，未调用 Apple、读写真实证书缓存或修改设备。只验证
两个分支，不证明当前 Sydney 使用何种证书，也不验证其他代码路径或竞态。

2026-11-12（PG18 合成 globals 真实认证）：维护机以固定 PG18 镜像建立源和目标两个无外网 Docker 临时容器，仅使用自建合成角色和密码。源 roles 经 `pg_dumpall --globals-only`、真实 age 加解密及目标导入，源与目标选定角色登录属性、SCRAM 哈希和成员关系在内存对照一致。分别将两个临时实例的回环连接配置为 SCRAM，检查 HBA 规则无解析错误并重载后，正确合成密码均成功登录、错误合成密码均返回密码认证失败；定向测试 1 项通过。退出时按随机标签核对并删除临时容器，事后同标签容器与临时代码目录计数均为 0；生产 PostgreSQL、API 和 Web 当时健康。本次只证明合成账号和有限角色关系，不证明真实生产角色、账号登录、所有授权、故障监督或与数据库快照一致；生产 globals 采集入口仍硬阻断。

2026-11-12（iPhone 接入只读预查）：固定版本 iCTRL README 描述用户确认配对、
受认证 JSON-RPC 和默认同机/USB 可达；源码搜索确认 Sydney 手机配置声明安全
存储依赖及允许本地联网，服务器已有电脑控制租约。未建立连接、验证密钥保护、
确认 iOS 网络权限或执行手机控制；不把电脑租约当作手机授权已实现。

2026-11-12（iCTRL 离线签名尝试）：拟用公开 runner、临时目录及不含用户证书的
ad-hoc 签名对照扩展移除开关。Python 下载出现 `RemoteDisconnected`，未签名；
随后的两条临时演练命令均被执行环境策略拒绝，命令未启动；没有测试结果或设备
副作用。仅有此前静态源码核对，不能说明真实签名、安装、执行或续签成功。

2026-11-12（Web 历史资源真实异机隔离恢复）：维护机在独立 systemd 瞬时单元中，以现有恢复身份解密 13 个重组密文文件，验证加密清单与 12 个批次成员、长度、数字身份、模式、归档时间及文件 SHA-256，再逐批重新解密复核并在 `/dev/shm` 私有临时目录恢复。恢复器重新遍历实际目标，将 1321 个文件、总计 184376589 字节及目录和文件数字 UID/GID、模式、纳秒修改时间、文件大小和 SHA-256 对照清单一致。运行器检查其网络和挂载命名空间不同于 PID 1，单元设置 15 分钟时限、控制组回收及 1 GiB 内存限制；日志记录 `webassets_restore_verified groups=12 files=1321 bytes=184376589` 及 `Deactivated successfully`。复查无 `sydney-webassets-restored-*` 临时目录，生产 API、Web、worker 和 PostgreSQL 健康、Caddy 运行。该瞬时单元在查询前已被 systemd 卸载，`LoadState=not-found` 的默认状态和退出码不作为结果证据，以上以任务日志为依据。明文经内存及 tmpfs，不能保证不进入 swap 或安全擦除；未重建 Web 服务、检查所有历史页面，在线源树前后摘要不构成原子跨源一致点，也不证明完整系统恢复或生产回滚。

2026-11-12（Web 资源密文异机重组）：续传在重验已接收的 38 块后完成剩余 12 块，记录 `verified_before=38 transferred=12 total=50`。随后重新核对固定源密文清单和目标全部分块，以独占临时文件在维护机重组 13 个密文文件，逐块及每个完整文件大小与 SHA-256 均匹配源清单，完成后不覆盖发布；工具返回 `assembled_files=13`。源清单摘要固定于采集成功后的时点，该结果只证明密文副本一致，尚未解密或恢复真实资源。

2026-11-12（Web 资源第三次续传中断）：中转过程中已报告 38/50 块，随后维护机 SSH 远程操作返回 255、进程退出；复连核对两端预期挂载及生产 Web 健康，维护机有 38 个正式块、0 个部分块，已重新启动续传并将重新核验全部现有块。SSH 255 的具体原因未知，完整密文与恢复尚未验证。

2026-11-12（免费签名静态复核）：用户确认接受七天签名和后续续签。iPASide
v1.2.14 源码显示移除扩展默认开启、界面可关闭并传 `--no-remove-extensions`；
zsign 公开参考源码 `9299685…` 在 `-E` 时删除 PlugIns 和 Extensions 文件夹，
runner 的 `.xctest` 在 PlugIns 下。已安装二进制没有验证与该源码提交一致；
本次无合成签名、真实账号签名、安装、启动或续签测试，不能认定关闭选项后可用。

2026-11-12（Sydney 安装与签名线索）：用户确认应用可打开；内存筛选到一个
Sydney/Rakazo 名称或标识匹配的用户应用，标识不同于已知两项，签名字段含开发者
类别。匹配该标识的两份描述文件均为七天开发描述文件，到期日均为 2026-11-17，
不证明当前运行应用实际绑定哪一份；只输出汇总，不保存账号、标识或描述文件。
对设备用户应用与未过期七天开发描述文件按标识精确关联，得到 1 个去重匹配，
无同筛选条件通配符；此数不是 Apple 账户或设备剩余安装位的权威查询。固定 runner
IPA 摘要再次匹配，内含一个 `.xctest`；iPASide 默认启用扩展移除标志，是否移除
该测试包及重签是否成功未测试。iCTRL 固定版与本机 pymobiledevice3 代码均有
cryptex 路径，不能据此认定 iOS 27.0.1 实机兼容。

2026-11-12（iPhone 连接恢复）：用户确认已信任后，以现有 iPASide 内置设备库
禁用自动配对重试，usbmux 返回 1 台 USB 设备；读取系统版本为 27.0.1、
开发者模式为开启。Installation Proxy 只按 `xin.zxlup.sydney` 和
`com.rakazo.app` 查询应用标识，返回结果为空；仅能说明所查询标识未返回记录，
不能排除不同标识、查询限制或其他安装方式。未枚举其他应用、读取用户内容、输出
设备标识、安装或重签；未测试 iCTRL、签名到期、安装位及 iOS 27 兼容性。

2026-11-12（Web 资源第二次续传中断）：中转器新输出确认生产 SSH 远程操作返回 255，不能仅凭该值判断是网络、认证还是其他 SSH 错误；进程已退出。随后两端管理连接成功、预期暂存挂载存在，生产 Web healthy；维护机有 14 个正式分块、0 个 `.partial-*` 分块。已重新启动续传并继续校验固定源摘要，尚未验证完整副本。

2026-11-12（Web 资源续传复核）：修订后重新计算并匹配固定源密文清单，核对维护机原有 5 块摘要，再成功接收 3 块，终态 `verified_before=5 transferred=3 total=50`。随后的续传进程已启动；8 块仅为时点进度，完整重组、解密和恢复尚未完成。

2026-11-12（iPhone 连接层）：Windows 即插即用列表显示 Apple iPhone 和 Apple
移动设备 USB 条目正常，Apple Mobile Device Service 运行，127.0.0.1:27015
处于监听；通过现有 iPASide 内置 pymobiledevice3 `11.47.0` 查询 usbmux，返回
设备数 0。禁用自动配对的系统版本读取返回 `NoDeviceConnectedError`，没有读到
iOS 版本或开发者模式；该现象不能单独确定是锁屏、信任或驱动问题。未重启服务、
建立新配对、读取配对文件、安装应用或验证 iCTRL。

2026-11-12（Web 资源续传中断）：第二次中转进程非零退出，未输出具体原因；核查目标分块目录有 5 个正式块、未见临时块，两端预期 ext4 挂载仍在。生产采集瞬时单元此时 `LoadState=not-found`，虽然 `systemctl show` 默认仍返回 inactive、Result success、状态 0，这些默认值不再证明实际运行结果；此前该单元仍被加载时已观察到完整日志和正常退出。原中转器只检查三个状态字段而未检查 LoadState，不能声称每次调用都核验了有效服务终态；现改为将此后计算的 13 个源密文及分块清单规范化 SHA-256 固定为 `ff9fd8dea119239b4afead69629f73b35767cb417ba4f2912a28e576429cfc07`，每次续传重新对照，并保留来源日志证据。此摘要固定的是采集后的当前密文，不证明异机副本或恢复；失败原因待复现。

2026-11-12（Web 资源异机接收准备）：维护机在 root 0700 父目录排他创建并预分配 805306368 字节 ext4 后备文件，新挂载根为 root 0700，后备文件 root 0600，挂载选项含 `nodev,nosuid,noexec`，当时可用 758177792 字节；未配置自动挂载。固定两端的分块中转工具核对源采集单元成功、两端挂载和后备文件，首次接收并校验 3/50 块，其余尚未完成；分块需重组并对照完整密文，之后仍需解密和恢复。

2026-11-12（iCTRL 共存及发布包前置）：Windows 即插即用设备按 Apple/iPhone
名称和类别的匹配数为 0，仅说明本次匹配未发现设备；注册表显示 iTunes 12.13.12.3、
iCloud 7.21.0.23、AltServer 1.8.04、iPASide 1.2.14。PATH 未发现所查设备工具；
不证明其他路径不存在。读取已有 Sydney 未签名 IPA 的容器元数据，未发现嵌入式
描述文件或所查应用扩展，无法推断手机实际安装。两个 iCTRL v1.98.16 资产在内存
中下载并计算 SHA-256，分别与项目发布元数据匹配；未保存、安装或运行，亦未验证
源码与二进制一致性。首次尝试用临时文件下载被执行策略拒绝，改为无文件内存核验。
iPASide 签名源码未证明 runner 的 `.xctest` 可用；pymobiledevice3 的 Windows
挂载是项目自述。没有验证安装位、签名、配对、截图、点击、断线、重启或续签。

2026-11-12（Web 资源真实采集终态）：生产 `sydney-webassets-capture-20261112.service` 最终 inactive/dead、Result success、ExecMainStatus 0，日志报告 12 批、1321 文件、184376589 字节；守卫在采集前后核对固定 Web 容器与卷，采集组件比对两次源树身份及内容摘要。密文和加密清单目前仅在生产专用限额暂存；在线采集不构成原子快照，尚未核对异机密文、解密与恢复，不能据此执行回滚。

2026-11-12（Web 资源真实采集启动）：生产和维护机分别计算既有收件人文件及维护机恢复身份派生公钥的 SHA-256，结果一致；生产固定容器、卷、暂存挂载、容量、加密工具和受信代码的只读预检通过。生产启动 `sydney-webassets-capture-20261112.service`，设置 15 分钟时限、控制组回收、私有挂载、只读系统及内存上限；首次查询为 active/running，尚未取得退出终态或恢复证据，不能计为备份成功。

2026-11-12（Web 资源独立暂存准备）：生产确认后备父目录 root:root 0700、根文件系统可用大于 3 GiB，使用排他创建和 `posix_fallocate` 预分配 805306368 字节文件，建立 ext4 并挂载到新目录。核对 loop 后备文件、目标、ext4、`nodev,nosuid,noexec`、后备文件 root 0600、挂载根 root 0700；当时可用 758177792 字节。未更改 fstab 或自动挂载，未读取 Web 文件或写入密文；空余空间和挂载状态后续必须重新核对。

2026-11-12（iPhone 本机操控公开资料核查）：通过 GitHub 公开 API 只读确认
iCTRL `v1.98.16` 为直接指向 `c1e42688…` 的 tag，发布资产元数据含两个 IPA 和
SHA-256；未下载 IPA，因此未验证内容或可复现构建。固定版本源码树中 iCTRL 和
iphone-use-app 分别有 Apache-2.0 与 AGPL-3.0 许可证，TouchSynthesis 未发现
许可证文件；各依赖和素材许可未穷尽。Apple 官方页面列出免费开发的 App ID、
设备、安装数量与七天描述文件限制。iphone-use-app 所查 v0.1/v0.2 tag 均不等于
所选提交；TouchSynthesis 所查 releases 为空。侧载文档的两个猜测路径返回 404，
本次采用固定版本项目 README 而非将其作为证据。没有连接 iPhone、收集配对信息、
安装签名、运行应用、控制屏幕或验证实际兼容性；项目自述不等于独立真机测试。
补充：idevice `v0.1.68` 的附注 tag 指向 `d32c8189…`；核心 crate 清单声明 MIT，
但固定树未发现独立 LICENSE 文件，FFI 和传递依赖尚未完成许可核对。

2026-11-12（Web 分批校验与隔离恢复候选）：维护机 root 使用真实 age 和自建文件执行 5 项测试通过。两批密文解密后与加密清单逐文件核对成员、长度、数字 UID/GID、模式、秒级归档时间和 SHA-256；分别拒绝缺失批次、用另一有效批次替换和篡改密文。恢复器先校验全部批次，再逐批解密并复核后写入自建空私有目录；合成目录和文件的内容、模式、UID/GID 和纳秒修改时间与来源对照一致，另用 UID/GID 65534 合成文件验证 root 恢复数字身份。篡改密文在预校验阶段被拒，目标保持空；源变化与符号链接拒绝对照仍通过。测试目录由临时目录管理器清理。测试仅覆盖可信自建归档与本机，未验证真实资源、异机副本、独立挂载、账户映射、进程崩溃、磁盘故障、同权限并发或所有恶意归档；写入开始后的失败可能留下部分目标，明文存在内存且可能进入 swap。候选直接执行拒绝，不能当作生产恢复命令。

2026-11-12（Web 资源分批加密候选）：维护机 root 对私有合成目录执行 3 项测试，真实 age 生成两批密文和加密清单，解密后逐个对照 3 个文件的 SHA-256；采集后修改源文件时不发布正式清单，源内符号链接在采集前被拒绝。密钥、源和输出为自建合成数据，测试夹具及代码临时目录由临时目录管理器清理。候选对源树采集前后计算摘要及身份，但不保证在线原子快照或排除采集中修改后恢复原状；未证明密文完整性与清单绑定、目录元数据恢复、进程强杀、磁盘耗尽、工具信任、生产卷和挂载身份、异机传输或真实恢复。批次文件可能在失败或强杀后残留，清单缺失时不得视为完整；清单发布后仍须解密验证各批。组件入口直接运行拒绝，未采集真实资源。

2026-11-12（跨 UID 合成提取）：维护机 `/dev/shm` 临时目录中，root 与 `nobody` 分别运行提取器 8 项测试，各通过 7 项、跳过 1 项仅适用于另一身份的测试。root 显式指定合成 UID/GID 65534，将自建归档中的目录、文件及外部符号链接恢复到 root 拥有的空 0700 目标，校验数字属主、文件内容、链接目标及重新归档摘要；默认模式拒绝不同 UID，非 root 拒绝特权模式。首次启动因 PowerShell 与远端引号组合错误未运行测试；随后两次 root 测试摘要断言失败，修正合成 tar 的时间戳表示及符号链接模式后，root 和非 root 两套结果如上。临时测试目录由临时目录管理器清理。该对照信任归档及本机 root，未验证真实生产 UID/GID、用户组、额外 ACL/xattr、恶意并发、特权位、故障清理或真实工作区和 Web 资源；保留绝对链接，不能在非隔离环境跟随。生产采集与恢复入口未开放。

2026-11-12（Web 资源与备份调度只读复核）：生产 Web 容器 healthy，Compose 项目及服务标签、local 卷名称、Docker 挂载来源和容器内外根目录设备号及 inode 一致。资源根为 UID/GID 1000、模式 0750；非原子遍历观察到 2 个子目录、1321 个普通文件、共 184376589 字节，未观察到链接、特殊文件、其他属主、跨设备条目、多链接普通文件、组或其他用户可写条目及扩展属性；未读取文件内容，不能排除并发变化或同设备嵌套挂载。生产 `rakazo-backup.timer` 和 `rakazo-backup.service` 均为 not-found；在 `/etc/crontab`、`/etc/cron.d` 和 cron 用户配置目录共检查 8 个非链接文件，未发现产品名称。该检查不覆盖其他定时机制、脚本别名、外部主机和云平台，不能断言没有其他备份。生产根盘时点可用约 32 GiB、维护机约 15 GiB；可用空间会变动，不代表已预留配额。首次尝试查看定时器时本机 PowerShell 引号解析失败，远端命令未执行；修正后完成上述检查。没有创建备份、修改调度或停止服务。

2026-11-12（生产恢复能力与活动只读续查）：核对生产 PostgreSQL 容器运行状态及 Compose 项目、服务标签后，以默认只读事务、5 秒语句时限查询：`wal_level=replica`、`archive_mode=off`，归档命令与归档库未配置，归档成功及失败计数均为 0；这只反映当前 PostgreSQL 配置和统计，不排除其他宿主、云平台或数据库外的备份机制，也不证明可按时间点恢复。另只读统计状态为 queued 或 running 的 Run 为 0、未过期电脑执行租约为 0；两条查询非持久屏障，不覆盖其他状态、外部进程、用户编辑或后续新任务。生产 API、Web、worker 和 PostgreSQL 当时健康，Caddy 运行，driver service/socket 均 active；driver socket 可触发 service，三个应用容器重启策略均为 unless-stopped。systemd 失败瞬时单元为屏幕截图命令，退出状态 1；未读取用户屏幕或诊断其根因。没有停止服务、修改入口、采集新备份或执行回滚。

2026-11-12（语义分流实验接线）：6 个定向文件 22 项通过，覆盖开关和候选条件、分类调用与错误回退、
真实 Pi 循环配模拟模型的首轮工具裁剪，以及普通回复结束后和异常工具请求后的追加
消息恢复；另一个既有 Pi 选择题测试文件单独运行 2 项通过。
两个 Pi 模拟文件联合运行时模块替身相互污染，分别运行正常；不视作联合通过。
初次集成测试曾因分类请求递归耗尽 Node 堆，修正后相关用例通过。Adapter 和 Testkit
类型检查及 14 个相关文件 Biome 检查通过；未调用真实模型、执行完整工具动作、
验证真实数据库追加消息竞态及超时后
模型消费结算及真实设备。评测观察器已接入 Pi 首轮工具选择结果；统计按工具定义
序列化估算，不等于供应商实际网络报文大小或 token 数，分类日志仅供实验对照。

2026-11-12（工作区受限提取合成对照）：新增仅供合成调用的描述符提取组件，要求当前用户拥有空的 0700 目标，先校验完整归档，再逐目录以 `O_NOFOLLOW` 和挂载 ID 检查定位，提取普通文件、目录及符号链接，最后重新校验源归档；不会在提取时跟随符号链接。维护机五项测试通过，覆盖数据和元数据往返、外部链接、越界路径、重复路径、硬链接和非空目标拒绝，以及预校验后源归档变化为链接父目录时拒绝越界。后者的失败目标保留已创建的链接，外部目录未被写入，说明调用方须处理部分目标。另以真实 age、固定根描述符归档及解密后使用新提取器恢复，重新归档的聚合摘要匹配；合成加密恢复 2 项及加密流 5 项通过。测试只使用可信宿主、小型合成数据和 tmpfs；相同权限进程并发修改、源归档修改后恢复原状、恶意挂载变化、强杀、磁盘故障、生产 UID/GID 映射、绝对链接被后续程序跟随及真实工作区未验证。绝对链接被保留，后续读取必须继续隔离；失败或崩溃不会自动清空目标。

2026-11-12（Caddy sticky 根合成对照）：维护机 root 自建 root:root 1777 临时目录及 root 所有文件，默认采集策略拒绝该根；仅内部显式测试参数允许该固定根，仍拒绝可由其他用户写入的子项。通过 fork 降为 `nobody`，验证其无法删除 root 所有文件，但能在根下注入自有条目；后续目录复核正确拒绝该变化。3 项 root 合成测试通过。原合成组件以非 root 运行 20 项中 19 项通过、1 项因 age 不在该用户 PATH 而跳过；首次非 root 测试因测试只接受“条目过多”错误，而文件系统先检测到目录元数据变化，导致 1 项断言失败；修改断言为接受任一 `ValueError` 拒绝后重跑通过。root 运行原套件另有 17 项通过、3 项因 root 环境跳过。作业临时目录已删除，维护机 Docker 卷时点数为零，生产 API、Web 和数据库健康、Caddy 运行。仅验证一种合成注入及 sticky 行为，未证明恶意并发期间的一致快照、挂载及来源身份、真实卷读写、加密恢复或生产故障清理；生产入口仍不开放。

2026-11-12（工作区描述符加密流合成接线）：维护机仅在私有 tmpfs 创建合成目录，先打开根目录描述符，再将原目录重命名并在原路径创建不同内容的替代目录；通过 `pass_fds` 将已打开描述符交给归档子进程，经真实 age 流式加密并不覆盖发布。解密后的归档检查得到预期 3 个条目和 26 字节，内容来自原目录且外部符号链接目标未被跟随。再向固定目录加入 FIFO，归档子进程失败，正式文件和可见临时密文均不存在。加密流 5 项、描述符归档 8 项、合成加密恢复 2 项通过；增加原路径替换对照后重跑加密流 5 项和恢复 2 项通过。作业目录已清理，维护机 Docker 卷与恢复审计容器时点数均为零，生产 API、Web、数据库健康且 Caddy 运行。测试使用可信宿主、同一用户和小型合成数据，密钥及明文经内存与 tmpfs，swap 和安全擦除不保证；未验证真实工作区、限额文件系统、接收机、恶意并发、强杀后的残留及跨源一致性。

2026-11-12（生产工作区只读兼容性复核）：核对固定工作区根为目录且属于预期本机用户，以不跟随符号链接的目录描述符遍历并检查对象类型、属主、设备、普通文件链接数和扩展属性；时点观察 1206 个目录（含根）、4766 个普通文件、6 个符号链接，其余文件类型、非预期属主、多链接普通文件、跨设备条目及带扩展属性的条目均为 0。读取当前 mountinfo 未观察到工作区下嵌套挂载；未读取或输出路径、文件内容、账号或链接目标。该遍历非原子，不能排除竞态或后续变化；不证明描述符归档完整安全、不构成备份或跨源一致性点。

2026-11-12（跨版本隔离群聊写入）：维护机恢复同一数据库快照至无网络 PG18 临时容器，按当前版、旧版、当前版顺序分别启动三个隔离 API 容器，均使用固定镜像 ID、临时合成会话与重新提取的 appdata。首个当前版使用该恢复工作区的两个 Bot 创建随机合成群聊，并确认可列出；旧版读取该群聊及两个成员后创建另一随机群聊并确认可列出；最后当前版读取两个合成群聊并核对各自两个成员。每个 API 容器读取既有消息和 3 个抽样附件的对照，以及隔离数据库暂停/恢复的就绪对照均通过。四项提取和镜像约束测试通过；最终两类临时容器、appdata/脚本目录及 Docker 卷时点数均为 0，已有备份清单三项通过；生产 API、Web 和数据库健康、Caddy 运行。合成群聊仅写入临时恢复库并随其销毁，未输出标识或内容；三次应用数据目录分别从备份重新提取，此实验只证明数据库内所选群聊数据的有限跨版本行为，不覆盖实际登录、其他业务写入、文件变化、云电脑、真实生产回滚或跨源一致性。

2026-11-12（语义工具分流候选）：本机定向 Vitest 4 文件 15 项通过，覆盖判断结果、
错误与超时回退、取消、上下文大小、模拟模型请求无工具和用量回调、合成样例漏判
计数及既有工具选择评测结构。8 个相关文件 Biome 检查通过。测试使用替身模型，
未调用真实模型、比较端到端延迟或实测 iPhone；未验证模型输出准确率、超时后供应商
计费、运行中追加指令、执行器接线与开关。生产和客户端地址未修改。

2026-11-12（旧版隔离恢复应用读取）：维护机以重组并核对 ID 的旧版镜像，重建无外网 PG18 恢复库并加载已有数据库快照及 14 个 appdata 文件；age 与 pg_restore 均退出 0，选定 ACL/RLS 摘要、1 条空间密钥及 25 个密文消息块对照通过。旧版 API `/health`、`/ready` 均为 200；在临时恢复库插入的短期合成会话可识别，未认证 RPC 为 401，目标工作区可读取 4 个 Bot、1 个群聊、51 条线程消息及 3 个与数据库长度和 SHA-256 一致的附件。暂停隔离数据库时就绪为 503，恢复后为 200。四项提取及镜像约束测试通过；两类临时容器、临时 appdata 目录和 Docker 卷的时点数均为 0，数据库和 appdata 备份清单三项仍通过，生产 API、Web、数据库健康且 Caddy 运行。两端临时作业目录核验后删除；首次清理因未预期 Python 缓存目录而拒绝，核对后明确删除该缓存及预期文件，再成功清理。会话直接写入临时库，不是真实密码登录；只覆盖一组成员与有限读取，未验证写入、实际云电脑、完整恢复点、真实回滚或客户端联调。

2026-11-12（旧镜像差量异机重组）：维护机独立 systemd 单元在私有挂载命名空间检查接收 ext4、后备文件、密文大小与 SHA-256，并确认当前基底镜像存在、旧镜像尚不存在；使用现有恢复身份将差量解密到受限 tmpfs 文件，以当前镜像 Docker 导出重组并逐个按内容地址校验 blob。age 解密、Docker 导出与加载退出 0；加载后的旧版完整镜像 ID `sha256:59ddeb7193b9fa63531dafb759752124c9cd391f603210668d84cde1d09692d2` 与生产旧镜像一致，基底 ID 不变，单元最终 inactive/dead、Result success、ExecMainStatus 0，明文 tar 按脚本清理。依赖原有 Docker 缓存，未在空 daemon 重建，未运行旧版应用、验证真实登录或执行生产回滚；tmpfs 不保证安全擦除。

2026-11-12（旧镜像差量密文异机接收）：19 个加密分块全部完成，各次续传前重新校验已有块；在维护机受限 ext4 挂载内按序合并，核对最终大小 77423256 字节及 SHA-256 与生产密文一致，并以不覆盖方式发布。只证明密文异机一致，尚未解密、重组和加载，不能将差量视为完整镜像或生产回滚证据。

2026-11-12（旧镜像差量分块传输进行中）：固定环境传输脚本在私有挂载命名空间核对两端 ext4 挂载、后备文件及目录权限；生产完整密文 SHA-256 与已记录值一致。按每块最多 4 MiB 计算源端摘要，通过本机进程内存及 SSH 中转，维护机验证长度和 SHA-256 后以独占临时文件、硬链接发布；前 15/19 块完成。后续运行重新读取并校验已发布块后，仅继续发送后续块。未测试中断时各种系统故障，所有分块及整文件摘要、解密与重组尚未完成，不认定已传输或镜像可用。

2026-11-12（旧镜像加密差量生成）：维护机通过独立 systemd 单元从生产当前同 ID 的本地镜像导出 blob 名称和大小索引，客户端与单元正常结束，索引仅存在受限 tmpfs 目录，不检查基底 blob 内容。生产确认旧版固定镜像 ID、受限 ext4 挂载及后备文件、权限和容量；独立 systemd 单元在私有挂载命名空间运行，使用现有异机恢复身份的公开收件人和真实 age 生成差量密文，age 输出限定 160 MiB，临时文件独占，成功后以硬链接发布。单元最终 inactive/dead、Result success、ExecMainStatus 0，密文 77423256 字节、SHA-256 `9bb6b8dd96da048c34300dd2394fe57b58fe5306a074e1c37102e8cf3bc75a2f`。此项使用受信 Docker 导出和先前合成验证组件，尚未异机传输、解密、重组或加载；不包含数据库、工作区或完整镜像副本，不能证明回滚。

2026-11-12（镜像差量合成验证）：新增仅供合成调用的 Docker OCI 归档索引、差量和重组组件；维护机六项测试覆盖合成成员重组、篡改差量及基底 blob、缺失 blob、重复及意外路径、无效基底索引和镜像清单引用缺失。重组对每个输出 blob 按内容寻址名称检查 SHA-256。以已有辅助镜像为基底，强制将一个共享 blob 纳入差量，原镜像本机重组并执行 Docker load 成功；因原镜像已缓存，该次不能证明无缓存恢复。随后使用该镜像仅添加随机标签配置、无网络构建一个不同的临时镜像；保存差量后删除临时镜像并确认其 ID 不存在，使用基底重组并 Docker load，恢复镜像 ID 和随机标签均匹配。首次删除临时镜像时，Docker 默认同时移除了无标签基底缓存，导致后续重组失败；已用维护机既有 `native-sidecar-image.age` 解密加载该基底并核对完整 ID，重跑删除时使用 `--no-prune` 后通过。最终临时镜像标签和测试目录时点数均为零，基底镜像仍存在，Docker 卷数为零；生产 API、Web、数据库健康，Caddy 运行。只覆盖受信自建或 Docker 导出夹具，未验证实际旧镜像、跨主机续传、磁盘故障、完整敌意 tar、空 daemon、独立备份或生产回滚。

2026-11-12（旧镜像首次直接传输中断）：本机至两端的 SSH 直通管道曾观察到生产 docker save 与维护机 docker load 进程同时存在，维护机读取量时点约 91 MB；随后控制会话不可访问，重新核查两端相应进程均不存在，维护机按完整 ID 查询不到旧镜像。退出原因及 Docker 缓存残留未知，不认定传输成功。仅以 Docker 导出文件的名称和大小比较，旧版 49 个普通成员中 11 个在当前版导出内名称或大小不同，合计 77373220 字节；该统计未比较内容，不能证明可安全重组镜像。

2026-11-12（备份时效部分观察）：读取生产既有快照 METADATA 的开始时间 2026-11-11 14:06:47 UTC，以已核对身份的 PostgreSQL 只读事务统计 messages、artifacts、bots 中创建时间不早于该时间的现存记录，三个计数均为 0。查询未输出记录、标识或账号；快照开始早于实际数据库导出时点，查询与快照分时执行，且只按行创建时间统计，不覆盖更新、删除、其他表、应用文件、时钟差异或实际快照边界。不能据此断定生产未变化或旧备份可用于直接回滚。

2026-11-12（PITR 只读盘点）：按生产 Compose 项目及服务标签查询，未发现仓库可选 PITR 服务容器；在已核对身份的生产 PostgreSQL 以只读事务查询，复制槽总数为 0、活跃槽数为 0，仓库默认 PITR 复制角色不存在。未检查对象存储、历史备份或其他宿主，也未改变配置；不能据此断言不存在其他 WAL 归档机制，或已经具有可恢复时间点。

2026-11-12（旧版隔离演练接线）：扩展固定恢复脚本，只接受当前及旧版两个已核对的镜像 ID，且必须显式选择旧版；维护机 4 项定向测试通过，包括未认可镜像在访问运行环境前拒绝。使用默认当前镜像重新运行完整隔离抽样：数据库解密和恢复退出 0，1 条空间密钥、25 个消息块、4 个 Bot、1 个群聊、51 条消息及 3 个附件的既有对照再次通过，隔离数据库暂停与恢复的就绪状态分别为 503 和 200，临时 API 与数据库容器清理成功。旧版镜像仍在 SSH 管道传输，未加载、启动或验证，不能用当前版结果代替旧版证据。

2026-11-12（回滚版本静态与迁移只读对照）：旧 revision `1494048fbfac551a6401ec059c80fc95f418156e` 为运行 revision `1993995e572fd4235c7684c533db23eb6cf0554e` 的 Git 祖先，两者数据库 schema、迁移、数据库及认证目录无文件差异；API 云电脑路由和新增拒绝提示逻辑有差异。只读事务从生产 `_prisma_migrations` 获取记录，与旧 revision 文件的 SHA-256 在内存比较：旧版本 208 个迁移、生产 208 条已完成且未回滚记录，名称集合一致、无重复、无校验和不匹配、无未完成或已回滚记录；未输出数据库内容或记录名称。生产数据库容器 ID、启动时间和镜像检查前后相同，生产当前与旧回滚镜像的完整镜像 ID 及 revision 标签均复核。首次查询 `rakazo-rollback` 默认 `latest` 标签不存在，随后按实际完整标签核查成功。此结果不检查 schema 漂移、生产最近变更、数据语义或云电脑行为，不能证明旧镜像可安全写入或恢复生产；未执行回滚。

2026-11-12（加密流强杀及发布修订）：维护机 systemd 瞬时单元以现有合成流组件和真实 age 加密合成字节，确认目标 cgroup 内存在主进程及至少两个子进程后强杀主进程，使用 pidfd 确认两个子进程退出。修订前，未完成密文仍以正式名称存在；修订后，正式名称不存在，随机 `.partial` 临时密文仍有一个，随后由受控临时目录清理。修订改为独占临时文件，成功完成并同步后通过不覆盖硬链接发布；维护机 5 项组件测试通过，含真实 age 往返、已有目标拒绝、竞争发布不覆盖、失败和限额清理；独立 PG18 合成 globals 导出、加密、解密与恢复测试 1 项通过。该测试仅证明所测路径：SIGKILL 仍遗留临时文件，父进程崩溃、单元创建结果未知、磁盘故障、目录恶意并发、文件系统支持与断电持久性均未完整覆盖。Docker daemon 管理的真实数据库进程不受此单元后代演练证明；生产入口继续禁用。

2026-11-12（生命周期故障对照）：维护机在两个随机命名的 systemd 瞬时单元内分别运行合成主进程与调用 `setsid` 的子进程，启动后核对该子进程在相应 cgroup，持有 pidfd；分别对单元主进程发送 SIGKILL 和等待 8 秒运行时限，两个单元均非零结束，pidfd 均显示所跟踪子进程退出。首次强杀尝试使用了当前 systemctl 不支持的参数名，信号未发出，清理后用正确参数重跑通过。最终相关瞬时单元、临时目录、合成 PG 标签容器及 Docker 卷时点计数均为零，生产 API、Web 和数据库健康、Caddy 运行。此演练不覆盖 systemd/宿主崩溃、进程逃离 cgroup 或 Docker daemon 后代。

2026-11-12（生命周期合成探查）：维护机和生产均报告 cgroup v2、PID 1 为 systemd；维护机 `systemctl is-system-running` 为 running，生产为 degraded。生产只读复查有 1 个失败的 transient service，结果为 exit-code，单元名未含 Sydney、Rakazo、Caddy 或 Docker；Docker 和 containerd 均 active/running，失败具体原因与影响未调查。仅在维护机以随机名称创建 systemd 瞬时单元，设置 `Type=exec`、`KillMode=control-group`、有限运行和停止时限；合成主进程启动子进程，后者调用 `setsid` 并在私有 `/dev/shm` 目录写入自身 PID，主进程确认标记后正常退出。`systemd-run --wait --collect` 返回 0，随后该 PID 的 `/proc` 条目不存在；复查同名前缀单元及临时目录均为零，生产服务仍运行且 API、Web、数据库健康。未单独核对该子进程的实际 cgroup 路径，检查也存在 PID 复用窗口；只验证一个正常退出场景，不证明 SIGKILL、超时、系统崩溃、Docker daemon 管理的后代或生产清理可靠性。未接入真实备份。

2026-11-12（Caddy 卷只读结构复核）：在生产通过 Docker 检查运行中 Caddy 的 Compose 身份及其 `/data`、`/config` 本地命名卷与 inspect 挂载路径匹配，随后不跟随符号链接遍历并统计对象类型、数字属主、权限、扩展属性、设备及普通文件链接数，不读取或输出文件名和内容。两个卷根均为 root:root 1777；不含卷根的条目共 9 个目录和 7 个普通文件，观察对象均 root:root，未观察到链接、其他类型、扩展属性、不同设备或多链接普通文件。检查前后容器 ID 和启动时间一致。此遍历并非原子或恶意并发防护，未检查同设备 bind mount、完整 ACL 语义或文件内容；不构成备份、恢复或来源锁定。现有合成采集器要求目录非组及其他用户可写，故真实卷根未满足该约束。

2026-11-12（Web 资源卷只读复核）：生产 Docker 确认 `rakazo-prod_webassets` 使用 local 驱动，Web 容器健康；生产已有工作区暂存 ext4 挂载时点空余约 958 MiB，维护机镜像接收区约 509 MiB。未采集卷、未验证来源并发变化或资源恢复，也未确定这两处适合该用途。

2026-11-12（隔离附件抽样）：维护机重跑真实数据库及 appdata 隔离恢复，并在已有合成会话所属用户和工作区中按 ID 选取最多 3 个、大小为 1 至 1048576 字节的附件；实际取到 3 个，逐一通过生产同 ID API 镜像的授权读取接口返回内容，检查规范 base64、解码字节数及 SHA-256 与恢复数据库元数据一致，均通过。标识、名称、摘要及内容均未输出。归档提取安全测试 3 项通过；数据库恢复、认证和消息抽样以及隔离数据库暂停/恢复就绪对照再次通过。演练后两类标签容器、相关临时目录及 Docker 卷时点数均为 0；备份清单三项通过，生产 API 和 PostgreSQL 健康、Caddy 运行。首次远端启动因命令引用错误产生语法错误，未运行演练；修正后运行成功。此抽样不验证其他附件、权限拒绝、实际登录、全量业务、跨源一致性或生产回滚；内存和临时文件不保证无 swap 或安全擦除。

2026-11-12（恢复库隔离会话与真实应用读取）：维护机按前述无外网隔离方式恢复数据库、配置及 14 个 appdata 文件并启动生产同 ID API 镜像。在临时恢复数据库中选择有工作区成员关系、未归档 Bot 且含加密消息的一条现存线程，仅在该临时库为其用户插入一小时有效的随机合成会话；使用备份认证密钥对合成 token 签名，凭据与目标 ID 仅经内存和容器标准输入传递。实际 `/api/auth/get-session` 识别该用户，无会话和错误签名返回空会话；无认证的 Bot 列表 RPC 返回 401。使用签名会话及相应工作区访问，API 返回 4 个 Bot、1 个群聊和目标线程页 51 条消息；目标消息在数据库中的块包含 `rkz1:` 密文，API 返回的对应消息具有非空内容块且返回页的块不含 `$sealed`，说明这次通过应用读取路径打开了该消息。未输出账号、会话、ID、消息或密文。第一次通过后补充错误签名及目标消息检查，第二次通过；再收紧数据库筛选为明确检查 `$sealed` 字段，第三次通过。每次同时验证隔离数据库暂停时 `/ready` 为 503、恢复后为 200；最终随机标签的 API 和数据库容器、临时 appdata 目录及 Docker 卷时点计数均为 0，快照三项摘要仍通过，生产 API、数据库健康且代理运行。该合成会话绕过实际登录流程，仅存在临时恢复库；这不是原用户密码、通行密钥、完整权限隔离、附件、移动/桌面联调或全量数据一致性的验证。

2026-11-12（真实数据库及应用数据隔离启动）：维护机使用生产同 ID PG18 和 API 镜像，重建网络模式 none、只读根和 tmpfs 配置的临时数据库容器，导入已有密文快照；age 和 pg_restore 均退出 0，隔离库对象权限及行安全摘要与此前生产时点相同，并再次验证 1 条空间密钥与 25 个加密消息块。以临时 age 恢复身份在内存解密 appdata 归档，仅接受安全相对路径、普通文件和目录，在 `/dev/shm` 独占目录提取 14 文件、4708191 字节；归档条目、路径及重复拒绝的合成测试 3 项通过。恢复数据的文件和目录权限及所有权为演练重新设置，并非原始权限恢复验收。启动前将隔离库中的占位 `rakazo_app` 设为登录并赋予新生成的演练密码；API 只注入备份的内容加密及认证密钥、内容加密设置与新的本地演练凭据，不注入外部服务凭据。API 使用只读根、无 Docker 日志、丢弃 capability、非 root、临时数据绑定及资源上限；数据库容器检查网络接口仅有 loopback，API Docker 网络模式绑定该数据库容器命名空间且无端口映射。实际探测 API `/health` 和 `/ready` 均为 200；暂停的是该新建隔离数据库容器而非生产，`/ready` 返回 503，解冻后恢复为 200，表明该次就绪检查依赖隔离数据库。两次实际运行均成功；数据库和 API 容器按随机标签及镜像核对后删除，最终两个标签容器、临时 appdata 目录和 Docker 卷时点计数均为 0，备份清单复核通过。演练后生产 API 和 PostgreSQL 健康、代理仍在运行。明文配置和数据只在维护机内存与 `/dev/shm` 临时文件处理，swap、特权观察者及安全擦除不受保证；网络隔离基于 Docker 配置和接口检查，不是特权对抗证明。仅验收本次健康及数据库可达，不代表真实角色认证、用户登录、Bot、附件、云电脑、异地完整备份或跨源一致性通过，也未执行生产回滚。

2026-11-12（真实恢复库加密消息抽样）：维护机重新校验既有快照三项密文及元数据摘要后，在网络模式 none、只读根和 tmpfs 配置的临时 PG18 容器以占位角色导入数据库，age 和 pg_restore 均退出 0；以既有配置归档中的密钥在维护机进程内存中解封 1 条空间密钥。从恢复库 messages 的 JSON 块中，按消息 ID 选取最多 25 个带 `rkz1:` 密文且长度不超过 16384 字符的块，连同行、线程及空间上下文只传入本机 Node 检查进程；依据仓库算法逐个验证 AES-256-GCM 认证、对应密钥和空间及 JSON 解析，25 个通过，未输出 ID、密文或明文。独立合成密钥及消息九项正反对照覆盖正确解密、错误密钥、空间、行及修改密文，均符合预期。检查进程在维护机宿主运行，数据经进程内存和管道传递，特权观察、swap 和安全擦除不受保证；使用的检查器复现仓库算法，未调用打包应用自身代码。容器清理后对应标签容器数及 Docker 卷时点数均为 0，快照校验复核通过。选取为有条件上限抽样，不覆盖其余消息、大块、旧明文、附件、真实登录或应用业务，也不能证明配置和数据库跨源一致。

2026-11-12（备份配置与空间密钥解封）：维护机以既有身份在内存解密 `config-core.age`，归档含 4 个普通文件；解析发现 `ENCRYPTION_KEY`、`CONTENT_ENCRYPTION`、`POSTGRES_APP_PASSWORD`、`BETTER_AUTH_SECRET` 均各有一个非空定义。以临时随机 HMAC 密钥在生产 API 容器运行配置与维护机归档值之间逐项对照；四项均匹配，数据库密码从运行时 URL 解码，生产 API 容器 ID、启动时间和镜像前后相同且检查时健康。两机受信特权环境、临时进程及 swap 不在该对照防护范围内；未输出密钥值、数据库 URL 或业务数据。随后维护机新建网络模式 none 的 PG18 tmpfs 容器，再次以占位角色恢复现有数据库密文，age 和 pg_restore 均退出 0；从恢复库读出空间密钥记录到进程内存，用配置归档中的密钥按仓库 `content-keys.ts` 的 HKDF/AES-256-GCM、空间 ID 和版本上下文独立验证，1 条记录成功解封，只输出数量。先以合成密钥验证正确密钥、错误密钥、错误空间、未知主密钥和空记录五种对照，均符合预期；首次真实验证通过后核查仓库函数发现不应对密钥额外 trim，已修正检查器并重新运行全部五项合成对照及真实恢复，结果仍为 1 条通过。恢复后容器按标签和镜像检查删除；本轮快照清单三项校验通过。该检查器不是生产应用自身执行路径，未解密实际消息、文件或全部其他类型秘密；配置与数据库非同一时点采集，不能证明完整业务恢复、跨源一致性或生产回滚。

2026-11-12（真实数据库快照隔离恢复与权限摘要对照）：维护机现有 `pre-ip-acl-20261111` 的三个文件在本轮恢复前后均通过既有 SHA-256 清单；生产时点确认 PostgreSQL 运行镜像及 API 健康。维护机以生产同 ID 镜像创建新的网络模式 none、只读根、关闭 Docker 日志和无端口 PG18 容器，配置三个 tmpfs 挂载；检查 Docker 容器配置和镜像、标签，未独立检查容器内实际挂载或网络命名空间。先创建 `rakazo_app` 非登录、非超级用户、NOBYPASSRLS 占位角色，age 解密与 `pg_restore --exit-on-error` 分别退出 0。生产只读查询和恢复库使用同一 SQL：public 模式内普通表、分区表、视图、物化视图、序列和外部表展开默认或显式 ACL，连同对象 owner、RLS 启用及强制标志共 1290 条，两端聚合 MD5 均为 `37ad248ae0613bac95b5f1b464d11694`；115 条 RLS 策略的名称、命令、角色、条件及检查表达式聚合 MD5 均为 `b75f6af3e4c9ef2c8245fd04664bda15`。未输出对象名称、表达式或数据。首次尝试在容器初始化期间数据库连接失败、未导入，随机标签容器经身份核验清理；调整为连续实际 SQL 就绪检查后重试成功。最终标签容器数和 Docker 卷时点数均为 0。摘要使用 MD5 作为对照，不适合作抗恶意碰撞的完整性证明；生产与快照为不同时点、两条查询不构成单事务，对照仅覆盖指定对象及字段，不检查列级和 schema 等其他权限、真实角色密码与属性、策略实际允许/拒绝行为、用户数据或应用业务；不构成完整恢复或生产回滚验收。

2026-11-12（globals 加密流 PG18 合成接线）：维护机使用生产同 ID 的 PG18 镜像创建两台全新容器，创建后检查镜像、随机标签、网络模式 none、只读根、无端口、无 Docker 日志及三个 tmpfs 挂载，分别限制内存和 PID；本次没有独立检查容器内网络命名空间或 tmpfs 实际挂载。源容器生成合成组与带合成密码的角色，经真实 `pg_dumpall --globals-only`、加密流组件和 age 保存到 `/dev/shm` 私有目录；使用临时身份解密到内存，删除恰好一条已存在的同名引导角色创建语句后导入目标 PG18。两端合成角色的登录属性、SCRAM 哈希和指定成员关系在内存比较一致，测试退出 0。首次通过后将断言改为仅报告不匹配、避免失败时输出哈希，再次执行通过；每次以随机标签核对镜像与标签后删除容器，随后查询该标签无容器，最终 Docker 卷时点计数 0。身份、加密文件及合成输入在临时目录清理，tmpfs 和进程内存不保证安全擦除。演练信任本地 Docker daemon，未验证创建结果未知、异常中断、实际密码登录、其他引导角色兼容性、生产数据或业务；不代表生产角色已备份或恢复。

2026-11-12（globals 加密流合成组件）：维护机 `/dev/shm` 临时目录执行 `globals-encrypted-stream.test.py` 四项通过；真实 age 对合成输入加密、解密，文件模式为 600，重复目标拒绝且原文件不变；合成来源或加密进程返回非零、来源超时、超过 4096 字节上限时均报告失败并移除不完整文件，不安全名称及目录权限被拒绝。异常处理调整为清理错误时仍尝试回收其他直接子进程并关闭文件后复测四项通过。仅测试受控的直接子进程及小型合成输入，未验证 SIGTERM/SIGKILL、父进程崩溃、已退出父进程遗留后代、逃逸进程、磁盘满、Docker 或真实 PostgreSQL；进程组不是完整生命周期监督，临时目录在 tmpfs 也不保证安全擦除。组件不验证可执行文件、收件人、挂载、独立配额、数据库身份或输出发布的并发安全，未接入生产。

2026-11-12（生产 globals 只读采集前置对照）：只读核对 PostgreSQL 容器 ID、运行状态、生产 Compose 标签及 PG18 镜像 ID；容器内使用清洁 libpq 环境、容器已配置的引导身份及本地 Unix socket 查询，得到 PG18、主库、当前角色超级用户及预期目录前缀均为真，默认事务只读为 off。另设 `PGOPTIONS=-c default_transaction_read_only=on` 后确认事务只读为真，并以聚合查询得到非系统角色 2、自定义表空间 0、成员记录 3；未输出角色名称、密码或业务内容。随后在 30 秒外层及 15 秒语句时限内执行同一只读连接的 `pg_dumpall --globals-only --no-role-passwords`，标准输出和诊断丢弃，命令退出 0；容器 ID、PID、启动时间、运行状态和镜像 ID 前后相同。此命令不含密码且没有保存输出，不是备份；只读默认值不构成服务端永久最小权限，查询与后续快照仍可能变化，未验证含密码的加密采集、真实角色恢复或一致性。

2026-11-12（基础服务镜像异机加密及加载）：只读核对生产运行中的 Caddy 镜像 ID 为 `sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d`、PostgreSQL 镜像 ID 为 `sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6`，维护机原有 Docker 缓存均包含对应 ID。确认维护机 2 GiB ext4 接收区的 loop 后备文件、700 根目录及空余空间后，以既有恢复身份派生的收件人将两个缓存镜像一起流式加密；`docker image save` 和 age 各退出 0，密文 192864936 字节、模式 600、SHA-256 `332dcf0939cf36b30c2ea019b0e46800b687265709b2a11fb23c18b20310d8e0`，使用不覆盖的硬链接保留正式名称。复核密文摘要后，以恢复身份解密并 `docker image load`，两个进程均退出 0，加载输出两项 ID 与生产容器一致。目标 Docker 原已有对应缓存；未在空 daemon 恢复、启动 Caddy 或数据库，亦未证明各卷、配置、角色、证书和业务可用。采集期间未改变生产容器或入口，备份仅保存在维护机。

2026-11-12（工作区归档检查与合成加密恢复）：维护机 Python 3.10 执行 `workspace-archive-verify.test.py` 五项通过，覆盖归档路径、重复成员、链接作为父目录、硬链接、不支持的 PAX 属性、所有者、大小及截断文件拒绝，并检查聚合摘要对顺序无关且反映内容变化。另执行 `workspace-encrypted-synthetic.test.py` 一项通过：在 `/dev/shm` 创建合成文件和外部及失效链接，以真实 age 临时身份加密并解密；验证归档后以 GNU tar 提取，再由描述符归档器重新采集，内容及元数据聚合摘要匹配。篡改密文、截断密文和错误身份各返回非零；合成密钥和夹具通过临时目录清理，tmpfs 不保证禁用 swap 或安全擦除。该演练在内存缓冲完整明文，密钥在 tmpfs 文件中，未使用网络隔离容器；只对本次自行构造、检查通过的归档调用 GNU tar，不证明对任意恶意归档或生产项目的安全恢复，也未验证生产流式加密、容量限制、超时、故障清理及跨源一致性。

同日执行中的两次测试启动失败：首次 PowerShell 传递命令过长，未启动 SSH；第二次标准输入编码导致 base64 报错及零测试；修正后 unittest 自动发现因文件名不符合 Python 模块命名而报告零项并主动返回失败，最终直接逐个执行两个测试文件，分别实际运行 5 项和 1 项并通过；零测试均未计为通过。

2026-11-12（描述符锚定归档合成验证）：生产工作区所在文件系统只读核对为根分区 ext4，未发现由所列块设备提供的独立 LVM 或 btrfs 文件系统；这不能排除云平台侧快照能力。维护机以临时合成目录运行 `workspace-fd-archive.test.py` 八项通过，覆盖普通文件和外部、失效链接，GNU tar 提取合成数据与链接，硬链接、FIFO、socket、扩展属性、所有者及容量限制拒绝，目录替换为外部链接拒绝，以及采集中内容修改。挂载 ID 的单元测试使用注入值；另在私有挂载命名空间对合成目录执行真实同设备 bind mount，观察设备号相同、挂载 ID 不同，候选拒绝归档，随后卸载并清理夹具。首次修改竞态测试触发时机不准确，调整后又因测试代码拼写错误失败；修正期间单独复现维护机快速同长度改写后文件内容变化而 mtime/ctime 纳秒值均未变化。候选因此增加归档读流与随后重新读取的 SHA-256 对照；最终测试刻意忽略时间戳，验证该对照可检出指定中途修改。该结果不证明所有竞态可检出、文件树或跨源一致；未读取真实项目、加密、异机复制、恢复生产数据或接入生产。

2026-11-12（主应用镜像异机解密加载）：生产 `sydney-image-copy-20261111.service` 最终 `inactive/dead`、`Result=success`、`ExecMainStatus=0`，日志记录第三次 `rsync_exit=0` 及 `rsync_complete_target_checksum_pending`。维护机确认接收区为预期 ext4 环回后备文件、根权限 700、密文权限 600，文件大小 1293641256 字节，SHA-256 `2910f426501f5330160da200ca7521bea5846fa1fd10b73aea6811d1214e0679` 与生产一致；使用不覆盖的硬链接保存正式密文名，移除 partial 名。既有身份解密与 Docker 加载各退出 0，加载镜像完整 ID 为 `sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，与生产运行镜像一致。维护机确认限时 SSH 授权恰好一条，核对文件身份与时间后原子替换并确认标记不存在；随后删除两端明确列出的临时传输密钥、接收器及目录。该乐观并发检查不能完全排除最终检查与替换间其他写入者的竞态；未验证镜像启动或业务恢复。

2026-11-11（合成工作区元数据解析）：维护机 Python 3.10.12 和 GNU find 4.8.0 运行 `workspace-tree-manifest.test.py` 四项通过；使用临时合成目录验证实际 NUL 分隔输出、文件大小、外部链接不解引用及记录顺序无关，并验证截断、重复、非法路径、链接父目录、所有者、硬链接、特殊类型和容量限制拒绝。测试目录由临时目录管理器清理；未访问真实工作区。摘要只覆盖输入的元数据，不读取文件内容或检查扩展属性，不能证明 find 遍历完整、并发安全或备份恢复成功。

2026-11-11（镜像续传再观察）：生产单元第三次尝试时仍为 `active/running`，维护机接收文件为 1190690816 字节；前两次分段均按时限退出 124。尚未取得终态、目标摘要或解密加载结果，运行中的 `Result=success` 不代表成功。

2026-11-11（合成工作区容器隔离探索）：维护机以无网络、只读根、非 root、全能力丢弃及临时 PostgreSQL 声明卷的固定 PG18 镜像建立合成测试。首次尝试将 `/proc/<pid>/fd/8` 直接作为 Docker bind 来源，OCI 启动返回 `invalid argument`；容器按 ID 删除，事后无该容器、无新增 Docker 卷和同名前缀测试目录。第二次将合成源目录先绑定到 root 私有临时路径并将该绑定重挂为只读，核对绑定、固定描述符与容器工作区的设备号/inode 一致；将宿主原路径替换为指向根目录的合成链接后，容器仍读取固定的原合成文件，外部及失效链接在容器内不可访问。命令退出 0，退出处理删除容器、绑定及夹具。PG18 镜像中 tar、gzip、find、sort 可用，python3 不可用；单独的工具检查容器已删除，前后 Docker 卷数均为 0。此实验未运行真实工作区、加密归档或故障中断，也未证明对所有恶意进程及 Docker 竞态的防护。

2026-11-11（工作区采集候选与阻断）：生产新建预分配 1 GiB ext4 环回暂存，核对挂载目标、后备文件、`nodev,nosuid,noexec` 和根目录 700；未写入工作区归档。候选旧摘要 `4dee6cb8ba5b50c63dc812a72f5ebb211b7e993de32dd5d02129a179713f5f7e` 的维护机语法及抽取的树指纹合成对照覆盖稳定性、外部链接不跟随、内部变化、硬链接、socket 和文件/根扩展属性拒绝；以真实 age 对合成目录验证 tar 保留外部与失效链接、不归档目标内容，直接 socket 对照中 tar 返回 0 但产生警告。生产仅在私有挂载命名空间运行候选内抽取的只读 driver 身份、嵌套挂载和目录树检查，得到 5978 条目、普通文件 456609793 字节；首次提取因辅助测试代码匹配错误而失败，修正后退出 0。后续静态审查发现 `os.walk` 与 GNU tar 的路径遍历存在并发目录/链接替换竞态，可能越界读取，故未执行生产采集并将入口硬禁用。当前禁用脚本摘要 `1f64ad5d8c363a08e0d2a30e7ee82dad7664c5b581a076dcabdba5deb1d51a5f`，维护机 `bash -n` 及拒绝入口退出 1；此前合成测试不代表完整脚本安全或生产工作区已备份。

2026-11-11（原生工作区结构只读盘点）：生产活动驱动的工作区在两次时点遍历中未发现嵌套挂载或跨设备条目；统计 4766 个普通文件、1205 个目录和 6 个符号链接，普通文件共 456609793 字节，扫描错误为 0；未观察到普通文件硬链接或扩展属性。全部 5977 个条目由桌面服务账号拥有，未发现非链接条目组/其他用户可写；5 个链接的规范目标位于工作区内，1 个指向工作区外 `/tmp` 下的 socket，2 个链接的目标不存在。只输出聚合分类，不读取文件内容或输出链接目标；在线遍历不构成一致快照，符号链接和外部运行时 socket 不能按普通文件解引用归档。

2026-11-11（原生工作区只读盘点）：生产活动 driver 进程的 `SYDNEY_WORKSPACE_ROOT` 与文档所述工作区规范路径一致且目录存在，路径所在文件系统为 ext4；`du --one-file-system --apparent-size` 在 20 秒时限内退出 0，统计 456609998 字节。未输出环境变量值、项目名称或内容；统计排除跨文件系统内容，仅为在线时点观察，也不证明该目录包含全部工作区或已备份。该目录不在已知 API `/data` 归档范围内，需独立验证和备份。

2026-11-11（原生辅助运行依赖时点盘点）：生产三个 native 辅助容器仍在运行；其挂载包含共享目录和一个 Unix socket，来源均不在简单 `/run` 或 `/var/run` 前缀下。生产 `sydney-driver.service` 与 `sydney-driver.socket` 当时均 active；历史文档中的 `sydney-tunnel.service` 和 `sydney-screen-tunnel.service` 在该主机显示 not-found。这里只检查容器挂载类型、目标及 systemd 状态，没有输出源路径、套接字内容或用户数据，不能据此断定其他主机状态、链路健康或依赖已备份。

2026-11-11（真实密文分段续传观察）：生产单元第一段 rsync 达到预设 1200 秒后记录退出 124，随后记录第二次尝试；维护机 `.partial` 在第二段时从 530022400 字节增加至 552304640 字节，单元仍 `active/running`。此证据只覆盖一次定时中断后继续接收，不证明最终摘要、完整解密或断电重启可恢复；运行中的 `Result=success` 仍不作成功判断。

2026-11-11（Web 历史资源卷只读盘点）：生产 Web 容器、`rakazo-prod_webassets` 卷名及 local driver 与容器挂载来源匹配，宿主卷根和容器视图的设备号、inode 一致；遍历时统计到 1321 个普通文件、2 个目录，普通文件合计 184376589 字节，未观察到符号链接、其他设备、扩展属性或组/其他用户可写条目。Docker 时点统计约 184.4 MB；这些仅是遍历时观察，不能证明并发写入一致性、未来不变或已经备份。当前 PG 容器另挂的旧 `rakazo-prod_pgdata` 卷在 Docker 时点统计为 0B，不能仅凭此认定可删除。

2026-11-11（驱动配置真实加密与隔离恢复）：生产在已核对后备文件的受限 ext4 暂存区，使用当前已测配置工具及既有收件人加密 driver service、drop-in、socket unit 和驱动源码四项，采集退出 0，密文 41160 字节、SHA-256 `bc326e9fa2b63dee3e4c1eb4ae6e93c5cfb8812b7988e4f6cddb68dda7877720`。SSH 中转发送和接收均退出 0，维护机核对大小、权限和密文摘要后保存；随后在确认 `/dev/shm` 为 tmpfs 的私有目录，以现有身份流式解密并严格限制四个预期普通文件及路径，恢复内容、数字 UID/GID 和模式。首次比较在写缓冲尚未刷新时取文件大小而报告不匹配；刷新后再验 4/4 匹配，第三次独立重建并从恢复文件重新读取内容计算摘要，4/4 与事后生产时点的内容、大小、UID/GID 和模式一致。age 解密进程成功，未输出文件内容；每次临时目录由退出处理清理，事后未发现同名前缀目录。tmpfs 不保证不使用 swap 或安全擦除；未恢复服务账号、桌面会话、套接字、工作区，也未启动驱动或验证业务。

2026-11-11（驱动配置采集前检查）：生产 `sydney-driver.service`、其一个 drop-in、`sydney-driver.socket` 的 unit 文件及驱动源码共四个普通文件，路径不在现有 `config-core.age` 中；只读检查其父路径未发现非 root 所有、组/其他可写或符号链接组件，四个文件均 root 所有，总大小 28661 字节。当前 `backup-config-encrypted.sh` SHA-256 `15f43094e84ed4d99179e8a9ea28abf9e1ece37484f0bbe7c00ce6ddffaa0382`、测试 SHA-256 `89528c758e201923c078cf1e314fff9c41a51fd89f5b689d69a80b6ad7ce0408`；维护机私有临时目录执行 32 项测试通过，另用真实 age 和合成文件完成加密、内存解密、内容与数值权限对照。合成测试不证明真实采集、服务配置一致性或恢复；临时测试目录按程序清理。

2026-11-11（辅助服务 Compose 配置对照）：只读检查三个原生辅助容器的 Compose 标签，均引用两份配置文件；在生产端读取文件时核对读取前后文件身份和元数据未变化，仅在内存计算摘要。维护机对现有 `config-core.age` 流式解密、在内存读取归档并计算摘要；两份当前路径均出现在归档内，内容摘要以及数字 UID、GID、模式均与事后生产时点一致。未输出文件名或内容；该对照不证明环境变量、挂载源、云电脑端服务、跨源一致性或辅助服务实际恢复可用。

2026-11-11（原生辅助镜像异机恢复）：只读核查生产三个 native 屏幕及驱动辅助容器在捕获前后均使用镜像 `sha256:a6be4c0262b339c53ddad723cdd178a1a13271e1137c65e27f90a08c16de02b8`，镜像 inspect 大小 4154066 字节。生产以既有收件人流式加密，`docker image save` 和 age 均退出 0，密文 4163768 字节、SHA-256 `3c8a49fec7243badd3125822ef07be01b30ffcb6cb8524095928e7236abb4e05`。经本机 SSH 中转到维护机时发送和接收进程均退出 0；本机 Python 在 `sys.exit(0)` 被通用异常处理器捕获后额外误打印“transfer interrupted”，不代表发现传输中断，后续维护机实际大小与密文摘要均匹配，才将 `.partial` 改为最终名。维护机临时解包经软件源索引摘要校验的 age 1.0.0，使用既有恢复身份流式解密至本机 Docker，age 与 `docker image load` 均退出 0，按完整 ID 核对加载结果一致。未启动辅助容器、核对对应配置或验证云电脑服务；维护机临时 age 目录保留以备主镜像恢复。

2026-11-11（真实密文后台续传启动）：重核生产密文 SHA-256、源与目标挂载后，创建限定生产来源地址、只写接收区、强制接收守卫和维护机本地时间 2026-11-12 09:14:58 到期的临时 SSH 身份。生产以 systemd 启动 `sydney-image-copy-20261111.service`，`RuntimeMaxSec=28800`，工作程序对传输尝试设置 1200 秒超时并使用 `rsync --append-verify --partial` 重试。启动命令退出 0，检查时单元为 `active/running`、日志显示第 1 次尝试，维护机 `.partial` 为 9961472 字节、权限 600；运行中 `Result=success` 不是终态。目标摘要、完整复制、身份清理、解密加载、异常或重启恢复均未验证；临时授权、密钥及接收器按运行需要保留。

2026-11-11（合成只写 SSH 与续传）：通过已认证连接取得维护机主机公钥及生产来源地址，建立来源地址限制、到期及强制执行私有命名空间接收守卫的合成身份；生产发送合成小文件及追加后的再次发送，`rsync --append-verify` 两次退出 0，源目标 SHA-256 一致。普通 shell 请求和从接收端读取请求均非零。授权清理退出 0；初次目标合成文件及接收器清理因连接超时返回 255，重新连接核验合成文件与接收器摘要后清理，并确认授权标记、合成文件和接收器目录不存在；源端临时材料清理退出 0。未传输真实镜像，未覆盖大文件中断、进程或机器重启。

2026-11-11（私有挂载命名空间隔离对照）：维护机使用临时 32 MiB 合成 ext4 卷和独立子进程，在子进程进入私有挂载命名空间后，从宿主命名空间卸载该临时卷；子进程仍能在其保留的挂载中写入并读取合成标记，宿主已卸载目录下没有该标记。命令退出 0，退出处理清理临时资源。此实验验证该主机上的基本卸载隔离行为，不是对完整接收脚本、rsync 或恶意特权操作的端到端证明。

2026-11-11（接收命名空间续修）：维护机确认可创建私有挂载命名空间；接收守卫改为先以 `unshare --mount --propagation private` 重启自身，再检查固定挂载和后备文件。当前脚本 SHA-256 `50dedff270585c6c96e2d3193509a2b08f385b29d72a7865a46c587987db1886`，维护机 `bash -n` 通过；正常挂载到达 rrsync 并拒绝缺失 SSH 命令，无挂载及错误后备的临时副本均在 rrsync 前退出 1。临时目录由退出处理删除；未模拟宿主并发卸载、恶意特权进程或真实 SSH 传输，不把命名空间检查视为完整竞态证明。

2026-11-11（接收挂载守卫草案）：新增 `infra/compose/receive-image-backup.sh`，传到维护机 root 私有临时目录的副本 SHA-256 为 `7359e30ee720a8b6fbb8d6cfabfe1aebd3ff1456a788dfad1d0c1d39ad6acd69`；`bash -n` 通过。实际接收挂载上以去除 `SSH_ORIGINAL_COMMAND` 的环境运行，脚本通过守卫抵达 rrsync，后者按预期拒绝非 SSH 调用；修改临时副本分别指向未挂载目录和错误后备文件，均在调用 rrsync 前退出 1。临时目录由退出处理删除；未验证强制命令、真实 SSH 权限、挂载检查后的竞态或续传，也未将草案部署为接收服务。

2026-11-11（异机接收空间）：维护机 SSH 首次查询出现 banner 握手超时，重连后检查到 `/usr/bin/rrsync` 提供只写及禁止删除选项。维护机在 root 700 的现有备份父目录下建立预分配 2 GiB ext4 环回接收区，核对挂载点、后备文件、`nodev,nosuid,noexec` 及根目录 700；空区当时约 1.9 GiB 可用。未建立续传授权、未测试断点续传、未复制生产密文；该接收区位于维护机根盘，文件系统容量边界不代替完整灾备。

2026-11-11（生产镜像密文捕获）：生产 SSH 恢复后只读核对挂载、容量、无输出文件和无捕获进程，发现 ext4 根目录权限为 755，核对其 loop 后备路径后改为 700。再次检查 ext4 挂载及 `nodev,nosuid,noexec`、后备文件、源镜像 ID、剩余空间和输出不存在；`docker image save` 与 age 流式加密分别退出 0，结果为 1293641256 字节、SHA-256 `2910f426501f5330160da200ca7521bea5846fa1fd10b73aea6811d1214e0679`，文件 root 所有、权限 600。文件位于生产本机限额暂存区，未进行目标端传输、解密、加载或业务运行；不证明镜像可恢复或完整系统可回滚。捕获后维护机 SSH 一次 banner 握手超时，当前维护机状态未确认。

2026-11-11（生产 SSH 超时）：镜像加密捕获的 SSH 命令在建立连接阶段超时，远程捕获命令未启动；后续同一管理别名重试再次连接超时。本机 TCP 检查生产主机端口 80、443 可建立连接，端口 22 在超时内未连接；维护机绕过跳板的直接 SSH 也超时。这些只是网络时点证据，不证明 HTTP 业务健康、原因或服务端当前进程状态。已准备的 2 GiB 暂存及 root 临时 age 工具须在 SSH 恢复后复核，不能声称已清理或已有镜像密文。

2026-11-11（镜像密文暂存准备）：生产新增预分配 2 GiB 的 ext4 环回文件系统，核对挂载点、loop 后备路径、ext4 和 `nodev,nosuid,noexec`，当时约 1.9 GiB 可用；它位于生产根盘，不是异地备份。age 包依本机软件源索引 SHA-256 核对为 `22ed034e16d8a7662d94dbb8d9f644f01284c6d87bc6b619903e38ba91125337`，解包的 age 报版本 1.1.1，未安装系统软件。两次在 `/run` 解包后未能执行，后来确认该 tmpfs 为 noexec；失败目录已清理。经已认证维护机 SSH 获取既有 root 限权收件人，生产以它成功加密空输入；未在本次解密对照，临时工具和收件人目前仍在生产 root 私有目录，真实镜像密文未生成。

2026-11-11（生产镜像压缩容量测量）：生产源镜像 ID 未变，以 `docker image save | nice -n 19 gzip -1 | wc -c` 流式计数，输出 1270653622 字节，三个进程分别退出 0；计数过程未保存镜像内容。原镜像 inspect 报大小 1272082150 字节，现有受限暂存 ext4 当时可用 448724 KiB，无法容纳该压缩流，更未计入加密开销和保留空间。测量期间观察到生产机负载一度升高；未验证对业务延迟的影响。系统 PATH 未发现 age，生产软件源有候选包，尚未下载或验证加密工具。

2026-11-11（真实直传本地时间复试）：按维护机本地时间生成 25 分钟到期的受限 SSH 授权，固定通过已认证管理连接获取的维护机主机公钥；生产 `docker image save` 和维护机强制 `docker image load` 进程均实际启动，维护机进程读取量由约 2.5 MB 增至约 7 MB，说明认证及数据传输已发生。观察吞吐后预计无法在 20 分钟操作限时内完成，核实源进程唯一并发送 TERM；加载报告截断，源端与目标端分别返回 1，本机传输 SSH 返回 1。清理临时授权和源密钥目录各退出 0，复查标记及源路径不存在，未发现对应传输进程。两端均有 rsync、gzip 和 sha256sum，生产独立暂存 ext4 可用约 438 MiB；系统 PATH 均未发现 age，维护机原有收件人文件存在。未得到完整镜像副本或镜像运行验证，也未核实所有 Docker 缓存残留。

2026-11-11（限时公钥隔离认证）：维护机 OpenSSH 8.9 手册将授权项到期时间描述为服务器本地时区。回环临时 sshd 使用独立合成主机与客户端密钥、固定主机公钥和强制 `/usr/bin/false`；UTC `Z` 格式的未来时间认证退出 255，服务器调试输出包含到期及错误密钥选项；去掉到期选项后认证成功、强制命令退出 1。重新创建隔离 sshd，将到期值改为维护机本地时间加十分钟、不带 `Z`，认证成功，强制命令退出 1，调试输出存在 accepted publickey 和 forced-command 且无 bad key options。服务均报告停止、临时目录由退出处理清理；这只验证该隔离环境，不证明先前真实失败的唯一原因或真实直传成功。

2026-11-11（直传身份诊断）：第二个仅允许镜像加载的限时临时公钥可由维护机 `ssh-keygen` 在授权文件中解析，生产 SSH 客户端报告已提供公钥，但服务器未接受，认证退出 255；不证明强制命令生效，也未开始镜像加载。清理命令均退出 0，事后检查两个试验标记均不在授权文件中、生产两个临时路径均不存在，两端无对应镜像传输进程，维护机仍无目标镜像。维护机对当前管理连接的有效配置启用公钥认证及云平台 AuthorizedKeysCommand；该事实本身不解释拒绝原因。未输出密钥或业务内容。

2026-11-11（镜像服务器间直传尝试）：维护机 OpenSSH 8.9、受限 SSH 目录权限及生产临时目录可用；以已认证连接获取维护机 Ed25519 主机公钥，在生产 tmpfs 中生成一次性私钥，在维护机追加带失效时间、禁用转发且强制执行镜像加载命令的临时公钥。生产到维护机的 SSH 公钥认证被拒，传输管道报告源端 141、目标端 255，未导入镜像；拒绝原因未确定。清理程序报告删除临时授权和生产临时密钥均退出 0，随后只读检查维护机授权文件不再含临时标记；未核对密钥底层介质擦除。目标磁盘与现有服务未变更，未完成异机副本、完整恢复或生产回滚。

2026-11-11（应用镜像再次传输中止）：只读检查生产源镜像 ID 为 `sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`、镜像大小 1272082150 字节；维护机按 ID 未找到，目标文件系统可用约 23 GiB。两端通过本机 SSH 管道启动 `docker image save` 与 `docker image load`，过程中分别观察到对应进程，维护机加载进程读取量增长到约 14 MB，但吞吐低，预计超过 30 分钟上限，主动中止；本机命令返回 1，未取得独立源端和目标端退出码。事后两端未发现对应进程，目标仍无该镜像 ID；未核实所有 Docker 临时缓存，不视为副本成功。生产到维护机的 TCP 22 探测可连接；本机 SSH agent 不可用或无身份；生产 root 默认 SSH 目录未发现公钥文件，维护机授权文件中读取到 7 个指纹，未发现匹配的生产公钥。这不能排除其他认证途径，未验证异机 SSH 认证及吞吐。未重启或变更生产服务。

2026-11-11（镜像传输会话失联）：原执行会话句柄查询返回未知，生产此前的 `docker save` PID 已不存在，维护机未发现 `docker load` 进程，按目标镜像 ID 查询无结果；未取得两端退出码，不能判定失败原因或是否存在未标记缓存。生产 API 检查显示仍运行原镜像。不得把本次传输计为成功，后续需重新设计可观察、可恢复传输并确认残留。

2026-11-11（应用数据归档隔离恢复）：新增 `verify-appdata-archive.py`，维护机以三项合成正反测试覆盖普通文件、目录、路径穿越、绝对路径、符号链接、重复路径、截断及超额；脚本 SHA-256 `197e4711cf746a9b49a2d854fe780dca844b3c4a77092cef9867a88a0de1a65d`、测试 `32d1d7bda5320e4756112d8f0ceccd9719723c652dc1a5250884b4e247e8dbbe`。真实 appdata 密文解密流通过受限检查，结果为 20 条目、14 文件、逻辑大小 4708191 字节；未输出路径内容。新容器使用生产同摘要 PG18 镜像作工具环境，网络 none、只读根、无端口、日志关闭，`/restore` 与镜像卷声明位置均为 tmpfs，容器网络仅 loopback。归档流用 GNU tar 提取并与原归档对照，两个 tar 进程退出 0，恢复目录文件计数 14；此前相同密文已独立完整解密，本次管道未单独记录 age 状态。未独立验证 ACL/xattr 完整性、应用解密或业务及跨源一致性。删除前核对容器 ID、镜像、标签和挂载，按 ID 删除后标签查询无容器、维护机卷列表为空，临时工具与检查脚本已清理。该验证不代表完整系统恢复。

2026-11-11（单表 ACL 差异核查）：维护机以相同快照和占位角色重建无网络 PG18 tmpfs 容器并成功导入，定位隔离端唯一 ACL 为 NULL 的普通表；以名称哈希前缀在事后生产时点匹配到唯一表，未输出表名。生产该表显式 ACL 展开为 8 项且全部授予所有者，没有 PUBLIC 或其他角色条目；隔离端按 `acldefault` 展开也是 8 项，所有者权限名称与 grantable 标志的排序摘要一致，两端所有者名称哈希一致，占位应用角色均无 SELECT。这解释了该表的 NULL/显式表示差异，不证明授权者、其他对象、真实角色成员关系、RLS 或快照时刻一致。容器删除前检查 ID、镜像、标签及 tmpfs 挂载，按 ID 删除后标签查询无残留、维护机卷列表为空，临时 age 已清理。

2026-11-11（ACL 快照真实数据库隔离导入）：维护机创建新容器 `e1106814ef0cd1207c94352f1281701f8fa288bb0ca5202f6a79e8ffe242da44`，检查生产同摘要 PG18 镜像、网络模式 `none`、无端口、只读根、关闭 Docker 日志与三个 tmpfs 挂载；容器网络仅 loopback，PostgreSQL 数据目录挂载为 tmpfs。首次就绪探测未响应，随后就绪；两次 SSH 创建占位角色请求在握手阶段超时，随后确认容器仍运行并通过单独命令创建 `rakazo_app` 的 NOLOGIN/NOBYPASSRLS 占位角色。新密文经 age 解密流入目标容器 `pg_restore --exit-on-error`，恢复进程退出 0；此前同一密文已单独完成解密完整性检查，本次管道未单独报告 age 退出码。隔离目标 public 普通表数 108、其中显式 ACL 非空 107、占位角色具有 SELECT 的表 107；事后生产只读查询分别为 108、108、107。生产可能自快照后变化，ACL 非空差异原因未明，统计不能证明逐项授权或 RLS 等效。容器删除前复核 ID、标签、镜像和仅 tmpfs 挂载；按 ID 删除后标签查询无容器，维护机卷列表为空，临时 age 工具已清理。未恢复 globals、真实密码或角色属性，未验证业务数据、文件、应用启动或跨源一致性；不能视作完整恢复或生产回滚验收。

2026-11-11（生产角色只读计数）：通过生产 PostgreSQL 容器执行只读聚合，非 `pg_` 角色中 2 个可登录、1 个超级用户、1 个具 BYPASSRLS，非登录角色为 0；`pg_auth_members` 共 3 条，含系统角色关系。未输出角色名称、密码哈希或业务数据，不证明备份的角色、成员及权限完整。首次尝试使用 `postgres` 引导角色被拒绝，核查容器配置的 PostgreSQL 用户后只读查询成功；未修改数据库。

2026-11-11（ACL 归档条目计数）：维护机使用临时解包的 age 对新数据库密文流式解密，PG18 `pg_restore --list` 输出经 `grep -c " ACL "` 统计为 127 条，未输出条目内容；临时工具已移除。该计数不证明具体授权正确、完整或可恢复，管道未单独记录各环节退出码；此前对同一密文已独立完成解密和目录可读检查。

2026-11-11（ACL 快照异机解密）：`pre-ip-acl-20261111` 复制进程退出 0，维护机逐项密文校验通过，目录及文件权限收紧至 700/600。使用维护机恢复身份分别完整解密数据库、应用归档至空设备，两个 age 进程退出 0；另外分别管道调用 PG18 `pg_restore --list` 和 `tar -tzf`，消费者均退出 0，未输出业务内容。临时解包工具已清理。首次调用因 PowerShell 引号错误没有执行预期远程命令，另两次管道调用退出 1 且无结果；随后采用独立完整解密及归档读取检查，不能将前述失败计为通过。未实际导入数据库、提取文件或验证 ACL 和业务。

2026-11-11（ACL 快照采集及复制进行中）：生产 ext4 受限暂存区创建 `pre-ip-acl-20261111`，使用脚本 SHA-256 `ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac` 和已有 age 公钥，数据库 `pg_dump` 含 owner 与 ACL，应用数据单独归档；命令退出 0、源端三个校验和通过、快照约 6.6 MiB。维护机目标原不存在，SSH 复制仍在进行，尚无目标端完成、校验、解密或恢复证据；临时脚本和工具目录已删除。采集在线分时进行，不含 globals、配置、Caddy 或其他卷，不是完整一致性恢复点。

2026-11-11（Caddy 生产卷来源只读检查）：生产运行候选 `f63b5cb9e36d7365054ab5dcb5dd35379e92b9946f176cbe4099fe5ff9647b8e` 和守卫依赖 `ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac`，对当前 Caddy 容器、`rakazo-prod_caddydata` 与 `rakazo-prod_caddyconfig` 执行 `--source-check`，身份与挂载时点检查通过，退出 0；审计脚本与目录已删除。检查未读取卷文件内容、未加密或采集，不能证明在线快照一致性、生产采集安全或恢复可用。

2026-11-11（当前应用镜像回滚引用）：复核生产 API、Worker、Web 容器镜像均为 `sha256:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，确认目标标签不存在后创建 `rakazo-rollback:31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，再核对标签指向相同镜像 ID，命令退出 0。未重启容器、切换版本或修改入口；标签不能防止手工删除，不代表业务回滚、数据库兼容或异机恢复已验证。原 SSH 镜像传输仍在进行。

2026-11-11（运行镜像传输续查）：继续等待原传输会话；生产 `docker save` 仍运行，累计写入由约 38 MB 增至约 54 MB。目标导入尚未完成，未获得两端退出码或镜像 ID；本次未重新启动传输，也未执行生产数据采集。

2026-11-11（运行镜像副本进行中）：生产 API、Web、Worker 均运行镜像 ID `31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，维护机操作前可用空间约 23 GiB 且未发现该镜像。已启动生产 `docker save` 经 SSH 流向维护机 `docker load`；只读检查时两端进程仍存活，生产发送进程累计写入约 38 MB，操作未结束，未取得退出码或目标摘要。此过程不包含卷及数据库，不可计为完整恢复点；需等待原会话完成并核对，不能仅因观察超时重新开始。

2026-11-11（globals 合成密码登录）：维护机运行修订版脚本 SHA-256 `ffe2dc66b61fbe68f5c0dcdb2157980e06ac5e1485d10cefca188cf160c3c024`，Bash 语法及 5 项定向测试通过；在无网络、tmpfs 的 PG18 临时容器真实加密恢复合成 globals，确认哈希和角色关系一致、正确密码以目标角色登录、错误密码返回明确的认证失败。脚本与 SSH 退出 0，脚本核对两个容器删除；演练前后卷列表摘要均为空列表摘要，随后标签查询无残留，临时 pin、工具及脚本已清理。密码只通过进程内存和容器标准输入传递，不保证抵御宿主特权观察者或 swap；未验证真实生产数据、持久备份及故障清理。

2026-11-11（globals 合成真实加密恢复）：维护机运行脚本 SHA-256 `5b44902dcd88e6e3db4755f91d08a4d6580d10aa941b49ef30f0e7c364b4a7d2`，使用生产同摘要 PG18.6 镜像和临时解包 age 1.0.0；两个全新容器均限定无网络、只读根、tmpfs 数据目录。合成 globals 的加密、解密及恢复后密码哈希比对和角色成员关系检查成功，脚本及 SSH 退出 0；脚本确认按 ID 删除两个容器，后续标签查询无残留，临时 pin、脚本和工具已删除。演练前后 Docker 卷名称列表摘要均为空列表摘要，仅证明两次观察一致。未保留密文、验证实际密码登录、生产数据、一致性、Docker 故障或异常终止清理；不能视为完整备份恢复。

2026-11-11（globals 启动与临时工具）：维护机以临时主机 pin 启动旧摘要 `6d57c5c0b0242ba83bc884699672520514b474cd501dfa7f2b8bba1599361b62`，封存及 daemon 守卫通过后因系统 age 缺失退出 1；事后确认 pin、脚本已删除且无带演练标签的容器。新版脚本 SHA-256 `5b44902dcd88e6e3db4755f91d08a4d6580d10aa941b49ef30f0e7c364b4a7d2`、测试 `8b4dd191e1f5cb2e4f36a661a259463eb82c4d2c8e8c4329760848329c4fa6de`，维护机 Bash 语法检查与 5 项定向测试通过；包括实际临时解包 age 1.0.0 路径通过、可写文件、符号链接和可写目录拒绝。临时软件包、工具及测试文件已移除；未执行新版完整候选、加密数据库恢复或故障注入，路径检查与执行之间仍依赖可信 root。

2026-11-11（备份恢复目标基线）：SSH 只读核对生产 Compose 容器：API、Web、Worker、PostgreSQL 显示 healthy，Caddy 在运行；生产当前应用镜像 ID 为 `31167f6506ee1e39f91dfc6435c1530e806426b2b586dcc168ada1fefeafb404`，标签所指 revision 为 `1993995e572fd4235c7684c533db23eb6cf0554e`。现有应用回滚标签 ID 为 `59ddeb7193b9fa63531dafb759752124c9cd391f603210668d84cde1d09692d2`，revision 为 `1494048fbfac551a6401ec059c80fc95f418156e`；未验证该旧版本的数据库兼容性。运行挂载包括 PostgreSQL 18 卷及只读旧 PG16 卷、应用数据、Caddy 两卷和 Web 资源卷；目录大小分别约 80 MiB、4 KiB、4.6 MiB、64 KiB、12 KiB 和 179 MiB。维护机确认部分快照文件存在、根盘约 23 GiB 可用；这不是备份完整性或恢复验证。一次本机 PowerShell 引号错误未执行预期远程盘点，随后拆分命令成功。

2026-11-12（手机回复延迟续查）：只读统计最近 48 小时 5 次用户触发运行，排队约
30–70 毫秒；一个慢例服务端首次可见回复约 33.83 秒，总计约 33.84 秒，关联模型调用
约 31.59 秒，首次模型输出事件约 31.46 秒。事件可能是思考、工具调用或文本，不能
等同手机首字；记录未区分客户端，推理等级为空。另一次运行首次回复约 7.69 秒，
总时长约 3475 秒，其中包含等待用户输入，不能当作模型耗时。样本少，不代表整体。
Windows 访问现有域名健康接口三次约 1.76–2.70 秒，容器内访问自身约 2–10 毫秒；
测点不同，不能推断手机网络或聊天请求耗时。静态检查发现订阅建立前状态已置真，
读取超时不覆盖等待响应头；定时轮询的实际调度还受运行状态及先前计时器影响。
未做新设备或模拟连接验证，未部署，生产入口和双端地址未更改。

2026-11-11（手机回复延迟排查）：只读汇总生产 API 最近 24 小时最多 20000 行日志，
5 条模型耗时记录的总调用时间最短 6080 ms、中位数 8629 ms、最长 42452 ms；从模型
开始至首次输出事件分别为最短 6022 ms、中位数 7287 ms、最长 42254 ms。首次输出
事件可能是文本、思考或工具调用，不等同手机可见首字；五条记录未按客户端或用户归因，
样本量小，不能证明某次 iPhone 请求的根因。worker 同范围未发现该计时标记。两次采集
尝试因换行或命令转义出错，最终通过 SSH 以只输出统计值的方式完成，退出码 0；
未记录原始日志、消息内容或凭据。

手机流式偏好代码检查显示：此前无本地值时默认为关闭，实时回复文本可能被隐藏到
最终消息出现；无法读取用户手机实际设置。修改后仅无保存值时默认开启，明确保存的
关闭仍保留。`pnpm exec vitest run apps/mobile/lib/response-streaming.test.ts
apps/mobile/lib/thread-snapshot.test.ts --maxWorkers=1`：2 文件 8 项通过；相关两文件
Biome 及 `git diff --check` 通过。未构建、发布或在真机测首字；该改动不能缩短
模型调用时间，也不证明手机实时连接无延迟。

2026-11-11（staging Caddy 合成回滚复跑）：维护机使用脚本 SHA-256 `35c58c80420e400d4ef40d16d80cfd0d771f800f004cbfacb875569998c30677`，以生产同摘要 Caddy 镜像及合成配置、证书，在无网络临时容器中验证 HTTP/HTTPS 回环、候选 reload、重启及运行态与持久态回滚，进程退出 0。脚本报告按 ID 和名称确认容器移除；随后按演练标签查询无容器，上传脚本已移除。生产 Compose 容器检查中 API、Web、Worker 和 PostgreSQL 显示 healthy，Caddy 显示运行；未做公网业务探测。本次不覆盖真实配置、正式证书、ACME、完整备份恢复或生产回滚。

2026-11-11（手机会话列表背景）：静态检查共享列表行样式及 iOS 滑动容器，相关文件 `git diff --check` 通过；未运行测试、构建或设备验证。浅深色、选中状态及点击、滑动和长按效果待手机实测。

2026-11-11（iPhone 操控规划）：根据已有开源资料及仓库安全规范制定计划；未新增
运行代码、安装依赖或访问设备。免费签名、初次是否需要 Mac、iOS 兼容和本机
执行桥均待实证，不以方案文档代替真机验收。

2026-11-11（PC 消息气泡）：仅进行了代码静态查看和既有问题修订，按用户要求未运行测试、类型检查、构建或格式检查；现有设置测试的过时断言已更新但未执行。此前独立审核发现的颜色问题已修订，最终版本尚未独立复审；透明气泡在复杂背景上的可读性、实际交互和桌面视觉均未验证。

2026-11-11（iPhone 本机控制开源核查）：只读查看 iphone-use-app、OpenMinis/iCTRL
和 TouchSynthesis 的项目说明，记录作者描述的同机控制、侧载和开发者服务条件；
未独立核验代码、签名、兼容性或运行效果。iphone-use-app 声明 AGPL-3.0，TouchSynthesis
仓库许可待核实；实际依赖和版权条件须在引入前审查。未访问用户手机或更改生产。

2026-11-11（iPhone 操控前置只读检查）：Windows 命令查询未发现 `idevice_id`、
`ideviceinfo`、`go-ios`、`ios` 或 `appium`，Node 可用；当前设备列表未显示名称
含 iPhone 或 Apple Mobile Device 的已连接设备。设备可能以其他名称显示，检查不
证明物理上未接线。未安装工具或依赖，未读取设备标识、执行 WDA、截图或发送控制。

2026-11-11（手机发送气泡）：本机运行聊天外观存储、设置界面、发送者颜色与发送反馈四个定向测试文件，共 63 项通过，包含群聊默认用户文本气泡、圆角和透明度调节、背景透明不淡化文字。首次 Biome 命令因 Windows 命令行对括号路径解析失败，改用 Node 直接调用后发现格式问题，修正后 8 个文件检查通过；未进行 iOS/Android 真机、安装包构建、发布或在线更新验证。

2026-11-11（I3 HTTP-01 候选语法）：将修订后的 IP 示例经标准输入送至生产现有 Caddy 执行 `caddy adapt`，使用示例域名、实际公网 IP 和 staging 目录；命令退出 0，生成配置中确认 `tls-alpn.disabled=true`，仍有既有格式提示。该操作仅解析，未加载配置、发起订单或触发挑战；未运行合成路由脚本。合成脚本匹配片段已同步调整。

2026-11-11（手机删除续行）：未运行测试或类型检查；两条新增提示经独立静态复核，七种语言的键各出现一次且未发现明显误译。切服回滚、Space 操作及推送清理为只读代码分析，未连接生产数据库、验证旧版本、执行真实账号删除或设备操作。

2026-11-11（PG18 globals 静态复审）：Carver 未发现确定的内部变量绕过、身份生产者遗漏或秘密落盘路径，但指出完整 Linux 启动、真实 age、Docker 超时与信号清理均缺实测；建议在补齐相关验证前不要运行候选。此次只读审查没有访问服务器，脚本摘要仍为 `6d57c5c0b0242ba83bc884699672520514b474cd501dfa7f2b8bba1599361b62`；结果不等同完整安全验收。

2026-11-11（真实 age 简化管道对照）：主窗口在授权维护机的私有临时目录解包系统仓库 age 软件包，未安装；以合成文本和临时内存身份执行加密、`/proc/self/fd` 身份读取、解密和生产者 `wait`。正常数据、错误身份、生产者退出 37 和截断密文四项均符合预期，命令退出 0，退出处理删除临时目录。未运行 globals 候选、Docker 或 PostgreSQL；该简化对照不能证明候选完整启动、故障清理、密码登录或真实备份恢复。

2026-11-11（Caddy 来源检查返修）：Descartes 报告修正 `python -c` 代码绑定，在维护机通过 20 项定向测试以及无网络合成双卷来源检查和互换反例，合成资源据报告清理。脚本 SHA-256 `f63b5cb9e36d7365054ab5dcb5dd35379e92b9946f176cbe4099fe5ff9647b8e`，测试 `612efdfe0dd778202fb4c9b8e971a206c9c8480f915dcc42e1633a55d9493eb8`。主窗口核对当前文件摘要并检查修订片段，未复跑完整测试或完成独立复审；未在生产执行来源检查或采集。

2026-11-11（本机复验限制）：主窗口尝试在 Windows 运行 Caddy 来源检查测试，初始化时因 Python 缺少 Unix 专用 `resource` 模块退出，未运行任何测试；不影响上条执行者报告的 Linux 结果，但不能将本机尝试计为通过。共享文档 `git diff --check` 通过。

2026-11-11（PG18 globals 续修）：Ohm 报告针对可信脚本启动与 age 身份生产者失败传播的两项审查意见修订；主窗口运行 `python -B infra/compose/pg18-globals-synthetic-drill.test.py`，3 项通过。脚本 SHA-256 `6d57c5c0b0242ba83bc884699672520514b474cd501dfa7f2b8bba1599361b62`，测试 `7639e7b57a4a77cb07a5231479cde5ec8cd357b22aef36f4adb1af57074a30f9`。测试为离线片段或静态检查，不证明 Linux 真实启动、加密、容器及恢复；Carver 正独立复审，未对服务器运行。

2026-11-11（续行服务基线）：12:11 UTC 只读检查时旧域名 `/health` 返回 200，生产 Caddy 容器为 running 且重启计数 0，备份暂存点仍为 ext4 挂载；维护机按摘要确认生产同版本 PostgreSQL 和 Caddy 镜像仍在缓存。未采集卷、修改线上配置或验证回滚。

2026-11-11（侧载更新保护）：工作流修改仅经独立静态审核，未运行测试、GitHub Actions、构建或发布；实际 IPA 与 Expo 变量解析未验证。门禁不验证已有安装包、其他构建路径、更新通道映射或发布内容。

2026-11-11（工作区分页）：仅静态核查 schema 与查询，未新增游标文件、连接数据库或运行跨页验证；时间精度、排序一致性与并发行为未证明。

2026-11-11（手机切服隔离草案）：未运行新增或既有测试；独立静态审查及复审发现多个并发缺陷，部分已修订，切服回滚与登出、旧 Space 回退及取消等待仍在修复。没有设备、网络或真实会话验证。

切服复审补充：队列等待取消的静态问题已针对性修订；复审新发现延迟加载旧地址可能将新服务器凭据发往旧服务器，以及 Space 回退与其他登录方式切换会话的竞态，仍在修复。以上均未经测试。

手机切服后续复审：启动地址及 Passkey、SSO 接线已作修订，静态审核仍指出账号删除确认未绑定初始账号、本地清理失败未报告，以及合法切服失败后的 Space 重试失效；均未视为关闭。新增和既有测试、类型检查与设备验证均未执行。

账号删除续修：确认 scope 和本地清理失败状态已有候选，后续静态复审指出 HTTP 200 非 JSON 可能误判删除成功，以及切服尝试失败后可能跳过已删账号清理；继续修复，尚无运行验证。组合提示翻译及 SSO 重认证交错仍需核对。

删除响应候选复审：静态核对本地 Better Auth 1.7.15 源码，明确删除完成的响应标记与当前候选一致；未调用真实认证处理器。独立复审指出删除失败或待邮件验证时可能未恢复推送；切服失败后本地清理和部分翻译仍未解决。没有执行测试、类型检查、构建或设备验证。

2026-11-11（续行状态核对）：上一轮 Ohm 所接替的 globals 任务及 Caddy 来源检查任务对应的旧子代理会话返回 `not_found`，未假定其仍运行或完成；重新派发。当前 Caddy 脚本和测试摘要分别为 `f5c6a544cb785ff7f3fb2d2c4343a86f69f46eec369ecd0a5676f35d94f661e3`、`047e3563561c6a27df3b431c5d919c7ecd84b879b698db250a8451e6d838988c`，与此前记录的已测试版本不同，须重新审查和验证；未执行生产检查。

2026-11-11（Caddy 快照入口审查）：Carson 静态审查指出当前快照实现将内嵌 Python 与 `sys.argv[0]` 比较，而 `python -c` 的该值为 `-c`，正常入口会在守卫前失败；既有 mock 没覆盖真实入口。已交 Descartes 修复并补正负验证，生产采集继续禁用。

2026-11-11（I1 PG18 globals 合成候选）：Gauss 准备独立合成角色、age 流式加密及恢复演练，允许 PostgreSQL 将合成角色密码哈希保存在隔离容器 tmpfs 中，禁止导出明文或哈希到宿主文件、持久卷和日志。仅 Bash 语法检查通过；脚本 SHA-256 `4d7d3482faf54f82ea04aa0ebab1d86402cd9eeaef4e5328be08da513628cee0`，未运行数据库或加密，独立审查进行中。

2026-11-11（I1 PG18 globals 独立复审）：Fermat 指出外部 `_DRILL_*` 可绕过脚本路径及快照启动；age 解密身份的进程替换生产者不受主 `pipefail` 检查，不能声称所有环节失败均被捕获。已退回修订；此前仅静态检查，未运行合成加密或密码登录。

2026-11-11（I1 Caddy 来源检查合成复验）：Lorentz 报告修订创建结果未知处理和卷名不匹配专用诊断，在维护机运行 11 项定向测试及真实 Docker 合成双卷正常、互换对照通过；按合成标签检查时未发现容器、卷或镜像残留。超时故障仅用 mock，不能排除 daemon 迟到创建。脚本 SHA-256 `640ec83e10cafa413fcf2d3efca39c165e73ab7dabb39b05df057313f0781499`，测试 `5d69839059f36e24f61efbfc74acafc79d87ff56675295bd83e21cf42c2f93b5`，守卫依赖 `ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac`；最终复审进行中，尚未执行生产来源检查或卷采集。

2026-11-11（I1 来源检查最终复审）：Heisenberg 静态确认精确不匹配诊断及未知资源保守报告已修订，但守卫重启仍按路径重新读取脚本及依赖，实际执行内容未绑定审核摘要；已要求修复或落实可验证的固定执行控制。未执行生产来源检查。

2026-11-11（I1 PG18 合成恢复演练）：Gauss 报告通过已配置 strict known_hosts 的授权维护机 SSH，使用生产同摘要 PostgreSQL 18.6 镜像，在无网络新容器中恢复合成角色、owner、schema/table ACL、成员继承和数据，实际读取正例通过；不含 ACL 对照的 schema 和 table 访问均被拒绝。脚本及 SSH 退出码 0；两个容器、临时 pin 和目录据报告删除，演练前后卷名称比较无新增。脚本及封存快照 SHA-256 `fa5cbf271aca0acb70924e4eacf61404fb70fe8ef1c595b482515eda257ac444`。pin 来源为同一可信 SSH 会话，不是独立物理认证；卷名称比较只是两个时点。未验证角色密码、真实 age、生产角色或生产数据恢复。

2026-11-11（I1 Caddy 只读来源检查候选）：Lorentz 在现有卷备份脚本新增经守卫核验指定容器、预期卷名和挂载/FD 的 `--source-check`，报告 Windows mock 定向测试 9 项通过；生产采集入口仍阻断。真实 Docker 合成测试尚未执行，独立复审进行中；该候选未用于生产，时点检查不证明在线一致性。

2026-11-11（I1 Caddy 来源候选复审）：Heisenberg 静态确认参数经守卫传递、源检查仅打开卷根目录和检查身份，不读取文件内容或创建备份；预期卷名须独立提供，且结果只反映时点。复审指出真实 Docker 测试夹具未充分处理创建结果未知，互换负例的通用错误可能误报，已退回补强；未运行生产检查。

2026-11-11（I2 Caddy 持久回滚返修）：Arendt 报告脚本改为隔离 Python 和显式判断、绑定维护机及 daemon 身份、固定执行快照并核对清理；维护机合成回滚重跑退出 0，错误主机、daemon 与网络负例非零，相关容器及临时文件据报告清理。脚本 SHA-256 `a8b98f661d371684d5953545e0a7df4f4c71f1c6ef99138dfd83274dfd66279a`，独立复审进行中；仍依赖可信启动环境，未验证生产回滚。

2026-11-11（I2 Caddy 返修独立审查）：Fermat 确认先前优化选项与守卫问题已针对性收紧，但指出外部预置内部变量和封存 FD 可能跳过预期脚本快照路径；已退回修订。创建结果不确定时保留现场并失败，不等同清理成功；机器标识、初始脚本和系统管理员仍须可信。

2026-11-11（I2 Caddy 启动绕过返修）：Arendt 报告无条件清理外部内部变量并重新封存可信脚本，维护机注入与未知创建负例通过、合成回滚退出 0，脚本 SHA-256 `fc86da19b92a99998dc3be8ad7009c8a28f51059028bb5f05ace093ac7300c4a`。Fermat 静态确认原绕过被封堵，但指出外层进程单独接收 TERM 时未转发给 worker，已退回处理；生产回滚未验证。

2026-11-11（I2 Caddy 信号返修）：Arendt 报告加入监督进程转发 HUP/INT/TERM，维护机正常合成回滚退出 0，向监督进程单 PID 和进程组发送 TERM 的两项对照均退出 143，worker、容器与临时目录据报告清理。两次早期启动因 FD 未继承失败，未创建演练容器；修正后复验。脚本 SHA-256 `35c58c80420e400d4ef40d16d80cfd0d771f800f004cbfacb875569998c30677`；Fermat 静态确认原单 PID 信号转发问题已针对性修复，未独立复跑。监督进程不独立枚举全部后代且等待无总超时；SIGKILL、主机崩溃、Docker 故障及生产回滚仍未验证。

2026-11-11（I1 PG18 候选返修）：Gauss 报告补充创建结果不确定提示、只读根与禁用日志、维护机身份 pin 和有限的网络/挂载核验；仅做 Bash 语法检查，未启动容器。脚本 SHA-256 `b26f319212efe5da354125395cb0fd64893367a35f8d199b2646f6d5d3d7de23`，独立审查进行中；机器身份摘要预置与 PG18 兼容性未验证。

2026-11-11（I1 PG18 返修复审）：Heisenberg 静态确认未知创建结果、只读根/日志和机器 pin 均有针对性修订；Docker 实际匿名卷、隔离和 PG18 运行仍未实测，且发现 Docker CLI 调用无超时，已退回修订。未知结果仍须人工核查，不自动删除无法确认归属的资源。

2026-11-11（I1 PG18 超时返修）：Gauss 报告为 Docker CLI 和守卫检查增加超时；创建或清理超时视为结果未知并保留排查身份。仅 Bash 语法检查通过，未实测超时、PG18 容器或匿名卷；脚本 SHA-256 `085fa185630f63ad311f1ec36060f039310904a2612fa1ea719abd652dd117f0`，复审进行中。

2026-11-11（I1 PG18 维护机身份检查）：通过既有 SSH 别名只读检查发现该别名不是目标机器实际 hostname，候选硬编码别名会导致合法目标被拒绝；维护机 pin 文件当前不存在。已要求修正并复审，未创建身份 pin 或运行演练。当前 SSH 通道与机器标识的关联并非独立物理认证。

2026-11-11（I1 PG18 主机名修订复审）：Gauss 将硬编码值改为经现有 SSH 通道查得的维护机实际 hostname；Heisenberg 核对与上一已审脚本仅该字符串不同。当前脚本 SHA-256 `fa5cbf271aca0acb70924e4eacf61404fb70fe8ef1c595b482515eda257ac444`。本机 SSH 配置对维护机启用严格 known_hosts 校验；安排以此既有授权连接为本次演练信任锚建立临时 pin，不声称通过独立物理渠道认证。

2026-11-11（I1 生产 Docker 守卫只读核验）：以 root 私有临时目录传入当前 Caddy 采集候选及其守卫依赖，SHA-256 分别为 `0c6e98d177b6888c2f374acb336a7c0902792c174002f86e0203cf990b7659c8`、`ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac`；在生产使用 `bash -p ... --guard-check` 输出本机 Docker 身份守卫验证成功，未开启卷采集或读取卷内容。首次传输因 Windows 行尾导致参数不匹配退出 2，第二次外层 base64 报输入错误但守卫输出成功；第三次以忽略行尾的方式重传，摘要与本地一致、守卫退出 0。退出处理清理临时文件，之后同名前缀目录计数为零。结果只证明当时守卫可运行，未证明之后身份不变、备份、恢复或回滚。

2026-11-11（I1 PG18 合成演练候选）：Gauss 基于已有 PG16 脚本新增固定 PG18 镜像和父目录 tmpfs 的独立候选及说明，报告仅做 Bash 语法解析，未执行容器或数据库；脚本 SHA-256 `810d37fc2ce0a5c8a106cb7791e47c155b95f2c0edb3dae64c8f744158e0387b`。镜像卷声明、隔离及清理正进行独立静态审查，不视为 PG18 恢复已验证。

2026-11-11（I1 PG18 候选独立审查）：Fermat 静态审查指出创建结果未知时单次容器列表不能排除迟到创建或匿名卷残留；容器可写层和日志可能落盘，daemon 守卫也未绑定维护机。实际网络与嵌套挂载状态仍受信任边界限制。当前版本未通过审查，未执行，已退回修订。

2026-11-11（I2 Caddy 合成持久回滚）：Arendt 报告维护机以生产同摘要镜像、无网络容器、合成配置和证书验证 reload、重启恢复启动环境、持久候选配置及恢复运行态和持久态后的再次重启；HTTP/HTTPS 回环断言通过，修正一次传输行尾问题后整体退出码 0。执行者报告容器和临时目录均已清理；脚本 SHA-256 `fed3504ee1eb7a944f78609897c13290c4ff93e65cd073f70b84894afd90d311`，独立复审进行中。未验证真实证书信任、生产 Compose、ACME、生产重启和业务回滚。

2026-11-11（I2 合成持久回滚复审）：Fermat 静态发现 Python `assert` 可能被优化选项禁用，Unix socket 格式不能证明目标 daemon 身份，普通 Bash 与 PATH 也未建立可信启动边界；清理未重新确认容器消失。演练结果仅在其实际环境成立，不证明脚本能安全泛用；已退回修复，生产回滚仍未验收。

2026-11-11（I1 globals 设计续修复审）：Gauss 扩充合成恢复设计并增加非特权 Bash 及恢复参数拒绝测试，报告 Windows 5 项中 4 项通过、1 项因平台跳过；Fermat 静态复审确认受保护的帮助之外仍全部拒绝运行，未发现实际采集或恢复入口。脚本 SHA-256 `8d47e78af640a621b8621245fa83ce54e89b38acacbbbdb4113f9d3f694e16cf`，测试 `f0e97a7ef72eee22d84d9969a53a61778351c12a7786f69eb5d42699120093ba`。未验证真实 globals、加密或角色恢复。

2026-11-11（I1 Caddy 合成恢复初验及复审）：Peirce 报告在维护机自建合成数据、未加密 tar 和目标目录，比较目录、内容、数值所有权、权限、ACL、xattr 与链接，并用五类变更作负例；不接受外部归档，未测试真实卷或 age。Fermat 静态复审指出独立网络命名空间不等于无网络、Python 启动环境不受控和 `os.walk` 遍历错误可能被忽略，已退回修复；此前报告不能视为隔离和完整比较验收。

2026-11-11（I1 Caddy 合成恢复返修）：Peirce 报告要求 Python 隔离启动、增加接口/地址/路由与能力检查，以及目录遍历失败传播；维护机自造双卷恢复、启动注入和真实不可读目录负例通过。脚本 SHA-256 `e42304e2ecb35b6e4c42058c35a1e53f6f9a4a0df777473e2940f0fe15eff6ef`，独立复审进行中。启动器和特权环境须可信，网络状态检查不排除特权进程后续变更或 Unix socket 通信；未验证生产数据或 age 恢复。

2026-11-11（I1 Caddy 合成恢复最终复审）：Heisenberg 静态复审未发现上述三项修订的新确定性阻断；网络检查只证明检查时状态，不覆盖 Unix socket、继承连接或后续特权修改，启动链仍须可信。维护机结果为执行者报告，未独立复跑，实验仍仅限未加密合成 tar。

2026-11-11（I1 Caddy 合成采集候选）：Lorentz 新增只使用自造目录的 CLI、测试和说明，报告 Windows 离线测试 5 项通过；该候选不连接 Docker，不代表 named volume、守卫、独立配额或真实恢复，未在服务器执行，独立复审进行中。

2026-11-11（I1 Caddy 合成采集候选复审）：Fermat 指出包装器中断可能遗留采集器独立 session 的加密子进程、归档目录元数据未核验及相关负例缺失；已退回修复。现有测试为 mock 或内存夹具，不能证明 Linux 实际加解密或完整进程清理，采集器的 synthetic 标志也不证明其输入是合成数据。

2026-11-11（I1 Caddy 合成采集返修复审）：Heisenberg 静态确认 CLI 采集入口保持阻断、目录元数据校验及负例已补齐；但测试控制器自行安装 SIGTERM 处理器，候选代码没有等价处理，不能证明默认信号下进程组清理可靠。`--help` 可正常退出 0，但不启动采集；当前不可解除阻断。此候选不具备 Docker 卷或生产能力。

2026-11-11（I1 合成采集本机复验）：主窗口运行 `python -B infra/compose/caddy-synthetic-collection.test.py`，6 项中 5 项通过，Linux 进程用例在 Windows 跳过。该结果不消除信号处理复审缺口，不代表真实加密或生产采集通过。

2026-11-11（I2 合成演练镜像准备）：生产运行的 Caddy 镜像 ID `sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d` 经二进制流复制到维护机 Docker 镜像缓存，两端命令均退出 0，目标报告相同 ID。镜像不包含生产数据卷；未由此验证生产代理配置、重启或回滚。

2026-11-11（生产及维护机续查）：只读核对时生产 PostgreSQL 容器运行镜像为 PG18，固定镜像摘要 `edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6`；维护机镜像列表只显示 PG16 标签，但按摘要查询确认该 PG18 镜像已缓存，镜像标明版本 18.6 和 `/var/lib/postgresql` 卷。生产备份暂存 ext4 文件系统仍挂载且可用约 445 MiB。Arendt 报告 Caddy 运行态与当前文件适配结果一致、现有服务健康及旧域名健康响应 200；该时点检查不证明重启持久性或生产回滚。未修改生产服务或访问数据库内容。

2026-11-11（IP 签发等待）：本轮代理与手机检查为只读静态审查，未核验当前线上访问策略或原生 fetch 对重定向的实际行为。IP 示例仅添加提示，未运行测试或应用配置；手机地址子项正在实施，不代表已验证。

侧载更新核查：仅静态检查构建、更新工作流和配置，并参考现有文档；未执行构建或发布，也未验证 Expo 环境变量优先级、通道映射或产物最终地址。

手机地址子项：新增和修改的地址、探测及响应元数据用例均未执行，七语言提示未做运行检查；独立静态审核及两轮复审后未发现新的确定性缺陷。原生 fetch 重定向、响应 URL 格式、请求头保护和设备交互均未验证，响应到达后的检查不能证明跳转前未泄露头信息。

2026-11-11（I1 Caddy 复审补测）：Averroes 报告维护机 15 项测试通过，补充受保护 Bash 启动对照、真实 Docker 合成互换挂载拒绝及候选入口受限无副作用断言；正常合成双卷与 age 解密对照通过。脚本 SHA-256 `0c6e98d177b6888c2f374acb336a7c0902792c174002f86e0203cf990b7659c8`，测试 `4a857ed8b6b7147f0c3d4955872976345ad2ddf36b9e68df040c95c974b9a4c5`，守卫依赖 `ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac`，执行者报告与维护机副本一致；最终独立复审进行中。真实生产卷、恢复、容量隔离及在线一致性仍未验证。

2026-11-11（I1 Caddy 补测复审）：Fermat 静态确认真实 Docker 互换用例设计有效，但发现候选阻断 mock 测试的 `sys.argv` 形态与实际 `python -c` 入口不一致，可能误报不调用采集函数，已退回修订。普通 unittest 不等于执行独立 Docker 子测试；直接 shebang 和真实 bind mount 别名仍缺覆盖，生产入口继续硬阻断。

2026-11-11（I1 Caddy 阻断测试返修）：Averroes 报告已按实际 `python -c` 参数形态修订 mock 测试，并补充守卫与被监控函数的正向对照；维护机 15 项测试通过，当前测试 SHA-256 为 `09be2e18fca2b14a41f7a0532e4e564af980696386029c43ed0af76f78bc4178`。Fermat 静态复审确认修正参数形态的问题；该测试仅监视列出的四个名称及临时工作目录，不能证明不存在其他副作用。本轮未单独重跑真实 Docker 互换路径。

2026-11-11（I1 globals 测试最终复审）：Fermat 静态确认三个伪工具各有 PATH 正向对照，解决此前提出的该测试缺口；测试仅覆盖选定调用及伪工具，不证明所有可能副作用。维护机 4 项通过为执行者报告；实际 globals 备份仍未实现。

2026-11-11（I1 固定合成权限演练）：Goodall 新增 `infra/compose/pg16-acl-synthetic-drill.sh` 和运行说明，报告在维护机复跑七项断言及不含 ACL 对照通过，脚本和 SSH 退出码为 0，两个合成容器确认删除；语法检查通过、多余参数返回 2。首次重跑因 Docker 消耗脚本输入失败，修正后复验通过。当前脚本 SHA-256 为 `ec3588b7f0940312be59c14ddbd4bf2cb3cfab7b06a86300d775aaa7beeae61e`，独立审查进行中；PG18、密码、真实加密和生产恢复均未验证。

2026-11-11（I1 固定演练独立审查）：Heisenberg 指出该脚本未绑定 Docker daemon 身份，清理时将任意 inspect 失败视为不存在，普通 Bash 和继承的 PATH、Python 优化选项也可能干扰隔离检查；此外结果为权限函数断言而非实际登录访问，断言消息先于清理。此前零退出码及执行者的清理报告不能消除这些缺口，已交修复；修复复验前不应复用该脚本。

2026-11-11（I1 固定演练返修）：Goodall 报告增加 Docker 监听端及进程身份核对、清理确认、可信启动、隔离 Python 和清理后成功标记；维护机合成 PG16 七项断言、读者实际读取正例与排除 ACL 对照拒绝通过，最终退出码 0，两个临时容器据报告清理。对照中的实际读取因 schema 权限被拒绝，不能单独证明表级权限拒绝；脚本 SHA-256 为 `d9da1d1efa50bf07ca7fe5d8f2946cf580a53ba5b62cdd94ae194a720f9b9675`。未注入 Docker 中断或清理故障，systemd 共享监听器、特权并发操作、PG18 与生产恢复仍有限制；独立复审进行中。

2026-11-11（I1 固定演练返修复审）：Heisenberg 静态确认五项问题均有针对性修订，但指出重启脚本时仍按未验证可信所有权和父目录的路径重新打开，存在替换风险；表级访问负例仍被 schema 权限提前拦截。已退回继续修复；未独立复跑，不能将本次静态复审视为生产恢复或安全验收。

2026-11-11（I1 固定演练二次返修）：Goodall 报告脚本逐级校验 root 所有且不可由组或其他用户写入的文件路径，并将读取内容封存于内存快照供守卫重新执行；维护机不可信祖先和符号链接负例被拒绝。合成 PG16 复验报告正向访问通过，对排除 ACL 的目标补授 schema USAGE 后，实际读取仍因表权限被拒绝；两个容器据报告清理，整体退出码 0。脚本 SHA-256 `074e2deb054158e3134dd09b8e073d5590b5896009f8a6f9b5984a406df6b87a`；初始执行环境仍须可信，路径替换竞态、特权并发、PG18 和生产恢复未验证，独立复审进行中。

2026-11-11（I1 固定演练二次复审）：Heisenberg 静态确认快照封存及表级拒绝对照，但指出 `abspath` 在检查前折叠原始路径的 `..`，可能使守卫和初始 Bash 检查不同路径；已交修订。快照不能追溯证明初始 Bash 读取的文件，初始脚本和环境仍必须可信。

2026-11-11（I1 固定演练路径返修）：Goodall 报告规范化前拒绝原始路径的 `..` 组件，维护机对应负例退出码为 1；合成 PG16 的正向访问、schema 与 table 拒绝对照复验通过，两个容器据报告清理，整体退出码 0。脚本及封存快照 SHA-256 `f0f70db5591866fe763957aedd4d09b6ad8fd7b55b9ba381b60ecd093dec56d0`；Heisenberg 静态复审确认原 `..` 问题已针对性解决，未独立复跑。初始脚本和系统环境仍须可信，未验证生产恢复。

2026-11-11（I1 Caddy 候选返修）：Averroes 报告绑定受信的预期卷名、修正合成双卷索引并明确 Bash 启动限制；维护机 Bash 语法及 15 项合成测试通过，真实 Docker 无网络合成双卷与 age 内容验证通过，随后新增启动环境测试并重跑 15 项。当前脚本 SHA-256 为 `a64b468c0af48e5ea086340d1b04fe477a3874fc5215e7f359760567fc59a25a`，测试为 `fc1b30636dffa5c039b659eb82d190904c1fb82816f15522567072cb9283da4c`；当前文件独立复审进行中。不同挂载同设备的保守拒绝可能误拒绝；未验证真实生产卷、完整恢复、独立容量与在线一致性，入口保持禁用。

2026-11-11（I1 Caddy 候选复审）：Heisenberg 确认预期卷绑定和双卷索引已针对性修订、入口仍阻断；指出尚缺可信启动正向对照、真实 Docker 互换负例和阻断无副作用验证。复审仅静态检查，报告的 Docker 测试时间先于最后一次测试文件修改，守卫依赖摘要也未固定，不能据此认定当前完整链路通过；已退回补测。预期卷名未来必须来自独立可信配置，合成入口仍依赖继承的 PATH。

2026-11-11（I1 数据库权限合成复验）：Goodall 报告修正输入换行后，在维护机两台无网络 PostgreSQL 16.15 临时容器重跑，正常 custom 归档恢复的表和 schema owner、权限、继承、角色成员及数据七项断言通过，`--no-privileges` 对照未恢复 SELECT，脚本和 SSH 退出码均为 0；两个容器经身份核验删除并确认不存在。角色恢复仍使用同名引导管理员并过滤其已存在的创建语句；未验证 PostgreSQL 18、密码、真实 age、现有备份脚本完整执行或生产恢复。

2026-11-11（I1 globals 阻断测试）：Banach 更新仅供审查的合成演练设计并报告 2 项阻断测试通过；主窗口在 Windows 再运行 `python -B infra/compose/backup-postgres-globals.test.py`，2 项通过。Fermat 独立复审发现普通 Bash 在脚本阻断前会执行 `BASH_ENV`，帮助中的 `cat` 也可被替换；原测试不能证明所有调用无副作用，已退回修复。测试不证明实际隔离、加密、恢复或生产可用。

2026-11-11（I1 globals 启动修订复审）：Banach 将可信直接启动设为 `/bin/bash -p`、帮助改用内建命令并说明普通 Bash 的预执行限制；Fermat 报告在 `bash -p` 与普通 Bash 的输入对照中分别观察到拒绝和执行 `BASH_ENV`，未发现新生产采集路径。Windows 测试报告 3 项通过、1 项因平台跳过；三种假备份工具的正向对照及维护机直接启动测试仍在补充。`-p` 不保证防御所有启动环境风险，采集仍未实现。

2026-11-11（I1 globals Linux 复验）：Banach 为三个伪工具增加 PATH 正向对照，在维护机私有临时目录运行 4 项测试全部通过，包括赋予执行权限的远端副本直接 shebang 启动；临时目录据报告已清理。首次尝试因传输行尾问题未运行测试，修正后通过。脚本 SHA-256 为 `030eb0b1fb68ac43c183abef5f72914fa938fa4914bbdcfd90bf4167c3f408e6`，测试为 `b43a2de53bb2b74bc824648f7c8a5df8d8b151b678dc76430ff7c6925c127f29`；最终复审进行中，未连接数据库或验证真实加密恢复。

2026-11-11（I1 数据库权限合成演练中途结果）：Goodall 报告在维护机六个无网络 PostgreSQL 16.15 临时容器中使用合成角色和数据；先导入经演练专用处理的角色后，目标表和 schema owner、表 SELECT、schema USAGE、角色成员与合成数据断言得到预期结果；以 `--no-privileges` 导出的对照未恢复表 SELECT。不同引导管理员的首次全局角色导入曾因授权者 ADMIN 权限失败；最终演练去掉已存在的同名引导管理员创建语句，不构成通用恢复方案。两次包含断言的整体脚本末尾出现输入结束符或回车错误，退出码为 1，已要求修正后重跑；执行者报告六个容器均经身份核对后删除。未验证 PostgreSQL 18、当前备份脚本完整执行、age、角色密码、表空间或生产恢复。

2026-11-11（恢复说明修订验证）：Heisenberg 独立复审指出原修订仍未明确授权重建、globals 和 `--no-owner` 的限制，且脚本成功消息容易误认为已恢复；主窗口据此补充说明、拆出启动步骤并调整消息，最终静态复审未发现新阻断。`git diff --check` 通过；本机 `bash -n` 因 WSL 内无 `/bin/bash` 未运行成功，随后将脚本文本经标准输入送至维护机执行 `bash -n`，退出码 0。未执行归档检查或实际恢复。

2026-11-11（I1 再次独立复审）：Fermat 只读复审发现候选未将两个挂载目标绑定预期卷名、真实 Docker 合成测试写入循环复用索引，以及非 `bash -p` 启动时 `BASH_ENV` 可在脚本检查前执行；不同挂载同设备的保守拒绝也可能误拒绝无关目录。未运行 Docker 测试，已交修复，生产入口保持禁用。Heisenberg 只读核对确认旧生产归档缺少 ACL、现候选版本尚无真实权限恢复证据、globals 仍硬阻断，且数据库级权限和角色密码须单独验证。

2026-11-11（旧入口只读检查）：SSH 查看时生产共有 8 个运行容器，`certbot.timer` 为 active，旧域名 HTTPS 返回 200；本机通过服务器回环检查到该域名证书有效期至 2027-02-03 01:42:34 UTC，SAN 仅含旧域名。未触发续期、检查全部业务、修改配置或证明续期部署链路。

2026-11-11（I1 数据库候选独立审查）：Epicurus 确认移除 `--no-privileges` 的方向，但发现 custom 格式导出时 `--no-owner` 不改变归档 owner，脚本元数据误写为无 owner；globals 草案要求不保存角色密码哈希，也与完整认证恢复目标不一致。已交 Jason 修正，真实 ACL 恢复尚待验。

2026-11-11（I1 完整卷候选第三次独立审查）：Socrates 复审发现输出路径以 bind mount 别名指向输入卷可绕过字符串排除；共享磁盘 reserve 检查不能保证容量隔离，重复失败残留可能累积；顶层 Bash 的 `BASH_ENV` 在脚本内清理之前运行，合成双卷同内容亦无法发现互换。已交执行者修复；真实生产入口继续硬阻断。

2026-11-11（I1 数据库 ACL 修订候选）：Jason 报告手工备份的 `pg_dump` 移除 `--no-privileges`，模拟参数测试、9 项 guard 及 Shell 语法通过；真实 PostgreSQL ACL 恢复尚未验证，已安排维护机合成演练。新增 globals 脚本目前为硬阻断草案，未实现角色采集或真实恢复，不能用于生产。

2026-11-11（I1 完整卷候选合成演练）：Erdos 报告维护机 Bash 语法和 13 项合成测试通过，随后以无网络合成容器、专用 named volumes 及临时真实 age 完成双卷采集、解密和内容检查；执行者报告容器、卷及临时镜像清理命令成功。容器仅模拟 Caddy 标签，没有使用真实 Caddy 容器或生产数据；输出目录、daemon 守卫和完整代码正在独立复审，生产入口仍硬阻断。

2026-11-11（数据库权限恢复独立审查）：Epicurus 只读核对当前备份脚本参数，确认使用 `--no-privileges`，已有快照不足以恢复对象授权；全局角色备份也无法补回缺失的数据库对象 ACL。隔离恢复必须使用独立临时 PostgreSQL 集群，避免修改维护机集群级角色；角色和数据库分时采集不保证一致。本次未运行真实角色备份或恢复。

2026-11-11（数据库角色只读核查）：生产 PostgreSQL 中 `rakazo_app` 当时为可登录、非超级用户且不具备 Bypass RLS；此前隔离恢复演练创建的是不可登录替身，因此不能把演练视为角色认证、授权或完整恢复验证。未读取密码、角色成员或业务数据。

2026-11-11（I1 完整卷组件二次审查）：Socrates 审查修订快照，确认环境、临时输出和 FD 身份等有所改进，但发现 guard Python 子进程未隔离工作目录、候选函数未强制输出目录信任/排除源内输出，以及后代清理和发布前余量检查缺口；已交 Erdos 修复。生产入口仍硬阻断；前后挂载检查不证明期间无短暂变化。

2026-11-11（I2/I3 静态审查）：Epicurus 对示例及官方资料的只读审核指出，普通路径 308 不能证明真实 ACME HTTP-01 失败；Caddy reload 的配置适配环境与容器下一次启动环境可能不同，生产回滚须同时覆盖运行和持久状态。本次无服务器访问、签发或测试。

2026-11-11（I1 完整卷组件返修）：Erdos 报告针对环境注入、失败残留、FD 身份和根挂载问题修订后，维护机使用模拟 Docker、合成目录及真实 age 测试 11 项通过；生产入口仍硬阻断。Docker daemon 守卫、输出目录 FD 端到端接线及真实 Docker 合成演练未完成，Socrates 正复审。

2026-11-11（I5 静态检查）：屏幕导航、组件及代理响应的 6 个文件 Biome 检查退出成功；`computer-screen.test.tsx` 保留一处既有字符串拼接提示，未顺带修改。

2026-11-11（I1 完整卷候选首次独立审查）：Socrates 审查硬阻断状态的组件快照，发现环境和 PATH 可影响 tar/age、失败密文使用正式名称、检查的卷与实际 FD 未绑定等 P1 问题，以及根挂载识别与等待清理不足；已交 Erdos 修复。该结果不代表当前入口可用于生产。

2026-11-11（I5 Android 原生边界研究）：Epicurus 静态研究现有 Android WebView 及本地模块，确认当前 JS 回调超时放行且消息桥不向 JS 提供主 frame 身份；专用原生视图及 AndroidX 安全消息接口为候选，均未实现。不能仅凭原生导航回调声称阻止所有 POST、重定向或网络请求；需隔离服务和不同设备实测。

2026-11-11（I1 完整卷候选组件）：Erdos 报告在维护机以合成输入和临时真实 age 测试 8 项通过，覆盖身份不符、嵌套挂载、输出不覆盖、空间不足及单归档超限；候选入口硬阻断，未采集实际卷。尚无两卷合计限额、Docker daemon 身份及完整前后复核，Socrates 正独立审查；报告不代表生产备份可用。

2026-11-11（I5 应用注入验收缺口）：Jason 只读检查现有完整应用测试后确认，实际 `createApp` 到认证屏幕路由需要隔离 PostgreSQL、账号/Bot/电脑数据及应用初始化；现有测试分别覆盖配置解析和路由，但未实证完整应用注入。本次未启动数据库或新增仅重复实现的 mock 测试；后续需在受授权隔离环境补验。

2026-11-11（I1 完整目录合成实验）：Erdos 报告维护机以临时解包 age 运行 Bash 语法及 3 项测试通过，合成归档恢复检查覆盖文件、空目录、数字所有权、ACL 和用户扩展属性。现有脚本仅提供自生成的合成模式，未核验 Docker/卷身份、挂载或真实容量，不可用于生产；完整卷候选正在实现。

2026-11-11（I1 能力集修订独立复审）：Socrates 对照实际文件摘要复审，认为先前 ambient capability 检查缺口已针对性处理，未发现该修订新的确定性阻断；未独立访问维护机或复跑。真实带特权的负向测试、独立 PID/内存配额、另一架构及生产卷恢复仍未验证。

2026-11-11（I1 嵌套挂载合成实验）：Erdos 报告维护机隔离测试发现 GNU tar 的 `--one-file-system` 仍会跨入同一文件系统上的嵌套 bind mount；临时挂载和目录已由执行者清理。该选项不能单独作为生产防嵌套挂载保障；完整卷采集脚本尚未交付。

2026-11-11（I1 能力集修订复验）：Kuhn 根据 Socrates 复审增加真实/有效/保存 UID 与 inheritable、permitted、effective、ambient 能力集检查，并在 exec 前设置及验证 no_new_privs。维护机 nobody 运行 20 项全部通过（含真实 age 合成加解密、exec 后能力状态）；被测工具 SHA-256 为 `db933fed80b5490d82125db9a0c9da0ddf81d4a0168e4574305a4198b9bfb233`，测试为 `6bcbdde7a3ec05748a491f20adfbdd00318a43ecf4389720ec75fea22efd81f4`。退出处理清理合成目录；独立复审进行中，仍不证明生产卷采集、独立资源隔离和恢复。

2026-11-11（I5 来源配置复审）：Epicurus 静态复审确认严格 HTTPS 来源解析、依赖注入和两个签发路由，未发现请求头直接决定代理来源；指出 Web/桌面将 noVNC 地址改写至页面来源，分源配置需要页面来源的代理支持，完整应用启动与 Compose/真实代理仍待验收。导航比较改为完整规范 URL 后，两文件 73 项测试通过；真实设备及严格 query/hash 对重连的影响仍未验证。

2026-11-11（I5 屏幕来源配置候选）：Jason 报告环境解析、电脑路由及能力缓存定向测试 51 项、API TypeScript 和 Biome 检查通过，覆盖来源配置、屏幕与终端、伪造转发头和缓存来源隔离；独立复审待结果。未启动真实服务或数据库，未检查部署后的路由、真实证书或手机访问。

2026-11-11（I1 第二轮失败修复）：Kuhn 将目录偏移测试改为显式非零偏移及 `dup` 负向对照；维护机 nobody 以临时解包的真实 age 重跑全部 15 项，逐项显示通过、无跳过，包含目录偏移、线程及真实加密解密。临时合成材料由退出处理清理；生产卷、恢复器和真正独立资源配额仍未覆盖，安全复审进行中。

2026-11-11（I5 导航收紧复验）：屏幕导航在 origin 与路径之外增加原始查询参数匹配，防止通过改写 `path` 等参数改变目标；允许 fragment。运行移动端导航及组件测试 2 文件 72 项通过。潜在提供方重定向兼容性、Android 回调超时和设备实际请求仍未验收。

2026-11-11（I1 第二轮资源修订）：Kuhn 增加加密进程虚拟地址空间、同 UID 任务数限制及独立目录描述符后，维护机 nobody 下运行 15 项 Linux 测试，其中 14 项通过、1 项失败：目录偏移测试假设调用一次目录迭代后偏移非零，实际为零。含真实 age 合成加密解密的其他用例通过；失败已交执行者修复并须重跑。`RLIMIT_NPROC` 为同真实 UID 共用，`RLIMIT_AS` 限制虚拟地址空间，不等同独立 PID 或实际内存配额；生产能力仍未验证。

2026-11-11（I5 Android 复审）：Epicurus 对屏幕 URL 与消息来源静态复审，未发现当前分源保留和路径编码的确定性绕过；指出 Android 的 origin-only 或 opaque 子帧消息仍可能被当成顶层页面消息，且导航 JS 回调超时会放行。现有测试不能证明该边界安全；屏幕 origin 仍依赖服务端配置，IP 访问需另行实现及验收。

2026-11-11（I1 合成备份修订复验）：维护机 nobody 用户运行修订版 12 项 Linux 测试通过；另外临时解包系统仓库 age，用临时身份对合成目录真实加密，再解密到内存并检查 tar 条目和内容，未发现合成明文出现在密文中。临时工具、合成密钥与文件由退出处理清理。测试不覆盖生产卷、离线恢复目标、ACL/xattr、完整资源隔离或原子一致性；Socrates 正进行独立复审。

2026-11-11（I5 整合复验）：执行 `pnpm exec vitest run apps/mobile/lib/computer.test.ts apps/mobile/lib/computer-refresh.test.ts apps/mobile/lib/screen-navigation.test.ts apps/mobile/lib/computer-screen.test.tsx packages/core/src/node/screen-proxy-response.test.ts --maxWorkers=1`，5 文件 168 项通过。屏幕代理上游 HTTP 响应新增 `Referrer-Policy: no-referrer`；Epicurus 复审确认上游大小写变体被覆盖，同时指出恶意页面仍可能主动发送 URL，该头也不覆盖代理本地产生的响应或 WebSocket 握手。精确路径导航的 JS 回调在 Android 超时可能放行，不能视为原生安全边界；真实 iOS、Android、分源及屏幕代理链均未验证。

2026-11-11（Caddy 卷合成草案）：Kuhn 新增仅限非 root 合成实验的工具及测试；主窗口将文件送至维护机私有临时目录，以 nobody 运行 Linux 测试 9 项通过，退出处理清理临时目录。测试使用合成内容和假加密程序，不证明真实加密、生产容量、卷识别或恢复。Socrates 静态审查发现子进程后代清理和目录项未及时限额等问题，已交 Kuhn 修复；在修复复审前不能用于生产。

2026-11-11（I5 中途联调）：主窗口收紧屏幕导航路径后，移动端两文件测试一次出现 1 项失败：另一执行者正在同步修改 URL 来源兼容策略，组件测试仍按原改写行为断言。待修改完成并对齐契约后重跑；此中间结果不视为通过。

2026-11-11（I5 屏幕安全候选）：Jason 报告 URL 相关三个测试文件共 150 项及 Biome 检查通过；主窗口运行 `pnpm exec vitest run apps/mobile/lib/screen-navigation.test.ts apps/mobile/lib/computer-screen.test.tsx --maxWorkers=1`，2 文件 72 项通过，含 mock WebView 的同源及跨来源/降级导航断言。独立复审正在进行。测试不证明 iOS 或 Android 的真实导航、混合内容、WebSocket、第三方来源兼容性及代理端 Referer 行为；候选尚未部署。

2026-11-11（旧域名续期 webroot 只读核查）：读取 Certbot 续期配置的非秘密字段，认证方式为 webroot，配置的 webroot 目录存在，但其挑战子目录当时不存在；该 webroot 未位于任何运行容器的 Docker 挂载源内。生产 Caddyfile 未发现显式 ACME 挑战路径或 file_server，存在反向代理。首次读取因 Certbot 文件具有无节头字段而解析失败，调整只读解析方式后成功。上述观察提示续期链路需要进一步核实，但不能排除其他转发或实现，也未实际写挑战文件或触发续期。

2026-11-11（Caddy 卷额外元数据只读检查）：在生产主机检查两个卷时，未发现硬链接计数大于 1 的普通文件；使用 Python `listxattr` 对遍历到的路径读取扩展属性名称，未观察到 POSIX ACL 或其他扩展属性，未报告读取错误。目录可能重复计入，检查不是原子快照，也不证明之后不会变化；未读取文件内容，主机没有 `getfacl` 或 `getfattr` 命令。

2026-11-11（sticky 测试修订复验）：Epicurus 首次静态复审指出仅检查失败可能误报；增加同一夹具中输入、输出正向成功对照，直接核对 sticky 模式和预期目录错误，并检查 root 显式可信 UID 不能放行。维护机 root 环境重跑 32 项通过；Epicurus 对修订版静态复审未发现剩余阻断。该测试仍使用合成文件和假 age，仅验证默认拒绝，不代表支持 Caddy 生产路径。

2026-11-11（sticky 目录回归及子代理审查）：将备份脚本及测试通过 SSH 输入流送入维护机 root 私有临时目录，运行 Python 测试共 32 项通过，包含实际 Linux 文件系统上 1777 输入和输出祖先拒绝、无输出残留；测试文件和临时目录由退出处理清理。首次传输因 Windows 命令长度限制未启动 SSH，第二次因输入换行格式导致 base64 解码失败，修正后通过。测试使用合成文件和模拟加密，不证明真实加密或生产卷恢复。Epicurus 只读审查指出 sticky 下的预建条目、文件写权限/ACL 和竞态风险；Kuhn 确认代理测试未覆盖真实 ACME、续期或生产回滚，均未改文件或服务器。新测试复审待返回。

2026-11-11（旧域名续期再核查）：生产 certbot.timer 显示 active、enabled；现有 deploy hook 含 nginx 引用而无 Caddy 引用，nginx 当前 inactive。Caddy 容器运行且重启计数为零；未触发续期或修改服务，不能证明续期文件可同步至 Caddy。

2026-11-11（Caddy 卷与旧数据库卷只读检查）：通过 Docker volume inspect、find 和 findmnt 核对时，Caddy data 卷包含 6 个普通文件、config 卷包含 1 个普通文件，目录与文件均显示 UID/GID 0；每个卷有一个 1777 目录，未发现嵌套挂载。旧 `rakazo-prod_pgdata` 卷目录检查未发现子项，这是检查时的观察，不证明其他数据库存储为空。Caddy 容器未显式设置镜像用户、重启策略为 `unless-stopped`；API、Web、Worker 和 PostgreSQL 当时显示 healthy。未读取证书私钥、备份卷、测试重启或验证真实进程用户；上述状态可随时间变化。

2026-11-11（核心配置隔离恢复）：在维护机 `/dev/shm` 的私有临时目录，从加密归档恢复四个严格限定的常规文件，逐项核对字节数、内容 SHA-256 与归档中的 UID/GID、模式；临时目录退出清理。验证不代表 UID/GID 在目标系统有相同含义，也未检验应用解密、服务启动或跨源一致性。首次恢复尝试在本机命令解析阶段失败，没有触及服务器；随后更正并完成上述检查。

2026-11-11（核心配置备份及失败诊断）：原 `config.age` 和首次失败的 `config-core.age` 未残留；只读元数据检查确认 Caddy 两个卷各有 root 所有、模式 1777 的祖先目录，工具会拒绝此类输入。单独处理四个配置文件时，受控异常分类显示缺失可执行文件，核对确认生产机 PATH 无 age。临时解包系统仓库的 age 后加密采集成功，源及维护机密文 SHA-256 一致，维护机使用现有恢复身份解密并通过 tar 列表读取四个条目；工具临时目录由退出清理。复制命令首次因本机命令行解析失败而未建立目标，复核不存在后重新以二进制流复制。未提取恢复配置、验证内容和权限、应用解密或登录，亦未覆盖 Caddy 卷和其他遗漏材料。

2026-11-11（配置备份工具隔离测试）：独立执行者报告脚本 SHA-256 `60e93dc29a5c3f2a4901a970830b1e2f89b316b452ae71edafb640d85de1ee8c` 在维护机 Linux 上直接测试 26 项通过，测试专用 age 身份和合成配置的真实加密、解密、tar 内容及权限、UID/GID 核对通过；真实输入与输出父目录替换均失败并清理不完整输出。该版本未用于生产，且生产 `/srv/rakazo` 的 deploy 所有祖先目录需要明确可信 owner 支持；工具正继续修订，新版本需再次验证。

2026-11-11（生产部分快照隔离恢复）：第二台维护主机的无网络 PostgreSQL 临时容器首次恢复因缺少角色失败；重建仅供演练的 `rakazo_app` 非登录、非超级用户、NOBYPASSRLS 角色后，`pg_restore --exit-on-error --no-owner --no-privileges` 成功，检查到 114 张用户表。应用归档在 root 限权临时目录解密提取成功，计数 14 个普通文件；临时容器及其匿名卷、提取目录由脚本退出清理。尚未验证表数据语义、角色授权、应用密钥解密、登录、文件内容或在线采集跨源一致性；不得据此称完整生产恢复成功。

2026-11-11（生产部分备份验证）：`pre-ip-20261111T054938Z` 在源与维护机副本分别通过 `sha256sum -c`，维护机可使用受限身份完整解密并通过 `pg_restore --list` 与 `tar -tzf`；未输出业务内容或私钥。归档可读取不等于实际恢复，数据库与文件在线分开采集，未证明跨源一致；配置、应用加密密钥、角色及 Caddy 数据不在此快照。

2026-11-11（配置加密备份草案审核）：独立静态审核发现祖先路径替换、密文输出容量、伪文件大小以及所有权元数据四项缺口，已交回修复；草案未用于生产，尚无真实解密和恢复证据。

2026-11-11（附加卷容量只读核查）：生产旧 PG16 兼容卷约 4 KiB、Caddy 数据卷约 64 KiB、Caddy 配置卷约 12 KiB；这些是 `du` 估算值，不代表目录为空、不证明文件范围或可恢复。

2026-11-11（备份完整模拟回归）：独立执行者报告在第二台维护主机对固定脚本 SHA-256 `251a44f2578fce5bf47fb321a0eb3431ff565e6304a28116d88ba22e5070798f` 完整运行模拟 Shell 测试及 9 项 guard 单测，均通过；输入摘要核验、临时目录清理由执行者报告。模拟不能替代实际生产数据或一致性恢复验收。

2026-11-11（备份身份副本）：第二台维护主机上的专用 age 恢复身份经 SSH 读取到内存，在本机使用当前用户 DPAPI 加密并创建受限权限副本；本机解密后与原内存内容做恒定时间比较成功，未打印密钥。未测试其他 Windows 账户、设备迁移或 age 解密生产备份。

2026-11-11（生产备份材料初查）：只读确认生产环境文件、Compose 文件、Caddyfile 和生产 overlay 存在；环境文件权限为 600，应用数据目录约 4.6 MiB。未读取配置内容或密钥；上述清单尚不能证明覆盖完整恢复材料。

2026-11-11（备份当前版本真实合成恢复）：独立测试固定脚本 SHA-256 `251a44f2578fce5bf47fb321a0eb3431ff565e6304a28116d88ba22e5070798f`，在第二台授权主机使用指定 PostgreSQL 镜像及无网络临时容器，完成 age 加密、校验和、解密和恢复；两条合成数据库记录、两个文件和符号链接核对通过。首次数据库启动和一次恢复就绪检查失败，修正测试环境与等待后完整通过。执行者报告临时容器、测试数据、密钥及临时下载包已清理；本次不证明真实生产数据、配置密钥、跨数据源一致性或系统回滚可恢复。

2026-11-11（备份清理修复复审）：针对收件人临时文件清理失败可能误报成功的问题，脚本改为清理成功后才创建捕获完成标记；实现者报告语法、挂载单测及清理定向测试通过，完整模拟测试因等待被停止，未完成。独立静态复审未发现该修复的新阻断；被测与复审脚本 SHA-256 为 `251a44f2578fce5bf47fb321a0eb3431ff565e6304a28116d88ba22e5070798f`。真实恢复尚待当前版本验证；异常强制终止仍可能留下临时文件。

2026-11-11（Caddy 回滚修订版复验）：独立静态复审确认此前卷清理、按 ID 删除和负向断言缺口已针对性修订；主窗口以脚本 SHA-256 `0fda6524ff15535da55f9e77dd0f176bb1eb52a46566bbff60b57621fe457743` 在服务器无网络临时容器运行，退出码 0。合成 HTTP/HTTPS 路由经候选 reload 改变，管理接口对无效 JSON 返回 400 且两个候选路由仍可用，JSON 快照 reload 后两路由恢复，脚本报告清理完成。未涉及生产配置、生产卷、正式证书、ACME 或生产回滚；异常强制终止清理未验证。

2026-11-11（生产挂载初查）：Docker inspect 中 API 容器挂载目标仅见 `/data` 和 `/run/rakazo-native`；宿主机按 `/data` 源路径进行的一次 `findmnt` 查询未发现其下嵌套挂载。此检查不证明容器挂载命名空间与宿主视图完全一致，不能代替脚本的安全校验或恢复测试。

2026-11-11（回滚脚本审查更正）：独立静态审核指出此前 Caddy 隔离实验对无效 JSON 只观察到重载非零及随后 HTTP 候选响应仍在，尚未证明失败原因一定为 Caddy 拒绝，也未核对该时刻 HTTPS；清理可能遗留镜像声明的匿名卷，且名称检查与删除之间存在竞态。脚本已退回修复，先前“无效 JSON 被拒绝”的表述应以本条为准；实际生产回滚仍未演练。

2026-11-11（备份最新静态审核）：根目录 inode 与容器视图检查已加入，但无法证明容器和宿主嵌套挂载一致；收件人文件在两次加密间也可能变化。已退回修复，真实 Linux 挂载和当前版本恢复尚未复验，不得用于生产。

2026-11-11（Caddy JSON 回滚隔离实验）：实现者报告在无网络临时容器内保存合成运行时 JSON、加载候选配置、用 JSON 恢复原 HTTP/HTTPS 路由，退出码 0；无效 JSON 被拒绝且保留当前配置。自签 HTTPS 使用跳过信任验证，未证明公网证书、ACME、生产回滚或重启后持久性。新增测试脚本待独立审核。

2026-11-11（备份脚本后续复审）：独立静态复审确认先前 stdin 和容器重建检查已补充，但发现宿主机 bind 源路径可能与容器实际持有目录不一致；已交回修复，当前版本尚不可用于生产。只读核对显示生产 API 与 Worker 的 `/data` 同为 `rakazo-prod_appdata` 卷；API、Web、Worker 及 PostgreSQL 容器显示 healthy，此检查不证明备份完整或一致。

2026-11-11（真实 Linux 合成备份恢复）：独立测试固定的备份脚本快照（SHA-256 `7ad5fd5e0d807f6d7edbf21a1e3dcf457893a4945e34ce391fa31a5335939bac`），以无网络 PostgreSQL 容器及合成文件验证 age 加密、校验和、解密、导入另一空数据库和文件内容及 640 权限；这些检查通过。测试发现 `docker exec -i` 可消耗调用方 stdin，已退回修复；测试不覆盖之后的脚本修改、生产数据、ACL/xattr 或跨数据源一致性。测试容器、卷和临时测试密钥已由执行者清理。

2026-11-11（备份 Linux 隔离测试）：独立测试曾启动独立 Docker daemon 和限额临时文件系统，但镜像拉取超时，未运行备份或恢复；测试资源已清理。随后主窗口只读检查确认生产服务器 `/var/run/docker.sock` 的对端进程为 `systemd`，现有候选脚本要求 `dockerd`，因此当前脚本会拒绝该生产环境，需修复并重新审核；不应运行生产备份。

2026-11-11（旧入口续期只读检查）：`certbot.timer` enabled；已发现的 Certbot deploy hook 调用的旧 nginx 服务 inactive。当前 Certbot lineage 和 Caddy 数据卷的域名证书 SHA-256 指纹一致，证书到期日为 2027-02-03；单次指纹一致不证明续期后的同步、Caddy 重载或其他可能机制正常，均未演练。

2026-11-11（手机屏幕后续复审）：实现者报告 Space 选择和输入队列修复相关测试 393 项通过，自动启动状态后续定向测试 69 项通过；独立静态复审确认此前两项 P1 及自动启动 P2 的对应修复，未自行运行测试。真实手机、线上 API 和旧服务端兼容性未验证。

2026-11-11（staging 候选配置校验）：将工作区 IP Caddyfile 示例经 stdin 传入生产同一 Caddy 容器，使用实际域名证书容器内路径、入站 IP 和 staging 目录执行 `caddy validate`，返回 `Valid configuration`。该命令没有 reload 或提交挑战；它不证明公网连通、签发、自动续期、认证或回滚。

2026-11-11（生产切换准备）：只读检查时 API、Web、Worker 和 PostgreSQL 容器 healthy；备份路径与根目录位于同一文件系统，`age` 不在服务器 PATH 中。独立审查确认当前备份草案未完成真实加密、容量隔离和恢复验收，不能因模拟通过视为可安全生产使用。Caddy 运行时回滚快照方案尚未演练。

2026-11-11（ACME staging 订单）：staging 目录公布 `shortlived` profile；创建测试账户并提交 IP 订单返回 HTTP 201，订单状态 pending，包含目标 IP 和一个待验证授权。未发送挑战响应、未验证 IP 所有权、未签发证书；临时账户密钥未保存，不能继续使用该订单，新的测试须另建订单。

2026-11-11（IP 实际示例隔离代理复验）：主窗口在服务器现有 Caddy 镜像、无网络临时容器中运行修订版 `test-ip-proxy-routes.sh`，输入以本机实际示例文件 SHA-256 校验，脚本退出码 0。域名及无 SNI IP 的健康、API、RPC 和 Web 模拟路由通过；两种跨站组合返回 421，未知 Host 返回空 200 且未命中上游；合成敏感标记未出现在访问日志。测试替换了 ACME 和上游，禁用自动 HTTPS，未覆盖真实证书、CA、HTTP/2、WebSocket、生产网络或认证。

2026-11-11（附加来源复审）：实现者报告收紧非规范 IP 后定向测试 80 项通过，含启用 Better Auth 来源检查的隔离 handler 请求；独立静态复审未发现新增来源绕过，未独立复跑。测试不能证明真实登录、合法回调、Cookie 或生产 CSRF 行为，既有 API 与认证来源集合差异仍需按实际配置验收。

2026-11-11（手机屏幕二次审核）：已移除未声明代理地址的隐式改写，并补充在途屏幕请求的 Space 代次检查；实现者报告相关定向测试 424 项通过。独立复审进一步发现已显示画面未随 Space 切换清除、旧原生输入队列未绑定代次，均可能跨上下文保留，已退回修复；本模块尚未通过审核。旧服务端未声明代理的回环地址可能被新客户端拒绝，需做兼容验证。

2026-11-11（认证与备份候选）：实现者报告认证配置定向测试 71 项与相关 TypeScript Biome 检查通过；审查发现非规范 IP 写法和真实认证中间件覆盖仍有缺口，正在修复。备份脚本模拟测试和语法检查通过，但模拟不证明真实 age 加密、Linux 锁与文件限额或 Docker socket 检验；生产备份和恢复均未执行。

2026-11-11（手机屏幕候选）：实现者报告手机相关测试 110 项及 API 屏幕路由定向测试 5 项通过；完整 API 路由测试另有 4 项因 Windows 符号链接权限失败。新旧客户端与服务端的真实组合、真实屏幕和设备尚未验证，独立审核尚未完成。隔离 Caddy 测试的首版曾执行并通过代理断言，但审查发现命名空间与清理风险，修订版仅完成语法检查，不应视为复验通过。

2026-11-11（备份与客户端审查）：独立审查发现现有备份脚本可删除旧快照、无接收者时可能降级明文，且不覆盖应用密钥和完整恢复配置；归档检查脚本不执行真实恢复。只读检查时生产 API 与 Worker 的 `OBJECT_STORAGE_BUCKET` 均为空，不能排除其他外部数据；第二台维护主机具有 PostgreSQL 18.6 恢复客户端和 Docker，未验证隔离恢复。客户端审查指出手机若收到旧域名屏幕地址可能继续使用域名，但仅凭路径不能安全判断来源，正在设计显式代理标识。

2026-11-11（旧备份与镜像补查）：使用生产 PostgreSQL 容器内 `pg_restore --list` 能读出 11 月 7 日数据库备份目录，共 1111 行；旧应用数据 tar 可列出 1 个条目。仅能证明目录可解析，不证明所有数据完整或可恢复。当前 Caddy 运行镜像具有对应摘要的 `rakazo-rollback` 标签；API、Web、Worker 当前镜像标签为应用 `local`，未据此证明历史应用版本可回滚。

2026-11-11（IP 入口续查）：SSH 只读检查时生产 API、Web、Worker、PostgreSQL 容器均显示 healthy；11 月 7 日数据库与应用数据备份文件存在，但未校验完整性、恢复或密钥。检查到多个 `rakazo-rollback` 摘要标签，未验证对应部署版本或可回滚性，故修正此前未发现回滚标签的观察。源码检查确认认证来源由网页来源、认证地址和额外来源组成，密码重置等链接使用网页来源；未进行 IP 登录、CA 申请、备份恢复或服务切换。

2026-11-11（大小写规则复审）：独立静态复审确认合成测试覆盖双侧归一化、旧规则负向对照及跨 Host 用例；实际 Caddy 示例的环境变量展开与代理上游未经该运行测试，复审者未自行运行测试。

2026-11-11（IP 规则大小写对照）：使用生产同版本 Caddy 的无网络隔离测试，双侧 `lowerAscii()` 与混合大小写配置的合成规则对大写域名 SNI 返回域名路由 200，对大写 SNI 加 IP Host 返回 421；旧大小写敏感规则对同一个大写域名请求返回 421。两种模式分别通过断言；这仍不是加载实际代理示例或验证真实证书。

2026-11-11（IP 规则复测）：有序路由及大小写修订后，五种隔离实验模式全部通过；域名大写 SNI 对照返回合成域名路由。测试加载的是简化合成配置，而非示例代理配置，不证明 HTTP/2、真实上游、认证或 CA 证书有效。

2026-11-11（IP 入口规则候选）：以生产同镜像、无网络临时容器和合成证书，五种模式（baseline、default-sni、strict、host-guard-negative、sni-guard）均通过各自断言；`sni-guard` 模式允许合法域名及无 SNI IP，并在两个测试跨站组合返回 421。首次未使用有序 `route` 的 guard 被 `handle` 绕过，测试失败，已调整后复测；示例 Caddyfile 语法转换通过并有格式提示。真实公网、HTTP/2、认证和 CA 签发未验收。

2026-11-11（IP 证书申请预检续）：确认服务器 Certbot 2.9.0，Web 运行 Vite preview；对公网 IP 挑战测试路径进行只读请求，返回 308 到 IP HTTPS。独立审查提出 webroot 与 TLS-ALPN 的条件，未进行生产挑战文件写入、CA 下单、证书签发、续期或真实设备测试。

2026-11-11（IP 证书申请前检查）：公网 IP 的 HTTP-01 测试路径返回 308，跳转到同一 IP 的 HTTPS；Caddy 占用服务器 80 和 443，线上公网 IP 的 HTTPS 在此前检查中握手失败。服务器 Certbot 版本 2.9.0 可用，其 IP 短期 profile 支持未证实；应用容器健康。本轮尚未向 CA 提交订单或申请证书。

2026-11-11（隔离实验复核与修正）：独立审核指出先前实验未充分断言及清理失败未报告；已加强 Docker 本地 socket 检查、清理错误报告和九项矩阵的退出状态、TLS alert、HTTP 状态和响应体断言。复测 default 与 strict 均符合各自观测预期。`host-guard-negative` 是证明站点内部 guard 不覆盖未知 Host 的负向对照，不是安全方案；受 PID 命名空间、异常终止、真实证书及生产网络限制。

2026-11-11（SNI/Host 矩阵）：补充模拟回环 HTTPS 的九种 SNI/Host 组合及路由体断言。`default_sni` 模式下，两个已知 Host 可分别进入各自合成路由（包括跨 Host），未知 Host 为无业务路由的空 200，未知 SNI 无响应；`strict_sni_host` 模式中合法无 SNI + IP 返回 421。该结果仅限自签名、单 HTTP/1.1 模拟场景，不能代表生产授权或 HTTP/2 行为。

2026-11-11（无 SNI HTTP 对照）：在相同隔离条件下重复 `default_sni` 实验，向 IP Host 发送 HTTP 请求获得 200；这是合成测试站点的静态响应，并非生产 API、真实证书或 iPhone 连接。

2026-11-11（无 SNI 隔离实验）：使用 `infra/compose/test-ip-certificate-selection.sh`，无网络临时容器监听自身回环，合成域名与 IP 自签证书；默认模式域名 SNI 返回域名证书，无 SNI 未提取到证书 SAN 且收到 TLS alert；`default_sni` 模式两种分别返回预期证书。首次 Windows 文本管道产生 CRLF 导致脚本结束报错，第二次去除 CR 后基线通过，随后默认名称模式通过。实验未碰生产证书、配置或端口；其回环目标与公网 NAT 拓扑不同，不证明真实 IP 链路、CA 信任或续期。

2026-11-11（现有证书核查）：只读取生产 Caddy 使用的公开证书并检查 subject、issuer、有效期和 SAN；证书 SAN 仅为现有域名，没有 IP 标识。未读取或输出私钥。现有证书不能用作该 IP 的有效身份凭证；没有验证新证书签发。

2026-11-11（IP 配置复核）：更新后 Caddyfile 在服务器现有 Caddy 上再次通过语法转换（格式提示仍在）；将覆盖示例与服务器现有基础 Compose 进行不插值的静态合并检查通过，首次单独检查因缺少基础镜像定义失败，不计作通过。独立审核者另报告在仓库基础 Compose 合并后配置挂载唯一，缺少证书路径变量时拒绝解析；这些检查均未启动新服务或证明证书存在及续期。

2026-11-11（IP HTTPS 草案）：通过 SSH 将示例配置标准输入交给运行中的 Caddy 2.11.4 的 `caddy adapt`，使用文档示例地址和 staging 目录；转换成功，输出结构显示 IP 站点为 ACME `shortlived`。命令仅转换配置，未加载或重启服务；有格式提示，未执行签发、网络、续期或功能测试。独立审核进行中。

2026-11-11（直连入口核查）：服务器侧通过 Tailscale IP 请求 HTTP 健康路径返回 308、HTTPS 握手失败；本机以 SSH 已配置的公网地址访问 HTTPS 健康路径也握手失败。出口 IP 的 443 连接失败，不证明其为入站地址。未进行手机设备连接、IP 证书签发或自动续期测试；只读审核与健康探测不代表完整链路可用。

2026-11-11（M2 离线修复续）：实现者报告两个定向测试文件共 68 项通过，手机包 TypeScript 和指定文件 Biome 通过（另有既有提示）；独立静态复审确认拒绝路径的已报告遗漏已处理。未验收跨进程恢复、iPhone、服务器或实际输入。

2026-11-11（M2 第三轮）：实现者报告 64 项定向测试、手机类型检查和相关 Biome 通过；独立静态复审仍发现发送失败后复核缺口及进程终止后的恢复风险。未执行真实设备、服务端或进程崩溃恢复验收。

2026-11-11（M4 离线复审）：实现者报告完整定向测试 47 项及后续设备页面测试 15 项通过，相关 Biome 和手机包 TypeScript 检查通过；独立复审确认已报告的跨作用域回焦竞态得到处理。上述为模拟测试和静态审查，未验证真实导航、服务器路由及 iPhone。

2026-11-11（第二轮审核）：M2 实现者报告 59 项定向测试和手机类型检查通过，但复审识别正常初始连接、关闭时在途操作和重载恢复等问题，未通过审核。M4 实现者报告 45 项定向测试、Biome 和手机类型检查通过，复审发现前后台刷新竞态及 404 提示问题；两项均已退回修复，未进行真机或服务器验收。

2026-11-11（M3 测试类型修复）：实现者报告列表单文件测试 4 项通过，移动端类型检查已不再报告该文件；完整类型检查仍因正在修改的电脑接管页面报错而未通过，已交对应实现者处理。

2026-11-11（M4 首轮）：实现者报告设备 API、页面及设置入口定向测试 30 项通过，新增文件及设置路由 Biome 通过；移动端类型检查因现有项目列表测试的类型错误未通过。独立审核发现四项待修问题，当前不视为完成验收。

2026-11-11（M2 输入初稿）：实现者报告两个定向测试文件共 57 项通过、指定文件 Biome 检查通过（另有一条既有提示）。独立静态审核随后发现断线竞态和同地址旧消息风险；修复与复审未完成，上述通过不能代表真机或端到端通过。

2026-11-11（M3 独立静态审核）：核查列表组件和测试，识别删除确认、同名区分、加载失败时新增及原生无障碍四项待处理问题；本次审核未运行原生应用。已登记为接线前条件，不代表线上已发生数据问题。

2026-11-11（M3 项目列表）：使用临时单文件 Vitest 配置执行 `apps/mobile/lib/project-workspace-list.test.tsx`，1 个测试文件、4 项测试通过；临时配置已删除。该组件未接线，静态渲染测试不代表真实服务、设备视觉或文件夹操作通过。

2026-11-11（手机五项任务规划）：核对现有 iPhone 计划、项目工作区组件和工作区状态；当前为源码及文档核查，未运行手机应用、构建、安装或连接设备。独立核查已派发，结果及后续修复另行记录。

2026-11-11（手机列表草案）：组件作者报告在收到停止测试指令前，单文件测试 3 项和两个新增文件的 Biome 检查通过；收到指令后未再执行测试。该结果只覆盖未接线组件，不证明真实接口、移除确认、设备视觉或无障碍体验。独立静态审核进行中。

手机列表后续修订：独立审核及复审均为静态检查；修订后的组件及新增断言未运行测试或格式检查，先前的 3 项通过不代表最终版本已验证。加载完成及错误通知尚无完整跨平台实现，设备布局、真实触摸与 VoiceOver/TalkBack 均未验证。

2026-11-11（Windows 安装器核查）：静态阅读当前打包配置与本机 builder 默认实现；未生成安装器，未验证安装目录、身份共存、升级、卸载或数据保留。NSIS 构建命令仅为候选，未执行。

安装配置补充核查：本机 builder 配置加载源码显示不能假定以 YAML 的 `extends` 指向 `package.json` 就继承其 `build` 字段；由于继承与更新源问题尚未解决，未新增候选配置。此为静态判断，未运行打包。

2026-11-11（生命周期候选方案）：仅静态核查账号删除、Space claim、工作区约束及认证钩子；未连接 PostgreSQL，未验证序列化快照、并发竞争、外部清理或框架最终删除。候选锁协议不能作为工作区隔离已完成的证据。

2026-11-11（备份与回滚只读核查）：北京时间 01:28 的检查显示生产容器健康，应用镜像声明修订为 `1993995e572fd4235c7684c533db23eb6cf0554e`；找到 11 月 7 日备份文件，但未验证其内容或恢复，未找到指定回滚镜像标签。未创建备份、演练恢复或回滚，不能认定生产变更条件已满足。

2026-11-11（并行子项集成）：Node 24 定向运行桌面资源及授权测试共 17 项通过，PostgreSQL 10 项跳过；五个相关源码与测试文件 Biome、桌面 TypeScript 检查通过。授权的模块重载测试模拟重启，未证明真实进程或跨实例安全；数据库测试的非成员空集没有对应工作区记录，不能证明成员检查有效，也未执行真实 RLS。资源 MIME 测试未验证安装包及图片显示。独立复审认为测试清理错误覆盖已修正，授权内容篡改被拒绝，但跨实例撤销与文件重建风险仍存在；临时配置已删除。

2026-11-11（PA-023 策略试验）：初版独立分类 Vitest 5 项、格式和桌面 TypeScript 检查通过，但独立静态审核发现网络路径范围、窗口身份、弹窗及实际资源等接入阻断；测试通过不足以证明安全。修订后仍无真实请求身份方案，试验文件及临时配置已移除；未运行 Electron、桌面构建或服务器集成。

2026-11-11（PA-023 域名关联路径）：桌面资源分类 Vitest 10 项通过，桌面 TypeScript 检查通过；独立审核发现路径匹配差异后调整前缀并复测，复审未发现新明确阻断。编码后的路径保留原样转发，本测试不证明请求到达 API；未启动 Electron 或测试真实域名关联。手机依赖结果为静态核查，未连接手机或生产。

2026-11-11（PA-023 资源路径防护）：在 Node 24 下运行桌面资源分类测试 9 项通过，相关两文件 Biome 与桌面 TypeScript 检查通过；子代理指出编码点段遗漏后补充拒绝与测试，复测同样通过，静态复审未发现新明确阻断。测试仅验证候选路径分类，不能证明 Electron 协议实际转发原始请求、各方法、弹窗或运行平台文件系统行为；临时测试配置已删除。

2026-11-11（PA-023 依赖核查）：静态检查确认 Electron 远程模式当前加载服务器页面，打包资源处理限于受管理本机模式；手机电脑界面使用 WebView，部分授权使用外部浏览器。上述为代码静态证据，不代表真实连接、回调或桌面本地渲染已验证；未运行 Electron、构建或停止网页服务。

2026-11-11（线上只读核查）：公网 `/health` 返回 200；两台服务器维护 SSH 均可连接。云电脑生产 Compose 的 Web、API、Worker、PostgreSQL 容器显示 healthy；旧 Web 和后台 systemd 服务显示 inactive，不能按历史架构推断当前故障。生产库只读查询确认 `public.project_workspaces` 不存在；首次查询因终端换行导致尾部额外 SQL 报错，清理换行后复查成功。未验证登录、业务数据、工作区功能或部署。

2026-11-11（PA-022 读取与授权基础）：Node 24 下限定三个文件执行 Vitest，读取与本地存储 9 项通过，PostgreSQL 10 项跳过；新增数据库用例覆盖同时间戳分页、恰好 100/101 条、不同账号及 Space 和删除状态，但没有实际连接数据库，不能证明 SQL 或 RLS 正确。5 个相关文件 Biome 通过，桌面 TypeScript 检查通过；首次桌面类型检查发现测试数组元素可能为空，修正后通过。临时测试配置已删除。未测试真实 Windows 权限、重启撤销、多进程或应用集成。

2026-11-10（PA-022 契约与账号错误映射）：工作区契约和公开入口单文件测试 8 项通过；覆盖未绑定状态、路径与控制字符、超长、伪造字段及删除确认。账号错误映射用内存适配器调用 Better Auth 删除路由，相关 7 项测试通过，包含工作区返回 409、数据库错误返回 500 及测试替身未执行计费和清理。独立复审后将权限验证及存在检查合为单条查询，相关 7 项复测通过；补充非法数据库结果单元测试后该文件 7 项通过，首次参数表测试因空数组参数展开失败，修正后重跑通过。8 个相关文件 Biome 通过。未连接 PostgreSQL、部署 API 或验证客户端展示。

2026-11-10 PC 初始窗口：Node 24.22.1 下使用临时单文件 Vitest 配置执行窗口选项测试，独立审核后修改小工作区边界并复跑 20 项通过；改动文件 Biome 与 `git diff --check` 曾通过，临时配置已删除。验证的是工作区尺寸到窗口配置的计算，不代表实际 Windows 缩放、窗口边框、网页视口或桌面布局已经通过；未启动 Electron 或构建。

2026-11-10（PA-022 删除前保护）：Space 领取 claim 的单元测试 7 项通过（包括工作区存在、权限不足、bypass 失败及旧 claim）；账号前置检查单元测试 4 项通过（包括系统上下文、工作区存在、数据库错误和 bypass 失败），6 个相关文件 Biome 通过。独立 Space 静态复审通过当前关闭创建的边界；mock 测试不能证明 PostgreSQL 实际 bypass、事务、接口响应或外部副作用顺序。未部署或连接数据库。

2026-11-10 PC 连接门禁筛选：在 Node 24.22.1 下分别对四个测试名称执行 Playwright `--list`，每项恰好匹配一项；工作流 YAML 解析和 PowerShell 语法检查通过。子代理指出仅核对清单会漏掉跳过测试和名称子串误匹配，改为核对真实 JSON 报告；使用一个临时简单测试实际生成报告并验证解析条件，临时测试已删除。直接经 `pnpm` 验证时因默认 Node 版本不符失败；尚未执行四项连接测试或 Windows 工作流，runner 环境仍待实测。

连接门禁复审：子代理未发现 JSON 检查存在必然阻断或跳过误判；建议保留失败日志和严格处理旧报告清理，已调整为同时使用 `list,json` reporter 并在清理失败时终止。本机临时简单测试确认两种 reporter 同时输出且 JSON 记录通过，临时测试已删除；Windows runner 和四项实际连接场景仍未执行。

2026-11-10（PA-022 测试门禁与删除核查）：工作区 PostgreSQL 测试清理改为分别尝试关闭所有连接并汇总错误。明确设置 `VERIFY_DATABASE` 但缺少不同的运行与迁移连接时，测试按预期报错；不设置时 9 项跳过，Biome 检查通过。两次均未连接数据库。独立静态审查进一步确认 Space 和账号删除在数据库级联之前会有外部副作用；删除前置检查、与工作区创建的并发门禁及完整清理尚未实现，不能开放创建。

2026-11-10 PC 打包连接门禁：Node 24.22.1 下 Playwright `--list` 对新增筛选准确列出 4 项既有后台连接测试；YAML 解析核对可执行文件路径和只读权限通过，测试文件 Biome 检查通过并保留既有 `document.cookie` 警告。独立审核指出宿主电脑监听所有网络接口、测试端口竞争、异常清理与打包身份未验证；已补充打包身份判断、异常清理和环境隔离，复审未发现新阻断，监听与端口竞争仍需运行时评估。没有运行测试、启动 Electron 或连接真实后台；模拟服务通过也不能证明登录、聊天或真实网络可用。

2026-11-10 PC 窗口与构建门禁：Node 24.22.1 下使用临时单文件 Vitest 配置运行 `window-options.test.ts`，19 项通过，覆盖窗口尺寸、窗口框架和背景等纯逻辑；使用 Playwright `--list` 确认非发布构建工作流指定的打包更新测试可以被发现，未启动或执行该测试。临时配置已删除；这不验证真实 Electron 窗口、Web 视觉、打包或后台联调。

2026-11-10 PC 更新控制器：Node 24.22.1、临时单文件 Vitest 配置及替代的翻译和监控模块下，`auto-update.test.ts` 37 项通过，覆盖打包与未打包时自动检查、手动检查、下载和安装不加载更新器。未替代依赖时测试导入触发 Electron 下载并报 Electron 安装不完整，未执行测试；本次未安装 Electron。临时配置和替身已删除。模拟模块的结果不验证真实翻译、监控或 Electron 主进程，也不替代安装包和网络验收。

2026-11-10（PA-022 工作区元数据）：Node 24.22.1 下 `prisma validate` 通过；从空模型生成的 SQL 中核对新表字段、索引和成员外键与迁移一致。独立静态审核确认 RLS 条件并指出删除流程及既有 bypass 配置为开放前阻断；未连接 PostgreSQL、应用迁移、验证权限或运行集成测试。

2026-11-10（PA-022 PostgreSQL 测试准备）：新增元数据隔离测试，覆盖同 Space 不同用户、同用户跨 Space、合法读写、无上下文、系统访问、成员外键和单连接复用；测试作者以关闭数据库验证的配置运行，9 项跳过，不能算通过。独立审核促成补充跨 Space 和正向操作；复审指出权限仅检查有效权限、未覆盖 Prisma 模型及真实迁移，清理关闭连接的异常处理仍可加强。未连接数据库，实际策略、迁移及运行角色均待服务器验证。

2026-11-10（PA-022 归属比较基础）：Node 24.22.1 下使用临时精简 Vitest 配置、单 worker 执行 `workspace-scope.test.ts`，4 项通过，覆盖首页与文件夹、跨用户和 Space、缺失资源及非法运行时输入；两个新增文件的 Biome 检查通过。临时配置已删除。独立审核发现的异常输入问题已修复，静态复审未发现新阻断问题，复审未独立运行测试；数据库、API 和真实工作区隔离未验证。

2026-11-10 PC 非发布构建：使用现有 Node 24.22.1 和桌面包已有 `yaml` 依赖解析新增工作流，检查手动触发、只读权限、固定 Action、`--dir --publish never`、源码核验、更新门禁、完整文件哈希和隐藏文件上传，通过；PowerShell 元数据脚本语法检查及四个桌面 TypeScript 文件 Biome 检查通过（既有测试文件有一条 `document.cookie` 警告）。首次从仓库根目录加载 `yaml` 失败，改用已有桌面包依赖后通过。Playwright 测试、GitHub Actions、构建、安装及实际更新行为均未执行；静态检查不代表桌面构建成功。

2026-11-10 PC 更新定向测试：默认 Node 22.14.0 和已有 Node 24.22.1 下分别尝试 Vitest 单文件测试，启动后长时间无测试结果，已主动中止；另一次临时配置运行的会话句柄失效，未获得结果。桌面更新相关 3 个 TypeScript 文件的 Biome 检查及 `git diff --check` 通过；不得将未得到结果的测试记为通过。

2026-11-10（PA-022 与桌面基线）：两项子代理审查为只读静态分析，未验证所有调用路径或打包结果。使用 Node 24.22.1 尝试桌面更新单文件测试，首次因 Vitest 不支持 `--minWorkers` 直接报错；移除此参数后测试启动但长时间未输出，主动中止，未得到通过或失败结论。未执行构建、安装或真实后台联调。

2026-11-10 PC 基线：只读检查页面路由、渲染器选择、安全窗口配置和发布工作流；本机默认 `node --version` 为 22.14.0，项目要求 Node 22.22.2 起（或其他声明支持的版本），已发现本机另有 Node 24.22.1。依赖目录存在不代表可成功构建；未启动 Electron、服务或执行构建、联调。

2026-11-10 PC 桌面端规划：只读核对现有 PC 联调文档、Electron 打包配置、部分窗口及渲染资源代码；本次未执行测试、桌面构建、安装、启动或后台联调。独立窗口创建工具未发现；模块执行与审核尚未开始。

2026-11-10（PA-021 首页、连接应用与字体）：底部导航与连接应用测试 2 文件 36 项、置顶渲染与字体缩放 2 文件 20 项、原生按钮 22 项、账户设置 20 项、在线更新配置与逻辑 2 文件 36 项通过；合计 8 文件 134 项（分批运行）。移动端 TypeScript、9 个改动源码及测试文件 Biome、`git diff --check` 通过。原生按钮测试曾因旧断言不允许字体配置而失败，更新预期后 22 项通过。测试不验证 iOS 系统玻璃真实呈现、中文字体替代、输入、长按或更新服务；未构建 IPA、实际配置 Expo 或设备验收。

2026-11-10（PA-021 手机安装包）：GitHub Actions `42770297627` 以提交 `72c4211fc` 成功生成未签名 IPA；下载文件 SHA-256 与云端清单一致，确认包标识 `xin.zxlup.sydney`、JavaScript bundle 存在、最长路径 122 字符及 Expo 更新关闭。Windows 检测到 iPhone；未签名、安装、启动或实机验收。

2026-11-10（PA-021 手机直接更新）：配置与更新逻辑定向测试、设置首页更新入口测试和移动端 TypeScript、相关文件 Biome 检查通过；曾因设置页测试缺少原生更新模块替身而失败，补充替身后通过。未执行 Expo 项目配置、GitHub 工作流、IPA 构建签名、更新发布或 iPhone 验收，发布及回滚路径仍待真实环境验证。曾尝试调用 `gh` 检查仓库配置，本机未找到该命令，未确认远端变量或凭据。

2026-11-10（PA-021 手机玻璃首批）：玻璃回退、设置分组、选择卡、凭据表单、小伙伴信息、聊天输入、账户、搜索、例程、提问卡、错误提示及登录的 12 个定向测试文件分别运行，共 242 项通过；移动端 TypeScript 和变更文件 Biome 检查通过。第一次将 6 个测试文件放在同一进程执行时，设置分组一个无障碍断言失败，单独重跑通过，测试之间的影响尚未定位；未将该次联合运行记为通过。未运行 iOS 构建或设备视觉及触控验收。

2026-11-10（PA-021 手机玻璃补充）：归档列表、聊天卡宽度和小伙伴资料三个测试文件分别通过 5、28、54 项；与首批合计 15 个文件、329 项分别运行通过。玻璃组件测试在增加无障碍属性传递断言后重新运行，2 项通过；移动端 TypeScript、19 个改动文件的 Biome 检查通过。聊天卡宽度测试输出既有 HTML 嵌套按钮警告；上述联合运行的测试隔离问题仍未定位。本轮未构建 IPA，也未在 iPhone 上验证视觉、可读性、触控或性能。

2026-11-10（PA-021 修改密码输入框）：`apps/mobile/lib/settings-layout.test.tsx` 7 项通过，覆盖设置布局而非实际密码输入；移动端 TypeScript 和 20 个变更文件的 Biome 检查通过。密码输入、自动填充和玻璃视觉仍需真机验证。

2026-11-10（PA-021 独立区域续做）：应用集成、群组成员选择、小伙伴语音和模型选择四个测试文件联合执行，3 个文件通过，模型选择文件 56 项中 2 项失败；模型选择文件单独重跑 56 项全部通过，联合运行的测试间影响未定位。新建群组测试单独运行 15 项通过；未找到新建空间页面对应的定向测试。移动端 TypeScript、5 个本轮页面的 Biome 检查及 `git diff --check` 通过。未执行新 IPA 构建或 iPhone 真机视觉、输入、触控和性能验证。

2026-11-10（PA-021 iPhone 修复构建与生产发布）：PR #9 检查通过并合并，主分支工作流 `42744299220` 的生产部署成功，公网 `/health` 返回 HTTP 200、`{"ok":true}`，`/build-id` 为 `20261110024122`。iOS 工作流 `42742221127` 成功，IPA 的 SHA-256 为 `eb50079dad8d0b3cf61e50b30836b75e21e590c21d289f66f953423561044e7b`，与产物清单一致；包内最长条目 122 字符，复制到短目录后哈希一致。尚未进行 iPASide 签名、手机安装或真实登录验收；云电脑既有接管故障仍未证明恢复。

2026-11-10（PA-021 翻译门禁修复）：PR CI 报移动端多语言目录缺少 `Bots`；补齐后本机完整多语言测试进一步发现四种语言缺少 `Connect apps`，已一并补齐。`apps/mobile/lib/i18n.test.ts` 16 项通过；修复提交的 CI 和云构建待复验。

2026-11-10（提交前定向复核）：云电脑拒绝提示、设置页、设置导航与主题入口共 4 个 Vitest 文件 26 项通过；原生驱动单元测试运行 22 项、跳过 2 项；相关移动端配置、云电脑提示和主题入口共 6 个文件的 Biome 检查及 `git diff --check` 通过。未运行全工作区构建或真实云电脑、iPhone 测试；这些结果不表示生产部署成功。

2026-11-10（PA-021 iPhone 侧载路径）：旧 IPA 最长条目 259 字符；本机使用真实图标字体和 Metro 资产转换器验证短目录下的 JS 注册与 iOS 复制目标一致，复制路径 62 字符，不同源目录生成不同映射。两份移动端配置文件的 Biome 检查通过；云端完整构建、iPASide 签名及 iPhone 安装尚未执行。

2026-11-09（PA-021 最新 iPhone 构建）：运行 `42634529547` 的 Xcode 编译、arm64/JS 检查、IPA 打包及上传均成功；已下载的 IPA 共 25,785,125 字节，SHA-256 与云端清单一致，包标识为 `xin.zxlup.sydney`，最低 iOS 16.4，JS 内含配置的 HTTPS 服务器及 `settings-home` 路由。包内没有签名描述文件，未执行签名或安装。移动端设置布局额外 7 项测试通过；电脑访问配置服务器健康接口返回 HTTP 200，不能证明手机网络或登录成功。

2026-11-09（PA-021 头像设置分层）：账户页面、主页标题栏、备用标题栏和设置导航共 4 个定向测试文件 41 项通过，覆盖头像入口、分类跳转、分类隔离与原有账户操作；移动端 TypeScript 和 9 个改动文件 Biome 检查通过。本机 Node 版本低于仓库要求，模拟测试未验证真实 iOS 面板、视觉、返回手势或登录回调。此前运行 `42631137377` 已成功构建，下载 IPA 并对照产物清单验证 SHA-256；该包不含本轮设置分层。

2026-11-09（PA-021 创建入口与置顶）：创建菜单、原生标题栏、备用标题栏、列表渲染、空间列表及滑动操作共 6 个定向测试文件 80 项通过，覆盖加号菜单的新建入口、置顶／取消置顶动作和置顶列表；移动端 TypeScript 与 3 个改动文件 Biome 检查通过。本机 Node 版本仍低于仓库要求，测试没有替代真实 iPhone 的操作和显示验证。

2026-11-09（PA-021 原生背景设置）：`chat-appearance.test.ts` 与 `chat-appearance-screen.test.tsx` 共 5 项通过，覆盖旧数据缺省显示方式、保存恢复并保留气泡、显示方式切换和两个透明度按钮的参数；移动端 TypeScript 与 5 个改动文件 Biome 检查通过。测试使用模拟界面和存储，未验证原生渲染、图片效果、实际触控或无障碍读屏；本机 Node 版本仍低于仓库要求。

2026-11-09（PA-021 首批原生界面）：登录、输入区、会话列表、导航及设置的 5 个定向测试文件共 131 项通过，移动端 TypeScript 和 13 个改动文件的 Biome 检查通过；使用本机现有依赖，Node 版本仍低于仓库要求。测试不证明真实布局、键盘或视觉一致性。GitHub Actions `42625236742` 成功构建并上传未签名 IPA（约 25 MB），工作流检查了 arm64、内置 JS 和扩展目录；该构建不包含本轮尚未提交的界面调整。签名、安装、登录聊天、设备对照和七天续签均未验证。

2026-11-09（PA-021 云构建首轮）：GitHub Actions `42624234704` 在 Xcode 27.1/iOS SDK 27.1 上完成依赖安装、Expo prebuild 及 CocoaPods；生成的 `Sydney.entitlements` 含 `aps-environment`，权限检查失败，Xcode 构建、产物和安装均未执行。日志还出现未找到可选 `expo-dev-client/package.json` 的信息，CocoaPods 步骤仍成功，是否影响后续构建待验证。已在构建脚本中针对侧载模式移除生成的推送 entitlement，尚未复跑。

2026-11-09（PA-021 免费原生准备）：运行 `pnpm exec vitest run apps/mobile/lib/app-config.test.ts apps/mobile/lib/endpoint.test.ts apps/mobile/lib/push.test.ts --maxWorkers=1`，3 文件最终 43 项通过；移动端定向 TypeScript 检查和 4 个改动 TypeScript 文件的 Biome 检查通过。PyYAML 解析工作流及作业结构，提取工作流中的 plist 检查逻辑，在空权限和三个禁止权限样本上验证通过；首次结构脚本错误预期 10 步导致断言失败，核对实际 11 步后通过，不能据此证明 GitHub Actions 接受或实际执行。`pnpm --filter @rakazo/mobile exec expo config --json` 由于本机 Node 22.22.0 低于仓库要求失败；未绕过引擎检查。所有结果均受 pnpm 配置警告及本机 Node 版本限制。未执行 macOS 云构建、产物检查、免费签名、安装或 iPhone 实机验证。

2026-11-09（PA-021 免费方案核查）：只读检查 `apps/web/index.html`、PWA manifest 生成和图标文件，并查阅 Expo、Apple、AltStore 公开资料；现有源码包含 Web App 主屏幕元数据，但未验证用户手机、已部署资源、通知或原生侧载。未安装工具、申请账号、签名或构建。

独立子代理补充公网只读检查：首页、manifest、service worker、Apple 图标及 `/build-id` 均返回 200，构建号为 `20261109120539`。这不证明手机主屏幕安装、登录、消息、通知或更新可用；均待实机验证。

2026-11-09（PA-021 iPhone 准备）：静态检查移动端配置、构建配置、认证入口及项目身份；两名子代理分别独立评估功能/原生模块和 EAS/签名，另对预览检查进行了独立复审，未运行构建。使用本机现有依赖执行 `pnpm exec vitest run apps/mobile/lib/app-config.test.ts apps/mobile/lib/endpoint.test.ts --maxWorkers=1`，修改前 24 项、首次修改后 28 项、补充回环检查后 32 项通过。当前 Node 22.22.0 低于仓库要求的 22.22.2，pnpm 发出配置警告；该结果不等于合规环境验证。未安装依赖、未连接 Expo 或 Apple 账号、未构建、未安装到 iPhone、未验证真实服务。

环境只读检查未发现全局或仓库本地 EAS CLI，当前进程没有 `EXPO_TOKEN`；未查询或推断其他登录状态。改动文件 `git diff --check` 通过。

2026-11-09（外观遗漏补齐）：`GroupPanel.test.tsx`、`bot-panel.test.tsx`、`ChatAppearanceSettings.test.tsx`、`WorkspaceBackground.test.tsx` 共 4 文件 57 项通过，包含已有群新增 Bot 的保存参数和独立背景紧接语音的位置；Web TypeScript 检查通过。Edge 无头浏览器加载实际编译 CSS，在 390/1280 像素、深浅主题、0%/100% 的 8 组简化布局下验证共享表面及新建输入框、创建按钮透明度，检查聊天输入框始终不透明、对话列表不随调节变化，并保留截图。受影响文件 Biome 无错误，有既有 CSS 警告；本机未启动应用或数据库。提交 `b1218e358` 的 PR CI `42612891408` 全部适用检查通过，Web E2E 两分片分别 50、48 项通过，其中新增 `chat-appearance.spec.ts` 的 390/1280 像素两项实际执行通过，验证上传、保存、刷新、Bot/群背景隔离、恢复全局及已有群加 Bot 后的保存结果；已查看真实应用截图。合并版本 `1494048fbfac551a6401ec059c80fc95f418156e` 的生产流程 `42613921092` 与 `deploy-production` 成功；北京时间 2026-11-09 20:11 公网 `/health` 返回 200 和 `{"ok":true}`，`/build-id` 从 `20261109112537` 更新为 `20261109120539`，线上 `/assets/index-BGWxjdRc.css` 包含共用表面和新建表单不透明度规则，`Shell-Byyl0YBd.js` 包含背景设置及添加成员代码。功能回归运行于 CI，生产仅核对版本、健康及静态资源，未验证真实手机或当前用户账户。

2026-11-09（PA-019 设置插件入口纠正）：设置页面、设置 URL 解析及换肤入口定向测试共 3 文件 23 项通过，Web TypeScript 检查通过。首轮联合测试发现测试替身与真实外观模块冲突，改为验证真实本地偏好后复跑通过；真实浏览器、实际刷新及部署未验证。

2026-11-09（PA-019 换肤插件入口）：换肤入口组件及现有 Web 外观工具定向测试共 2 文件 3 项通过，覆盖进入、返回、外观选择及不可用提示；Web TypeScript 和相关三个组件文件 Biome 检查通过。技能弹窗集成、真实浏览器、手机和部署尚未验证；未运行翻译目录提取检查。

2026-11-09（PR #7 发布验证）：首轮运行 `42588762814` 的翻译目录步骤失败；清理两条无引用词条后，本机重新提取目录未产生额外变化，暂存补丁空白检查通过。修复提交 `582555ce8` 的运行 `42607880438` 中，格式、翻译目录、类型检查、三个单元测试分片、两个数据库旅程分片、生产构建、Electron 启动检查及 Web E2E 全部通过。合并版本 `343efad7a5008b5a2e3496af969888ba4a509bf4` 的运行 `42608790848` 和 `deploy-production` 均成功；北京时间 2026-11-09 19:31 公网 `/health` 返回 200 和 `{"ok":true}`，`/build-id` 从 `20261109071410` 更新为 `20261109112537`，线上 `/assets/index-C0DRlfBZ.css` 同时包含 `.sydney-settings-nav-row`、`--sydney-surface-alpha` 和 `.workspace-background`。独立截图图库发布失败，未将其记为通过；真实手机视觉、触屏及图片持久化仍未验证。

2026-11-09（PA-018 手机设置导航）：`SettingsOverlay.test.tsx` 10 项通过；Edge 无头浏览器以 390 和 640 像素宽加载实际 CSS 与简化结构，检查深浅主题及 35%、100% 不透明度下导航行宽度、背景、滚动区透明和横向滚动，结果符合预期。Biome 检查通过并报告 5 项 CSS 警告；新增应用 E2E 断言未运行，真实手机及部署未验证。

2026-11-09（PA-018、PA-020 单聊与群聊设置）：`GroupPanel.test.tsx`、`bot-panel.test.tsx` 和 `side-panel-create-group.test.tsx` 共 49 项通过，覆盖群成员选择与保存参数及背景控件位置；Web TypeScript 和改动组件的 Biome 检查通过。未启动本地服务或数据库，真实应用浏览器、手机、群成员持久化及部署未验证。

2026-11-09（V-060 原生电脑接管生产排查）：生产 API 日志显示 `computer/takeover` 在驱动拒绝后返回 500；原宿主驱动不包含新 `control_revoke` 方法。宿主驱动已同步仓库版本并重启，服务和 socket 为 active；通过受限代理的只读状态检查确认新驱动 generation 与数据库旧引用不一致。重启前活动任务检查因 SQL 错误未完成，事后只读查询为零活动 Run、零有效执行租约，不能反推重启时状态。屏幕代理当前可访问，未完成新代次协调、真实接管和输入验证；不得将服务健康当作功能恢复。API 本地错误提示修改未部署。

V-060 本地补充：`pnpm exec vitest run apps/api/src/native-computer-refusal.test.ts apps/api/src/native-computer-input.test.ts apps/api/src/native-computer-control-fence.test.ts apps/api/src/screen-proxy.test.ts --maxWorkers=1` 通过 4 文件、37 项；修改的 API 文件 Biome 检查通过。原生驱动拒绝时的中文提示不重试操作，仅改善诊断，不能恢复接管；代次自动协调草稿因无法证明旧任务已停止及并发安全而撤回，未部署或进行真实桌面验收。

V-060 后续只读检查：驱动服务、驱动 socket 和 VNC 服务均为 active；驱动服务的 `KillMode` 为 `control-group`。这些状态不能证明旧任务无残留，也不能证明接管、桌面输入或代次协调已恢复；本次检查未重启服务或修改数据库。

V-060 代次错误诊断：本地驱动为旧代次请求返回独立错误码，API 接管撤销路径显示中文提示，不执行输入或自动重试。`python -m unittest infra/native-linux/test_driver.py` 运行 22 项、跳过 2 项 Linux 专属测试；`pnpm exec vitest run apps/api/src/native-computer-refusal.test.ts --maxWorkers=1` 通过 3 项，相关 API 文件 Biome 检查通过。修改未部署，旧版驱动仍返回统一拒绝；这只是诊断改进，尚不能协调代次或修复生产接管。

2026-11-09（PA-012 原生输入协议）：新增定向测试验证有效运行租约下映射为驱动 `act`、缺失租约时不发送请求，单项通过；adapters TypeScript 与修改文件 Biome 通过。Python 驱动单元测试 17 项、跳过 2 项；完整 `native-linux-sandbox.test.ts` 中 15 项通过、2 项依赖本机 socket 服务的测试报 `Server is not running`，未确认其失败原因；未在真实 Linux 驱动或人工接管验证。

2026-11-09（PA-011、PA-012 人工接管点击无响应）：通过 `systemctl show` 只读核对线上正在运行的 VNC 服务带 `-viewonly`；检查当前仓库发现 native-linux 屏幕连接与代理也拒绝交互。后续已在本地补齐独立人工输入协议和离线测试，见 V-057；线上尚未部署、发送鼠标键盘、访问桌面画面、重启服务或修改配置，真实控制通路仍待实机验收。

2026-11-09（PA-011、PA-012 云电脑排查）：只读检查生产原生驱动动作及显示服务，当前桌面为 1920×1080；与本地驱动文件哈希不同，未假定两者完全相同。资源快照负载较低但 swap 已使用，无法据此判断交互时瓶颈。`pnpm exec vitest run packages/adapters/src/native-computer-tools.test.ts packages/adapters/src/computer-screenshot-sharing.test.ts packages/adapters/src/computer-tools.test.ts --maxWorkers=1` 通过 3 文件、18 项；adapters TypeScript 和相关代码 Biome 检查通过。没有测量端到端输入延迟、画面帧率或网络，未验证真实任务、真实接管及部署，不能宣称卡顿已修复。

2026-11-09（PA-018、PA-020 全局与独立对话背景、共用组件透明度）：本机定向 Vitest 3 文件、14 项通过，覆盖全局预览及取消、背景透明度、独立选择与跟随全局、失效素材引用清理、共用组件透明度预览与保存及原有聊天渲染；`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过。`pnpm --filter @rakazo/web check` 因本机 Node 22.22.0 低于项目要求 22.22.2 而未启动；未安装依赖或升级运行时。实际应用浏览器、手机安全区域、键盘和部署未验证。

同日共用组件样式补充：本机 Edge 以 390×844 视口加载实际 CSS 和简化页面，检查浅色、深色下不透明度 0% 与 100%：新建及搜索容器随设置变化，搜索内层透明，对话列表选中项及聊天输入区背景不随设置变化；此检查不替代完整应用及真实手机验收。

2026-11-09（PA-011、PA-012、PA-018 电脑截图与接管）：`pnpm exec vitest run packages/adapters/src/computer-screenshot-sharing.test.ts packages/adapters/src/computer-tools.test.ts packages/testkit/src/pi-runtime-checkpoint.test.ts packages/testkit/src/executor-turn-checkpoint.test.ts --maxWorkers=1`：4 文件、56 项通过，覆盖普通截图不发布、明确分享、同帧分享、发送失败、重复动作拦截、接管工具不可用及执行器接管恢复不重放；adapters TypeScript 与相关文件 Biome 检查通过。未运行真实模型、浏览器、云电脑、网络断线或生产验证；用户意图识别和其他类型卡住时的模型行为仍待验收。

2026-11-09（PR #6 生产部署）：提交 `1087d7875` 的网页两分片、单元、类型、数据库和生产构建检查通过；合并版本 `6ded1a62ecce62a0df88b9b2771f166dd0695b37` 的自动部署成功，公网 `/health` 返回 `ok: true`，`/build-id` 为 `20261109023224`。真实手机和真实邮箱注册流程未验收。

2026-11-09（注册浏览器检查）：PR #6 首轮网页分片 1 的注册测试因异步跳转判断过早而超时，同分片其余 48 项通过；分片 2、单元、类型、数据库和生产构建检查通过。辅助函数调整后，新的网页检查尚待运行。

2026-11-09（发布检查）：PR #6 首轮翻译目录一致性检查失败；本机直接运行已有 Lingui 提取工具成功，英文与简体中文目录各 1518 条，中文缺失 0 条。新提交的 CI 和部署待验证。

2026-11-09（PA-018 手机深色主题）：本机 Edge 无头浏览器以 390×844 加载主题变量和两份实际样式，使用简化页面检查页面、设置导航与分组、输入框、新建小伙伴标签的浅色和深色计算颜色；深色页面为 `rgb(22, 22, 22)`、设置与输入框背景为 `rgb(31, 31, 31)`，主要文字为 `rgb(245, 245, 245)`。`apps/web/src/lib/ui-appearance.test.ts` 2 项通过；相关 CSS 与 E2E 文件 Biome 检查无错误但有样式规则警告。新增实际应用 E2E 尚未运行；真实手机、跟随系统和生产部署未验证。

2026-11-08（PA-018 Composio 权限修复）：生产新 API 和 Worker 均 healthy、配置与环境文件一致；旧 Worker 正常退出。直接调用 Composio v3.1 会话创建获得 HTTP 201，目录接口获得 HTTP 200，首页包含 Gmail；公网 `/health` 为 200，构建版本 `20261108133236`。尚未验证应用内授权窗口、真实 Gmail 登录和工具调用。

2026-11-08（PA-018 插件授权排查）：在生产主机只读核对 API 和 Worker 的 Composio 环境变量均非空；检查经过脱敏的服务日志，托管目录请求返回 403 `APIKey_InsufficientPermissions`，缺少 `session_management` 写权限。尚未验证新密钥、托管目录、Gmail OAuth 回调或只读调用；截图中的原生 MCP 请求仍需结合其单独错误确认。

2026-11-08（PA-018 注册密码与强度）：`pnpm exec vitest run apps/web/src/pages/Auth.test.tsx apps/web/src/pages/AccountSettingsOverlay.test.tsx packages/auth/src/identity-trust.test.ts` 通过，3 文件 103 项；覆盖密码确认、强度变化和显隐、验证码登录、邮件验证后登出及密码重登。Web `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 和改动代码 Biome 检查通过。`pnpm --filter @rakazo/web check` 因本机 Node 22.22.0 低于要求的 22.22.2 未运行，改用上述直接类型检查；真实邮件、浏览器 E2E、键盘及生产部署未验证。

2026-11-08（PR #5 部署受阻）：机器人面板 32 项、机器人设置 17 项、账户设置 23 项定向测试通过，相关文件 Biome 通过；首轮网页 E2E 第一分片及 PostgreSQL 两分片通过。后续检查因 Electron 和浏览器工具下载 HTTP 504 未完成；公网 `/health` 返回 `ok: true`，`/build-id` 为 `20261108045522`，仍是旧版。未部署、未进行新版本实机验收。

2026-11-08（PA-018、PA-020 背景透明度）：`pnpm exec vitest run apps/web/src/components/ChatAppearanceSettings.test.tsx apps/web/src/pages/shell/transcript-render.test.tsx --maxWorkers=1`：2 文件、10 项通过，覆盖模拟图片上传、透明度预览、保存、取消和聊天画面。Web TypeScript 检查通过；真实浏览器、手机及部署尚未验证。

2026-11-08（PA-019 换肤插件规划）：静态核对 Web 主题应用、聊天外观存储、现有插件部件定义及安装入口；本轮只有设计文档，未执行代码测试、浏览器或部署验证，未验证现有插件安装能力可直接承载主题。

2026-11-08（PA-018 新兼容模型默认识图）：`pnpm exec vitest run packages/core/src/model-connection-form.test.ts apps/web/src/pages/Onboarding.test.tsx --maxWorkers=1` 通过，2 文件 19 项；覆盖新连接默认及已保存关闭状态，首次配置测试未单独覆盖提交图片能力。相关 TypeScript 文件 Biome 检查通过；未做浏览器、真实模型和部署验证。用户反馈手动开启后已可使用。

2026-11-08（PA-020 旧气泡数据清理）：外观设置、颜色选择器和聊天渲染定向测试 3 文件 10 项通过，模拟 IndexedDB 覆盖清理后背景与颜色保留以及写入失败时旧记录保留；Web TypeScript 检查通过。真实浏览器 IndexedDB、跨标签页、移动端及部署未验证。

2026-11-08（PA-018 图片能力设置入口）：兼容连接界面定向测试 1 文件 6 项通过，包含无需展开高级设置即可找到和切换图片能力；修改的两个文件 Biome 检查通过。最初包含服务端的组合测试启动较慢，已中断，未取得结果；未执行真实连接保存、浏览器、真实图片识别及部署验证。

2026-11-08（PA-018 图片设置核对）：静态检查模型设置界面，确认“支持图片”仅在 OpenAI 兼容连接的高级设置中显示；其他服务商设置未提供该开关。未连接用户账户或验证实际模型。

2026-11-08（PA-018 重复调用停止提示）：`pnpm exec vitest run packages/core/src/loop-guard-message.test.ts packages/adapters/src/tool-loop.test.ts packages/adapters/src/executor-loop-guard.test.ts packages/adapters/src/job-reconciler.test.ts apps/web/src/pages/shell/message-view.test.tsx --maxWorkers=1`：5 文件、82 项通过；覆盖新旧消息识别、停止条件、委派结果处理、中英文显示和点击回复。Web 与 adapters 的 `tsc --noEmit` 通过。未执行真实浏览器、外部消息渠道或部署验证。

2026-11-08（PA-018 聊天图片输入续查）：依据截图及静态代码确认失败位于图片能力准入；未取得具体模型、连接和群聊目标，未复现或改动发送逻辑。

2026-11-08（PA-018、PA-020 聊天外观）：Web 外观设置、聊天渲染和消息视图定向测试复跑 3 文件 22 项通过；Web TypeScript 检查通过。旧背景和气泡数据读取及双方颜色持久化在模拟 IndexedDB 中验证；真实浏览器图片上传、颜色视觉、移动端和部署未验证。

2026-11-08（PA-018 聊天图片输入排查）：只阅读了上传入口、支持格式、模型能力检查和群聊接收者逻辑，未连接用户账号、复现问题或验证真实图片及模型。

2026-11-08（PA-018 手机群聊发言头像）：`pnpm exec vitest run apps/web/src/pages/shell/message-view.test.tsx --maxWorkers=1` 通过，1 文件 13 项；相关 CSS 与浏览器测试文件 Biome 检查通过，报告 17 条样式警告。新增手机群聊头像及正文缩进的浏览器断言尚未执行，真实手机、浏览器布局和部署均待验证。

2026-11-08（PA-018 任务进度续）：定向测试覆盖排队、已领取、其他运行的旧进度和用量结算不计入模型流耗时；同一组 5 文件测试共 89 项通过。Web 和 adapters 的 `tsc --noEmit` 通过。未运行浏览器端到端、真实模型或生产任务前后对比，排队和审批等待的真实体验仍待实测。

2026-11-08（PA-018 头像等待状态）：头像、手机列表和状态定向测试 3 个文件、35 项通过；补充手机等待提示后该文件 4 项通过，Web TypeScript 检查通过。未查询线上运行状态，未部署、未在真实手机验证，排队或运行中的任务仍需按实际状态排查。

2026-11-08（PA-018 任务进度）：`pnpm exec vitest run apps/web/src/pages/shell/transcript-render.test.tsx apps/web/src/lib/live-work-stage.test.ts packages/adapters/src/tool-loop.test.ts packages/adapters/src/executor-loop-guard.test.ts packages/adapters/src/pi-usage.test.ts --maxWorkers=1`：5 文件、87 项通过；覆盖中英文阶段、待确认及已回答状态、相同失败循环、变化结果和模型耗时日志脱敏。Web 与 adapters 的 `tsc --noEmit`、相关文件 Biome 和 `git diff --check` 通过。未进行浏览器端到端、真实模型、生产部署或相同任务的前后耗时对比，不能声称最终完成速度已提升。

2026-11-08（PA-018 人格与职责）：`pnpm exec vitest run apps/web/src/lib/personality-library.test.ts apps/web/src/lib/personality-catalog-zh.test.ts apps/web/src/components/InstructionSettings.test.tsx apps/web/src/components/PersonalPersonalityLibrary.test.tsx packages/contracts/src/bot-personality.test.ts packages/adapters/src/executor-readonly-approval.test.ts packages/adapters/src/fleet-tools.test.ts --maxWorkers=1`：7 文件、350 项通过；随后扩充人格库中英文搜索用例，单独运行该文件 2 项通过。`pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 和 `pnpm exec tsc --noEmit -p packages/adapters/tsconfig.json` 通过。未运行真实浏览器、数据库、模型和部署验证，模型对风格优先级的遵循仍需实测。

2026-11-08（PA-018 Gmail 连接）：线上只读检查显示 API 和 Worker 均未配置 Composio；截图对应独立 Gmail MCP 缺少 OAuth 客户端 ID。`pnpm exec vitest run apps/web/src/lib/authorization-popup.test.ts apps/web/src/components/integrations/plugin-marketplace.test.tsx apps/web/src/pages/shell/message-cards.test.tsx apps/desktop/src/window-open.test.ts --maxWorkers=1`：4 文件、28 项通过；相关 11 个代码文件 Biome 检查通过。此前 Web TypeScript 检查通过，中文目录 1503 条、缺译 0。已补空目录浏览器断言，未运行 E2E、真实授权或只读调用；尚未部署，不能据此认定 Gmail 已连接。

2026-11-08（PR #4 发布）：`1eae0e09b` 的全部已运行 PR 检查通过，包括网页两分片、三组单元、两组 PostgreSQL、Lint/类型检查、原生电脑和生产构建；未执行的项目按 CI 条件跳过。合并版本 `3e51aed60` 的自动生产部署成功，日志确认对应镜像版本；公网 `/health` 200、`/build-id` 为 `20261108045522`。真实 Gmail 授权、手机布局、模型职责保持和电脑接管未验收。

2026-11-08（PR #4 测试隔离）：`af357f9b1` 的单元第一分片所有断言通过，但引导页实际认证客户端的延迟清理在 jsdom 销毁后访问 `window`，导致未处理异常。引导页单元测试改为模拟其未测的认证会话依赖，不调整生产行为；本地定向 1 文件、3 项和 Biome 检查通过，仍需 CI 复验。

2026-11-08（PR #4 引导语言复验）：`696c71696` 的 Web 第一分片仍有 1 项失败，定位为测试 harness 强制英文界面并将账号语言同步为英文，而默认引导卡片在同步前已按中文生成。用例在选择应用前显式设置账号中文，避免后续中文断言与英文回复混用；结果待 CI，未增加超时或跳过断言。

2026-11-08（PR #4 首次引导）：提交 `38303aad` 的 Web E2E 第一分片 48 项通过、1 项失败；失败项仍按英文查找已改为默认中文的引导问题。测试断言已与中文引导文案对齐，未在本机运行浏览器，修正结果待 CI 复验。

2026-11-08（PR #4 翻译目录）：提交 `f15443daa` 的 CI 翻译目录一致性检查失败；重新执行 Web 的 `intl:extract`，英文和中文目录各 1503 条，中文缺译 0 条。新的 CI 结果仍待验证。

2026-11-08（整合最新 main）：解决注册测试助手冲突时采用远端共享邮箱验证流程，保留两侧开发与验证记录。人格、指令设置、建 Bot 和手机群聊及列表的定向 Vitest 共 5 文件、10 项通过；注册助手与 MCP 入口的 Biome 检查通过。未执行浏览器 E2E、真实邮箱授权或生产验收。

2026-11-08（PA-018 个人入口）：修改的组件通过 Biome 检查，相关文件通过 `git diff --check`；静态搜索确认组件不再包含个人密钥及专用端点。浏览器实机和托管连接端到端验证未执行。

2026-11-08（PA-018 托管应用连接）：Composio 连接器定向模拟测试 3 项通过、46 项按筛选跳过，涉及账户绑定、目录规范化和密钥脱敏；未进行真实服务认证、用户授权或工具调用，不代表线上可用。

2026-11-08（PA-018 手机技能界面）：Node 24.15.0 下运行技能列表与插件组件定向测试，2 个文件 23 项通过；修改的弹窗和 E2E 文件通过 Biome 检查。补充手机单列及标题位置的浏览器断言，但未运行浏览器 E2E、真实手机或部署验收；现有组件测试不能证明实际布局。

2026-11-08（PA-018 群聊创建入口）：Node 24.15.0 下运行创建面板及手机侧栏定向测试，2 个文件、6 项通过；Web TypeScript 检查通过。已补手机 E2E 的点击、显示及返回断言，但未启动浏览器或运行 E2E；真实手机、实际建群和部署尚未验证。

2026-11-08（PA-018 创建入口）：`sidebar-roster.tsx` 和 `bot-picker.tsx` 的 Biome 检查通过；手机侧栏滑动相关测试 3 项通过，该测试不覆盖新建按钮点击。未运行浏览器、真实手机视觉或部署验证，新建入口点击与显示效果仍待验收。

2026-11-08（PA-018 人格与职责）：人格库、设置组件、新建弹窗和设置面板定向测试 4 个文件、38 项通过，覆盖内置及自定义人格切换、职责编辑、旧指令和现有冲突处理；相关文件 Biome 检查通过。Node 22.22.0 不满足项目版本要求，切换本机已安装的 Node 24.15.0 后 Web TypeScript 检查通过。真实模型是否遵循风格优先级、真实浏览器与部署未验证；历史版本能否恢复具体职责需逐个核实。

2026-11-08（PA-018 手机机器人左滑）：手机侧栏手势、列表分组和新左滑测试初次共 3 文件、19 项通过；补充右滑和误触测试后新文件 3 项单独通过。Web TypeScript 检查、相关组件 Biome 和差异空白检查通过。未连接服务器或执行真实跨空间删除、置顶和手机触屏验收，未部署。

2026-11-08（PA-018 首次回复语言）：运行 `pnpm exec vitest run apps/api/src/onboarding.test.ts apps/api/src/router.test.ts -t "onboarding connection suggestions|promptFocus|bot intro run"`，2 个文件 15 项通过、361 项按筛选跳过；涉及文件的 Biome 检查通过。本机 Node 22.22.0 低于项目声明的 22.22.2 最低版本，pnpm 提示忽略 package.json 中旧式 pnpm 配置；真实模型、浏览器和部署未验证。

2026-11-08（PA-018 iPad 回复正文）：消息渲染及聊天记录定向测试 2 个文件、16 项通过，覆盖有无发言者时的叙述、混合文本和流式文本；Web TypeScript 检查通过。未进行 iPad 实机或浏览器视觉验收，未部署。

2026-11-08（PA-018 手机聊天导航）：静态核对单聊和群聊均使用手机聊天标记与同一顶部导航，导航层级高于消息滚动内容，主题背景使用现有不透明颜色；未运行真实手机、浏览器视觉测试或部署。

2026-11-08（PA-018 人格卡片）：新建 Bot 弹窗和人格映射定向测试 2 个文件、3 项通过，覆盖六种人格切换、单选勾选和创建时所选指令；未运行真实手机或浏览器视觉验收。另跑自定义人格库测试时，保存测试未触发 create 调用而失败，原因待调查，本次未修改该模块。CSS 全文件 Biome 检查因已有无关格式问题未通过，组件和测试文件单独检查；未部署。

2026-11-08（PA-018 上游关联清理）：内置技能、executor 提示和电脑连接测试共 3 文件、180 项通过；历史摘要、上下文及子任务身份测试通过，其中更新后子任务身份 4 项、上下文 48 项单独复测通过。审批测试文件 240 项在进入审批逻辑前因测试夹具缺少 `prisma.computer.findUniqueOrThrow` 失败，故上游文档按普通外站审批的运行行为尚未验证。未部署、未测试真实模型对话；历史对话、记忆和用户配置的技能未清理。

2026-11-08（Linux 云电脑接入方案）：静态核对原生 Provider 工厂和双机设计，确认现有原生连接依赖单个配置的驱动 socket。未运行安装器、测试、Linux 服务或真实连接；方案尚不能证明自动准备和多电脑切换可用。

2026-11-08，PR #2 部分验证：远端分支头为 `0e81ad865a56200bbd2ceefae270fd60c20e897d`，远端 main 为 `747dbb522aee8c7d7facc686da772fa946fbea0d`；定向 Biome 检查 `apps/web/e2e/helpers.ts` 通过，人格目录与网页人格库两个测试文件共 5 项通过。对 `apps packages infra scripts` 的 Biome 检查报告 74 项错误；根目录检查因本地 `.pytest_cache` 拒绝访问而中止。Web E2E、Electron 生产构建及真实 PostgreSQL RLS 未运行；本机 Node 为 22.14.0，低于项目要求，Linux CI 仍需验证。
2026-11-08（PR #2）：`8c3091f6a` 的 macOS 打包截图通过，Linux Electron 43 项通过、1 项在另一条旧地址验证场景未找到暂态设置界面；原先恢复测试通过。第二条测试时序修正尚需复验。

2026-11-08（PR #2）：`6aea667d0` 的 macOS 打包截图、网页两分片及其他静态、单元和数据库检查通过；Linux Electron 43 项通过、1 项未找到暂态设置界面。已调整模拟下载时序，尚未在 Linux CI 复测。

2026-11-08（PR #2）：`d54637760` 的网页两组、PostgreSQL 两组、静态检查、单元、原生电脑与 Linux Electron 构建测试通过；独立 macOS 打包截图任务未找到设置页。测试窗口识别修正及诊断上传需下一轮 CI 复验，不能认定 macOS 问题已解决。

2026-11-08（PR #2）：`693bdda5c` 的静态检查、三组单元、两组 PostgreSQL、原生电脑、生产构建和网页第二分片通过；网页第一分片 48 项通过、1 项失败，失败于预填模型搜索的关闭操作，助手修正尚待 CI。

2026-11-08（PR #2）：`4fe549865` 的 Lint、类型检查、三组单元测试、两组 PostgreSQL 旅程、Windows/macOS 原生电脑及生产构建通过；隔离 PostgreSQL 行级安全测试 18 项、Electron 44 项和网页第二分片 47 项通过。网页第一分片 47 项通过、2 项失败：模型搜索角色和手机导航返回方式与当前界面不符；修正后尚待复测。

2026-11-08（PR #2 模型设置）：从搜索输入组件确认首次 Escape 清空搜索并阻止事件冒泡；已更新 E2E 检查清空和关闭，浏览器执行待 CI。

2026-11-08（PR #2 网页跟进）：根据 `72a9ca6c` 的失败日志及样式检查定位桌面表单隐藏、标题首列零宽；变更文件 Biome 检查通过（13 条原有样式警告），`git diff --check` 通过。修正后的完整浏览器验证尚未运行。上游推广组件已在 `77530d28c` 删除，相关遗留测试随之移除。

2026-11-08（PR #2 跟进）：`72a9ca6c` 的静态检查、三组单元测试、PostgreSQL 两组旅程、桌面生产构建与 Electron 测试通过；网页第二分片的同伴消息断言读取到空 runId。已调整为等待后核对，尚待新 CI 复测，不能排除实际消息归属问题；网页第一分片仍在运行。

2026-11-08（PA-018 人格隔离）：隔离工作区生成 Prisma 客户端后，DB TypeScript 检查及新增测试文件的 Biome 检查通过；本机 Docker 引擎未运行，新增 PostgreSQL 隔离断言尚未执行，需等待 Linux CI。

2026-11-08（PA-018 手机电脑接管）：新增横竖屏视口下接管和释放状态的 Playwright 断言；测试文件 Biome 检查通过，新增断言尚未运行，仍需 CI 浏览器及真实手机验证。

2026-11-08（PA-018 语言回退）：中文目录、语言加载和认证定向 Vitest 共 3 文件、24 项通过；测试覆盖缺失中文的普通文案回退。完整浏览器回归和线上缓存更新仍未验证。

2026-11-08（PA-018 页面标识）：Web TypeScript 和修改文件的 Biome 检查通过；页面标识、设置和群聊相关定向 Vitest 3 文件、26 项通过。新增群聊桌面及 390px 宽度的 Playwright 断言尚未运行；各路由和真实设备的视觉布局仍待验收。

2026-11-08（PR #2 跟进）：`8d790460` 的电脑接管、释放、关闭并重新打开 E2E 通过；空间 E2E 在设置打开时的背景按钮角色定位失败。Lint 的 Lingui 提取检查发现电脑预览新增文案遗漏；本地 `lingui extract --clean` 后中英文目录与提取结果一致，中文缺译为 0。空间调整和新目录仍需提交后复跑 CI。

2026-11-08（PR #2 注册测试）：相关 6 个测试文件及助手的 Biome 检查通过；Playwright `--list` 成功枚举 5 个相关文件的 15 项测试，只验证发现和加载，不表示测试已执行。Windows Docker 引擎未运行，未执行邮箱验证或浏览器注册链路；待 Linux CI 对本次提交验证。

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

## V-057：原生云电脑人工接管输入离线验证（2026-11-09）

- 范围：人工控制栅栏、原生输入事务、坐标映射、键盘/粘贴覆盖层、noVNC 几何上报、native-linux 驱动协议和权限边界。
- `pnpm exec vitest run apps/api/src/native-computer-control-fence.test.ts apps/api/src/native-computer-input.test.ts apps/api/src/computer-status.test.ts apps/web/src/lib/native-computer-control.test.ts apps/web/src/components/NativeComputerControl.test.tsx apps/web/src/novnc-html.test.ts packages/adapters/src/native-linux-sandbox.test.ts packages/adapters/src/computer-update.test.ts --maxWorkers=1`：8 个文件、103 项通过、2 项在 Windows 跳过；跳过项为真实 Unix socket 服务，Linux 路径需由 CI/服务器复验。
- `python -m unittest infra/native-linux/test_driver.py`：共 21 项，其中 19 项通过、2 项跳过；覆盖人工租约过期、撤销、旧栅栏、活动 Run 和输入动作限制。
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json`、`apps/api`、`packages/adapters`、`packages/contracts`、`packages/adapter-kit`：全部通过。
- 相关 18 个文件的 `pnpm exec biome check`：通过；`git diff --check`：通过。
- 未执行：生产部署、驱动服务重启、真实 X11 桌面点击/文本/滚轮、退出后旧租约拒绝、再次接管、Agent 恢复、断线提示的浏览器验收、手机横竖屏和移动端原生 WebView。未验证项不得写成已通过。

## V-058：原生云电脑画面连接离线验证（2026-11-09）

- 范围：原生回环画面链接复用、驱动临时不可用分类、明确拒绝和现有屏幕授权复核。
- `pnpm exec vitest run packages/core/src/node/screen-capability.test.ts apps/api/src/screen-proxy.test.ts apps/web/src/screen-proxy.test.ts apps/web/src/pages/shell/use-computer.test.tsx apps/api/src/native-computer-control-fence.test.ts apps/api/src/native-computer-input.test.ts apps/api/src/computer-status.test.ts apps/web/src/lib/native-computer-control.test.ts apps/web/src/components/NativeComputerControl.test.tsx apps/web/src/novnc-html.test.ts packages/adapters/src/native-linux-sandbox.test.ts packages/adapters/src/computer-update.test.ts --maxWorkers=1`：12 个文件、197 项通过、2 项 Windows 跳过。
- `pnpm exec tsc --noEmit -p` 分别检查 `apps/api/tsconfig.json`、`packages/adapters/tsconfig.json`、`packages/core/tsconfig.json`：通过；相关六个文件 Biome 检查及 `git diff --check` 通过。
- 未执行生产部署、线上日志复核、实际连接慢握手或断线重连；本地发现的风险不等于已确认线上故障原因。后续需在保护链接凭证的前提下逐段检查屏幕地址请求、Web 代理、驱动状态与 VNC 服务，并验证真实桌面和人工输入。

## V-059：人工接管点击层离线验证（2026-11-09）

- 删除常驻文字输入框和就绪后的底部遮罩，保留键盘/剪贴板输入及屏幕内直接点击转发。
- `pnpm exec vitest run apps/web/src/components/NativeComputerControl.test.tsx apps/web/src/novnc-html.test.ts --maxWorkers=1`：2 个文件、33 项通过。
- `pnpm exec biome check apps/web/src/components/NativeComputerControl.tsx apps/web/src/components/NativeComputerControl.test.tsx` 和 `git diff --check`：通过。
- 未执行生产部署前的真实桌面点击、触摸、右键和中文输入；需发布后实机复验。

# 2026-11-10 手机账户、连接应用与消息头像

- 使用本机已有 Node 24 对移动端运行 TypeScript 检查，通过；默认 Node 22.22.0 不满足仓库版本要求，首次 pnpm 检查被版本门禁拒绝。
- 消息头像身份、查询缓存和连接缓存定向测试 3 个文件共 17 项通过；账户及连接页面定向测试 2 个文件共 49 项通过。群聊实际头像、画面布局及缓存刷新仍需设备验证。
- 云电脑控制链路已通过源码对照发现手机缺少原生 Linux 输入通道；未实施修复或执行远程接管测试。第三方 OAuth 未配置、未执行实际登录。
- 本轮涉及的 9 个移动端代码及测试文件通过 Biome 检查；未构建、部署、签名、安装或执行 iPhone 实机验收。

# 2026-11-10 手机原生云电脑接管

- 移动端云电脑输入、屏幕、键盘和刷新定向测试 4 个文件共 83 项通过，覆盖几何解析、受信页面、坐标和留白、方向变化、点击与滚动、键盘映射、租约输入、断线停发、队列顺序和失败不重试。
- 移动端 TypeScript 检查通过；改动涉及的 6 个移动端代码、测试及中文语言文件通过 Biome 检查，既有测试代码有一项非阻断风格提示。
- 未连接真实手机、屏幕服务或云电脑；未验证服务端当前版本、真实接管、触摸精度、输入法、横竖屏、租约回收或网络中断。未构建或安装新包。

# 2026-11-10 X MCP 登录调查

- 对照用户截图、仓库的手机授权流程和 Web MCP 编辑能力，并查阅 X 官方 MCP 与计费文档；结论仅为协议和费用条件分析。
- 未持有 X 开发者凭据，未访问用户 X 账号、测试服务端部署策略、运行桥接或完成真实登录。其他应用登录原因尚未逐项排查。

# 2026-11-10 项目与工作区规划

- 对照现有需求、架构、桌面客户端联调计划、文件与权限边界形成方案；本次为文档规划，不包含代码或运行时验证。
- 设备连接、本地目录隔离、文件同步、真实云电脑与桌面客户端联调均未实现或验证。

# 2026-11-10 文件夹工作区规划补充

- 对照现有 Space 与群聊文档，补充文件夹内 Bot、群聊和聊天的隔离要求；Space 同时涉及云电脑和连接资源，尚未证明可直接作为文件夹边界。
- 当前仅更新需求和设计文档，底部入口、工作区切换、数据隔离与 Bot 项目操作均未实现或验证。

# 2026-11-10 双端项目协同规划核对

- 静态对照 PA-022、项目工作区方案、ADR-0022 和桌面长期计划，补充双端协同及模块验收；现有元数据迁移未应用，完整隔离与创建门禁未验收。
- 本次未运行服务、数据库、构建或真实设备联调；文档方案不构成项目功能已实现的证据。

# 2026-11-10 桌面构建更新保护门禁

- 更新保护测试采用与连接测试相同的报告检查，实际 Windows runner、打包程序和更新网络行为仍待验证；不能将静态核对当成打包验收。
- 提取工作流的测试脚本并用 PowerShell 解析器检查语法，通过；静态检查确认更新测试恰好列出一次且报告门禁包含跳过和通过状态检查。首次提取命令因正则匹配耗时被中止，改为按行提取后完成；未运行工作流。
- 窗口选项的两个源码和测试文件通过 Biome 检查；当前 pnpm 提示忽略部分仓库配置，本次仅检查格式，未安装依赖或构建。
- 从工作流提取实际报告判断并用内存模拟报告执行：单项通过被接受，跳过、缺失、标题不匹配、失败和重复均被拒绝。这只验证报告门禁逻辑，不验证 Playwright 真实报告、Electron 启动或 Windows runner。
- 只读查询并获取当时远端 `main` 的提交对象用于比较：该提交不含手动构建工作流，与当前 HEAD 各有 3 个独有提交；本机 `gh` 未找到。未修改分支、提交、推送或触发构建；远端状态需在实际执行前重新核对。首次对象检查因 PowerShell 未将 Git 修订表达式整体引用而失败，改正后完成。
- 对照 GitHub 官方手动运行工作流文档，确认 `workflow_dispatch` 需要工作流在默认分支，网页和 REST API 也是手动触发入口；因此仅推送本工作流到非默认分支不足以采用当前手动构建路线。未验证仓库写权限或 Actions 配额。
- 当前工作区执行 `pnpm exec tsc --noEmit -p apps/desktop/tsconfig.json` 与 `pnpm exec tsc --noEmit -p apps/desktop/tsconfig.jsdom.json`，均通过；pnpm 提示忽略部分仓库配置。该检查不包含真实打包或运行验证。
- 当前工作区执行 `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` 通过；先前记录的 `Shell.tsx` 类型错误在本次检查中未复现。pnpm 同样提示忽略部分仓库配置；此结果不能证明 Web 构建或 Electron 中的真实页面加载成功。

# 2026-11-10 D 盘 Electron 依赖恢复

- 安装前确认 D 盘可用约 41.6 GiB；使用现有 Node 24.15.0 运行仓库内 Electron 45 安装器，二进制位于 `D:\33054\Sydney-personal-agent\node_modules\.pnpm\electron@45.0.0\node_modules\electron\dist`。
- 首次安装器下载因 `fetch failed` 失败，镜像下载文件的 SHA-256 与锁定包内 `checksums.json` 一致；原安装器从 D 盘缓存安装成功，`dist/version` 和 `ELECTRON_RUN_AS_NODE=1` 版本输出均为 `45.0.0`。下载的 Electron 可执行文件 Authenticode 状态为 `NotSigned`，不能声称签名已验证。
- 这只是开发依赖恢复；未安装 Sydney 桌面程序、执行桌面打包、启动 GUI 或验证 Web 界面。默认 Node 22.22.0 仍低于仓库声明的最低版本；已使用现有 Node 24 执行安装。
- 清理两个下载副本的命令被自动执行策略拒绝，相关缓存保留在 D 盘，未尝试绕过。

# 2026-11-11 桌面测试发现

- 使用现有 Node 24.15.0 运行桌面 `setup.spec.ts` 的 Playwright `--list`，发现 29 项测试，包括四项 PC 后台连接测试和一项打包更新保护测试；该命令没有执行测试或启动 Electron。
- pnpm 仍提示忽略部分仓库配置；本机实际打包、GUI、连接和 Web 视觉验收未执行。

# 2026-11-11 本机 Windows 目录包实际验证

- 用户明确允许本机定向构建、打包和桌面测试后，使用已有 Node 24.15.0 执行 `pnpm --filter @rakazo/web build` 和 `pnpm --filter @rakazo/desktop build`，均成功。Web 提示部分产物大于 500 kB，pnpm 提示忽略部分仓库配置，均未阻止本轮构建。
- `electron-builder --win --x64 --dir --publish never` 配合已恢复的 D 盘 Electron 分发目录打包成功；缓存和临时文件均指定在 D 盘。其他平台可选依赖缺失提示未阻止 Windows x64 打包。
- 产物为 `apps/desktop/out/win-unpacked/Sydney.exe`，SHA-256 为 `78deb190b7264e9651bcd9138acd6639285d897ffb95faf16d31ed1769b179e0`；`resources/app.asar` 的 SHA-256 为 `e614fbb9ed274c934c8d9e04c456ac8b0454e0c71e04924ec2a858d2e33037da`。可执行文件 Authenticode 状态为 `NotSigned`；目录包不是安装器。
- 五项打包客户端测试实际通过：正常连接、不可达恢复、非法地址拒绝、健康响应错误拒绝和更新保护。JSON 报告统计为通过 5、跳过 0、失败 0、重试不稳定 0。服务为本机模拟服务，不代表生产后台联调；临时用户数据位于 D 盘。
- 随后 24 项扩展设置测试中，终端报告 22 项通过后用户明确要求“别测了”；运行会话经中断退出，剩余 2 项未完成，不记为整个套件通过。没有继续启动其他测试。
- 新增包内 Web 资源测试尚未执行；第一次静态检查报告空模式和格式问题，已修改但未复验。真实账号聊天、Web 工作台视觉、云电脑、项目工作区和安装流程仍未验收。
# 2026-11-12 工作区恢复优化复验

维护机以私有挂载命名空间、真实 age 和合成数据运行加密暂存恢复测试，1 项通过；测试设备未发现同前缀残留，测试代码及 Python 缓存按清单和摘要核对后清理，systemd 为 running。首次启动因 SSH 命令引号错误未执行测试。独立受限 systemd 单元以 456609793 字节单个合成文件、1.5 GiB 加密暂存复测，日志显示 1 项通过并正常结束；重归档时采样空余 617000960 字节，优化前同类测试采样为 160378880 字节，均非完整峰值曲线。测试目录、同前缀 loop 和 dm 映射未见残留，代码及缓存按清单和摘要核对清理。单文件测试不能保证真实多文件工作区所需容量，上述结果不证明真实工作区恢复或生产回滚。

# 2026-11-12 生产写入面只读续查

通过 Docker 容器检查汇总运行服务及可写挂载：API 和 Worker 可写 appdata，
Web 可写 webassets，Caddy 可写两个卷，PostgreSQL 可写数据卷，两个原生辅助
容器有可写 socket 或代理挂载。API、Worker、Web 和 PostgreSQL 显示 healthy，
Caddy 及三个原生辅助容器运行。使用 PostgreSQL 只读聚合查询，除当前查询外
有 14 个 idle 网络客户端；未输出账号、连接地址、SQL 内容或业务数据。
该时点结果不识别客户端归属、不证明其不会继续写入，也不覆盖宿主机进程或
外部系统；未停服务、采集数据、执行生产回滚或探测公网业务。

# 2026-11-12 原生运行配置加密备份及隔离恢复

生产时点 `sydney-screen-vnc`、`sydney-screen-websockify`、`sydney-mihomo`
均 active；只读检查发现对应五个 unit 和 drop-in 为 root 所有普通文件。
复核生产和维护机收件人文件摘要一致、生产独立 ext4 暂存及既有工具摘要后，
采集这五项；采集退出 0，前后 systemd 状态信息一致，密文 10440 字节，
SHA-256 为 `6aaf99faf9291db5f755fe641ee863fa3c1dd43bb7999d31f080fd6bda8df6c0`。
维护机在已核对的独立 ext4 接收区解密到内存，五项内容摘要、大小和数字
UID/GID/模式与事后生产时点一致，再排他发布密文。随后从已发布密文在
确认的 tmpfs 中恢复五项，逐项重新读取并核对内容和数字权限，按已创建清单
清理；复查未发现同前缀目录。两端密文事后摘要相同，三项服务仍 active，
维护机 systemd 为 running。

解密及 tmpfs 不保证排除 swap、特权观察或安全擦除；源文件与其他组件不是
同一一致点，权限对照不覆盖 ACL/xattr。未验证这些 unit 引用的所有配置、
可执行程序、凭据、桌面会话及网络依赖，也未在恢复环境启动服务。该结果
不证明完整原生电脑恢复、生产备份或生产回滚。

# 2026-11-12 原生代理配置备份及隔离恢复

只读检查活动代理进程的路径参数，发现一个 root 所有配置文件和一个服务账号
拥有的目录；目录时点包含两个普通文件及一个子目录，文件共 195768 字节，
其用途和在线一致性未知。配置文件为 root 所有、模式 0640，未发现扩展属性，
祖先目录无符号链接且归 root 所有。使用已核对摘要的配置备份工具及独立 ext4
暂存采集配置文件，前后进程与所选路径一致；加密退出 0，密文 10440 字节，
SHA-256 为 `cd58d91b295d5e77054c7bba91bc763a04bea80ddf3e512c0112dab0fe4c3be5`。

维护机在已核对的独立 ext4 接收区解密到内存，与事后生产配置的内容摘要、
大小、UID/GID 和模式匹配；再在已确认 tmpfs 写入临时文件，重新读取并核对
内容和数字权限，清理后排他发布密文。两端事后摘要一致，维护机未发现同前缀
临时文件且 systemd 为 running，生产代理仍 active。未输出配置内容或参数。
此项不备份该目录、二进制及其余依赖；tmpfs 不保证无 swap 或安全擦除，数字
组 ID 不证明目标主机组身份相同，也未验证恢复后的代理启动或完整生产恢复。

# 2026-11-12 PostgreSQL globals 来源守卫候选

维护机运行五项定向测试通过，覆盖容器启动身份、数据库实例标识、错误镜像、
卷名与挂载点、只读卷、备库、非超级用户、来源变化及 pidfd 关闭。另在无网络
配置、只读根的全新合成 PG18 容器及专用合成 Docker 卷中检查真实来源，重启
容器后守卫拒绝旧来源；systemd 日志记录一项通过及正常结束。按标签查询未见
该次合成容器或卷，临时代码按清单和摘要核对清理，维护机 systemd 为 running。

生产仅以现有容器、卷及镜像期望调用只读守卫；固定 Unix socket 查询确认主库、
管理角色与实例标识可读取，两次来源复核通过，临时代码已清理，未采集角色或
输出实例标识、凭据及业务数据。守卫依赖可信 root、Docker daemon 和系统工具；
快照检查不是对任意竞态的证明，也不证明容器内数据库进程与挂载全程未替换。
尚未接入加密采集、独立容量和中断监督，未验证真实 globals 恢复或跨源一致点；
原生产采集入口仍硬阻断。

# 2026-11-12 globals 合成身份与加密接线

维护机真实 age 的六项针对性加密流测试通过，包括发布前回调拒绝、失败清理、
不覆盖已有文件、进程失败和超时。未重跑 64 MiB 以上工作区容量用例。
另在受限 systemd 单元、无网络配置的合成 PG18 容器和专用合成卷中，创建一个
无密码合成角色，通过来源守卫、容器内超时及加密流采集，解密结果包含该角色；
模拟发布前来源检查失败时未发布正式密文或保留候选文件。重启容器后旧守卫
拒绝；该单元日志记录一项通过和正常结束。

按标签查询未见合成容器或卷，未见同前缀临时目录，临时代码按清单和摘要核对
清理，维护机 systemd 为 running。密文及一次性身份只用于合成用例；未采集
生产角色。发布前注入的是检查失败，不是采集中真实并发替换；未验证容器强杀、
daemon 故障、空间隔离、真实权限恢复或跨源一致性，生产入口继续硬阻断。

# 2026-11-12 globals 限额暂存接线

维护机在私有挂载的合成 128 MiB ext4 环回文件和无网络配置的合成 PG18 容器中，
验证容量不足拒绝、真实 age 密文采集和解密，以及模拟发布前暂存检查失败时
不发布或保留候选密文；重启后旧来源守卫拒绝。首次测试把 ext4 自带的
`lost+found` 误判为残留，未完成后续检查；核对合成容器、卷、环回设备及目录
无残留且单元无进程后重置该测试单元的失败状态。修正断言后，新单元日志记录
一项通过及正常结束；同前缀合成容器、卷、环回设备和目录未见残留，代码按
清单与摘要核对清理，维护机 systemd 为 running。

发布前异常由注入检查失败模拟，未测试实际卸载或强杀时的本接线；空闲空间
检查无法预留容量或防止并发写入。未采集生产 globals，不能证明异常监督、
真实权限恢复或跨来源一致性；生产入口继续硬阻断。

# 2026-11-12 globals 发布前强杀合成演练

维护机使用无网络配置的合成 PG18、真实 age 及独立 systemd 控制组，将
globals 控制器暂停在加密完成、来源复核之后的发布前回调。暂停时只有一个
临时密文，其解密内容含指定合成角色，尚无正式文件；使用 pidfd 向控制器
主进程发送 SIGKILL，确认该进程退出并停止对应单元后，正式文件仍不存在，
同一 inode 的临时密文仍在，随后按身份核对删除。外层集成单元日志记录一项
通过和正常结束；同标签合成容器、卷、暂存环回及临时目录未见残留，测试代码
按清单和摘要核对清理，维护机 systemd 为 running。

此测试仅覆盖加密完成后的一个中断点，保留的临时文件表明强杀不会自动清理；
未证明加密进行中、容器内进程残留、链接发布瞬间、主机崩溃或实际生产
采集的安全性。未涉及真实角色，生产 globals 入口继续硬阻断。

# 2026-11-12 globals 加密器阻塞时强杀合成演练

维护机在无网络配置的合成 PG18 及独立 systemd 控制组中调用 globals 控制器，
用只执行 `sleep` 的受控替身代替 age，确认主进程及替身子进程在同一控制组、
输出目录仅有一个临时文件后，以 pidfd 强杀主进程。停止单元之前，主进程及
已跟踪替身子进程的 pidfd 均显示退出；正式密文未出现，原 inode 的临时文件
保留，随后核对并删除。外层集成单元日志记录一项通过并正常结束；同标签合成
容器、卷、暂存环回及临时目录未见残留，代码核对清理，维护机 systemd 为
running。

该替身没有执行真实加密，测试不证明 age 运行中的行为，也未追踪 Docker 容器
内的所有后代或覆盖发布瞬间、断电及 daemon 故障；临时文件残留仍需监督清理。
未采集生产角色，生产 globals 入口继续硬阻断。

# 2026-11-12 globals 来源检查结束复核

针对来源检查期间容器选择、容器或卷发生变化的缺口，候选在只读数据库查询后
重新检查这些身份及卷根设备和 inode。维护机六项定向测试通过，含模拟查询期间
容器启动时间、卷挂载点及容器选择变化；无网络合成 PG18 集成单元重跑一项通过，
日志记录正常结束。同标签容器、卷、环回和临时目录未见残留，临时代码经清单及
摘要核对清理，维护机 systemd 为 running。生产只读守卫复核通过并清理临时代码，
未采集角色或输出身份和业务数据。

这些前后比较依赖可信主机、Docker 及系统工具，不证明中间没有短暂变化，也不
证明真实采集、权限恢复、强杀清理或跨源一致性；生产 globals 入口继续硬阻断。

# 2026-11-12 Caddy 合成清单候选

维护机 root、tmpfs 合成目录执行四项定向测试通过：覆盖两个不同目录和文件
摘要、拒绝符号链接及可写文件、大小限制、来源重复、清单生成后内容变化，
以及仅显式启用时接受 root 所有 sticky 根目录。测试代码经清单和摘要核对清理。
候选使用已有采集器的描述符访问和清单复核；测试没有运行真实 Caddy 卷采集、
真实 age 加密或恢复，也未验证多卷一致点、挂载竞争、强杀及全部攻击情况。
仅允许合成内部调用，生产入口继续硬阻断。

# 2026-11-12 较新在线数据库及应用数据副本与隔离恢复

生产使用 SHA-256 `ea120679b2864a07ed454589739e4ff64bf88aed19a4335cc29bc898a86664ac`
的既有备份工具，在独立限额 ext4 上在线、分时采集数据库与 API 数据；
瞬时单元日志记录采集完成并正常结束。数据库密文 2183575 字节、SHA-256
`d29c427fdd4f2ff1afe1b0426914787067ea5696c3ad26a7c369eb2524a4026a`；
appdata 密文 4715554 字节、SHA-256
`1a8bedaa0657ea97a3cb89221514d88bd6a8512a068e2bd16f1d3726bbdd37bb`。
生产核验完成标记与三个清单摘要；维护机接收时限制四个固定普通文件、
逐项核对长度和 SHA-256 并写入接收完成标记，两端传输退出 0。

维护机从此批次恢复至新建无外网 PostgreSQL 容器，使用非登录占位角色而非
真实 globals；age 和 pg_restore 均退出 0。以现有配置密钥和当前应用镜像
在隔离容器中读取恢复数据：1 条空间密钥和 25 个加密消息块通过检查；
API 健康及就绪为 200，短期合成会话有效，无认证 RPC 返回 401，抽样读取
4 个 Bot、1 个群聊、51 条消息及 3 个附件。暂停隔离数据库时就绪为 503，
恢复后为 200。appdata 恢复 14 个文件、4708191 字节；为演练重设目标
属主和权限，未验证原始文件权限。对象 ACL 及 RLS 策略汇总分别为 1290
条和 115 条，摘要与此前记录的生产时点相同；MD5 汇总不是完整权限证明。

恢复单元日志记录两个临时容器清理及正常结束；查询时单元已卸载，不使用
not-found 默认状态作为终态证据。事后两类演练容器和临时 appdata 目录
未见残留，密文清单复核通过，临时脚本按摘要清理；维护机 systemd 为
running，生产 API、Worker、Web 和 PostgreSQL 显示 healthy，Caddy 运行。
明文经内存及 tmpfs，不保证无 swap 或安全擦除。

本批次数据库与 appdata 在线分时采集，不含真实角色 globals、工作区、
Caddy 卷和其他依赖；现有配置备份也不是同一时间点。合成会话不是用户真实
登录，抽样不代表所有数据、权限或跨源一致。未验证生产回滚。

# 2026-11-12 恢复驱动隔离重启演练

维护机核对既有四文件驱动密文摘要，在内存解密并提取其中驱动源码；源码
SHA-256 与生产时点磁盘源码一致。受限 systemd 单元检查私有网络仅有
loopback、恢复目录为 tmpfs，将源码放入匿名内存文件，以 UID/GID 64001、
合成工作区和临时 Unix socket 启动驱动；socket 激活参数仅供本次演练。
非授权 UID 的连接未获得响应，授权 `nobody` 对端的合成 provision 和 status
成功。停止并重新启动隔离驱动后，新代次与旧代次不同：旧代次请求被拒，
新代次 status 成功；未输出代次、业务数据或真实工作区内容。

首个单元失败但未记录具体阶段；增加脱敏阶段信息后，第二次在首次合成
provision 后出现 PermissionError。增加监督进程停止其他 UID 子进程所需
能力并补充新旧代次对照后，第三次日志记录
`restored_driver_peer_and_restart_generation_verified` 及
`Deactivated successfully`。查询时瞬时单元已卸载，不以 not-found 默认
状态代替终态日志；控制组及同前缀临时目录未见残留，代码按摘要核对清理，
前两次失败单元在确认无主进程和控制组后重置，维护机 systemd 为 running。
生产驱动及 socket 当时 active，API、Worker、Web 和 PostgreSQL 显示
healthy，Caddy 运行。

演练信任宿主、systemd、内核及已备份源码；不验证生产当前内存代码、真实
账号映射、桌面显示、实际工作、旧任务结束、数据库代次协调或生产重启。
临时源码及工作区可能经过内存和 tmpfs，swap 与安全擦除不受保证；结果不
代表生产工作区恢复或真实回滚通过。

# 2026-11-12 原生驱动重启恢复边界只读核查

生产主机对 `/opt/sydney-native/driver.py` 做 AST 结构检查，发现一处
`generation` 赋值使用随机 UUID；驱动运行进程参数包含该路径，服务配置
`KillMode=control-group`。磁盘源码 SHA-256 为
`e23d9ceb43396be64f5aadb45684c72070d3f21067b86b9a879a33b601ac07c6`。
此次未读取运行进程内代码或当前 generation，故不能证明进程已加载该磁盘
版本或当前数据库引用与之相符。既往 V-060 曾记录重启后旧引用失配；
此次未重启驱动、查询或修改用户数据、验证任务停止或执行代次协调。

# 2026-11-12 原生代理隔离启动验证

维护机瞬时 systemd 单元从三份固定摘要密文解密原生代理二进制、启动配置和
提供方文件；单元使用私有网络、私有临时空间、只读系统、受限能力和资源
上限。启动前核对网络命名空间不同于启动器读取的宿主 PID 1 网络命名空间，
其中仅有 loopback，临时文件系统为 tmpfs。二进制写入匿名内存文件；进程
降至 UID/GID 64000，检查有效 capability 为零。只在临时配置中关闭 TUN、
DNS、外部管理入口及健康检查，将提供方地址替换为不可达的本机端口；未
输出配置、订阅地址或提供方内容。

实际运行恢复二进制配置检查后，启动代理并在该私有网络内连接其回环监听。
日志记录 `proxy_config_verified`、`isolated_proxy_config_and_listener_verified`
及 `Deactivated successfully`；查询时瞬时单元已卸载，not-found 默认状态
不作为成功证据。运行后该单元控制组、同前缀 tmpfs 目录均未见残留，临时
代码按摘要核对清理，维护机 systemd 为 running；生产代理 active，API、
Worker、Web、PostgreSQL 显示 healthy，Caddy 运行。

首次及后续两个单元在隔离检查阶段报 PermissionError；受限能力下无法直接
读取 PID 1 网络命名空间，改由受信启动器读取并传递，再由单元对照。随后
两个单元在三份密文解密后、临时文件准备阶段报 PermissionError；调整临时
材料的创建和属主设置顺序后，最终单元通过。一次查询遇 SSH 连接重置，重连
后核对同一单元终态；失败单元确认无主进程和控制组后，按各自代码摘要清理
并重置失败状态。

该演练修改了临时配置，且未恢复缓存，不验证生产原配置的 TUN、DNS、实际
代理转发、外部订阅、真实网络、重启或权限映射，也不构成完整业务恢复、
一致恢复点或生产回滚。隔离依赖受信宿主、systemd 与内核；明文在内存及
tmpfs，不能保证无 swap 或安全擦除。

# 2026-11-12 原生代理二进制加密副本及恢复

生产只读检查确认代理运行进程的可执行文件设备号和 inode 与 root 所有的
`/usr/local/bin/sydney-mihomo` 一致，文件为静态链接 x86-64 ELF，大小
62079102 字节、模式 0755。使用既有配置加密工具在限额 ext4 暂存采集；
服务进程身份、文件身份和 SHA-256 在采集前后匹配，密文 62100472 字节，
SHA-256 `bc43a70746673dbf476863d9619c8f670bd56234223c58f1e491f5b8e0b80026`。

首次 SSH 中转在 240 秒超时后结果未知；维护机核对待完成文件 61581312
字节、未见文件占用，随后源密文对应前缀与目标完整前缀 SHA-256 一致。
首次前缀检查因命令引号错误未执行，修正后取得上述结果；以目标文件 inode、
大小和前缀摘要为条件追加余量，全文件长度及摘要匹配后排他发布，续传两端
进程退出 0。未删除或覆盖既有密文。

维护机确认接收密文长度与摘要，使用既有恢复身份解密，检查归档仅含预期
普通文件；在 root 私有 tmpfs 恢复后，大小、UID 0、GID 0、模式 0755 及
SHA-256 `817f50b3ac6a8b1c4360c5cf2961906057f3a883d970ebbcb0028a01632b620f`
与生产时点一致，重新读取恢复文件再次核对摘要。首次恢复因维护机 Python
缺少 `hashlib.file_digest` 在写恢复文件前失败，改用分块计算后成功；未
执行恢复后的二进制。事后未发现对应临时目录或待完成文件，维护机 systemd
为 running，生产代理 active，API、Worker、Web 和 PostgreSQL 显示 healthy，
Caddy 运行。

此为运行二进制的文件级在线副本，前后身份和摘要检查不构成一致快照，未
恢复配置、缓存、账号、服务、TUN 或路由，亦未验证全新机器启动和生产回滚。
明文经内存和 tmpfs，swap、特权观察者和安全擦除不受保证。

# 2026-11-12 代理提供方在线备份及异机恢复

核对收件人与恢复身份、两端限额 ext4 挂载和生产 age 文件后，使用现有配置
加密工具采集正在运行的代理提供方文件。工具显式信任 UID 999 的输入祖先；
生产端固定代理服务 PID、启动时间及配置参数，并在采集前后对启动配置和
提供方文件的身份与内容摘要进行对照。采集成功，密文 174312 字节，
SHA-256 `ca4c24f595b31ddd4c4fc88a70f80cf056c1ebf271b4d6efea9ccedae7b03976`。

通过 SSH 二进制流将密文复制到维护机独立接收区，接收时核对长度和摘要并
排他发布；两端传输进程均退出 0，事后两端摘要一致。维护机以既有恢复身份
在内存解密，检查归档恰有一个普通文件，再在 root 私有 tmpfs 目录恢复，
核对恢复后文件内容及 UID 999、GID 987、模式 0644；临时随机 HMAC 对照
恢复文件与事后生产文件，163000 字节内容和数字权限一致。未输出配置、
提供方地址、业务数据或 HMAC 值。临时目录及候选文件事后未见残留；代理
服务 active，API、Worker、Web 和 PostgreSQL 显示 healthy，Caddy 运行，
维护机 systemd 为 running。

此项信任生产主机、服务账号和工具；前后对照不能排除期间短暂变化、恶意
同权限进程或与其他来源不一致。内容和权限只对应本文件，不含缓存、目录
元数据、ACL/xattr、代理二进制及实际服务启动；UID/GID 数字一致不证明
目标账号语义一致。明文经过内存及 tmpfs，swap 和安全擦除不受保证。
生产全量恢复和回滚仍未执行。

# 2026-11-12 代理提供方文件依赖只读核查

在生产主机进程内只读解析运行中代理的 `-f` 配置：包含一个 HTTP 代理
提供方，其相对路径位于运行数据目录且对应现存普通文件；按设备号和 inode
对照，匹配此前观察到的目录内配置类文件。再次核对时代理进程启动时间未变；
未发现规则提供方。仅输出数量、类型和身份匹配结果，未输出配置内容、提供方
名称、地址或数据。配置解析与文件查询并非原子操作，未验证代理实际使用、
自动更新、缓存恢复、网络下载或启动失败行为。未采集或恢复此文件，不能将
已备份的 `-f` 配置视为覆盖该提供方数据。

运行配置只读解析还显示 TUN 启用，代理提供方设置的更新间隔为 86400 秒。
这不是下一次更新时刻、更新成功或停止代理后网络仍可用的证据；没有停止
代理、触发更新或测试管理连接恢复。

采集前置只读检查：生产已解包 age 可执行文件与现有本地 deb 内对应文件
的 SHA-256 一致；两机已有收件人文件摘要一致，维护机恢复身份派生的公钥
摘要也与之相同。生产暂存和维护机接收区时点均为独立 ext4 loop 挂载且
含 `nodev,nosuid,noexec`；该检查未验证 deb 来源真实性、后续可用空间、
挂载及文件竞争，也未生成或复制提供方备份。

对该提供方文件另以不跟随符号链接的描述符逐级检查：文件为 UID 999 所有、
模式 0644 的普通文件，链接数为 1，无扩展属性；祖先目录当时均由 root 或
UID 999 所有、无组或其他用户写位，未观察到扩展属性。既有配置备份工具
允许显式信任额外 UID 的输入祖先，但这意味着必须完全信任该账号修改路径；
时点权限检查不能证明这一前提或排除并发更新。本轮未调用工具采集。

# 2026-11-12 原生代理目录只读续查

从运行进程的目录和配置参数定位已有数据目录，未输出参数值或文件内容。
目录为非符号链接根；遍历观察到一个子目录、两个普通文件，包含一个
`cache.db` 和一个配置扩展名文件，未观察到链接、特殊文件、硬链接或扩展
属性。缓存为 32768 字节、模式 0644，文件头不是 SQLite 标准文件头；
两个文件当时均为 UID 999、GID 987、模式 0644。
按设备号和 inode 的单次进程描述符扫描观察到代理进程以可写方式打开该
文件，扫描中有一项不可用。文件头检查不确定其实际格式或可恢复性。

以内存 SHA-256 对照目录内配置类文件与进程 `-f` 指定配置，二者内容不同；
未输出摘要或配置。检查不是原子快照，源可能同时变化，不能排除其他依赖；
本轮未采集或恢复该目录，也未验证缓存及配置文件是否必需。之前已恢复的
单独启动配置不能代表整个代理数据目录。

# 2026-11-12 生产停写只读盘点

生产 API、Worker、Web 和 PostgreSQL 容器当时显示 healthy，Caddy 与三个
原生辅助容器运行；原生驱动与 cron 服务 active。只读 inspect 显示 API 与
Worker 的重启策略均为 `unless-stopped`，Worker 的 `StopTimeout` 为 3000
秒、API 未显式设置，两者停止信号字段为空。未停止容器，未验证实际停止、
任务排空或重启行为。列出的系统定时器包含 certbot、软件更新及清理任务；
未检查每个任务的全部执行链和写入影响。

宿主机进程文件描述符、工作目录及映射的单次扫描未观察到工作区路径匹配；
有一项扫描失败，且该方法不能覆盖所有命名空间、未来或远程写入。该结果
不是停写证明。本地源码与线上运行镜像的对应关系本轮未验证。

# 2026-11-12 Caddy 清单加密衔接准备

新增合成衔接用例，但本轮未运行，也未验证真实加密、解密或恢复结果。
本机仅完成新增 Python 文件语法解析及四份记录的 `git diff --check`。
维护机只读检查显示 `/usr/bin/age` 和 `/usr/bin/age-keygen` 不存在，系统
软件仓库列有 age 候选包；未下载或安装。现有候选文档要求服务器执行前
独立审查，本轮未取得独立审查。维护机 systemd 当时为 running；生产主机
systemd 报告 degraded，失败项为屏幕截图相关的临时单元，未查明原因或处置。
这些检查不证明生产业务健康、完整备份恢复或生产回滚。
# 2026-11-13 手机联调设备复核

本机以只读方式枚举当前存在的即插即用设备，按 iPhone 和 Apple Mobile
Device 名称筛选无结果。沙箱内首次检查被拒绝，授权后检查正常完成；
名称筛选不能排除其他连接方式或设备名称，也不能证明签名、信任及安装
条件满足。本次没有安装、覆盖应用或操作设备数据；iPhone 实机联调未执行。

# 2026-11-13 账号名称切服竞态检查

静态检查发现修改名称请求先计算 URL、再异步读取会话，存在切服期间
混用的风险。已接入现有上下文捕获和发送前代次检查；本轮未执行测试
或真实客户端验证，不能据此将切服安全或双端联调标记为通过。
相关文件的 `git diff --check` 通过。
# 2026-11-13 staging 项目工作区覆盖静态核查

检查公网聊天探针、RPC 契约及 API 路由：探针使用 `spaces/create`
和跨 Space 群聊拒绝检查，未操作项目工作区；当前源码可见工作区契约
与数据库读取函数，但未找到对应工作区管理 RPC。未执行工作区 staging
或手机、桌面同步验证，不能将 Space 隔离结果当作文件夹工作区验收。
# 2026-11-13 镜像备份与生产状态只读复核

使用现有 SSH 管理连接只读检查：生产原生驱动报告 active，API、Worker、
Web 和 PostgreSQL 容器报告 healthy；Caddy 与原生辅助容器报告 running。
维护机既有镜像备份接收目录显示 ext4，挂载选项含 nosuid、nodev、noexec；
旧镜像差量和基础镜像两份密文的 SHA-256 分别与运维记录一致。
此检查未核验后备设备、恢复身份、其他备份、解密或业务，不能证明
跨源一致恢复点和生产回滚。未重启服务、挂载文件系统或采集生产数据。
# 2026-11-13 生产工作区文件系统只读检查

通过 SSH 在生产机只读查询工作区路径的文件系统及块设备类型：该路径
位于 ext4 根分区，块设备列表未显示 LVM 或设备映射层。检查没有创建
快照、读取项目文件或停止服务；不排除云平台另有快照能力，不证明
数据库与文件可在同一时点恢复。工作区采集入口仍不可用于生产采集。
# 2026-11-13 云盘快照候选路线核查

生产机只读识别为 KVM、Tencent Cloud CVM。先前记录称已查阅腾讯云
快照文档，但未取得可核对来源，相关厂商能力结论撤回；待重新核实。
未登录云平台或核验当前实例的云盘类型、配额、费用及控制权限，未
创建快照或恢复；这一候选路线不改变现有采集与回滚硬门禁。

# 2026-11-13 云管理工具只读检查

生产机 `PATH` 中未发现 `tccli`，root 默认配置目录不存在。未读取
凭据，也未检查其他用户、实例角色或云控制台；该结果不证明没有
其他可用的云端访问方式。

# 2026-11-13 腾讯云快照公开资料复核

后续重新取得腾讯云的[创建快照](https://cloud.tencent.com/document/product/362/5755)
及[创建快照组](https://cloud.tencent.com/document/product/362/115828)
文档，确认其描述云硬盘快照、快照组及缓冲区、数据库写入的一致性
限制。这纠正了此前无法取得来源的状态；该资料不证明当前实例磁盘
类型、配额、费用、权限或实际恢复能力。
# 2026-11-13 生产容器挂载范围只读检查

对运行中的 `rakazo-prod` 容器读取 Docker 挂载元数据，再以 `findmnt`
检查来源路径：PostgreSQL、API、Worker、Web 和 Caddy 的命名卷来源
均显示 ext4 根文件系统；7 个绑定挂载来源显示根文件系统。此前另行
检查的原生工作区路径也显示根文件系统。两次检查非原子，未枚举卷内
嵌套挂载、外部服务或云平台磁盘；未读取数据文件、创建快照或更改服务。
该检查不能证明完整快照覆盖或一致恢复。
# 2026-11-13 实例磁盘元数据只读检查

仅请求实例元数据的 `volumes` 及匹配到的存储项 `disk-type`，
并在生产机内部比较本地设备信息；按预期格式识别到一项，类型返回
`CLOUD_SSD`。`/dev/vda` 序列号为空，by-id 链接未匹配到该存储项，
因此该结果不证明它是根盘或覆盖完整。未输出标识、读取云凭据、
调用云管理 API 或创建快照；磁盘关系和权限仍待核实。
# 2026-11-13 生产宿主机嵌套挂载检查

只读读取生产宿主机 `mountinfo`，对照 7 个运行容器命名卷来源和
原生工作区路径，8 个来源路径下未发现嵌套挂载。检查为时点观察，
仅覆盖执行进程所在挂载命名空间；未检查所有容器命名空间、外部
资源、磁盘身份或快照恢复。
# 2026-11-13 部署失败恢复路径核查

静态阅读本地部署脚本：错误处理会硬重置源码、恢复应用镜像并调用
发布流程；后者在配置迁移服务时会运行迁移并处理 Worker。只读核查
生产环境时，API 容器记录的 Compose 工作目录下没有同路径部署脚本，
部署 launcher 存在；未核对 launcher 最终调用脚本或实际执行。
本检查未改变生产服务，也不证明生产脚本行为或数据回滚可用。

后续只读摘要比对：生产 launcher 与本地 launcher 一致；该 launcher
从目标 Git 修订读取部署脚本。生产记录的已部署修订中，部署脚本
与本地摘要一致。首次读取 Git 对象失败，使用单次安全目录选项后
成功；未改变 Git 全局配置。未来目标修订和实际执行行为未验证。
# 2026-11-13 生产部署目录未提交状态

只读运行 Git 状态并仅汇总数量：已跟踪文件状态记录 0 条、未跟踪
文件记录 5 条；没有输出文件名或内容，未枚举忽略文件。该观察
不识别目标版本覆盖冲突或其他窗口后续写入；未执行重置或清理。
# 2026-11-13 生产部署目录路径冲突检查

只读比较 Git 状态中的 5 条未跟踪路径、`ls-files --directory` 返回
的 3 条折叠忽略路径，与当时 HEAD、本地 `origin/main` 及历史记录中
一个旧修订的递归 Git 文件树；三种比较的相同或父子路径冲突均为 0。
未输出路径；未跟踪与忽略列表分别采集，检查非原子。目录折叠及嵌套
Git 工作区可能影响覆盖，旧修订也不是已选定的回滚目标；不证明
其他修订或未来状态安全。未重置、清理或修改生产工作区。
# 2026-11-13 近期备份跨版本隔离群聊恢复

维护机运行 `run-recent-restore-recheck.py --cross-version-groups`，
先核对既有密文摘要，再恢复分时数据库和 appdata。无外网隔离环境
按当前版、历史版、当前版启动固定应用镜像：当前版创建合成群聊，
旧版读取并创建另一合成群聊，恢复当前版后读取两者；三个阶段均
完成健康、恢复数据抽样、未认证及跨账号拒绝、数据库暂停和恢复
就绪检查。进程退出 0，事后两类标签容器和临时目录均为 0。
各阶段 appdata 分别从密文重新提取，合成群聊仅写入临时恢复库；
未验证跨版本文件写入、真实登录、真实工作区、跨源一致性或生产
回滚。明文经过内存及 tmpfs，不能保证不进入 swap 或安全擦除。
# 2026-11-13 近期备份跨版本附件隔离恢复

维护机运行 `run-recent-restore-recheck.py --cross-version-artifacts`：
先核对并恢复既有分时数据库及 appdata 密文，再在同一临时 appdata
目录和无外网数据库环境中依次运行固定的当前版、旧版、当前版镜像。
当前版创建合成附件，旧版读取该附件并创建另一附件，最后当前版
读取两者且内容逐字节匹配；各阶段已有恢复附件抽样、鉴权拒绝及
数据库暂停恢复检查通过，进程退出 0。事后两类标签容器、应用、
共享数据及运行器临时目录均为 0。

演练仅写入临时恢复数据库和 appdata，没有操作生产文件；备份源为
分时副本，未验证真实工作区、正式用户登录、跨源一致性、强杀后的
清理或生产回滚。明文经过内存和 tmpfs，不保证不进入 swap 或安全
擦除。
# 2026-11-13 近期备份隔离跨版本密码登录

维护机无外网环境恢复分时数据库与 appdata 后，以随机合成账号依次
在当前版注册、旧版登录、当前版登录；三次 session 读取通过，旧版
及当前版均拒绝错误密码。相关应用健康、恢复消息与附件抽样、
未认证与跨账号拒绝、数据库暂停恢复检查通过，最终退出 0；事后
临时容器与目录计数均为 0。

前四次演练在合成注册处返回 500；脱敏日志分类出现 RLS 校验错误。
演练把数据库角色密码替换为随机值，却未同步权限校验摘要；在临时
恢复库按该合成密码同步摘要后通过，结果与此原因一致。只在隔离
副本启用注册并修改权限校验摘要，未改变生产；不验证真实账户密码、
原备份中角色及权限完整恢复、真实客户端、跨源一致性或生产回滚。
诊断日志仅存于临时容器的 tmpfs，内存及 swap 不保证安全擦除。
# 2026-11-13 工作区采集容量只读观察

生产机执行 `du -sx -B1`，工作区在该时点同文件系统分配块合计
473100288 字节；既有工作区暂存目录当时显示 ext4 挂载、可用
1003900928 字节，选项包含 `nosuid,nodev,noexec`。首次命令因本机
PowerShell 引号解析失败，远程统计未执行；改为传入固定 Python
程序后成功。两次观察非原子，未核对暂存后备身份及归档逻辑大小、
峰值或动态写入，不能证明可安全采集或恢复。未读取文件内容、采集
数据或变更服务。
# 2026-11-13 独立节点 IP 证书定时检查

本机与独立维护节点均以系统信任库验证公网 IP 证书，健康接口
返回 HTTP 200。维护节点启用 systemd 定时器后首次执行成功，
报告证书剩余约 157.6 小时；定时器显示 enabled、active，
下一次约一小时后。systemd 单元校验输出现有 snapd 服务
`RestartMode` 不识别警告；本次单元校验及首次执行成功。
首次远程命令末尾日志查询受换行符影响失败，之后单独查询成功。
未验证后续定时触发、证书实际续期或告警送达。

# 2026-11-13 桌面生产 IP 匿名页面

使用 2026-11-11 的 Windows 目录包与临时用户目录，启动后确认
Electron 的用户和会话目录均指向临时位置；生产 IP 首页显示，
点击登录后进入 IP 登录页，邮箱及密码输入框可见。监听附加后
未发现页面异常；未输入账号、登录或检查所有网络请求。探测进程
退出并删除本次临时目录。初次主动导航与应用启动跳转冲突，第二次
误以为首页会自动跳转登录页而超时；按实际首页入口点击后通过。
未验证当前源码构建、安装器、真实账号、双端同步或云电脑。

# 2026-11-13 Windows 云端入口候选

Windows、Node 24.15.0 下桌面设置及 Passkey 两组定向测试共
64 项通过，覆盖 Windows 默认快捷地址、已保存旧域名配置及原
Passkey 域名。首次运行因既有测试用 POSIX 字符串比较 Windows
路径失败，修正测试路径构造后通过。未构建安装包或验证真实账号，
也未验证 IP 入口能使用旧域名 Passkey。

# 2026-11-13 生产 IP 密码重置页面

无持久会话的浏览器仅允许请求生产 IP 来源；`/reset-password`
返回 200 并显示重置表单及无令牌错误，未发现页面异常。生产公开
认证能力仍返回旧域名重置地址；只读检查确认运行镜像包含
`AUTH_PUBLIC_LINK_ORIGIN` 配置、当前未启用，IP 已列为可信来源。
未发送邮件或更改生产配置，不能证明真实重置和邮件送达。

# 2026-11-13 手机 IP 默认与会话兼容

Node 24.15.0 下手机配置、默认来源、API 和启动共四组定向测试
374 项通过；手机 TypeScript 检查通过。合成存储覆盖无来源记录、
旧域名、IP、其他来源、损坏和不可读来源记录；确认旧令牌及 Space
不变、不调用 SecureStore 写/删、不请求网络、不清理 outbox，来源
未知时阻止启动。配置测试确认正式 bundle ID 只可用于旧域名或生产
IP，IP 构建不带 OTA；侧载工作流默认值相符。未覆盖原生钥匙串、旧
IPA 升级、真实队列文件、并发登录、签名或设备；工作流未推送执行，
未构建新 iOS 产物。

# 2026-11-13 生产认证链接与屏幕来源

生产 API 首次部署尝试在写入配置前触发部署脚本变量名异常；自动
恢复流程重建并确认原配置 API healthy，核对没有第二个 API 后，
清理一个 UID/权限均匹配的临时状态目录。修正脚本后以部署锁及
10 分钟 systemd 定时恢复保护再次滚动：候选 API 先 healthy，容器内
认证能力返回 IP `/reset-password` 且 CORS 精确允许 IP，再移除旧实例。
终态仅一份预期完整镜像的 API 且 healthy；生产 overlay 中两项来源
均为 IP。生产 Caddy 内部请求验证 IP 与旧域名 `/health` 均为 200，
公网 IP 认证能力接口返回 IP 找回地址，定时器和暂存状态已清理。
其间本机访问公网 API 能力接口和 SSH 均曾单次超时，随后旧域名与
IP 健康均恢复 200，域名经固定 IP 的 HTTPS 校验返回 200；随后普通
公网域名请求返回 200（2.54 秒），IP 健康 200（0.08 秒），公网能力
接口 200（0.056 秒）。与短暂 DNS/SSH 超时相符，不能外推为持续
可用性保证。
未发送真实邮件、使用生产账户或授权会话验证屏幕及终端 capability；
不证明邮件送达、真实密码恢复、云电脑屏幕或客户端联调成功。

# 2026-11-13 生产入口持续状态与 iPhone 配对

公网 IP 与旧域名 `/health` 分别返回 200；IP 证书由系统信任库验证，
剩余约 157.1 小时。生产 API 单实例 healthy，实际环境变量为 IP
认证链接和屏幕代理来源。独立维护节点证书检查 timer 仍 enabled/active，
下一次约 25 分钟后。Windows 即插即用设备列表出现 Apple iPhone 与
USB 项，Apple Mobile Device Service 运行；iPASide 内置库在
`autopair=False` 下 usbmux 列表为 0。未读取配对文件、设备标识或
用户内容，未自动配对。真机验收待解锁手机并确认“信任此电脑”，
再复核 usbmux；证书续期和异常通知仍未验证。

## 2026-11-13 手机模型入口与头像验证

- 使用 Node 24 运行模型设置与聊天选择、消息头像、标题头像、聊天路由四个测试文件：79 项通过。覆盖自定义连接入口、模型弹层保存和添加动作；原生弹层动画、实际接口与图片加载未实测。
- 手机 TypeScript 检查未通过：`app.config.ts` 与 `app-config.test.ts` 的现有 ExpoConfig `autolinking` 类型不匹配，共 8 项诊断；本次修改文件没有剩余诊断。
- 尚未执行 iOS 原生构建、签名、安装、线上联调或 iPhone 验收。

## 2026-11-13 手机置顶响应与连接排查

- Node 24 下运行首页操作、滑动和列表渲染三个测试文件，共 54 项通过；
  覆盖即时状态、快速连续置顶与取消的写入顺序、失败回退和会话与工作区隔离。
- 手机 TypeScript 检查仍有 8 项 `ExpoConfig.autolinking` 相关诊断，位于未改动的
  `app.config.ts` 和对应测试文件；本次置顶改动没有其他诊断。
- 未复现真实断链，未读取生产日志或验证服务器运行状态；未在 iPhone 构建、
  安装或测量实际响应时间。网络超时后的服务端提交结果仍需以后续刷新核对。

## 2026-11-13 客户端直连与网页退役基线

- 静态检查移动端 RPC、桌面打包及启动、网页新建 Bot、认证和连接回调、
  屏幕代理、Compose 服务依赖及 API 构建标识。检查仅证明仓库源码路径，
  不证明生产配置、流量、第三方回调或实际设备行为。
- 纯文档盘点未运行测试；没有部署、删除、构建或连接生产验证。已有其他
  窗口的未提交修改被保留。

## 2026-11-13 手机 Bot 身份创建链

- 已编写身份字段、列表请求时切换工作区、创建请求期间更换账号的测试草案；
  根据当前阶段“不测试”要求，本轮未运行测试或类型检查，不能认定通过。
- 未构建或安装 iPhone 应用，未验证原生图片、人格库及与真实后台的交互。
- 对新增内置头像读取与选图流程仅做源码检查，未验证 iOS 打包后的资源 URI、
  文件读取或相册处理；界面交互、视觉一致性和弹层关闭后的导航均未实测。

## 2026-11-17 iOS 侧载包构建（run 44006236585）

- 代码提交 `e3a16f580` 已推送到 `cursor/integrate-remote-branches-7334`，触发工作流
  `mobile-ios-sideload.yml`；Run `44006236585` 各步骤成功，包括生成工程、移除推送权限、
  Pod 安装、权限核对、无签名构建、产物校验与上传。
- 产物名 `sydney-ios-unsigned-44006236585-1`，内含 `Sydney-unsigned.ipa`（25,964,841 字节）
  和 `SHA256.txt`；本地解包后重算 SHA256 为
  `bb3b9653f29868fb3a396dee23834852d0ac1347089b38d4c42273399f4dcc15`，与构建机输出一致。
- 构建变量为 `EXPO_PUBLIC_API_URL=https://124.221.182.39`、
  `SYDNEY_IOS_BUNDLE_ID=xin.zxlup.sydney`、`SYDNEY_COMPANION_EXPERIMENT=0`。
- 包内 `Info.plist` 显示 `CFBundleIdentifier` 为 `xin.zxlup.sydney`、版本 `1.0.12`、
  `NSAllowsLocalNetworking` 为真，未发现 `aps-environment` 或 `com.apple.developer.*` 权限；
  工作流的权限核对步骤同样通过。
- 包内 `main.jsbundle` 含 `124.221.182.39`；`pc.zxlup.xin` 只出现 1 次，位于默认地址守卫的
  旧来源迁移常量，不作为默认连接地址。
- 包内 `main.jsbundle` 含 `bot-avatars`、`projects` 相关代码，应用包内存在内置头像素材目录，
  说明新增 Bot 创建界面与项目工作区代码已进入本次构建。
- 未验证项：本机没有签名证书，未做 IPA 签名、安装或 iPhone 真机启动；未验证登录、新建 Bot、
  人格选择、项目工作区切换和聊天的真机表现，也未验证手机与桌面同账号数据同步。
## Bot 状态与持久记忆修复（2026-11-22）

状态：源码已修改，定向离线验证通过，数据库和真机验证未完成。

- 已完成定向回归：移动端 87 项、Core 项目会话 21 项、Adapters 197 项。
- 已完成类型检查：移动端、API、Core、Adapters、DB。
- 已完成静态检查范围梳理：发送回执、普通线程缓存、项目线程会话、记忆执行器、记忆 API 和 RLS 迁移。
- `apps/api/src/thread-target.test.ts` 定向命令未计入通过：90 项通过、22 项在既有 `resolveConversationExecutionScope` 无 DB tenant context 的测试夹具中失败，失败点位于原有发送／反应路径，未据此修改无关测试环境。
- 未执行：PostgreSQL 迁移与 RLS 实测。
- 未执行：iPhone、Windows 真机的退出重进、冷启动、切换 Space、项目 Bot 与普通 Bot 记忆互读。
- 未执行：生产发布及发布后回读。

验收用例集中在 [Bot 状态与记忆评测](BOT_STATE_MEMORY_EVALUATION.md)。
