import type { RpcOutput } from "@rakazo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  isRunWorking,
  liveActivityLine,
  liveMessageComposing,
} from "@rakazo/core";
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
  const hasLiveExecution =
    Boolean(liveActivityLine(snapshot.messages ?? [])) ||
    (snapshot.messages ?? []).some(
      (message) => message.id.startsWith("progress:") && liveMessageComposing(message.blocks),
    );
  if (activeStatus) {
    if (
      hasLiveExecution &&
      (activeStatus === "queued" || activeStatus === "leased" || activeStatus === "waiting_input")
    ) {
      return "running";
    }
    return activeStatus;
  }
  if (hasLiveExecution) return "running";
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
  const incoming = activity.runs.filter((run) =>
    ACTIVE_RUN_STATUSES.some((status) => status === run.status),
  );
  if (!incoming.length) return previous;
  const incomingById = new Map(incoming.map((run) => [run.id, run]));
  let changed = false;
  const mergedActive = active.map((existing) => {
    const next = incomingById.get(existing.id);
    if (!next) return existing;
    incomingById.delete(existing.id);
    if (existing.status !== next.status || (existing.sendCursor ?? -1) < activity.cursor) {
      changed = true;
      return { ...existing, ...next, sendCursor: activity.cursor };
    }
    return existing;
  });
  for (const added of incomingById.values()) {
    changed = true;
    mergedActive.push({ ...added, sendCursor: activity.cursor });
  }
  if (!changed) return previous;
  const updatedBaseRun =
    base.run && mergedActive.find((candidate) => candidate.id === base.run?.id);
  const nextRun =
    updatedBaseRun && (updatedBaseRun.status !== "waiting_input" || mergedActive.length === 1)
      ? updatedBaseRun
      : base.run?.status === "failed"
        ? base.run
        : (mergedActive.find((candidate) => candidate.status === "running") ??
          mergedActive.find((candidate) => candidate.status === "leased") ??
          mergedActive.find((candidate) => candidate.status === "queued") ??
          mergedActive[0] ??
          null);
  return {
    ...base,
    threadId: activity.threadId,
    cursor: activity.cursor,
    run: nextRun,
    activeRuns: mergedActive,
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
  const receiptIds = new Set(runIds);
  let changed = false;
  const mergedActive = active.map((existing) => {
    if (!receiptIds.has(existing.id)) return existing;
    receiptIds.delete(existing.id);
    if (existing.status === "waiting_input") {
      changed = true;
      return { ...existing, status: "queued", sendCursor };
    }
    return existing;
  });
  for (const id of receiptIds) {
    changed = true;
    mergedActive.push({
      id,
      ...(target.botId ? { botId: target.botId } : {}),
      status: "queued" as const,
      sendCursor,
    });
  }
  if (!changed) return previous;
  const updatedBaseRun =
    base.run && mergedActive.find((candidate) => candidate.id === base.run?.id);
  const nextRun =
    updatedBaseRun && (updatedBaseRun.status !== "waiting_input" || mergedActive.length === 1)
      ? updatedBaseRun
      : base.run?.status === "failed"
        ? base.run
        : (mergedActive.find((candidate) => candidate.status === "running") ??
          mergedActive.find((candidate) => candidate.status === "leased") ??
          mergedActive.find((candidate) => candidate.status === "queued") ??
          mergedActive[0] ??
          null);
  return {
    ...base,
    run: nextRun,
    activeRuns: mergedActive,
  };
}

export function retainAcceptedRuns(previous: MobileSnapshot | null, next: MobileSnapshot) {
  if (previous?.threadId && previous.threadId !== next.threadId) return next;
  const runs = previous?.activeRuns?.filter((run) => (run.sendCursor ?? -1) > (next.cursor ?? -1));
  if (!runs?.length) return next;
  const active = next.activeRuns ?? (next.run ? [next.run] : []);
  const byId = new Map(active.map((run) => [run.id, run]));
  for (const run of runs) {
    const existing = byId.get(run.id);
    if (!existing || (existing.status === "waiting_input" && run.status !== "waiting_input")) {
      byId.set(run.id, run);
    }
  }
  const mergedActive = [...byId.values()];
  return {
    ...next,
    run:
      next.run && next.run.status !== "waiting_input"
        ? next.run
        : (mergedActive.find((run) => run.status === "running") ??
          mergedActive.find((run) => run.status === "leased") ??
          mergedActive.find((run) => run.status === "queued") ??
          next.run ??
          runs[0]!),
    activeRuns: mergedActive,
  };
}

function resolveStatus(key: string, fallback: string): string {
  const cached = threads.get(key);
  const synced = syncedRoster.get(key);
  const base = cached?.overrideStatus
    ? threadSnapshotStatus(cached.snapshot)
    : (synced?.status ?? fallback);
  if (pendingSends.get(key)?.size) {
    return isRunWorking(base) || base === "waiting_takeover" ? base : "queued";
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
  /**
   * Resolves a group conversation's own status.
   * Never derives group status from member bots' global/DM statuses.
   */
  groupStatus(scope: ThreadSessionScope, groupId: string, fallback = "idle"): string {
    return resolveStatus(threadKey(scope, { groupId }), fallback);
  },
  reconcileRoster(
    scope: ThreadSessionScope,
    requestRevision: number,
    roster?: RosterReconcilePayload,
  ) {
    const key = scopeKey(scope);
    let changed = false;
    const rosterGroupsByKey = roster?.groups
      ? new Map(roster.groups.map((group) => [threadKey(scope, { groupId: group.id }), group]))
      : null;
    for (const [entryKey, cached] of threads.entries()) {
      if (cached.scope !== key || cached.revision > requestRevision || !cached.overrideStatus)
        continue;
      if (cached.snapshot.groupId && rosterGroupsByKey) {
        const groupRow = rosterGroupsByKey.get(entryKey);
        if (groupRow && groupRow.status === undefined) {
          // Older servers omit thread-scoped group.status (only returning members' global bot status).
          // Keep the group's own cached active status until all members are idle or a new unread reply arrives.
          const cachedActive = isConversationActiveStatus(threadSnapshotStatus(cached.snapshot));
          const allMembersIdle =
            !groupRow.members ||
            groupRow.members.every((member) => !isConversationActiveStatus(member.status));
          if (cachedActive && !allMembersIdle && !groupRow.unread) {
            continue;
          }
        }
      }
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
            // Group status comes strictly from thread-scoped group.status, never member DM status.
            const nextStatus = group.status;
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
