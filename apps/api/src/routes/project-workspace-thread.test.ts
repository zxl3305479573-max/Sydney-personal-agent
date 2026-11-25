import { currentDbContext } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterContext } from "./context.js";
import { projectWorkspaceRoutes } from "./project-workspaces.js";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  head: vi.fn(),
  snapshot: vi.fn(),
  messages: vi.fn(),
  send: vi.fn(),
  stop: vi.fn(),
  markRead: vi.fn(),
  subscribe: vi.fn(),
  consent: vi.fn(),
  allow: vi.fn(),
  answer: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("../thread-target.js", () => ({
  resolveThreadTarget: mocks.resolve,
  threadHead: mocks.head,
  threadSnapshot: mocks.snapshot,
  stopThreadRuns: mocks.stop,
  markThreadRead: mocks.markRead,
}));
vi.mock("../thread-message-pages.js", () => ({
  loadMessagePage: mocks.messages,
}));
vi.mock("./threads.js", () => ({
  createThreadSender: () => mocks.send,
  subscribeThread: mocks.subscribe,
}));
vi.mock("../ai-consent.js", () => ({
  aiConsentStatus: mocks.consent,
  allowAiConsent: mocks.allow,
}));

function fixture(enabled: boolean, rows: unknown[]) {
  const handler = (callback: unknown) => callback;
  const query = vi.fn().mockResolvedValue(rows);
  const routes = projectWorkspaceRoutes({
    deps: {
      env: { projectConversationCreateExperiment: enabled },
      prisma: { $queryRaw: query },
      events: { answerRunInput: mocks.answer },
      jobs: { enqueue: mocks.enqueue },
    },
    authed: { projectWorkspaces: {
      directoryCapability: { handler }, directory: { handler }, unbindDirectory: { handler },
      cloudDirectory: { handler }, bindCloudDirectory: { handler }, unbindCloudDirectory: { handler },
      capabilities: { handler }, conversationCapabilities: { handler }, groupCreationCapability: { handler },
      list: { handler }, get: { handler }, roster: { handler }, create: { handler }, rename: { handler }, removeEmpty: { handler }, remove: { handler },
      createBot: { handler }, createGroup: { handler }, threadHead: { handler }, threadSnapshot: { handler }, messages: { handler },
      sendText: { handler }, stop: { handler }, markRead: { handler }, cancelRun: { handler }, answerApproval: { handler }, getArtifact: { handler }, subscribe: { handler }, consentStatus: { handler }, consentAllow: { handler },
      getBot: { handler }, updateBot: { handler }, conversations: { handler }, botContext: { handler }, botContextAction: { handler }, conversationAction: { handler }, updateGroup: { handler }, restoreBotInstructions: { handler }, exportBot: { handler },
    } },
  } as unknown as RouterContext);
  return {
    head: routes.projectWorkspaces.threadHead as unknown as (args: unknown) => Promise<unknown>,
    call: routes.projectWorkspaces.threadSnapshot as unknown as (args: unknown) => Promise<unknown>,
    messages: routes.projectWorkspaces.messages as unknown as (args: unknown) => Promise<unknown>,
    send: routes.projectWorkspaces.sendText as unknown as (args: unknown) => Promise<unknown>,
    stop: routes.projectWorkspaces.stop as unknown as (args: unknown) => Promise<unknown>,
    markRead: routes.projectWorkspaces.markRead as unknown as (args: unknown) => Promise<unknown>,
    cancel: routes.projectWorkspaces.cancelRun as unknown as (args: unknown) => Promise<unknown>,
    answer: routes.projectWorkspaces.answerApproval as unknown as (args: unknown) => Promise<unknown>,
    subscribe: routes.projectWorkspaces.subscribe as unknown as (args: unknown) => AsyncGenerator<unknown>,
    consentStatus: routes.projectWorkspaces.consentStatus as unknown as (args: unknown) => Promise<unknown>,
    consentAllow: routes.projectWorkspaces.consentAllow as unknown as (args: unknown) => Promise<unknown>,
    query,
  };
}

describe("project thread snapshot", () => {
  it("rejects requests before querying when the experiment is disabled", async () => {
    mocks.resolve.mockReset();
    mocks.snapshot.mockReset();
    const { call, query } = fixture(false, []);
    await expect(call({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("resolves and reads the conversation within the authorized project context", async () => {
    mocks.resolve.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toEqual({
        kind: "tenant", spaceId: "space-a", userId: "user-a", projectWorkspaceId: "project-a",
      });
      return { kind: "bot", botId: "bot-a", threadId: "thread-a" };
    });
    mocks.snapshot.mockReset().mockImplementation(async () => currentDbContext());
    const { call } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    await expect(call({
      context: { actor: { spaceId: "space-a", userId: "user-a" } },
      input: { projectId: "project-a", botId: "bot-a" },
    })).resolves.toMatchObject({ kind: "tenant", projectWorkspaceId: "project-a" });
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.snapshot).toHaveBeenCalledOnce();
  });

  it("does not resolve or read a conversation in an inaccessible project", async () => {
    mocks.resolve.mockReset();
    mocks.snapshot.mockReset();
    const { call } = fixture(true, []);
    await expect(call({
      context: { actor: { spaceId: "space-a", userId: "user-a" } },
      input: { projectId: "project-b", botId: "bot-a" },
    })).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});

describe("project run cancellation", () => {
  const actor = { spaceId: "space-a", userId: "user-a" };
  const input = { projectId: "project-a", botId: "bot-a", runId: "run-a" };

  it("cancels the displayed Run inside the resolved project", async () => {
    const target = { kind: "bot", botId: "bot-a", threadId: "thread-a" };
    mocks.resolve.mockReset().mockResolvedValue(target);
    mocks.stop.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toEqual({
        kind: "tenant", ...actor, projectWorkspaceId: "project-a",
      });
    });
    const { cancel } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    await expect(cancel({ context: { actor }, input })).resolves.toEqual({ ok: true });
    expect(mocks.stop).toHaveBeenCalledExactlyOnceWith(expect.anything(), actor, target, "run-a");
  });

  it.each([false, true])("denies a closed or inaccessible project (enabled=%s)", async (enabled) => {
    mocks.resolve.mockReset();
    mocks.stop.mockReset();
    const { cancel } = fixture(enabled, []);
    await expect(cancel({ context: { actor }, input })).rejects.toThrow();
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });
});

describe("project approval", () => {
  const actor = { spaceId: "space-a", userId: "user-a" };
  const input = {
    projectId: "project-a", botId: "bot-a", runId: "run-a",
    messageId: "message-a", effectId: "effect-a", decision: "allow",
  };

  it.each([true, false])("dispatches the exact card and enqueues only after commit (%s)", async (accepted) => {
    mocks.resolve.mockReset().mockResolvedValue({ threadId: "thread-a" });
    mocks.answer.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toMatchObject({ ...actor, projectWorkspaceId: "project-a" });
      return accepted;
    });
    mocks.enqueue.mockReset().mockResolvedValue(undefined);
    const { answer } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    const response = answer({ context: { actor }, input });
    if (accepted) await expect(response).resolves.toEqual({ ok: true });
    else await expect(response).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.answer).toHaveBeenCalledExactlyOnceWith({
      spaceId: "space-a", threadId: "thread-a", runId: "run-a", messageId: "message-a",
      answeredByUserId: "user-a", answer: "allow",
      projectApproval: { projectId: "project-a", effectId: "effect-a" },
    });
    expect(mocks.enqueue).toHaveBeenCalledTimes(accepted ? 1 : 0);
  });
});

describe("project AI disclosure", () => {
  it("checks and grants only within the selected project and conversation", async () => {
    mocks.consent.mockReset().mockImplementation(async () => currentDbContext());
    mocks.allow.mockReset().mockImplementation(async () => currentDbContext());
    const { consentStatus, consentAllow } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    const actor = { spaceId: "space-a", userId: "user-a" };
    const target = { projectId: "project-a", botId: "bot-a" };
    const projectScope = { kind: "tenant", ...actor, projectWorkspaceId: "project-a" };
    await expect(consentStatus({ context: { actor }, input: target })).resolves.toEqual(projectScope);
    await expect(consentAllow({
      context: { actor }, input: { ...target, scope: "scope", version: "version", keys: ["key"] },
    })).resolves.toEqual(projectScope);
    expect(mocks.consent).toHaveBeenCalledWith(expect.anything(), actor, {
      botId: "bot-a",
      groupId: undefined,
      uses: ["model"],
    });
    expect(mocks.allow).toHaveBeenCalledWith(expect.anything(), actor, expect.objectContaining(target), {
      botId: "bot-a",
      groupId: undefined,
      uses: ["model"],
    });
  });
});

describe("project text send", () => {
  it("stays closed without the experiment", async () => {
    mocks.send.mockReset();
    const { send, query } = fixture(false, []);
    await expect(send({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("calls the shared sender inside the authorized project", async () => {
    mocks.send.mockReset().mockImplementation(async () => currentDbContext());
    mocks.consent.mockReset().mockResolvedValue({ recipients: [{ allowed: true }] });
    const { send } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    const actor = { spaceId: "space-a", userId: "user-a" };
    const input = { projectId: "project-a", botId: "bot-a", text: "Hello", clientNonce: "nonce-a" };
    await expect(send({ context: { actor }, input })).resolves.toMatchObject({
      kind: "tenant", ...actor, projectWorkspaceId: "project-a",
    });
    expect(mocks.consent).toHaveBeenCalledWith(expect.anything(), actor, {
      botId: "bot-a",
      groupId: undefined,
      uses: ["model"],
    });
    expect(mocks.send).toHaveBeenCalledWith(actor, input);
  });

  it("does not send until all relevant recipients are approved", async () => {
    mocks.send.mockReset();
    mocks.consent.mockReset().mockResolvedValue({ recipients: [{ allowed: false }] });
    const { send } = fixture(true, [{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]);
    await expect(send({
      context: { actor: { spaceId: "space-a", userId: "user-a" } },
      input: { projectId: "project-a", botId: "bot-a", text: "Hello", clientNonce: "nonce-a" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not send when the project cannot be accessed", async () => {
    mocks.send.mockReset();
    const { send } = fixture(true, []);
    await expect(send({
      context: { actor: { spaceId: "space-a", userId: "user-a" } },
      input: { projectId: "project-b", botId: "bot-a", text: "Hello", clientNonce: "nonce-a" },
    })).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("project conversation stream", () => {
  it("rejects the first read when the experiment is disabled", async () => {
    mocks.subscribe.mockReset();
    const { subscribe, query } = fixture(false, []);
    const stream = subscribe({ context: {}, input: {} });
    await expect(stream.next()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(query).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("keeps project context for each read and stops when access is revoked", async () => {
    mocks.subscribe.mockReset().mockImplementation(async function* () {
      yield currentDbContext();
      yield currentDbContext();
    });
    const { subscribe, query } = fixture(true, []);
    query.mockResolvedValueOnce([{
      id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0),
    }]).mockResolvedValueOnce([]);
    const stream = subscribe({
      context: { actor: { spaceId: "space-a", userId: "user-a" } },
      input: { projectId: "project-a", botId: "bot-a", cursor: -1 },
    });
    await expect(stream.next()).resolves.toMatchObject({
      done: false,
      value: { kind: "tenant", spaceId: "space-a", userId: "user-a", projectWorkspaceId: "project-a" },
    });
    await expect(stream.next()).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe("project thread head, messages, stop, and markRead", () => {
  it.each(["head", "messages", "stop", "markRead"] as const)(
    "rejects %s before querying when project conversations are disabled",
    async (method) => {
      mocks.resolve.mockReset();
      const env = fixture(false, []);
      await expect(env[method]({ context: {}, input: {} })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
      expect(env.query).not.toHaveBeenCalled();
      expect(mocks.resolve).not.toHaveBeenCalled();
    },
  );

  it("runs head, messages, stop, and markRead inside the authorized project context", async () => {
    const actor = { spaceId: "space-a", userId: "user-a" };
    const projectScope = { kind: "tenant", ...actor, projectWorkspaceId: "project-a" };
    mocks.resolve.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toEqual(projectScope);
      return { kind: "bot", botId: "bot-a", threadId: "thread-a" };
    });
    mocks.head.mockReset().mockImplementation(async () => ({
      threadId: "thread-a",
      cursor: 7,
      scope: currentDbContext(),
    }));
    mocks.messages.mockReset().mockImplementation(async () => ({
      messages: [],
      hasMore: false,
      scope: currentDbContext(),
    }));
    mocks.stop.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toEqual(projectScope);
    });
    mocks.markRead.mockReset().mockImplementation(async () => {
      expect(currentDbContext()).toEqual(projectScope);
      return 3;
    });
    const env = fixture(true, [{ id: "project-a", name: "Project", createdAt: new Date(0), updatedAt: new Date(0) }]);

    await expect(env.head({ context: { actor }, input: { projectId: "project-a", botId: "bot-a" } }))
      .resolves.toMatchObject({ threadId: "thread-a", cursor: 7, scope: projectScope });
    await expect(env.messages({
      context: { actor },
      input: { projectId: "project-a", botId: "bot-a", before: 5 },
    })).resolves.toMatchObject({ messages: [], hasMore: false, scope: projectScope });
    await expect(env.stop({ context: { actor }, input: { projectId: "project-a", botId: "bot-a" } }))
      .resolves.toEqual({ ok: true });
    await expect(env.markRead({ context: { actor }, input: { projectId: "project-a", botId: "bot-a" } }))
      .resolves.toEqual({ ok: true, unreadAfterSeq: 3 });
  });

  it.each(["head", "messages", "stop", "markRead"] as const)(
    "blocks %s when the project is inaccessible",
    async (method) => {
      mocks.resolve.mockReset();
      const env = fixture(true, []);
      await expect(env[method]({
        context: { actor: { spaceId: "space-a", userId: "user-a" } },
        input: { projectId: "project-missing", botId: "bot-a" },
      })).rejects.toThrow();
      expect(mocks.resolve).not.toHaveBeenCalled();
    },
  );
});
