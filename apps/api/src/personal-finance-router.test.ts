import { RPCHandler } from "@orpc/server/fetch";
import { EncryptedSecretStore } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

type Row = Record<string, unknown>;

const actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "owner@sydney.test",
  isDeploymentOwner: false,
} satisfies Actor;

function createFinanceTestHarness(options?: { identityConfirmed?: boolean }) {
  let identityConfirmed = options?.identityConfirmed ?? false;
  const methodRows: Row[] = [];
  const billRows: Row[] = [];

  const matches = (row: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      if (key === "NOT" && value && typeof value === "object") {
        if (matches(row, value as Row)) return false;
        continue;
      }
      if (row[key] !== value) return false;
    }
    return true;
  };

  const userPaymentMethod = {
    findMany: vi.fn(async ({ where }: { where?: Row }) =>
      methodRows
        .filter((row) => matches(row, where))
        .sort((a, b) => {
          if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
          return (b.updatedAt as Date).getTime() - (a.updatedAt as Date).getTime();
        })
        .map((row) => ({ ...row })),
    ),
    findFirst: vi.fn(async ({ where }: { where?: Row }) => {
      const found = methodRows.find((row) => matches(row, where));
      return found ? { ...found } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where?: Row; data: Row }) => {
      const found = methodRows.filter((row) => matches(row, where));
      for (const row of found) Object.assign(row, data, { updatedAt: new Date() });
      return { count: found.length };
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const now = new Date();
      const row = { createdAt: now, updatedAt: now, ...data };
      methodRows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const found = methodRows.find((row) => matches(row, where));
      if (!found) throw new Error("Not found");
      Object.assign(found, data, { updatedAt: new Date() });
      return { ...found };
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Row }) => {
      const before = methodRows.length;
      for (let i = methodRows.length - 1; i >= 0; i -= 1) {
        if (matches(methodRows[i]!, where)) {
          const removedId = methodRows[i]!.id;
          methodRows.splice(i, 1);
          // Simulate ON DELETE SET NULL on user_finance_bills.paymentMethodId
          for (const bill of billRows) {
            if (bill.paymentMethodId === removedId) bill.paymentMethodId = null;
          }
        }
      }
      return { count: before - methodRows.length };
    }),
  };

  const userFinanceBill = {
    findMany: vi.fn(async ({ where }: { where?: Row }) =>
      billRows
        .filter((row) => matches(row, where))
        .sort((a, b) => (b.occurredAt as Date).getTime() - (a.occurredAt as Date).getTime())
        .map((row) => ({ ...row })),
    ),
    findFirst: vi.fn(async ({ where }: { where?: Row }) => {
      const found = billRows.find((row) => matches(row, where));
      return found ? { ...found } : null;
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      const now = new Date();
      const row = { createdAt: now, updatedAt: now, ...data };
      billRows.push(row);
      return { ...row };
    }),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const found = billRows.find((row) => matches(row, where));
      if (!found) throw new Error("Not found");
      Object.assign(found, data, { updatedAt: new Date() });
      return { ...found };
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Row }) => {
      const before = billRows.length;
      for (let i = billRows.length - 1; i >= 0; i -= 1) {
        if (matches(billRows[i]!, where)) billRows.splice(i, 1);
      }
      return { count: before - billRows.length };
    }),
  };

  const prisma = {
    userPaymentMethod,
    userFinanceBill,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  const secrets = new EncryptedSecretStore("test-personal-finance-encryption-key-32bytes");
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    secrets,
    auth: {
      hasRecentIdentityConfirmation: vi.fn(async () => identityConfirmed),
    },
    env: {
      defaultProvider: "fake",
      defaultModel: "fake-model",
      webOrigin: "http://127.0.0.1:5173",
      screenProxySecret: "fake-test-secret",
      sandboxProvider: "fake",
    },
    dataDir: "/tmp/rakazo-finance-router-test",
  } as unknown as RouterDeps;

  const handler = new RPCHandler(createRouter(deps));

  async function call(path: string, input: unknown = {}) {
    const { response } = await handler.handle(
      new Request(`http://127.0.0.1/rpc/personalFinance/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      { prefix: "/rpc", context: { actor, sessionId: "session-1" } },
    );
    if (!response) throw new Error(`Procedure did not match: ${path}`);
    return { status: response.status, body: (await response.json()) as { json: unknown } };
  }

  return {
    methodRows,
    billRows,
    setIdentityConfirmed(value: boolean) {
      identityConfirmed = value;
    },
    call,
  };
}

describe("personalFinance RPC routes", () => {
  it("encrypts sensitive card details at rest, masks overview responses, and gates reveal behind identity confirmation", async () => {
    const harness = createFinanceTestHarness({ identityConfirmed: false });

    const created = await harness.call("upsertMethod", {
      kind: "credit_card",
      label: "招商银行经典白",
      institution: "招商银行",
      holderName: "张三",
      currency: "CNY",
      billingDay: 5,
      repaymentDay: 23,
      creditLimitCents: 5_000_000,
      isDefault: true,
      accentColor: "obsidian",
      sensitive: {
        accountNumber: "6225880144208842",
        expiryMonth: "08",
        expiryYear: "29",
        cvv: "739",
        branchName: "上海徐汇支行",
        phoneNumber: "13800138000",
        note: "每年免年费",
      },
    });
    expect(created.status).toBe(200);
    const savedMethod = created.body.json as {
      id: string;
      accountMask: string;
      last4: string;
      hasSensitiveDetails: boolean;
    };
    expect(savedMethod.accountMask).toBe("•••• 8842");
    expect(savedMethod.last4).toBe("8842");
    expect(savedMethod.hasSensitiveDetails).toBe(true);

    // Ciphertext stored in DB must be AES-256-GCM v2 encrypted, never plaintext.
    const dbRow = harness.methodRows[0]!;
    expect(String(dbRow.secretCiphertext)).toMatch(/^v2:/);
    expect(String(dbRow.secretCiphertext)).not.toContain("6225880144208842");
    expect(String(dbRow.secretCiphertext)).not.toContain("739");

    // Overview must never leak plaintext card number, CVV, expiry, or secret notes.
    const overview = await harness.call("overview", { month: "2026-11" });
    expect(overview.status).toBe(200);
    const overviewSerialized = JSON.stringify(overview.body.json);
    expect(overviewSerialized).toContain("•••• 8842");
    expect(overviewSerialized).not.toContain("6225880144208842");
    expect(overviewSerialized).not.toContain("739");
    expect(overviewSerialized).not.toContain("上海徐汇支行");

    // Reveal without recent identity confirmation is blocked with 403.
    const deniedReveal = await harness.call("revealMethod", { id: savedMethod.id });
    expect(deniedReveal.status).toBe(403);

    // Once identity is confirmed, reveal decrypts the exact record-bound payload.
    harness.setIdentityConfirmed(true);
    const allowedReveal = await harness.call("revealMethod", { id: savedMethod.id });
    expect(allowedReveal.status).toBe(200);
    expect(allowedReveal.body.json).toEqual({
      accountNumber: "6225880144208842",
      expiryMonth: "08",
      expiryYear: "29",
      cvv: "739",
      branchName: "上海徐汇支行",
      phoneNumber: "13800138000",
      note: "每年免年费",
    });
  });

  it("links bills to payment methods, keeps bill label snapshot after card deletion, and deduplicates local import", async () => {
    const harness = createFinanceTestHarness({ identityConfirmed: true });

    const imported = await harness.call("importLocal", {
      methods: [
        {
          id: "local_pm_1",
          kind: "wechat_pay",
          label: "微信零钱",
          isDefault: true,
          sensitive: { accountNumber: "13812345678" },
        },
      ],
      bills: [
        {
          id: "local_bill_1",
          direction: "expense",
          amountCents: 3500,
          currency: "CNY",
          category: "food",
          title: "午饭外卖",
          occurredAt: "2026-11-25T04:10:00.000Z",
          paymentMethodId: "local_pm_1",
        },
      ],
    });
    expect(imported.status).toBe(200);
    expect(imported.body.json).toEqual({ importedMethods: 1, importedBills: 1 });

    // Re-importing the same local records is idempotent.
    const secondImport = await harness.call("importLocal", {
      methods: [
        {
          id: "local_pm_1",
          kind: "wechat_pay",
          label: "微信零钱",
          last4: "5678",
        },
      ],
      bills: [
        {
          id: "local_bill_1",
          direction: "expense",
          amountCents: 3500,
          currency: "CNY",
          category: "food",
          title: "午饭外卖",
          occurredAt: "2026-11-25T04:10:00.000Z",
          paymentMethodId: "local_pm_1",
        },
      ],
    });
    expect(secondImport.body.json).toEqual({ importedMethods: 0, importedBills: 0 });

    const overviewBefore = (await harness.call("overview", { month: "2026-11" })).body.json as {
      methods: Array<{ id: string; label: string }>;
      bills: Array<{
        id: string;
        paymentMethodId: string | null;
        paymentMethodLabel: string | null;
      }>;
      summary: { totalExpenseCents: number };
    };
    expect(overviewBefore.methods).toHaveLength(1);
    expect(overviewBefore.bills[0]?.paymentMethodId).toBe(overviewBefore.methods[0]?.id);
    expect(overviewBefore.bills[0]?.paymentMethodLabel).toBe("微信零钱");
    expect(overviewBefore.summary.totalExpenseCents).toBe(3500);

    // Deleting the payment method clears paymentMethodId while preserving historical label snapshot.
    await harness.call("removeMethod", { id: overviewBefore.methods[0]!.id });
    const overviewAfter = (await harness.call("overview", { month: "2026-11" })).body.json as {
      methods: unknown[];
      bills: Array<{ paymentMethodId: string | null; paymentMethodLabel: string | null }>;
    };
    expect(overviewAfter.methods).toHaveLength(0);
    expect(overviewAfter.bills[0]?.paymentMethodId).toBeNull();
    expect(overviewAfter.bills[0]?.paymentMethodLabel).toBe("微信零钱");
  });
});
