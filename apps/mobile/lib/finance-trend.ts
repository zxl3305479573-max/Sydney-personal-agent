import type { FinanceBill } from "@rakazo/contracts";
import { monthKeyFromIso } from "@rakazo/contracts";

export type FinanceTrendDay = {
  day: number;
  incomeCents: number;
  expenseCents: number;
};

export function financeTrendCurrencies(bills: readonly FinanceBill[], month: string): string[] {
  return [
    ...new Set(
      bills
        .filter((bill) => monthKeyFromIso(bill.occurredAt) === month)
        .map((bill) => bill.currency),
    ),
  ].sort();
}

export function buildFinanceTrend(
  bills: readonly FinanceBill[],
  month: string,
  currency: string,
): FinanceTrendDay[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year!, monthNumber!, 0).getDate();
  const days = Array.from({ length: dayCount }, (_, index) => ({
    day: index + 1,
    incomeCents: 0,
    expenseCents: 0,
  }));
  for (const bill of bills) {
    if (monthKeyFromIso(bill.occurredAt) !== month || bill.currency !== currency) continue;
    const day = Number(bill.occurredAt.slice(8, 10));
    const target = days[day - 1];
    if (!target) continue;
    if (bill.direction === "income") target.incomeCents += bill.amountCents;
    if (bill.direction === "expense") target.expenseCents += bill.amountCents;
  }
  return days;
}
