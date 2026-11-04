# 任务执行接线

日期：2026-11-03。关联 PA-001、PA-003、PA-004、PA-005、PA-006、PA-010。

应用代码与 Rakazo 基线现统一位于当前仓库根目录。本批增加 Task.executionState、Run.taskMandate 两列及增量 SQL；本地只生成 Prisma Client，没有连接数据库或执行迁移。当前审计发现 pause/cancel 尚未形成可信中断/静止确认闭环，且 helper/辅助模型调用的 Task token 预算覆盖不完整；应以 [模块审计](../../docs/audit/README.md) 的阻塞结论为准，不将此文早期“接线”描述视为完整可运行保证。

## 实施内容

- 通过经过认证的 `tasks.create/dispatch/control/revoke/verify/inspect/list` 接口操作任务。Task 行锁及状态版本负责同一任务的并发，继续使用原 Run 唤醒和恢复机制。
- 创建 nonce 按租户和用户派生任务 ID；派工 nonce 绑定 Task。重复 nonce 返回原 Run，不重新执行；不同载荷冲突。重试保留原 Run 与 Attempt。
- 授权由用户接口签发，绑定用户、空间、Bot、Thread、Task、Run 和到期时间。首批资源包括受限工作区、专属桌面账号、完整 HTTPS URL、显式记忆；未接入的工具拒绝执行。
- 在工具解析前及解析后、准备和审批前按 stored mandate 做资源预筛；审批后再次事务检查最新授权与预算。授权不替代既有审批。
- 主模型请求之前预留估计输入量与最大输出量，保留现有计费观察器。预留量不当作实测消耗，不因用量未知退款。managed task 暂不使用自动模型审核，符合条件的操作交由现有人工审批策略处理；其他辅助模型覆盖仍待核对。
- managed 模型运行前和运行期间约每两秒读取任务控制状态，pause/cancel、截止、Run 变更或读取失败时中断 AbortSignal；模型或工具门禁仍另行检查授权。轮询不是即时停止证明，启动准备期间与已发出的外部副作用仍可能存在未知结果；停止确认保持失败关闭。
- 用户确认匹配 Run 的结果后，才保存完成证据；尚有未决副作用时不能确认成功。普通聊天和旧任务仍沿用上游行为。

## 部署顺序

先停止旧 Worker，再部署迁移和新版 API/Worker，最后创建新任务。不能让旧 Worker 处理带新授权约束的任务。迁移增加列而未删除既有数据，但安全门禁本身不向旧程序兼容。

## 当前验证

恢复执行补记（2026-11-03）：任务路由已挂载进 API 路由器；`NativeLinuxSandbox` 补齐 SandboxProvider 接口并注册进 sandbox 工厂（工厂当前为占位 transport，真实驱动接线待服务器阶段）。10 个定向测试文件共 116 项离线测试通过；五包类型检查、Prisma schema 校验和 Biome 检查通过。真实数据库与浏览器联调仍未验收。

批次收尾复核：6 个 TypeScript 测试文件 72 项通过，Python 驱动策略测试 3 项通过；数据库、核心、适配器、API、Web 类型检查和 Prisma schema 校验通过；Biome 格式检查通过。工作台测试已覆盖“未显式同意模型数据发送前不能派工”。真实数据库、模型、浏览器 E2E、Linux 服务和桌面仍未验收。

显式记忆确认：managed 任务只把 `remember` 授权到 `memory:${botId}`；实现继续复用现有 Markdown 记忆存储、Serializable 事务和 revision 冲突处理，不引入第二套记忆系统。

本批早期四个定向文件共 59 项离线测试通过，包括授权重载、租约、接管、未知副作用、重试、控制版本、预算与既有工具审计回归。数据库替身不证明 PostgreSQL 锁和多进程竞争正确。
