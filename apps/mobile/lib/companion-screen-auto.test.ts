import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  context: vi.fn(async () => ({ headers: {} })),
  screen: vi.fn(async () => "capturing"),
  text: vi.fn(async (): Promise<string | null> => "示例文字"),
  update: vi.fn(async (_input: { status: string }) => undefined),
  current: vi.fn(() => true),
  speak: vi.fn(async (_text: string, _botId: string, _messageId: undefined, _owner: symbol) => true),
  stopSpeaking: vi.fn(),
  playback: vi.fn(() => ({ status: "idle" })),
  call: vi.fn(() => null as null | { botId: string }),
  callListener: undefined as undefined | (() => void),
  appListener: undefined as undefined | ((state: string) => void),
  screenListener: undefined as undefined | ((state: string) => void),
  sessionListener: undefined as undefined | (() => void),
  spaceListener: undefined as undefined | (() => void),
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.appListener = listener;
      return { remove: () => { mocks.appListener = undefined; } };
    },
  },
}));
vi.mock("./api", () => ({
  rpc: mocks.rpc,
  captureApiRequestContext: mocks.context,
  subscribeSpaceSelection: (listener: () => void) => {
    mocks.spaceListener = listener;
    return () => { mocks.spaceListener = undefined; };
  },
}));
vi.mock("./companion-activity", () => ({
  companionScreenState: mocks.screen,
  takeCompanionScreenText: mocks.text,
  updateCompanion: mocks.update,
  subscribeCompanionScreenState: (listener: (state: string) => void) => {
    mocks.screenListener = listener;
    return () => { mocks.screenListener = undefined; };
  },
}));
vi.mock("./companion-screen-send", () => ({
  captureScreenSendScope: () => ({ activityId: "activity-1", botId: "bot-1", spaceId: "space-1" }),
  screenSendScopeCurrent: mocks.current,
}));
vi.mock("./session", () => ({
  subscribeSessionGeneration: (listener: () => void) => {
    mocks.sessionListener = listener;
    return () => { mocks.sessionListener = undefined; };
  },
}));
vi.mock("./voice", () => ({
  createSpeechOwner: () => Symbol("test-owner"),
  getVoicePlaybackState: mocks.playback,
  speakWithDeviceVoice: mocks.speak,
  stopSpeaking: mocks.stopSpeaking,
}));
vi.mock("./call-session", () => ({
  getSnapshot: mocks.call,
  subscribe: (listener: () => void) => {
    mocks.callListener = listener;
    return () => { mocks.callListener = undefined; };
  },
}));

import { startCompanionScreenAuto, stopCompanionScreenAuto } from "./companion-screen-auto";

async function flush() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.current.mockReturnValue(true);
  mocks.screen.mockResolvedValue("capturing");
  mocks.text.mockResolvedValue("示例文字");
  mocks.call.mockReturnValue(null);
  mocks.playback.mockReturnValue({ status: "idle" });
  mocks.rpc.mockImplementation(async (path: string) => {
    if (path === "threads/companionScreenStart") return { id: "session-1", expiresAt: Date.now() + 300_000 };
    if (path === "threads/companionScreenRespond") return { reply: "回应" };
    return {};
  });
});

afterEach(() => {
  stopCompanionScreenAuto();
  vi.useRealTimers();
});

describe("screen auto response", () => {
  it("sends only after start, skips repeated text and avoids background consent prompts", async () => {
    expect(mocks.rpc).not.toHaveBeenCalled();
    await startCompanionScreenAuto("bot-1");
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenRespond",
      expect.objectContaining({ text: "示例文字" }),
      expect.objectContaining({ allowConsentPrompt: false, timeoutMs: 20_000 }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ activityId: "activity-1" }));
    expect(mocks.update.mock.calls.map(([input]) => input.status)).toEqual(["thinking", "present"]);
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(1);
    mocks.text.mockResolvedValue("新文字");
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(2);
  });

  it.each(["idle", "paused"])("stops on capture state %s or account changes and ignores a late response", async (screenState) => {
    let resolveResponse!: (value: { reply: string }) => void;
    mocks.rpc.mockImplementation((path: string) => {
      if (path === "threads/companionScreenStart") return Promise.resolve({ id: "session-1", expiresAt: Date.now() + 300_000 });
      if (path === "threads/companionScreenRespond") return new Promise((resolve) => { resolveResponse = resolve; });
      return Promise.resolve({});
    });
    await startCompanionScreenAuto("bot-1");
    await flush();
    mocks.screenListener?.(screenState);
    resolveResponse({ reply: "迟到的回应" });
    await flush();
    expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ latestReply: "迟到的回应" }));
    expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ status: "present", latestReply: null }));
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenStop", expect.anything(), expect.anything());
    await startCompanionScreenAuto("bot-1");
    await flush();
    mocks.sessionListener?.();
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenStop")).toHaveLength(2);
  });

  it("closes a session whose start finishes after stopping", async () => {
    let resolveStart!: (value: { id: string; expiresAt: number }) => void;
    mocks.rpc.mockImplementation((path: string) => path === "threads/companionScreenStart"
      ? new Promise((resolve) => { resolveStart = resolve; })
      : Promise.resolve({}));
    const starting = startCompanionScreenAuto("bot-1");
    await flush();
    stopCompanionScreenAuto();
    resolveStart({ id: "late", expiresAt: Date.now() + 300_000 });
    await starting;
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenStop",
      expect.objectContaining({ id: "late" }), expect.anything());
    expect(mocks.text).not.toHaveBeenCalled();
  });

  it("stops when the workspace scope changes", async () => {
    await startCompanionScreenAuto("bot-1");
    await flush();
    mocks.current.mockReturnValue(false);
    mocks.spaceListener?.();
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenStop",
      expect.objectContaining({ id: "session-1" }), expect.anything());
    await vi.advanceTimersByTimeAsync(70_000);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(1);
  });

  it("speaks only with opt-in, and stops its own speech when a call starts or sharing stops", async () => {
    await startCompanionScreenAuto("bot-1", true);
    await flush();
    expect(mocks.speak).toHaveBeenCalledWith("回应", "bot-1", undefined, expect.any(Symbol));
    const owner = mocks.speak.mock.calls[0]?.[3];
    mocks.call.mockReturnValue({ botId: "bot-1" });
    mocks.callListener?.();
    expect(mocks.stopSpeaking).toHaveBeenCalledWith(owner);
    mocks.text.mockResolvedValue("新的文字");
    await vi.advanceTimersByTimeAsync(35_000);
    expect(mocks.speak).toHaveBeenCalledTimes(1);
    stopCompanionScreenAuto();
    expect(mocks.stopSpeaking).toHaveBeenCalledWith(owner);
  });

  it("does not replace another active playback", async () => {
    mocks.playback.mockReturnValue({ status: "playing" });
    await startCompanionScreenAuto("bot-1", true);
    await flush();
    expect(mocks.speak).not.toHaveBeenCalled();
  });

  it("limits OCR to the RPC length without splitting a surrogate pair", async () => {
    mocks.text.mockResolvedValue(`${"字".repeat(1999)}😀后续`);
    await startCompanionScreenAuto("bot-1");
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenRespond",
      expect.objectContaining({ text: "字".repeat(1999) }), expect.anything());
  });

  it("rejects a reply arriving after the authorization expires", async () => {
    let resolveResponse!: (value: { reply: string }) => void;
    mocks.rpc.mockImplementation((path: string) => {
      if (path === "threads/companionScreenStart") return Promise.resolve({ id: "session-1", expiresAt: Date.now() + 300_000 });
      if (path === "threads/companionScreenRespond") return new Promise((resolve) => { resolveResponse = resolve; });
      return Promise.resolve({});
    });
    await startCompanionScreenAuto("bot-1", true);
    await flush();
    vi.setSystemTime(Date.now() + 300_001);
    resolveResponse({ reply: "过期回应" });
    await flush();
    expect(mocks.update).not.toHaveBeenCalledWith(expect.objectContaining({ latestReply: "过期回应" }));
    expect(mocks.speak).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenStop", expect.anything(), expect.anything());
  });

  it("checks the capture again when returning to the foreground", async () => {
    await startCompanionScreenAuto("bot-1");
    await flush();
    mocks.screen.mockResolvedValue("idle");
    mocks.appListener?.("active");
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("threads/companionScreenStop", expect.anything(), expect.anything());
    expect(mocks.appListener).toBeUndefined();
  });

  it("stops at expiration rather than waiting for the next normal poll", async () => {
    mocks.rpc.mockImplementation(async (path: string) => {
      if (path === "threads/companionScreenStart") return { id: "session-1", expiresAt: Date.now() + 10_000 };
      if (path === "threads/companionScreenRespond") return { reply: "回应" };
      return {};
    });
    await startCompanionScreenAuto("bot-1");
    await flush();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenStop")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenStop")).toHaveLength(1);
    expect(mocks.appListener).toBeUndefined();
  });

  it("retries empty recognition promptly and keeps changed text behind the response cooldown", async () => {
    mocks.text.mockResolvedValueOnce(null).mockResolvedValue("第一屏");
    await startCompanionScreenAuto("bot-1");
    await flush();
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(1);
    mocks.text.mockResolvedValue("第二屏");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    const calls = mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[1]).toEqual(expect.objectContaining({ text: "第二屏" }));
  });

  it("does not consume a new screen snapshot while waiting for the next allowed response", async () => {
    mocks.text.mockResolvedValueOnce("第一屏").mockResolvedValueOnce("第二屏").mockResolvedValue(null);
    await startCompanionScreenAuto("bot-1");
    await flush();
    expect(mocks.text).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(mocks.text).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.text).toHaveBeenCalledTimes(2);
    const calls = mocks.rpc.mock.calls.filter(([path]) => path === "threads/companionScreenRespond");
    expect(calls[1]?.[1]).toEqual(expect.objectContaining({ text: "第二屏" }));
  });
});
