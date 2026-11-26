import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "./default-bot-avatar";

const bridge = vi.hoisted(() => ({
  isAvailable: vi.fn(() => true),
  supportsCallStatus: vi.fn(() => false),
  activeBotId: vi.fn(() => "bot-1" as string | null),
  activeActivity: vi.fn(() => ({
    id: "activity-1",
    botId: "bot-1",
    spaceId: "space-1",
    showReply: true,
  })),
  start: vi.fn(
    async (
      _botId: string,
      _name: string,
      _spaceId: string | null,
      _showReply: boolean,
      _avatar: string | null,
    ) => "created-activity",
  ),
  startCall: vi.fn(
    async (
      _botId: string,
      _name: string,
      _spaceId: string | null,
      _showReply: boolean,
      _avatar: string | null,
      _status: string,
      _reply: string | null,
      _callStartedAtMs: number,
    ) => "created-call-activity",
  ),
  stopActivity: vi.fn(async (_id: string) => {}),
  stop: vi.fn(async () => {}),
  update: vi.fn(
    async (
      _id: string,
      _botId: string,
      _spaceId: string | null,
      _status: string,
      _reply: string | null,
    ) => {},
  ),
  updateCall: vi.fn(
    async (
      _id: string,
      _botId: string,
      _spaceId: string | null,
      _status: string,
      _reply: string | null,
      _callActive: boolean,
      _callStartedAtMs: number | null,
    ) => {},
  ),
  screenState: vi.fn(async () => "idle"),
  presentScreen: vi.fn(async (_botId: string, _spaceId: string | null) => {}),
  stopScreen: vi.fn(async () => {}),
  takeScreenText: vi.fn(async () => "sample" as string | null),
  peekScreenSnapshot: vi.fn(
    async () =>
      ({ state: "idle", text: null, capturedAt: null }) as {
        state: string;
        text?: string | null;
        capturedAt?: number | null;
      } | null,
  ),
  getVoiceOutputMode: vi.fn(() => "both" as string | null),
  setVoiceOutputMode: vi.fn(async (_mode: string) => {}),
  isBackgroundVoiceActive: vi.fn(() => false),
  addListener: vi.fn((_event: string, _listener: (event: { state: string }) => void) => ({
    remove: vi.fn(),
  })),
}));

vi.mock("expo-modules-core", () => ({ requireOptionalNativeModule: () => bridge }));

import {
  activeCompanionBotId,
  activeCompanionIdentity,
  companionAvailable,
  companionScreenState,
  isCallOwnedCompanionActivity,
  isCompanionBackgroundVoiceActive,
  nativeCompanionVoiceOutputMode,
  peekCompanionScreenSnapshot,
  presentCompanionScreen,
  startCallLiveActivity,
  startCompanion,
  stopCallOwnedLiveActivity,
  stopCompanion,
  stopCompanionScreen,
  subscribeCompanionScreenState,
  syncCompanionVoiceOutputMode,
  takeCompanionScreenText,
  updateCallLiveActivity,
  updateCompanion,
} from "./companion-activity";

beforeEach(() => {
  vi.clearAllMocks();
  bridge.isAvailable.mockReturnValue(true);
  bridge.supportsCallStatus.mockReturnValue(false);
  bridge.activeActivity.mockReturnValue({
    id: "activity-1",
    botId: "bot-1",
    spaceId: "space-1",
    showReply: true,
  });
});

describe("companion native bridge", () => {
  it("starts the selected bot with a bounded name and space", async () => {
    await startCompanion(
      "bot-1",
      `  ${"a".repeat(40)}  `,
      "space-1",
      false,
      { color: "#8B5CF6" },
      () => true,
      () => true,
    );
    expect(bridge.start).toHaveBeenCalledWith(
      "bot-1",
      `${"a".repeat(31)}…`,
      "space-1",
      false,
      `r|${DEFAULT_BOT_AVATAR_DATA_URI}`,
    );
    expect(activeCompanionBotId()).toBe("bot-1");
    await stopCompanion();
    expect(bridge.stop).toHaveBeenCalledOnce();
  });

  it("exposes the current activity link token for voice matching", () => {
    bridge.activeActivity.mockReturnValue({
      id: "activity-1",
      botId: "bot-1",
      spaceId: "space-1",
      showReply: false,
      linkToken: "token-1",
    } as ReturnType<typeof bridge.activeActivity>);
    expect(activeCompanionIdentity()).toMatchObject({ id: "activity-1", linkToken: "token-1" });
  });

  it("fails closed when the experiment is unavailable", async () => {
    bridge.isAvailable.mockReturnValue(false);
    expect(companionAvailable()).toBe(false);
    expect(activeCompanionBotId()).toBeNull();
    await expect(
      startCompanion(
        "bot-1",
        "Sydney",
        null,
        false,
        { color: "#fff" },
        () => true,
        () => true,
      ),
    ).rejects.toThrow("不支持");
    await expect(stopCompanion()).rejects.toThrow("不支持");
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.stop).not.toHaveBeenCalled();
  });

  it("does not replace an activity if screen capture cannot be stopped", async () => {
    bridge.stopScreen.mockRejectedValueOnce(new Error("stop failed"));
    await expect(
      startCompanion(
        "bot-1",
        "Sydney",
        "space-1",
        false,
        { color: "#fff" },
        () => true,
        () => true,
      ),
    ).rejects.toThrow("stop failed");
    expect(bridge.start).not.toHaveBeenCalled();
  });

  it("rejects a queued start or stop after its original scope changes", async () => {
    let release!: () => void;
    bridge.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const update = updateCompanion({
      botId: "bot-1",
      spaceId: "space-1",
      status: "thinking",
      latestReply: null,
    });
    await vi.waitFor(() => expect(bridge.update).toHaveBeenCalled());
    let current = true;
    const start = startCompanion(
      "bot-1",
      "Sydney",
      "space-1",
      false,
      { color: "#fff" },
      () => current,
      () => current,
    );
    const stop = stopCompanion(() => current);
    current = false;
    const startResult = expect(start).rejects.toThrow("会话已切换");
    const stopResult = expect(stop).rejects.toThrow("会话已切换");
    release();
    await Promise.all([update, startResult, stopResult]);
    expect(bridge.stopScreen).not.toHaveBeenCalled();
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.stop).not.toHaveBeenCalled();
  });

  it("rechecks scope after waiting for screen capture to stop", async () => {
    let release!: () => void;
    bridge.stopScreen.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let current = true;
    const start = startCompanion(
      "bot-1",
      "Sydney",
      "space-1",
      false,
      { color: "#fff" },
      () => current,
      () => current,
    );
    await vi.waitFor(() => expect(bridge.stopScreen).toHaveBeenCalled());
    current = false;
    const result = expect(start).rejects.toThrow("会话已切换");
    release();
    await result;
    expect(bridge.start).not.toHaveBeenCalled();
  });

  it("ends only the created activity if the scope changes during native creation", async () => {
    let release!: (id: string) => void;
    bridge.start.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    let current = true;
    const start = startCompanion(
      "bot-1",
      "Sydney",
      "space-1",
      true,
      { color: "#fff" },
      () => current,
      () => current,
    );
    await vi.waitFor(() => expect(bridge.start).toHaveBeenCalled());
    current = false;
    const result = expect(start).rejects.toThrow("会话已切换");
    release("created-activity");
    await result;
    expect(bridge.stopActivity).toHaveBeenCalledExactlyOnceWith("created-activity");
    expect(bridge.stop).not.toHaveBeenCalled();
  });

  it("only updates the active matching bot and space, with reply opt-in", async () => {
    await stopCompanion();
    await updateCompanion({
      botId: "bot-2",
      spaceId: "space-1",
      status: "present",
      latestReply: "secret",
    });
    await updateCompanion({
      botId: "bot-1",
      spaceId: "other",
      status: "present",
      latestReply: "secret",
    });
    expect(bridge.update).not.toHaveBeenCalled();
    bridge.activeActivity.mockReturnValue({
      id: "activity-1",
      botId: "bot-1",
      spaceId: "space-1",
      showReply: false,
    });
    await updateCompanion({
      botId: "bot-1",
      spaceId: "space-1",
      status: "present",
      latestReply: "secret",
    });
    expect(bridge.update).toHaveBeenCalledWith(
      "activity-1",
      "bot-1",
      "space-1",
      "我一直都在",
      null,
    );
    bridge.activeActivity.mockReturnValue({
      id: "activity-2",
      botId: "bot-1",
      spaceId: "space-1",
      showReply: true,
    });
    await updateCompanion({
      botId: "bot-1",
      spaceId: "space-1",
      status: "present",
      latestReply: " hello\nworld ",
    });
    expect(bridge.update).toHaveBeenLastCalledWith(
      "activity-2",
      "bot-1",
      "space-1",
      "我一直都在",
      "hello world",
    );
  });

  it("keeps screen capture opt-in and exposes only requested local previews", async () => {
    expect(await companionScreenState()).toBe("idle");
    expect(bridge.presentScreen).not.toHaveBeenCalled();
    await presentCompanionScreen("bot-1", "space-1");
    expect(bridge.presentScreen).toHaveBeenCalledWith("bot-1", "space-1");
    expect(await takeCompanionScreenText()).toBe("sample");
    const onState = vi.fn();
    const unsubscribe = subscribeCompanionScreenState(onState);
    bridge.addListener.mock.calls[0]![1]({ state: "capturing" });
    bridge.addListener.mock.calls[0]![1]({ state: "paused" });
    bridge.addListener.mock.calls[0]![1]({ state: "unexpected" });
    expect(onState.mock.calls).toEqual([["capturing"], ["paused"], ["unsupported"]]);
    unsubscribe();
    expect(bridge.addListener.mock.results[0]!.value.remove).toHaveBeenCalledOnce();
    await stopCompanionScreen();
    expect(bridge.stopScreen).toHaveBeenCalledOnce();
  });

  it("does not start screen capture when the native experiment is unavailable", async () => {
    bridge.isAvailable.mockReturnValue(false);
    expect(await companionScreenState()).toBe("unsupported");
    await expect(presentCompanionScreen("bot-1", null)).rejects.toThrow("不支持");
    expect(await takeCompanionScreenText()).toBeNull();
    expect(await peekCompanionScreenSnapshot()).toBeNull();
    expect(bridge.presentScreen).not.toHaveBeenCalled();
  });

  it("peeks non-destructive screen snapshot on new IPA and falls back to screenState on legacy IPA", async () => {
    bridge.peekScreenSnapshot.mockResolvedValueOnce({
      state: "capturing",
      text: "  实时共享屏幕文字  ",
      capturedAt: 1_700_000_001_234.6,
    });
    expect(await peekCompanionScreenSnapshot()).toEqual({
      state: "capturing",
      text: "实时共享屏幕文字",
      capturedAt: 1_700_000_001_235,
    });

    const originalPeek = bridge.peekScreenSnapshot;
    // Simulate older IPA without peekScreenSnapshot native method.
    (bridge as { peekScreenSnapshot?: unknown }).peekScreenSnapshot = undefined;
    bridge.screenState.mockResolvedValueOnce("capturing");
    try {
      expect(await peekCompanionScreenSnapshot()).toEqual({
        state: "capturing",
        text: null,
        capturedAt: null,
      });
    } finally {
      bridge.peekScreenSnapshot = originalPeek;
    }
  });

  it("tracks call-owned Live Activity and uses rich native updateCall or legacy OTA fallback", async () => {
    bridge.start.mockResolvedValueOnce("call-act-1");
    const created = await startCallLiveActivity({
      botId: "bot-1",
      botName: "Sydney",
      spaceId: "space-1",
      showReply: true,
      avatar: { color: "#4F7CAC" },
    });
    expect(created).toBe("call-act-1");
    expect(isCallOwnedCompanionActivity("call-act-1")).toBe(true);
    expect(isCallOwnedCompanionActivity("other-act")).toBe(false);

    bridge.activeActivity.mockReturnValue({
      id: "call-act-1",
      botId: "bot-1",
      spaceId: "space-1",
      showReply: true,
    });

    // Legacy 1.0.14 IPA (supportsCallStatus=false): uses compatible update() whitelist.
    await updateCallLiveActivity({
      activityId: "call-act-1",
      botId: "bot-1",
      spaceId: "space-1",
      phase: "speaking",
      caption: "你好",
      callStartedAtMs: 1_700_000_000_000,
    });
    expect(bridge.update).toHaveBeenCalledWith("call-act-1", "bot-1", "space-1", "正在听", "你好");
    expect(bridge.updateCall).not.toHaveBeenCalled();

    // New IPA (supportsCallStatus=true): uses rich updateCall() with live timer timestamp.
    bridge.supportsCallStatus.mockReturnValue(true);
    await updateCallLiveActivity({
      activityId: "call-act-1",
      botId: "bot-1",
      spaceId: "space-1",
      phase: "speaking",
      caption: "你好",
      callStartedAtMs: 1_700_000_000_000,
    });
    expect(bridge.updateCall).toHaveBeenCalledWith(
      "call-act-1",
      "bot-1",
      "space-1",
      "通话 · 说话中",
      "你好",
      true,
      1_700_000_000_000,
    );

    await stopCallOwnedLiveActivity("call-act-1");
    expect(bridge.stopActivity).toHaveBeenCalledWith("call-act-1");
    expect(isCallOwnedCompanionActivity("call-act-1")).toBe(false);

    // Atomic native startCall on new IPA skips redundant initial updateCall.
    bridge.supportsCallStatus.mockReturnValue(true);
    bridge.startCall.mockResolvedValueOnce("call-act-atomic");
    const atomicId = await startCallLiveActivity({
      botId: "bot-1",
      botName: "Sydney",
      spaceId: "space-1",
      showReply: true,
      avatar: { color: "#4F7CAC" },
      phase: "listening",
      caption: "你好呀",
      callStartedAtMs: 1_700_000_005_000,
    });
    expect(atomicId).toBe("call-act-atomic");
    expect(bridge.startCall).toHaveBeenCalledWith(
      "bot-1",
      "Sydney",
      "space-1",
      true,
      `r|${DEFAULT_BOT_AVATAR_DATA_URI}`,
      "通话 · 正在听",
      "你好呀",
      1_700_000_005_000,
    );
    await stopCallOwnedLiveActivity("call-act-atomic");
  });

  it("reads and syncs Dynamic Island voice output mode and background voice state safely", async () => {
    bridge.getVoiceOutputMode.mockReturnValueOnce("text");
    expect(nativeCompanionVoiceOutputMode()).toBe("text");
    bridge.getVoiceOutputMode.mockReturnValueOnce("unexpected");
    expect(nativeCompanionVoiceOutputMode()).toBeNull();

    await syncCompanionVoiceOutputMode("voice");
    expect(bridge.setVoiceOutputMode).toHaveBeenCalledWith("voice");

    bridge.isBackgroundVoiceActive.mockReturnValueOnce(true);
    expect(isCompanionBackgroundVoiceActive()).toBe(true);

    bridge.isAvailable.mockReturnValue(false);
    expect(nativeCompanionVoiceOutputMode()).toBeNull();
    expect(isCompanionBackgroundVoiceActive()).toBe(false);
  });
});
