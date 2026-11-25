import type { RpcOutput } from "@rakazo/contracts";
import { ACTIVE_RUN_STATUSES, isRunWaitingOnUser, isRunWorking } from "@rakazo/core";
import type { MobileSnapshot } from "./api";

export type ThreadSessionScope = {
  apiBase: string;
  sessionGeneration: number;
  userId: string;
  spaceId: string;
  projectId?: string;
};

type ThreadTarget = { botId?: string; groupId?: string };
type SendActivity = NonNullable<RpcOutput<"threads/send">["activity"]>;

type CachedThread = {
  scope: string;
  snapshot: MobileSnapshot;
  revision: number;
  overrideStatus: boolean;
};

const threads = new Map<string, CachedThread>();
const listeners = new Set<() => void>();
let revision = 0;
let sequence = 0;

function scopeKey(scope: ThreadSessionScope): string {
  return JSON.stringify([
    scope.apiBase, scope.sessionGeneration, scope.userId, scope.spaceId, scope.projectId,
  ]);
}

function threadKey(scope: ThreadSessionScope, target: ThreadTarget) {
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
  return (
    active.find((run) => isRunWaitingOnUser(run.status))?.status ??
    active.find((run) => run.status === "running")?.status ??
    active.find((run) => run.status === "leased")?.status ??
    active.find((run) => isRunWorking(run.status))?.status ??
    snapshot.run?.status ??
    "idle"
  );
}

export function applySendActivity(
  previous: MobileSnapshot | null,
  target: ThreadTarget,
  activity: SendActivity,
): MobileSnapshot | null {
  if (previous && (previous.threadId !== activity.threadId || (previous.cursor ?? -1) > activity.cursor))
    return previous;
  const base: MobileSnapshot = previous ?? {
    ...target,
    threadId: activity.threadId,
    messages: [],
    olderCursor: null,
    run: null,
  };
  const active = (base.activeRuns ?? (base.run ? [base.run] : []))
    .filter((run) => ACTIVE_RUN_STATUSES.some((status) => status === run.status));
  const received = activity.runs.filter((run) =>
    ACTIVE_RUN_STATUSES.some((status) => status === run.status) &&
    !active.some((existing) => existing.id === run.id),
  );
  if (!received.length) return previous;
  return {
    ...base,
    cursor: activity.cursor,
    run: base.run && (active.includes(base.run) || base.run.status === "failed")
      ? base.run
      : received[0]!,
    activeRuns: [...active, ...received.map((run) => ({ ...run, sendCursor: activity.cursor }))],
  };
}

export function retainAcceptedRuns(previous: MobileSnapshot | null, next: MobileSnapshot) {
  if (previous?.threadId !== next.threadId) return next;
  const runs = previous.activeRuns?.filter((run) => (run.sendCursor ?? -1) > (next.cursor ?? -1));
  if (!runs?.length) return next;
  const active = next.activeRuns ?? (next.run ? [next.run] : []);
  return {
    ...next,
    run: next.run ?? runs[0]!,
    activeRuns: [...active, ...runs.filter((run) => !active.some(({ id }) => id === run.id))],
  };
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
  read(scope: ThreadSessionScope, target: ThreadTarget) {
    return threads.get(threadKey(scope, target))?.snapshot ?? null;
  },
  remember(scope: ThreadSessionScope, snapshot: MobileSnapshot) {
    if (
      (snapshot.cursor === undefined && !snapshot.activeRuns?.some((run) => run.sendCursor !== undefined)) ||
      (!snapshot.botId && !snapshot.groupId)
    ) return;
    const key = threadKey(scope, snapshot);
    const previous = threads.get(key);
    if (
      previous?.snapshot === snapshot ||
      (previous?.snapshot.threadId === snapshot.threadId &&
        (previous.snapshot.cursor ?? -1) > (snapshot.cursor ?? -1))
    )
      return;
    threads.delete(key);
    threads.set(key, {
      scope: scopeKey(scope),
      snapshot,
      revision: ++sequence,
      overrideStatus: true,
    });
    if (threads.size > 40) threads.delete(threads.keys().next().value!);
    if (
      !previous?.overrideStatus ||
      threadSnapshotStatus(previous.snapshot) !== threadSnapshotStatus(snapshot)
    )
      publish();
  },
  botStatus(scope: ThreadSessionScope, botId: string, fallback: string): string {
    const cached = threads.get(threadKey(scope, { botId }));
    return cached?.overrideStatus ? threadSnapshotStatus(cached.snapshot) : fallback;
  },
  reconcileRoster(scope: ThreadSessionScope, requestRevision: number) {
    const key = scopeKey(scope);
    let changed = false;
    for (const cached of threads.values()) {
      if (cached.scope !== key || cached.revision > requestRevision || !cached.overrideStatus)
        continue;
      cached.overrideStatus = false;
      changed = true;
    }
    if (changed) publish();
  },
  clear() {
    threads.clear();
    sequence += 1;
    publish();
  },
};
