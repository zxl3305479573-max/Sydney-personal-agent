# 手机 App 后台陪伴完善与首页地图／高德导航专项评测

更新日期：2026-11-25。关联需求：PA-021。依据 Stop That Shit 原则（先查现有代码直接求解、零新增第三方依赖、精准关闭真实缺口、不以离线测试替代真机验收）编写。阶段总状态以 [总计划](PLAN.md) 为准。

## 一、实施范围与边界

1. **只改 `apps/mobile` 与 `docx/`**：不修改 PC 端、服务端 API、Worker 或数据库迁移，不引入新 npm 依赖，保持当前 `sideload`／`sydney-ios-ip-1`（原生底座 `1.0.12`）纯 OTA 兼容。
2. **保留既有原生隔离契约**：`companion-activity.ts` 保持 fail-closed 行为不变；`app.config.ts` 中 `SYDNEY_COMPANION_EXPERIMENT` 隔离规则不变；`bot-profile.tsx` 在未打包原生扩展时不破坏既有行顺序与断言。
3. **诚实区分 OTA 立即可用与原生底座依赖项**：
   - **当前侧载 OTA 立即可用**：应用内双模式后台陪伴、实时 SSE 状态与断连重连、跨页悬浮陪伴胶囊、本地通知提醒与可选本机语音播报、`/companion` 陪伴控制页、首页地图卡片、`/map` 交互式瓦片地图（高德／OSM）、IP 大致定位与手动点选校准、目的地搜索与路线预估、`iosamap://`／`amapuri://` 拉起已安装高德地图 App 及 `uri.amap.com` 网页回退。
   - **需新原生 IPA 或真机验证**：iOS 系统 GPS 权限弹窗（已在 `app.json` 预配 `NSLocationWhenInUseUsageDescription` 与 `LSApplicationQueriesSchemes`）、iOS 灵动岛 Widget 扩展与 ScreenCaptureKit 编译签名、真机切后台存活与实机高德跳转。

---

## 二、Stop That Shit 专项评测矩阵

### 模块 A：后台陪伴完善（PA-021）

| 编号 | 评测场景 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| **CMP-01** | 双模式会话启停、切换与偏好持久化 | 原生 `SydneyCompanion` 不可用时开启 `in-app` 陪伴模式，可用时委托 `live-activity` 模式；支持陪伴运行中直接切换目标伙伴；`preferredBotId`／`showReply`／`showFloatingBar`／`notifyOnReply`／`speakReplies` 持久化到 `SecureStore`，坏数据安全回退默认值；退出登录、切账号、切空间或服务端变更立即终止会话并清理运行态与播报 | 已通过（`companion-session.test.ts` 5/5 + `companion-activity.test.ts` 10/10） |
| **CMP-02** | 跨页实时监听、断连重连与防重复提醒 | `watchCompanionThread` 兼容原生与 `in-app` 双模式；网络或 SSE 失败进入退避重连时发布 `disconnected` 状态并在恢复后回到实时态；首次快照基线不触发历史消息提醒，仅新到达的 Bot 回复或新进入 `waiting_input`/`waiting_takeover` 在用户未打开该对话页时触发本地通知（遵循全局 `notification-preferences` 开关，点击 payload 兼容 `open-notification.ts`）；开启可选本机语音播报时，通话开始、停止陪伴或作用域切换立即打断播报 | 已通过（`companion-thread-watch.test.tsx` 11/11 + `companion-presentation.test.ts` 3/3 + `companion-snapshot.test.ts` 4/4） |
| **CMP-03** | 首页卡片、跨页悬浮条与控制页交互 | `HomeCompanionCard` 在常规侧载包可直接启停、展示实时状态与受 `showReply` 控制的短回复、支持运行中切换伙伴、仅在 `available && isActive && screenState !== "unsupported"` 时展示屏幕陪伴按钮并带完整会话/空间守卫；`CompanionFloatingBar` 在非当前陪伴单聊且非认证/控制页显示并可直达或停止；`/companion` 完整管理伙伴、偏好及原生屏幕陪伴（不支持时如实展示能力边界）；既有 `bot-profile.test.tsx` 与 `companion-*.test.*` 全部零回归 | 已通过（`home-companion-card.test.tsx` 2/2 + `companion-floating-bar.test.tsx` 2/2 + `companion-console.test.tsx` 1/1 + `bot-profile.test.tsx` 74/74 + `companion-screen-auto/send/voice-guard` 22/22） |

### 模块 B：首页地图组件与高德地图导航（PA-021）

| 编号 | 评测场景 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| **MAP-01** | WGS-84／GCJ-02 坐标转换与分级定位 | `wgs84ToGcj02` 与 `gcj02ToWgs84` 在中国大陆典型坐标往返误差 < 5m、境外坐标保持原值；`resolveApproxIpLocation` 在 `geojs.io` 失败时回退 `ipwho.is` 且支持超时取消；GPS 不可用时平滑回退 IP 大致定位并显式标注定位来源（`gps`/`ip`/`manual`）；手动校准位置持久化到 `SecureStore` 并可读取 | 已通过（`map-location.test.ts` 4/4） |
| **MAP-02** | 目的地搜索、路线预估与高德跳转协议 | `buildAmapNavigationUrls` 将 WGS-84 起终点转为 GCJ-02 并按驾车/公交/步行/骑行生成符合 iOS `iosamap://path`、Android `amapuri://route/plan/` 及 `https://uri.amap.com/navigation` 规范的 URL（支持仅地名直跳）；`openInAmapNavigation` 在原生端优先拉起高德 App，失败自动回退高德网页版并返回明确结果；无高德 Key 时使用 Nominatim 搜索与 OSRM 路线预估（不可达时优雅降级直线估算） | 已通过（`amap-navigation.test.ts` 3/3 + `map-search.test.ts` 4/4） |
| **MAP-03** | 首页地图卡片、地图画布与全仓界面守卫 | `HomeHub` 渲染 `HomeMapCard`（不内嵌 `WebView`），点击跳转 `/map`；`/map` 串联当前位置展示、校准模式、搜索选点、地图点选、四种出行方式切换、路线距离/耗时摘要与高德地图跳转；`MapCanvas` 零外部 CDN、仅放行本地地图文档并校验 `postMessage` 载荷；新增页面与组件全部通过 `scroll-hygiene.test.ts` 与 `screen-theme-coverage.test.ts` | 已通过（`map-screen.test.tsx` 2/2 + `home-hub.test.tsx` 6/6 + `scroll-hygiene.test.ts` 1/1 + `screen-theme-coverage.test.ts` 6/6 + `app-config.test.ts` 34/34 + `theme-pack.test.ts` 5/5；`@rakazo/mobile` `tsc --noEmit` 0 错误、30 文件 Biome 0 错误） |

### 模块 C：真机与原生底座边界项（本机不伪造通过）

| 编号 | 评测场景 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| **DEV-01** | iPhone 真机陪伴与高德跳转实测 | 侧载 OTA 生效后，真机验证悬浮胶囊触控、本地通知点击直达、语音播报、高德底图瓦片加载与手势缩放、`iosamap://` 拉起已安装高德地图 App 及未安装时回退网页；系统 GPS 定位弹窗待包含新 `Info.plist` 的 IPA 实测，灵动岛与 ScreenCaptureKit 待实验构建真机实测 | 待 iPhone 真机／新 IPA 验收 |

### 模块 D：零重签截屏一键分享＋同步输入＋语音回复与灵动岛快捷操作预置（PA-021）

依据 Stop That Shit 原则（零新增依赖，直接复用底座已内置的 `expo-clipboard`、`expo-image-picker`、`artifacts/create` → `threads/send` 附件链路与 `speakWithDeviceVoice`；诚实声明 iOS WidgetKit 不支持灵动岛内弹键盘、以及灵动岛扩展改动需通过新版 IPA 编译签名生效）编写。

| 编号 | 评测场景 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| **CMP-04** | 截屏解析、深链参数与附件同发语音回复链路 | `parseClipboardImageDataUri` 校验 `data:image/(jpeg|png|webp);base64,...` 格式与字节上限（`ATTACHMENT_MAX_BYTES`）；`buildCompanionCaptureUrl` 生成标准 `rakazo://companion-capture` 深链；`sendCompanionCapture` 支持截屏＋用户同步输入文字（或仅截屏默认提示词、或仅文字快捷发送），先调 `artifacts/create` 上传附件再调 `threads/send` 携带 `artifactIds` 与幂等 `clientNonce`，并做会话代次防越权；`waitForCompanionCaptureReply` 仅消费新回复并支持 `AbortSignal` 取消 | 已通过（`companion-capture.test.ts` 5/5） |
| **CMP-05** | `/companion-capture` 交互与跨入口／快捷指令引导 | `/companion-capture` 支持自动读取剪贴板截屏（`source=clipboard`）、原生粘贴／重读剪贴板／相册选图回退、截屏预览与同步文字输入（含快捷提问胶囊）、临时切换目标 Bot、回复后自动语音朗读开关及实时展示与朗读 Bot 回复；`HomeCompanionCard`、`CompanionFloatingBar` 与 `/companion` 均接入一键入口，`/companion` 提供背面轻点／操作按钮 3 步 Apple 快捷指令配置与一键复制深链 | 已通过（`companion-capture-screen.test.tsx` 2/2 + `home-companion-card.test.tsx` 2/2 + `companion-floating-bar.test.tsx` 2/2 + `companion-console.test.tsx` 1/1） |
| **CMP-06** | 灵动岛展开快捷按钮预置与全仓守卫零回归 | `CompanionWidget.swift` 长按展开视图升级为「发消息」「截屏提问」「语音对话」三个带 `companionToken` 校验的快捷入口（保留点击卡片主体进完整对话及 `isCall` 返回通话分支）；`app/companion-capture.tsx` 接入 `useScreenBackground` 与隐藏滚动条，通过 `scroll-hygiene.test.ts`、`screen-theme-coverage.test.ts` 与全部既有陪伴测试 | 已通过离线校验（`companion-capture-screen.test.tsx` 2/2 + `companion-plugin.test.ts` 2/2 + `scroll-hygiene.test.ts` 1/1 + `screen-theme-coverage.test.ts` 6/6 + 其余 11 个关联套件共 15 文件 161/161 项全绿；`@rakazo/mobile` `tsc --noEmit` 0 错误、12 文件 Biome 0 错误；Swift 编译待 macOS Xcode） |
| **DEV-02** | iPhone 背面轻点／快捷指令截屏与新版 IPA 灵动岛实测 | 侧载 OTA 后实测背面轻点／操作按钮触发 Apple 快捷指令截屏 → 跳 `/companion-capture` → 同步输入文字发送并语音回复；灵动岛长按展开「发消息／截屏提问／语音对话」三按钮待 macOS Xcode 构建含本次 `CompanionWidget.swift` 的新版侧载 IPA 重装后真机实测 | 待 iPhone 真机／新版 IPA 验收 |
