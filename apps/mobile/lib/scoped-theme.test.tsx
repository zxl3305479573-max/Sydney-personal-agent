// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppBackground } from "./app-background";
import type { ThemePackV1 } from "./theme-pack";

const runtime = vi.hoisted(() => ({
  platform: { OS: "ios" },
  storage: new Map<string, string>(),
  focusedRoute: "index",
  currentRenderRoute: "index",
  appearance: "dark" as "dark" | "light",
  background: {
    palette: null,
    imageUri: null,
    fit: "cover",
    opacity: 1,
    overlayOpacity: 0.35,
  } as AppBackground,
}));

vi.mock("./app-background", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./app-background")>()),
  useAppBackground: () => runtime.background,
}));

vi.mock("expo-router", () => ({
  useIsFocused: () => runtime.focusedRoute === runtime.currentRenderRoute,
}));
vi.mock("expo-router/react-navigation", () => ({
  DarkTheme: { dark: true, colors: {} },
  ThemeProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => runtime.storage.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    runtime.storage.set(key, value);
  },
}));
vi.mock("react-native", () => ({
  Platform: runtime.platform,
  Appearance: {
    getColorScheme: () => runtime.appearance,
    setColorScheme: vi.fn(),
    addChangeListener: () => ({ remove: vi.fn() }),
  },
  StyleSheet: {
    absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
    create: <T,>(styles: T) => styles,
    hairlineWidth: 1,
  },
  View: ({
    children,
    pointerEvents,
    style,
  }: {
    children?: ReactNode;
    pointerEvents?: string;
    style?: unknown;
  }) => (
    <div data-pointer-events={pointerEvents} data-style={JSON.stringify(style ?? null)}>
      {children}
    </div>
  ),
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} alt="" />,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children }: { children?: ReactNode }) => <button type="button">{children}</button>,
}));
vi.mock("./monitoring", () => ({ reportMobileError: vi.fn() }));
vi.mock("./native", () => ({ useResolvedAppearance: () => runtime.appearance }));

import { ScopedThemeRoute } from "../components/scoped-theme";
import { useScopedTheme } from "./scoped-theme-context";
import { themeManager } from "./theme-state";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const globalPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "ocean",
  name: "Ocean",
  author: "Test",
  version: "1.0.0",
  coverage: "all",
  defaults: {
    colors: { dark: { background: "#001122", primary: "#38BDF8" } },
    background: { dark: "bg", opacity: 0.25 },
  },
  assets: { bg: TINY_PNG },
};

const inboxPack: ThemePackV1 = {
  schemaVersion: 1,
  id: "amber-inbox",
  name: "Amber Inbox",
  author: "Test",
  version: "1.0.0",
  coverage: ["inbox"],
  defaults: {
    colors: { dark: { background: "#221100", primary: "#F59E0B" } },
    layout: "cards",
  },
};

function ScopeProbe({ id }: { id: string }) {
  const theme = useScopedTheme();
  return (
    <span data-testid={id}>
      {`${theme?.scope ?? "none"}:${theme?.tokens.background ?? "default"}:${theme?.layout ?? "classic"}`}
    </span>
  );
}

function MountedRoute({ routeName, id }: { routeName: string; id: string }) {
  runtime.currentRenderRoute = routeName;
  return (
    <ScopedThemeRoute routeName={routeName}>
      <ScopeProbe id={id} />
    </ScopedThemeRoute>
  );
}

describe("ScopedThemeRoute isolation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    runtime.storage.clear();
    runtime.focusedRoute = "index";
    runtime.appearance = "dark";
    runtime.platform.OS = "ios";
    runtime.background = {
      palette: null,
      imageUri: null,
      fit: "cover",
      opacity: 1,
      overlayOpacity: 0.35,
    };
    const map = new Map<string, ThemePackV1>([
      [globalPack.id, globalPack],
      [inboxPack.id, inboxPack],
    ]);
    await themeManager.load({
      list: async () => [...map.values()],
      save: async (pack) => {
        map.set(pack.id, pack);
      },
      remove: async (id) => {
        map.delete(id);
      },
    });
    if (!themeManager.getSnapshot().packs.some((p) => p.id === globalPack.id)) {
      await themeManager.install(globalPack);
    }
    if (!themeManager.getSnapshot().packs.some((p) => p.id === inboxPack.id)) {
      await themeManager.install(inboxPack);
    }
    await themeManager.reset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  it("keeps background screens isolated to their own route scope and only updates activeScope for the focused route", async () => {
    await themeManager.assign("all", "ocean");
    await themeManager.assign("inbox", "amber-inbox");

    runtime.focusedRoute = "thread";
    await act(async () =>
      root.render(
        <>
          <MountedRoute routeName="index" id="home" />
          <MountedRoute routeName="thread" id="chat" />
          <MountedRoute routeName="(settings)" id="settings" />
        </>,
      ),
    );

    expect(container.querySelector('[data-testid="home"]')?.textContent).toBe(
      "inbox:#221100:cards",
    );
    expect(container.querySelector('[data-testid="chat"]')?.textContent).toBe(
      "thread:#001122:classic",
    );
    expect(container.querySelector('[data-testid="settings"]')?.textContent).toBe(
      "settings:#001122:classic",
    );
    expect(themeManager.getActiveScope()).toBe("thread");

    // Non-interactive background wrapper must be present for ocean background.
    expect(container.querySelector('[data-pointer-events="none"] img')).not.toBeNull();
  });

  it("recovers the failing page scope when a themed screen throws during render", async () => {
    await themeManager.assign("inbox", "amber-inbox");
    function CrashingHome() {
      const theme = useScopedTheme();
      if (theme?.mode.id === "amber-inbox") throw new Error("bad theme render");
      return <span data-testid="safe-home">{theme?.mode.id ?? "classic"}</span>;
    }

    runtime.focusedRoute = "index";
    runtime.currentRenderRoute = "index";
    await act(async () =>
      root.render(
        <ScopedThemeRoute routeName="index">
          <CrashingHome />
        </ScopedThemeRoute>,
      ),
    );

    expect(container.querySelector('[data-testid="safe-home"]')?.textContent).toBe("classic");
    expect(themeManager.getSnapshot().assignments.pages.inbox).toBeUndefined();
  });

  it("applies the global photo across classic home, chats, projects and settings on both platforms", async () => {
    for (const platform of ["ios", "android"]) {
      runtime.platform.OS = platform;
      runtime.background = {
        ...runtime.background,
        palette: "mint",
        imageUri: "file://documents/background.jpg",
      };
      await act(async () =>
        root.render(
          ["index", "thread", "projects", "(settings)"].map((routeName) => (
            <MountedRoute key={routeName} routeName={routeName} id={routeName} />
          )),
        ),
      );
      expect(container.querySelectorAll('img[src="file://documents/background.jpg"]')).toHaveLength(
        4,
      );
      expect(container.textContent).toContain("inbox:#17251E:classic");
      expect(container.textContent).toContain("thread:#17251E:classic");
      expect(container.textContent).toContain("projects:#17251E:classic");
      expect(container.textContent).toContain("settings:#17251E:classic");
      runtime.appearance = "light";
      await act(async () => root.render(<MountedRoute routeName="(settings)" id="light-global" />));
      expect(container.textContent).toContain("settings:#EAF3ED:classic");
      runtime.appearance = "dark";
    }
  });

  it("restores the assigned theme pack when global customization is cleared", async () => {
    await themeManager.assign("all", "ocean");
    runtime.background = {
      ...runtime.background,
      imageUri: "file://documents/global.jpg",
      palette: "porcelain",
    };
    await act(async () => root.render(<MountedRoute routeName="thread" id="customized" />));
    expect(container.textContent).toContain("thread:#211E1B:classic");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("file://documents/global.jpg");
    runtime.background = { ...runtime.background, imageUri: null, palette: null };
    await act(async () => root.render(<MountedRoute routeName="thread" id="restored" />));
    expect(container.textContent).toContain("thread:#001122:classic");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(TINY_PNG);
    expect(themeManager.getSnapshot().assignments.globalPackId).toBe("ocean");
  });

  it("keeps the built-in midnight color scheme while using a global photo", async () => {
    await themeManager.assign("all", "midnight");
    runtime.appearance = "light";
    runtime.background = {
      ...runtime.background,
      palette: "mint",
      imageUri: "file://documents/global.jpg",
    };
    await act(async () => root.render(<MountedRoute routeName="(settings)" id="midnight" />));
    expect(container.textContent).toContain("settings:#17251E:classic");
    expect(
      container.querySelector('[data-pointer-events="none"] div')?.getAttribute("data-style"),
    ).toContain('"backgroundColor":"#000000"');
  });

  it("renders a non-interactive scrim above the background image only when overlayOpacity > 0", async () => {
    // Legacy pack without overlayOpacity renders image only (no scrim sibling)
    await themeManager.assign("all", "ocean");
    await act(async () => root.render(<MountedRoute routeName="thread" id="no-scrim" />));
    const legacyWrapper = container.querySelector('[data-pointer-events="none"]');
    expect(legacyWrapper?.querySelector("img")).not.toBeNull();
    expect(legacyWrapper?.querySelectorAll("div")).toHaveLength(0);

    // Pack with overlayOpacity > 0 renders dark scrim (#000000) in dark mode and white scrim (#FFFFFF) in light mode
    const scrimPack: ThemePackV1 = {
      schemaVersion: 1,
      id: "scrim-pack",
      name: "Scrim Pack",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: {
        background: { light: "bg", dark: "bg", opacity: 0.3, overlayOpacity: 0.4 },
      },
      assets: { bg: TINY_PNG },
    };
    await themeManager.install(scrimPack, true);
    await themeManager.assign("all", "scrim-pack");

    runtime.appearance = "dark";
    await act(async () => root.render(<MountedRoute routeName="thread" id="dark-scrim" />));
    const darkWrapper = container.querySelector('[data-pointer-events="none"]');
    const darkChildren = [...(darkWrapper?.children ?? [])];
    expect(darkChildren[0]?.tagName).toBe("IMG");
    expect(darkChildren[1]?.tagName).toBe("DIV");
    expect(darkChildren[1]?.getAttribute("data-style")).toContain('"backgroundColor":"#000000"');
    expect(darkChildren[1]?.getAttribute("data-style")).toContain('"opacity":0.4');

    runtime.appearance = "light";
    await act(async () => root.render(<MountedRoute routeName="thread" id="light-scrim" />));
    const lightWrapper = container.querySelector('[data-pointer-events="none"]');
    const lightChildren = [...(lightWrapper?.children ?? [])];
    expect(lightChildren[0]?.tagName).toBe("IMG");
    expect(lightChildren[1]?.tagName).toBe("DIV");
    expect(lightChildren[1]?.getAttribute("data-style")).toContain('"backgroundColor":"#FFFFFF"');
    expect(lightChildren[1]?.getAttribute("data-style")).toContain('"opacity":0.4');
  });
});
