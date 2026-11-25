# Pi adapters 审计

结论：阻塞。范围：Executor、Pi Runtime、subagent、模型调用和工具执行准入。

## 入口与行为

- `packages/adapters/src/executor.ts` 持有 Run lease/fence，装配 Pi 请求、模型、fallback 和 tool callback。
- `packages/adapters/src/pi-runtime.ts` 将模型与工具调用交给 Pi loop；`pi-runtime-subagent.ts` 执行单层 helper。
- `packages/adapters/src/run-tools.ts` 做工具解析、准备、既有审批门禁、managed mandate/scope guard 和 handler dispatch。

## 已确认的保护

- managed 主模型调用前用 `inputTokensEstimate + maxOutputTokens` 预留 Task token budget，并继续走原 billing observer；`resolveFallbackModel` 与 `resolveModel` 也已挂接相同 `managedCallObserver` wrapper，且 `beforeCall` 在预留前/后响应 `AbortSignal`、`onRequestId` 不向下游转发合成 id（`"managed-task-call"`）。当 `guardManagedRun` 预留成功但紧随其后的 `AbortSignal` 检查或下游 `observer?.beforeCall(call)`（如 billing 预留）抛出异常时，`managedCallObserver` 会在 `runAsTenant` 内尽力调用 `rollbackManagedModelReservation` 回滚本次模型调用计数和 token 预留，且回滚失败仅记录告警、始终重抛原始异常。
- Worker 全局在 system DB context 执行；主模型、受管控制预检/轮询、预审批 DB 预检、模型预留回滚和 managed tool guard 均通过 `runAsTenant` 显式切回 Run 的 user/space/projectWorkspaceId，再进行租户保护查询。
- `executor.ts` 在领取 Run lease 之后、获取电脑执行租约（`acquireComputerExecutionLease`）与创建 Attempt 之前新增 `managed_task` 控制预检（校验 `TaskExecutionStateSchema` 的 `intent === "continue"`、`currentRunId === runId` 与 `deadline`）；不满足或读取失败时直接以租约围栏终止并释放 Run、清理 connector 状态，不占电脑租约也不创建 Attempt。准备阶段若由 `ManagedTaskControlStopped` 中止，`mayOpenModelStream` 前亦会收口到 `finalizeRun`，避免遗留 `running` 状态。
- managed 任务工具在暴露阶段仅保留受支持且已授权的入口，解析前后做资源预筛；在调用 `gateToolCall` 之前新增 `preflightManagedRun` 只读 DB 预检（校验当前控制意图、期限、租约、授权范围与工具调用预算且不修改计数器），被拒时直接返回错误而不进入审批或写入 `ExternalEffect`；审批门禁放行后仍保留 `guardManagedRun` 事务加锁校验与扣减。`run-tools.ts` 在入口、工具解析后、准备后、preflight 后、审批门禁放行后（含普通 Run 与 managed 任务）及 managed DB guard 异常/返回后均检查 `signal.aborted`，中止后不再进入 handler。
- Pi 的 `run_subagent`、`ask_user` 和接管等存在 runtime 内直通分支，managed 工具列表目前不暴露它们；普通 Run 工具列表维持上游行为。
- Pi helper 单层、最多 4 个并行实例；过滤 delegation 工具、共享父 tool-call budget，并回传结果；不是独立可靠的 Task/Run。

## 阻塞发现

- **辅助模型预算覆盖待验证**：`executor.ts` 的 `resolveModel` 已在 `managed_task` 下同步包装 `managedCallObserver`，与主模型及 `resolveFallbackModel` 保持一致；`executor.test.ts` 已补充 `resolveModel` 包装及 `beforeCall` 下游失败/中止回滚的离线单测（均未执行）；managed 工具列表仍继续不暴露 helper，自动模型审核也暂时关闭。上述策略和其他潜在辅助模型调用仍需执行单测与定向集成测试，不能据此宣称全面成本上限。
- **控制传播仍不完整**：`executor.ts` 已在获取电脑执行租约和创建 Attempt 前补齐 `managed_task` 控制预检，并在 Attempt 创建后继续由 `watchManagedTaskControl` 轮询贯穿准备阶段和 runtime；`run-tools.ts` 已在解析、准备、preflight、审批放行和 DB guard 返回后补齐中止检查，且已在 `executor.test.ts` / `run-tools.test.ts` 补充对应离线单测（均未执行）。但审批内部或已经发出的外部操作仍可能继续，也不能仅靠单测证明后台进程静止；此外既有 `executor-lazy-computer.test.ts` 对预检前移后 `finalizeRun` 的断言需随测试一并核对更新。
- **取消传播待实测**：native socket 现响应 AbortSignal 关闭请求，驱动尝试清理命令进程组；脱组子进程及外部副作用仍可能继续。真实 Linux、PostgreSQL 和 Pi 联调未验收。
- **工具计数与预留回滚语义**：工具 guard 仍在 handler 之前计数，被拒绝的后续副作用或无效调用可能消耗预算（保守限额，需 UI 解释）。模型调用 `guardManagedRun` 预留后若 `observer.beforeCall` 抛出或紧随其后中止，现已通过 `rollbackManagedModelReservation` 尽力回滚 Task 侧预留（离线用例已补，未执行）；实际模型流发出后的失败或 usage 差额仍维持保守上限。
- **审批前 DB 预检已补齐（待实测）**：`run-tools.ts` 现于 `gateToolCall` 之前执行只读 `preflightManagedRun`，授权过期/撤销、控制阻止或工具预算耗尽时不再生成无必要审批记录；审批放行后仍执行 `guardManagedRun` 原子加锁扣减。高并发下的审批竞态与真实 PG 行为仍待实测。
- **类型与回归未重跑**：受本机未安装 `node_modules` 限制，本次新增与修改代码及 `executor.test.ts` / `run-tools.test.ts` 均未能运行 TypeScript 类型检查和 Vitest 回归验证。

## 验证与状态

- 历史 V-005、V-007 仅覆盖旧基线；本轮已补 `preflightManagedRun`、`rollbackManagedModelReservation` 接入代码及离线用例，但 TS 类型检查、Vitest 离线测试、PostgreSQL 并发与 `executor-lazy-computer.test.ts` 回归均**未执行**。
- 真实 Pi provider、全部辅助模型预算、取消中断及完成恢复：待授权服务器验收。
- 状态：阻塞；在测试通过、预算回滚和取消覆盖实测完备前，不开放 managed task helper 或宣称精确成本上限。
