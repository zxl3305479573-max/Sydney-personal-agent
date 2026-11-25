import type {
  OnBeforeSendHeadersListenerDetails,
  OnCompletedListenerDetails,
  Session,
} from "electron";
import { describe, expect, it, vi } from "vitest";
import { PROXY_CAPABILITY_HEADER } from "./proxy-request-capability.js";
import {
  bindStandaloneSession,
  isStandaloneManagedSession,
  observeMainFrameCompleted,
} from "./standalone-session-hooks.js";

function createMockSession() {
  let beforeSendHandler:
    | ((
        details: OnBeforeSendHeadersListenerDetails,
        callback: (response: { requestHeaders?: Record<string, string> }) => void,
      ) => void)
    | null = null;
  let completedHandler: ((details: OnCompletedListenerDetails) => void) | null = null;
  const onBeforeSendHeaders = vi.fn((fn) => {
    beforeSendHandler = fn;
  });
  const onCompleted = vi.fn((_filterOrNull, fn) => {
    completedHandler = _filterOrNull === null ? null : fn;
  });

  const fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const rawHeaders: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => {
      rawHeaders[key] = value;
    });
    let finalHeaders = rawHeaders;
    if (beforeSendHandler) {
      beforeSendHandler(
        {
          id: 1,
          url,
          method: (init?.method ?? "GET").toUpperCase(),
          webContentsId: undefined,
          webContents: undefined,
          frame: undefined,
          resourceType: "xhr",
          referrer: "",
          timestamp: Date.now(),
          requestHeaders: rawHeaders,
        } as unknown as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders }) => {
          finalHeaders = requestHeaders ?? rawHeaders;
        },
      );
    }
    fetchCalls.push({ url, headers: finalHeaders });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  return {
    session: {
      fetch,
      webRequest: {
        onBeforeSendHeaders,
        onCompleted,
      },
    } as unknown as Session,
    onBeforeSendHeaders,
    onCompleted,
    fetchCalls,
    emitBeforeSend: (details: Partial<OnBeforeSendHeadersListenerDetails>) => {
      let out: Record<string, string> = {};
      beforeSendHandler?.(
        {
          id: 2,
          url: "http://127.0.0.1:52000/api/test",
          method: "GET",
          resourceType: "mainFrame",
          webContentsId: 10,
          webContents: { isDestroyed: () => false, mainFrame: { origin: "null" } },
          frame: null,
          initiatorOrigin: undefined,
          requestHeaders: { Accept: "*/*", [PROXY_CAPABILITY_HEADER]: "forged" },
          ...details,
        } as unknown as OnBeforeSendHeadersListenerDetails,
        ({ requestHeaders }) => {
          out = requestHeaders ?? {};
        },
      );
      return out;
    },
    emitCompleted: (webContentsId: number, statusCode: number, resourceType = "mainFrame") => {
      completedHandler?.({
        webContentsId,
        statusCode,
        resourceType,
      } as unknown as OnCompletedListenerDetails);
    },
  };
}

describe("standalone session hooks", () => {
  it("installs onBeforeSendHeaders once per session, enforces generation unbind, and routes fetchBackend", async () => {
    const mock = createMockSession();
    expect(isStandaloneManagedSession(mock.session)).toBe(false);
    const first = bindStandaloneSession(mock.session, {
      proxyOrigin: "http://127.0.0.1:52000",
      remoteOrigin: "https://124.221.182.39",
      capability: "cap-gen-1",
      screenCapability: "screen-gen-1",
      appContentsId: () => 10,
    });
    expect(isStandaloneManagedSession(mock.session)).toBe(true);
    expect(mock.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    expect(mock.emitBeforeSend({})[PROXY_CAPABILITY_HEADER]).toBe("cap-gen-1");

    // fetchBackend rewrites remoteOrigin URLs to proxyOrigin, injects cap-gen-1, and strips nonce.
    await first.fetchBackend("https://124.221.182.39/api/v1/user-devices/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(mock.fetchCalls).toHaveLength(1);
    expect(mock.fetchCalls[0]!.url).toBe("http://127.0.0.1:52000/api/v1/user-devices/pair");
    expect(mock.fetchCalls[0]!.headers).toEqual({
      "content-type": "application/json",
      origin: "http://127.0.0.1:52000",
      [PROXY_CAPABILITY_HEADER]: "cap-gen-1",
    });

    // Rejects untrusted origins in fetchBackend.
    await expect(first.fetchBackend("https://evil.example/api/steal")).rejects.toThrow(/untrusted/);

    // Rebinding increments generation without reinstalling onBeforeSendHeaders; old unbind is a no-op.
    const second = bindStandaloneSession(mock.session, {
      proxyOrigin: "http://127.0.0.1:52000",
      remoteOrigin: "https://124.221.182.39",
      capability: "cap-gen-2",
      screenCapability: "screen-gen-2",
      appContentsId: () => 11,
    });
    expect(mock.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    first.unbind();
    await expect(first.fetchBackend("/api/monitoring/config")).rejects.toThrow(/no longer active/);
    expect(mock.emitBeforeSend({ webContentsId: 11 })[PROXY_CAPABILITY_HEADER]).toBe("cap-gen-2");

    // Unbinding the active generation leaves header stripping intact and injects no capability.
    second.unbind();
    expect(mock.emitBeforeSend({ webContentsId: 11 })).toEqual({ Accept: "*/*" });
  });

  it("multiplexes mainFrame onCompleted watchers without clearing active observers early", () => {
    const mock = createMockSession();
    const seenA: number[] = [];
    const seenB: number[] = [];

    const stopA = observeMainFrameCompleted(mock.session, 101, (code) => seenA.push(code));
    const stopB = observeMainFrameCompleted(mock.session, 202, (code) => seenB.push(code));
    expect(mock.onCompleted).toHaveBeenCalledTimes(1);

    mock.emitCompleted(101, 200);
    mock.emitCompleted(202, 503);
    mock.emitCompleted(101, 204, "xhr");
    expect(seenA).toEqual([200]);
    expect(seenB).toEqual([503]);

    // Disposing A must not call onCompleted(null) while B is still watching.
    stopA();
    expect(mock.onCompleted).toHaveBeenCalledTimes(1);
    mock.emitCompleted(101, 404);
    mock.emitCompleted(202, 201);
    expect(seenA).toEqual([200]);
    expect(seenB).toEqual([503, 201]);

    // Disposing the final watcher clears the session listener cleanly.
    stopB();
    expect(mock.onCompleted).toHaveBeenCalledTimes(2);
    expect(mock.onCompleted).toHaveBeenLastCalledWith(null);
  });
});
