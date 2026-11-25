import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { describeRowSecurity } from "./database-access.js";
import {
  bindProjectCloudDirectory,
  getProjectCloudDirectory,
  unbindProjectCloudDirectory,
} from "./project-cloud-directory.js";
import {
  bindProjectDirectory,
  getProjectDirectoryBinding,
  getRunningProjectDirectory,
  removeProjectDirectoryBinding,
} from "./project-directory.js";
import { removeEmptyProjectWorkspace } from "./project-workspace-read.js";
import { runAsSystem, runAsTenant } from "./row-security.js";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const enabled = Boolean(
  process.env.VERIFY_DATABASE && runtimeUrl && migrationUrl && runtimeUrl !== migrationUrl,
);
if (process.env.VERIFY_DATABASE && !enabled)
  throw new Error("VERIFY_DATABASE requires distinct runtime and migration database URLs");

(enabled ? describe.sequential : describe.skip)("project directory bindings (PostgreSQL)", () => {
  const suffix = randomUUID();
  const organizationId = `directory-org-${suffix}`;
  const spaceId = `directory-space-${suffix}`;
  const users = ["a", "b"].map((name) => ({
    userId: `directory-${name}-${suffix}`,
    deviceId: `directory-device-${name}-${suffix}`,
    sessionId: `directory-session-${name}-${suffix}`,
  }));
  const first = users[0]!;
  const second = users[1]!;
  const projectId = `directory-project-${suffix}`;
  const alternateProjectId = `directory-other-${suffix}`;
  const grantId = randomUUID();
  const botId = `directory-bot-${suffix}`;
  const cloudBotId = `cloud-directory-bot-${suffix}`;
  const actor = { userId: first.userId, spaceId };
  const binding = {
    deviceId: first.deviceId,
    grantId,
    directoryName: "fixture",
    intent: "read-only" as const,
  };
  let owner: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let seeded = false;

  beforeAll(async () => {
    owner = createDb(migrationUrl!);
    app = createDb(runtimeUrl!, { poolMax: 1 });
    await expect(describeRowSecurity(app.prisma)).resolves.toMatchObject({ enforced: true });
    await runAsSystem("seed synthetic directory authorization fixtures", () =>
      owner.prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: {
            id: organizationId,
            name: "Directory fixture",
            slug: organizationId,
            createdAt: new Date(),
          },
        });
        await tx.space.create({ data: { id: spaceId, organizationId, name: "Directory fixture" } });
        for (const user of users) {
          await tx.user.create({
            data: {
              id: user.userId,
              name: "Directory fixture",
              email: `${user.userId}@invalid.test`,
            },
          });
          await tx.member.create({
            data: {
              id: `member-${user.userId}`,
              userId: user.userId,
              organizationId,
              role: "member",
              createdAt: new Date(),
            },
          });
          await tx.spaceMember.create({
            data: {
              id: `space-member-${user.userId}`,
              userId: user.userId,
              spaceId,
              organizationId,
              role: "member",
              createdAt: new Date(),
            },
          });
          await tx.session.create({
            data: {
              id: user.sessionId,
              userId: user.userId,
              token: randomUUID(),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
          });
          await tx.userDevice.create({
            data: {
              id: user.deviceId,
              userId: user.userId,
              sessionId: user.sessionId,
              name: "Fixture computer",
              platform: "win32",
              tokenHash: randomUUID(),
            },
          });
        }
        for (const id of [projectId, alternateProjectId])
          await tx.$executeRaw`
        INSERT INTO project_workspaces (id, "spaceId", "userId", name, "updatedAt")
        VALUES (${id}, ${spaceId}, ${first.userId}, 'Directory fixture', NOW())`;
        await tx.$executeRaw`
        INSERT INTO project_directory_bindings ("projectId", "spaceId", "userId", "deviceId", "grantId", "directoryName")
        VALUES (${projectId}, ${spaceId}, ${first.userId}, ${first.deviceId}, ${grantId}, 'fixture')`;
      }),
    );
    seeded = true;
  });
  afterAll(async () => {
    try {
      if (seeded)
        await runAsSystem("remove synthetic directory fixtures", () =>
          owner.prisma.$transaction(async (tx) => {
            await tx.bot.deleteMany({ where: { id: { in: [botId, cloudBotId] }, spaceId } });
            await tx.$executeRaw`DELETE FROM project_workspaces WHERE id = ANY(${[projectId, alternateProjectId]}::text[]) AND "spaceId" = ${spaceId}`;
            await tx.organization.deleteMany({ where: { id: organizationId } });
            await tx.user.deleteMany({ where: { id: { in: users.map((user) => user.userId) } } });
          }),
        );
    } finally {
      for (const handle of [owner, app]) {
        if (!handle) continue;
        await handle.prisma.$disconnect();
        await handle.pool.end();
      }
    }
  });

  it("enforces a real runtime row policy for owner, project and homepage scopes", async () => {
    const visible = () =>
      app.prisma.$queryRaw<
        Array<{ projectId: string }>
      >`SELECT "projectId" FROM project_directory_bindings WHERE "projectId" = ${projectId}`;
    await expect(
      runAsTenant({ ...actor, projectWorkspaceId: projectId }, visible),
    ).resolves.toEqual([{ projectId }]);
    for (const scope of [
      actor,
      { ...actor, projectWorkspaceId: alternateProjectId },
      { userId: second.userId, spaceId, projectWorkspaceId: projectId },
    ])
      await expect(runAsTenant(scope, visible)).resolves.toEqual([]);
    const rows = await runAsTenant(
      { ...actor, projectWorkspaceId: projectId },
      () =>
        app.prisma.$queryRaw<
          Array<{ active: boolean }>
        >`SELECT row_security_active('project_directory_bindings'::regclass) AS active`,
    );
    expect(rows).toEqual([{ active: true }]);
  });

  it("returns the binding only for the exact running task and its current fence", async () => {
    const createRun = await projectRunFixture(projectId, botId);
    const run = await createRun();
    const expected = {
      ...actor,
      projectId,
      runId: run.id,
      taskId: run.taskId,
      threadId: run.threadId,
      workerId: "fixture-worker",
      fence: 3,
    };
    const pin = { kind: "windows", targetId: binding.deviceId, grantId, intent: binding.intent };
    expect(run.projectDirectoryPin).toEqual(pin);
    await expect(getRunningProjectDirectory(app.prisma, expected)).resolves.toEqual({
      ...binding,
      deviceName: "Fixture computer",
    });
    for (const changed of [
      { projectId: alternateProjectId },
      { fence: 2 },
      { workerId: "other-worker" },
      { threadId: "other-thread" },
      { taskId: "other-task" },
      { userId: second.userId },
    ]) {
      await expect(
        getRunningProjectDirectory(app.prisma, { ...expected, ...changed }),
      ).resolves.toBeNull();
    }
    const replacement = { ...binding, grantId: randomUUID() };
    await expect(
      runAsSystem("try changing a synthetic run pin", () =>
        owner.prisma.run.update({
          where: { id: run.id },
          data: { projectDirectoryPin: { ...pin, grantId: replacement.grantId } },
        }),
      ),
    ).rejects.toThrow("The project run directory pin cannot be changed");
    await expect(
      removeProjectDirectoryBinding(app.prisma, actor, projectId, grantId),
    ).resolves.toBe(true);
    const unbound = await createRun();
    expect(unbound.projectDirectoryPin).toBeNull();
    await expect(
      bindProjectDirectory(app.prisma, actor, projectId, first.sessionId, replacement),
    ).resolves.toEqual(replacement);
    const next = await createRun("follow_up");
    expect(next.projectDirectoryPin).toEqual({ ...pin, grantId: replacement.grantId });
    await expect(getRunningProjectDirectory(app.prisma, expected)).resolves.toBeNull();
    await expect(
      getRunningProjectDirectory(app.prisma, {
        ...expected,
        runId: unbound.id,
        taskId: unbound.taskId,
      }),
    ).resolves.toBeNull();
    const nextScope = { ...expected, runId: next.id, taskId: next.taskId };
    await expect(getRunningProjectDirectory(app.prisma, nextScope)).resolves.toEqual({
      ...replacement,
      deviceName: "Fixture computer",
    });
    await runAsSystem("cancel synthetic running project file task", () =>
      owner.prisma.run.updateMany({
        where: { id: { in: [run.id, unbound.id, next.id] } },
        data: { status: "cancelled" },
      }),
    );
    await expect(getRunningProjectDirectory(app.prisma, nextScope)).resolves.toBeNull();
    await expect(
      removeProjectDirectoryBinding(app.prisma, actor, projectId, replacement.grantId),
    ).resolves.toBe(true);
    await expect(
      bindProjectDirectory(app.prisma, actor, projectId, first.sessionId, binding),
    ).resolves.toEqual(binding);
  });

  it("pins the cloud computer owner and excludes a simultaneous Windows binding", async () => {
    const computer = await runAsSystem("seed a synthetic native cloud computer", () =>
      owner.prisma.computer.create({
        data: {
          ...actor,
          kind: "native-linux",
          scope: "dedicated",
          scopeKey: `project-cloud-key-${suffix}`,
          homeKey: `project-cloud-home-${suffix}`,
          state: "running",
          providerRef: "native:0123456789abcdef",
        },
      }),
    );
    const input = {
      computerId: computer.id,
      providerRef: computer.providerRef!,
      folder: { path: "sample", device: "1", inode: "2" },
      intent: "read-only" as const,
    };
    let grantId: string | undefined;
    try {
      await expect(bindProjectCloudDirectory(app.prisma, actor, projectId, input)).resolves.toBe(
        false,
      );
      await expect(
        bindProjectCloudDirectory(app.prisma, actor, alternateProjectId, input),
      ).resolves.toBe(true);
      const saved = await getProjectCloudDirectory(app.prisma, actor, alternateProjectId);
      expect(saved).toMatchObject({ ...input, available: true });
      grantId = saved?.grantId;
      expect(grantId).toBeTruthy();
      const createRun = await projectRunFixture(alternateProjectId, cloudBotId);
      const run = await createRun();
      const runScope = {
        id: run.id,
        threadId: run.threadId,
        taskId: run.taskId,
        workerId: "fixture-worker",
        fence: 3,
      };
      expect(run.projectDirectoryPin).toEqual({
        kind: "cloud",
        targetId: computer.id,
        grantId,
        intent: input.intent,
      });
      await expect(
        getProjectCloudDirectory(app.prisma, actor, alternateProjectId, runScope),
      ).resolves.toMatchObject({ grantId, available: true });
      await expect(
        getProjectCloudDirectory(
          app.prisma,
          { spaceId, userId: second.userId },
          alternateProjectId,
        ),
      ).resolves.toBeNull();
      await expect(
        bindProjectDirectory(app.prisma, actor, alternateProjectId, first.sessionId, {
          ...binding,
          grantId: randomUUID(),
        }),
      ).resolves.toBeNull();
      await expect(
        unbindProjectCloudDirectory(app.prisma, actor, alternateProjectId, grantId!),
      ).resolves.toBe(true);
      await expect(
        bindProjectCloudDirectory(app.prisma, actor, alternateProjectId, input),
      ).resolves.toBe(true);
      const replacement = await getProjectCloudDirectory(app.prisma, actor, alternateProjectId);
      expect(replacement?.grantId).not.toBe(grantId);
      grantId = replacement?.grantId;
      await expect(
        getProjectCloudDirectory(app.prisma, actor, alternateProjectId, runScope),
      ).resolves.toBeNull();
      await runAsSystem("replace the synthetic native cloud generation", () =>
        owner.prisma.computer.update({
          where: { id: computer.id },
          data: { providerRef: "native:replacement01234" },
        }),
      );
      await expect(
        getProjectCloudDirectory(app.prisma, actor, alternateProjectId),
      ).resolves.toMatchObject({ available: false });
    } finally {
      if (grantId)
        await unbindProjectCloudDirectory(app.prisma, actor, alternateProjectId, grantId);
    }
  });
  it("binds idempotently and refuses a replacement without explicit unbinding", async () => {
    const next = { ...binding, grantId: randomUUID() };
    await expect(
      bindProjectDirectory(app.prisma, actor, alternateProjectId, first.sessionId, next),
    ).resolves.toEqual(next);
    await expect(
      bindProjectDirectory(app.prisma, actor, alternateProjectId, first.sessionId, next),
    ).resolves.toEqual(next);
    await expect(
      bindProjectDirectory(app.prisma, actor, alternateProjectId, first.sessionId, {
        ...next,
        grantId: randomUUID(),
      }),
    ).resolves.toBeNull();
    await expect(
      bindProjectDirectory(app.prisma, actor, alternateProjectId, second.sessionId, next),
    ).resolves.toBeNull();
  });
  it("rejects another account's device at the database foreign key", async () => {
    await expect(
      runAsSystem(
        "attempt synthetic cross-account binding",
        () => owner.prisma.$executeRaw`
      UPDATE project_directory_bindings SET "deviceId" = ${second.deviceId} WHERE "projectId" = ${projectId}`,
      ),
    ).rejects.toThrow();
    await expect(getProjectDirectoryBinding(app.prisma, actor, projectId)).resolves.toEqual(
      binding,
    );
  });
  it("does not delete a bound project as empty", async () => {
    await expect(
      removeEmptyProjectWorkspace(app.prisma, actor, { id: projectId, confirmRemoveAppData: true }),
    ).resolves.toBe(false);
  });
  it("conditionally unbinds only the expected grant", async () => {
    await expect(
      removeProjectDirectoryBinding(app.prisma, actor, projectId, randomUUID()),
    ).resolves.toBe(false);
    await expect(getProjectDirectoryBinding(app.prisma, actor, projectId)).resolves.toEqual(
      binding,
    );
    await expect(
      removeProjectDirectoryBinding(app.prisma, actor, projectId, grantId),
    ).resolves.toBe(true);
    await expect(getProjectDirectoryBinding(app.prisma, actor, projectId)).resolves.toBeNull();
  });

  async function projectRunFixture(projectWorkspaceId: string, id: string) {
    const scope = { ...actor, projectWorkspaceId };
    const thread = await runAsSystem("seed a synthetic project conversation", () =>
      owner.prisma.$transaction(async (tx) => {
        await tx.bot.create({ data: { ...scope, id, name: "Directory fixture", color: "blue" } });
        return tx.thread.create({ data: { ...scope, botId: id } });
      }),
    );
    const target = { ...scope, botId: id, threadId: thread.id };
    return (trigger = "user") =>
      runAsTenant(scope, () =>
        app.prisma.$transaction(async (tx) => {
          const task = await tx.task.create({
            data: { ...target, prompt: "fixture", status: "running" },
          });
          return tx.run.create({
            data: {
              ...target,
              taskId: task.id,
              status: "running",
              trigger,
              leaseOwner: "fixture-worker",
              leaseFence: 3,
              leaseExpiresAt: new Date(Date.now() + 5 * 60_000),
            },
          });
        }),
      );
  }
});
