import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPersonalFinanceSessionCache,
  deletePaymentMethod,
  getPersonalFinanceState,
  refreshPersonalFinance,
  resetPersonalFinanceForTest,
  revealPaymentMethodSecrets,
  saveFinanceBill,
  savePaymentMethod,
  setFinanceHideAmounts,
} from "./personal-finance";

const mocks = vi.hoisted(() => {
  const secureMap = new Map<string, string>();
  return {
    secureMap,
    rpc: vi.fn(),
    loadSessionToken: vi.fn(async () => "token-1"),
  };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => mocks.secureMap.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mocks.secureMap.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mocks.secureMap.delete(key);
  }),
}));

vi.mock("expo-file-system", () => ({}));

vi.mock("./api", () => ({
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  loadSessionToken: () => mocks.loadSessionToken(),
}));

describe("mobile personal finance store", () => {
  beforeEach(() => {
    mocks.secureMap.clear();
    mocks.rpc.mockReset();
    mocks.loadSessionToken.mockResolvedValue("token-1");
    resetPersonalFinanceForTest();
  });

  afterEach(() => {
    resetPersonalFinanceForTest();
  });

  it("falls back to local Keychain storage when server returns 404, keeps secrets isolated, and migrates when server upgrades", async () => {
    // 1. Backend not upgraded yet -> 404 -> seamlessly enters local mode
    mocks.rpc.mockRejectedValueOnce(
      Object.assign(new Error("Procedure did not match"), { status: 404 }),
    );
    const initial = await refreshPersonalFinance();
    expect(initial.syncMode).toBe("local");

    // 2. Save a bank card locally -> secret stays in dedicated Keychain key, never in cache
    const savedMethod = await savePaymentMethod({
      kind: "debit_card",
      label: "招商银行储蓄卡",
      institution: "招商银行",
      isDefault: true,
      sensitive: {
        accountNumber: "6225880144201234",
        branchName: "深圳高新园支行",
      },
    });
    expect(savedMethod.id).toMatch(/^local_pm_/);
    expect(savedMethod.accountMask).toBe("•••• 1234");
    expect(savedMethod.hasSensitiveDetails).toBe(true);

    const cacheJson = mocks.secureMap.get("sydney.pf.cache.v1") ?? "";
    expect(cacheJson).not.toContain("6225880144201234");
    expect(cacheJson).not.toContain("深圳高新园支行");

    const revealed = await revealPaymentMethodSecrets(savedMethod.id);
    expect(revealed).toEqual({
      accountNumber: "6225880144201234",
      branchName: "深圳高新园支行",
    });

    // 3. Log a bill locally
    const savedBill = await saveFinanceBill({
      direction: "expense",
      amountCents: 4500,
      currency: "CNY",
      category: "food",
      title: "牛肉面",
      occurredAt: new Date().toISOString(),
      paymentMethodId: savedMethod.id,
    });
    expect(savedBill.paymentMethodLabel).toBe("招商银行储蓄卡");
    expect(getPersonalFinanceState().summary.totalExpenseCents).toBe(4500);

    // 4. Backend comes online -> auto-imports local records & wipes local secret copy
    mocks.rpc
      .mockResolvedValueOnce({ importedMethods: 1, importedBills: 1 })
      .mockResolvedValueOnce({
        methods: [{ ...savedMethod, id: "c_server_pm_1" }],
        bills: [{ ...savedBill, id: "c_server_bill_1", paymentMethodId: "c_server_pm_1" }],
        summary: getPersonalFinanceState().summary,
        syncedAt: "2026-11-26T00:30:00.000Z",
      });

    const synced = await refreshPersonalFinance();
    expect(synced.syncMode).toBe("cloud");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "personalFinance/importLocal",
      expect.objectContaining({
        methods: [
          expect.objectContaining({
            id: savedMethod.id,
            sensitive: { accountNumber: "6225880144201234", branchName: "深圳高新园支行" },
          }),
        ],
        bills: [expect.objectContaining({ title: "牛肉面", amountCents: 4500 })],
      }),
      { skipSpaceAuthRecovery: true },
    );
    // Local Keychain secret was wiped after cloud migration
    expect(await revealPaymentMethodSecrets(savedMethod.id)).toEqual({});
  });

  it("persists privacy mask preference and clears session data cleanly on sign-out", async () => {
    await setFinanceHideAmounts(true);
    expect(getPersonalFinanceState().hideAmounts).toBe(true);
    expect(mocks.secureMap.get("sydney.pf.hideAmounts.v1")).toBe("1");

    mocks.rpc.mockRejectedValueOnce(new Error("404 Not Found"));
    await refreshPersonalFinance();
    const method = await savePaymentMethod({
      kind: "alipay",
      label: "日常支付宝",
      sensitive: { accountNumber: "13800009999" },
    });
    expect(getPersonalFinanceState().methods).toHaveLength(1);

    await deletePaymentMethod(method.id);
    expect(getPersonalFinanceState().methods).toHaveLength(0);

    clearPersonalFinanceSessionCache();
    expect(getPersonalFinanceState().methods).toEqual([]);
    expect(getPersonalFinanceState().bills).toEqual([]);
  });
});
