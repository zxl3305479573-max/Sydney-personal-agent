// @vitest-environment jsdom

import { i18n } from "@lingui/core";
import type { ThreadMessage } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act, useCallback, useMemo, useRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cancelChatAppearancePreview,
  EMPTY_CHAT_APPEARANCE,
  previewChatAppearance,
} from "../../lib/chat-appearance";
import { Transcript } from "./transcript";

const messageRenders = vi.hoisted(() => new Map<string, number>());

vi.mock("./message-view", async () => {
  const { createElement, memo } = await import("react");
  return {
    MessageView: memo(function MessageView({ message }: { message: { id: string } }) {
      messageRenders.set(message.id, (messageRenders.get(message.id) ?? 0) + 1);
      return createElement("div", { "data-testid": `message-${message.id}` });
    }),
  };
});

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => String.raw(strings, ...values),
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  messageRenders.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollTo = () => undefined;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function message(id: string, text: string): ThreadMessage {
  return {
    id,
    threadId: "thread",
    seq: 1,
    role: "bot",
    createdAt: "2026-10-30T12:00:00.000Z",
    blocks: [{ kind: "text", text }],
  };
}

function Host({
  messages,
  running = false,
  workingRuns = [{ id: "run", status: "running" }],
  answerable,
}: {
  messages: ThreadMessage[];
  running?: boolean;
  workingRuns?: { id: string; status: string }[];
  answerable?: Set<string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const artifactTarget = useMemo(() => ({ botId: "bot" }), []);
  const none = useMemo(() => new Set<string>(), []);
  const reply = useCallback(() => undefined, []);
  const quote = useCallback(() => undefined, []);
  const peer = useCallback(() => undefined, []);
  const refresh = useCallback(async () => undefined, []);
  const answer = useCallback(async () => undefined, []);
  const react = useCallback(async () => undefined, []);
  return (
    <Transcript
      scrollRef={scrollRef}
      scrollRequest={null}
      onScrollRequestHandled={reply}
      followRequest={0}
      artifactTarget={artifactTarget}
      transcript={{
        messages,
        folded: new Map(),
        markerOf: new Map(),
        mergedInto: new Map(),
      }}
      showToolActivity={false}
      olderCursor={null}
      unreadAfterSeq={null}
      loadingOlder={false}
      answerableAskIds={answerable ?? none}
      dismissableAskIds={none}
      running={running}
      workingRuns={workingRuns}
      workingBots={[]}
      onLoadOlder={reply}
      onOpenBot={reply}
      onAnswer={answer}
      onReply={reply}
      onMarkUnread={reply}
      onQuote={quote}
      onReact={react}
      onJumpToMessage={reply}
      onOpenPeerMessages={peer}
      peerBot={peer}
      onRefresh={refresh}
      onBotChanged={refresh}
      onAddRoutine={quote}
      voiceReady={false}
      speakingMessageId={null}
      onSpeak={reply}
      onOpenComputer={reply}
    />
  );
}

it("shows work stages and pending confirmation in the active language", () => {
  i18n.load("zh-CN", {});
  i18n.activate("zh-CN");
  act(() => root.render(<Host messages={[]} running />));
  expect(container.textContent).toContain("已收到，正在处理");
  const live: ThreadMessage = {
    ...message("progress:run", ""),
    blocks: [{ kind: "steps", steps: [{ label: "Shell", count: 1 }] }],
  };
  act(() => root.render(<Host messages={[live]} running />));
  expect(container.textContent).toContain("最近一步：电脑操作");
  const pending: ThreadMessage = {
    ...message("ask", ""),
    blocks: [{ kind: "ask", text: "确认吗", status: "pending" }],
  };
  act(() => root.render(<Host messages={[pending]} answerable={new Set(["ask"])} />));
  expect(container.textContent).toContain("等待你的确认或回复");
  i18n.load("en", {});
  i18n.activate("en");
  act(() => root.render(<Host messages={[pending]} answerable={new Set(["ask"])} />));
  expect(container.textContent).toContain("Waiting for your confirmation or reply");
  act(() => root.render(<Host messages={[live]} running />));
  expect(container.textContent).toContain("Last step: computer");
  const answered: ThreadMessage = {
    ...pending,
    blocks: [{ kind: "ask", text: "确认吗", status: "answered" }],
  };
  act(() => root.render(<Host messages={[answered]} answerable={new Set(["ask"])} />));
  expect(container.textContent).not.toContain("Waiting for your confirmation or reply");
});

it("shows queue status without using progress from another run", () => {
  i18n.load("zh-CN", {});
  i18n.activate("zh-CN");
  const old: ThreadMessage = {
    ...message("progress:old", ""),
    blocks: [{ kind: "steps", steps: [{ label: "Shell", count: 1 }] }],
  };
  act(() =>
    root.render(<Host messages={[old]} running workingRuns={[{ id: "new", status: "queued" }]} />),
  );
  expect(container.textContent).toContain("已收到，正在排队");
  expect(container.textContent).not.toContain("最近一步：电脑操作");
  const oldWriting: ThreadMessage = {
    ...old,
    blocks: [{ kind: "progress", text: "旧任务的回复" }],
  };
  act(() =>
    root.render(
      <Host messages={[oldWriting]} running workingRuns={[{ id: "new", status: "leased" }]} />,
    ),
  );
  expect(container.textContent).toContain("已收到，正在处理");
});

it.each([false, true])(
  "leaves an unchanged message unrendered when a later one updates (mentions: %s)",
  (withMentions) => {
    const kept = message("kept", "Earlier");
    const announcement: ThreadMessage = {
      ...message("announcement", ""),
      blocks: [{ kind: "child_bot", botId: "child", name: "Planner", status: "created" }],
    };
    const earlier = withMentions ? [announcement, kept] : [kept];
    const live = message("progress:run", "Draft");
    act(() => root.render(<Host messages={[...earlier, live]} />));
    expect(messageRenders.get("kept")).toBe(1);
    expect(messageRenders.get("progress:run")).toBe(1);

    act(() =>
      root.render(<Host messages={[...earlier, message("progress:run", "Draft continues")]} />),
    );
    expect(messageRenders.get("kept")).toBe(1);
    expect(messageRenders.get("progress:run")).toBe(2);
    if (withMentions) {
      expect(messageRenders.has("announcement")).toBe(false);
      const renamed: ThreadMessage = {
        ...announcement,
        blocks: [{ kind: "child_bot", botId: "child", name: "Writer", status: "created" }],
      };
      act(() => root.render(<Host messages={[renamed, kept, live]} />));
      expect(messageRenders.get("kept")).toBe(2);
    }
  },
);

it("applies and clears independent text colors without changing messages", () => {
  act(() => root.render(<Host messages={[message("one", "Hello")]} />));
  const transcript = container.querySelector<HTMLElement>('[data-testid="transcript"]');
  const previousUserColor = transcript?.style.getPropertyValue("--custom-chat-user-foreground");
  act(() =>
    previewChatAppearance({
      ...EMPTY_CHAT_APPEARANCE,
      userTextColor: "#123456",
      botTextColor: "#abcdef",
    }),
  );
  expect(transcript?.style.getPropertyValue("--custom-chat-user-foreground")).toBe("#123456");
  expect(transcript?.style.getPropertyValue("--custom-chat-bot-foreground")).toBe("#abcdef");
  act(() => cancelChatAppearancePreview());
  expect(transcript?.style.getPropertyValue("--custom-chat-user-foreground")).toBe(
    previousUserColor,
  );
  expect(messageRenders.get("one")).toBe(1);
});
