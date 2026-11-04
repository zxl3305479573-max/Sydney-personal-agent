# P2 任务状态投影与现有记录读取

日期：2026-11-03。关联需求：PA-003、PA-005、PA-006、PA-010。状态：核心投影、数据库读取适配及离线测试已实现；尚未接入 API、Worker、Pi 或 UI，没有真实 PostgreSQL 与 Linux 运行验收。

## 1. 实际实现

| 源码位置（应用仓库） | 导出 | 职责 |
| --- | --- | --- |
| `packages/core/src/task-projection.ts` | `projectTask`、`TaskExecutionHistory`、`TaskProjectionError` | 从状态快照生成任务展示状态，保留 Run/Attempt/Effect 引用，不修改数据库或执行动作 |
| `packages/db/src/task-execution-history.ts` | `readTaskExecutionHistory`、`TaskHistoryLimits` | 以匹配租户身份从既有 Task/Run/Attempt/ExternalEffect 读取有界一致快照 |
| 两个包的 `src/index.ts` | 上述导出 | 供后续应用服务接入，没有自动启用新的入口 |

这次复用现有表，不新增 schema、迁移、依赖、队列、调度器或环境变量。调用路径的下一步仍是 [任务映射](TASK_RUN_MAPPING.md) 中的现有用例和事务，不能把只读快照用作后续派工或授权的最终依据。

## 2. 投影输入与输出

`projectTask` 接收完整性标志、任务归属、Task 兼容状态及 Run/Attempt/Effect 元数据，并要求显式传入 `currentRunId`、`control`、`completionEvidence` 和 UTC 毫秒时钟。

- `currentRunId` 来自可信应用服务；读取适配器不按时间、数组顺序或模型文本推定当前派工。当前数据库尚无新增的任务指针字段，持久化与版本校验属于后续工作。
- `control.intent` 为 continue/pause/cancel；`control.quiesced` 表示可信服务确认执行已静止。它不能由前端或模型自行提交为事实，也不能只凭 lease 过期设为 true。
- `completionEvidence` 绑定当前 Run，verified 表示独立完成检查已通过。纯函数不判断摘要文字真伪，也不把模型最后一句“完成”作为证据；证据采集、版本与保存尚未实现。
- 输出包含展示状态、稳定原因码、原控制意图、全部已读取历史、已完成效果 ID 和待结算效果 ID。待结算列表中的 executing 可能是正常在途动作，不等同每个结果都已丢失。

身份不一致、重复 ID、无法归属的子记录或非法时间等结构问题抛出安全错误码，不返回另一任务的历史。历史截断或运行状态不确定则返回 interrupted，不写回 Task.status 或 Run.status。

## 3. 状态规则

| 已知事实 | 投影结果 |
| --- | --- |
| queued、leased、running 或交互等待有效 | 保留对应状态；waiting_input 不自行解释成审批等待 |
| running Run 租约有效，尚未写入本次 Attempt | running / attempt_pending，保留准备过程的中间状态 |
| 缺少 owner、fence 为零、租约缺失或到期 | interrupted / lease_expired |
| 多个活动 Run、旧 fence 的 running Attempt、结束记录缺少结束时间 | interrupted，给出冲突原因 |
| 请求 cancel/pause，尚未确认静止 | cancelling / pausing |
| 确认静止，且无在途/未知效果和 running Attempt | cancelled / paused |
| 数据库 Run 已 cancelled，但没有静止证据 | cancelling / stop_unconfirmed，不宣称进程已结束 |
| 当前有效 running Run 正在执行效果 | running，保留待结算引用；取消请求则显示 cancelling |
| 旧 Run 仍 executing、当前执行失去租约、uncertain 或未知效果状态 | interrupted / effect_unknown；保留取消或暂停意图 |
| Run completed，但仍有 intended/approved 效果 | interrupted / pending_effects |
| Run completed，无待核对效果，但没有当前 Run 的独立完成证据 | interrupted / completion_unverified |
| Run completed，范围内记录完整且当前完成证据有效 | succeeded |

控制意图显示优先于正常运行状态，未知副作用仍优先要求核对。投影不会重放动作、恢复任务、关闭进程或签发授权；真正的取消、清理和恢复仍待 P3/P4 接线验证。

## 4. 数据库读取边界

读取前要求当前 `DbContext` 是与 scope 同 userId/spaceId 的 tenant；拒绝无上下文、其他租户或 system 上下文。函数不创建租户上下文、不使用系统绕过权限。调用者必须先按已有认证流程取得真实身份，再进入现有 runAsTenant 范围。

在单个交互事务中按 RepeatableRead 读取：

1、以 taskId/userId/spaceId/botId/threadId 查询 Task，找不到返回 null，不再查询子记录。
2、以相同归属查询 Run，按创建时间和 ID 稳定排序。
3、Attempt 和 ExternalEffect 通过已选 Run ID 及完整归属关系过滤；效果另外限制 spaceId。
4、只选择身份、状态、租约和时间元数据，不选择 prompt、error、checkpoint、request 或 result。返回结构再次显式构造，不展开数据库的任意字段。
5、正常的 runtime_checkpoint 内部记录在查询中过滤；一半标识不匹配的记录归为 unknown，不能当作普通完成效果。

默认上限：100 个 Run、1,000 个 Attempt、1,000 个非 checkpoint Effect。可通过 `TaskHistoryLimits` 参数设置，每类范围 1 至 10,000；这是函数参数，不是已支持的配置环境变量。每类多取一条识别截断，超过任一上限即 `historyComplete = false`，调用方不得将可见片段当成全部历史。

数据库错误直接传播，不返回空的“完整历史”。日期转换为 UTC 毫秒；不返回完整敏感载荷，不代表所有记录已脱敏到可直接公开，未来 API 仍需独立访问检查与输出契约。

这是只读展示快照，不持锁等待工具。它不保证函数返回后状态不变，也不替代动作准入时的新读取、授权版本、Run fence 和事务 CAS。

## 5. 验证与局限

V-004 记录本轮实际验证：投影与数据库替身组合测试、跨租户拒绝、截断、checkpoint 过滤、错误传播、敏感字段选择及取消/完成证据。替身检查了事务隔离参数和查询条件，但没有证明真实 PostgreSQL 的 RLS、隔离级别、查询计划或并发行为。

后续仍需保存当前 Run 指针、控制请求与静止确认、完成标准及证据版本；实现可信授权签发/撤销并进入实际动作门禁。服务器具备条件后，再按 [原生 Linux 验收清单](NATIVE_LINUX_DESIGN.md) 验证取消、清理、进程残留与真实效果。
