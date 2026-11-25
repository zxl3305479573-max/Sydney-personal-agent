import { createHash } from "node:crypto";
import type { Hono } from "hono";

const closeScript = 'try{history.replaceState(null,"",location.pathname)}catch{}window.close();';
const scriptHash = createHash("sha256").update(closeScript).digest("base64");
const page = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sydney</title></head>
<body><p>可以关闭此窗口。 You can close this window.</p><script>${closeScript}</script></body>
</html>`;

export function mountIntegrationCallback(app: Hono) {
  for (const path of ["/api/v1/integrations/callback", "/integrations/callback"]) {
    app.get(path, (context) => {
      context.header("Cache-Control", "no-store");
      context.header("Referrer-Policy", "no-referrer");
      context.header("X-Content-Type-Options", "nosniff");
      context.header("X-Frame-Options", "DENY");
      context.header(
        "Content-Security-Policy",
        `default-src 'none'; script-src 'sha256-${scriptHash}'; base-uri 'none'; frame-ancestors 'none'`,
      );
      return context.html(page);
    });
  }
}
