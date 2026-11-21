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
import { projectScopeKey } from "./project-scope";

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
  const [state, setState] = useState(initialState);
  const sessionRef = useRef<Session | null>(null);
  const pendingSend = useRef<ProjectThreadPendingSend["current"]>(null);
  const botId = "botId" in target ? target.botId : undefined;
  const groupId = "groupId" in target ? target.groupId : undefined;
  useFocusEffect(
    useCallback(() => {
      if (!enabled || isSpaceSelectionPending()) return;
      let active = true;
      const current = () => active && scopeKey === projectScopeKey() && !isSpaceSelectionPending();
      const context = captureApiRequestContext();
      const input = { projectId, botId, groupId };
      const requestOptions = async (signal: AbortSignal) => {
        const requestContext = await context;
        if (!current() || signal.aborted) throw new Error("Project scope changed");
        return { requestContext, signal, skipSpaceAuthRecovery: true };
      };
      const session = createProjectThreadSession<MobileSnapshot>({
        pendingSend,
        current,
        load: async (signal) =>
          rpc("projectWorkspaces/threadSnapshot", input, await requestOptions(signal)),
        subscribe: async (cursor, receive, signal) => {
          await requestOptions(signal);
          await subscribeProjectThread(
            projectId,
            botId ? { botId } : { groupId: groupId! },
            cursor,
            (event) => {
              if (event.threadId && typeof event.seq === "number")
                receive({ ...event, payload: event.payload ?? {} } as Parameters<
                  typeof receive
                >[0]);
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
        send: async (text, clientNonce, signal) =>
          rpc(
            "projectWorkspaces/sendText",
            { ...input, text, clientNonce },
            { ...(await requestOptions(signal)), allowConsentPrompt: false },
          ),
        cancelRun: async (runId, signal) =>
          rpc("projectWorkspaces/cancelRun", { ...input, runId }, await requestOptions(signal)),
        answerApproval: async (answer, signal) =>
          rpc("projectWorkspaces/answerApproval", { ...input, ...answer }, await requestOptions(signal)),
        downloadArtifact: async (artifactId, signal) => {
          const artifact = await rpc(
            "projectWorkspaces/getArtifact", { ...input, artifactId },
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
      const unsubscribe = session.subscribe(() => setState(session.getSnapshot()));
      void session.start();
      return () => {
        active = false;
        unsubscribe();
        session.stop();
        if (sessionRef.current === session) sessionRef.current = null;
      };
    }, [projectId, botId, groupId, scopeKey, enabled]),
  );
  return {
    ...state,
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
