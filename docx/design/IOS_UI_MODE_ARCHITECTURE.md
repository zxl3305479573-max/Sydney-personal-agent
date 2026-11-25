# iOS 多模式可切换 UI 架构设计

更新日期：2026-11-20。关联需求：PA-018、PA-020、PA-021。架构决策见 [ADR-0024](../../docs/adr/0024-ios-multi-mode-ui-architecture.md)，阶段状态统一维护于 [总计划](../PLAN.md)。

## 1. 当前阶段范围与边界

初始阶段按用户“先不做 UI 界面、先把整体架构实现”的要求交付 **iOS 多模式 UI 内核与宿主接线**。2026-11-20 用户追加继续实现切换／换肤后，在该底座上补入设置页面和一套内置模式：

- **包含**：模式类型契约、可扩展多模式注册表、平台兼容门禁（iOS 专属模式在非支持平台自动回退 `classic`）、`SecureStore` 状态存储与并发写保护、临时预览与一键来回切换 API、与既有 `appearance` / `native` / `chat-appearance` / `GlassSurface` 的非破坏性合成桥接、Hook 顺序不变的图元与页面插槽解析器、冷启动首屏预水合，以及非默认模式渲染异常自动回退 `classic` 的安全护栏。
- **追加交付**：iOS「设置 → 界面模式」全局预览／应用／取消／恢复入口，`midnight`（午夜）内置深色皮肤，离开页面取消未确认预览。
- **不包含（留待后续视觉阶段）**：更多风格视觉皮肤、首页顶栏快捷切换按钮、多选预览半屏画廊、用户主题包导入／卸载及各业务页面的异构视觉重排。

## 2. 模块分层与职责

| 模块路径 | 职责 | 关键不变式 |
| --- | --- | --- |
| `apps/mobile/ui-modes/types.ts` | 定义 `UiModeDefinition`、颜色/几何/排版/玻璃/系统色/聊天外观策略及插槽契约 | 纯类型与常量，零运行时副作用与循环依赖 |
| `apps/mobile/ui-modes/classic.ts` | 内置默认 `classic` 模式定义 | 保持现有视觉令牌、液态玻璃、系统 `PlatformColor` 与聊天背景行为完全不变 |
| `apps/mobile/lib/ui-mode-registry.ts` | 注册、注销、枚举、校验模式定义，合成完整深浅色 `ColorTokens` 并执行平台门禁 | `classic` 不可注销或覆盖；非法定义拒绝注册；未知或不支持平台的模式一律回退 `classic` |
| `apps/mobile/lib/ui-mode-store.ts`、`apps/mobile/lib/ui-mode.ts` | 状态机负责 `SecureStore` 持久化（`sydney.mobile.uiMode.v1`）、预览与切换；统一入口连接注册表并发布模式订阅 | 并发写入按代次串行化；存储损坏或读取失败安全回退 `classic` |
| `apps/mobile/lib/ui-mode-provider.tsx` | 订阅激活模式、解析当前主题并提供运行时 Context | 注册表或模式改变时更新主题；自定义屏幕错误会报告并回退 `classic` |
| `apps/mobile/ui-modes/midnight.ts` 与 `apps/mobile/app/(settings)/ui-mode.tsx` | 提供内置午夜模式与设置预览／确认入口 | 模式由 `ui-mode.ts` 在 store 水合前注册；iOS 专属，预览不写盘、离页取消，沿用原聊天偏好 |
| `apps/mobile/lib/ui-mode-slots.tsx` | 提供 `useUiMode`、`resolveUiModePrimitive`、`resolveUiModeScreen` 与 `UiModeCrashBoundary` | 控制器组件先无条件执行全部业务 Hooks，再把 props 传入插槽；非 `classic` 插槽抛错时自动回退 `classic` |
| `apps/mobile/ui-modes/controllers.ts` 与业务宿主 | 为 inbox、单聊、群聊、云电脑定义控制器数据和动作，并把页面连接到屏幕插槽 | 仅替换渲染视图；原请求、状态、权限门禁和经典视图由原控制器持有 |
| `apps/mobile/lib/{appearance,native,chat-appearance}.ts` | 将激活模式的令牌覆盖、深浅色锁、系统色策略与聊天背景挂起策略合入现有读取链 | 绝不覆写或删除 `rakazo.uiAppearance` 与 `rakazo.chatAppearance.mobile` 磁盘记录 |
| `apps/mobile/components/{glass-surface*,app-error-boundary}.tsx` 与 `app/_layout.tsx` | 启动阶段并行加载 UI 模式、导航栏/状态栏实时响应模式切换、根级异常自动回退 `classic` | 冷启动在隐藏 Splash 前完成模式水合；根级渲染失败若处于非 `classic` 模式则先自动恢复 `classic` |

## 3. 状态优先级与无损恢复规则

1. **颜色与深浅模式合成**：
   - `classic` 模式下沿用用户保存的 `AppearancePreference`（`system | light | dark`）及 `@rakazo/ui-tokens` 默认色表。
   - 自定义模式若声明 `colorSchemeLock: "dark" | "light"`，运行态 `resolveMobileAppearance()` 与原生 `Appearance.setColorScheme(...)` 按锁定的明暗度生效，但 `getCachedAppearancePreference()` 与 `SecureStore` 中的用户原偏好保持不变；切回 `classic` 后立即按用户原偏好恢复系统窗口明暗度。
2. **系统动态颜色（`PlatformColor`）隔离**：
   - `systemColorPolicy: "platform"`（`classic` 默认）保留现有 iOS 系统动态色。
   - `systemColorPolicy: "tokens"`（风格化模式使用）强制 `native` 对象所有语义槽位走模式自身的 `ColorTokens`，防止 iOS 系统灰渗透进定制皮肤。
3. **聊天背景与气泡共存保护**：
   - `chatAppearancePolicy: "preserve"`（`classic` 默认）原样返回用户配置的本地聊天背景图与气泡样式。
   - `chatAppearancePolicy: "suspend"` 在读取层返回干净默认聊天外观，不修改内存缓存的原始记录，也不删除本地背景图片与 `SecureStore` 数据；切回 `classic` 即刻恢复。
4. **一键切换与多项选择支持**：
   - `listAvailableUiModes(platform)` 按 `order` 返回当前平台全部可选模式元数据（含 `previewBadge`、名称与简介），直接支撑后续多项选择画廊。
   - `setUiMode(id)` 在切入非 `classic` 模式时自动更新 `lastAlternateModeId`；`toggleAlternateUiMode()` 支持在 `classic` 与 `lastAlternateModeId`（或首个可用扩展模式）之间一键来回切换。

## 4. 后续新增一套 UI 模式的接入方式

后续视觉阶段新增任意风格时，只需在 `apps/mobile/ui-modes/<mode-id>/index.ts` 导出一个符合 `UiModeDefinition` 的对象并调用 `registerUiMode(definition)`（或加入内置注册列表）：

1. 仅配 `colors + geometry + glassPolicy + systemColorPolicy` 即可获得全局色调、圆角与玻璃质感切换；
2. 按需提供 `primitives`（卡片、触发按钮、代码容器、审批门禁卡、遥测横幅）即可定制局部实物/硬件控件；
3. 按需提供 `screens`（`inbox`、`thread`、`groupThread`、`computer`）即可在不触碰业务控制器 Hooks 的前提下实现完全异构的页面排布。

## 5. 当前接线与发布边界（2026-11-20）

- 根运行树已接入 `UiModeProvider`；启动时在隐藏 Splash 前并行水合系统明暗偏好与模式选择。主题令牌、原生窗口色和系统动态色订阅会响应模式切换。
- `apps/mobile/app/index.tsx`、`apps/mobile/components/thread/thread-screen.tsx`、`apps/mobile/app/computer.tsx` 分别接入 `inbox`、`thread`／`groupThread` 和 `computer` 插槽。各控制器先完成原有 Hooks，再提供当前状态与动作；经典视图保留为默认和异常回退。
- 聊天背景/气泡挂起策略仅改变有效渲染外观，原用户设置保留；玻璃策略支持默认 tint、圆角和实体回退，调用方显式值优先。
- 已有离线架构、页面宿主、iOS 设置选择页及 `midnight` 内置皮肤；设置入口仅在 iOS 显示，深链打开时也通过注册表过滤当前平台的可选项。页面只调用状态内核，不重建业务控制器或加载远程皮肤。
- 未构建/发布包含该功能的 IPA／OTA，未进行真机验收。手机上现有 `Sydney` 是否含本轮功能须核对已安装构建，不能由项目源码或 App 名称推定。
