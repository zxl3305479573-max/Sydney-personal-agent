import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lingui } from "@lingui/vite-plugin";
import type { DesktopStackProbeResponse } from "@rakazo/contracts";
import { buildIdAt } from "@rakazo/contracts/client-build";
import {
  appContentSecurityPolicy,
  CSP_REPORTING_ENDPOINTS,
  contentSecurityPolicyFor,
  parseContentSecuritySources,
  parseCrispWebsiteId,
} from "@rakazo/contracts/content-security-policy";
import { novncRequestPath } from "@rakazo/core/node/screen-proxy";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { PreviewServer, ViteDevServer } from "vite";
import { defineConfig, loadEnv } from "vite";
import { createNovncProxy } from "../../packages/core/src/node/novnc-proxy.ts";
import { resolveScreenProxySecret } from "../../packages/core/src/secrets-guard.ts";
import { createServiceLogger } from "../../packages/logging/src/env.ts";
import { apiProxy } from "./src/api-proxy.js";
import { ASSET_ARCHIVE_DIR, archiveAssets } from "./src/asset-archive.js";
import { missingAssetMiddleware } from "./src/missing-asset.js";
import { rakazoPwa } from "./src/pwa/plugin.js";

const webPort = Number(process.env.WEB_PORT ?? 5173);
const DESKTOP_STACK_PROBE_PATH = "/.well-known/rakazo-desktop-stack";
const DESKTOP_STACK_TOKEN_HEADER = "x-rakazo-desktop-stack-token";
const screenLog = createServiceLogger({ service: "rakazo-web" });

function socketErrorCode(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code) ? code : "UNKNOWN";
}

function equalStackToken(expected: string, supplied: string | string[] | undefined) {
  if (expected === "" || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.byteLength === suppliedBytes.byteLength &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

function attachDesktopStackProbe(
  server: ViteDevServer | PreviewServer,
  token: string,
  imageTag: string,
) {
  server.middlewares.use((req, res, next) => {
    if (req.url?.split("?", 1)[0] !== DESKTOP_STACK_PROBE_PATH) {
      next();
      return;
    }
    if (!equalStackToken(token, req.headers[DESKTOP_STACK_TOKEN_HEADER])) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    const body: DesktopStackProbeResponse = { ok: true, imageTag };
    res.statusCode = 200;
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  });
}

function attachNovncProxy(server: ViteDevServer | PreviewServer, secret: string, api: string) {
  const proxy = createNovncProxy({ secret, api, logger: screenLog });
  server.middlewares.use(proxy.handleHttp);
  server.httpServer?.on("upgrade", (req, socket, head) => {
    if (!novncRequestPath(req.url)) {
      socket.on("error", () => {});
      return;
    }
    void proxy.handleUpgrade(req, socket, head);
  });
}

export default defineConfig(({ command, mode }) => {
  // Names this build in every API request; the dev server has none, so the handshake stays off.
  const buildId = command === "build" ? buildIdAt(new Date()) : "";
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  const api = process.env.API_PROXY_TARGET ?? rootEnv.API_PROXY_TARGET ?? "http://127.0.0.1:3100";
  const previewHost = process.env.RAKAZO_HOST ?? rootEnv.RAKAZO_HOST ?? "localhost";
  const pcBackendHostname =
    process.env.PC_BACKEND_HOSTNAME?.trim() ?? rootEnv.PC_BACKEND_HOSTNAME?.trim() ?? "";
  const allowedHosts = [
    previewHost,
    ...(pcBackendHostname === "" ? [] : [pcBackendHostname]),
    ...(process.env.RAKAZO_ALLOWED_HOSTS ?? rootEnv.RAKAZO_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ];
  // Set by the server built from this config; reusing one config object for two servers would
  // leave the last one's list.
  let proxyHosts: readonly string[] | true = [];
  const proxy = apiProxy(api, () => proxyHosts);
  const screenProxySecret = () =>
    resolveScreenProxySecret({
      ...process.env,
      SCREEN_PROXY_SECRET: process.env.SCREEN_PROXY_SECRET ?? rootEnv.SCREEN_PROXY_SECRET,
      SANDBOX_SUPERVISOR_TOKEN:
        process.env.SANDBOX_SUPERVISOR_TOKEN ?? rootEnv.SANDBOX_SUPERVISOR_TOKEN,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? rootEnv.BETTER_AUTH_SECRET,
    });
  const performanceAssetDelayMs = Number(process.env.RAKAZO_PERFORMANCE_ASSET_DELAY_MS ?? 0);
  const desktopStackToken =
    process.env.RAKAZO_DESKTOP_STACK_TOKEN ?? rootEnv.RAKAZO_DESKTOP_STACK_TOKEN ?? "";
  const imageTag = process.env.RAKAZO_IMAGE_TAG ?? rootEnv.RAKAZO_IMAGE_TAG ?? "edge";
  // Invalid origins throw here, so the server refuses to start rather than serve a wider policy.
  const appPolicy = appContentSecurityPolicy({
    scriptSrc: parseContentSecuritySources(
      "RAKAZO_CSP_SCRIPT_SRC",
      process.env.RAKAZO_CSP_SCRIPT_SRC ?? rootEnv.RAKAZO_CSP_SCRIPT_SRC,
    ),
    connectSrc: parseContentSecuritySources(
      "RAKAZO_CSP_CONNECT_SRC",
      process.env.RAKAZO_CSP_CONNECT_SRC ?? rootEnv.RAKAZO_CSP_CONNECT_SRC,
    ),
    crisp: parseCrispWebsiteId(process.env.CRISP_WEBSITE_ID ?? rootEnv.CRISP_WEBSITE_ID) !== null,
  });
  return {
    build: {
      sourcemap: true,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // Shared chunks that build schemas run before the entry chunk's body, so the Zod
            // config only lands in time when it ships inside Zod's own chunk.
            groups: [
              { name: "zod", test: /[\\/]node_modules[\\/]zod[\\/]|[\\/]src[\\/]zod-config\.ts$/ },
            ],
          },
        },
      },
    },
    define: { "import.meta.env.RAKAZO_BUILD": JSON.stringify(buildId) },
    plugins: [
      {
        // The API reads this to name the deployed build, and a tab fetches it to confirm the
        // server already serves a newer build before it reloads.
        name: "rakazo-build-id",
        apply: "build",
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "build-id", source: `${buildId}\n` });
        },
      },
      react(),
      babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
      lingui(),
      tailwindcss(),
      rakazoPwa(buildId),
      {
        // Production only: the dev server injects inline scripts for React Refresh.
        name: "rakazo-content-security-policy",
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            const policy = contentSecurityPolicyFor(req.url?.split("?", 1)[0] ?? "/", appPolicy);
            if (policy) {
              res.setHeader("content-security-policy", policy);
              res.setHeader("reporting-endpoints", CSP_REPORTING_ENDPOINTS);
            }
            next();
          });
        },
      },
      {
        name: "rakazo-missing-asset-404",
        configurePreviewServer({ config, middlewares }) {
          const outDir = path.resolve(config.root, config.build.outDir);
          const assetsDir = path.join(outDir, config.build.assetsDir);
          let archive: string | null = null;
          try {
            archive = archiveAssets({
              assetsDir,
              archiveDir: path.resolve(config.root, ASSET_ARCHIVE_DIR),
              buildId: readFileSync(path.join(outDir, "build-id"), "utf8").trim(),
              now: Date.now(),
            });
          } catch (error) {
            screenLog.warn("web.asset_archive_failed", { "error.code": socketErrorCode(error) });
          }
          middlewares.use(
            missingAssetMiddleware(assetsDir, `${config.base}${config.build.assetsDir}/`, archive),
          );
        },
      },
      {
        name: "rakazo-desktop-stack-probe",
        configureServer: (server) => attachDesktopStackProbe(server, desktopStackToken, imageTag),
        configurePreviewServer: (server) =>
          attachDesktopStackProbe(server, desktopStackToken, imageTag),
      },
      {
        name: "rakazo-performance-asset-delay",
        configurePreviewServer(server) {
          if (!Number.isFinite(performanceAssetDelayMs) || performanceAssetDelayMs <= 0) return;
          server.middlewares.use((req, _res, next) => {
            const pathname = req.url?.split("?", 1)[0] ?? "/";
            if (["/api", "/rpc", "/novnc"].some((prefix) => pathname.startsWith(prefix))) {
              next();
              return;
            }
            setTimeout(next, performanceAssetDelayMs);
          });
        },
      },
      {
        // The hosts the running server allows, as Vite resolved them, for proxied upgrades.
        name: "rakazo-api-proxy-hosts",
        configureServer: (server) => {
          proxyHosts = server.config.server.allowedHosts;
        },
        configurePreviewServer: (server) => {
          proxyHosts = server.config.preview.allowedHosts;
        },
      },
      {
        name: "rakazo-novnc-proxy",
        configureServer: (server) => attachNovncProxy(server, screenProxySecret(), api),
        configurePreviewServer: (server) => attachNovncProxy(server, screenProxySecret(), api),
      },
    ],
    server: {
      host: process.env.RAKAZO_DEV_HOST ?? rootEnv.RAKAZO_DEV_HOST ?? "127.0.0.1",
      port: webPort,
      strictPort: true,
      allowedHosts,
      proxy,
    },
    preview: {
      host: "0.0.0.0",
      port: Number(process.env.WEB_PORT ?? 5173),
      allowedHosts,
      proxy,
    },
  };
});
