import { describe, expect, it } from "vitest";
import { parseMcpOAuthCallback } from "./mcp-oauth-callback";

describe("native MCP OAuth callback", () => {
  const attempt = {
    callbackUri: "https://api.example.test/mcp/oauth/callback",
    sessionId: "synthetic-session",
  };

  it("accepts a callback for this attempt, including provider metadata", () => {
    expect(
      parseMcpOAuthCallback(
        " https://api.example.test/mcp/oauth/callback?code=synthetic-code&state=synthetic-session&iss=provider ",
        attempt,
      ),
    ).toEqual({
      sessionId: "synthetic-session",
      code: "synthetic-code",
      state: "synthetic-session",
    });
  });

  it.each([
    "https://other.example.test/mcp/oauth/callback?code=c&state=synthetic-session",
    "https://api.example.test/other?code=c&state=synthetic-session",
    "https://api.example.test/mcp/oauth/callback?code=c&state=other",
    "https://api.example.test/mcp/oauth/callback?code=c&code=d&state=synthetic-session",
    "https://api.example.test/mcp/oauth/callback?code=c&state=synthetic-session&state=other",
    "https://api.example.test/mcp/oauth/callback?code=c&state=synthetic-session&error=cancelled",
    "https://api.example.test/mcp/oauth/callback?code=c&state=synthetic-session#fragment",
    "https://user@api.example.test/mcp/oauth/callback?code=c&state=synthetic-session",
    "https://api.example.test/mcp/oauth/callback?code=%0a&state=synthetic-session",
    "not a URL",
  ])("rejects an invalid or mismatched callback", (value) => {
    expect(parseMcpOAuthCallback(value, attempt)).toBeNull();
  });

  it("rejects insecure public callbacks and permits loopback development", () => {
    expect(
      parseMcpOAuthCallback("http://api.example.test/mcp/oauth/callback?code=c&state=s", {
        callbackUri: "http://api.example.test/mcp/oauth/callback",
        sessionId: "s",
      }),
    ).toBeNull();
    expect(
      parseMcpOAuthCallback("http://127.0.0.1:3000/mcp/oauth/callback?code=c&state=s", {
        callbackUri: "http://127.0.0.1:3000/mcp/oauth/callback",
        sessionId: "s",
      }),
    ).toEqual({ sessionId: "s", code: "c", state: "s" });
  });

  it("accepts the planned API callback only when selected by the server", () => {
    const apiAttempt = {
      callbackUri: "https://api.example.test/api/mcp/oauth/callback",
      sessionId: "s",
    };
    expect(
      parseMcpOAuthCallback(
        "https://api.example.test/api/mcp/oauth/callback?code=c&state=s",
        apiAttempt,
      ),
    ).toEqual({ sessionId: "s", code: "c", state: "s" });
    expect(
      parseMcpOAuthCallback(
        "https://api.example.test/mcp/oauth/callback?code=c&state=s",
        apiAttempt,
      ),
    ).toBeNull();
  });

  it("rejects excessive callback data and invalid configured callbacks", () => {
    expect(
      parseMcpOAuthCallback(
        `https://api.example.test/mcp/oauth/callback?code=${"x".repeat(4097)}&state=synthetic-session`,
        attempt,
      ),
    ).toBeNull();
    expect(
      parseMcpOAuthCallback("https://api.example.test/mcp/oauth/callback?code=c&state=s", {
        callbackUri: "https://api.example.test/mcp/oauth/callback?extra=value",
        sessionId: "s",
      }),
    ).toBeNull();
  });
});
