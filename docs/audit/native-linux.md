# Native Linux 审计

结论：阻塞。范围：TypeScript SandboxProvider、Unix socket transport、Python driver、systemd 草案和桌面权限。

## 入口与行为

- `packages/adapters/src/native-linux-sandbox.ts` 实现 `SandboxProvider`；工厂注册位于 `sandbox-factory.ts`，env 使用 `SYDNEY_NATIVE_DRIVER_SOCKET`。Executor 提供 Run owner/fence 与实时验证回调；Provider 在操作前通过该回调核对数据库租约，再以不超过实际到期时间的短期值请求驱动。
- `infra/native-linux/driver.py` 使用 systemd socket activation、SO_PEERCRED、Bot workspace 子目录和有限 X11 操作。
- 部署草案位于 `infra/native-linux/*.service` 与 `*.socket`。
- 本轮将 Provider 的 `pty` capability 从 true 改为 false，并将 `stop/destroy` 空成功改为显式 unsupported；这些改动未在 Linux 上执行验证。

## 已确认的保护

- Provider 将 botId/generation 从具体 `ComputerRef` 绑定，并从请求参数中剥离 `method`/`botId`/`generation`/`run`/`requestId` 等保留字段，请求参数不能覆盖身份或租约；拒绝跨 Bot computer。
- 命令、写文件和桌面输入要求 Run lease；Provider 为所有带 Run lease 的驱动请求附加唯一 UUID `requestId`，驱动校验 UUID 格式、拒绝未带 `requestId` 的有副作用 lease 请求（`execute`/`act`/`write`），并通过有界防重放缓存（`MAX_SEEN_REQUEST_IDS = 4096`）拒绝重复 `requestId`；`fences`、`control_fences` 与 `seen_request_ids` 现通过 `0o600` 临时文件 + `fsync` + `os.replace` 及 `O_NOFOLLOW`/符号链接校验原子持久化至驱动根目录 `.driver-state.json`，常规重启后可恢复；只读无 lease 预览 `observe` 保持兼容。
- 驱动只接受系统创建 socket 的控制 UID，拒绝 root 运行；桌面 UID 与控制 UID 必须不同。
- 文件路径使用 directory fd/no-follow 方式逐层打开，拒绝绝对路径、反斜线、空路径段、`.`/`..`、非普通文件及超限文件。
- 短时终端 `cwd` 已在 Provider 与驱动侧收紧：Provider 拒绝空字节、反斜线、绝对路径及 `..` 段；驱动通过 `resolve_command_cwd` 拒绝空字节、反斜线、`..` 段以及经 `realpath` 规范化（含符号链接）后落出 Bot home 或非目录的路径。
- 请求、文件、输出、命令时长有上限；连接中断、超时和不确定效果返回保守错误而不自动重放。

## 阻塞发现

- **生命周期方法语义已修正**：本轮 Provider 的 `stop()`/`destroy()` 改为显式抛出 unsupported；此前空操作风险已关闭，但相应测试未运行。
- **静止/取消仍不完整**：本轮接出 driver `cancelRunWork`/`inspectBackgroundWork`。当前 driver 只能报告 active/unknown，不能证明 idle；命令执行仍有父进程派生/脱组子进程未建立可靠归属证明的问题，且取消接口尚未做 Linux 对抗性验证。
- **请求中断为尽力操作**：native socket 会在 AbortSignal 触发时断开请求；driver 命令循环检测连接断开后尝试清理进程组。桌面操作、已发送的外部请求或脱组进程不受保证，关闭连接后结果应视为未知。
- **先前 Run lease 未传入 Provider context**：本轮已在 Executor 构造 `nativeRunLease`，避免生产调用全部因缺失 lease 被拒；只静态确认字段流向，未执行 Provider/Executor 集成测试。
- **租约实时检查待验证**：已移除构造 context 时固定的八秒期限；动作前查询有效的 Run owner/fence/期限，存在共享电脑租约时也核对其 fence/期限，驱动请求期限不超过数据库到期时间及八秒。该检查仍存在读取后到动作之间的竞态，驱动不直接访问数据库，也不构成即时撤销证明；代码和新增测试尚未运行。
- **后台工作查询参数**：Provider 接口传入的是 computer ID，不是 Run ID；现改为查询该 Bot 的全部已跟踪进程，仍只返回 active/unknown，不能证明进程静止。
- **桌面物理控制过宽**：driver 与桌面共用 UID；同 UID 程序可绕过该服务操作 X11 或影响驱动。只验证 Unix peer UID 并不隔离同 UID 恶意进程。
- **请求完整性边界**：Provider 现为所有带 Run lease 的请求生成唯一 UUID `requestId`，驱动侧校验格式并通过有界缓存（最多保留最近 4096 个，按大小写归一化）拒绝重复 `requestId` 重放，未带 `requestId` 的 `execute`/`act`/`write` 请求会被拒绝；`fences`、`control_fences` 与 `seen_request_ids` 现已原子持久化至驱动根目录 `.driver-state.json`（`0o600` + `fsync` + `os.replace` + `O_NOFOLLOW`/符号链接校验），关闭常规驱动重启导致的 fence 与防重放缓存清零问题。但请求仍无密码学签名，超出缓存容量（4096）的历史 `requestId` 不再保留，且**不改变** driver 与桌面共用 UID 的进程边界（桌面用户若能运行任意同 UID 代码，仍可直接影响桌面、篡改同属主状态文件或绕过控制面），也**不能证明**脱组或后台进程已静止（`inspectBackgroundWork` 仍仅能返回 `active`/`unknown`）。
- **路径访问范围**：API 文件调用使用安全 workspace dirfd；本轮已将短时终端 `cwd` 收紧至 Bot home 内（拒绝空字节、反斜线、`..` 逃逸、Bot home 外的绝对路径及符号链接逃逸）。但命令本身仍按桌面 UID 运行，Bash 进程内部仍可访问该桌面 UID 有权读取或执行的宿主机路径，因此仍**不可作为不可信代码执行沙箱**。
- **能力声明/实现不齐**：本轮将 `pty` capability 修正为 false，因为 `CommandRequest.pty` 实际被拒绝；`persistentHome: true` 声明仍需 Linux 实机核对。screen/takeover/snapshot/export 不支持。
- **观察权限**：无 lease 的只读截图适用于任务页预览，但 API 路由必须持续验证 Bot、电脑状态和 takeover；它仍暴露屏幕敏感内容给有权用户。
- **文件请求的二次校验**：驱动对 list/read/write/export 现在要求有效 Run lease，并复用 fence/期限检查；常规驱动重启后 fence 表已可从 `.driver-state.json` 恢复，但 Provider 先查数据库仍存在读后写竞态，共享 UID 进程边界未变，Linux 实机和同账号对抗测试待验。
- **指针参数顺序**：指针类型和按钮现在先于鼠标移动校验；单条非法指针动作不会先移动鼠标。一个动作列表中的前序动作仍可能已经执行，不能将整个列表视为原子操作。
- **基础图形执行**：Provider 现声明图形观察/动作能力；驱动支持截图、指针、键盘、剪贴板粘贴输入、滚动及动作后观察。浏览器结构化页面工具、实时屏幕流和人工接管仍不可用；真实 X11、剪贴板粘贴及 Provider/Executor 测试尚未执行。剪贴板内容可能被桌面账号其他进程读取。
- **短时终端**：原生 shell 改为直接执行 Bash，Provider 将超时限制在 8 秒以内并拒绝非法/越界 `cwd`，驱动将工作目录解析并限制在 Bot home 内（含 `realpath` 符号链接边界校验）。进程组清理、脱组残留与宿主文件访问仍无法构成沙箱或证明静止；真实 Linux 与 Run 接线未验证。

## 验证与状态

- 历史 V-006、V-008 包含 Windows/替身离线测试；本轮未启动驱动或 Linux 服务。
- 本轮已在本机 Windows 环境运行纯离线 Python 单元测试 `infra/native-linux/test_driver.py`（覆盖 `requestId` 必填/格式校验/大小写归一化防重放/有界缓存淘汰、无 lease 只读 `observe` 兼容、`cwd` 边界拒绝，以及 `.driver-state.json` 跨重启持久化、容量截断、损坏 JSON/Schema 告警降级与符号链接/`O_NOFOLLOW` 拒绝；Linux 专属 socket/进程用例已跳过）。
- TypeScript/Vitest（含 `packages/adapters/src/native-linux-sandbox.test.ts` 新增的 `requestId` 生成与 `cwd` 拒绝用例）因本地未恢复 `node_modules` 未执行；数据库租约查询的真实隔离与并发未验证。
- systemd、X11/Xauthority、浏览器 sandbox、目录权限、进程清理和 socket UID：待 Linux 实机验证。
- 状态：阻塞；禁止部署为不可信代码执行沙箱或宣称可安全急停。
