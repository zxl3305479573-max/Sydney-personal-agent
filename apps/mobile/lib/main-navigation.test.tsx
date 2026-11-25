// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainBottomNavigation } from "../components/main-bottom-navigation";
import { MainNavigationHeader } from "../components/main-navigation-header";
import {
  MAIN_NAVIGATION_ROUTES,
  MainNavigationProvider,
  openMainNavigation,
  showsMainNavigation,
  useHideMainNavigation,
  useMainNavigationHidden,
} from "./main-navigation";
import { ScopedThemeContext } from "./scoped-theme-context";
import { registerTabScrollToTop } from "./tab-scroll-to-top";
import type { ResolvedScopedTheme } from "./theme-pack";

const state = vi.hoisted(() => ({
  pathname: "/",
  locale: "zh-CN",
  focused: true,
  router: { push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn() },
  header: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => state.router,
  usePathname: () => state.pathname,
  useFocusEffect: (callback: EffectCallback) =>
    useEffect(() => (state.focused ? callback() : undefined), [callback, state.focused]),
  Stack: {
    Screen: (props: unknown) => {
      state.header(props);
      return null;
    },
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 34 }),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: state.locale, t: (text: string) => text }) }));
vi.mock("./native", () => ({
  useResolvedAppearance: () => "light",
  useMobileTokens: () => ({
    foreground: "#1B1916",
    card: "#FFFFFF",
    primary: "#1B1916",
    mutedForeground: "#6F6A61",
    muted: "#F1EEE8",
    accent: "#E8E4DC",
    background: "#F1EEE8",
    border: "#DCD7CE",
  }),
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => <i /> }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios", Version: 26 },
  StyleSheet: { hairlineWidth: 1 },
  View: ({
    children,
    style,
    testID,
  }: {
    children?: ReactNode;
    style?: object;
    testID?: string;
  }) => (
    <div style={style} data-testid={testID}>
      {children}
    </div>
  ),
  Text: ({ children, style }: { children?: ReactNode; style?: object }) => (
    <span style={style}>{children}</span>
  ),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    onPress,
    style,
  }: {
    children: ReactNode;
    accessibilityLabel: string;
    accessibilityRole: string;
    accessibilityState?: { selected: boolean };
    onPress: () => void;
    style: object | ((state: { pressed: boolean }) => object);
  }) => (
    <button
      type="button"
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      data-selected={accessibilityState?.selected}
      onClick={onPress}
      style={typeof style === "function" ? style({ pressed: false }) : style}
    >
      {children}
    </button>
  ),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pathname = "/";
  state.locale = "zh-CN";
  state.focused = true;
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("main mobile navigation", () => {
  it("defines the 3 editorial bottom navigation routes", () => {
    expect(MAIN_NAVIGATION_ROUTES).toEqual(["/", "/chats", "/projects"]);
  });

  it("shows three equal-width native icon+label tabs with 首页 selected on /", () => {
    act(() => root.render(<MainBottomNavigation />));
    const bar = container.querySelector<HTMLElement>('[data-testid="main-bottom-navigation"]')!;
    expect(bar.children).toHaveLength(3);
    expect(bar.style.paddingBottom).toBe("34px");
    expect(bar.style.backgroundColor).toBe("rgb(250, 248, 244)");
    const items = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(items.map((item) => item.textContent)).toEqual(["首页", "聊天", "项目"]);
    expect(items.map((item) => item.getAttribute("data-selected"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    for (const item of items) {
      expect(item.style.flex).toBe("1 1 0%");
      // Native bottom bar: SF Symbol / Ionicons icon paired with compact label
      expect(item.querySelector("i")).not.toBeNull();
      expect(item.querySelector("span")?.style.fontSize).toBe("11px");
    }
    // Active tab has semibold foreground label + warm neutral underline indicator
    expect(items[0]!.querySelector("span")?.style.fontWeight).toBe("600");
    expect(items[0]!.querySelector("div")?.style.backgroundColor).toBe("rgb(94, 88, 79)");
    // Inactive tab has regular weight + transparent indicator
    expect(items[1]!.querySelector("span")?.style.fontWeight).toBe("400");
    expect(items[1]!.querySelector("div")?.style.backgroundColor).toBe("transparent");

    act(() => items[1]!.click());
    expect(state.router.push).toHaveBeenCalledWith("/chats");
  });

  it("uses React Navigation tab navigation when hosted inside Expo Router Tabs and scrolls to top on active re-tap", () => {
    const emit = vi.fn(() => ({ defaultPrevented: false }));
    const navigate = vi.fn();
    const scrollHome = vi.fn();
    const unregister = registerTabScrollToTop("/", scrollHome);
    try {
      act(() =>
        root.render(
          <MainBottomNavigation
            state={{
              index: 0,
              routes: [
                { key: "index-1", name: "index" },
                { key: "chats-1", name: "chats" },
                { key: "projects-1", name: "projects" },
              ],
            }}
            navigation={{ emit, navigate }}
          />,
        ),
      );
      const items = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      // Re-tapping active Home tab scrolls to top instead of navigating
      act(() => items[0]!.click());
      expect(scrollHome).toHaveBeenCalledOnce();
      expect(navigate).not.toHaveBeenCalled();

      // Tapping inactive Projects tab navigates natively without Stack push
      act(() => items[2]!.click());
      expect(emit).toHaveBeenCalledWith({
        type: "tabPress",
        target: "projects-1",
        canPreventDefault: true,
      });
      expect(navigate).toHaveBeenCalledWith("projects");
      expect(state.router.push).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it("localizes tab labels for zh-TW and English", () => {
    state.locale = "zh-TW";
    act(() => root.render(<MainBottomNavigation />));
    let items = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(items.map((item) => item.textContent)).toEqual(["首頁", "聊天", "項目"]);

    state.locale = "en-US";
    act(() => root.render(<MainBottomNavigation />));
    items = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(items.map((item) => item.textContent)).toEqual(["Home", "Chats", "Projects"]);
  });

  it.each(["/chats", "/projects"] as const)(
    "highlights only %s and ignores repeated taps",
    (path) => {
      state.pathname = path;
      act(() => root.render(<MainBottomNavigation />));
      const selected = container.querySelectorAll<HTMLButtonElement>('[data-selected="true"]');
      expect(selected).toHaveLength(1);
      expect(selected[0]!.querySelector("span")?.style.fontWeight).toBe("600");
      expect(selected[0]!.querySelector("div")?.style.backgroundColor).toBe("rgb(94, 88, 79)");
      act(() => selected[0]!.click());
      expect(state.router.push).not.toHaveBeenCalled();
      expect(state.router.replace).not.toHaveBeenCalled();
    },
  );

  it("replaces peer tabs to preserve one Home return instead of stacking modules", () => {
    openMainNavigation(state.router, "/", "/chats");
    openMainNavigation(state.router, "/chats", "/projects");
    expect(state.router.push.mock.calls).toEqual([["/chats"]]);
    expect(state.router.replace.mock.calls).toEqual([["/projects"]]);
    openMainNavigation(state.router, "/projects", "/");
    expect(state.router.dismissTo).toHaveBeenCalledExactlyOnceWith("/");
  });

  it.each(["/", "/chats", "/projects"])("allows main route %s", (path) => {
    expect(showsMainNavigation(path)).toBe(true);
  });
  it.each([
    "/integrations",
    "/github",
    "/routines",
    "/artifacts",
    "/thread",
    "/group-thread",
    "/computer",
    "/projects/id",
    "/projects/id/chat",
    "/settings-home",
    "/plugin",
    "/share",
    "/sign-in",
  ])("hides navigation on %s", (path) => {
    expect(showsMainNavigation(path)).toBe(false);
  });

  it("restores the bar when a focused detail closes or loses focus", () => {
    function Detail({ open }: { open: boolean }) {
      useHideMainNavigation(open);
      return null;
    }
    function Visibility() {
      const hidden = useMainNavigationHidden();
      return <span>{hidden ? "hidden" : "visible"}</span>;
    }
    const render = (open: boolean) =>
      act(() =>
        root.render(
          <MainNavigationProvider>
            <Detail open={open} />
            <Visibility />
          </MainNavigationProvider>,
        ),
      );
    render(false);
    expect(container.textContent).toBe("visible");
    render(true);
    expect(container.textContent).toBe("hidden");
    state.focused = false;
    render(true);
    expect(container.textContent).toBe("visible");
    state.focused = true;
    render(true);
    expect(container.textContent).toBe("hidden");
    render(false);
    expect(container.textContent).toBe("visible");
  });

  it("returns module headers to Home and lets repository detail return to its list", () => {
    act(() => root.render(<MainNavigationHeader />));
    const options = () => state.header.mock.lastCall![0].options;
    act(() => root.render(options().headerLeft()));
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(state.router.dismissTo).toHaveBeenCalledWith("/");
    const back = vi.fn();
    act(() => root.render(<MainNavigationHeader onBack={back} />));
    act(() => root.render(options().headerLeft()));
    act(() => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(back).toHaveBeenCalledOnce();
  });

  it("applies clamped scoped indicator radius and outlined top border while preserving defaults", () => {
    const makeScope = (
      controlRadius: number,
      borderWidth: number,
      surface: ResolvedScopedTheme["surface"],
    ) =>
      ({
        geometry: {
          cardRadius: 18,
          controlRadius,
          pillRadius: 999,
          borderWidth,
          cornerShape: "continuous",
          chamferSize: 0,
          topSpecularHighlight: null,
        },
        surface,
      }) as ResolvedScopedTheme;

    act(() => root.render(<MainBottomNavigation />));
    let bar = container.querySelector<HTMLElement>('[data-testid="main-bottom-navigation"]')!;
    let indicator = container.querySelector<HTMLElement>('[data-selected="true"] div')!;
    expect(bar.style.borderTopWidth).toBe("1px");
    expect(indicator.style.borderRadius).toBe("1px");

    act(() =>
      root.render(
        <ScopedThemeContext.Provider value={makeScope(30, 3, "outlined")}>
          <MainBottomNavigation />
        </ScopedThemeContext.Provider>,
      ),
    );
    bar = container.querySelector<HTMLElement>('[data-testid="main-bottom-navigation"]')!;
    indicator = container.querySelector<HTMLElement>('[data-selected="true"] div')!;
    expect(bar.style.borderTopWidth).toBe("2px");
    expect(indicator.style.borderRadius).toBe("18px");

    act(() =>
      root.render(
        <ScopedThemeContext.Provider value={makeScope(0, 3, "flat")}>
          <MainBottomNavigation />
        </ScopedThemeContext.Provider>,
      ),
    );
    bar = container.querySelector<HTMLElement>('[data-testid="main-bottom-navigation"]')!;
    indicator = container.querySelector<HTMLElement>('[data-selected="true"] div')!;
    expect(bar.style.borderTopWidth).toBe("1px");
    expect(indicator.style.borderRadius).toBe("6px");
  });
});
