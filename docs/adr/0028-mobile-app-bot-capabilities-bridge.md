# ADR-0028: 手机 App 全能力与 iOS 原生数据向自有 Bot 开放边界

- 状态：已采纳（2026-11-25）
- 关联需求：PA-021

## 背景

Sydney 手机端已具备原生 GPS 定位、实时天气与预报、地图 POI 搜索、路线预估与高德地图导航拉起、后台陪伴／灵动岛等能力，但这些状态此前仅保存在手机本地，账号下的 Bot 无法读取也无法直接触发导航、页面跳转或访问手机日历／提醒事项／通讯录／剪贴板。用户明确要求向账号下全部自有 Bot 开通 App 全能力与 iOS 系统原生数据权限，支持前台自动执行与后台一键卡片，并在统一入口提供放宽后端工具审批的开关。

## 决策

1. **账号级统一桥接表与最小化同步（`UserMobileBridge`）**：
   - 在 PostgreSQL 新增按 `userId` 主键隔离并启用 RLS（经由 `(SELECT app_rls_bypass())`）的 `user_mobile_bridges` 表，保存 `permissions`、`snapshot` 与短时效（10 分钟、上限 20 条）`pendingActions`。
   - 手机客户端在上传前与服务端在落库／读取时双重按 `permissions` 过滤；关闭任一分项或总开关时，服务端立即裁剪对应缓存分类，不保留禁用项数据。
2. **严格的所有者会话信任边界**：
   - 全部 15 个新增 `app_*` 内置工具（`app_get_context`、`app_get_location`、`app_get_weather`、`app_map_search`、`app_map_route`、`app_open_amap_navigation`、`app_open_screen`、`app_control_companion`、`app_get_calendar`、`app_create_calendar_event`、`app_get_reminders`、`app_create_reminder`、`app_search_contacts`、`app_get_clipboard`、`app_set_clipboard`）仅在账号所有者亲自发起的对话（`ownerStartedRun && !messagingChannelRun && !isBackgroundRunTrigger`）中暴露与执行；他人消息、外部消息通道或无人值守定时触发无法读取手机数据或操作手机。
3. **双轨动作执行与安全审批分级**：
   - 手机端执行动作（高德导航、页面跳转、陪伴切换、日历／提醒写入、剪贴板写入）同时写入对话 `app_action` 卡片与 `pendingActions` 并写入审计日志；App 在前台且开启 `foregroundAutoExecute` 时在 60 秒新鲜窗口内去重自动执行，后台或历史回看时保留一键点击卡片。
   - 读操作与导航／页面／陪伴控制由显式用户权限开关与所有者身份确定性门控；写入类系统动作（日历事件、提醒事项、剪贴板）保留在后端审批体系内，用户在「设置 → Bot 应用权限」开启放宽模式（`ApprovalMode = "never"`）后可免逐次弹窗，而支付、密钥与显式拒绝规则保持硬保护不被绕过。
4. **零第三方依赖原生 iOS 模块（`sydney-device-bridge`）**：
   - 使用 Apple 原生 `EventKit`、`Contacts`、`UIKit` 构建本地 Swift Expo 模块，并在调用前校验 `Info.plist` 权限描述键；旧版侧载 IPA 优雅降级为「待新 IPA」，不阻塞 App 内既有能力。

## 后果

- 手机端需安装包含 `sydney-device-bridge` 与新增 `Info.plist` 声明的新版 IPA 才能使用 iOS 日历、提醒事项、通讯录与剪贴板原生读写；App 内定位、天气、高德搜索／路线／导航、后台陪伴与页面跳转可随服务端部署与 OTA 立即生效。
- 手机快照数据同步至用户自托管服务端数据库（受用户行级安全保护），后续账户导出／删除时因 `ON DELETE CASCADE` 自动随账号级联清除。
