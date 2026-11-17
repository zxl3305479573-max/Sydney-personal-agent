import { EMAIL_VERIFICATION_LANDING_PATH } from "@rakazo/auth";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountEmailVerificationReturn } from "./email-verification-return.js";

describe("email verification return", () => {
  it("serves a neutral, non-cacheable page without reflecting callback parameters", async () => {
    const app = new Hono();
    mountEmailVerificationReturn(app);
    const response = await app.request(
      `${EMAIL_VERIFICATION_LANDING_PATH}?error=private-value&token=private-token`,
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(body).toContain("返回 Sydney");
    expect(body).toContain("邮箱验证未完成");
    expect(body).not.toContain("private-value");
    expect(body).not.toContain("private-token");
    expect(body).not.toContain("验证成功");
    const neutral = await app.request(EMAIL_VERIFICATION_LANDING_PATH);
    expect(await neutral.text()).not.toContain("验证成功");
    const head = await app.request(EMAIL_VERIFICATION_LANDING_PATH, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await app.request(EMAIL_VERIFICATION_LANDING_PATH, { method: "POST" })).status).toBe(
      405,
    );
  });

  it("serves the legacy sign-in path only when explicitly enabled", async () => {
    const disabled = new Hono();
    mountEmailVerificationReturn(disabled);
    expect((await disabled.request("/sign-in")).status).toBe(404);
    const enabled = new Hono();
    mountEmailVerificationReturn(enabled, true);
    const response = await enabled.request("/sign-in?error=private-error&next=private-target");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain("操作未完成");
    expect(body).not.toContain("private-error");
    expect(body).not.toContain("private-target");
    expect((await enabled.request("/sign-in/extra")).status).toBe(404);
    expect((await enabled.request("/sign-in", { method: "POST" })).status).toBe(405);
  });
});
