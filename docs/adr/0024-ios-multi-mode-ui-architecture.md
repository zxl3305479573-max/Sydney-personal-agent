# ADR-0024：iOS 客户端多模式可切换 UI 架构

- 状态：提议（架构内核实施中，视觉皮肤待后续阶段接入）
- 日期：2026-11-18
- 关联需求：PA-018、PA-020、PA-021
- 替代或被替代记录：与 [换肤插件系统设计草案](../../docx/design/THEME_PLUGIN.md) 在移动端互补，不替代 Web 换肤草案

## 背景

用户希望将原生移动端（仅针对 iOS）的新界面设计为可一键切换、支持多项选择并可持续扩展多种风格的“UI 模式”，同时保留当前已有界面作为默认与随时可切回的经典模式（`classic`），并明确要求当前阶段**先不实施具体新视觉界面，先把整体多模式切换与扩展架构落地**。

当前 `apps/mobile` 的现状与约束如下：

1. 颜色与系统外观由 `apps/mobile/lib/appearance.ts`（`rakazo.uiAppearance`）和 `apps/mobile/lib/native.ts`（在 `system` 模式下混用 iOS `PlatformColor`）驱动；聊天自定义背景与气泡由 `apps/mobile/lib/chat-appearance.ts`（`rakazo.chatAppearance.mobile`）独立持久化。
2. 核心页面（如 `Home`、`Thread`、`Computer`）内部包含严格顺序的 React Hooks（轮询、流式消息同步、草稿缓存、WebView 远程桌面连接与控制租约）。若通过复制路由或卸载重挂载控制器组件来切换 UI，会破坏 Hook 顺序或丢失运行态会话与输入草稿。
3. 现有移动端已有 300+ 项定向测试，默认 `classic` 模式必须保持零视觉变化与零回归；任何未来新增模式的异常均不得锁死应用或清除用户已保存的外观、背景及气泡配置。
4. iOS 安装包通过 GitHub Actions + Windows 侧载签名及可选 `expo-updates` 热更新分发，架构层不应引入新的原生 C++/Swift 编译依赖。

## 候选方案

### 方案 A：仅做颜色变量替换（Pure Color Token Swap）

- 做法：只在 `mobileTokens()` 中按模式名返回不同颜色表。
- 评估：实现最轻，但无法改变圆角形态（连续圆角与斜切角）、系统 `PlatformColor` 渗透、iOS 26 液态玻璃启用策略、原子控件形态及核心页面异构排布，无法支撑差异化多风格扩展。

### 方案 B：按风格复制路由页面（Duplicate Route Screens）

- 做法：每新增一套风格复制 `app/index.tsx`、`thread.tsx`、`computer.tsx` 等路由并跳转到不同路径。
- 评估：页面内的 RPC、会话代次校验、未读计数、草稿与云电脑租约逻辑全部重复，维护成本随风格数量线性膨胀；切换路由会重建栈并中断当前输入与远程画面连接。

### 方案 C：注册表 + 状态与非破坏性外观桥接 + 保序插槽宿主（选定）

- 做法：保持业务逻辑与控制器 Hooks 唯一，在 `apps/mobile` 建立三层纯 TypeScript 架构：
  1. **模式契约与注册表（`ui-mode-registry`）**：集中校验并管理 `classic` 与未来多套 `UiModeDefinition`（含平台门禁、颜色覆盖、几何/排版/触感令牌、玻璃策略、系统色策略、聊天背景策略以及可选图元/页面插槽）。
  2. **模式状态与非破坏性桥接（`ui-mode` + `appearance` / `native` / `chat-appearance` / `glass-surface`）**：以独立 `SecureStore` 键（`sydney.mobile.uiMode.v1`）持久化当前模式与最近使用的备选模式，支持一键切换、临时预览与取消回滚；深色锁（`colorSchemeLock`）与聊天背景挂起（`chatAppearancePolicy: "suspend"`）仅在运行态合成生效，绝不覆写或清理用户原有的 `rakazo.uiAppearance` 与 `rakazo.chatAppearance.mobile`。
  3. **Hook 保序插槽与崩溃自愈边界（`ui-mode-slots` + `AppErrorBoundary`）**：页面控制器无条件执行完既有 Hooks 后将视图模型交给插槽宿主渲染；非 `classic` 模式发生渲染异常时自动回退至 `classic` 模式，确保坏皮肤不可锁死客户端。

## 决策

采用 **方案 C**，适用范围为 `apps/mobile`，自定义 UI 模式默认仅声明 `supportedPlatforms: ["ios"]`，在非支持平台（如 Android）自动无感回退至内置 `classic` 模式。

本阶段仅交付完整架构内核、宿主接线、启动预加载、异常自动回退与定向离线测试，不新增用户可见的切换按钮或新风格视觉页面，确保默认运行态与既有 `classic` 界面 100% 一致。

## 影响与限制

- **收益**：后续开发任意数量的新 iOS 风格只需在 `apps/mobile/ui-modes/` 注册独立定义包，无需改动 RPC、会话或存储逻辑，且纯 JS 样式包可直接通过 OTA 热更新分发。
- **兼容性**：独立存储键 `sydney.mobile.uiMode.v1` 不影响既有登录会话、`rakazo://` 协议、深浅色偏好及本地聊天背景文件。
- **已知限制**：本轮仅完成架构底座与离线单元测试，尚未接入视觉切换抽屉与新风格包，也未在真实 iPhone 设备上执行端到端切换验收。

## 验证与重新评估

- **验证方法**：执行 `@rakazo/mobile` TypeScript 类型检查、Biome 检查，以及覆盖注册表校验、平台门禁、并发持久化、临时预览回滚、原有深浅色/聊天背景无损恢复、iOS 玻璃策略与渲染崩溃自动回退 `classic` 的 Vitest 单元测试，并回归既有外观与玻璃组件测试。
- **重新评估条件**：若后续某套视觉皮肤需要自定义 SkSL 着色器或新字体资源，再单独评估资源体积、侧载 IPA 路径长度门禁与原生依赖影响。
