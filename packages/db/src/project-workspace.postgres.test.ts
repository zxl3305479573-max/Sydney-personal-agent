import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, Prisma } from "./client.js";
import { describeRowSecurity, RUNTIME_ROLE } from "./database-access.js";
import { eventsAfter, sendUserMessage } from "./events.js";
import { createGroupRepos } from "./groups.js";
import {
  AccountHasProjectWorkspacesError,
  claimProjectAccountDeletion,
  ProjectAccountDeletionInProgressError,
} from "./project-account-lifecycle.js";
import { runInProjectWorkspace } from "./project-workspace-context.js";
import { createProjectWorkspace, listProjectWorkspaces } from "./project-workspace-read.js";
import { createRepos } from "./repos.js";
import { drainUnscopedDatabaseAccess, runAsSystem, runAsTenant } from "./row-security.js";
import { IsolationError } from "./scope.js";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const verifyPostgres = Boolean(
  process.env.VERIFY_DATABASE && runtimeUrl && migrationUrl && runtimeUrl !== migrationUrl,
);
if (process.env.VERIFY_DATABASE && !verifyPostgres) {
  throw new Error("VERIFY_DATABASE requires distinct DATABASE_URL and DATABASE_MIGRATION_URL");
}
const describePostgres = verifyPostgres ? describe.sequential : describe.skip;

describePostgres("project workspace metadata (PostgreSQL)", () => {
  const suffix = randomUUID();
  const organizationId = `workspace-org-${suffix}`;
  const spaceId = `workspace-space-${suffix}`;
  const otherSpaceId = `workspace-other-space-${suffix}`;
  const otherWorkspaceId = `workspace-other-${suffix}`;
  const siblingWorkspaceId = `workspace-sibling-${suffix}`;
  const ownCreatedId = `workspace-created-${suffix}`;
  const users = ["a", "b"].map((name) => ({
    userId: `workspace-user-${name}-${suffix}`,
    workspaceId: `workspace-${name}-${suffix}`,
    memberId: `workspace-member-${name}-${suffix}`,
    spaceMemberId: `workspace-space-member-${name}-${suffix}`,
  }));
  const [first, second] = users as [(typeof users)[number], (typeof users)[number]];
  const workspaceIds = [...users.map((user) => user.workspaceId), otherWorkspaceId];
  const forgedId = `workspace-forged-${suffix}`;
  const unscopedId = `workspace-unscoped-${suffix}`;
  const nonmemberId = `workspace-nonmember-${suffix}`;
  const pageIds = Array.from(
    { length: 201 },
    (_, index) => `workspace-page-${suffix}-${String(index).padStart(3, "0")}`,
  );
  const deletedId = `workspace-deleting-${suffix}`;
  const secondPageId = `workspace-page-other-user-${suffix}`;
  const pageFixtureIds = [...pageIds, deletedId, secondPageId];
  const conversation = {
    botId: `workspace-bot-${suffix}`,
    peerBotId: `workspace-peer-${suffix}`,
    outsiderBotId: `workspace-outsider-${suffix}`,
    otherBotId: `workspace-other-bot-${suffix}`,
    groupId: `workspace-group-${suffix}`,
    memberId: `workspace-group-member-${suffix}`,
    threadId: `workspace-thread-${suffix}`,
    peerThreadId: `workspace-peer-thread-${suffix}`,
    outsiderThreadId: `workspace-outsider-thread-${suffix}`,
    otherThreadId: `workspace-other-thread-${suffix}`,
    groupThreadId: `workspace-group-thread-${suffix}`,
    externalId: `workspace-external-${suffix}`,
    externalThreadId: `workspace-external-thread-${suffix}`,
    taskId: `workspace-task-${suffix}`,
    peerTaskId: `workspace-peer-task-${suffix}`,
    groupTaskId: `workspace-group-task-${suffix}`,
    externalTaskId: `workspace-external-task-${suffix}`,
    runId: `workspace-run-${suffix}`,
  };
  let owner: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let seeded = false;

  beforeAll(async () => {
    owner = createDb(migrationUrl!);
    app = createDb(runtimeUrl!, { poolMax: 1 });
    await runAsSystem("synthetic project metadata and conversation fixtures", () => owner.prisma.$transaction(async (tx) => {
      await tx.organization.create({
        data: {
          id: organizationId,
          name: "Workspace test",
          slug: organizationId,
          createdAt: new Date(),
        },
      });
      await tx.space.create({ data: { id: spaceId, organizationId, name: "Workspace test" } });
      await tx.space.create({
        data: { id: otherSpaceId, organizationId, name: "Other workspace test" },
      });
      for (const user of users) {
        await tx.user.create({
          data: { id: user.userId, name: user.userId, email: `${user.userId}@rakazo.test` },
        });
        await tx.member.create({
          data: {
            id: user.memberId,
            organizationId,
            userId: user.userId,
            role: "member",
            createdAt: new Date(),
          },
        });
        await tx.spaceMember.create({
          data: {
            id: user.spaceMemberId,
            organizationId,
            spaceId,
            userId: user.userId,
            role: "member",
            createdAt: new Date(),
          },
        });
        await tx.$executeRaw`
          INSERT INTO project_workspaces (id, "spaceId", "userId", name, "updatedAt")
          VALUES (${user.workspaceId}, ${spaceId}, ${user.userId}, 'fixture', NOW())`;
      }
      await tx.spaceMember.create({
        data: {
          id: `workspace-other-member-${suffix}`,
          organizationId,
          spaceId: otherSpaceId,
          userId: first.userId,
          role: "member",
          createdAt: new Date(),
        },
      });
      await tx.$executeRaw`
        INSERT INTO project_workspaces (id, "spaceId", "userId", name, "updatedAt")
        VALUES (${otherWorkspaceId}, ${otherSpaceId}, ${first.userId}, 'other fixture', NOW())`;
      for (const [botId, threadId, userId] of [
        [conversation.botId, conversation.threadId, first.userId],
        [conversation.peerBotId, conversation.peerThreadId, first.userId],
        [conversation.outsiderBotId, conversation.outsiderThreadId, first.userId],
        [conversation.otherBotId, conversation.otherThreadId, second.userId],
      ] as const) {
        await tx.bot.create({ data: { id: botId, spaceId, userId, name: "Scope fixture", color: "blue" } });
        await tx.thread.create({ data: { id: threadId, spaceId, userId, botId } });
      }
      await tx.chatGroup.create({
        data: { id: conversation.groupId, spaceId, userId: first.userId, name: "Scope fixture" },
      });
      await tx.chatGroupMember.createMany({ data: [
        { id: conversation.memberId, groupId: conversation.groupId, botId: conversation.botId },
        { groupId: conversation.groupId, botId: conversation.peerBotId },
      ] });
      await tx.thread.create({ data: {
        id: conversation.groupThreadId, spaceId, userId: first.userId, groupId: conversation.groupId,
      } });
      await tx.externalConversation.create({ data: {
        id: conversation.externalId, provider: "scope-fixture", workspaceId: spaceId,
        externalKey: `external-${suffix}`, conversationId: `conversation-${suffix}`,
        spaceId, userId: first.userId, botId: conversation.botId,
      } });
      await tx.thread.create({ data: {
        id: conversation.externalThreadId, spaceId, userId: first.userId,
        externalConversationId: conversation.externalId,
      } });
      for (const [taskId, botId, threadId] of [
        [conversation.taskId, conversation.botId, conversation.threadId],
        [conversation.peerTaskId, conversation.peerBotId, conversation.peerThreadId],
        [conversation.groupTaskId, conversation.peerBotId, conversation.groupThreadId],
        [conversation.externalTaskId, conversation.botId, conversation.externalThreadId],
      ] as const) {
        await tx.task.create({ data: {
          id: taskId, spaceId, userId: first.userId, botId, threadId, prompt: "fixture", status: "queued",
        } });
      }
      await tx.run.create({ data: {
        id: conversation.runId, taskId: conversation.taskId, spaceId, userId: first.userId,
        botId: conversation.botId, threadId: conversation.threadId, status: "queued", trigger: "chat",
      } });
    }));
    seeded = true;
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (seeded) {
        await runAsSystem("clean synthetic project fixtures", () => owner.prisma.$transaction(async (tx) => {
          await tx.cloudAgent.deleteMany({ where: { spaceId: { in: [spaceId, otherSpaceId] } } });
          const projectResources = { spaceId, projectWorkspaceId: { in: [first.workspaceId, siblingWorkspaceId] } };
          await tx.artifact.deleteMany({ where: projectResources });
          await tx.run.deleteMany({ where: projectResources });
          await tx.task.deleteMany({ where: projectResources });
          await tx.thread.deleteMany({ where: projectResources });
          await tx.chatGroup.deleteMany({ where: projectResources });
          await tx.bot.deleteMany({ where: projectResources });
          await tx.$executeRaw`
            DELETE FROM project_workspaces
            WHERE "spaceId" = ANY(${[spaceId, otherSpaceId]}::text[])
              AND id = ANY(${[...workspaceIds, ...pageFixtureIds, ownCreatedId, forgedId, unscopedId, nonmemberId, siblingWorkspaceId]}::text[])`;
          await tx.organization.deleteMany({ where: { id: organizationId } });
          await tx.user.deleteMany({ where: { id: { in: users.map((user) => user.userId) } } });
        }));
      }
    } catch (error) {
      errors.push(error);
    }
    for (const handle of [owner, app]) {
      if (!handle) continue;
      try {
        await handle.prisma.$disconnect();
      } catch (error) {
        errors.push(error);
      }
      try {
        await handle.pool.end();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, "Failed to clean up project workspace PostgreSQL test");
    }
  });

  const tenant = (user: (typeof users)[number]) => ({ spaceId, userId: user.userId });
  const visible = () =>
    app.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM project_workspaces WHERE id = ANY(${workspaceIds}::text[]) ORDER BY id`;
  const insert = (id: string, userId: string) =>
    app.prisma.$executeRaw`
      INSERT INTO project_workspaces (id, "spaceId", "userId", name, "updatedAt")
      VALUES (${id}, ${spaceId}, ${userId}, 'write test', NOW())`;

  it("uses a runtime login that cannot bypass row security", async () => {
    await expect(describeRowSecurity(app.prisma)).resolves.toMatchObject({ enforced: true });
    const [metadata] = await app.prisma.$queryRaw<
      Array<{
        enabled: boolean;
        active: boolean;
        owns: boolean;
        member: boolean;
        runtime_grants: boolean;
        login_grants: boolean;
      }>
    >`
      SELECT c.relrowsecurity AS enabled,
        row_security_active(c.oid) AS active,
        pg_has_role(current_user, c.relowner, 'USAGE') AS owns,
        pg_has_role(current_user, ${RUNTIME_ROLE}, 'USAGE') AS member,
        (SELECT bool_and(has_table_privilege(${RUNTIME_ROLE}, c.oid, privilege))
          FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege) AS runtime_grants,
        (SELECT bool_and(has_table_privilege(current_user, c.oid, privilege))
          FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privilege) AS login_grants
      FROM pg_class c WHERE c.oid = 'public.project_workspaces'::regclass`;
    expect(metadata).toEqual({
      enabled: true,
      active: true,
      owns: false,
      member: true,
      runtime_grants: true,
      login_grants: true,
    });
    const policies = await owner.prisma.$queryRaw<
      Array<{ policyname: string; cmd: string; qual: string | null; with_check: string | null }>
    >`
      SELECT policyname, cmd, qual, with_check FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'project_workspaces'
      ORDER BY policyname`;
    expect(policies).toHaveLength(2);
    expect(policies.map(({ policyname, cmd }) => ({ policyname, cmd }))).toEqual([
      { policyname: "project_workspaces_system", cmd: "ALL" },
      { policyname: "project_workspaces_tenant", cmd: "ALL" },
    ]);
    for (const policy of policies) {
      expect(policy.qual).toBeTruthy();
      expect(policy.with_check).toBeTruthy();
    }
  });

  it("lists only active owned workspaces and traverses same-timestamp pages", async () => {
    const createdAt = new Date("2020-01-01T00:00:00Z");
    let mainFailed = false;
    let mainError: unknown;
    let cleanupFailed = false;
    let cleanupError: unknown;
    try {
      await owner.prisma.$executeRaw`
        INSERT INTO project_workspaces (id, "spaceId", "userId", name, "createdAt", "updatedAt")
        SELECT id, ${spaceId}, ${first.userId}, 'page fixture',
          '2020-01-01T00:00:00Z'::timestamp, '2020-01-01T00:00:00Z'::timestamp
        FROM unnest(${pageIds}::text[]) AS id`;
      await owner.prisma.$executeRaw`
        INSERT INTO project_workspaces (id, "spaceId", "userId", name, "deletingAt", "updatedAt")
        VALUES (${deletedId}, ${spaceId}, ${first.userId}, 'deleting', NOW(), NOW())`;
      await owner.prisma.$executeRaw`
        INSERT INTO project_workspaces (id, "spaceId", "userId", name, "createdAt", "updatedAt")
        VALUES (${secondPageId}, ${spaceId}, ${second.userId}, 'other user',
          '2020-01-01T00:00:00Z'::timestamp, '2020-01-01T00:00:00Z'::timestamp)`;

      await owner.prisma.$executeRaw`
        UPDATE project_workspaces SET "deletingAt" = NOW()
        WHERE id = ANY(${pageIds.slice(99)}::text[]) AND "spaceId" = ${spaceId}`;
      const exactPage = await listProjectWorkspaces(app.prisma, tenant(first));
      expect(exactPage.items.map((item) => item.id)).toEqual([
        ...pageIds.slice(0, 99),
        first.workspaceId,
      ]);
      expect(exactPage.nextCursor).toBeNull();
      await owner.prisma.$executeRaw`
        UPDATE project_workspaces SET "deletingAt" = NULL
        WHERE id = ANY(${pageIds.slice(99)}::text[]) AND "spaceId" = ${spaceId}`;
      const page = await listProjectWorkspaces(app.prisma, tenant(first));
      expect(page.items.map((item) => item.id)).toEqual(pageIds.slice(0, 100));
      expect(page.nextCursor).toEqual({ createdAt, id: pageIds[99] });
      const next = await listProjectWorkspaces(app.prisma, tenant(first), page.nextCursor!);
      expect(next.items.map((item) => item.id)).toEqual(pageIds.slice(100, 200));
      expect(next.nextCursor).toEqual({ createdAt, id: pageIds[199] });
      const last = await listProjectWorkspaces(app.prisma, tenant(first), next.nextCursor!);
      expect(last.items.map((item) => item.id)).toEqual([pageIds[200], first.workspaceId]);
      expect(last.nextCursor).toBeNull();
      const secondPage = await listProjectWorkspaces(app.prisma, tenant(second));
      expect(secondPage.items.map((item) => item.id)).toEqual([secondPageId, second.workspaceId]);
      expect(secondPage.nextCursor).toBeNull();
      expect(
        (
          await listProjectWorkspaces(app.prisma, { spaceId: otherSpaceId, userId: first.userId })
        ).items.map((item) => item.id),
      ).toEqual([otherWorkspaceId]);
      expect(
        (await listProjectWorkspaces(app.prisma, { spaceId: otherSpaceId, userId: second.userId }))
          .items,
      ).toEqual([]);

      await owner.prisma.$executeRaw`UPDATE spaces SET "deletingAt" = NOW() WHERE id = ${spaceId}`;
      expect((await listProjectWorkspaces(app.prisma, tenant(first))).items).toEqual([]);
      expect((await listProjectWorkspaces(app.prisma, tenant(second))).items).toEqual([]);
    } catch (error) {
      mainFailed = true;
      mainError = error;
    } finally {
      try {
        await owner.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`UPDATE spaces SET "deletingAt" = NULL WHERE id = ${spaceId}`;
          await tx.$executeRaw`
            DELETE FROM project_workspaces WHERE id = ANY(${pageFixtureIds}::text[])
              AND "spaceId" = ${spaceId}`;
        });
      } catch (error) {
        cleanupFailed = true;
        cleanupError = error;
      }
    }
    if (mainFailed && cleanupFailed) {
      throw new AggregateError(
        [mainError, cleanupError],
        "Project workspace listing and cleanup both failed",
      );
    }
    if (mainFailed) throw mainError;
    if (cleanupFailed) throw cleanupError;
  });

  it("reuses an active project for a matching creation attempt and rejects conflicts", async () => {
    const id = randomUUID();
    try {
      const created = await createProjectWorkspace(app.prisma, tenant(first), { id, name: "Project" });
      const replay = await createProjectWorkspace(app.prisma, tenant(first), { id, name: "Project" });
      expect(replay).toEqual(created);
      await expect(createProjectWorkspace(app.prisma, tenant(first), { id, name: "Other" }))
        .rejects.toThrow("Project creation request conflicts");
      await expect(createProjectWorkspace(app.prisma, tenant(second), { id, name: "Project" }))
        .rejects.toThrow();
      await owner.prisma.$executeRaw`
        UPDATE project_workspaces SET "deletingAt" = NOW() WHERE id = ${id}`;
      await expect(createProjectWorkspace(app.prisma, tenant(first), { id, name: "Project" }))
        .rejects.toThrow("Project creation request conflicts");
    } finally {
      await owner.prisma.$executeRaw`DELETE FROM project_workspaces WHERE id = ${id}`;
    }
  });

  it("blocks a deletion claim when the account has projects in shared Spaces", async () => {
    await expect(claimProjectAccountDeletion(app.prisma, first.userId))
      .rejects.toBeInstanceOf(AccountHasProjectWorkspacesError);
    const rows = await runAsSystem("check synthetic account deletion claim", () =>
      owner.prisma.$queryRaw<Array<{ projectDeletionClaimedAt: Date | null }>>`
        SELECT "projectDeletionClaimedAt" FROM "user" WHERE id = ${first.userId}
      `,
    );
    expect(rows[0]?.projectDeletionClaimedAt).toBeNull();
  });

  it("persists a claim and refuses later project creation for that account", async () => {
    const userId = `workspace-claim-user-${randomUUID()}`;
    const memberId = `workspace-claim-member-${randomUUID()}`;
    const projectId = randomUUID();
    await runAsSystem("create synthetic account deletion fixture", () =>
      owner.prisma.$transaction(async (tx) => {
        await tx.user.create({ data: { id: userId, name: "Claim fixture", email: `${userId}@rakazo.test` } });
        await tx.member.create({ data: { id: memberId, organizationId, userId, role: "member", createdAt: new Date() } });
        await tx.spaceMember.create({ data: {
          id: `workspace-claim-space-member-${randomUUID()}`,
          organizationId, spaceId, userId, role: "member", createdAt: new Date(),
        } });
      }),
    );
    try {
      await claimProjectAccountDeletion(app.prisma, userId);
      await claimProjectAccountDeletion(app.prisma, userId);
      await expect(createProjectWorkspace(app.prisma, { spaceId, userId }, { id: projectId, name: "Project" }))
        .rejects.toBeInstanceOf(ProjectAccountDeletionInProgressError);
    } finally {
      await runAsSystem("clean synthetic account deletion fixture", () =>
        owner.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`DELETE FROM project_workspaces WHERE id = ${projectId}`;
          await tx.user.delete({ where: { id: userId } });
        }),
      );
    }
  });

  it("does not both claim account deletion and create a project concurrently", async () => {
    const userId = `workspace-race-user-${randomUUID()}`;
    const projectId = randomUUID();
    const contender = createDb(runtimeUrl!, { poolMax: 1 });
    try {
      await runAsSystem("create synthetic project lifecycle race fixture", () =>
        owner.prisma.$transaction(async (tx) => {
          await tx.user.create({ data: { id: userId, name: "Race fixture", email: `${userId}@rakazo.test` } });
          await tx.member.create({ data: {
            id: `workspace-race-member-${randomUUID()}`, organizationId, userId,
            role: "member", createdAt: new Date(),
          } });
          await tx.spaceMember.create({ data: {
            id: `workspace-race-space-member-${randomUUID()}`, organizationId, spaceId,
            userId, role: "member", createdAt: new Date(),
          } });
        }),
      );
      const [creation, claim] = await Promise.allSettled([
        createProjectWorkspace(app.prisma, { spaceId, userId }, { id: projectId, name: "Race project" }),
        claimProjectAccountDeletion(contender.prisma, userId),
      ]);
      expect([creation.status, claim.status].sort()).toEqual(["fulfilled", "rejected"]);
      if (creation.status === "rejected") {
        expect(creation.reason).toBeInstanceOf(ProjectAccountDeletionInProgressError);
      }
      if (claim.status === "rejected") {
        expect(claim.reason).toBeInstanceOf(AccountHasProjectWorkspacesError);
      }
      const rows = await runAsSystem("inspect synthetic project lifecycle race", () =>
        owner.prisma.$queryRaw<Array<{ claimed: boolean; projectExists: boolean }>>`
          SELECT "projectDeletionClaimedAt" IS NOT NULL AS "claimed",
            EXISTS (SELECT 1 FROM project_workspaces WHERE id = ${projectId}) AS "projectExists"
          FROM "user" WHERE id = ${userId}
        `,
      );
      expect(rows).toEqual([{
        claimed: claim.status === "fulfilled",
        projectExists: creation.status === "fulfilled",
      }]);
    } finally {
      try {
        await contender.prisma.$disconnect();
      } finally {
        try {
          await contender.pool.end();
        } finally {
          await runAsSystem("clean synthetic project lifecycle race fixture", () =>
            owner.prisma.$transaction(async (tx) => {
              await tx.$executeRaw`DELETE FROM project_workspaces WHERE id = ${projectId}`;
              await tx.user.deleteMany({ where: { id: userId } });
            }),
          );
        }
      }
    }
  });

  it("hides home artifacts from project scope and rejects an artifact without its project Run", async () => {
    const artifactId = `workspace-artifact-${randomUUID()}`;
    const blockedId = `workspace-blocked-artifact-${randomUUID()}`;
    try {
      await runAsSystem("create synthetic home artifact", () => owner.prisma.$executeRaw`
        INSERT INTO artifacts (id, "spaceId", "userId", "botId", name, "mimeType", size, hash, "storageKey")
        VALUES (${artifactId}, ${spaceId}, ${first.userId}, ${conversation.botId},
          'fixture.txt', 'text/plain', 1, 'fixture-hash', 'fixture-key')
      `);
      const list = () => app.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM artifacts WHERE id = ${artifactId}
      `;
      expect(await runAsTenant(tenant(first), list)).toEqual([{ id: artifactId }]);
      expect(await runAsTenant({ ...tenant(first), projectWorkspaceId: first.workspaceId }, list)).toEqual([]);
      await expect(runAsSystem("attempt synthetic project artifact write", () => owner.prisma.$executeRaw`
        INSERT INTO artifacts (id, "spaceId", "userId", "botId", "projectWorkspaceId", name, "mimeType", size, hash, "storageKey")
        VALUES (${blockedId}, ${spaceId}, ${first.userId}, ${conversation.botId}, ${first.workspaceId},
          'fixture.txt', 'text/plain', 1, 'fixture-hash', 'fixture-key')
      `)).rejects.toThrow();
    } finally {
      await runAsSystem("clean synthetic artifact scope fixture", () => owner.prisma.$executeRaw`
        DELETE FROM artifacts WHERE id = ANY(${[artifactId, blockedId]}::text[])
      `);
    }
  });

  it("hides home memory documents and revisions from project scope", async () => {
    const botMemoryId = `workspace-bot-memory-${randomUUID()}`;
    const userMemoryId = `workspace-user-memory-${randomUUID()}`;
    const revisionId = `workspace-memory-revision-${randomUUID()}`;
    const attemptedId = `workspace-memory-attempt-${randomUUID()}`;
    try {
      await runAsSystem("create synthetic home memory fixtures", () => owner.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          INSERT INTO memory_documents (id, "spaceId", "userId", "botId", scope, path, content, "updatedAt")
          VALUES (${botMemoryId}, ${spaceId}, ${first.userId}, ${conversation.botId}, 'bot',
            ${botMemoryId}, 'fixture', CURRENT_TIMESTAMP),
            (${userMemoryId}, ${spaceId}, ${first.userId}, NULL, 'user',
            ${userMemoryId}, 'fixture', CURRENT_TIMESTAMP)
        `;
        await tx.$executeRaw`
          INSERT INTO memory_revisions (id, "documentId", revision, content)
          VALUES (${revisionId}, ${botMemoryId}, 1, 'fixture')
        `;
      }));
      const documents = () => app.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM memory_documents
        WHERE id = ANY(${[botMemoryId, userMemoryId]}::text[]) ORDER BY id
      `;
      const revisions = () => app.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM memory_revisions WHERE id = ${revisionId}
      `;
      expect(await runAsTenant(tenant(first), documents)).toEqual(
        [botMemoryId, userMemoryId].sort().map((id) => ({ id })),
      );
      expect(await runAsTenant(tenant(first), revisions)).toEqual([{ id: revisionId }]);
      const projectTenant = { ...tenant(first), projectWorkspaceId: first.workspaceId };
      expect(await runAsTenant(projectTenant, documents)).toEqual([]);
      expect(await runAsTenant(projectTenant, revisions)).toEqual([]);
      await expect(runAsTenant(projectTenant, () => app.prisma.$executeRaw`
        INSERT INTO memory_documents (id, "spaceId", "userId", "botId", scope, path, content, "updatedAt")
        VALUES (${attemptedId}, ${spaceId}, ${first.userId}, ${conversation.botId},
          'bot', ${attemptedId}, 'fixture', CURRENT_TIMESTAMP)
      `)).rejects.toThrow();
    } finally {
      await runAsSystem("clean synthetic memory fixtures", () => owner.prisma.$executeRaw`
        DELETE FROM memory_documents WHERE id = ANY(${[botMemoryId, userMemoryId, attemptedId]}::text[])
      `);
    }
  });

  it("isolates the same user across Spaces", async () => {
    const otherTenant = { spaceId: otherSpaceId, userId: first.userId };
    expect(await runAsTenant(otherTenant, visible)).toEqual([{ id: otherWorkspaceId }]);
    expect(
      await runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET name = 'cross space' WHERE id = ${otherWorkspaceId}`,
      ),
    ).toBe(0);
    expect(
      await runAsTenant(
        otherTenant,
        () => app.prisma.$executeRaw`
        DELETE FROM project_workspaces WHERE id = ${first.workspaceId}`,
      ),
    ).toBe(0);
    await expect(runAsTenant(otherTenant, () => insert(forgedId, first.userId))).rejects.toThrow(
      /row.level security/i,
    );
  });

  it("allows a tenant to create, read and delete its own workspace", async () => {
    await runAsTenant(tenant(first), async () => {
      expect(await insert(ownCreatedId, first.userId)).toBe(1);
      expect(
        await app.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM project_workspaces WHERE id = ${ownCreatedId}`,
      ).toEqual([{ id: ownCreatedId }]);
      expect(
        await app.prisma.$executeRaw`
        DELETE FROM project_workspaces WHERE id = ${ownCreatedId}`,
      ).toBe(1);
      expect(
        await app.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM project_workspaces WHERE id = ${ownCreatedId}`,
      ).toEqual([]);
    });
  });

  it("clears tenant and system settings when the same connection is reused", async () => {
    const snapshot = () =>
      app.prisma.$queryRaw<Array<{ pid: number; ids: string[] }>>`
        SELECT pg_backend_pid() AS pid,
          ARRAY(SELECT id FROM project_workspaces
            WHERE id = ANY(${workspaceIds}::text[]) ORDER BY id) AS ids`;
    try {
      const [firstView] = await runAsTenant(tenant(first), snapshot);
      const [secondView] = await runAsTenant(tenant(second), snapshot);
      const [systemView] = await runAsSystem("project workspace connection reuse test", snapshot);
      const [emptyView] = await snapshot();
      const [otherView] = await runAsTenant(
        { spaceId: otherSpaceId, userId: first.userId },
        snapshot,
      );
      expect([
        firstView?.pid,
        secondView?.pid,
        systemView?.pid,
        emptyView?.pid,
        otherView?.pid,
      ]).toEqual(Array(5).fill(firstView?.pid));
      expect(firstView?.pid).toEqual(expect.any(Number));
      expect(firstView?.ids).toEqual([first.workspaceId]);
      expect(secondView?.ids).toEqual([second.workspaceId]);
      expect(systemView?.ids).toEqual([...workspaceIds].sort());
      expect(emptyView?.ids).toEqual([]);
      expect(otherView?.ids).toEqual([otherWorkspaceId]);
    } finally {
      drainUnscopedDatabaseAccess();
    }
  });

  it("isolates two users in the same Space for reads, updates and deletes", async () => {
    expect(await runAsTenant(tenant(first), visible)).toEqual([{ id: first.workspaceId }]);
    expect(await runAsTenant(tenant(second), visible)).toEqual([{ id: second.workspaceId }]);
    expect(
      await runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET name = 'changed' WHERE id = ${second.workspaceId}`,
      ),
    ).toBe(0);
    expect(
      await runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        DELETE FROM project_workspaces WHERE id = ${second.workspaceId}`,
      ),
    ).toBe(0);
    expect(
      await runAsTenant(
        tenant(second),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET name = 'own update' WHERE id = ${second.workspaceId}`,
      ),
    ).toBe(1);
  });

  it("denies reads and writes without context", async () => {
    try {
      expect(await visible()).toEqual([]);
      await expect(insert(unscopedId, first.userId)).rejects.toThrow(/row.level security/i);
      expect(
        await app.prisma.$executeRaw`
        UPDATE project_workspaces SET name = 'unscoped' WHERE id = ${first.workspaceId}`,
      ).toBe(0);
      expect(
        await app.prisma.$executeRaw`
        DELETE FROM project_workspaces WHERE id = ${first.workspaceId}`,
      ).toBe(0);
    } finally {
      drainUnscopedDatabaseAccess();
    }
  });

  it("rejects forged ownership on inserts and updates", async () => {
    await expect(runAsTenant(tenant(first), () => insert(forgedId, second.userId))).rejects.toThrow(
      /row.level security/i,
    );
    await expect(
      runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET "userId" = ${second.userId} WHERE id = ${first.workspaceId}`,
      ),
    ).rejects.toThrow(/Conversation identity and target are immutable/);
    await expect(
      runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET "spaceId" = ${`other-${suffix}`} WHERE id = ${first.workspaceId}`,
      ),
    ).rejects.toThrow(/Conversation identity and target are immutable/);
  });

  it("allows explicit system access across both owners", async () => {
    expect(await runAsSystem("project workspace integration test", visible)).toEqual(
      [...workspaceIds].sort().map((id) => ({ id })),
    );
    expect(
      await runAsSystem(
        "project workspace integration test",
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET name = 'system update' WHERE id = ${first.workspaceId}`,
      ),
    ).toBe(1);
  });

  it.each([
    { table: "bots", id: conversation.botId },
    { table: "chat_groups", id: conversation.groupId },
    { table: "threads", id: conversation.threadId },
    { table: "tasks", id: conversation.taskId },
    { table: "runs", id: conversation.runId },
  ])("keeps $table ownership and project immutable even under system bypass", async ({ table, id }) => {
    for (const [column, value] of [
      ["id", `changed-${id}`],
      ["spaceId", otherSpaceId],
      ["userId", second.userId],
      ["projectWorkspaceId", first.workspaceId],
    ] as const) {
      await expect(runAsSystem("synthetic conversation identity mutation", () =>
        app.prisma.$executeRaw(Prisma.sql`
          UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.raw(`"${column}"`)} = ${value} WHERE id = ${id}
        `),
      )).rejects.toThrow(/Conversation identity and target are immutable/);
    }
  });

  it.each([
    { table: "threads", id: conversation.threadId, column: "botId", value: conversation.peerBotId },
    { table: "tasks", id: conversation.taskId, column: "botId", value: conversation.peerBotId },
    { table: "tasks", id: conversation.taskId, column: "threadId", value: conversation.peerThreadId },
    { table: "runs", id: conversation.runId, column: "botId", value: conversation.peerBotId },
    { table: "runs", id: conversation.runId, column: "threadId", value: conversation.peerThreadId },
    { table: "runs", id: conversation.runId, column: "taskId", value: conversation.peerTaskId },
    { table: "external_conversations", id: conversation.externalId, column: "botId", value: conversation.peerBotId },
  ])("does not rebind $table.$column to another conversation target", async ({ table, id, column, value }) => {
    await expect(runAsSystem("synthetic conversation target mutation", () =>
      app.prisma.$executeRaw(Prisma.sql`
        UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.raw(`"${column}"`)} = ${value} WHERE id = ${id}
      `),
    )).rejects.toThrow(/Conversation identity and target are immutable/);
  });

  it("rejects group members and parent Bots owned by another member", async () => {
    await expect(runAsSystem("synthetic group membership mutation", () =>
      app.prisma.chatGroupMember.create({ data: {
        groupId: conversation.groupId, botId: conversation.otherBotId,
      } }),
    )).rejects.toThrow(/Group member scope does not match/);
    await expect(runAsSystem("synthetic group member reassignment", () =>
      app.prisma.chatGroupMember.update({
        where: { id: conversation.memberId }, data: { botId: conversation.otherBotId },
      }),
    )).rejects.toThrow(/Group member scope does not match/);
    await expect(runAsSystem("synthetic parent Bot mutation", () =>
      app.prisma.bot.update({
        where: { id: conversation.botId }, data: { parentBotId: conversation.otherBotId },
      }),
    )).rejects.toThrow(/Bot parent scope does not match/);
  });

  it.each([
    { botId: conversation.botId },
    { groupId: conversation.groupId },
    { externalConversationId: conversation.externalId },
  ])("rejects a new thread attributed to a different owner from its parent", async (parent) => {
    await expect(runAsSystem("synthetic thread ownership mismatch", () =>
      app.prisma.thread.create({ data: { spaceId, userId: second.userId, ...parent } }),
    )).rejects.toThrow(/Thread parent scope does not match/);
  });

  it.each([
    { botId: conversation.peerBotId, threadId: conversation.threadId },
    { botId: conversation.otherBotId, threadId: conversation.threadId },
    { botId: conversation.outsiderBotId, threadId: conversation.groupThreadId },
    { botId: conversation.peerBotId, threadId: conversation.externalThreadId },
  ])("rejects a task that does not belong to the given Bot's conversation", async (target) => {
    await expect(runAsSystem("synthetic task ownership mismatch", () =>
      app.prisma.task.create({ data: {
        spaceId, userId: first.userId, ...target, prompt: "fixture", status: "queued",
      } }),
    )).rejects.toThrow(/Task parent scope does not match/);
  });

  it("requires a Run's Bot and thread to match its saved Task", async () => {
    await expect(runAsSystem("synthetic Run ownership mismatch", () =>
      app.prisma.run.create({ data: {
        spaceId, userId: first.userId, botId: conversation.peerBotId,
        threadId: conversation.peerThreadId, taskId: conversation.taskId,
        trigger: "chat", status: "queued",
      } }),
    )).rejects.toThrow(/Run parent scope does not match/);
  });

  it("still accepts ordinary home tasks and runs under the tenant's scope", async () => {
    const created = await runAsTenant(tenant(first), () =>
      app.prisma.$transaction(async (tx) => {
        const task = await tx.task.create({ data: {
          spaceId, userId: first.userId, botId: conversation.botId,
          threadId: conversation.threadId, prompt: "fixture", status: "queued",
        } });
        return tx.run.create({ data: {
          spaceId, userId: first.userId, botId: conversation.botId,
          threadId: conversation.threadId, taskId: task.id, trigger: "chat", status: "queued",
        } });
      }),
    );
    expect(created.taskId).toEqual(expect.any(String));
    expect(await runAsTenant(tenant(first), () =>
      app.prisma.run.findUnique({ where: { id: created.id } }),
    )).not.toBeNull();
  });

  it("permits same-value identity updates and renaming without changing scope", async () => {
    await expect(runAsTenant(tenant(first), () => app.prisma.$executeRaw`
      UPDATE bots SET "spaceId" = ${spaceId}, "userId" = ${first.userId},
        "projectWorkspaceId" = NULL, name = 'Renamed fixture' WHERE id = ${conversation.botId}
    `)).resolves.toBe(1);
    await expect(runAsSystem("synthetic workspace ownership mutation", () => app.prisma.$executeRaw`
      UPDATE project_workspaces SET "userId" = ${second.userId} WHERE id = ${first.workspaceId}
    `)).rejects.toThrow(/Conversation identity and target are immutable/);
  });

  it("keeps external operation scope after deleting its Bot and thread", async () => {
    const botId = `workspace-retired-bot-${suffix}`;
    const threadId = `workspace-retired-thread-${suffix}`;
    const agentId = `workspace-retained-agent-${suffix}`;
    const purchaseId = `workspace-retained-purchase-${suffix}`;
    await runAsSystem("synthetic retained operation fixtures", () => owner.prisma.$transaction(async (tx) => {
      await tx.bot.create({ data: { id: botId, spaceId, userId: first.userId, name: "Fixture", color: "#000000" } });
      await tx.thread.create({ data: { id: threadId, spaceId, userId: first.userId, botId } });
      await tx.cloudAgent.create({ data: {
        id: agentId, operationKey: agentId, providerKey: "scope-fixture", spaceId,
        userId: first.userId, botId, threadId, title: "Fixture", launchRequest: {}, nextPollAt: null,
      } });
      await tx.purchase.create({ data: {
        id: purchaseId, operationKey: purchaseId, spaceId, userId: first.userId, botId, threadId,
        threadGeneration: 0, provider: "scope-fixture", remoteId: "synthetic-remote",
        merchantName: "Fixture", merchantUrl: "https://example.test", amount: 1, currency: "USD",
        status: "canceled", nextPollAt: null,
      } });
      await tx.bot.delete({ where: { id: botId } });
    }));
    const read = async () => ({
      agent: await app.prisma.cloudAgent.findUnique({ where: { id: agentId } }),
      purchase: await app.prisma.purchase.findUnique({ where: { id: purchaseId } }),
    });
    const expected = { spaceId, userId: first.userId, projectWorkspaceId: null, botId, threadId };
    const own = await runAsTenant(tenant(first), read);
    expect(own.agent).toMatchObject(expected);
    expect(own.purchase).toMatchObject(expected);
    expect(await runAsTenant(tenant(second), read)).toEqual({ agent: null, purchase: null });
    expect(await runAsTenant({ spaceId: otherSpaceId, userId: first.userId }, read))
      .toEqual({ agent: null, purchase: null });
    expect(await runAsTenant({ ...tenant(first), projectWorkspaceId: "synthetic-other-project" }, read))
      .toEqual({ agent: null, purchase: null });
    await expect(runAsTenant(tenant(first), () => app.prisma.cloudAgent.update({
      where: { id: agentId }, data: { status: "cancelled", nextPollAt: null },
    }))).resolves.toMatchObject({ status: "cancelled", ...expected });
    await expect(runAsSystem("synthetic retained operation mutation", () => app.prisma.purchase.update({
      where: { id: purchaseId }, data: { threadGeneration: 1 },
    }))).rejects.toThrow(/Conversation identity and target are immutable/);
    await expect(runAsSystem("synthetic retained operation mutation", () => app.prisma.cloudAgent.update({
      where: { id: agentId }, data: { providerKey: "other-provider" },
    }))).rejects.toThrow(/Conversation identity and target are immutable/);
  });

  it("opens project text and scoped artifacts while leaving project external operations gated", async () => {
    const constraints = await owner.prisma.$queryRaw<Array<{ name: string; validated: boolean; definition: string }>>`
      SELECT conname AS name, convalidated AS validated, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND contype = 'c'
        AND conrelid = ANY(ARRAY['public.bots'::regclass, 'public.chat_groups'::regclass,
          'public.threads'::regclass, 'public.tasks'::regclass, 'public.runs'::regclass,
          'public.artifacts'::regclass, 'public.cloud_agents'::regclass, 'public.purchases'::regclass])
        AND conname = ANY(ARRAY['bots_project_scope_disabled', 'chat_groups_project_scope_disabled',
          'threads_project_scope_disabled', 'tasks_project_scope_disabled', 'runs_project_scope_disabled',
          'artifacts_project_scope_disabled', 'cloud_agents_project_scope_disabled',
          'purchases_project_scope_disabled'])
      ORDER BY conname
    `;
    expect(constraints).toEqual([
      "cloud_agents", "purchases",
    ].map((table) => ({
      name: `${table}_project_scope_disabled`, validated: true,
      definition: expect.stringMatching(/"projectWorkspaceId" IS NULL/),
    })));
  });

  it("persists and isolates Bot and group text sends across projects in the same Space", async () => {
    const prisma = app.prisma;
    const actor = { ...tenant(first), email: `${first.userId}@rakazo.test`, isDeploymentOwner: false };
    const repos = createRepos(prisma);
    const groups = createGroupRepos(prisma);
    const inProject = <T>(projectId: string, run: () => Promise<T>) =>
      runInProjectWorkspace(prisma, actor, projectId, run);
    await runAsTenant(actor, () => insert(siblingWorkspaceId, first.userId));

    const makeProjectChat = (projectId: string) => inProject(projectId, async () => {
      const botInput = { description: "", instructions: "", notifyOnFinish: false };
      const member = await repos.createBot(actor, { ...botInput, name: "Project member" });
      const peer = await repos.createBot(actor, { ...botInput, name: "Project peer" });
      const group = await groups.createGroup(actor, { name: "Project group", botIds: [member.id, peer.id] });
      const send = async (threadId: string) => {
        const input = {
          ...tenant(first), threadId, botId: member.id, prompt: "project text",
          blocks: [{ kind: "text" as const, text: "project text" }],
          trigger: "user" as const, clientNonce: `project-send-${suffix}`,
        };
        const sent = await sendUserMessage(prisma, input);
        expect(sent).toMatchObject({ taskId: expect.any(String), runId: expect.any(String) });
        expect(await sendUserMessage(prisma, input)).toEqual(sent);
        return { threadId, ...sent };
      };
      return { member, peer, group, messages: [await send(member.threadId), await send(group.threadId)] };
    });
    const projectA = await makeProjectChat(first.workspaceId);
    const projectB = await makeProjectChat(siblingWorkspaceId);
    const artifactA = await inProject(first.workspaceId, async () => {
      const data = {
        ...tenant(first),
        botId: projectA.member.id,
        projectWorkspaceId: first.workspaceId,
        name: "fixture.md",
        mimeType: "text/markdown",
        size: 6,
        hash: "fixture-hash",
        storageKey: "fixture-store",
      };
      await expect(prisma.artifact.create({
        data: { ...data, runId: projectB.messages[0]?.runId },
      })).rejects.toThrow(/Project artifact does not match its Run/);
      return prisma.artifact.create({ data: { ...data, runId: projectA.messages[0]?.runId } });
    });
    await expect(inProject(siblingWorkspaceId, () =>
      prisma.artifact.findUnique({ where: { id: artifactA.id } }),
    )).resolves.toBeNull();
    await expect(runAsTenant(tenant(first), () =>
      prisma.artifact.findUnique({ where: { id: artifactA.id } }),
    )).resolves.toBeNull();
    await expect(inProject(first.workspaceId, () =>
      prisma.artifact.findUnique({ where: { id: artifactA.id } }),
    )).resolves.toMatchObject({ id: artifactA.id, projectWorkspaceId: first.workspaceId });

    for (const [projectId, own, other] of [
      [first.workspaceId, projectA, projectB],
      [siblingWorkspaceId, projectB, projectA],
    ] as const) {
      await inProject(projectId, async () => {
        const runs = await prisma.run.findMany({ orderBy: { id: "asc" }, include: { task: true } });
        expect(runs.map((run) => run.id)).toEqual(own.messages.map((message) => message.runId).sort());
        for (const run of runs) {
          expect(run).toMatchObject({ projectWorkspaceId: projectId, task: { projectWorkspaceId: projectId } });
        }
        expect(await prisma.message.count()).toBe(2);
        for (const message of own.messages) {
          expect(await eventsAfter(prisma, message.threadId, -1)).toHaveLength(1);
        }
        expect(await eventsAfter(prisma, other.group.threadId, -1)).toEqual([]);
        expect(await prisma.bot.findUnique({ where: { id: conversation.botId } })).toBeNull();
        expect(await prisma.chatGroup.findUnique({ where: { id: other.group.id } })).toBeNull();
        await expect(prisma.chatGroupMember.create({
          data: { groupId: own.group.id, botId: other.peer.id },
        })).rejects.toThrow(/Group member scope does not match/);
        expect(await prisma.run.updateMany({
          where: { id: { in: other.messages.flatMap((message) => message.runId ?? []) } },
          data: { status: "cancelled" },
        })).toEqual({ count: 0 });
        await expect(groups.createGroup(actor, { name: "Mixed", botIds: [own.member.id, other.peer.id] }))
          .rejects.toThrow(IsolationError);
      });
    }

    await runAsTenant(actor, async () => {
      expect(await prisma.bot.findUnique({ where: { id: conversation.botId } })).not.toBeNull();
      expect(await prisma.bot.findUnique({ where: { id: projectA.member.id } })).toBeNull();
      expect(await eventsAfter(prisma, projectA.group.threadId, -1)).toEqual([]);
    });
    await runAsTenant({ ...tenant(second), projectWorkspaceId: first.workspaceId }, async () => {
      expect(await prisma.run.findMany()).toEqual([]);
      expect(await prisma.bot.updateMany({ where: { id: projectA.member.id }, data: { name: "Denied" } }))
        .toEqual({ count: 0 });
    });
  });

  it("requires a Space membership and restricts deleting an owner membership", async () => {
    await expect(owner.prisma.$executeRaw`
      INSERT INTO project_workspaces (id, "spaceId", "userId", name, "updatedAt")
      VALUES (${nonmemberId}, ${spaceId}, ${`missing-${suffix}`}, 'nonmember', NOW())`).rejects.toThrow(
      /foreign key/i,
    );
    for (const user of users) {
      await expect(
        owner.prisma.spaceMember.delete({ where: { id: user.spaceMemberId } }),
      ).rejects.toThrow(/foreign key/i);
      expect(
        await owner.prisma.spaceMember.findUnique({ where: { id: user.spaceMemberId } }),
      ).not.toBeNull();
    }
  });
});
