import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { MCP_NATIVE_CALLBACK_PATH, mountMcpNativeCallback } from "./mcp-native-callback.js";

describe("native MCP callback page", () => {
  it("serves a restricted static page without reflecting or exchanging credentials", async () => {
    const app = new Hono();
    mountMcpNativeCallback(app);
    const response = await app.request(
      `${MCP_NATIVE_CALLBACK_PATH}?code=synthetic-secret&state=synthetic-session`,
    );
    const body = await response.text();
    const script = body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(body).not.toContain("synthetic-secret");
    expect(body).not.toContain("synthetic-session");
    expect(body).toContain("history.replaceState");
    expect(body).not.toContain("fetch(");
    expect(script).toBeTruthy();
    const hash = createHash("sha256").update(script!).digest("base64");
    expect(response.headers.get("content-security-policy")).toContain(
      `script-src 'sha256-${hash}'`,
    );
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect((await app.request(MCP_NATIVE_CALLBACK_PATH, { method: "POST" })).status).toBe(404);
  });

  it.each([
    ["?code=sample&state=session", true],
    ["?code=sample&code=other&state=session", false],
    ["?code=sample&state=session&error=denied", false],
    ["?code=sample", false],
    ["?code=%0A&state=session", false],
    [`?code=${"a".repeat(4097)}&state=session`, false],
  ])("only makes a valid return address available for copying: %s", async (query, valid) => {
    const app = new Hono();
    mountMcpNativeCallback(app);
    const body = await (await app.request(MCP_NATIVE_CALLBACK_PATH)).text();
    const script = body.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    const field = { value: "", hidden: true };
    const status = { textContent: "" };
    let cleaned = "";
    const location = new URL(`https://example.test${MCP_NATIVE_CALLBACK_PATH}${query}`);
    runInNewContext(script, {
      location,
      URLSearchParams,
      history: {
        replaceState: (_state: unknown, _title: string, path: string) => (cleaned = path),
      },
      document: { getElementById: (id: string) => (id === "address" ? field : status) },
    });
    expect(cleaned).toBe(MCP_NATIVE_CALLBACK_PATH);
    expect(field.hidden).toBe(!valid);
    expect(field.value).toBe(valid ? location.href : "");
  });
});
