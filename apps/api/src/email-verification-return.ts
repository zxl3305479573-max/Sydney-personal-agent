import { EMAIL_VERIFICATION_LANDING_PATH } from "@rakazo/auth";
import type { Hono } from "hono";

const prefix = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sydney 邮箱验证</title></head><body><h1>返回 Sydney</h1>`;
const neutralPage = `${prefix}<p>请返回 Sydney 手机或桌面应用登录。如果仍提示验证邮箱，请重新申请验证邮件。</p></body></html>`;
const errorPage = `${prefix}<p>邮箱验证未完成，请返回 Sydney 重新申请验证邮件。</p></body></html>`;
const legacyPage = `${prefix}<p>请返回 Sydney 手机或桌面应用继续操作。</p></body></html>`;
const legacyErrorPage = `${prefix}<p>操作未完成，请返回 Sydney 手机或桌面应用重试。</p></body></html>`;

export function mountEmailVerificationReturn(app: Hono, legacySignIn = false) {
  const paths = legacySignIn
    ? [EMAIL_VERIFICATION_LANDING_PATH, "/sign-in"]
    : [EMAIL_VERIFICATION_LANDING_PATH];
  for (const path of paths) {
    app.all(path, (context) => {
      context.header("cache-control", "no-store");
      context.header("referrer-policy", "no-referrer");
      context.header("x-content-type-options", "nosniff");
      context.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
      context.header("x-frame-options", "DENY");
      if (context.req.method !== "GET" && context.req.method !== "HEAD") {
        context.header("allow", "GET, HEAD");
        return context.body(null, 405);
      }
      context.header("content-type", "text/html; charset=utf-8");
      if (context.req.method === "HEAD") return context.body(null);
      const hasError = new URL(context.req.url).searchParams.has("error");
      return context.html(
        path === "/sign-in"
          ? hasError
            ? legacyErrorPage
            : legacyPage
          : hasError
            ? errorPage
            : neutralPage,
      );
    });
  }
}
