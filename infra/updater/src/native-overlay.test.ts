import { readFileSync } from "node:fs";
import path from "node:path";
import { composeUpArgv } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { resolveUpdaterConfig } from "./updater-logic.js";

const root = path.resolve(import.meta.dirname, "../../..");
const overlay = parse(
  readFileSync(path.join(root, "infra/native-linux/production.overlay.example.yml"), "utf8"),
) as {
  services: Record<
    string,
    {
      volumes?: string[];
      group_add?: string[];
      user?: string;
      network_mode?: string;
      command?: string[];
      ports?: unknown[];
      cap_drop?: string[];
      environment?: Record<string, string>;
    }
  >;
};

function requiredService(name: string) {
  const service = overlay.services[name];
  if (!service) throw new Error(`overlay example is missing ${name}`);
  return service;
}

describe("native Linux production overlay draft", () => {
  it("keeps the real driver socket out of application containers", () => {
    for (const name of ["api", "worker"]) {
      const service = requiredService(name);
      expect(service.volumes).toEqual(["/var/lib/rakazo-native/run:/run/rakazo-native:ro"]);
      expect(service.group_add).toEqual(["986"]);
    }
    expect(requiredService("native-driver-proxy")).toMatchObject({
      user: "996:986",
      network_mode: "none",
      volumes: expect.arrayContaining(["/var/lib/sydney-tunnel-jail/run:/driver:ro"]),
    });
  });

  it("bridges host loopback through a Unix socket into the API namespace", () => {
    const host = requiredService("native-screen-host-bridge");
    const api = requiredService("native-screen-api-loopback");
    expect(overlay.services).not.toHaveProperty("native-screen-web-loopback");
    expect(host.network_mode).toBe("host");
    expect(host.command).toContain("TCP:127.0.0.1:6080");
    expect(api.network_mode).toBe("service:api");
    expect(api.command).toContain("TCP-LISTEN:16080,bind=127.0.0.1,reuseaddr,fork");
    expect(api.command).toContain("UNIX-CONNECT:/run/rakazo-native/screen.sock");
    for (const service of [host, api, requiredService("native-driver-proxy")]) {
      expect(service.ports).toBeUndefined();
      expect(service.user).toBe("996:986");
      expect(service.cap_drop).toContain("ALL");
    }
  });

  it("reconciles the API screen bridge using the persistent overlay", () => {
    const updateServicesVariable = `\${RAKAZO_UPDATE_SERVICES:-}`;
    const updateServices = requiredService("updater").environment?.RAKAZO_UPDATE_SERVICES;
    expect(updateServices).toBe(`native-screen-api-loopback,${updateServicesVariable}`);
    const config = resolveUpdaterConfig(
      {
        RAKAZO_DEPLOY_DIR: "/srv/rakazo",
        RAKAZO_UPDATER_TOKEN: "fake-review-updater-token-000000000000",
        RAKAZO_COMPOSE_OVERLAY_FILE: "/etc/rakazo/compose/production.overlay.yml",
        RAKAZO_UPDATE_SERVICES: updateServices?.replace(
          updateServicesVariable,
          "native-screen-api-loopback,sidecar",
        ),
      },
      {
        inspect: () =>
          ({
            mode: 0o640,
            uid: 0,
            isFile: () => true,
            isSymbolicLink: () => false,
          }) as never,
      },
    );
    const invocation = composeUpArgv({
      composeFiles: config.composeFiles,
      services: config.updateServices,
    });
    expect(config.updateServices).toEqual([
      "api",
      "worker",
      "native-screen-api-loopback",
      "sidecar",
    ]);
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--file",
        "/srv/rakazo/infra/compose/docker-compose.prod.yml",
        "/etc/rakazo/compose/production.overlay.yml",
        "api",
        "worker",
        "native-screen-api-loopback",
      ]),
    );
    expect(invocation.args).not.toContain("web");
    expect(invocation.args).not.toContain("native-screen-web-loopback");
  });
});
