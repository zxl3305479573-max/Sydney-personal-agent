# Sydney 开发文档入口

更新日期：2026-11-04。

本目录保存开发计划、过程记录、验证结论和运维说明。目录名按用户要求使用 `docx`，正文目前使用 Markdown，便于检索、比较修改和随代码维护；当前没有生成 `.docx` Word 文件。

## 文档导航

| 文档 | 负责内容 | 更新时机 |
| --- | --- | --- |
| [总计划](PLAN.md) | 阶段、依赖、需求、交付物、验收条件和当前状态 | 开始、完成、中断或调整阶段时 |
| [开发记录](DEVELOPMENT_LOG.md) | 实际做了什么、为什么改、改到哪里、未完成事项 | 每个可验收部分交付或工作中断时 |
| [验证记录](VALIDATION.md) | 验证范围、环境、实际结果、限制和未执行项 | 每次有验证结论时 |
| [需求验收清单](ACCEPTANCE.md) | 需求的现有基础和验收缺口 | 需求证据或验收结论变化时 |
| [运维手册](OPERATIONS.md) | 部署、账号权限、配置、升级回滚、备份恢复和排障 | 实现或改变对应运行行为时 |
| [首个工程任务](design/FIRST_TASK.md) | 离线工程场景、完成证据、数据发送及预算边界 | 场景与验收条件变化时 |
| [任务与 Run 映射](design/TASK_RUN_MAPPING.md) | 复用源码、状态、审批、事务和 Pi 接线位置 | 任务与持久化契约变化时 |
| [原生 Linux 设计](design/NATIVE_LINUX_DESIGN.md) | 同机账号、驱动协议、能力、清理与服务器验收清单 | 原生 Provider 或部署边界变化时 |
| [双机实施方案](design/TWO_HOST_DEPLOYMENT.md) | 后台与云电脑分离部署、连接安全和验收 | 双机设计、部署或验证变化时 |
| [Linux 云电脑接入与切换](design/LINUX_COMPUTER_ONBOARDING.md) | 多台已有 Linux 电脑的接入、自动准备与安全切换草案 | 范围、实现或验收变化时 |
| [存储划分与迁移方案](design/STORAGE_SPLIT_MIGRATION.md) | 后台控制数据、云电脑工作区和对象存储的划分与迁移 | 存储布局、迁移、清理或回滚变化时 |
| [PC 客户端联调计划](design/PC_CLIENT_INTEGRATION.md) | Electron 客户端与后台、模型和云电脑的联调及 Web 服务移除顺序 | PC 客户端开发、打包或入口调整时 |
| [PC 后台部署决策](../docs/adr/0015-pc-backend-on-cloud-computer.md) | 云电脑 PC 后台与主后台控制服务的边界和权限 | PC 后台部署、认证或资源边界变化时 |
| [注册开放实施清单](design/REGISTRATION_ROLLOUT.md) | 注册开关、邮件配置和真实验收顺序 | 注册配置或认证验收变化时 |
| [P2 策略接口](design/TASK_POLICY_IMPLEMENTATION.md) | 实际纯策略、调用方责任和集成缺口 | 策略实现变化时 |
| [P2 状态投影与读取](design/TASK_PROJECTION.md) | 已实现的任务状态、历史读取、安全条件和验证局限 | 投影或读取契约变化时 |
| [任务执行接线](design/TASK_EXECUTION_INTEGRATION.md) | 持久化、用户 API、Pi 门禁与预算 | 执行链路变化时 |
| [聊天外观方案](design/CHAT_APPEARANCE.md) | 聊天背景、气泡和搭配管理的范围与验收 | 外观需求或实现变化时 |
| [热插拔插件历史设计](design/HOT_PLUGIN_SYSTEM.md) | 已停止推进的插件方案与离线试点记录 | 仅保留历史参考 |
| [窗口分工与交接](WORKSTREAMS.md) | 独立对话的实际归属、文件写集和未派发任务 | 分工、交接或窗口能力变化时 |

技术细节继续放在已有的 [需求](../docs/requirements.md)、[架构](../docs/architecture.md)、[安全](../docs/security.md)、[电脑设计](../docs/cloud-computer.md) 和 [架构决策](../docs/adr/0004-native-server-and-task-orchestration.md) 中，通过链接关联，不复制多份相同规则。

## 当前项目状态

- Web 已迁至云电脑隔离试运行，后台保留回环入口、API 和 Worker；当前验收与回滚限制见 [ADR-0013](../docs/adr/0013-isolated-cloud-web-proposal.md) 和 [运维手册](OPERATIONS.md)。
- Rakazo 底座、Sydney 二次开发代码和项目配置统一位于当前仓库根目录；本目录只保存计划、开发过程、验证和运维文档。
- Rakazo 基线已经导入；上一次底座静态检查与 Pi 离线测试有通过记录，不能代表 Sydney 功能已实现。
- P2/P3 已接入授权存储、用户任务 API、Pi 工具与主模型门禁；已有定向离线验证，真实数据库和模型尚未验收。继续推进 P4–P6，实际证据见总计划与验证记录。
- 后续目标为后台与独立 Agent 云电脑分机运行，默认不依赖 Docker；跨机连接仍待实现和验证。
- 保留 Pi 执行层，参考 DSH 的任务、派工和授权思路；未引入 DSH 运行时或复制其源码。纯策略取舍见 [ADR-0005](../docs/adr/0005-task-policy-before-executor-integration.md)。
- 本机不启动服务或进行重负载构建。云电脑已有桌面配置记录；候选后台机的实际资源、连接和项目部署状态尚待核实。
- 后续按用户要求不再调用子代理；当前没有创建独立对话的工具接口，本次仍由当前窗口执行，交接任务未虚报为并行启动。

## 状态和完成规则

新增专题文档：[Sydney 项目架构说明](../docs/project-architecture.md) 和 [按模块审计](../docs/audit/README.md)。2026-11-04 静态审计发现 DB task execution、Pi adapters、Native Linux 和 Operations 存在阻塞项；不能把此前离线接线描述为生产闭环。

原生 Run 租约校验的设计与验证限制见 [ADR-0006](../docs/adr/0006-native-run-lease-validation.md) 和 [V-011](VALIDATION.md#v-011原生电脑租约与-managed-run-过期检查)。

managed 直通工具限制与尽力中断见 [ADR-0007](../docs/adr/0007-managed-runtime-control.md) 和 [V-012](VALIDATION.md#v-012managed-工具暴露与尽力中断)。

阶段状态仅使用：未开始、进行中、已完成、阻塞。已经做过的历史试验保留原结果；停止继续本机试验不等于删除其历史记录。

一个部分只有同时具备以下内容才能标为已完成：

1. 对应交付物实际存在，且满足该部分的验收条件。
2. 已记录相关需求、变更位置和实际验证结果；未执行项有明确说明。
3. 总计划、开发记录及受影响技术文档已同步；涉及运行行为时同步运维手册。
4. 剩余问题和限制已记录。只通过离线测试的内容，不能标为已通过真实服务器验收。

## 每次工作如何记录

1. 工作前确定阶段与范围，避免在未更新计划时扩大实现。
2. 工作中记录关键决策和实际失败；重要取舍另写 ADR。
3. 工作后先补开发与验证记录，再更新阶段状态和下一步。
4. 若用户要求提交，分别检查文档仓库和代码仓库，使用中文编号分点说明；不自动提交或推送。

提交说明示例：

```text
1、新增任务与派工状态转换，保留每次执行的关联记录
2、补充授权过期和取消的离线验证
3、同步开发记录、阶段计划和任务恢复说明
```
