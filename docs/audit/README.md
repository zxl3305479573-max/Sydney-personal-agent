# 模块审计

审计日期：2026-11-04。范围：当前工作树静态代码审阅及既有验证记录；没有恢复依赖或连接真实服务。结论不代表渗透测试、PostgreSQL 并发验收或 Linux 生产验收。

## 总览

| 模块 | 结论 | 主要原因 |
| --- | --- | --- |
| Core contracts | 条件通过 | 纯策略与精确资源映射较清楚；缺少完整跨层权限属性测试 |
| DB task execution | 阻塞 | 存储与租户门禁已接线，但真实 DB 未验；控制状态和事务版本边界需补审 |
| Pi adapters | 阻塞 | 主模型/工具门禁存在；helper 与辅助模型预算覆盖不完整，取消未贯通 |
| Native Linux | 阻塞 | socket/路径防护初版存在；租约期限、协议身份和取消/接管缺口未解决 |
| API / Web | 条件通过 | 用户 API 与工作台路由已接线；停止确认暂不可用，真实浏览器联调未验 |
| Connectors | 条件通过 | Rakazo 有多条连接机制；部署启用清单和首个 Sydney App 未确认 |
| Operations | 阻塞 | systemd 是草案；服务器、备份恢复、权限与容量未验收 |

## 审计方法与限制

- 静态追踪代码入口、状态转换、权限检查、外部副作用和调用方。
- 使用 `docx/VALIDATION.md` 中的既有定向验证作为历史证据；本轮由于依赖缓存不完整，未重跑测试或类型检查。
- 已知 `git diff --check` 在本轮最终检查后记录；Linux、PostgreSQL、OAuth、模型和 E2E 必须另行验证。
- 文件路径为审计定位，可能随代码变化；变更后需重审对应模块。

## 模块报告

- [Core contracts](core-contracts.md)
- [DB task execution](db-task-execution.md)
- [Pi adapters](pi-adapters.md)
- [Native Linux](native-linux.md)
- [API and Web](api-web.md)
- [Connectors](connectors.md)
- [Operations](operations.md)

## 先决修复顺序

1. 将暂停/取消接入可信中断和 Provider 清理；静止只能由服务端证据确认，不能仅凭 UI 勾选。
2. 将 managed task 的预算/门禁覆盖所有 Pi 模型调用、helper、fallback 和辅助审核模型，或继续关闭未覆盖入口。
3. 验证本轮 Native Linux lease 注入、生命周期显式拒绝及 cancel/inspect 接线；继续补强身份/协议/结果未知处理，并实现可验证清理或明确限制使用。
4. 执行新增 task 状态机测试，为 nonce/effect/Run 状态增加真实 PostgreSQL 并发验收。
5. 在授权 Linux 服务器完成 socket UID、桌面权限、systemd、浏览器与恢复演练。
