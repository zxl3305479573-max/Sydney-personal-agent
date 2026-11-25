import { createHash } from "node:crypto";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { mountIntegrationCallback } from "./integration-callback.js";

describe("integration callback", () => {
  it.each(["/api/v1/integrations/callback", "/integrations/callback"])(
    "serves a static, non-cacheable closing page at %s without reflecting parameters",
    async (path) => {
      const app = new Hono();
      mountIntegrationCallback(app);
      const response = await app.request(`${path}?code=private-code&state=private-state`);
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
      const scriptHash = createHash("sha256")
        .update('try{history.replaceState(null,"",location.pathname)}catch{}window.close();')
        .digest("base64");
      expect(response.headers.get("content-security-policy")).toContain(
        `script-src 'sha256-${scriptHash}'`,
      );
      expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
      expect(body).toContain("window.close();");
      expect(body).toContain("history.replaceState");
      expect(body).not.toContain("private-code");
      expect(body).not.toContain("private-state");
    },
  );
});
