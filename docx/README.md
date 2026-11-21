# Sydney 开发文档入口

更新日期：2026-11-21。

项目头像与聊天反馈补修 `1.0.20` 已上线。源码 `e7d729212` 已提交推送，生产后台已补名单与群成员图片回传，普通聊天标题／输入栏及项目模型菜单随手机更新交付。两个既有项目的 4 个已存图片头像只读核对一致；304 项回归、相关类型及服务器隔离 API 验证通过。OTA Run `44884608273`、线上版本和全部 55 项资源已校验；iPhone 下载重启后的视觉与键盘交互待验。[计划](PLAN.md#项目头像与聊天反馈补修pa-021pa-0222026-11-21) · [验证](VALIDATION.md#项目头像与聊天反馈补修2026-11-21) · [更新操作](OPERATIONS.md#项目头像后台补丁与-iphone-10202026-11-21)

手机工作区全部当前改动已整合为 iPhone `1.0.19`，源码 `8d40d7021` 已推送，既有 `sideload` OTA 发布成功。项目聊天复用普通聊天组件并统一头像，补齐项目前台同步与鼠标箭头。512 项回归、三项类型检查、线上版本和全部资源摘要通过，iPhone 实际生效待验。[计划](PLAN.md#iphone-1019-手机工作区发布pa-021pa-022pa-0232026-11-21) · [验证](VALIDATION.md#iphone-1019-手机工作区发布2026-11-21) · [更新操作](OPERATIONS.md#iphone-1019-ota2026-11-21)

当前 Goal 按 [个人生产首版计划](PLAN.md#个人生产首版交付2026-11-20) 与 [测评](ACCEPTANCE.md#个人生产首版测评) 推进。生产旧 Web 与专用画面桥容器已删除，旧应用入口仍为 404。新版生产构建、更新流程和 Windows 直连安装包已完成源码收口，生产持久配置和客户端候选待交付。见 [退役收尾验证](VALIDATION.md#个人生产首版退役收尾2026-11-20)、[运维](OPERATIONS.md#删除退役-web2026-11-20) 和 [ADR-0025](../docs/adr/0025-retired-web-removal.md)。

Windows 与云电脑项目目录、双端一次性文件审批及 Markdown 下载已完成候选接线。Windows 完整路径留在主进程，Linux 驱动待真实环境验证，项目迁移和双端候选待发布。见 [首版测评](ACCEPTANCE.md#个人生产首版测评)、[Windows 验证](VALIDATION.md#windows-项目审批与-worker-分派2026-11-20) 及 [云端运维](OPERATIONS.md#云电脑项目目录候选2026-11-20)。

手机固定底栏、GitHub 与会话模型交付目标及逐项验收见 [手机专项测评](MOBILE_NAV_GITHUB_EVALUATION.md)，阶段状态统一见 [总计划](PLAN.md)。本轮先记录目标和测评，再实施、验证和推进真实更新；尚未完成项不以源码替代上线验收。

云电脑全覆盖样式已按用户授权部署到原生 noVNC，Windows 原登录客户端三种窗口尺寸四边贴合、真实帧及只读实测通过；重新打开电脑画面加载。部署前的镜像嵌入页改动未包含在本次原生静态部署中，iPhone 真机仍未验。见 [全覆盖验证](VALIDATION.md#pa-023-云电脑画面全覆盖修复2026-11-20) 和 [部署与回退](OPERATIONS.md#云电脑全覆盖样式部署2026-11-20)。

用户已追加 GitHub 上线和项目工作区可用闭环目标，包含手机 GitHub 入口、双端项目文字聊天及后续授权目录连接。实施顺序与真实验收条件统一维护在 [追加目标](PLAN.md#追加目标github-上线与项目工作区可用闭环pa-022pa-024)，不能把既有离线代码视为生产已完成。

手机 GitHub 与双端项目文字会话的客户端接线已补齐，生产数据库开放、Worker、云电脑目录绑定、本机目录真实验收和双端发布仍需后续实现／实测。见 [续作验证](VALIDATION.md#github-与项目会话续作2026-11-20)、[项目测评](ACCEPTANCE.md#项目基础文字会话pa-022) 和 [定向迁移与发布边界](OPERATIONS.md#github-与项目工作区发布边界2026-11-20)。

项目文字任务已补齐 Worker 工具和上下文边界。扩展执行器原 8 项定时唤醒失败已修正测试环境，复测通过，真实 PostgreSQL 与生产 Worker 仍待验。见 [本轮复测](VALIDATION.md#个人生产首版退役收尾2026-11-20) 与 [候选运行限制](OPERATIONS.md#项目文字执行候选的权限范围)。

本轮已按用户授权在现有生产切换客户端直连，旧 Web 已停止。`Sydney-partner` Windows 安装、既有主机桌面问题及双端待验项见 [验证记录](VALIDATION.md#2026-11-19-生产直连切换结果)，运行和回退入口见 [运维手册](OPERATIONS.md#2026-11-19-生产配置与回退入口)。

2026-11-20 已恢复专属显示及只读画面服务，并按追加授权完成团队连接校准与 Worker 健康恢复；Windows 专属／团队电脑真实画面与自动重连均通过。待回答任务保留，双端共用画面接口已恢复；手机端错误提示和重试仍为离线修复，尚未发布、真机未验。见 [本轮画面结果](VALIDATION.md#pa-023-云电脑画面恢复2026-11-20) 和 [部署／停止／回退](OPERATIONS.md#pa-023-云电脑画面恢复2026-11-20)。

iPhone 应用名为 `Sydney`。多模式换肤已补齐离线设置入口与午夜内置模式，具体状态见 [追加目标](PLAN.md#追加目标完成-ios-多模式换肤的用户可用链路)；尚未发布到手机，真实设备验收见 [测评清单](ACCEPTANCE.md#iphone-多模式换肤pa-018pa-020pa-021)。

本目录保存开发计划、过程记录、验证结论和运维说明。目录名按用户要求使用 `docx`，正文目前使用 Markdown，便于检索、比较修改和随代码维护；当前没有生成 `.docx` Word 文件。

## 文档导航

| 文档 | 负责内容 | 更新时机 |
| --- | --- | --- |
| [总计划](PLAN.md) | 阶段、依赖、需求、交付物、验收条件和当前状态 | 开始、完成、中断或调整阶段时 |
| [IP 直连与客户端迁移长期任务](PLAN.md#ip-直连与客户端迁移长期任务2026-11-11) | 从备份恢复、证书签发到双端切换和网页入口收口的模块及验收 | 执行批次和阶段状态变化时 |
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
| [PC 桌面端长期交付计划](design/PC_DESKTOP_DELIVERY_PLAN.md) | Web 布局复用、模块分工、审核循环及 Windows 构建验收 | PC 桌面端阶段、分工或验收变化时 |
| [手机与桌面客户端迁移方案](design/CLIENT_ONLY_MIGRATION.md) | 桌面内置界面、双端依赖和浏览器入口收口的实施与验收 | 客户端迁移阶段、依赖或验收变化时 |
| [iPhone 客户端实施与测评](design/IOS_CLIENT_PLAN.md) | 原生移动端现状、云构建准备与分阶段验收 | 移动端实施、构建或验收状态变化时 |
| [iOS 多模式 UI 架构](design/IOS_UI_MODE_ARCHITECTURE.md) | 移动端模式注册、主题状态、页面宿主和后续视觉阶段边界 | 换肤架构接线、视觉皮肤或真机验收变化时 |
| [iPhone 操控方案](design/IPHONE_CONTROL_PLAN.md) | Windows 真机自动化候选、权限边界和设备验收 | 设备控制方案或验证状态变化时 |
| [iPhone 陪伴调研](design/IOS_COMPANION_RESEARCH.md) | 开源参考、屏幕识别与灵动岛方案及验证缺口 | 陪伴方案或验证状态变化时 |
| [手机端五项任务实施方案](design/MOBILE_FIVE_WORKSTREAMS.md) | 现有功能、云电脑、项目入口、桌面联动及更新的分工与验收 | 五项任务范围、依赖或验收变化时 |
| [iPhone 免费侧载操作指南](design/IOS_SIDELOAD_GUIDE.md) | Windows 与 iPhone 的候选签名安装流程及验证限制 | 签名、安装或续签流程变化时 |
| [项目与工作区接入方案](design/PROJECT_WORKSPACE_PLAN.md) | 项目入口、云电脑与本地工作区、授权和分阶段验收 | 项目功能规划、实现或验收变化时 |
| [GitHub 模块实施方案](design/GITHUB_MODULE_PLAN.md) | 个人主页、提交热力图、远端项目、开源检索与 Agent 只读工具融合 | GitHub 模块范围、实现或验收变化时 |
| [GitHub 模块实施与交接指引](HANDOVER_GITHUB.md) | 数据库迁移、真实 PAT 联调验收、代码索引与回归测试 | 后续 Agent 接续实施或环境验收时 |
| [GitHub 模块架构决策](../docs/adr/0023-github-module-integration.md) | 直连 REST/GraphQL 适配层、PAT 加密绑定与读写边界 | GitHub 接入方式或权限边界变化时 |
| [工作区归属与元数据隔离决策](../docs/adr/0022-project-workspace-ownership.md) | 成员归属、数据库隔离及开放前阻断 | 工作区权限、数据模型或删除流程变化时 |
| [PC 后台部署决策](../docs/adr/0015-pc-backend-on-cloud-computer.md) | 云电脑 PC 后台与主后台控制服务的边界和权限 | PC 后台部署、认证或资源边界变化时 |
| [注册开放实施清单](design/REGISTRATION_ROLLOUT.md) | 注册开关、邮件配置和真实验收顺序 | 注册配置或认证验收变化时 |
| [P2 策略接口](design/TASK_POLICY_IMPLEMENTATION.md) | 实际纯策略、调用方责任和集成缺口 | 策略实现变化时 |
| [P2 状态投影与读取](design/TASK_PROJECTION.md) | 已实现的任务状态、历史读取、安全条件和验证局限 | 投影或读取契约变化时 |
| [任务执行接线](design/TASK_EXECUTION_INTEGRATION.md) | 持久化、用户 API、Pi 门禁与预算 | 执行链路变化时 |
| [聊天外观方案](design/CHAT_APPEARANCE.md) | 聊天背景、文字颜色和历史气泡方案 | 外观需求或实现变化时 |
| [换肤插件设计草案](design/THEME_PLUGIN.md) | 换肤包边界、应用规则、阶段与待决定事项 | 换肤插件需求或设计变化时 |
| [热插拔插件历史设计](design/HOT_PLUGIN_SYSTEM.md) | 已停止推进的插件方案与离线试点记录 | 仅保留历史参考 |
| [窗口分工与交接](WORKSTREAMS.md) | 独立对话的实际归属、文件写集和未派发任务 | 分工、交接或窗口能力变化时 |

技术细节继续放在已有的 [需求](../docs/requirements.md)、[架构](../docs/architecture.md)、[安全](../docs/security.md)、[电脑设计](../docs/cloud-computer.md) 和 [架构决策](../docs/adr/0004-native-server-and-task-orchestration.md) 中，通过链接关联，不复制多份相同规则。

## 当前项目状态

- 生产 Web 已退役并删除旧容器，后台保留 API、Worker 和客户端必需回调／画面；Windows 共用界面源码保留。历史隔离试运行见 [ADR-0013](../docs/adr/0013-isolated-cloud-web-proposal.md)，当前删除边界见 [ADR-0025](../docs/adr/0025-retired-web-removal.md) 和 [运维手册](OPERATIONS.md#删除退役-web2026-11-20)。
- Rakazo 底座、Sydney 二次开发代码和项目配置统一位于当前仓库根目录；本目录只保存计划、开发过程、验证和运维文档。
- Rakazo 基线已经导入；上一次底座静态检查与 Pi 离线测试有通过记录，不能代表 Sydney 功能已实现。
- P2/P3 已接入授权存储、用户任务 API、Pi 工具与主模型门禁；已有定向离线验证，真实数据库和模型尚未验收。继续推进 P4–P6，实际证据见总计划与验证记录。
- 后续目标为后台与独立 Agent 云电脑分机运行，默认不依赖 Docker；跨机连接仍待实现和验证。
- 保留 Pi 执行层，参考 DSH 的任务、派工和授权思路；未引入 DSH 运行时或复制其源码。纯策略取舍见 [ADR-0005](../docs/adr/0005-task-policy-before-executor-integration.md)。
- 本机不启动服务或进行重负载构建。云电脑已有桌面配置记录；候选后台机的实际资源、连接和项目部署状态尚待核实。
- 2026-11-11 用户明确要求恢复子代理审查，当前按最新要求执行；实际派发、写集与审核结果记录在[窗口分工](WORKSTREAMS.md)，不虚报独立对话或审查。

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
