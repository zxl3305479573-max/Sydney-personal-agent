import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallState } from "./call-session";

const fixture = vi.hoisted(() => ({
  available: true,
  spaceId: "space-1" as string | null,
  sessionGeneration: 1,
  call: null as CallState | null,
  callListeners: new Set<() => void>(),
  nativeActivity: null as null | { id: string; botId: string; spaceId: string | null },
  activeSession: null as null | {
    id: string;
    botId: string;
    botName: string;
    botColor: string;
    botAvatarSet?: null;
    spaceId: string | null;
    mode: "live-activity";
    showReply: boolean;
    startedAt: number;
  },
  latestReply: "历史消息" as string | null,
  showReplyPref: true,
  startCallLiveActivity: vi.fn(),
  stopCallOwnedLiveActivity: vi.fn(async () => undefined),
  updateCallLiveActivity: vi.fn(async () => undefined),
  updateCompanion: vi.fn(async () => undefined),
  startUnifiedCompanion: vi.fn(async () => undefined),
}));

vi.mock("./api", () => ({
  selectedSpaceId: () => fixture.spaceId,
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => fixture.sessionGeneration,
}));
vi.mock("./call-session", () => ({
  getSnapshot: () => fixture.call,
  subscribe: (listener: () => void) => {
    fixture.callListeners.add(listener);
    return () => {
      fixture.callListeners.delete(listener);
    };
  },
}));
vi.mock("./companion-activity", () => ({
  companionAvailable: () => fixture.available,
  activeCompanionIdentity: () => fixture.nativeActivity,
  startCallLiveActivity: fixture.startCallLiveActivity,
  stopCallOwnedLiveActivity: fixture.stopCallOwnedLiveActivity,
  updateCallLiveActivity: fixture.updateCallLiveActivity,
  updateCompanion: fixture.updateCompanion,
}));
vi.mock("./companion-session", () => ({
  getActiveCompanionSession: () => fixture.activeSession,
  getCachedCompanionPreferences: () => ({
    preferredBotId: null,
    showReply: fixture.showReplyPref,
    showFloatingBar: true,
    notifyOnReply: true,
    speakReplies: false,
  }),
  getCompanionSessionState: () => ({
    active: fixture.activeSession,
    runtime: {
      status: "present",
      detailStatus: "present",
      latestReply: fixture.latestReply,
      latestMessageId: null,
      updatedAt: null,
      reconnecting: false,
    },
    preferences: {
      preferredBotId: null,
      showReply: fixture.showReplyPref,
      showFloatingBar: true,
      notifyOnReply: true,
      speakReplies: false,
    },
    preferencesLoaded: true,
  }),
  startUnifiedCompanion: fixture.startUnifiedCompanion,
}));

import {
  callLiveActivityCaption,
  callLiveActivityPhase,
  isCallLiveActivityControlling,
  startCallLiveActivityBridge,
} from "./call-live-activity";

function sampleCall(overrides: Partial<CallState> = {}): CallState {
  return {
    botId: "bot-1",
    botName: "Sydney",
    botColor: "#4F7CAC",
    phase: "listening",
    muted: false,
    speechMuted: false,
    transcriptOpen: false,
    caption: "",
    heard: "",
    exchanges: [],
    ...overrides,
  };
}

function emitCall(next: CallState | null) {
  fixture.call = next;
  for (const listener of [...fixture.callListeners]) listener();
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.available = true;
  fixture.spaceId = "space-1";
  fixture.sessionGeneration = 1;
  fixture.call = null;
  fixture.callListeners.clear();
  fixture.nativeActivity = null;
  fixture.activeSession = null;
  fixture.latestReply = "历史消息";
  fixture.showReplyPref = true;
  fixture.startCallLiveActivity.mockImplementation(
    async ({ botId, spaceId }: { botId: string; spaceId: string | null }) => {
      const id = `call-act-${botId}`;
      fixture.nativeActivity = { id, botId, spaceId };
      return id;
    },
  );
  fixture.stopCallOwnedLiveActivity.mockImplementation(async () => {
    fixture.nativeActivity = null;
  });
});

describe("call-live-activity Dynamic Island bridge", () => {
  it("derives muted override and preferred live caption", () => {
    expect(callLiveActivityPhase(sampleCall({ phase: "speaking", muted: true }))).toBe("muted");
    expect(callLiveActivityPhase(sampleCall({ phase: "thinking", muted: false }))).toBe("thinking");
    expect(
      callLiveActivityCaption(
        sampleCall({
          phase: "speaking",
          heard: "用户刚说的话",
          exchanges: [{ role: "bot", text: "正在播报的回复" }],
        }),
      ),
    ).toBe("正在播报的回复");
    expect(callLiveActivityCaption(sampleCall({ phase: "listening", heard: "你好呀" }))).toBe(
      "你好呀",
    );
  });

  it("auto-starts a call-owned Dynamic Island activity, tracks all phases, and stops on hang-up", async () => {
    const stop = startCallLiveActivityBridge();
    expect(isCallLiveActivityControlling()).toBe(false);

    emitCall(sampleCall({ phase: "listening", heard: "帮我查一下日程" }));
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(1));
    expect(fixture.startCallLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ botId: "bot-1", botName: "Sydney", spaceId: "space-1" }),
    );
    expect(fixture.updateCallLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activityId: "call-act-bot-1",
        phase: "listening",
        caption: "帮我查一下日程",
      }),
    );
    expect(isCallLiveActivityControlling("call-act-bot-1")).toBe(true);

    emitCall(sampleCall({ phase: "thinking", heard: "帮我查一下日程" }));
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(2));
    expect(fixture.updateCallLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "thinking" }),
    );

    emitCall(
      sampleCall({
        phase: "speaking",
        exchanges: [{ role: "bot", text: "今天下午三点有评审会" }],
      }),
    );
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(3));
    expect(fixture.updateCallLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "speaking", caption: "今天下午三点有评审会" }),
    );

    emitCall(sampleCall({ phase: "listening", muted: true }));
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(4));
    expect(fixture.updateCallLiveActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "muted" }),
    );

    emitCall(null);
    await vi.waitFor(() =>
      expect(fixture.stopCallOwnedLiveActivity).toHaveBeenCalledWith("call-act-bot-1"),
    );
    expect(isCallLiveActivityControlling()).toBe(false);
    stop();
  });

  it("reuses an existing same-bot companion Live Activity and restores it to present on hang-up", async () => {
    fixture.nativeActivity = { id: "comp-1", botId: "bot-1", spaceId: "space-1" };
    const stop = startCallLiveActivityBridge();

    emitCall(sampleCall({ phase: "listening" }));
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(1));
    expect(fixture.startCallLiveActivity).not.toHaveBeenCalled();
    expect(fixture.updateCallLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: "comp-1", phase: "listening" }),
    );

    emitCall(null);
    await vi.waitFor(() =>
      expect(fixture.updateCompanion).toHaveBeenCalledWith(
        expect.objectContaining({
          activityId: "comp-1",
          botId: "bot-1",
          spaceId: "space-1",
          status: "present",
          latestReply: "历史消息",
        }),
      ),
    );
    expect(fixture.stopCallOwnedLiveActivity).not.toHaveBeenCalled();
    stop();
  });

  it("suspends a different bot's companion during a call and restores it after hanging up", async () => {
    fixture.nativeActivity = { id: "comp-a", botId: "bot-a", spaceId: "space-1" };
    fixture.activeSession = {
      id: "comp-a",
      botId: "bot-a",
      botName: "Claude",
      botColor: "#8B5CF6",
      spaceId: "space-1",
      mode: "live-activity",
      showReply: true,
      startedAt: 1,
    };
    const stop = startCallLiveActivityBridge();

    emitCall(sampleCall({ botId: "bot-b", botName: "Ops", phase: "listening" }));
    await vi.waitFor(() => expect(fixture.updateCallLiveActivity).toHaveBeenCalledTimes(1));
    expect(fixture.startCallLiveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ botId: "bot-b", botName: "Ops" }),
    );

    emitCall(null);
    await vi.waitFor(() =>
      expect(fixture.startUnifiedCompanion).toHaveBeenCalledWith(
        expect.objectContaining({ botId: "bot-a", botName: "Claude", spaceId: "space-1" }),
      ),
    );
    stop();
  });
});
