import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const composeDir = path.resolve(import.meta.dirname, "../../compose");

describe.each(["docker-compose.images.yml"])("%s web", (file) => {
  const compose = parse(readFileSync(path.join(composeDir, file), "utf8")) as {
    services: Record<string, { pids_limit?: number; environment?: Record<string, unknown> }>;
  };
  const web = compose.services.web;

  it("caps Rolldown's per-CPU thread pool well below its pids_limit (#2430)", () => {
    const threads = Number(web?.environment?.RAYON_NUM_THREADS);
    expect(threads).toBeGreaterThan(0);
    expect(threads).toBeLessThan((web?.pids_limit ?? 0) / 4);
  });
});

describe("production Web retirement", () => {
  const production = parse(readFileSync(path.join(composeDir, "docker-compose.prod.yml"), "utf8"), {
    merge: true,
  }) as {
    services: Record<
      string,
      {
        build?: { target?: string; args?: Record<string, string> };
        depends_on?: Record<string, unknown>;
        environment?: Record<string, unknown>;
      }
    >;
    volumes: Record<string, unknown>;
  };
  const overlay = parse(
    readFileSync(path.join(composeDir, "docker-compose.client-only.yml"), "utf8"),
    { customTags: [{ tag: "!override", resolve: (value: unknown) => value, collection: "map" }] },
  ) as { services: Record<string, unknown> };

  it("removes the production service, archive mount and Web dependencies", () => {
    expect(production.services).not.toHaveProperty("web");
    expect(production.volumes).not.toHaveProperty("webassets");
    for (const service of Object.values(production.services)) {
      for (const dependency of Object.keys(service.depends_on ?? {})) {
        expect(production.services).toHaveProperty(dependency);
      }
    }
    expect(production.services.caddy?.depends_on).toEqual({
      api: { condition: "service_started" },
    });
    expect(overlay.services).not.toHaveProperty("web");
  });

  it("keeps client callbacks and screen routes on the API", () => {
    for (const key of [
      "SYDNEY_INTEGRATION_API_CALLBACK",
      "SYDNEY_LEGACY_SIGN_IN_RETURN_ON_API",
      "SYDNEY_SCREEN_PROXY_ON_API",
      "SYDNEY_WUYING_ASSETS_ON_API",
    ]) {
      expect(production.services.api?.environment?.[key]).toBe(`\${${key}:-true}`);
    }
    for (const key of [
      "SYDNEY_SCREEN_PROXY_UPSTREAM",
      "SYDNEY_WUYING_SCREEN_UPSTREAM",
      "SYDNEY_SIGN_IN_UPSTREAM",
      "SYDNEY_INTEGRATION_CALLBACK_UPSTREAM",
    ]) {
      expect(production.services.caddy?.environment?.[key]).toBe(`\${${key}:-api:3100}`);
    }
    expect(production.services.caddy?.environment).not.toHaveProperty("SYDNEY_BROWSER_UPSTREAM");
  });

  it("builds the production roles before the optional self-host Web layer", () => {
    for (const service of ["api", "worker", "migrate"]) {
      expect(production.services[service]?.build?.target).toBe("server");
      expect(production.services[service]?.build?.args?.SYDNEY_PREPARE_WUYING_ASSETS).toBe(
        "${SYDNEY_PREPARE_WUYING_ASSETS:-true}",
      );
    }
    const dockerfile = readFileSync(path.join(composeDir, "Dockerfile"), "utf8");
    const [backend, selfHost] = dockerfile.split("FROM backend AS self-host");
    expect(backend).toContain("--target=api");
    expect(backend).not.toContain("--filter @rakazo/web build");
    expect(selfHost).toContain("--filter @rakazo/web build");
    expect(dockerfile.trimEnd().endsWith("FROM backend AS server")).toBe(true);
  });

  it("keeps the native screen bridge attached to the API without a legacy Web bridge", () => {
    const nativeOverlay = parse(
      readFileSync(
        path.join(composeDir, "../native-linux/client-only.overlay.example.yml"),
        "utf8",
      ),
    ) as { services: Record<string, { network_mode?: string }> };
    expect(nativeOverlay.services).not.toHaveProperty("native-screen-web-loopback");
    expect(nativeOverlay.services["native-screen-api-loopback"]?.network_mode).toBe("service:api");
  });
});
