// @vitest-environment jsdom
import type { EffectCallback } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  scope: "account-a",
  focused: true,
  pending: false,
  capture: vi.fn(),
  rpc: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) =>
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]),
}));
vi.mock("./project-scope", () => ({ projectScopeKey: () => runtime.scope }));
vi.mock("./api", () => ({
  captureApiRequestContext: runtime.capture,
  isSpaceSelectionPending: () => runtime.pending,
  rpc: runtime.rpc,
  subscribeProjectThread: runtime.subscribe,
  applyMobileThreadEvent: (snapshot: object, event: { seq: number }) => ({
    ...snapshot,
    cursor: event.seq,
  }),
}));

import { queryClient } from "./query-client";
import type { ProjectChatTarget } from "./use-project-thread";
import { useProjectThread } from "./use-project-thread";

describe("mobile project chat transport", () => {
  let root: Root;
  let chat: ReturnType<typeof useProjectThread>;
  let target: ProjectChatTarget;
  let projectId: string;
  const context = { apiBase: "https://example.test", headers: { "x-rakazo-space-id": "space-a" } };
  const snapshot = { threadId: "thread-a", cursor: 1, messages: [], olderCursor: null, run: null };
  function Probe() {
    chat = useProjectThread(projectId, target, runtime.scope, true);
    return null;
  }
  const render = () =>
    act(async () =>
      root.render(<Probe key={JSON.stringify([runtime.scope, projectId, target])} />),
    );
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.scope = "account-a";
    runtime.focused = true;
    runtime.pending = false;
    projectId = "project-a";
    target = { botId: "bot-a" };
    runtime.capture.mockReset().mockResolvedValue(context);
    runtime.rpc
      .mockReset()
      .mockImplementation(async (procedure: string) =>
        procedure === "projectWorkspaces/consentStatus" ||
        procedure === "projectWorkspaces/consentAllow"
          ? { scope: "scope-a", version: "v1", recipients: [] }
          : snapshot,
      );
    runtime.subscribe
      .mockReset()
      .mockImplementation(async (_project, _target, _cursor, _receive, signal) => {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      });
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it("pins bot snapshot, consent, send and SSE to one project and request context", async () => {
    await render();
    expect(chat.snapshot?.threadId).toBe("thread-a");
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/threadSnapshot",
      { projectId: "project-a", botId: "bot-a", groupId: undefined },
      expect.objectContaining({ requestContext: context, skipSpaceAuthRecovery: true }),
    );
    expect(runtime.subscribe).toHaveBeenCalledWith(
      "project-a",
      { botId: "bot-a" },
      1,
      expect.any(Function),
      expect.any(AbortSignal),
      expect.any(Function),
    );
    await act(async () => {
      expect(await chat.send("hello")).toBe(true);
    });
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/sendText",
      expect.objectContaining({
        projectId: "project-a",
        botId: "bot-a",
        text: "hello",
        clientNonce: expect.any(String),
      }),
      expect.objectContaining({
        requestContext: context,
        allowConsentPrompt: false,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(
      runtime.rpc.mock.calls.every(([procedure]) =>
        String(procedure).startsWith("projectWorkspaces/"),
      ),
    ).toBe(true);
  });
  it("keeps the last live snapshot through blur and unmount while the next read is pending", async () => {
    await render();
    const receive = runtime.subscribe.mock.calls[0]![3];
    await act(async () =>
      receive({ threadId: "thread-a", seq: 12, type: "run.started", payload: {} }),
    );
    await act(async () => root.render(null));
    let finish!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    expect(chat.snapshot?.cursor).toBe(12);
    expect(chat.loading).toBe(false);
    expect(chat.consent).toBeNull();
    await act(async () => finish({ ...snapshot, cursor: 13 }));
    expect(chat.snapshot?.cursor).toBe(13);
  });

  it("drops cached messages after the server denies the reopened conversation", async () => {
    await render();
    await act(async () => root.render(null));
    runtime.rpc.mockRejectedValueOnce(Object.assign(new Error("Removed"), { status: 404 }));
    await render();
    expect(chat.snapshot).toBeNull();
    expect(chat.readError).toBeTruthy();
    await act(async () => root.render(null));
    let finish!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    expect(chat.snapshot).toBeNull();
    await act(async () => finish(snapshot));
  });

  it("replaces a cached thread when the first authoritative read points to a new conversation", async () => {
    await render();
    await act(async () => root.render(null));
    runtime.rpc.mockResolvedValueOnce({ ...snapshot, threadId: "thread-new", cursor: 0 });
    await render();
    expect(chat.snapshot?.threadId).toBe("thread-new");
    expect(chat.readError).toBeNull();
  });

  it("sends cancellation with the pinned group and account context", async () => {
    target = { groupId: "group-a" };
    runtime.rpc.mockResolvedValueOnce({ ...snapshot, run: { id: "run-b", status: "queued" } });
    await render();
    await act(async () => {
      await chat.cancelRun("run-b");
    });
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/cancelRun",
      { projectId: "project-a", groupId: "group-a", botId: undefined, runId: "run-b" },
      expect.objectContaining({
        requestContext: context,
        skipSpaceAuthRecovery: true,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("supports groups and cancels the old subscription when selecting another project", async () => {
    target = { groupId: "group-a" };
    await render();
    const old = runtime.subscribe.mock.calls[0]!;
    expect(old[1]).toEqual({ groupId: "group-a" });
    projectId = "project-b";
    await render();
    expect(old[4].aborted).toBe(true);
    expect(old[5]()).toBe(false);
    expect(runtime.subscribe.mock.calls[1]?.[0]).toBe("project-b");
    await act(async () =>
      old[3]({ threadId: "thread-a", seq: 20, type: "thread.message.created", payload: {} }),
    );
    expect(chat.snapshot?.cursor).toBe(1);
  });

  it("ignores the old account's snapshot after switching scope", async () => {
    let resolve!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    runtime.scope = "account-b";
    await render();
    await act(async () => resolve({ ...snapshot, threadId: "old-account" }));
    expect(chat.snapshot?.threadId).toBe("thread-a");
    expect(runtime.subscribe).toHaveBeenCalledOnce();
  });

  it("does not issue requests if the scope changes while capturing credentials", async () => {
    let resolve!: (value: unknown) => void;
    runtime.capture.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    runtime.scope = "account-b";
    await act(async () => resolve(context));
    expect(runtime.rpc).not.toHaveBeenCalled();
    expect(runtime.subscribe).not.toHaveBeenCalled();
  });

  it("aborts reads, subscriptions and pending consent on blur", async () => {
    await render();
    let resolve!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let sent!: Promise<boolean>;
    await act(async () => {
      sent = chat.send("private");
    });
    const signal = runtime.rpc.mock.calls.at(-1)?.[2].signal as AbortSignal;
    runtime.focused = false;
    await render();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ scope: "scope-a", version: "v1", recipients: [] }));
    expect(await sent).toBe(false);
    expect(
      runtime.rpc.mock.calls.some(([procedure]) => procedure === "projectWorkspaces/sendText"),
    ).toBe(false);
  });
});
