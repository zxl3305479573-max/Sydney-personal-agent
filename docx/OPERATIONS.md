# 运维手册

## 本机品牌预览记录（2026-11-04）

用户授权后，在 Windows 本机使用已有 Node 24 恢复依赖，并启动 Docker 中的 `rakazo-dev-postgres` 开发数据库及 Web、API、Worker 和 supervisor。数据库使用本机回环端口 54318，Web 预览为 `http://127.0.0.1:5173`；这是临时开发环境，不是双机部署。

项目 `pnpm dev` 在 Windows 的数据库迁移步骤遇到 `spawnSync pnpm ENOENT`，本次对新建开发数据库分别执行 Prisma 迁移、队列迁移和运行角色初始化后启动各服务。该绕行流程尚未整理为可复现的运维命令；不要将其作为服务器部署步骤。原生安装包和图标的系统兼容性尚未验证。

## 后台机桌面清理（2026-11-04）

按用户要求清理后台机的桌面组件，只保留运行中的项目。目标机为 Ubuntu 22.04、2 核约 1.7 GiB，通过云控制台添加临时公钥、经 SSH 443 端口操作；本次未使用密码或长期密钥。

清理前核实：运行项目为 `site_total`、`super-sydney-cloud`、`sydney-myself-api`、`caddy`、`docker`；容器 `canvas-webdav`、`infinite-canvas`；项目目录与依赖中不存在 `xrdp`、`xfce`、`Xvfb` 或 `DISPLAY=` 引用；`super-sydney` 实际以无界面 `uvicorn` 云同步 API 运行，其他服务同样无图形依赖。因此判定桌面组件不被项目使用。

已执行：结束活动桌面会话 `c6` 并停止 `xrdp`、`xrdp-sesman`；`apt-get purge` 移除 `xrdp`、`xorgxrdp`、`xfce4`、`xfce4-session`、`xfce4-panel`、`xfdesktop4`、`xfwm4`、`plank` 共 8 个软件包。随后结束 `sydney-desktop` 的遗留 systemd 用户会话（含 pipewire、dbus、gvfs、gnome-keyring 及 geoclue agent），`snap remove --purge` 移除 Firefox 及其孤立内容快照 `gnome-46-2404`、`mesa-2404`、`gtk-common-themes`，并执行 `apt-get autoremove` 清理孤立 X11 与桌面依赖。

清理结果：可用内存由清理前约 81 MiB 升至约 1066 MiB，负载由约 3.56 降至约 0.1，磁盘占用由 14 GB 降至 13 GB。`site_total`、`super-sydney-cloud`、`sydney-myself-api`、`caddy`、`docker`、`ssh` 全部保持 active；本地接口复测正常（canvas 200、cloud `/docs` 200、webdav 401、myself-api 根路径 404）。`snap list` 仅剩 `bare`、`core20`、`core22`、`core24`、`lxd`、`snapd`。后续复查发现仍有 XFCE 插件、工具和库，`/usr/share/xfce4` 也仍存在；模拟继续卸载会引入 85 个新软件包，因此未执行，需先分析依赖。

过程中一次 `snap remove firefox --purge` 被误启动，识别后立即执行 `snap abort`，变更状态为 `Undone`，数据未丢失；随后在确认无项目依赖后重新执行并成功移除。之后按用户确认执行 `userdel -r sydney-desktop`，账号及其家目录（约 17 MB）已删除，相关用户进程与登录会话一并消失。该删除不可恢复，且不再保留图形登录。xrdp 配置随卸载移除，`/etc/xrdp/xrdp.ini.sydney-backup` 一并消失，如需恢复桌面须重新安装并配置。

回滚：重新安装 `xrdp xorgxrdp xfce4 xfce4-session xfce4-panel xfdesktop4 xfwm4 plank`，重新安装所需 snap（Firefox 及其内容快照），重新创建 `sydney-desktop` 并重设密码，恢复 xrdp 监听策略；未演练。临时公钥 `sydney-temporary-cleanup` 仍在 `/root/.ssh/authorized_keys`，本次暂未移除；确认不再需要维护连接后，应删除该文件中对应的整行并复验 SSH 登录策略。

## 双机部署方向

首版改为后台和云电脑分机，见 [双机实施方案](design/TWO_HOST_DEPLOYMENT.md)。本节以下既有同机 systemd、socket、账号和服务路径为历史草案，不可直接套用于双机。SSH 转发、远端账号、身份校验、服务管理、备份和回滚命令均尚未在两机验证；实际安装或配置变更发生后再记录确切步骤和结果。本次没有连接服务器或修改服务。

## 新服务器轻量桌面迁移（2026-11-04）

测试服务器为 Ubuntu 24.04，2 核、约 3.6 GiB 内存。安装 XFCE、Thunar、xfce4-terminal、Plank、xrdp、xorgxrdp 和 dbus-x11；软件源索引过期导致首次下载失败，刷新索引后安装成功。安装期间软件包维护脚本重启了云管理服务；安装后 SSH、Docker、containerd 和 xrdp 均显示运行。

新建无 sudo 权限的 `sydney-desktop`，家目录为 `/home/sydney-desktop`，密码由用户交互设置。`.xsession` 启动 XFCE；壁纸位于 `~/Pictures/sydney-wallpaper.png`，用户登录自启动脚本设置壁纸、隐藏桌面图标和自动隐藏面板，Plank 启动器配置在 `~/.config/plank/dock1/launchers/`。

后续登录验证：桌面账号已成功通过 xrdp 登录，壁纸和桌面会话正常显示。用户截图显示默认底部 XFCE 面板与 Plank 重叠，已通过 XFCE 配置保留上方面板并移除底部面板，原面板配置备份在同目录 `xfce4-panel.xml.sydney-backup`；调整后的视觉效果待用户确认。

用户再次反馈重叠后，检查 X 窗口发现旧的底部面板仍留在当前会话；重启 XFCE 面板进程加载新配置后，窗口列表仅显示顶部 XFCE 面板和 Plank。启动脚本改为只配置保留的顶部面板，用户侧最终视觉效果仍待确认。

窗口拖动卡顿排查：用户确认面板重叠已恢复。空闲时检查约 2.5 GiB 可用内存、CPU 基本空闲，远程桌面分辨率为 2880×1800；该快照不能排除操作时的资源或网络瓶颈。已在桌面账号的 XFCE 窗口管理器中将 `/general/use_compositing` 从 `true` 改为 `false`，用户反馈窗口拖动明显流畅；Dock 外观变化尚未确认。回滚时在该账号的图形会话内运行 `xfconf-query -c xfwm4 -p /general/use_compositing -s true`；回滚尚未演练。

按用户要求改用 Chrome：从 Google 官方下载并安装 `google-chrome-stable` 157.0.8103.38，安装程序新增 `/etc/apt/sources.list.d/google-chrome.sources`，临时安装包已删除；已请求取消之前的 Firefox Snap 安装，回滚状态待确认。Plank 的 `chrome.dockitem` 指向 `/usr/share/applications/google-chrome.desktop`。以桌面用户启动后观察到 Chrome 空白窗口；Dock 点击、网页访问及重新登录后的表现仍待验证。若需卸载 Chrome，应先备份用户浏览器数据并核对软件包及其软件源，避免误删其他软件依赖；尚未演练卸载。

用户截图显示网页中文为方块；检查发现系统没有中文字体，已安装 `fonts-noto-cjk`，fontconfig 可匹配简体中文字体，用户确认显示正常。如需回滚，可评估其他应用的字体依赖后卸载该包，尚未演练。

桌面迁移后的临时管理密钥清理曾尝试执行，但命令被执行策略拦截；不能假设服务器公钥或本机私钥已经删除，后续需通过允许的方式核实清理。现有远程桌面使用 SSH 隧道，调整访问密钥前应保留可用的服务器管理入口。

## 测试服务器后台代理（2026-11-04）

按用户要求安装 Mihomo 1.19.33，以独立系统账号运行 `sydney-mihomo.service` 并设为开机启动。程序位于 `/usr/local/bin/sydney-mihomo`，配置为 `/etc/sydney-mihomo/config.yaml`，状态目录为 `/var/lib/sydney-mihomo`；服务仅监听 `127.0.0.1:7890`，未修改全局代理或防火墙。安装前校验下载文件的 SHA-256，服务状态及通过本机代理访问测试网站已验证。当前规则仅为 `MATCH,DIRECT`，没有导入订阅，无法视为节点代理已配置；Chrome 尚未接入。

使用 `systemctl status sydney-mihomo` 检查服务，使用 `systemctl stop sydney-mihomo` 可停止服务，使用 `systemctl disable --now sydney-mihomo` 可停用并关闭开机启动；停止和重新启用尚未演练。删除前须先备份所需配置并确认无程序依赖代理。不得将订阅链接或节点凭据写入仓库、运维记录或聊天。

后续已通过受限文件导入用户提供的订阅，配置为本机 HTTP 代理、订阅节点选择及私网直连；配置和订阅含敏感信息，权限仅允许 root 及服务账号所需访问。空配置备份为 `/etc/sydney-mihomo/config.direct-backup.yaml`。通过本机代理测试百度和 Google 均返回 HTTP 200，SSH、xrdp、Docker 等服务保持运行；节点选择、费用、订阅续期及长时间稳定性未验证。

桌面账号的 Chrome 启动器 `~/.local/share/applications/google-chrome.desktop` 和 Plank 的 Chrome 项已配置本机代理参数，系统全局环境和现有进程未修改；需要完全退出所有 Chrome 窗口后重新启动才能验证新的代理设置。恢复时将该 Plank 项指向 `/usr/share/applications/google-chrome.desktop` 并移除用户级 Chrome 启动器，完全退出 Chrome 后重启；恢复操作尚未演练。订阅 URL 已出现在聊天中，建议用户在服务商处更换或重置订阅链接，之后重新导入。

用户随后要求服务器流量按规则使用代理。已启用 Mihomo TUN 自动路由：私网及云 DNS 路由例外直连，SSH 服务端 TCP 回程规则优先使用主路由表，其他匹配流量走节点。规则模式不等于按国内外自动分流，当前没有地区分流规则。服务的 systemd drop-in 位于 `/etc/systemd/system/sydney-mihomo.service.d/10-tun.conf`，授予 `CAP_NET_ADMIN` 和 `CAP_NET_RAW`，权限风险和适用范围见 [ADR-0009](../docs/adr/0009-test-host-proxy-network-permissions.md)。

启用时设置了三分钟自动回滚保护；初次普通程序访问 Google 失败，启用 HTTP/TLS 域名嗅探后 root 和桌面账号的 HTTPS 测试均成功。另测得新 SSH 登录、现有远程桌面隧道、本机代理及现有服务正常，私网目标走主网卡。通过上述测试后取消了自动回滚定时器，未执行回滚演练。手动回滚入口为 root 执行 `/etc/sydney-mihomo/rollback-tun.sh`，该脚本恢复 TUN 之前的配置、移除服务 drop-in 与 SSH 回程规则并重启代理；运行前保留云控制台管理入口。备份和脚本中可能涉及敏感配置，不应写入仓库。

系统 DNS 没有整体接管；域名嗅探不能覆盖所有协议，也不保证 DNS 隐私。Docker 容器流量、IPv6、非 HTTP/TLS 协议、故障恢复及重启后的路由尚未验证，当前测试不能证明所有流量均按预期代理。

`/etc/xrdp/xrdp.ini` 已改为监听 `127.0.0.1:3389`，原文件备份为 `/etc/xrdp/xrdp.ini.sydney-backup`；未改动防火墙规则。通过本地 SSH 隧道测试端口连接成功，尚未验证完整 RDP 登录。测试访问需要先建立到服务器 SSH 22 的本地转发，再连接本地转发端口；桌面账号密码应由管理员在服务器控制台运行 `passwd sydney-desktop` 交互设置，不要写入文档或聊天。

回滚前确认当前配置及桌面用户数据：若恢复 xrdp 安装后默认监听，核对备份与当前配置，再恢复备份并重启 xrdp；默认配置可能公开监听，须先处理访问控制。若不再使用此桌面，可先备份用户数据并评估共享依赖，再移除专门安装的软件和用户；未执行卸载或数据删除。临时 SSH 管理密钥仅用于迁移，任务结束后应移除。

## 测试桌面浏览器（2026-11-04）

在一台已有 Ubuntu 22.04、xrdp 和 XFCE 的测试服务器上，桌面账号的 Firefox Snap 从独立桌面 D-Bus 会话启动失败；将启动进程的 `DBUS_SESSION_BUS_ADDRESS` 指向该用户的 `/run/user/<UID>/bus` 后，已观察到 Firefox 进程和窗口。该发现仅覆盖此次桌面测试，不代表本项目已在服务器部署或 P4 验收完成；实际网页访问、重新登录后的启动和用户点击 Dock 尚待验证。

此次仅为该桌面账号建立 `~/.local/share/applications/sydney-firefox.desktop`，并将 Plank 的浏览器项与 HTTP、HTTPS、HTML 的默认处理器指向它。启动器中的 UID 对应该测试账号，迁移到其他账号时必须核对；不要直接复制硬编码地址。原 Dock 浏览器项备份在 `~/.local/state/sydney-browser.dockitem.backup`，原 `~/.config/mimeapps.list` 存在时备份在同目录的 `sydney-mimeapps.list.backup`。回滚前核对备份和当前关联，通过桌面设置恢复首选浏览器，并恢复对应 Dock 项；不要覆盖其他用户后续修改。

## 原生 Linux 驱动初版

原生桌面基础操作使用 X11、`xdotool`、`xclip` 和截图命令；文字输入通过桌面剪贴板及粘贴快捷键完成，剪贴板可能被桌面账号其他进程读取，不能将其作为凭据隔离机制。原生终端命令最长 8 秒；超时、连接中断或截图失败时已发生的动作可能无法确定，不自动重试。图形能力不表示实时屏幕流、人工接管或可信停止可用；以上仍需目标 Linux 与实际桌面实测。

任务重试现在沿用首次派工的任务截止时间和已记录的调用、token 预留；过期任务拒绝重新派工。旧代码曾在重试时清零这些计数，历史任务可能低估用量，不能根据当前累计值断言历史成本上限；需要重新创建任务或人工核对历史账单。此修订尚未通过真实数据库验证。

指针动作的类型和按钮在移动鼠标前校验；多动作请求不是事务，某项失败时前面的动作可能已经执行，应先检查桌面状态再决定后续操作。该行为仅经离线替身验证，尚未在目标 Linux 验证。

源码和部署草案均位于当前仓库根目录；下文中的服务路径仍需在目标 Linux 服务器核对。应用服务通过 `SYDNEY_NATIVE_DRIVER_SOCKET` 指定 Unix socket，示例值为 `/run/sydney-driver.sock`。

systemd 草案按源码在 `/opt/sydney` 根目录部署编写，不包含独立 `/app` 子目录；实际安装路径须随服务器制品布局调整并实测。

应用仓库 `infra/native-linux/` 包含 systemd 文件和 `desktop-proxy.env.example`。这些文件是尚未在目标 Linux 验证的部署草案，当前不可照搬宣称生产可用。目录和账号分别是 `/var/lib/sydney-control`、`/var/lib/sydney-desktop`、`sydney-control`、`sydney-desktop`；后者不能读取后台环境文件、数据库和备份。套接字 `/run/sydney-driver.sock` 由 systemd 建立并只允许控制账号连接，驱动再次校验对端 UID。

桌面代理单独配置，示例地址仅为占位；不要把模型密钥或带口令的代理地址写进桌面用户可读配置。Provider 的命令限制为八秒且不会自动重放失联请求；浏览器流、交互式接管和可信后台进程静止证明尚不可用。桌面用户本身可操作其有权限访问的环境，同账号进程不构成相互隔离；在目标机完成隔离和对抗性验证前不得用于生产。

2026-11-04 模块审计补充：Provider `stop()`/`destroy()` 已改为明确返回 unsupported；driver `cancelRunWork`/`inspectBackgroundWork` 已接线，但 inspect 不能证明 idle，运行进程清理和 Linux 行为仍待验证。Executor 已给 Provider 注入 Run owner/fence/期限。managed state RPC 现检查版本，cancel 不可恢复，pause 恢复前检查 effect；managed model/tool guard 显式切回 tenant context。上述新增代码和测试未运行，生产 PostgreSQL/Linux 仍待验。不得把 cancel 请求成功解释为进程已清理，也不得把 unknown 映射为 idle；UI 手动确认仍不是服务端静止证明。详见 [Native Linux 审计](../docs/audit/native-linux.md)、[DB 审计](../docs/audit/db-task-execution.md) 和 [Pi 审计](../docs/audit/pi-adapters.md)。

租约修订：native 动作前现查询 Run 的 owner/fence/到期时间，并在存在共享电脑租约时查询该租约；请求期限不超过所查到期时间或八秒。依赖查询后发请求，不能保证即时撤销，也未在真实 PostgreSQL/Linux 验证。模型/工具的 managed guard 现拒绝过期 Run 租约；检查失败时动作不可继续，不应通过手工延长租约绕过。

控制与工具限制：managed runtime 运行期间约每两秒读取控制状态，状态不允许或数据库读取异常时中断运行信号；native 在途请求随信号断开。暂停不保证终止已发出的外部副作用或脱组进程，停止确认及暂停后恢复仍不可用。managed 暂不暴露 helper、`ask_user` 和接管等 Pi 直通入口，也不运行自动模型审核；普通 Run 的这些能力不因此关闭。本批代码尚未进行真实环境验证。

启动准备阶段：Run/电脑租约取得并创建 Attempt 后，managed 控制轮询在模型和连接准备之前启动；控制拒绝或读取失败会中止准备并尝试记录失败。更早的租约领取与已发出的准备请求仍不能保证即时终止；不得据 Run 失败推断电脑进程已停止。该调整未做真实服务回归。

排队任务取消：服务端在 Task 行锁事务中仅取消仍处于 `queued` 且属于 `managed_task` 的当前 Run，并清理其可恢复状态；若 Worker 已抢先领取，控制状态保留未确认，不能人工修改为已停止。完成结果必须有独立完成证据；历史不完整或存在任意 Run 未结算副作用时不得确认成功。

排队取消现在同事务记录 `run.cancelled` 并在提交后尽力通知，通知失败由订阅方按游标追赶；事务锁竞争与通知尚未在服务器验证。派工重复请求尝试保留已有作业的唤醒，失败由现有队列修复器处理，此行为未做真实队列演练。内部 checkpoint 不作为待核对外部效果。

失败 Run 本身不构成后台静止证明；未静止或存在未知效果时，工作台不开放重试。停止证据尚不可用时，不要修改控制状态来强行重试。

授权续期只适用于仍处于 queued/leased/running/waiting 状态的当前 Run；已完成、失败或取消的 Run 不得用旧 mandate 续期。waiting 状态的桌面与外部副作用边界需在 Linux 服务器演练后确认。

原生驱动对工作区文件列举、读取、写入和导出请求会再次验证 Run lease、短期限和 fence；Provider 预检查通过不代表请求一定成功。桌面截图预览可以走只读路径，取消和 inspect 仍返回保守结果；未在目标 Linux 验证前，不得据此宣称已实现可信急停或完整账号隔离。

## 新任务门禁的部署要求（2026-11-03）

新 Task.executionState、Run.taskMandate 迁移为增量列。本地尚未执行迁移。生产启用前停止所有旧 Worker，再迁移和部署新版 API/Worker，最后开放新任务入口。旧 Worker 不识别授权门禁，不能依靠 schema 向后兼容允许其混跑新任务。

任务接口只操作显式创建的新任务；普通聊天仍保留上游行为。暂停和撤销写入控制意图，受门禁保护的后续动作会被拒绝；runtime 期间轮询触发尽力中断，但并非即时。`quiesced=false` 表示没有证据确认工作静止；当前停止确认接口拒绝成功，暂停后无法通过该入口恢复或核对副作用。不要手动重放未知的外部副作用。主执行预算显示预留值，实际用量与费用仍以原用量记录为准；缺失值为未知。

状态：规划与填写框架，尚未部署服务器；本文件当前不提供已验证的生产安装或启动命令。

关联需求：PA-009、PA-010、PA-013 至 PA-017。技术方向见 [ADR-0008](../docs/adr/0008-separate-control-and-desktop-hosts.md)。

## 1. 目标部署形态

后台 Linux 服务器原生运行 Web、API、Worker、Pi 和 PostgreSQL；独立云电脑运行浏览器、桌面和驱动，不以 Docker 电脑为首版运行方式。跨机通信及两机的账号、服务名、路径和端口将在 P4 定义并实测。

后台与桌面使用不同运行账号。Agent 默认不持有后台密钥、数据库文件、后台服务管理权限或任一服务器 root 权限；主机分离不代替认证和网络隔离。

当前本机只保留源码、依赖和文档，不自动重启已停止的 Docker 或恢复服务；不通过绕过上游生产保护完成原生接入。

## 2. 资产与配置登记

| 项目 | 当前状态 | 形成实测记录的阶段 |
| --- | --- | --- |
| 服务器、系统版本、资源和地区 | 已登录用户指定的新测试服务器，确认 Ubuntu 24.04、2 核和约 3.6 GiB 内存；项目尚未部署 | P1、P4 |
| 部署代码版本与制品 | 固定底座已记录；Sydney 运行制品未生成 | P3、P4 |
| Node.js、包管理器、PostgreSQL 与系统依赖 | 服务器版本及安装流程待验证 | P4 |
| 后台、Worker、桌面驱动运行账号 | 测试桌面账号已创建；后台及数据库运行账号和隔离验权尚未完成 | P1、P4 |
| systemd 服务名与启动顺序 | 已有设计候选，尚未实现或验证，不提供启动命令 | P4 |
| 数据、文件、浏览器配置与日志目录 | 设计候选见原生 Linux 文档，尚未创建和验权 | P1、P4 |
| 模型、App 和系统密钥配置方式 | 待确定；文档只写字段与来源，不写真实值 | P1、P5 |
| 域名、TLS、反向代理与认证 | 待确定 | P4、P5 |
| 代理、包源和模型出站网络 | 按服务器实际网络验证 | P4、P5 |
| 文件、数据库、密钥备份与恢复 | 待定义保留期、存储位置及演练 | P6 |

## 3. 后续必须补齐的操作说明

每一项先写前提、权限、影响范围和回退方式，再附已验证的命令与结果；不从开发脚本猜测生产操作。

| 运维场景 | 必须记录的内容 |
| --- | --- |
| 首次安装 | 系统前提、依赖来源、固定版本、用户与目录权限、配置生成、数据库初始化 |
| 启动与停止 | 实际服务、依赖顺序、健康检查、超时、停止对当前任务的影响 |
| 桌面接管 | 如何观看、接管、交还，命令残留与敏感输入如何处理 |
| 升级 | 旧版本、目标版本、迁移兼容性、维护窗口与成功检查 |
| 回滚 | 制品与数据库兼容条件，禁止在无法兼容时仅替换程序 |
| 备份 | 数据库、产物、浏览器配置与密钥各自的范围，保留期和访问权限 |
| 恢复 | 在隔离环境恢复并验证任务、文件和授权；未知副作用不自动重放 |
| 凭据轮换 | 受影响服务、旧数据解密依赖、撤销流程与复验 |
| 资源与费用 | CPU、内存、磁盘、进程、任务时限、模型用量与费用未知的处理 |
| 故障排查 | 模型失败、数据库不可达、桌面离线、任务卡住、磁盘满和代理异常 |
| 数据删除 | 记忆、对话、执行记录、文件及备份各自的删除范围 |

## 4. 当前可确认的限制

- 完整服务、原生桌面驱动和真实任务尚未验收。
- 尚无可用生产回滚或恢复演练结果。
- 原有 Docker 试点记录保留作历史，不作为本目标部署的安装指南。
- 后台机的实际连接与授权范围尚未确认，不扫描本地私人 SSH 凭据或自动连接推测的服务器。
- 独立主机不会自动提供可信的远端停止保证；停止 Agent 输入、取消任务与停止服务器是不同能力，按实际实现展示。

## 5. 本轮策略开发的运维影响

P1 设计细节见 [原生 Linux 方案](design/NATIVE_LINUX_DESIGN.md)：候选系统、账号、路径、端口、签名协议、服务和备份流程全部待 P4 授权服务器验证。当前不据此执行安装、开端口、创建账号或签发凭据。

P2 在应用核心包新增纯派工和授权判定，未增加配置项、依赖、数据库列或生产服务，暂不影响现有运行行为。没有部署制品，因此不执行生产升级或回滚。`maxRuns` 是策略输入，不是已支持的环境变量，也不等于 token 上限。

实际集成前必须检查：历史读取与派工在同一事务中、授权从可信存储获取且执行前复核、取消/接管及旧 fence 被阻断、未知副作用不会自动重放。现有应用尚未调用新策略，不能依靠它保护生产工具。

本机验证选择已安装 Node.js 24.15.0，只运行指定核心文件的 Vitest 单 worker、核心包类型检查及指定文件的 Biome；不启动 Docker、PostgreSQL、桌面或真实模型。具体执行与失败记录以 [验证记录](VALIDATION.md) 为准。

## 6. 状态投影与只读历史适配

新增 `readTaskExecutionHistory` 仅在现有匹配的 tenant 上下文中读取数据，拒绝无上下文、其他租户或 system 上下文；不能为了调用方便关闭 RLS 或增加系统绕过。它通过 RepeatableRead 单事务读取元数据，当前尚无真实 PostgreSQL 验证或 API 入口接线。

默认每次最多返回 100 个 Run、1,000 个 Attempt、1,000 个普通 Effect；任一超限即标记历史不完整。通过函数参数可以在 1 至 10,000 范围调整每类数量，没有新增环境变量。后续运维遇到 history incomplete 时，应按授权分页/补读取方案修复，不能直接改标志为完整或据可见片段执行重试。当前尚未实现分页入口。

数据库异常直接返回错误路径，不用空历史掩盖故障。查询不选择提示词、错误详情、checkpoint 或工具原文，仍需按现有日志和租户策略保护元数据。

界面后续接线时必须保留 cancelling/pausing/interrupted 与原因。数据库 Run.cancelled、租约过期和收到取消请求均不等于进程已清理；只有可信停止确认才能显示完成取消。Run.completed 仍需独立完成证据才能显示任务成功。不要通过修改 Task.status 或 completionEvidence 布尔值来手工“修好”任务。

本轮没有 schema、迁移、服务、依赖或部署配置变化；未部署、无需执行生产回滚。代码只读模块的升级/启用仍需后续发布验证，不能宣称已有线上状态投影。

## 7. 恢复演练清单（待服务器验证）

恢复执行补记（2026-11-03）：`native-linux` Provider 已注册进 sandbox 工厂，`/app/tasks` 任务路由已挂载。运维侧配置仍遵循本清单；启用时需设置 `SANDBOX_PROVIDER=native-linux` 和 `SYDNEY_NATIVE_DRIVER_SOCKET`，部署匹配的 Linux 驱动及 systemd 单元，并先在目标机完成隔离验证。部署顺序仍为：停旧 Worker → 执行迁移 → 启动新版 API/Worker → 启用新任务。

以下清单是 P6 执行要求，当前没有任何一项在目标服务器验证。每项先在隔离或维护环境演练，记录实际命令、结果和偏差后，才能写入生产操作说明。

| 场景 | 演练要求 | 禁止的误判 |
| --- | --- | --- |
| 控制面断线 | 断开 API/Worker 与数据库、驱动或浏览器的连接；确认活动任务进入保守状态，恢复后按租约和版本继续或标为未知 | 不能把 UI 恢复当成子进程已停止 |
| Worker/API 重启 | 重启服务后确认旧 Run 租约、fence、授权到期和控制意图仍被校验 | 不能重放 requestId 或未决外部副作用 |
| 桌面/驱动重启 | 重启显示、驱动或浏览器会话，确认新代次拒绝旧请求，旧截图和输入队列不跨代复用 | 不能把新桌面画面当作旧任务已恢复 |
| 取消请求 | 取消活动 Run 后核对进程、文件和外部请求；无法确认时必须保留 unknown/residual | 不能用“已发送取消”当作“已停止” |
| 撤销授权 | 撤销后尝试旧工具、旧 URL 和旧桌面动作，确认全部拒绝；续期仅影响显式新授权 | 不能通过旧聊天上下文重新获得权限 |
| 重复 nonce | 重放 create/dispatch 请求；相同载荷返回原记录，不同载荷冲突 | 不能把幂等回执当成新执行 |
| 结果未知 | 对超时的外部副作用先核对后 reconcile；未核对不得标记成功 | 不能自动重试不可幂等请求 |
| 数据库备份恢复 | 备份后在新隔离环境恢复，核对任务、Run、Attempt、授权、产物和用量记录 | 不能把 dump 成功当成业务恢复成功 |
| 文件与配置恢复 | 恢复 workspace、浏览器 profile 和后台配置；分别核对权限与可用性 | 不能恢复桌面不可读取的后台密钥到桌面环境 |
| 升级回滚 | 按“停旧 Worker、迁移、新 API/Worker”顺序演练；验证旧制品不兼容新门禁时只能回滚到兼容迁移 | 不能混跑旧 Worker 和新任务 |

演练前必须准备：隔离恢复环境、加密备份、受限数据库账号、桌面与后台账号、模型替身或明确同意的真实模型、已知外部测试目标。每轮演练后清理测试授权与外部资源。
