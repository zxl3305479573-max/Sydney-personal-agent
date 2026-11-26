import * as z from "zod";
import { Id, IsoDate } from "./ids.js";

export const PAYMENT_METHOD_KINDS = [
  "debit_card",
  "credit_card",
  "wechat_pay",
  "alipay",
  "apple_pay",
  "bank_transfer",
  "paypal",
  "crypto_wallet",
  "other",
] as const;
export const PaymentMethodKindSchema = z.enum(PAYMENT_METHOD_KINDS);
export type PaymentMethodKind = z.infer<typeof PaymentMethodKindSchema>;

export const PAYMENT_CARD_ACCENTS = [
  "silver",
  "cobalt",
  "navy",
  "obsidian",
  "crimson",
  "emerald",
  "gold",
  "slate",
] as const;
export const PaymentCardAccentSchema = z.enum(PAYMENT_CARD_ACCENTS);
export type PaymentCardAccent = z.infer<typeof PaymentCardAccentSchema>;

export const FINANCE_CURRENCIES = [
  "CNY",
  "USD",
  "HKD",
  "EUR",
  "JPY",
  "GBP",
  "SGD",
  "AUD",
  "CAD",
] as const;
export const FinanceCurrencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3,6}$/, "Currency must be a 3-6 letter code")
  .default("CNY");

export const FINANCE_BILL_DIRECTIONS = ["expense", "income", "transfer"] as const;
export const FinanceBillDirectionSchema = z.enum(FINANCE_BILL_DIRECTIONS);
export type FinanceBillDirection = z.infer<typeof FinanceBillDirectionSchema>;

export const FINANCE_EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "shopping",
  "housing",
  "entertainment",
  "health",
  "subscription",
  "education",
  "social",
  "travel",
  "other_expense",
] as const;

export const FINANCE_INCOME_CATEGORIES = [
  "salary",
  "bonus",
  "investment",
  "refund",
  "other_income",
] as const;

export const FINANCE_TRANSFER_CATEGORIES = ["card_repayment", "transfer"] as const;

export const FINANCE_BILL_CATEGORIES = [
  ...FINANCE_EXPENSE_CATEGORIES,
  ...FINANCE_INCOME_CATEGORIES,
  ...FINANCE_TRANSFER_CATEGORIES,
] as const;
export const FinanceBillCategorySchema = z.enum(FINANCE_BILL_CATEGORIES);
export type FinanceBillCategory = z.infer<typeof FinanceBillCategorySchema>;

export const FINANCE_BILL_STATUSES = ["paid", "pending", "recurring"] as const;
export const FinanceBillStatusSchema = z.enum(FINANCE_BILL_STATUSES);
export type FinanceBillStatus = z.infer<typeof FinanceBillStatusSchema>;

export const FINANCE_BILL_SOURCES = ["manual", "bot"] as const;
export const FinanceBillSourceSchema = z.enum(FINANCE_BILL_SOURCES);
export type FinanceBillSource = z.infer<typeof FinanceBillSourceSchema>;

export const PERSONAL_FINANCE_READ_ONLY_TOOL_NAMES = [
  "finance_list_bills",
  "finance_get_summary",
] as const;

export const PERSONAL_FINANCE_WRITE_TOOL_NAMES = ["finance_record_bill"] as const;

export const PERSONAL_FINANCE_TOOL_NAMES = [
  ...PERSONAL_FINANCE_READ_ONLY_TOOL_NAMES,
  ...PERSONAL_FINANCE_WRITE_TOOL_NAMES,
] as const;
export type PersonalFinanceToolName = (typeof PERSONAL_FINANCE_TOOL_NAMES)[number];

/** Maximum cents stored in a signed 32-bit PostgreSQL INTEGER (~21.47 million). */
export const MAX_FINANCE_AMOUNT_CENTS = 2_000_000_000;

/**
 * Sensitive banking/payment fields stored encrypted at rest (AES-256-GCM) and never
 * returned by list endpoints or exposed to AI models / Bot tools.
 */
export const PaymentMethodSensitivePayloadSchema = z.object({
  accountNumber: z.string().trim().max(128).optional(),
  expiryMonth: z
    .string()
    .trim()
    .regex(/^(0[1-9]|1[0-2])$/, "Expiry month must be 01-12")
    .optional(),
  expiryYear: z
    .string()
    .trim()
    .regex(/^(\d{2}|\d{4})$/, "Expiry year must be YY or YYYY")
    .optional(),
  cvv: z.string().trim().max(12).optional(),
  branchName: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(32).optional(),
  note: z.string().trim().max(500).optional(),
});
export type PaymentMethodSensitivePayload = z.infer<typeof PaymentMethodSensitivePayloadSchema>;

/** Non-sensitive metadata safe to render in lists and caches. */
export const PaymentMethodSummarySchema = z.object({
  id: Id,
  kind: PaymentMethodKindSchema,
  label: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).nullable(),
  accountMask: z.string().trim().max(48).nullable(),
  last4: z.string().trim().max(8).nullable(),
  holderName: z.string().trim().max(80).nullable(),
  currency: FinanceCurrencySchema,
  billingDay: z.number().int().min(1).max(31).nullable(),
  repaymentDay: z.number().int().min(1).max(31).nullable(),
  creditLimitCents: z.number().int().min(0).max(MAX_FINANCE_AMOUNT_CENTS).nullable(),
  balanceCents: z
    .number()
    .int()
    .min(-MAX_FINANCE_AMOUNT_CENTS)
    .max(MAX_FINANCE_AMOUNT_CENTS)
    .nullable(),
  isDefault: z.boolean(),
  accentColor: PaymentCardAccentSchema.nullable(),
  hasSensitiveDetails: z.boolean(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PaymentMethodSummary = z.infer<typeof PaymentMethodSummarySchema>;

export const UpsertPaymentMethodInputSchema = z.object({
  id: Id.optional(),
  kind: PaymentMethodKindSchema,
  label: z.string().trim().min(1).max(80),
  institution: z.string().trim().max(80).nullable().optional(),
  accountMask: z.string().trim().max(48).nullable().optional(),
  last4: z.string().trim().max(8).nullable().optional(),
  holderName: z.string().trim().max(80).nullable().optional(),
  currency: FinanceCurrencySchema.optional(),
  billingDay: z.number().int().min(1).max(31).nullable().optional(),
  repaymentDay: z.number().int().min(1).max(31).nullable().optional(),
  creditLimitCents: z.number().int().min(0).max(MAX_FINANCE_AMOUNT_CENTS).nullable().optional(),
  balanceCents: z
    .number()
    .int()
    .min(-MAX_FINANCE_AMOUNT_CENTS)
    .max(MAX_FINANCE_AMOUNT_CENTS)
    .nullable()
    .optional(),
  isDefault: z.boolean().optional(),
  accentColor: PaymentCardAccentSchema.nullable().optional(),
  /**
   * When provided, replaces the encrypted sensitive payload.
   * When omitted on an update, existing encrypted details remain untouched.
   * Pass `null` explicitly to wipe stored sensitive details.
   */
  sensitive: PaymentMethodSensitivePayloadSchema.nullable().optional(),
});
export type UpsertPaymentMethodInput = z.infer<typeof UpsertPaymentMethodInputSchema>;

export const FinanceBillSchema = z.object({
  id: Id,
  direction: FinanceBillDirectionSchema,
  amountCents: z.number().int().positive().max(MAX_FINANCE_AMOUNT_CENTS),
  currency: FinanceCurrencySchema,
  category: FinanceBillCategorySchema,
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(400).nullable(),
  occurredAt: IsoDate,
  paymentMethodId: Id.nullable(),
  paymentMethodLabel: z.string().trim().max(80).nullable(),
  status: FinanceBillStatusSchema,
  source: FinanceBillSourceSchema,
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type FinanceBill = z.infer<typeof FinanceBillSchema>;

export const UpsertFinanceBillInputSchema = z.object({
  id: Id.optional(),
  direction: FinanceBillDirectionSchema,
  amountCents: z.number().int().positive().max(MAX_FINANCE_AMOUNT_CENTS),
  currency: FinanceCurrencySchema.optional(),
  category: FinanceBillCategorySchema,
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(400).nullable().optional(),
  occurredAt: IsoDate,
  paymentMethodId: Id.nullable().optional(),
  paymentMethodLabel: z.string().trim().max(80).nullable().optional(),
  status: FinanceBillStatusSchema.optional(),
});
export type UpsertFinanceBillInput = z.infer<typeof UpsertFinanceBillInputSchema>;

export const FinanceMonthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format");

export const FinanceCategoryBreakdownSchema = z.object({
  category: FinanceBillCategorySchema,
  totalCents: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
});
export type FinanceCategoryBreakdown = z.infer<typeof FinanceCategoryBreakdownSchema>;

export const FinanceMethodBreakdownSchema = z.object({
  paymentMethodId: Id.nullable(),
  label: z.string().max(80),
  totalCents: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
});
export type FinanceMethodBreakdown = z.infer<typeof FinanceMethodBreakdownSchema>;

export const FinanceMonthSummarySchema = z.object({
  month: FinanceMonthKeySchema,
  currency: FinanceCurrencySchema,
  totalExpenseCents: z.number().int().nonnegative(),
  totalIncomeCents: z.number().int().nonnegative(),
  totalTransferCents: z.number().int().nonnegative(),
  netCents: z.number().int(),
  billCount: z.number().int().nonnegative(),
  byCategory: z.array(FinanceCategoryBreakdownSchema),
  byPaymentMethod: z.array(FinanceMethodBreakdownSchema),
});
export type FinanceMonthSummary = z.infer<typeof FinanceMonthSummarySchema>;

export const PersonalFinanceOverviewInputSchema = z.object({
  month: FinanceMonthKeySchema.optional(),
  direction: FinanceBillDirectionSchema.optional(),
  category: FinanceBillCategorySchema.optional(),
  paymentMethodId: Id.optional(),
  query: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});
export type PersonalFinanceOverviewInput = z.infer<typeof PersonalFinanceOverviewInputSchema>;

export const PersonalFinanceOverviewSchema = z.object({
  methods: z.array(PaymentMethodSummarySchema),
  bills: z.array(FinanceBillSchema),
  summary: FinanceMonthSummarySchema,
  syncedAt: IsoDate,
});
export type PersonalFinanceOverview = z.infer<typeof PersonalFinanceOverviewSchema>;

export const PersonalFinanceImportInputSchema = z.object({
  methods: z.array(UpsertPaymentMethodInputSchema).max(100).default([]),
  bills: z.array(UpsertFinanceBillInputSchema).max(500).default([]),
});
export type PersonalFinanceImportInput = z.infer<typeof PersonalFinanceImportInputSchema>;

export const PersonalFinanceImportOutputSchema = z.object({
  importedMethods: z.number().int().nonnegative(),
  importedBills: z.number().int().nonnegative(),
});
export type PersonalFinanceImportOutput = z.infer<typeof PersonalFinanceImportOutputSchema>;

/** Strips empty keys from a sensitive payload; returns null when nothing sensitive remains. */
export function compactPaymentSensitivePayload(
  payload: PaymentMethodSensitivePayload | null | undefined,
): PaymentMethodSensitivePayload | null {
  if (!payload) return null;
  const cleaned: PaymentMethodSensitivePayload = {};
  if (payload.accountNumber?.trim()) cleaned.accountNumber = payload.accountNumber.trim();
  if (payload.expiryMonth?.trim()) cleaned.expiryMonth = payload.expiryMonth.trim();
  if (payload.expiryYear?.trim()) cleaned.expiryYear = payload.expiryYear.trim();
  if (payload.cvv?.trim()) cleaned.cvv = payload.cvv.trim();
  if (payload.branchName?.trim()) cleaned.branchName = payload.branchName.trim();
  if (payload.phoneNumber?.trim()) cleaned.phoneNumber = payload.phoneNumber.trim();
  if (payload.note?.trim()) cleaned.note = payload.note.trim();
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}

/** Derives a safe masked preview + last-4 from a raw card number, phone, email, or wallet address. */
export function maskPaymentAccountNumber(
  raw: string | null | undefined,
  kind?: PaymentMethodKind,
): { accountMask: string | null; last4: string | null } {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { accountMask: null, last4: null };

  // Email address (e.g. Alipay / PayPal)
  const atIndex = trimmed.indexOf("@");
  if (atIndex > 0 && atIndex < trimmed.length - 1) {
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex);
    const prefix = local.length <= 2 ? (local[0] ?? "*") : local.slice(0, 2);
    return { accountMask: `${prefix}***${domain}`, last4: null };
  }

  // Crypto wallet address
  if (kind === "crypto_wallet" && trimmed.length >= 12) {
    const tail = trimmed.slice(-4);
    return { accountMask: `${trimmed.slice(0, 6)}…${tail}`, last4: tail };
  }

  const digits = trimmed.replace(/\D/g, "");
  // Mainland China / standard mobile number (11 digits, e.g. WeChat / Alipay)
  if (
    digits.length === 11 &&
    digits.startsWith("1") &&
    (kind === "alipay" || kind === "wechat_pay" || kind === "other")
  ) {
    const last4 = digits.slice(-4);
    return { accountMask: `${digits.slice(0, 3)}****${last4}`, last4 };
  }

  // Bank cards / numeric accounts
  if (digits.length >= 4) {
    const last4 = digits.slice(-4);
    return { accountMask: `•••• ${last4}`, last4 };
  }

  if (trimmed.length <= 4) {
    return { accountMask: "••••", last4: null };
  }
  const tail = trimmed.slice(-4);
  return { accountMask: `•••• ${tail}`, last4: tail };
}

/** Formats a card number in readable 4-digit groups when revealed to the owner. */
export function formatCardNumberGrouped(raw: string): string {
  const compact = raw.replace(/\s+/g, "");
  if (!/^\d{8,24}$/.test(compact)) return raw.trim();
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

/** Exact string/number amount parser to positive integer cents without floating-point drift. */
export function parseAmountToCents(input: string | number): number | null {
  const text = typeof input === "number" ? (Number.isFinite(input) ? String(input) : "") : input;
  const cleaned = text.trim().replace(/[,，\s¥￥$€£]/g, "");
  if (!/^\d+(?:\.\d{0,2})?$/.test(cleaned)) return null;
  const [wholePart = "0", fracPart = ""] = cleaned.split(".");
  const whole = Number.parseInt(wholePart, 10);
  const frac = Number.parseInt(fracPart.padEnd(2, "0").slice(0, 2), 10);
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(frac)) return null;
  const cents = whole * 100 + frac;
  if (cents <= 0 || cents > MAX_FINANCE_AMOUNT_CENTS) return null;
  return cents;
}

export function currencySymbol(currency: string): string {
  switch (currency.toUpperCase()) {
    case "CNY":
    case "RMB":
      return "¥";
    case "USD":
      return "$";
    case "HKD":
      return "HK$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "JPY":
      return "JP¥";
    case "SGD":
      return "S$";
    case "AUD":
      return "A$";
    case "CAD":
      return "C$";
    default:
      return `${currency.toUpperCase()} `;
  }
}

export function formatCents(
  cents: number,
  currency = "CNY",
  options?: { signed?: boolean; hideDecimalsWhenWhole?: boolean },
): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const wholeFormatted = whole.toLocaleString("en-US");
  const decimals =
    options?.hideDecimalsWhenWhole && frac === 0 ? "" : `.${String(frac).padStart(2, "0")}`;
  const sign = negative ? "-" : options?.signed && safe > 0 ? "+" : "";
  return `${sign}${currencySymbol(currency)}${wholeFormatted}${decimals}`;
}

export function currentMonthKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function monthKeyFromIso(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (match) return `${match[1]}-${match[2]}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return currentMonthKey(date);
}

export function shiftMonthKey(month: string, deltaMonths: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return currentMonthKey();
  const year = Number.parseInt(match[1]!, 10);
  const monthIndex = Number.parseInt(match[2]!, 10) - 1;
  const target = new Date(year, monthIndex + deltaMonths, 1);
  return currentMonthKey(target);
}

/** Days until the next occurrence of a monthly day (1-31), returning 0 when today is the day. */
export function daysUntilMonthlyDay(targetDay: number, now = new Date()): number {
  const safeDay = Math.max(1, Math.min(31, Math.round(targetDay)));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const thisMonthCandidate = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(safeDay, daysInThisMonth),
  );
  if (thisMonthCandidate >= today) {
    return Math.round((thisMonthCandidate.getTime() - today.getTime()) / 86_400_000);
  }
  const daysInNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
  const nextMonthCandidate = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    Math.min(safeDay, daysInNextMonth),
  );
  return Math.round((nextMonthCandidate.getTime() - today.getTime()) / 86_400_000);
}

export function summarizeFinanceMonth(
  bills: readonly FinanceBill[],
  month: string,
  options?: { currency?: string; methods?: readonly PaymentMethodSummary[] },
): FinanceMonthSummary {
  const monthBills = bills.filter((bill) => monthKeyFromIso(bill.occurredAt) === month);
  const currency = options?.currency ?? monthBills[0]?.currency ?? "CNY";
  let totalExpenseCents = 0;
  let totalIncomeCents = 0;
  let totalTransferCents = 0;
  const categoryMap = new Map<FinanceBillCategory, { totalCents: number; count: number }>();
  const methodMap = new Map<string, FinanceMethodBreakdown>();
  const methodLabelById = new Map<string, string>();
  for (const method of options?.methods ?? []) {
    methodLabelById.set(method.id, method.label);
  }

  for (const bill of monthBills) {
    if (bill.direction === "expense") {
      totalExpenseCents += bill.amountCents;
      const prevCat = categoryMap.get(bill.category) ?? { totalCents: 0, count: 0 };
      categoryMap.set(bill.category, {
        totalCents: prevCat.totalCents + bill.amountCents,
        count: prevCat.count + 1,
      });
      const methodKey = bill.paymentMethodId ?? "__unassigned__";
      const label =
        (bill.paymentMethodId ? methodLabelById.get(bill.paymentMethodId) : null) ??
        bill.paymentMethodLabel ??
        "未关联方式";
      const prevMethod = methodMap.get(methodKey) ?? {
        paymentMethodId: bill.paymentMethodId,
        label,
        totalCents: 0,
        count: 0,
      };
      methodMap.set(methodKey, {
        ...prevMethod,
        totalCents: prevMethod.totalCents + bill.amountCents,
        count: prevMethod.count + 1,
      });
    } else if (bill.direction === "income") {
      totalIncomeCents += bill.amountCents;
    } else {
      totalTransferCents += bill.amountCents;
    }
  }

  const byCategory: FinanceCategoryBreakdown[] = [...categoryMap.entries()]
    .map(([category, stats]) => ({ category, ...stats }))
    .sort((a, b) => b.totalCents - a.totalCents);
  const byPaymentMethod: FinanceMethodBreakdown[] = [...methodMap.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );

  return {
    month,
    currency,
    totalExpenseCents,
    totalIncomeCents,
    totalTransferCents,
    netCents: totalIncomeCents - totalExpenseCents,
    billCount: monthBills.length,
    byCategory,
    byPaymentMethod,
  };
}

export const ParseFinanceBillImageMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
export type ParseFinanceBillImageMimeType = z.infer<typeof ParseFinanceBillImageMimeTypeSchema>;

export const ParseFinanceBillDraftInputSchema = z
  .object({
    text: z.string().trim().max(2000).optional(),
    /** Base64 encoded receipt or payment screenshot (without data: prefix). */
    imageBase64: z.string().max(14_000_000).optional(),
    imageMimeType: ParseFinanceBillImageMimeTypeSchema.optional(),
    nowIso: z.string().trim().max(48).optional(),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  })
  .superRefine((input, ctx) => {
    const hasText = Boolean(input.text?.trim());
    const hasImage = Boolean(input.imageBase64?.trim());
    if (!hasText && !hasImage) {
      ctx.addIssue({
        code: "custom",
        message: "Provide bill text or a receipt image to parse.",
        path: ["text"],
      });
    }
    if (hasImage && !input.imageMimeType) {
      ctx.addIssue({
        code: "custom",
        message: "imageMimeType is required when imageBase64 is provided.",
        path: ["imageMimeType"],
      });
    }
  });
export type ParseFinanceBillDraftInput = z.infer<typeof ParseFinanceBillDraftInputSchema>;

export const ParsedFinanceBillDraftSchema = z.object({
  direction: FinanceBillDirectionSchema,
  amountCents: z.number().int().positive().max(1_000_000_000).nullable(),
  currency: FinanceCurrencySchema,
  category: FinanceBillCategorySchema,
  title: z.string().trim().max(120),
  note: z.string().trim().max(400).nullable(),
  occurredAt: z.string(),
  paymentMethodId: z.string().nullable(),
  paymentMethodLabel: z.string().trim().max(80).nullable(),
  status: FinanceBillStatusSchema,
  parser: z.enum(["ai", "local"]),
  summary: z.string().trim().max(200).nullable().optional(),
});
export type ParsedFinanceBillDraft = z.infer<typeof ParsedFinanceBillDraftSchema>;

const INCOME_HINT_PATTERN =
  /(工资|薪资|发薪|薪水|奖金|年终奖|分红|利息|股息|理财收益|报销|收款|收到|进账|入账|退税|退款|退货|稿费|兼职|外快|红包收入|salary|payroll|bonus|dividend|refund|reimburse|income|received)/i;
const TRANSFER_HINT_PATTERN =
  /(还信用卡|信用卡还款|还花呗|还白条|还账单|还款|转账|转给|转入|提现|充值|充值到|互转|repayment|card repayment|transfer)/i;

export function inferFinanceBillDirection(text: string): FinanceBillDirection {
  const sample = text.trim();
  if (!sample) return "expense";
  if (TRANSFER_HINT_PATTERN.test(sample)) return "transfer";
  if (INCOME_HINT_PATTERN.test(sample)) return "income";
  return "expense";
}

const CATEGORY_RULES: ReadonlyArray<{
  direction?: FinanceBillDirection;
  category: FinanceBillCategory;
  pattern: RegExp;
}> = [
  // Transfer / repayment
  {
    direction: "transfer",
    category: "card_repayment",
    pattern: /(信用卡|花呗|白条|账单|还款|repayment)/i,
  },
  {
    direction: "transfer",
    category: "transfer",
    pattern: /(转账|提现|转入|转给|充值|transfer)/i,
  },
  // Income
  {
    direction: "income",
    category: "salary",
    pattern: /(工资|薪资|发薪|薪水|月薪|底薪|salary|payroll)/i,
  },
  {
    direction: "income",
    category: "bonus",
    pattern: /(奖金|年终奖|绩效|提成|津贴|报销|补贴|bonus|reimburse)/i,
  },
  {
    direction: "income",
    category: "investment",
    pattern: /(理财|分红|利息|股息|基金|股票|收益|dividend|interest|investment)/i,
  },
  {
    direction: "income",
    category: "refund",
    pattern: /(退款|退货|退税|返现|refund|cashback)/i,
  },
  // Expense (ordered from specific to general)
  {
    direction: "expense",
    category: "food",
    pattern:
      /(早饭|早餐|午饭|午餐|晚饭|晚餐|夜宵|外卖|饿了么|美团|点餐|聚餐|吃饭|干饭|餐饮|美食|火锅|海底捞|烧烤|烤肉|奶茶|喜茶|霸王茶姬|蜜雪|茶百道|一点点|咖啡|星巴克|瑞幸|库迪|麦当劳|肯德基|汉堡|披萨|拉面|面条|包子|馒头|水果|零食|蛋糕|面包|甜品|饮料|矿泉水|食堂|饭店|餐厅|酒楼|coffee|starbucks|luckin|lunch|dinner|breakfast|food|restaurant|cafe|tea|burger|pizza|mcdonald|kfc|bakery)/i,
  },
  {
    direction: "expense",
    category: "transport",
    pattern:
      /(打车|滴滴|高德打车|网约车|出租车|快车|专车|地铁|公交|巴士|轻轨|高铁|动车|火车|12306|铁路|加油|中石化|中石油|充电桩|特来电|停车|过路费|高速|ETC|单车|哈啰|青桔|保养|洗车|车险|uber|lyft|taxi|metro|subway|bus|train|parking|fuel|gas|toll|charging)/i,
  },
  {
    direction: "expense",
    category: "travel",
    pattern:
      /(机票|航空|航班|酒店|宾馆|民宿|客栈|携程|飞猪|去哪儿|同程|爱彼迎|景点|门票|签证|旅游|旅行|出差|flight|airline|hotel|airbnb|resort|travel|trip|booking)/i,
  },
  {
    direction: "expense",
    category: "housing",
    pattern:
      /(房租|租房|租金|房贷|物业|水费|电费|燃气|煤气|暖气|宽带|网费|保洁|家政|维修|家居|宜家|rent|mortgage|utility|utilities|electric|water|gas bill|internet|broadband|ikea)/i,
  },
  {
    direction: "expense",
    category: "subscription",
    pattern:
      /(话费|流量|充值话费|中国移动|中国联通|中国电信|会员|VIP|订阅|续费|包月|包年|iCloud|Apple Music|ChatGPT|OpenAI|Claude|Anthropic|Netflix|Spotify|YouTube|B站大会员|爱奇艺|腾讯视频|优酷|百度网盘|阿里云|腾讯云|域名|服务器|VPS|subscription|membership|cloud|domain|telecom)/i,
  },
  {
    direction: "expense",
    category: "health",
    pattern:
      /(医院|挂号|看病|门诊|急诊|药店|买药|药品|体检|牙科|口腔|洗牙|眼科|配镜|疫苗|医保|保健品|健身|私教|hospital|clinic|pharmacy|medicine|doctor|dental|medical|health|gym)/i,
  },
  {
    direction: "expense",
    category: "education",
    pattern:
      /(学费|课程|网课|培训|买书|书店|图书|教材|考试|报名费|辅导|文具|得到|知乎盐选|tuition|course|book|bookstore|education|training|exam|study)/i,
  },
  {
    direction: "expense",
    category: "entertainment",
    pattern:
      /(电影|影院|猫眼|淘票票|演出|演唱会|话剧|KTV|密室|剧本杀|酒吧|游戏|Steam|PlayStation|Switch|任天堂|充值游戏|氪金|网易云|QQ音乐|盲盒|泡泡玛特|movie|cinema|concert|game|steam|bar|ktv|entertainment)/i,
  },
  {
    direction: "expense",
    category: "social",
    pattern:
      /(红包|份子钱|随礼|礼金|送礼|礼物|鲜花|花束|请客|聚会|AA|转给朋友|gift|present|flowers|red packet|wedding|party)/i,
  },
  {
    direction: "expense",
    category: "shopping",
    pattern:
      /(淘宝|天猫|京东|拼多多|唯品会|得物|小红书|抖音商城|亚马逊|山姆|盒马|永辉|大润发|沃尔玛|开市客|Costco|便利店|罗森|全家|7-11|屈臣氏|超市|百货|商场|买衣服|衣服|鞋|包|化妆品|护肤|日用品|纸巾|快递|数码|手机|耳机|电脑|Apple Store|苹果店|shopping|amazon|walmart|costco|supermarket|mart|store|clothes|shoes|electronics)/i,
  },
];

/** Automatically classifies a bill from its merchant/title & optional note into one of the 18 categories. */
export function inferFinanceBillCategory(
  title: string,
  note?: string | null,
  direction: FinanceBillDirection = "expense",
): FinanceBillCategory {
  const haystack = `${title ?? ""} ${note ?? ""}`.trim();
  if (haystack) {
    for (const rule of CATEGORY_RULES) {
      if (rule.direction && rule.direction !== direction) continue;
      if (rule.pattern.test(haystack)) return rule.category;
    }
  }
  if (direction === "income") return "other_income";
  if (direction === "transfer") return "transfer";
  return "other_expense";
}

const METHOD_KIND_ALIASES: ReadonlyArray<{ kind: PaymentMethodKind; pattern: RegExp }> = [
  { kind: "wechat_pay", pattern: /(微信|wechat|wx)/i },
  { kind: "alipay", pattern: /(支付宝|花呗|alipay)/i },
  { kind: "apple_pay", pattern: /(apple\s*pay|苹果支付)/i },
  { kind: "paypal", pattern: /(paypal|贝宝)/i },
  { kind: "credit_card", pattern: /(信用卡|credit)/i },
  { kind: "debit_card", pattern: /(储蓄卡|借记卡|工资卡|银行卡|debit)/i },
  { kind: "bank_transfer", pattern: /(银行转账|网银|转账账户)/i },
  { kind: "crypto_wallet", pattern: /(usdt|usdc|数字钱包|加密钱包|钱包地址|bybit)/i },
];

/** Fuzzy-matches a user-mentioned payment method name, alias, bank keyword, or last 4 digits. */
export function matchSavedPaymentMethod(
  methods: readonly PaymentMethodSummary[],
  query?: string | null,
  explicitId?: string | null,
): PaymentMethodSummary | null {
  if (explicitId) {
    const byId = methods.find((m) => m.id === explicitId);
    if (byId) return byId;
  }
  const needle = query?.trim().toLowerCase();
  if (!needle) return null;

  // 1. Exact label match
  const exactLabel = methods.find((m) => m.label.trim().toLowerCase() === needle);
  if (exactLabel) return exactLabel;

  // 2. Last-4 digit match
  const digits = needle.match(/\d{4}/)?.[0];
  if (digits) {
    const byLast4 = methods.find((m) => m.last4 === digits);
    if (byLast4) return byLast4;
  }

  // 3. Substring match across label, institution, last4 (both directions for voice utterances)
  const scored = methods
    .map((m) => {
      const label = m.label.trim().toLowerCase();
      const inst = (m.institution ?? "").trim().toLowerCase();
      let score = 0;
      if (label && (label.includes(needle) || needle.includes(label))) score += 4;
      if (inst && (inst.includes(needle) || needle.includes(inst))) score += 3;
      if (m.last4 && needle.includes(m.last4)) score += 5;
      if (m.isDefault) score += 0.5;
      return { method: m, score };
    })
    .filter((entry) => entry.score >= 3)
    .sort((a, b) => b.score - a.score);
  if (scored[0]) return scored[0].method;

  // 4. Channel / kind alias fallback (e.g. "微信" -> saved wechat_pay method)
  for (const alias of METHOD_KIND_ALIASES) {
    if (!alias.pattern.test(needle)) continue;
    const byKind =
      methods.find((m) => m.kind === alias.kind && m.isDefault) ??
      methods.find((m) => m.kind === alias.kind);
    if (byKind) return byKind;
  }
  return null;
}

const CN_DIGIT_MAP: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function parseChineseIntToken(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number.parseInt(s, 10);
  if (!/^[零〇一二两兩三四五六七八九十百千万萬]+$/.test(s)) return null;
  let total = 0;
  let section = 0;
  let current = 0;
  let hasDigit = false;
  for (const ch of s) {
    if (ch in CN_DIGIT_MAP) {
      current = CN_DIGIT_MAP[ch]!;
      hasDigit = true;
    } else if (ch === "十") {
      section += (hasDigit ? current : 1) * 10;
      current = 0;
      hasDigit = false;
    } else if (ch === "百") {
      section += (hasDigit ? current : 1) * 100;
      current = 0;
      hasDigit = false;
    } else if (ch === "千") {
      section += (hasDigit ? current : 1) * 1000;
      current = 0;
      hasDigit = false;
    } else if (ch === "万" || ch === "萬") {
      section = (section + current) * 10_000;
      total += section;
      section = 0;
      current = 0;
      hasDigit = false;
    }
  }
  const result = total + section + current;
  return result > 0 ? result : null;
}

function extractSpokenAmountCents(text: string): { cents: number; rawMatch: string } | null {
  // 1. Arabic number with optional currency symbol/unit (e.g. ¥38.5, 268块5, 19.9元, $12.50, 35)
  const moneyUnitMatch =
    /(?:[¥￥$€£]|RMB|CNY|USD|HKD|EUR|JPY)?\s*(\d{1,7}(?:,\d{3})*(?:\.\d{1,2})?)\s*(?:块|元|圆|块钱|美元|美金|刀|港币|港元|日元|欧元)(?:([0-9一二三四五六七八九])毛?)?/i.exec(
      text,
    );
  if (moneyUnitMatch) {
    const base = moneyUnitMatch[1]!.replace(/,/g, "");
    const jiaoRaw = moneyUnitMatch[2];
    const combined =
      jiaoRaw && !base.includes(".")
        ? `${base}.${jiaoRaw in CN_DIGIT_MAP ? CN_DIGIT_MAP[jiaoRaw] : jiaoRaw}`
        : base;
    const cents = parseAmountToCents(combined);
    if (cents) return { cents, rawMatch: moneyUnitMatch[0] };
  }

  // 2. Spoken Chinese numerals with currency unit (e.g. 三十五块五, 两百八十元, 一千二百块, 五十块)
  const cnMoneyMatch =
    /([零〇一二两兩三四五六七八九十百千万萬]+)\s*(?:块|元|圆|块钱)(?:([一二三四五六七八九])(?:毛|角)?)?/.exec(
      text,
    );
  if (cnMoneyMatch) {
    const whole = parseChineseIntToken(cnMoneyMatch[1]!);
    if (whole !== null) {
      const jiao = cnMoneyMatch[2] ? (CN_DIGIT_MAP[cnMoneyMatch[2]] ?? 0) : 0;
      const cents = whole * 100 + jiao * 10;
      if (cents > 0 && cents <= 1_000_000_000) {
        return { cents, rawMatch: cnMoneyMatch[0] };
      }
    }
  }

  // 3. Plain standalone decimal/integer (avoid matching 4-digit years like 2026 or dates like 11月26日 or card last4 after 尾号)
  const strippedDates = text
    .replace(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}日?/g, " ")
    .replace(/\d{1,2}月\d{1,2}[日号]/g, " ")
    .replace(/尾号\s*\d{4}/g, " ")
    .replace(/\d{1,2}:\d{2}/g, " ");
  const plainMatch = /(?:^|[^\d.])(\d{1,7}(?:\.\d{1,2})?)(?=$|[^\d.])/.exec(strippedDates);
  if (plainMatch) {
    const cents = parseAmountToCents(plainMatch[1]!);
    if (cents) return { cents, rawMatch: plainMatch[1]! };
  }
  return null;
}

function detectCurrencyFromText(text: string): string {
  if (/(\$|美元|美金|USD|刀)/i.test(text)) return "USD";
  if (/(HK\$|港币|港元|HKD)/i.test(text)) return "HKD";
  if (/(€|欧元|EUR)/i.test(text)) return "EUR";
  if (/(日元|日币|JPY)/i.test(text)) return "JPY";
  if (/(£|英镑|GBP)/i.test(text)) return "GBP";
  return "CNY";
}

function extractOccurredAtFromText(text: string, now: Date): string {
  const target = new Date(now.getTime());
  const fullDate = /(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/.exec(text);
  if (fullDate) {
    const d = new Date(
      Number.parseInt(fullDate[1]!, 10),
      Number.parseInt(fullDate[2]!, 10) - 1,
      Number.parseInt(fullDate[3]!, 10),
      target.getHours(),
      target.getMinutes(),
      target.getSeconds(),
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const monthDay = /(\d{1,2})月(\d{1,2})[日号]/.exec(text);
  if (monthDay) {
    const d = new Date(
      target.getFullYear(),
      Number.parseInt(monthDay[1]!, 10) - 1,
      Number.parseInt(monthDay[2]!, 10),
      target.getHours(),
      target.getMinutes(),
      target.getSeconds(),
    );
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (/大前天/.test(text)) {
    target.setDate(target.getDate() - 3);
  } else if (/前天/.test(text)) {
    target.setDate(target.getDate() - 2);
  } else if (/(昨天|昨日|yesterday)/i.test(text)) {
    target.setDate(target.getDate() - 1);
  }
  return target.toISOString();
}

function cleanBillTitleFromUtterance(
  rawText: string,
  amountMatch: string | null,
  matchedMethodLabel: string | null,
): string {
  let title = rawText.trim();
  if (amountMatch) {
    title = title.replace(amountMatch, " ");
  }
  if (matchedMethodLabel) {
    title = title.replace(matchedMethodLabel, " ");
  }
  title = title
    .replace(/^(?:帮我|请帮我|麻烦|给我)?(?:记一笔|记一下|记账|记录一下|记录|添加一笔账单|加一笔)?/i, " ")
    .replace(/(?:今天|今日|昨天|昨日|前天|大前天|刚才|刚刚|早上|上午|中午|下午|晚上|今晚|昨晚)/g, " ")
    .replace(/20\d{2}[-/年]\d{1,2}[-/月]\d{1,2}日?/g, " ")
    .replace(/\d{1,2}月\d{1,2}[日号]/g, " ")
    .replace(/(?:用的是?|使用|通过|刷的?|付的?)?\s*(?:微信支付|微信|支付宝|花呗|Apple\s*Pay|招行信用卡|工商银行|招商银行|建设银行|农业银行|中国银行|交通银行|信用卡|储蓄卡|银行卡)\s*(?:支付|付款|刷卡|结账)?/gi, " ")
    .replace(/尾号\s*\d{4}/g, " ")
    .replace(/(?:花了|消费了?|付了|支付了?|用了|总共|一共|共|大概|约|人民币|块钱|块|元|帮我记一下|帮我记进去|记一下|记一笔)/g, " ")
    .replace(/[，。,.、!！?？:：;；]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return title.slice(0, 60);
}

/** Deterministic offline/instant parser for voice transcripts or quick chat sentences. */
export function parseNaturalBillText(
  text: string,
  methods: readonly PaymentMethodSummary[] = [],
  now = new Date(),
): ParsedFinanceBillDraft {
  const clean = text.trim();
  const direction = inferFinanceBillDirection(clean);
  const amount = extractSpokenAmountCents(clean);
  const currency = detectCurrencyFromText(clean);
  const occurredAt = extractOccurredAtFromText(clean, now);
  const matchedMethod = matchSavedPaymentMethod(methods, clean);
  const title = cleanBillTitleFromUtterance(
    clean,
    amount?.rawMatch ?? null,
    matchedMethod?.label ?? null,
  );
  const category = inferFinanceBillCategory(title || clean, clean, direction);
  return {
    direction,
    amountCents: amount?.cents ?? null,
    currency,
    category,
    title: title || clean.slice(0, 40),
    note: title && clean !== title ? clean.slice(0, 240) : null,
    occurredAt,
    paymentMethodId: matchedMethod?.id ?? null,
    paymentMethodLabel: matchedMethod?.label ?? null,
    status: "paid",
    parser: "local",
    summary: null,
  };
}
