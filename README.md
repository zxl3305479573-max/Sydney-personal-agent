# Sydney Personal Agent

一个面向个人使用的智能助手项目。Agent 使用 TypeScript 开发，优先面向 PC，支持自然语言任务、可插拔云电脑、任务记录和个人记忆。

Rakazo 源码、Sydney 二次开发代码、Linux 驱动和项目配置现在统一位于本仓库根目录。`docx/` 保存计划、开发记录、验证记录和运维文档，`docs/` 保存产品、架构和 ADR。

本项目仍处于离线内核开发和接口接线阶段，未完成真实模型、PostgreSQL、Linux 桌面和服务器部署验收。应用代码基于 Rakazo 固定提交 `aebca9dcf`，继续复用 Pi Runtime、Run、工具、审批、记忆和 Provider 接口。

按用户要求，本机只进行范围受控的编辑和离线验证；不自动启动 Docker、数据库、桌面服务或全工作区构建。阶段状态以 [docx/PLAN.md](docx/PLAN.md) 为准。

## 文档导航

| 文档 | 用途 |
| --- | --- |
| [开发文档入口](docx/README.md) | 总计划、开发记录、验证记录和运维手册 |
| [产品需求](docs/requirements.md) | 明确目标、第一版范围、需求编号和验收条件 |
| [系统架构](docs/architecture.md) | 定义模块职责、数据模型和任务执行流程 |
| [Sydney 项目架构说明](docs/project-architecture.md) | 说明当前源码分层、Pi 编排、云电脑、App 连通及真实能力状态 |
| [模块审计](docs/audit/README.md) | 查看各模块风险、审计结论及尚待服务器验证的事项 |
| [开发路线图](docs/roadmap.md) | 按里程碑安排工作，定义每阶段交付门槛 |
| [开发规范](docs/development.md) | 约定目录、编码、测试、配置、评审和提交方式 |
| [安全与隐私](docs/security.md) | 定义工具权限、授权范围、个人数据和密钥处理 |
| [云电脑接入设计](docs/cloud-computer.md) | 定义可插拔 Provider、操控接口、能力声明和切换规则 |
| [基础设施清单](docs/infrastructure.md) | 列出服务器、桌面环境、网络、存储和费用项目 |
| [PC 界面规划](docs/frontend.md) | 参考 Grok Bot 的功能组织，规划对话和内嵌桌面 |
| [早期架构记录](docs/adr/0001-local-first-modular-monolith.md) | 保留已替代的本地优先方案与历史背景 |
| [云电脑架构决策](docs/adr/0002-pluggable-cloud-computer.md) | 记录云端执行与可插拔电脑对早期方案的调整 |
| [Rakazo 底座决策](docs/adr/0003-rakazo-fork-as-execution-base.md) | 记录采用独立 Fork、复用范围和试点验收条件 |
| [同机原生部署与任务编排](docs/adr/0004-native-server-and-task-orchestration.md) | 记录后续原生 Linux、Pi 与上层任务管理方向 |
| [Rakazo 试点记录](docs/rakazo-evaluation.md) | 查看独立代码副本、开发环境、验证结果及下一步 |
| [架构决策模板](docs/adr/template.md) | 为后续选型保留统一记录格式 |
| [协作约定](AGENTS.md) | 给仓库协作者和编码助手的执行规则 |

## 第一版方向

从单用户、手动触发、单任务执行开始，完成“提出任务 → 在云电脑中执行 → 返回结果 → 查看记录”的闭环，再增加用户主动保存的长期记忆。

用户已确定 TypeScript、PC 优先、Linux 和可插拔接入方向，并同意基于 Rakazo 二次开发。当前同机方案中 Agent 仅以桌面账号操控授权资源，默认无整机 root、后台账号或云账号管理权限。

PC 入口暂按浏览器工作台规划，原生安装包形式待确定。前端参考 Grok Bot 的功能组织，首版不同时实现其多 Bot、语音、定时任务等全部能力。

暂不将多用户、后台定时执行、复杂多智能体协作和动态插件市场列入第一版。沿用 Rakazo 的 React / Vite、Hono、PostgreSQL / Prisma、Graphile Worker 和 Pi，按 [ADR-0004](docs/adr/0004-native-server-and-task-orchestration.md) 规划原生 Linux 电脑适配及任务编排；首个业务任务、生产模型和部署细节尚待确定。

## 开发入口

1. 在本仓库根目录执行 `pnpm install --frozen-lockfile` 恢复依赖。
2. 按 [工程任务书](docx/design/FIRST_TASK.md) 和 [任务映射](docx/design/TASK_RUN_MAPPING.md) 继续开发。
3. 运行受影响包的定向类型检查和离线测试；服务器、模型和桌面验收按 [运维手册](docx/OPERATIONS.md) 执行。

Rakazo 底座的采用和验证状态见 [ADR-0003](docs/adr/0003-rakazo-fork-as-execution-base.md)；未完成实际验证前不提供生产可用声明。

文档和界面默认使用简体中文；代码标识符默认使用英文。
