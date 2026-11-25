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

it("keeps status live across separate screens after roster reconciliation and rejects older rosters", () => {
  threadSessionCache.remember(scope, snapshot("running", 10));
  const newerReq = threadSessionCache.getRequestRevision();
  const olderReq = newerReq - 1;
  threadSessionCache.reconcileRoster(scope, newerReq, {
    bots: [{ id: "bot-a", status: "running", unread: false }],
    groups: [{ id: "group-a", unread: true, members: [{ status: "waiting_input" }] }],
  });
  // Another mounted tab whose local state still holds an older "idle" / unread: true snapshot reads live truth.
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);
  expect(threadSessionCache.groupStatus(scope, "group-a", [])).toBe("waiting_input");
  expect(threadSessionCache.unreadState(scope, { groupId: "group-a" }, false)).toBe(true);

  // An older roster poll returning late cannot clobber the newer synced roster.
  threadSessionCache.reconcileRoster(scope, olderReq, {
    bots: [{ id: "bot-a", status: "idle", unread: true }],
  });
  expect(threadSessionCache.botStatus(scope, "bot-a", "idle")).toBe("running");
  expect(threadSessionCache.unreadState(scope, { botId: "bot-a" }, true)).toBe(false);
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
