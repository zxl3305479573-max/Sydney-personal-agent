// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ChatAppearanceScreen from "../app/(settings)/chat-appearance";

const store = vi.hoisted(() => ({
  current: {
    backgroundUri: "file://background",
    backgroundFit: "cover" as "cover" | "contain",
    backgroundOpacity: 0.6,
    overlayOpacity: 0.25,
    bubble: null,
  },
  save: vi.fn(async () => {}),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ back: vi.fn() }),
  useFocusEffect: () => {},
}));
vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Image: ({ resizeMode }: { resizeMode: string }) => <div data-resize-mode={resizeMode} />,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
    disabled,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));
vi.mock("../components/settings-group", () => ({
  SettingsGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({
    title,
    value,
    onPress,
  }: {
    title: string;
    value?: string;
    onPress?: () => void;
  }) => (
    <button type="button" onClick={onPress}>
      {title} {value}
    </button>
  ),
  useStackedSettings: () => false,
}));
vi.mock("./appearance", () => ({
  mobileTokens: () => ({ foreground: "black", border: "gray", card: "white" }),
}));
vi.mock("./native", () => ({ useThemedStyles: (factory: () => unknown) => factory() }));
vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text, locale: "zh-CN" }) }));
vi.mock("./chat-appearance", () => ({
  getMobileChatAppearance: () => store.current,
  useMobileChatAppearance: () => store.current,
  saveMobileChatAppearance: store.save,
  chooseMobileChatBackground: vi.fn(),
  clearMobileChatBackground: vi.fn(),
  MOBILE_BUBBLE_PRESETS: [],
}));

it("applies display mode and transparency actions to the existing appearance", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(<ChatAppearanceScreen />));
  expect(container.querySelector("[data-resize-mode]")?.getAttribute("data-resize-mode")).toBe(
    "cover",
  );
  const mode = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("显示方式"),
  );
  await act(async () => mode?.click());
  expect(store.save).toHaveBeenLastCalledWith({ ...store.current, backgroundFit: "contain" });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="提高背景透明度"]')?.click(),
  );
  expect(store.save).toHaveBeenLastCalledWith({ ...store.current, backgroundOpacity: 0.5 });
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="降低暗色遮罩"]')?.click(),
  );
  expect(store.save).toHaveBeenLastCalledWith({ ...store.current, overlayOpacity: 0.15 });
  await act(async () => root.unmount());
});
