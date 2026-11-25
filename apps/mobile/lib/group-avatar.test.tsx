// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GroupAvatar } from "../components/group-avatar";

vi.mock("react-native", () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: ({ children, style }: { children?: ReactNode; style?: unknown }) => {
    const flat = Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
    return createElement("div", { "data-bg": flat.backgroundColor }, children);
  },
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
}));
vi.mock("./native", () => ({
  native: { fillPressed: "fill-pressed", secondaryLabel: "secondary-label", label: "label" },
  useThemedStyles: <T,>(factory: () => T) => factory(),
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({
    identity,
    status,
    unread,
  }: {
    identity: string;
    status?: string;
    unread?: boolean;
  }) =>
    createElement("i", {
      "data-member": identity,
      "data-status": status,
      "data-unread": String(Boolean(unread)),
    }),
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ android }: { android: string }) => createElement("i", { "data-icon": android }),
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
const member = (index: number, status?: string) => ({
  botId: `bot-${index}`,
  color: "#2A92FE",
  status,
});
const render = (
  members: ReturnType<typeof member>[],
  props?: { status?: string; unread?: boolean },
) => act(() => root.render(<GroupAvatar members={members} size={54} {...props} />));

describe("mobile group avatar", () => {
  it("uses a native group icon rather than an emoji when members are unavailable", () => {
    render([]);
    expect(container.querySelector('[data-icon="people"]')).not.toBeNull();
    expect(container.textContent).not.toContain("👥");
  });
  it("shows the lone member as their existing bot avatar", () => {
    render([member(0)], { status: "running", unread: true });
    const bot = container.querySelector('[data-member="bot-0"]');
    expect(bot).not.toBeNull();
    expect(bot?.getAttribute("data-status")).toBe("running");
    expect(bot?.getAttribute("data-unread")).toBe("true");
  });
  it("represents larger rosters with actual members and an overflow count", () => {
    render(Array.from({ length: 6 }, (_, index) => member(index)));
    expect(container.querySelectorAll("[data-member]")).toHaveLength(2);
    expect(container.textContent).toContain("+4");
  });
  it("draws one unified status or unread marker from group status only, never member DM status", () => {
    render([member(0), member(1)], { unread: true });
    expect(container.querySelectorAll('[data-bg="#3FA266"]')).toHaveLength(1);
    // A member bot busy/waiting in its 1-to-1 DM must NOT paint a status badge on the group avatar.
    render([member(0, "waiting_input"), member(1, "running")]);
    expect(container.querySelectorAll('[data-bg="#E89E30"]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-bg="#3FA266"]')).toHaveLength(0);
    // Explicit group thread status still draws one unified marker.
    render([member(0), member(1)], { status: "waiting_input" });
    expect(container.querySelectorAll('[data-bg="#E89E30"]')).toHaveLength(1);
  });
});
