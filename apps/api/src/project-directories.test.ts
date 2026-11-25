import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountProjectDirectoryRoutes } from "./project-directories.js";
import type { RouterContext } from "./routes/context.js";
import { projectCloudDirectoryRoutes } from "./routes/project-cloud-directories.js";
import { projectDirectoryRoutes } from "./routes/project-directories.js";
import type { UserDeviceRouteDeps } from "./user-devices.js";

const db = vi.hoisted(() => ({
  project: vi.fn(),
  binding: vi.fn(),
  bind: vi.fn(),
  remove: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof import("@rakazo/db")>()),
  getProjectWorkspace: db.project,
  getProjectDirectoryBinding: db.binding,
  bindProjectDirectory: db.bind,
  removeProjectDirectoryBinding: db.remove,
  recordSecurityEvent: db.audit,
}));

const grantId = "746acaf1-0a4f-477d-822d-7357e7e8fe72";
const binding = {
  deviceId: "device-a",
  grantId,
  directoryName: "example",
  intent: "read-only" as const,
};
const actor: Actor = {
  userId: "user-a",
  spaceId: "space-a",
  email: "example@invalid.test",
  isDeploymentOwner: false,
};
const input = { spaceId: actor.spaceId, projectId: "project-a" };

beforeEach(() => {
  vi.clearAllMocks();
  db.project.mockResolvedValue({ id: input.projectId, name: "Example project" });
  db.binding.mockResolvedValue(binding);
  db.bind.mockResolvedValue(binding);
  db.remove.mockResolvedValue(true);
});

describe("native directory scope and bind endpoints", () => {
  function setup() {
    const session = vi.fn(async () => ({ userId: actor.userId, sessionId: "session-a" }));
    const authenticate = vi.fn(async () => ({ id: binding.deviceId, userId: actor.userId }));
    const pairing = vi.fn(async () => ({ id: binding.deviceId }));
    const deps = {
      prisma: { userDevice: { findFirst: pairing } } as unknown as PrismaClient,
      hub: { authenticate },
      session,
      trustedOrigin: (origin: string) => origin === "https://server.example",
      projectDirectoriesEnabled: true,
    } as unknown as UserDeviceRouteDeps;
    const app = new Hono();
    mountProjectDirectoryRoutes(app, deps);
    const request = (
      operation = "scope",
      body: object = input,
      headers: Record<string, string> = {},
    ) =>
      app.request(`/api/devices/project-directory/${operation}`, {
        method: "POST",
        headers: {
          authorization: "Bearer native-token",
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    return { request, session, authenticate, pairing, deps };
  }

  it("derives account and device from the session plus native bearer", async () => {
    const state = setup();
    const response = await state.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...input,
      userId: actor.userId,
      deviceId: binding.deviceId,
      projectName: "Example project",
    });
    expect(state.pairing).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: binding.deviceId,
          userId: actor.userId,
          sessionId: "session-a",
          revokedAt: null,
        },
      }),
    );
    expect(db.project).toHaveBeenCalledWith(
      state.deps.prisma,
      { userId: actor.userId, spaceId: actor.spaceId },
      input.projectId,
    );
  });

  it.each(["scope", "bind"])(
    "keeps the disabled %s route away from project tables",
    async (operation) => {
      const state = setup();
      state.deps.projectDirectoriesEnabled = false;
      expect((await state.request(operation)).status).toBe(503);
      expect(db.project).not.toHaveBeenCalled();
      expect(state.session).not.toHaveBeenCalled();
    },
  );

  it.each(["account", "session"])("refuses a mismatched %s", async (kind) => {
    const state = setup();
    if (kind === "account")
      state.authenticate.mockResolvedValue({ id: binding.deviceId, userId: "user-b" });
    else state.pairing.mockResolvedValue(null as never);
    expect((await state.request()).status).toBe(401);
    expect(db.project).not.toHaveBeenCalled();
  });

  it("refuses foreign origins and renderer-provided identity or paths", async () => {
    const state = setup();
    expect(
      (await state.request("scope", input, { origin: "https://foreign.example" })).status,
    ).toBe(403);
    expect(state.session).not.toHaveBeenCalled();
    expect((await state.request("scope", { ...input, userId: actor.userId })).status).toBe(400);
    expect(
      (
        await state.request("bind", {
          ...input,
          grantId,
          intent: "read-only",
          directoryName: "C:\\private\\folder",
        })
      ).status,
    ).toBe(400);
  });

  it("does not reveal an inaccessible project", async () => {
    const state = setup();
    db.project.mockResolvedValue(null);
    expect((await state.request()).status).toBe(404);
    expect(db.bind).not.toHaveBeenCalled();
  });

  it("binds only opaque metadata using the authenticated device", async () => {
    const state = setup();
    const response = await state.request("bind", {
      ...input,
      grantId,
      directoryName: binding.directoryName,
      intent: "read-only",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(binding);
    expect(db.bind).toHaveBeenCalledWith(
      state.deps.prisma,
      { userId: actor.userId, spaceId: actor.spaceId },
      input.projectId,
      "session-a",
      binding,
    );
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.directory.bound",
        metadata: {
          projectId: input.projectId,
          deviceId: binding.deviceId,
          grantId,
          intent: "read-only",
        },
      }),
    );
    db.bind.mockResolvedValue(null);
    expect(
      (
        await state.request("bind", {
          ...input,
          grantId,
          directoryName: binding.directoryName,
          intent: "read-only",
        })
      ).status,
    ).toBe(409);
  });

  it("persists and audits the native write intent", async () => {
    const state = setup();
    const writable = { ...binding, intent: "read-write" };
    db.bind.mockResolvedValue(writable);
    const response = await state.request("bind", {
      ...input, grantId, directoryName: binding.directoryName, intent: writable.intent,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(writable);
    expect(db.bind).toHaveBeenCalledWith(
      state.deps.prisma,
      { userId: actor.userId, spaceId: actor.spaceId },
      input.projectId,
      "session-a",
      writable,
    );
    expect(db.audit).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ intent: "read-write" }),
    }));
  });
});

describe("shared directory status and revocation", () => {
  function setup() {
    const list = vi.fn(async () => [
      { deviceId: binding.deviceId, name: "Example computer", connected: true },
    ]);
    const releaseSignedOut = vi.fn(async () => {});
    const request = vi.fn(async function* (
      _userId: string,
      _request: unknown,
      _signal: AbortSignal,
      _deviceId?: string,
    ) {
      yield { state: "authorized" };
    });
    const handler = (callback: unknown) => callback;
    const deps = {
      env: { projectWorkspaceCreateExperiment: true, projectDeviceToolsEnabled: true },
      prisma: {},
      userDevices: { list, request, releaseSignedOut },
    };
    const routes = projectDirectoryRoutes({
      deps,
      authed: {
        projectWorkspaces: {
          directoryCapability: { handler },
          directory: { handler },
          unbindDirectory: { handler },
        },
      },
    } as unknown as RouterContext);
    const call = (operation: keyof typeof routes, extra: object = {}) =>
      (routes[operation] as unknown as (args: unknown) => Promise<unknown>)({
        context: { actor },
        input: { id: input.projectId, ...extra },
      });
    return { call, deps, list, request, releaseSignedOut };
  }

  it("keeps local directory access closed when only project chat is enabled", async () => {
    const state = setup();
    state.deps.env.projectDeviceToolsEnabled = false;
    await expect(state.call("directoryCapability")).resolves.toEqual({ localDevice: false });
    await expect(state.call("directory")).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(db.project).not.toHaveBeenCalled();
    expect(state.request).not.toHaveBeenCalled();
  });

  it("fixes status queries to the bound device and opaque grant", async () => {
    const state = setup();
    await expect(state.call("directory")).resolves.toEqual({
      binding,
      deviceName: "Example computer",
      status: "online",
    });
    expect(state.request).toHaveBeenCalledWith(
      actor.userId,
      { method: "workspaceGrant", operation: "status", ...input, grantId },
      expect.any(AbortSignal),
      binding.deviceId,
    );
  });
  it.each(["offline", "unauthorized"])("reports %s without a device request", async (status) => {
    const state = setup();
    state.list.mockResolvedValue(
      status === "offline"
        ? [{ deviceId: binding.deviceId, name: "Example computer", connected: false }]
        : [],
    );
    await expect(state.call("directory")).resolves.toMatchObject({ status });
    expect(state.request).not.toHaveBeenCalled();
  });
  it("does not confuse device connectivity with directory authorization", async () => {
    const state = setup();
    state.request.mockImplementation(async function* () {
      yield { state: "unauthorized" };
    });
    await expect(state.call("directory")).resolves.toMatchObject({ status: "unauthorized" });
    state.request.mockImplementation(async function* () {
      yield { state: "unavailable" };
    });
    await expect(state.call("directory")).resolves.toMatchObject({ status: "unavailable" });
  });
  it("reports an unsupported, invalid or disconnected status as unavailable", async () => {
    const state = setup();
    state.request.mockImplementation(async function* () {
      yield await Promise.reject(new Error("disconnected"));
    });
    await expect(state.call("directory")).resolves.toMatchObject({ status: "unavailable" });
    state.request.mockImplementation(async function* () {
      yield { state: "forged" };
    });
    await expect(state.call("directory")).resolves.toMatchObject({ status: "unavailable" });
  });
  it("rejects inaccessible projects before enumerating devices", async () => {
    const state = setup();
    db.project.mockResolvedValue(null);
    await expect(state.call("directory")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.binding).not.toHaveBeenCalled();
    expect(state.list).not.toHaveBeenCalled();
  });
  it("returns an unbound state without consulting a device", async () => {
    const state = setup();
    db.binding.mockResolvedValue(null);
    await expect(state.call("directory")).resolves.toEqual({
      binding: null,
      deviceName: null,
      status: "unknown",
    });
    expect(state.request).not.toHaveBeenCalled();
  });
  it("removes the server binding before revoking the local grant", async () => {
    const state = setup();
    state.request.mockImplementation(async function* () {
      expect(db.remove).toHaveBeenCalledWith(state.deps.prisma, actor, input.projectId, grantId);
      yield { state: "unauthorized" };
    });
    await expect(state.call("unbindDirectory", { grantId })).resolves.toEqual({
      removed: true,
      localRevocation: "confirmed",
    });
  });
  it("reports pending local revocation if the device cannot be reached", async () => {
    const state = setup();
    state.request.mockImplementation(async function* () {
      yield await Promise.reject(new Error("offline"));
    });
    await expect(state.call("unbindDirectory", { grantId })).resolves.toEqual({
      removed: true,
      localRevocation: "pending",
    });
    expect(db.remove).toHaveBeenCalledOnce();
    expect(db.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "project.directory.unbound",
        metadata: expect.objectContaining({ localRevocation: "pending" }),
      }),
    );
  });
  it("does not remove or revoke a replacement binding", async () => {
    const state = setup();
    await expect(
      state.call("unbindDirectory", { grantId: "93e04d44-d22e-4665-9e15-78b7bf78113b" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.remove).not.toHaveBeenCalled();
    expect(state.request).not.toHaveBeenCalled();
  });
});

it("keeps cloud directory access closed when only project chat is enabled", async () => {
  const identifyProjectFolder = vi.fn();
  const handler = (callback: unknown) => callback;
  const routes = projectCloudDirectoryRoutes({
    deps: {
      env: { projectWorkspaceCreateExperiment: true, projectConversationCreateExperiment: true },
      sandbox: { identifyProjectFolder, executeProjectFile: vi.fn() },
    },
    authed: {
      projectWorkspaces: {
        cloudDirectory: { handler },
        bindCloudDirectory: { handler },
        unbindCloudDirectory: { handler },
      },
    },
  } as unknown as RouterContext);
  const request = { context: { actor }, input: { id: input.projectId } };
  const cloudDirectory = routes.cloudDirectory as unknown as (args: unknown) => Promise<unknown>;
  const bind = routes.bindCloudDirectory as unknown as (args: unknown) => Promise<unknown>;

  await expect(cloudDirectory(request)).resolves.toMatchObject({ available: false, binding: null });
  await expect(bind(request)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  expect(db.project).not.toHaveBeenCalled();
  expect(identifyProjectFolder).not.toHaveBeenCalled();
});
