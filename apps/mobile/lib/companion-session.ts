import type { BotAvatarSet } from "@rakazo/contracts";
import { useSyncExternalStore } from "react";
import {
  currentApiBase,
  isSpaceSelectionPending,
  selectedSpaceId,
  spaceSelectionSeq,
  subscribeSpaceSelection,
} from "./api";
import { registerBotNotificationProfiles } from "./bot-notification-registry";
import {
  activeCompanionIdentity,
  companionAvailable,
  isCallOwnedCompanionActivity,
  startCompanion,
  stopCompanion,
  subscribeCompanionActivity,
  updateCompanion,
} from "./companion-activity";
import { registerCompanionStop } from "./companion-lifecycle";
import { stopCompanionScreenAuto } from "./companion-screen-auto";
import type {
  ActiveCompanionSession,
  CompanionDetailStatus,
  CompanionMode,
  CompanionPreferences,
  CompanionRuntimeState,
  CompanionSessionState,
} from "./companion-session-state";
import {
  DEFAULT_COMPANION_PREFERENCES,
  getActiveCompanionSession,
  getCachedCompanionPreferences,
  getCompanionOpenThreadBotId,
  getCompanionSessionState,
  normalizeCompanionPreferences,
  publishCompanionRuntimeState,
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
  setCompanionOpenThreadBotId,
  setCompanionPreferencesState,
  subscribeCompanionSessionState,
} from "./companion-session-state";
import { currentSessionGeneration, subscribeSessionGeneration } from "./session";

export {
  type ActiveCompanionSession,
  type CompanionDetailStatus,
  type CompanionMode,
  type CompanionPreferences,
  type CompanionRuntimeState,
  type CompanionSessionState,
  DEFAULT_COMPANION_PREFERENCES,
  getActiveCompanionSession,
  getCachedCompanionPreferences,
  getCompanionOpenThreadBotId,
  getCompanionSessionState,
  normalizeCompanionPreferences,
  publishCompanionRuntimeState,
  setCompanionOpenThreadBotId,
  subscribeCompanionSessionState,
};

const STORAGE_KEY = "sydney.mobile.companionPrefs.v1";

let writeChain: Promise<void> = Promise.resolve();
let inAppSeq = 0;
let activeScope: {
  sessionGeneration: number;
  apiBase: string;
  spaceId: string | null;
  spaceSelection: number;
} | null = null;

function syncFromNativeActivity(): void {
  const nativeAvailable = companionAvailable();
  const current = getActiveCompanionSession();
  if (!nativeAvailable) {
    if (current?.mode === "live-activity") {
      activeScope = null;
      setActiveCompanionSessionState(null, { resetRuntime: true });
    }
    return;
  }
  const nativeAct = activeCompanionIdentity();
  if (!nativeAct || isCallOwnedCompanionActivity(nativeAct.id)) {
    if (current?.mode === "live-activity") {
      activeScope = null;
      setActiveCompanionSessionState(null, { resetRuntime: true });
    }
    return;
  }
  if (
    current &&
    current.mode === "live-activity" &&
    current.id === nativeAct.id &&
    current.botId === nativeAct.botId &&
    current.spaceId === nativeAct.spaceId &&
    current.showReply === (nativeAct.showReply ?? current.showReply)
  ) {
    return;
  }
  const preserved = current && current.botId === nativeAct.botId ? current : null;
  activeScope = {
    sessionGeneration: currentSessionGeneration(),
    apiBase: currentApiBase(),
    spaceId: nativeAct.spaceId,
    spaceSelection: spaceSelectionSeq(),
  };
  setActiveCompanionSessionState(
    {
      id: nativeAct.id,
      botId: nativeAct.botId,
      botName: preserved?.botName ?? "Sydney",
      botColor: preserved?.botColor ?? "#4F7CAC",
      botAvatarSet: preserved?.botAvatarSet ?? null,
      spaceId: nativeAct.spaceId,
      mode: "live-activity",
      showReply: nativeAct.showReply ?? getCachedCompanionPreferences().showReply,
      startedAt: preserved?.startedAt ?? Date.now(),
      linkToken: nativeAct.linkToken,
    },
    { resetRuntime: preserved?.id !== nativeAct.id },
  );
}

subscribeCompanionActivity(syncFromNativeActivity);

function clearLocalCompanionSession(): void {
  stopCompanionScreenAuto();
  activeScope = null;
  setActiveCompanionSessionState(null, { resetRuntime: true });
}

registerCompanionStop(async () => {
  clearLocalCompanionSession();
});

subscribeSessionGeneration(() => {
  if (activeScope && activeScope.sessionGeneration !== currentSessionGeneration()) {
    clearLocalCompanionSession();
  }
});

subscribeSpaceSelection(() => {
  const current = getActiveCompanionSession();
  if (!current || !activeScope) return;
  if (
    activeScope.spaceId !== selectedSpaceId() ||
    activeScope.spaceSelection !== spaceSelectionSeq()
  ) {
    void stopUnifiedCompanion().catch(() => {
      clearLocalCompanionSession();
    });
  }
});

export async function loadCompanionPreferences(): Promise<CompanionPreferences> {
  let next: CompanionPreferences;
  try {
    const SecureStore = await import("expo-secure-store");
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    next = raw
      ? normalizeCompanionPreferences(JSON.parse(raw))
      : { ...DEFAULT_COMPANION_PREFERENCES };
  } catch {
    next = { ...DEFAULT_COMPANION_PREFERENCES };
  }
  setCompanionPreferencesState(next, true);
  return next;
}

export async function updateCompanionPreferences(
  patch: Partial<CompanionPreferences>,
): Promise<CompanionPreferences> {
  const next: CompanionPreferences = { ...getCachedCompanionPreferences(), ...patch };
  setCompanionPreferencesState(next, true);
  const payload = JSON.stringify(next);
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, payload);
    })
    .catch(() => undefined);
  await writeChain;
  return next;
}

export type StartUnifiedCompanionInput = {
  botId: string;
  botName: string;
  botColor: string;
  botAvatarSet?: BotAvatarSet | null;
  spaceId?: string | null;
  showReply?: boolean;
  initialReply?: string | null;
};

export async function startUnifiedCompanion(
  input: StartUnifiedCompanionInput,
): Promise<ActiveCompanionSession> {
  const spaceId = input.spaceId !== undefined ? input.spaceId : selectedSpaceId();
  if (isSpaceSelectionPending()) {
    throw new Error("空间正在切换，请稍后再开启陪伴。");
  }
  const generation = currentSessionGeneration();
  const selection = spaceSelectionSeq();
  const apiBase = currentApiBase();
  const showReply = input.showReply ?? getCachedCompanionPreferences().showReply;
  const isScopeCurrent = () =>
    generation === currentSessionGeneration() &&
    selection === spaceSelectionSeq() &&
    !isSpaceSelectionPending() &&
    apiBase === currentApiBase() &&
    selectedSpaceId() === spaceId;

  if (!isScopeCurrent()) {
    throw new Error("会话已切换，请重新开启陪伴。");
  }

  stopCompanionScreenAuto();

  if (companionAvailable()) {
    await startCompanion(
      input.botId,
      input.botName,
      spaceId,
      showReply,
      { color: input.botColor, avatarSet: input.botAvatarSet ?? undefined },
      isScopeCurrent,
      isScopeCurrent,
    );
    const nativeAct = activeCompanionIdentity();
    if (!nativeAct || !isScopeCurrent()) {
      throw new Error("会话已切换，请重新开启陪伴。");
    }
    const session: ActiveCompanionSession = {
      id: nativeAct.id,
      botId: input.botId,
      botName: input.botName,
      botColor: input.botColor,
      botAvatarSet: input.botAvatarSet ?? null,
      spaceId,
      mode: "live-activity",
      showReply,
      startedAt: Date.now(),
      linkToken: nativeAct.linkToken,
    };
    activeScope = {
      sessionGeneration: generation,
      apiBase,
      spaceId,
      spaceSelection: selection,
    };
    setActiveCompanionSessionState(session, { resetRuntime: true });
    registerBotNotificationProfiles([
      {
        id: session.botId,
        name: session.botName,
        color: session.botColor,
        avatarSet: session.botAvatarSet,
      },
    ]);
    const seedReply = input.initialReply?.trim() || null;
    if (seedReply) {
      publishCompanionRuntimeState({
        activityId: session.id,
        botId: input.botId,
        status: "present",
        detailStatus: "present",
        latestReply: seedReply,
      });
      if (showReply) {
        void updateCompanion({
          botId: input.botId,
          spaceId,
          activityId: session.id,
          status: "present",
          latestReply: seedReply,
          isCurrent: isScopeCurrent,
        }).catch(() => undefined);
      }
    }
    void updateCompanionPreferences({ preferredBotId: input.botId, showReply });
    return session;
  }

  const session: ActiveCompanionSession = {
    id: `in-app-${++inAppSeq}`,
    botId: input.botId,
    botName: input.botName,
    botColor: input.botColor,
    botAvatarSet: input.botAvatarSet ?? null,
    spaceId,
    mode: "in-app",
    showReply,
    startedAt: Date.now(),
  };
  activeScope = {
    sessionGeneration: generation,
    apiBase,
    spaceId,
    spaceSelection: selection,
  };
  setActiveCompanionSessionState(session, { resetRuntime: true });
  registerBotNotificationProfiles([
    {
      id: session.botId,
      name: session.botName,
      color: session.botColor,
      avatarSet: session.botAvatarSet,
    },
  ]);
  const seedReply = input.initialReply?.trim() || null;
  if (seedReply) {
    publishCompanionRuntimeState({
      activityId: session.id,
      botId: input.botId,
      status: "present",
      detailStatus: "present",
      latestReply: seedReply,
    });
  }
  void updateCompanionPreferences({ preferredBotId: input.botId, showReply });
  return session;
}

export async function switchUnifiedCompanionBot(
  input: StartUnifiedCompanionInput,
): Promise<ActiveCompanionSession> {
  const current = getActiveCompanionSession();
  const targetSpaceId = input.spaceId !== undefined ? input.spaceId : selectedSpaceId();
  if (current && current.botId === input.botId && current.spaceId === targetSpaceId) {
    if (
      current.botName !== input.botName ||
      current.botColor !== input.botColor ||
      current.botAvatarSet !== (input.botAvatarSet ?? null)
    ) {
      if (current.mode === "live-activity" && companionAvailable()) {
        return startUnifiedCompanion(input);
      }
      const refreshed: ActiveCompanionSession = {
        ...current,
        botName: input.botName,
        botColor: input.botColor,
        botAvatarSet: input.botAvatarSet ?? null,
      };
      setActiveCompanionSessionState(refreshed);
      registerBotNotificationProfiles([
        {
          id: refreshed.botId,
          name: refreshed.botName,
          color: refreshed.botColor,
          avatarSet: refreshed.botAvatarSet,
        },
      ]);
      return refreshed;
    }
    return current;
  }
  return startUnifiedCompanion(input);
}

export async function stopUnifiedCompanion(): Promise<void> {
  const current = getActiveCompanionSession();
  const hadNative = companionAvailable() && Boolean(activeCompanionIdentity());
  clearLocalCompanionSession();
  if (current?.mode === "live-activity" || hadNative) {
    await stopCompanion();
  }
}

export function useCompanionSession(): CompanionSessionState {
  return useSyncExternalStore(
    subscribeCompanionSessionState,
    getCompanionSessionState,
    getCompanionSessionState,
  );
}

export function companionStatusDisplay(
  detailStatus: CompanionDetailStatus,
  locale: string,
): { label: string; tone: "active" | "busy" | "voice" | "error" } {
  const chinese = locale.startsWith("zh");
  const traditional = locale === "zh-TW";
  const pick = (zhHans: string, zhHant: string, en: string) =>
    chinese ? (traditional ? zhHant : zhHans) : en;
  switch (detailStatus) {
    case "thinking":
      return { label: pick("思考中…", "思考中…", "Thinking…"), tone: "busy" };
    case "waiting_input":
      return { label: pick("等待你的回复", "等待你的回覆", "Needs your input"), tone: "busy" };
    case "listening":
      return { label: pick("正在听…", "正在聽…", "Listening…"), tone: "voice" };
    case "speaking":
      return { label: pick("正在播报…", "正在播報…", "Speaking…"), tone: "voice" };
    case "disconnected":
      return {
        label: pick("连接已断开 · 重连中", "連線已斷開 · 重連中", "Reconnecting…"),
        tone: "error",
      };
    default:
      return { label: pick("我一直都在", "我一直都在", "Always here"), tone: "active" };
  }
}

export function resetCompanionSessionForTest(): void {
  writeChain = Promise.resolve();
  inAppSeq = 0;
  activeScope = null;
  resetCompanionSessionStateForTest();
}
