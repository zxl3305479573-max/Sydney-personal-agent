// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeFinanceCard } from "../components/home-finance-card";
import type { PersonalFinanceState } from "./personal-finance";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  setFinanceHideAmounts: vi.fn<(hide: boolean) => Promise<void>>(async () => undefined),
  refreshPersonalFinance: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: "zh-CN", t: (text: string) => text }),
}));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    background: "#F1EEE8",
    card: "#FFFFFF",
    foreground: "#1B1916",
    mutedForeground: "#6F6A61",
    muted: "#E8E4DC",
    border: "#DCD7CE",
    primary: "#1B1916",
  }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => <i data-symbol={ios} />,
}));
vi.mock("react-native-svg", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    __esModule: true,
    default: Pass,
    Svg: Pass,
    Defs: Pass,
    LinearGradient: Pass,
    Stop: () => null,
    Rect: () => null,
    Path: () => null,
    Circle: () => null,
    G: Pass,
  };
});
vi.mock("./personal-finance", () => ({
  usePersonalFinance: () => ({
    loaded: true,
    syncing: false,
    syncMode: "cloud",
    methods: [],
    bills: [],
    summary: {
      month: "2026-11",
      currency: "CNY",
      totalExpenseCents: 0,
      totalIncomeCents: 0,
      totalTransferCents: 0,
      netCents: 0,
      billCount: 0,
      byCategory: [],
      byPaymentMethod: [],
    },
    syncedAt: null,
    hideAmounts: false,
    error: null,
  }),
  refreshPersonalFinance: () => state.refreshPersonalFinance(),
  setFinanceHideAmounts: (v: boolean) => state.setFinanceHideAmounts(v),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    Platform: { OS: "ios" },
    StyleSheet: { hairlineWidth: 1 },
    View: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => (
      <div data-testid={testID} style={flatten(style)}>
        {children}
      </div>
    ),
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
      <span style={flatten(style)}>{children}</span>
    ),
    Pressable: ({
      children,
      accessibilityLabel,
      onPress,
      style,
      testID,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
      style?: unknown;
      testID?: string;
    }) => (
      <button
        type="button"
        data-testid={testID}
        aria-label={accessibilityLabel}
        onClick={onPress}
        style={flatten(typeof style === "function" ? style({ pressed: false }) : style)}
      >
        {children}
      </button>
    ),
  };
});

function sampleFinanceState(overrides: Partial<PersonalFinanceState> = {}): PersonalFinanceState {
  const todayDay = new Date().getDate();
  return {
    loaded: true,
    syncing: false,
    syncMode: "cloud",
    methods: [
      {
        id: "pm-1",
        kind: "credit_card",
        label: "招行经典白",
        institution: "招商银行",
        accountMask: "•••• 8842",
        last4: "8842",
        holderName: "张三",
        currency: "CNY",
        billingDay: 5,
        repaymentDay: todayDay,
        creditLimitCents: 5_000_000,
        balanceCents: null,
        isDefault: true,
        accentColor: "obsidian",
        hasSensitiveDetails: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
      },
      {
        id: "pm-2",
        kind: "alipay",
        label: "支付宝",
        institution: "支付宝",
        accountMask: "138****5678",
        last4: "5678",
        holderName: null,
        currency: "CNY",
        billingDay: null,
        repaymentDay: null,
        creditLimitCents: null,
        balanceCents: null,
        isDefault: false,
        accentColor: "navy",
        hasSensitiveDetails: true,
        createdAt: "2026-11-01T00:00:00.000Z",
        updatedAt: "2026-11-24T00:00:00.000Z",
      },
    ],
    bills: [],
    summary: {
      month: "2026-11",
      currency: "CNY",
      totalExpenseCents: 128050,
      totalIncomeCents: 800000,
      totalTransferCents: 0,
      netCents: 671950,
      billCount: 12,
      byCategory: [],
      byPaymentMethod: [],
    },
    syncedAt: "2026-11-26T00:00:00.000Z",
    hideAmounts: false,
    error: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("HomeFinanceCard", () => {
  it("renders monthly spending, saved payment methods, repayment hint, and routes quick actions", () => {
    act(() =>
      root.render(
        <HomeFinanceCard
          cardStyle={{ backgroundColor: "#FFFEFC" }}
          financeState={sampleFinanceState()}
        />,
      ),
    );

    const text = container.textContent ?? "";
    expect(text).toContain("账单与支付");
    expect(text).toContain("¥1,280.50");
    expect(text).toContain("12 笔账单");
    expect(text).toContain("招行经典白");
    expect(text).toContain("8842");
    expect(text).toContain("支付宝");
    expect(container.querySelector('[data-testid="wallet-card-stack-compact"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="home-hub-finance-repayment-hint"]'),
    ).not.toBeNull();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="home-wallet-card-pm-1"]')!.click(),
    );
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/finance",
      params: { tab: "methods", cardId: "pm-1" },
    });

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="home-hub-finance-card"]')!.click(),
    );
    expect(state.push).toHaveBeenLastCalledWith("/finance");

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="home-hub-finance-add-bill"]')!
        .click(),
    );
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/finance",
      params: { tab: "bills", action: "add-bill" },
    });

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="home-hub-finance-methods"]')!
        .click(),
    );
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/finance",
      params: { tab: "methods" },
    });

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="home-hub-finance-privacy"]')!
        .click(),
    );
    expect(state.setFinanceHideAmounts).toHaveBeenCalledWith(true);
  });

  it("masks amounts when hideAmounts is enabled", () => {
    act(() =>
      root.render(
        <HomeFinanceCard
          cardStyle={{ backgroundColor: "#FFFEFC" }}
          financeState={sampleFinanceState({ hideAmounts: true })}
        />,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("••••");
    expect(text).not.toContain("¥1,280.50");
    expect(text).not.toContain("¥8,000.00");
  });
});
