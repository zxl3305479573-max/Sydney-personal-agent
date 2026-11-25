// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  os: "ios" as "ios" | "android",
  modalProps: null as Record<string, unknown> | null,
  actionSheet: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return runtime.os;
    },
  },
  ActionSheetIOS: {
    showActionSheetWithOptions: runtime.actionSheet,
  },
  KeyboardAvoidingView: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-keyboard-avoiding": "true" }, children),
  Modal: ({
    children,
    visible = true,
    ...rest
  }: {
    children?: ReactNode;
    visible?: boolean;
    [key: string]: unknown;
  }) => {
    runtime.modalProps = { visible, ...rest };
    return visible ? createElement("div", { "data-modal": "true" }, children) : null;
  },
  Pressable: ({
    children,
    onPress,
    disabled,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) =>
    createElement(
      "button",
      { type: "button", disabled, onClick: disabled ? undefined : onPress },
      children,
    ),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
  StyleSheet: { hairlineWidth: 1, create: <T,>(styles: T) => styles },
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  View: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text }) }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({
    background: "#F3F1EC",
    foreground: "#26231F",
    border: "rgba(38, 35, 31, 0.08)",
    destructive: "#C4272D",
    overlay: "rgba(24, 22, 18, 0.24)",
  }),
}));
vi.mock("../components/native-sheet", () => ({
  useNativeSheet: () => null,
  NativeSheet: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));

import { AppModalSheet } from "../components/app-modal-sheet";
import { BotActionsModal } from "../components/bot-actions-modal";

describe("AppModalSheet & BotActionsModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.os = "ios";
    runtime.modalProps = null;
    runtime.actionSheet.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("presents iOS AppModalSheet using native formSheet and allowSwipeDismissal", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <AppModalSheet visible onClose={onClose} accessibilityLabel="New item">
          <span>Body</span>
        </AppModalSheet>,
      ),
    );
    expect(runtime.modalProps?.presentationStyle).toBe("formSheet");
    expect(runtime.modalProps?.animationType).toBe("slide");
    expect(runtime.modalProps?.allowSwipeDismissal).toBe(true);
    expect(runtime.modalProps?.transparent).toBeUndefined();
    expect(container.querySelector('[data-keyboard-avoiding="true"]')).not.toBeNull();
    expect(container.textContent).toContain("Body");
  });

  it("blocks dismissal on AppModalSheet when preventDismiss is true", () => {
    const onClose = vi.fn();
    act(() =>
      root.render(
        <AppModalSheet visible preventDismiss onClose={onClose}>
          <span>Busy</span>
        </AppModalSheet>,
      ),
    );
    expect(runtime.modalProps?.allowSwipeDismissal).toBe(false);
    const onRequestClose = runtime.modalProps?.onRequestClose as (() => void) | undefined;
    onRequestClose?.();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses native ActionSheetIOS for BotActionsModal on iOS with destructive and cancel indices", () => {
    const onClose = vi.fn();
    const onPin = vi.fn();
    const onDelete = vi.fn();
    act(() =>
      root.render(
        <BotActionsModal
          actions={[
            { text: "Pin", onPress: onPin },
            { text: "Delete", destructive: true, onPress: onDelete },
          ]}
          onClose={onClose}
        />,
      ),
    );
    expect(container.innerHTML).toBe("");
    expect(runtime.actionSheet).toHaveBeenCalledOnce();
    const [options, callback] = runtime.actionSheet.mock.calls[0]!;
    expect(options).toEqual({
      options: ["Pin", "Delete", "Cancel"],
      cancelButtonIndex: 2,
      destructiveButtonIndex: 1,
    });
    callback(1);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onPin).not.toHaveBeenCalled();
  });

  it("renders bottom sheet fallback for BotActionsModal on Android", () => {
    runtime.os = "android";
    const onClose = vi.fn();
    const onPin = vi.fn();
    act(() =>
      root.render(
        <BotActionsModal actions={[{ text: "Pin", onPress: onPin }]} onClose={onClose} />,
      ),
    );
    expect(runtime.actionSheet).not.toHaveBeenCalled();
    expect(container.querySelector('[data-modal="true"]')).not.toBeNull();
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "Pin")!;
    act(() => button.click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledOnce();
  });
});
