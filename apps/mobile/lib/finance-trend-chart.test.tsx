// @vitest-environment jsdom
import type { FinanceBill } from "@rakazo/contracts";
import type { CSSProperties, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { FinanceTrendChart } from "../components/finance-trend-chart";

vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light",
  useMobileTokens: () => ({
    foreground: "#1B1916",
    background: "#F1EEE8",
    border: "#DCD7CE",
    muted: "#E8E4DC",
    mutedForeground: "#6F6A61",
  }),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  return {
    Text: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => (
      <span data-testid={testID} style={flatten(style)}>
        {children}
      </span>
    ),
    View: ({
      children,
      testID,
      style,
    }: {
      children?: ReactNode;
      testID?: string;
      style?: unknown;
    }) => (
      <div data-testid={testID} style={flatten(style)}>
        {children}
      </div>
    ),
  };
});
vi.mock("../components/motion-pressable", () => ({
  MotionPressable: ({
    children,
    onPress,
    disabled,
    testID,
    accessibilityState,
  }: {
    children?: ReactNode;
    onPress?: (event: unknown) => void;
    disabled?: boolean;
    testID?: string;
    accessibilityState?: { selected?: boolean };
  }) => (
    <button
      type="button"
      data-testid={testID}
      disabled={disabled}
      aria-pressed={accessibilityState?.selected}
      onClick={() => onPress?.({ nativeEvent: { locationX: 10 } })}
    >
      {children}
    </button>
  ),
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("react-native-svg", () => ({
  default: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  Line: () => <line />,
  Circle: () => <circle />,
  Polyline: ({ points }: { points: string }) => <polyline points={points} />,
}));

const baseBill: FinanceBill = {
  id: "expense",
  direction: "expense",
  amountCents: 12345,
  currency: "CNY",
  category: "food",
  title: "Lunch",
  occurredAt: "2026-11-30T10:00:00Z",
  status: "paid",
  paymentMethodId: null,
  paymentMethodLabel: null,
  note: null,
  source: "manual",
  createdAt: "2026-11-30T10:00:00Z",
  updatedAt: "2026-11-30T10:00:00Z",
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows live edits, day navigation, currency separation, privacy and empty states", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (bills: FinanceBill[], hideAmounts = false, month = "2026-11") =>
    act(() =>
      root.render(<FinanceTrendChart bills={bills} month={month} hideAmounts={hideAmounts} />),
    );
  const entries = [
    baseBill,
    { ...baseBill, id: "income", direction: "income" as const, amountCents: 50000 },
    { ...baseBill, id: "usd", currency: "USD", amountCents: 1000 },
  ];
  render(entries);
  expect(container.textContent).toContain("123.45");
  expect(container.textContent).toContain("500.00");
  expect(container.querySelectorAll("polyline")).toHaveLength(2);
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-testid="finance-trend-prev-day"]')!.click(),
  );
  expect(container.querySelector('[data-testid="finance-trend-day"]')?.textContent).toContain(
    "2026-11-29",
  );
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-testid="finance-trend-plot"]')!.click(),
  );
  expect(container.querySelector('[data-testid="finance-trend-day"]')?.textContent).toContain(
    "2026-11-01",
  );
  const usdButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "USD",
  )!;
  act(() => usdButton.click());
  expect(container.textContent).toContain("10.00");
  expect(container.textContent).not.toContain("123.45");
  act(() =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "CNY")!
      .click(),
  );
  render([{ ...baseBill, amountCents: 23456 }]);
  expect(container.textContent).toContain("234.56");
  expect(container.textContent).not.toContain("123.45");
  render(entries, true);
  expect(container.querySelector("svg")).toBeNull();
  expect(container.innerHTML).not.toContain("123.45");
  expect(container.querySelector('[data-testid="finance-trend-hidden"]')).not.toBeNull();
  render([]);
  expect(container.querySelector('[data-testid="finance-trend-empty"]')).not.toBeNull();
  render(entries, false, "2026-10");
  expect(container.querySelector('[data-testid="finance-trend-empty"]')).not.toBeNull();
  act(() => root.unmount());
});
