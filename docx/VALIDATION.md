# 验证记录

## V-023：Sydney 品牌和本地预览

- 日期：2026-11-04；关联 PA-009、PA-018。图标导出脚本成功运行；5 个定向 Vitest 文件共 69 项通过，覆盖 Web、桌面和移动端名称相关逻辑及现有本地化回归；11 个相关源码文件的 Biome 检查和 `git diff --check` 通过。
- 本地浏览器检查中文及英文登录页，标题分别为“登录 Sydney”和“Sign in to Sydney”，页面标题为 Sydney，显示透明原标志。Web 及移动端图标抽样尺寸、透明通道和透明角像素检查通过。
- 根据用户授权运行本地 Docker PostgreSQL、API、Worker、桌面监督和 Web；自动迁移入口在 Windows 上因 `spawnSync pnpm ENOENT` 失败，改为对新建本地数据库分别运行 Prisma 迁移、队列迁移和运行角色初始化。
- 未进行原生桌面打包、Android/iOS 构建、Apple Icon Composer、平台图标显示和真实任务验收；上游营销站、邮件及云服务仍有原品牌。浏览器预览和本地数据库不代表服务器部署验收。

## V-023：后台机清理后复核

- 日期：2026-11-04；SSH 只读复核显示桌面账号及家目录不存在，五个项目及基础服务 active，两个既有容器运行中；可用内存约 1092 MiB，根分区已用 13 GB、可用 25 GB。
- 清理后早前接口检查显示 canvas 与 cloud 文档返回 200、webdav 返回 401、myself-api 根路径返回 404；本次复核未重新测试接口业务功能。
- 仍有 XFCE 相关软件包。对候选卸载运行 APT 模拟时，计划引入 85 个新包，未执行实际卸载；不能认定桌面依赖已全部清除。

## V-022：桌面 Agent 基础操作

- 日期：2026-11-04；关联 PA-004、PA-010、PA-011、PA-012、PA-017。Windows 上以 Python 标准库执行 `python -m unittest discover -s infra/native-linux -p test_driver.py -q`，12 项通过；截图、鼠标、粘贴和滚动均使用替身。
- 新增 Provider 能力和命令超时的 Vitest 断言未运行；尝试使用此前存在的 TypeScript 6.0.3 缓存进行语法转译，但模块文件已缺失，命令失败。未运行类型检查，没有安装依赖。
- 未连接 X11、浏览器、模型、PostgreSQL 或远程服务器；不能由替身结果推断中文粘贴、运行时图形工具暴露、命令清理或双机操作已正常。

## V-021：双机方案文档核对

- 日期：2026-11-04；关联 PA-004、PA-005、PA-006、PA-009 至 PA-018。根据用户新部署方向与当前 `native-linux` Provider/socket、驱动 peer UID 及既有运维记录核对方案。
- 检查本轮文档差异空白和新增主要相对链接；没有执行应用测试、类型检查或双机运行。
- 未连接两台服务器，未验证 SSH 转发、身份、网络、资源、数据库、模型、桌面或恢复；已有本地 socket 代码与单机 systemd 草案不构成双机验收证据。

## V-020：重试保留任务预算

- 日期：2026-11-04；关联 PA-005、PA-006。实现及新增测试文件经现有 TypeScript 6.0.3 语法转译无诊断；这不是类型检查。
- 新增数据库替身用例检查重试时保留用量和截止时间、截止后不创建 Run；由于现有 Vitest 依赖缺失，测试未运行。
- 未连接 PostgreSQL 或模型；旧版已被清零的历史用量不能恢复，真实并发、辅助模型和费用仍待验收。

## V-019：创建幂等预算检查

- 日期：2026-11-04；关联 PA-001、PA-004、PA-005。使用现有 TypeScript 6.0.3 对数据库实现和新增测试进行语法转译，均无诊断；不是类型检查。
- 新增测试覆盖相同 nonce 和预算的重放、分别修改五个预算字段的拒绝；Vitest 因现有依赖缺失无法启动，测试未运行。
- 未启动或连接 PostgreSQL，未验证唯一约束、并发 upsert 和事务隔离；没有安装依赖。

## V-018：桌面指针校验与需求清单

- 日期：2026-11-04；关联 PA-010、PA-012；Windows 使用 Python 标准库，未启动驱动或桌面服务。
- 运行 `python -m unittest discover -s infra/native-linux -p test_driver.py -v`：8 项通过，包含非法指针动作不调用桌面命令、正常点击先移动后点击，以及既有租约和路径策略检查。测试使用替身，不执行真实鼠标操作。
- 需求清单依据当前代码、计划与模块审计整理，不构成新的功能测试或真实验收；Linux、X11、多动作部分执行、服务账号和数据库尚未验证。

## V-017：受管工具分发中断检查

- 日期：2026-11-04；关联 PA-005、PA-006、PA-010；Windows、Node.js 22.22.0，未安装依赖或启动服务。
- 对 `run-tools.ts` 和对应测试使用现有 TypeScript 6.0.3 的 `transpileModule` 执行语法转译，均无诊断；这不是类型检查或行为测试。
- 尝试从现有 pnpm 缓存运行 `run-tools.test.ts` 的单文件 Vitest，启动失败：缺少 `@vitest/utils`；新增用例与普通 Run 回归均未执行。
- 未验证 PostgreSQL、真实审批、模型、Linux 进程或外部副作用。审批门禁内部及已发出请求的取消竞态仍存在，不可作为停止证明。

## V-016：启动准备阶段控制传播

- 日期：2026-11-04；关联 PA-005、PA-006、PA-014。
- 新增 executor 替身测试：控制读取不可用时，应在模型和连接准备前结束 Attempt，且不自动重新排队；新增 watcher 预中止测试。Vitest 未能启动，测试未执行。
- watcher 内存替身检查 4 项通过：控制拒绝、读取异常、预先中止不读取，以及读取未结束时关闭不再中止。
- 4 个受影响 TypeScript 文件语法转译无诊断，不是完整类型检查；定向 Vitest 启动失败，缺少 `node_modules/vitest/vitest.mjs`。
- 未执行普通 Run 回归、真实 PostgreSQL 行锁与竞争、Linux 进程清理、Pi 或外部服务；控制轮询不能证明在途操作停止。
- `git diff --check` 及 6 份相关文档的尾随空白、冲突标记和相对文件链接检查通过。

## V-014：数据库边界、历史上限与排队事件

- 日期：2026-11-04；关联 PA-003、PA-005、PA-006、PA-010。
- 对照 Prisma schema 和生成的 `ExternalEffectWhereInput` 核查 effect 查询字段；用户归属经关联 Run 限制，排除内部 checkpoint。此为静态核查，不是数据库类型或 RLS 验证。
- 使用缓存 TypeScript 6.0.3 对 8 个相关 TS/TSX 文件做语法转译，诊断数为 0；不等同于类型检查。
- 用内存替身执行投影和历史读取检查：当前 Run 指针、缺失当前 Run、恰好达到历史上限、超限截断共 4 项通过；不等同于 Vitest、真实事务或并发测试。
- 排队事件、事务回滚、通知以及队列重放只完成代码与测试编写和静态检查，尚未运行集成测试。任务行与线程行锁顺序需通过 PostgreSQL 并发测试验证。
- 定向 Vitest 重试仍未启动：`pnpm exec vitest ...` 报 `Cannot find module node_modules/vitest/vitest.mjs`；没有安装或恢复依赖。
- `git diff --check` 通过；另对 6 份本轮文档检查尾随空白、冲突标记和相对文件链接，未发现问题。Git 检查不覆盖未跟踪文件。
- 未执行 Vitest、完整类型检查、真实 PostgreSQL、队列、Linux 桌面、模型及浏览器联调；当前 Node 版本低于项目要求，Vitest 依赖不完整，未安装或恢复依赖。

## V-013：任务控制、结果投影与排队取消修复

- 日期：2026-11-04；关联 PA-003、PA-005、PA-006、PA-010、PA-014。
- 代码修复：排队取消在 Task 行锁事务内增加 `managed_task`/`queued` 条件和可恢复状态清理；Worker 抢先领取时保持未确认；完成验证查询同一 Task 全部 Run 的未结算 effect；历史读取排除 `reconciled` effect；完成 Run 无 evidence 返回 `completion_unverified`，历史不完整时 API 不进入成功/确认路径；managed 工作台不再发送 `ask_user` 授权。
- 替身行为验证通过：排队取消、Worker 抢占竞争、跨 Run 未结算 effect、任务投影的未确认/已确认/活动取消状态。
- TypeScript/TSX 语法检查：7 个改动文件，错误数 0。未做完整类型检查。
- 定向 Vitest 尝试失败：启动时仍缺少 `@vitest/utils`，测试没有执行；没有安装或恢复依赖。
- 未执行：真实 PostgreSQL 行锁与迁移、API/Worker/Pi 集成、浏览器 E2E、Linux 驱动、模型/App、备份恢复和资源测量。
- `git diff --check` 已执行通过；不覆盖未跟踪文件，文档另做静态检查。

## V-015：授权续期与原生文件准入

- 日期：2026-11-04；关联 PA-004、PA-005、PA-010、PA-012、PA-014。
- `infra/native-linux/test_driver.py` 执行 6 项 Python unittest，全部通过；覆盖文件操作缺少/过期 lease、旧 fence、授权请求到达处理器、路径和桌面互斥。
- 使用缓存 TypeScript 6.0.3 对 `packages/db/src/task-execution.ts` 和对应测试做语法转译，诊断数为 0；不等同于完整类型检查。
- 内存替身检查通过 4 项：终态续期拒绝、续期状态竞争拒绝、条件更新成功、已有 Run 时 `retry=false` 拒绝。
- 未执行 Vitest、完整类型检查、真实 PostgreSQL/RLS/并发、Linux systemd/socket/账号权限、普通 Run 回归、Pi、模型、App 和浏览器 E2E。
- `git diff --check` 和本轮 7 份文档尾随空白、冲突标记、相对链接检查通过。

## V-012：managed 工具暴露与尽力中断

- 日期：2026-11-04；关联 P2/P3/P4、PA-004、PA-005、PA-006、PA-010、PA-014。
- 使用已有 TypeScript 6.0.3 缓存的内存转译及 Node 22.22.0 运行三个轻量检查：工具过滤保留已授权受支持工具并排除 helper/直通入口；控制轮询在状态变化或读取失败时中断；socket 替身在 AbortSignal 触发时关闭连接。三个检查通过，均不连接真实数据库或 Linux 驱动。
- `python -B infra/native-linux/test_driver.py`：3 项策略测试通过；Windows 使用测试替身，未启动桌面或服务。
- 对 10 个本轮 TypeScript 文件做 `transpileModule` 语法诊断，错误数 0；未做类型检查。
- `git diff --check` 通过（仅已跟踪差异）；10 份相关 Markdown 的相对文件路径、尾随空白及冲突标记检查通过。
- 尝试运行 4 个 Vitest 定向测试文件时启动失败：缓存缺少 `@vitest/utils`，任何测试均未执行；未恢复或安装依赖。当前 Node 22.22.0 低于项目要求的 22.22.2。
- 未执行：Executor/DB/Pi 集成与普通 Run 回归、真实 PostgreSQL、Linux socket 和进程清理、真实模型及 App。故工具隔离和中断机制均尚未生产验收。
- 未启动 Docker、数据库或桌面服务，未调用模型，未提交或推送。

## V-011：原生电脑租约与 managed Run 过期检查

- 日期：2026-11-04；关联 P2/P3/P4、PA-004、PA-005、PA-006、PA-010、PA-012、PA-014。
- 轻量语法检查：使用已有 TypeScript 6.0.3 缓存的 `transpileModule` 对 7 个改动 TypeScript 文件做语法诊断，错误数为 0；这不是类型检查。
- 轻量行为检查：用同一缓存将 Provider 转译到内存，在 Node 22.22.0 中以替身 transport 验证首次有效租约可读取、第二次失效租约被拒绝且没有第二次 transport 调用；通过。该检查未调用 factory、Executor、真实数据库或驱动。
- 测试失败：直接运行现有缓存 Vitest 4.1.12 的两个定向测试文件，启动时缺少 `@vitest/utils`，测试没有执行；未安装或恢复依赖。当前进程的 Node 22.22.0 也不满足项目声明的最低 22.22.2，后续应在满足版本要求的授权环境运行。
- 静态检查：`git diff --check` 通过（仅已跟踪差异）；本轮涉及的 11 份 Markdown 相对文件路径、尾随空白和冲突标记检查通过。
- 未执行：项目类型检查、Biome、真实 PostgreSQL 并发、Linux 驱动、原版与定制版端到端对照、模型及 App 连接。未经这些验证不能把修复标记为生产可用。
- 无 Docker、数据库、桌面或模型调用；未提交或推送。

## V-010：控制边界与审计复核

- 日期：2026-11-04；范围：停止确认、取消后完成确认、Native 后台检查参数及相关文档。
- 静态复审：核对调用方传入 computer ID、driver 无目标 Run 时检查 Bot 全部已跟踪进程；该查询仍不能证明空闲。核对服务端在无法证明静止时拒绝停止确认。
- 新增及调整了数据库和 Provider 测试；未执行测试、类型检查、格式工具、真实数据库或 Linux 运行验证，不能据此声称修复已验证。
- 静态检查：`git diff --check` 通过（仅涵盖 Git 已跟踪差异）；另检查本轮涉及的 13 份 Markdown，相对文件链接、尾随空白和冲突标记均通过。
- 没有安装依赖、启动服务、调用模型、提交或推送。

## V-009：模块静态审计与架构文档

- 日期：2026-11-04；范围：源码入口审阅、模块权限/状态边界、Native Provider 与 Web 路由针对性修正、项目架构说明、文档导航与相对链接。
- 审阅模块：core/contracts、DB task execution/history、Pi executor/runtime/helper、Native Linux Provider/driver/systemd、Task API/Web、Connector/OAuth/Messaging、Operations。
- 实际验证：代码与文档按调用链静态阅读；历史 V-003 至 V-008 只作为既有离线证据，本轮没有重跑。依赖仍不可用，未安装或恢复依赖。
- 代码修订：补 `/app/tasks` Web lazy route 与路由测试；Task 状态入口增加 expectedVersion 与安全转换；managed model/tool guard 显式进入 tenant DB context；Native Provider 改为 stop/destroy 显式 unsupported、关闭 PTY capability、接出 cancel/inspect，并传入 Run owner/fence/期限；新增 Web、DB、Provider 测试。上述测试未运行，不能标记通过。
- 文档检查：新增项目架构说明和七份模块审计报告；`git diff --check` 通过；相对链接扫描首次脚本对仓库根文件路径处理有误，修正脚本后重跑通过；尾随空白、冲突标记扫描通过，必需文档入口存在。
- 审计结论：DB task execution、Pi adapters、Native Linux、Operations 阻塞；core/contracts、API/Web、Connectors 条件通过。详见 `docs/audit/README.md`。
- 未执行：测试、类型检查、Biome、构建、PostgreSQL、Linux/socket/systemd、真实模型、OAuth/MCP/App、浏览器 E2E、备份恢复和资源测量。
- 限制：静态审阅不证明并发/租户隔离或服务器能力；暂停/取消的即时服务端中断与真实进程静止证明、helper/辅助模型预算覆盖仍不完整。新增 Provider、路由和 DB 状态机测试均未运行，全部相关实现需回归后重新评估。
- 成本与副作用：没有模型调用或服务启动，无额外 token/云费用。
- 提交状态：未提交、未推送。

## V-008：根目录迁移核对与 Native Provider 身份修正

- 日期：2026-11-04；范围：源码根目录布局、原生 Provider 的 Bot/代数/租约请求绑定。
- 实际检查：`git diff --check` 通过；源码依赖目录存在，但根级 Vitest、TypeScript、Biome 命令链接均缺失。调用 pnpm 缓存中的 Vitest 失败，缺少 `@vitest/utils`；TypeScript 与 Biome 缓存包缺少 Windows 平台二进制。
- 测试与类型检查：未执行成功；未安装、下载或重建依赖。当前 Node 为 22.22.0，与先前记录的 24.15.0 环境不同。
- 改动：新增跨 Bot 拒绝和 socket 身份字段覆盖测试；生产 transport 以 `ComputerRef` 绑定 Bot 与 generation，保留字段最后合并；Provider 无进程级单 Bot/代数状态。systemd 草案改为仓库根路径和实际读取的 socket 环境变量名。
- 清理：删除仅含 `app/docs` 的空迁移目录，以及两份生成的 `.pyc` 缓存；源码未移动。Linux socket、systemd 与权限隔离未验证。
- 提交状态：未提交、未推送；本机未启动任何服务或容器。

## V-007：P5/P6 离线收尾验证

恢复执行后补记（2026-11-03）：修复 Provider 接口实现并注册 `native-linux` 到 sandbox 工厂；挂载任务路由并对齐 db 函数签名后重跑：10 个定向测试文件共 116 项通过（含 Web 工作台、run-tools 及 keyless/web 回归 79 项），Python 驱动 3 项通过；core、db、adapters、api、web 类型检查均通过；Prisma schema 校验通过；Biome 检查 9 个改动文件通过（首次 12 错误，修复后复验通过）。上述均为离线测试，不构成服务器或生产验收。

日期：2026-11-03。Node 24.15.0，Vitest 4.1.12，单 Worker；数据库、Provider 和复制数据库标志均显式清空。

修复 `Tasks.test.tsx`：任务列表未渲染前不要点击；改为等待列表和详情出现。随后运行 6 个定向测试文件，共 72 项通过；Python 驱动策略测试另行执行，3 项通过。

最终定向测试文件：`task-execution.test.ts`、`task-tool-resource.test.ts`、`task-runtime-guards.test.ts`、`run-tools.test.ts`、`native-linux-sandbox.test.ts`、`Tasks.test.tsx`。另跑 `keyless-http-web.test.ts` 18 项通过。格式化后复跑上述 TypeScript 定向测试，共 72 项通过。

类型检查通过：`packages/db`、`packages/core`、`packages/adapters`、`apps/api`、`apps/web`。在 `packages/db` 执行 Prisma schema 校验通过。Biome 检查本批 10 个 TypeScript/TSX 文件通过；首次报告格式问题，`--write` 修复后复验通过。

未执行：真实 PostgreSQL 迁移与并发、真实模型、浏览器 E2E、Linux 服务、桌面和备份恢复演练。本批格式化后复跑的是上述 TypeScript 测试；Python 测试不受格式化影响。离线测试不能证明生产部署验收。

## V-006：原生桌面适配离线子项

日期：2026-11-03。Node 24.15.0、Vitest 4.1.12、单 Worker：`native-linux-sandbox.test.ts` 6 项通过，验证租约拒绝、代数绑定、失联不重放和未支持能力声明。Python 3.13 在 Windows 运行策略测试 3 项通过，覆盖路径校验和桌面租约互斥；使用测试替身替代 Windows 不存在的 Linux `pwd` 模块。

首次 Python 测试因 Windows 无 `pwd` 未能加载，加入仅用于测试的替身后重跑通过。没有启动本机服务、桌面、数据库或容器。未验证 Linux 的 Unix 套接字对端 UID、文件系统防符号链接、X11、进程组、systemd、屏幕体验和真实权限隔离；这些不能从 Windows 替身测试推断。

## V-005：任务持久化与执行门禁定向测试

日期：2026-11-03。Node 24.15.0，Vitest 4.1.12，单 Worker，数据库和 Provider 验证开关均为空。

执行 `vitest run`，限定 `task-execution.test.ts`、`task-tool-resource.test.ts`、`task-runtime-guards.test.ts`、`run-tools.test.ts`：4 个文件、59 项通过，约 35 秒。包括既有工具审计回归；数据库部分为事务替身。

Prisma 7.10.1 客户端生成成功，未启动服务或执行迁移。第一次使用根目录 Prisma 路径失败，改用已安装的数据库包 CLI 后成功。首次数据库类型检查发现三个可空类型问题，已修正；随后适配器包类型检查通过，后续新增修改需在批次收尾复核。

尚未验证：真实数据库行锁/事务竞争、API 浏览器联调、模型发送、桌面和服务器部署。没有把定向测试等同于 P2/P3 整阶段验收。

只记录实际执行的验证。规划中的测试写在 [总计划](PLAN.md)，未执行、跳过、失败和通过分别说明，不用“计划覆盖”代替通过证据。

## 本机验证约束

- 纯文档改动只做相对链接、格式、状态和基线一致性检查，不运行应用测试。
- 后续代码验证优先运行受影响的确定性离线测试，限制并发与范围。
- 不自动运行全工作区构建、安装依赖、启动 Docker、数据库或桌面。
- 真实模型、外部副作用、Linux 桌面和部署验证在明确授权的环境执行，并记录成本及数据范围。
- 不在此粘贴密钥、连接串、原始运行日志或敏感内容；用命令、退出状态和结论描述证据。

## V-000：历史底座验证

- 日期：2026-11-03，来自前期已执行结果；本次未重跑。
- 环境：独立 Rakazo 代码副本，固定提交 `aebca9dcfd0cf734484ce41e3c5ad9521551659d`，当时使用 Node.js 24.15.0、pnpm 9.15.0。
- 通过：依赖安装、22 项静态检查任务、2 个文件中的 21 项 Pi 离线测试、Compose 配置语法检查。
- 失败或未完成：Linux 桌面镜像构建、PostgreSQL 镜像拉取、完整服务启动。
- 限制：不代表原生 Linux Provider、DSH 风格任务编排、真实模型或任何 Sydney 功能通过验收。
- 详细记录：[底座试点记录](../docs/rakazo-evaluation.md)。

## V-001：P0 文档结构与一致性

- 日期：2026-11-03。
- 范围：`docx/`、协作约定、文档导航及相关技术方向记录。
- 实际执行：使用 PowerShell 检查 10 份变更文档的相对文件链接及尾随空白，核对 `docx/` 五份必须文件；解析基线 JSON，通过 Git 核对固定提交与源码工作区状态。
- 实际结果：以上检查通过；固定提交与记录一致，独立 Rakazo 源码工作区无改动。
- 阶段状态：P0 仅文档体系完成，P1 至 P6 未开始；没有将业务或服务器能力标为完成。
- 未执行：业务测试、构建、依赖安装、服务启动和服务器操作；本次仅改文档，无需运行。
- 通过条件：链接有效、事实与基线一致、阶段状态有证据、不把占位运维项写成可执行方案。
- 限制：这是文档检查，不是应用测试或原生服务器运行验收；历史底座测试没有在本次重跑。

## V-002：P1 设计核对与文档检查

- 日期：2026-11-03；关联阶段：P1 技术子项；业务场景及服务器验收未完成。
- 实际核对：固定源码的 Prisma Task/Run/Attempt/Ticket/ExternalEffect、Run 状态机、审批、取消、电脑租约、Pi 工具入口及原生桌面相关 Provider。源码符号与定位见两份设计文档。
- 静态审查结论：可以复用现有执行和存储；现有 `desktop` 并非生产图形桌面；不删除生产保护、不启动旧 host runner 来替代新 Provider。
- 实际执行：PowerShell 检查当前仓库 26 份 Markdown 的相对文件链接、尾随空白和冲突标记；解析基线 JSON，与应用 HEAD `aebca9dcfd0cf734484ce41e3c5ad9521551659d` 比较。
- 结果：以上检查通过；JSON 新增当前部署方向，原 Docker Provider 字段保留为历史试点记录，不作为当前部署配置。
- 未执行：发行版支持周期/外部软件最新版本核验、服务器能力、目录权限、协议签名和 Linux 桌面实测。候选系统、服务、路径及参数只作为设计，不作为采购或生产可用声明。

## V-003：P2 派工与授权纯策略

- 日期：2026-11-03；关联需求：PA-001、PA-003 至 PA-006、PA-010；状态：纯策略子项通过，P2 整阶段未完成。
- 环境：Windows 本机、已安装 Node.js 24.15.0、Vitest 4.1.12；使用现有依赖，没有安装、下载或调用 pnpm 全工作区命令。
- 工作目录：项目仓库根目录。测试显式清空 VERIFY_DATABASE / VERIFY_PROVIDERS / COPY_TEST_DATABASE 的进程级标志，使用原离线测试配置。
- 测试命令：`node node_modules/vitest/vitest.mjs run packages/core/src/task-assignment.test.ts packages/core/src/task-mandate.test.ts packages/core/src/run-state.test.ts --project shared --maxWorkers 1`。
- 结果：3 个测试文件、150 项通过。覆盖派工去重、旧空 nonce、归属冲突、终态/活动状态、显式重试、历史完整性、未知副作用、次数上限；授权身份、来源、时间边界、撤销、缺失控制状态、租约、接管、审批和精确 scope 匹配。
- 类型检查命令：`node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json`；退出状态 0，只检查核心包，未运行全工作区构建。
- 格式及规则：对 `task-assignment.ts`、`task-assignment.test.ts`、`task-mandate.ts`、`task-mandate.test.ts`、`index.ts` 运行现有 Biome `check`；最终 5 文件通过。Git 跟踪差异空白检查通过，新增文件另由 Biome 检查。
- 过程失败：早期 Biome 检查报告测试/授权源码的格式换行差异；修复后复验通过。业务测试未出现失败；150 项结果包含既有 Run 状态机回归，不是 150 项端到端任务。
- 独立复核：子 Agent 对派工及授权模块只读审查；主 Agent 修复安全状态可缺省问题后复审无其他有证据的独立缺陷。静态审查不代替本次实际测试。
- 成本与副作用：未启动模型、数据库、Docker、桌面或应用服务；新策略本身无 I/O，不产生模型 token 费用。
- 限制：尚无可信授权入口、撤销存储读取、事务并发、真实 fence/路径/网络校验、Pi 接线或服务器运行验证。`reuse` 只返回已有 Run，不调度；`create` 只返回意图，不产生运行记录；允许结果不证明认证和生产授权有效。

## V-004：P2 状态投影与现有数据库读取适配

- 日期：2026-11-03；关联需求：PA-003、PA-005、PA-006、PA-010。
- 环境：Windows 本机、已安装 Node.js 24.15.0 与现有依赖；未安装或下载任何包。
- 新增范围：`packages/core/src/task-projection.test.ts`、`packages/db/src/task-execution-history.test.ts`；数据库测试使用确定性 Prisma 替身和现有 AsyncLocalStorage tenant 上下文，不连接数据库。
- 首轮测试：指定上述两个文件、shared 项目、单 worker，71 项通过。之后补控制意图保留、零 fence 及未结束记录的保守处理，进行最终回归。
- 最终测试命令：`node node_modules/vitest/vitest.mjs run packages/core/src/task-projection.test.ts packages/db/src/task-execution-history.test.ts packages/core/src/task-assignment.test.ts packages/core/src/task-mandate.test.ts packages/core/src/run-state.test.ts --project shared --maxWorkers 1`。
- 最终结果：5 个文件、222 项通过，其中本轮新增 72 项，前轮 150 项为实际重跑；耗时约 9 秒。进程级 VERIFY_DATABASE / VERIFY_PROVIDERS / COPY_TEST_DATABASE 标志显式清空。
- 覆盖：取消与暂停的请求/静止确认、正常在途与未知效果、租约 owner/fence/到期、状态和 Attempt 冲突、独立完成证据、旧历史保留；数据库上下文与跨归属拒绝、查询字段、checkpoint 过滤、每类数量上限、截断标志及错误传播；读取与投影的离线组合。
- 类型检查：分别运行 `node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json` 和 `node node_modules/typescript/bin/tsc --noEmit -p packages/db/tsconfig.json`，最终均退出 0。
- 格式/规则：本轮 4 个新增模块/测试及核心/数据库的 `index.ts` 共 6 个文件，现有 Biome `check` 最终通过。未运行全工作区构建或完整测试集。
- 失败保留：首次类型检查报告状态字符串类型和 mock 参数推断错误，修复后两包通过；格式检查先后报告导入排序/换行及新条件换行问题，修复后最终通过。业务测试本轮未失败。
- 文档验证：PowerShell 核对当前 28 份 Markdown 的相对文件链接、尾随空白与冲突标记，解析固定基线 JSON 并与应用 HEAD 核对，全部通过。应用 Git 跟踪差异空白检查及 4 个本轮新增文件的空白/冲突标记检查也通过。
- 未执行：真实 PostgreSQL 查询、RLS、RepeatableRead 并发隔离、迁移、Linux 服务/桌面、模型或完整用户任务。替身验证参数与逻辑，不能证明真实数据库隔离已经生效。
- 成本与副作用：未启动 Docker、数据库、应用或桌面服务，未调用真实模型；没有模型 token 费用。没有创建新对话窗口或调用子代理。
- 限制：读适配器和投影仅导出，API/Worker 尚未调用；currentRunId、控制静止和完成证据仍需可信存储与版本化接线，不能从展示状态推断实际进程已经停止。

## 后续验证记录格式

每条使用连续编号，包含日期、关联阶段与需求、版本和环境、命令或步骤、实际结果、失败原因、未执行项、成本或副作用及适用限制。修复后复验保留前一次失败结论，再追加最终结果。
