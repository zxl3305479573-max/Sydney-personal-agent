// @vitest-environment jsdom

import * as SplashScreen from "expo-splash-screen";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "../components/app-error-boundary";
import { ServerSettingsStartupError } from "./startup";

const modeState = vi.hoisted(() => ({
  isClassic: true,
  themeHydrated: false,
  themeGlobalId: "classic",
  themeReset: vi.fn(async () => {
    modeState.themeGlobalId = "classic";
  }),
  themeCancelPreview: vi.fn(),
}));

vi.mock("./monitoring", () => ({ reportMobileError: vi.fn() }));
vi.mock("./theme-state", () => ({
  themeManager: {
    getSnapshot: () => ({
      hydrated: modeState.themeHydrated,
      packs: [],
      assignments: { schemaVersion: 1, globalPackId: modeState.themeGlobalId, pages: {} },
      preview: null,
      warning: null,
    }),
    reset: modeState.themeReset,
    cancelPreview: modeState.themeCancelPreview,
  },
}));
vi.mock("./ui-mode", () => ({
  getUiModeSnapshot: () => ({ isClassic: modeState.isClassic }),
  resetUiModeToClassic: vi.fn(async () => {
    modeState.isClassic = true;
  }),
}));
vi.mock("expo-splash-screen", () => ({ hideAsync: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/appearance", () => ({
  mobileTokens: () => ({
    background: "background",
    foreground: "foreground",
    primary: "primary",
    primaryForeground: "primary-foreground",
  }),
}));
vi.mock("../lib/i18n", () => ({ t: (text: string) => text }));
vi.mock("react-native", () => ({
  Pressable: (props: { children?: ReactNode; onPress?: () => void }) => (
    <button type="button" onClick={props.onPress}>
      {props.children}
    </button>
  ),
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

let shouldThrow = true;
let serverSettingsFailure = false;

function Child() {
  if (shouldThrow && serverSettingsFailure) throw new ServerSettingsStartupError("not verified");
  if (!modeState.isClassic) throw new Error("mode render failed");
  if (shouldThrow) throw new Error("render failed");
  return <div>Recovered content</div>;
}

describe("AppErrorBoundary", () => {
  let root: Root;
  let container: HTMLDivElement;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    modeState.isClassic = true;
    modeState.themeHydrated = false;
    modeState.themeGlobalId = "classic";
    modeState.themeReset.mockClear();
    modeState.themeCancelPreview.mockClear();
    shouldThrow = true;
    serverSettingsFailure = false;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows one retry action and renders the children again after retry", () => {
    act(() =>
      root.render(
        <AppErrorBoundary>
          <Child />
        </AppErrorBoundary>,
      ),
    );

    const retry = container.querySelector("button");
    expect(container.textContent).not.toContain("Server settings or the saved session");
    expect(container.textContent).toContain("Error: render failed");
    expect(retry?.textContent).toBe("Try again");
    expect(SplashScreen.hideAsync).toHaveBeenCalledOnce();

    shouldThrow = false;
    act(() => retry?.click());

    expect(container.textContent).toBe("Recovered content");
  });

  it("explains a server settings failure and retries the child", () => {
    serverSettingsFailure = true;
    act(() =>
      root.render(
        <AppErrorBoundary>
          <Child />
        </AppErrorBoundary>,
      ),
    );
    expect(container.textContent).toContain(
      "Server settings or the saved session could not be verified.",
    );
    expect(container.textContent).not.toContain("not verified");
    const retry = container.querySelector("button");
    shouldThrow = false;
    act(() => retry?.click());
    expect(container.textContent).toBe("Recovered content");
  });

  it("returns to classic and retries automatically after a non-classic render failure", () => {
    modeState.isClassic = false;
    shouldThrow = false;
    act(() =>
      root.render(
        <AppErrorBoundary>
          <Child />
        </AppErrorBoundary>,
      ),
    );
    expect(modeState.isClassic).toBe(true);
    expect(container.textContent).toBe("Recovered content");
  });

  it("shows sanitized diagnostics for render errors outside a route boundary", () => {
    function BrokenRoute(): never {
      throw new TypeError("Missing native view; Bearer abc.def password=secret");
    }
    act(() =>
      root.render(
        <AppErrorBoundary>
          <BrokenRoute />
        </AppErrorBoundary>,
      ),
    );
    expect(container.textContent).toContain("TypeError: Missing native view");
    expect(container.textContent).not.toContain("abc.def");
    expect(container.textContent).not.toContain("password=secret");
  });

  it("does not reset the selected mode for a server settings failure", () => {
    modeState.isClassic = false;
    serverSettingsFailure = true;
    act(() =>
      root.render(
        <AppErrorBoundary>
          <Child />
        </AppErrorBoundary>,
      ),
    );
    expect(modeState.isClassic).toBe(false);
    expect(container.textContent).toContain(
      "Server settings or the saved session could not be verified.",
    );
  });

  it("resets an active custom theme pack and retries automatically after a render failure", () => {
    modeState.themeHydrated = true;
    modeState.themeGlobalId = "ocean";
    shouldThrow = false;
    function ThemeChild() {
      if (modeState.themeGlobalId !== "classic") throw new Error("theme pack failed");
      return <div>Recovered content</div>;
    }
    act(() =>
      root.render(
        <AppErrorBoundary>
          <ThemeChild />
        </AppErrorBoundary>,
      ),
    );
    expect(modeState.themeReset).toHaveBeenCalledOnce();
    expect(container.textContent).toBe("Recovered content");
  });
});
