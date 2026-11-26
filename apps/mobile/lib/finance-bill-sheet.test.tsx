// @vitest-environment jsdom
import type { PaymentMethodSummary } from "@rakazo/contracts";
import type { CSSProperties, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceBillSheet } from "../components/finance-bill-sheet";

const mocks = vi.hoisted(() => ({
  takePhoto: vi.fn(async () => ({
    attachments: [
      {
        name: "receipt.jpg",
        mimeType: "image/jpeg",
        contentBase64: "AAAA",
        previewUri: "file:///tmp/receipt.jpg",
      },
    ],
    skipped: [],
  })),
  pickFromLibrary: vi.fn(async () => ({
    attachments: [
      {
        name: "alipay.png",
        mimeType: "image/png",
        contentBase64: "BBBB",
        previewUri: "file:///tmp/alipay.png",
      },
    ],
    skipped: [],
  })),
  parseFinanceBillDraft: vi.fn(),
  dictationAvailable: vi.fn(async () => true),
  dictationListen: vi.fn(),
  dictationStop: vi.fn(),
}));

vi.mock("../lib/pick-attachments", () => ({
  takePhoto: mocks.takePhoto,
  pickFromLibrary: mocks.pickFromLibrary,
}));
vi.mock("../lib/personal-finance", () => ({
  parseFinanceBillDraft: mocks.parseFinanceBillDraft,
}));
vi.mock("../lib/dictation", () => ({
  available: mocks.dictationAvailable,
  listen: mocks.dictationListen,
  stop: mocks.dictationStop,
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
vi.mock("../components/app-modal-sheet", () => ({
  AppModalSheet: ({ visible, children }: { visible: boolean; children?: ReactNode }) =>
    visible ? <div data-testid="bill-sheet-modal">{children}</div> : null,
}));
vi.mock("../components/motion-pressable", () => ({
  MotionPressable: ({
    children,
    onPress,
    disabled,
    testID,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    testID?: string;
  }) => (
    <button type="button" data-testid={testID} disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    Platform: { OS: "ios" },
    Alert: { alert: vi.fn() },
    ActivityIndicator: () => <span data-testid="spinner" />,
    StyleSheet: { hairlineWidth: 1 },
    Image: ({ source }: { source: { uri?: string } }) => <img alt="receipt" src={source?.uri} />,
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
    TextInput: ({
      value,
      onChangeText,
      testID,
      placeholder,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      testID?: string;
      placeholder?: string;
    }) => (
      <input
        data-testid={testID}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChangeText?.(e.target.value)}
      />
    ),
  };
});

const SAMPLE_METHODS: PaymentMethodSummary[] = [
  {
    id: "pm-wx",
    kind: "wechat_pay",
    label: "微信零钱",
    institution: "腾讯",
    accountMask: "138****5678",
    last4: "5678",
    holderName: null,
    currency: "CNY",
    billingDay: null,
    repaymentDay: null,
    creditLimitCents: null,
    balanceCents: null,
    isDefault: true,
    accentColor: "emerald",
    hasSensitiveDetails: false,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  },
];

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

describe("FinanceBillSheet smart receipt scan, voice input, and auto-categorize", () => {
  it("scans a receipt photo via camera, auto-classifies, and auto-saves when auto-save is ON", async () => {
    mocks.parseFinanceBillDraft.mockResolvedValueOnce({
      direction: "expense",
      amountCents: 3850,
      currency: "CNY",
      category: "food",
      title: "星巴克咖啡",
      note: "大杯燕麦拿铁",
      occurredAt: "2026-11-26T05:00:00.000Z",
      paymentMethodId: "pm-wx",
      paymentMethodLabel: "微信零钱",
      status: "paid",
      parser: "ai",
      summary: null,
    });
    const onSave = vi.fn(async () => undefined);
    const onAutoSaved = vi.fn();
    const onClose = vi.fn();

    act(() =>
      root.render(
        <FinanceBillSheet
          visible
          editing={null}
          methods={SAMPLE_METHODS}
          onClose={onClose}
          onSave={onSave}
          onAutoSaved={onAutoSaved}
        />,
      ),
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="finance-bill-camera"]')!.click();
    });

    expect(mocks.takePhoto).toHaveBeenCalledOnce();
    expect(mocks.parseFinanceBillDraft).toHaveBeenCalledWith({
      imageBase64: "AAAA",
      imageMimeType: "image/jpeg",
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "expense",
        amountCents: 3850,
        category: "food",
        title: "星巴克咖啡",
        paymentMethodId: "pm-wx",
      }),
    );
    expect(onAutoSaved).toHaveBeenCalledWith(
      expect.objectContaining({ title: "星巴克咖啡", category: "food", sourceLabel: "photo" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uploads an album receipt with auto-save OFF to review fields before manual save", async () => {
    mocks.parseFinanceBillDraft.mockResolvedValueOnce({
      direction: "expense",
      amountCents: 8500,
      currency: "CNY",
      category: "transport",
      title: "滴滴快车",
      note: "机场线",
      occurredAt: "2026-11-26T06:00:00.000Z",
      paymentMethodId: "pm-wx",
      paymentMethodLabel: "微信零钱",
      status: "paid",
      parser: "ai",
      summary: null,
    });
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();

    act(() =>
      root.render(
        <FinanceBillSheet
          visible
          editing={null}
          methods={SAMPLE_METHODS}
          onClose={onClose}
          onSave={onSave}
        />,
      ),
    );

    // Toggle auto-save OFF
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="finance-bill-autosave-toggle"]')!
        .click();
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="finance-bill-album"]')!.click();
    });

    expect(mocks.pickFromLibrary).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="finance-bill-amount-input"]')?.value,
    ).toBe("85");
    expect(
      container.querySelector<HTMLInputElement>('[data-testid="finance-bill-title-input"]')?.value,
    ).toBe("滴滴快车");
    expect(
      container.querySelector('[data-testid="finance-bill-auto-category-badge"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="finance-bill-smart-notice"]')?.textContent,
    ).toContain("分类：交通");
  });

  it("listens via voice dictation, parses transcript, and auto-saves categorized bill", async () => {
    mocks.dictationListen.mockImplementation(
      (opts: { onInterim?: (t: string) => void; onFinal: (t: string) => void }) => {
        opts.onInterim?.("今天吃火锅花了 268 微信");
        opts.onFinal("今天吃火锅花了 268 微信");
        return Promise.resolve();
      },
    );
    mocks.parseFinanceBillDraft.mockResolvedValueOnce({
      direction: "expense",
      amountCents: 26800,
      currency: "CNY",
      category: "food",
      title: "吃火锅",
      note: "今天吃火锅花了 268 微信",
      occurredAt: "2026-11-26T05:00:00.000Z",
      paymentMethodId: "pm-wx",
      paymentMethodLabel: "微信零钱",
      status: "paid",
      parser: "local",
      summary: null,
    });
    const onSave = vi.fn(async () => undefined);
    const onAutoSaved = vi.fn();

    act(() =>
      root.render(
        <FinanceBillSheet
          visible
          editing={null}
          methods={SAMPLE_METHODS}
          onClose={vi.fn()}
          onSave={onSave}
          onAutoSaved={onAutoSaved}
        />,
      ),
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="finance-bill-voice"]')!.click();
    });

    expect(mocks.dictationAvailable).toHaveBeenCalledOnce();
    expect(mocks.parseFinanceBillDraft).toHaveBeenCalledWith({
      text: "今天吃火锅花了 268 微信",
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 26800, category: "food", title: "吃火锅" }),
    );
    expect(onAutoSaved).toHaveBeenCalledWith(
      expect.objectContaining({ sourceLabel: "voice", category: "food" }),
    );
  });
});
