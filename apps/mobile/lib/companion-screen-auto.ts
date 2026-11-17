import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { captureApiRequestContext, rpc, subscribeSpaceSelection } from "./api";
import {
  companionScreenState,
  subscribeCompanionScreenState,
  takeCompanionScreenText,
  updateCompanion,
} from "./companion-activity";
import { captureScreenSendScope, screenSendScopeCurrent } from "./companion-screen-send";
import { subscribeSessionGeneration } from "./session";
import { getSnapshot as getCallSnapshot, subscribe as subscribeCall } from "./call-session";
import { createSpeechOwner, getVoicePlaybackState, speakWithDeviceVoice, stopSpeaking } from "./voice";

type AutoState = {
  phase: "idle" | "starting" | "active" | "failed";
  botId?: string;
  reply?: string;
  error?: string;
};

let state: AutoState = { phase: "idle" };
let generation = 0;
let cancel: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let cleanup: (() => void) | undefined;
const listeners = new Set<() => void>();
const publish = (next: AutoState) => {
  state = next;
  for (const listener of listeners) listener();
};

export function companionScreenAutoSnapshot(): AutoState {
  return state;
}

export function subscribeCompanionScreenAuto(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useCompanionScreenAuto(): AutoState {
  return useSyncExternalStore(
    subscribeCompanionScreenAuto,
    companionScreenAutoSnapshot,
    companionScreenAutoSnapshot,
  );
}

export function stopCompanionScreenAuto(): void {
  generation += 1;
  cancel?.abort();
  cancel = undefined;
  if (timer) clearTimeout(timer);
  timer = undefined;
  cleanup?.();
  cleanup = undefined;
  publish({ phase: "idle" });
}

export async function startCompanionScreenAuto(botId: string, speakReplies = false): Promise<void> {
  stopCompanionScreenAuto();
  const scope = captureScreenSendScope(botId);
  const mine = ++generation;
  const controller = new AbortController();
  cancel = controller;
  const current = () => generation === mine && !controller.signal.aborted && screenSendScopeCurrent(scope);
  const ensureCurrent = () => {
    if (current()) return true;
    if (generation === mine) stopCompanionScreenAuto();
    return false;
  };
  const stopIfChanged = () => { if (!current()) stopCompanionScreenAuto(); };
  const offScreen = subscribeCompanionScreenState((value) => {
    if (value !== "capturing") stopCompanionScreenAuto();
  });
  const offSession = subscribeSessionGeneration(stopCompanionScreenAuto);
  const offSpace = subscribeSpaceSelection(stopIfChanged);
  const speechOwner = createSpeechOwner();
  const offCall = subscribeCall(() => {
    if (getCallSnapshot()) stopSpeaking(speechOwner);
  });
  cleanup = () => { offScreen(); offSession(); offSpace(); offCall(); stopSpeaking(speechOwner); };
  publish({ phase: "starting", botId });
  let sessionId: string | undefined;
  let context: Awaited<ReturnType<typeof captureApiRequestContext>> | undefined;
  let lastText = "";
  let nextSendAt = 0;
  let showingThinking = false;
  let removeAppState: (() => void) | undefined;
  const close = () => {
    removeAppState?.();
    removeAppState = undefined;
    if (showingThinking && screenSendScopeCurrent(scope)) {
      showingThinking = false;
      void updateCompanion({ botId, spaceId: scope.spaceId, activityId: scope.activityId, status: "present", latestReply: null }).catch(() => undefined);
    }
    if (sessionId && context) {
      const id = sessionId;
      sessionId = undefined;
      void rpc("threads/companionScreenStop", { botId, id }, { requestContext: context }).catch(() => undefined);
    }
    lastText = "";
  };
  const previousCleanup = cleanup;
  cleanup = () => { previousCleanup(); close(); };
  try {
    if (await companionScreenState() !== "capturing" || !current()) throw new Error("屏幕共享已停止。");
    context = await captureApiRequestContext(scope.spaceId);
    if (!ensureCurrent()) return;
    const started = await rpc("threads/companionScreenStart", { botId, confirmed: true }, {
      requestContext: context, signal: controller.signal,
    });
    sessionId = started.id;
    if (!ensureCurrent()) { close(); return; }
    publish({ phase: "active", botId });
    const fail = () => {
      if (current()) {
        stopCompanionScreenAuto();
        publish({ phase: "failed", botId, error: "自动回应已停止，请检查共享、授权和连接。" });
      } else {
        ensureCurrent();
      }
    };
    const withinSession = () => {
      if (!ensureCurrent()) return false;
      if (Date.now() >= started.expiresAt) throw new Error("屏幕陪伴已到期。");
      return true;
    };
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void (async () => {
        try {
          if (!withinSession()) return;
          const screen = await companionScreenState();
          if (!withinSession()) return;
          if (screen !== "capturing") throw new Error("屏幕共享已停止。");
        } catch {
          fail();
        }
      })();
    });
    removeAppState = () => appStateSubscription.remove();
    const tick = async () => {
      try {
        if (!withinSession()) return;
        const screen = await companionScreenState();
        if (!withinSession()) return;
        if (screen !== "capturing") throw new Error("屏幕共享已停止。");
        if (Date.now() < nextSendAt) {
          timer = setTimeout(() => void tick(), Math.max(0, Math.min(
            5_000, nextSendAt - Date.now(), started.expiresAt - Date.now(),
          )));
          return;
        }
        const text = (await takeCompanionScreenText())?.trim().slice(0, 2_000).replace(/[\uD800-\uDBFF]$/, "");
        if (!withinSession()) return;
        if (text && text !== lastText && Date.now() >= nextSendAt) {
          lastText = text;
          showingThinking = true;
          await updateCompanion({ botId, spaceId: scope.spaceId, activityId: scope.activityId, status: "thinking", latestReply: null });
          if (!withinSession()) return;
          const result = await rpc("threads/companionScreenRespond", { botId, id: started.id, text }, {
            requestContext: context, signal: controller.signal, allowConsentPrompt: false, timeoutMs: 20_000,
          });
          nextSendAt = Date.now() + 30_000;
          if (!withinSession()) return;
          publish({ phase: "active", botId, reply: result.reply });
          await updateCompanion({ botId, spaceId: scope.spaceId, activityId: scope.activityId, status: "present", latestReply: result.reply });
          showingThinking = false;
          if (withinSession() && speakReplies && result.reply.trim() &&
            !getCallSnapshot() && getVoicePlaybackState().status === "idle") {
            void speakWithDeviceVoice(result.reply, botId, undefined, speechOwner).catch(() => {
              if (current() && state.phase === "active" && state.botId === botId && state.reply === result.reply) {
                publish({ phase: "active", botId, reply: result.reply, error: "语音播报失败，文字回应仍可查看。" });
              }
            });
          }
        }
        if (withinSession()) {
          timer = setTimeout(() => void tick(), Math.min(5_000, Math.max(0, started.expiresAt - Date.now())));
        }
      } catch {
        fail();
      }
    };
    void tick();
  } catch (error) {
    if (current()) {
      stopCompanionScreenAuto();
      publish({ phase: "failed", botId, error: "无法开启自动回应，请检查实验服务和授权。" });
      throw error;
    }
    ensureCurrent();
    close();
  }
}
