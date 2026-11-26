// @vitest-environment jsdom

import type { ColorTokens } from "@rakazo/ui-tokens";
import { tokensForAppearance } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotAvatarProps } from "../components/bot-avatar";
import { BotAvatar } from "../components/bot-avatar";
import { DEFAULT_BOT_AVATAR_DATA_URI } from "./default-bot-avatar";

const mobileTokens = vi.hoisted(() => ({ current: undefined as ColorTokens | undefined }));

vi.mock("react-native", () => ({
  View: ({
    children,
    accessibilityLabel,
    style,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
    style?: { borderColor?: string; backgroundColor?: string };
  }) =>
    createElement(
      "div",
      {
        "aria-label": accessibilityLabel,
        "data-border": style?.borderColor,
        "data-background": style?.backgroundColor,
      },
      children,
    ),
  Image: ({ source }: { source: { uri: string } | number }) =>
    createElement("img", { src: typeof source === "number" ? `asset:${source}` : source.uri }),
}));

vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ color }: { color: string }) => createElement("i", { "data-color": color }),
}));
vi.mock("./native", () => ({
  useMobileTokens: () =>
    mobileTokens.current ?? {
      background: "#FFF",
      foreground: "#141414",
      sidebar: "#F1F1F1",
      border: "#CCCCCC",
      workingDot: "#3FA266",
      secondary: "#7676801F",
    },
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ t: (text: string) => text }) }));

describe("BotAvatar", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.unstubAllGlobals();
    mobileTokens.current = undefined;
  });

  function render(
    color: string,
    avatarSet?: "organic" | "rakazo",
    props: Partial<BotAvatarProps> = {},
  ) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <BotAvatar color={color} avatarSet={avatarSet} identity="bot-1" size={42} {...props} />,
      ),
    );
    return container;
  }

  it("renders the default 大肥鱼 avatar photo instead of legacy blue/colored ghosts for plain colors and shapes", () => {
    for (const legacy of ["#4F7CAC", "#3EC5A8", "#8B5CF6::shape_3", ""]) {
      const view = render(legacy);
      expect(view.querySelector("img")?.getAttribute("src")).toBe(DEFAULT_BOT_AVATAR_DATA_URI);
      expect(view.querySelector("svg")).toBeNull();
      expect(view.querySelector("path")).toBeNull();
      act(() => root?.unmount());
      container?.remove();
    }
  });

  it("keeps a bot's custom photo", () => {
    const view = render("data:image/png;base64,abc");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(view.querySelector("svg")).toBeNull();
  });

  it("keeps a custom photo when the stored set is rakazo", () => {
    const view = render("data:image/png;base64,abc", "rakazo");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,abc");
  });

  it.each([
    ["light", "data:image/png;base64,abc"],
    ["dark", "data:image/png;base64,abc"],
    ["light", "#3EC5A8"],
    ["dark", "#3EC5A8"],
  ] as const)("draws the muted badge with the %s theme tokens for %s", (appearance, color) => {
    const tokens = tokensForAppearance(appearance);
    mobileTokens.current = tokens;
    const badge = render(color, undefined, { muted: true }).querySelector<HTMLElement>(
      '[aria-label="Notifications silenced"]',
    );
    expect(badge?.dataset).toMatchObject({
      border: tokens.background,
      background: tokens.background,
    });
    expect(badge?.querySelector<HTMLElement>("div")?.dataset.background).toBe(tokens.secondary);
    expect(badge?.querySelector("i")?.dataset.color).toBe(tokens.foreground);
  });

  it("shows the green marker for an unread or working bot and hides it when idle", () => {
    const unread = render("#3EC5A8", undefined, { unread: true });
    expect(unread.querySelectorAll('[aria-label="Working"]')).toHaveLength(1);
    act(() => root?.unmount());
    container?.remove();

    const running = render("#3EC5A8", undefined, { status: "running", unread: true });
    expect(running.querySelectorAll('[aria-label="Working"]')).toHaveLength(1);
    act(() => root?.unmount());
    container?.remove();

    const idle = render("#3EC5A8", undefined, { unread: false });
    expect(idle.querySelector('[aria-label="Working"]')).toBeNull();
  });

  it("shows waiting and failed markers with semantic tokens", () => {
    const tokens = tokensForAppearance("light");
    mobileTokens.current = tokens;
    const waiting = render("#3EC5A8", undefined, { status: "waiting_input" });
    expect(
      waiting.querySelector<HTMLElement>('[aria-label="Needs input"]')?.dataset.background,
    ).toBe(tokens.warning);
    act(() => root?.unmount());
    container?.remove();

    const failed = render("#3EC5A8", undefined, { status: "failed" });
    expect(failed.querySelector<HTMLElement>('[aria-label="Failed"]')?.dataset.background).toBe(
      tokens.destructive,
    );
  });
});
