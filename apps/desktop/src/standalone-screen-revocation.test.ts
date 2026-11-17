import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createNovncProxy } from "@rakazo/core/node/novnc-proxy";
import { expect, it, vi } from "vitest";
import { StandaloneRendererProxy } from "./standalone-renderer-proxy.js";

it("closes a desktop screen connection after the backend authority revokes it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "sydney-screen-revocation-"));
  await writeFile(path.join(directory, "index.html"), "<title>fixture</title>");
  let permitted = true;
  let authorityChecks = 0;
  let providerClosed = false;
  const provider = createServer();
  provider.on("upgrade", (_request, socket) => {
    socket.on("error", () => {});
    socket.once("close", () => {
      providerClosed = true;
    });
    socket.on("end", () => socket.destroy());
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n",
    );
  });
  await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerPort = (provider.address() as AddressInfo).port;
  const authority = createServer((_request, response) => {
    authorityChecks++;
    if (!permitted) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        protocol: "http:",
        hostname: "127.0.0.1",
        port: providerPort,
        path: "/websockify",
        interactive: false,
      }),
    );
  });
  await new Promise<void>((resolve) => authority.listen(0, "127.0.0.1", resolve));
  const authorityPort = (authority.address() as AddressInfo).port;
  const screen = createNovncProxy({
    secret: "synthetic-secret",
    api: `http://127.0.0.1:${authorityPort}`,
    logger: { info: vi.fn(), warn: vi.fn() },
  });
  const backend = createServer((_request, response) => response.writeHead(404).end());
  backend.on("upgrade", (request, socket, head) => {
    void screen.handleUpgrade(request, socket, head).catch(() => socket.destroy());
  });
  await new Promise<void>((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const backendPort = (backend.address() as AddressInfo).port;
  const proxy = new StandaloneRendererProxy({
    rendererRoot: directory,
    remoteOrigin: `http://127.0.0.1:${backendPort}`,
    requireCapability: false,
  });
  try {
    const origin = await proxy.start();
    const outcome = await new Promise<string>((resolve, reject) => {
      const client = connect(Number(new URL(origin).port), "127.0.0.1");
      let response = "";
      client.setTimeout(5_000, () => client.destroy(new Error("Revocation did not close socket")));
      client.on("error", reject);
      client.on("data", (chunk) => {
        response += chunk.toString();
        if (response.includes("\r\n\r\n")) permitted = false;
      });
      client.once("close", () => resolve(response));
      client.once("connect", () =>
        client.write(
          `GET /novnc/session/view/${Date.now() + 60_000}.synthetic/websockify HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: null\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
        ),
      );
    });
    expect(outcome).toContain("101 Switching Protocols");
    expect(authorityChecks).toBeGreaterThanOrEqual(2);
    await vi.waitFor(() => expect(providerClosed).toBe(true));
  } finally {
    await proxy.stop();
    for (const server of [backend, authority, provider]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 10_000);
