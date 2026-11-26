// @vitest-environment jsdom
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  rpc: vi.fn(),
  subscribeThread: vi.fn(),
  update: vi.fn(async () => undefined),
  call: null as null | { botId: string; phase: "listening"; muted: boolean },
  active: { id: "activity", botId: "bot", spaceId: "space" } as null | {
    id: string;
    botId: string;
    spaceId: string;
  },
  session: 1,
  readySession: 1,
  selection: 1,
  pending: false,
  screen: "idle" as "idle" | "active",
  capture: "idle" as "idle" | "capturing" | "paused" | "failed",
  captureState: vi.fn(),
  captureListener: undefined as
    | undefined
    | ((state: "idle" | "capturing" | "paused" | "failed") => void),
  appState: { currentState: "active" as "active" | "background" },
  foreground: true,
  listener: undefined as
    | undefined
    | ((event: { type: string; seq?: number; text?: string }) => void),
  signal: undefined as AbortSignal | undefined,
  callListener: undefined as undefined | (() => void),
  spaceListeners: new Set<() => void>(),
  sessionListeners: new Set<() => void>(),
}));

vi.mock("react-native", () => ({ AppState: fixture.appState }));
vi.mock("./api", () => ({
  rpc: fixture.rpc,
  currentApiBase: () => "https://example.test",
  selectedSpaceId: () => "space",
  isSpaceSelectionPending: () => fixture.pending,
  spaceSelectionSeq: () => fixture.selection,
  subscribeSpaceSelection: (listener: () => void) => {
    fixture.spaceListeners.add(listener);
    return () => {
      fixture.spaceListeners.delete(listener);
    };
  },
  subscribeThread: fixture.subscribeThread,
  applyMobileThreadEvent: (
    snapshot: { messages: unknown[] } | null,
    event: { text?: string; seq?: number },
  ) =>
    snapshot && event.text
      ? {
          ...snapshot,
          messages: [
            {
              id: `msg-${event.seq ?? "next"}`,
              role: "bot",
              blocks: [{ kind: "text", text: event.text }],
            },
          ],
        }
      : snapshot,
}));
vi.mock("./app-foreground", () => ({ useAppForeground: () => fixture.foreground }));
vi.mock("./call-session", () => ({
  getSnapshot: () => fixture.call,
  subscribe: (listener: () => void) => {
    fixture.callListener = listener;
    return () => {
      fixture.callListener = undefined;
    };
  },
}));
vi.mock("./call-live-activity", () => ({
  isCallLiveActivityControlling: () => false,
}));
vi.mock("./companion-activity", () => ({
  activeCompanionIdentity: () => fixture.active,
  companionActivityRevision: () => 0,
  isCallOwnedCompanionActivity: () => false,
  isCompanionBackgroundVoiceActive: () => false,
  subscribeCompanionActivity: () => () => undefined,
  companionScreenState: fixture.captureState,
  subscribeCompanionScreenState: (listener: typeof fixture.captureListener) => {
    fixture.captureListener = listener;
    return () => {
      fixture.captureListener = undefined;
    };
  },
  updateCompanion: fixture.update,
}));
vi.mock("./companion-screen-auto", () => ({
  companionScreenAutoSnapshot: () => ({ phase: fixture.screen }),
  useCompanionScreenAuto: () => ({ phase: fixture.screen }),
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => fixture.session,
  currentReadySessionGeneration: () => fixture.readySession,
  subscribeSessionGeneration: (listener: () => void) => {
    fixture.sessionListeners.add(listener);
    return () => {
      fixture.sessionListeners.delete(listener);
    };
  },
}));

import {
  getCompanionSessionState,
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
  setCompanionOpenThreadBotId,
  setCompanionPreferencesState,
} from "./companion-session-state";
import { useCompanionThreadWatch, watchCompanionThread } from "./companion-thread-watch";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  fixture.active = { id: "activity", botId: "bot", spaceId: "space" };
  fixture.session = 1;
  fixture.readySession = 1;
  fixture.selection = 1;
  fixture.pending = false;
  fixture.screen = "idle";
  fixture.capture = "idle";
  fixture.captureState.mockImplementation(async () => fixture.capture);
  fixture.captureListener = undefined;
  fixture.appState.currentState = "active";
  fixture.foreground = true;
  fixture.call = null;
  fixture.listener = undefined;
  fixture.signal = undefined;
  resetCompanionSessionStateForTest();
  fixture.rpc.mockResolvedValue({
    botId: "bot",
    cursor: 7,
    run: null,
    messages: [{ role: "bot", blocks: [{ kind: "text", text: "旧回复" }] }],
  });
  fixture.subscribeThread.mockImplementation((_target, _cursor, listener, signal) => {
    fixture.listener = listener;
    fixture.signal = signal;
    return new Promise<void>((resolve) =>
      signal.addEventListener("abort", resolve, { once: true }),
    );
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function Watcher(props: { ready: boolean; pathname: string }) {
  useCompanionThreadWatch(props.ready);
  return null;
}

describe("independent companion thread updates", () => {
  it("loads and follows the activity's chat after the chat page has unmounted", async () => {
    await act(async () =>
      root.render(createElement(Watcher, { ready: true, pathname: "/bot-profile" })),
    );
    expect(fixture.rpc).toHaveBeenCalledWith("threads/get", { botId: "bot" }, expect.anything());
    expect(fixture.subscribeThread).toHaveBeenCalledWith(
      { botId: "bot" },
      7,
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: "activity",
        latestReply: "旧回复",
        status: "present",
      }),
    );
    await act(async () =>
      fixture.listener?.({ type: "thread.message.created", seq: 8, text: "新回复" }),
    );
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ latestReply: "新回复" }),
    );
    fixture.call = { botId: "bot", phase: "listening", muted: false };
    await act(async () => fixture.callListener?.());
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "listening" }),
    );
    const signal = fixture.signal;
    await act(async () =>
      root.render(createElement(Watcher, { ready: true, pathname: "/thread" })),
    );
    expect(signal?.aborted).toBe(false);
    expect(fixture.rpc).toHaveBeenCalledOnce();
    expect(fixture.subscribeThread).toHaveBeenCalledOnce();
    await act(async () =>
      fixture.listener?.({ type: "thread.message.created", seq: 9, text: "页面切换后的回复" }),
    );
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ latestReply: "页面切换后的回复" }),
    );
  });

  it("ignores late events and queued updates after scope changes", async () => {
    let current = true;
    const stop = watchCompanionThread({
      botId: "bot",
      spaceId: "space",
      activityId: "activity",
      isCurrent: () => current,
    });
    await vi.waitFor(() => expect(fixture.listener).toBeDefined());
    const updateCall = fixture.update.mock.calls.at(-1) as unknown as [
      { isCurrent: () => boolean },
    ];
    const queued = updateCall[0];
    expect(queued.isCurrent()).toBe(true);
    current = false;
    expect(queued.isCurrent()).toBe(false);
    fixture.update.mockClear();
    fixture.listener?.({ type: "thread.message.created", text: "过期回复" });
    expect(fixture.update).not.toHaveBeenCalled();
    stop();
    expect(fixture.signal?.aborted).toBe(true);
  });

  it("hands updates to screen auto response and refreshes the chat after it ends", async () => {
    await act(async () =>
      root.render(createElement(Watcher, { ready: true, pathname: "/thread" })),
    );
    expect(fixture.rpc).toHaveBeenCalledOnce();
    const oldSignal = fixture.signal;
    const oldListener = fixture.listener;
    const oldUpdate = fixture.update.mock.calls.at(-1) as unknown as [{ isCurrent: () => boolean }];
    fixture.screen = "active";
    await act(async () => root.render(createElement(Watcher, { ready: true, pathname: "/" })));
    expect(oldSignal?.aborted).toBe(true);
    expect(oldUpdate[0].isCurrent()).toBe(false);
    fixture.update.mockClear();
    oldListener?.({ type: "thread.message.created", seq: 9, text: "不应覆盖屏幕回应" });
    expect(fixture.update).not.toHaveBeenCalled();
    fixture.screen = "idle";
    fixture.rpc.mockResolvedValueOnce({
      botId: "bot",
      cursor: 10,
      run: null,
      messages: [{ role: "bot", blocks: [{ kind: "text", text: "重新同步的最新回复" }] }],
    });
    await act(async () =>
      root.render(createElement(Watcher, { ready: true, pathname: "/thread" })),
    );
    expect(fixture.rpc).toHaveBeenCalledTimes(2);
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ latestReply: "重新同步的最新回复" }),
    );
  });

  it("starts only after pending space and session changes become ready", async () => {
    fixture.pending = true;
    fixture.readySession = 0;
    await act(async () => root.render(createElement(Watcher, { ready: true, pathname: "/" })));
    expect(fixture.rpc).not.toHaveBeenCalled();
    await act(async () => {
      fixture.pending = false;
      for (const listener of fixture.spaceListeners) listener();
    });
    expect(fixture.rpc).not.toHaveBeenCalled();
    await act(async () => {
      fixture.readySession = fixture.session;
      for (const listener of fixture.sessionListeners) listener();
    });
    expect(fixture.rpc).toHaveBeenCalledOnce();
  });

  it("respects the server retry delay and aborts pending retries on stop", async () => {
    vi.useFakeTimers();
    try {
      fixture.rpc.mockRejectedValueOnce(
        Object.assign(new Error("limited"), { status: 429, retryAfterMs: 5_000 }),
      );
      const stop = watchCompanionThread({
        botId: "bot",
        spaceId: "space",
        activityId: "activity",
        isCurrent: () => true,
      });
      await vi.advanceTimersByTimeAsync(4_999);
      expect(fixture.rpc).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fixture.rpc).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(fixture.rpc).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(["idle", "paused"] as const)(
    "stops background updates when sharing becomes %s",
    async (screenState) => {
      fixture.foreground = false;
      fixture.appState.currentState = "background";
      await act(async () =>
        root.render(createElement(Watcher, { ready: true, pathname: "/thread" })),
      );
      expect(fixture.rpc).not.toHaveBeenCalled();
      await act(async () => fixture.captureListener?.("capturing"));
      expect(fixture.rpc).toHaveBeenCalledOnce();
      const streamSignal = fixture.signal;
      const updateCall = fixture.update.mock.calls.at(-1) as unknown as [
        { isCurrent: () => boolean },
      ];
      const queued = updateCall[0];
      expect(queued.isCurrent()).toBe(true);
      await act(async () => fixture.captureListener?.(screenState));
      expect(queued.isCurrent()).toBe(false);
      expect(streamSignal?.aborted).toBe(true);
    },
  );

  it("does not let a late initial capture check override a newer stop event", async () => {
    let finish!: (state: string) => void;
    fixture.captureState.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    fixture.foreground = false;
    fixture.appState.currentState = "background";
    await act(async () => root.render(createElement(Watcher, { ready: true, pathname: "/" })));
    await act(async () => fixture.captureListener?.("idle"));
    await act(async () => finish("capturing"));
    expect(fixture.rpc).not.toHaveBeenCalled();
  });

  it("publishes active voice call status immediately before threads/get resolves", async () => {
    let resolveRpc!: (value: unknown) => void;
    fixture.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRpc = resolve;
        }),
    );
    fixture.call = { botId: "bot", phase: "listening", muted: false };
    const stop = watchCompanionThread({
      botId: "bot",
      spaceId: "space",
      activityId: "activity",
      isCurrent: () => true,
    });
    expect(fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: "activity",
        status: "listening",
        latestReply: null,
      }),
    );
    fixture.call = { botId: "bot", phase: "listening", muted: true };
    fixture.callListener?.();
    expect(fixture.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: "activity",
        status: "present",
      }),
    );
    resolveRpc({
      botId: "bot",
      cursor: 10,
      run: null,
      messages: [{ role: "bot", blocks: [{ kind: "text", text: "通话后的回复" }] }],
    });
    await vi.waitFor(() =>
      expect(fixture.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: "present",
          latestReply: "通话后的回复",
        }),
      ),
    );
    stop();
  });

  it("watches an in-app companion session without native ActivityKit, reports disconnect, and alerts only on new replies (CMP-02)", async () => {
    fixture.active = null;
    setCompanionPreferencesState({
      preferredBotId: "bot",
      showReply: true,
      showFloatingBar: true,
      notifyOnReply: true,
      speakReplies: true,
      islandVoiceOutput: "both",
    });
    setActiveCompanionSessionState({
      id: "in-app-1",
      botId: "bot",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space",
      mode: "in-app",
      showReply: true,
      startedAt: 1,
    });
    const notify = vi.fn(async () => undefined);
    const speak = vi.fn(async () => undefined);
    const stopSpeaking = vi.fn();

    fixture.rpc.mockResolvedValueOnce({
      botId: "bot",
      cursor: 7,
      run: null,
      messages: [{ id: "m-1", role: "bot", blocks: [{ kind: "text", text: "历史消息" }] }],
    });

    const stop = watchCompanionThread({
      botId: "bot",
      botName: "Sydney",
      spaceId: "space",
      activityId: "in-app-1",
      mode: "in-app",
      isCurrent: () => true,
      effects: { notify, speak, stopSpeaking },
    });

    await vi.waitFor(() => expect(fixture.listener).toBeDefined());
    // Historical baseline does not trigger notification or speech.
    expect(notify).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(getCompanionSessionState().runtime.latestReply).toBe("历史消息");
    expect(fixture.update).not.toHaveBeenCalled();

    // New incoming reply triggers local alert and optional speech when user is on another screen.
    fixture.listener?.({ type: "thread.message.created", seq: 8, text: "新的陪伴回复" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "message",
        botId: "bot",
        botName: "Sydney",
        body: "新的陪伴回复",
      }),
    );
    expect(speak).toHaveBeenCalledWith("bot", "新的陪伴回复", expect.any(Symbol));

    // When user is already viewing this bot's thread, suppress local alert.
    notify.mockClear();
    setCompanionOpenThreadBotId("bot");
    fixture.listener?.({ type: "thread.message.created", seq: 9, text: "正在查看时的回复" });
    expect(notify).not.toHaveBeenCalled();

    // Starting a call stops companion speech immediately.
    fixture.call = { botId: "bot", phase: "listening", muted: false };
    fixture.callListener?.();
    expect(stopSpeaking).toHaveBeenCalled();

    stop();
  });

  it("publishes disconnected status on retryable failure and recovers when connection returns (CMP-02)", async () => {
    vi.useFakeTimers();
    try {
      fixture.rpc
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { status: 503 }))
        .mockResolvedValueOnce({
          botId: "bot",
          cursor: 12,
          run: null,
          messages: [{ id: "m-10", role: "bot", blocks: [{ kind: "text", text: "重连成功" }] }],
        });

      const stop = watchCompanionThread({
        botId: "bot",
        spaceId: "space",
        activityId: "activity",
        mode: "live-activity",
        isCurrent: () => true,
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(fixture.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: "disconnected", latestReply: null }),
      );
      expect(getCompanionSessionState().runtime.detailStatus).toBe("disconnected");

      await vi.advanceTimersByTimeAsync(1_500);
      expect(fixture.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: "present", latestReply: "重连成功" }),
      );
      expect(getCompanionSessionState().runtime.detailStatus).toBe("present");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
