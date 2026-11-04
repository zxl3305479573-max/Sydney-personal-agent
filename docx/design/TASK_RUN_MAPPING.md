# P1：Task、Assignment、Mandate 与 Run 映射

日期：2026-11-03。状态：设计建议，未实施集成，不代表 P1 或 P2 整阶段完成。

## 1. 范围与依据

- 关联 PA-001、PA-003、PA-004、PA-005、PA-006、PA-010；执行层接口同时关联 PA-017。
- 源码基线：`D:/33054/Sydney-rakazo`，提交 `aebca9dcfd0cf734484ce41e3c5ad9521551659d`。下列源码位置均为该提交的实际文件与一基行号；并行新增代码另行说明。
- 本次交付仅为本文件；依赖 `docx/PLAN.md`、`docs/security.md` 和 ADR-0004。验收是映射及集成位置可核查、授权与恢复规则可实现，不以静态阅读代替运行验收。
- 推荐直接复用已有 Task、Run、Attempt、ExternalEffect、审批入口和 Run 唤醒机制。P2 本轮先提供纯派工判定与纯授权 guard，保留 attempts 的状态投影仍是后续设计项；不增加 Ticket 表、数据库、执行循环或调度器。

## 2. 固定基线的已有能力

| 实际文件与符号 | 已有事实与边界 |
| --- | --- |
| `packages/db/prisma/schema.prisma:914`，`Task` | 已有任务表：归属 space/bot/thread/user，保存 `prompt/status`，一对多关联 Run；没有完成标准、授权范围或独立的业务状态枚举。 |
| `packages/db/prisma/schema.prisma:933`，`Run` | 必须有 `taskId`；拥有状态、触发来源、模型选择、checkpoint、owner/fence/租约、wakeAt、起止时间。`retryOfRunId` 在 `:962` 注明用于 routine 重试且唯一，不能未经核查泛化它的语义。 |
| `packages/db/prisma/schema.prisma:1022`，`Attempt` | 保存 `runId/fence/status/error/startedAt/finishedAt`，对应 worker 的一次执行尝试；不是另一项用户任务。 |
| `packages/db/prisma/schema.prisma:1963`，`Ticket`；`packages/adapters/src/ticket-wake.ts:8`，`wakeTicketAssignee` | Ticket 是已有看板条目，可分配给 bot；唤醒时另外创建 Task/Run，并以 `tickets` 触发。Ticket 本身没有 Run 外键，不等同执行尝试，也不必成为首版手动任务的入口。 |
| `packages/contracts/src/ids.ts:25`，`RunStatus`；`packages/core/src/run-state.ts:50`，`allowed` | 状态为 queued、leased、running、waiting_input、waiting_takeover、completed、failed、cancelled。`failed → queued` 合法，但此状态能力不等于产品应覆写旧 Run 重试。 |
| `apps/api/src/thread-target.ts:725`，`sendThreadMessage` | `:765` 开始事务、`:827` 锁 thread；`:930` 的忙碌分支可能将输入写成 SteeringMessage，`:959` 才是创建新 Task/Run 的分支。因此“一次聊天输入”不保证“一项新任务”。 |
| `packages/db/src/events.ts:473`，`sendUserMessage` | 另一发送入口同样在事务内写消息、Task、Run、Event；忙碌分支可转为 steering。不能在这些入口外先独立创建任务再补 Run。 |
| `packages/db/prisma/schema.prisma:888`、`:980`、`:1146` | 分别已有消息 `(threadId, clientNonce)`、Run `(spaceId, clientNonce)` 和 ExternalEffect `idempotencyKey` 唯一约束；不能把纯函数中的“未找到”当成并发唯一保证。 |
| `packages/adapters/src/run-wakeup.ts:137`，`RunJobPublisher`；`:25`，`RunStarter`；`:172`，`RunWorkerHost` | Run 持久化于 PostgreSQL，`enqueue(run.continue)` 写 wakeAt 后直接启动；`:370` 扫描 queued、过期 leased/running 以及到期的交互等待。Graphile 仍承载其他后台工作，但 Run 热路径不强制经过第二个作业队列。 |
| `packages/adapters/src/background-job-handlers.ts:127`，`run.continue`；`packages/adapters/src/executor.ts:286`，`continueRun` | handler 转入 executor；`:312` 以条件更新抢占 Run 并提升 fence，`:393` 获取电脑租约，`:449` 创建 Attempt。抢占、电脑准备、Attempt 创建并非一整个事务，恢复必须容忍中间状态。 |
| `packages/db/prisma/schema.prisma:1482`，`ComputerExecutionLease`；`packages/adapters/src/computer-lifecycle.ts:719`、`:815` | 电脑租约按 `(computerId, botId)` 唯一；dedicated 与 team 路径不同。`:799` 的 `lockOwnedRun` 检查运行状态、owner、fence 和有效期；`:934` 释放保留过期行，避免 fence 重置。它不是整个系统的全局单任务锁。 |
| `packages/adapters/src/executor.ts:475`；`packages/adapters/src/run-lifecycle.ts:118`，`renewRunLease` | heartbeat 每分钟续 Run 与电脑租约，续租失败会 abort。Run 续租写入五分钟有效期；不能把租约到期解释为远程操作已停止或副作用未发生。 |
| `packages/adapter-kit/src/interfaces.ts:336`，`AgentRuntime` | `describe()`、`run(AgentRunRequest, context?) → AsyncIterable<AgentRuntimeEvent>`、`abort(runId)`；不是持久化或派工接口。 |
| `packages/adapter-kit/src/types.ts:520`、`:651` | `AgentRunRequest` 已有 runId、工具执行回调、checkpoint、用量回调；事件含 tool/ask/takeover/usage/checkpoint/done，没有统一的 failed/cancelled 事件。 |
| `packages/adapters/src/executor.ts:1642`、`:1782`、`:1835` | 调 runtime.run，`executeTool` 回调转到 `applyTool`，事件交给 `consumeRunEvents`；正常流结束后才调用 completeRun。不能只订阅 tool/done 事件代替工具门禁或业务验收。 |
| `packages/adapters/src/run-tools.ts:74`，`dispatchTool`；`packages/adapters/src/run-tool-gate.ts:138`，`gateToolCall` | 解析目标、准备请求、检查审批后派发 handler。部分只读操作没有 ExternalEffect；授权 guard 应覆盖读操作，不能只挂在副作用记录上。 |
| `packages/adapters/src/run-tool-gate.ts:692`，`showApprovalCard`；`packages/db/src/events.ts:1306`，`pauseRunForInput` | 审批保存 checkpoint 后暂停；事务内更新 Run、结束当前 Attempt、写卡片及 Event，使用 waiting_input，也可能是普通问题或凭据输入，不能统称授权等待。 |
| `apps/api/src/routes/threads.ts:635`，`threads.answer`；`packages/db/src/events.ts:823`、`:1133` | 经已认证入口提交答案，在事务中校验待答卡片，将 Effect 置 approved/denied、Run 置 queued；提交后唤醒。已有“always”规则不具备任务、资源、到期、撤销全套绑定。 |
| `packages/db/prisma/schema.prisma:344`、`:2177`；`packages/adapters/src/run-trust.ts:55` | 空间/用户审批规则表达 effect/matchKind/matchValue；运行内会缓存规则。它们不能替代需要即时撤销的 Mandate 权限上限。 |
| `packages/core/src/approval-effect-key.ts:62`，`toolEffectIdempotencyKey`；`packages/adapters/src/run-effects.ts:147`，`recordEffect` | 实际写操作去重键由 Run、工具、规范化参数摘要和 occurrence 构成，不依赖易变的模型 callId。重复相同参数的合法调用也可有不同 occurrence；新 Run 不继承该键的去重范围。 |
| `packages/adapters/src/run-effects.ts:290`，`claimEffect`；`:301`，`underRunLease` | Effect 的 executing 认领与 Run 历史写资格检查在同一事务。`packages/db/src/messages.ts:132` 的检查主要保护 fence/owner 与取消状态，不完整检查租约到期及新的授权策略；新行为须显式补充。 |
| `packages/adapters/src/approval-effect.ts:435`、`:489`、`:540` | 重复 completed 返回原结果，denied 返回拒绝，approved 可认领；执行中的重复调用转 uncertain 并阻止盲目重放。完成记录按 Effect 预期状态 CAS，不能推导外部系统 exactly-once。 |
| `packages/db/src/events.ts:1785`，`finalizeRunOnce` | 事务内以 owner/fence 更新 Run、当前 Attempt、Task、结果消息和终结 Event；当前会直接把 Run outcome 写回 Task.status。多 Run 聚合前必须审查此投影语义。 |
| `apps/api/src/routes/threads.ts:328`；`apps/api/src/thread-target.ts:1442`，`stopThreadRuns` | stop 是 thread 范围：先事务标记 Run cancelled 并写事件、快照清理目标，再尝试取消电脑工作和释放租约。它不等于按 Task 精确取消，也不保证远程动作已撤销。 |
| `packages/db/src/cancel-runs.ts:9`，`cancelRunsInTransaction`；`packages/adapters/src/run-lifecycle.ts:274` | 另有批量取消 helper，会同步 Attempt/Task；停机则可重排同一 Run。`packages/adapters/src/executor.ts:1960` 将仍 running 的本次 Attempt 记为 interrupted，保留其历史。不同取消入口须分别接入，不能只修改一个 helper。 |

## 3. 语义映射及可复用类型

| 目标概念 | 推荐映射 | 需要补充的内容（proposal） |
| --- | --- | --- |
| Task：用户目标及验收身份 | 复用 Prisma Task.id 与归属字段，聚合它的全部 Run | 完成标准、任务级状态投影及控制意图。原 `Task.status` 只是现有流程维护的摘要，并非可靠的完整业务状态机；不可只用它决定派工。 |
| Assignment：一次派工 | 直接使用 Run，`assignmentId = runId`，无需 Assignment 表 | 首版同一 Task 只允许一个有效派工；显式业务重试创建同 Task 的新 Run，保留旧 Run/Attempt/Effect。不能因队列重投、审批恢复或 worker 换代创建新派工。 |
| 执行尝试 | 复用 Attempt.id、runId、fence | 同一 Run 的技术恢复/交互恢复允许出现多个 Attempt；保留 setup_failed、interrupted 等实际记录，不用一个 attemptCount 覆盖历史。 |
| Mandate：范围授权 | P2 新增纯数据类型与 guard；P3 附着现有 Run 的持久化记录 | 可信授权者、task/run 绑定、工具/动作/资源元组、有效期、版本和撤销；审批仍由上游处理。 |
| Ticket：看板事项 | 保留上游 Ticket，首版任务内核无需依赖它 | 未来真有看板入口再显式关联，禁止按 prompt 中的 ticket 编号猜关联，禁止新增平行 Ticket 表。 |

`Task.prompt` 是可变的运行输入，不是不可变任务书：`packages/db/src/events.ts:1082` 会在交互答案后改写它，`:1049` 也有恢复分支。任务原始输入应引用可信源 Message；完成标准应单独保存版本，不把 prompt 摘要或模型最后一句“完成”当成验收证据。

推荐复用 `@rakazo/contracts` 的 `RunStatus`（`ids.ts:35`）、`RunTrigger`（`runs.ts:28`），以及 adapter-kit 的 `AgentRuntime`、`AgentRunRequest`、`AgentRuntimeEvent`、`AgentUsage`（`types.ts:614`）。P2 使用结构化只读快照，不运行 Prisma，不直接依赖数据库生成模型；P3 在存储边界从 Prisma Task/Run/Attempt 转换。`RunLease`（`packages/db/src/messages.ts:122`）可在数据库适配层复用。

不要直接复用公共 `EffectStatus`：`packages/contracts/src/ids.ts:37` 的枚举与实际 ExternalEffect 的 intended/approved/denied/executing/uncertain/completed 不一致。P2 可只接收归一化的 `hasUnresolvedEffects`，或另定义反映实际记录的只读快照联合；未知状态拒绝派工并要求核对。

## 4. P2 最小纯领域内核（proposal）

只放入现有 `packages/core/src`，不新增依赖或基础设施。全部输入显式传入，函数不读时钟、不调用模型/工具、不写状态、不启动任务。

### 4.1 派工判定

主 Agent 并行新增的 `packages/core/src/task-assignment.ts:56` 已提供纯函数 `decideTaskAssignment(input)`，输入 `scope(user/space/bot/thread/task)`、`taskStatus: RunStatus`、`clientNonce`、完整 Run 快照（含可空 nonce、状态及 `hasUnresolvedEffects`）、`retryRequested/maxRuns/historyComplete`；输出 create 意图、reuse 原 runId 或 deny。此接口不属于固定提交；本文件不把主 Agent 报告的测试结果当作本次验证。

约束：历史不完整或任一旧派工存在未核对副作用时，不创建新 Run；重复 nonce 返回相同历史回执；有活动 Run 时拒绝新派工或明确复用，不能自动把新任务内容塞成 steering。仅失败后显式重试可以新建，按产品约定限制次数；旧 Task.status 与 Run 历史冲突时不能靠 `canTransition(taskStatus, "queued")` 单独放行。纯判断不会解决并发，P3 必须在事务锁内重读后再次判定。

### 4.2 范围授权 guard

建议签名：`evaluateMandate({ mandate, intent, execution, now }) → allowed | denied(reason)`。

- `Mandate`：`id/version/issuerUserId/spaceId/botId/threadId/taskId/runId/issuedAt/expiresAt/revokedAt`，以及只读 `grants[]`。每个 grant 同时绑定 `tool/action/resources/constraints`，不能把独立工具集合与资源集合做笛卡尔积。首次按精确工具、精确动作和规范化资源标识匹配，不开放自由字符串通配或模型自判范围。
- `ToolIntent`：真实已解析路由的工具标识、动作、所有目标资源、关键约束、参数摘要及 operationKey。资源包括电脑及会话代次、账号/连接、文件路径或收件人等必要目标；batch 的每个子动作分别匹配。参数或目标变化重新判定。
- `ExecutionScope`：可信服务提供的归属、runId、实际 RunStatus、owner/fence、leaseExpiresAt、当前授权版本及控制意图；Mandate 可跨同 Run 的恢复使用，旧 Attempt 不因此获得新 fence。调用者不能从模型参数中取得这些字段。
- `now` 是显式传入的 UTC 毫秒。先校验数据及归属，再校验版本、撤销、控制意图、运行状态/有效租约、有效期、具体 grant。固定顺序返回首个原因；非法时间、未知工具/动作/资源默认拒绝。`now >= expiresAt` 即过期；已生效撤销不可因重放旧快照、旧 approved Effect 或恢复 checkpoint 复活。
- 输出仅为 `{ allowed: true, mandateId, version }` 或 `{ allowed: false, reason }`；原因使用稳定代码，例如 scope_mismatch、stale_version、revoked、stopped、lease_lost、expired、out_of_scope。允许结果是本次快照判断，不是可缓存执行令牌。

授权创建/扩权仅接受已认证用户入口，授权者来自服务端身份。网页、文件、检索、工具输出、Ticket 描述和模型响应只产生动作提案；即使它们带有 `source: "user"` 或“已批准”字样也不能创建 Mandate。P2 的来源标签不是认证机制。上游 auto review/always allow 仍受 Mandate 上限约束；上游 deny 不因 Mandate allow 而消失。

资源规范化、文件真实路径与链接校验由可信适配层完成，再把标识交给 guard；纯字符串 guard 不能保证文件系统无越界。GUI、任意终端命令难以推导全部副作用，应按已授权电脑/会话及工具能力限制，配合独立账号与执行面隔离，不宣称 guard 可以识别每一次点击的支付或发布意图。

### 4.3 保留历史的任务投影

后续实现状态：核心投影与现有记录只读适配已经落地，实际接口和边界见 [TASK_PROJECTION.md](TASK_PROJECTION.md)。下列内容保留原设计目标；控制状态、证据和当前 Run 指针的持久化仍未完成，不将纯投影视为完整恢复系统。

建议签名：`projectTask({ task, currentRunId, runs, attempts, effects, control, completionEvidence, now, historyComplete }) → TaskProjection`。

- 返回任务展示状态、当前 Run、全部 Run 与 Attempt 的只读历史、已完成动作摘要引用、待核对 Effect 引用、控制意图及原因；不更改或合并旧 Attempt。P2 不提供新的执行循环。
- `currentRunId` 必须属于该 Task，全部快照须匹配归属；缺失历史、冲突的活动派工、无法归属的 Attempt 返回 interrupted/原因，不从一个 running Attempt 推断整个 Task 仍正常运行。
- 优先处理未核对副作用：executing 遗留或 uncertain 使任务展示 interrupted，并保留取消/暂停意图。其次处理控制请求：未确认停止显示 cancelling/pausing；已静止才显示 cancelled/paused。
- 正常路径投影 queued/leased/running；有效等待卡片区分 approval/question/secret，waiting_takeover 保留接管语义。活动租约过期或 worker 中断显示 interrupted；这是恢复前的业务投影，不自动改写 Run 状态或安排重试。
- Run completed 表示执行流结束；Task 仅在完成证据满足已确认标准、没有未知副作用时显示成功。缺少证据显示 interrupted，原因为 completion_unverified；自然语言验收不得用关键词匹配冒充确定性验证。
- 重试生成新 Run；审批答复、暂停恢复和 worker 恢复沿用原 Run，新 Attempt 追加。`Task.status` 继续兼容旧入口，新投影单独返回，不把 paused/interrupted 等新展示状态直接写进 `RunStatus`。

P2 离线验收建议：全归属匹配、null nonce、重复命令、活动/终态冲突、历史缺失、重试上限、旧结果未知、到期边界、撤销版本、batch 越权、旧 fence、取消后新动作、投影保留全部 attempts。这里只列验收输入，未在本次执行测试。

## 5. P3 API 与持久化原子性（proposal）

### 5.1 单一存储与事务边界

沿用 PostgreSQL/Prisma。P2 无 schema 变化；P3 可在现有 Run 追加可空 `mandate` JSON、单调递增 `mandateVersion`、控制意图及其请求/确认时间，在 Task 追加可空 `currentRunId` 与版本化完成标准。字段和迁移尚待集成评审，不宣称已有这些列。新增列保持旧版本兼容；启用任务入口前确保对应 worker 都执行 guard，不能把“可空兼容”变成新任务的隐式放权。

Mandate JSON 中保留授权者、完整绑定、范围与撤销时间；scope/版本检查必须在控制侧真实数据库记录上执行，拒绝采用调用参数或 checkpoint 中的版本替代。权限详情按最小必要保存，普通日志只写摘要/引用，不保存密钥或原始工具结果。

| 用例意图（非已实现路由） | 同一事务必须提交的内容 | 提交之后 |
| --- | --- | --- |
| 创建/派工 | 已认证归属与输入校验；按现有 thread 锁顺序锁 Task/Run，读取完整历史并执行判定；写消息/回执、Task、Run、当前 Run 指针、授权引用及 Event | 使用原 `runContinueJob`/RunJobPublisher 唤醒；数据库已提交而通知丢失由原恢复扫描修复。 |
| 授权/审批答复 | 锁关联 Run 并验证当前版本；必要时显式签发或缩小/扩展 Mandate；校验卡片绑定，写 Effect approved/denied、卡片、Run 与 Event | 唤醒原 Run；批准仅表示审批条件满足，实际执行前仍需有效 Mandate。 |
| 撤销/取消/暂停 | 锁同一 Run；递增授权或控制版本、保存撤销/控制意图及审计 Event；阻断后续动作准入 | 尽力 abort、取消 Provider 工作、报告在途/残留工作；异步确认另行落库。 |
| 动作准入 | 重读有效授权、控制状态、Run owner/fence/有效期及资源会话代次；运行 guard 与上游门禁；同事务将对应 Effect 从 intended/approved CAS 为 executing | 锁外调用工具，传稳定 operationKey；不得长时间持数据库锁等待外部服务。 |
| 完成/失败/结果未知 | CAS 更新原 Effect 的真实结果；对当前 Run 使用原 finalize 事务写 Attempt、Task 兼容状态、结果与 Event；任务投影/指针更新须匹配当前 Run | 发布事件；旧 worker 的结果只允许结算自身 Effect，不得覆盖新 Attempt 或新 Run 的任务结果。 |

所有锁与现有代码保持一致顺序：涉及 thread 的用例先锁 thread；电脑资源沿用现有获取路径，不把新的 Task/授权锁反向嵌入电脑锁。唯一约束冲突后读取已提交回执；纯函数 create 意图不等于创建成功。API 返回 taskId/runId、已提交版本与当前投影，取消接收和取消确认分别表达。

`stopThreadRuns` 是现有整会话停止，不能直接拿来实现精确 Task 取消；新的 Task 用例仅选择其 Run，在原清理能力上增加任务级事务包络。保留旧入口，并把这些取消结果纳入投影，避免入口不同导致权限重新放开。

### 5.2 撤销和副作用的确定性

以“动作准入事务成功提交 executing”为动作开始的线性化点，撤销事务与准入事务锁定同一 Run：

1. 撤销先提交：后续准入必拒绝；旧审批、缓存规则或快照均不可绕过。
2. 准入先提交：该动作已进入在途范围，撤销阻断其后续动作，并尝试 abort；真实外部结果仍记录。数据库提交与网络发出之间存在间隙，因此不能承诺撤销返回时所有物理请求都尚未发出；延迟发送器须在发送前再检查有效版本。
3. 发出后超时、连接断开、进程崩溃或写回失败：保留 executing/uncertain，投影 interrupted；不得标记“未执行”“回滚完成”或盲目重试。拒绝旧 worker 写任务历史，不等于丢弃它已发生的外部结果。

已确认的在途结果结算可按 Effect 身份与预期状态 CAS，不要求已撤销授权再次允许；此路径只能补结果，不能再次发请求。执行许可不能存入模型上下文后长期复用；数据库检查失败时拒绝新动作。

### 5.3 取消、中断、重试与去重

- 取消排队 Run 可立即完成；执行中先持久化停止意图，后续动作不得准入。若仍有在途请求则返回 accepted/cancelling；结果已知且确认静止后投影 cancelled，若存在未知副作用则 interrupted 并注明用户已取消。两者都不允许继续安排动作。
- 暂停是可恢复的用户控制，不等同等待审批或接管。待静止后保存现有 checkpoint，释放原租约；恢复仍用原 Run，重新校验授权并获得新 fence。原恢复扫描及 `continueRun` 必须识别控制意图，不能把用户暂停当作普通过期运行自动拉起。
- worker 崩溃后沿用原恢复机制竞争同一 Run；恢复入口先核对 Effect 与停止意图。技术重投不创建新 Run；无未核对副作用时才继续安全部分。业务重试须显式请求并创建同 Task 新 Run。
- API 命令回执去重、同 Run 工具去重、外部服务幂等是三件事。nonce 绑定作用域和操作内容，同 nonce 不同载荷应冲突；保留原工具参数摘要/occurrence 机制，不改成仅模型 executionId。
- 原 Effect 键含 runId，跨 Run 重试不能依赖它自动防重。任一旧 Run 仍有未知副作用时拒绝新派工；已完成副作用也不能因失败重试就重新执行。P3 必须把旧结果/产物作为后续尝试的已完成部分，必要时沿用外部 operationKey；无可靠对应关系时先核对或取得明确的重复操作授权。
- 唯一约束只能解决记录争抢；不可承诺网络副作用 exactly-once。若 Effect 已 executing 而结果未落库，先查询目标或由用户核对，核对结论及证据写回原 Effect，保留审计。

## 6. P3 具体接入位置

| 位置 | 建议接入内容 |
| --- | --- |
| `apps/api/src/thread-target.ts:725`、`packages/db/src/events.ts:473` | 在事务内调用派工判定，显式区分新任务与 steering；设置当前 Run 及任务授权。复用事务原语，避免从事务里再调用独立提交的发送 helper。 |
| `apps/api/src/routes/threads.ts:635`、`packages/db/src/events.ts:823` | 复用审批卡片及回答入口；增加授权版本、目标及撤销校验，“always”不能自动扩大任务 Mandate。 |
| `packages/adapters/src/run-wakeup.ts:144`、`:345`；`packages/adapters/src/executor.ts:286` | 在现有 enqueue/扫描/claim 路径识别暂停、取消、结果未知与任务绑定；继续只使用原 starter、wakeAt 和租约，禁止新增调度循环。 |
| `packages/adapters/src/executor.ts:449`、`:1642`、`:1782` | 关联 Task/Run/Attempt/fence；授权保留在服务端 RunContext，executeTool 通过同一上下文；无需为了传授权重写 AgentRuntime。 |
| `packages/adapters/src/run-tools.ts:99`、`packages/adapters/src/run-tool-gate.ts:138`、`packages/adapters/src/run-effects.ts:290` | 解析真实目标后尽早检查控制/授权，最终以准入事务的新快照判定；必须覆盖无 Effect 的只读调用。扩展原 claim 边界，保留上游拒绝、审批、参数及路由绑定检查。 |
| `packages/adapters/src/pi-runtime-tools.ts:458`、`:471`、`:535`、`:542` | ask/takeover/subagent 有运行时内部分支，并非全部经过 executeTool；取消/暂停也须约束这些分支。首版不暴露递归 helper 工具；不能仅在消费 tool 事件时检查授权。 |
| `packages/adapters/src/run-turn.ts:107`、`:816`；`packages/db/src/events.ts:1785` | 归一化事件与完成证据，保留 null 用量为未知；增加任务投影，阻止有未知副作用或完成标准未核对时误报 Task 成功。 |
| `apps/api/src/thread-target.ts:1442`、`packages/db/src/cancel-runs.ts:9`、`packages/adapters/src/run-lifecycle.ts:274` | 汇合用户停止、批量取消、停机恢复的业务投影；保存控制意图，重启后不重新安排已停止任务。 |
| `packages/adapters/src/computer-lifecycle.ts:799`、`:934` | 继续复用 Run 与电脑两类 fence；释放保留租约墓碑。电脑/会话代次变化重新校验资源授权，不能让旧请求落到新目标。 |

## 7. 核查结果与未验证项

首次核查确认 HEAD 为固定提交、当时应用工作区干净；后续主 Agent 并行新增 P2 文件，HEAD 未改变，不能将其工作区改动归入固定基线。已逐项核对上述 schema、接口和执行路径。结论：已有 Task 可承载任务身份，Run 可承载派工，Attempt 保留实际执行历史；权限范围与任务级投影需要补充，但没有建设平行 Ticket、存储或调度器的必要。

本次未运行测试、安装、构建、数据库或服务，未联网，未读取 `.env` 等秘密；未改应用业务代码、总计划、开发日志或其他文档。尚未验证数据库迁移、并发事务、真实 Provider 取消及服务器恢复；首个任务的完成标准仍待主流程确认。主 Agent 的 P2 测试结果由其自行复验和记录，本文件不标阶段完成。

## 8. 并行新增派工函数的只读审查

审查对象仅为主 Agent 新增的 `packages/core/src/task-assignment.ts` 与 `.test.ts`，行号以本次读取的工作区快照为准。本次未发现需要立即修订的 Task/Run/Attempt 语义冲突：

- `task-assignment.ts:90` 的 reuse 发生在终态、未知副作用、次数上限检查之前；作为幂等查询回执合理，**不得把 reuse 解释为继续执行或授予工具权限**。测试 `task-assignment.test.ts:62` 明确覆盖该行为。
- `task-assignment.ts:95` 阻止活动派工重叠，`:98` 阻止结果未知时创建，`:101` 按 Run 数限制派工，`:105` 限定全失败历史并要求显式重试；未修改旧 Run，也未用 Attempt 数限制派工。测试 `:94`、`:107`、`:119` 覆盖对应意图。
- `task-assignment.ts:73`、`:83` 接受多个 null nonce，且不将 null 当作重复命令键；测试 `task-assignment.test.ts:162` 覆盖已有无 nonce Run 的重试。测试文件存在不代表本次执行或通过。

P3 必须解决的集成条件：

1. `task-assignment.ts:90` 比较的是输入 nonce 与 Run 快照 nonce。上游 `apps/api/src/thread-target.ts:978` 使用 `sendRunClientNonce(...)`，`packages/db/src/events.ts:590` 使用 `send:${message.id}`，不保证等于客户端原 nonce。需先复用 Message 回执映射，或由任务派工用例定义持久化一致的命令键；不能把未转换的聊天 nonce 直接传入后假定已去重。
2. `task-assignment.ts:105` 的 `canTransition` 只是重试资格判据，新建 Run 后不应把旧 failed Run 改 queued。Task.status 是旧摘要，输入适配须结合完整 Run 历史；同一事务内确认历史完整并再次判定，不能把 `historyComplete: true` 当成调用者自证。
3. `task-assignment.ts:16` 的 `hasUnresolvedEffects: false` 仅排除未知副作用，无法证明新 Run 重放已完成副作用安全。已完成动作的结果复用/人工核对仍属于第 5.3 节的 P3 责任；不要扩大该纯函数的保证，也不应为此在 P2 引入第二套 Effect 存储。
