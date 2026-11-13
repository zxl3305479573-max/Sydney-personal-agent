import { abortableDelay, isRetryableError, isRunWaitingOnUser, isRunWorking, retryDelayMs } from "@rakazo/core";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import {
  applyMobileThreadEvent, currentApiBase, isSpaceSelectionPending, rpc, selectedSpaceId,
  spaceSelectionSeq, subscribeSpaceSelection, subscribeThread, type MobileSnapshot,
} from "./api";
import { useAppForeground } from "./app-foreground";
import { getSnapshot as getCallSnapshot, subscribe as subscribeCall } from "./call-session";
import {
  activeCompanionIdentity, companionActivityRevision, companionScreenState,
  subscribeCompanionActivity, subscribeCompanionScreenState, updateCompanion, type CompanionScreenState,
} from "./companion-activity";
import { companionScreenAutoSnapshot, useCompanionScreenAuto } from "./companion-screen-auto";
import { companionSnapshot } from "./companion-snapshot";
import { currentReadySessionGeneration, currentSessionGeneration, subscribeSessionGeneration } from "./session";

const sessionVersion = () => `${currentSessionGeneration()}:${currentReadySessionGeneration()}`;
const selectionVersion = () => `${spaceSelectionSeq()}:${isSpaceSelectionPending()}`;

export function watchCompanionThread(input: {
  botId: string;
  spaceId: string | null;
  activityId: string;
  isCurrent: () => boolean;
}): () => void {
  const abort = new AbortController();
  const current = () => !abort.signal.aborted && input.isCurrent();
  let snapshot: MobileSnapshot | null = null;
  const publish = () => {
    if (!current() || !snapshot) return;
    const status = snapshot.run?.status;
    const presentation = companionSnapshot({
      botId: input.botId,
      snapshotBotId: snapshot.botId,
      inGroup: false,
      readOnly: false,
      showingSaved: false,
      showingHistory: false,
      focused: true,
      foreground: true,
      currentScope: true,
      screenAutoActive: false,
      working: isRunWorking(status) || isRunWaitingOnUser(status),
      call: getCallSnapshot(),
      messages: snapshot.messages,
    });
    if (presentation) {
      void updateCompanion({
        botId: input.botId, spaceId: input.spaceId, activityId: input.activityId,
        ...presentation, isCurrent: current,
      }).catch(() => undefined);
    }
  };
  const offCall = subscribeCall(publish);
  void (async () => {
    let delay = 1_000;
    while (current()) {
      let wait = delay;
      try {
        const next = await rpc("threads/get", { botId: input.botId }, { signal: abort.signal });
        if (!current()) break;
        snapshot = next;
        publish();
        let cursor = next.cursor ?? -1;
        await subscribeThread({ botId: input.botId }, cursor, (event) => {
          if (!current()) return;
          cursor = Math.max(cursor, event.seq ?? -1);
          snapshot = applyMobileThreadEvent(snapshot, event);
          publish();
        }, abort.signal);
        if (!current()) break;
        delay = 1_000;
      } catch (error) {
        if (!current() || !isRetryableError(error)) break;
        wait = retryDelayMs(error, delay);
      }
      await abortableDelay(wait, abort.signal);
      delay = Math.min(delay * 2, 15_000);
    }
  })().catch(() => undefined);
  return () => {
    abort.abort();
    offCall();
    snapshot = null;
  };
}

export function useCompanionThreadWatch(ready: boolean): void {
  const foreground = useAppForeground();
  const [screenState, setScreenState] = useState<CompanionScreenState>("unsupported");
  const screenStateRef = useRef<CompanionScreenState>("unsupported");
  const revision = useSyncExternalStore(
    subscribeCompanionActivity, companionActivityRevision, companionActivityRevision,
  );
  const sessionState = useSyncExternalStore(
    subscribeSessionGeneration, sessionVersion, sessionVersion,
  );
  const selectionState = useSyncExternalStore(
    subscribeSpaceSelection, selectionVersion, selectionVersion,
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
    void companionScreenState().then((state) => {
      if (changes === 0) apply(state);
    }).catch(() => {
      if (changes === 0) apply("unsupported");
    });
    return () => {
      active = false;
      screenStateRef.current = "unsupported";
      off();
    };
  }, []);
  useEffect(() => {
    if (!ready || !canRun || isSpaceSelectionPending() ||
      currentSessionGeneration() !== currentReadySessionGeneration() ||
      screenAuto.phase === "starting" || screenAuto.phase === "active") return;
    const session = currentSessionGeneration();
    const selection = spaceSelectionSeq();
    const activity = activeCompanionIdentity();
    const spaceId = selectedSpaceId();
    if (!activity || activity.spaceId !== spaceId) return;
    const apiBase = currentApiBase();
    const isCurrent = () => (AppState.currentState !== "background" || screenStateRef.current === "capturing") &&
      session === currentSessionGeneration() && selection === spaceSelectionSeq() &&
      revision === companionActivityRevision() && !isSpaceSelectionPending() &&
      apiBase === currentApiBase() && selectedSpaceId() === spaceId &&
      activeCompanionIdentity()?.id === activity.id &&
      !["starting", "active"].includes(companionScreenAutoSnapshot().phase);
    return watchCompanionThread({ botId: activity.botId, spaceId, activityId: activity.id, isCurrent });
  }, [ready, foreground, canRun, revision, sessionState, selectionState, screenAuto.phase]);
}
