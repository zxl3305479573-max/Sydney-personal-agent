// @vitest-environment jsdom

import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MobileSnapshot } from "./api";
import { useThreadSnapshot } from "./thread-history";
import type { ThreadSessionScope } from "./thread-session-cache";
import {
  applyAcceptedSend,
  applySendActivity,
  projectThreadSessionScope,
  retainAcceptedRuns,
  threadSessionCache,
} from "./thread-session-cache";

vi.mock("./response-streaming", () => ({
  getCachedResponseStreamingEnabled: () => false,
  subscribeResponseStreaming: () => () => {},
}));

const scope: ThreadSessionScope = {
  apiBase: "https://api.example.test",
  sessionGeneration: 1,
  userId: "user-a",
  spaceId: "space-a",
};

function snapshot(status = "running", cursor = 10): MobileSnapshot {
  const run = { id: "run-a", botId: "bot-a", status };
  return {
    botId: "bot-a",
    threadId: "thread-a",
    cursor,
    run,
    activeRuns: [run],
    messages: [{ id: "message-a", role: "user", blocks: [{ kind: "text", text: "Task" }] }],
    olderCursor: null,
  };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  threadSessionCache.clear();
});

afterEach(() => {
  threadSessionCache.clear();
  vi.unstubAllGlobals();
});

it("updates the mounted home immediately and restores the conversation before any new request", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  let history!: ReturnType<typeof useThreadSnapshot>;
  function Home() {
    useSyncExternalStore(threadSessionCache.subscribe, threadSessionCache.getRevision);
    return <output>{threadSessionCache.botStatus(scope, "bot-a", "idle")}</output>;
  }
  function Chat() {
    history = useThreadSnapshot({ scope, botId: "bot-a" });
    return <p>{history.snap?.run?.status ?? "loading"}</p>;
  }
  const render = (chat: boolean) =>
    act(() =>
      root.render(
        <>
          <Home />
          {chat ? <Chat /> : null}
        </>,
      ),
    );
  render(true);
  act(() => history.commitSnap(snapshot()));
  render(false);
  expect(container.textContent).toBe("running");
  render(true);
  expect(container.querySelector("p")?.textContent).toBe("running");
  expect(history.snapRef.current?.cursor).toBe(10);
  act(() => history.commitSnap({ ...snapshot(), cursor: 11, run: null, activeRuns: [] }));
  expect(container.querySelector("output")?.textContent).toBe("idle");
  render(false);
  render(true);
  expect(history.snap?.activeRuns).toEqual([]);
  act(() => root.unmount());
});

it("lets a fresh roster settle a task completed while the chat was closed, preserving newer events", () => {
  threadSessionCache.remember(scope, snapshot());
  const requestRevision = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, requestRevision);
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("idle");
  threadSessionCache.remember(scope, snapshot("waiting_input", 11));
  threadSessionCache.reconcileRoster(scope, requestRevision);
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("waiting_input");
});

it("retains progress without repeatedly rerendering home or letting an older roster hide work", () => {
  threadSessionCache.remember(scope, snapshot());
  const requestRevision = threadSessionCache.getRequestRevision();
  const listener = vi.fn();
  const unsubscribe = threadSessionCache.subscribe(listener);
  threadSessionCache.remember(scope, snapshot("running", 11));
  expect(listener).not.toHaveBeenCalled();
  expect(threadSessionCache.read(scope, { botId: "bot-a" })?.cursor).toBe(11);
  threadSessionCache.reconcileRoster(scope, requestRevision);
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
  unsubscribe();
});

it.each([
  { apiBase: "https://other.example.test" },
  { sessionGeneration: 2 },
  { userId: "user-b" },
  { spaceId: "space-b" },
])("keeps snapshots and home status inside their scope: %j", (change) => {
  threadSessionCache.remember(scope, snapshot());
  expect(threadSessionCache.read({ ...scope, ...change }, { botId: "bot-a" })).toBeNull();
  expect(threadSessionCache.botStatus({ ...scope, ...change }, "bot-a", "idle")).toBe("idle");
});

it("keeps bot and group snapshots separate and rejects an older cursor", () => {
  const latest = snapshot();
  threadSessionCache.remember(scope, latest);
  threadSessionCache.remember(scope, snapshot("queued", 9));
  threadSessionCache.remember(scope, { ...snapshot(), botId: undefined, groupId: "bot-a" });
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toBe(latest);
  expect(threadSessionCache.read(scope, { groupId: "bot-a" })?.groupId).toBe("bot-a");
});

it("excludes saved snapshots without a replay cursor and forgets the cache on clear", () => {
  threadSessionCache.remember(scope, { ...snapshot(), cursor: undefined });
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toBeNull();
  threadSessionCache.remember(scope, snapshot());
  threadSessionCache.clear();
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toBeNull();
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("idle");
});

it("does not replace the live tail with expanded history or a search page", () => {
  const root = createRoot(document.createElement("div"));
  let history!: ReturnType<typeof useThreadSnapshot>;
  function Chat() {
    history = useThreadSnapshot({ scope, botId: "bot-a" });
    return null;
  }
  act(() => root.render(<Chat />));
  const latest = snapshot();
  act(() => history.commitSnap(latest));
  history.expandedHistoryThread.current = latest.threadId;
  act(() => history.commitSnap({ ...snapshot("running", 11), olderCursor: 4 }));
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toBe(latest);
  act(() => root.unmount());
});

it("clears active runs together with messages so re-entry cannot resurrect the working marker", () => {
  const root = createRoot(document.createElement("div"));
  let history!: ReturnType<typeof useThreadSnapshot>;
  function Chat() {
    history = useThreadSnapshot({ scope, botId: "bot-a" });
    return null;
  }
  act(() => root.render(<Chat />));
  act(() => history.commitSnap(snapshot()));
  act(() => history.clear());
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toMatchObject({
    run: null,
    activeRuns: [],
    messages: [],
  });
  expect(threadSessionCache.botStatus(scope, "bot-a", "running")).toBe("idle");
  act(() => root.unmount());
});

it("seeds a queued run from the send receipt before SSE or roster polling", () => {
  const next = applySendActivity(
    null,
    { botId: "bot-a" },
    {
      threadId: "thread-a",
      cursor: 12,
      runs: [{ id: "run-a", botId: "bot-a", status: "queued" }],
    },
  );
  expect(next).toMatchObject({
    botId: "bot-a",
    threadId: "thread-a",
    cursor: 12,
    run: { id: "run-a", status: "queued" },
    activeRuns: [{ id: "run-a", botId: "bot-a", status: "queued" }],
  });
});

it("keeps accepted work when an older refresh omits the run", () => {
  const accepted = applySendActivity(
    null,
    { botId: "bot-a" },
    {
      threadId: "thread-a",
      cursor: 12,
      runs: [{ id: "run-a", botId: "bot-a", status: "queued" }],
    },
  )!;
  const refreshed = retainAcceptedRuns(accepted, {
    ...accepted,
    cursor: 11,
    run: null,
    activeRuns: [],
  });
  expect(refreshed.activeRuns).toEqual(accepted.activeRuns);
});

it("keeps status live across separate screens without leaking member DM status into groups", () => {
  threadSessionCache.remember(scope, snapshot("running", 10));
  const newerReq = threadSessionCache.getRequestRevision();
  const olderReq = newerReq - 1;
  threadSessionCache.reconcileRoster(scope, newerReq, {
    bots: [{ id: "bot-a", status: "running", unread: false }],
    groups: [
      { id: "group-a", unread: true, members: [{ status: "waiting_input" }] },
      { id: "group-b", status: "waiting_input", unread: false, members: [{ status: "idle" }] },
    ],
  });
  // Another mounted tab whose local state still holds an older "idle" / unread: true snapshot reads live truth.
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);
  // DM member waiting_input must NEVER bleed into group-a's status.
  expect(threadSessionCache.groupStatus(scope, "group-a", "idle")).toBe("idle");
  expect(threadSessionCache.unreadState(scope, { groupId: "group-a" }, false)).toBe(true);
  // Explicit thread-scoped group status IS preserved.
  expect(threadSessionCache.groupStatus(scope, "group-b", "idle")).toBe("waiting_input");

  // An older roster poll returning late cannot clobber the newer synced roster.
  threadSessionCache.reconcileRoster(scope, olderReq, {
    bots: [{ id: "bot-a", status: "idle", unread: true }],
  });
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);
});

it("updates an existing waiting_input run to queued on send receipt and prioritizes running over waiting_input", () => {
  const waitingSnap = snapshot("waiting_input", 10);
  threadSessionCache.remember(scope, waitingSnap);
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("waiting_input");

  // Pending send immediately flips waiting_input -> queued.
  threadSessionCache.markSendPending(scope, { botId: "bot-a" }, "nonce-answer");
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("queued");

  // Server answers the same waiting_input run id -> transitions to queued in place.
  const resumed = applySendActivity(waitingSnap, { botId: "bot-a" }, {
    threadId: "thread-a",
    cursor: 11,
    runs: [{ id: "run-a", botId: "bot-a", status: "queued" }],
  })!;
  expect(resumed.run?.status).toBe("queued");
  expect(resumed.activeRuns).toEqual([
    expect.objectContaining({ id: "run-a", status: "queued", sendCursor: 11 }),
  ]);
  threadSessionCache.remember(scope, resumed);
  threadSessionCache.clearSendPending(scope, { botId: "bot-a" }, "nonce-answer");
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("queued");

  // Legacy receipt without activity also transitions the existing waiting_input run to queued.
  const legacyResumed = applyAcceptedSend(waitingSnap, { botId: "bot-a" }, { runId: "run-a" })!;
  expect(legacyResumed.run?.status).toBe("queued");
  expect(legacyResumed.activeRuns?.[0]?.status).toBe("queued");

  // While a new run is actively running alongside an older unanswered waiting_input card, show running.
  const mixedSnap: MobileSnapshot = {
    botId: "bot-a",
    threadId: "thread-a",
    cursor: 12,
    messages: [],
    olderCursor: null,
    run: { id: "run-b", botId: "bot-a", status: "running" },
    activeRuns: [
      { id: "run-a", botId: "bot-a", status: "waiting_input" },
      { id: "run-b", botId: "bot-a", status: "running" },
    ],
  };
  threadSessionCache.remember(scope, mixedSnap);
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
});

it("keeps a group's own cached active status on legacy servers without group.status until it settles", () => {
  const groupSnap: MobileSnapshot = {
    groupId: "group-live",
    threadId: "thread-g1",
    cursor: 5,
    messages: [],
    olderCursor: null,
    run: { id: "run-g1", botId: "bot-a", status: "running" },
    activeRuns: [{ id: "run-g1", botId: "bot-a", status: "running" }],
  };
  threadSessionCache.remember(scope, groupSnap);
  expect(threadSessionCache.groupStatus(scope, "group-live", "idle")).toBe("running");

  // Legacy server poll omits group.status while member is still active and group has no new unread reply.
  const poll1 = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, poll1, {
    groups: [{ id: "group-live", unread: false, members: [{ status: "running" }] }],
  });
  expect(threadSessionCache.groupStatus(scope, "group-live", "idle")).toBe("running");

  // Once all members become idle, the legacy cached override clears to idle.
  const poll2 = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, poll2, {
    groups: [{ id: "group-live", unread: false, members: [{ status: "idle" }] }],
  });
  expect(threadSessionCache.groupStatus(scope, "group-live", "idle")).toBe("idle");
});

it("shows queued status during in-flight sends and handles legacy receipts without activity", () => {
  threadSessionCache.markSendPending(scope, { botId: "bot-a" }, "nonce-1");
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("queued");

  // A roster poll returning idle while the send is still in flight cannot wipe queued status.
  const reqRev = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, reqRev, {
    bots: [{ id: "bot-a", status: "idle", unread: false }],
  });
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("queued");

  // Older server replies with runId only (no structured activity): keeps queued status without poisoning read().
  const accepted = applyAcceptedSend(null, { botId: "bot-a" }, { runId: "run-legacy" });
  expect(accepted).not.toBeNull();
  threadSessionCache.remember(scope, accepted!);
  threadSessionCache.clearSendPending(scope, { botId: "bot-a" }, "nonce-1");
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("queued");
  expect(threadSessionCache.read(scope, { botId: "bot-a" })).toBeNull();
});

it("syncs unread writes immediately across tabs, survives exit races, and reconciles later replies", () => {
  const readToken = threadSessionCache.beginUnreadWrite(scope, { botId: "bot-a" }, false);
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);

  // Poll started while write is pending cannot revert unread back to true.
  const midWriteRev = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, midWriteRev, {
    bots: [{ id: "bot-a", status: "running", unread: true }],
  });
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);

  threadSessionCache.finishUnreadWrite(scope, { botId: "bot-a" }, readToken);
  // Poll started BEFORE write finished still cannot revert unread.
  threadSessionCache.reconcileRoster(scope, midWriteRev, {
    bots: [{ id: "bot-a", status: "idle", unread: true }],
  });
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);

  // A later poll started AFTER the read settled brings in a newly arrived bot reply as unread.
  const afterReadRev = threadSessionCache.getRequestRevision();
  threadSessionCache.reconcileRoster(scope, afterReadRev, {
    bots: [{ id: "bot-a", status: "idle", unread: true }],
  });
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, false)).toBe(true);

  // Aborting a failed unread write rolls back cleanly.
  const failedToken = threadSessionCache.beginUnreadWrite(scope, { botId: "bot-a" }, false);
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);
  threadSessionCache.abortUnreadWrite(scope, { botId: "bot-a" }, failedToken);
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, false)).toBe(true);
});

it("isolates project conversations by workspace and account scope", () => {
  const projectA = projectThreadSessionScope("account-a", "project-1");
  const projectB = projectThreadSessionScope("account-a", "project-2");
  threadSessionCache.remember(projectA, snapshot("running", 5));
  expect(threadSessionCache.botStatus(projectA, "bot-a", "idle")).toBe("running");
  expect(threadSessionCache.botStatus(projectB, "bot-a", "idle")).toBe("idle");
});
