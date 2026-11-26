import type { ConnectorTool } from "@rakazo/adapter-kit";
import type {
  FinanceBillCategory,
  FinanceBillDirection,
  FinanceBillStatus,
  PaymentMethodSummary,
} from "@rakazo/contracts";
import {
  currentMonthKey,
  daysUntilMonthlyDay,
  FINANCE_BILL_CATEGORIES,
  FINANCE_BILL_DIRECTIONS,
  FINANCE_BILL_STATUSES,
  FinanceBillCategorySchema,
  FinanceBillDirectionSchema,
  FinanceBillStatusSchema,
  FinanceCurrencySchema,
  FinanceMonthKeySchema,
  formatCents,
  inferFinanceBillCategory,
  isMobilePermissionEnabled,
  matchSavedPaymentMethod,
  parseAmountToCents,
} from "@rakazo/contracts";
import { isBackgroundRunTrigger } from "@rakazo/core";
import {
  getUserMobileBridge,
  getUserPersonalFinanceOverview,
  listUserPaymentMethods,
  recordAuditEvent,
  upsertUserFinanceBill,
} from "@rakazo/db";
import type { RunContext } from "./run-context.js";
import type { ToolCall, ToolHandlers } from "./run-tool-gate.js";

/** Non-sensitive card/wallet label view exposed to owner's bots for bill matching only. */
function safeMethodReference(method: PaymentMethodSummary) {
  return {
    id: method.id,
    label: method.label,
    kind: method.kind,
    institution: method.institution,
    last4: method.last4,
    currency: method.currency,
    isDefault: method.isDefault,
  };
}

async function assertFinanceLedgerAllowed(
  ctx: RunContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (
    !ctx.source.ownerStartedRun ||
    ctx.source.messagingChannelRun ||
    isBackgroundRunTrigger(ctx.run.trigger)
  ) {
    return {
      ok: false,
      error:
        "Personal finance ledger tools are only available in conversations started by the account owner.",
    };
  }
  const bridge = await getUserMobileBridge(ctx.deps.prisma, ctx.run.userId);
  if (!isMobilePermissionEnabled(bridge.permissions, "financeLedger")) {
    return {
      ok: false,
      error:
        "Personal bill ledger access is disabled. Ask the user to enable「账单协同记账」in Settings -> Bot App Permissions.",
    };
  }
  return { ok: true };
}

export const personalFinanceBuiltinTools: ConnectorTool[] = [
  {
    name: "finance_list_bills",
    description:
      "Read the account owner's personal bills and monthly totals, plus non-sensitive payment method names (labels and last 4 digits only) for filtering or matching. Full card numbers, expiry dates, CVV codes, and private banking notes are strictly inaccessible and never returned.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description:
            "Optional month filter in YYYY-MM format (e.g. 2026-11). Defaults to all recent bills while summarizing the requested or current month.",
        },
        direction: {
          type: "string",
          enum: [...FINANCE_BILL_DIRECTIONS],
          description: "Optional filter: expense, income, or transfer.",
        },
        category: {
          type: "string",
          enum: [...FINANCE_BILL_CATEGORIES],
          description: "Optional bill category filter.",
        },
        query: {
          type: "string",
          description: "Optional keyword to match bill title, note, or payment method label.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Maximum bills to return (default 30, max 100).",
        },
      },
    },
    readOnly: true,
  },
  {
    name: "finance_get_summary",
    description:
      "Get the account owner's monthly spending, income, net balance, category breakdown, payment-method spending breakdown, and upcoming credit card billing/repayment day reminders. Never returns full card numbers, CVV, expiry, or private payment secrets.",
    inputSchema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "Target month in YYYY-MM format (defaults to current month).",
        },
      },
    },
    readOnly: true,
  },
  {
    name: "finance_record_bill",
    description:
      "Record a new personal bill (expense, income, or transfer) in the account owner's ledger when they ask to log a bill or expense. Never ask the user for full bank card numbers, CVV, or payment PINs in chat.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: [...FINANCE_BILL_DIRECTIONS],
          description: "expense (default), income, or transfer.",
        },
        amount: {
          type: "number",
          exclusiveMinimum: 0,
          description: "Amount in major currency units (e.g. 38.5 for ¥38.50).",
        },
        currency: {
          type: "string",
          description: "3-letter currency code such as CNY (default), USD, HKD, EUR, JPY.",
        },
        category: {
          type: "string",
          enum: [...FINANCE_BILL_CATEGORIES],
          description:
            "Category: food, transport, shopping, housing, entertainment, health, subscription, education, social, travel, other_expense, salary, bonus, investment, refund, other_income, card_repayment, transfer.",
        },
        title: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          description: "Short merchant name or description (e.g. 午饭外卖, 地铁通勤, 招行还款).",
        },
        note: {
          type: "string",
          maxLength: 400,
          description: "Optional extra note.",
        },
        occurredAt: {
          type: "string",
          description: "Optional ISO-8601 datetime with offset (defaults to now).",
        },
        paymentMethodId: {
          type: "string",
          description: "Optional saved payment method ID from finance_list_bills.",
        },
        paymentMethodName: {
          type: "string",
          description:
            "Optional payment method name/alias or last 4 digits mentioned by the user (e.g. 微信支付, 支付宝, 招行, 8842).",
        },
        status: {
          type: "string",
          enum: [...FINANCE_BILL_STATUSES],
          description: "paid (default), pending, or recurring.",
        },
      },
      required: ["amount", "title"],
    },
    readOnly: false,
  },
];

async function handleFinanceListBills(ctx: RunContext, call: ToolCall) {
  const gate = await assertFinanceLedgerAllowed(ctx);
  if (!gate.ok) return { error: gate.error };

  const monthRaw = typeof call.args.month === "string" ? call.args.month.trim() : undefined;
  const month =
    monthRaw && FinanceMonthKeySchema.safeParse(monthRaw).success ? monthRaw : undefined;
  const directionParsed = FinanceBillDirectionSchema.safeParse(call.args.direction);
  const categoryParsed = FinanceBillCategorySchema.safeParse(call.args.category);
  const query = typeof call.args.query === "string" ? call.args.query.trim() : undefined;
  const limitRaw = typeof call.args.limit === "number" ? Math.round(call.args.limit) : 30;
  const limit = Math.max(1, Math.min(100, limitRaw));

  const overview = await getUserPersonalFinanceOverview(ctx.deps.prisma, ctx.run.userId, {
    month,
    direction: directionParsed.success ? directionParsed.data : undefined,
    category: categoryParsed.success ? categoryParsed.data : undefined,
    query: query || undefined,
    limit,
  });

  return {
    month: overview.summary.month,
    summary: {
      currency: overview.summary.currency,
      totalExpense: formatCents(overview.summary.totalExpenseCents, overview.summary.currency),
      totalIncome: formatCents(overview.summary.totalIncomeCents, overview.summary.currency),
      net: formatCents(overview.summary.netCents, overview.summary.currency, { signed: true }),
      totalExpenseCents: overview.summary.totalExpenseCents,
      totalIncomeCents: overview.summary.totalIncomeCents,
      billCount: overview.summary.billCount,
    },
    bills: overview.bills.map((bill) => ({
      id: bill.id,
      direction: bill.direction,
      amount: formatCents(bill.amountCents, bill.currency),
      amountCents: bill.amountCents,
      currency: bill.currency,
      category: bill.category,
      title: bill.title,
      note: bill.note,
      occurredAt: bill.occurredAt,
      paymentMethodLabel: bill.paymentMethodLabel,
      status: bill.status,
      source: bill.source,
    })),
    paymentMethods: overview.methods.map(safeMethodReference),
  };
}

async function handleFinanceGetSummary(ctx: RunContext, call: ToolCall) {
  const gate = await assertFinanceLedgerAllowed(ctx);
  if (!gate.ok) return { error: gate.error };

  const monthRaw = typeof call.args.month === "string" ? call.args.month.trim() : "";
  const month = FinanceMonthKeySchema.safeParse(monthRaw).success ? monthRaw : currentMonthKey();
  const overview = await getUserPersonalFinanceOverview(ctx.deps.prisma, ctx.run.userId, {
    month,
    limit: 500,
  });

  const upcomingCreditCards = overview.methods
    .filter((m) => m.kind === "credit_card" && (m.billingDay || m.repaymentDay))
    .map((m) => ({
      label: m.label,
      institution: m.institution,
      last4: m.last4,
      billingDay: m.billingDay,
      repaymentDay: m.repaymentDay,
      daysUntilBillingDay: m.billingDay ? daysUntilMonthlyDay(m.billingDay) : null,
      daysUntilRepaymentDay: m.repaymentDay ? daysUntilMonthlyDay(m.repaymentDay) : null,
    }));

  return {
    month: overview.summary.month,
    currency: overview.summary.currency,
    totalExpense: formatCents(overview.summary.totalExpenseCents, overview.summary.currency),
    totalIncome: formatCents(overview.summary.totalIncomeCents, overview.summary.currency),
    totalTransfer: formatCents(overview.summary.totalTransferCents, overview.summary.currency),
    net: formatCents(overview.summary.netCents, overview.summary.currency, { signed: true }),
    totalExpenseCents: overview.summary.totalExpenseCents,
    totalIncomeCents: overview.summary.totalIncomeCents,
    billCount: overview.summary.billCount,
    byCategory: overview.summary.byCategory.map((item) => ({
      category: item.category,
      total: formatCents(item.totalCents, overview.summary.currency),
      totalCents: item.totalCents,
      count: item.count,
    })),
    byPaymentMethod: overview.summary.byPaymentMethod.map((item) => ({
      label: item.label,
      total: formatCents(item.totalCents, overview.summary.currency),
      totalCents: item.totalCents,
      count: item.count,
    })),
    savedPaymentMethodCount: overview.methods.length,
    upcomingCreditCards,
  };
}

async function handleFinanceRecordBill(ctx: RunContext, call: ToolCall) {
  const gate = await assertFinanceLedgerAllowed(ctx);
  if (!gate.ok) return { error: gate.error };

  const title = typeof call.args.title === "string" ? call.args.title.trim() : "";
  if (!title) return { error: "title is required" };

  const amountRaw = call.args.amount;
  const amountCents =
    typeof amountRaw === "number" || typeof amountRaw === "string"
      ? parseAmountToCents(amountRaw)
      : null;
  if (!amountCents) {
    return { error: "amount must be a positive number with at most 2 decimal places" };
  }

  const directionParsed = FinanceBillDirectionSchema.safeParse(call.args.direction ?? "expense");
  const direction: FinanceBillDirection = directionParsed.success
    ? directionParsed.data
    : "expense";

  const categoryParsed = FinanceBillCategorySchema.safeParse(call.args.category);
  const rawCategory: FinanceBillCategory | null = categoryParsed.success
    ? categoryParsed.data
    : null;
  const note = typeof call.args.note === "string" ? call.args.note.trim().slice(0, 400) : null;
  const category: FinanceBillCategory =
    !rawCategory || rawCategory === "other_expense" || rawCategory === "other_income"
      ? inferFinanceBillCategory(title, note, direction)
      : rawCategory;

  const currencyParsed = FinanceCurrencySchema.safeParse(call.args.currency ?? "CNY");
  const currency = currencyParsed.success ? currencyParsed.data : "CNY";

  const statusParsed = FinanceBillStatusSchema.safeParse(call.args.status ?? "paid");
  const status: FinanceBillStatus = statusParsed.success ? statusParsed.data : "paid";

  const rawOccurredAt = typeof call.args.occurredAt === "string" ? call.args.occurredAt.trim() : "";
  const parsedDate = rawOccurredAt ? new Date(rawOccurredAt) : new Date();
  const occurredAt = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();

  const methods = await listUserPaymentMethods(ctx.deps.prisma, ctx.run.userId);
  const paymentMethodIdArg =
    typeof call.args.paymentMethodId === "string" ? call.args.paymentMethodId.trim() : undefined;
  const paymentMethodNameArg =
    typeof call.args.paymentMethodName === "string"
      ? call.args.paymentMethodName.trim()
      : undefined;
  const matchedMethod = matchSavedPaymentMethod(methods, paymentMethodNameArg, paymentMethodIdArg);

  const saved = await upsertUserFinanceBill(
    ctx.deps.prisma,
    ctx.run.userId,
    {
      direction,
      amountCents,
      currency,
      category,
      title: title.slice(0, 120),
      note,
      occurredAt,
      paymentMethodId: matchedMethod?.id ?? null,
      paymentMethodLabel: matchedMethod?.label ?? paymentMethodNameArg?.slice(0, 80) ?? null,
      status,
    },
    { source: "bot" },
  );

  await recordAuditEvent({
    action: "personal_finance.bill_recorded_by_bot",
    actor: { type: "bot", id: ctx.bot.id, label: ctx.bot.name },
    spaceId: ctx.run.spaceId,
    target: { type: "user_finance_bill", id: saved.id },
    runId: ctx.runId,
    threadId: ctx.run.threadId,
    metadata: {
      direction: saved.direction,
      category: saved.category,
      currency: saved.currency,
    },
  });

  return call.finish({
    recorded: true,
    bill: {
      id: saved.id,
      direction: saved.direction,
      amount: formatCents(saved.amountCents, saved.currency),
      amountCents: saved.amountCents,
      currency: saved.currency,
      category: saved.category,
      title: saved.title,
      note: saved.note,
      occurredAt: saved.occurredAt,
      paymentMethodLabel: saved.paymentMethodLabel,
      status: saved.status,
      source: saved.source,
    },
  });
}

export const personalFinanceTools: ToolHandlers = {
  finance_list_bills: handleFinanceListBills,
  finance_get_summary: handleFinanceGetSummary,
  finance_record_bill: handleFinanceRecordBill,
};
