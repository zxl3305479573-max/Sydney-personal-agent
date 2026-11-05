# 注册开放实施清单

关联需求：PA-018。

## 目标

开放当前 PC Web 的邮箱密码注册，并保持注册策略由服务器环境控制。当前部署没有邮件服务，因此本次先启用无邮箱依赖的密码注册；邮箱验证、邮件验证码和密码找回需要后续配置事务邮件服务后再验收。

## 配置清单

- [x] `SIGNUPS_ENABLED=true`
- [ ] `SIGNUP_ALLOWLIST`：如果只允许指定邮箱，配置邮箱或域名列表；为空表示不限制邮箱
- [x] 旧项目 QQ 邮箱 SMTP 已转换为 `EMAIL_PROVIDER=smtp`、`SMTP_URL=smtps://...`、`EMAIL_FROM=...` 并写入后台受保护环境文件
- [ ] 保持 `BETTER_AUTH_URL` 与正式 HTTPS 来源一致
- [ ] 确认 `AUTH_PASSWORD_ENABLED=true`，保留邮箱密码注册
- [ ] 生产环境不启用 `EMAIL_EMULATOR`
- [x] 修改环境文件前保留备份，重启 `sydney-api` 后检查 `/ready`

## 验收顺序

1. 备份后台环境文件，只修改注册开关。
2. 重启 `sydney-api`，确认服务 active、`/ready` 返回成功。
3. 用临时邮箱完成一次密码注册和会话读取，再删除临时账号。
4. 配置事务邮件后，验证注册验证链接、六位邮箱验证码、密码找回和错误地址提示。
5. 配置 allowlist 后，验证允许地址、拒绝地址、未验证账号和首个账号准入。
6. 在正式 HTTPS 域名上验证 PC 登录、注册、窄屏表单和深浅主题。
7. 将实际结果同步到 `PLAN.md`、`DEVELOPMENT_LOG.md`、`VALIDATION.md` 和 `OPERATIONS.md`。

## 当前结果

2026-11-05 已确认本地 `.env` 的注册开关为 `true`，后台 `/etc/sydney/backend.env` 的注册开关原为 `false`。备份环境文件后已将开关改为 `true`，重启后台 API，完成密码注册、会话读取和测试账号删除的接口回归。随后复用旧项目 QQ 邮箱 SMTP 配置，能力接口变为 `passwordAuth=true`、`emailCode=true`、`passwordReset=true`。

QQ 邮箱配置只写入后台 `/etc/sydney/backend.env`，不写入仓库；配置前备份为 `/etc/sydney/backend.env.before-qq-smtp-20261105`。用 `example.invalid` 测试地址触发的真实发送产生退信，已删除两个临时账号和对应验证记录；后续测试不得使用会触发外部投递的地址。用户截图还发现认证邮件标题和正文保留上游品牌，已在仓库把所有邮件用户可见文案改为 Sydney，定向测试 52 项和认证包/API 类型检查通过。

后台模板源码已同步并备份原 `email.tsx`；用现有 `build-server.mjs` 重建 API 时服务器 SSH 在构建期间超时，构建结果、产物替换和重启后的品牌标题均未复核。不能把线上邮件文案描述为已生效。回滚可恢复 `/etc/sydney/backend.env.before-qq-smtp-20261105` 和 `index.js.before-sydney-email-brand-20261105` 后重启 `sydney-api`；回滚未演练。
