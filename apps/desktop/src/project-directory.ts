import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { WindowsProjectRoot } from "@rakazo/adapters/windows-project-files";
import type {
  ProjectDirectoryInput,
  ProjectDirectoryIntent,
  ProjectDirectoryScope,
  ProjectFileOperation,
  ProjectFileRequest,
  ProjectFileResult,
  ProjectWindowsCommandRequest,
  ProjectWindowsCommandResult,
  ProjectWindowsCommandStatusRequest,
  WorkspaceGrantRequest,
  WorkspaceGrantResult,
} from "@rakazo/contracts";
import {
  ProjectDirectoryInput as DirectoryInput,
  PROJECT_DIRECTORY_PATH,
  ProjectDirectoryBindingSchema,
  ProjectDirectoryGrantSchema,
  ProjectDirectoryIntentSchema,
  ProjectDirectoryScopeSchema,
  ProjectFileRequestSchema,
  ProjectWindowsCommandRequestSchema,
  ProjectWindowsCommandResultSchema,
  ProjectWindowsCommandStatusRequestSchema,
  WorkspaceGrantRequestSchema,
} from "@rakazo/contracts";
import type { PairedDevice } from "./user-device.js";
import type { WorkspaceGrantScope, WorkspaceGrantSummary } from "./workspace-grants.js";
import {
  readWorkspaceGrantAccess,
  revokeWorkspaceGrant,
  saveWorkspaceGrant,
} from "./workspace-grants.js";

type Identity = { origin: string; device: PairedDevice };
type Store = {
  save(
    scope: WorkspaceGrantScope,
    directory: string,
    intent: ProjectDirectoryIntent,
  ): Promise<WorkspaceGrantSummary>;
  load(
    scope: WorkspaceGrantScope,
    id: string,
  ): Promise<(WorkspaceGrantSummary & { directory: string }) | null>;
  revoke(scope: WorkspaceGrantScope, id: string): Promise<void>;
};
type ProjectCommandRunner = {
  available(signal: AbortSignal): Promise<boolean>;
  execute(
    request: ProjectWindowsCommandRequest,
    files: { path: string; content: string }[],
    signal: AbortSignal,
  ): Promise<ProjectWindowsCommandResult>;
};

function localScope(identity: Identity, input: ProjectDirectoryInput): WorkspaceGrantScope {
  if (!identity.device.userId || !identity.device.deviceId)
    throw new Error("Pair this desktop again before selecting a folder");
  return {
    origin: identity.origin,
    userId: identity.device.userId,
    deviceId: identity.device.deviceId,
    spaceId: input.spaceId,
    projectWorkspaceId: input.projectId,
  };
}

export function createProjectDirectoryAccess(deps: {
  userDataDir: string;
  current: () => Identity | null;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  choose: (scope: ProjectDirectoryScope) => Promise<string | null>;
  store?: Store;
  inspect?: (directory: string) => Promise<string>;
  files?: {
    capture(directory: string): Promise<WindowsProjectRoot>;
    execute(
      root: WindowsProjectRoot,
      operation: ProjectFileOperation,
      signal: AbortSignal,
    ): Promise<ProjectFileResult>;
    confirm(
      scope: ProjectDirectoryScope,
      directory: string,
      origin: string,
    ): Promise<ProjectDirectoryIntent | null>;
  };
  projectCommand?: {
    runner: ProjectCommandRunner;
    confirm(
      origin: string,
      request: ProjectWindowsCommandRequest,
      signal: AbortSignal,
    ): Promise<boolean>;
  };
}) {
  const { files } = deps;
  const store: Store = deps.store ?? {
    save: (scope, directory, intent) =>
      saveWorkspaceGrant(deps.userDataDir, scope, directory, intent),
    load: (scope, id) => readWorkspaceGrantAccess(deps.userDataDir, scope, id),
    revoke: (scope, id) => revokeWorkspaceGrant(deps.userDataDir, scope, id),
  };
  const inspect =
    deps.inspect ??
    (async (directory: string) => {
      const canonical = await realpath(directory);
      if (!(await stat(canonical)).isDirectory()) throw new Error("Folder is unavailable");
      return canonical;
    });
  let choosing = false;
  const roots = new Map<string, WindowsProjectRoot>();
  const operations = new Map<string, AbortController>();
  const operationKey = (scope: WorkspaceGrantScope, grantId: string) =>
    JSON.stringify([
      scope.origin,
      scope.deviceId,
      scope.userId,
      scope.spaceId,
      scope.projectWorkspaceId,
      grantId,
    ]);
  async function rootFor(scope: WorkspaceGrantScope, grantId: string, directory: string) {
    const key = operationKey(scope, grantId);
    const existing = roots.get(key);
    if (existing) return existing;
    if (!files || (await inspect(directory)) !== directory)
      throw new Error("The saved project folder is unavailable");
    const captured = await files.capture(directory);
    roots.set(key, captured);
    return captured;
  }

  async function revoke(scope: WorkspaceGrantScope, grantId: string) {
    const key = operationKey(scope, grantId);
    roots.delete(key);
    operations.get(key)?.abort(new Error("Project folder grant was revoked"));
    await store.revoke(scope, grantId);
  }

  async function post(identity: Identity, endpoint: string, input: unknown) {
    const response = await deps.fetch(
      new URL(`${PROJECT_DIRECTORY_PATH}/${endpoint}`, identity.origin).href,
      {
        method: "POST",
        credentials: "include",
        headers: {
          authorization: `Bearer ${identity.device.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        response.status === 409
          ? "A folder is already bound. Refresh and remove that binding first."
          : "Could not verify the project and this desktop's sign-in",
      );
    }
    return response.json();
  }

  return {
    async choose(input: ProjectDirectoryInput, trusted: () => boolean) {
      const parsed = DirectoryInput.parse(input);
      const identity = deps.current();
      if (!identity || !trusted()) throw new Error("Project selection is unavailable");
      if (choosing) throw new Error("A folder selection is already open");
      const scope = localScope(identity, parsed);
      const current = () => {
        const now = deps.current();
        return (
          trusted() &&
          now?.origin === identity.origin &&
          now.device.deviceId === identity.device.deviceId &&
          now.device.userId === identity.device.userId &&
          now.device.token === identity.device.token
        );
      };
      const verify = async () => {
        if (!current()) throw new Error("The desktop sign-in or server changed");
        const remote = ProjectDirectoryScopeSchema.parse(await post(identity, "scope", parsed));
        if (
          !current() ||
          remote.userId !== scope.userId ||
          remote.deviceId !== scope.deviceId ||
          remote.spaceId !== scope.spaceId ||
          remote.projectId !== scope.projectWorkspaceId
        )
          throw new Error("The project authorization changed");
        return remote;
      };
      let grantId: string | undefined;
      choosing = true;
      try {
        const remote = await verify();
        const selected = await deps.choose(remote);
        if (selected === null) return null;
        const canonical = await inspect(selected).catch(() => {
          throw new Error("The selected folder is unavailable");
        });
        const root = await files?.capture(canonical);
        if (!current()) throw new Error("The desktop sign-in or server changed");
        const confirmation = files
          ? await files.confirm(remote, canonical, identity.origin)
          : "read-only";
        if (confirmation === null) return null;
        const intent = ProjectDirectoryIntentSchema.parse(confirmation);
        await verify();
        const directoryName = path.basename(canonical) || "Project folder";
        ProjectDirectoryGrantSchema.omit({ grantId: true }).parse({
          directoryName,
          intent,
        });
        const grant = await store.save(scope, canonical, intent);
        grantId = grant.id;
        if (!current() || grant.intent !== intent)
          throw new Error("The project authorization changed");
        const binding = ProjectDirectoryBindingSchema.parse(
          await post(identity, "bind", {
            ...parsed,
            grantId,
            directoryName,
            intent,
          }),
        );
        if (
          !current() ||
          binding.deviceId !== scope.deviceId ||
          binding.grantId !== grantId ||
          binding.directoryName !== directoryName ||
          binding.intent !== intent
        )
          throw new Error("The project authorization changed");
        if (root) roots.set(operationKey(scope, grantId), root);
        return binding;
      } catch (error) {
        if (grantId) await revoke(scope, grantId);
        throw error;
      } finally {
        choosing = false;
      }
    },
    async request(
      origin: string,
      device: PairedDevice,
      input: WorkspaceGrantRequest,
    ): Promise<WorkspaceGrantResult> {
      const request = WorkspaceGrantRequestSchema.parse(input);
      const scope = localScope({ origin, device }, request);
      if (request.operation === "revoke") {
        await revoke(scope, request.grantId);
        return { state: "unauthorized" };
      }
      try {
        const grant = await store.load(scope, request.grantId);
        if (!grant) return { state: "unauthorized" };
        const root = roots.get(operationKey(scope, request.grantId));
        if (root && files) {
          const present = await files.capture(grant.directory);
          return {
            state:
              present.dev === root.dev && present.ino === root.ino ? "authorized" : "unavailable",
          };
        }
        return {
          state:
            (await inspect(grant.directory)) === grant.directory ? "authorized" : "unavailable",
        };
      } catch {
        return { state: "unavailable" };
      }
    },
    async execute(
      origin: string,
      device: PairedDevice,
      input: ProjectFileRequest,
      signal: AbortSignal,
    ) {
      const request = ProjectFileRequestSchema.parse(input);
      const scope = localScope({ origin, device }, request);
      const key = operationKey(scope, request.grantId);
      if (!files) throw new Error("Project folder authorization is unavailable");
      if (operations.has(key)) throw new Error("Project folder is busy");
      const operation = new AbortController();
      const linked = AbortSignal.any([signal, operation.signal]);
      linked.throwIfAborted();
      operations.set(key, operation);
      try {
        const grant = await store.load(scope, request.grantId);
        linked.throwIfAborted();
        if (!grant) throw new Error("Project folder authorization is unavailable");
        const root = await rootFor(scope, request.grantId, grant.directory);
        if (
          grant.directory !== root.directory ||
          (request.file.operation !== "read" &&
            request.file.operation !== "list" &&
            grant.intent !== "read-write")
        ) {
          throw new Error("The project folder has not authorized this operation");
        }
        const result = await files.execute(root, request.file, linked);
        linked.throwIfAborted();
        return result;
      } finally {
        operations.delete(key);
      }
    },
    async projectCommandStatus(
      origin: string,
      device: PairedDevice,
      input: ProjectWindowsCommandStatusRequest,
      signal: AbortSignal,
    ) {
      const request = ProjectWindowsCommandStatusRequestSchema.parse(input);
      const scope = localScope({ origin, device }, request);
      const key = operationKey(scope, request.grantId);
      if (operations.has(key)) return { available: false };
      if (!deps.projectCommand || !files) return { available: false };
      try {
        const grant = await store.load(scope, request.grantId);
        if (!grant) return { available: false };
        const root = await rootFor(scope, request.grantId, grant.directory);
        const current = await files.capture(grant.directory);
        if (current.dev !== root.dev || current.ino !== root.ino) return { available: false };
        return { available: await deps.projectCommand.runner.available(signal) };
      } catch {
        return { available: false };
      }
    },
    async executeProjectCommand(
      origin: string,
      device: PairedDevice,
      input: ProjectWindowsCommandRequest,
      signal: AbortSignal,
    ) {
      const request = ProjectWindowsCommandRequestSchema.parse(input);
      const scope = localScope({ origin, device }, request);
      const key = operationKey(scope, request.grantId);
      if (!deps.projectCommand || !files)
        throw new Error("Isolated project command is unavailable");
      if (operations.has(key)) throw new Error("Project folder is busy");
      const operation = new AbortController();
      const linked = AbortSignal.any([signal, operation.signal]);
      operations.set(key, operation);
      try {
        const grant = await store.load(scope, request.grantId);
        linked.throwIfAborted();
        if (!grant) throw new Error("The project folder authorization changed");
        const root = await rootFor(scope, request.grantId, grant.directory);
        const current = await files.capture(grant.directory);
        if (
          grant.directory !== root.directory ||
          current.dev !== root.dev ||
          current.ino !== root.ino
        )
          throw new Error("The project folder authorization changed");
        if (!(await deps.projectCommand.runner.available(linked)))
          return { status: "unavailable" as const };
        if (!(await deps.projectCommand.confirm(origin, request, linked)))
          return { status: "declined" as const };
        linked.throwIfAborted();
        const inputs: { path: string; content: string }[] = [];
        for (const filePath of request.command.inputFiles) {
          linked.throwIfAborted();
          const file = await files.execute(root, { operation: "read", path: filePath }, linked);
          if (file.operation !== "read")
            throw new Error("A project command input could not be read");
          inputs.push({ path: filePath, content: file.text });
        }
        const result = ProjectWindowsCommandResultSchema.parse(
          await deps.projectCommand.runner.execute(request, inputs, linked),
        );
        linked.throwIfAborted();
        const after = await files.capture(grant.directory);
        if (after.dev !== root.dev || after.ino !== root.ino)
          throw new Error("The project folder authorization changed");
        return result;
      } finally {
        operations.delete(key);
      }
    },
  };
}
