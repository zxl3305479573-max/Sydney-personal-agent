# Sydney 手机 App 个人中枢首页与全界面浅柔暖瓷风格实施方案

更新日期：2026-11-24。状态：**U1（手机 App 专属个人中枢首页 + 底部三项导航栏 + 全 App 70+ 路由与组件统一为清透奶白／暖瓷卡片风格，PC 端零改动，原字体 100% 保留）源码已落盘**（基于最新集成分支 `cursor/integrate-remote-branches-7334` `148a4f5af`，待具备完整 `node_modules` 的测试环境回归及 iPhone 真机视觉验收）；**U2–U3** 为后续建议方案，**U4** 为待决定事项。阶段总状态以 [总计划](../PLAN.md) 为准。

关联需求：
- **PA-019**：多模式与声明式换肤宿主（首页「文件与换肤」卡片直达 iOS `/(settings)/ui-mode` 及主题卡片暖瓷化统一）
- **PA-020**：聊天外观与统一材质收敛（保持原有衬线与斜体字体 100% 不变，升级清透奶白 `#F3F1EC` 与柔和深灰 `#15171C` 共享令牌）
- **PA-021**：iPhone 原生客户端（个人中枢首页 `/`、独立会话页 `/chats`、底部三项文字导航栏「首页 · 聊天 · 项目」及全 App 子页面统一视觉）
- **PA-022**：项目与多位置工作区（首页「项目与执行台」分栏卡、`/projects`、`/projects/[workspaceId]`、目录绑定与项目会话卡片统一）
- **PA-023**：手机云电脑画面与操作栏（首页云电脑直达与 `/computer` 预览框、状态胶囊、虚拟键盘栏暖瓷风格统一）
- **PA-024**：GitHub 个人主页与仓库浏览（首页「GitHub」周贡献柱状图卡片与 `/github` 暖瓷分段栏、热力图、仓库列表及详情统一）

---

## 1. 核心设计原则与明确边界

遵照用户确认的最终范围（**「PC 端不需要修改，只需要在手机 App 端；保留最下方导航栏；组件颜色调浅一点；其他所有界面统一为同一风格；字体保持原样不修改」**）：

1. **PC 端零改动，仅面向手机原生端（`apps/mobile`）实施**
   - `apps/web`、`apps/desktop` 与 `packages/ui-web` 100% 保持集成分支 `148a4f5af` 原状，不设桌面中枢页或额外改动。
2. **100% 保留原有字体体系（零字体改动）**
   - 完整保留 `text-scale.ts`、`NativeActionButton`、`typeScale` 与系统原有衬线/字号体系，全仓 73 个改动与新增 `.ts/.tsx` 文件**零 `fontFamily` / `font-family` / `--font-*` 覆写**。
3. **清透奶白 × 暖瓷卡片（Lightened Warm Porcelain）全界面统一体系**
   - **浅柔画布与卡片层差**：浅色采用清透奶白画布 `#F3F1EC` 搭配暖奶瓷白卡片 `#FFFEFC`、轻柔内嵌胶囊 `#F8F6F2`、`6%` 极细边框与轻羽阴影（`0.028 ~ 0.032`），以暖灰棕 `#6E675E` 替代厚重纯黑线条；深色采用 `#15171C` 底色搭配 `#20242C / #242933` 抬升石板灰卡片与 `#2A303B` 胶囊。
   - **个人中枢首页（`/`）+ 底部导航栏（`首页 · 聊天 · 项目`）**：首页以雾感暮蓝置顶横幅（`#364556`）与全宽/双列 Bento 小组件集中调度聊天与伙伴、项目与云电脑、GitHub、连接应用、例行与技能、产物与换肤；底部保留温润低噪的三项文字导航栏。
   - **全 App 二级界面 100% 视觉与微光渐变对齐**：新增零依赖纯函数渐变令牌模块 `apps/mobile/lib/card-gradient.ts`，基于 React Native `0.86.3` 原生支持的 `experimental_backgroundImage`（双径向角落光晕 `radial-gradient` + 对角底色 `linear-gradient`）为 `GlassSurface`（`roundedRectangle`）、`SettingsGroup`、首页全部 Bento 卡片以及聊天列表、搜索、项目、GitHub、连接应用、云电脑、产物、例行任务与设置页卡片注入分模块柔和渐变光晕（`champagne` 暖香槟、`slate` 雾蓝、`sage` 鼠尾草绿、`rose` 暖陶粉、`lavender` 暮紫、`pearl` 珠光琥珀），明暗双模式均保持通透温润。

---

## 2. 手机 App 全界面统一改造清单

| 模块分组 | 覆盖路由与核心组件 | 统一后的清透暖瓷特征 |
| --- | --- | --- |
| **个人中枢首页与底栏** | `components/home-hub.tsx`、`app/index.tsx`、`app/_layout.tsx`、`components/main-bottom-navigation.tsx` | 顶部日期与 `sync` 胶囊、分时段问候、`#364556` 雾感暮蓝置顶动态卡、暖灰棕 `2.5pt` 运行圆环、浅石/陶粉迷你图表、`#FAF8F4` 三项文字底栏 |
| **聊天列表、搜索与弹窗** | `app/chats.tsx`、`components/home-styles.ts`、`inbox-header.tsx`、`inbox-rows.tsx`、`pick-chat-pane.tsx`、`app/search.tsx`、`new-group.tsx`、`new-space.tsx`、`create-bot-modal.tsx`、`bot-actions-modal.tsx`、`bot-organize-modal.tsx` | `20pt` 暖瓷搜索胶囊、暖瓷顶栏操作圆钮、`18pt` 对齐会话行、搜索结果分类浅色徽章、统一底部抽屉抓手与暖瓷表单卡 |
| **对话流与内嵌交互卡** | `chat-route-header.tsx`、`thread-header-styles.ts`、`thread-composer.tsx`、`thread/message-bubble.tsx`、`thread/ask-block.tsx`、`thread/special-message-card.tsx`、`ComputerCard.tsx`、`ChoiceCard.tsx`、`McpApprovalCard.tsx`、`VoiceChatCard.tsx` | 保留对话标题 `chatTitle` 玻璃特例；输入坞、电脑预览卡、多选问答卡、MCP 审批卡、语音通话卡与子代理卡片统一为 `18–22pt` 暖瓷表面与 `#F8F6F2` 状态胶囊 |
| **项目、GitHub、应用与电脑** | `app/projects.tsx`、`projects/[workspaceId].tsx`、`projects/[workspaceId]/chat.tsx`、`project-folder-card.tsx`、`project-directory.tsx`、`project-cloud-directory.tsx`、`project-group-modal.tsx`、`project-workspace-list.tsx`、`app/github.tsx`、`github-bot-analysis.tsx`、`app/integrations.tsx`、`AppConnectCard.tsx`、`app/computer.tsx`、`computer-mode-picker.tsx`、`computer-keyboard-bar.tsx` | `22pt` 暖瓷项目文件夹卡（配暖灰棕文件夹徽章）；GitHub 暖瓷三栏分段条与鼠尾草绿热力图；连接应用暖瓷卡片网格（保留文字连接按钮）；云电脑预览框与暖瓷快捷键胶囊 |
| **产物、例行与全部设置页** | `app/artifacts.tsx`、`artifact.tsx`、`app/routines.tsx`、`routine.tsx`、`routine-list.tsx`、`routine-run-history.tsx`、`bot-profile.tsx`、`bot-settings.tsx`、`group-settings.tsx`、`server.tsx`、`sign-in.tsx`、`settings-group.tsx`、`list-search-input.tsx`、`segmented-pills.tsx`、`sheet-header.tsx`、`native-sheet.tsx` 及 `app/(settings)/*` 13 个设置子页 | 产物与例行任务升级为 `18–20pt` 暖瓷卡片与柔和筛选胶囊；`SettingsGroup`、`ListSearchInput`、`SegmentedPills` 与全部设置详情页（账号、界面模式、聊天外观、技能、插件、模型、设备、空间、保险箱、审批、归档）全面统一为暖瓷分组卡片 |

---

## 3. 语义色彩令牌速查（`@rakazo/ui-tokens`）

| 语义槽位 | 手机浅色 (`lightTokens`) | 手机深色 (`darkTokens`) | 首页/子页暖瓷扩展色（浅 / 深） |
| --- | --- | --- | --- |
| `background`（画布底色） | `#F3F1EC` | `#15171C` | `#F3F1EC` / `#15171C` |
| `card`（抬升瓷感卡片） | `#FFFFFF` | `#20242C` | `#FFFEFC` / `#242933` |
| `muted`（次级表面） | `#EDEAE3` | `#20242C` | 内嵌胶囊 `#F8F6F2` / `#2A303B` |
| `foreground`（主墨色文本） | `#26231F` | `#F5F4F0` | 柔和强调色 `#6E675E` / `#B8B3AA` |
| `border`（细描边） | `#26231F10` | `#F5F4F014` | `rgba(38,35,31,0.055)` / `rgba(245,244,240,0.09)` |
| `ring` / `link`（聚焦与链接） | `#175CD3` / `#1557C0` | `#5C9DFF` / `#63A3FF` | 置顶雾蓝卡 `#364556` / `#2B3646` |
