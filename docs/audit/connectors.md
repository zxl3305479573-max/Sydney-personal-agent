# Connectors 审计

结论：条件通过。范围：App catalog、直连 Connector、MCP、OAuth、第三方集成、消息平台和网页工具边界。

## 已确认路径

- 直接 App connector 与 catalog connector 由服务端 connector provider 解析连接与账号，再调用结构化工具。
- MCP Remote 通过 HTTPS；支持 OAuth 的远程 MCP 使用服务端 OAuth callback 和存储凭据。
- MCP stdio 在 API/Worker 侧启动受 allowlist 管理的本地进程，OAuth 变量由宿主注入，支持受限临时凭据文件。
- Composio、Pipedream 等服务端集成依赖显式 provider credentials；OpenAPI/GraphQL/MCP 自定义连接由管理员/用户配置。
- Slack、Telegram、WhatsApp、Feishu/Lark、Sendblue/Photon 等 Messaging adapter 通过 webhook/出站接口收发消息，是入口与回复能力，不等同于 App connector。
- `web_fetch`、page browser 是网页访问路径，不具有 Gmail/Notion 等结构化 API 的账号授权。

## 已确认的保护与风险

- 连接器调用仍走 run tool request、审批策略、连接路由和 effect 记录；connector 输出应视为不可信输入。
- OAuth 和 App 凭据由服务端读取，不应下发到 native desktop workspace；stdio 子进程拥有 API/Worker 账号权限，攻击面高于远程 HTTPS。
- 私网 MCP 能力默认关闭或由运维显式开启；开启后必须核对 SSRF、DNS pinning、云元数据和代理边界。
- connector catalog/安装版本/凭据配置决定实际上线列表；源码中存在的适配器不等于部署已启用或账号已连接。
- managed task 目前的资源映射只放行少数内建工具，没有完成通用 Connector grant 的精确账号、对象和动作绑定；不要把“Rakazo 可连 App”解读为“managed task 已可对这些 App 自动操作”。

## 验证与状态

- 实际项目支持范围参照 [集成文档](../integrations.md)、[Messaging 文档](../messaging-apps.md) 和 [自托管集成](../self-host-integrations.md)。
- 本轮没有 OAuth provider、MCP server、Composio/Pipedream 或 messaging credential 联调。
- 状态：平台架构条件通过；首个 Sydney App、真实权限 scope 和外部效果核对仍待 P5 验收。
