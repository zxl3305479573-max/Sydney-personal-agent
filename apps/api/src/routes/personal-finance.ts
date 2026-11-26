import { ORPCError } from "@orpc/server";
import { createAdapterContext } from "@rakazo/adapter-kit";
import { parseNaturalBillText } from "@rakazo/contracts";
import type { PaymentMethodSecretOps } from "@rakazo/db";
import {
  getUserPersonalFinanceOverview,
  listUserPaymentMethods,
  recordAuditEvent,
  recordSecurityEvent,
  removeUserFinanceBill,
  removeUserPaymentMethod,
  revealUserPaymentMethodSecrets,
  upsertUserFinanceBill,
  upsertUserPaymentMethod,
} from "@rakazo/db";
import { requireIdentityConfirmation } from "../identity-confirmation.js";
import type { RouterContext } from "./context.js";

function secretOpsFor(
  ctx: RouterContext,
  actor: { userId: string; spaceId: string },
  signal?: AbortSignal,
): PaymentMethodSecretOps {
  const baseAdapterContext = createAdapterContext(actor, actor.userId, "personal-finance");
  const adapterContext = signal ? { ...baseAdapterContext, signal } : baseAdapterContext;
  return {
    seal: async (plaintext, recordId) => {
      const record = await ctx.deps.secrets.put(plaintext, adapterContext, { recordId });
      return record.ref;
    },
    open: (ciphertext, recordId) => ctx.deps.secrets.load(ciphertext, { recordId, signal }),
    remove: (ciphertext, recordId) => ctx.deps.secrets.delete(ciphertext, { recordId, signal }),
  };
}

export function personalFinanceRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    personalFinance: {
      overview: authed.personalFinance.overview.handler(({ context, input }) =>
        getUserPersonalFinanceOverview(deps.prisma, context.actor.userId, input ?? {}),
      ),
      upsertMethod: authed.personalFinance.upsertMethod.handler(async ({ context, input }) => {
        try {
          const saved = await upsertUserPaymentMethod(
            deps.prisma,
            context.actor.userId,
            input,
            secretOpsFor(ctx, context.actor, context.signal),
          );
          await recordAuditEvent({
            action: "personal_finance.method_saved",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_payment_method", id: saved.id },
            metadata: {
              kind: saved.kind,
              isDefault: saved.isDefault,
              hasSensitiveDetails: saved.hasSensitiveDetails,
            },
          });
          return saved;
        } catch (error) {
          if (error instanceof Error && error.message === "Payment method not found") {
            throw new ORPCError("NOT_FOUND", { message: error.message });
          }
          throw error;
        }
      }),
      revealMethod: authed.personalFinance.revealMethod.handler(async ({ context, input }) => {
        await requireIdentityConfirmation(deps.auth, context);
        const revealed = await revealUserPaymentMethodSecrets(
          deps.prisma,
          context.actor.userId,
          input.id,
          secretOpsFor(ctx, context.actor, context.signal),
        );
        if (!revealed) {
          throw new ORPCError("NOT_FOUND", { message: "Payment method not found" });
        }
        await Promise.all([
          recordSecurityEvent({
            type: "credential.revealed",
            userId: context.actor.userId,
            spaceId: context.actor.spaceId,
            metadata: {
              procedure: "personalFinance.revealMethod",
              kind: "payment_method",
              id: input.id,
            },
          }),
          recordAuditEvent({
            action: "personal_finance.method_revealed",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_payment_method", id: input.id },
            metadata: { kind: "payment_method" },
          }),
        ]);
        return revealed;
      }),
      removeMethod: authed.personalFinance.removeMethod.handler(async ({ context, input }) => {
        const removed = await removeUserPaymentMethod(
          deps.prisma,
          context.actor.userId,
          input.id,
          secretOpsFor(ctx, context.actor, context.signal),
        );
        if (removed) {
          await recordAuditEvent({
            action: "personal_finance.method_removed",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_payment_method", id: input.id },
            metadata: {},
          });
        }
        return { ok: true as const };
      }),
      upsertBill: authed.personalFinance.upsertBill.handler(async ({ context, input }) => {
        try {
          const saved = await upsertUserFinanceBill(deps.prisma, context.actor.userId, input, {
            source: "manual",
          });
          await recordAuditEvent({
            action: "personal_finance.bill_saved",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_finance_bill", id: saved.id },
            metadata: {
              direction: saved.direction,
              category: saved.category,
              currency: saved.currency,
              status: saved.status,
            },
          });
          return saved;
        } catch (error) {
          if (error instanceof Error && error.message === "Finance bill not found") {
            throw new ORPCError("NOT_FOUND", { message: error.message });
          }
          if (error instanceof Error && error.message === "Invalid occurredAt timestamp") {
            throw new ORPCError("BAD_REQUEST", { message: error.message });
          }
          throw error;
        }
      }),
      removeBill: authed.personalFinance.removeBill.handler(async ({ context, input }) => {
        const removed = await removeUserFinanceBill(deps.prisma, context.actor.userId, input.id);
        if (removed) {
          await recordAuditEvent({
            action: "personal_finance.bill_removed",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "user_finance_bill", id: input.id },
            metadata: {},
          });
        }
        return { ok: true as const };
      }),
      importLocal: authed.personalFinance.importLocal.handler(async ({ context, input }) => {
        const ops = secretOpsFor(ctx, context.actor, context.signal);
        const existingMethods = await listUserPaymentMethods(deps.prisma, context.actor.userId);
        const existingOverview = await getUserPersonalFinanceOverview(
          deps.prisma,
          context.actor.userId,
          { limit: 500 },
        );
        const methodKey = (m: { kind: string; label: string; last4?: string | null }) =>
          `${m.kind}:${m.label.trim().toLowerCase()}:${(m.last4 ?? "").trim()}`;
        const existingMethodByKey = new Map(existingMethods.map((m) => [methodKey(m), m]));
        const localToServerMethodId = new Map<string, string>();
        let importedMethods = 0;

        for (const method of input.methods) {
          const key = methodKey(method);
          const matched = existingMethodByKey.get(key);
          if (matched) {
            if (method.id) localToServerMethodId.set(method.id, matched.id);
            continue;
          }
          const { id: localId, ...createPayload } = method;
          const created = await upsertUserPaymentMethod(
            deps.prisma,
            context.actor.userId,
            createPayload,
            ops,
          );
          if (localId) localToServerMethodId.set(localId, created.id);
          existingMethodByKey.set(methodKey(created), created);
          importedMethods += 1;
        }

        const billKey = (b: {
          occurredAt: string;
          amountCents: number;
          direction: string;
          title: string;
        }) =>
          `${b.occurredAt.slice(0, 19)}:${b.amountCents}:${b.direction}:${b.title.trim().toLowerCase()}`;
        const existingBillKeys = new Set(existingOverview.bills.map(billKey));
        let importedBills = 0;

        for (const bill of input.bills) {
          const key = billKey(bill);
          if (existingBillKeys.has(key)) continue;
          const { id: _localId, paymentMethodId, ...rest } = bill;
          const mappedMethodId = paymentMethodId
            ? (localToServerMethodId.get(paymentMethodId) ?? paymentMethodId)
            : null;
          await upsertUserFinanceBill(
            deps.prisma,
            context.actor.userId,
            { ...rest, paymentMethodId: mappedMethodId },
            { source: "manual" },
          );
          existingBillKeys.add(key);
          importedBills += 1;
        }

        return { importedMethods, importedBills };
      }),
      parseDraft: authed.personalFinance.parseDraft.handler(async ({ context, input }) => {
        try {
          if (deps.financeBillParser) {
            return await deps.financeBillParser(context.actor, input, context.signal);
          }
          if (input.text?.trim()) {
            const methods = await listUserPaymentMethods(deps.prisma, context.actor.userId);
            const now =
              input.nowIso && !Number.isNaN(new Date(input.nowIso).getTime())
                ? new Date(input.nowIso)
                : new Date();
            return parseNaturalBillText(input.text, methods, now);
          }
          throw new ORPCError("BAD_REQUEST", {
            message: "Receipt image parsing is unavailable without a configured multimodal model.",
          });
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          throw new ORPCError("BAD_REQUEST", {
            message:
              error instanceof Error
                ? error.message
                : "Could not parse bill details from the provided input.",
          });
        }
      }),
    },
  };
}
