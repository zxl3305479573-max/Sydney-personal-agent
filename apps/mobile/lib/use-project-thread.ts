import type { ProjectThreadPendingSend, ProjectThreadState } from "@rakazo/core";
import { createProjectThreadSession } from "@rakazo/core";
import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { MobileSnapshot } from "./api";
import {
  applyMobileThreadEvent,
  captureApiRequestContext,
  isSpaceSelectionPending,
  rpc,
  subscribeProjectThread,
} from "./api";
import { ARTIFACT_DOWNLOAD_TIMEOUT_MS } from "./artifacts";
import { usePageState } from "./page-state";
import { projectScopeKey } from "./project-scope";
import {
  applyAcceptedSend,
  projectThreadSessionScope,
  threadSessionCache,
} from "./thread-session-cache";

export type ProjectChatTarget = { botId: string } | { groupId: string };
type Session = ReturnType<typeof createProjectThreadSession<MobileSnapshot>>;

const initialState: ProjectThreadState<MobileSnapshot> = {
  snapshot: null,
  loading: true,
  sending: false,
  consenting: false,
  consent: null,
  readError: null,
  sendError: null,
  cancellingRunId: null,
  cancelError: null,
  answeringEffectId: null,
  answerError: null,
  downloadingArtifactId: null,
  downloadError: null,
};

export function useProjectThread(
  projectId: string,
  target: ProjectChatTarget,
  scopeKey: string,
  enabled: boolean,
) {
  const [cachedSnapshot, setCachedSnapshot] = usePageState<MobileSnapshot | null>(
    scopeKey,
    ["project", projectId, "thread", target],
    null,
  );
  const snapshotRef = useRef(cachedSnapshot);
  snapshotRef.current = cachedSnapshot;
  const [state, setState] = useState(() => ({
    ...initialState,
    snapshot: enabled ? cachedSnapshot : null,
    loading: !cachedSnapshot,
  }));
  const sessionRef = useRef<Session | null>(null);
  const markReadRef = useRef<(() => void) | null>(null);
  const pendingSend = useRef<ProjectThreadPendingSend["current"]>(null);
  const botId = "botId" in target ? target.botId : undefined;
  const groupId = "groupId" in target ? target.groupId : undefined;
  useFocusEffect(
    useCallback(() => {
      if (!enabled || isSpaceSelectionPending()) return;
      let active = true;
      const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
      const cacheScope = projectThreadSessionScope(scopeKey, projectId);
      const cacheTarget = botId ? { botId } : { groupId: groupId! };
      const rememberSnapshot = (snapshot: MobileSnapshot | null) => {
        if (!snapshot) return;
        threadSessionCache.remember(cacheScope, {
          ...snapshot,
          ...(botId ? { botId } : {}),
          ...(groupId ? { groupId } : {}),
        });
      };
      const context = captureApiRequestContext();
      const input = { projectId, botId, groupId };
      const requestOptions = async (signal?: AbortSignal) => {
        const requestContext = await context;
        if (!current() || signal?.aborted) throw new Error("Project scope changed");
        return { requestContext, ...(signal ? { signal } : {}), skipSpaceAuthRecovery: true };
      };
      let markReadInFlight = false;
      let markReadQueued = false;
      const markRead = () => {
        if (!current()) return;
        if (markReadInFlight) {
          markReadQueued = true;
          return;
        }
        markReadInFlight = true;
        const unreadToken = threadSessionCache.beginUnreadWrite(cacheScope, cacheTarget, false);
        void (async () => {
          try {
            await rpc("projectWorkspaces/markRead", input, await requestOptions());
            threadSessionCache.finishUnreadWrite(cacheScope, cacheTarget, unreadToken);
          } catch {
            threadSessionCache.abortUnreadWrite(cacheScope, cacheTarget, unreadToken);
          } finally {
            markReadInFlight = false;
            if (markReadQueued && current()) {
              markReadQueued = false;
              markRead();
            }
          }
        })();
      };
      markReadRef.current = markRead;
      const session = createProjectThreadSession<MobileSnapshot>({
        initialSnapshot: snapshotRef.current,
        pendingSend,
        current,
        load: async (signal) => {
          const loaded = await rpc(
            "projectWorkspaces/threadSnapshot",
            input,
            await requestOptions(signal),
          );
          if (current()) markRead();
          return loaded;
        },
        subscribe: async (cursor, receive, signal) => {
          await requestOptions(signal);
          await subscribeProjectThread(
            projectId,
            botId ? { botId } : { groupId: groupId! },
            cursor,
            (event) => {
              if (event.threadId && typeof event.seq === "number") {
                receive({ ...event, payload: event.payload ?? {} } as Parameters<
                  typeof receive
                >[0]);
                if (
                  event.type === "thread.message.created" &&
                  event.payload?.role === "bot" &&
                  current()
                ) {
                  markRead();
                }
              }
            },
            signal,
            current,
          );
        },
        reduce: applyMobileThreadEvent,
        consentStatus: async (signal) =>
          rpc("projectWorkspaces/consentStatus", input, await requestOptions(signal)),
        consentAllow: async (status, signal) =>
          rpc(
            "projectWorkspaces/consentAllow",
            {
              ...input,
              scope: status.scope,
              version: status.version,
              keys: status.recipients
                .filter((recipient) => !recipient.allowed)
                .map(({ key }) => key),
            },
            await requestOptions(signal),
          ),
        send: async (text, clientNonce, signal) => {
          threadSessionCache.markSendPending(cacheScope, cacheTarget, clientNonce);
          try {
            return await rpc(
              "projectWorkspaces/sendText",
              { ...input, text, clientNonce },
              { ...(await requestOptions(signal)), allowConsentPrompt: false },
            );
          } finally {
            threadSessionCache.clearSendPending(cacheScope, cacheTarget, clientNonce);
          }
        },
        onSendAccepted: (snapshot, result) => {
          const next = applyAcceptedSend(snapshot, target, result);
          rememberSnapshot(next);
          return next;
        },
        cancelRun: async (runId, signal) =>
          rpc("projectWorkspaces/cancelRun", { ...input, runId }, await requestOptions(signal)),
        answerApproval: async (answer, signal) =>
          rpc(
            "projectWorkspaces/answerApproval",
            { ...input, ...answer },
            await requestOptions(signal),
          ),
        downloadArtifact: async (artifactId, signal) => {
          const artifact = await rpc(
            "projectWorkspaces/getArtifact",
            { ...input, artifactId },
            { ...(await requestOptions(signal)), timeoutMs: ARTIFACT_DOWNLOAD_TIMEOUT_MS },
          );
          const { shareDownloadedArtifact } = await import("./artifact-open");
          if (signal.aborted) throw signal.reason ?? new Error("Request canceled");
          if (!current()) throw new Error("Project scope changed");
          await shareDownloadedArtifact(artifact);
        },
      });
      sessionRef.current = session;
      setState(session.getSnapshot());
      const unsubscribe = session.subscribe(() => {
        const next = session.getSnapshot();
        rememberSnapshot(next.snapshot);
        setCachedSnapshot(next.snapshot);
        setState(next);
      });
      void session.start();
      return () => {
        active = false;
        unsubscribe();
        session.stop();
        if (sessionRef.current === session) sessionRef.current = null;
        if (markReadRef.current === markRead) markReadRef.current = null;
      };
    }, [projectId, botId, groupId, scopeKey, enabled]),
  );
  return {
    ...state,
    markRead: () => markReadRef.current?.(),
    retry: () => void sessionRef.current?.reconnect(),
    refresh: () => sessionRef.current?.refresh(),
    send: (text: string) => sessionRef.current?.send(text) ?? Promise.resolve(false),
    allow: () => sessionRef.current?.allow(),
    cancelRun: (runId: string) => sessionRef.current?.cancelRun(runId),
    answerApproval: (...args: Parameters<Session["answerApproval"]>) =>
      sessionRef.current?.answerApproval(...args),
    downloadArtifact: (artifactId: string) => sessionRef.current?.downloadArtifact(artifactId),
  };
}
