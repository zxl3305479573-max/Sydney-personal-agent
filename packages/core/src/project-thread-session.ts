import type { AiConsentStatus, ProductEvent, RpcOutput, ThreadMessage } from "@rakazo/contracts";
import { abortableDelay } from "./async.js";
import { newClientId } from "./client-id.js";
import { isRetryableError, retryDelayMs } from "./retry-policy.js";
import { ACTIVE_RUN_STATUSES } from "./run-state.js";

type ProjectRun = { id: string; status: string; botId?: string };
export type ProjectThreadHead = {
  threadId: string;
  cursor?: number;
  run?: ProjectRun | null;
  activeRuns?: ProjectRun[];
  messages?: ApprovalMessage[];
};
export type ProjectThreadPendingSend = { current: { text: string; nonce: string } | null };

export async function loadProjectBotIdentity(
  botId: string,
  loadPage: (afterBotId?: string) => Promise<RpcOutput<"projectWorkspaces/roster">>,
  signal: AbortSignal,
) {
  let afterBotId: string | undefined;
  do {
    signal.throwIfAborted();
    const page = await loadPage(afterBotId);
    signal.throwIfAborted();
    const bot = page.bots.find((entry) => entry.id === botId);
    if (bot) return { ...bot, botId: bot.id };
    afterBotId = page.nextBotId ?? undefined;
  } while (afterBotId);
  return undefined;
}

export function projectActiveRuns(snapshot: ProjectThreadHead | null): ProjectRun[] {
  const runs = snapshot?.activeRuns ?? (snapshot?.run ? [snapshot.run] : []);
  return runs.filter((run) => ACTIVE_RUN_STATUSES.some((status) => status === run.status));
}

export function projectMemberName(
  members: readonly { botId: string; name: string }[] | undefined,
  botId: string | undefined,
): string | undefined {
  const member = members?.find((entry) => entry.botId === botId);
  if (!members || !member) return undefined;
  const namesakes = members.filter((entry) => entry.name === member.name);
  return namesakes.length > 1 ? `${member.name} (${namesakes.indexOf(member) + 1})` : member.name;
}

type ProjectApprovalAnswer = {
  runId: string;
  messageId: string;
  effectId: string;
  decision: "allow" | "deny";
};

type ApprovalMessage = Pick<ThreadMessage, "id" | "runId" | "blocks">;

export function pendingProjectApproval(
  snapshot: ProjectThreadHead | null,
  message: ApprovalMessage,
) {
  const runId = message.runId;
  if (
    !runId ||
    !projectActiveRuns(snapshot).some((run) => run.id === runId && run.status === "waiting_input")
  )
    return;
  for (const block of message.blocks) {
    if (block.kind !== "ask" || block.status === "answered" || !block.approvalEffectId) continue;
    const decisions = (block.actions ?? []).flatMap<ProjectApprovalAnswer["decision"]>(({ id }) =>
      id === "allow" || id === "deny" ? [id] : [],
    );
    if (!decisions.length) return;
    return {
      runId,
      messageId: message.id,
      effectId: block.approvalEffectId,
      title: block.text,
      detail: block.detail,
      decisions,
    };
  }
}

export type ProjectThreadState<Snapshot> = {
  snapshot: Snapshot | null;
  loading: boolean;
  sending: boolean;
  consenting: boolean;
  consent: AiConsentStatus | null;
  readError: unknown;
  sendError: unknown;
  cancellingRunId: string | null;
  cancelError: unknown;
  answeringEffectId: string | null;
  answerError: unknown;
  downloadingArtifactId: string | null;
  downloadError: unknown;
};

export function createProjectThreadSession<Snapshot extends ProjectThreadHead>(options: {
  current: () => boolean;
  load: (signal: AbortSignal) => Promise<Snapshot>;
  subscribe: (
    cursor: number,
    onEvent: (event: ProductEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  reduce: (snapshot: Snapshot, event: ProductEvent) => Snapshot | null;
  consentStatus: (signal: AbortSignal) => Promise<AiConsentStatus>;
  consentAllow: (status: AiConsentStatus, signal: AbortSignal) => Promise<AiConsentStatus>;
  send: (text: string, clientNonce: string, signal: AbortSignal) => Promise<unknown>;
  cancelRun: (runId: string, signal: AbortSignal) => Promise<unknown>;
  answerApproval?: (answer: ProjectApprovalAnswer, signal: AbortSignal) => Promise<unknown>;
  downloadArtifact?: (artifactId: string, signal: AbortSignal) => Promise<void>;
  nonce?: () => string;
  pendingSend?: ProjectThreadPendingSend;
}) {
  const controller = new AbortController();
  const { signal } = controller;
  const listeners = new Set<() => void>();
  let state: ProjectThreadState<Snapshot> = {
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
  const pendingSend = options.pendingSend ?? { current: null };
  let running: Promise<void> | undefined;
  let readController: AbortController | undefined;
  const current = () => !signal.aborted && options.current();
  const commit = (patch: Partial<typeof state>) => {
    if (!current()) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const refresh = async (readSignal = signal) => {
    const next = await options.load(readSignal);
    if (!current() || readSignal.aborted) return;
    const previous = state.snapshot;
    if (previous && previous.threadId !== next.threadId)
      throw Object.assign(new Error("Project conversation changed; reopen it."), { status: 409 });
    if (!previous || (next.cursor ?? -1) >= (previous.cursor ?? -1))
      commit({ snapshot: next, loading: false, readError: null });
    else commit({ loading: false, readError: null });
  };
  const receive = (event: ProductEvent, readSignal: AbortSignal) => {
    const snapshot = state.snapshot;
    if (
      !current() ||
      readSignal.aborted ||
      !snapshot ||
      event.type === "heartbeat" ||
      event.threadId !== snapshot.threadId ||
      event.seq <= (snapshot.cursor ?? -1)
    )
      return;
    const next = options.reduce(snapshot, event);
    if (next) commit({ snapshot: { ...next, cursor: event.seq }, readError: null });
  };
  const run = async (readSignal: AbortSignal) => {
    const reading = () => current() && !readSignal.aborted;
    let backoff = 250;
    while (reading()) {
      let failure: unknown;
      try {
        await refresh(readSignal);
        if (!reading() || !state.snapshot) return;
        await options.subscribe(
          state.snapshot.cursor ?? -1,
          (event) => receive(event, readSignal),
          readSignal,
        );
        if (!reading()) return;
        failure = new Error("Project connection interrupted; reconnecting.");
      } catch (error) {
        if (!reading()) return;
        failure = error;
      }
      commit({ loading: false, readError: failure });
      if (!isRetryableError(failure)) {
        commit({ snapshot: null, consent: null });
        return;
      }
      await abortableDelay(retryDelayMs(failure, backoff), readSignal);
      backoff = Math.min(backoff * 2, 5_000);
    }
  };
  const reconnect = () => {
    if (!current()) return Promise.resolve();
    readController?.abort();
    readController = new AbortController();
    commit({ loading: !state.snapshot, readError: null });
    running = run(readController.signal);
    return running;
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => {
      running ??= reconnect();
      return running;
    },
    reconnect,
    stop: () => {
      controller.abort();
      readController?.abort();
      listeners.clear();
    },
    refresh: async () => {
      if (!current()) return;
      try {
        await refresh();
      } catch (error) {
        commit({ readError: error, loading: false });
      }
    },
    cancelRun: async (runId: string) => {
      if (
        !current() ||
        state.cancellingRunId ||
        !projectActiveRuns(state.snapshot).some((run) => run.id === runId)
      )
        return;
      commit({ cancellingRunId: runId, cancelError: null });
      try {
        await options.cancelRun(runId, signal);
      } catch (error) {
        commit({ cancelError: error });
      }
      try {
        if (!current()) return;
        await refresh();
        if (!projectActiveRuns(state.snapshot).some((run) => run.id === runId))
          commit({ cancelError: null });
      } catch (error) {
        commit({ readError: error });
      } finally {
        commit({ cancellingRunId: null });
      }
    },
    answerApproval: async (messageId: string, decision: ProjectApprovalAnswer["decision"]) => {
      const message = state.snapshot?.messages?.find((item) => item.id === messageId);
      const pending = message && pendingProjectApproval(state.snapshot, message);
      if (
        !current() ||
        !options.answerApproval ||
        state.answeringEffectId ||
        !pending?.decisions.some((allowed) => allowed === decision)
      )
        return;
      const { runId, effectId } = pending;
      commit({ answeringEffectId: effectId, answerError: null });
      try {
        await options.answerApproval({ runId, messageId, effectId, decision }, signal);
      } catch (error) {
        commit({ answerError: error });
      }
      try {
        if (current()) await refresh();
        const updated = state.snapshot?.messages?.find((item) => item.id === messageId);
        if (!updated || pendingProjectApproval(state.snapshot, updated)?.effectId !== effectId)
          commit({ answerError: null });
      } catch (error) {
        commit({ readError: error });
      } finally {
        commit({ answeringEffectId: null });
      }
    },
    downloadArtifact: async (artifactId: string) => {
      if (
        !current() ||
        state.downloadingArtifactId ||
        !options.downloadArtifact ||
        !state.snapshot?.messages?.some((message) =>
          message.blocks.some((block) => block.kind === "file" && block.artifactId === artifactId),
        )
      )
        return;
      commit({ downloadingArtifactId: artifactId, downloadError: null });
      try {
        await options.downloadArtifact(artifactId, signal);
      } catch (error) {
        commit({ downloadError: error });
      } finally {
        commit({ downloadingArtifactId: null });
      }
    },
    allow: async () => {
      if (!current() || !state.consent || state.consenting || state.sending) return;
      const consent = state.consent;
      commit({ consenting: true, sendError: null });
      try {
        const next = await options.consentAllow(consent, signal);
        commit({ consent: next });
      } catch (error) {
        commit({ sendError: error });
      } finally {
        commit({ consenting: false });
      }
    },
    send: async (value: string): Promise<boolean> => {
      const text = value.trim();
      if (!text || !current() || !state.snapshot || state.sending || state.consenting) return false;
      commit({ sending: true, sendError: null });
      try {
        const consent = await options.consentStatus(signal);
        if (!current()) return false;
        commit({ consent });
        if (consent.recipients.some((recipient) => !recipient.allowed)) return false;
        if (pendingSend.current?.text !== text)
          pendingSend.current = { text, nonce: (options.nonce ?? newClientId)() };
        await options.send(text, pendingSend.current.nonce, signal);
        if (!current()) return false;
        pendingSend.current = null;
        try {
          await refresh();
        } catch (error) {
          commit({ readError: error });
        }
        return current();
      } catch (error) {
        commit({ sendError: error });
        return false;
      } finally {
        commit({ sending: false });
      }
    },
  };
}
