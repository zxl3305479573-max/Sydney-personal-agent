// @vitest-environment jsdom
import type { CSSProperties, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeHub } from "../components/home-hub";
import type { MobileBot, MobileGroup } from "./api";

const state = vi.hoisted(() => ({
  locale: "zh-CN",
  platform: "ios" as "ios" | "android",
  push: vi.fn(),
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: state.push }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
vi.mock("./side-insets", () => ({
  useBottomSafeAreaClaimed: () => true,
}));
vi.mock("./i18n", () => ({
  useI18n: () => ({ locale: state.locale, t: (text: string) => text }),
}));
vi.mock("./native", () => ({
  native: { secondaryLabel: "#6F6A61" },
  useResolvedAppearance: () => "light" as const,
  useMobileTokens: () => ({
    background: "#F1EEE8",
    card: "#FFFFFF",
    foreground: "#1B1916",
    mutedForeground: "#6F6A61",
    muted: "#E8E4DC",
    border: "#DCD7CE",
    primary: "#1B1916",
  }),
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({ identity }: { identity: string }) => <span data-avatar={identity} />,
}));
vi.mock("../components/native-symbol", () => ({
  NativeSymbol: ({ ios }: { ios: string }) => <i data-symbol={ios} />,
}));
vi.mock("react-native", () => {
  const flatten = (style: unknown): CSSProperties =>
    Object.assign({}, ...[style].flat(Number.POSITIVE_INFINITY).filter(Boolean));
  return {
    get Platform() {
      return { OS: state.platform };
    },
    StyleSheet: { hairlineWidth: 1 },
    useWindowDimensions: () => ({ width: 393, height: 852, fontScale: 1 }),
    RefreshControl: () => null,
    ScrollView: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => (
      <div data-testid={testID} style={flatten(style)}>
        {children}
      </div>
    ),
    View: ({
      children,
      style,
      testID,
    }: {
      children?: ReactNode;
      style?: unknown;
      testID?: string;
    }) => (
      <div data-testid={testID} style={flatten(style)}>
        {children}
      </div>
    ),
    Text: ({ children, style }: { children?: ReactNode; style?: unknown }) => (
      <span style={flatten(style)}>{children}</span>
    ),
    Pressable: ({
      children,
      accessibilityLabel,
      onPress,
      style,
      testID,
    }: {
      children?: ReactNode;
      accessibilityLabel?: string;
      onPress?: () => void;
      style?: unknown;
      testID?: string;
    }) => (
      <button
        type="button"
        data-testid={testID}
        aria-label={accessibilityLabel}
        onClick={onPress}
        style={flatten(typeof style === "function" ? style({ pressed: false }) : style)}
      >
        {children}
      </button>
    ),
  };
});

function sampleBot(overrides: Partial<MobileBot> = {}): MobileBot {
  return {
    id: "bot-claude",
    name: "Claude",
    color: "#4F7CAC",
    status: "idle",
    unread: false,
    pinned: true,
    preview: "傍晚她拍了一条街的晚霞给我，说小猪好饿。",
    updatedAt: "2026-11-24T18:30:00.000Z",
    ...overrides,
  } as MobileBot;
}

function sampleGroup(overrides: Partial<MobileGroup> = {}): MobileGroup {
  return {
    id: "group-1",
    name: "核心研发组",
    unread: true,
    pinned: false,
    preview: "今晚同步移动端中枢首页进展",
    updatedAt: "2026-11-24T19:00:00.000Z",
    members: [],
    ...overrides,
  } as MobileGroup;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.locale = "zh-CN";
  state.platform = "ios";
  vi.clearAllMocks();
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("HomeHub personal hub", () => {
  const fixedEvening = new Date(2026, 10, 24, 20, 15, 0);

  it("renders Chinese greeting, pinned spotlight banner, and all Bento module cards", () => {
    const onRefresh = vi.fn();
    const onCreateBot = vi.fn();
    act(() =>
      root.render(
        <HomeHub
          me={{ userId: "u-1", spaceId: "space-1", name: "Mina", email: "mina@example.com" }}
          spaceName="Sydney 研发空间"
          bots={[
            sampleBot(),
            sampleBot({ id: "bot-ops", name: "Ops", pinned: false, status: "running" }),
          ]}
          groups={[sampleGroup()]}
          activeRunsCount={1}
          projectCount={4}
          githubConnected
          githubLogin="mina"
          githubRepoCount={18}
          connectedAppsCount={6}
          now={fixedEvening}
          lastSyncedAt={fixedEvening}
          onRefresh={onRefresh}
          onCreateBot={onCreateBot}
        />,
      ),
    );

    const text = container.textContent ?? "";
    expect(text).toContain("11月24日 · 星期二");
    expect(text).toContain("1 运行中 · 20:15");
    expect(text).toContain("晚上好，Mina");
    expect(text).toContain("傍晚她拍了一条街的晚霞给我，说小猪好饿。");
    expect(text).toContain("置顶 · Claude · 2026-11-24 ›");
    expect(text).toContain("聊天与伙伴");
    expect(text).toContain("2 位伙伴");
    expect(text).toContain("1 个群聊 · 1 条未读消息");
    expect(text).toContain("项目与执行台");
    expect(text).toContain("当前空间 · Sydney 研发空间");
    expect(text).toContain("项目工作区");
    expect(text).toContain("云电脑画面");
    expect(text).toContain("GitHub");
    expect(text).toContain("@mina");
    expect(text).toContain("18");
    expect(text).toContain("连接应用");
    expect(text).toContain("例行与技能");
    expect(text).toContain("文件与换肤");

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="home-hub-sync-pill"]')!.click(),
    );
    expect(onRefresh).toHaveBeenCalledOnce();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="home-hub-create-bot"]')!.click(),
    );
    expect(onCreateBot).toHaveBeenCalledOnce();
  });

  it("navigates each module card and header button to its expected route", () => {
    const bot = sampleBot();
    act(() =>
      root.render(
        <HomeHub
          me={{ userId: "u-1", spaceId: "space-1", name: "Mina", email: "mina@example.com" }}
          bots={[bot]}
          groups={[]}
          now={fixedEvening}
        />,
      ),
    );

    const tap = (testId: string) =>
      act(() => container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click());

    tap("home-hub-search-button");
    expect(state.push).toHaveBeenLastCalledWith("/search");

    tap("home-hub-settings-button");
    expect(state.push).toHaveBeenLastCalledWith("/settings-home");

    tap("home-hub-spotlight");
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/thread",
      params: { botId: "bot-claude", name: "Claude" },
    });

    tap("home-hub-chats-card");
    expect(state.push).toHaveBeenLastCalledWith("/chats");

    tap("home-hub-projects-split");
    expect(state.push).toHaveBeenLastCalledWith("/projects");

    tap("home-hub-computer-split");
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/computer",
      params: { botId: "bot-claude", name: "Claude" },
    });

    tap("home-hub-github-tile");
    expect(state.push).toHaveBeenLastCalledWith("/github");

    tap("home-hub-integrations-tile");
    expect(state.push).toHaveBeenLastCalledWith("/integrations");

    tap("home-hub-routines-tile");
    expect(state.push).toHaveBeenLastCalledWith({
      pathname: "/routines",
      params: { botId: "bot-claude", name: "Claude" },
    });

    tap("home-hub-skills-chip");
    expect(state.push).toHaveBeenLastCalledWith("/skills");

    tap("home-hub-artifacts-tile");
    expect(state.push).toHaveBeenLastCalledWith("/artifacts");

    tap("home-hub-appearance-chip");
    expect(state.push).toHaveBeenLastCalledWith("/ui-mode");
  });

  it("renders English greeting and invites creating a bot when inbox is empty", () => {
    state.locale = "en-US";
    state.platform = "android";
    const onCreateBot = vi.fn();
    act(() =>
      root.render(
        <HomeHub
          me={{ userId: "u-1", spaceId: "space-1", name: "Mina", email: "mina@example.com" }}
          bots={[]}
          groups={[]}
          now={new Date(2026, 10, 24, 9, 5, 0)}
          onCreateBot={onCreateBot}
        />,
      ),
    );

    expect(container.textContent).toContain("Good morning, Mina");
    expect(container.textContent).toContain("sync · 09:05");
    expect(container.textContent).toContain(
      "No companions yet — tap to create your first personal assistant.",
    );

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-testid="home-hub-spotlight"]')!.click(),
    );
    expect(onCreateBot).toHaveBeenCalledOnce();

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="home-hub-computer-split"]')!
        .click(),
    );
    expect(state.push).toHaveBeenLastCalledWith("/chats");

    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="home-hub-appearance-chip"]')!
        .click(),
    );
    expect(state.push).toHaveBeenLastCalledWith("/chat-appearance");
  });
});
