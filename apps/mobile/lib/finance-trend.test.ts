import type { FinanceBill } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { buildFinanceTrend, financeTrendCurrencies } from "./finance-trend";

function bill(patch: Partial<FinanceBill>): FinanceBill {
  return {
    id: "bill",
    direction: "expense",
    amountCents: 1250,
    currency: "CNY",
    category: "food",
    title: "Lunch",
    occurredAt: "2026-11-02T12:00:00.000Z",
    status: "paid",
    paymentMethodId: null,
    paymentMethodLabel: null,
    note: null,
    source: "manual",
    createdAt: "2026-11-02T12:00:00.000Z",
    updatedAt: "2026-11-02T12:00:00.000Z",
    ...patch,
  };
}

describe("daily finance trend", () => {
  it("aggregates by day and currency without mixing transfers or other months", () => {
    const bills = [
      bill({}),
      bill({ amountCents: 250 }),
      bill({ direction: "income", amountCents: 40000 }),
      bill({ direction: "transfer", amountCents: 500000 }),
      bill({ currency: "USD", amountCents: 1000 }),
      bill({ occurredAt: "2026-10-02T12:00:00Z" }),
    ];
    const days = buildFinanceTrend(bills, "2026-11", "CNY");
    expect(days).toHaveLength(30);
    expect(days[0]).toEqual({ day: 1, incomeCents: 0, expenseCents: 0 });
    expect(days[1]).toEqual({ day: 2, incomeCents: 40000, expenseCents: 1500 });
    expect(financeTrendCurrencies(bills, "2026-11")).toEqual(["CNY", "USD"]);
    expect(buildFinanceTrend(bills, "2026-11", "USD")[1]?.expenseCents).toBe(1000);
  });

  it.each([
    ["2024-02", 29],
    ["2026-02", 28],
    ["2026-12", 31],
  ] as const)("fills all days of %s", (month, count) => {
    expect(buildFinanceTrend([], month, "CNY")).toHaveLength(count);
  });

  it("recomputes added, edited and deleted entries without keeping stale totals", () => {
    const original = [bill({ id: "one" })];
    expect(buildFinanceTrend(original, "2026-11", "CNY")[1]?.expenseCents).toBe(1250);
    const added = [...original, bill({ id: "two", amountCents: 500 })];
    expect(buildFinanceTrend(added, "2026-11", "CNY")[1]?.expenseCents).toBe(1750);
    const edited = added.map((entry) =>
      entry.id === "one" ? { ...entry, amountCents: 200 } : entry,
    );
    expect(buildFinanceTrend(edited, "2026-11", "CNY")[1]?.expenseCents).toBe(700);
    expect(buildFinanceTrend([], "2026-11", "CNY")[1]?.expenseCents).toBe(0);
  });
});
