// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  reduceMotion: false,
  width: 393,
  appearance: "light" as "light" | "dark",
}));

vi.mock("../assets/splash-icon.png", () => ({ default: "splash-icon.png" }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => fixture.appearance,
}));
vi.mock("react-native-svg", () => ({
  default: ({
    children,
    width,
    height,
  }: {
    children?: ReactNode;
    width?: number;
    height?: number;
  }) => createElement("svg", { width, height }, children),
  Path: ({ d }: { d?: string }) => createElement("path", { d }),
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({
      children,
      testID,
      accessibilityLabel,
    }: {
      children?: ReactNode;
      testID?: string;
      accessibilityLabel?: string;
    }) =>
      createElement("div", { "data-testid": testID, "aria-label": accessibilityLabel }, children),
    createAnimatedComponent: (Component: unknown) => Component,
  },
  Easing: {
    out: (fn: unknown) => fn,
    inOut: (fn: unknown) => fn,
    cubic: (x: number) => x,
    quad: (x: number) => x,
  },
  useSharedValue: (initial: number) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => ({}),
  withTiming: (value: number) => value,
  withDelay: (_ms: number, value: number) => value,
  withSequence: (...values: number[]) => values.at(-1) ?? 0,
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => fixture.reduceMotion),
  },
  Image: ({ style }: { style?: { width?: number; height?: number } }) =>
    createElement("img", { width: style?.width, height: style?.height }),
  StyleSheet: {
    absoluteFill: { position: "absolute" },
    create: <T,>(styles: T) => styles,
  },
  Text: ({ children }: { children?: ReactNode }) => createElement("span", null, children),
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) =>
    createElement("div", { "data-testid": testID }, children),
  useWindowDimensions: () => ({ width: fixture.width, height: 852, fontScale: 1 }),
}));

import {
  resolveSplashLogoSize,
  SPLASH_LOGO_MAX_SIZE,
  SPLASH_LOGO_MIN_SIZE,
  StartupSplash,
} from "../components/startup-splash";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  fixture.reduceMotion = false;
  fixture.width = 393;
  fixture.appearance = "light";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("StartupSplash & app.json splash config", () => {
  it("configures an enlarged native splash imageWidth in app.json", () => {
    const appJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../app.json"), "utf8"),
    ) as { expo: { plugins: unknown[] } };
    const splashPlugin = appJson.expo.plugins.find(
      (entry): entry is [string, { imageWidth?: number; backgroundColor?: string }] =>
        Array.isArray(entry) && entry[0] === "expo-splash-screen",
    );
    expect(splashPlugin).toBeDefined();
    expect(splashPlugin?.[1].imageWidth).toBeGreaterThanOrEqual(200);
    expect(splashPlugin?.[1].backgroundColor).toBe("#F3F1EC");
  });

  it("scales splash logo size generously across phone and tablet widths", () => {
    expect(resolveSplashLogoSize(320)).toBe(SPLASH_LOGO_MIN_SIZE);
    expect(resolveSplashLogoSize(393)).toBe(220);
    expect(resolveSplashLogoSize(768)).toBe(SPLASH_LOGO_MAX_SIZE);
  });

  it("renders enlarged logo and brand mark, then fades out and calls onFinished", async () => {
    const onFinished = vi.fn();
    await act(async () => {
      root.render(createElement(StartupSplash, { ready: true, onFinished }));
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="startup-splash-overlay"]')).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("220");
    expect(container.textContent).toContain("Sydney");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(onFinished).toHaveBeenCalledOnce();
    expect(container.querySelector('[data-testid="startup-splash-overlay"]')).toBeNull();
  });

  it("shortens splash duration when Reduce Motion is enabled", async () => {
    fixture.reduceMotion = true;
    const onFinished = vi.fn();
    await act(async () => {
      root.render(createElement(StartupSplash, { ready: true, onFinished }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(460);
    });
    expect(onFinished).toHaveBeenCalledOnce();
  });
});
