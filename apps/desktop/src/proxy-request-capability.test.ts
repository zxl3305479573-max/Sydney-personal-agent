import type {
  OnBeforeSendHeadersListenerDetails,
  Session,
  WebContents,
  WebFrameMain,
} from "electron";
import { describe, expect, it, vi } from "vitest";
import { installProxyCapability } from "./proxy-request-capability.js";

const proxyOrigin = "http://127.0.0.1:51423";
const appToken = "synthetic-app-capability";
const screenToken = "synthetic-screen-capability";

type MockFrame = {
  url: string;
  origin: string;
  parent: MockFrame | null;
  top?: MockFrame | null;
  isDestroyed?: () => boolean;
};

function topFrame(origin = proxyOrigin, url = `${proxyOrigin}/app`): MockFrame {
  const frame: MockFrame = { url, origin, parent: null, isDestroyed: () => false };
  frame.top = frame;
  return frame;
}

function childFrame(url: string, origin = "null", parent: MockFrame = topFrame()): MockFrame {
  return { url, origin, parent, top: parent, isDestroyed: () => false };
}

function contentsFor(main: MockFrame = topFrame(), destroyed = false): WebContents {
  return {
    isDestroyed: () => destroyed,
    mainFrame: main,
  } as unknown as WebContents;
}

function hook(overrides: Partial<Parameters<typeof installProxyCapability>[1]> = {}) {
  const register = vi.fn();
  installProxyCapability({ webRequest: { onBeforeSendHeaders: register } } as unknown as Session, {
    proxyOrigin: () => proxyOrigin,
    token: () => appToken,
    screenToken: () => screenToken,
    appContentsId: () => 7,
    ...overrides,
  });
  const handler = register.mock.calls[0]![0];
  const send = (
    url: string,
    extra: Partial<Omit<OnBeforeSendHeadersListenerDetails, "url" | "requestHeaders">> & {
      headers?: Record<string, string>;
    } = {},
  ) => {
    const callback = vi.fn();
    const { headers, ...rest } = extra;
    const defaultMain = topFrame();
    handler(
      {
        id: 1,
        url,
        method: "GET",
        webContentsId: 7,
        webContents: contentsFor(defaultMain),
        resourceType: "xhr",
        initiatorOrigin: proxyOrigin,
        referrer: "",
        timestamp: 0,
        frame: defaultMain as unknown as WebFrameMain,
        requestHeaders: {
          "x-sydney-proxy-capability": "page-chosen",
          Accept: "*/*",
          ...headers,
        },
        ...rest,
      } satisfies OnBeforeSendHeadersListenerDetails,
      callback,
    );
    return callback.mock.calls[0]![0].requestHeaders as Record<string, string>;
  };
  return { send, register };
}

describe("proxy capability hook", () => {
  it("grants the app capability to initial, recovery, and in-app main-frame GET/HEAD navigations", () => {
    const { send } = hook();
    expect(
      send(`${proxyOrigin}/app`, {
        resourceType: "mainFrame",
        initiatorOrigin: undefined,
        frame: null,
        webContents: contentsFor(topFrame("null", "")),
      }),
    ).toEqual({
      Accept: "*/*",
      "x-sydney-proxy-capability": appToken,
    });
    const errorPageMain = topFrame("null", "chrome-error://chromewebdata/");
    expect(
      send(`${proxyOrigin}/`, {
        resourceType: "mainFrame",
        method: "GET",
        initiatorOrigin: undefined,
        frame: errorPageMain as unknown as WebFrameMain,
        webContents: contentsFor(errorPageMain),
      }),
    ).toHaveProperty("x-sydney-proxy-capability", appToken);
    expect(
      send(`${proxyOrigin}/artifacts/report.v1`, {
        resourceType: "mainFrame",
        initiatorOrigin: proxyOrigin,
        frame: topFrame() as unknown as WebFrameMain,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", appToken);
  });

  it("rejects untrusted, renderer-foreign, or non-GET main-frame navigations", () => {
    const { send } = hook();
    expect(
      send(`${proxyOrigin}/`, {
        resourceType: "mainFrame",
        method: "POST",
        initiatorOrigin: undefined,
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin}/`, {
        resourceType: "mainFrame",
        initiatorOrigin: "https://evil.example",
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin}/`, {
        resourceType: "mainFrame",
        initiatorOrigin: "null",
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
    const foreignMain = topFrame("https://evil.example", "https://evil.example/");
    expect(
      send(`${proxyOrigin}/`, {
        resourceType: "mainFrame",
        initiatorOrigin: proxyOrigin,
        frame: null,
        webContents: contentsFor(foreignMain),
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin.replace("http:", "ws:")}/`, {
        resourceType: "mainFrame",
        initiatorOrigin: undefined,
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
  });

  it("adds the app capability to committed main-frame requests, same-origin downloads, and CSP reports", () => {
    const { send } = hook();
    expect(send(`${proxyOrigin}/rpc/bots`, { method: "POST" })).toEqual({
      Accept: "*/*",
      "x-sydney-proxy-capability": appToken,
    });
    expect(
      send(`${proxyOrigin}/api/account/export?token=abc`, {
        resourceType: "other",
        method: "GET",
        initiatorOrigin: proxyOrigin,
        frame: null,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", appToken);
    expect(
      send(`${proxyOrigin}/api/csp-report`, {
        resourceType: "cspReport",
        method: "POST",
        initiatorOrigin: proxyOrigin,
        frame: null,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", appToken);
    expect(
      send(`${proxyOrigin}/api/write`, {
        resourceType: "xhr",
        method: "POST",
        initiatorOrigin: proxyOrigin,
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin.replace("http:", "ws:")}/novnc/session/view`, {
        resourceType: "webSocket",
      }),
    ).toHaveProperty("x-sydney-proxy-capability", appToken);
    expect(
      send(`${proxyOrigin.replace("http:", "wss:")}/novnc/session/view`, {
        resourceType: "webSocket",
      }),
    ).not.toHaveProperty("x-sydney-proxy-capability");
  });

  it("authorizes initial main-frame child document navigations only for explicit shell/screen paths", () => {
    const { send } = hook();
    for (const allowed of [
      "/html-viewer.html",
      "/wuying",
      "/wuying/",
      "/wuying/screen.html",
      "/novnc/session/view/9999999999999.synthetic/vnc.html",
    ]) {
      expect(
        send(`${proxyOrigin}${allowed}`, {
          resourceType: "subFrame",
          initiatorOrigin: proxyOrigin,
          frame: childFrame("", "null") as unknown as WebFrameMain,
        }),
      ).toHaveProperty("x-sydney-proxy-capability", appToken);
    }
    for (const forbidden of ["/api/secret", "/rpc/bots", "/app", "/sw.js"]) {
      expect(
        send(`${proxyOrigin}${forbidden}`, {
          resourceType: "subFrame",
          initiatorOrigin: proxyOrigin,
          frame: null,
        }),
      ).toEqual({ Accept: "*/*" });
    }
  });

  it("never grants any capability to opaque /html-viewer.html subrequests or blob workers", () => {
    const { send } = hook();
    const viewerFrame = childFrame(`${proxyOrigin}/html-viewer.html`, "null");
    for (const target of [
      `${proxyOrigin}/api/secret`,
      `${proxyOrigin}/rpc/bots`,
      `${proxyOrigin}/wuying/screen.js`,
      `${proxyOrigin}/novnc/session/view/9999999999999.synthetic/core/rfb.js`,
    ]) {
      expect(
        send(target, {
          initiatorOrigin: "null",
          frame: viewerFrame as unknown as WebFrameMain,
        }),
      ).toEqual({ Accept: "*/*" });
    }
    expect(
      send(
        `${proxyOrigin.replace("http:", "ws:")}/novnc/session/view/9999999999999.synthetic/websockify`,
        {
          resourceType: "webSocket",
          initiatorOrigin: "null",
          frame: viewerFrame as unknown as WebFrameMain,
        },
      ),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin}/api/blob-worker`, {
        initiatorOrigin: "null",
        frame: null,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin}/wuying/sdk/ASP/container.html`, {
        resourceType: "subFrame",
        initiatorOrigin: "null",
        frame: childFrame("about:blank", "null", viewerFrame) as unknown as WebFrameMain,
      }),
    ).toEqual({ Accept: "*/*" });
  });

  it("grants only the narrow screen capability to opaque noVNC and Wuying screen frames", () => {
    const { send } = hook();
    const main = topFrame();
    const novncFrame = childFrame(
      `${proxyOrigin}/novnc/session/view/9999999999999.synthetic/vnc.html`,
      "null",
      main,
    );
    expect(
      send(`${proxyOrigin}/novnc/session/view/9999999999999.synthetic/core/rfb.js?v=1`, {
        resourceType: "script",
        initiatorOrigin: "null",
        frame: novncFrame as unknown as WebFrameMain,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", screenToken);
    expect(
      send(
        `${proxyOrigin.replace("http:", "ws:")}//novnc/session/view/9999999999999.synthetic/websockify`,
        {
          resourceType: "webSocket",
          initiatorOrigin: "null",
          frame: novncFrame as unknown as WebFrameMain,
        },
      ),
    ).toHaveProperty("x-sydney-proxy-capability", screenToken);
    expect(
      send(`${proxyOrigin}/api/secret`, {
        initiatorOrigin: "null",
        frame: novncFrame as unknown as WebFrameMain,
      }),
    ).toEqual({ Accept: "*/*" });

    const wuyingFrame = childFrame(`${proxyOrigin}/wuying/screen.html#desktop_id=1`, "null", main);
    const wuyingNestedBlank = childFrame("about:blank", "null", wuyingFrame);
    wuyingNestedBlank.top = main;
    expect(
      send(`${proxyOrigin}/wuying/screen.js`, {
        resourceType: "script",
        initiatorOrigin: "null",
        frame: wuyingFrame as unknown as WebFrameMain,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", screenToken);
    expect(
      send(`${proxyOrigin}/wuying/screen.js?unexpected=1`, {
        resourceType: "script",
        initiatorOrigin: "null",
        frame: wuyingFrame as unknown as WebFrameMain,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(
      send(`${proxyOrigin}/wuying/sdk/ASP/container.html`, {
        resourceType: "subFrame",
        initiatorOrigin: "null",
        frame: wuyingNestedBlank as unknown as WebFrameMain,
      }),
    ).toHaveProperty("x-sydney-proxy-capability", screenToken);
    expect(
      send(`${proxyOrigin}/wuying/sdk/ASP/container.html?unexpected=1`, {
        resourceType: "subFrame",
        initiatorOrigin: "null",
        frame: wuyingNestedBlank as unknown as WebFrameMain,
      }),
    ).toEqual({ Accept: "*/*" });
  });

  it("fails closed when webContents is missing, destroyed, foreign, or when a disposed frame throws", () => {
    const { send } = hook();
    expect(send("https://evil.example/collect")).toEqual({ Accept: "*/*" });
    expect(send("http://127.0.0.1:51424/api")).toEqual({ Accept: "*/*" });
    expect(send(`${proxyOrigin}/api`, { webContentsId: 8 })).toEqual({ Accept: "*/*" });
    expect(send(`${proxyOrigin}/api`, { webContents: undefined })).toEqual({ Accept: "*/*" });
    expect(send(`${proxyOrigin}/api`, { webContents: contentsFor(topFrame(), true) })).toEqual({
      Accept: "*/*",
    });
    expect(
      send(`${proxyOrigin}/api`, {
        frame: topFrame(
          "https://evil.example",
          "https://evil.example/frame",
        ) as unknown as WebFrameMain,
      }),
    ).toEqual({ Accept: "*/*" });
    expect(send(`${proxyOrigin}/api`, { initiatorOrigin: undefined, frame: null })).toEqual({
      Accept: "*/*",
    });

    const throwingFrame = new Proxy(
      {},
      {
        get() {
          throw new Error("Render frame was disposed before WebFrameMain could be accessed");
        },
      },
    ) as unknown as WebFrameMain;
    expect(send(`${proxyOrigin}/api`, { frame: throwingFrame })).toEqual({ Accept: "*/*" });
  });

  it("does nothing while no proxy or token is available", () => {
    const withoutToken = hook({ token: () => undefined });
    expect(withoutToken.send(`${proxyOrigin}/api`)).toEqual({ Accept: "*/*" });
    const withoutProxy = hook({ proxyOrigin: () => undefined });
    expect(withoutProxy.send(`${proxyOrigin}/api`)).toEqual({ Accept: "*/*" });
  });
});
