import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  activity: { id: "a", botId: "bot", spaceId: "space" } as { id: string; botId: string; spaceId: string | null } | null,
  space: "space" as string | null,
  current: true,
  captureState: "capturing",
  listener: undefined as ((state: string) => void) | undefined,
  sessionListener: undefined as (() => void) | undefined,
  spaceListener: undefined as (() => void) | undefined,
  spaceSelection: 0,
  spacePending: false,
  context: vi.fn(async () => ({ headers: {} })),
  rpc: vi.fn(async (_method: string, _params: unknown, _options: { signal: AbortSignal }) => ({})),
}));

vi.mock("./api", () => ({
  captureServerSessionScope: () => ({ apiBase: "https://example.test", sessionGeneration: 1, endpointGeneration: 1 }),
  isServerSessionScopeCurrent: () => state.current,
  selectedSpaceId: () => state.space,
  spaceSelectionSeq: () => state.spaceSelection,
  isSpaceSelectionPending: () => state.spacePending,
  subscribeSpaceSelection: (listener: () => void) => {
    state.spaceListener = listener;
    return () => { state.spaceListener = undefined; };
  },
  captureApiRequestContext: state.context,
  rpc: state.rpc,
}));
vi.mock("./session", () => ({
  subscribeSessionGeneration: (listener: () => void) => {
    state.sessionListener = listener;
    return () => { state.sessionListener = undefined; };
  },
}));
vi.mock("./companion-activity", () => ({
  activeCompanionIdentity: () => state.activity,
  companionScreenState: async () => state.captureState,
  subscribeCompanionScreenState: (listener: (value: string) => void) => {
    state.listener = listener;
    return () => { state.listener = undefined; };
  },
}));

import { captureScreenSendScope, sendReviewedScreenText } from "./companion-screen-send";

beforeEach(() => {
  state.activity = { id: "a", botId: "bot", spaceId: "space" };
  state.space = "space";
  state.current = true;
  state.captureState = "capturing";
  state.listener = undefined;
  state.sessionListener = undefined;
  state.spaceListener = undefined;
  state.spaceSelection = 0;
  state.spacePending = false;
  state.context.mockReset().mockResolvedValue({ headers: {} });
  state.rpc.mockReset().mockResolvedValue({});
});

describe("reviewed screen text", () => {
  it("sends only reviewed text to the selected bot through the normal RPC", async () => {
    const scope = captureScreenSendScope("bot");
    await sendReviewedScreenText(scope, "  示例  ");
    expect(state.rpc).toHaveBeenCalledWith("threads/send", expect.objectContaining({
      botId: "bot", text: expect.stringContaining("示例"), clientNonce: expect.any(String),
    }), expect.objectContaining({ requestContext: { headers: {} }, signal: expect.any(AbortSignal) }));
    expect(state.listener).toBeUndefined();
    expect(state.spaceListener).toBeUndefined();
  });

  it("refuses a stopped capture, changed activity, or changed session", async () => {
    const scope = captureScreenSendScope("bot");
    state.captureState = "idle";
    await expect(sendReviewedScreenText(scope, "text")).rejects.toThrow();
    state.captureState = "capturing";
    state.activity = { id: "other", botId: "bot", spaceId: "space" };
    await expect(sendReviewedScreenText(scope, "text")).rejects.toThrow();
    state.activity = { id: "a", botId: "bot", spaceId: "space" };
    state.current = false;
    await expect(sendReviewedScreenText(scope, "text")).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("does not send if capture stops while the request context is loading", async () => {
    const scope = captureScreenSendScope("bot");
    let resolve!: (value: { headers: object }) => void;
    state.context.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const sending = sendReviewedScreenText(scope, "text");
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    state.listener?.("stopping");
    resolve({ headers: {} });
    await expect(sending).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("rejects a preview after a workspace switch even if switched back", async () => {
    const scope = captureScreenSendScope("bot");
    state.spaceSelection += 2;
    await expect(sendReviewedScreenText(scope, "text")).rejects.toThrow();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("aborts an in-flight send when a workspace selection begins", async () => {
    const scope = captureScreenSendScope("bot");
    let signal!: AbortSignal;
    state.rpc.mockImplementationOnce((_method, _params, options) => {
      signal = options.signal;
      return new Promise<Record<string, never>>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const sending = sendReviewedScreenText(scope, "text");
    await vi.waitFor(() => expect(signal).toBeDefined());
    state.spacePending = true;
    state.spaceSelection += 1;
    state.spaceListener?.();
    await expect(sending).rejects.toThrow("aborted");
    expect(signal.aborted).toBe(true);
    expect(state.spaceListener).toBeUndefined();
  });

  it("does not capture a preview scope during a pending workspace selection", () => {
    state.spacePending = true;
    expect(() => captureScreenSendScope("bot")).toThrow();
  });
});
