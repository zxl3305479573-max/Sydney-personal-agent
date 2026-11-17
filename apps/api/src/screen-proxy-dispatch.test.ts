import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createScreenProxyDispatch } from "./screen-proxy-dispatch.js";

describe("API screen proxy dispatch", () => {
  function setup(url: string, withUpgrade = true) {
    const request = { url } as IncomingMessage;
    const response = {} as ServerResponse;
    const socket = { destroy: vi.fn() } as unknown as Duplex;
    const head = Buffer.from("initial bytes");
    const screen = { handleHttp: vi.fn(), handleUpgrade: vi.fn() };
    const http = vi.fn();
    const upgrade = vi.fn();
    const dispatch = createScreenProxyDispatch({
      screen,
      http,
      ...(withUpgrade ? { upgrade } : {}),
    });
    return { request, response, socket, head, screen, http, upgrade, dispatch };
  }

  it.each(["/novnc/session/view/token/vnc.html", "//novnc/session/control/token/websockify"])(
    "routes screen HTTP and upgrade exactly once for %s",
    (url) => {
      const { request, response, socket, head, screen, http, upgrade, dispatch } = setup(url);
      dispatch.handleHttp(request, response);
      dispatch.handleUpgrade(request, socket, head);
      expect(screen.handleHttp).toHaveBeenCalledOnce();
      expect(screen.handleUpgrade).toHaveBeenCalledExactlyOnceWith(request, socket, head);
      expect(http).not.toHaveBeenCalled();
      expect(upgrade).not.toHaveBeenCalled();
    },
  );

  it("keeps ordinary HTTP and device upgrades on their existing handlers", () => {
    const { request, response, socket, head, screen, http, upgrade, dispatch } =
      setup("/api/v1/devices/connect");
    dispatch.handleHttp(request, response);
    dispatch.handleUpgrade(request, socket, head);
    expect(http).toHaveBeenCalledExactlyOnceWith(request, response);
    expect(upgrade).toHaveBeenCalledExactlyOnceWith(request, socket, head);
    expect(screen.handleHttp).not.toHaveBeenCalled();
    expect(screen.handleUpgrade).not.toHaveBeenCalled();
  });

  it("closes unrelated upgrades when no device handler exists", () => {
    const { request, socket, head, dispatch } = setup("/other", false);
    dispatch.handleUpgrade(request, socket, head);
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
});
