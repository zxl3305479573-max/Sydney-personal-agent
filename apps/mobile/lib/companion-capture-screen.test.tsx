// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetCompanionSessionStateForTest,
  setActiveCompanionSessionState,
} from "./companion-session-state";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: {
    botId: "bot-1",
    source: "clipboard",
    speak: "1",
  } as Record<string, string | undefined>,
  rpc: vi.fn(),
  activeNative: null as null | {
    id: string;
    botId: string;
    spaceId: string | null;
    linkToken?: string;
  },
  readClipboardScreenshot: vi.fn(),
  pickScreenshotFromLibrary: vi.fn(),
  sendCompanionCapture: vi.fn(),
  waitForCompanionCaptureReply: vi.fn(),
  speakWithDeviceVoice: vi.fn(async () => true),
  stopSpeaking: vi.fn(),
}));

vi.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useLocalSearchParams: () => mocks.params,
}));
vi.mock("expo-clipboard", () => ({
  isPasteButtonAvailable: false,
  ClipboardPasteButton: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./scoped-theme-context", () => ({
  useScreenBackground: (fallback: string) => fallback,
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (s: string) => s }) }));
vi.mock("./native", () => ({
  native: { groupedPage: "#F3F1EC" },
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({ foreground: "#26231F", mutedForeground: "#6E675E" }),
}));
vi.mock("./api", () => ({
  rpc: mocks.rpc,
  selectedSpaceId: () => "space-1",
}));
vi.mock("./session", () => ({
  currentSessionGeneration: () => 1,
}));
vi.mock("./companion-activity", () => ({
  activeCompanionIdentity: () => mocks.activeNative,
}));
vi.mock("./companion-session", async () => {
  const stateMod = await import("./companion-session-state");
  const { useSyncExternalStore } = await import("react");
  return {
    useCompanionSession: () =>
      useSyncExternalStore(
        stateMod.subscribeCompanionSessionState,
        stateMod.getCompanionSessionState,
        stateMod.getCompanionSessionState,
      ),
  };
});
vi.mock("./companion-capture", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readClipboardScreenshot: mocks.readClipboardScreenshot,
    pickScreenshotFromLibrary: mocks.pickScreenshotFromLibrary,
    sendCompanionCapture: mocks.sendCompanionCapture,
    waitForCompanionCaptureReply: mocks.waitForCompanionCaptureReply,
  };
});
vi.mock("./voice", () => ({
  getVoicePlaybackState: () => ({ status: "idle" }),
  speakWithDeviceVoice: mocks.speakWithDeviceVoice,
  stopSpeaking: mocks.stopSpeaking,
}));
vi.mock("../components/glass-title", () => ({ glassHeaderOptions: () => ({}) }));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({ identity }: { identity: string }) =>
    createElement("span", { "data-bot": identity }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => createElement("i", { "data-symbol": ios }),
}));
vi.mock("../components/native-switch", () => ({
  NativeSwitch: ({
    accessibilityLabel,
    value,
    onValueChange,
  }: {
    accessibilityLabel: string;
    value: boolean;
    onValueChange: (next: boolean) => void;
  }) =>
    createElement("input", {
      type: "checkbox",
      "aria-label": accessibilityLabel,
      checked: value,
      onChange: () => onValueChange(!value),
    }),
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    Platform: { OS: "ios" },
    StyleSheet: { hairlineWidth: 1 },
    ActivityIndicator: () => createElement("span", { "data-spinner": "1" }),
    KeyboardAvoidingView: ({ children }: { children?: ReactNode }) =>
      createElement("div", null, children),
    ScrollView: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
    Image: ({ testID, source }: { testID?: string; source?: { uri?: string } }) =>
      createElement("img", { "data-testid": testID, src: source?.uri }),
    View: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => createElement("div", { "data-testid": testID, style: flatten(style) }, children),
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
      createElement("span", { style: flatten(style) }, children),
    TextInput: ({
      value,
      onChangeText,
      testID,
    }: {
      value?: string;
      onChangeText?: (text: string) => void;
      testID?: string;
    }) =>
      createElement("textarea", {
        "data-testid": testID,
        value: value ?? "",
        onChange: (e: { target: { value: string } }) => onChangeText?.(e.target.value),
      }),
    Pressable: ({
      children,
      onPress,
      testID,
      disabled,
    }: {
      children?: ReactNode;
      onPress?: () => void;
      testID?: string;
      disabled?: boolean;
    }) =>
      createElement(
        "button",
        { type: "button", "data-testid": testID, disabled, onClick: onPress },
        children,
      ),
  };
});

import CompanionCaptureScreen from "../app/companion-capture";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  resetCompanionSessionStateForTest();
  setActiveCompanionSessionState({
    id: "in-app-1",
    botId: "bot-1",
    botName: "Sydney",
    botColor: "#4F7CAC",
    spaceId: "space-1",
    mode: "in-app",
    showReply: true,
    startedAt: 1,
  });
  mocks.params = { botId: "bot-1", source: "clipboard", speak: "1" };
  mocks.activeNative = null;
  mocks.rpc.mockResolvedValue({
    current: {
      bots: [
        { id: "bot-1", name: "Sydney", color: "#4F7CAC", status: "idle" },
        { id: "bot-2", name: "Claude", color: "#8B5CF6", status: "idle" },
      ],
    },
  });
  mocks.readClipboardScreenshot.mockResolvedValue({
    name: "screenshot.jpg",
    mimeType: "image/jpeg",
    contentBase64: "AAAA",
    size: 2048,
    previewUri: "data:image/jpeg;base64,AAAA",
  });
  mocks.sendCompanionCapture.mockResolvedValue({
    artifactId: "art-1",
    messageText: "帮我解释这里",
    baselineMessageId: "old-1",
    cursor: 8,
  });
  mocks.waitForCompanionCaptureReply.mockResolvedValue("这是一份日程截图，下午三点有评审会。");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CompanionCaptureScreen (CMP-05 / CMP-06)", () => {
  it("loads clipboard screenshot, accepts simultaneous user input, sends both, and speaks reply aloud", async () => {
    await act(async () => root.render(createElement(CompanionCaptureScreen)));
    expect(mocks.readClipboardScreenshot).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="capture-preview-image"]')).not.toBeNull();

    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-testid="capture-message-input"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "帮我解释这里");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-testid="capture-send-button"]')?.click(),
    );

    expect(mocks.sendCompanionCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot-1",
        text: "帮我解释这里",
        screenshot: expect.objectContaining({ name: "screenshot.jpg" }),
      }),
    );
    expect(container.textContent).toContain("这是一份日程截图，下午三点有评审会。");
    await act(async () => {
      await vi.waitFor(() => {
        expect(mocks.speakWithDeviceVoice).toHaveBeenCalledWith(
          "这是一份日程截图，下午三点有评审会。",
          "bot-1",
          undefined,
          expect.any(Symbol),
        );
      });
    });
  });

  it("blocks invalid or expired Live Activity companionLink tokens", async () => {
    mocks.params = {
      botId: "bot-1",
      companionLink: "1",
      companionToken: "expired-token",
    };
    mocks.activeNative = {
      id: "act-1",
      botId: "bot-1",
      spaceId: "space-1",
      linkToken: "fresh-token",
    };
    await act(async () => root.render(createElement(CompanionCaptureScreen)));
    expect(container.textContent).toContain("陪伴已结束或链接已失效");
    expect(mocks.readClipboardScreenshot).not.toHaveBeenCalled();
  });
});
