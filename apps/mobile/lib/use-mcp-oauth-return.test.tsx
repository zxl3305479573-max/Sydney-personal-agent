// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMcpOAuthReturn } from "./use-mcp-oauth-return";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  current: true,
  space: "space-a",
  context: { apiBase: "https://api.example.test", headers: { authorization: "synthetic" } },
  capture: vi.fn(),
}));

vi.mock("./api", () => ({
  captureApiRequestContext: () => state.capture(),
  captureServerSessionScope: () => ({ apiBase: state.context.apiBase }),
  isServerSessionScopeCurrent: () => state.current,
  selectedSpaceId: () => state.space,
  rpc: state.rpc,
}));

describe("native MCP OAuth return", () => {
  let current: ReturnType<typeof useMcpOAuthReturn>;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    state.current = true;
    state.space = "space-a";
    state.capture.mockReset().mockResolvedValue(state.context);
    state.rpc.mockReset().mockImplementation((path: string) =>
      path === "mcp/oauth/begin"
        ? Promise.resolve({
            status: "authorization_required",
            sessionId: "synthetic-session",
            authorizationUrl: "https://provider.example.test/authorize",
            callbackUri: "https://api.example.test/api/mcp/oauth/callback",
          })
        : Promise.resolve({ ok: true }),
    );
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    function Harness() {
      current = useMcpOAuthReturn();
      return null;
    }
    await act(async () => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("submits a matching return only through the captured authenticated context", async () => {
    await act(async () => {
      await current.begin("server-a");
    });
    expect(current.available).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith(
      "mcp/oauth/begin",
      { serverId: "server-a", nativeCallback: true },
      { requestContext: state.context },
    );
    act(() =>
      current.setValue(
        "https://api.example.test/api/mcp/oauth/callback?code=synthetic-code&state=synthetic-session",
      ),
    );
    let result = false;
    await act(async () => {
      result = await current.complete();
    });
    expect(result).toBe(true);
    expect(current.available).toBe(false);
    expect(current.value).toBe("");
    expect(state.rpc).toHaveBeenCalledWith(
      "mcp/oauth/complete",
      { sessionId: "synthetic-session", state: "synthetic-session", code: "synthetic-code" },
      { requestContext: state.context },
    );
  });

  it("does not submit a callback from another attempt or server", async () => {
    await act(async () => {
      await current.begin("server-a");
    });
    act(() => current.setValue("https://other.example.test/mcp/oauth/callback?code=c&state=wrong"));
    await act(async () => {
      expect(await current.complete()).toBe(false);
    });
    expect(current.error).toBe("invalid");
    expect(state.rpc).not.toHaveBeenCalledWith(
      "mcp/oauth/complete",
      expect.anything(),
      expect.anything(),
    );
  });

  it.each(["session", "space"])("does not submit after a %s change", async (change) => {
    await act(async () => {
      await current.begin("server-a");
    });
    act(() =>
      current.setValue(
        "https://api.example.test/api/mcp/oauth/callback?code=c&state=synthetic-session",
      ),
    );
    if (change === "session") state.current = false;
    else state.space = "space-b";
    await act(async () => {
      expect(await current.complete()).toBe(false);
    });
    expect(current.error).toBe("changed");
    expect(state.rpc).not.toHaveBeenCalledWith(
      "mcp/oauth/complete",
      expect.anything(),
      expect.anything(),
    );
  });

  it("preserves the existing browser flow when an older server omits callbackUri", async () => {
    state.rpc.mockResolvedValueOnce({
      status: "authorization_required",
      sessionId: "synthetic-session",
      authorizationUrl: "https://provider.example.test/authorize",
    });
    await act(async () => {
      await current.begin("server-a");
    });
    expect(current.available).toBe(false);
  });

  it("does not offer manual return for the existing web callback", async () => {
    state.rpc.mockResolvedValueOnce({
      status: "authorization_required",
      sessionId: "synthetic-session",
      authorizationUrl: "https://provider.example.test/authorize",
      callbackUri: "https://web.example.test/mcp/oauth/callback",
    });
    await act(async () => {
      await current.begin("server-a");
    });
    expect(current.available).toBe(false);
  });

  it("clears the attempt after an uncertain completion failure", async () => {
    await act(async () => {
      await current.begin("server-a");
    });
    state.rpc.mockRejectedValueOnce(new Error("synthetic failure"));
    act(() =>
      current.setValue(
        "https://api.example.test/api/mcp/oauth/callback?code=c&state=synthetic-session",
      ),
    );
    await act(async () => {
      expect(await current.complete()).toBe(false);
    });
    expect(current.available).toBe(false);
    expect(current.error).toBe("failed");
    expect(current.value).toBe("");
  });

  it("does not submit the same callback twice while completion is pending", async () => {
    await act(async () => {
      await current.begin("server-a");
    });
    let finish!: () => void;
    state.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ ok: true });
        }),
    );
    act(() =>
      current.setValue(
        "https://api.example.test/api/mcp/oauth/callback?code=c&state=synthetic-session",
      ),
    );
    let first!: Promise<boolean>;
    await act(async () => {
      first = current.complete();
      expect(await current.complete()).toBe(false);
      await expect(current.begin("server-b")).rejects.toThrow("completion in progress");
    });
    expect(state.rpc.mock.calls.filter(([path]) => path === "mcp/oauth/complete")).toHaveLength(1);
    await act(async () => {
      finish();
      expect(await first).toBe(true);
    });
  });

  it("does not start authorization if the session scope is no longer current", async () => {
    state.space = "space-a";
    state.current = false;
    await act(async () => {
      await expect(current.begin("server-a")).rejects.toThrow("MCP OAuth scope changed");
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(current.available).toBe(false);
  });

  it("does not start authorization after cancellation while capturing context", async () => {
    let finish!: (context: typeof state.context) => void;
    state.capture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      const pending = current.begin("server-a");
      current.clear();
      finish(state.context);
      await expect(pending).rejects.toThrow("MCP OAuth cancelled");
    });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(current.available).toBe(false);
  });
});
