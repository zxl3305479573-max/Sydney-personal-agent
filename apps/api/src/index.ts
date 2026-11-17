import type { Socket } from "node:net";
import { createServer } from "node:http";
import { unwrapEnvFromKeyManager } from "@rakazo/adapters";
import { loadRootEnv } from "@rakazo/core/node/load-root-env";
import { createNovncProxy } from "@rakazo/core/node/novnc-proxy";
import { stopOnShutdownSignals } from "@rakazo/core/node/shutdown-signals";

loadRootEnv();
await unwrapEnvFromKeyManager();

import { getRequestListener, serve } from "@hono/node-server";
import { SERVICE_NAMES } from "@rakazo/logging";
import { createRootLogger } from "@rakazo/logging/axiom";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";
import { createScreenProxyDispatch } from "./screen-proxy-dispatch.js";

const logger = createRootLogger(SERVICE_NAMES.api);

try {
  const env = loadEnv();
  const { app, stop, handleUpgrade } = await createApp({ ...env, logger });
  const listening = () => {
    logger.info("api listening", { "http.host": env.apiHost, "http.port": env.port });
  };
  const server = env.screenProxyOnApi
    ? (() => {
        const host = env.apiHost === "0.0.0.0" ? "127.0.0.1" : env.apiHost === "::" ? "::1" : env.apiHost;
        const authority = new URL("http://localhost");
        authority.hostname = host.includes(":") ? `[${host}]` : host;
        authority.port = String(env.port);
        const screen = createNovncProxy({
          secret: env.screenProxySecret,
          api: authority.origin,
          logger,
        });
        const dispatch = createScreenProxyDispatch({
          screen,
          http: getRequestListener(app.fetch, { hostname: env.apiHost }),
          upgrade: handleUpgrade,
        });
        const listener = createServer(dispatch.handleHttp);
        listener.on("upgrade", dispatch.handleUpgrade);
        listener.listen(env.port, env.apiHost, listening);
        return listener;
      })()
    : (() => {
        const listener = serve({ fetch: app.fetch, port: env.port, hostname: env.apiHost }, listening);
        if (handleUpgrade) listener.on("upgrade", handleUpgrade);
        return listener;
      })();

  // SSE streams never end on their own, so server.close() alone would wait forever;
  // force-close sockets still open after a short grace period.
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    const grace = setTimeout(() => {
      for (const socket of sockets) socket.destroy();
    }, 2_000);
    await closed;
    clearTimeout(grace);
    await stop();
    await logger.flush({ timeoutMs: 2_000 });
  };
  stopOnShutdownSignals(shutdown);
} catch (error) {
  logger.error("api startup failed", error);
  await logger.flush({ timeoutMs: 2_000 });
  process.exit(1);
}
