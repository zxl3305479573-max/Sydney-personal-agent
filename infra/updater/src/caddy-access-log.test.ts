import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const composeDir = path.resolve(import.meta.dirname, "../../compose");
const caddyfiles = ["Caddyfile.prod", "Caddyfile.cloudflare.example", "Caddyfile.ip.example"];

describe.each(caddyfiles)("%s access log", (filename) => {
  const config = readFileSync(path.join(composeDir, filename), "utf8");
  const httpsSite = config.slice(
    config.lastIndexOf(
      filename === "Caddyfile.ip.example" ? "{$RAKAZO_HOST} {" : "{$RAKAZO_HOST:app.example.com} {",
    ),
  );
  const uriFilter = /request>uri regexp "(.+)" "\$\{1\}REDACTED"/.exec(config);

  it("logs every request on the HTTPS site as JSON to stdout", () => {
    expect(httpsSite).toContain("import access_log");
    if (filename === "Caddyfile.ip.example") {
      const domainSite = config.split("{$RAKAZO_HOST} {")[1]?.split("{$RAKAZO_PUBLIC_IP} {")[0];
      const ipSite = config.split("{$RAKAZO_PUBLIC_IP} {")[1];
      expect(domainSite).toContain("import access_log");
      expect(ipSite).toContain("import access_log");
    }
    expect(config).toContain("output stdout");
    expect(config).toContain("wrap json");
  });

  it("drops credential headers", () => {
    for (const field of [
      "request>headers>Authorization delete",
      "request>headers>Proxy-Authorization delete",
      "request>headers>Cookie delete",
      "request>headers>Referer delete",
      "resp_headers>Set-Cookie delete",
      "resp_headers>Location delete",
    ]) {
      expect(config).toContain(field);
    }
  });

  it("keeps the exact legacy sign-in return on the API", () => {
    expect(config).toMatch(
      /handle \/sign-in \{\s*reverse_proxy \{\$SYDNEY_SIGN_IN_UPSTREAM:api:3100\}/,
    );
  });

  it("redacts sensitive path segments and every query string", () => {
    // Go and JavaScript agree on this pattern's syntax, so the replacement is checked as written.
    const pattern = new RegExp(uriFilter![1]!.replaceAll("\\\\", "\\"), "g");
    const redact = (uri: string) => uri.replace(pattern, "$1REDACTED");
    expect(redact("/api/auth/reset-password/abc123?callbackURL=%2Freset")).toBe(
      "/api/auth/reset-password/REDACTEDREDACTED",
    );
    expect(redact("/api/auth/verify-email?token=t0k&callbackURL=%2F")).toBe(
      "/api/auth/verify-emailREDACTED",
    );
    expect(redact("/api/auth/callback/oidc?code=c0de&state=st4te&q=1")).toBe(
      "/api/auth/callback/oidcREDACTED",
    );
    expect(redact("/webhook?hub.verify_token=v&hub.mode=subscribe")).toBe("/webhookREDACTED");
    expect(
      redact(
        "/novnc/session/control/1792540000.c4p4b1l1ty/vnc.html?path=novnc%2Fsession%2Fcontrol%2F1792540000.c4p4b1l1ty%2Fwebsockify&view_only=false",
      ),
    ).toBe("/novnc/session/control/REDACTED/vnc.htmlREDACTED");
    expect(redact("/novnc/session/view/1792540000.c4p4b1l1ty/websockify")).toBe(
      "/novnc/session/view/REDACTED/websockify",
    );
    expect(redact("/rpc/threads/get?botId=b1")).toBe("/rpc/threads/getREDACTED");
    expect(redact("/api/mcp/oauth/callback?%63ode=secret&st%61te=value&unknown=secret")).toBe(
      "/api/mcp/oauth/callbackREDACTED",
    );
    expect(redact("/mcp/oauth/callback?code=one&code=two")).toBe("/mcp/oauth/callbackREDACTED");
  });
});

describe("Caddyfile.cloudflare.example client address", () => {
  const config = readFileSync(path.join(composeDir, "Caddyfile.cloudflare.example"), "utf8");
  const ranges = (pattern: RegExp) => pattern.exec(config)?.[1]?.trim().split(/\s+/);

  it("reads the client from the CDN header only for the ranges it accepts traffic from", () => {
    const trusted = ranges(/trusted_proxies static ([^\n]+)/);
    const accepted = ranges(/@direct_origin not remote_ip ([^\n]+)/);
    expect(trusted?.length).toBeGreaterThan(0);
    expect(trusted).toEqual(accepted);
    expect(config).toContain("client_ip_headers CF-Connecting-IP");
  });
});
