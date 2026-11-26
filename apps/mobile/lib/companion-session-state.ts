import type { BotAvatarSet } from "@rakazo/contracts";
import type { CompanionStatus } from "./companion-presentation";

export type CompanionMode = "live-activity" | "in-app";

export type CompanionVoiceOutputMode = "both" | "text" | "voice";

export type CompanionDetailStatus =
  | "present"
  | "thinking"
  | "waiting_input"
  | "listening"
  | "speaking"
  | "disconnected";

export type CompanionPreferences = {
  preferredBotId: string | null;
  showReply: boolean;
  showFloatingBar: boolean;
  notifyOnReply: boolean;
  speakReplies: boolean;
  islandVoiceOutput: CompanionVoiceOutputMode;
};

export type ActiveCompanionSession = {
  id: string;
  botId: string;
  botName: string;
  botColor: string;
  botAvatarSet?: BotAvatarSet | null;
  spaceId: string | null;
  mode: CompanionMode;
  showReply: boolean;
  startedAt: number;
  linkToken?: string;
};

export type CompanionRuntimeState = {
  status: CompanionStatus;
  detailStatus: CompanionDetailStatus;
  latestReply: string | null;
  latestMessageId: string | null;
  updatedAt: number | null;
  reconnecting: boolean;
};

export type CompanionSessionState = {
  active: ActiveCompanionSession | null;
  runtime: CompanionRuntimeState;
  preferences: CompanionPreferences;
  preferencesLoaded: boolean;
};

export const DEFAULT_COMPANION_PREFERENCES: CompanionPreferences = {
  preferredBotId: null,
  showReply: true,
  showFloatingBar: true,
  notifyOnReply: true,
  speakReplies: false,
  islandVoiceOutput: "both",
};

export const INITIAL_COMPANION_RUNTIME: CompanionRuntimeState = {
  status: "present",
  detailStatus: "present",
  latestReply: null,
  latestMessageId: null,
  updatedAt: null,
  reconnecting: false,
};

let activeSession: ActiveCompanionSession | null = null;
let runtimeState: CompanionRuntimeState = { ...INITIAL_COMPANION_RUNTIME };
let preferences: CompanionPreferences = { ...DEFAULT_COMPANION_PREFERENCES };
let preferencesLoaded = false;
let openThreadBotId: string | null = null;
let stateRevision = 0;
let identityRevision = 0;
let cachedSnapshot: CompanionSessionState = {
  active: activeSession,
  runtime: runtimeState,
  preferences,
  preferencesLoaded,
};

const listeners = new Set<() => void>();

function emit(): void {
  stateRevision += 1;
  cachedSnapshot = {
    active: activeSession,
    runtime: runtimeState,
    preferences,
    preferencesLoaded,
  };
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // Ignore subscriber exceptions so other observers remain consistent.
    }
  }
}

export function normalizeCompanionPreferences(input: unknown): CompanionPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_COMPANION_PREFERENCES };
  }
  const raw = input as Record<string, unknown>;
  const preferredBotId =
    typeof raw.preferredBotId === "string" && raw.preferredBotId.trim()
      ? raw.preferredBotId.trim()
      : null;
  const islandVoiceOutput: CompanionVoiceOutputMode =
    raw.islandVoiceOutput === "text" ||
    raw.islandVoiceOutput === "voice" ||
    raw.islandVoiceOutput === "both"
      ? raw.islandVoiceOutput
      : DEFAULT_COMPANION_PREFERENCES.islandVoiceOutput;
  return {
    preferredBotId,
    showReply:
      typeof raw.showReply === "boolean" ? raw.showReply : DEFAULT_COMPANION_PREFERENCES.showReply,
    showFloatingBar:
      typeof raw.showFloatingBar === "boolean"
        ? raw.showFloatingBar
        : DEFAULT_COMPANION_PREFERENCES.showFloatingBar,
    notifyOnReply:
      typeof raw.notifyOnReply === "boolean"
        ? raw.notifyOnReply
        : DEFAULT_COMPANION_PREFERENCES.notifyOnReply,
    speakReplies:
      typeof raw.speakReplies === "boolean"
        ? raw.speakReplies
        : DEFAULT_COMPANION_PREFERENCES.speakReplies,
    islandVoiceOutput,
  };
}

export function subscribeCompanionSessionState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function companionSessionRevision(): number {
  return stateRevision;
}

export function companionSessionIdentityRevision(): number {
  return identityRevision;
}

export function getCompanionSessionState(): CompanionSessionState {
  return cachedSnapshot;
}

export function getActiveCompanionSession(): ActiveCompanionSession | null {
  return activeSession;
}

export function getCachedCompanionPreferences(): CompanionPreferences {
  return preferences;
}

export function setCompanionPreferencesState(
  next: CompanionPreferences,
  loaded = preferencesLoaded,
): void {
  preferences = { ...next };
  preferencesLoaded = loaded;
  if (activeSession && activeSession.mode === "in-app") {
    activeSession = { ...activeSession, showReply: next.showReply };
  }
  emit();
}

export function setActiveCompanionSessionState(
  next: ActiveCompanionSession | null,
  options?: { resetRuntime?: boolean },
): void {
  const prev = activeSession;
  const identityChanged =
    prev?.id !== next?.id ||
    prev?.botId !== next?.botId ||
    prev?.spaceId !== next?.spaceId ||
    prev?.mode !== next?.mode;
  activeSession = next ? { ...next } : null;
  if (identityChanged) {
    identityRevision += 1;
  }
  if (!next || options?.resetRuntime) {
    runtimeState = { ...INITIAL_COMPANION_RUNTIME };
  }
  emit();
}

export function publishCompanionRuntimeState(input: {
  activityId: string;
  botId: string;
  status: CompanionStatus;
  detailStatus: CompanionDetailStatus;
  latestReply: string | null;
  latestMessageId?: string | null;
  reconnecting?: boolean;
  updatedAt?: number;
}): void {
  if (
    activeSession &&
    (activeSession.id !== input.activityId || activeSession.botId !== input.botId)
  ) {
    return;
  }
  const next: CompanionRuntimeState = {
    status: input.status,
    detailStatus: input.detailStatus,
    latestReply: input.latestReply,
    latestMessageId:
      input.latestMessageId !== undefined ? input.latestMessageId : runtimeState.latestMessageId,
    updatedAt: input.updatedAt ?? Date.now(),
    reconnecting: Boolean(input.reconnecting),
  };
  if (
    runtimeState.status === next.status &&
    runtimeState.detailStatus === next.detailStatus &&
    runtimeState.latestReply === next.latestReply &&
    runtimeState.latestMessageId === next.latestMessageId &&
    runtimeState.reconnecting === next.reconnecting
  ) {
    return;
  }
  runtimeState = next;
  emit();
}

export function setCompanionOpenThreadBotId(botId: string | null): void {
  openThreadBotId = botId?.trim() || null;
}

export function getCompanionOpenThreadBotId(): string | null {
  return openThreadBotId;
}

export function resetCompanionSessionStateForTest(): void {
  activeSession = null;
  runtimeState = { ...INITIAL_COMPANION_RUNTIME };
  preferences = { ...DEFAULT_COMPANION_PREFERENCES };
  preferencesLoaded = false;
  openThreadBotId = null;
  identityRevision += 1;
  emit();
}
