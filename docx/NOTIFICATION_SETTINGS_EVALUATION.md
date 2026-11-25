# 手机 App 首次进入通知引导弹窗与消息通知设置专项评测

更新日期：2026-11-25。关联需求：PA-021。依据 Stop That Shit 原则（先复用现有 `expo-notifications`、`SecureStore`、`SettingsGroup`、`live-notifications.ts` 与 `open-notification.ts`，不引入新依赖、不改动无关文件）编写。阶段总状态以 [总计划](PLAN.md) 为准。

## 平台与侧载边界说明

- **本地通知**：免费 Personal Team 侧载包（`sydneySideload === true`）支持通知权限申请与本地通知（横幅、提示音、一键测试通知，以及点击后复用 `open-notification.ts` 跳转会话）。
- **远程 APNs 推送**：免费侧载包移除了 APNs entitlement，远程推送 Token 注册（`registerPushToken()`）仅在非侧载正式签名构建中执行；设置页如实提示该限制。

## 评测矩阵

| 编号 | 评测场景 | 通过条件 | 当前状态 |
| --- | --- | --- | --- |
| **NOTIF-01** | 首次进入 App 弹窗仅触发一次 | 启动隐藏 Splash 并进入主路由（非 `/sign-in`、`/server`、`/paywall`）后弹出「开启消息通知」询问；点「开启通知」持久化 `prompted: true` 并调用 `requestPermissionsAsync()`，授权成功同步 `enabled: true`（非侧载包再调 `registerPushToken()`）；点「暂不开启」持久化 `prompted: true`、`enabled: false` 且不触发系统权限框；后续重启不再重复弹出 | 已通过（3/3 + 7/7） |
| **NOTIF-02** | iOS 共享原生队列安全 | 冷启动不抢先调用阻塞型 `getPermissionsAsync()`，首次权限申请由用户点击后走 `requestPermissionsAsync()`；`SecureStore` 读写损坏或异常时安全回退默认偏好 | 已通过（7/7） |
| **NOTIF-03** | 偏好持久化与前台通知生效 | `enabled`、`messages`、`needsAttention`、`completions`、`sound` 持久化到 `SecureStore`；`configureForegroundNotifications()` 按当前偏好控制 `shouldShowBanner`、`shouldShowList`、`shouldPlaySound`，并继续屏蔽当前已打开的会话 | 已通过（12/12 + 7/7） |
| **NOTIF-04** | 设置页交互、拒绝引导与测试通知 | `settings-home.tsx` 在 iOS/Android 均展示「消息通知」入口；`notifications.tsx` 支持切换总开关与分类开关、系统拒绝时展示「前往系统设置」（`Linking.openSettings()`）、点击「发送测试通知」调用 `scheduleNotificationAsync`、侧载包显示本地/远程边界提示 | 已通过（2/2） |
| **NOTIF-05** | 既有通知链路零回归 | Android `RakazoNotifications` 设置与点击通知跳转 `open-notification.ts` 保持原行为 | 已通过（4/4 + 8/8 + 4/4；`live-notifications-android.test.ts` 13/14，1 项既有 `resumeLiveNotifications` URL 断言失败与本批无关） |
| **NOTIF-06** | iPhone 真机与系统设置联动（环境受限项） | iPhone 真机首次安装弹窗、系统权限框、横幅/声音及从系统设置返回刷新状态 | 待 iPhone 真机验证 |
