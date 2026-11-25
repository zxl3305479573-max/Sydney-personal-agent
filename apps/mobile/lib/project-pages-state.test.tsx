// @vitest-environment jsdom
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "./query-client";

const runtime = vi.hoisted(() => ({
  scope: "account-a",
  params: { workspaceId: "project-a", scope: "account-a" },
  rpc: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) => useEffect(callback, [callback]),
  useRouter: () => ({ push: vi.fn(), dismissTo: vi.fn() }),
  useLocalSearchParams: () => runtime.params,
  Stack: {
    Screen: ({ options }: { options: { title: string } }) => <header>{options.title}</header>,
  },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Alert: { alert: vi.fn() },
  AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
  StyleSheet: { hairlineWidth: 1 },
  ActivityIndicator: () => <span>spinner</span>,
  RefreshControl: () => null,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  Pressable: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
  ScrollView: ({
    children,
    contentOffset,
    onScroll,
  }: {
    children: ReactNode;
    contentOffset: { y: number };
    onScroll: (event: unknown) => void;
  }) => (
    <div
      data-scroll={contentOffset.y}
      onScroll={(event) =>
        onScroll({ nativeEvent: { contentOffset: { x: 0, y: event.currentTarget.scrollTop } } })
      }
    >
      {children}
    </div>
  ),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("./api", () => ({
  captureApiRequestContext: runtime.capture,
  isSpaceSelectionPending: () => false,
  rpc: runtime.rpc,
}));
vi.mock("./project-scope", () => ({
  projectScopeKey: () => runtime.scope,
  subscribeProjectScope: () => () => {},
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }), t: (value: string) => value }));
vi.mock("./native", () => ({
  native: {},
  useMobileTokens: () => ({}),
  useResolvedAppearance: () => "light",
}));
vi.mock("./native-controls", () => ({ iosAtLeast: () => false }));
vi.mock("./side-insets", () => ({
  useSideInsets: () => ({}),
  useBottomSafeAreaClaimed: () => false,
}));
vi.mock("./use-project-chat-actions", () => ({ useProjectChatActions: () => ({ actions: [] }) }));
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/glass-title", () => ({
  glassHeaderOptions: (title: string) => ({ title }),
}));
vi.mock("../components/main-navigation-header", () => ({ MainNavigationHeader: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../components/project-folder-card", () => ({
  ProjectFolderCard: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("../components/inbox-rows", () => ({
  FALLBACK_COLOR: "blue",
  ConversationRow: ({
    title,
    preview,
    unread,
  }: {
    title: string;
    preview?: string;
    unread?: boolean;
  }) => (
    <span data-row-title={title} data-preview={preview ?? ""} data-unread={String(Boolean(unread))}>
      {title}
    </span>
  ),
}));
vi.mock("../components/bot-avatar", () => ({ BotAvatar: () => null }));
vi.mock("../components/group-avatar", () => ({ GroupAvatar: () => null }));
vi.mock("../components/bot-actions-modal", () => ({ BotActionsModal: () => null }));
vi.mock("../components/create-bot-modal", () => ({ CreateBotModal: () => null }));
vi.mock("../components/project-group-modal", () => ({ ProjectGroupModal: () => null }));
vi.mock("../components/project-directory", () => ({ ProjectDirectory: () => null }));
vi.mock("./create-inbox-bot", () => ({ inboxBotInput: vi.fn() }));

import Projects from "../app/projects";
import ProjectDetail from "../app/projects/[workspaceId]";
import { ProjectCloudDirectory } from "../components/project-cloud-directory";
import { projectThreadSessionScope, threadSessionCache } from "./thread-session-cache";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const cursor = { id: "project-a", createdAt: "2026-11-21T00:00:00Z" };
const project = { id: "project-a", name: "项目一" };
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((entry) => entry.textContent === label)!;
const render = (page: ReactNode) => act(async () => root.render(page));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  runtime.scope = "account-a";
  runtime.params = { workspaceId: "project-a", scope: "account-a" };
  runtime.capture.mockReset().mockResolvedValue({ apiBase: "https://example.test", headers: {} });
  runtime.rpc
    .mockReset()
    .mockImplementation(async (method: string, input?: { after?: unknown; archived?: boolean }) => {
      if (method === "projectWorkspaces/list")
        return input?.after
          ? { items: [{ id: "project-b", name: "项目二" }], nextCursor: null }
          : { items: [project], nextCursor: cursor };
      if (method === "projectWorkspaces/get") return project;
      if (method === "projectWorkspaces/conversations")
        return {
          bots: [{ id: "bot-a", name: input?.archived ? "已归档成员" : "活跃成员" }],
          groups: [],
        };
      return { create: true, createBot: true, createGroup: true, chatManagement: true };
    });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await render(null);
  await act(async () => root.unmount());
  queryClient.clear();
  vi.unstubAllGlobals();
});

it("restores the last project page and scroll position before new credentials resolve", async () => {
  await render(<Projects />);
  await act(async () => button("下一页").click());
  const scroll = container.querySelector<HTMLDivElement>("[data-scroll]")!;
  await act(async () => {
    scroll.scrollTop = 420;
    scroll.dispatchEvent(new Event("scroll"));
  });
  await render(null);
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(<Projects />);
  expect(container.textContent).toContain("项目二");
  expect(container.textContent).not.toContain("正在加载项目");
  expect(container.querySelector("[data-scroll]")?.getAttribute("data-scroll")).toBe("420");
  expect(button("上一页")).toBeTruthy();
});

it("restores a project's archived roster and title while the refresh is pending", async () => {
  await render(<ProjectDetail />);
  await act(async () => button("已归档的聊天").click());
  expect(container.textContent).toContain("已归档成员");
  await render(null);
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(<ProjectDetail />);
  expect(container.textContent).toContain("项目一");
  expect(container.textContent).toContain("已归档成员");
  expect(container.textContent).not.toContain("正在加载项目");
  expect(button("返回聊天列表")).toBeTruthy();
});

it("does not show another project's or another session's cached roster", async () => {
  await render(<ProjectDetail />);
  await render(null);
  runtime.params.workspaceId = "project-b";
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(<ProjectDetail />);
  expect(container.textContent).not.toContain("活跃成员");
  expect(container.textContent).not.toContain("项目一");
  await render(null);
  runtime.scope = "account-b";
  runtime.params = { workspaceId: "project-a", scope: runtime.scope };
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(<ProjectDetail />);
  expect(container.textContent).not.toContain("活跃成员");
});

it("forgets a cached project after the server reports its removal", async () => {
  await render(<ProjectDetail />);
  await render(null);
  runtime.rpc.mockRejectedValue(Object.assign(new Error("Removed"), { status: 404 }));
  await render(<ProjectDetail />);
  expect(container.textContent).not.toContain("活跃成员");
  expect(container.textContent).toContain("无法打开项目");
  await render(null);
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(<ProjectDetail />);
  expect(container.textContent).not.toContain("项目一");
});

it("clears the cached project list when the server denies the list request", async () => {
  await render(<Projects />);
  await render(null);
  runtime.rpc.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
  await render(<Projects />);
  expect(container.textContent).not.toContain("项目一");
  expect(container.textContent).toContain("Forbidden");
});

it("restores a cloud directory's status before its next read returns", async () => {
  runtime.rpc.mockResolvedValue({
    available: true,
    status: "online",
    computers: [{ id: "computer-a", name: "专属电脑" }],
    binding: { computerId: "computer-a", grantId: "grant-a", path: "docs", intent: "read-only" },
  });
  const page = () => (
    <ProjectCloudDirectory
      projectId="project-a"
      scopeKey={runtime.scope}
      enabled
      windowsBound={false}
    />
  );
  await render(page());
  await render(null);
  runtime.capture.mockImplementationOnce(() => new Promise(() => {}));
  await render(page());
  expect(container.textContent).toContain("专属电脑");
  expect(container.textContent).toContain("docs");
});

it("displays live conversation status and unread state on project rows after leaving chat", async () => {
  threadSessionCache.clear();
  const cacheScope = projectThreadSessionScope(runtime.scope, "project-a");
  runtime.rpc.mockImplementation(async (method: string) => {
    if (method === "projectWorkspaces/get") return project;
    if (method === "projectWorkspaces/conversations")
      return {
        bots: [{ id: "bot-a", name: "活跃成员", status: "idle", unread: true, preview: "Old" }],
        groups: [
          {
            id: "group-a",
            name: "研发群",
            unread: true,
            preview: "Hi",
            members: [{ botId: "bot-a", name: "活跃成员", color: "#123456", status: "idle" }],
          },
        ],
      };
    return { create: true, createBot: true, createGroup: true, chatManagement: true };
  });

  await render(<ProjectDetail />);
  let botRow = container.querySelector('[data-row-title="活跃成员"]');
  expect(botRow?.getAttribute("data-unread")).toBe("true");
  expect(botRow?.getAttribute("data-preview")).toBe("Old");

  // Exiting a running project chat updates status and clears unread immediately before next poll.
  act(() => {
    threadSessionCache.remember(cacheScope, {
      botId: "bot-a",
      threadId: "thread-a",
      cursor: 8,
      run: { id: "run-1", botId: "bot-a", status: "running" },
      activeRuns: [{ id: "run-1", botId: "bot-a", status: "running" }],
      messages: [],
      olderCursor: null,
    });
    const token = threadSessionCache.beginUnreadWrite(cacheScope, { botId: "bot-a" }, false);
    threadSessionCache.finishUnreadWrite(cacheScope, { botId: "bot-a" }, token);
  });

  botRow = container.querySelector('[data-row-title="活跃成员"]');
  expect(botRow?.getAttribute("data-preview")).toBe("Working…");
  expect(botRow?.getAttribute("data-unread")).toBe("false");
  act(() => threadSessionCache.clear());
});
