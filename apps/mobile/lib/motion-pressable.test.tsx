// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  os: "ios" as "ios" | "android",
  reducedMotion: false,
  componentOpacity: 1,
  sharedValues: [] as Array<{ value: number }>,
  timingCalls: [] as Array<{ toValue: number; config?: Record<string, unknown> }>,
  springCalls: [] as Array<{ toValue: number; config?: Record<string, unknown> }>,
  lastPressableProps: null as Record<string, unknown> | null,
  lastOverlayProps: null as Record<string, unknown> | null,
}));

vi.mock("./app-background", () => ({
  useAppBackground: () => ({ componentOpacity: fixture.componentOpacity }),
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: (props: Record<string, unknown> & { children?: ReactNode }) => {
      fixture.lastOverlayProps = props;
      return createElement("div", { "data-testid": "animated-view" }, props.children);
    },
    createAnimatedComponent: (Component: unknown) => Component,
  },
  Easing: {
    out: (fn: unknown) => fn,
    cubic: (x: number) => x,
    quad: (x: number) => x,
  },
  useReducedMotion: () => fixture.reducedMotion,
  useSharedValue: (initial: number) => {
    const sv = { value: initial };
    fixture.sharedValues.push(sv);
    return sv;
  },
  useAnimatedStyle: (updater: () => Record<string, unknown>) => updater(),
  withTiming: (toValue: number, config?: Record<string, unknown>) => {
    fixture.timingCalls.push({ toValue, config });
    return toValue;
  },
  withSpring: (toValue: number, config?: Record<string, unknown>) => {
    fixture.springCalls.push({ toValue, config });
    return toValue;
  },
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return fixture.os;
    },
  },
  StyleSheet: {
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    flatten: (style: unknown): Record<string, unknown> => {
      const merge = (entry: unknown, acc: Record<string, unknown>) => {
        if (!entry) return;
        if (Array.isArray(entry)) {
          for (const item of entry) merge(item, acc);
          return;
        }
        if (typeof entry === "object") Object.assign(acc, entry);
      };
      const out: Record<string, unknown> = {};
      merge(style, out);
      return out;
    },
  },
  Pressable: (props: Record<string, unknown> & { children?: ReactNode }) => {
    fixture.lastPressableProps = props;
    const resolvedStyle =
      typeof props.style === "function" ? props.style({ pressed: false }) : props.style;
    return createElement(
      "button",
      {
        type: "button",
        "data-testid": props.testID ?? "pressable",
        "data-style-is-array": Array.isArray(resolvedStyle) ? "true" : "false",
      },
      props.children,
    );
  },
  View: (props: Record<string, unknown> & { children?: ReactNode }) => {
    fixture.lastOverlayProps = props;
    return createElement("div", { "data-testid": "view" }, props.children);
  },
}));

import { MotionPressable as FallbackMotionPressable } from "../components/motion-pressable";
import { MotionPressable as NativeMotionPressable } from "../components/motion-pressable.native";
import { TabIndicator as FallbackTabIndicator } from "../components/tab-indicator";
import { TabIndicator as NativeTabIndicator } from "../components/tab-indicator.native";
import { PRESS_MOTION_PRESETS, resolvePressMotion } from "./press-motion";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.os = "ios";
  fixture.reducedMotion = false;
  fixture.componentOpacity = 1;
  fixture.sharedValues = [];
  fixture.timingCalls = [];
  fixture.springCalls = [];
  fixture.lastPressableProps = null;
  fixture.lastOverlayProps = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("press-motion presets and resolution", () => {
  it("defines restrained scale, opacity, and spring curves across all five presets", () => {
    expect(PRESS_MOTION_PRESETS.card.pressedScale).toBe(0.978);
    expect(PRESS_MOTION_PRESETS.control.pressedScale).toBe(0.955);
    expect(PRESS_MOTION_PRESETS.icon.pressedScale).toBe(0.9);
    expect(PRESS_MOTION_PRESETS.row.pressedScale).toBe(1);
    expect(PRESS_MOTION_PRESETS.inline.pressedScale).toBe(0.98);

    expect(resolvePressMotion("card").useSpring).toBe(true);
    expect(resolvePressMotion("control").useSpring).toBe(true);
    expect(resolvePressMotion("icon").useSpring).toBe(true);
    expect(resolvePressMotion("row").useSpring).toBe(false);
    expect(resolvePressMotion("inline").useSpring).toBe(false);
  });

  it("downgrades scale and spring under Reduce Motion while keeping subtle opacity feedback", () => {
    const card = resolvePressMotion("card", { reducedMotion: true });
    expect(card.pressedScale).toBe(1);
    expect(card.pressedOpacity).toBe(0.92);
    expect(card.useSpring).toBe(false);
    expect(card.inDurationMs).toBeLessThanOrEqual(75);
    expect(card.outDurationMs).toBeLessThanOrEqual(110);

    const icon = resolvePressMotion("icon", { reducedMotion: true });
    expect(icon.pressedScale).toBe(1);
    expect(icon.pressedOpacity).toBe(0.74);
    expect(icon.useSpring).toBe(false);
  });

  it("keeps foreground opacity at 1 when highlightColor is provided unless activeOpacity overrides it", () => {
    expect(resolvePressMotion("row", { hasHighlight: true }).pressedOpacity).toBe(1);
    expect(
      resolvePressMotion("row", { hasHighlight: true, activeOpacity: 0.88 }).pressedOpacity,
    ).toBe(0.88);
  });
});

describe("MotionPressable.native", () => {
  it.each([
    ["native", NativeMotionPressable],
    ["fallback", FallbackMotionPressable],
  ] as const)(
    "applies %s control transparency without fading its children or changing hit targets",
    (_platform, Control) => {
      fixture.componentOpacity = 0.5;
      const onPress = vi.fn();
      act(() =>
        root.render(
          <Control
            onPress={onPress}
            style={{ backgroundColor: "#FFFFFF", minHeight: 44, borderRadius: 12 }}
          >
            Action
          </Control>,
        ),
      );
      const props = fixture.lastPressableProps!;
      const styles =
        typeof props.style === "function" ? props.style({ pressed: false }) : props.style;
      const merged = Object.assign({}, ...[styles].flat(Infinity).filter(Boolean));
      expect(merged.backgroundColor).toBe("rgba(255, 255, 255, 0.5)");
      expect(merged.opacity ?? 1).toBe(1);
      expect(merged.minHeight).toBe(44);
      expect(props.onPress).toBe(onPress);
      expect(container.textContent).toBe("Action");
    },
  );
  it("animates press-in with timing and releases card/control/icon presets with spring", () => {
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    act(() => {
      root.render(
        createElement(
          NativeMotionPressable,
          {
            preset: "card",
            onPressIn,
            onPressOut,
            style: { borderRadius: 20, opacity: 1 },
          },
          "Card",
        ),
      );
    });

    const pressIn = fixture.lastPressableProps?.onPressIn as (event: unknown) => void;
    const pressOut = fixture.lastPressableProps?.onPressOut as (event: unknown) => void;
    act(() => pressIn({ nativeEvent: {} }));
    expect(onPressIn).toHaveBeenCalledOnce();
    expect(fixture.timingCalls.at(-1)).toMatchObject({ toValue: 1, config: { duration: 110 } });

    act(() => pressOut({ nativeEvent: {} }));
    expect(onPressOut).toHaveBeenCalledOnce();
    expect(fixture.springCalls.at(-1)).toMatchObject({
      toValue: 0,
      config: PRESS_MOTION_PRESETS.card.spring,
    });
  });

  it("renders a PlatformColor-safe highlight overlay and uses timing release for row preset", () => {
    const platformColor = { semantic: ["secondarySystemFill"] } as unknown as string;
    act(() => {
      root.render(
        createElement(
          NativeMotionPressable,
          {
            preset: "row",
            highlightColor: platformColor,
            style: [{ borderRadius: 16 }],
          },
          "Row",
        ),
      );
    });

    expect(container.querySelector('[data-testid="animated-view"]')).not.toBeNull();
    expect(fixture.lastOverlayProps?.pointerEvents).toBe("none");
    const overlayStyle = fixture.lastOverlayProps?.style as Array<Record<string, unknown>>;
    expect(overlayStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: platformColor }),
        expect.objectContaining({ borderRadius: 16 }),
      ]),
    );

    const pressIn = fixture.lastPressableProps?.onPressIn as (event: unknown) => void;
    const pressOut = fixture.lastPressableProps?.onPressOut as (event: unknown) => void;
    act(() => pressIn({}));
    act(() => pressOut({}));
    expect(fixture.springCalls).toHaveLength(0);
    expect(fixture.timingCalls.at(-1)).toMatchObject({ toValue: 0, config: { duration: 170 } });
  });

  it("suppresses press animation when disabled or motionDisabled while keeping base opacity", () => {
    act(() => {
      root.render(
        createElement(
          NativeMotionPressable,
          {
            preset: "control",
            disabled: true,
            style: { opacity: 0.45 },
          },
          "Disabled",
        ),
      );
    });

    const pressIn = fixture.lastPressableProps?.onPressIn as (event: unknown) => void;
    const beforeCount = fixture.timingCalls.length;
    act(() => pressIn({}));
    expect(fixture.timingCalls.length).toBe(beforeCount);

    const styles = fixture.lastPressableProps?.style as Array<Record<string, unknown>>;
    const animatedStyle = styles.at(-1);
    expect(animatedStyle?.opacity).toBeCloseTo(0.45, 5);
  });

  it("removes scale transform and spring release when system Reduce Motion is enabled", () => {
    fixture.reducedMotion = true;
    act(() => {
      root.render(createElement(NativeMotionPressable, { preset: "icon" }, "Icon"));
    });

    const pressIn = fixture.lastPressableProps?.onPressIn as (event: unknown) => void;
    const pressOut = fixture.lastPressableProps?.onPressOut as (event: unknown) => void;
    act(() => pressIn({}));
    act(() => pressOut({}));

    expect(fixture.springCalls).toHaveLength(0);
    expect(fixture.timingCalls.at(-1)?.toValue).toBe(0);
    const styles = fixture.lastPressableProps?.style as Array<Record<string, unknown>>;
    const animatedStyle = styles.at(-1);
    expect(animatedStyle?.transform).toBeUndefined();
  });

  it("suppresses duplicate row highlight overlay when Android native ripple is attached", () => {
    fixture.os = "android";
    act(() => {
      root.render(
        createElement(
          NativeMotionPressable,
          {
            preset: "row",
            highlightColor: "#EEE",
            android_ripple: { color: "#DDD" },
          },
          "Android Row",
        ),
      );
    });

    expect(container.querySelector('[data-testid="animated-view"]')).toBeNull();
    const pressIn = fixture.lastPressableProps?.onPressIn as (event: unknown) => void;
    const beforeCount = fixture.timingCalls.length;
    act(() => pressIn({}));
    expect(fixture.timingCalls.length).toBe(beforeCount);
  });
});

describe("MotionPressable non-native fallback", () => {
  it("preserves plain-object and array style shapes while applying opacity and highlight feedback", () => {
    act(() => {
      root.render(
        createElement(
          FallbackMotionPressable,
          {
            preset: "control",
            style: { padding: 12, opacity: 0.5 },
          },
          "Button",
        ),
      );
    });

    const styleFn = fixture.lastPressableProps?.style as (state: {
      pressed: boolean;
    }) => Record<string, unknown>;
    expect(styleFn({ pressed: false })).toEqual({ padding: 12, opacity: 0.5 });
    expect(styleFn({ pressed: true })).toEqual({
      padding: 12,
      opacity: 0.5 * PRESS_MOTION_PRESETS.control.pressedOpacity,
    });

    act(() => {
      root.render(
        createElement(
          FallbackMotionPressable,
          {
            preset: "row",
            highlightColor: "#F8F6F2",
            style: [{ minHeight: 48 }],
          },
          "Row",
        ),
      );
    });

    const rowStyleFn = fixture.lastPressableProps?.style as (state: {
      pressed: boolean;
    }) => unknown[];
    expect(Array.isArray(rowStyleFn({ pressed: false }))).toBe(true);
    expect(rowStyleFn({ pressed: true })).toEqual([
      { minHeight: 48 },
      { backgroundColor: "#F8F6F2" },
    ]);
  });
});

describe("TabIndicator", () => {
  it("animates indicator selection smoothly on native and respects Reduce Motion", () => {
    act(() => {
      root.render(
        createElement(NativeTabIndicator, {
          selected: true,
          color: "#2B2823",
          borderRadius: 1,
        }),
      );
    });
    expect(fixture.timingCalls.at(-1)).toMatchObject({ toValue: 1, config: { duration: 200 } });

    fixture.reducedMotion = true;
    act(() => {
      root.render(
        createElement(NativeTabIndicator, {
          selected: false,
          color: "#2B2823",
          borderRadius: 1,
        }),
      );
    });
    expect(fixture.timingCalls.at(-1)).toMatchObject({ toValue: 0, config: { duration: 90 } });
    const style = fixture.lastOverlayProps?.style as Array<Record<string, unknown>>;
    expect(style.at(-1)?.transform).toEqual([{ scaleX: 1 }]);
  });

  it("switches backgroundColor cleanly on the fallback implementation", () => {
    act(() => {
      root.render(
        createElement(FallbackTabIndicator, {
          selected: false,
          color: "#2B2823",
          borderRadius: 1,
        }),
      );
    });
    const overlayStyle = fixture.lastOverlayProps?.style as Record<string, unknown> | undefined;
    expect(overlayStyle?.backgroundColor).toBe("transparent");
  });
});
