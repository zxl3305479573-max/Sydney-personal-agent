# P1 同机原生 Linux 桌面接入与运维接口设计

> 2026-11-03 实施更新：应用仓库已有初版 `native-linux` Provider、Unix 套接字驱动与 systemd 草案。它使用系统对端 UID 检查而非本设计早期提出的签名消息；尚无屏幕流或人工接管，后台静止返回 unknown。此实现尚未在 Linux 测试，后文的验收清单仍全部适用，不能把初版称为生产就绪。

日期：2026-11-03。状态：P1 设计提议，未实现、未部署、未通过服务器验收；不改变总计划的阶段状态。

关联需求：PA-004、PA-006、PA-009 至 PA-017；PC 观看与接管另关联 PA-018。以 [总计划](../PLAN.md) 和 [ADR-0004](../../docs/adr/0004-native-server-and-task-orchestration.md) 的同机方向为准，早期文档中的分机、Docker 和客体管理员权限不能直接套用。

## 1. 范围、交付物和验收边界

- 本次仅交付接口、源码映射、安全限制和 P4 验收清单；后台、数据库、桌面及浏览器规划在同一台专属 Linux 服务器原生运行。
- 复用 Rakazo 的 `SandboxProvider` 和图形辅助逻辑，在适配层新增原生驱动；不新增第二套任务调度器，不绕过现有 `desktop` 生产检查。
- 依赖 P2/P3 提供可信任务授权、Run 身份、取消状态及持久化租约；依赖运维人员提供服务器、系统账号、依赖安装及网络规则。
- 设计可评审的条件是权限、动作、取消、生命周期及未知结果均有明确语义；实际可用的条件是第 10 节逐项真实验收。缺少服务器与视觉模型时，不能宣布图形闭环或 PA-015 已满足。
- 本次按独立写集仅维护本文件。计划、开发记录、验证记录、运维手册和正式 ADR 留给主 Agent 汇总；本文件不替代这些文档的同步。

## 2. 已核对的源码证据

业务根目录：`D:/33054/Sydney-personal-agent`。Rakazo 基线提交为 `aebca9dcfd0cf734484ce41e3c5ad9521551659d`。下表路径均相对此根目录，行号为本次工作副本的静态阅读定位；后续变更须重新定位。存在代码不等于已经通过运行验证。

| 源文件及行号 | 符号或配置 | 已知行为与设计影响 |
| --- | --- | --- |
| `packages/adapters/src/desktop-sandbox.ts:62`；`packages/adapters/src/sandbox-factory.ts:169` | `assertHostCommandsAllowed`；`case "desktop"` | 仅 Electron、development、test 放行；工厂调用检查。必须原样保留，不改环境变量伪装开发运行。 |
| `packages/adapters/src/desktop-sandbox.ts:72` | `describeDesktopSandbox` | 声明 `graphical:false`、`takeover:false`；其 `pty:true`、`snapshots:true` 不能作为新 Provider 的实测能力。 |
| `packages/adapters/src/desktop-sandbox.ts:318`、`:330`、`:340`、`:432` | `connectScreen`、`sendInput`、`observe`、`snapshot` | 分别返回占位屏幕地址、执行占位动作、返回占位观察和生成快照编号；不是原生真实图形与磁盘快照。 |
| `packages/adapters/src/host-computer-server.ts:8`、`:19`、`:48`、`:92` | `startHostComputerServer` | 已有固定格式 Bearer、等时比较、拒绝 Origin、12 MiB 请求上限及 NDJSON；默认监听 `0.0.0.0`，不是安全的本机默认。 |
| `packages/adapters/src/host-computer-protocol.ts:5`、`:31`、`:32`、`:70` | 大小常量、`base`、`hostComputerRequest`、`HostComputerFrame` | 单文件 8 MiB；协议有可选 runId、命令/文件/屏幕动作及帧类型，但没有任务授权、会话代次和控制 fence 字段。 |
| `packages/adapters/src/host-computer-runner.ts:37`、`:43`、`:102`、`:154`、`:170`、`:204` | `createHostComputerRunner`、`dispatch`、`abortAll`、`begin` | 默认关闭；实例化本机 Desktop Provider，并允许 home 作为命令 cwd 根；有按 run 取消、并发槽和取消余量；上下文使用固定 local 身份，不能用于生产租户鉴权。 |
| `packages/adapters/src/host-computer-sandbox.ts:35`、`:94`、`:220` | `HostComputerSandbox.request`、`connectScreen` 等 | 已有认证请求、AbortSignal 和断线报错，不自动重试命令；`connectScreen/sendInput/observe/act` 明确不可用。不是可直接启用的图形 Provider。 |
| `packages/adapter-kit/src/interfaces.ts:99`、`:162`、`:178`、`:184`、`:234` | `SandboxProvider` | 已有按 run 取消、可选终端/屏幕控制、文件和停止接口；可复用接口边界，但不等于实现原生安全语义。 |
| `packages/adapter-kit/src/types.ts:10`、`:132`、`:242`、`:253` | `AdapterContext`、`ScreenRequest`、`ControlLeaseRef`、`SandboxCapabilities` | 有 runId、screenLeaseId、取消信号，lease 含 holder/fence；能力字段不足以表达管理员、整机启停及备份语义，需要显式补充契约。 |
| `packages/adapters/src/linux-desktop.ts:50`、`:95`、`:133`、`:157`、`:176` | `LinuxDesktopHost`、`LinuxDesktop` | 图形逻辑通过环境、命令执行、保护端口地址隔离；已有观看、终端、控制开关，可作为受审查复用点。 |
| `packages/adapters/src/linux-desktop.ts:207`、`:227`、`:291` | `observeLayout`、`act`、`releaseScreen` | 截图元信息固定 1280×800；动作分批执行；释放有暖屏和过期 fence 处理。原生版须核对实际尺寸，并在每步重查取消/控制权。 |
| `packages/adapters/src/linux-desktop.ts:467`、`:495`、`:506` | `PREPARE_LINUX_DESKTOP`、`INSTALL_LINUX_BROWSER`、`VERIFY_LINUX_DESKTOP` | 含 sudo/apt、浏览器下载、系统策略写入；验证脚本也会启动 Xvfb。原生 `prepare` 不得直接执行这些脚本。 |
| `packages/adapters/src/remote-desktop-sandbox.ts:130`、`:320`、`:345`、`:363` | `RemoteDesktopSandboxProvider` | 展示组合 LinuxDesktop 的方式，但环境面向远端沙箱、bindHost 为 `0.0.0.0`、prepare 自动安装；sendInput 未直接使用传入 lease。不能换个名字照搬为同机实现。 |
| `packages/core/src/node/desktop-runtime.ts:20`、`:56`、`:114` | `DesktopEnvironment`、`screenPorts`、`browserProfilePathForScreen` | 可配置工作区、profile、显示和网关监听；profile 按屏幕身份分开，可复用路径生成思路。 |
| `packages/core/src/node/desktop-runtime.ts:228`、`:543`、`:568` | 浏览器启动命令；`renderEnsureScreenCommand` | 启动浏览器带 `--no-sandbox`，Xvfb 带 `-ac`。同机不能无审查复用这两个安全假设。 |
| `packages/core/src/node/desktop-runtime.ts:764`、`:864` | `acceptLeaseCommand`、`desktopControlCommand` | 已有本地注册表及 fence 比较，但 lease 可缺省；新驱动须拒绝缺少 lease 的动作，并与控制侧持久化状态一致。 |
| `packages/adapters/src/desktop-sandbox.ts:137`、`:280`、`:897`；`packages/adapters/src/desktop-process-tree.ts:116` | `cancelRunWork`、`execute`、`streamLocalCommand`、`spawnOwnedCommand` | 记录 home/run 归属，Linux detached 进程组收到取消后 SIGKILL；不构成对 setsid、外部 D-Bus 启动或重启遗留进程的完整追踪。 |
| `packages/adapters/src/desktop-sandbox.ts:495`、`:602`、`:831` | `localWorkspaceTarget`、`openContainedWorkspaceFile`、`childPathViaDirFd` | 有路径包含校验、目录句柄及 O_NOFOLLOW 写入保护，可审查复用；不能据此承诺任意 shell 命令只能访问工作区。 |
| `packages/adapters/src/sandbox-command-environment.ts:28`、`:86` | `HOST_COMMAND_ENV`、`hostCommandEnvironment` | 继承环境有白名单，但含 SSH agent、代理、会话总线，并允许 request.env 覆盖；原生驱动需收紧，不能视为完整密钥隔离。 |
| `infra/systemd/rakazo-backup.service:3`；`infra/compose/backup-prod.sh:64`、`:165` | `Requires=docker.service`、Compose 备份 | 依赖 Docker 与容器数据挂载，不能宣称已有原生备份方案。 |
| `infra/systemd/rakazo-host-check.service:6`；`infra/compose/check-host.sh:6`、`:32`、`:56` | 主机检查 unit 与脚本 | 覆盖存储、备份、SSH，并可调用 Compose 健康检查；不能代替桌面/原生应用 readiness。 |
| `infra/systemd/rakazo-audit-ship.service:14`、`:23` | systemd 加固和 capability | 有服务加固参考，但含 `CAP_DAC_READ_SEARCH`；Agent 和驱动不得继承该 capability。 |

## 3. 最小接入方案：新 Provider 与受认证驱动

以下名称、消息、路径和服务均为待验提议，不是现有配置项或可执行部署说明。

```text
PC 浏览器 --HTTPS/WSS--> 已认证后台 API / 桌面代理（sydney-control）
Pi / Run --> 授权与资源租约 --> NativeLinuxSandboxProvider
                                  |
                     仅 127.0.0.1，签名 HTTP/NDJSON
                                  |
                         sydney-native-driver（sydney-desktop）
                                  |
                  专属 X11 / 浏览器 / 文件 / 命令与 PTY
PostgreSQL（postgres）仅向控制侧开放必要数据库身份
```

1. 新增 `NativeLinuxSandboxProvider`，建议内部类型标识 `native-linux`。它仅转换既有 `SandboxProvider` 操作、受保护观看地址及驱动消息；后台进程不直接 spawn Agent 命令。未来需正式审查 SandboxKind/工厂/能力声明接线，不冒充 `desktop`。
2. 驱动为单独 systemd 原生服务，以 `sydney-desktop` 普通用户运行；控制侧使用另一个 Unix 用户 `sydney-control`。可审查复用协议校验、NDJSON、AbortSignal、文件保护及 LinuxDesktop 算法，不直接启动旧 host runner，不构造其固定 local 上下文。
3. 首轮建议保留 HTTP/NDJSON，强制监听 `127.0.0.1` 固定配置端口，禁止公网或 `0.0.0.0`，拒绝浏览器 Origin、重定向和未知路由。回环地址只限制暴露面，不能作为身份认证。
4. 为避免在可执行任意命令的桌面账号中保存控制侧共享签发密钥，建议用 Node 内置 crypto 的 Ed25519 签署请求。私钥仅在控制侧受保护凭据目录，驱动只持有运维安装的公钥。签名覆盖协议版本、HTTP method/path、完整原始 body 的摘要以及消息内身份/时限；编码规范和实现需 P4 契约验证。不能仅凭能访问本机端口就信任请求。
5. 消息必须带 `requestId、computerId、sessionGeneration、ownerId、spaceId、botId、taskId、runId、mandateId、leaseId、holder、fence、issuedAt、expiresAt、action`。由后台服务构造并签名；模型和网页不能提供可信身份/授权。取消及接管指令使用独立、短时有效的控制权限，允许撤销旧 run，不能因旧动作租约已撤销而拒绝清理。
6. 驱动检查签名、版本、大小、注册目标、有效期、nonce/requestId 防重放和当前租约，再执行；不接受调用方提供的 providerRef、绝对后台路径、任意目标地址或 display。注册目标到本地目录的映射由受保护配置确定。重启初始为关闭，必须重新握手，不能恢复旧控制权。
7. 传输恢复不自动重放副作用。重复 requestId 只返回已知记录或 `EFFECT_UNKNOWN`，不得当作幂等执行保证；驱动重启后丢失记录也不能再次执行。帧建议扩展为带 requestId 的 data/done/error/heartbeat，done 包含 completed、effect 和 cleanup 摘要；这不是现有 host 帧已有字段。

签名只证明请求来自可信控制服务，不使桌面账号下的驱动成为防恶意同 UID 进程的安全边界。桌面进程可能干扰驱动、伪造返回内容或操作自己的图形会话；控制侧仍需独立阻断后续动作，且不得依据驱动输出扩大授权。

## 4. 候选系统、图形与能力声明

不联网核验发行版或软件支持周期；下表是受控验证矩阵，不能称为已支持平台。

| 项目 | 首轮建议 | 限制与待验条件 |
| --- | --- | --- |
| 系统 | Ubuntu Server 24.04 LTS、x86_64、systemd、cgroup v2 | 首先仅验证这一组合；Debian 12 作为第二候选，待重新核对维护状态及依赖。其他版本/架构不承诺。 |
| 图形协议 | 独立 X11 虚拟桌面：Xvfb + Fluxbox | 原生用户进程，不是 Docker；不连接运维人员桌面，不暴露 X11 TCP，不用 `-ac`/`xhost +`。 |
| X11 认证 | 专属 Xauthority cookie，私有运行目录与会话总线 | cookie 只给桌面 UID；未授权其他 UID 的连接应失败。同 UID 应用间仍可观察和注入，不能隔离敏感登录。 |
| 图形动作 | scrot 截图、xdotool 输入、wmctrl 窗口、Python/现有辅助逻辑 | 运维预装 Python、util-linux/flock、x11-utils、字体和浏览器；中文输入、剪贴板、按键释放和屏幕缩放待验。 |
| 人工观看 | noVNC + websockify + x11vnc，经后台 HTTPS/WSS 代理 | VNC 优先使用私有 Unix socket；网关仅回环。只读使用服务端 view-only 通道，不能只设置客户端禁用输入。 |
| 浏览器 | 普通桌面 UID、专属 profile，启用可用的浏览器 sandbox | 不沿用 `--no-sandbox`；系统安全策略若阻止 sandbox，标依赖不满足并调查，不自动提权或关闭保护。 |
| Wayland / GPU / 多屏 | 首轮不声明 | 不把 X11 工具当作 Wayland 适配；GPU、视频编解码和物理显示均另验。 |

拟定真实能力：完成对应验收后才声明 `graphical:true、pty:true、takeover:true、persistentHome:true`；首轮 `snapshots:false、multiScreen:false`。实现前保持不可用，不能仅改描述对象宣布支持。`pty` 必须有真实 PTY，不用 stdout 流冒充。

截图必须返回实际像素尺寸、displayId、采集时间、sessionGeneration 和 viewportVersion。点击使用同一版本的客体像素，拒绝过期截图坐标；不沿用固定 1280×800 元信息作为测量值。

生命周期映射：

- `provision/prepare` 仅接入和检查预建桌面，不创建 VM、不 sudo 安装依赖；`isRunning` 仅探测，无法判断时返回错误，不顺便恢复服务。
- “断开”只撤销连接/租约，文件和机器继续存在；不得显示为关机或停止费用。
- 初版不声明整机 create/start/stop/destroy、管理员能力及快照。必需的 `snapshot/stop/destroy` 方法明确返回不支持，不能返回假编号、删除工作区或执行同机 shutdown。若上游调用链强制 stop，需在接线前增加显式能力判断。
- 桌面栈重置是独立运维动作，说明会话丢失及数据保留；文件导出属于普通文件传输，不称为可恢复的系统快照。

## 5. 控制租约、人工接管和取消

控制侧复用现有持久化租约协调资源 `computerId + displayId`；不在整个应用增加全局单任务锁。任务派工/Run 执行所有权与桌面输入租约分别校验，不能持有其中一个就推导另一个有效。

建议控制状态：`none → agent → revoking → human → none`。续租、持有者变更、重连和重置携带单调 fence；换会话增加 sessionGeneration。驱动拒绝缺字段、过期、旧 fence、旧代次和错误 holder。建议租约 15 秒、每 5 秒续租作为首轮实验参数，实际时延和容错需 P4 决定。

| 事件 | 控制侧与驱动必须完成的动作 | 成功判定与失败呈现 |
| --- | --- | --- |
| Agent 动作 | 每个键鼠动作、批量子动作、命令启动和文件写入前重查授权/Run/租约；驱动执行前也检查 | 批量不只检查第一步；取消/过期后不能启动下一步。 |
| 人工接管 | 原子撤销 Agent 租约并推进 fence；清空未开始队列，释放按下的键/按钮；取消 Agent 关联命令、文件写入和 PTY；再发人工短期控制票据 | 驱动确认新 fence 后才开放交互；未确认则显示接管待确认/失败，不展示已接管。 |
| 人工输入与终端 | Viewer/PTY 每条连接绑定用户、computer、generation、lease、fence 和短期票据 | 归还/撤销/过期关闭已有连接；不能只拒绝新的 WebSocket 握手。普通观看连接不能升级为控制连接。 |
| 归还 Agent | 先关人工输入和 PTY、撤销票据；清理结果核对后发新 Agent 租约 | Agent 重新截图、检查窗口与目录，丢弃接管前坐标和未执行计划，不能自动续放旧批次。 |
| 取消/急停 | 先记录取消并阻断新动作，推进 fence；独立清理请求停止当前 run；命令 AbortSignal 和租约 watchdog 双通道处理 | 返回已完成动作、未知结果、未结束进程和清理状态；不能把收到取消当成全部进程已结束。 |
| 后台失联/驱动重启 | 驱动按租约过期自停输入并尝试取消；新驱动保持关闭；后台丢失连接立即停止派发 | 重连必须新握手、新代次、新截图；旧连接和延迟报文全部失效。 |

接管也冻结 Agent 新文件读取和截图发送等未开始工具，避免旧执行尝试在人工会话中继续观察；必要的状态探测和清理使用专用控制权限。正在执行的文件/远端操作可能无法撤销，须返回未知或部分完成。

敏感输入模式由可信人工入口开启：先关闭 Agent 截图/模型发送、录制、图像缓存及排队上传，人工 Viewer 按用户授权保留；退出后清除临时缓存并重新观察。不能只在网页遮罩密码框。X11 同 UID 应用和浏览器可能仍能读取会话内容，不承诺密码对桌面内进程保密。

## 6. 进程、环境和文件权限

### 6.1 取消与清理

- 每个命令保存 computer/task/run/action、启动时间、PID/进程组及退出状态。沿用进程组取消仅为起点；正常结束也检查后台子进程，不因父进程退出就报告空闲。
- 建议驱动与桌面进程处于专用 systemd slice，命令/PTY 按 run 归属追踪；探索在管理员预置的受限 cgroup 子树内分组，不授予 Agent 通用 systemctl、polkit 或宿主服务管理权限。cgroup 创建/委派机制尚待验证，不能作为现有能力。
- 取消建议先 TERM、限时等待、再 KILL，最后核对归属进程/cgroup；等待阈值作为配置并实测。保留取消专用容量，避免命令占满后无法发撤销。
- systemd 服务级停止采用 `KillMode=control-group` 兜底，仅处理已纳入的执行栈。setsid 脱组、通过其他用户会话服务/D-Bus 启动、驱动崩溃和未知归属进程均需专项验收；不能按进程名批量 pkill 整机浏览器。
- 浏览器常驻 profile 与单次 run 工作分开。需要取消浏览器后台脚本而无法准确归属时，标记 `cleanup=unknown/residual`，暂停恢复；由人工明确选择重置专属桌面，不能误杀人工接管后新开的进程。
- 返回建议 `cleanup={state:clean|residual|unknown, remaining:[processRef], errors:[code]}`。清理失败不删除追踪记录，阻止自动续跑。取消不能撤回已经发送的消息、下载或外部写入。

### 6.2 命令环境与终端

驱动从显式白名单重新构造子进程环境：固定 HOME/USER/PATH、语言、专属 DISPLAY/XAUTHORITY、运行目录、会话总线及 run 临时目录。禁止继承后台模型/数据库/签名私钥、运维 SSH agent、云凭据和控制 socket；不简单复制 process.env。request.env/unsetEnv 不能覆盖受保护身份/图形/目录字段，LD_PRELOAD、NODE_OPTIONS 等注入变量默认拒绝。

命令使用 argv、`shell:false`；显式 shell 只能按任务已授予的 shell 权限执行，不把 shell:false 当成沙箱。cwd 由规范化工作区相对路径生成，超时、输出大小、进程数和磁盘使用均设限。交互 PTY 仅允许人工控制租约，关闭后终止关联 shell 并报告后台进程。

普通终端进程具有桌面 UID 的实际权限，可以读系统公共文件、访问网络和修改该 UID 的其他文件。cwd 限制或命令字符串黑名单无法保证工作区隔离。若任务要求不同授权范围之间的强文件隔离，需要额外受验证的文件系统/MAC/命名空间策略；初版不得把同 UID 多目录声称为互不信任任务的沙箱。

### 6.3 文件边界

普通文件 API 仅接受登记工作区的相对路径；未来适配器先规范化资源，再供授权 guard 精确匹配。拒绝越界、NUL、符号链接/父目录置换、非普通文件和未授权导入目的地；写入应使用目录句柄和 no-follow 检查，读取也需句柄绑定，不能只校验 realpath 后重新按路径打开。硬链接及并发替换另行验收。

首轮建议沿用单文件 8 MiB、请求 12 MiB 的限制，并对导出总大小/数量和响应帧设界限；base64 开销计入请求上限，大文件走受认证流，不塞进模型消息。产物经驱动受控下载或导出后进入后台产物区，不将整个后台数据目录共享给桌面。浏览器 profile、cookie、Xauthority 和临时认证材料不进入普通工作区导出。

## 7. 同机账号隔离的真实限制

后台、桌面、数据库分别使用 `sydney-control`、`sydney-desktop`、`postgres`；前两者无 sudo、无 Docker/LXD 管理组、无 Linux capabilities、无宿主服务管理权限。系统依赖和安全规则由可信运维管理员安装；Agent 安装软件仅限已授权的用户目录，系统 apt/整机配置变更不属于默认能力。

Unix 文件权限可阻止桌面 UID 读取控制侧私有目录，但不能隔离共享内核、CPU/内存/磁盘耗尽、公共文件、同 UID 进程及本机网络。应检查 sudoers/polkit、目录 ACL、可写启动代码、SUID/capability、数据库本机认证和敏感 Unix socket；这些是 P4 授权检查项，本次不扫描机器凭据或配置。

后台 API、数据库、模型代理及供应商管理入口不能因请求来自 localhost 就信任。运维侧建议按桌面 UID 配置主机出站规则，覆盖 IPv4/IPv6、回环、内网、云元数据和管理地址，默认仅放行任务所需公网与本机驱动/观看端口；DNS 和代理不能成为绕行通道。Unix socket 单独依靠目录和服务认证，数据库不能开放 trust 认证。规则未经服务器验证前，PA-015 仍未满足。

驱动与桌面共用 UID 是最小部署的限制：签名校验不能防止同 UID 进程干扰校验器、直接输入 X11 或篡改自身返回；取消是服务控制与尽力清理，不是对恶意桌面进程的强制遏制承诺。控制侧至少可以不再派发、不再代理输入/模型截图并保存异常，不保证独立切断整机资源。

**默认无 root。若同机 Agent 获得整机 root，不能承诺仍能保护后台密钥、数据库、控制进程或审计。** 需要不可信代码强隔离、客体管理员权限或可信整机急停时，应改为独立 VM/独立主机及客体外控制面，另行评审；普通账号分离不等价于这个边界。

## 8. 服务依赖、健康检查和运维接口

### 8.1 服务规划

| 提议服务 | 运行身份 | 依赖与失效语义 |
| --- | --- | --- |
| PostgreSQL 原生 unit | postgres | 使用所选发行版的实际 unit 名，待服务器确认；后台 DB 就绪后才接任务。 |
| `sydney-api.service` | sydney-control | After/Wants 数据库、网络；数据库连接失败则 readiness 失败，不借机启动桌面。 |
| `sydney-worker.service` | sydney-control | 数据库/schema/授权配置就绪后领 Run；桌面不可用只阻断依赖该桌面的任务。 |
| `sydney-desktop-session.service` | sydney-desktop | 管理专属 X11、窗口管理器、会话总线与网关；无必要的物理登录依赖。 |
| `sydney-native-driver.service` | sydney-desktop | After 并 BindsTo 专属桌面 session；session 消失立即撤销输入，重启不自动恢复租约。 |
| HTTPS/WSS 入口 | 单独入口身份或已受控服务 | 仅代理已认证 API/Viewer/PTY，不暴露驱动原始路由；实际服务名待选。 |
| 原生备份/主机检查 unit | 可信运维身份 | 独立于 Agent，按最小读权限备份；不能复用依赖 Docker 的备份 unit 宣布可用。 |

`After` 仅排序，不表示依赖已就绪；依赖就绪用显式探测与超时。后台允许呈现桌面离线及只读任务；driver/session 重启必须产生新的会话代次。停机顺序为停止接单、撤销租约与票据、清理 Run、停止 worker/驱动/桌面、最后处理数据库；不得把整机 shutdown 暴露给模型。

服务建议按职责设置 `NoNewPrivileges`、空 `CapabilityBoundingSet`、`UMask=0077`、只读程序目录、受限 ReadWritePaths、CPU/内存/PID 限额及 `KillMode=control-group`。图形、X11 socket、Chromium sandbox、私有临时目录与 cgroup 委派可能互相影响，逐项验证后才写入部署模板；不能无验证同时打开全部 systemd 加固参数。

### 8.2 接口和健康语义

| 提议接口 | 调用者与权限 | 必须返回/执行 |
| --- | --- | --- |
| `health.live` | 受认证后台探测 | 驱动存活、协议/适配器版本、boot/session 标识；不读屏、不启动桌面。 |
| `health.ready` / `inspect` | 后台运维或任务接入 | 目标 UID、依赖版本、X11 可连接、实际尺寸、cookie 可用、目录权限、可用空间、能力与降级原因；不自动安装修复。 |
| `lease.install/renew/revoke` | 控制侧签名权限 | 原子更新 fence/holder/有效期；撤销已存在的 Viewer、输入、PTY 和排队动作；不能仅更新数据库显示。 |
| `work.inspect/cancel` | 目标 run 的控制权限 | 按归属查询/取消，返回已结束/残留/未知；取消通道有独立容量与短超时。 |
| `session.attach/disconnect` | 有权使用该电脑的后台服务 | 能力协商与新代次；断开不删除数据、不停止整机。 |
| `session.reset` | 显式运维授权 | 仅重置专属桌面栈；先展示受影响会话、残留进程和保留范围，是否支持取决于实际受限执行通道。 |
| Viewer / PTY 票据 | 已认证且持有对应 lease 的用户 | 绑定用途、电脑、generation、fence、过期时间；撤销时关现有连接，不与驱动私钥/签名权限混用。 |

周期检查只做无副作用探测；真实截图、输入、PTY、网络和文件权限探针仅在授权验收中执行。连接超时、协议不匹配和探测失败呈现不可用/未知，不能返回“健康”并尝试偷偷修复。

错误建议对齐 `AUTHORIZATION_DENIED、CONTROL_LEASE_LOST、SESSION_EXPIRED、COMPUTER_UNAVAILABLE、CAPABILITY_UNSUPPORTED、RESOURCE_LIMIT、ACTION_TIMEOUT、EFFECT_UNKNOWN`，补充稳定的协议/依赖错误码。鉴权拒绝不重试；只读故障有界重试；副作用超时先核对，不能透明重放。

## 9. 数据目录、备份与恢复规划

下列均为待验证路径；不代表已创建，不提供已验证安装命令。

| 路径提议 | 所有者/权限提议 | 内容与保留 |
| --- | --- | --- |
| `/opt/sydney/releases/<release>` | root 拥有，运行账号只读 | 后台/驱动程序与静态资源；桌面不能替换后台启动代码。 |
| `/etc/sydney/control` | root:sydney-control，目录 0750、敏感文件 0640 或更严 | 后台配置、数据库/模型凭据、请求签名私钥；优先用 systemd 凭据注入，不放 argv，不传给桌面。 |
| `/etc/sydney/native-driver` | root 拥有，桌面只读 | 固定电脑映射、控制侧公钥、协议和允许路径；公钥可公开，配置不可由桌面修改。 |
| `/var/lib/sydney-control` | sydney-control，0700 | 任务/授权相关本地数据、产物、租约协调所需持久数据；业务记录仍复用原数据库，不建平行数据库。 |
| PostgreSQL data 目录 | postgres，0700 | 发行版实际路径待确认；桌面/驱动无目录遍历及数据库管理权限。 |
| `/var/lib/sydney-desktop` | sydney-desktop，0700 | 专属 HOME、workspace、独立 browser-profiles；持久保留不代表有备份或快照。 |
| `/run/sydney-desktop` | sydney-desktop，0700 | Xauthority、会话总线信息、VNC socket、临时票据；重启作废，不备份。 |
| `/var/lib/sydney-desktop/tmp/<run>` | sydney-desktop，0700 | 任务临时文件与环境片段；结束后核对进程占用再清理，只允许删除确认归属的目录。 |
| journal / `/var/log/sydney`（如确需） | 运维/控制侧限制读取 | 仅身份引用、动作类型、时间、效果和清理摘要；禁止令牌、命令敏感参数、完整输出与截图原文。 |
| `/var/backups/sydney` | 可信备份身份，0700 | 加密数据库与配置/产物备份；桌面文件按授权单独导出。期限、配额、异地保留和密钥托管待决定。 |

普通文件 API 不直接访问这些后台目录；模型仅获得必要输出。profile 含登录态，不默认纳入普通任务导出或截图留存。签名私钥、数据库凭据及浏览器登录态的恢复权限分开管理。

升级前停止新派工并收敛控制租约，保留旧 release；检查协议/schema 兼容后切换，驱动新代次重新接入。回滚代码不等于回滚数据库或撤销外部动作；不可逆 schema 变化需要单独恢复方案。原生数据库备份须用受限账号验证 dump、校验、加密和独立恢复，不能把 archive/list 成功当成业务恢复通过。保留期限未决定前不得自动删除用户工作区或 profile。

## 10. P4 授权真实服务器验收清单

当前所有项均为**待验证**。本次只阅读轻量源码和设计文档，未联网、未安装、未启动 Docker/数据库/服务、未跑构建或测试；无目标服务器、无视觉模型。验收不得将历史底座检查记录算作本次结果。

| 编号 / 需求 | 真实验证内容 | 合格证据与当前缺口 |
| --- | --- | --- |
| NL-01 / PA-009、017 | 记录 OS/架构/kernel/systemd/cgroup、浏览器和图形依赖的实际版本；生产配置加载新 Provider | 独立记录环境、配置摘要及能力协商；确认旧 desktop 生产保护仍拒绝。缺服务器/实现。 |
| NL-02 / PA-010、015 | 桌面 UID 访问专门准备的后台凭据哨兵文件、数据库数据目录、后台进程环境、服务管理和高危 socket | 全部按边界拒绝；只用合成哨兵，不读取真实密钥；保存权限/ACL及拒绝摘要。普通 UID 隔离限制仍保留。 |
| NL-03 / PA-004、015 | 错签名、缺签名、外部来源、跨 owner/space/bot/task/run、过期/撤销授权及重复 requestId | 均未启动动作；签名密钥不在桌面、模型或普通日志中。缺实现。 |
| NL-04 / PA-011、012 | 真实截图、点击、输入、中文、拖动、滚轮、窗口切换和缩放后的坐标；只读 Viewer | 画面与实际桌面一致，尺寸/代次正确，过期坐标拒绝；先做无模型工具验收，视觉推理另验。 |
| NL-05 / PA-011、015 | 非桌面 UID 无 cookie 接入 X11、直连 VNC/网关、只读连接发送输入、外部端口访问 | 未授权连接/输入被拒绝；浏览器 sandbox 实际启用，不用 Xvfb -ac。缺服务器。 |
| NL-06 / PA-014、006 | Agent 批量点击/写文件/运行命令中接管，归还、旧 fence 延迟到达、多 worker 争用同一屏幕 | 撤销后无新子动作；开放人工输入前有确认；旧租约不能撤销新租约；不锁住其他独立资源。 |
| NL-07 / PA-006、014 | 长命令、后台 fork/setsid、PTY、浏览器脚本、D-Bus 启动、父进程退出后取消 | 已归属进程得到核对；无法结束的工作明确报 residual/unknown，不能误杀人工进程或报告全清理。 |
| NL-08 / PA-005、013、014 | 杀驱动、重启 session/后台、网络断开、过期续租、连接重建 | watchdog 停止新输入，新代次拒绝旧报文；副作用结果未知不自动重试。缺服务器。 |
| NL-09 / PA-004、010、012 | 路径穿越、符号/硬链接、目录替换竞争、绝对路径、非普通文件、超限文件、流中断 | 文件 API 按授权拒绝；部分写入及输出截断可核对。另验证 shell 能力边界，不冒称目录沙箱。 |
| NL-10 / PA-010、014 | 敏感输入模式、排队截图/缓存上传、Viewer/PTY 票据撤销、日志抽查 | 模型与录制未收到敏感截图，既有连接关闭；仅使用合成输入，说明同 UID 可见性限制。 |
| NL-11 / PA-015 | IPv4/IPv6、loopback、内网、元数据、Unix socket、数据库本机认证、DNS/代理绕行 | 桌面不能访问管理面或数据库；所需公网正常；拒绝规则来自运维而非模型。缺规则/服务器。 |
| NL-12 / PA-009、016 | 原生冷启动、依赖缺失、磁盘满、资源耗尽、非图形任务降级；断开/重连 | 无 Docker 前提；不自动 sudo/安装/恢复服务，健康状态准确；文件保留语义清楚。 |
| NL-13 / PA-009、010、016 | 升级、协议不匹配、回滚、加密备份及隔离位置恢复 | 新租约不继承旧会话；任务/产物可恢复，登录态按授权处理；列出不能恢复内容。缺运行环境/运维实现。 |
| NL-14 / PA-002、011、012、018 | 用户选定场景与视觉模型执行真实桌面任务，人工接管后继续并返回可下载产物 | 记录模型/发送范围、工具效果、耗时、资源与实际用量；无模型时仅能验工具，不能通过本项。 |

后续实施入口：先冻结受认证消息及租约适配契约，再实现新 Provider 与只检查不安装的 prepare；由 P4 在授权服务器建立证据，主 Agent 同步计划、运维及验证记录。本文未将 P1 或 P4 标为完成。
