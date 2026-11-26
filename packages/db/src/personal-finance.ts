import type {
  FinanceBill,
  FinanceBillCategory,
  FinanceBillDirection,
  FinanceBillSource,
  FinanceBillStatus,
  PaymentCardAccent,
  PaymentMethodKind,
  PaymentMethodSensitivePayload,
  PaymentMethodSummary,
  PersonalFinanceOverview,
  PersonalFinanceOverviewInput,
  UpsertFinanceBillInput,
  UpsertPaymentMethodInput,
} from "@rakazo/contracts";
import {
  compactPaymentSensitivePayload,
  currentMonthKey,
  FinanceBillCategorySchema,
  FinanceBillDirectionSchema,
  FinanceBillSourceSchema,
  FinanceBillStatusSchema,
  maskPaymentAccountNumber,
  monthKeyFromIso,
  PaymentCardAccentSchema,
  PaymentMethodKindSchema,
  PaymentMethodSensitivePayloadSchema,
  summarizeFinanceMonth,
} from "@rakazo/contracts";
import type { PrismaClient } from "./generated/prisma/client.js";
import { createRowId } from "./row-id.js";

export type PaymentMethodSecretOps = {
  seal: (plaintext: string, recordId: string) => Promise<string>;
  open: (ciphertext: string, recordId: string) => Promise<string>;
  remove?: (ciphertext: string, recordId: string) => Promise<void>;
};

export function paymentMethodSecretRecordId(userId: string, methodId: string): string {
  return `payment-method:${userId}:${methodId}`;
}

type PaymentMethodRow = {
  id: string;
  userId: string;
  kind: string;
  label: string;
  institution: string | null;
  accountMask: string | null;
  last4: string | null;
  holderName: string | null;
  currency: string;
  billingDay: number | null;
  repaymentDay: number | null;
  creditLimitCents: number | null;
  balanceCents: number | null;
  isDefault: boolean;
  accentColor: string | null;
  secretCiphertext: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type FinanceBillRow = {
  id: string;
  userId: string;
  direction: string;
  amountCents: number;
  currency: string;
  category: string;
  title: string;
  note: string | null;
  occurredAt: Date;
  paymentMethodId: string | null;
  paymentMethodLabel: string | null;
  status: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeKind(value: string): PaymentMethodKind {
  const parsed = PaymentMethodKindSchema.safeParse(value);
  return parsed.success ? parsed.data : "other";
}

function normalizeAccent(value: string | null): PaymentCardAccent | null {
  if (!value) return null;
  const parsed = PaymentCardAccentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeDirection(value: string): FinanceBillDirection {
  const parsed = FinanceBillDirectionSchema.safeParse(value);
  return parsed.success ? parsed.data : "expense";
}

function normalizeCategory(value: string): FinanceBillCategory {
  const parsed = FinanceBillCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : "other_expense";
}

function normalizeStatus(value: string): FinanceBillStatus {
  const parsed = FinanceBillStatusSchema.safeParse(value);
  return parsed.success ? parsed.data : "paid";
}

function normalizeSource(value: string): FinanceBillSource {
  const parsed = FinanceBillSourceSchema.safeParse(value);
  return parsed.success ? parsed.data : "manual";
}

export function toPaymentMethodSummary(row: PaymentMethodRow): PaymentMethodSummary {
  return {
    id: row.id,
    kind: normalizeKind(row.kind),
    label: row.label,
    institution: row.institution,
    accountMask: row.accountMask,
    last4: row.last4,
    holderName: row.holderName,
    currency: row.currency || "CNY",
    billingDay: row.billingDay,
    repaymentDay: row.repaymentDay,
    creditLimitCents: row.creditLimitCents,
    balanceCents: row.balanceCents,
    isDefault: row.isDefault,
    accentColor: normalizeAccent(row.accentColor),
    hasSensitiveDetails: Boolean(row.secretCiphertext),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toFinanceBill(row: FinanceBillRow): FinanceBill {
  return {
    id: row.id,
    direction: normalizeDirection(row.direction),
    amountCents: row.amountCents,
    currency: row.currency || "CNY",
    category: normalizeCategory(row.category),
    title: row.title,
    note: row.note,
    occurredAt: row.occurredAt.toISOString(),
    paymentMethodId: row.paymentMethodId,
    paymentMethodLabel: row.paymentMethodLabel,
    status: normalizeStatus(row.status),
    source: normalizeSource(row.source),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function listUserPaymentMethods(
  prisma: PrismaClient,
  userId: string,
): Promise<PaymentMethodSummary[]> {
  const rows = await prisma.userPaymentMethod.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(toPaymentMethodSummary);
}

export async function upsertUserPaymentMethod(
  prisma: PrismaClient,
  userId: string,
  input: UpsertPaymentMethodInput,
  secretOps: Pick<PaymentMethodSecretOps, "seal" | "remove">,
): Promise<PaymentMethodSummary> {
  const existing = input.id
    ? await prisma.userPaymentMethod.findFirst({ where: { id: input.id, userId } })
    : null;
  if (input.id && !existing) {
    throw new Error("Payment method not found");
  }

  const id = existing?.id ?? createRowId();
  const recordId = paymentMethodSecretRecordId(userId, id);
  const cleanedSensitive =
    input.sensitive === undefined ? undefined : compactPaymentSensitivePayload(input.sensitive);

  let nextCiphertext: string | null | undefined = existing?.secretCiphertext ?? null;
  let derivedMask: { accountMask: string | null; last4: string | null } | null = null;
  if (cleanedSensitive !== undefined) {
    if (cleanedSensitive === null) {
      if (existing?.secretCiphertext) {
        await secretOps.remove?.(existing.secretCiphertext, recordId).catch(() => undefined);
      }
      nextCiphertext = null;
    } else {
      nextCiphertext = await secretOps.seal(JSON.stringify(cleanedSensitive), recordId);
      if (cleanedSensitive.accountNumber) {
        derivedMask = maskPaymentAccountNumber(cleanedSensitive.accountNumber, input.kind);
      }
    }
  }

  const accountMask =
    derivedMask?.accountMask ??
    (input.accountMask !== undefined
      ? normalizeOptionalText(input.accountMask)
      : (existing?.accountMask ?? null));
  const last4 =
    derivedMask?.last4 ??
    (input.last4 !== undefined ? normalizeOptionalText(input.last4) : (existing?.last4 ?? null));

  const isDefault = input.isDefault ?? existing?.isDefault ?? false;
  const saved = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.userPaymentMethod.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    if (existing) {
      return tx.userPaymentMethod.update({
        where: { id },
        data: {
          kind: input.kind,
          label: input.label.trim(),
          institution:
            input.institution !== undefined
              ? normalizeOptionalText(input.institution)
              : existing.institution,
          accountMask,
          last4,
          holderName:
            input.holderName !== undefined
              ? normalizeOptionalText(input.holderName)
              : existing.holderName,
          currency: input.currency ?? existing.currency,
          billingDay: input.billingDay !== undefined ? input.billingDay : existing.billingDay,
          repaymentDay:
            input.repaymentDay !== undefined ? input.repaymentDay : existing.repaymentDay,
          creditLimitCents:
            input.creditLimitCents !== undefined
              ? input.creditLimitCents
              : existing.creditLimitCents,
          balanceCents:
            input.balanceCents !== undefined ? input.balanceCents : existing.balanceCents,
          isDefault,
          accentColor: input.accentColor !== undefined ? input.accentColor : existing.accentColor,
          secretCiphertext: nextCiphertext,
        },
      });
    }
    return tx.userPaymentMethod.create({
      data: {
        id,
        userId,
        kind: input.kind,
        label: input.label.trim(),
        institution: normalizeOptionalText(input.institution),
        accountMask,
        last4,
        holderName: normalizeOptionalText(input.holderName),
        currency: input.currency ?? "CNY",
        billingDay: input.billingDay ?? null,
        repaymentDay: input.repaymentDay ?? null,
        creditLimitCents: input.creditLimitCents ?? null,
        balanceCents: input.balanceCents ?? null,
        isDefault,
        accentColor: input.accentColor ?? null,
        secretCiphertext: nextCiphertext,
      },
    });
  });

  return toPaymentMethodSummary(saved);
}

export async function revealUserPaymentMethodSecrets(
  prisma: PrismaClient,
  userId: string,
  methodId: string,
  secretOps: Pick<PaymentMethodSecretOps, "open">,
): Promise<PaymentMethodSensitivePayload | null> {
  const row = await prisma.userPaymentMethod.findFirst({ where: { id: methodId, userId } });
  if (!row) return null;
  if (!row.secretCiphertext) return {};
  const recordId = paymentMethodSecretRecordId(userId, row.id);
  const plaintext = await secretOps.open(row.secretCiphertext, recordId);
  const parsed = PaymentMethodSensitivePayloadSchema.safeParse(JSON.parse(plaintext));
  return parsed.success ? parsed.data : {};
}

export async function removeUserPaymentMethod(
  prisma: PrismaClient,
  userId: string,
  methodId: string,
  secretOps?: Pick<PaymentMethodSecretOps, "remove">,
): Promise<boolean> {
  const row = await prisma.userPaymentMethod.findFirst({ where: { id: methodId, userId } });
  if (!row) return false;
  if (row.secretCiphertext) {
    await secretOps
      ?.remove?.(row.secretCiphertext, paymentMethodSecretRecordId(userId, row.id))
      .catch(() => undefined);
  }
  await prisma.userPaymentMethod.deleteMany({ where: { id: row.id, userId } });
  return true;
}

export async function upsertUserFinanceBill(
  prisma: PrismaClient,
  userId: string,
  input: UpsertFinanceBillInput,
  options?: { source?: FinanceBillSource },
): Promise<FinanceBill> {
  const existing = input.id
    ? await prisma.userFinanceBill.findFirst({ where: { id: input.id, userId } })
    : null;
  if (input.id && !existing) {
    throw new Error("Finance bill not found");
  }

  let resolvedMethodId: string | null =
    input.paymentMethodId !== undefined
      ? input.paymentMethodId
      : (existing?.paymentMethodId ?? null);
  let resolvedMethodLabel: string | null =
    input.paymentMethodLabel !== undefined
      ? normalizeOptionalText(input.paymentMethodLabel)
      : (existing?.paymentMethodLabel ?? null);

  if (resolvedMethodId) {
    const method = await prisma.userPaymentMethod.findFirst({
      where: { id: resolvedMethodId, userId },
      select: { id: true, label: true },
    });
    if (method) {
      resolvedMethodLabel = method.label;
    } else {
      resolvedMethodId = null;
    }
  }

  const occurredAt = new Date(input.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Invalid occurredAt timestamp");
  }

  const saved = existing
    ? await prisma.userFinanceBill.update({
        where: { id: existing.id },
        data: {
          direction: input.direction,
          amountCents: input.amountCents,
          currency: input.currency ?? existing.currency,
          category: input.category,
          title: input.title.trim(),
          note: input.note !== undefined ? normalizeOptionalText(input.note) : existing.note,
          occurredAt,
          paymentMethodId: resolvedMethodId,
          paymentMethodLabel: resolvedMethodLabel,
          status: input.status ?? existing.status,
        },
      })
    : await prisma.userFinanceBill.create({
        data: {
          id: createRowId(),
          userId,
          direction: input.direction,
          amountCents: input.amountCents,
          currency: input.currency ?? "CNY",
          category: input.category,
          title: input.title.trim(),
          note: normalizeOptionalText(input.note),
          occurredAt,
          paymentMethodId: resolvedMethodId,
          paymentMethodLabel: resolvedMethodLabel,
          status: input.status ?? "paid",
          source: options?.source ?? "manual",
        },
      });

  return toFinanceBill(saved);
}

export async function removeUserFinanceBill(
  prisma: PrismaClient,
  userId: string,
  billId: string,
): Promise<boolean> {
  const deleted = await prisma.userFinanceBill.deleteMany({ where: { id: billId, userId } });
  return deleted.count > 0;
}

export async function getUserPersonalFinanceOverview(
  prisma: PrismaClient,
  userId: string,
  input: PersonalFinanceOverviewInput = {},
): Promise<PersonalFinanceOverview> {
  const targetMonth = input.month ?? currentMonthKey();
  const limit = input.limit ?? 200;
  const [methodRows, billRows] = await Promise.all([
    prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.userFinanceBill.findMany({
      where: { userId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 1000,
    }),
  ]);

  const methods = methodRows.map(toPaymentMethodSummary);
  const allBills = billRows.map(toFinanceBill);
  const summary = summarizeFinanceMonth(allBills, targetMonth, { methods });

  const normalizedQuery = input.query?.trim().toLowerCase() ?? "";
  const filteredBills = allBills
    .filter((bill) => {
      if (input.month && monthKeyFromIso(bill.occurredAt) !== input.month) return false;
      if (input.direction && bill.direction !== input.direction) return false;
      if (input.category && bill.category !== input.category) return false;
      if (input.paymentMethodId && bill.paymentMethodId !== input.paymentMethodId) return false;
      if (normalizedQuery) {
        const haystack = [bill.title, bill.note ?? "", bill.paymentMethodLabel ?? "", bill.category]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    })
    .slice(0, limit);

  return {
    methods,
    bills: filteredBills,
    summary,
    syncedAt: new Date().toISOString(),
  };
}
