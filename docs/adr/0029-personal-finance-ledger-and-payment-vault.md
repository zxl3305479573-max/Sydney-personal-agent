# ADR-0029: 个人账单与加密支付方式卡包边界

- 状态：已采纳（2026-11-26）
- 关联需求：PA-025、PA-021、PA-010

## 背景

用户希望在 Sydney 手机端个人中枢首页新增入口组件，用于统一管理个人账单（支出／收入／转账与月度统计）以及各类支付方式（银行储蓄卡、信用卡、微信支付、支付宝、Apple Pay、银行转账账户、PayPal、数字钱包等），同时满足两项核心诉求：

1. **防丢失与离线可用**：数据应加密持久化至用户自托管 PostgreSQL 后台并配合手机本地缓存，避免免费侧载重装或换机造成数据丢失；在后台尚未部署新迁移前，手机端应平滑降级为本地 iOS Keychain 加密存储并在后端就绪后自动迁移上云。
2. **严格区分「账单协同」与「支付凭据保密」**：允许账号下自有 Bot 协助记账单和查询月度账单统计，但银行卡号、有效期、CVV 安全码、开户行、预留手机号及私密备注等支付方式敏感信息**绝对不得**暴露给任何 AI 模型或 Bot。

## 决策

1. **双表账号隔离与记录级 AES-256-GCM 加密（`UserPaymentMethod` / `UserFinanceBill`）**：
   - 在 PostgreSQL 新增 `user_payment_methods` 与 `user_finance_bills` 两张用户级表，启用 PostgreSQL 行级安全（RLS，策略绑定 `app.user_id` 与 `(SELECT app_rls_bypass())`）并配置 `userId` `ON DELETE CASCADE`；账单外键 `paymentMethodId` 使用 `ON DELETE SET NULL` 并保留 `paymentMethodLabel` 快照，删除卡片不丢失历史账单记录。
   - 支付方式列表仅存储与返回脱敏元数据（类型、别名、机构、脱敏尾号 `accountMask`/`last4`、币种、账单日／还款日、额度／余额、是否默认、配色及 `hasSensitiveDetails` 标志）。
   - 完整卡号／账号、有效期、CVV、支行、预留手机与私密备注序列化为 `PaymentMethodSensitivePayload`，通过服务端 `SecretStore`（`ENCRYPTION_KEY` AES-256-GCM，AAD 绑定 `payment-method:<userId>:<methodId>`）密文写入 `secretCiphertext`，跨行或跨用户复制密文均无法解密。
   - 读取明文仅通过所有者专属 RPC `personalFinance/revealMethod`，强制调用 `requireIdentityConfirmation` 校验近期身份确认，并同步写入安全事件（`credential.revealed`）与审计日志（不含任何敏感原文）。

2. **客户端双模存储与无缝上云**：
   - 手机端 `apps/mobile/lib/personal-finance.ts` 优先同步服务端 `personalFinance/*` RPC 并缓存非敏感摘要；当服务端尚未升级（404）或离线时自动切换至本地模式，敏感字段单独存入每卡独立 `expo-secure-store` Keychain 键（不写入普通 JSON 缓存）。
   - 后端就绪后自动经由 `personalFinance/importLocal` 幂等迁移并映射本地 `paymentMethodId`，确认入库后立即清除本地 Keychain 明文副本；账号退出或切换会话时通过 `registerSessionDiskCache` 清理内存、缓存文件与本地密钥项。

3. **Bot 协同记账的硬隔离工具面**：
   - 仅向账号所有者亲自发起的非外部通道、非后台触发对话暴露 3 个账单工具：`finance_list_bills`（只读）、`finance_get_summary`（只读）与 `finance_record_bill`（写入，走既有审批与审计体系，标记 `source = "bot"`），并受「设置 → Bot 应用权限」中 `financeLedger` 开关确定性门控。
   - 工具层无任何 `reveal`、解密或读写银行卡敏感字段的接口；`finance_list_bills` 仅提供支付方式非敏感标签与后 4 位（供记账匹配），代码路径绝不访问 `secretCiphertext` 或 `SecretStore`。

## 后果

- 零新增第三方 npm 依赖与零新增原生 iOS 权限，手机端可随纯 JS 侧载 OTA 立即先以本地 Keychain 模式使用，待服务端部署应用 `20261126120000_personal_finance` 迁移后自动无缝升级为云端加密同步并启用 Bot 协同记账。
- 账单表与支付方式敏感密文完全独立备份与删除，符合 `docs/security.md` 个人数据最小暴露原则；真实 PostgreSQL 迁移、线上身份确认弹窗与真机交互仍需发布后实测验收。
