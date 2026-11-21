import type { AiConsentStatus, ProductEvent, ThreadMessage } from "@rakazo/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectThreadPendingSend } from "./project-thread-session.js";
import {
  createProjectThreadSession,
  loadProjectBotIdentity,
  projectMemberName,
} from "./project-thread-session.js";

describe("project Bot identity", () => {
  it("loads the target beyond the first roster page and keeps its avatar metadata", async () => {
    const bot = { id: "bot-b", name: "Beta", color: "#123456", avatarSet: "rakazo" };
    const load = vi
      .fn()
      .mockResolvedValueOnce({ bots: [{ id: "bot-a", name: "Alpha" }], nextBotId: "bot-a" })
      .mockResolvedValueOnce({ bots: [bot], nextBotId: null });
    await expect(
      loadProjectBotIdentity("bot-b", load, new AbortController().signal),
    ).resolves.toEqual({ ...bot, botId: "bot-b" });
    expect(load.mock.calls).toEqual([[undefined], ["bot-a"]]);
  });

  it("does not use another Bot's identity when the project roster has no match", async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ bots: [{ id: "bot-a", name: "Alpha" }], nextBotId: null });
    await expect(
      loadProjectBotIdentity("missing", load, new AbortController().signal),
    ).resolves.toBeUndefined();
  });

  it("discards a roster response after the project request has been aborted", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => {
      controller.abort();
      return { bots: [], groups: [], nextBotId: null, nextGroupId: null };
    });
    await expect(loadProjectBotIdentity("bot-a", load, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(load).toHaveBeenCalledOnce();
  });
});

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const approved: AiConsentStatus = { scope: "scope-a", version: "v1", recipients: [] };
const event = (seq: number, threadId = "thread-a") =>
  ({ type: "thread.message.created", threadId, seq, payload: {} }) as ProductEvent;

function fixture(pendingSend?: ProjectThreadPendingSend) {
  let current = true;
  let receive!: (event: ProductEvent) => void;
  const stream = deferred<void>();
  const load = vi.fn().mockResolvedValue({ threadId: "thread-a", cursor: 1, text: "initial" });
  const subscribe = vi.fn(async (_cursor, onEvent, signal: AbortSignal) => {
    receive = onEvent;
    signal.addEventListener("abort", () => stream.resolve(), { once: true });
    await stream.promise;
  });
  const send = vi.fn().mockResolvedValue({ ok: true });
  const cancelRun = vi.fn().mockResolvedValue({ ok: true });
  const answerApproval = vi.fn().mockResolvedValue({ ok: true });
  const consentStatus = vi.fn().mockResolvedValue(approved);
  const consentAllow = vi.fn().mockResolvedValue(approved);
  const nonce = vi.fn().mockReturnValueOnce("nonce-1").mockReturnValueOnce("nonce-2");
  const session = createProjectThreadSession<{
    threadId: string;
    cursor: number;
    text: string;
    run?: { id: string; status: string };
    messages?: Pick<ThreadMessage, "id" | "runId" | "blocks">[];
  }>({
    current: () => current,
    load,
    subscribe,
    reduce: (snapshot, next) => ({ ...snapshot, text: `event-${next.seq}` }),
    consentStatus,
    consentAllow,
    send,
    cancelRun,
    answerApproval,
    nonce,
    pendingSend,
  });
  const started = session.start();
  return {
    session,
    started,
    load,
    subscribe,
    send,
    cancelRun,
    answerApproval,
    consentStatus,
    consentAllow,
    nonce,
    stream,
    receive: (next: ProductEvent) => receive(next),
    leave: () => {
      current = false;
      session.stop();
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("project conversation session", () => {
  it("qualifies same-name members in roster order and preserves other names", () => {
    const members = [
      { botId: "bot-b", name: "Alpha" },
      { botId: "bot-c", name: "Beta" },
      { botId: "bot-a", name: "Alpha" },
    ];
    expect(projectMemberName(members, "bot-b")).toBe("Alpha (1)");
    expect(projectMemberName(members, "bot-a")).toBe("Alpha (2)");
    expect(projectMemberName(members, "bot-c")).toBe("Beta");
    expect(projectMemberName(members, "removed")).toBeUndefined();
    expect(projectMemberName(undefined, "bot-a")).toBeUndefined();
  });

  it("answers only the pending approval belonging to the current snapshot", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    const read = {
      id: "message-a",
      runId: "run-a",
      blocks: [
        {
          kind: "ask",
          text: "Read a sample?",
          approvalEffectId: "effect-a",
          actions: [{ id: "deny", label: "Deny" }],
        },
      ],
    };
    item.load.mockResolvedValue({
      threadId: "thread-a",
      cursor: 2,
      run: { id: "run-a", status: "waiting_input" },
      messages: [read],
    });
    await item.session.refresh();
    await item.session.answerApproval("not-in-view", "deny");
    await item.session.answerApproval("message-a", "allow");
    await item.session.answerApproval("message-a", "deny");
    expect(item.answerApproval).toHaveBeenCalledExactlyOnceWith(
      {
        runId: "run-a",
        messageId: "message-a",
        effectId: "effect-a",
        decision: "deny",
      },
      expect.any(AbortSignal),
    );
    item.leave();
    await item.started;
  });

  it("sends one cancellation for the displayed Run and ignores a stale selection", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    item.load.mockResolvedValue({
      threadId: "thread-a",
      cursor: 2,
      run: { id: "run-a", status: "running" },
    });
    await item.session.refresh();
    const response = deferred<unknown>();
    item.cancelRun.mockReturnValueOnce(response.promise);
    const cancelling = item.session.cancelRun("run-a");
    await item.session.cancelRun("run-a");
    await item.session.cancelRun("run-b");
    expect(item.cancelRun).toHaveBeenCalledExactlyOnceWith("run-a", expect.any(AbortSignal));
    expect(item.session.getSnapshot().cancellingRunId).toBe("run-a");
    item.load.mockResolvedValue({
      threadId: "thread-a",
      cursor: 3,
      run: { id: "run-a", status: "cancelled" },
    });
    response.reject(new Error("Response lost"));
    await cancelling;
    expect(item.session.getSnapshot()).toMatchObject({
      snapshot: { run: { id: "run-a", status: "cancelled" } },
      cancellingRunId: null,
      cancelError: null,
    });
    item.leave();
    await item.started;
  });

  it("reports an unconfirmed cancellation and aborts in-flight requests on leaving", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    item.load.mockResolvedValue({
      threadId: "thread-a",
      cursor: 2,
      run: { id: "run-a", status: "running" },
    });
    await item.session.refresh();
    const error = new Error("Response lost");
    item.cancelRun.mockRejectedValueOnce(error);
    await item.session.cancelRun("run-a");
    expect(item.session.getSnapshot()).toMatchObject({ cancelError: error, cancellingRunId: null });
    const response = deferred<unknown>();
    item.cancelRun.mockReturnValueOnce(response.promise);
    const cancelling = item.session.cancelRun("run-a");
    const signal = item.cancelRun.mock.lastCall?.[1] as AbortSignal;
    const reads = item.load.mock.calls.length;
    item.leave();
    expect(signal.aborted).toBe(true);
    response.resolve({ ok: true });
    await cancelling;
    expect(item.load).toHaveBeenCalledTimes(reads);
    await item.started;
  });

  it("loads a snapshot before subscribing and ignores foreign or repeated events", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    expect(item.subscribe.mock.calls[0]?.[0]).toBe(1);
    item.receive(event(8, "thread-b"));
    item.receive(event(1));
    expect(item.session.getSnapshot().snapshot?.text).toBe("initial");
    item.receive(event(2));
    expect(item.session.getSnapshot().snapshot).toMatchObject({ cursor: 2, text: "event-2" });
    item.leave();
    await item.started;
  });

  it("does not let an older refresh replace streamed messages", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    const older = deferred<{ threadId: string; cursor: number; text: string }>();
    item.load.mockReturnValueOnce(older.promise);
    const refreshed = item.session.refresh();
    item.receive(event(3));
    older.resolve({ threadId: "thread-a", cursor: 2, text: "stale" });
    await refreshed;
    expect(item.session.getSnapshot().snapshot?.text).toBe("event-3");
    item.leave();
    await item.started;
  });

  it("reuses the nonce after an unknown send result without retrying automatically", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    item.send.mockRejectedValueOnce(new TypeError("connection lost"));
    expect(await item.session.send(" hello ")).toBe(false);
    expect(item.send).toHaveBeenCalledOnce();
    expect(await item.session.send("hello")).toBe(true);
    expect(item.send.mock.calls.map((call) => call.slice(0, 2))).toEqual([
      ["hello", "nonce-1"],
      ["hello", "nonce-1"],
    ]);
    expect(await item.session.send("next")).toBe(true);
    expect(item.send.mock.calls[2]?.[1]).toBe("nonce-2");
    item.leave();
    await item.started;
  });

  it("blocks duplicate sends while a request is pending", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    const pending = deferred<unknown>();
    item.send.mockReturnValueOnce(pending.promise);
    const first = item.session.send("hello");
    expect(await item.session.send("hello")).toBe(false);
    pending.resolve({ ok: true });
    expect(await first).toBe(true);
    expect(item.send).toHaveBeenCalledOnce();
    item.leave();
    await item.started;
  });

  it("retains an unresolved nonce when a mobile route blurs and refocuses", async () => {
    const pendingSend: ProjectThreadPendingSend = { current: null };
    const first = fixture(pendingSend);
    await vi.waitFor(() => expect(first.subscribe).toHaveBeenCalledOnce());
    const receipt = deferred<unknown>();
    first.send.mockReturnValueOnce(receipt.promise);
    const sent = first.session.send("hello");
    await vi.waitFor(() => expect(first.send).toHaveBeenCalledOnce());
    first.leave();
    receipt.resolve({ ok: true });
    expect(await sent).toBe(false);
    const next = fixture(pendingSend);
    await vi.waitFor(() => expect(next.subscribe).toHaveBeenCalledOnce());
    expect(await next.session.send("hello")).toBe(true);
    expect(next.nonce).not.toHaveBeenCalled();
    expect(next.send.mock.calls[0]?.[1]).toBe(first.send.mock.calls[0]?.[1]);
    next.leave();
    await Promise.all([first.started, next.started]);
  });

  it("keeps an unknown send's nonce when reconnecting the read stream", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    item.send.mockRejectedValueOnce(new TypeError("response lost"));
    expect(await item.session.send("hello")).toBe(false);
    item.subscribe.mockImplementationOnce(async (_cursor, _receive, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
    });
    const reconnected = item.session.reconnect();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledTimes(2));
    expect(await item.session.send("hello")).toBe(true);
    expect(item.send.mock.calls.map((call) => call[1])).toEqual(["nonce-1", "nonce-1"]);
    item.leave();
    await Promise.all([item.started, reconnected]);
  });

  it("keeps a successful receipt successful when its refresh fails", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    item.load.mockRejectedValueOnce(new TypeError("refresh failed"));
    expect(await item.session.send("hello")).toBe(true);
    expect(item.session.getSnapshot()).toMatchObject({ sendError: null, sending: false });
    expect(item.session.getSnapshot().readError).toBeInstanceOf(TypeError);
    item.leave();
    await item.started;
  });

  it("requires explicit consent and never sends from the allow action", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    const missing = {
      ...approved,
      recipients: [
        { key: "model-a", name: "Model", use: "model", detail: "Provider", allowed: false },
      ],
    };
    item.consentStatus.mockResolvedValueOnce(missing);
    expect(await item.session.send("hello")).toBe(false);
    expect(item.send).not.toHaveBeenCalled();
    await item.session.allow();
    expect(item.consentAllow).toHaveBeenCalledWith(missing, expect.any(AbortSignal));
    expect(item.send).not.toHaveBeenCalled();
    expect(await item.session.send("hello")).toBe(true);
    item.leave();
    await item.started;
  });

  it("does not write after switching scope during the consent read", async () => {
    const item = fixture();
    await vi.waitFor(() => expect(item.subscribe).toHaveBeenCalledOnce());
    const pending = deferred<AiConsentStatus>();
    item.consentStatus.mockReturnValueOnce(pending.promise);
    const sent = item.session.send("hello");
    item.leave();
    pending.resolve(approved);
    expect(await sent).toBe(false);
    expect(item.send).not.toHaveBeenCalled();
    item.receive(event(5));
    expect(item.session.getSnapshot().snapshot?.cursor).toBe(1);
    await item.started;
  });

  it("reloads before reconnecting after the stream ends", async () => {
    vi.useFakeTimers();
    const item = fixture();
    await vi.advanceTimersByTimeAsync(0);
    item.subscribe.mockImplementationOnce(async (_cursor, _receive, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
    });
    item.stream.resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(item.load).toHaveBeenCalledTimes(2);
    expect(item.subscribe).toHaveBeenCalledTimes(2);
    item.leave();
    await item.started;
  });

  it("does not repeatedly request a conversation after access is refused", async () => {
    vi.useFakeTimers();
    const item = fixture();
    item.load.mockRejectedValue(Object.assign(new Error("forbidden"), { status: 403 }));
    await vi.advanceTimersByTimeAsync(0);
    item.stream.reject(Object.assign(new Error("forbidden"), { status: 403 }));
    await vi.advanceTimersByTimeAsync(300);
    expect(item.load).toHaveBeenCalledTimes(1);
    expect(item.session.getSnapshot().snapshot).toBeNull();
    item.leave();
    await item.started;
  });
});
