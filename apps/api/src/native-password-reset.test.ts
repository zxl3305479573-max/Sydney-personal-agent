import { createHash } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  mountNativePasswordReset,
  NATIVE_PASSWORD_RESET_PATH,
  passwordResetPageLink,
} from "./native-password-reset.js";

const token = "abcdefghijklmnop123456";

describe("API-hosted password reset", () => {
  it("uses only the mapped HTTPS origin and never passes credentials to an app scheme", () => {
    const link = new URL(
      passwordResetPageLink(
        `https://public.example/api/auth/reset-password/${token}?callbackURL=https://foreign.example`,
      ),
    );
    expect(link.origin).toBe("https://public.example");
    expect(link.pathname).toBe(NATIVE_PASSWORD_RESET_PATH);
    expect([...link.searchParams]).toEqual([["token", token]]);
    expect(
      passwordResetPageLink(`http://127.0.0.1:3100/api/auth/reset-password/${token}`),
    ).toContain("http://127.0.0.1:3100/");
    for (const source of [
      `http://public.example/api/auth/reset-password/${token}`,
      `https://user@public.example/api/auth/reset-password/${token}`,
      `https://public.example/other/${token}`,
      "https://public.example/api/auth/reset-password/short",
    ])
      expect(() => passwordResetPageLink(source)).toThrow();
  });

  it("serves a static non-reflecting form without a database or web app, including after issuance is disabled", async () => {
    const app = new Hono();
    mountNativePasswordReset(app);
    const response = await app.request(
      `${NATIVE_PASSWORD_RESET_PATH}?token=${token}&error=%3Cscript%3E`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await response.text();
    expect(html).not.toContain(token);
    expect(html).not.toContain("rakazo://");
    expect(html).toContain('fetch("/api/auth/reset-password"');
    const policy = response.headers.get("content-security-policy")!;
    for (const tag of ["script", "style"]) {
      const content = html.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))![1]!;
      expect(policy).toContain(`'sha256-${createHash("sha256").update(content).digest("base64")}'`);
    }
    expect(policy).toContain("frame-ancestors 'none'");
    expect(await (await app.request(NATIVE_PASSWORD_RESET_PATH, { method: "HEAD" })).text()).toBe(
      "",
    );
    expect((await app.request(NATIVE_PASSWORD_RESET_PATH, { method: "POST" })).status).toBe(404);
  });
});
