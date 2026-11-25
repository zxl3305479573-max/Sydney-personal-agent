import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { getRequestListener } from "@hono/node-server";
import { startUserDeviceClient } from "@rakazo/adapters/user-device-client";
import type { createApp } from "@rakazo/api/app";
import type {
  ProductEvent,
  RpcInput,
  RpcOutput,
  RpcPath,
  UserDevicePairResponse,
} from "@rakazo/contracts";
import { PROJECT_DIRECTORY_PATH, USER_DEVICE_PAIR_PATH } from "@rakazo/contracts";
import { resolveEncryptionKey } from "@rakazo/core";
import { asSystem, describeRowSecurity } from "@rakazo/db";
import { expect, it, vi } from "vitest";
import { assertIsolatedDatabaseUrls } from "./cli/postgres.js";
import { sessionCookieHeader } from "./index.js";
import { startModelEmulator } from "./model-emulator.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const verifyDatabase = process.env.VERIFY_DATABASE === "1";
if (verifyDatabase && (!databaseUrl || !migrationUrl)) {
  throw new Error("VERIFY_DATABASE requires DATABASE_URL and DATABASE_MIGRATION_URL");
}
const enabled = verifyDatabase && databaseUrl && migrationUrl;
if (enabled) assertIsolatedDatabaseUrls(databaseUrl, migrationUrl);

const mobileHeaders = { origin: "rakazo://", "content-type": "application/json" };
type ProjectApi = Awaited<ReturnType<typeof createApp>>["app"];

async function signUp(app: ProjectApi, name: string) {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: mobileHeaders,
    body: JSON.stringify({
      email: `project-chat-${randomUUID()}@rakazo.test`,
      password: "password12",
      name,
    }),
  });
  expect(response.status).toBe(200);
  const cookie = sessionCookieHeader(response);
  const { token } = (await response.json()) as { token: string };
  expect(token).toBeTruthy();
  return { token, cookie };
}

function projectRpc(app: ProjectApi, token: string) {
  const raw = (procedure: RpcPath, input: unknown, sessionToken = token) =>
    app.request(`/rpc/${procedure}`, {
      method: "POST",
      headers: { ...mobileHeaders, authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ json: input }),
    });
  const rpc = async <Procedure extends RpcPath>(
    procedure: Procedure,
    input: RpcInput<Procedure>,
  ): Promise<RpcOutput<Procedure>> => {
    const response = await raw(procedure, input);
    expect(response.status, procedure).toBe(200);
    return ((await response.json()) as { json: RpcOutput<Procedure> }).json;
  };
  return { raw, rpc };
}

it.skipIf(!enabled)(
  "recovers mobile project text in a separate worker and saves it only in the selected project",
  async () => {
    const prompt = "Reply to the project A fixture.";
    const reply = "Project A confirmed.";
    const dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-project-chat-"));
    const model = await startModelEmulator({
      steps: [
        {
          expect(request) {
            const last = request.messages.at(-1);
            expect(last?.role).toBe("user");
            expect(JSON.stringify(last?.content)).toContain(prompt);
          },
          response: { type: "text", text: reply },
        },
      ],
    });
    let handles: Awaited<ReturnType<typeof createApp>> | undefined;
    let stopWorker: (() => Promise<void>) | undefined;
    let subscriptionDeadline: ReturnType<typeof setTimeout> | undefined;
    const subscription = new AbortController();
    try {
      const { createApp } = await import("@rakazo/api/app");
      const origin = "http://127.0.0.1:5173";
      const backend = await createApp({
        databaseUrl: databaseUrl!,
        realtimeDatabaseUrl: databaseUrl!,
        authUrl: origin,
        webOrigin: origin,
        dataDir,
        sandboxProvider: "fake",
        agentRuntime: "pi",
        wakeupDriver: "graphile",
        signupsEnabled: "true",
        mcpAllowPrivateEndpoint: true,
        projectWorkspaceCreateExperiment: true,
        projectConversationCreateExperiment: true,
        projectDeviceToolsEnabled: false,
      });
      handles = backend;
      await expect(describeRowSecurity(backend.prisma)).resolves.toMatchObject({ enforced: true });

      const { token } = await signUp(backend.app, "Project chat fixture");
      const { token: otherToken } = await signUp(backend.app, "Project outsider fixture");
      const { raw, rpc } = projectRpc(backend.app, token);

      await rpc("models/connect", {
        provider: model.model.provider,
        modelId: model.model.id,
        baseUrl: model.baseUrl,
        makeDefault: true,
      });
      const createProjectBot = async (name: string) => {
        const project = await rpc("projectWorkspaces/create", { id: randomUUID(), name });
        const bot = await rpc("projectWorkspaces/createBot", {
          projectId: project.id,
          bot: { name, notifyOnFinish: false },
        });
        return { projectId: project.id, botId: bot.id };
      };
      const first = await createProjectBot("Project A");
      const second = await createProjectBot("Project B");
      expect((await rpc("projectWorkspaces/list", {})).items.map(({ id }) => id)).toEqual(
        expect.arrayContaining([first.projectId, second.projectId]),
      );
      const projectBotProfile = {
        name: "Project A Bot",
        color: "#4361ee",
        avatarSet: "rakazo",
      } as const;
      const settings = {
        projectId: first.projectId,
        bot: { botId: first.botId, ...projectBotProfile },
      };
      expect(await rpc("projectWorkspaces/updateBot", settings)).toMatchObject(projectBotProfile);
      expect(await rpc("projectWorkspaces/getBot", first)).toMatchObject(projectBotProfile);
      const teammate = await rpc("projectWorkspaces/createBot", {
        projectId: first.projectId,
        bot: { name: "Teammate", notifyOnFinish: false },
      });
      const group = await rpc("projectWorkspaces/createGroup", {
        projectId: first.projectId,
        requestId: randomUUID(),
        group: { name: "Project team", botIds: [first.botId, teammate.id] },
      });
      const roster = await rpc("projectWorkspaces/roster", { id: first.projectId });
      expect(roster.bots).toContainEqual({ id: first.botId, ...projectBotProfile });
      expect(roster.groups).toContainEqual(
        expect.objectContaining({
          id: group.id,
          members: expect.arrayContaining([{ botId: first.botId, ...projectBotProfile }]),
        }),
      );
      expect(
        (await raw("projectWorkspaces/updateBot", { ...settings, projectId: second.projectId }))
          .status,
      ).toBe(404);
      expect((await raw("projectWorkspaces/updateBot", settings, otherToken)).status).toBe(404);
      expect((await raw("bots/get", { botId: first.botId })).status).toBe(404);
      const send = { ...first, text: prompt, clientNonce: randomUUID() };
      expect((await raw("projectWorkspaces/sendText", send)).status).toBe(403);
      const consent = await rpc("projectWorkspaces/consentStatus", first);
      expect(consent.recipients).toEqual([
        expect.objectContaining({ use: "model", allowed: false }),
      ]);
      await rpc("projectWorkspaces/consentAllow", {
        ...first,
        scope: consent.scope,
        version: consent.version,
        keys: consent.recipients.map(({ key }) => key),
      });
      const db = asSystem(backend.prisma);
      const localContinue = vi.spyOn(backend.executor, "continueRun").mockResolvedValue(undefined);
      let sent: RpcOutput<"projectWorkspaces/sendText">;
      try {
        sent = await rpc("projectWorkspaces/sendText", send);
        await expect
          .poll(() => localContinue.mock.calls.some(([runId]) => runId === sent.runId))
          .toBe(true);
        await expect(db.run.findUnique({ where: { id: sent.runId } })).resolves.toMatchObject({
          status: "queued",
          projectWorkspaceId: first.projectId,
          projectDirectoryPin: null,
          wakeAt: expect.any(Date),
        });
        expect(model.requests).toHaveLength(0);
      } finally {
        localContinue.mockRestore();
      }

      const snapshot = await rpc("projectWorkspaces/threadSnapshot", first);
      const live = await backend.app.request("/rpc/projectWorkspaces/subscribe", {
        method: "POST",
        headers: {
          ...mobileHeaders,
          accept: "text/event-stream",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ json: { ...first, cursor: snapshot.cursor } }),
        signal: subscription.signal,
      });
      expect(live.status).toBe(200);
      expect(live.headers.get("content-type")).toContain("text/event-stream");

      const worker = startProjectWorker(databaseUrl!, dataDir);
      stopWorker = worker.stop;
      const workerExit = worker.unexpectedExit();
      await Promise.race([worker.waitForStartup(), workerExit]);
      subscriptionDeadline = setTimeout(() => {
        subscription.abort(new Error("Project subscription did not finish after Worker startup"));
      }, 30_000);
      const events = await Promise.race([readRunEvents(live, sent.runId), workerExit]);
      clearTimeout(subscriptionDeadline);
      expect(events.every((event) => event.threadId === snapshot.threadId)).toBe(true);
      expect(events.at(-1)?.type).toBe("run.completed");
      const streamedReply = events.find(
        (event) => event.type === "thread.message.created" && event.payload.role === "bot",
      );
      expect(streamedReply?.payload).toMatchObject({
        messageId: expect.any(String),
        blocks: expect.arrayContaining([{ kind: "text", text: reply }]),
      });

      await expect
        .poll(
          () => {
            worker.assertRunning();
            return db.run.findUnique({ where: { id: sent.runId } });
          },
          { timeout: 25_000 },
        )
        .toMatchObject({ status: "completed", projectWorkspaceId: first.projectId });
      expect(await rpc("projectWorkspaces/sendText", send)).toMatchObject(sent);

      const reopened = await rpc("projectWorkspaces/threadSnapshot", first);
      expect(reopened.messages.at(-1)?.id).toBe(streamedReply?.payload.messageId);
      expect(reopened.messages.map(({ role, blocks }) => ({ role, blocks }))).toEqual([
        { role: "user", blocks: [{ kind: "text", text: prompt }] },
        { role: "bot", blocks: [{ kind: "text", text: reply }] },
      ]);
      expect((await rpc("projectWorkspaces/threadSnapshot", second)).messages).toEqual([]);
      expect(
        (
          await raw("projectWorkspaces/threadSnapshot", {
            projectId: second.projectId,
            botId: first.botId,
          })
        ).status,
      ).toBe(404);
      expect((await raw("projectWorkspaces/threadSnapshot", first, otherToken)).status).toBe(404);
      expect((await raw("threads/get", { botId: first.botId })).status).toBe(404);
      model.assertComplete();
    } finally {
      clearTimeout(subscriptionDeadline);
      subscription.abort();
      try {
        await stopWorker?.();
      } finally {
        try {
          await handles?.stop();
        } finally {
          await model.close();
          await rm(dataDir, { recursive: true, force: true });
        }
      }
    }
  },
  100_000,
);

it.skipIf(!enabled)(
  "resumes an approved project file on its original Windows device after a worker restart",
  async () => {
    const tool = "project_read_file";
    const findToolCallId = "discover-project-read";
    const toolCallId = "read-approved-file";
    const args = { path: "sample.txt" };
    const text = "Approved project file fixture.";
    const reply = "Finished the project read.";
    const dataDir = await mkdtemp(path.join(tmpdir(), "rakazo-project-device-"));
    const model = await startModelEmulator({
      steps: [
        {
          expect(request) {
            expect(request.tools).toContainEqual(
              expect.objectContaining({
                function: expect.objectContaining({
                  name: "find_tool",
                  description: expect.stringContaining(tool),
                }),
              }),
            );
          },
          response: {
            type: "tool",
            id: findToolCallId,
            name: "find_tool",
            arguments: { names: [tool] },
          },
        },
        {
          expect(request) {
            const result = request.messages.findLast((message) => message.role === "tool");
            expect(result?.tool_call_id).toBe(findToolCallId);
            expect(JSON.parse(String(result?.content))).toMatchObject({
              tools: [expect.objectContaining({ name: tool })],
            });
          },
          response: {
            type: "tool",
            id: toolCallId,
            name: "use_tool",
            arguments: { name: tool, arguments: args },
          },
        },
        {
          expect(request) {
            const result = request.messages.findLast((message) => message.role === "tool");
            expect(result?.tool_call_id).toBe(toolCallId);
            expect(JSON.parse(String(result?.content))).toMatchObject({ read: true, text });
          },
          response: { type: "text", text: reply },
        },
      ],
    });
    const server = createServer();
    let handles: Awaited<ReturnType<typeof createApp>> | undefined;
    let worker: ReturnType<typeof startProjectWorker> | undefined;
    let device: ReturnType<typeof startUserDeviceClient> | undefined;
    try {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No project fixture listener");
      const origin = `http://127.0.0.1:${address.port}`;
      const { createApp } = await import("@rakazo/api/app");
      const backend = await createApp({
        databaseUrl: databaseUrl!,
        realtimeDatabaseUrl: databaseUrl!,
        apiHost: "127.0.0.1",
        port: address.port,
        authUrl: origin,
        webOrigin: origin,
        dataDir,
        sandboxProvider: "fake",
        agentRuntime: "pi",
        wakeupDriver: "graphile",
        signupsEnabled: "true",
        mcpAllowPrivateEndpoint: true,
        userDevicesEnabled: true,
        projectWorkspaceCreateExperiment: true,
        projectConversationCreateExperiment: true,
        projectDeviceToolsEnabled: true,
      });
      handles = backend;
      vi.spyOn(backend.executor, "continueRun").mockResolvedValue(undefined);
      server.on("request", getRequestListener(backend.app.fetch, { hostname: "127.0.0.1" }));
      expect(backend.handleUpgrade).toBeDefined();
      server.on("upgrade", backend.handleUpgrade!);
      await expect(describeRowSecurity(backend.prisma)).resolves.toMatchObject({ enforced: true });
      const db = asSystem(backend.prisma);
      const { token, cookie } = await signUp(backend.app, "Project device fixture");
      const { rpc } = projectRpc(backend.app, token);
      const paired = await backend.app.request(USER_DEVICE_PAIR_PATH, {
        method: "POST",
        headers: { ...mobileHeaders, authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Project Windows fixture", platform: "win32" }),
      });
      expect(paired.status).toBe(201);
      const pairing = (await paired.json()) as UserDevicePairResponse;
      await rpc("models/connect", {
        provider: model.model.provider,
        modelId: model.model.id,
        baseUrl: model.baseUrl,
        makeDefault: true,
      });
      const project = await rpc("projectWorkspaces/create", {
        id: randomUUID(),
        name: "Offline project file fixture",
      });
      const bot = await rpc("projectWorkspaces/createBot", {
        projectId: project.id,
        bot: { name: "Project reader", notifyOnFinish: false },
      });
      const target = { projectId: project.id, botId: bot.id };
      const { spaceId } = await db.bot.findUniqueOrThrow({ where: { id: bot.id } });
      const grantId = randomUUID();
      const directoryPin = {
        kind: "windows",
        targetId: pairing.deviceId,
        grantId,
        intent: "read-only",
      };
      const bound = await backend.app.request(`${PROJECT_DIRECTORY_PATH}/bind`, {
        method: "POST",
        headers: { ...mobileHeaders, cookie, authorization: `Bearer ${pairing.token}` },
        body: JSON.stringify({
          projectId: project.id,
          spaceId,
          grantId,
          directoryName: "Offline project folder",
          intent: "read-only",
        }),
      });
      expect(bound.status).toBe(200);
      const teammate = await rpc("projectWorkspaces/createBot", {
        projectId: project.id,
        bot: { name: "Project teammate", notifyOnFinish: false },
      });
      const group = await rpc("projectWorkspaces/createGroup", {
        projectId: project.id,
        requestId: randomUUID(),
        group: { name: "Project team", botIds: [bot.id, teammate.id] },
      });
      const groupTarget = { projectId: project.id, groupId: group.id };
      const groupConsent = await rpc("projectWorkspaces/consentStatus", groupTarget);
      await rpc("projectWorkspaces/consentAllow", {
        ...groupTarget,
        scope: groupConsent.scope,
        version: groupConsent.version,
        keys: groupConsent.recipients.map(({ key }) => key),
      });
      const groupSent = await rpc("projectWorkspaces/sendText", {
        ...groupTarget,
        text: "@everyone Share this project task with the team.",
        clientNonce: randomUUID(),
      });
      const groupRuns = await db.run.findMany({
        where: { id: { in: groupSent.runIds ?? [groupSent.runId] } },
        select: { id: true, botId: true, projectDirectoryPin: true },
      });
      expect(groupRuns).toHaveLength(2);
      expect(groupRuns).toEqual(
        expect.arrayContaining(
          [bot.id, teammate.id].map((botId) =>
            expect.objectContaining({ botId, projectDirectoryPin: directoryPin }),
          ),
        ),
      );
      for (const { id: runId } of groupRuns)
        await rpc("projectWorkspaces/cancelRun", { ...groupTarget, runId });
      const consent = await rpc("projectWorkspaces/consentStatus", target);
      await rpc("projectWorkspaces/consentAllow", {
        ...target,
        scope: consent.scope,
        version: consent.version,
        keys: consent.recipients.map(({ key }) => key),
      });
      worker = startProjectWorker(databaseUrl!, dataDir, { projectDeviceToolsEnabled: true });
      await worker.waitForStartup();
      const { runId } = await rpc("projectWorkspaces/sendText", {
        ...target,
        text: "Read sample.txt in this project.",
        clientNonce: randomUUID(),
      });
      const run = async () => {
        worker?.assertRunning();
        const row = await db.run.findUniqueOrThrow({ where: { id: runId } });
        if (row.status === "failed") model.assertComplete();
        return row;
      };
      const poll = { timeout: 20_000, interval: 100 };
      await expect.poll(run, poll).toMatchObject({ status: "waiting_input" });
      const effect = await db.externalEffect.findFirstOrThrow({ where: { runId, kind: tool } });
      const approval = await db.message.findFirstOrThrow({
        where: { runId, role: "bot" },
        orderBy: { seq: "desc" },
      });
      const projectDirectory = { deviceId: pairing.deviceId, grantId };
      expect(effect).toMatchObject({ status: "intended", request: { ...args, projectDirectory } });
      expect(approval.blocks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "ask", approvalEffectId: effect.id }),
        ]),
      );
      const beforeApproval = await rpc("projectWorkspaces/threadSnapshot", target);
      await rpc("projectWorkspaces/answerApproval", {
        ...target,
        runId,
        messageId: approval.id,
        effectId: effect.id,
        decision: "allow",
      });
      await expect
        .poll(() => db.externalEffect.findUniqueOrThrow({ where: { id: effect.id } }), poll)
        .toMatchObject({ status: "approved", result: { waitingForDevice: true } });
      const queued = await run();
      expect(queued).toMatchObject({
        status: "queued",
        projectWorkspaceId: project.id,
        projectDirectoryPin: directoryPin,
        leaseOwner: null,
        wakeAt: expect.any(Date),
      });
      const wakeAt = queued.wakeAt!.getTime();
      expect(wakeAt).toBeGreaterThan(Date.now());
      expect(model.requests).toHaveLength(2);
      const queuedEvent = await db.event.findFirstOrThrow({ where: { runId, type: "run.queued" } });
      expect(queuedEvent.payload).toMatchObject({ reason: "project_device_offline" });

      await worker.stop();
      worker = undefined;
      const projectFile = vi.fn(async () => {
        expect(Date.now()).toBeGreaterThanOrEqual(wakeAt);
        return { operation: "read" as const, text };
      });
      device = startUserDeviceClient({
        serverUrl: origin,
        token: pairing.token,
        root: dataDir,
        onRevoked: () => undefined,
        authorize: async () => true,
        projectFile,
      });
      await expect
        .poll(
          () => db.userDeviceConnection.findUnique({ where: { deviceId: pairing.deviceId } }),
          poll,
        )
        .not.toBeNull();
      worker = startProjectWorker(databaseUrl!, dataDir, { projectDeviceToolsEnabled: true });
      await worker.waitForStartup();
      await expect
        .poll(run, { ...poll, timeout: Math.max(0, wakeAt - Date.now()) + poll.timeout })
        .toMatchObject({
          status: "completed",
          projectWorkspaceId: project.id,
        });
      expect((await run()).leaseFence).toBeGreaterThan(queued.leaseFence);
      expect(projectFile).toHaveBeenCalledExactlyOnceWith(
        {
          method: "projectFile",
          projectId: project.id,
          spaceId,
          grantId,
          file: { ...args, operation: "read" },
        },
        expect.any(AbortSignal),
      );
      expect(await db.externalEffect.findMany({ where: { runId, kind: tool } })).toEqual([
        expect.objectContaining({
          id: effect.id,
          status: "completed",
          request: { ...args, projectDirectory },
          result: { read: true, bytes: Buffer.byteLength(text), sha256: expect.any(String) },
        }),
      ]);
      const snapshot = await rpc("projectWorkspaces/threadSnapshot", target);
      expect(snapshot.messages.at(-1)?.blocks).toContainEqual({ kind: "text", text: reply });
      const updates = await backend.app.request("/rpc/projectWorkspaces/subscribe", {
        method: "POST",
        headers: {
          ...mobileHeaders,
          accept: "text/event-stream",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ json: { ...target, cursor: beforeApproval.cursor } }),
        signal: AbortSignal.timeout(10_000),
      });
      expect(updates.status).toBe(200);
      const recovered = await readRunEvents(updates, runId);
      expect(recovered.filter(({ type }) => type === "run.queued")).toEqual([
        expect.objectContaining({ seq: queuedEvent.seq }),
      ]);
      expect(
        recovered.every(
          ({ seq }, index) => seq > (recovered[index - 1]?.seq ?? beforeApproval.cursor),
        ),
      ).toBe(true);
      expect(recovered.at(-1)?.type).toBe("run.completed");
      expect(
        recovered.find(
          ({ type, payload }) =>
            type === "thread.message.created" && payload.messageId === snapshot.messages.at(-1)?.id,
        ),
      ).toBeDefined();
      model.assertComplete();
    } finally {
      device?.close();
      try {
        await worker?.stop();
      } finally {
        try {
          await handles?.stop();
        } finally {
          if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
          await model.close();
          await rm(dataDir, { recursive: true, force: true });
        }
      }
    }
  },
  120_000,
);

async function readRunEvents(response: Response, runId: string) {
  expect(response.body).not.toBeNull();
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const events: ProductEvent[] = [];
  let partial = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("Project subscription closed before the run finished");
      const frames = (partial + value).split("\n\n");
      partial = frames.pop() ?? "";
      for (const frame of frames) {
        if (frame.startsWith("event: error"))
          throw new Error("Project subscription returned an error");
        const payload = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");
        if (!payload || payload === "[DONE]") continue;
        const { json: event } = JSON.parse(payload) as { json?: ProductEvent };
        if (event?.runId !== runId) continue;
        events.push(event);
        if (event.type === "run.completed" || event.type === "run.failed") return events;
      }
    }
  } finally {
    await reader.cancel();
  }
}

function startProjectWorker(
  databaseUrl: string,
  dataDir: string,
  { projectDeviceToolsEnabled = false } = {},
) {
  const healthPath = path.join(dataDir, `worker-health-${randomUUID()}.json`);
  const child = spawn(process.execPath, ["--import", "tsx", "apps/worker/src/index.ts"], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "test",
      DATABASE_URL: databaseUrl,
      REALTIME_DATABASE_URL: databaseUrl,
      DATA_DIR: dataDir,
      RAKAZO_WORKER_HEALTH_FILE: healthPath,
      ENCRYPTION_KEY: resolveEncryptionKey(process.env),
      ENCRYPTION_MASTER_KEYS: process.env.ENCRYPTION_MASTER_KEYS,
      CONTENT_ENCRYPTION: process.env.CONTENT_ENCRYPTION,
      AGENT_RUNTIME: "pi",
      SANDBOX_PROVIDER: "fake",
      WAKEUP_DRIVER: "graphile",
      GRAPHILE_WORKER_CONCURRENCY: "1",
      RAKAZO_LIVE_MODEL_CATALOG: "off",
      MCP_ALLOW_PRIVATE_ENDPOINT: "true",
      USER_DEVICES_ENABLED: String(projectDeviceToolsEnabled),
      SYDNEY_PROJECT_DEVICE_TOOLS_ENABLED: String(projectDeviceToolsEnabled),
      LOG_LEVEL: "error",
      LOG_FORMAT: "json",
    },
  });
  let startupError: Error | undefined;
  child.once("error", (error) => {
    startupError = error;
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const assertRunning = () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Project worker exited (${child.exitCode ?? child.signalCode})`);
  };
  return {
    assertRunning,
    async waitForStartup() {
      await expect
        .poll(
          async () => {
            const status = await readFile(healthPath, "utf8").catch(
              (error: NodeJS.ErrnoException) => {
                if (error.code !== "ENOENT") throw error;
                return "";
              },
            );
            return status.includes('"heartbeat":');
          },
          { timeout: 40_000, message: "Project Worker did not publish its startup heartbeat" },
        )
        .toBe(true);
    },
    async unexpectedExit(): Promise<never> {
      await closed;
      assertRunning();
      throw new Error("Project worker closed before the run finished");
    },
    async stop() {
      child.kill("SIGTERM");
      const kill = setTimeout(() => child.kill("SIGKILL"), 3_000);
      try {
        await closed;
      } finally {
        clearTimeout(kill);
      }
    },
  };
}
