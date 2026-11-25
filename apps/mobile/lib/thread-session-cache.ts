import type { RpcOutput } from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES } from "@rakazo/core";
import type { MobileSnapshot } from "./api";
import { aggregateConversationStatus, isConversationActiveStatus } from "./conversation-status";

export type ThreadSessionScope = {
  apiBase: string;
  sessionGeneration: number;
  userId: string;
  spaceId: string;
  projectId?: string;
};

/** Builds an isolated session cache scope for a project workspace conversation. */
export function projectThreadSessionScope(scopeKey: string, projectId: string): ThreadSessionScope {
  return {
    apiBase: scopeKey,
    sessionGeneration: 0,
    userId: "",
    spaceId: scopeKey,
    projectId,
  };
}

export type ThreadSessionTarget = { botId?: string; groupId?: string };
type SendActivity = NonNullable<RpcOutput<"threads/send">["activity"]>;
type SendReceipt = Pick<RpcOutput<"threads/send">, "activity" | "runId" | "runIds">;

export type RosterReconcilePayload = {
  bots?: ReadonlyArray<{ id: string; status?: string; unread?: boolean }>;
  groups?: ReadonlyArray<{
    id: string;
    status?: string;
    unread?: boolean;
    members?: ReadonlyArray<{ status?: string }>;
  }>;
};

type CachedThread = {
  scope: string;
  snapshot: MobileSnapshot;
  revision: number;
  overrideStatus: boolean;
};

type UnreadOverride = {
  scope: string;
  unread: boolean;
  pending: boolean;
  revision: number;
  token: number;
};

type SyncedRosterEntry = {
  scope: string;
  kind: "bot" | "group";
  status?: string;
  unread?: boolean;
};

const threads = new Map<string, CachedThread>();
const pendingSends = new Map<string, Set<string>>();
const unreadOverrides = new Map<string, UnreadOverride>();
const syncedRoster = new Map<string, SyncedRosterEntry>();
const scopeRosterRevision = new Map<string, number>();
const listeners = new Set<() => void>();
let revision = 0;
let sequence = 0;
let nextUnreadToken = 0;

function scopeKey(scope: ThreadSessionScope): string {
  return JSON.stringify([
    scope.apiBase,
    scope.sessionGeneration,
    scope.userId,
    scope.spaceId,
    scope.projectId,
  ]);
}

function threadKey(scope: ThreadSessionScope, target: ThreadSessionTarget): string {
  return JSON.stringify([
    scopeKey(scope),
    target.groupId ? "group" : "bot",
    target.groupId ?? target.botId,
  ]);
}

function publish() {
  revision += 1;
  for (const listener of listeners) listener();
}

export function threadSnapshotStatus(snapshot: MobileSnapshot): string {
  const active = snapshot.activeRuns ?? (snapshot.run ? [snapshot.run] : []);
  const activeStatus = aggregateConversationStatus(
    active.map((run) => run.status),
    "",
  );
  if (activeStatus) return activeStatus;
  return aggregateConversationStatus([snapshot.run?.status], "idle");
}

export function applySendActivity(
  previous: MobileSnapshot | null,
  target: ThreadSessionTarget,
  activity: SendActivity,
): MobileSnapshot | null {
  if (
    previous?.threadId &&
    (previous.threadId !== activity.threadId || (previous.cursor ?? -1) > activity.cursor)
  )
    return previous;
  const base: MobileSnapshot = previous ?? {
    ...target,
    threadId: activity.threadId,
    messages: [],
    olderCursor: null,
    run: null,
  };
  const active = (base.activeRuns ?? (base.run ? [base.run] : [])).filter((run) =>
    ACTIVE_RUN_STATUSES.some((status) => status === run.status),
  );
  const received = activity.runs.filter(
    (run) =>
      ACTIVE_RUN_STATUSES.some((status) => status === run.status) &&
      !active.some((existing) => existing.id === run.id),
  );
  if (!received.length) return previous;
  return {
    ...base,
    threadId: activity.threadId,
    cursor: activity.cursor,
    run:
      base.run && (active.includes(base.run) || base.run.status === "failed")
        ? base.run
        : received[0]!,
    activeRuns: [...active, ...received.map((run) => ({ ...run, sendCursor: activity.cursor }))],
  };
}

/**
 * Applies a `threads/send` or `projectWorkspaces/sendText` receipt even on older servers that
 * return `runId`/`runIds` without the structured `activity` block.
 */
export function applyAcceptedSend(
  previous: MobileSnapshot | null,
  target: ThreadSessionTarget,
  receipt: SendReceipt,
): MobileSnapshot | null {
  if (receipt.activity) {
    return applySendActivity(previous, target, receipt.activity);
  }
  const runIds = [
    ...(receipt.runIds ?? []),
    ...(receipt.runId && !receipt.runIds?.includes(receipt.runId) ? [receipt.runId] : []),
  ];
  if (runIds.length === 0) return previous;
  const base: MobileSnapshot = previous ?? {
    ...target,
    threadId: "",
    messages: [],
    olderCursor: null,
    run: null,
  };
  const active = (base.activeRuns ?? (base.run ? [base.run] : [])).filter((run) =>
    ACTIVE_RUN_STATUSES.some((status) => status === run.status),
  );
  const sendCursor = (base.cursor ?? -1) + 1;
  const synthetic = runIds
    .filter((id) => !active.some((existing) => existing.id === id))
    .map((id) => ({
      id,
      ...(target.botId ? { botId: target.botId } : {}),
      status: "queued" as const,
      sendCursor,
    }));
  if (!synthetic.length) return previous;
  return {
    ...base,
    run:
      base.run && (active.includes(base.run) || base.run.status === "failed")
        ? base.run
        : synthetic[0]!,
    activeRuns: [...active, ...synthetic],
  };
}

export function retainAcceptedRuns(previous: MobileSnapshot | null, next: MobileSnapshot) {
  if (previous?.threadId && previous.threadId !== next.threadId) return next;
  const runs = previous?.activeRuns?.filter((run) => (run.sendCursor ?? -1) > (next.cursor ?? -1));
  if (!runs?.length) return next;
  const active = next.activeRuns ?? (next.run ? [next.run] : []);
  return {
    ...next,
    run: next.run ?? runs[0]!,
    activeRuns: [...active, ...runs.filter((run) => !active.some(({ id }) => id === run.id))],
  };
}

function resolveStatus(key: string, fallback: string): string {
  const cached = threads.get(key);
  const synced = syncedRoster.get(key);
  const base = cached?.overrideStatus
    ? threadSnapshotStatus(cached.snapshot)
    : (synced?.status ?? fallback);
  if (pendingSends.get(key)?.size) {
    return isConversationActiveStatus(base) ? base : "queued";
  }
  return base;
}

export const threadSessionCache = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getRevision: () => revision,
  getRequestRevision: () => sequence,
  read(scope: ThreadSessionScope, target: ThreadSessionTarget) {
    const snapshot = threads.get(threadKey(scope, target))?.snapshot ?? null;
    // Synthetic receipts created without a known threadId track status only, never a fake empty transcript.
    return snapshot?.threadId ? snapshot : null;
  },
  remember(scope: ThreadSessionScope, snapshot: MobileSnapshot) {
    if (
      (snapshot.cursor === undefined &&
        !snapshot.activeRuns?.some((run) => run.sendCursor !== undefined)) ||
      (!snapshot.botId && !snapshot.groupId)
    )
      return;
    const key = threadKey(scope, snapshot);
    const previous = threads.get(key);
    if (
      previous?.snapshot === snapshot ||
      (previous?.snapshot.threadId &&
        previous.snapshot.threadId === snapshot.threadId &&
        (previous.snapshot.cursor ?? -1) > (snapshot.cursor ?? -1))
    )
      return;
    const prevEffective = resolveStatus(key, "idle");
    threads.delete(key);
    threads.set(key, {
      scope: scopeKey(scope),
      snapshot,
      revision: ++sequence,
      overrideStatus: true,
    });
    if (threads.size > 40) threads.delete(threads.keys().next().value!);
    const nextEffective = resolveStatus(key, "idle");
    if (!previous?.overrideStatus || prevEffective !== nextEffective) publish();
  },
  markSendPending(scope: ThreadSessionScope, target: ThreadSessionTarget, sendId: string) {
    if (!target.botId && !target.groupId) return;
    const key = threadKey(scope, target);
    const before = resolveStatus(key, "idle");
    let set = pendingSends.get(key);
    if (!set) {
      set = new Set();
      pendingSends.set(key, set);
    }
    if (set.has(sendId)) return;
    set.add(sendId);
    sequence += 1;
    if (resolveStatus(key, "idle") !== before) publish();
  },
  clearSendPending(scope: ThreadSessionScope, target: ThreadSessionTarget, sendId: string) {
    if (!target.botId && !target.groupId) return;
    const key = threadKey(scope, target);
    const set = pendingSends.get(key);
    if (!set?.has(sendId)) return;
    const before = resolveStatus(key, "idle");
    set.delete(sendId);
    if (set.size === 0) pendingSends.delete(key);
    if (resolveStatus(key, "idle") !== before) publish();
  },
  hasPendingSend(scope: ThreadSessionScope, target: ThreadSessionTarget): boolean {
    if (!target.botId && !target.groupId) return false;
    return (pendingSends.get(threadKey(scope, target))?.size ?? 0) > 0;
  },
  beginUnreadWrite(
    scope: ThreadSessionScope,
    target: ThreadSessionTarget,
    unread: boolean,
  ): number {
    const token = ++nextUnreadToken;
    if (!target.botId && !target.groupId) return token;
    const key = threadKey(scope, target);
    const before = this.unreadState(scope, target, !unread);
    unreadOverrides.set(key, {
      scope: scopeKey(scope),
      unread,
      pending: true,
      revision: ++sequence,
      token,
    });
    if (before !== unread) publish();
    return token;
  },
  finishUnreadWrite(scope: ThreadSessionScope, target: ThreadSessionTarget, token: number) {
    if (!target.botId && !target.groupId) return;
    const key = threadKey(scope, target);
    const existing = unreadOverrides.get(key);
    if (!existing || existing.token !== token) return;
    existing.pending = false;
    existing.revision = ++sequence;
    const synced = syncedRoster.get(key);
    if (synced) synced.unread = existing.unread;
  },
  abortUnreadWrite(scope: ThreadSessionScope, target: ThreadSessionTarget, token: number) {
    if (!target.botId && !target.groupId) return;
    const key = threadKey(scope, target);
    const existing = unreadOverrides.get(key);
    if (!existing || existing.token !== token) return;
    unreadOverrides.delete(key);
    publish();
  },
  unreadState(scope: ThreadSessionScope, target: ThreadSessionTarget, fallback: boolean): boolean {
    if (!target.botId && !target.groupId) return fallback;
    const key = threadKey(scope, target);
    const override = unreadOverrides.get(key);
    if (override) return override.unread;
    const synced = syncedRoster.get(key);
    if (synced?.unread !== undefined) return synced.unread;
    return fallback;
  },
  botStatus(scope: ThreadSessionScope, botId: string, fallback: string): string {
    return resolveStatus(threadKey(scope, { botId }), fallback);
  },
  groupStatus(
    scope: ThreadSessionScope,
    groupId: string,
    fallback: string | ReadonlyArray<{ status?: string }> = "idle",
  ): string {
    const fallbackStatus =
      typeof fallback === "string"
        ? fallback
        : aggregateConversationStatus(fallback.map((member) => member.status));
    return resolveStatus(threadKey(scope, { groupId }), fallbackStatus);
  },
  reconcileRoster(
    scope: ThreadSessionScope,
    requestRevision: number,
    roster?: RosterReconcilePayload,
  ) {
    const key = scopeKey(scope);
    let changed = false;
    for (const cached of threads.values()) {
      if (cached.scope !== key || cached.revision > requestRevision || !cached.overrideStatus)
        continue;
      cached.overrideStatus = false;
      changed = true;
    }
    for (const [overrideKey, override] of unreadOverrides.entries()) {
      if (override.scope !== key || override.pending || override.revision > requestRevision)
        continue;
      unreadOverrides.delete(overrideKey);
      changed = true;
    }
    if (roster) {
      const previousRosterRev = scopeRosterRevision.get(key) ?? -1;
      if (requestRevision >= previousRosterRev) {
        scopeRosterRevision.set(key, requestRevision);
        const seenBots = roster.bots ? new Set<string>() : null;
        const seenGroups = roster.groups ? new Set<string>() : null;
        if (roster.bots) {
          for (const bot of roster.bots) {
            const entryKey = threadKey(scope, { botId: bot.id });
            seenBots!.add(entryKey);
            const prev = syncedRoster.get(entryKey);
            const nextStatus = bot.status;
            const nextUnread = bot.unread;
            if (!prev || prev.status !== nextStatus || prev.unread !== nextUnread) {
              syncedRoster.set(entryKey, {
                scope: key,
                kind: "bot",
                status: nextStatus,
                unread: nextUnread,
              });
              changed = true;
            }
          }
        }
        if (roster.groups) {
          for (const group of roster.groups) {
            const entryKey = threadKey(scope, { groupId: group.id });
            seenGroups!.add(entryKey);
            const prev = syncedRoster.get(entryKey);
            const nextStatus =
              group.status ??
              (group.members
                ? aggregateConversationStatus(group.members.map((member) => member.status))
                : undefined);
            const nextUnread = group.unread;
            if (!prev || prev.status !== nextStatus || prev.unread !== nextUnread) {
              syncedRoster.set(entryKey, {
                scope: key,
                kind: "group",
                status: nextStatus,
                unread: nextUnread,
              });
              changed = true;
            }
          }
        }
        for (const [entryKey, entry] of syncedRoster.entries()) {
          if (entry.scope !== key) continue;
          if (entry.kind === "bot" && seenBots && !seenBots.has(entryKey)) {
            syncedRoster.delete(entryKey);
            changed = true;
          } else if (entry.kind === "group" && seenGroups && !seenGroups.has(entryKey)) {
            syncedRoster.delete(entryKey);
            changed = true;
          }
        }
      }
    }
    if (changed) publish();
  },
  clear() {
    threads.clear();
    pendingSends.clear();
    unreadOverrides.clear();
    syncedRoster.clear();
    scopeRosterRevision.clear();
    sequence += 1;
    publish();
  },
};
