import type { BotAvatarSet } from "@rakazo/contracts";
import { useEffect } from "react";
import { selectedSpaceId } from "./api";
import type { CallState } from "./call-session";
import { getSnapshot as getCallSnapshot, subscribe as subscribeCall } from "./call-session";
import {
  activeCompanionIdentity,
  companionAvailable,
  startCallLiveActivity,
  stopCallOwnedLiveActivity,
  updateCallLiveActivity,
  updateCompanion,
} from "./companion-activity";
import type { CallLiveActivityPhase } from "./companion-presentation";
import {
  getActiveCompanionSession,
  getCachedCompanionPreferences,
  getCompanionSessionState,
  startUnifiedCompanion,
} from "./companion-session";
import { currentSessionGeneration } from "./session";

type SuspendedCompanion = {
  botId: string;
  botName: string;
  botColor: string;
  botAvatarSet?: BotAvatarSet | null;
  spaceId: string | null;
  showReply: boolean;
  sessionGeneration: number;
};

type ReusedCompanion = {
  activityId: string;
  botId: string;
  spaceId: string | null;
};

let controllingActivityId: string | null = null;
let controllingBotId: string | null = null;

/** True while a live voice call owns Dynamic Island status updates for this Live Activity. */
export function isCallLiveActivityControlling(activityId?: string): boolean {
  if (!controllingBotId) return false;
  if (!activityId) return true;
  return controllingActivityId === activityId;
}

export function callLiveActivityPhase(call: CallState): CallLiveActivityPhase {
  return call.muted ? "muted" : call.phase;
}

export function callLiveActivityCaption(call: CallState): string | null {
  const latestBot = [...call.exchanges].reverse().find((entry) => entry.role === "bot")?.text;
  if (call.phase === "speaking") {
    return latestBot?.trim() || call.caption.trim() || null;
  }
  if (call.heard.trim()) return call.heard.trim();
  if (call.caption.trim()) return call.caption.trim();
  return latestBot?.trim() || null;
}

export function startCallLiveActivityBridge(): () => void {
  let active = true;
  let seq = 0;
  let trackedBotId: string | null = null;
  let callStartedAtMs = 0;
  let ownedActivityId: string | null = null;
  let reusedCompanion: ReusedCompanion | null = null;
  let suspendedCompanion: SuspendedCompanion | null = null;
  let chain: Promise<void> = Promise.resolve();

  const runSerialized = (task: () => Promise<void>) => {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  };

  const cleanupCallActivity = async () => {
    const owned = ownedActivityId;
    const reused = reusedCompanion;
    const suspended = suspendedCompanion;
    ownedActivityId = null;
    reusedCompanion = null;
    suspendedCompanion = null;
    trackedBotId = null;
    callStartedAtMs = 0;
    controllingActivityId = null;
    controllingBotId = null;

    if (owned) {
      await stopCallOwnedLiveActivity(owned).catch(() => undefined);
      if (
        suspended &&
        suspended.sessionGeneration === currentSessionGeneration() &&
        suspended.spaceId === selectedSpaceId()
      ) {
        await startUnifiedCompanion({
          botId: suspended.botId,
          botName: suspended.botName,
          botColor: suspended.botColor,
          botAvatarSet: suspended.botAvatarSet,
          spaceId: suspended.spaceId,
          showReply: suspended.showReply,
        }).catch(() => undefined);
      }
      return;
    }

    if (reused) {
      const latestReply = getCompanionSessionState().runtime.latestReply;
      await updateCompanion({
        activityId: reused.activityId,
        botId: reused.botId,
        spaceId: reused.spaceId,
        status: "present",
        latestReply,
      }).catch(() => undefined);
    }
  };

  const sync = () => {
    if (!active) return;
    const call = getCallSnapshot();
    const mySeq = ++seq;
    void runSerialized(async () => {
      if (!active || mySeq !== seq) return;
      if (!call) {
        if (trackedBotId || ownedActivityId || reusedCompanion) {
          await cleanupCallActivity();
        }
        return;
      }
      if (!companionAvailable()) return;

      const spaceId = selectedSpaceId();
      const phase = callLiveActivityPhase(call);
      const caption = callLiveActivityCaption(call);

      // Switching from one bot call to another: clean up the prior bot's call activity first.
      if (trackedBotId && trackedBotId !== call.botId) {
        const previousOwned = ownedActivityId;
        const previousReused = reusedCompanion;
        ownedActivityId = null;
        reusedCompanion = null;
        controllingActivityId = null;
        controllingBotId = null;
        if (previousOwned) {
          await stopCallOwnedLiveActivity(previousOwned).catch(() => undefined);
        } else if (previousReused) {
          await updateCompanion({
            activityId: previousReused.activityId,
            botId: previousReused.botId,
            spaceId: previousReused.spaceId,
            status: "present",
            latestReply: getCompanionSessionState().runtime.latestReply,
          }).catch(() => undefined);
        }
        trackedBotId = null;
      }

      if (!active || mySeq !== seq) return;

      if (!trackedBotId) {
        const startedAt = Date.now();
        const existingNative = activeCompanionIdentity();
        if (
          existingNative &&
          existingNative.botId === call.botId &&
          existingNative.spaceId === spaceId
        ) {
          trackedBotId = call.botId;
          callStartedAtMs = startedAt;
          reusedCompanion = {
            activityId: existingNative.id,
            botId: existingNative.botId,
            spaceId: existingNative.spaceId,
          };
          controllingActivityId = existingNative.id;
          controllingBotId = call.botId;
        } else {
          if (existingNative && !suspendedCompanion) {
            const currentSession = getActiveCompanionSession();
            if (currentSession && currentSession.botId === existingNative.botId) {
              suspendedCompanion = {
                botId: currentSession.botId,
                botName: currentSession.botName,
                botColor: currentSession.botColor,
                botAvatarSet: currentSession.botAvatarSet,
                spaceId: currentSession.spaceId,
                showReply: currentSession.showReply,
                sessionGeneration: currentSessionGeneration(),
              };
            }
          }
          const createdId = await startCallLiveActivity({
            botId: call.botId,
            botName: call.botName,
            spaceId,
            showReply: getCachedCompanionPreferences().showReply,
            avatar: {
              color: call.botColor || "#4F7CAC",
              avatarSet: call.botAvatarSet ?? undefined,
            },
            phase,
            caption,
            callStartedAtMs: startedAt,
            isCurrent: () => active && getCallSnapshot()?.botId === call.botId,
          }).catch(() => null);
          if (!createdId || !active) return;
          trackedBotId = call.botId;
          callStartedAtMs = startedAt;
          ownedActivityId = createdId;
          controllingActivityId = createdId;
          controllingBotId = call.botId;
        }
      }

      const targetActivityId = ownedActivityId ?? reusedCompanion?.activityId;
      if (!targetActivityId) return;

      await updateCallLiveActivity({
        activityId: targetActivityId,
        botId: call.botId,
        spaceId,
        phase,
        caption,
        callStartedAtMs,
        isCurrent: () => active && getCallSnapshot()?.botId === call.botId,
      }).catch(() => undefined);
    });
  };

  const unsubscribe = subscribeCall(sync);
  sync();

  return () => {
    active = false;
    unsubscribe();
    if (ownedActivityId || reusedCompanion) {
      void runSerialized(cleanupCallActivity);
    } else {
      controllingActivityId = null;
      controllingBotId = null;
    }
  };
}

export function useCallLiveActivity(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    return startCallLiveActivityBridge();
  }, [ready]);
}
