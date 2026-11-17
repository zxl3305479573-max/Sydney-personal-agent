// @vitest-environment jsdom
import { i18n } from "@lingui/core";
import type { ThreadMessage } from "@rakazo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessageView } from "./message-view";

const skills = vi.hoisted(() => ({
  updateDraft: vi.fn(async () => ({})),
  save: vi.fn(async () => ({})),
  testRun: vi.fn(async () => ({ runId: "run" })),
}));
vi.mock("../../lib/rpc", () => ({ rpc: { skills } }));

vi.mock("@lingui/core/macro", () => ({
  plural: (count: number, forms: { one: string; other: string }) =>
    (count === 1 ? forms.one : forms.other).replace("#", String(count)),
}));

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => String.raw(strings, ...values),
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

type PeerBot = ComponentProps<typeof MessageView>["peerBot"];
const missingBot: PeerBot = () => undefined;
const existingBot: PeerBot = () => ({ color: "orange" });

const planner = (status: "created" | "archived" | "deleted" = "created") => ({
  kind: "child_bot" as const,
  botId: "child",
  name: "Planner",
  status,
});

it("shows a localized stop and only prepares a reply when asked", () => {
  const onReply = vi.fn();
  const text =
    "任务已停止：工具「Shell」连续 4 次使用相同输入，未能继续推进。此前的部分操作可能已经执行，请先检查结果，再决定是否回复说明下一步。";
  i18n.load("zh-CN", {});
  i18n.activate("zh-CN");
  renderView("bot", [{ kind: "text", text }], { onReply });
  expect(container.textContent).toContain("此前的部分操作可能已经执行");
  expect(onReply).not.toHaveBeenCalled();
  const button = [...container.querySelectorAll("button")].find((item) =>
    item.textContent?.includes("回复说明下一步"),
  );
  expect(button).toBeDefined();
  act(() => button?.click());
  expect(onReply).toHaveBeenCalledOnce();
  i18n.load("en", {});
  i18n.activate("en");
  renderView("bot", [{ kind: "text", text }], { onReply });
  expect(container.textContent).toContain("Some earlier actions may already have happened");
  renderView("user", [{ kind: "text", text }], { onReply });
  expect(container.textContent).not.toContain("Reply with next step");
});

it("recognizes a legacy stop but leaves ordinary messages unchanged", () => {
  i18n.load("zh-CN", {});
  i18n.activate("zh-CN");
  const text =
    "I got stuck calling Shell with the same input 4 times in a row without making progress, so I stopped early. Try rephrasing this, or ask me to try a different approach.";
  renderView("bot", [{ kind: "text", text }]);
  expect(container.textContent).toContain("回复说明下一步");
  renderView("bot", [{ kind: "text", text: "任务已停止，请稍后重试。" }]);
  expect(container.textContent).not.toContain("回复说明下一步");
});

it.each([
  ["narration", [{ kind: "text", text: "Hello" }]],
  [
    "mixed message",
    [
      { kind: "text", text: "Hello" },
      { kind: "meta", text: "Notice" },
    ],
  ],
  [
    "mixed progress",
    [
      { kind: "progress", text: "Working" },
      { kind: "meta", text: "Notice" },
    ],
  ],
] as const)("only reserves avatar space for a named speaker in %s", (_, blocks) => {
  renderView("bot", [...blocks]);
  expect(container.querySelector(".sydney-assistant-content")?.hasAttribute("data-speaker")).toBe(
    false,
  );
  renderView("bot", [...blocks], { speakerName: "Sydney" });
  expect(container.querySelector(".sydney-assistant-content")?.getAttribute("data-speaker")).toBe(
    "true",
  );
});

function renderView(
  role: ThreadMessage["role"],
  blocks: ThreadMessage["blocks"],
  props: Partial<ComponentProps<typeof MessageView>> = {},
) {
  const message: ThreadMessage = {
    id: "message",
    threadId: "thread",
    seq: 1,
    role,
    createdAt: new Date().toISOString(),
    blocks,
  };
  act(() =>
    root.render(
      <MessageView
        artifactTarget={{ botId: "parent" }}
        canAnswer={false}
        canDismiss={false}
        message={message}
        onAnswer={vi.fn()}
        onOpenBot={vi.fn()}
        onOpenPeerMessages={vi.fn()}
        peerBot={existingBot}
        onRefresh={vi.fn()}
        onBotChanged={vi.fn()}
        onAddRoutine={vi.fn()}
        voiceReady={false}
        speaking={false}
        onSpeak={vi.fn()}
        onOpenComputer={vi.fn()}
        showToolActivity={false}
        onReply={vi.fn()}
        onMarkUnread={vi.fn()}
        onReact={vi.fn()}
        {...props}
      />,
    ),
  );
}

function renderMessage(
  blocks: ThreadMessage["blocks"],
  peerBot: PeerBot,
  mentions?: ReturnType<typeof planner>[],
) {
  const onOpenBot = vi.fn();
  renderView("bot", blocks, { mentions, onOpenBot, peerBot });
  const mention = container.querySelector<HTMLElement>('[data-testid="bot-mention"]')!;
  act(() => mention.click());
  return { mention, onOpenBot };
}

it("keeps a received peer marker off the user's side while user replies align to the end", () => {
  renderView("user", [
    { kind: "bot_message_received", fromBotId: "peer", fromBotName: "Atlas", text: "Done." },
  ]);
  const chip = container.querySelector('[data-testid="peer-receipt-chip"]');
  expect(chip?.textContent).toBe("Message from Atlas");
  expect(chip?.closest(".items-end")).toBeNull();

  renderView("user", [{ kind: "text", text: "Thanks." }]);
  expect(container.querySelector(".items-end")?.textContent).toContain("Thanks.");
});

it("names a new bot inline in the reply, in its color", () => {
  const { mention, onOpenBot } = renderMessage(
    [{ kind: "text", text: "Planner is ready." }],
    existingBot,
    [planner()],
  );
  const bubble = container.querySelector('[data-testid="message-bot-bubble"]');
  expect(bubble?.contains(mention)).toBe(true);
  expect(bubble?.textContent).toBe("Planner is ready.");
  expect(mention.tagName).toBe("BUTTON");
  expect(mention.querySelector("span[dir]")?.getAttribute("style")).toContain("color");
  expect(onOpenBot).toHaveBeenCalledWith("child");
});

it("puts the bot first when the reply does not name it", () => {
  renderMessage([{ kind: "text", text: "Ready when you are." }], existingBot, [planner()]);
  expect(container.querySelector('[data-testid="message-bot-bubble"]')?.textContent).toBe(
    "Planner Ready when you are.",
  );
});

it.each([
  ["no longer exists", "created", missingBot],
  ["was deleted", "deleted", existingBot],
] as const)("keeps the name without color or link when the bot %s", (_, status, peerBot) => {
  const { mention, onOpenBot } = renderMessage(
    [{ kind: "text", text: "Planner is gone." }],
    peerBot,
    [planner(status)],
  );
  expect(mention.textContent).toBe("Planner");
  expect(mention.tagName).toBe("SPAN");
  expect(mention.querySelector("span[dir]")?.getAttribute("style")).toBeNull();
  expect(onOpenBot).not.toHaveBeenCalled();
});

it("shows an announcement with no reply yet on its own", () => {
  const { mention, onOpenBot } = renderMessage([planner()], existingBot);
  expect(mention.textContent).toBe("Planner");
  expect(onOpenBot).toHaveBeenCalledWith("child");
});

it("names the bot once across a reply's text blocks", () => {
  renderMessage(
    [
      { kind: "text", text: "Setting up." },
      { kind: "text", text: "Planner is ready." },
    ],
    existingBot,
    [planner()],
  );
  expect(container.querySelectorAll('[data-testid="bot-mention"]')).toHaveLength(1);
  expect(container.textContent).toContain("Setting up.");
  expect(container.textContent).toContain("Planner is ready.");
});

it("keeps an edit made after a save when the saved status arrives late", async () => {
  const draft = {
    kind: "skill_draft" as const,
    skillId: "skill",
    name: "Weekly report",
    goal: "Send the weekly report",
    playbook: {
      whenToUse: "Fridays",
      inputs: [],
      steps: ["Collect"],
      howToCheck: "",
      whatToReturn: "",
      approvalBoundaries: "",
      failureHandling: "",
    },
    status: "draft" as const,
  };
  const render = (block: typeof draft | (Omit<typeof draft, "status"> & { status: "saved" })) =>
    root.render(
      <MessageView
        artifactTarget={{ botId: "parent" }}
        canAnswer={false}
        canDismiss={false}
        message={{
          id: "message",
          threadId: "thread",
          seq: 1,
          role: "bot",
          createdAt: new Date().toISOString(),
          blocks: [block],
        }}
        onAnswer={vi.fn()}
        onOpenBot={vi.fn()}
        onOpenPeerMessages={vi.fn()}
        peerBot={existingBot}
        onRefresh={() => Promise.reject(new Error("offline"))}
        onBotChanged={vi.fn()}
        onAddRoutine={vi.fn()}
        voiceReady={false}
        speaking={false}
        onSpeak={vi.fn()}
        onOpenComputer={vi.fn()}
        showToolActivity={false}
        onReply={vi.fn()}
        onMarkUnread={vi.fn()}
        onReact={vi.fn()}
      />,
    );
  act(() => render(draft));
  const card = container.querySelector('[data-testid="skill-draft-card"]')!;
  const button = () => card.querySelector("button")!;
  await act(async () => button().click());
  expect(button().textContent).toBe("Saved");

  const input = card.querySelector("input")!;
  const type = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  type("Edited");
  act(() => render({ ...draft, status: "saved" }));

  expect(input.value).toBe("Edited");
  expect(button().textContent).toBe("Save");

  // A different skill always loads its own fields.
  act(() => render({ ...draft, skillId: "other", name: "Other" }));
  expect(card.querySelector("input")!.value).toBe("Other");

  // A second save is not undone when the first save's status arrives after it.
  await act(async () => button().click());
  type("Newer");
  await act(async () => button().click());
  act(() => render({ ...draft, skillId: "other", name: "Other", status: "saved" }));
  expect(input.value).toBe("Newer");
  expect(button().textContent).toBe("Saved");
});

it("speaks the message it renders", () => {
  const onSpeak = vi.fn();
  renderView("bot", [{ kind: "text", text: "Hello" }], { onSpeak, voiceReady: true });
  const button = [...container.querySelectorAll("button")].find(
    (node) => node.textContent === "Speak",
  );
  act(() => button?.click());
  expect(onSpeak).toHaveBeenCalledTimes(1);
  expect(onSpeak.mock.calls[0]?.[0]).toMatchObject({ id: "message" });
});

it("opens one counted peer line without an inline reply toggle", () => {
  const open = vi.fn();
  renderView(
    "bot",
    [{ kind: "bot_message_sent", toBotId: "peer", toBotName: "Researcher", text: "Request" }],
    {
      peerExchange: {
        peerBotId: "peer",
        peerBotName: "Researcher",
        count: 3,
        direction: "sent",
      },
      onOpenPeerMessages: open,
    },
  );
  const line = container.querySelector<HTMLButtonElement>('[data-testid="peer-receipt-chip"]');
  expect(line?.getAttribute("aria-label")).toBe("3 messages with Researcher");
  expect(container.querySelector('[data-testid="peer-replies-toggle"]')).toBeNull();
  act(() => line?.click());
  expect(open).toHaveBeenCalledWith({ peerBotId: "peer", peerBotName: "Researcher" });
});
