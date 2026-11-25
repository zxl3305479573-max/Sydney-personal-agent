// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreateBotModal } from "../components/create-bot-modal";
import { ProjectGroupModal } from "../components/project-group-modal";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  locale: "zh-CN",
}));

vi.mock("react-native", () => {
  const el =
    (tag: string, extra?: Record<string, unknown>) =>
    ({
      children,
      accessibilityLabel,
      accessibilityRole,
      disabled,
      onPress,
      placeholder,
      value,
      onChangeText,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      accessibilityRole?: string;
      disabled?: boolean;
      onPress?: () => void;
      placeholder?: string;
      value?: string;
      onChangeText?: (value: string) => void;
    }) =>
      createElement(
        tag,
        {
          ...extra,
          "aria-label": accessibilityLabel,
          role: accessibilityRole,
          disabled,
          placeholder,
          value,
          onClick: disabled ? undefined : onPress,
          onChange: onChangeText
            ? (event: { target: { value: string } }) => onChangeText(event.target.value)
            : undefined,
        },
        children,
      );
  return {
    ActivityIndicator: () => createElement("i", { "data-loading": "true" }),
    Alert: { alert: vi.fn() },
    Image: () => createElement("img"),
    KeyboardAvoidingView: el("div", { "data-keyboard-avoiding": "true" }),
    Modal: ({ children, visible = true }: { children?: ReactNode; visible?: boolean }) =>
      visible ? createElement("div", { "data-modal": "true" }, children) : null,
    Platform: { OS: "ios" },
    Pressable: el("button"),
    FlatList: ({
      data = [],
      renderItem,
      ListEmptyComponent,
      ListFooterComponent,
      onEndReached,
    }: {
      data?: unknown[];
      renderItem: (info: { item: unknown; index: number }) => ReactNode;
      ListEmptyComponent?: ReactNode;
      ListFooterComponent?: ReactNode;
      onEndReached?: () => void;
    }) =>
      createElement(
        "div",
        { "data-flatlist": "true" },
        data.length > 0
          ? data.map((item, index) =>
              createElement("div", { key: index }, renderItem({ item, index })),
            )
          : ListEmptyComponent,
        ListFooterComponent,
        onEndReached
          ? createElement("button", {
              type: "button",
              "data-end-reached": "true",
              onClick: onEndReached,
            })
          : null,
      ),
    ScrollView: el("div", { "data-scroll": "true" }),
    StyleSheet: {
      create: <T,>(styles: T) => styles,
      hairlineWidth: 1,
      absoluteFill: {},
    },
    Text: el("span"),
    TextInput: el("input"),
    View: el("div"),
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("./api", () => ({
  captureApiRequestContext: async () => ({ headers: {} }),
  currentApiBase: () => "https://124.221.182.39",
  isSpaceSelectionPending: () => false,
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  selectedSpaceId: () => "space-1",
  spaceSelectionSeq: () => 1,
}));
vi.mock("./session", () => ({ currentSessionGeneration: () => 1 }));
vi.mock("./create-bot-avatar", () => ({
  BUILT_IN_BOT_AVATARS: [
    { id: "a1", name: "Avatar 1", source: 1 },
    { id: "a2", name: "Avatar 2", source: 2 },
  ],
  bundledBotAvatar: async () => "data:image/webp;base64,AAA",
  pickBotAvatar: async () => null,
}));
vi.mock("./bot-avatar-library", () => ({
  loadBotAvatarLibrary: async () => [],
  removeBotAvatar: vi.fn(),
  saveBotAvatar: vi.fn(),
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: mocks.locale, t: (text: string) => text }),
}));
vi.mock("./native", () => ({
  native: { fill: "#eee", separator: "#ddd" },
  useMobileTokens: () => ({
    background: "#fff",
    card: "#f9f9f9",
    border: "#ddd",
    foreground: "#111",
    mutedForeground: "#666",
    primary: "#2563eb",
    destructive: "#dc2626",
    overlay: "rgba(0,0,0,0.4)",
  }),
  useResolvedAppearance: () => "light",
}));
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: () => createElement("i"),
}));
vi.mock("../components/inbox-rows", () => ({
  FALLBACK_COLOR: "#3EC5A8",
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => createElement("button", { type: "button", disabled, onClick: onPress }, label),
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.rpc.mockReset();
  mocks.locale = "zh-CN";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("wraps ProjectGroupModal in KeyboardAvoidingView and selects project bots", async () => {
  mocks.rpc.mockResolvedValue({
    bots: [
      { id: "bot-1", name: "Alpha" },
      { id: "bot-2", name: "Beta" },
    ],
    groups: [],
    nextBotId: null,
    nextGroupId: null,
  });
  const onClose = vi.fn();
  const onCreated = vi.fn();

  await act(async () => {
    root.render(
      <ProjectGroupModal
        projectId="proj-1"
        current={() => true}
        attempt={{ current: null }}
        onClose={onClose}
        onCreated={onCreated}
      />,
    );
  });

  expect(container.querySelector('[data-keyboard-avoiding="true"]')).not.toBeNull();
  const checkboxes = container.querySelectorAll('[role="checkbox"]');
  expect(checkboxes).toHaveLength(2);
  act(() => (checkboxes[0] as HTMLElement).click());
  act(() => (checkboxes[1] as HTMLElement).click());
  expect(container.textContent).toContain("已选 2 个");

  mocks.rpc.mockResolvedValueOnce({ id: "group-1" });
  const createButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("创建群聊"),
  )!;
  await act(async () => createButton.click());
  expect(onCreated).toHaveBeenCalledOnce();
});

it("renders CreateBotModal with fixed close action, upload tile and disabled create until named", async () => {
  const onClose = vi.fn();
  await act(async () => {
    root.render(
      <CreateBotModal onClose={onClose} onCreate={async () => null} onCreated={vi.fn()} />,
    );
  });

  expect(container.querySelector('[data-keyboard-avoiding="true"]')).not.toBeNull();
  expect(container.querySelector('[aria-label="上传头像"]')).not.toBeNull();
  const createButton = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "创建",
  ) as HTMLButtonElement;
  expect(createButton.disabled).toBe(true);

  const closeButtons = container.querySelectorAll<HTMLElement>('[aria-label="关闭"]');
  act(() => closeButtons[closeButtons.length - 1]!.click());
  expect(onClose).toHaveBeenCalledOnce();
});

it("loads additional project bots via infinite scroll without previous/next buttons", async () => {
  mocks.rpc
    .mockResolvedValueOnce({
      bots: [{ id: "bot-1", name: "Alpha" }],
      groups: [],
      nextBotId: "bot-1",
      nextGroupId: null,
    })
    .mockResolvedValueOnce({
      bots: [{ id: "bot-2", name: "Beta" }],
      groups: [],
      nextBotId: null,
      nextGroupId: null,
    });

  await act(async () => {
    root.render(
      <ProjectGroupModal
        projectId="proj-1"
        current={() => true}
        attempt={{ current: null }}
        onClose={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
  });

  expect(container.textContent).toContain("Alpha");
  expect(container.textContent).not.toContain("下一页");
  expect(container.textContent).not.toContain("上一页");

  const trigger = container.querySelector<HTMLButtonElement>('[data-end-reached="true"]')!;
  await act(async () => trigger.click());
  expect(container.textContent).toContain("Alpha");
  expect(container.textContent).toContain("Beta");
});
