import { dismissAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureApiRequestContext, rpc } from "./api";
import {
  installSlackWorkspace,
  MESSAGING_INSTALL_CALLBACK_URL,
  parseMessagingInstallCallback,
} from "./messaging-install-return";

const testScope = vi.hoisted(() => ({
  apiBase: "https://server.example.test",
  endpointGeneration: 1,
  sessionGeneration: 2,
}));
const observers = vi.hoisted(() => ({
  server: undefined as (() => void) | undefined,
  session: undefined as (() => void) | undefined,
  removeServer: vi.fn(),
  removeSession: vi.fn(),
}));
vi.mock("./api", () => ({
  captureServerSessionScope: vi.fn(() => ({ ...testScope })),
  captureApiRequestContext: vi.fn(),
  isServerSessionScopeCurrent: vi.fn((scope) =>
    Object.entries(testScope).every(([key, value]) => scope[key] === value),
  ),
  subscribeApiBase: vi.fn((listener) => {
    observers.server = listener;
    return observers.removeServer;
  }),
  rpc: vi.fn(),
}));
vi.mock("./session", () => ({
  subscribeSessionGeneration: vi.fn((listener) => {
    observers.session = listener;
    return observers.removeSession;
  }),
}));
vi.mock("./i18n", () => ({ t: (message: string) => message }));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn(), dismissAuthSession: vi.fn() }));
const state = "S".repeat(43);
const code = "oauth-code.1";
const context = {
  ...testScope,
  headers: { authorization: "Bearer fake", "x-rakazo-space-id": "space-a" },
};
const callback = () => `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=${code}`;
const authorization = () => {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "redirect_uri",
    "https://server.example.test/api/v1/messaging/install/slack/callback",
  );
  return url.href;
};
beforeEach(() => {
  vi.clearAllMocks();
  testScope.apiBase = "https://server.example.test";
  testScope.endpointGeneration = 1;
  testScope.sessionGeneration = 2;
  vi.mocked(captureApiRequestContext).mockResolvedValue(context);
  vi.mocked(rpc).mockImplementation(async (path) => {
    if (path === "me") return { userId: "user-1" } as never;
    if (path === "messaging/installations/start")
      return { url: authorization(), returnTo: "mobile" } as never;
    return { ok: true } as never;
  });
  vi.mocked(openAuthSessionAsync).mockResolvedValue({ type: "success", url: callback() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const completeCalls = () =>
  vi.mocked(rpc).mock.calls.filter(([path]) => path === "messaging/installations/complete");

describe("mobile Slack callback", () => {
  it("accepts only the pending state on the exact fixed app link", () => {
    expect(parseMessagingInstallCallback(callback(), state)).toEqual({ state, code });
    expect(parseMessagingInstallCallback(callback(), "T".repeat(43))).toBeNull();
    expect(parseMessagingInstallCallback(callback(), "")).toBeNull();
  });
  it.each([
    `rakazo://other/slack/callback?state=${state}&code=${code}`,
    `rakazo://messaging:123/slack/callback?state=${state}&code=${code}`,
    `rakazo://user@messaging/slack/callback?state=${state}&code=${code}`,
    `${MESSAGING_INSTALL_CALLBACK_URL}/?state=${state}&code=${code}`,
    `rakazo://messaging/slack/other/../callback?state=${state}&code=${code}`,
    `rakazo://messaging/slack/%63allback?state=${state}&code=${code}`,
    `https://messaging/slack/callback?state=${state}&code=${code}`,
    `${callback()}&code=other`,
    `${callback()}&state=${state}`,
    `${callback()}&error=access_denied`,
    `${callback()}#fragment`,
    `${callback()}&other=x`,
    `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=bad%20code`,
    `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=bad%0Acode`,
    `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=bad%ZZ`,
    `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=${"x".repeat(4097)}`,
  ])("rejects malformed or unsolicited callback %s", (url) => {
    expect(parseMessagingInstallCallback(url, state)).toBeNull();
  });
  it("accepts a maximum-length encoded code", () => {
    const longCode = "=".repeat(4096);
    expect(
      parseMessagingInstallCallback(
        `${MESSAGING_INSTALL_CALLBACK_URL}?state=${state}&code=${encodeURIComponent(longCode)}`,
        state,
      ),
    ).toEqual({ state, code: longCode });
  });
});

describe("mobile Slack authorization", () => {
  it("pins every RPC to the initial server/session and finishes before returning to list refresh", async () => {
    vi.useFakeTimers();
    await expect(installSlackWorkspace()).resolves.toBe("installed");
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      authorization(),
      MESSAGING_INSTALL_CALLBACK_URL,
      { preferEphemeralSession: true },
    );
    expect(vi.mocked(rpc).mock.calls.map(([path]) => path)).toEqual([
      "me",
      "messaging/installations/start",
      "me",
      "messaging/installations/complete",
    ]);
    for (const [, , options] of vi.mocked(rpc).mock.calls)
      expect(options?.requestContext).toBe(context);
    expect(rpc).toHaveBeenCalledWith(
      "messaging/installations/start",
      { returnTo: "mobile" },
      expect.anything(),
    );
    expect(rpc).toHaveBeenCalledWith(
      "messaging/installations/complete",
      { state, code },
      expect.anything(),
    );
    expect(observers.removeServer).toHaveBeenCalledOnce();
    expect(observers.removeSession).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["cancel", "dismiss"])("does not complete on %s", async (type) => {
    vi.mocked(openAuthSessionAsync).mockResolvedValue({ type } as never);
    await expect(installSlackWorkspace()).resolves.toBe("cancelled");
    expect(completeCalls()).toHaveLength(0);
  });
  it.each(["locked", "opened"])("rejects unexpected browser outcome %s", async (type) => {
    vi.mocked(openAuthSessionAsync).mockResolvedValue({ type } as never);
    await expect(installSlackWorkspace()).rejects.toThrow("Could not continue");
    expect(completeCalls()).toHaveLength(0);
  });
  it("rejects a changed authenticated user", async () => {
    let reads = 0;
    vi.mocked(rpc).mockImplementation(async (path) => {
      if (path === "me") return { userId: ++reads === 1 ? "user-1" : "other-user" } as never;
      return { url: authorization(), returnTo: "mobile" } as never;
    });
    await expect(installSlackWorkspace()).rejects.toThrow();
    expect(completeCalls()).toHaveLength(0);
  });
  it.each(["server", "session", "server round trip"])(
    "drops callbacks after a %s change",
    async (kind) => {
      vi.mocked(openAuthSessionAsync).mockImplementationOnce(async () => {
        if (kind === "session") testScope.sessionGeneration++;
        else {
          testScope.endpointGeneration++;
          testScope.apiBase = kind === "server" ? "https://other.test" : testScope.apiBase;
        }
        observers.server?.();
        observers.session?.();
        return { type: "success", url: callback() };
      });
      await expect(installSlackWorkspace()).rejects.toThrow();
      expect(completeCalls()).toHaveLength(0);
      expect(dismissAuthSession).toHaveBeenCalledOnce();
    },
  );
  it("checks scope again after awaiting request credentials", async () => {
    vi.mocked(captureApiRequestContext).mockImplementationOnce(async () => {
      testScope.sessionGeneration++;
      return context;
    });
    await expect(installSlackWorkspace()).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("fails before opening Slack when an old server does not acknowledge mobile mode", async () => {
    vi.mocked(rpc).mockImplementation(async (path) =>
      path === "me" ? ({ userId: "user-1" } as never) : ({ url: authorization() } as never),
    );
    await expect(installSlackWorkspace()).rejects.toThrow();
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });
  it.each([
    "https://evil.test/oauth/v2/authorize",
    "https://user@slack.com/oauth/v2/authorize",
    "https://slack.com/wrong",
  ])("rejects an unsafe authorization URL %s", async (base) => {
    const url = new URL(authorization());
    const unsafe = new URL(base);
    unsafe.search = url.search;
    vi.mocked(rpc).mockImplementation(async (path) =>
      path === "me"
        ? ({ userId: "user-1" } as never)
        : ({ url: unsafe.href, returnTo: "mobile" } as never),
    );
    await expect(installSlackWorkspace()).rejects.toThrow();
    expect(openAuthSessionAsync).not.toHaveBeenCalled();
  });
  it("rejects a callback with the wrong state and suppresses raw browser errors", async () => {
    vi.mocked(openAuthSessionAsync).mockResolvedValueOnce({
      type: "success",
      url: callback().replace(state, "T".repeat(43)),
    });
    await expect(installSlackWorkspace()).rejects.toThrow("Could not continue");
    vi.mocked(openAuthSessionAsync).mockRejectedValueOnce(new Error(`private ${callback()}`));
    await expect(installSlackWorkspace()).rejects.toThrow(/^Could not continue$/);
    expect(completeCalls()).toHaveLength(0);
  });
  it("prevents overlapping starts and handles a duplicate browser delivery once", async () => {
    let finish!: (value: { type: "success"; url: string }) => void;
    vi.mocked(openAuthSessionAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = installSlackWorkspace();
    await vi.waitFor(() => expect(openAuthSessionAsync).toHaveBeenCalledOnce());
    await expect(installSlackWorkspace()).rejects.toThrow();
    finish({ type: "success", url: callback() });
    finish({ type: "success", url: callback() });
    await expect(first).resolves.toBe("installed");
    expect(completeCalls()).toHaveLength(1);
  });
  it("times out, dismisses the browser, ignores late success, and permits a new attempt", async () => {
    vi.useFakeTimers();
    let finish!: (value: { type: "success"; url: string }) => void;
    vi.mocked(openAuthSessionAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = installSlackWorkspace();
    const rejected = expect(first).rejects.toThrow("Could not continue");
    await vi.waitFor(() => expect(openAuthSessionAsync).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await rejected;
    expect(dismissAuthSession).toHaveBeenCalledOnce();
    finish({ type: "success", url: callback() });
    await Promise.resolve();
    expect(completeCalls()).toHaveLength(0);
    await expect(installSlackWorkspace()).resolves.toBe("installed");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels on unmount and ignores a later callback", async () => {
    const controller = new AbortController();
    vi.mocked(openAuthSessionAsync).mockImplementationOnce(() => new Promise(() => undefined));
    const first = installSlackWorkspace(controller.signal);
    const rejected = expect(first).rejects.toThrow();
    await vi.waitFor(() => expect(openAuthSessionAsync).toHaveBeenCalledOnce());
    controller.abort();
    await rejected;
    expect(dismissAuthSession).toHaveBeenCalledOnce();
    expect(completeCalls()).toHaveLength(0);
  });
  it("rejects a pre-cancelled attempt without issuing an installation", async () => {
    await expect(installSlackWorkspace(AbortSignal.abort())).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
