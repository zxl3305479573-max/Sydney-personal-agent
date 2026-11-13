import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { describeRowSecurity, RUNTIME_ROLE } from "./database-access.js";
import { listProjectWorkspaces } from "./project-workspace-read.js";
import { drainUnscopedDatabaseAccess, runAsSystem, runAsTenant } from "./row-security.js";

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
  let owner: ReturnType<typeof createDb>;
  let app: ReturnType<typeof createDb>;
  let seeded = false;

  beforeAll(async () => {
    owner = createDb(migrationUrl!);
    app = createDb(runtimeUrl!, { poolMax: 1 });
    await owner.prisma.$transaction(async (tx) => {
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
    });
    seeded = true;
  });

  afterAll(async () => {
    const errors: unknown[] = [];
    try {
      if (seeded) {
        await owner.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            DELETE FROM project_workspaces
            WHERE "spaceId" = ANY(${[spaceId, otherSpaceId]}::text[])
              AND id = ANY(${[...workspaceIds, ...pageFixtureIds, ownCreatedId, forgedId, unscopedId, nonmemberId]}::text[])`;
          await tx.organization.deleteMany({ where: { id: organizationId } });
          await tx.user.deleteMany({ where: { id: { in: users.map((user) => user.userId) } } });
        });
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
    ).rejects.toThrow(/row.level security/i);
    await expect(
      runAsTenant(
        tenant(first),
        () => app.prisma.$executeRaw`
        UPDATE project_workspaces SET "spaceId" = ${`other-${suffix}`} WHERE id = ${first.workspaceId}`,
      ),
    ).rejects.toThrow(/row.level security/i);
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
