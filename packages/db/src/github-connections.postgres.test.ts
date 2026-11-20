import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client, escapeIdentifier } from "pg";
import { describe, expect, it } from "vitest";
import { rlsBypassKey } from "./row-security.js";

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const enabled = Boolean(
  process.env.VERIFY_DATABASE && runtimeUrl && migrationUrl && runtimeUrl !== migrationUrl,
);
if (process.env.VERIFY_DATABASE && !enabled)
  throw new Error("VERIFY_DATABASE requires distinct runtime and migration database URLs");

(enabled ? describe.sequential : describe.skip)(
  "GitHub connection row security (PostgreSQL)",
  () => {
    it("isolates accounts, rejects a forged bypass and rolls back all synthetic fixtures", async () => {
      const runtime = new Client({ connectionString: runtimeUrl });
      const owner = new Client({ connectionString: migrationUrl });
      const suffix = randomUUID();
      const users = [`github-fixture-a-${suffix}`, `github-fixture-b-${suffix}`];
      const ids = users.map((user) => `connection-${user}`);
      try {
        await runtime.connect();
        const role = (
          await runtime.query(
            "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
          )
        ).rows[0];
        expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });
        await owner.connect();
        await owner.query("BEGIN");
        const table = (await owner.query("SELECT to_regclass('public.github_connections') AS name"))
          .rows[0];
        if (!table.name) {
          await owner.query(
            readFileSync(
              new URL(
                "../prisma/migrations/20261118150000_github_connections/migration.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          );
        }
        await owner.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON github_connections TO ${escapeIdentifier(role.name)}`,
        );
        for (const [index, userId] of users.entries()) {
          await owner.query(
            'INSERT INTO "user" (id, name, email, "updatedAt") VALUES ($1, $2, $3, now())',
            [userId, "GitHub synthetic fixture", `${userId}@invalid.test`],
          );
          await owner.query(
            "INSERT INTO github_connections (id, \"userId\", provider, status, \"githubUserId\", login, \"htmlUrl\", ciphertext, \"updatedAt\") VALUES ($1, $2, 'github', 'connected', $2, 'fixture', 'https://github.com/fixture', 'synthetic-not-a-token', now())",
            [ids[index], userId],
          );
        }
        await owner.query(`SET LOCAL ROLE ${escapeIdentifier(role.name)}`);
        const scope = async (userId: string, bypass = "off", key = "") => {
          await owner.query(
            "SELECT set_config('app.user_id', $1, true), set_config('app.rls_bypass', $2, true), set_config('app.rls_bypass_key', $3, true)",
            [userId, bypass, key],
          );
        };
        const visible = async () =>
          (
            await owner.query(
              "SELECT id FROM github_connections WHERE id = ANY($1::text[]) ORDER BY id",
              [ids],
            )
          ).rows.map((row: { id: string }) => row.id);

        await scope(users[0]!);
        expect(await visible()).toEqual([ids[0]]);
        expect(
          (
            await owner.query("UPDATE github_connections SET login = 'changed' WHERE id = $1", [
              ids[1],
            ])
          ).rowCount,
        ).toBe(0);
        expect(
          (await owner.query("DELETE FROM github_connections WHERE id = $1", [ids[1]])).rowCount,
        ).toBe(0);
        await owner.query("SAVEPOINT foreign_write");
        await expect(
          owner.query('UPDATE github_connections SET "userId" = $1 WHERE id = $2', [
            users[1],
            ids[0],
          ]),
        ).rejects.toMatchObject({ code: "42501" });
        await owner.query("ROLLBACK TO SAVEPOINT foreign_write");

        await scope(users[1]!);
        expect(await visible()).toEqual([ids[1]]);
        await scope("", "on", "forged-not-the-runtime-key");
        expect(await visible()).toEqual([]);
        await scope("", "off");
        expect(await visible()).toEqual([]);
        await scope("", "on", rlsBypassKey(runtimeUrl));
        expect(await visible()).toEqual([...ids].sort());
      } finally {
        await owner.query("ROLLBACK").catch(() => undefined);
        await owner.end();
        await runtime.end();
      }
    });
  },
);
