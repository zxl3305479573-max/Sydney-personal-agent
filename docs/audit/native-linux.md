# Native Linux 审计

结论：阻塞。范围：TypeScript SandboxProvider、Unix socket transport、Python driver、systemd 草案和桌面权限。

## 入口与行为

- `packages/adapters/src/native-linux-sandbox.ts` 实现 `SandboxProvider`；工厂注册位于 `sandbox-factory.ts`，env 使用 `SYDNEY_NATIVE_DRIVER_SOCKET`。Executor 提供 Run owner/fence 与实时验证回调；Provider 在操作前通过该回调核对数据库租约，再以不超过实际到期时间的短期值请求驱动。
- `infra/native-linux/driver.py` 使用 systemd socket activation、SO_PEERCRED、Bot workspace 子目录和有限 X11 操作。
- 部署草案位于 `infra/native-linux/*.service` 与 `*.socket`。
- 本轮将 Provider 的 `pty` capability 从 true 改为 false，并将 `stop/destroy` 空成功改为显式 unsupported；这些改动未在 Linux 上执行验证。

## 已确认的保护

- Provider 将 botId/generation 从具体 `ComputerRef` 绑定，请求参数不能覆盖保留身份字段；拒绝跨 Bot computer。
- 命令、写文件和桌面输入要求 Run lease；驱动校验短期限、fence，限制单活动桌面 Run。
- 驱动只接受系统创建 socket 的控制 UID，拒绝 root 运行；桌面 UID 与控制 UID 必须不同。
- 文件路径使用 directory fd/no-follow 方式逐层打开，拒绝绝对路径、反斜线、空路径段、`.`/`..`、非普通文件及超限文件。
- 请求、文件、输出、命令时长有上限；连接中断、超时和不确定效果返回保守错误而不自动重放。

## 阻塞发现

- **生命周期方法语义已修正**：本轮 Provider 的 `stop()`/`destroy()` 改为显式抛出 unsupported；此前空操作风险已关闭，但相应测试未运行。
- **静止/取消仍不完整**：本轮接出 driver `cancelRunWork`/`inspectBackgroundWork`。当前 driver 只能报告 active/unknown，不能证明 idle；命令执行仍有父进程派生/脱组子进程未建立可靠归属证明的问题，且取消接口尚未做 Linux 对抗性验证。
- **请求中断为尽力操作**：native socket 会在 AbortSignal 触发时断开请求；driver 命令循环检测连接断开后尝试清理进程组。桌面操作、已发送的外部请求或脱组进程不受保证，关闭连接后结果应视为未知。
- **先前 Run lease 未传入 Provider context**：本轮已在 Executor 构造 `nativeRunLease`，避免生产调用全部因缺失 lease 被拒；只静态确认字段流向，未执行 Provider/Executor 集成测试。
- **租约实时检查待验证**：已移除构造 context 时固定的八秒期限；动作前查询有效的 Run owner/fence/期限，存在共享电脑租约时也核对其 fence/期限，驱动请求期限不超过数据库到期时间及八秒。该检查仍存在读取后到动作之间的竞态，驱动不直接访问数据库，也不构成即时撤销证明；代码和新增测试尚未运行。
- **后台工作查询参数**：Provider 接口传入的是 computer ID，不是 Run ID；现改为查询该 Bot 的全部已跟踪进程，仍只返回 active/unknown，不能证明进程静止。
- **桌面物理控制过宽**：driver 与桌面共用 UID；同 UID 程序可绕过该服务操作 X11 或影响驱动。只验证 Unix peer UID 并不隔离同 UID 恶意进程。
- **请求完整性边界**：Unix socket 限制对端 UID，但请求未携带签名/nonce/requestId；Fence 在进程内存，driver 重启后状态重置。桌面用户如果能运行任意同 UID 代码，可以直接发 socket 请求并伪造 run/fence。
- **路径访问范围**：只对 API 文件调用使用安全 workspace dirfd；桌面 shell 的 `cwd` 接受任意已存在绝对目录，命令本身按桌面 UID 运行，并非 workspace 沙箱。
- **能力声明/实现不齐**：本轮将 `pty` capability 修正为 false，因为 `CommandRequest.pty` 实际被拒绝；`persistentHome: true` 声明仍需 Linux 实机核对。screen/takeover/snapshot/export 不支持。
- **观察权限**：无 lease 的只读截图适用于任务页预览，但 API 路由必须持续验证 Bot、电脑状态和 takeover；它仍暴露屏幕敏感内容给有权用户。
- **文件请求的二次校验**：驱动对 list/read/write/export 现在要求有效 Run lease，并在内存中复用 fence/期限检查；Provider 先查数据库仍存在读后写竞态，驱动重启会丢失 fence 表，Linux 实机和同账号对抗测试待验。
- **指针参数顺序**：指针类型和按钮现在先于鼠标移动校验；单条非法指针动作不会先移动鼠标。一个动作列表中的前序动作仍可能已经执行，不能将整个列表视为原子操作。
- **基础图形执行**：Provider 现声明图形观察/动作能力；驱动支持截图、指针、键盘、剪贴板粘贴输入、滚动及动作后观察。浏览器结构化页面工具、实时屏幕流和人工接管仍不可用；真实 X11、剪贴板粘贴及 Provider/Executor 测试尚未执行。剪贴板内容可能被桌面账号其他进程读取。
- **短时终端**：原生 shell 改为直接执行 Bash，Provider 将超时限制在 8 秒以内，驱动把相对工作目录解析到 Bot home。进程组清理和脱组残留仍不能证明静止；真实 Linux 与 Run 接线未验证。

## 验证与状态

- 历史 V-006、V-008 包含 Windows/替身离线测试；本轮未启动驱动或 Linux 服务。
- 新增 Provider 测试覆盖 stop/destroy 拒绝、cancel/inspect 保守结果、PTY 能力与租约失效拒绝；由于当前依赖缺失，尚未执行。数据库租约查询的真实隔离和并发尚未验证。
- systemd、X11/Xauthority、浏览器 sandbox、目录权限、进程清理和 socket UID：待 Linux 实机验证。
- 状态：阻塞；禁止部署为不可信代码执行沙箱或宣称可安全急停。
