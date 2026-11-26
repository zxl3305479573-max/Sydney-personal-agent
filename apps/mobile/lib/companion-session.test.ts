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
  updateCompanion: vi.fn(async () => undefined),
  nativeVoiceOutputMode: null as "both" | "text" | "voice" | null,
  syncVoiceOutputMode: vi.fn(async () => undefined),
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
  isCallOwnedCompanionActivity: () => false,
  nativeCompanionVoiceOutputMode: () => state.nativeVoiceOutputMode,
  syncCompanionVoiceOutputMode: state.syncVoiceOutputMode,
  startCompanion: state.startCompanion,
  stopCompanion: state.stopCompanion,
  updateCompanion: state.updateCompanion,
  subscribeCompanionActivity: (listener: () => void) => {
    state.activityListeners.add(listener);
    return () => state.activityListeners.delete(listener);
  },
}));
vi.mock("./companion-screen-auto", () => ({
  stopCompanionScreenAuto: state.stopCompanionScreenAuto,
}));

import {
  clearBotNotificationProfiles,
  registerBotNotificationProfiles,
} from "./bot-notification-registry";
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
  state.nativeVoiceOutputMode = null;
  state.store.clear();
  state.startCompanion.mockImplementation(
    async (botId: string, _name: string, spaceId: string | null, showReply: boolean) => {
      state.nativeActivity = { id: "native-act-1", botId, spaceId, showReply };
    },
  );
  state.stopCompanion.mockImplementation(async () => {
    state.nativeActivity = null;
  });
  clearBotNotificationProfiles();
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

  it("seeds Dynamic Island immediately with each bot's avatar and latest reply when starting or switching bots", async () => {
    state.nativeAvailable = true;
    await startUnifiedCompanion({
      botId: "bot-a",
      botName: "大肥鱼",
      botColor: "#EAB308::shape_2",
      spaceId: "space-1",
      showReply: true,
      initialReply: "任务已经全部整理好了",
    });
    expect(state.startCompanion).toHaveBeenCalledWith(
      "bot-a",
      "大肥鱼",
      "space-1",
      true,
      expect.objectContaining({ color: "#EAB308::shape_2" }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(state.updateCompanion).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot-a",
        spaceId: "space-1",
        status: "present",
        latestReply: "任务已经全部整理好了",
      }),
    );

    await switchUnifiedCompanionBot({
      botId: "bot-b",
      botName: "Claude",
      botColor: "data:image/png;base64,YWJj",
      spaceId: "space-1",
      showReply: true,
      initialReply: "这是第二个伙伴的最新回复",
    });
    expect(state.startCompanion).toHaveBeenLastCalledWith(
      "bot-b",
      "Claude",
      "space-1",
      true,
      expect.objectContaining({ color: "data:image/png;base64,YWJj" }),
      expect.any(Function),
      expect.any(Function),
    );
    expect(state.updateCompanion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        botId: "bot-b",
        latestReply: "这是第二个伙伴的最新回复",
      }),
    );

    // Updating the same bot's avatar refreshes the native Live Activity too.
    await switchUnifiedCompanionBot({
      botId: "bot-b",
      botName: "Claude Pro",
      botColor: "#2563EB",
      spaceId: "space-1",
      showReply: true,
    });
    expect(state.startCompanion).toHaveBeenCalledTimes(3);
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
      islandVoiceOutput: "text",
    });
    expect(state.syncVoiceOutputMode).toHaveBeenCalledWith("text");
    resetCompanionSessionForTest();
    const loaded = await loadCompanionPreferences();
    expect(loaded).toEqual({
      preferredBotId: "bot-9",
      showReply: false,
      showFloatingBar: false,
      notifyOnReply: false,
      speakReplies: true,
      islandVoiceOutput: "text",
    });

    // When user cycles output mode natively on the Dynamic Island, loading preferences reconciles from native.
    state.nativeVoiceOutputMode = "voice";
    const syncedFromIsland = await loadCompanionPreferences();
    expect(syncedFromIsland.islandVoiceOutput).toBe("voice");
    state.nativeVoiceOutputMode = null;

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

  it("hydrates bot name and custom avatar from bot profile registry when started via BotProfile or restored from native Live Activity", () => {
    state.nativeAvailable = true;
    const customAvatar = "data:image/png;base64,iVBORw0KGgo=";

    // Case 1: BotProfile registers bot before starting native companion directly.
    registerBotNotificationProfiles([
      { id: "bot-fish", name: "大肥鱼-总管", color: customAvatar, avatarSet: "organic" },
    ]);
    state.nativeActivity = {
      id: "native-fish-1",
      botId: "bot-fish",
      spaceId: "space-1",
      showReply: true,
    };
    for (const listener of state.activityListeners) listener();
    expect(getCompanionSessionState().active).toMatchObject({
      botId: "bot-fish",
      botName: "大肥鱼-总管",
      botColor: customAvatar,
      botAvatarSet: "organic",
    });

    // Case 2: Cold restart sees native activity before bots list arrives -> reconciles automatically once profiles load.
    clearBotNotificationProfiles();
    resetCompanionSessionForTest();
    state.nativeActivity = {
      id: "native-fish-2",
      botId: "bot-fish-2",
      spaceId: "space-1",
      showReply: true,
    };
    for (const listener of state.activityListeners) listener();
    expect(getCompanionSessionState().active?.botName).toBe("Sydney");

    registerBotNotificationProfiles([
      { id: "bot-fish-2", name: "大肥鱼-总管", color: customAvatar, avatarSet: "organic" },
    ]);
    expect(getCompanionSessionState().active).toMatchObject({
      botId: "bot-fish-2",
      botName: "大肥鱼-总管",
      botColor: customAvatar,
      botAvatarSet: "organic",
    });
  });
});
