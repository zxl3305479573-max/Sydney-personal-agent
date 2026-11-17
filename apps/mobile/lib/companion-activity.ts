import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";
import { registerCompanionStop } from "./companion-lifecycle";
import { companionAvatar } from "./companion-avatar";
import { companionPresentation, type CompanionStatus } from "./companion-presentation";

type ActiveCompanion = { id: string; botId: string; spaceId: string; showReply: boolean; linkToken?: string };
export type CompanionScreenState =
  | "unsupported" | "idle" | "choosing" | "starting" | "capturing" | "paused" | "stopping" | "failed";

type CompanionNativeModule = {
  isAvailable(): boolean;
  activeBotId(): string | null;
  activeActivity(): ActiveCompanion | null;
  start(botId: string, botName: string, spaceId: string | null, showReply: boolean, avatar: string | null): Promise<string>;
  stopActivity(id: string): Promise<void>;
  stop(): Promise<void>;
  update(id: string, botId: string, spaceId: string | null, status: string, reply: string | null): Promise<void>;
  screenState(): Promise<string>;
  presentScreen(botId: string, spaceId: string | null): Promise<void>;
  stopScreen(): Promise<void>;
  takeScreenText(): Promise<string | null>;
  addListener(event: "onScreenState", listener: (event: { state: string }) => void): EventSubscription;
};

const native = requireOptionalNativeModule<CompanionNativeModule>("SydneyCompanion");
let operations: Promise<void> = Promise.resolve();
let lastUpdate = "";
let revision = 0;
const listeners = new Set<() => void>();

export function companionActivityRevision(): number {
  return revision;
}

export function subscribeCompanionActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function activityChanged() {
  revision += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      continue;
    }
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

export function activeCompanionBotId(): string | null {
  return companionAvailable() ? native?.activeBotId() ?? null : null;
}

export function activeCompanionIdentity(): { id: string; botId: string; spaceId: string | null; linkToken?: string } | null {
  if (!native || !companionAvailable()) return null;
  const activity = native.activeActivity();
  return activity
    ? { id: activity.id, botId: activity.botId, spaceId: activity.spaceId || null, linkToken: activity.linkToken || undefined }
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
      await native.stop();
    } finally {
      activityChanged();
    }
  });
}

export async function stopCompanionIfAvailable() {
  if (companionAvailable()) await stopCompanion();
}

registerCompanionStop(stopCompanionIfAvailable);

function validScreenState(value: string): CompanionScreenState {
  return ["idle", "choosing", "starting", "capturing", "paused", "stopping", "failed"].includes(value)
    ? value as CompanionScreenState
    : "unsupported";
}

export async function companionScreenState(): Promise<CompanionScreenState> {
  if (!native || !companionAvailable()) return "unsupported";
  return validScreenState(await native.screenState());
}

export function subscribeCompanionScreenState(listener: (state: CompanionScreenState) => void): () => void {
  if (!native || !companionAvailable()) return () => undefined;
  const subscription = native.addListener("onScreenState", (event) => listener(validScreenState(event.state)));
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
  if (!active || active.botId !== input.botId || active.spaceId !== (input.spaceId ?? "") ||
    (input.activityId && active.id !== input.activityId)) {
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
    await native.update(active.id, input.botId, input.spaceId, presentation.status, presentation.reply);
  }).catch((error) => {
    if (lastUpdate === key) lastUpdate = "";
    throw error;
  });
}
