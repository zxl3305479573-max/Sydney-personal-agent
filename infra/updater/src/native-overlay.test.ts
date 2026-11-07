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
    }
  >;
};

describe("native Linux production overlay draft", () => {
  it("keeps the real driver socket out of application containers", () => {
    for (const name of ["api", "worker"]) {
      expect(overlay.services[name].volumes).toEqual([
        "/var/lib/rakazo-native/run:/run/rakazo-native:ro",
      ]);
      expect(overlay.services[name].group_add).toEqual(["986"]);
    }
    expect(overlay.services["native-driver-proxy"]).toMatchObject({
      user: "996:986",
      network_mode: "none",
      volumes: expect.arrayContaining(["/var/lib/sydney-tunnel-jail/run:/driver:ro"]),
    });
  });

  it("bridges host loopback through a Unix socket into web loopback", () => {
    const host = overlay.services["native-screen-host-bridge"];
    const web = overlay.services["native-screen-web-loopback"];
    expect(host.network_mode).toBe("host");
    expect(host.command).toContain("TCP:127.0.0.1:6080");
    expect(web.network_mode).toBe("service:web");
    expect(web.command).toContain("TCP-LISTEN:16080,bind=127.0.0.1,reuseaddr,fork");
    expect(web.command).toContain("UNIX-CONNECT:/run/rakazo-native/screen.sock");
    for (const service of [host, web, overlay.services["native-driver-proxy"]]) {
      expect(service.ports).toBeUndefined();
      expect(service.user).toBe("996:986");
      expect(service.cap_drop).toContain("ALL");
    }
  });

  it("includes the overlay and web loopback in updater reconciliation", () => {
    const config = resolveUpdaterConfig(
      {
        RAKAZO_DEPLOY_DIR: "/srv/rakazo",
        RAKAZO_UPDATER_TOKEN: "fake-review-updater-token-000000000000",
        RAKAZO_COMPOSE_OVERLAY_FILE: "/etc/rakazo/compose/production.overlay.yml",
        RAKAZO_UPDATE_SERVICES: "native-screen-web-loopback",
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
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        "--file",
        "/srv/rakazo/infra/compose/docker-compose.prod.yml",
        "/etc/rakazo/compose/production.overlay.yml",
        "web",
        "native-screen-web-loopback",
      ]),
    );
  });
});
