// @vitest-environment jsdom

import { avatarIdentitySeed, organicAvatarPath, shippedBotAvatarShapePath } from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { botEyeColor, tokensForAppearance } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { act, createElement, useRef } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BotAvatarProps } from "../components/bot-avatar";
import { BotAvatar } from "../components/bot-avatar";
import { AvatarScreenFocus } from "./avatar-life";

const mobileTokens = vi.hoisted(() => ({ current: undefined as ColorTokens | undefined }));
const nativeMotion = vi.hoisted(() => ({
  reduced: true,
  timings: [] as number[],
}));

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
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
  Pressable: ({
    children,
    onPress,
    accessible,
  }: {
    children?: ReactNode;
    onPress?: () => void;
    accessible?: boolean;
  }) =>
    createElement(
      "button",
      { type: "button", onClick: onPress, "data-accessible": String(accessible) },
      children,
    ),
  Image: ({ source }: { source: { uri: string } }) => createElement("img", { src: source.uri }),
}));

vi.mock("react-native-reanimated", () => {
  const passthrough = ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children);
  return {
    default: {
      View: passthrough,
      createAnimatedComponent: (component: unknown) => component,
    },
    cancelAnimation: () => undefined,
    Easing: { linear: (value: number) => value, inOut: (value: unknown) => value, cubic: 0 },
    ReduceMotion: { Never: "never" },
    withSpring: (value: unknown) => value,
    useAnimatedProps: () => ({}),
    useDerivedValue: (sample: () => unknown) => ({ value: sample() }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => nativeMotion.reduced,
    useSharedValue: <T,>(value: T) => useRef({ value }).current,
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown, options?: { duration: number }) => {
      const duration = options?.duration ?? 0;
      nativeMotion.timings.push(duration);
      return value === 1 && duration > 0 && duration < 1000 ? 0.4 : value;
    },
  };
});

vi.mock("react-native-svg", () => {
  const element =
    (tag: string) =>
    ({
      children,
      ...props
    }: {
      children?: ReactNode;
      d?: string;
      fill?: string;
      stopColor?: string;
    }) =>
      createElement(
        tag,
        { "data-d": props.d, "data-fill": props.fill, "data-stop-color": props.stopColor },
        children,
      );
  return {
    default: element("svg"),
    Ellipse: element("ellipse"),
    G: element("g"),
    Path: element("path"),
    Rect: element("rect"),
    Defs: element("defs"),
    ClipPath: element("clipPath"),
    Mask: element("mask"),
    LinearGradient: element("linearGradient"),
    RadialGradient: element("radialGradient"),
    Stop: element("stop"),
  };
});

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
    nativeMotion.reduced = true;
    nativeMotion.timings.length = 0;
    mobileTokens.current = undefined;
  });

  function render(
    color: string,
    avatarSet?: "organic" | "rakazo",
    props: Partial<BotAvatarProps> = {},
    focused = true,
  ) {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const avatar = (
      <BotAvatar color={color} avatarSet={avatarSet} identity="bot-1" size={42} {...props} />
    );
    act(() =>
      root?.render(
        focused ? (
          avatar
        ) : (
          <AvatarScreenFocus navigation={{ isFocused: () => false, addListener: () => () => {} }}>
            {avatar}
          </AvatarScreenFocus>
        ),
      ),
    );
    return container;
  }

  const bodies = (view: HTMLElement) =>
    Array.from(view.querySelectorAll("path"), (path) => path.dataset.d);

  it.each(["reduced", "offscreen", "static"])("keeps tap motion still when %s", (condition) => {
    nativeMotion.reduced = condition === "reduced";
    const view = render(
      "#3EC5A8",
      "rakazo",
      { pokeable: true, motion: condition === "static" ? "static" : "running" },
      condition !== "offscreen",
    );
    const button = view.querySelector("button");
    expect(button).not.toBeNull();
    nativeMotion.timings.length = 0;
    act(() => button!.click());
    expect(nativeMotion.timings.filter((ms) => ms > 0 && ms < 1000)).toEqual([]);
  });

  it("draws a plain-colour bot with the organic body for its identity", () => {
    const view = render("#3EC5A8");
    expect(bodies(view)).toEqual([organicAvatarPath(avatarIdentitySeed("bot-1"))]);
    // Its eyes take the shared eye ink, the same as a group title's still faces.
    expect(Array.from(view.querySelectorAll("rect"), (eye) => eye.dataset.fill)).toEqual([
      botEyeColor,
      botEyeColor,
    ]);
    expect(view.querySelector("img")).toBeNull();
    expect(view.querySelector("ellipse")).toBeNull();
  });

  it("keeps a picture", () => {
    const view = render("data:image/png;base64,abc");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(bodies(view)).toEqual([]);
  });

  it("keeps a shape picked in Avatar Studio", () => {
    const view = render("#8B5CF6::shape_3");
    expect(bodies(view)).toEqual([shippedBotAvatarShapePath(3)]);
    expect(view.querySelectorAll("ellipse")).toHaveLength(2);
  });
  it("renders a retired mascot selection with the default body", () => {
    const view = render("#3EC5A8", "rakazo");
    expect(bodies(view)).toEqual([organicAvatarPath(avatarIdentitySeed("bot-1"))]);
    expect(view.querySelector("img, image")).toBeNull();
  });

  it("keeps a custom picture when the stored set is Sydney", () => {
    const view = render("data:image/png;base64,abc", "rakazo");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,abc");
    expect(bodies(view)).toEqual([]);
  });

  it("keeps an explicitly selected original shape when the stored set is Sydney", () => {
    const view = render("#8B5CF6::shape_3", "rakazo");
    expect(bodies(view)).toEqual([shippedBotAvatarShapePath(3)]);
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
    // An opaque backing keeps the picture from showing through the translucent fill.
    expect(badge?.dataset).toMatchObject({
      border: tokens.background,
      background: tokens.background,
    });
    expect(badge?.querySelector<HTMLElement>("div")?.dataset.background).toBe(tokens.secondary);
    expect(badge?.querySelector("i")?.dataset.color).toBe(tokens.foreground);
  });

  it("shows the green marker for an unread bot", () => {
    const view = render("#3EC5A8", undefined, { unread: true });
    expect(view.querySelectorAll('[aria-label="Working"]')).toHaveLength(1);
  });

  it("keeps one green marker when a bot is running and unread", () => {
    const view = render("#3EC5A8", undefined, { status: "running", unread: true });
    expect(view.querySelectorAll('[aria-label="Working"]')).toHaveLength(1);
  });

  it("does not show the green marker for a read idle bot", () => {
    const view = render("#3EC5A8", undefined, { unread: false });
    expect(view.querySelector('[aria-label="Working"]')).toBeNull();
  });

  it("keeps the working marker on a static header avatar while composing", () => {
    const view = render("#3EC5A8", undefined, {
      status: "running",
      composing: true,
      motion: "static",
    });
    expect(view.querySelectorAll('[aria-label="Working"]')).toHaveLength(1);
  });

  it("shows waiting and failed markers with semantic tokens", () => {
    const tokens = tokensForAppearance("light");
    mobileTokens.current = tokens;
    const waiting = render("#3EC5A8", undefined, { status: "waiting_input" });
    const waitingDot = waiting.querySelector<HTMLElement>('[aria-label="Needs input"]');
    expect(waitingDot?.dataset.background).toBe(tokens.warning);

    const failed = render("#3EC5A8", undefined, { status: "failed" });
    const failedDot = failed.querySelector<HTMLElement>('[aria-label="Failed"]');
    expect(failedDot?.dataset.background).toBe(tokens.destructive);
  });
});
