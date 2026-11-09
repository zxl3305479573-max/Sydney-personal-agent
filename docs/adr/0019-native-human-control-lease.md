# ADR-0019：原生云电脑人工接管输入使用独立栅栏租约

状态：本地代码已实现，真实桌面与部署验收待完成。需求：PA-010、PA-012、PA-017、PA-018。

## 背景

生产实时画面由服务端只读 VNC/noVNC 提供，`native-linux` Provider 的 `takeover` 能力为 `false`。原有 `computer.input` 使用教学会话或 Run 租约，驱动没有独立的“人类输入”协议，因此即使界面显示“你已接管”，点击也不会到达桌面。VNC 保持只读是既定边界，不能通过放开公网或改为交互式 VNC 绕过。

## 决策

- 人类输入不再复用 Run 租约：Web 覆盖层采集点击、滚轮、键盘和文本，经现有认证 `computer.input` RPC 发送；API 在事务中锁定 `computers` 行，复核 tenant、Bot、providerRef、运行状态、`controlHolder`、`controlLeaseId`、`controlLeaseExpiresAt` 和 `controlFence`，并拒绝活动 Run 租约、教学录制及同一桌面的竞争接管。
- 新增独立的 `control_input` / `control_revoke` 驱动协议。驱动以 `controlFence` 单调值区分人工接管代次，短期 `expiresAt` 限制每条输入票据，撤销后把租约 ID 保留在短期拒绝名单中；活动 Run 或桌面命令仍会阻止人工输入，避免人和 Agent 同时操作。
- `controlFence` 使用数据库已有列，不新增迁移。新授权递增栅栏；重复接管和等待接管绑定已有租约时锁定同一行升级旧 `0` 值；重置和回收旧控制权也递增栅栏。状态接口仅在栅栏有效时把 `controlLeaseId` 返回给原生桌面前端。
- noVNC 页面注入的脚本向父页面报告画布尺寸和留白位置，前端把浏览器坐标映射到真实桌面坐标。VNC 仍为 `-viewonly`，屏幕 iframe 不接收指针事件；人类输入走独立认证 RPC 和驱动 socket。
- 输入结果未知时不自动重放；前端停止后续队列并显示中文错误，要求退出后重新接管。驱动 socket 身份、权限、服务账号、SSH/Compose overlay 和网络边界保持不变，不授予 sudo/root，不开放公网端口。

## 边界与待验收

本 ADR 不证明线上已生效。必须同时部署 API、Worker、Web 和匹配的 Python 驱动，并重启 `sydney-driver.service`；保持 `sydney-screen-vnc.service` 的 `-viewonly`。生产驱动路径可能与仓库模板不同，部署前核对实际文件。真实浏览器需验证：接管后点击已知控件、输入文本、滚轮、退出后旧租约被拒绝、再次接管、Agent 恢复执行、断线中文提示，以及手机窄屏和横竖屏。移动端原生 App 的 WebView 仍是独立只读边界，本 ADR 只覆盖 Web 全屏接管覆盖层。
