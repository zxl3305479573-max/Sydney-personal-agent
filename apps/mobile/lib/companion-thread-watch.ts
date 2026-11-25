import {
  abortableDelay,
  isRetryableError,
  isRunWaitingOnUser,
  isRunWorking,
  retryDelayMs,
} from "@rakazo/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { MobileMessage, MobileSnapshot } from "./api";
import {
  applyMobileThreadEvent,
  currentApiBase,
  isSpaceSelectionPending,
  rpc,
  selectedSpaceId,
  spaceSelectionSeq,
  subscribeSpaceSelection,
  subscribeThread,
} from "./api";
import { useAppForeground } from "./app-foreground";
import { getSnapshot as getCallSnapshot, subscribe as subscribeCall } from "./call-session";
import type { CompanionScreenState } from "./companion-activity";
import {
  activeCompanionIdentity,
  companionActivityRevision,
  companionScreenState,
  subscribeCompanionActivity,
  subscribeCompanionScreenState,
  updateCompanion,
} from "./companion-activity";
import { companionPresentation } from "./companion-presentation";
import { companionScreenAutoSnapshot, useCompanionScreenAuto } from "./companion-screen-auto";
import type { CompanionDetailStatus, CompanionMode } from "./companion-session-state";
import {
  companionSessionIdentityRevision,
  getActiveCompanionSession,
  getCachedCompanionPreferences,
  getCompanionOpenThreadBotId,
  publishCompanionRuntimeState,
  subscribeCompanionSessionState,
} from "./companion-session-state";
import { companionSnapshot } from "./companion-snapshot";
import { getCachedNotificationPreferences } from "./notification-preferences-state";
import {
  currentReadySessionGeneration,
  currentSessionGeneration,
  subscribeSessionGeneration,
} from "./session";

const sessionVersion = () => `${currentSessionGeneration()}:${currentReadySessionGeneration()}`;
const selectionVersion = () => `${spaceSelectionSeq()}:${isSpaceSelectionPending()}`;

export type CompanionWatchAlert = {
  kind: "message" | "attention";
  botId: string;
  botName: string;
  spaceId: string | null;
  body: string;
  deliveryId: string;
};

export type CompanionWatchEffects = {
  notify?: (alert: CompanionWatchAlert) => Promise<void>;
  speak?: (botId: string, text: string, owner: symbol) => Promise<void>;
  stopSpeaking?: (owner: symbol) => void;
};

function latestBotMessage(messages: readonly MobileMessage[]): { id: string; text: string } | null {
  const message = [...messages].reverse().find((entry) => entry.role === "bot");
  if (!message) return null;
  const text = message.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text ? { id: message.id, text } : null;
}

async function defaultDeliverNotification(alert: CompanionWatchAlert): Promise<void> {
  const notifPrefs = getCachedNotificationPreferences();
  if (!notifPrefs.enabled) return;
  if (alert.kind === "attention" && !notifPrefs.needsAttention) return;
  if (alert.kind === "message" && !notifPrefs.messages) return;
  try {
    const Notifications = await import("expo-notifications");
    const bounded = companionPresentation({
      botName: alert.botName,
      status: "present",
      latestReply: alert.body,
      showReply: true,
    });
    await Notifications.scheduleNotificationAsync({
      content: {
        title: bounded.title,
        body: bounded.reply ?? alert.body,
        sound: notifPrefs.sound ? "default" : false,
        data: {
          kind: alert.kind === "attention" ? "attention" : "message",
          botId: alert.botId,
          ...(alert.spaceId ? { spaceId: alert.spaceId } : {}),
          name: alert.botName,
          deliveryId: alert.deliveryId,
        },
      },
      trigger: null,
    });
  } catch {
    // Notification delivery is best-effort and never blocks companion tracking.
  }
}

async function defaultSpeakReply(botId: string, text: string, owner: symbol): Promise<void> {
  try {
    const voice = await import("./voice");
    if (getCallSnapshot() || voice.getVoicePlaybackState().status !== "idle") return;
    await voice.speakWithDeviceVoice(text, botId, undefined, owner);
  } catch {
    // Device speech failure leaves text companion state intact.
  }
}

function defaultStopSpeaking(owner: symbol): void {
  void import("./voice").then((voice) => voice.stopSpeaking(owner)).catch(() => undefined);
}

export function watchCompanionThread(input: {
  botId: string;
  botName?: string;
  spaceId: string | null;
  activityId: string;
  mode?: CompanionMode;
  isCurrent: () => boolean;
  effects?: CompanionWatchEffects;
}): () => void {
  const abort = new AbortController();
  const mode: CompanionMode = input.mode ?? "live-activity";
  const current = () => !abort.signal.aborted && input.isCurrent();
  const speechOwner = Symbol("companion-thread-speech");
  const notify = input.effects?.notify ?? defaultDeliverNotification;
  const speak = input.effects?.speak ?? defaultSpeakReply;
  const stopSpeak = input.effects?.stopSpeaking ?? defaultStopSpeaking;

  let snapshot: MobileSnapshot | null = null;
  let baselineCaptured = false;
  let lastNotifiedMessageId: string | null = null;
  let lastSpokenMessageId: string | null = null;
  let lastNotifiedAttentionKey: string | null = null;
  let disconnected = false;

  const publish = (options?: { allowAlerts?: boolean }) => {
    if (!current()) return;
    const call = getCallSnapshot();
    const activeCall = call?.botId === input.botId ? call : null;
    if (!snapshot && !activeCall) return;
    disconnected = false;
    const runStatus = snapshot?.run?.status;
    const waiting = isRunWaitingOnUser(runStatus);
    const working = isRunWorking(runStatus) || waiting;
    const presentation = companionSnapshot({
      botId: input.botId,
      snapshotBotId: snapshot ? snapshot.botId : input.botId,
      inGroup: false,
      readOnly: false,
      showingSaved: false,
      showingHistory: false,
      focused: true,
      foreground: true,
      currentScope: true,
      screenAutoActive: false,
      working,
      call: activeCall,
      messages: snapshot?.messages ?? [],
    });
    if (!presentation) return;

    const latestMessage = snapshot ? latestBotMessage(snapshot.messages) : null;
    const detailStatus: CompanionDetailStatus =
      activeCall?.phase === "thinking"
        ? "thinking"
        : activeCall?.phase === "speaking"
          ? "speaking"
          : activeCall?.phase === "listening" && !activeCall.muted
            ? "listening"
            : waiting
              ? "waiting_input"
              : isRunWorking(runStatus)
                ? "thinking"
                : "present";

    publishCompanionRuntimeState({
      activityId: input.activityId,
      botId: input.botId,
      status: presentation.status,
      detailStatus,
      latestReply: presentation.latestReply ?? latestMessage?.text ?? null,
      latestMessageId: latestMessage?.id ?? null,
      reconnecting: false,
    });

    if (mode === "live-activity") {
      void updateCompanion({
        botId: input.botId,
        spaceId: input.spaceId,
        activityId: input.activityId,
        ...presentation,
        isCurrent: current,
      }).catch(() => undefined);
    }

    if (!options?.allowAlerts || !baselineCaptured) return;
    const prefs = getCachedCompanionPreferences();
    const viewingThisThread = getCompanionOpenThreadBotId() === input.botId;
    const botName = input.botName || getActiveCompanionSession()?.botName || "Sydney";

    if (waiting && snapshot?.run?.id) {
      const attentionKey = `${snapshot.run.id}:${runStatus}`;
      if (attentionKey !== lastNotifiedAttentionKey) {
        lastNotifiedAttentionKey = attentionKey;
        if (prefs.notifyOnReply && !viewingThisThread) {
          void notify({
            kind: "attention",
            botId: input.botId,
            botName,
            spaceId: input.spaceId,
            body: "正在等待你的确认或回复",
            deliveryId: `companion-attention:${attentionKey}`,
          }).catch(() => undefined);
        }
      }
    }

    if (latestMessage && !working && latestMessage.id !== lastNotifiedMessageId) {
      lastNotifiedMessageId = latestMessage.id;
      if (prefs.notifyOnReply && !viewingThisThread) {
        void notify({
          kind: "message",
          botId: input.botId,
          botName,
          spaceId: input.spaceId,
          body: prefs.showReply ? latestMessage.text : "发来了一条新回复",
          deliveryId: `companion-reply:${latestMessage.id}`,
        }).catch(() => undefined);
      }
      if (prefs.speakReplies && !activeCall && latestMessage.id !== lastSpokenMessageId) {
        lastSpokenMessageId = latestMessage.id;
        void speak(input.botId, latestMessage.text, speechOwner).catch(() => undefined);
      }
    }
  };

  const publishDisconnected = () => {
    if (!current() || disconnected) return;
    disconnected = true;
    publishCompanionRuntimeState({
      activityId: input.activityId,
      botId: input.botId,
      status: "disconnected",
      detailStatus: "disconnected",
      latestReply: snapshot ? (latestBotMessage(snapshot.messages)?.text ?? null) : null,
      reconnecting: true,
    });
    if (mode === "live-activity") {
      void updateCompanion({
        botId: input.botId,
        spaceId: input.spaceId,
        activityId: input.activityId,
        status: "disconnected",
        latestReply: null,
        isCurrent: current,
      }).catch(() => undefined);
    }
  };

  const offCall = subscribeCall(() => {
    if (getCallSnapshot()) stopSpeak(speechOwner);
    publish();
  });
  publish();
  void (async () => {
    let delay = 1_000;
    while (current()) {
      let wait = delay;
      try {
        const next = await rpc("threads/get", { botId: input.botId }, { signal: abort.signal });
        if (!current()) break;
        snapshot = next;
        const firstLoad = !baselineCaptured;
        if (firstLoad) {
          baselineCaptured = true;
          const initialMessage = latestBotMessage(next.messages);
          lastNotifiedMessageId = initialMessage?.id ?? null;
          lastSpokenMessageId = initialMessage?.id ?? null;
          if (isRunWaitingOnUser(next.run?.status) && next.run?.id) {
            lastNotifiedAttentionKey = `${next.run.id}:${next.run.status}`;
          }
        }
        publish({ allowAlerts: !firstLoad });
        let cursor = next.cursor ?? -1;
        await subscribeThread(
          { botId: input.botId },
          cursor,
          (event) => {
            if (!current()) return;
            cursor = Math.max(cursor, event.seq ?? -1);
            snapshot = applyMobileThreadEvent(snapshot, event);
            publish({ allowAlerts: true });
          },
          abort.signal,
        );
        if (!current()) break;
        delay = 1_000;
      } catch (error) {
        if (!current() || !isRetryableError(error)) break;
        publishDisconnected();
        wait = retryDelayMs(error, delay);
      }
      await abortableDelay(wait, abort.signal);
      delay = Math.min(delay * 2, 15_000);
    }
  })().catch(() => undefined);
  return () => {
    abort.abort();
    offCall();
    stopSpeak(speechOwner);
    snapshot = null;
  };
}

export function useCompanionThreadWatch(ready: boolean): void {
  const foreground = useAppForeground();
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const screenStateRef = useRef<CompanionScreenState>("unsupported");
  const revision = useSyncExternalStore(
    subscribeCompanionActivity,
    companionActivityRevision,
    companionActivityRevision,
  );
  const localIdentityRevision = useSyncExternalStore(
    subscribeCompanionSessionState,
    companionSessionIdentityRevision,
    companionSessionIdentityRevision,
  );
  const sessionState = useSyncExternalStore(
    subscribeSessionGeneration,
    sessionVersion,
    sessionVersion,
  );
  const selectionState = useSyncExternalStore(
    subscribeSpaceSelection,
    selectionVersion,
    selectionVersion,
  );
  const screenAuto = useCompanionScreenAuto();
  const canRun = foreground || screenState === "capturing";
  useEffect(() => {
    let active = true;
    let changes = 0;
    const apply = (state: CompanionScreenState) => {
      if (!active) return;
      screenStateRef.current = state;
      setScreenState(state);
    };
    const off = subscribeCompanionScreenState((state) => {
      changes += 1;
      apply(state);
    });
    void companionScreenState()
      .then((state) => {
        if (changes === 0) apply(state);
      })
      .catch(() => {
        if (changes === 0) apply("unsupported");
      });
    return () => {
      active = false;
      screenStateRef.current = "unsupported";
      off();
    };
  }, []);
  useEffect(() => {
    if (
      !ready ||
      !canRun ||
      isSpaceSelectionPending() ||
      currentSessionGeneration() !== currentReadySessionGeneration() ||
      screenAuto.phase === "starting" ||
      screenAuto.phase === "active"
    )
      return;
    const session = currentSessionGeneration();
    const selection = spaceSelectionSeq();
    const spaceId = selectedSpaceId();
    const nativeActivity = activeCompanionIdentity();
    const localSession = getActiveCompanionSession();
    const target =
      nativeActivity && nativeActivity.spaceId === spaceId
        ? {
            id: nativeActivity.id,
            botId: nativeActivity.botId,
            botName:
              localSession?.botId === nativeActivity.botId ? localSession.botName : undefined,
            spaceId: nativeActivity.spaceId,
            mode: "live-activity" as const,
          }
        : localSession && localSession.mode === "in-app" && localSession.spaceId === spaceId
          ? {
              id: localSession.id,
              botId: localSession.botId,
              botName: localSession.botName,
              spaceId: localSession.spaceId,
              mode: "in-app" as const,
            }
          : null;
    if (!target) return;
    const apiBase = currentApiBase();
    const isCurrent = () =>
      (AppState.currentState !== "background" || screenStateRef.current === "capturing") &&
      session === currentSessionGeneration() &&
      selection === spaceSelectionSeq() &&
      revision === companionActivityRevision() &&
      !isSpaceSelectionPending() &&
      apiBase === currentApiBase() &&
      selectedSpaceId() === spaceId &&
      (target.mode === "live-activity"
        ? activeCompanionIdentity()?.id === target.id
        : getActiveCompanionSession()?.id === target.id &&
          localIdentityRevision === companionSessionIdentityRevision()) &&
      !["starting", "active"].includes(companionScreenAutoSnapshot().phase);
    return watchCompanionThread({
      botId: target.botId,
      botName: target.botName,
      spaceId,
      activityId: target.id,
      mode: target.mode,
      isCurrent,
    });
  }, [
    ready,
    foreground,
    canRun,
    revision,
    localIdentityRevision,
    sessionState,
    selectionState,
    screenAuto.phase,
  ]);
}
