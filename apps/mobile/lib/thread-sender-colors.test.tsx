import { resolvePersonaColorDef, shouldShowBotSenderName } from "@rakazo/core";
import { botColors, darkTokens } from "@rakazo/ui-tokens";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { MobileBot, MobileSnapshot } from "./api";

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  Appearance: { getColorScheme: () => "dark", addChangeListener: () => ({ remove() {} }) },
  Linking: { openURL: vi.fn() },
  Platform: { OS: "ios", select: (options: { ios?: unknown }) => options.ios },
  Pressable: "button",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: "span",
  TextInput: "input",
  View: ({
    children,
    style,
  }: {
    children?: ReactNode;
    style?: CSSProperties | CSSProperties[];
  }) => <div style={Array.isArray(style) ? Object.assign({}, ...style) : style}>{children}</div>,
}));

vi.mock("react-native-reanimated", () => ({
  default: { View: "div" },
  useAnimatedStyle: (style: () => unknown) => style(),
  useReducedMotion: () => true,
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
  isAvailableAsync: async () => true,
}));
vi.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    exists = true;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
  },
  Paths: { document: "file://documents" },
}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("./live-notifications", () => ({ resumeLiveNotifications: vi.fn() }));
vi.mock("./network-cache", () => ({ clearNetworkCache: vi.fn() }));
vi.mock("./artifact-open", () => ({ openMobileArtifact: vi.fn() }));
vi.mock("./native", async () => {
  const { darkTokens } = await import("@rakazo/ui-tokens");
  return {
    native: {},
    useMobileTokens: () => darkTokens,
    useResolvedAppearance: () => "dark",
  };
});

vi.mock("@rakazo/chat-ui/native", () => ({
  ChatMarkdown: () => null,
  withBlockMentions: <T,>(blocks: T) => blocks,
}));

vi.mock("../components/message-caption", () => ({
  MessageCaption: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("../components/glass-surface", async (importOriginal) => {
  const { GlassSurface } = await importOriginal<typeof import("../components/glass-surface")>();
  return {
    GlassSurface: (props: ComponentProps<typeof GlassSurface>) => (
      <div data-glass-tint={props.tint}>
        <GlassSurface {...props} />
      </div>
    ),
  };
});
vi.mock("./chat-appearance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chat-appearance")>();
  return { ...actual, useMobileChatAppearance: () => actual.getEffectiveMobileChatAppearance() };
});
vi.mock("../components/ComputerCard", () => ({
  ComputerCard: ({ onOpen, onTakeControl }: { onOpen: () => void; onTakeControl?: () => void }) => {
    onOpen();
    onTakeControl?.();
    return null;
  },
}));
// Cards this file doesn't exercise; each has its own tests.
vi.mock("../components/thread/ask-block", () => ({ AskBlock: () => null }));
vi.mock("../components/AskActions", () => ({ AskActions: () => null }));
vi.mock("../components/AppConnectCard", () => ({ AppConnectCard: () => null }));
vi.mock("../components/audio-attachment", () => ({ AudioAttachment: () => null }));
vi.mock("../components/bot-avatar", () => ({ BotAvatar: () => null }));
vi.mock("../components/ChoiceCard", () => ({ ChoiceCard: () => null }));
vi.mock("../components/inline-image-attachment", () => ({ InlineImageAttachment: () => null }));
vi.mock("../components/change-undo", () => ({
  ChangeUndo: () => null,
  isUndoableChange: () => false,
}));
vi.mock("../components/McpApprovalCard", () => ({ McpApprovalCard: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

import { MessageBubble } from "../components/thread/message-bubble";
import {
  getMobileChatAppearance,
  MOBILE_BUBBLE_PRESETS,
  saveMobileChatAppearance,
} from "./chat-appearance";

beforeEach(async () => {
  await saveMobileChatAppearance({ ...getMobileChatAppearance(), bubble: null });
});

type BubbleProps = ComponentProps<typeof MessageBubble>;

function Bubble(props: Partial<BubbleProps> & Pick<BubbleProps, "message">) {
  return (
    <MessageBubble
      botId="bot-1"
      bots={[]}
      showBotSenderName={false}
      canAnswer={false}
      canDismiss={false}
      onAnswer={async () => undefined}
      onOpenBot={() => undefined}
      onOpenComputer={() => undefined}
      onPreviewMarkdown={() => undefined}
      onPreviewImage={() => undefined}
      onOpenPeerChat={() => undefined}
      actionProps={{}}
      {...props}
    />
  );
}

function contrastRatio(text: string, surface: string): number {
  const luminance = (hex: string) =>
    [1, 3, 5].reduce((sum, offset, i) => {
      const c = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return (
        sum +
        [0.2126, 0.7152, 0.0722][i]! * (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      );
    }, 0);
  return (luminance(text) + 0.05) / (luminance(surface) + 0.05);
}

it.each(["user", "bot"] as const)("shows a translucent glass bubble for a %s message", (role) => {
  const html = renderToStaticMarkup(
    <Bubble
      groupId="group"
      message={{ id: "message", role, blocks: [{ kind: "text", text: "Hello" }] }}
    />,
  );
  expect(html).toContain("border-radius:20px");
  expect(html).toContain('data-glass-tint="rgba(');
  expect(html).toContain(">Hello</span>");
});

it.each([
  ["user", "text"],
  ["bot", "text"],
  ["user", "image"],
  ["bot", "image"],
] as const)("keeps the saved bubble color visible for %s %s messages", async (role, kind) => {
  await saveMobileChatAppearance({
    ...getMobileChatAppearance(),
    bubble: { ...MOBILE_BUBBLE_PRESETS[1]!.value, opacity: 0.4, radius: 12 },
  });
  const html = renderToStaticMarkup(
    <Bubble
      userBubble={{ background: "#112233", foreground: "#ffffff" }}
      message={{
        id: "message",
        role,
        blocks: [
          kind === "text"
            ? { kind, text: "Hello" }
            : { kind, name: "Picture", artifactId: "artifact-1", mimeType: "image/png" },
          ...(kind === "image" ? [{ kind: "text" as const, text: "Photo caption" }] : []),
        ],
      }}
    />,
  );
  expect(html).toContain(
    role === "user"
      ? "background-color:rgba(187, 247, 208, 0.4)"
      : "background-color:rgba(236, 253, 245, 0.4)",
  );
  expect(html).toContain("border-radius:12px");
  expect(html).not.toContain("gradient(");
});

it.each(["text", "image"] as const)("keeps per-bot sender colours on %s messages", (kind) => {
  for (const [index, color] of botColors.entries()) {
    const id = `bot-${index}`;
    const html = renderToStaticMarkup(
      <Bubble
        botId={id}
        groupId="group"
        showBotSenderName={true}
        bots={[{ id, color } as MobileBot]}
        members={[{ botId: id, name: "Sender" }] as MobileSnapshot["members"]}
        message={{
          id: "message",
          role: "bot",
          botId: id,
          blocks: [
            kind === "text"
              ? { kind, text: "Hello" }
              : { kind, name: "Picture", artifactId: "artifact-1", mimeType: "image/png" },
          ],
        }}
        actionProps={{}}
      />,
    );
    const senderColor = resolvePersonaColorDef(id, color).light;
    expect(html).toContain(`color:${senderColor}`);
    for (const surface of [darkTokens.muted, darkTokens.background]) {
      expect(contrastRatio(senderColor, surface)).toBeGreaterThanOrEqual(3);
    }
    expect(html).toContain(">Sender</span>");
  }
});

it.each(["text", "image"] as const)(
  "shows %s sender labels only when speakers need distinguishing",
  (kind) => {
    for (const { isGroup, speakerBotIds, expected } of [
      { isGroup: false, speakerBotIds: ["bot-a", "bot-a"], expected: false },
      { isGroup: true, speakerBotIds: ["bot-a"], expected: true },
      { isGroup: false, speakerBotIds: ["bot-a", "bot-b"], expected: true },
    ]) {
      const html = renderToStaticMarkup(
        <Bubble
          botId="bot-a"
          botName="Sender"
          bots={[]}
          groupId={isGroup ? "group" : undefined}
          showBotSenderName={shouldShowBotSenderName({ isGroup, speakerBotIds })}
          members={[{ botId: "bot-a", name: "Sender" }] as MobileSnapshot["members"]}
          message={{
            id: "message",
            role: "bot",
            botId: "bot-a",
            blocks: [
              kind === "text"
                ? { kind, text: "Hello" }
                : { kind, name: "Picture", artifactId: "artifact-1", mimeType: "image/png" },
            ],
          }}
          actionProps={{}}
        />,
      );
      expect(html.includes(">Sender</span>")).toBe(expected);
      if (!expected) expect(html).not.toContain("margin-bottom:4px");
    }
  },
);

it("keeps the bot name when viewing or taking control without a sender label", () => {
  const opened: Array<[string, string, boolean?]> = [];
  renderToStaticMarkup(
    <Bubble
      botId="bot-a"
      botName="Sender"
      bots={[]}
      showBotSenderName={false}
      message={{
        id: "message",
        role: "bot",
        botId: "bot-a",
        blocks: [{ kind: "computer", state: "ready", text: "" }],
      }}
      onOpenComputer={(...args) => opened.push(args)}
      actionProps={{}}
    />,
  );
  expect(opened).toEqual([
    ["bot-a", "Sender"],
    ["bot-a", "Sender", true],
  ]);
});
