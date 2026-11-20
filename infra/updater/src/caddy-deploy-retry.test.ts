import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const composeDir = path.resolve(import.meta.dirname, "../../compose");
const caddyfiles = ["Caddyfile.prod", "Caddyfile.cloudflare.example", "Caddyfile.ip.example"];

describe.each(caddyfiles)("%s deployment retry", (filename) => {
  const config = readFileSync(path.join(composeDir, filename), "utf8");

  it("bounds retries while an application container is being recreated", () => {
    expect(config).toContain("(deploy_retry) {");
    expect(config).toContain("lb_try_duration 10s");
    expect(config).toContain("lb_try_interval 250ms");
  });

  it("applies the retry policy to every remaining API upstream", () => {
    const lines = config.split(/\r?\n/);
    const upstreams = lines.flatMap((line, index) =>
      line.trimStart().startsWith("reverse_proxy ") ? [{ line, index }] : [],
    );
    expect(upstreams).toHaveLength(8);
    for (const upstream of upstreams) {
      expect(upstream.line).toContain("api:3100");
      expect(lines[upstream.index + 1]?.trim()).toBe("import deploy_retry");
    }
  });

  it("retains health and readiness probes while closing browser application routes", () => {
    expect(config).toContain("@health path /health /ready");
    expect(config).toMatch(/handle \{\s*respond 404\s*\}/);
    expect(config).not.toContain("web:5173");
  });
});
