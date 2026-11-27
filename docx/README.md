# Sydney 开发文档入口

最新 Bot 编辑截图已明确调用栈溢出，已用实际 Metro 与 Babel 回归复现原生头像模块自引用导出，并通过抽出唯一共享数据源修复；10 文件 226 项和移动端类型检查通过。准备提交推送与 OTA `1.0.41`，iPhone 真机验收待办。[根因与验证](VALIDATION.md#bot-编辑调用栈溢出根因修复2026-11-27) · [发布与回退](OPERATIONS.md#bot-编辑循环导出修复-10412026-11-27)

用户补充 Bot 编辑入口截图：点击编辑即进入全局渲染异常页，重试重挂导航回首页。本轮补充编辑路由局部恢复与经脱敏的具体错误文字，诊断 OTA `1.0.40` 已经 [Run 45933384802](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45933384802) 发布成功并核验启动包及 62 项资源，13 文件 294 项回归和移动端类型检查通过；原始崩溃尚未取得异常堆栈，不能视为已解决。[排查与验证](VALIDATION.md#bot-编辑入口全屏重试排查与诊断2026-11-27) · [运维说明](OPERATIONS.md#bot-编辑异常恢复与诊断-10402026-11-27)

手机 Bot 编辑页已对齐新建时的全部身份选项：名称、六种人格预设、完整个人人格库（属性／权重及新增／编辑／删除）、内置头像、相册上传与本机头像库。人格自由文本、工作指令隔离、合并编码长度限制及加载失败重试一并保留；245 项功能回归、40 项发布配置测试及移动端类型检查通过。提交 `947e2cd15` 已推送集成分支，`1.0.39` 侧载 OTA 经 [Run 45930644500](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45930644500) 发布成功，线上启动包与 62 项资源摘要全部匹配，可在 App「设置 → 检查更新」下载重启；原始编辑报错尚未复现，真机验收继续待办。[阶段计划](PLAN.md#手机-bot-编辑报错排查与人格设定编辑pa-021pa-0222026-11-27) · [验证记录](VALIDATION.md#手机-bot-编辑与人格设定2026-11-27)

手机端零重签「截屏一键分享＋同步输入＋自动语音回复」（`/companion-capture`、Apple 快捷指令／背面轻点 3 步引导、悬浮胶囊与首页／控制页快捷入口）及灵动岛展开三按钮（发消息／截屏提问／语音对话，`CompanionWidget.swift`）已完成源码实现与 15 文件 161 项离线验证，未提交或推送；真机快捷指令与新版 IPA 灵动岛实测待验。[专项评测](COMPANION_MAP_EVALUATION.md#模块-d零重签截屏一键分享同步输入语音回复与灵动岛快捷操作预置pa-021) · [阶段计划](PLAN.md#手机端零重签截屏一键分享同步输入语音回复与灵动岛快捷操作pa-0212026-11-25) · [本批验证](VALIDATION.md#手机端零重签截屏一键分享同步输入语音回复与灵动岛快捷操作2026-11-25)

手机 App 后台陪伴双模式（应用内跨页悬浮胶囊／断连重连／本地通知／可选播报／`/companion` 控制中心＋实验灵动岛兼容）与首页地图组件／`/map` 交互式定位导航（支持跳转高德地图 App 与网页回退）已完成源码实现与 21 文件 199 项离线验证，未提交或推送；真机与新 IPA 项待验。[专项评测](COMPANION_MAP_EVALUATION.md) · [阶段计划](PLAN.md#手机-app-后台陪伴完善与首页地图高德导航组件pa-0212026-11-25) · [本批验证](VALIDATION.md#手机-app-后台陪伴完善与首页地图高德导航组件2026-11-25)

2026-11-25 已提交推送当前 CI 清理，并通过 [PR #10](https://github.com/zxl3305479573-max/Sydney-personal-agent/pull/10) 将完整集成分支合入 `main`（`6c47e8836`）。[iPhone OTA Run 45600236960](https://github.com/zxl3305479573-max/Sydney-personal-agent/actions/runs/45600236960) 已成功从该提交重新发布 `1.0.24`，线上启动包与 55 项资源全部校验通过；整仓 CI 与 macOS 截图未通过，真机生效待验。[本批验证](VALIDATION.md#工作区提交主分支合并与-iphone-ota2026-11-25) · [手机更新与回退](OPERATIONS.md#main-合并后的-iphone-1024-ota2026-11-25)

手机 App 个人中枢首页（Personal Home Hub）、底部「首页 · 聊天 · 项目」文字导航栏及全 App 70+ 路由／组件的清透奶白 × 暖瓷卡片统一视觉升级已于 2026-11-24 在 `ui` 分支落盘源码并合入主分支（PC 端保持零改动；**100% 保留原有字体不变**）。[设计方案](design/DUAL_SURFACE_UI_DESIGN_PLAN.md) · [阶段计划](PLAN.md#手机-app-个人中枢首页与全界面浅柔暖瓷风格统一pa-019pa-020pa-021pa-022pa-023pa-0242026-11-24) · [本批验证](VALIDATION.md#手机-app-个人中枢首页与全界面风格统一离线校验2026-11-24)

Bot 状态恢复、未读绿标和普通／项目 Bot 持久记忆共享的验收见 [Bot 状态与记忆评测](BOT_STATE_MEMORY_EVALUATION.md)。

Windows `0.4.3` 与 iPhone `1.0.23` 已于 2026-11-22 提交、推送并发布。源码提交 `7d2829aa3` 已推送到集成分支；Windows 发行页、安装包三项资产、iPhone 启动包及 55 项资源均已核验。Bot、项目和 GitHub 状态缓存、应用对接按钮及手机界面材质改动已进入客户端版本；双端真机视觉、手势、覆盖安装与保留数据回退仍待验。[Windows 发行页](https://github.com/zxl3305479573-max/Sydney-personal-agent/releases/tag/sydney-desktop-v0.4.3) · [本批验证](VALIDATION.md#app-0431023-全量提交与发布2026-11-22) · [更新与回退](OPERATIONS.md#sydney-windows-043iphone-1023-发布通道2026-11-22)

手机界面仅保留对话顶部 Bot 名称组件的玻璃效果，设置、应用、项目、GitHub、聊天内容和通用按钮采用融合的平面样式；应用对接登录操作改为文字按钮。项目与 GitHub 页面及 Bot 运行状态在登录会话内先显示缓存，再由后台更新。[范围](PLAN.md#手机界面玻璃效果统一收敛pa-020pa-0212026-11-21) · [状态验证](VALIDATION.md#手机界面玻璃效果统一收敛2026-11-22)

手机 Bot 运行状态保留修复的范围与验收见 [计划](PLAN.md#iphone-对话运行状态缓存补修pa-018pa-0212026-11-21)、[定向验证](VALIDATION.md#iphone-对话运行状态缓存补修2026-11-21) 和 [本地缓存说明](OPERATIONS.md#手机对话运行状态缓存2026-11-21)。

Windows `0.4.2`／iPhone `1.0.22` 已发布。源码 `24687d3c6` 已提交推送，Windows 发行页三项资产与公开摘要、iOS 启动包及 55 项资源已核验；1,103 项定向回归、五项类型检查和增量 lint 通过。本地主题包随 iPhone OTA 分发，双端真机及保留数据回退待验；后台与驱动未部署。[Windows 发行页](https://github.com/zxl3305479573-max/Sydney-personal-agent/releases/tag/sydney-desktop-v0.4.2) · [本批验证](VALIDATION.md#sydney-app-0421022-整合与发布2026-11-21) · [更新与回退](OPERATIONS.md#sydney-windows-042iphone-1022-发布通道2026-11-21)

欢迎卡片被自由输入跳过后残留“等待输入”的时序修复 `d7db91355` 已提交推送并上线 API／Worker。172 项定向回归、隔离数据库／HTTP 和生产回读通过，3 条遗留欢迎任务已收口、首页均 idle。手机无需新增 OTA，iPhone 实际显示待用户复核。[计划](PLAN.md#bot-欢迎卡片与自由输入等待收口pa-018pa-0212026-11-21) · [验证](VALIDATION.md#欢迎卡片自由输入等待收口2026-11-21)


更新日期：2026-11-25。

`1.0.21` 已发布，修复 iPhone 项目头像和名称同步，补齐项目 Bot／群聊资料、归档、恢复、清空与删除。后台健康，线上启动包及 55 项资源通过，iPhone 实际交互待验。[验证](VALIDATION.md#项目-bot-同步与聊天管理2026-11-21) · [更新与回退](OPERATIONS.md#项目聊天管理与-iphone-10212026-11-21)

项目头像与聊天反馈补修 `1.0.20` 已上线，源码 `e7d729212` 已提交推送。后台名单补回已选图片，两个既有项目的 4 个图片头像只读核对一致；手机采用普通聊天的头像标题、回复卡片、输入栏及项目模型菜单。304 项回归、相关类型及隔离 API 验证通过，OTA Run `44884608273`、线上版本与全部资源已校验，iPhone 下载重启后的视觉与键盘交互待验。[验证](VALIDATION.md#项目头像与聊天反馈补修2026-11-21) · [更新与回退](OPERATIONS.md#项目头像后台补丁与-iphone-10202026-11-21)

手机与 Windows 项目共享状态及固定执行位置的现状和验收矩阵见 [项目设备同步测评](design/PROJECT_DEVICE_SYNC_EVALUATION.md)。Windows 专属 WSL 命令候选已接通源码，但默认不可用，guest 未实测，项目同步 Goal 继续进行。[计划](PLAN.md#新目标手机与-windows-项目消息及执行位置协同pa-022prj-01prj-02) · [测评](ACCEPTANCE.md#个人生产首版测评)

项目聊天消息与输入栏已补齐普通聊天组件复用，两端沿用新版 Bot 头像组件，单聊通过项目名单分页补齐身份资料。手机工作区全部当前改动已整合为 `1.0.19` 提交推送并发布到 iOS `sideload`，512 项回归、相关类型检查、线上清单与全部资源校验通过；Windows 本批客户端发布及双端实机仍待完成。[手机发布](VALIDATION.md#iphone-1019-手机工作区发布2026-11-21) · [共用组件验证](VALIDATION.md#双端项目聊天共用组件2026-11-21) · [组件接线](design/PROJECT_WORKSPACE_PLAN.md#2026-11-21-项目聊天与普通聊天共用组件)

当前 Goal 按 [个人生产首版计划](PLAN.md#个人生产首版交付2026-11-20) 与 [测评](ACCEPTANCE.md#个人生产首版测评) 推进。生产旧 Web 与专用画面桥容器、持久配置均已清理，旧应用入口仍为 404。Windows `0.4.1` 已覆盖安装并验证冷启动画面，iPhone `1.0.18` OTA 分发已核验，待真机实测。生产后台重建及更新回退待验。[生产与客户端验证](VALIDATION.md#windows-基础功能与生产退役落盘2026-11-21) · [iPhone 线上候选](VALIDATION.md#iphone-1018-线上分发与后台能力2026-11-21) · [退役运维](OPERATIONS.md#删除退役-web2026-11-20) · [ADR-0025](../docs/adr/0025-retired-web-removal.md)

Windows 与云电脑项目目录、双端一次性文件审批及 Markdown 下载已完成候选接线。Windows 完整路径留在主进程。云端候选在实际 Linux 上通过 24 项隔离回归，生产驱动部署、私有通道与双端真实目录任务待验。[首版测评](ACCEPTANCE.md#个人生产首版测评) · [驱动验证](VALIDATION.md#项目-linux-驱动与设备预检2026-11-21) · [云端运维](OPERATIONS.md#云电脑项目目录候选2026-11-20)

项目绑定目录现支持单层名称列表，仍需逐次审批；Windows 本机目录回归与接口验证通过。离线任务续接／未知结果核对、目录内容搜索、云端 Linux 实际列表以及隔离项目命令尚未完成，生产电脑能力开关保持关闭。[项目目录验证](VALIDATION.md#项目目录枚举候选2026-11-21) · [当前总目标](PLAN.md#新目标手机与-windows-项目消息及执行位置协同pa-022prj-01prj-02)

手机固定底栏、GitHub 与会话模型交付目标及逐项验收见 [手机专项测评](MOBILE_NAV_GITHUB_EVALUATION.md)，阶段状态统一见 [总计划](PLAN.md)。本轮先记录目标和测评，再实施、验证和推进真实更新；尚未完成项不以源码替代上线验收。

云电脑全覆盖样式已按用户授权部署到原生 noVNC，Windows 原登录客户端三种窗口尺寸四边贴合、真实帧及只读实测通过；重新打开电脑画面加载。部署前的镜像嵌入页改动未包含在本次原生静态部署中，iPhone 真机仍未验。见 [全覆盖验证](VALIDATION.md#pa-023-云电脑画面全覆盖修复2026-11-20) 和 [部署与回退](OPERATIONS.md#云电脑全覆盖样式部署2026-11-20)。

用户已追加 GitHub 上线和项目工作区可用闭环目标，包含手机 GitHub 入口、双端项目文字聊天及后续授权目录连接。实施顺序与真实验收条件统一维护在 [追加目标](PLAN.md#追加目标github-上线与项目工作区可用闭环pa-022pa-024)，不能把既有离线代码视为生产已完成。

手机 GitHub 与双端项目文字会话的客户端接线已补齐。项目会话、目录绑定、运行角色隔离和独立 Worker 的实时回复共 54 项通过，使用 PostgreSQL `18.6` 临时合成库。生产项目迁移、功能开放及双端实际收发待执行，当前发布的备份和隔离恢复也待完成。[隔离实测](VALIDATION.md#项目-postgresql-与独立-worker-实测2026-11-21) · [项目测评](ACCEPTANCE.md#项目基础文字会话pa-022) · [发布顺序](OPERATIONS.md#个人生产首版发布顺序2026-11-20)

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
| [手机与 Windows 项目同步测评](design/PROJECT_DEVICE_SYNC_EVALUATION.md) | 双端项目／消息同步、固定执行位置、Windows 隔离命令负向验收 | 项目设备同步、执行位置或验收状态变化时 |
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
| [手机端个人中枢首页与双端视觉方案](design/DUAL_SURFACE_UI_DESIGN_PLAN.md) | 手机个人中枢首页、三项文字底栏、象牙暖白/曜石深空令牌与原字体保留规范 | 手机首页导航、共享令牌或双端视觉演进时 |
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
