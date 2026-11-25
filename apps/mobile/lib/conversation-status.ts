import { isRunWaitingOnUser, isRunWorking } from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";

export type ConversationStatusTone = "working" | "waiting" | "failed" | "idle";

export function isConversationActiveStatus(status: string | null | undefined): boolean {
  return isRunWorking(status) || isRunWaitingOnUser(status);
}

/**
 * Pick the highest-priority visible status across runs in a single conversation.
 * Active execution (`running`/`leased`) takes precedence over lingering `waiting_input` cards
 * so a bot executing a task shows "Working…" instead of staying stuck on "Needs input".
 */
export function aggregateConversationStatus(
  statuses: Iterable<string | null | undefined>,
  fallback = "idle",
): string {
  let hasWaitingTakeover = false;
  let hasRunning = false;
  let hasLeased = false;
  let hasWaitingInput = false;
  let hasQueued = false;
  let hasFailed = false;
  for (const status of statuses) {
    if (!status) continue;
    if (status === "waiting_takeover") hasWaitingTakeover = true;
    else if (status === "running") hasRunning = true;
    else if (status === "leased") hasLeased = true;
    else if (status === "waiting_input") hasWaitingInput = true;
    else if (status === "queued") hasQueued = true;
    else if (status === "failed") hasFailed = true;
  }
  if (hasWaitingTakeover) return "waiting_takeover";
  if (hasRunning) return "running";
  if (hasLeased) return "leased";
  if (hasWaitingInput) return "waiting_input";
  if (hasQueued) return "queued";
  if (hasFailed) return "failed";
  return fallback;
}

export function conversationStatusTone(status: string | null | undefined): ConversationStatusTone {
  if (isRunWaitingOnUser(status)) return "waiting";
  if (isRunWorking(status)) return "working";
  if (status === "failed") return "failed";
  return "idle";
}

export function conversationStatusLabel(
  status: string | null | undefined,
  t: (message: string) => string,
  options?: { composing?: boolean; includeTerminal?: boolean },
): string {
  if (options?.composing && (!status || status === "idle" || isRunWorking(status))) {
    return t("Working…");
  }
  switch (status) {
    case "queued":
      return t("Queued");
    case "leased":
      return t("Starting…");
    case "running":
      return t("Working…");
    case "waiting_input":
      return t("Needs input");
    case "waiting_takeover":
      return t("Needs you");
    case "failed":
      return t("Failed");
    case "completed":
      return options?.includeTerminal ? t("Done") : "";
    case "cancelled":
      return options?.includeTerminal ? t("Cancelled") : "";
    default:
      return "";
  }
}

export function conversationStatusColor(
  status: string | null | undefined,
  tokens: Partial<Pick<ColorTokens, "statusWorking" | "warning" | "destructive">>,
): string | undefined {
  switch (conversationStatusTone(status)) {
    case "working":
      return tokens.statusWorking;
    case "waiting":
      return tokens.warning;
    case "failed":
      return tokens.destructive;
    default:
      return undefined;
  }
}
