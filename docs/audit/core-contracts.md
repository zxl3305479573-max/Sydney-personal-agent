# Core contracts 审计

结论：条件通过。范围：Task/Mandate schema、派工与授权纯策略、展示投影和工具资源映射。

## 入口与行为

- `packages/contracts/src/task-execution.ts` 定义 Task budget、control、execution state、Mandate 和 RPC 输入/输出 schema。
- `packages/core/src/task-assignment.ts`、`task-mandate.ts`、`task-projection.ts` 提供确定性策略，不直接持有 DB 或调用模型。
- `packages/core/src/task-tool-resource.ts` 将允许的工具映射到 workspace、精确 HTTPS URL、Bot 电脑或记忆资源；不在表内的工具默认拒绝。

## 已确认的保护

- Mandate 是 authenticated user 来源并绑定 user/space/bot/thread/task/run；scope 是 tool/action/resource 三元组。
- Task budget 对 runs、tools、model calls、reserved tokens 和 timeout 有上限 schema。
- managed task 禁止 `run_subagent`、`spawn_bot`、`paid_request`；未知工具不自动放行。
- 工作区路径拒绝绝对路径、盘符路径与 `..`；网页资源要求 HTTPS、无 userinfo，并可约束精确 URL。
- pure policy 不被误当作身份认证；生产身份和租约仍由 DB/API 校验。

## 风险与缺口

- 总体 `modelDataConsent: true` 只证明用户确认过统一数据发送说明，不记录字段级发送清单、模型端点快照或 consent 版本。
- `TaskGrantSchema` 的字段是非空字符串；授权资源语法的强约束主要依赖 UI/helper 和后续精确映射，API 不应把任意 grant 当成安全的资源解析器。
- 任务投影依赖 history 上限与调用方对 effect 状态的映射；历史不完整必须阻止“结果已核对”推断。
- 本次无法重跑此前记录的纯策略测试；没有完成从每个工具别名、connector catalog remap 到最终授权资源的完整属性测试。

## 验证与状态

- 历史离线证据：V-003、V-004、V-007；本轮未重跑。
- 本机静态审阅：通过；`git diff --check` 最终结果见 V-009。
- 服务端授权、租户隔离和模型发送记录：待验。
- 状态：scope 设计条件通过；将其作为生产授权系统整体使用仍需 DB/Executor 验收。
