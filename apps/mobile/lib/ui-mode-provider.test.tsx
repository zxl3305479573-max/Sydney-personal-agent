// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classicUiMode } from "../ui-modes/classic";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
}));

vi.mock("react-native", () => ({
  Platform: runtime.platform,
  StyleSheet: { absoluteFill: {}, create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async (key: string) => runtime.storage.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    runtime.storage.set(key, value);
  }),
}));
vi.mock("./native", () => ({ useResolvedAppearance: () => "dark" }));
vi.mock("./monitoring", () => ({ reportMobileError: vi.fn() }));

import { setUiMode } from "./ui-mode";
import { UiModeProvider } from "./ui-mode-provider";
import { registerUiMode, unregisterUiMode } from "./ui-mode-registry";
import { UiModeScreenHost, useUiModeTheme } from "./ui-mode-slots";

describe("UiModeProvider", () => {
  let root: Root;
  let container: HTMLDivElement;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    runtime.storage.clear();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      await setUiMode("classic");
    });
  });

  afterEach(async () => {
    await act(async () => {
      await setUiMode("classic");
    });
    unregisterUiMode("provider-mode");
    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it("updates the provided theme when a registered mode changes", async () => {
    registerUiMode({
      ...classicUiMode,
      id: "provider-mode",
      name: "Provider mode",
      supportedPlatforms: ["ios"],
      colors: { dark: { background: "#123456" } },
    });

    function Harness() {
      const theme = useUiModeTheme();
      return (
        <>
          <span data-testid="mode-theme">{`${theme.mode.id}:${theme.tokens.background}`}</span>
          <button type="button" onClick={() => void setUiMode("provider-mode")}>
            Switch mode
          </button>
          <UiModeScreenHost
            slot="inbox"
            controller={{ sessionCount: 2 }}
            renderClassic={() => <span>Classic inbox</span>}
          />
        </>
      );
    }

    await act(async () => {
      root.render(
        <UiModeProvider>
          <Harness />
        </UiModeProvider>,
      );
    });
    expect(container.querySelector('[data-testid="mode-theme"]')?.textContent).toBe(
      "classic:#141414",
    );

    await act(async () => {
      container.querySelector("button")?.click();
    });
    expect(container.querySelector('[data-testid="mode-theme"]')?.textContent).toBe(
      "provider-mode:#123456",
    );

    act(() => {
      registerUiMode(
        {
          ...classicUiMode,
          id: "provider-mode",
          name: "Provider mode",
          supportedPlatforms: ["ios"],
          colors: { dark: { background: "#654321" } },
        },
        { replace: true },
      );
    });
    expect(container.querySelector('[data-testid="mode-theme"]')?.textContent).toBe(
      "provider-mode:#654321",
    );
  });

  it("falls back to classic when an active screen slot throws", async () => {
    function BrokenScreen(): ReactNode {
      throw new Error("screen failed");
    }

    registerUiMode({
      ...classicUiMode,
      id: "provider-mode",
      name: "Provider mode",
      supportedPlatforms: ["ios"],
      screens: { inbox: BrokenScreen },
    });

    function Harness() {
      return (
        <UiModeScreenHost
          slot="inbox"
          controller={{ sessionCount: 2 }}
          renderClassic={() => <span data-testid="classic-fallback">Classic inbox</span>}
        />
      );
    }

    await act(async () => {
      await setUiMode("provider-mode");
      root.render(
        <UiModeProvider>
          <Harness />
        </UiModeProvider>,
      );
    });
    expect(container.querySelector('[data-testid="classic-fallback"]')?.textContent).toBe(
      "Classic inbox",
    );
    expect(runtime.storage.get("sydney.mobile.uiMode.v1")).toContain('"activeModeId":"classic"');
  });
});
