// @vitest-environment jsdom

import type { ProductEvent, ThreadSnapshot } from "@rakazo/contracts";
import { runThreadSubscription } from "@rakazo/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useThreadSync } from "./use-thread-sync";

vi.mock("@rakazo/core", async (original) => ({
  ...(await original<typeof import("@rakazo/core")>()),
  runThreadSubscription: vi.fn(async () => {}),
}));
vi.mock("../../lib/query", () => ({
  queryClient: {
    getQueryData: () => undefined,
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(async () => {}),
  },
}));
vi.mock("@rakazo/core/query", () => ({ fetchFresh: vi.fn(async () => []) }));

const ref = <T,>(current: T) => ({ current });
const flush = () => act(async () => {});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function groupInput() {
  const response = deferred<ThreadSnapshot>();
  const get = vi.fn(() => response.promise);
  const commitSnapshot = vi.fn();
  const input = {
    rpc: { threads: { get } },
    queries: { threads: { get: { queryKey: vi.fn(() => ["group-thread"]) } } },
    thread: {
      snapshot: null,
      snapshotRef: ref<ThreadSnapshot | null>(null),
      commitSnapshot,
      updateSnapshot: vi.fn(),
      setRoutines: vi.fn(),
      setRoutinesBotId: vi.fn(),
      setTaughtSkills: vi.fn(),
      setTaughtSkillsBotId: vi.fn(),
      bootstrappedThread: ref(null),
      expandedHistoryThread: ref(null),
      historyEpoch: ref(0),
      messageScroll: ref(null),
      pinnedAroundRef: ref(null),
      resetHistory: vi.fn(),
    },
    computerState: {
      computerRef: ref(null),
      commitComputer: vi.fn(),
      cacheComputerFor: vi.fn(),
      showCachedComputer: vi.fn(),
      computerOpenRef: ref(false),
      computerBotIdRef: ref(null),
      refreshComputerScreen: vi.fn(),
    },
    active: undefined,
    activeGroup: undefined as { id: string; name: string } | undefined,
    inGroup: true,
    groupId: "group-1",
    activeBotId: ref<string | undefined>(undefined),
    activeGroupId: ref<string | undefined>("group-1"),
    botsRef: ref([]),
    searchParamsRef: ref(new URLSearchParams()),
    refreshBots: vi.fn(async () => {}),
    notifyBrowserForEvent: vi.fn(),
    markBotReadIfVisible: vi.fn(),
    markGroupReadOnReply: vi.fn(),
    seed: undefined as { thread: ThreadSnapshot } | undefined,
  };
  return { input, response, get, commitSnapshot };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("starts loading the group before the roster arrives and ignores a late response after switching", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { input, response, get, commitSnapshot } = groupInput();
  function Probe() {
    useThreadSync(input as unknown as Parameters<typeof useThreadSync>[0]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  expect(runThreadSubscription).toHaveBeenCalledTimes(1);
  const subscription = vi.mocked(runThreadSubscription).mock.calls[0]![0];
  const loading = subscription.loadInitial();
  expect(get).toHaveBeenCalledWith({ groupId: "group-1" }, expect.anything());

  input.activeGroup = { id: "group-1", name: "Group" };
  await act(async () => root.render(createElement(Probe)));
  expect(runThreadSubscription).toHaveBeenCalledTimes(1);

  input.activeGroupId.current = "group-2";
  response.resolve({
    threadId: "thread-1",
    groupId: "group-1",
    messages: [],
  } as unknown as ThreadSnapshot);
  await act(async () => void (await loading));
  expect(commitSnapshot).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it.each([false, true])(
  "uses the matching cached group seed unless jumping to history (%s)",
  async (jump) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { input, commitSnapshot } = groupInput();
    const saved = {
      threadId: "thread-1",
      groupId: "group-1",
      messages: [],
    } as unknown as ThreadSnapshot;
    input.seed = { thread: saved };
    if (jump) input.searchParamsRef.current.set("m", "old-message");
    function Probe() {
      useThreadSync(input as unknown as Parameters<typeof useThreadSync>[0]);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(Probe)));
    if (jump) expect(commitSnapshot).not.toHaveBeenCalled();
    else expect(commitSnapshot).toHaveBeenCalledWith(saved);
    expect(runThreadSubscription).toHaveBeenCalledOnce();
    act(() => root.unmount());
  },
);

it("does not show a cached seed from a different group", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { input, commitSnapshot } = groupInput();
  input.seed = {
    thread: { threadId: "thread-2", groupId: "group-2", messages: [] } as unknown as ThreadSnapshot,
  };
  function Probe() {
    useThreadSync(input as unknown as Parameters<typeof useThreadSync>[0]);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe)));
  expect(commitSnapshot).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it.each([false, true])(
  "coalesces real %s group event callbacks and drops queued work on leave",
  async (inGroup) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const snapshot = {
      threadId: "thread-1",
      cursor: 1,
      messages: [],
      run: null,
    } as unknown as ThreadSnapshot;
    const reads = [deferred<ThreadSnapshot>(), deferred<ThreadSnapshot>()];
    const get = vi.fn(() => reads[get.mock.calls.length - 1]!.promise);
    const roster = deferred<void>();
    const refreshBots = vi.fn(() => roster.promise);
    const commitSnapshot = vi.fn();
    const input = {
      rpc: { threads: { get } },
      queries: {
        threads: { get: { queryKey: vi.fn(() => ["thread"]) } },
        routines: { list: { queryOptions: vi.fn() }, history: { key: vi.fn(() => ["history"]) } },
        skills: { list: { queryOptions: vi.fn() } },
      },
      thread: {
        snapshot: null,
        snapshotRef: ref(null),
        commitSnapshot,
        updateSnapshot: vi.fn(),
        setRoutines: vi.fn(),
        setRoutinesBotId: vi.fn(),
        setTaughtSkills: vi.fn(),
        setTaughtSkillsBotId: vi.fn(),
        bootstrappedThread: ref(null),
        expandedHistoryThread: ref(null),
        historyEpoch: ref(0),
        messageScroll: ref(null),
        pinnedAroundRef: ref(null),
        resetHistory: vi.fn(),
      },
      computerState: {
        computerRef: ref(null),
        commitComputer: vi.fn(),
        cacheComputerFor: vi.fn(),
        showCachedComputer: vi.fn(),
        computerOpenRef: ref(false),
        computerBotIdRef: ref(null),
        refreshComputerScreen: vi.fn(async () => {}),
      },
      active: inGroup ? undefined : { id: "bot-1", name: "Bot" },
      activeGroup: inGroup ? { id: "group-1", name: "Group" } : undefined,
      inGroup,
      groupId: inGroup ? "group-1" : undefined,
      activeBotId: ref(inGroup ? undefined : "bot-1"),
      activeGroupId: ref(inGroup ? "group-1" : undefined),
      botsRef: ref([]),
      searchParamsRef: ref(new URLSearchParams()),
      refreshBots,
      notifyBrowserForEvent: vi.fn(),
      markBotReadIfVisible: vi.fn(),
      markGroupReadOnReply: vi.fn(),
    } as unknown as Parameters<typeof useThreadSync>[0];
    function Probe() {
      useThreadSync(input);
      return null;
    }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(Probe)));
    const subscription = vi.mocked(runThreadSubscription).mock.calls[0]![0];
    const event = { type: "run.completed", payload: {}, runId: "run-1" } as ProductEvent;
    const deliver = () => subscription.onEvent(event, snapshot);
    deliver();
    await flush();
    for (let i = 0; i < 100; i++) deliver();
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
    expect(refreshBots).toHaveBeenCalledTimes(1);
    reads[0]!.resolve(snapshot);
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    expect(commitSnapshot).toHaveBeenCalledWith(snapshot);
    // A pending trailing read from the burst must not run after teardown.
    act(() => root.unmount());
    reads[1]!.resolve(snapshot);
    roster.resolve();
    await flush();
    expect(refreshBots).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(subscription.signal.aborted).toBe(true);
  },
);
