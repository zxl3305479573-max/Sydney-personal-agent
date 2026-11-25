# 未实现功能总规划与部分实现项（第 2、3、4 项）专项评测

更新日期：2026-11-25。依据 Stop That Shit 原则（需求驱动、先查现有代码直接求解、精准补齐真实缺口、不堆砌猜测性防御、验证以实跑证据为准）编写。阶段总状态以 [总计划](PLAN.md) 为准。

## 一、全部未实现功能分批规划

| 批次 | 范围 | 对应文档 | 当前策略 |
| --- | --- | --- | --- |
| **批次 1（本轮优先实施）** | 部分实现项第 2、3、4 项的源码可落地缺口：PA-022 授权目录内容搜索、PA-021 iPhone 陪伴跨页面通话与状态连续性、P2–P4 受管任务 helper 预算全覆盖与审计回归复验 | [PROJECT_WORKSPACE_PLAN.md](design/PROJECT_WORKSPACE_PLAN.md)、[IOS_COMPANION_RESEARCH.md](design/IOS_COMPANION_RESEARCH.md)、[audit/README.md](../docs/audit/README.md) | 立即在本机实现并完成定向离线回归 |
| **批次 2（界面与账号扩展）** | 部分实现项第 1、5、6 项：PC/Web 换肤包、PC 用量 Cohort 留存图、独立桌面更新源、GitHub OAuth 设备码登录、U2–U4 视觉演进 | [THEME_PLUGIN.md](design/THEME_PLUGIN.md)、[frontend.md](../docs/frontend.md)、[0021-desktop-update-boundary.md](../docs/adr/0021-desktop-update-boundary.md)、[GITHUB_MODULE_PLAN.md](design/GITHUB_MODULE_PLAN.md) | 批次 1 收口后按需排期 |
| **批次 3（基础设施与新架构）** | 完全未实现项：Linux 多机接入与切换、云电脑 PC 后台（ADR-0015）、iPhone 操控方案、对象存储迁移、首个真实业务场景冻结 | [LINUX_COMPUTER_ONBOARDING.md](design/LINUX_COMPUTER_ONBOARDING.md)、[0015-pc-backend-on-cloud-computer.md](../docs/adr/0015-pc-backend-on-cloud-computer.md)、[IPHONE_CONTROL_PLAN.md](design/IPHONE_CONTROL_PLAN.md)、[STORAGE_SPLIT_MIGRATION.md](design/STORAGE_SPLIT_MIGRATION.md)、[FIRST_TASK.md](design/FIRST_TASK.md) | 依赖服务器环境、真实场景或真机授权后立项 |

---

## 二、本轮（批次 1）实施边界与 Stop-That-Shit 约束

1. **只补真实缺口，不重写稳定路径**：复用现有 `ProjectFileOperationSchema`、`run-tools-project-files.ts`、`useCompanionThreadWatch`、`observedPiStream` 和 `driver.py`，不新建平行框架或额外依赖。
2. **诚实区分本机离线能力与环境依赖项**：
   - 本机（Windows、无 macOS/Xcode、无生产 PostgreSQL/Linux 客体）只完成源码实现、契约/单测/类型检查与驱动单元测试；
   - 真实 Linux Bubblewrap 运行时、专属 WSL 2 guest、Xcode 原生扩展编译签名与真机后台存活、生产 PostgreSQL 并发验收均显式标为**待目标环境验证**，不以离线测试替代。

---

## 三、分项评测矩阵

### 模块 A（第 2 项）：PA-022 项目授权目录内容搜索

目标：在现有单层 `list`、单文件 `read`/`create`/`update` 基础上，补齐受限的授权目录文本内容搜索（`search`），同时覆盖 Windows 本机目录、云电脑 Linux 驱动、共享契约与 Agent 逐次审批工具链。

| 编号 | 评测场景 | 通过条件 | 验证方式 |
| --- | --- | --- | --- |
| **EVAL-A1** | 契约校验与边界 | `ProjectFileOperationSchema` 支持 `operation: "search"`，校验相对 `path`（默认根目录）、非空 `query`（长度上限 200 字符、不含控制字符）、可选 `caseSensitive`；拒绝绝对路径、`..`、反斜线和空查询；结果 `matches` 受条数（≤ 50）与片段长度（≤ 200）约束并携带 `truncated` 标记 | 已通过（14/14 + `tsc`） |
| **EVAL-A2** | Windows 本机目录安全搜索 | `apps/desktop/src/project-directory.ts` 与 `packages/adapters/src/windows-project-files.ts` 仅在已授权句柄/根目录内有限深度遍历普通 UTF-8 文本文件，跳过符号链接/重解析点、超 64 KiB 文件和二进制文件；返回相对路径、1-based 行号与截断行文本，不泄露宿主绝对路径；命中或扫描上限时设置 `truncated: true` | 已通过（12/12 + 28/28 + `tsc`） |
| **EVAL-A3** | 云电脑 Linux 驱动安全搜索 | `infra/native-linux/driver.py` 与 `packages/adapters/src/native-linux-sandbox.ts` 实现 `search`：校验 Run 租约、目录 device/inode 身份、逐层 `O_NOFOLLOW` 打开、同设备普通文件单链接检查、跳过二进制/超限文件；结果格式与契约一致 | 离线通过（驱动校验 23/23、Provider 24/24；Linux dirfd 实跑待 Linux 服务器） |
| **EVAL-A4** | Agent 工具暴露、审批与离线续接 | `project_search_files` 在 `read-only` 和 `read-write` 绑定下均可暴露（不放宽写权限）；每次调用走项目逐次审批（`onceOnly: true`），审批摘要明确说明搜索目录与关键词及文本片段会发给模型；设备离线且未派发时沿用原 Run 排队等待续接 | 已通过（22/22 + 34/34 + `tsc`） |

### 模块 B（第 3 项）：PA-021 iPhone 陪伴功能跨页面与状态连续性

目标：补齐 [IOS_COMPANION_RESEARCH.md](design/IOS_COMPANION_RESEARCH.md) 指出的“跨页面通话与状态连续更新”真实缺口。

| 编号 | 评测场景 | 通过条件 | 验证方式 |
| --- | --- | --- | --- |
| **EVAL-B1** | 通话状态无需等待快照即可即时推送 | 在 `watchCompanionThread` 中，即使 `threads/get` 尚未返回（或切页重连中），只要当前活跃陪伴 Bot 正在语音通话（`listening` / `thinking` / `speaking` / `muted`），通话状态变化能立即更新 Live Activity，不因 `snapshot === null` 被静默丢弃 | 已通过（9/9） |
| **EVAL-B2** | 跨页面与后台恢复连续性 | 保留原陪伴 Bot 监听，切换到其他页面、群聊或历史页时不中断；从后台切回前台（或 `screenState` 变为 `capturing`）时能重新对齐最新线程快照与通话状态；通话结束/静音/切换账号或 Space 时准确收敛状态且不越权回写 | 离线通过（9/9；`@rakazo/mobile` 全包 `tsc` 被既有 7 个无关文件冲突标记阻断） |
| **EVAL-B3** | 真机与原生扩展边界（环境受限项） | Xcode 编译 ActivityKit/Widget/ScreenCaptureKit、免费签名扩展共存与真机后台存活 | 标为**待 macOS/Xcode 与真机验证**（本机不伪造通过） |

### 模块 C（第 4 项）：P2–P4 受管任务控制与原生 Linux 隔离审计缺口

目标：直接修复 [pi-adapters.md](../docs/audit/pi-adapters.md)、[native-linux.md](../docs/audit/native-linux.md) 和 [db-task-execution.md](../docs/audit/db-task-execution.md) 中可在本机源码层闭环的阻塞发现，并实际运行此前“新增但未运行”的定向测试。

| 编号 | 评测场景 | 通过条件 | 验证方式 |
| --- | --- | --- | --- |
| **EVAL-C1** | Pi `helper`（subagent）模型调用强制经过父级受管预算 observer | 修复 `packages/adapters/src/pi-runtime-subagent.ts` 中 `target.config.callObserver ?? host.modelCallObserver` 优先绕过父级 `host.modelCallObserver` 的漏洞：当两者同时存在且非同一实例时，组合执行（父级受管预算/门禁优先，拒绝时直接阻断且不触发模型流，允许后再委托子模型自身 observer），并释放/传播结果 | 已通过（4/4 + `tsc`） |
| **EVAL-C2** | 受管任务控制轮询与 DB 任务执行审计回归实跑 | 实际执行 `managed-task-control.test.ts`、`managed-task-tools.test.ts`、`native-linux-sandbox.test.ts` 及 `packages/db/src/task-execution*.test.ts`，验证 `stop`/`destroy` 拒绝、`pty: false`、租约过期拒绝、expectedVersion 校验、创建重放预算比较与中止传播全部通过 | 已通过（4/4 + 1/1 + 24/24 + 16/16） |
| **EVAL-C3** | 原生 Linux 驱动 `inspect` / `cancel` 实跑核验 | 实际运行 `infra/native-linux/test_driver.py`，核对进程组清理、`cancelRunWork`、`inspectBackgroundWork` 保守语义（不伪造 `idle` 静止证明）以及新增的 `project_file` `search` 路径防护 | 已通过（23/23，4 项 Linux-only 跳过） |
| **EVAL-C4** | 真实 Linux / PostgreSQL 并发与强隔离（环境受限项） | 真实 PostgreSQL 行锁/RLS 并发、Linux `SO_PEERCRED`/systemd/Bubblewrap/WSL 2 客体隔离负向实测 | 标为**待授权 Linux/PostgreSQL 服务器验收** |
