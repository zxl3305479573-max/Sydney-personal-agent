# DB task execution 审计

结论：阻塞。范围：Task JSON execution state、Run mandate、事务派工、调用预算、控制、effect reconciliation 和历史读取。

## 入口与行为

- `packages/db/src/task-execution.ts` 处理 create、dispatch、`guardManagedRun`、pause/cancel、续期、stop confirmation、effect reconciliation 和 completion verification。
- `packages/db/src/task-execution-history.ts` 在 RepeatableRead 事务读取限量 Run/Attempt/Effect 元数据。
- schema 与增量迁移位于 `packages/db/prisma/schema.prisma` 和 `packages/db/prisma/migrations/20261103090000_task_execution_state/`。
- API 操作要求匹配 `currentDbContext()` tenant 身份，Task 变更使用 `SELECT ... FOR UPDATE`。

## 已确认的保护

- dispatch 同一事务锁 Task、校验版本/控制/完成/预算/mandate expiry，创建 Run、回填真实 Run ID 的 Mandate，再保存 currentRunId。
- 相同 dispatch nonce 对比 expiry 和 scopes；不同 payload 冲突。重复请求复用已有 Run。
- 每个模型调用和普通工具调用均在事务内重查 Task、Run 身份、lease owner/fence、Mandate 绑定、期限、scope、控制状态和预算。
- tenant context 不匹配时失败关闭；历史查询不读取 prompt/checkpoint/tool payload，使用有界读取并声明 history completeness。
- 完成验证要求 Run completed 且没有未结算 effect；暂停复核要求 control pause + quiesced。

## 阻塞发现

- **控制意图未证明中断**：`controlManagedTask` 只更新 JSON control，没有向当前 Worker 发即时中断事件；下一次门禁检查会阻止动作，但正在等待的模型请求/桌面命令不能被证明已中止。停止确认在 Run 非活动后仍返回 `stop_evidence_unavailable`，不再接受用户自报作为静止证据；暂停后的恢复及副作用核对因此不可通过该入口完成。
- **排队取消已收紧**：取消操作在 Task 行锁事务内仅对当前 `managed_task` 且仍为 `queued` 的 Run 写入终态、清理可恢复状态并记录 `run.cancelled`；提交后尽力通知。Worker 已先领取时仍保留 `quiesced=false`。真实 PostgreSQL 抢占竞争、锁顺序和事件通知尚未验收。
- **状态版本此前未全面生效**：本轮已让续期、停止确认、effect reconciliation、复核和完成验证检查 expectedVersion；每次 mandate 续期和 effect reconciliation 会推进 Task version。API/DB 定向测试尚未运行。
- **恢复与 effect 状态已收紧**：cancel 不可转回 continue；pause 恢复前检查全部 Run 的未结算 effect；reconciliation 只接受 intended/ambiguous/failed，拒绝覆盖 settled 状态。仍需针对效应和跨事务竞态运行 PostgreSQL 并发测试。
- **续期竞态**：`renewManagedTaskMandate` 校验 Task version、控制意图和 mandate 绑定/期限，并用当前 Run 状态条件更新；Run 状态改变时拒绝续期。续期本身不声称确认执行租约，真实 PostgreSQL 并发语义待验。
- **Run 租约过期**：managed model/tool guard 现显式拒绝到期或缺失的 Run lease；相关替身测试新增但未执行，真实数据库竞态仍待验。
- **重试门禁已补齐**：dispatch 对已有 Run 要求显式 `retry=true`，避免客户端把新 nonce 误当作普通首次派工；活动 Run、未决 effect 和控制状态仍分别阻止派工。
- **授权续期状态**：续期现要求 Run 仍处于受管活动状态，拒绝 completed/failed/cancelled 等终态；waiting_input/waiting_takeover 是否在真实流程中保留正确授权边界仍需联调。
- **Effect reconciliation 边界**：对外 reconciliation 现检查 tenant、Task version、父 Task 归属和可结算状态；仍需验证请求审计事件与 effect 更新的原子性，因为审计事件写在 API 事务之外。
- **Effect 字段修正**：`ExternalEffect` 没有 userId，查询通过关联 Run 限制 userId、spaceId 与 taskId，effect 自身限制 spaceId 并排除内部 checkpoint；真实 RLS 和数据库执行尚未验证。
- **派工复核**：新派工事务额外检查同任务活动 Run 与全部历史的未决效果；仅有非活动终态不等于可证明静止，原有 `quiesced` 门禁保持不变。并发行为尚未在 PostgreSQL 验证。
- **结果投影已收紧**：完成 Run 没有 completion evidence 时返回 `completion_unverified`；历史结果不完整时 API 不允许把投影包装为成功；完成确认会查询同 Task 全部 Run 的未结算 effect，包含此前 Run。
- **预算累计单调**：Run 预留预算在外部模型 call 失败或已知 usage 后不结算/释放，属于保守上限，但会减少同一任务可继续调用次数；需确认这是明确产品行为。
- **并发与物理 schema 未验**：表名/字段 SQL、PostgreSQL 行锁、RLS、事务重试、JSON 写入和迁移没有在真实 PostgreSQL 执行。

## 验证与状态

- 历史 `task-execution` 事务替身测试及 V-005/V-007 是既有证据；本轮未重跑，且本轮发现项需要新增测试。
- 类型检查、迁移、并发、授权撤销与恢复：待授权服务器。
- 状态：阻塞，暂停/取消服务端清理和不可伪造静止证据完成前不得对外宣称控制闭环可用。
