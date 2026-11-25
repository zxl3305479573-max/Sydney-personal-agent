# DB task execution 审计

结论：阻塞。范围：Task JSON execution state、Run mandate、事务派工、调用预算、控制、effect reconciliation 和历史读取。

## 入口与行为

- `packages/db/src/task-execution.ts` 处理 create、dispatch、只读 `preflightManagedRun`、`guardManagedRun`、`rollbackManagedModelReservation`、pause/cancel/continue、续期、服务端证据驱动的 stop confirmation、effect reconciliation 和 completion verification。
- `packages/db/src/task-execution-history.ts` 在 RepeatableRead 事务读取限量 Run/Attempt/Effect 元数据。
- schema 与增量迁移位于 `packages/db/prisma/schema.prisma` 和 `packages/db/prisma/migrations/20261103090000_task_execution_state/`。
- API 操作要求匹配 `currentDbContext()` tenant 身份，Task 变更使用 `SELECT ... FOR UPDATE`。

## 已确认的保护

- dispatch 同一事务锁 Task、校验版本/控制/完成/预算/mandate expiry，创建 Run、回填真实 Run ID 的 Mandate，再保存 currentRunId。
- 相同 dispatch nonce 对比 expiry 和 scopes；不同 payload 冲突。重复请求复用已有 Run。
- 每个模型调用和普通工具调用均在事务内重查 Task、Run 身份、lease owner/fence、Mandate 绑定、期限、scope、控制状态和预算；`preflightManagedRun` 复用同一套前置校验但不加行锁、不写入/不递增计数器，供审批门禁前预检使用。
- `rollbackManagedModelReservation` 在 Task 行锁下校验 `currentRunId === runId` 后将 `modelCalls` 减 1、按本次预留扣减 `reservedTokens`（均钳制在 `>= 0`），用于下游 billing 预留失败或紧随 `guardManagedRun` 后的中止场景。
- `controlManagedTask` 现统一返回 `runId`、`threadId`、`eventSeq` 与 `cancelledQueuedRun`（即便 Run 已被 Worker 领取/正在运行），使 API 层可取消队列作业、唤醒订阅并尽力清理运行中的电脑工作。
- `confirmManagedTaskStopped` 仅接受服务端证据（缺省按 `backgroundWork: "unknown"` 失败关闭，不接受客户端自报）；在 Task 行锁内校验无未过期 `computerExecutionLease`、无遗留 `computer.executionRunId`，仅当 `attemptCount === 0`（排队期取消、从未执行）或 `attemptCount > 0 && backgroundWork === "idle"` 时才写入 `quiesced: true` 并递增版本，否则抛出 `stop_evidence_unavailable`。
- tenant context 不匹配时失败关闭；历史查询不读取 prompt/checkpoint/tool payload，使用有界读取并声明 history completeness。
- 完成验证要求 Run completed 且没有未结算 effect；暂停复核要求 control pause + quiesced。

## 阻塞发现

- **控制传播与服务端静止证据（代码已补齐，待真实环境验收）**：`controlManagedTask` 与 `confirmManagedTaskStopped` 已补齐返回值、DB 租约/执行绑定检查及严格服务端静止证据规则（`attemptCount === 0` 或 `backgroundWork === "idle"`），并补充了 `task-execution.test.ts` 离线替身用例。但真实 PostgreSQL 并发/行锁竞争、作业取消以及真实 Linux 进程静止探测尚未在授权服务器实测。
- **排队取消已收紧**：取消操作在 Task 行锁事务内仅对当前 `managed_task` 且仍为 `queued` 的 Run 写入终态、清理可恢复状态并记录 `run.cancelled`；提交后尽力取消队列作业并通知。Worker 已先领取时保留 `quiesced=false` 并交由 API 层尽力清理沙箱工作与租约。真实 PostgreSQL 抢占竞争、锁顺序和事件通知尚未验收。
- **状态版本此前未全面生效**：本轮已让续期、停止确认、effect reconciliation、复核和完成验证检查 expectedVersion；每次 mandate 续期、停止确认与 effect reconciliation 会推进 Task version。API/DB 定向测试尚未运行。
- **恢复与 effect 状态已收紧**：cancel 不可转回 continue；pause 恢复前检查全部 Run 的未结算 effect；reconciliation 只接受 intended/ambiguous/failed，拒绝覆盖 settled 状态。仍需针对效应和跨事务竞态运行 PostgreSQL 并发测试。
- **续期竞态**：`renewManagedTaskMandate` 校验 Task version、控制意图和 mandate 绑定/期限，并用当前 Run 状态条件更新；Run 状态改变时拒绝续期。续期本身不声称确认执行租约，真实 PostgreSQL 并发语义待验。
- **Run 租约过期**：managed model/tool guard 与 preflight 现显式拒绝到期或缺失的 Run lease；相关替身测试新增但未执行，真实数据库竞态仍待验。
- **重试门禁已补齐**：dispatch 对已有 Run 要求显式 `retry=true`，避免客户端把新 nonce 误当作普通首次派工；活动 Run、未决 effect 和控制状态仍分别阻止派工。
- **授权续期状态**：续期现要求 Run 仍处于受管活动状态，拒绝 completed/failed/cancelled 等终态；waiting_input/waiting_takeover 是否在真实流程中保留正确授权边界仍需联调。
- **Effect reconciliation 边界**：对外 reconciliation 现检查 tenant、Task version、父 Task 归属和可结算状态；仍需验证请求审计事件与 effect 更新的原子性，因为审计事件写在 API 事务之外。
- **Effect 字段修正**：`ExternalEffect` 没有 userId，查询通过关联 Run 限制 userId、spaceId 与 taskId，effect 自身限制 spaceId 并排除内部 checkpoint；真实 RLS 和数据库执行尚未验证。
- **派工复核**：新派工事务额外检查同任务活动 Run 与全部历史的未决效果；仅有非活动终态不等于可证明静止，原有 `quiesced` 门禁保持不变。并发行为尚未在 PostgreSQL 验证。
- **创建重放预算**：创建任务时复用 nonce 现在逐项比较原有预算，变化时返回冲突，避免调用方误以为旧任务采用新预算；替身测试尚未运行，真实事务并发仍待验。
- **结果投影已收紧**：完成 Run 没有 completion evidence 时返回 `completion_unverified`；历史结果不完整时 API 不允许把投影包装为成功；完成确认会查询同 Task 全部 Run 的未结算 effect，包含此前 Run。
- **预算累计单调**：`beforeCall` 下游失败或紧邻中止场景现已支持 `rollbackManagedModelReservation` 回滚本次预留；但外部模型请求发出后失败或已知实际 usage 后的差额结算/释放仍为保守上限，需确认这是明确产品行为。
- **重试预算与期限**：新派工现保留任务已计入的模型/工具调用、token 预留及首次截止时间，截止后拒绝新派工。旧版本已经清零的数据无法由当前状态恢复；新增替身测试尚未运行，不能宣称历史任务的累计上限可靠。
- **并发与物理 schema 未验**：表名/字段 SQL、PostgreSQL 行锁、RLS、事务重试、JSON 写入和迁移没有在真实 PostgreSQL 执行。

## 验证与状态

- 本轮修改与新增离线单测（`packages/db/src/task-execution.ts`、`packages/db/src/task-execution.test.ts`）因本机未安装 `node_modules`，TypeScript 类型检查、Vitest 单测、PostgreSQL 并发/RLS 与真实 Linux 沙箱验证均**未执行**。
- 历史 `task-execution` 事务替身测试及 V-005/V-007 仅覆盖旧基线；本轮改动全部留待授权服务器执行。
- 状态：阻塞，完成授权服务器上的 TS/Vitest/PostgreSQL/Linux 实测前不得对外宣称控制闭环验收通过。
