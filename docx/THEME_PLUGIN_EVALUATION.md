# iPhone 声明式换肤评测

日期：2026-11-24（基线建于 2026-11-21）。关联 PA-018、PA-019、PA-020、PA-021。阶段状态只在 [总计划](PLAN.md) 维护。

后续发布基线：本地主题包首版已随 iPhone `1.0.22` OTA 分发，Run `44899174271` 成功，实际更新协议清单、启动包及 55 项资源核验通过。[发布证据](VALIDATION.md#sydney-app-0421022-整合与发布2026-11-21)

## 范围、原则与边界（2026-11-24，`ui-plugin` 分支）

遵循 **Stop That Shit（Stop Ladder）** 原则：
1. **以真实缺口驱动复杂度**：每项实现均对应明确的评测条目与用户可感知缺口，不新增第三方依赖、不引入脚本执行宿主、不破坏既有 v1 主题包兼容性。
2. **严守既有契约与平台边界**：继续保持 TH-10 约定的 iOS 专属自定义主题包边界（Android／Web 仅暴露经典模式）；Web 侧换肤、账号跨设备同步与在线主题市场继续留作后续独立里程碑，不在本轮扩张。
3. **有效防护而非堆砌防御**：对比度检测直接输出可读性提示（不粗暴拦截合法主题包）；组件圆角与边框设安全上限以保障坏皮肤仍可进入设置恢复默认。

### 分批实现演进
- **第一批（已完成并通过 13 文件 98 项离线验证）**：统一旧 `ui-mode` 与 `themeManager` 双轨状态，重构「界面模式」设置页（实时预览卡片、单一预览/恢复条、按页面折叠分配与单页清除、卸载确认、15 作用域三语本地化与设置首页主题摘要）。
- **第二批（已完成并通过 19 文件 151 项离线验证）**：修复 `ScopedThemeRoute` 后台页防串页与分屏左栏隔离；修复首页/单聊/群聊/项目聊天的背景层遮挡与用户聊天背景优先级；`useThemedStyles` 透传第 3 参数 `scope`，接入 `home-styles` 与 `settings-group`；补齐报错与警告三语本地化。
- **第三批（本轮并行收口，3 个互斥写集子代理 + 1 个独立只读测评子代理）**：
  - **工作流 A（协议增强、可读性与上手体验）**：向后兼容地支持可选背景遮罩 `background.overlayOpacity`（0–0.6）并在 `ScopedThemeBackground` 渲染；实现零依赖 WCAG 对比度检测（`theme-contrast.ts`）并在预览卡片与导入/预览流程展示低对比度提醒；内置两套官方示例包（`Ocean Global`、`Inbox Cards`）一键载入与主题包详情展开查看。
  - **工作流 B（共用交互组件材质与几何接入）**：将 scoped `controlRadius`、`borderWidth`、`surface` 接入 `NativeActionButton`（双平台）、`ThreadComposer` 与 `MainBottomNavigation`，并清除聊天与首页头部共用组件中的残留全局 `mobileTokens()`/`resolveMobileAppearance()` 调用。
  - **工作流 C（全页面背景透出与全局令牌收口）**：通过 `useScreenBackground` 让剩余主页面与设置子页在主题包提供背景图时透出 `ScopedThemeBackground`，并将剩余页面级全局 `mobileTokens()` 迁移为 `useMobileTokens()` / `useThemedStyles((tokens, colors) => ...)`。

## 验收矩阵

| 编号 | 场景及操作 | 通过条件 | 离线自动化覆盖 | 真实设备结果 |
| --- | --- | --- | --- | --- |
| TH-01 | 导入全局与局部示例；取消文件选择 | 显示名称、作者、版本、范围；安装不自动应用；取消无副作用 | `theme-pack.test.ts`、`theme-manager.test.ts`、`ui-mode-screen.test.tsx` | 待真机 |
| TH-02 | 非法 JSON、协议、字段、页面、布局、资源、超限文件 | 拒绝且展示本地化错误原因，已装包及选择不受影响 | `theme-pack.test.ts`、`theme-controls.test.ts` | 待真机 |
| TH-03 | 全局皮肤及首页／单聊／群聊局部皮肤组合 | 局部字段覆盖全局，未覆盖字段继承；局部设为经典/午夜生效；未绑定页面保持全局 | `theme-pack.test.ts`、`theme-manager.test.ts`、`theme-controls.test.ts` | 待真机 |
| TH-04 | 页面往返、后台保留页面、分屏与设置子页 | 页面实例各自持有主题，切页不串色；仅聚焦页更新 `activeScope`；分屏左右栏独立 | `scoped-theme.test.tsx` | 待真机 |
| TH-05 | 预览、取消、离页、应用、单页清除、重启 | 单一预览条；预览不写存储；离页取消；确认保存后双轨一致且重启恢复；单页可清除跟随全局 | `ui-mode-screen.test.tsx`、`theme-controls.test.ts`、`theme-manager.test.ts` | 待真机 |
| TH-06 | 经典／卡片首页、单聊／群聊与设置分组材质 | 复用业务控制器与输入组件；首页/设置消费 scoped `tokens`、`cardRadius`、`borderWidth` 与 `surface`；草稿与滚动不丢失 | `home-styles.test.ts`、`settings-group.test.tsx`、`ui-mode-slots.test.tsx` | 待真机 |
| TH-07 | 主题背景（含可选遮罩）与用户聊天背景／气泡共存 | 用户聊天背景覆写主题背景不叠加；无用户背景时透出主题背景与可选 `overlayOpacity` 遮罩；恢复皮肤不删用户聊天数据 | `scoped-theme.test.tsx`、`home-styles.test.ts`、`theme-pack.test.ts`、`chat-appearance.test.ts` | 待真机 |
| TH-08 | 同 ID 替换、拒绝替换、写入失败、卸载确认 | 替换与卸载均显式确认并展示受影响范围；失败保留旧包；内置包不可覆盖或卸载 | `ui-mode-screen.test.tsx`、`theme-manager.test.ts`、`theme-controls.test.ts` | 待真机 |
| TH-09 | 卸载当前全局／局部包、资源缺失、渲染失败 | 清理对应绑定并同步回退 `ui-mode`；`UiModeCrashBoundary` 与 `AppErrorBoundary` 自动恢复默认 | `scoped-theme.test.tsx`、`app-error-boundary.test.tsx`、`theme-controls.test.ts` | 待真机 |
| TH-10 | 旧模式迁移、损坏存储、持久化失败、非 iOS | 原经典／午夜迁移与对账；写失败提示本地化警告；损坏安全恢复；Android／Web 仅暴露经典 | `theme-manager.test.ts`、`theme-controls.test.ts`、`ui-mode-screen.test.tsx` | 待真机 |
| TH-11 | 类型、定向回归及静态检查 | 移动端 `tsc --noEmit`、目标 Vitest 回归、Biome 与 `git diff --check` 全部通过 | 本轮完成后以 [验证记录](VALIDATION.md) 为准 | — |
| TH-12 | iPhone 大字号、键盘、VoiceOver、深浅色、前后台 | 预览卡片、折叠分配与输入发送可用；审批／错误状态可辨认，安全区正确 | 不作为离线验收项 | 待真机 |
| TH-13 | 对比度提示、官方示例包一键安装与包详情查看 | 低对比度配色（WCAG AA < 4.5 / 严重 < 3.0）在预览卡片及提示中清晰告警；内置 `Ocean Global` 与 `Inbox Cards` 可一键安装并可展开查看自定义范围与色值摘要 | `theme-contrast.test.ts`、`theme-presets.test.ts`、`ui-mode-screen.test.tsx` | 待真机 |
| TH-14 | 共用交互组件（按钮、输入栏、底部导航、聊天组件）跟随主题几何与材质 | `NativeActionButton`、`ThreadComposer`、`MainBottomNavigation` 消费受安全限幅的 `controlRadius` / `borderWidth` / `surface`；聊天与首页头部组件不再读取全局 `mobileTokens()` | `native-action-button.test.tsx`、`main-navigation.test.tsx`、`thread-composer.test.tsx` | 待真机 |
| TH-15 | 全页面主题背景透出与页面级作用域令牌覆盖 | 主模块页（项目、GitHub、应用、电脑、搜索、日程、产物、资料、认证）及设置子页外层容器使用 `useScreenBackground`，页面不再直接调用全局 `mobileTokens()` | `screen-theme-coverage.test.ts` 及对应页面测试 | 待真机 |

## 独立测评门槛

本轮三个实现子代理交付后，启动独立只读测评子代理按以下维度核验，确认无阻断项后再行汇总：
1. **需求与矩阵核对**：逐条对照 TH-01～TH-15，确认无未闭合的声明或虚报通过。
2. **Stop That Shit 审查**：检查是否存在无意义防御、过度抽象、破坏 v1 协议兼容或越界放开 Android／非请求范围。
3. **回归与安全边界**：核对 `ScopedThemeBackground` 不拦截触摸、设置页圆角/边框与对比度警告不阻断恢复默认、全局 `mobileTokens()` 清理不破坏任何既有测试替身。

## 离线候选与实机操作

离线候选包含当前 `ui-plugin` 工作区源码、官方示例主题包（[global-ocean.sydney-theme.json](theme-packs/global-ocean.sydney-theme.json)、[inbox-cards.sydney-theme.json](theme-packs/inbox-cards.sydney-theme.json) 及 App 内一键载入预设）、定向检查命令与结果及已知限制。离线回归不替代真机签名安装或已发布 OTA 验收。
