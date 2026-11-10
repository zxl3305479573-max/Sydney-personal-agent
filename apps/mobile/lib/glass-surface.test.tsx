// @vitest-environment jsdom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { GlassSurface } from "../components/glass-surface.ios";

const device = vi.hoisted(() => ({ supportsGlass: true }));

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
  Host: ({ children, pointerEvents }: { children?: ReactNode; pointerEvents?: string }) => (
    <div data-glass-host={pointerEvents}>{children}</div>
  ),
  Capsule: () => <div data-shape="capsule" />,
  Circle: () => <div data-shape="circle" />,
  RoundedRectangle: ({ cornerRadius }: { cornerRadius: number }) => (
    <div data-shape="rounded" data-radius={cornerRadius} />
  ),
}));
vi.mock("@expo/ui/swift-ui/modifiers", () => ({
  foregroundStyle: () => ({}),
  glassEffect: () => ({}),
}));
vi.mock("./native", () => ({ useResolvedAppearance: () => "dark" }));
vi.mock("./native-controls", () => ({ iosAtLeast: () => device.supportsGlass }));

it("keeps glass behind interactive content on iOS 26", () => {
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
  expect(element.querySelector('[data-glass-host="none"] [data-radius="12"]')).not.toBeNull();
});

it("retains children and test identity when native glass is unavailable", () => {
  device.supportsGlass = false;
  const markup = renderToStaticMarkup(
    <GlassSurface testID="card" fallbackStyle={{ backgroundColor: "white" }}>
      <button type="button">Open</button>
    </GlassSurface>,
  );
  const element = new DOMParser().parseFromString(markup, "text/html");
  expect(element.querySelector('[data-testid="card"] button')?.textContent).toBe("Open");
  expect(element.querySelector("[data-glass-host]")).toBeNull();
});
