# Pi adapters 审计

结论：阻塞。范围：Executor、Pi Runtime、subagent、模型调用和工具执行准入。

## 入口与行为

- `packages/adapters/src/executor.ts` 持有 Run lease/fence，装配 Pi 请求、模型、fallback 和 tool callback。
- `packages/adapters/src/pi-runtime.ts` 将模型与工具调用交给 Pi loop；`pi-runtime-subagent.ts` 执行单层 helper。
- `packages/adapters/src/run-tools.ts` 做工具解析、准备、既有审批门禁、managed mandate/scope guard 和 handler dispatch。

## 已确认的保护

- managed 主模型调用前用 `inputTokensEstimate + maxOutputTokens` 预留 Task token budget，并继续走原 billing observer；fallback model 也挂接相同 wrapper。
- Worker 全局在 system DB context 执行；本轮主模型和 managed tool guard 通过 `runAsTenant` 显式切回 Run 的 user/space，再进行租户保护查询。
- managed 任务工具在暴露阶段仅保留受支持且已授权的入口，解析前后做资源预筛，并在既有 approval/effect gate 后事务检查 DB Mandate 和预算；不允许的工具不会进入准备或审批。
- Pi 的 `run_subagent`、`ask_user` 和接管等存在 runtime 内直通分支，managed 工具列表目前不暴露它们；普通 Run 工具列表维持上游行为。
- Pi helper 单层、最多 4 个并行实例；过滤 delegation 工具、共享父 tool-call budget，并回传结果；不是独立可靠的 Task/Run。

## 阻塞发现

- **辅助模型预算覆盖不全**：helper 在 `pi-runtime-subagent.ts` 可优先使用模型配置自身 `callObserver`；现在 managed 工具列表不暴露 helper，自动模型审核也暂时关闭。上述关闭策略和其他潜在辅助模型调用仍需定向集成测试，不能据此宣称全面成本上限。
- **控制传播仍不完整**：managed 控制轮询现从 Run/电脑租约取得且 Attempt 创建后启动，贯穿准备阶段和 runtime；pause/cancel、Run 变更、截止或读取失败时触发 AbortSignal。工具解析、准备、审批和授权检查返回后新增中止检查，但审批内部或已经发出的操作仍可能继续；租约领取与电脑租约获取早于轮询，不能证明后台进程静止。相关 executor 和工具测试尚未执行。
- **取消传播待实测**：native socket 现响应 AbortSignal 关闭请求，驱动尝试清理命令进程组；脱组子进程及外部副作用仍可能继续。Task 停止确认仍失败关闭，真实 Linux、PostgreSQL 和 Pi 联调未验收。
- **工具计数语义**：guard 在 handler 之前计数；被拒绝的后续副作用或无效调用可能消耗预算，这是保守限额，但需要 UI 解释。模型调用 guard 预留后，observer 再建立 billing reservation；第二步失败时 Task reservation 不回滚。
- **副作用前后顺序**：在工具解析前后增加静态 scope 预筛，但实时 DB 授权与预算事务仍位于 approval/effect gate 之后；授权过期或撤销发生在预筛之后时仍可能留下无必要审批记录。
- **类型与回归未重跑**：`managedCallObserver` 类型、fallback、afterCall 和 helper 路径本轮未能运行 TS/测试验证。

## 验证与状态

- 历史 V-005、V-007 记录 run-tools 与 Executor 相关离线测试/类型检查；本轮未重跑。
- 真实 Pi provider、全部辅助模型预算、取消中断及完成恢复：待验。
- 状态：阻塞；在预算和取消覆盖完备前，不开放 managed task helper 或宣称精确成本上限。
