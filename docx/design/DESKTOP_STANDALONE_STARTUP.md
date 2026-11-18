# Sydney 桌面独立启动链设计

更新日期为 2026-11-18。关联需求为 PA-018、PA-023。

> 2026-11-18 Batch 1 进展：`StandaloneRendererProxy` 已支持显式固定端口 `port`、默认 `120_000ms` 响应头超时、本地 `/sw.js` 拒绝及独立窄令牌 `screenCapability`；`installProxyCapability` 已按 `frame.origin`、`mainFrame` 与 `webContents` 严格 Fail-Closed 门禁完成首次/恢复顶层导航、受控子文档首跳、同源 `<a download>` 下载、noVNC/Wuying（含嵌套 `container.html`）窄能力注入及 `/html-viewer.html` 零令牌隔离，在真实 Electron 45 对接强制 `403` 代理 13/13 项验证通过（覆盖 H-03、H-04、H-05 的合成代理与 Electron 层门槛）。`main.ts` 正式窗口接线（须同时解决 `userDevices` 配对 HTTP 与监控 `session.fetch` 因 `127.0.0.1` Cookie 无法直发远端产生的 401/403 问题）及真实后台/SDK 验收仍属后续批次。

## 1. 范围、交付与验收

本文提出桌面安装包加载内置界面、通过独立回环代理访问所选后台的接入设计，供网页退役主任务集成审查。交付范围为本文件。启动接线、配置格式扩展、迁移读取器及实验均列为后续实现工作。

依赖现有 `DesktopSetup` 校验、内置资源打包、后台健康接口、独立代理和能力令牌注入候选。进入正式接线前须取得第 8 节实验的实际结果。桌面侧验收要求在网页应用服务不可达的隔离环境中，完成启动、登录、重启、切服、屏幕连接、迁移和失败恢复，并能证明界面资源来自安装包。

本文根据当前工作区源码编写。既有实验结论引用迁移文档与验证记录，本次实际执行的是静态阅读与文档检查。

## 2. 当前入口与接线缺口

| 源码位置 | 实际行为 | 接入所需调整 |
| --- | --- | --- |
| `main.ts` 的 `startDesktop` | `resolveStartupTarget` 选择启动地址，已保存的远程后台先经 `probeServer` 检查 | 归一化所有正式独立模式入口，包含设置、重启恢复和显式后台配置 |
| `main.ts` 的 `probeServer` | 向 `/rpc/health` POST，使用 8 秒超时、手动重定向、小响应读取及 `isRakazoHealth` 校验 | 复用协议校验，参数与请求头绑定本次尝试的设置快照 |
| `main.ts` 的 `openAppOnce` | 选择 session、配置请求头、探测远程文档、安装受管资源覆盖、创建窗口 | 独立模式进入本地代理启动流程，健康门槛使用后台接口 |
| `main.ts` 的 `installBundledRenderer` | 只对打包受管回环模式注册 session 协议处理器，资源未命中会转发 | 独立模式由代理提供包内资源，明确处理旧注册与失败清理 |
| `main.ts` 的 `createWindow` | 构造后立即设置 `mainWindow`、绑定目标并调用 `loadAppUrl` | 拆开构造、身份绑定和导航三个阶段，在首次请求前完成授权 |
| `main.ts` 的 `resolveSessionForTarget` | 旧来源存在 Cookie 或站点数据时可能沿用 `defaultSession`，并写入兼容标记 | 独立模式使用独立分区，旧 session 留作迁移来源和升级恢复 |
| `standalone-renderer-proxy.ts` | 监听 `127.0.0.1` 的动态端口，固定后台和配置头快照，默认校验能力令牌 | 补充稳定监听地址、窗口生命周期和正式入口接线 |
| `proxy-request-capability.ts` | 在 `onBeforeSendHeaders` 中校验窗口 ID、frame URL 和目标来源后写入令牌 | 核实首次导航、沙箱 frame、worker、WebSocket 和重定向的真实请求归属 |
| `setup-config.ts` | 已提供 `standaloneSessionPartitionForServerUrl`，按后台 origin 派生独立持久分区 | 正式启动尚使用旧 `sessionPartitionForServerUrl` 及兼容分支 |

代理本地页面与静态资源通过 `rendererRoot` 读取。转发范围为 `/api`、`/rpc`、`/novnc`、`/wuying`、`/.well-known`。WebSocket 支持声明为 `screen-only`，实际升级由 `StandaloneScreenSocket` 限定到 noVNC 能力路径。需要其他 WebSocket 的功能须单独核对支持情况。

代理对上游请求移除回环能力头，按固定远端重写已有 Origin、Referer，使用手动重定向。普通响应的 Cookie 会去掉 Domain，保留 Secure 等属性。屏幕响应过滤 Cookie 并追加沙箱策略。这些行为决定后续登录和屏幕实验的输入条件。

来源为 [桌面主入口](../../apps/desktop/src/main.ts)、[代理候选](../../apps/desktop/src/standalone-renderer-proxy.ts)、[屏幕升级处理](../../apps/desktop/src/standalone-screen-socket.ts)、[注入候选](../../apps/desktop/src/proxy-request-capability.ts)及[设置契约实现](../../apps/desktop/src/setup-config.ts)。

## 3. 稳定来源与代理生命周期

### 3.1 推荐的来源策略

建议先实现每个后台固定回环端口的方案。后台 origin 经 `normalizeServerUrl`、`parseSetupInput` 校验后，绑定一个持久分区和一个持久本地 origin。固定使用 `http://127.0.0.1:<已登记端口>`，端口属于本地界面元数据，后台地址单独保存。

每次 `listen(0)` 返回不同端口时，浏览器 origin 就会变化。相同分区下的 localStorage 和 IndexedDB 仍按 origin 分开，Cookie 又可能跨同主机端口共享。继续使用现有动态端口时，必须将每次启动视作来源迁移，无法仅靠分区名称维持全部数据可见性。

固定端口方案消除后续启动的端口变化。当前 `StandaloneRendererProxyOptions` 尚无监听端口选项，`start()` 也只调用 `listen(0, "127.0.0.1")`，实施时须补充精确绑定能力。

建议新增带版本的本地来源登记文件，放在 `app.getPath("userData")` 下，拟名 `standalone-origins.json`。记录规范化后台 origin、分区名和本地端口，通过 `setup-store.ts` 的私有原子写入模式持久化。该文件格式属于设计提案。

1. 首次分配时，先由本实例实际绑定系统分配的空闲端口，保持监听，随后持久化映射，再允许窗口访问。
2. 已登记的后台重启时，只绑定原端口。出现 `EADDRINUSE` 时进入本地恢复界面，显示端口占用原因及重试入口。
3. 映射读取失败或格式不合法时进入恢复流程，保留原文件供修复。重新分配端口必须走显式的数据迁移与确认流程。
4. 保存新来源映射失败时，销毁候选窗口并停止候选代理。已保存但首次启动失败的映射保留为待重试，原已提交后台设置继续生效。
5. 运行前取得现有 `app.requestSingleInstanceLock()`。同用户不同 profile 的并发实例仍须通过实际监听结果处理冲突。

固定端口被其他进程占用时，任何携带 Cookie、Authorization 或能力令牌的请求都必须先被客户端门禁取消。读取到映射只表示有历史地址，允许导航还需要当前实例持有活跃监听器和对应代次。监听器丢失时先撤销窗口网络授权，再关闭页面及连接。端口占用、监听失效和端口再利用的竞态列为待验证假设 H-02。

现有自定义稳定 scheme 实验已经记录外部 frame/worker 请求绕过归属检查的问题。若固定端口实验无法满足验收，替代方案须重新评审调用者边界，引用该实验时保留其失败证据。相关记录见[客户端迁移方案](CLIENT_ONLY_MIGRATION.md)。

### 3.2 生命周期与实例归属

建议以启动尝试为单位保存一个主进程上下文，包含设置快照、后台 origin、本地 origin、partition、代理实例、窗口 ID、不可复用代次及阶段。本文将其简称为启动上下文。闭包读取该上下文，避免从不断变化的 `currentSetup`、`mainWindow` 推导旧请求应使用的凭据。

- 同一后台的一次运行保留同一代理。macOS 隐藏窗口期间代理继续服务，窗口销毁后可保留监听至应用退出，使再次打开复用来源。
- 不同后台准备候选窗口时，各自拥有代理、端口、分区和令牌。旧上下文在候选提交前保持可恢复。
- 同一后台修改自定义头时，固定端口和同一分区使两个配置代次无法直接并存。先暂停旧窗口请求，关闭旧连接并停止旧代理，再在原端口启动新快照。失败时以原快照重建代理、生成新令牌并重新绑定旧窗口。
- 同一后台的重复打开优先复用已有上下文。修改设置的替换过程串行执行，旧请求在代次撤销后拒绝。
- 每个新代理实例生成新令牌。当前实例在 `stop()` 后重新 `start()` 会保留构造时令牌，需要轮换时创建新实例。
- 退出或永久销毁上下文时，先撤销注入授权并停止新请求，再销毁窗口、调用 `stop()` 中止 HTTP 与屏幕连接，最后解除仅属于该上下文的监听引用。退出等待须有上限，并用隔离实验验证关闭期间的行为。

## 4. 能力令牌注入与窗口构造

### 4.1 顺序与监听所有权

在 `app.whenReady()` 后选定独立 partition，通过 `session.fromPartition(partition)` 取得 session。先启动并确认代理监听，再安装 session 请求门禁，随后构造尚未导航的隐藏 `BrowserWindow`，登记 `webContents.id`，最后调用 `loadURL(localOrigin)`。

`installProxyCapability` 接受 session 和三个读取函数，分别为 `proxyOrigin`、`token`、`appContentsId`。可以在窗口创建前注册，先让读取函数返回无授权状态，待窗口 ID 登记后启用。但现有 `createWindow` 会在返回前导航，接入时必须拆开这一步。

Electron 每个 session 的同类 webRequest 事件使用单一监听入口，接入时统一管理 `onBeforeSendHeaders`。当前 `configureHeaderSession` 会先执行 `onBeforeSendHeaders(null)`，随后可能注册 `installServerHeaders`。直接与能力候选分别注册会产生覆盖或清除风险。

独立 session 由一个请求处理入口完成能力头剥离、目的地及调用者校验、上下文代次检查和必要的取消。代理出站继续持有自定义服务头快照。旧远程模式的服务头处理归属于其旧 session。`onCompleted` 也需统一所有权，现有 `loadAppUrl` 的注册与 `onCompleted(null)` 清理不能干扰同 session 的其他待加载窗口。

来源为[现有服务头注入](../../apps/desktop/src/server-request-headers.ts)、[注入候选测试](../../apps/desktop/src/proxy-request-capability.test.ts)及[Electron 本地类型声明](../../apps/desktop/node_modules/electron/electron.d.ts)。依赖声明路径仅在已安装依赖的工作区可用。

### 4.2 首次导航的授权缺口

当前候选要求 `details.frame.url` 与代理同源。首次从空白窗口加载本地页面时，该值可能为空或 `about:blank`，当前代码会剥离能力头，而代理连根页面也校验令牌。仅按推荐顺序注册仍需解决这一启动条件。

建议为主进程主动发起的首次 GET 导航建立一次性授权记录，绑定窗口 ID、主 frame、完整目标 URL、上下文代次和有效期限。仅当真实 Electron 实验能可靠确认这些字段时，允许该导航注入令牌。导航取消、失败、重定向、窗口销毁或代次撤销时消费或撤销记录。后续页面导航按受信主页面规则重新判定。头部注入应覆盖重定向后的每一跳，并在跨源跳转前移除令牌及取消非预期主框架导航。

主进程的内部探测直接使用受限请求路径，读取内存令牌并限定当前代理 origin。`Session.fetch` 或 `net.fetch` 请求可能缺失窗口及 frame 身份，当前候选会拒绝这些请求，内部探测也须独立验证实际门禁行为。

### 4.3 frame、worker 与屏幕通道

普通业务请求要求来自登记窗口的受信主 frame，并限定当前代理来源与活跃代次。同一窗口中的外部 iframe 可以共享 `webContentsId`，因此窗口 ID 只提供部分归属信息。

屏幕通道需要更窄的授权分支。当前 noVNC 响应附加 `sandbox allow-scripts allow-pointer-lock`，升级处理要求请求 Origin 为 `null`。不透明 frame 的 URL 字符串即使显示本地地址，也无法单独证明该 frame 拥有普通应用权限。

接入设计要求主进程明确登记受信页面创建的屏幕 frame，将授权绑定到该 frame、当前代次、完整画面能力路径和资源类型。只为其允许的屏幕资源与 WebSocket 注入回环令牌，普通 `/api`、`/rpc` 请求继续拒绝。Wuying 的不透明资源另按现有路径清单验证。该分支尚未实现，frame 归属在导航或进程变化时是否可可靠追踪列为 H-04。

缺少归属证据的 dedicated worker、shared worker、Service Worker 及外部 frame 请求按拒绝处理。若真实业务依赖这些请求，需要补充有边界的授权或传输设计，并重做失败与越权实验。令牌保持在主进程内存与本地请求头中，设置文件、页面脚本、URL 和诊断日志只保存无凭据的状态描述。

## 5. 多后台 session、登录与桌面桥

### 5.1 持久分区

不同 `DesktopSetup.serverUrl` 的规范化 origin 必须使用独立的 `session.fromPartition`。复用 `standaloneSessionPartitionForServerUrl` 的 `persist:sydney-standalone-<摘要>` 命名，采用与旧远程模式分开的命名空间。

同一规范化 origin 的不同路径输入最终选择同一后台。协议、主机或端口不同则视为不同后台。域名和 IP 即使指向相同机器，也需显式核实身份及迁移条件后处理数据关联。摘要只用于本地分区索引。

Cookie 由分区隔离后台，localStorage 和 IndexedDB 还需要第 3 节的稳定 origin。跨后台切换保留旧分区，新分区独立登录。OAuth 弹窗共享哪个 session 必须按认证流程验证。现有 `oauthPopupSessionPreferences` 共享父分区且关闭 preload，但能力候选只允许主窗口，弹窗访问回环认证路径时会遭拒绝。接入前须设计限定回调授权与窗口身份，覆盖状态绑定、关闭和失败处理。

来源为[设置与分区函数](../../apps/desktop/src/setup-config.ts)、[OAuth 弹窗策略](../../apps/desktop/src/window-open.ts)、[浏览器认证传输](../../apps/desktop/src/browser-auth.ts)及[会话隔离实验源码](../../apps/desktop/e2e/standalone-session-isolation.spec.ts)。实验源码存在与实验当前通过属于不同证据，本次未执行该实验。

### 5.2 区分界面来源和后台身份

主进程应分别保存本地界面 URL 与远端后台 origin。当前 `appWindowTargets`、`permissionTarget`、`remoteServerOrigin`、`activateDesktopMonitoring`、用户设备选择及本机访问同步存在共用目标 URL 的调用点，接线时逐项按职责绑定。

| 用途 | 绑定对象 |
| --- | --- |
| `fromAppFrame`、导航限制、桌面 IPC、音频及剪贴板权限 | 当前已提交窗口、主 frame、本地 origin 与活跃代次 |
| 设备注册、用户设备连接、电脑授权说明 | 设置快照中的后台 origin 及已验证后台身份 |
| RPC、认证和画面请求 | 当前代理到固定后台的路径策略 |
| 监控配置和登录身份读取 | 明确选择本地代理会话或受限后台客户端，验证其实际携带的认证资料 |
| OAuth 浏览器回跳及外部链接 | 对应认证流程的后台回调、state 和窗口身份 |

`fromAppFrame` 当前按目标 URL 的 origin 校验主 frame。迁移后其目标应是本地界面来源。`remoteServerOrigin` 当前从窗口目标推导后台，直接把目标替换成回环 URL 会把设备接入目标也改成本机代理。监控当前使用 `targetSession.fetch`，需要单独解决请求归属和 Cookie 所属来源。

本地登录继续沿用既有认证协议，但必须核对 Cookie 的 Secure、HttpOnly、SameSite、前缀、有效期及删除行为。代理保留 Secure 仅提供源码证据。真实 Electron 是否接受 loopback HTTP 上的这些 Cookie、登录后重启是否持续有效，以及 OAuth、CSRF、Passkey 的来源要求均须实验验收。来源为[主 frame 校验](../../apps/desktop/src/app-frame.ts)、[权限处理](../../apps/desktop/src/session-permissions.ts)和[网页认证客户端](../../apps/web/src/lib/auth.ts)。

## 6. 旧来源数据迁移

### 6.1 可迁移性与默认策略

| 数据 | 当前实际来源与存储 | 建议迁移方式及边界 |
| --- | --- | --- |
| 登录 Cookie | 旧后台 origin 所在的旧 partition 或 `defaultSession` | 独立模式首次重新登录。Electron `cookies.get/set` 能操作 Cookie，但复制到本地 host 会改变其作用域与安全语义，需要额外评审与实测后才可提供可选迁移 |
| localStorage 偏好 | 旧 origin 的字符串键值，已有侧栏密度等设置 | 精确白名单、逐键解析、版本校验后复制到新 origin，保留原值 |
| 未发送草稿与 mention 绑定 | `rakazo.composerDraft.*`、`rakazo.composerBindings.*` | 一并迁移原文和经过校验的绑定，登录后核对后台、账号、Space 和 thread 归属，再恢复到对应输入框 |
| 头像 IndexedDB | `sydney-avatar-library` 数据库的 `avatars` store | 按现有 schema 导出与导入，校验记录、大小及重复 ID，保留用户素材 |
| 聊天外观 IndexedDB | `sydney-chat-appearance` 数据库的 `settings` store，内容含 Blob | 按 schema 迁移结构和二进制素材，校验实际可读性及背景引用，避免用普通 JSON 丢失 Blob |
| sessionStorage、运行中请求、内存附件 | 旧窗口生命周期 | 切换前完成或显式处理未保存工作。现有草稿模块已区分发送中任务和仅存内存的附件 |
| Service Worker、Cache Storage、HTTP 缓存 | 旧 profile 的来源与缓存状态 | 新分区从受控内置资源建立，旧缓存按旧版本恢复需求保留 |

当前源文件未定义通用 localStorage/IndexedDB 迁移 API。Electron Cookie API也无法替代 DOM 存储读取。直接复制 Chromium 的数据库目录、修改其内部 origin 键或仅复制认证 Cookie，都无法覆盖上述迁移要求。

数据定义见[草稿实现](../../apps/web/src/lib/composer-draft.ts)、[头像库](../../apps/web/src/lib/avatar-library.ts)、[聊天外观](../../apps/web/src/lib/chat-appearance.ts)及[侧栏密度设置](../../apps/web/src/lib/bots-sidebar-density-pref.ts)。

### 6.2 读取来源与迁移事务

迁移前先确定旧数据位于默认 session、旧按后台分区，还是曾用动态端口的实验分区。仅查找本应用管理的 profile。外部浏览器的数据属于单独的用户导出流程。

`defaultSessionHasOriginData` 当前会加载远程 origin 执行存储探测，仍依赖远程页面可用。独立启动不将其作为必经步骤。迁移读取器的建议实现是在专门迁移阶段，让旧 session 处于独占、静止状态，以包内最小文档运行在精确旧 origin 下，读取已允许的存储 schema。需要实验验证 session 协议处理器、离线资源响应、旧 Service Worker、出站阻断及处理器恢复。读取器只服务本地迁移资源，外部网络请求由单独门禁拒绝。实验通过前可使用旧客户端导出、在新客户端导入的人工恢复路径。

如果仍有旧窗口、popup 或 worker 使用同一 session，则先保存未完成工作并进入独占迁移阶段。避免在活跃旧 session 上临时替换协议处理器。读取结束时恢复原处理器所有权，再恢复旧窗口。此模块的可行性列为 H-09。

迁移按下列步骤留存无内容的状态记录。

1. 记录源和目标后台、partition、origin、迁移版本及状态，核实账号归属。来源未知的草稿和账号相关资料暂存，等待归属确认。
2. 在受控阶段读取白名单数据，保持源数据完整。导出数据留在用户本地受限路径或内存，凭据、草稿正文和图片内容与日志分开。
3. 新目标完成登录并核对账号后，导入偏好、草稿及素材。目标已有数据时保留新值，将冲突项单独列出供恢复。
4. 每个存储域分别写入、回读并记录检查点。localStorage 与多个 IndexedDB 数据库没有统一事务，需要可重复执行的检查点和幂等导入。
5. 用迁移标记跟踪本次创建的项。失败恢复只撤销本次导入且未被后续修改的项，保留目标已有数据与新编辑内容。
6. 冷启动后再次核对草稿、mention 绑定、头像和背景素材，最后提交完成标记。默认保留旧 profile 与源数据。

读取失败、配额不足、结构损坏、程序退出、目标登录账号不同及冲突无法处理时，迁移状态保持待恢复。用户可在新客户端重新登录并使用已准备好的独立界面，旧资料继续保留待导入。需要回到旧版本时，以旧设置和旧 profile 恢复原入口，并在测试中核对旧服务可用性和会话状态。网页服务退役后，恢复路径须具备可用的旧服务恢复方案或离线导出能力。

## 7. 启动顺序、提交和回滚

### 7.1 正常启动与切换

1. 取得单实例锁，读取并校验设置和来源映射，创建本次尝试的不可变设置快照及代次。旧已提交上下文留在主进程中。
2. 向快照后台的 `/rpc/health` 执行 `probeServer` 等效探测，拒绝跨源重定向并解析预期响应。首次探测验证接口协议，后续登录再验证账号身份。
3. 校验包内 `rendererRoot`、`index.html` 和入口资源，按固定映射启动代理，确认本实例持有监听器。代理默认开启能力校验。
4. 选择独立 session，确认其请求监听与协议处理器所有权，安装能力及网络门禁。候选授权先为空，权限处理先拒绝候选特权请求。
5. 构造隐藏窗口，绑定窗口 ID、主 frame、本地来源、后台身份及代次，登记首次导航授权，然后加载本地 URL。配置窗口关闭、导航、崩溃和取消处理。
6. 通过正常窗口路径验证本地资源可读、代理健康请求返回预期内容、应用达到可用页面。沿用 `loadAppUrl` 和 `waitForMountedAppDocument` 的失败分类，并加强独立模式提交条件。现有 helper 会把部分纯测试页面判为 ready，产品验收还需正式应用标记及真实界面检查。
7. 未登录时允许显示本地登录页面，登录完成后验证当前账号、Space 和后台归属。登录页可用和已有登录恢复分别记录验收证据。`pending`、`failed` 或超时均保留待恢复状态。
8. 完成健康与可用性门槛后原子保存后台设置及启动模式记录，再切换主窗口、桌面桥权限、设备连接、监控和菜单的归属。保存失败执行恢复。提交后的派生服务初始化失败时按对应功能恢复，避免重新触发账号或副作用操作。
9. 候选成为已提交上下文后关闭旧窗口及旧代理。旧 partition 和迁移源数据保留。后续运行故障进入本地重连状态，使用同一已选后台恢复。

`main.ts` 已有 `pendingPreviousWindow`、`commitPendingAppSwitch`、`abandonPendingAppSwitch`、`watchRendererUntilCommitted` 和 `rollbackSetupFile`，可复用其保留旧窗口及保存后提交的意图。具体实现还须将代理、请求钩子和身份归属纳入事务。当前 `currentSetup` 在候选打开前已变更，旧上下文的回调必须改成读取原快照。

### 7.2 失败恢复矩阵

| 失败阶段 | 恢复要求 | 验证证据 |
| --- | --- | --- |
| 后台探测失败 | 显示设置错误，已有已提交上下文继续可恢复 | 请求未跨源，旧设置和凭据归属保持原后台 |
| 本地资源缺失、固定端口占用、映射持久化失败 | 释放候选资源，显示本地错误及重试 | 页面请求未到占用端口进程，原 profile 可读 |
| 注入注册失败、首次导航 403 | 撤销候选授权，销毁候选窗口并停止候选代理 | 旧窗口、旧钩子和旧连接可继续使用 |
| 页面加载失败、崩溃或健康超时 | 撤销代次并取消迟到响应，恢复旧已提交上下文 | 后台 A 到 B 失败再回 A 时，B 回调无法覆盖 A |
| 设置保存失败 | 恢复旧内存状态，必要时原子恢复旧设置文件 | 下次启动选择旧已提交后台，候选存储保留用于恢复 |
| 同后台配置替换失败 | 重建原配置代理、重新注入令牌并恢复原窗口 | 同端口恢复，旧连接关闭，新配置头未混入原请求 |
| 提交过程发生退出或断电 | 按持久化的已提交设置恢复，重新执行健康检查，迁移按检查点继续 | 强制结束后 profile、来源映射与设置仍可一致读取 |
| 提交后代理或后台断线 | 先撤销失效的窗口网络授权，展示本地重试状态，按已选上下文重建 | 端口再利用、重启和网络恢复时凭据未送错目标 |

冷启动没有旧窗口时先展示本地设置或恢复窗口，再销毁失败窗口。这样可沿用现有 Windows/Linux 最后一个窗口关闭会触发退出的处理经验。

升级回退需要同时恢复安装包、设置格式及旧启动模式。建议使用独立版本的来源映射元数据，让旧 `setup.json` 继续表达用户所选后台。应用模式的提交状态须由主进程持久化，候选窗口仅负责报告可用性。恢复旧包及旧服务的演练归于总迁移验收。

## 8. 待验证假设与实验门槛

下表全部条目均为“待验证假设”。使用锁定的 Electron 45.0.0、临时 profile、合成后台及测试凭据验证，随后在授权服务器与正式桌面包上验收。每项同时记录通过、失败与尚未覆盖的条件。

| 编号 | 待验证假设 | 实验与通过条件 |
| --- | --- | --- |
| H-01 | 固定 origin 和持久分区可覆盖正常与异常重启后的存储恢复 | 同 profile 跨进程重启及强制退出，回读草稿、IndexedDB Blob 和持久 Cookie，检查映射写入中断 |
| H-02 | 活跃监听器与发送前门禁可处理固定端口占用及再利用 | 无凭据占位服务抢占原端口，模拟监听丢失与快速再绑定，收集接收请求证明 Cookie、Authorization、能力头和服务头无误投 |
| H-03 | 首次导航、刷新和回跳能可靠绑定主窗口主 frame | 记录脱敏归属字段，首次 GET 可达且令牌仅送往本代理，伪造导航、跨源跳转和新窗口均被拒绝 |
| H-04 | 屏幕 opaque frame 能获得仅限画面路径的能力授权 | noVNC HTTP 资源及 WS 握手通过，屏幕 frame 请求 `/rpc` 或创建外部/blob worker 时无法借用权限，导航销毁后授权撤销 |
| H-05 | webRequest 实际覆盖业务所需请求类别与所有跳转 | 对 dedicated/shared/Service Worker、iframe、WS、主进程 fetch 分别测量调用链，核对缺失归属请求的拒绝与业务影响 |
| H-06 | 每 session 单一请求处理入口可安全管理多个上下文 | A/B 并存、同后台替换及失败清理后，旧窗口请求和监听仍归属正确，测试令牌不进入上游 |
| H-07 | 真实认证 Cookie 在回环 HTTP 上符合现有协议要求 | 真实登录、冷启动、登出、过期、Cookie 轮换及 Secure/HttpOnly/SameSite/前缀逐项核对，代理与后台日志脱敏 |
| H-08 | 认证回调和权限可同时适配本地界面与远端后台 | OAuth/SSO/MCP/模型登录、state、Passkey 条件、CSRF、监控、设备配对和桌面 IPC 分别验收，错误窗口/frame 无特权 |
| H-09 | 旧来源读取器可在独占阶段离线读取并完整恢复处理器 | 旧默认分区及旧命名分区、已有 Service Worker、网络失联、处理中断、处理器注册失败均实验，源数据可回读 |
| H-10 | 白名单迁移能保存草稿和二进制素材且可安全重试 | 空目标、有新数据目标、账号不匹配、损坏记录、配额不足和导入中断，回读确认源完整且目标新编辑保留 |
| H-11 | 启动提交和退出清理在竞态下能恢复一致状态 | 探测、监听、窗口 ready、设置落盘及提交前后注入失败或崩溃，检查迟到回调、旧上下文恢复和连接关闭 |
| H-12 | 正式桌面包在网页服务不可达时保留所有所需入口 | 隔离环境禁用 Web 上游，完成登录、聊天、流、上传、项目、noVNC/Wuying 及重启，结合资源来源检查与回滚演练验收 |

现有本地类型声明提供 `Session.fromPartition`、`Session.webRequest.onBeforeSendHeaders`、`Session.protocol.handle/unhandle` 及 `OnBeforeSendHeadersListenerDetails`。类型中的 `frame` 和 `webContentsId` 可缺失，`resourceType` 包含 `mainFrame` 与 `webSocket`。这些类型定义支持设计接口引用，运行时覆盖情况由上述实验判定。

## 9. 本次实际查阅与交付状态

### 实际读过的源码

- `apps/desktop/src/main.ts`，启动、会话选择、窗口导航、资源覆盖、请求头、监控、切服保存和退出相关段落。
- `apps/desktop/src/standalone-renderer-proxy.ts`，设置校验、监听、能力校验、本地资源和转发处理。
- `apps/desktop/src/standalone-screen-socket.ts`，构造、入站校验、上游升级与连接清理相关段落。
- `apps/desktop/src/proxy-request-capability.ts` 及 `apps/desktop/src/proxy-request-capability.test.ts`。
- `apps/desktop/src/setup-config.ts` 及 `apps/desktop/src/setup-store.ts`。
- `apps/desktop/src/server-request-headers.ts`、`apps/desktop/src/app-frame.ts`、`apps/desktop/src/session-permissions.ts`。
- `apps/desktop/src/window-open.ts`、`apps/desktop/src/browser-auth.ts`、`apps/desktop/src/app-document-state.ts`。
- `apps/desktop/src/renderer-assets.ts` 及 `apps/desktop/src/preload.cjs` 的桥接口相关段落。
- `apps/desktop/e2e/standalone-session-isolation.spec.ts`。
- `apps/desktop/e2e/stable-origin-lab.spec.ts` 的实验搭建相关段落及 `apps/desktop/e2e/fixtures/stable-origin-main.cjs`。
- `apps/web/src/lib/auth.ts`、`apps/web/src/lib/composer-draft.ts`、`apps/web/src/lib/avatar-library.ts` 的存储相关段落。
- `apps/web/src/lib/chat-appearance.ts` 的类型与数据库定义相关段落，以及 `apps/web/src/lib/bots-sidebar-density-pref.ts` 的存储键相关行。
- `apps/desktop/node_modules/electron/electron.d.ts` 中 Session、WebPreferences 和 webRequest 类型相关段落。

另查阅 `apps/desktop/package.json`、仓库 README、需求、开发规范、文档入口、总计划、既有验证记录及 `CLIENT_ONLY_MIGRATION.md`。既有验证记录提供历史背景，本文列出的后续实验仍需实际执行。

本次交付为启动链设计文档。选择固定端口方案和新模式首次重新登录属于本文建议的实现决策，待主任务评审并通过相关实验后接线。H-01 至 H-12 保持待验证，网页退役的最终状态由总任务按真实客户端与服务器证据验收。
