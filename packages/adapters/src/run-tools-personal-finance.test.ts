import type { MobileBridgePermissions } from "@rakazo/contracts";
import { DEFAULT_MOBILE_BRIDGE_PERMISSIONS, PERSONAL_FINANCE_TOOL_NAMES } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { RunContext } from "./run-context.js";
import type { ToolCall } from "./run-tool-gate.js";
import { selectBuiltinToolsForRun } from "./run-tool-selection.js";
import { personalFinanceTools } from "./run-tools-personal-finance.js";

function makeCall(name: string, args: Record<string, unknown> = {}): ToolCall {
  return {
    name,
    args,
    executionId: "exec-1",
    observer: undefined,
    connectorCall: {} as ToolCall["connectorCall"],
    effectKey: `eff-${name}`,
    applied: undefined,
    nextApprovedTool: undefined,
    bypassApproval: true,
    claimedEffect: false,
    persistEffectResult: vi.fn(async () => true),
    finish: vi.fn(async (result: unknown) => result),
    claimOrReturn: vi.fn(async () => undefined),
  };
}

function makeFinanceRunContext(options?: {
  ownerStartedRun?: boolean;
  messagingChannelRun?: boolean;
  trigger?: string;
  permissions?: Partial<MobileBridgePermissions>;
}) {
  const methods = [
    {
      id: "pm-cmb",
      userId: "user-1",
      kind: "credit_card",
      label: "招商银行信用卡",
      institution: "招商银行",
      accountMask: "•••• 8842",
      last4: "8842",
      holderName: "张三",
      currency: "CNY",
      billingDay: 5,
      repaymentDay: 23,
      creditLimitCents: 5_000_000,
      balanceCents: null,
      isDefault: true,
      accentColor: "obsidian",
      secretCiphertext: "v2:SUPER_SECRET_SHOULD_NEVER_LEAK_6225880144208842_CVV739",
      createdAt: new Date("2026-11-01T00:00:00.000Z"),
      updatedAt: new Date("2026-11-20T00:00:00.000Z"),
    },
  ];
  const bills: Array<Record<string, unknown>> = [
    {
      id: "bill-1",
      userId: "user-1",
      direction: "expense",
      amountCents: 4200,
      currency: "CNY",
      category: "food",
      title: "咖啡与早餐",
      note: null,
      occurredAt: new Date("2026-11-25T01:30:00.000Z"),
      paymentMethodId: "pm-cmb",
      paymentMethodLabel: "招商银行信用卡",
      status: "paid",
      source: "manual",
      createdAt: new Date("2026-11-25T01:30:00.000Z"),
      updatedAt: new Date("2026-11-25T01:30:00.000Z"),
    },
  ];

  const prisma = {
    userMobileBridge: {
      findUnique: vi.fn(async () => ({
        userId: "user-1",
        permissions: { ...DEFAULT_MOBILE_BRIDGE_PERMISSIONS, ...options?.permissions },
        snapshot: {},
        pendingActions: [],
        updatedAt: new Date(),
      })),
    },
    userPaymentMethod: {
      findMany: vi.fn(async () => methods.map((m) => ({ ...m }))),
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => {
        const found = methods.find((m) => m.id === where.id);
        return found ? { ...found } : null;
      }),
    },
    userFinanceBill: {
      findMany: vi.fn(async () => bills.map((b) => ({ ...b }))),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const row = { createdAt: now, updatedAt: now, ...data };
        bills.unshift(row);
        return { ...row };
      }),
    },
  };

  const ctx = {
    runId: "run-1",
    threadId: "thread-1",
    bot: { id: "bot-1", name: "Sydney" },
    run: {
      userId: "user-1",
      spaceId: "space-1",
      threadId: "thread-1",
      trigger: options?.trigger ?? "user",
    },
    source: {
      ownerStartedRun: options?.ownerStartedRun ?? true,
      messagingChannelRun: options?.messagingChannelRun ?? false,
    },
    deps: { prisma },
  } as unknown as RunContext;

  return { ctx, bills };
}

describe("personal finance bot tools", () => {
  it("lists bills and monthly summaries while strictly excluding card secrets and ciphertext", async () => {
    const { ctx } = makeFinanceRunContext();
    const listed = await personalFinanceTools.finance_list_bills!(
      ctx,
      makeCall("finance_list_bills", { month: "2026-11" }),
    );
    const listedJson = JSON.stringify(listed);
    expect(listedJson).toContain("咖啡与早餐");
    expect(listedJson).toContain("招商银行信用卡");
    expect(listedJson).toContain("8842");
    expect(listedJson).not.toContain("SUPER_SECRET");
    expect(listedJson).not.toContain("6225880144208842");
    expect(listedJson).not.toContain("CVV739");
    expect(listedJson).not.toContain("secretCiphertext");

    const summary = await personalFinanceTools.finance_get_summary!(
      ctx,
      makeCall("finance_get_summary", { month: "2026-11" }),
    );
    const summaryJson = JSON.stringify(summary);
    expect(summaryJson).toContain("¥42.00");
    expect(summaryJson).toContain("招商银行信用卡");
    expect(summaryJson).not.toContain("SUPER_SECRET");
    expect(summaryJson).not.toContain("secretCiphertext");
  });

  it("records a bill from chat, matches saved payment method by last4/name, and marks source=bot", async () => {
    const { ctx, bills } = makeFinanceRunContext();
    const result = (await personalFinanceTools.finance_record_bill!(
      ctx,
      makeCall("finance_record_bill", {
        direction: "expense",
        amount: 38.5,
        category: "food",
        title: "午饭外卖",
        paymentMethodName: "8842",
      }),
    )) as {
      recorded: boolean;
      bill: { amountCents: number; paymentMethodLabel: string; source: string };
    };

    expect(result.recorded).toBe(true);
    expect(result.bill.amountCents).toBe(3850);
    expect(result.bill.paymentMethodLabel).toBe("招商银行信用卡");
    expect(result.bill.source).toBe("bot");
    expect(bills).toHaveLength(2);
  });

  it("refuses access when not owner-started, from messaging channel, background trigger, or financeLedger disabled", async () => {
    const nonOwner = makeFinanceRunContext({ ownerStartedRun: false }).ctx;
    expect(
      await personalFinanceTools.finance_list_bills!(nonOwner, makeCall("finance_list_bills")),
    ).toHaveProperty("error");

    const messaging = makeFinanceRunContext({ messagingChannelRun: true }).ctx;
    expect(
      await personalFinanceTools.finance_record_bill!(
        messaging,
        makeCall("finance_record_bill", { amount: 20, title: "奶茶" }),
      ),
    ).toHaveProperty("error");

    const background = makeFinanceRunContext({ trigger: "tickets" }).ctx;
    expect(
      await personalFinanceTools.finance_get_summary!(background, makeCall("finance_get_summary")),
    ).toHaveProperty("error");

    const disabled = makeFinanceRunContext({ permissions: { financeLedger: false } }).ctx;
    const disabledRes = (await personalFinanceTools.finance_record_bill!(
      disabled,
      makeCall("finance_record_bill", { amount: 20, title: "奶茶" }),
    )) as { error: string };
    expect(disabledRes.error).toContain("账单协同记账");
  });

  it("exposes personal finance tools only to owner-started non-channel non-background runs", () => {
    const ownerTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "user",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
    }).map((t) => t.name);
    for (const name of PERSONAL_FINANCE_TOOL_NAMES) {
      expect(ownerTools).toContain(name);
    }

    const channelTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "user",
      semanticMemoryEnabled: false,
      messagingChannelRun: true,
    }).map((t) => t.name);
    for (const name of PERSONAL_FINANCE_TOOL_NAMES) {
      expect(channelTools).not.toContain(name);
    }

    const scheduleTools = selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      groupId: null,
      trigger: "schedule",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
    }).map((t) => t.name);
    for (const name of PERSONAL_FINANCE_TOOL_NAMES) {
      expect(scheduleTools).not.toContain(name);
    }
  });
});
