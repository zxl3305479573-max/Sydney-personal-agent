// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileRosterRow } from "./sidebar-roster";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) => String.raw(strings, ...values),
  }),
}));

const bot = {
  id: "bot-1",
  spaceId: "other-space",
  name: "Sydney",
  color: "#123456",
  status: "idle",
  pinned: false,
  unread: false,
  preview: "",
  sectionId: null,
} as ComponentProps<typeof MobileRosterRow>["item"]["chat"] & { pinned: boolean };
const item = {
  kind: "bot",
  chat: bot,
  id: bot.id,
  pinned: false,
  sectionId: null,
} as ComponentProps<typeof MobileRosterRow>["item"];

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const openChat = vi.fn();
const pin = vi.fn();
const remove = vi.fn();

function Fixture() {
  const [open, setOpen] = useState(false);
  return (
    <MobileRosterRow
      item={item}
      selected={false}
      openSpaceChat={openChat}
      actionsOpen={open}
      setActionsOpen={setOpen}
      onToggleBotPinned={pin}
      onDeleteBot={remove}
    />
  );
}

function swipe(startX: number, startY: number, endX: number, endY: number) {
  const row = container.querySelector<HTMLButtonElement>(
    '[data-testid="mobile-bot-trigger-bot-1"]',
  )!;
  const start = new Event("touchstart", { bubbles: true });
  Object.defineProperty(start, "touches", { value: [{ clientX: startX, clientY: startY }] });
  const end = new Event("touchend", { bubbles: true });
  Object.defineProperty(end, "changedTouches", { value: [{ clientX: endX, clientY: endY }] });
  act(() => {
    row.dispatchEvent(start);
    row.dispatchEvent(end);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Fixture />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("reveals pin and delete on a left swipe without opening the chat", () => {
  swipe(200, 50, 110, 55);
  expect(container.textContent).toContain("Pin");
  expect(container.textContent).toContain("Delete");
  expect(openChat).not.toHaveBeenCalled();
  const pinButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Pin"),
  )!;
  act(() => pinButton.click());
  expect(pin).toHaveBeenCalledWith(bot);
  expect(container.textContent).not.toContain("Delete");
});

it("does not expose actions for vertical scrolling and passes the correct bot for deletion", () => {
  swipe(200, 50, 180, 150);
  expect(container.textContent).not.toContain("Delete");
  swipe(200, 50, 110, 50);
  const deleteButton = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Delete"),
  )!;
  act(() => deleteButton.click());
  expect(remove).toHaveBeenCalledWith(bot);
  expect(openChat).not.toHaveBeenCalled();
});

it("suppresses the click after a swipe and closes actions on a right swipe", () => {
  swipe(200, 50, 110, 50);
  const row = container.querySelector<HTMLButtonElement>(
    '[data-testid="mobile-bot-trigger-bot-1"]',
  )!;
  act(() => row.click());
  expect(openChat).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Delete");
  swipe(110, 50, 200, 50);
  expect(container.textContent).not.toContain("Delete");
});
