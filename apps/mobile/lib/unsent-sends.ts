import { isModelRequiredSendError } from "@rakazo/core";
import { Alert, AppState } from "react-native";
import type { RpcArgs } from "./api";
import {
  captureApiRequestContext,
  currentApiBase,
  isServerReachable,
  passwordChangeInFlight,
  rpc,
  selectedSpaceId,
  subscribeServerReachable,
} from "./api";
import { artifactCacheSession } from "./artifact-cache-session";
import { t } from "./i18n";
import { integrationsCacheScope } from "./integrations-cache";
import { openModelSettings } from "./model-settings";
import { outboxDisk } from "./outbox-disk";
import { savedChatsScope, savedChatTarget, writeSavedThread } from "./saved-chats";
import {
  currentReadySessionGeneration,
  currentSessionGeneration,
  loadSessionToken,
  loadVerifiedIntegrationsScope,
  subscribeSessionGeneration,
} from "./session";
import type { OutboxScope } from "./thread-feedback";
import {
  configureUnsentSends,
  hasUnsentSends,
  restoreUnsentSends,
  sendWaitingMessages,
} from "./thread-feedback";
import { applySendActivity, threadSessionCache } from "./thread-session-cache";
import { errorText } from "./user-error";

let activeScope: (OutboxScope & { generation: number }) | null = null;
function scope() {
  return activeScope &&
    activeScope.generation === currentSessionGeneration() &&
    activeScope.apiBase === currentApiBase()
    ? activeScope
    : null;
}
export async function prepareUnsentSends(): Promise<void> {
  const generation = currentSessionGeneration();
  const apiBase = currentApiBase();
  const spaceId = selectedSpaceId();
  if (!scope() || activeScope?.spaceId !== spaceId) {
    const saved = await loadVerifiedIntegrationsScope();
    const verified =
      saved?.apiBase === apiBase && (spaceId || saved.selectionId === null)
        ? saved
        : await integrationsCacheScope();
    const cacheSession = await artifactCacheSession(await loadSessionToken());
    if (
      generation !== currentSessionGeneration() ||
      apiBase !== currentApiBase() ||
      spaceId !== selectedSpaceId()
    )
      throw new Error(t("Failed to send message"));
    activeScope = {
      apiBase,
      spaceId: spaceId ?? verified.spaceId,
      userId: verified.userId,
      cacheSession,
      generation,
    };
  }
  restoreUnsentSends();
}
// Configure the wipe before bootstrap can replace credentials or the saved server.
configureUnsentSends({
  request: async (proc, body, options, spaceId) => {
    const generation = currentSessionGeneration();
    const context = await captureApiRequestContext();
    if (generation !== currentSessionGeneration()) throw new Error("Session changed");
    const headers = { ...context.headers };
    if (spaceId) headers["x-rakazo-space-id"] = spaceId;
    else delete headers["x-rakazo-space-id"];
    return rpc(
      proc,
      ...([body, { ...options, requestContext: { ...context, headers } }] as RpcArgs<typeof proc>),
    );
  },
  serverReachable: isServerReachable,
  passwordChanging: passwordChangeInFlight,
  scope,
  disk: outboxDisk,
  accepted: (attempt, { activity }) => {
    const current = scope();
    if (!activity || !current || !attempt.spaceId) return;
    const target = { botId: attempt.payload.botTarget, groupId: attempt.payload.groupTarget };
    const acceptedScope = {
      apiBase: attempt.apiBase,
      sessionGeneration: current.generation,
      userId: attempt.userId,
      spaceId: attempt.spaceId,
    };
    const previous = threadSessionCache.read(acceptedScope, target);
    const snapshot = applySendActivity(previous, target, activity);
    if (!snapshot || snapshot === previous) return;
    threadSessionCache.remember(acceptedScope, snapshot);
    void savedChatsScope().then((saved) => {
      if (saved?.userId !== acceptedScope.userId || saved.spaceId !== acceptedScope.spaceId ||
        saved.sessionGeneration !== acceptedScope.sessionGeneration || saved.apiBase !== acceptedScope.apiBase)
        return;
      if (threadSessionCache.read(acceptedScope, target) === snapshot)
        writeSavedThread(saved, savedChatTarget(target), snapshot);
    }).catch(() => undefined);
  },
  errorText: (error) => errorText(error, t("Failed to send message")),
  notDelivered: (attempt) => {
    if (isModelRequiredSendError(attempt.error)) {
      Alert.alert(t("Add an AI model to keep chatting"), undefined, [
        { text: t("Not Now"), style: "cancel" },
        { text: t("Add Model"), onPress: openModelSettings, isPreferred: true },
      ]);
    } else if (!attempt.imageConfirmation) {
      Alert.alert(t("Failed to send message"), attempt.error);
    }
  },
});
export function startUnsentSends(): () => void {
  let stopped = false;
  const retry = (force = false) =>
    void prepareUnsentSends()
      .then(() => {
        if (!stopped) return sendWaitingMessages(force);
      })
      .catch(() => undefined);
  retry();
  const reachable = subscribeServerReachable(() => {
    if (isServerReachable()) retry();
  });
  const appState = AppState.addEventListener("change", (state) => {
    if (state === "active") retry(true);
  });
  // Other session changes empty the queue; a password change keeps it for the new session.
  const session = subscribeSessionGeneration(() => {
    if (currentReadySessionGeneration() === currentSessionGeneration() && hasUnsentSends()) retry();
  });
  return () => {
    stopped = true;
    reachable();
    appState.remove();
    session();
  };
}
