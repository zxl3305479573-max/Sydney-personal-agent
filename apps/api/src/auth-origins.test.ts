import { createAuth } from "@rakazo/auth";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  authExtraOrigins,
  createCorsMiddleware,
  isTrustedOrigin,
  MOBILE_AUTH_ORIGINS,
} from "./app.js";
import { loadEnv } from "./env.js";

// Better Auth skips its origin middleware under NODE_ENV=test, so check the
// matcher that production uses for callback URLs and request origins.
async function trusted(url: string) {
  const auth = createAuth({} as never, {
    secret: "offline-auth-secret-at-least-32-characters",
    baseURL: "https://api.example.test",
    webOrigin: "https://app.example.test",
    signupsEnabled: undefined,
    signupAllowlist: undefined,
    extraOrigins: MOBILE_AUTH_ORIGINS,
  });
  return (await auth.$context).isTrustedOrigin(url);
}

const env = {
  webOrigin: "http://127.0.0.1:5173",
  apiUrl: "http://127.0.0.1:3100",
  authUrl: "http://127.0.0.1:5173",
};

describe("CORS origins", () => {
  it("allows the configured site, its loopback twin, and the mobile dev servers", () => {
    for (const origin of [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:3100",
      "http://localhost:8081",
      "http://127.0.0.1:19006",
      "http://[::1]:8081",
      "rakazo://sign-in",
      "",
    ]) {
      expect(isTrustedOrigin(origin, env), origin).toBe(true);
    }
  });

  it("accepts the configured site when env values keep a trailing slash", () => {
    const envWithSlash = {
      webOrigin: "http://127.0.0.1:5173/",
      apiUrl: "http://127.0.0.1:3100/",
      authUrl: "http://127.0.0.1:5173/",
    };
    expect(isTrustedOrigin("http://127.0.0.1:5173", envWithSlash)).toBe(true);
    expect(isTrustedOrigin("http://localhost:5173", envWithSlash)).toBe(true);
  });

  it("rejects any other loopback port and any public origin", () => {
    for (const origin of [
      "http://127.0.0.1:9",
      "http://localhost:45173",
      "http://[::1]:9",
      "https://evil.example",
      "exp://192.168.1.20:8081",
    ]) {
      expect(isTrustedOrigin(origin, env), origin).toBe(false);
    }
  });
});

describe("mobile auth origins", () => {
  it("does not trust an arbitrary Expo host as a callback", async () => {
    for (const url of [
      "exp://attacker.example.test:19000/--/verification-lure",
      "exp://192.168.1.20:8081",
      "exp://",
    ]) {
      expect(await trusted(url), url).toBe(false);
    }
  });

  it("keeps the app scheme, Expo web dev server and web origin", async () => {
    for (const url of [
      "rakazo://sign-in",
      "http://localhost:8081/sign-in",
      "https://app.example.test/sign-in",
    ]) {
      expect(await trusted(url), url).toBe(true);
    }
  });
});

describe("explicit dual origins", () => {
  it("uses the same configured additions for CORS and Better Auth", async () => {
    const configured = loadEnv({
      DATABASE_URL: "postgres://test:test@127.0.0.1:5432/test",
      NODE_ENV: "test",
      WEB_ORIGIN: "https://app.example.test",
      BETTER_AUTH_URL: "https://app.example.test",
      EXTRA_TRUSTED_ORIGINS: "https://192.0.2.10,https://127.0.0.1:9443",
    });
    const auth = createAuth({} as never, {
      secret: "offline-auth-secret-at-least-32-characters",
      baseURL: configured.authUrl,
      webOrigin: configured.webOrigin,
      signupsEnabled: undefined,
      signupAllowlist: undefined,
      extraOrigins: authExtraOrigins(configured),
    });
    const context = await auth.$context;
    const app = new Hono();
    app.use("*", createCorsMiddleware(configured));
    app.get("/test", (c) => c.text("ok"));
    for (const origin of [
      "https://app.example.test",
      "https://192.0.2.10",
      "https://127.0.0.1:9443",
    ]) {
      expect(context.isTrustedOrigin(origin)).toBe(true);
      const response = await app.request("/test", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "GET" },
      });
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    }
    for (const origin of [
      "https://192.0.2.11",
      "https://192.0.2.10:8443",
      "http://192.0.2.10",
      "https://app.example.test.evil.test",
      "https://localhost:9443",
      "null",
    ]) {
      expect(context.isTrustedOrigin(origin), origin).toBe(false);
      const response = await app.request("/test", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "GET" },
      });
      expect(response.headers.get("access-control-allow-origin"), origin).toBeNull();
    }
    expect(context.isTrustedOrigin("https://192.0.2.10/sign-in")).toBe(true);
    expect(context.isTrustedOrigin("https://192.0.2.11/sign-in")).toBe(false);
  });

  it("runs Better Auth origin and callback checks on isolated requests", async () => {
    const auth = createAuth({} as never, {
      secret: "offline-auth-secret-at-least-32-characters",
      baseURL: "https://app.example.test",
      webOrigin: "https://app.example.test",
      signupsEnabled: undefined,
      signupAllowlist: undefined,
      extraOrigins: authExtraOrigins({ extraTrustedOrigins: ["https://192.0.2.10"] }),
    });
    const context = await auth.$context;
    context.skipOriginCheck = false;
    const request = (origin: string, callbackURL: string) =>
      auth.handler(
        new Request("https://app.example.test/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            cookie: "test=present",
          },
          body: JSON.stringify({ email: "test@example.test", password: "test", callbackURL }),
        }),
      );

    for (const origin of ["https://app.example.test", "https://192.0.2.10"]) {
      const response = await request(origin, "https://evil.example.test/callback");
      expect(response.status, origin).toBe(403);
      expect((await response.json()).code, origin).toBe("INVALID_CALLBACK_URL");
    }
    for (const origin of ["https://192.0.2.11", "http://192.0.2.10", "null"]) {
      const response = await request(origin, "https://app.example.test/callback");
      expect(response.status, origin).toBe(403);
      expect((await response.json()).code, origin).toBe(
        origin === "null" ? "MISSING_OR_NULL_ORIGIN" : "INVALID_ORIGIN",
      );
    }
  });
});
