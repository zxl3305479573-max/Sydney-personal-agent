import { randomUUID } from "node:crypto";
import { withAbort } from "@rakazo/core";

export type CompanionScreenOwner = {
  userId: string;
  spaceId: string;
  botId: string;
  sessionId: string;
};

type Session = {
  owner: CompanionScreenOwner;
  expiresAt: number;
  controller: AbortController | null;
};

export function createCompanionScreenSessions(options: {
  now?: () => number;
  lifetimeMs?: number;
  intervalMs?: number;
  maxSessions?: number;
} = {}) {
  const now = options.now ?? Date.now;
  const lifetime = options.lifetimeMs ?? 5 * 60_000;
  const interval = options.intervalMs ?? 30_000;
  const maxSessions = options.maxSessions ?? 1_000;
  const sessions = new Map<string, Session>();
  const cooldowns = new Map<string, number>();
  const inFlight = new Map<string, Promise<unknown>>();
  const sameOwner = (left: CompanionScreenOwner, right: CompanionScreenOwner) =>
    left.userId === right.userId && left.spaceId === right.spaceId &&
    left.botId === right.botId && left.sessionId === right.sessionId;
  const remove = (id: string, session: Session) => {
    sessions.delete(id);
    session.controller?.abort();
  };
  const prune = () => {
    for (const [id, session] of sessions) {
      if (now() >= session.expiresAt) remove(id, session);
    }
    for (const [userId, expiresAt] of cooldowns) {
      if (now() >= expiresAt) cooldowns.delete(userId);
    }
  };
  const find = (id: string, owner: CompanionScreenOwner) => {
    prune();
    const session = sessions.get(id);
    return session && sameOwner(session.owner, owner) ? session : undefined;
  };
  return {
    start(owner: CompanionScreenOwner, confirmed: boolean): { id: string; expiresAt: number } {
      if (!confirmed || !owner.userId || !owner.spaceId || !owner.botId || !owner.sessionId) {
        throw new Error("Screen sharing consent required.");
      }
      prune();
      for (const [id, session] of sessions) {
        if (session.owner.userId === owner.userId && session.owner.sessionId === owner.sessionId) {
          remove(id, session);
        }
      }
      if (sessions.size >= maxSessions) throw new Error("Screen sessions unavailable.");
      const id = randomUUID();
      const session: Session = { owner: { ...owner }, expiresAt: now() + lifetime, controller: null };
      sessions.set(id, session);
      return { id, expiresAt: session.expiresAt };
    },
    isActive(id: string, owner: CompanionScreenOwner): boolean {
      return Boolean(find(id, owner));
    },
    stop(id: string, owner: CompanionScreenOwner): boolean {
      const session = find(id, owner);
      if (!session) return false;
      remove(id, session);
      return true;
    },
    async run<T>(id: string, owner: CompanionScreenOwner, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const session = find(id, owner);
      if (!session || session.controller || cooldowns.has(owner.userId) || inFlight.has(owner.userId) ||
        cooldowns.size >= maxSessions) {
        throw new Error("Screen session unavailable or rate limited.");
      }
      const controller = new AbortController();
      session.controller = controller;
      cooldowns.set(owner.userId, now() + interval);
      const expiryTimer = setTimeout(() => {
        if (sessions.get(id) === session) remove(id, session);
      }, Math.max(0, session.expiresAt - now()));
      const taskPromise = Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error("Screen session ended.");
        return task(controller.signal);
      });
      inFlight.set(owner.userId, taskPromise);
      void taskPromise.finally(() => {
        if (inFlight.get(owner.userId) === taskPromise) inFlight.delete(owner.userId);
      }).catch(() => undefined);
      try {
        const result = await withAbort(taskPromise, controller.signal);
        if (controller.signal.aborted || find(id, owner) !== session) {
          throw new Error("Screen session ended.");
        }
        return result;
      } finally {
        clearTimeout(expiryTimer);
        if (session.controller === controller) session.controller = null;
      }
    },
  };
}
