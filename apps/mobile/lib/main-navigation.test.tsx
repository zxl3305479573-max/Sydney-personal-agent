// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainBottomNavigation } from "../components/main-bottom-navigation";
import { MainNavigationHeader } from "../components/main-navigation-header";
import {
  MainNavigationProvider,
  openMainNavigation,
  showsMainNavigation,
  useHideMainNavigation,
  useMainNavigationHidden,
} from "./main-navigation";

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
  useMobileTokens: () => ({
    primary: "blue",
    mutedForeground: "gray",
    muted: "lightgray",
    accent: "silver",
    background: "white",
    border: "gray",
  }),
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => <i /> }));
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  View: ({ children, style, testID }: { children: ReactNode; style: object; testID: string }) => (
    <div style={style} data-testid={testID}>
      {children}
    </div>
  ),
  Text: ({ children, style }: { children: ReactNode; style: object }) => (
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
  it("shows exactly three equal width icon-over-label items without capsules on Home", () => {
    act(() => root.render(<MainBottomNavigation />));
    const bar = container.querySelector<HTMLElement>('[data-testid="main-bottom-navigation"]')!;
    expect(bar.children).toHaveLength(3);
    expect(bar.style.paddingBottom).toBe("34px");
    expect(bar.style.margin).toBe("");
    const items = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(items.map((item) => item.textContent)).toEqual(["应用", "项目", "GitHub"]);
    expect(items.every((item) => item.getAttribute("data-selected") === "false")).toBe(true);
    for (const item of items) {
      expect(item.style.flex).toBe("1 1 0%");
      expect(item.style.borderRadius).toBe("");
      expect(item.children[0]?.tagName).toBe("I");
      expect(item.children[1]?.tagName).toBe("SPAN");
    }
    act(() => items[2]!.click());
    expect(state.router.push).toHaveBeenCalledWith("/github");
  });

  it.each(["/integrations", "/projects", "/github"] as const)(
    "highlights only %s and ignores repeated taps",
    (path) => {
      state.pathname = path;
      act(() => root.render(<MainBottomNavigation />));
      const selected = container.querySelectorAll<HTMLButtonElement>('[data-selected="true"]');
      expect(selected).toHaveLength(1);
      expect(selected[0]!.style.backgroundColor).toBe("lightgray");
      expect(selected[0]!.querySelector("span")?.style.color).toBe("blue");
      expect(selected[0]!.querySelector("span")?.style.fontWeight).toBe("700");
      act(() => selected[0]!.click());
      expect(state.router.push).not.toHaveBeenCalled();
      expect(state.router.replace).not.toHaveBeenCalled();
    },
  );

  it("replaces module routes to preserve one Home return instead of stacking modules", () => {
    openMainNavigation(state.router, "/", "/integrations");
    openMainNavigation(state.router, "/integrations", "/projects");
    openMainNavigation(state.router, "/projects", "/github");
    expect(state.router.push.mock.calls).toEqual([["/integrations"]]);
    expect(state.router.replace.mock.calls).toEqual([["/projects"], ["/github"]]);
  });

  it.each(["/", "/integrations", "/projects", "/github"])("allows main route %s", (path) => {
    expect(showsMainNavigation(path)).toBe(true);
  });
  it.each([
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
});
