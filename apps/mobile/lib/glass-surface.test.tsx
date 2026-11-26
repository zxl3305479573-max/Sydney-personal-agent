// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GlassSurface } from "../components/glass-surface.ios";

const device = vi.hoisted(() => ({
  supportsGlass: true,
  policy: { mode: "liquid", defaultCornerRadius: 22 } as {
    mode: "liquid" | "tinted-liquid" | "solid-fallback";
    defaultTint?: string;
    defaultCornerRadius?: number;
  },
  glassEffect: vi.fn((options: unknown) => options),
}));

vi.mock("react-native", () => ({
  StyleSheet: { absoluteFill: {} },
  View: ({
    children,
    testID,
    accessibilityLabel,
    accessibilityRole,
    accessibilityLiveRegion,
    accessibilityViewIsModal,
  }: {
    children?: ReactNode;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityLiveRegion?: string;
    accessibilityViewIsModal?: boolean;
  }) => (
    <div
      data-testid={testID}
      data-accessibility-label={accessibilityLabel}
      role={accessibilityRole}
      aria-live={accessibilityLiveRegion as "off" | "polite" | "assertive" | undefined}
      data-modal={accessibilityViewIsModal}
    >
      {children}
    </div>
  ),
}));
vi.mock("@expo/ui/swift-ui", () => ({
  Host: ({
    children,
    ignoreSafeArea,
    pointerEvents,
  }: {
    children?: ReactNode;
    ignoreSafeArea?: string;
    pointerEvents?: string;
  }) => (
    <div data-glass-host={pointerEvents} data-ignore-safe-area={ignoreSafeArea}>
      {children}
    </div>
  ),
  Capsule: () => <div data-shape="capsule" />,
  Circle: () => <div data-shape="circle" />,
  RoundedRectangle: ({ cornerRadius }: { cornerRadius: number }) => (
    <div data-shape="rounded" data-radius={cornerRadius} />
  ),
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => ({
  foregroundStyle: () => ({}),
  glassEffect: device.glassEffect,
}));
vi.mock("./native", () => ({ useResolvedAppearance: () => "dark" }));
vi.mock("./ui-mode", () => ({
  getActiveUiMode: () => ({ glassPolicy: device.policy }),
}));
vi.mock("./native-controls", () => ({ iosAtLeast: () => device.supportsGlass }));

it("keeps ordinary surfaces flat and interactive on iOS 26", () => {
  device.supportsGlass = true;
  const markup = renderToStaticMarkup(
    <GlassSurface
      testID="card"
      accessibilityLabel="Connection"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityViewIsModal
      shape="roundedRectangle"
      cornerRadius={12}
    >
      <button type="button">Open</button>
    </GlassSurface>,
  );
  const element = new DOMParser().parseFromString(markup, "text/html");
  expect(element.querySelector('[data-testid="card"] button')?.textContent).toBe("Open");
  expect(
    element.querySelector('[data-testid="card"]')?.getAttribute("data-accessibility-label"),
  ).toBe("Connection");
  expect(element.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe("assertive");
  expect(element.querySelector('[role="alert"]')?.getAttribute("data-modal")).toBe("true");
  expect(element.querySelector("[data-glass-host]")).toBeNull();
});

it("retains children and test identity when native glass is unavailable", () => {
  device.supportsGlass = false;
  const markup = renderToStaticMarkup(
    <GlassSurface chatTitle testID="card" fallbackStyle={{ backgroundColor: "white" }}>
      <button type="button">Open</button>
    </GlassSurface>,
  );
  const element = new DOMParser().parseFromString(markup, "text/html");
  expect(element.querySelector('[data-testid="card"] button')?.textContent).toBe("Open");
  expect(element.querySelector("[data-glass-host]")).toBeNull();
});

it("uses tinted mode defaults while honoring explicit tint and radius", () => {
  device.supportsGlass = true;
  device.policy = { mode: "tinted-liquid", defaultTint: "#123456", defaultCornerRadius: 18 };
  device.glassEffect.mockClear();
  renderToStaticMarkup(
    <GlassSurface chatTitle shape="roundedRectangle">
      <span>default tint</span>
    </GlassSurface>,
  );
  expect(device.glassEffect).toHaveBeenLastCalledWith({
    glass: { variant: "regular", tint: "#123456" },
    shape: "roundedRectangle",
    cornerRadius: 18,
  });

  renderToStaticMarkup(
    <GlassSurface chatTitle shape="roundedRectangle" tint="#abcdef" cornerRadius={9}>
      <span>custom tint</span>
    </GlassSurface>,
  );
  expect(device.glassEffect).toHaveBeenLastCalledWith({
    glass: { variant: "regular", tint: "#abcdef" },
    shape: "roundedRectangle",
    cornerRadius: 9,
  });
});

it("uses the solid fallback policy even when native glass is available", () => {
  device.supportsGlass = true;
  device.policy = { mode: "solid-fallback", defaultCornerRadius: 18 };
  device.glassEffect.mockClear();
  const markup = renderToStaticMarkup(
    <GlassSurface chatTitle testID="solid" fallbackStyle={{ backgroundColor: "black" }}>
      <button type="button">Open</button>
    </GlassSurface>,
  );
  const element = new DOMParser().parseFromString(markup, "text/html");
  expect(element.querySelector('[data-testid="solid"] button')?.textContent).toBe("Open");
  expect(element.querySelector("[data-glass-host]")).toBeNull();
  expect(device.glassEffect).not.toHaveBeenCalled();
  device.policy = { mode: "liquid", defaultCornerRadius: 22 };
});

it("reserves native glass for the chat title and keeps it behind the content", () => {
  device.supportsGlass = true;
  device.policy = { mode: "liquid", defaultCornerRadius: 22 };
  const markup = renderToStaticMarkup(
    <GlassSurface chatTitle>
      <button type="button">Bot profile</button>
    </GlassSurface>,
  );
  const element = new DOMParser().parseFromString(markup, "text/html");
  expect(
    element.querySelector('[data-glass-host="none"][data-ignore-safe-area="all"]'),
  ).not.toBeNull();
  expect(element.querySelector('[data-shape="capsule"]')).not.toBeNull();
  expect(element.querySelector("button")?.textContent).toBe("Bot profile");
});

it("enables native Liquid Glass for floating system overlays on iOS 26 while honoring fallback policies", () => {
  device.supportsGlass = true;
  device.policy = { mode: "liquid", defaultCornerRadius: 22 };
  device.glassEffect.mockClear();

  const bannerMarkup = renderToStaticMarkup(
    <GlassSurface nativeOverlay shape="roundedRectangle" cornerRadius={26} testID="overlay-banner">
      <span>Notification</span>
    </GlassSurface>,
  );
  const bannerDoc = new DOMParser().parseFromString(bannerMarkup, "text/html");
  expect(
    bannerDoc.querySelector('[data-glass-host="none"][data-ignore-safe-area="all"]'),
  ).not.toBeNull();
  expect(bannerDoc.querySelector('[data-shape="rounded"][data-radius="26"]')).not.toBeNull();
  expect(device.glassEffect).toHaveBeenLastCalledWith({
    glass: { variant: "regular" },
    shape: "roundedRectangle",
    cornerRadius: 26,
  });

  const orbMarkup = renderToStaticMarkup(
    <GlassSurface nativeOverlay glassVariant="clear" shape="circle" testID="overlay-orb">
      <span>Orb</span>
    </GlassSurface>,
  );
  const orbDoc = new DOMParser().parseFromString(orbMarkup, "text/html");
  expect(orbDoc.querySelector('[data-shape="circle"]')).not.toBeNull();
  expect(device.glassEffect).toHaveBeenLastCalledWith({
    glass: { variant: "clear" },
    shape: "circle",
    cornerRadius: 22,
  });

  device.policy = { mode: "solid-fallback", defaultCornerRadius: 16 };
  const fallbackMarkup = renderToStaticMarkup(
    <GlassSurface nativeOverlay shape="capsule" testID="overlay-fallback">
      <span>Status</span>
    </GlassSurface>,
  );
  const fallbackDoc = new DOMParser().parseFromString(fallbackMarkup, "text/html");
  expect(fallbackDoc.querySelector("[data-glass-host]")).toBeNull();
  expect(fallbackDoc.querySelector('[data-testid="overlay-fallback"]')?.textContent).toBe("Status");
  device.policy = { mode: "liquid", defaultCornerRadius: 22 };
});
