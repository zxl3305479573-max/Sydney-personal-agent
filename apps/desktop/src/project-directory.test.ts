import path from "node:path";
import type { ProjectDirectoryIntent, ProjectFileRequest, ProjectFileResult } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createProjectDirectoryAccess } from "./project-directory.js";

const grantId = "746acaf1-0a4f-477d-822d-7357e7e8fe72";
const input = { spaceId: "space-a", projectId: "project-a" };
const remote = { ...input, userId: "user-a", deviceId: "device-a", projectName: "Example project" };
const directory = path.resolve("synthetic-project");
const binding = {
  deviceId: "device-a",
  grantId,
  directoryName: "synthetic-project",
  intent: "read-only",
};

function setup(confirmedIntent?: ProjectDirectoryIntent | null) {
  let identity: {
    origin: string;
    device: { token: string; userId: string; deviceId: string };
  } | null = {
    origin: "https://server.example",
    device: { token: "native-only-token", userId: "user-a", deviceId: "device-a" },
  };
  let trusted = true;
  const intent = confirmedIntent ?? "read-only";
  const store = {
    save: vi.fn(async () => ({ id: grantId, intent })),
    load: vi.fn(async () => ({ id: grantId, directory, intent }) as { id: string; directory: string; intent: ProjectDirectoryIntent } | null),
    revoke: vi.fn(async () => {}),
  };
  const fetch = vi.fn(async (url: string, _init: RequestInit) =>
    Response.json(url.endsWith("/scope") ? remote : { ...binding, intent }),
  );
  const choose = vi.fn(async () => directory as string | null);
  const inspect = vi.fn(async (value: string) => value);
  const files = {
    capture: vi.fn(async () => ({ directory, dev: 1n, ino: 2n })),
    execute: vi.fn<(...args: Parameters<NonNullable<Parameters<typeof createProjectDirectoryAccess>[0]["files"]>["execute"]>) => Promise<ProjectFileResult>>(async (..._args) =>
      ({ operation: "create" as const, bytes: 3 })),
    confirm: vi.fn(async () => confirmedIntent ?? null),
  };
  const access = createProjectDirectoryAccess({
    userDataDir: "unused",
    current: () => identity,
    fetch,
    choose,
    store,
    inspect,
    files: confirmedIntent !== undefined ? files : undefined,
  });
  return {
    access,
    fetch,
    choose,
    store,
    inspect,
    files,
    trusted: () => trusted,
    changeFrame: () => {
      trusted = false;
    },
    changeIdentity: () => {
      identity = identity
        ? { ...identity, device: { ...identity.device, userId: "user-b" } }
        : null;
    },
    clearIdentity: () => {
      identity = null;
    },
  };
}

describe("native project directory selection", () => {
  it("verifies native identity, binds an opaque grant, and never sends a full path", async () => {
    const state = setup();
    await expect(state.access.choose(input, state.trusted)).resolves.toEqual(binding);
    expect(state.choose).toHaveBeenCalledWith(remote);
    expect(state.store.save).toHaveBeenCalledWith(
      {
        origin: "https://server.example",
        userId: "user-a",
        deviceId: "device-a",
        spaceId: "space-a",
        projectWorkspaceId: "project-a",
      },
      directory,
      "read-only",
    );
    const bodies = state.fetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies).toEqual([
      input,
      input,
      { ...input, grantId, directoryName: "synthetic-project", intent: "read-only" },
    ]);
    expect(JSON.stringify(bodies)).not.toContain(directory);
    expect(
      state.fetch.mock.calls.every(
        ([, init]) => init.credentials === "include" && init.redirect === "error",
      ),
    ).toBe(true);
    expect(state.store.revoke).not.toHaveBeenCalled();
  });

  it.each(["userId", "origin", "directory", "deviceId", "intent"])(
    "rejects a renderer-supplied %s",
    async (field) => {
      const state = setup();
      await expect(
        state.access.choose({ ...input, [field]: "forged" }, state.trusted),
      ).rejects.toThrow();
      expect(state.fetch).not.toHaveBeenCalled();
      expect(state.choose).not.toHaveBeenCalled();
    },
  );

  it("cancellation creates no grant or binding", async () => {
    const state = setup();
    state.choose.mockResolvedValue(null);
    await expect(state.access.choose(input, state.trusted)).resolves.toBeNull();
    expect(state.store.save).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["frame", "identity"])("drops a selection after the %s changes", async (kind) => {
    const state = setup();
    state.choose.mockImplementation(async () => {
      (kind === "frame" ? state.changeFrame : state.changeIdentity)();
      return directory;
    });
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow();
    expect(state.store.save).not.toHaveBeenCalled();
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });

  it("checks the server-reported account before opening the native chooser", async () => {
    const state = setup();
    state.fetch.mockResolvedValue(Response.json({ ...remote, userId: "user-b" }));
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow(
      "authorization changed",
    );
    expect(state.choose).not.toHaveBeenCalled();
  });

  it("refuses unpaired and untrusted windows", async () => {
    const state = setup();
    state.clearIdentity();
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("revokes the local grant when the server binding conflicts", async () => {
    const state = setup();
    state.fetch.mockImplementation(async (url) =>
      url.endsWith("/scope") ? Response.json(remote) : new Response(null, { status: 409 }),
    );
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow("already bound");
    expect(state.store.revoke).toHaveBeenCalledWith(
      expect.objectContaining({ projectWorkspaceId: "project-a" }),
      grantId,
    );
  });

  it("serializes native choosers without silently dropping the second request", async () => {
    const state = setup();
    let finish!: (directory: string) => void;
    state.choose.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = state.access.choose(input, state.trusted);
    await vi.waitFor(() => expect(state.choose).toHaveBeenCalledOnce());
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow("already open");
    finish(directory);
    await expect(first).resolves.toEqual(binding);
  });

  it("cleans up when the sign-in changes during the bind response", async () => {
    const state = setup();
    state.fetch.mockImplementation(async (url) => {
      if (url.endsWith("/scope")) return Response.json(remote);
      state.changeIdentity();
      return Response.json(binding);
    });
    await expect(state.access.choose(input, state.trusted)).rejects.toThrow();
    expect(state.store.revoke).toHaveBeenCalledOnce();
  });
});

describe("limited directory device requests", () => {
  const device = { token: "native-only-token", userId: "user-a", deviceId: "device-a" };
  const request = {
    method: "workspaceGrant" as const,
    operation: "status" as const,
    ...input,
    grantId,
  };
  it("returns only grant status in the fixed device scope", async () => {
    const state = setup();
    await expect(state.access.request("https://server.example", device, request)).resolves.toEqual({
      state: "authorized",
    });
    expect(state.fetch).not.toHaveBeenCalled();
    expect(state.choose).not.toHaveBeenCalled();
    expect(state.store.load).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: device.userId,
        deviceId: device.deviceId,
        projectWorkspaceId: input.projectId,
      }),
      grantId,
    );
  });
  it("reports a missing or process-expired grant as unauthorized", async () => {
    const state = setup();
    state.store.load.mockResolvedValue(null);
    await expect(state.access.request("https://server.example", device, request)).resolves.toEqual({
      state: "unauthorized",
    });
  });
  it.each(["missing", "replaced"])("reports a %s directory as unavailable", async (kind) => {
    const state = setup();
    if (kind === "missing") state.inspect.mockRejectedValue(new Error("private path"));
    else state.inspect.mockResolvedValue(path.resolve("replaced-project"));
    await expect(state.access.request("https://server.example", device, request)).resolves.toEqual({
      state: "unavailable",
    });
  });
  it("revokes only the named grant without reading the directory", async () => {
    const state = setup();
    await expect(
      state.access.request("https://server.example", device, { ...request, operation: "revoke" }),
    ).resolves.toEqual({ state: "unauthorized" });
    expect(state.store.load).not.toHaveBeenCalled();
    expect(state.inspect).not.toHaveBeenCalled();
    expect(state.store.revoke).toHaveBeenCalledOnce();
  });
});

describe("project file device execution", () => {
  const origin = "https://server.example";
  const device = { token: "native-only-token", userId: "user-a", deviceId: "device-a" };
  const request: ProjectFileRequest = {
    ...input, method: "projectFile", grantId,
    file: { operation: "create", path: "result.md", text: "new" },
  };
  const signal = new AbortController().signal;

  it("requires a fresh native choice for creating files", async () => {
    const state = setup("read-only");
    await state.access.choose(input, state.trusted);
    await expect(state.access.execute(origin, device, request, signal)).rejects.toThrow("not authorized");
    expect(state.files.execute).not.toHaveBeenCalled();
  });

  it("does not save anything if the native confirmation is dismissed", async () => {
    const state = setup(null);
    await expect(state.access.choose(input, state.trusted)).resolves.toBeNull();
    expect(state.store.save).not.toHaveBeenCalled();
  });

  it("creates only under the matching confirmed grant and passes a revocable signal", async () => {
    const state = setup("read-write");
    await expect(state.access.choose(input, state.trusted)).resolves.toMatchObject({ intent: "read-write" });
    await expect(state.access.execute(origin, device, { ...request, projectId: "other" }, signal)).rejects.toThrow();
    state.files.execute.mockImplementationOnce(async (_root, _operation, operationSignal) =>
      new Promise((_, reject) => operationSignal.addEventListener("abort", () => reject(operationSignal.reason), { once: true })),
    );
    const pending = state.access.execute(origin, device, request, signal);
    const rejected = expect(pending).rejects.toThrow("revoked");
    await vi.waitFor(() => expect(state.files.execute).toHaveBeenCalledOnce());
    const { method: _method, file: _file, ...scope } = request;
    await state.access.request(origin, device, { ...scope, method: "workspaceGrant", operation: "revoke" });
    await rejected;
    await expect(state.access.execute(origin, device, request, signal)).rejects.toThrow();
    expect(state.files.execute).toHaveBeenCalledWith({ directory, dev: 1n, ino: 2n }, request.file, expect.any(AbortSignal));
  });

  it("requires read-write approval before updating an existing project file", async () => {
    const state = setup("read-only");
    await state.access.choose(input, state.trusted);
    const update: ProjectFileRequest = {
      ...input,
      method: "projectFile",
      grantId,
      file: {
        operation: "update",
        path: "src/app.ts",
        expectedSha256: "a".repeat(64),
        text: "replacement",
      },
    };
    await expect(state.access.execute(origin, device, update, signal)).rejects.toThrow("not authorized");
    expect(state.files.execute).not.toHaveBeenCalled();
  });

  it("allows a read-only grant to list names without opening file contents", async () => {
    const state = setup("read-only");
    await state.access.choose(input, state.trusted);
    state.files.execute.mockResolvedValue({
      operation: "list",
      entries: [{ path: "src/index.ts", kind: "file" }],
      truncated: false,
    });
    const { method: _method, file: _file, ...scope } = request;
    await expect(state.access.execute(origin, device, {
      ...scope,
      method: "projectFile",
      file: { operation: "list", path: "src" },
    }, signal)).resolves.toMatchObject({ operation: "list", entries: [{ path: "src/index.ts" }] });
    expect(state.files.execute).toHaveBeenCalledWith(
      { directory, dev: 1n, ino: 2n },
      { operation: "list", path: "src" },
      expect.any(AbortSignal),
    );
  });
});
