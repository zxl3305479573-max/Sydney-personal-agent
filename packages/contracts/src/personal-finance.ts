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
