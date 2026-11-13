import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("better-auth/adapters/prisma");
  vi.resetModules();
});

async function fixture(workspaceResult: "present" | "failure") {
  vi.resetModules();
  vi.doMock("better-auth/adapters/prisma", async () => {
    const { memoryAdapter } = await import("better-auth/adapters/memory");
    return {
      prismaAdapter: (prisma: { authData: Record<string, { id?: unknown }[]> }) =>
        memoryAdapter(prisma.authData),
    };
  });
  const { createAuth } = await import("./index.js");
  const { assertAccountDeletionAllowed } = await import(
    "../../../apps/api/src/account-deletion.js"
  );
  const now = new Date();
  const secret = "offline-auth-secret-at-least-32-characters";
  const token = "offline-session-token";
  const failure = new Error("database unavailable");
  const cancelBilling = vi.fn();
  const cleanup = vi.fn();
  const query = vi.fn(async (_strings: TemplateStringsArray) => {
    if (workspaceResult === "failure") throw failure;
    return [{ authorized: true, exists: true }];
  });
  const data: Record<string, Record<string, unknown>[]> = {
    user: [
      {
        id: "user-1",
        name: "Test",
        email: "user@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    account: [],
    session: [
      {
        id: "session-1",
        userId: "user-1",
        token,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: now,
        updatedAt: now,
      },
    ],
    verification: [],
    passkey: [],
  };
  const prisma = { authData: data, $queryRaw: query };
  const auth = createAuth(prisma as never, {
    secret,
    baseURL: "http://auth.example.test",
    webOrigin: "http://web.example.test",
    signupsEnabled: undefined,
    signupAllowlist: undefined,
    beforeDeleteUser: async (userId) => {
      await assertAccountDeletionAllowed(prisma as never, userId);
      await cancelBilling();
      await cleanup();
    },
    logger: { disabled: true },
  });
  data.account!.push({
    id: "account-1",
    userId: "user-1",
    providerId: "credential",
    accountId: "user-1",
    password: await (await auth.$context).password.hash("offline-password12"),
    createdAt: now,
    updatedAt: now,
  });
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  const session = await auth.api.getSession({
    headers: new Headers({ authorization: `Bearer ${token}.${signature}` }),
  });
  expect(session).not.toBeNull();
  const response = await auth.handler(
    new Request("http://auth.example.test/api/auth/delete-user", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://web.example.test",
        authorization: `Bearer ${token}.${signature}`,
      },
      body: JSON.stringify({ password: "offline-password12" }),
    }),
  );
  return { response, data, query, cancelBilling, cleanup, failure, assertAccountDeletionAllowed };
}

describe("account deletion workspace authentication response", () => {
  it("returns a stable conflict and stops before billing and deletion", async () => {
    const result = await fixture("present");
    expect(result.response.status, await result.response.clone().text()).toBe(409);
    expect(await result.response.json()).toMatchObject({
      code: "ACCOUNT_HAS_PROJECT_WORKSPACES",
      message: "Remove project workspaces before deleting the account",
    });
    expect(result.data.user).toHaveLength(1);
    expect(result.cancelBilling).not.toHaveBeenCalled();
    expect(result.cleanup).not.toHaveBeenCalled();
  }, 60_000);

  it("preserves database errors and returns the existing internal error response", async () => {
    const result = await fixture("failure");
    expect(result.response.status, await result.response.clone().text()).toBe(500);
    expect(await result.response.text()).not.toContain("ACCOUNT_HAS_PROJECT_WORKSPACES");
    expect(result.data.user).toHaveLength(1);
    expect(result.cancelBilling).not.toHaveBeenCalled();
    expect(result.cleanup).not.toHaveBeenCalled();
    await expect(
      result.assertAccountDeletionAllowed({ $queryRaw: result.query } as never, "user-1"),
    ).rejects.toBe(result.failure);
  });

  it("keeps the application preflight ahead of billing and cleanup", () => {
    const source = readFileSync(new URL("../../../apps/api/src/app.ts", import.meta.url), "utf8");
    const start = source.indexOf("beforeDeleteUser: async (userId)");
    const guard = source.indexOf("await assertAccountDeletionAllowed(prisma, userId)", start);
    const billing = source.indexOf("await billing?.cancelForDeletedUser(userId)", start);
    const cleanup = source.indexOf("await deleteAccountContent(", start);
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(billing).toBeGreaterThan(guard);
    expect(cleanup).toBeGreaterThan(billing);
  });
});
