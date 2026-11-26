// @vitest-environment jsdom
import type { FinanceBill, PaymentMethodSummary } from "@rakazo/contracts";
import type { CSSProperties, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletCardFocusModal } from "../components/wallet-card-focus-modal";
import { orderWalletDeck, WalletCardStack } from "../components/wallet-card-stack";
import { resolveWalletCardVisual } from "./personal-finance-ui";

const mocks = vi.hoisted(() => ({
  revealPaymentMethodSecrets: vi.fn(async () => ({
    accountNumber: "5482990011224454",
    expiryMonth: "09",
    expiryYear: "29",
    cvv: "842",
    note: "可用于 Apple Pay",
  })),
  setStringAsync: vi.fn(async () => undefined),
}));

vi.mock("expo-clipboard", () => ({
  setStringAsync: mocks.setStringAsync,
}));
vi.mock("./personal-finance", () => ({
  revealPaymentMethodSecrets: mocks.revealPaymentMethodSecrets,
}));
vi.mock("../components/confirm-identity", () => ({
  useIdentityConfirmation: () => ({
    withIdentityConfirmation: <T,>(action: () => Promise<T>) => action(),
    identityDialog: null,
  }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
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
vi.mock("react-native-reanimated", async () => {
  const { useRef } = await import("react");
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
        <div style={Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean))}>
          {children}
        </div>
      ),
    },
    Easing: { out: () => (v: number) => v, cubic: (v: number) => v },
    useSharedValue: (initial: number) => {
      const ref = useRef<{ value: number } | null>(null);
      if (!ref.current) ref.current = { value: initial };
      return ref.current;
    },
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (v: number) => v,
    withTiming: (v: number) => v,
  };
});
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
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    Platform: { OS: "ios" },
    Alert: { alert: vi.fn() },
    StyleSheet: {
      hairlineWidth: 1,
      absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    },
    Modal: ({ visible, children }: { visible?: boolean; children?: ReactNode }) =>
      visible ? <div data-testid="wallet-focus-modal">{children}</div> : null,
    ScrollView: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
      <div style={flatten(style)}>{children}</div>
    ),
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
      disabled,
      onPress,
      style,
      testID,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      disabled?: boolean;
      onPress?: () => void;
      style?: unknown;
      testID?: string;
    }) => (
      <button
        type="button"
        disabled={disabled}
        data-testid={testID}
        aria-label={accessibilityLabel}
        onClick={disabled ? undefined : onPress}
        style={flatten(typeof style === "function" ? style({ pressed: false }) : style)}
      >
        {children}
      </button>
    ),
  };
});

function sampleMethod(overrides: Partial<PaymentMethodSummary>): PaymentMethodSummary {
  return {
    id: "pm-1",
    kind: "debit_card",
    label: "中国工商银行",
    institution: "中国工商银行",
    accountMask: "•••• 2043",
    last4: "2043",
    holderName: "张三",
    currency: "CNY",
    billingDay: null,
    repaymentDay: null,
    creditLimitCents: null,
    balanceCents: null,
    isDefault: false,
    accentColor: null,
    hasSensitiveDetails: true,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
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

describe("Apple Wallet stacked deck and single-tap focus view", () => {
  it("resolves distinct brand motifs and strict 6-digit hex stops for SVG gradients", () => {
    const bybit = resolveWalletCardVisual({
      kind: "credit_card",
      label: "BYBIT",
      institution: "Bybit Mastercard",
    });
    expect(bybit.motif).toBe("guilloche");
    expect(bybit.badge).toBe("mastercard");
    expect(bybit.isLightCard).toBe(true);

    const cmb = resolveWalletCardVisual({
      kind: "debit_card",
      label: "招商银行",
      institution: "招商银行",
    });
    expect(cmb.motif).toBe("radial");
    expect(cmb.badge).toBe("unionpay");

    const icbc = resolveWalletCardVisual({
      kind: "debit_card",
      label: "ICBC 中国工商银行",
      institution: "中国工商银行",
    });
    expect(icbc.motif).toBe("metallic");

    for (const v of [bybit, cmb, icbc]) {
      expect(v.gradientStart).toMatch(/^#[0-9A-F]{6}$/i);
      expect(v.gradientMid).toMatch(/^#[0-9A-F]{6}$/i);
      expect(v.gradientEnd).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("places the primary/default card at the front (bottom) of the stacked deck and handles single-tap selection", () => {
    const icbc = sampleMethod({ id: "pm-icbc", label: "中国工商银行", isDefault: true });
    const bybit = sampleMethod({
      id: "pm-bybit",
      label: "BYBIT",
      institution: "Bybit",
      last4: "4454",
      accountMask: "•••• 4454",
    });
    const cmb = sampleMethod({
      id: "pm-cmb",
      label: "招商银行",
      institution: "招商银行",
      last4: "8842",
      accountMask: "•••• 8842",
    });

    const ordered = orderWalletDeck([icbc, bybit, cmb]);
    expect(ordered.map((m) => m.id)).toEqual(["pm-bybit", "pm-cmb", "pm-icbc"]);

    const onSelectCard = vi.fn();
    act(() =>
      root.render(<WalletCardStack methods={[icbc, bybit, cmb]} onSelectCard={onSelectCard} />),
    );

    expect(container.querySelector('[data-testid="wallet-card-stack"]')).not.toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="finance-method-card-pm-bybit"]')!
        .click(),
    );
    expect(onSelectCard).toHaveBeenCalledWith(bybit);
  });

  it("opens single-tap focus stage with ×, 123 reveal, ··· menu, info card, linked bills, and bottom return dock", async () => {
    const bybit = sampleMethod({
      id: "pm-bybit",
      kind: "credit_card",
      label: "BYBIT",
      institution: "Bybit",
      accountMask: "•••• 4454",
      last4: "4454",
    });
    const icbc = sampleMethod({ id: "pm-icbc", label: "中国工商银行", isDefault: true });
    const bill: FinanceBill = {
      id: "bill-1",
      direction: "expense",
      amountCents: 6800,
      currency: "CNY",
      category: "food",
      title: "咖啡轻食",
      note: null,
      occurredAt: new Date().toISOString(),
      paymentMethodId: "pm-bybit",
      paymentMethodLabel: "BYBIT",
      status: "paid",
      source: "manual",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const onClose = vi.fn();
    const onEdit = vi.fn();
    const onAddBillWithCard = vi.fn();

    act(() =>
      root.render(
        <WalletCardFocusModal
          method={bybit}
          otherMethods={[icbc]}
          bills={[bill]}
          onClose={onClose}
          onEdit={onEdit}
          onSetDefault={vi.fn(async () => undefined)}
          onAddBillWithCard={onAddBillWithCard}
          onFilterBills={vi.fn()}
          onSelectBill={vi.fn()}
          onDelete={vi.fn(async () => undefined)}
        />,
      ),
    );

    expect(container.textContent).toContain("BYBIT");
    expect(container.textContent).toContain("•••• 4454");
    expect(container.textContent).toContain("来自：Bybit");
    expect(container.textContent).toContain("咖啡轻食");
    expect(container.querySelector('[data-testid="wallet-focus-revealed-box"]')).toBeNull();

    // Tap top-right 123 button -> decrypts and displays full grouped card number & CVV
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="wallet-focus-reveal-123"]')!
        .click();
    });
    expect(mocks.revealPaymentMethodSecrets).toHaveBeenCalledWith("pm-bybit");
    expect(container.querySelector('[data-testid="wallet-focus-revealed-box"]')).not.toBeNull();
    expect(container.textContent).toContain("5482 9900 1122 4454");
    expect(container.textContent).toContain("842");

    // Tap top-right ··· button -> opens action menu
    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="wallet-focus-more"]')!.click(),
    );
    expect(container.querySelector('[data-testid="wallet-focus-more-menu"]')).not.toBeNull();

    // Tap bottom collapsed stack -> returns to stacked deck
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="wallet-focus-bottom-stack"]')!
        .click(),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
