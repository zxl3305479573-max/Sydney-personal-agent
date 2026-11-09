# Windows 与 iPhone 免费侧载操作指南

关联需求：PA-021。更新：2026-11-09。

此指南是依据 AltStore 官方资料整理的候选流程，**尚未用 Sydney IPA、用户 Apple 账号及 iPhone 完整验证**。云构建生成的是未签名 IPA，不能直接当成已签名安装包。

## 准备

- Windows 电脑、数据线、可解锁的 iPhone，以及用户自己的普通 Apple 账号。
- 在 Windows 下载本项目构建好的 `Sydney-unsigned.ipa`，先核对构建版本和 SHA-256。
- 依据 [AltStore Windows 安装说明](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)，准备 AltServer 及其所需的 Apple 组件。该说明推荐 Apple 直接提供的 iTunes 和 iCloud；已有安装版本不同的情况先查看官方故障排查，不直接卸载用户的软件。
- 用户自行在工具中输入账号信息和处理验证；不要将密码、验证码或证书发到聊天或写进仓库。

## 候选安装路径

1. 解锁 iPhone，用数据线连接 Windows，按设备提示信任电脑。
2. 启动 AltServer。按官方安装说明将 AltStore 安装到手机，并根据系统提示信任开发者和启用开发者模式；具体菜单名称可能随系统版本变化。
3. 使用 AltStore 导入 Sydney IPA 并签名安装。AltServer 官方发行说明也记录了 Windows 按住 Shift 点击托盘图标后出现的 `Sideload .ipa…` 入口；该直接侧载方式是否适用于本项目尚未验证。
4. 打开 Sydney，依次验证服务器地址、登录和聊天；再检查头像设置、键盘、安全区和触控。不能以成功安装或编译代替这些验收。
5. 记录错误内容时仅保留错误代码与必要说明，不记录账号、验证码、会话或个人数据。

AltStore 官方说明，免费侧载应用通常七天后过期，需要按其刷新流程续期；通过 AltServer 直接侧载的应用需手动重新安装。是否能够自动刷新及数据能否保留，均需在用户设备上实际验证。

## 官方资料

- [AltStore Windows 安装说明](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows)
- [AltServer 发行说明与直接侧载入口](https://faq.altstore.io/release-notes/altserver)
- [AltStore 应用刷新说明](https://faq.altstore.io/altstore-classic/your-altstore)
- [AltStore 故障排查](https://faq.altstore.io/altstore-classic/troubleshooting-guide)
