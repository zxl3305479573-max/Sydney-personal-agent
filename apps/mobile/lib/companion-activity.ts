import type { EventSubscription } from "expo-modules-core";
import { requireOptionalNativeModule } from "expo-modules-core";
import { companionAvatar } from "./companion-avatar";
import { registerCompanionStop } from "./companion-lifecycle";
import type { CallLiveActivityPhase, CompanionStatus } from "./companion-presentation";
import { callLiveActivityPresentation, companionPresentation } from "./companion-presentation";

type ActiveCompanion = {
  id: string;
  botId: string;
  spaceId: string;
  showReply: boolean;
  linkToken?: string;
};
export type CompanionScreenState =
  | "unsupported"
  | "idle"
  | "choosing"
  | "starting"
  | "capturing"
  | "paused"
  | "stopping"
  | "failed";

type CompanionNativeModule = {
  isAvailable(): boolean;
  supportsCallStatus?(): boolean;
  activeBotId(): string | null;
  activeActivity(): ActiveCompanion | null;
  start(
    botId: string,
    botName: string,
    spaceId: string | null,
    showReply: boolean,
    avatar: string | null,
  ): Promise<string>;
  startCall?(
    botId: string,
    botName: string,
    spaceId: string | null,
    showReply: boolean,
    avatar: string | null,
    status: string,
    reply: string | null,
    callStartedAtMs: number,
  ): Promise<string>;
  stopActivity(id: string): Promise<void>;
  stop(): Promise<void>;
  update(
    id: string,
    botId: string,
    spaceId: string | null,
    status: string,
    reply: string | null,
  ): Promise<void>;
  updateCall?(
    id: string,
    botId: string,
    spaceId: string | null,
    status: string,
    reply: string | null,
    callActive: boolean,
    callStartedAtMs: number | null,
  ): Promise<void>;
  screenState(): Promise<string>;
  presentScreen(botId: string, spaceId: string | null): Promise<void>;
  stopScreen(): Promise<void>;
  takeScreenText(): Promise<string | null>;
  peekScreenSnapshot?(): Promise<{ state?: string; text?: string; capturedAt?: number } | null>;
  getVoiceOutputMode?(): string | null;
  setVoiceOutputMode?(mode: string): Promise<void>;
  isBackgroundVoiceActive?(): boolean;
  addListener(
    event: "onScreenState",
    listener: (event: { state: string }) => void,
  ): EventSubscription;
};

const native = requireOptionalNativeModule<CompanionNativeModule>("SydneyCompanion");
let operations: Promise<void> = Promise.resolve();
let lastUpdate = "";
let revision = 0;
let callOwnedActivityId: string | null = null;
const listeners = new Set<() => void>();

export function companionActivityRevision(): number {
  return revision;
}

export function subscribeCompanionActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function activityChanged() {
  revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {}
  }
}

function enqueue(operation: () => Promise<void>): Promise<void> {
  const next = operations.then(operation, operation);
  operations = next.catch(() => undefined);
  return next;
}

export function companionAvailable(): boolean {
  return native?.isAvailable() ?? false;
}

export function companionSupportsCallStatus(): boolean {
  return Boolean(
    companionAvailable() &&
      typeof native?.supportsCallStatus === "function" &&
      native.supportsCallStatus(),
  );
}

export function nativeCompanionVoiceOutputMode(): "both" | "text" | "voice" | null {
  if (!native || !companionAvailable() || typeof native.getVoiceOutputMode !== "function") {
    return null;
  }
  try {
    const mode = native.getVoiceOutputMode();
    return mode === "both" || mode === "text" || mode === "voice" ? mode : null;
  } catch {
    return null;
  }
}

export async function syncCompanionVoiceOutputMode(mode: "both" | "text" | "voice"): Promise<void> {
  if (!native || !companionAvailable() || typeof native.setVoiceOutputMode !== "function") return;
  await native.setVoiceOutputMode(mode);
}

export function isCompanionBackgroundVoiceActive(): boolean {
  if (!native || !companionAvailable() || typeof native.isBackgroundVoiceActive !== "function") {
    return false;
  }
  try {
    return Boolean(native.isBackgroundVoiceActive());
  } catch {
    return false;
  }
}

export function isCallOwnedCompanionActivity(activityId: string | null | undefined): boolean {
  return Boolean(activityId && callOwnedActivityId && activityId === callOwnedActivityId);
}

export function activeCompanionBotId(): string | null {
  return companionAvailable() ? (native?.activeBotId() ?? null) : null;
}

export function activeCompanionIdentity(): {
  id: string;
  botId: string;
  spaceId: string | null;
  showReply?: boolean;
  linkToken?: string;
} | null {
  if (!native || !companionAvailable()) return null;
  const activity = native.activeActivity();
  return activity
    ? {
        id: activity.id,
        botId: activity.botId,
        spaceId: activity.spaceId || null,
        showReply: activity.showReply,
        linkToken: activity.linkToken || undefined,
      }
    : null;
}

export async function startCompanion(
  botId: string,
  botName: string,
  spaceId: string | null,
  showReply: boolean,
  avatar: { color: string; avatarSet?: string | null },
  isCurrent: () => boolean,
  isScopeCurrent: () => boolean,
) {
  if (!native || !companionAvailable()) throw new Error("当前安装版本不支持灵动岛陪伴。");
  const presentation = companionPresentation({ botName, status: "present", showReply: false });
  lastUpdate = "";
  const artwork = companionAvatar({ botId, ...avatar });
  await enqueue(async () => {
    if (!isCurrent()) throw new Error("会话已切换，请重新开启陪伴。");
    await native.stopScreen();
    if (!isCurrent()) throw new Error("会话已切换，请重新开启陪伴。");
    try {
      callOwnedActivityId = null;
      const id = await native.start(botId, presentation.title, spaceId, showReply, artwork);
      if (!isScopeCurrent()) {
        await native.stopActivity(id);
        throw new Error("会话已切换，请重新开启陪伴。");
      }
    } finally {
      activityChanged();
    }
  });
}

export async function stopCompanion(isCurrent?: () => boolean) {
  if (!native || !companionAvailable()) throw new Error("当前安装版本不支持灵动岛陪伴。");
  lastUpdate = "";
  await enqueue(async () => {
    if (isCurrent && !isCurrent()) throw new Error("会话已切换，请重新操作陪伴。");
    try {
      callOwnedActivityId = null;
      await native.stop();
    } finally {
      activityChanged();
    }
  });
}

export async function startCallLiveActivity(input: {
  botId: string;
  botName: string;
  spaceId: string | null;
  showReply: boolean;
  avatar: { color: string; avatarSet?: string | null };
  phase?: CallLiveActivityPhase;
  caption?: string | null;
  callStartedAtMs?: number;
  isCurrent?: () => boolean;
}): Promise<string | null> {
  if (!native || !companionAvailable()) return null;
  const richNativeStatus = companionSupportsCallStatus();
  const phase = input.phase ?? "listening";
  const startedAtMs = input.callStartedAtMs ?? Date.now();
  const presentation = callLiveActivityPresentation({
    botName: input.botName,
    phase,
    caption: input.caption ?? null,
    showReply: input.showReply,
    richNativeStatus,
  });
  const artwork = companionAvatar({ botId: input.botId, ...input.avatar });
  let createdId: string | null = null;
  await enqueue(async () => {
    if (input.isCurrent && !input.isCurrent()) return;
    lastUpdate = "";
    const id =
      richNativeStatus && typeof native.startCall === "function"
        ? await native.startCall(
            input.botId,
            presentation.title,
            input.spaceId,
            input.showReply,
            artwork,
            presentation.status,
            presentation.reply,
            startedAtMs,
          )
        : await native.start(
            input.botId,
            presentation.title,
            input.spaceId,
            input.showReply,
            artwork,
          );
    if (input.isCurrent && !input.isCurrent()) {
      await native.stopActivity(id);
      return;
    }
    callOwnedActivityId = id;
    createdId = id;
    if (richNativeStatus && typeof native.startCall === "function") {
      lastUpdate = JSON.stringify([
        "call",
        id,
        presentation.status,
        presentation.reply,
        startedAtMs,
      ]);
    }
    activityChanged();
  });
  return createdId;
}

export async function stopCallOwnedLiveActivity(activityId?: string): Promise<void> {
  if (!native || !companionAvailable()) return;
  await enqueue(async () => {
    const targetId = activityId ?? callOwnedActivityId;
    if (!targetId || targetId !== callOwnedActivityId) return;
    callOwnedActivityId = null;
    lastUpdate = "";
    try {
      await native.stopActivity(targetId);
    } finally {
      activityChanged();
    }
  });
}

export function updateCallLiveActivity(input: {
  botId: string;
  spaceId: string | null;
  phase: CallLiveActivityPhase;
  caption: string | null;
  callStartedAtMs: number;
  activityId?: string;
  isCurrent?: () => boolean;
}): Promise<void> {
  if (!native || !companionAvailable()) return Promise.resolve();
  const active = native.activeActivity();
  if (
    !active ||
    active.botId !== input.botId ||
    active.spaceId !== (input.spaceId ?? "") ||
    (input.activityId && active.id !== input.activityId)
  ) {
    return Promise.resolve();
  }
  const richNativeStatus = companionSupportsCallStatus();
  const presentation = callLiveActivityPresentation({
    botName: "",
    phase: input.phase,
    caption: input.caption,
    showReply: active.showReply,
    richNativeStatus,
  });
  const key = JSON.stringify([
    "call",
    active.id,
    presentation.status,
    presentation.reply,
    richNativeStatus ? input.callStartedAtMs : 0,
  ]);
  if (key === lastUpdate) return Promise.resolve();
  lastUpdate = key;
  return enqueue(async () => {
    if ((input.isCurrent && !input.isCurrent()) || native.activeActivity()?.id !== active.id) {
      if (lastUpdate === key) lastUpdate = "";
      return;
    }
    if (richNativeStatus && typeof native.updateCall === "function") {
      await native.updateCall(
        active.id,
        input.botId,
        input.spaceId,
        presentation.status,
        presentation.reply,
        true,
        input.callStartedAtMs,
      );
    } else {
      await native.update(
        active.id,
        input.botId,
        input.spaceId,
        presentation.status,
        presentation.reply,
      );
    }
  }).catch((error) => {
    if (lastUpdate === key) lastUpdate = "";
    throw error;
  });
}

export async function stopCompanionIfAvailable() {
  if (companionAvailable()) await stopCompanion();
}

registerCompanionStop(stopCompanionIfAvailable);

function validScreenState(value: string): CompanionScreenState {
  return ["idle", "choosing", "starting", "capturing", "paused", "stopping", "failed"].includes(
    value,
  )
    ? (value as CompanionScreenState)
    : "unsupported";
}

export async function companionScreenState(): Promise<CompanionScreenState> {
  if (!native || !companionAvailable()) return "unsupported";
  return validScreenState(await native.screenState());
}

export function subscribeCompanionScreenState(
  listener: (state: CompanionScreenState) => void,
): () => void {
  if (!native || !companionAvailable()) return () => undefined;
  const subscription = native.addListener("onScreenState", (event) =>
    listener(validScreenState(event.state)),
  );
  return () => subscription.remove();
}

export async function presentCompanionScreen(botId: string, spaceId: string | null): Promise<void> {
  if (!native || !companionAvailable()) throw new Error("当前安装版本不支持屏幕识别。");
  await native.presentScreen(botId, spaceId);
}

export async function stopCompanionScreen(): Promise<void> {
  if (!native || !companionAvailable()) throw new Error("当前安装版本不支持屏幕识别。");
  await native.stopScreen();
}

export async function takeCompanionScreenText(): Promise<string | null> {
  if (!native || !companionAvailable()) return null;
  return native.takeScreenText();
}

export async function peekCompanionScreenSnapshot(): Promise<{
  state: CompanionScreenState;
  text: string | null;
  capturedAt: number | null;
} | null> {
  if (!native || !companionAvailable()) return null;
  if (typeof native.peekScreenSnapshot === "function") {
    const snap = await native.peekScreenSnapshot();
    if (!snap) return null;
    const state = validScreenState(typeof snap.state === "string" ? snap.state : "unsupported");
    const text = typeof snap.text === "string" && snap.text.trim() ? snap.text.trim() : null;
    const capturedAt =
      typeof snap.capturedAt === "number" && Number.isFinite(snap.capturedAt)
        ? Math.round(snap.capturedAt)
        : null;
    return { state, text, capturedAt };
  }
  const state = await companionScreenState();
  return { state, text: null, capturedAt: null };
}

export function updateCompanion(input: {
  botId: string;
  spaceId: string | null;
  status: CompanionStatus;
  latestReply: string | null;
  activityId?: string;
  isCurrent?: () => boolean;
}): Promise<void> {
  if (!native || !companionAvailable()) return Promise.resolve();
  const active = native.activeActivity();
  if (
    !active ||
    active.botId !== input.botId ||
    active.spaceId !== (input.spaceId ?? "") ||
    (input.activityId && active.id !== input.activityId)
  ) {
    return Promise.resolve();
  }
  const presentation = companionPresentation({
    botName: "",
    status: input.status,
    latestReply: input.latestReply,
    showReply: active.showReply,
  });
  const key = JSON.stringify([active.id, presentation.status, presentation.reply]);
  if (key === lastUpdate) return Promise.resolve();
  lastUpdate = key;
  return enqueue(async () => {
    if ((input.isCurrent && !input.isCurrent()) || native.activeActivity()?.id !== active.id) {
      if (lastUpdate === key) lastUpdate = "";
      return;
    }
    await native.update(
      active.id,
      input.botId,
      input.spaceId,
      presentation.status,
      presentation.reply,
    );
  }).catch((error) => {
    if (lastUpdate === key) lastUpdate = "";
    throw error;
  });
}
