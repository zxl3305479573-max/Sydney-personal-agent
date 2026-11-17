import { createHash } from "node:crypto";
import { isLoopbackHost } from "@rakazo/contracts/network-host";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@rakazo/core";
import type { Hono } from "hono";

export const NATIVE_PASSWORD_RESET_PATH = "/api/auth/native-reset";

const resetScript = `(() => {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const valid = params.getAll("token").length === 1 &&
    [...params.keys()].every(key => key === "token") &&
    !location.hash && /^[A-Za-z0-9_-]{16,256}$/.test(token || "");
  history.replaceState(null, "", location.pathname);
  const form = document.getElementById("reset");
  const status = document.getElementById("status");
  const button = document.getElementById("submit");
  const password = document.getElementById("password");
  const confirmation = document.getElementById("confirmation");
  let pending = false;
  let complete = false;
  if (!valid) {
    button.disabled = true;
    status.textContent = "链接无效，请返回 Sydney 重新申请邮件。";
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!valid || pending || complete) return;
    if (password.value.length < ${MIN_PASSWORD_LENGTH} || password.value.length > ${MAX_PASSWORD_LENGTH} || password.value !== confirmation.value) {
      status.textContent = "请检查密码长度及两次输入是否一致。";
      return;
    }
    pending = true;
    button.disabled = true;
    status.textContent = "正在重置…";
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", credentials: "omit", redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, newPassword: password.value })
      });
      const body = await response.json();
      if (!response.ok || body.status !== true) throw new Error("reset failed");
      complete = true;
      password.value = "";
      confirmation.value = "";
      status.textContent = "密码已更新，请返回 Sydney 登录。";
    } catch {
      status.textContent = "未能确认重置成功，请先尝试新密码登录；如失败，可重试或重新申请邮件。";
    } finally {
      pending = false;
      button.disabled = complete;
    }
  });
})();`;

const resetStyle =
  "body{font:16px system-ui;margin:2rem auto;padding:0 1rem;max-width:28rem;color:#18181b;background:#fafafa}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;margin:.5rem 0 1rem;padding:.75rem;border:1px solid #71717a;border-radius:.75rem}p{line-height:1.6}";
function hashSource(source: string) {
  return `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
}

const resetPolicy = [
  "default-src 'none'",
  `script-src ${hashSource(resetScript)}`,
  `style-src ${hashSource(resetStyle)}`,
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const resetPage = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sydney 密码重置</title><style>${resetStyle}</style></head><body><h1>重置 Sydney 密码</h1><p>此页面由账号服务器提供。也可复制邮件中的原始链接，返回 Sydney 手机 App 粘贴并设置密码。不要转发重置链接。</p><form id="reset"><label for="password">新密码（${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符）</label><input id="password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" maxlength="${MAX_PASSWORD_LENGTH}" required><label for="confirmation">确认新密码</label><input id="confirmation" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}" maxlength="${MAX_PASSWORD_LENGTH}" required><button id="submit" type="submit">重置密码</button></form><p id="status" role="status" aria-live="polite"></p><noscript>请启用 JavaScript，或复制邮件链接到 Sydney 手机 App 完成重置。</noscript><script>${resetScript}</script></body></html>`;

export function passwordResetPageLink(authorizationUrl: string): string {
  const source = new URL(authorizationUrl);
  if (
    source.username ||
    source.password ||
    (source.protocol !== "https:" &&
      !(source.protocol === "http:" && isLoopbackHost(source.hostname)))
  )
    throw new Error("Password reset requires a public HTTPS origin or loopback development origin");
  const match = source.pathname.match(/^\/api\/auth\/reset-password\/([^/]+)$/);
  const token = match ? decodeURIComponent(match[1]!) : "";
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token)) throw new Error("Invalid password reset URL");
  const link = new URL(NATIVE_PASSWORD_RESET_PATH, source.origin);
  link.searchParams.set("token", token);
  return link.href;
}

export function mountNativePasswordReset(app: Hono) {
  app.all(NATIVE_PASSWORD_RESET_PATH, (context) => {
    context.header("cache-control", "no-store");
    context.header("referrer-policy", "no-referrer");
    context.header("x-content-type-options", "nosniff");
    context.header("content-security-policy", resetPolicy);
    context.header("x-frame-options", "DENY");
    if (context.req.method !== "GET" && context.req.method !== "HEAD") {
      return context.text("Not Found", 404);
    }
    context.header("content-type", "text/html; charset=utf-8");
    if (context.req.method === "HEAD") return context.body(null);
    return context.html(resetPage);
  });
}
