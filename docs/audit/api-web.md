# API / Web 审计

结论：条件通过。范围：Task RPC 路由、路由注册、工作台和预览。

## 入口与行为

- `apps/api/src/routes/tasks.ts` 使用认证路由注册创建、派工、控制、授权撤销/续期、停止确认、效果核对、完成验证、inspect 和桌面预览。
- `apps/api/src/router.ts` 挂载 `tasksRoutes`；Web 任务页位于 `apps/web/src/pages/Tasks.tsx`，并使用 typed RPC。
- 本轮确认原先确实没有注册 `TasksPage`；已新增 lazy route `/app/tasks` 与认证路由测试，但由于依赖环境问题，本轮未执行该测试。
- API 对 Task/Computer 查询显式限制 user/space；预览要求运行中的 native-linux computer 且不在有效 human takeover 中。

## 已确认的保护

- create/dispatch/control/revoke/reconcile 等有副作用操作记入审计事件；重复 Run 不重复 enqueue。
- `tasks.control`（`pause`/`cancel`）与 `tasks.revoke` 现基于 `controlManagedTask` 返回的 `runId`/`threadId`/`eventSeq`/`cancelledQueuedRun` 尽力取消 `runJobKey` 队列作业并唤醒线程订阅者；对非排队取消（含撤销）还会查询租户范围内的 `computerExecutionLease` 与 `computer`，尽力执行 `cancelComputerRunWork`、`releaseScreen`、租约过期与遗留 `executionRunId` 清理，且尽力清理异常只记日志不掩盖已落库的 DB 控制意图。
- `tasks.confirmStop` 不再采信客户端自报，改为服务端按 `inspectBackgroundWorkEvidence` -> `inspectBackgroundWork` -> `"unknown"` 优先级探测目标沙箱后台工作（探测异常或缺少 `providerRef` 一律保守降级为 `"unknown"`），将服务端证据交给 `confirmManagedTaskStopped` 判定。
- 用户输入经 contract schema 校验；预览使用 Bot 对应 `ComputerRef`，限制图像大小。
- UI 显示授权范围、模型数据同意、预算预留、Run 历史和副作用 reconciliation 操作。
- UI 对未确认停止显示服务端验证不可用，不提供用户自报的停止确认按钮。

## 风险与缺口

- API/DB 服务端清理与后台工作静止探测代码与离线单测（`apps/api/src/routes/tasks.test.ts`）已补齐，但尚未在真实 PostgreSQL 与 Linux 沙箱环境验证；暂停后的恢复流程仍待端到端实测。
- 完成 Run 没有独立证据时返回 `completion_unverified`；历史读取不完整时不允许界面进入结果确认。
- 同意目前是全局 checkbox；没有在派工前显示完整上下文、模型 endpoint、图片/附件、记忆和每个工具可能外发字段的精确清单。
- Task API 错误将 TaskExecutionError 映射为 Conflict 文本，客户端需避免把内部消息变成可执行指令或敏感详情。
- 预览返回 base64 单次图片；未验证长连接、CSRF/速率限制、敏感输入屏蔽或真实桌面兼容性。
- 虽有 Web 单测记录，当前本机无 `node_modules`，本轮未运行 TS 类型检查、Vitest 单测（含 `tasks.test.ts`）、浏览器 E2E、API 集成或 UI 全导航测试。
- `/app/tasks` 已补入受认证路由；导航入口是否满足产品预期仍待 UI 验收，路由测试未运行。

## 验证与状态

- 历史 V-007 仅覆盖旧基线；本轮已更新 `apps/api/src/routes/tasks.ts` 与 `apps/api/src/routes/tasks.test.ts`，但 TS 类型检查、Vitest 单测、PostgreSQL 隔离与真实 Linux 沙箱探测均**未执行**。
- API 认证、数据库隔离、浏览器交互、服务端停止确认联调与截图输出：待授权服务器验收。
- 状态：代码路径条件通过；在授权服务器完成 TS/Vitest/PG/Linux 实测前，不将暂停/取消与停止确认闭环标为生产通过。
