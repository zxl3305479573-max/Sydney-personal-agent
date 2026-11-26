import { describe, expect, it } from "vitest";
import type { FinanceBill } from "./personal-finance.js";
import {
  daysUntilMonthlyDay,
  formatCardNumberGrouped,
  formatCents,
  maskPaymentAccountNumber,
  parseAmountToCents,
  shiftMonthKey,
  summarizeFinanceMonth,
} from "./personal-finance.js";

describe("personal-finance contracts", () => {
  it("masks bank cards, phones, emails, and crypto wallets without exposing full values", () => {
    expect(maskPaymentAccountNumber("6225 8801 4420 8842", "debit_card")).toEqual({
      accountMask: "•••• 8842",
      last4: "8842",
    });
    expect(maskPaymentAccountNumber("13812345678", "alipay")).toEqual({
      accountMask: "138****5678",
      last4: "5678",
    });
    expect(maskPaymentAccountNumber("alice@example.com", "paypal")).toEqual({
      accountMask: "al***@example.com",
      last4: null,
    });
    expect(
      maskPaymentAccountNumber("0x71C7656EC7ab88b098defB751B7401B5f6d8976F", "crypto_wallet"),
    ).toEqual({
      accountMask: "0x71C7…976F",
      last4: "976F",
    });
    expect(formatCardNumberGrouped("6225880144208842")).toBe("6225 8801 4420 8842");
  });

  it("parses exact decimal amounts to integer cents without floating-point drift", () => {
    expect(parseAmountToCents(19.99)).toBe(1999);
    expect(parseAmountToCents("¥1,234.56")).toBe(123456);
    expect(parseAmountToCents("38")).toBe(3800);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("-12.5")).toBeNull();
    expect(parseAmountToCents("12.345")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("formats cents cleanly across currencies and signs", () => {
    expect(formatCents(128050, "CNY")).toBe("¥1,280.50");
    expect(formatCents(50000, "CNY", { hideDecimalsWhenWhole: true })).toBe("¥500");
    expect(formatCents(4200, "USD", { signed: true })).toBe("+$42.00");
    expect(formatCents(-1590, "HKD")).toBe("-HK$15.90");
  });

  it("aggregates monthly bills by direction, category, and payment method", () => {
    const bills: FinanceBill[] = [
      {
        id: "b1",
        direction: "expense",
        amountCents: 3850,
        currency: "CNY",
        category: "food",
        title: "午饭",
        note: null,
        occurredAt: "2026-11-24T04:00:00.000Z",
        paymentMethodId: "pm1",
        paymentMethodLabel: "招行信用卡",
        status: "paid",
        source: "bot",
        createdAt: "2026-11-24T04:00:00.000Z",
        updatedAt: "2026-11-24T04:00:00.000Z",
      },
      {
        id: "b2",
        direction: "expense",
        amountCents: 12000,
        currency: "CNY",
        category: "transport",
        title: "加油",
        note: null,
        occurredAt: "2026-11-12T08:00:00.000Z",
        paymentMethodId: "pm1",
        paymentMethodLabel: "招行信用卡",
        status: "paid",
        source: "manual",
        createdAt: "2026-11-12T08:00:00.000Z",
        updatedAt: "2026-11-12T08:00:00.000Z",
      },
      {
        id: "b3",
        direction: "income",
        amountCents: 800000,
        currency: "CNY",
        category: "salary",
        title: "工资",
        note: null,
        occurredAt: "2026-11-05T02:00:00.000Z",
        paymentMethodId: "pm2",
        paymentMethodLabel: "工资卡",
        status: "paid",
        source: "manual",
        createdAt: "2026-11-05T02:00:00.000Z",
        updatedAt: "2026-11-05T02:00:00.000Z",
      },
      {
        id: "b4",
        direction: "expense",
        amountCents: 9900,
        currency: "CNY",
        category: "shopping",
        title: "上月消费",
        note: null,
        occurredAt: "2026-10-20T02:00:00.000Z",
        paymentMethodId: null,
        paymentMethodLabel: null,
        status: "paid",
        source: "manual",
        createdAt: "2026-10-20T02:00:00.000Z",
        updatedAt: "2026-10-20T02:00:00.000Z",
      },
    ];

    const summary = summarizeFinanceMonth(bills, "2026-11");
    expect(summary.totalExpenseCents).toBe(15850);
    expect(summary.totalIncomeCents).toBe(800000);
    expect(summary.netCents).toBe(784150);
    expect(summary.billCount).toBe(3);
    expect(summary.byCategory[0]).toEqual({ category: "transport", totalCents: 12000, count: 1 });
    expect(summary.byCategory[1]).toEqual({ category: "food", totalCents: 3850, count: 1 });
    expect(summary.byPaymentMethod[0]).toEqual({
      paymentMethodId: "pm1",
      label: "招行信用卡",
      totalCents: 15850,
      count: 2,
    });
  });

  it("calculates credit card countdown days and month shifts accurately", () => {
    expect(daysUntilMonthlyDay(26, new Date(2026, 10, 26))).toBe(0);
    expect(daysUntilMonthlyDay(29, new Date(2026, 10, 26))).toBe(3);
    expect(daysUntilMonthlyDay(5, new Date(2026, 10, 26))).toBe(9);
    // Clamps day 31 in February to Feb 28 (non-leap year 2026).
    expect(daysUntilMonthlyDay(31, new Date(2026, 1, 25))).toBe(3);
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });
});
