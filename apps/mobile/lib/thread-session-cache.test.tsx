// @vitest-environment jsdom

import { act, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MobileSnapshot } from "./api";
import { useThreadSnapshot } from "./thread-history";
import type { ThreadSessionScope } from "./thread-session-cache";
import { threadSessionCache } from "./thread-session-cache";

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
