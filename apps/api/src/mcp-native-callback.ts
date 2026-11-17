import { createHash } from "node:crypto";
import type { Hono } from "hono";

export const MCP_NATIVE_CALLBACK_PATH = "/api/mcp/oauth/callback";

const script = `(() => {
  const address = location.href;
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const valid = address.length <= 16384 && !location.hash &&
    params.getAll("code").length === 1 && params.getAll("state").length === 1 &&
    !!code && code.length <= 4096 && !/[\\x00-\\x1f\\x7f]/.test(code) &&
    !!params.get("state") && !params.has("error");
  history.replaceState(null, "", location.pathname);
  const field = document.getElementById("address");
  const status = document.getElementById("status");
  if (!valid) {
    status.textContent = "授权未完成，请返回 Sydney 重新开始。";
    return;
  }
  field.value = address;
  field.hidden = false;
  status.textContent = "复制下方地址，返回 Sydney 粘贴完成连接。请勿分享此地址。";
})();`;

const style =
  "body{font:16px system-ui;margin:2rem auto;padding:0 1rem;max-width:32rem;line-height:1.6}textarea{box-sizing:border-box;width:100%;min-height:8rem;font:inherit}";
const hash = (source: string) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`;
const policy = [
  "default-src 'none'",
  `script-src ${hash(script)}`,
  `style-src ${hash(style)}`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");
const page = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sydney 授权返回</title><style>${style}</style></head><body><h1>返回 Sydney</h1><p id="status" role="status">正在检查授权结果…</p><textarea id="address" aria-label="授权返回地址" readonly hidden></textarea><noscript>请启用 JavaScript 后重新开始授权。</noscript><script>${script}</script></body></html>`;

export function mountMcpNativeCallback(app: Hono) {
  app.all(MCP_NATIVE_CALLBACK_PATH, (context) => {
    context.header("Cache-Control", "no-store");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    context.header("Content-Security-Policy", policy);
    if (context.req.method !== "GET" && context.req.method !== "HEAD") {
      return context.text("Not Found", 404);
    }
    return context.html(page);
  });
}
