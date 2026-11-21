// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  focused: true,
  useGithub: vi.fn(),
  alert: vi.fn(),
  header: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) =>
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: runtime.alert },
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollView: ({
    children,
    refreshControl,
  }: {
    children: ReactNode;
    refreshControl?: ReactNode;
  }) => (
    <div>
      {refreshControl}
      {children}
    </div>
  ),
  RefreshControl: ({ refreshing, onRefresh }: { refreshing: boolean; onRefresh: () => void }) => (
    <button type="button" aria-busy={refreshing} onClick={onRefresh}>
      下拉刷新
    </button>
  ),
  Pressable: ({
    children,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    accessibilityRole: string;
    accessibilityLabel: string;
    accessibilityState: { disabled: boolean };
    disabled: boolean;
    onPress: () => void;
  }) => (
    <button
      type="button"
      role={accessibilityRole}
      aria-label={accessibilityLabel}
      aria-disabled={accessibilityState.disabled}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    accessibilityLabel?: string;
  }) => <fieldset aria-label={accessibilityLabel}>{children}</fieldset>,
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
    secureTextEntry,
  }: {
    accessibilityLabel: string;
    value: string;
    onChangeText: (value: string) => void;
    secureTextEntry?: boolean;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      type={secureTextEntry ? "password" : "text"}
      onChange={(event) => onChangeText(event.target.value)}
    />
  ),
}));
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/github-bot-analysis", () => ({ GithubBotAnalysis: () => null }));
vi.mock("../components/main-navigation-header", () => ({
  MainNavigationHeader: (props: unknown) => {
    runtime.header(props);
    return null;
  },
}));
vi.mock("../components/menu-picker", () => ({ MenuPicker: () => null }));
vi.mock("../components/native-switch", () => ({ NativeSwitch: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    busy?: boolean;
  }) => (
    <button type="button" disabled={disabled || busy} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({
    foreground: "black",
    mutedForeground: "gray",
    background: "white",
    primary: "blue",
    border: "gray",
  }),
}));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./project-scope", () => ({
  projectScopeKey: () => "scope-a",
  subscribeProjectScope: () => () => {},
}));
vi.mock("./use-github", () => ({ useGithub: runtime.useGithub }));

import GithubScreen from "../app/github";
import { MainNavigationProvider, useMainNavigationHidden } from "./main-navigation";

function screenState() {
  return {
    section: "profile",
    status: { status: "disconnected" },
    overview: null,
    repositories: null,
    search: null,
    selectedRepo: null,
    detail: null,
    year: undefined,
    page: 1,
    hidePrivate: false,
    loading: false,
    refreshing: false,
    busy: false,
    error: null,
    repositoryFilters: { affiliation: "all", visibility: "all", sort: "pushed" },
    exploreFilters: { sort: "best-match" },
    visible: (items: unknown[]) => items,
    selectSection: vi.fn(),
    selectRepo: vi.fn(),
    selectYear: vi.fn(),
    selectPage: vi.fn(),
    setQuery: vi.fn(),
    filterRepositories: vi.fn(),
    filterExplore: vi.fn(),
    setHidePrivate: vi.fn(),
    refresh: vi.fn(),
    pullToRefresh: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("native GitHub screen", () => {
  let container: HTMLDivElement;
  let root: Root;
  let state: ReturnType<typeof screenState>;
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find((element) => element.textContent === label)!;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.focused = true;
    runtime.alert.mockReset();
    runtime.header.mockReset();
    state = screenState();
    runtime.useGithub.mockReset().mockImplementation(() => state);
    container = document.createElement("div");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  async function render() {
    await act(async () => root.render(<GithubScreen />));
  }
  async function enterToken(value: string) {
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="GitHub Personal Access Token"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }

  it("masks PAT input and clears it before submitting without local persistence", async () => {
    await render();
    const input = await enterToken("test-read-only-token");
    expect(input.type).toBe("password");
    expect(button("连接 GitHub").disabled).toBe(false);
    await act(async () => button("连接 GitHub").click());
    expect(state.connect).toHaveBeenCalledWith("test-read-only-token");
    expect(input.value).toBe("");
  });

  it("clears an unsubmitted token when leaving the route", async () => {
    await render();
    const input = await enterToken("test-read-only-token");
    runtime.focused = false;
    await render();
    expect(input.value).toBe("");
    expect(state.connect).not.toHaveBeenCalled();
  });

  it("hides the root navigation for repository detail and restores it on return or blur", async () => {
    function NavigationVisibility() {
      return <output>{useMainNavigationHidden() ? "hidden" : "visible"}</output>;
    }
    const renderBrowser = async () => {
      await act(async () =>
        root.render(
          <MainNavigationProvider>
            <GithubScreen />
            <NavigationVisibility />
          </MainNavigationProvider>,
        ),
      );
    };
    await renderBrowser();
    expect(container.querySelector("output")?.textContent).toBe("visible");
    runtime.useGithub.mockReturnValue({
      ...state,
      selectedRepo: { id: "repo-1", fullName: "example/agent" },
    });
    await renderBrowser();
    expect(container.querySelector("output")?.textContent).toBe("hidden");
    act(() => runtime.header.mock.lastCall![0].onBack());
    expect(state.selectRepo).toHaveBeenCalledWith(null);
    runtime.focused = false;
    await renderBrowser();
    expect(container.querySelector("output")?.textContent).toBe("visible");
    runtime.focused = true;
    runtime.useGithub.mockReturnValue(state);
    await renderBrowser();
    expect(container.querySelector("output")?.textContent).toBe("visible");
  });

  it.each(["profile", "repositories", "explore"])(
    "uses the entire repository card as the only repository button in %s",
    async (section) => {
      const repo = {
        id: "repo-1",
        fullName: "example/a-long-repository-name-for-a-mobile-screen",
        description: "Repository description",
        primaryLanguage: { name: "TypeScript" },
        stargazerCount: 42,
        forkCount: 3,
        isPrivate: section !== "explore",
      };
      const cardState = {
        ...state,
        section,
        status: { status: "connected", login: "example", highRiskScopes: [], rateLimit: null },
        overview: {
          profile: { login: "example", publicRepos: 1, followers: 0 },
          calendar: { availableYears: [], totalContributions: 0, weeks: [] },
          pinnedRepos: [repo],
          recentRepos: [],
        },
        repositories: { items: [repo] },
        search: { items: [repo] },
      };
      runtime.useGithub.mockReturnValue(cardState);
      await render();
      const cards = container.querySelectorAll<HTMLButtonElement>(
        `button[role="button"][aria-label^="${repo.fullName}"]`,
      );
      expect(cards).toHaveLength(1);
      const card = cards[0]!;
      expect(card.querySelector("button,[role=button]")).toBeNull();
      const title = [...card.querySelectorAll("span")].find(
        (element) => element.textContent === repo.fullName,
      );
      expect(title?.closest("button")).toBe(card);
      expect(card.textContent).toContain(
        `TypeScript · ★ 42 · 3 分支${repo.isPrivate ? " · 私有" : ""}`,
      );
      const description = [...card.querySelectorAll("span")].find(
        (element) => element.textContent === repo.description,
      );
      await act(async () => description?.click());
      expect(state.selectRepo).toHaveBeenCalledExactlyOnceWith(repo);

      runtime.useGithub.mockReturnValue({ ...cardState, busy: true });
      await render();
      expect(card.disabled).toBe(true);
      expect(card.getAttribute("aria-disabled")).toBe("true");
      await act(async () => card.click());
      expect(state.selectRepo).toHaveBeenCalledTimes(1);
    },
  );

  it("shows upstream README and release content as inert selectable text", async () => {
    runtime.useGithub.mockReturnValue({
      ...state,
      status: { status: "connected", login: "example", highRiskScopes: [], rateLimit: null },
      selectedRepo: { fullName: "example/agent" },
      detail: {
        repo: { cloneUrl: "https://github.com/example/agent.git" },
        readme: {
          content: '<script>window.attack=true</script><img src="https://example.test/tracker">',
        },
        recentCommits: [{ sha: "commit-fixture", shortSha: "fixture", message: "Update" }],
        latestRelease: { tagName: "v1", body: "Release notes" },
      },
    });
    await render();
    expect(container.textContent).toContain("<script>");
    expect(container.querySelector("script,img,iframe")).toBeNull();
    expect(container.textContent).toContain("Release notes");
    expect(container.textContent).toContain("fixture · Update");
  });

  it("confirms disconnect and provides visible retry and independent section actions", async () => {
    runtime.useGithub.mockReturnValue({
      ...state,
      error: "Read failed",
      status: { status: "connected", login: "example", highRiskScopes: [], rateLimit: null },
    });
    await render();
    expect(container.textContent).toContain("Read failed");
    await act(async () => button("重试").click());
    expect(state.refresh).toHaveBeenCalledOnce();
    await act(async () => button("开源探索").click());
    expect(state.selectSection).toHaveBeenCalledWith("explore");
    await act(async () => button("断开 GitHub").click());
    expect(state.disconnect).not.toHaveBeenCalled();
    const actions = runtime.alert.mock.calls[0]![2];
    actions.find((action: { style: string }) => action.style === "destructive").onPress();
    expect(state.disconnect).toHaveBeenCalledOnce();
  });

  it("shows the native refresh indicator only for a manual pull", async () => {
    state.loading = true;
    await render();
    expect(button("下拉刷新").getAttribute("aria-busy")).toBe("false");
    await act(async () => button("下拉刷新").click());
    expect(state.pullToRefresh).toHaveBeenCalledOnce();
    state.refreshing = true;
    await render();
    expect(button("下拉刷新").getAttribute("aria-busy")).toBe("true");
  });
});
