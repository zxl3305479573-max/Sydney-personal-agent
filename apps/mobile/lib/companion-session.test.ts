import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  nativeAvailable: false,
  nativeActivity: null as null | {
    id: string;
    botId: string;
    spaceId: string | null;
    showReply?: boolean;
    linkToken?: string;
  },
  sessionGen: 1,
  spaceId: "space-1" as string | null,
  spaceSeq: 1,
  spacePending: false,
  apiBase: "https://api.example",
  store: new Map<string, string>(),
  sessionListeners: new Set<() => void>(),
  spaceListeners: new Set<() => void>(),
  activityListeners: new Set<() => void>(),
  startCompanion: vi.fn(),
  stopCompanion: vi.fn(),
  stopCompanionScreenAuto: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => state.store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    state.store.set(key, value);
  }),
}));
vi.mock("./api", () => ({
  currentApiBase: () => state.apiBase,
  selectedSpaceId: () => state.spaceId,
  spaceSelectionSeq: () => state.spaceSeq,
  isSpaceSelectionPending: () => state.spacePending,
  subscribeSpaceSelection: (listener: () => void) => {
    state.spaceListeners.add(listener);
    return () => state.spaceListeners.delete(listener);
  },
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => state.sessionGen,
  subscribeSessionGeneration: (listener: () => void) => {
    state.sessionListeners.add(listener);
    return () => state.sessionListeners.delete(listener);
  },
}));
vi.mock("./companion-activity", () => ({
  companionAvailable: () => state.nativeAvailable,
  activeCompanionIdentity: () => state.nativeActivity,
  startCompanion: state.startCompanion,
  stopCompanion: state.stopCompanion,
  subscribeCompanionActivity: (listener: () => void) => {
    state.activityListeners.add(listener);
    return () => state.activityListeners.delete(listener);
  },
}));
vi.mock("./companion-screen-auto", () => ({
  stopCompanionScreenAuto: state.stopCompanionScreenAuto,
}));

import { stopCompanionOnSessionChange } from "./companion-lifecycle";
import {
  DEFAULT_COMPANION_PREFERENCES,
  getCompanionSessionState,
  loadCompanionPreferences,
  normalizeCompanionPreferences,
  resetCompanionSessionForTest,
  startUnifiedCompanion,
  stopUnifiedCompanion,
  switchUnifiedCompanionBot,
  updateCompanionPreferences,
} from "./companion-session";

beforeEach(() => {
  vi.clearAllMocks();
  state.nativeAvailable = false;
  state.nativeActivity = null;
  state.sessionGen = 1;
  state.spaceId = "space-1";
  state.spaceSeq = 1;
  state.spacePending = false;
  state.apiBase = "https://api.example";
  state.store.clear();
  state.startCompanion.mockImplementation(
    async (botId: string, _name: string, spaceId: string | null, showReply: boolean) => {
      state.nativeActivity = { id: "native-act-1", botId, spaceId, showReply };
    },
  );
  state.stopCompanion.mockImplementation(async () => {
    state.nativeActivity = null;
  });
  resetCompanionSessionForTest();
});

describe("companion-session (CMP-01)", () => {
  it("starts, switches, and stops an in-app companion when native Live Activity is unavailable", async () => {
    const started = await startUnifiedCompanion({
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-1",
      showReply: true,
    });
    expect(started.mode).toBe("in-app");
    expect(started.botId).toBe("bot-1");
    expect(state.startCompanion).not.toHaveBeenCalled();
    expect(getCompanionSessionState().active?.botName).toBe("Sydney");

    const switched = await switchUnifiedCompanionBot({
      botId: "bot-2",
      botName: "Claude",
      botColor: "#8B5CF6",
      spaceId: "space-1",
    });
    expect(switched.mode).toBe("in-app");
    expect(switched.botId).toBe("bot-2");
    expect(getCompanionSessionState().active?.botId).toBe("bot-2");

    await stopUnifiedCompanion();
    expect(getCompanionSessionState().active).toBeNull();
    expect(state.stopCompanion).not.toHaveBeenCalled();
  });

  it("delegates to native Live Activity when available", async () => {
    state.nativeAvailable = true;
    const started = await startUnifiedCompanion({
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-1",
      showReply: false,
    });
    expect(started.mode).toBe("live-activity");
    expect(started.id).toBe("native-act-1");
    expect(state.startCompanion).toHaveBeenCalledWith(
      "bot-1",
      "Sydney",
      "space-1",
      false,
      expect.objectContaining({ color: "#4F7CAC" }),
      expect.any(Function),
      expect.any(Function),
    );

    await stopUnifiedCompanion();
    expect(state.stopCompanion).toHaveBeenCalledOnce();
    expect(getCompanionSessionState().active).toBeNull();
  });

  it("rejects starting while workspace selection is pending", async () => {
    state.spacePending = true;
    await expect(
      startUnifiedCompanion({
        botId: "bot-1",
        botName: "Sydney",
        botColor: "#4F7CAC",
      }),
    ).rejects.toThrow("空间正在切换");
    expect(getCompanionSessionState().active).toBeNull();
  });

  it("persists preferences to SecureStore and falls back cleanly on corrupt JSON", async () => {
    await updateCompanionPreferences({
      preferredBotId: "bot-9",
      showReply: false,
      showFloatingBar: false,
      notifyOnReply: false,
      speakReplies: true,
    });
    resetCompanionSessionForTest();
    const loaded = await loadCompanionPreferences();
    expect(loaded).toEqual({
      preferredBotId: "bot-9",
      showReply: false,
      showFloatingBar: false,
      notifyOnReply: false,
      speakReplies: true,
    });

    state.store.set("sydney.mobile.companionPrefs.v1", "{bad-json");
    const recovered = await loadCompanionPreferences();
    expect(recovered).toEqual(DEFAULT_COMPANION_PREFERENCES);
    expect(normalizeCompanionPreferences(null)).toEqual(DEFAULT_COMPANION_PREFERENCES);
  });

  it("clears active companion on session generation change, space switch, or logout", async () => {
    await startUnifiedCompanion({
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-1",
    });
    expect(getCompanionSessionState().active).not.toBeNull();

    state.sessionGen = 2;
    for (const listener of state.sessionListeners) listener();
    expect(getCompanionSessionState().active).toBeNull();

    await startUnifiedCompanion({
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-1",
    });
    state.spaceId = "space-2";
    state.spaceSeq = 2;
    for (const listener of state.spaceListeners) listener();
    expect(getCompanionSessionState().active).toBeNull();

    await startUnifiedCompanion({
      botId: "bot-1",
      botName: "Sydney",
      botColor: "#4F7CAC",
      spaceId: "space-2",
    });
    await stopCompanionOnSessionChange();
    expect(getCompanionSessionState().active).toBeNull();
  });
});
