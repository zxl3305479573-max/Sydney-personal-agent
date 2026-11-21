# Mobile app

Chat with your bots, answer their questions, watch their computers and take calls from your phone.

## Conversation state retention

The current mobile source keeps recent Bot and group snapshots within the signed-in session.
Returning Home immediately preserves a Bot's working status in both the list and pinned chats;
reopening a recent conversation paints its snapshot before the background refresh finishes.
The saved transcript also retains its last known runs, while omitting replay cursors and computer
control. Fresh server reads settle tasks that finished while the conversation was closed.
This client change still requires an iPhone update and device validation; see
[the implementation plan](../docx/PLAN.md#iphone-对话运行状态缓存补修pa-018pa-0212026-11-21).

## 项目与 GitHub 页面状态

当前手机源码在本次登录内保留项目列表及分页、项目详情与归档成员、本机／云目录状态，以及项目聊天消息、任务和头像／模型资料。GitHub 个人主页年份、仓库／探索列表、筛选与页码、搜索输入和仓库详情也会恢复；列表与详情保留各自的滚动位置。已访问页面重新打开先显示缓存，后台同步最新内容，下拉刷新仍主动更新。服务端确认拒绝访问或内容已删除时清除对应结果，断开或切换 GitHub 连接也会清理旧内容；PAT 和审批授权不参与页面状态缓存。

这些是内存中的会话状态，沿用现有缓存回收及退出登录清理，应用被系统结束或重启后仍需重新读取。本批源码未发布手机更新，真实 iPhone 的导航和滚动恢复待验，见[验证记录](../docx/VALIDATION.md#项目与-github-页面状态保留2026-11-21)。

## 应用对接按钮

当前手机源码将应用目录与插件详情中的登录、重新连接和添加账号改为文字操作，使用当前主题颜色，避免卡片内重复叠加玻璃按钮。文字按钮及等待状态保留 44pt 最小高度；授权行为沿用现有流程。此改动未发布，真实 iPhone 视觉待验，见[验证记录](../docx/VALIDATION.md#应用对接登录按钮2026-11-21)。

## 界面材质

当前手机源码仅在对话顶部 Bot 名称组件保留玻璃效果。设置分组、普通页面标题、应用／项目／GitHub 卡片、聊天气泡与功能卡片、输入附件和通用按钮均采用平面样式；导航栏返回、关闭、菜单等操作隐藏独立玻璃底。主操作与选中状态继续使用主题颜色，禁用／等待状态及点击行为保留。主题包的玻璃配置只影响上述对话标题，其他表面使用现有平面配色；禁止玻璃的主题仍使用平面标题。源码候选尚未发布，真机视觉与导航手势待验，见[验证记录](../docx/VALIDATION.md#手机界面玻璃效果统一收敛2026-11-22)。

## Install

- iPhone: [App Store](https://apps.apple.com/app/rakazo/id6801531099).
- Android: [download the APK](https://github.com/elie222/rakazo/releases/download/android/rakazo.apk).

The account menu in the web and desktop apps no longer offers a mobile-app download.

## Sign in

Sign in with your rakazo.com account. To use your own server instead, tap **Use a custom server** on
the sign-in screen and enter its address. For a server on your local network, follow
[Connecting a phone on the same network](./self-host-clients.md#connecting-a-phone-on-the-same-network).

## What you can do

- Chat with bots and groups, attach photos, files or camera shots, and talk instead of typing.
- Answer questions and [approvals](./approvals.md), and save credentials a bot asks for.
- Open a bot's profile to see its **Computer**, **Routines** and settings.
- Take control of a bot's computer, with an on-screen keyboard.
- Call a bot, or answer when a bot calls you. See [Voice and calls](./voice-and-calls.md).
- Connect apps, manage skills, models, voice, approvals, chat apps and your vault from Settings.

The first time you send something, the app asks permission to share it with the AI services your
server uses. Review or withdraw it later in **AI data sharing** in Settings.

In a bot chat, the composer shows the bot's current model. A new bot inherits the space's main
model. Tap the model name to search connected models and see which option is selected. Picking
a model saves it for that bot. Choose **Space default** to inherit the space's main model again.

The current mobile source adds a fixed, full-width **Apps / Projects / GitHub** bottom bar on
Home and the three module lists. Module switches keep one return to Home. Chat, computer,
settings, project details, app connection forms and repository details hide the bar. Apps now
opens on the main stack; existing Settings links and OAuth callbacks keep working. The voice
player sits above the bar, with one owner for the bottom safe area.

The native GitHub screen reuses the server's connection, profile, contribution calendar,
repository search and detail APIs. PAT input clears on submission or when leaving the page.
Bot analysis prepares a draft and preserves any existing draft. Build 4 loads results in the
background when users switch years, filter, search, page through results, or open a repository.
The refresh indicator appears when the user pulls down to refresh. The user confirmed a
successful GitHub connection on build 2. Build 4 is available as an unsigned IPA and awaits
device validation. It caches GitHub connection status under the verified server, account and
space and refreshes it in the background. In **Settings → Account**, tap **Edit avatar** to
choose a photo. The current source uses flat chat bubbles and reserves glass for the chat title. Tapping the current chat
model opens a sheet over the conversation. Add and manage models from Settings. See the
[mobile evaluation](../docx/MOBILE_NAV_GITHUB_EVALUATION.md).

The released `1.0.13` OTA adds **Settings → Software update** and release notes.
**Settings → Account** also shows the native iOS build and running OTA identifier.

The next iOS update flow checks after startup and shows one alert per available update. The
alert and **Settings → Check for updates** show the version and release notes before download.
Tap **Update** to download, then **Install and restart** to apply it immediately. The current
Sydney version appears in **Settings → About**. This flow is implemented in source. A new
sideload build is needed to disable the native startup download configured in build 4.

## What stays on web and desktop

- Creating or editing [routines](./routines.md). On mobile you can pause, delete and review them, or
  ask the bot in chat to set one up.
- [Teach a task](./skills.md#teach-a-task-by-showing-it).
- [Using your own computer](./desktop-app.md) with bots.

## Notifications

Bots notify you when they finish or need input, controlled per bot with
**When it finishes or needs input** in its settings.

On Android, **Notifications** in Settings also lets you choose which kinds you get, including a live
working status while a bot runs.

## Share to a bot

On Android, share text, images, audio, video, PDFs or files from another app to Rakazo and pick the
bot to send them to.
