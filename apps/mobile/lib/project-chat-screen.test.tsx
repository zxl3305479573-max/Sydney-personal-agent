// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  scope: "account-a",
  params: { workspaceId: "project-a", botId: "bot-a", scope: "account-a" } as {
    workspaceId: string;
    botId?: string;
    groupId?: string;
    projectName?: string;
    scope: string;
  },
  hook: vi.fn(),
  rpc: vi.fn(),
  push: vi.fn(),
}));
vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({ options }: { options: { title: string; headerRight?: () => ReactNode } }) => (
      <header>{options.title}{options.headerRight?.()}</header>
    ),
  },
  useLocalSearchParams: () => runtime.params,
  useRouter: () => ({ push: runtime.push }),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  ActivityIndicator: () => null,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  ScrollView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  TextInput: ({
    value,
    onChangeText,
    accessibilityLabel,
    editable,
  }: {
    value: string;
    onChangeText: (value: string) => void;
    accessibilityLabel: string;
    editable: boolean;
  }) => (
    <input
      aria-label={accessibilityLabel}
      value={value}
      disabled={!editable}
      onChange={(event) => onChangeText(event.target.value)}
    />
  ),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children, tint }: { children: ReactNode; tint: string }) => (
    <div data-glass-tint={tint}>{children}</div>
  ),
}));
vi.mock("../components/glass-title", () => ({
  glassHeaderOptions: (title: string) => ({ title }),
}));
vi.mock("../components/thread-header-right", () => ({
  threadHeaderRight: ({ onBotActions }: { onBotActions: () => void }) => ({
    headerRight: () => <button type="button" onClick={onBotActions}>Settings</button>,
  }),
}));
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
    <button type="button" onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
}));
vi.mock("./api", () => ({
  rpc: runtime.rpc,
  selectableMobileMessageText: () => "<script>external()</script>",
}));
vi.mock("expo-file-system", () => ({ File: class {}, Paths: { document: "document" } }));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({ chatUser: "#112233", muted: "#445566" }),
}));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: (key: string) => key }) }));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({}) }));
vi.mock("./project-scope", () => ({
  projectScopeKey: () => runtime.scope,
  subscribeProjectScope: () => () => {},
  projectRequestOptions: async () => ({ skipSpaceAuthRecovery: true }),
}));
vi.mock("./use-project-thread", () => ({ useProjectThread: runtime.hook }));

import ProjectChatRoute from "../app/projects/[workspaceId]/chat";

describe("mobile project chat screen", () => {
  let root: Root;
  let container: HTMLDivElement;
  let chat: Record<string, unknown> & {
    send: ReturnType<typeof vi.fn>;
    cancelRun: ReturnType<typeof vi.fn>;
  };
  const render = () => act(async () => root.render(<ProjectChatRoute />));
  const fill = (value: string) =>
    act(async () => {
      const input = container.querySelector("input")!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const send = () =>
    act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "发送")!
        .click();
    });
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.scope = "account-a";
    runtime.params = { workspaceId: "project-a", botId: "bot-a", scope: "account-a" };
    runtime.rpc.mockReset().mockImplementation(async (method: string) =>
      method === "projectWorkspaces/get" ? { name: "设计工作区" } : { botSettings: true },
    );
    runtime.push.mockReset();
    chat = {
      snapshot: {
        threadId: "thread-a",
        messages: [{ id: "message-a", role: "bot", blocks: [{ kind: "text", text: "Sample" }] }],
        olderCursor: null,
        run: null,
      },
      loading: false,
      sending: false,
      consenting: false,
      consent: null,
      readError: null,
      sendError: null,
      send: vi.fn().mockResolvedValue(false),
      cancelRun: vi.fn(),
      cancellingRunId: null,
      retry: vi.fn(),
      allow: vi.fn(),
    };
    runtime.hook.mockReset().mockImplementation(() => chat);
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("retains unconfirmed text and clears only an acknowledged send", async () => {
    await render();
    await fill("hello");
    await send();
    expect(container.querySelector("input")?.value).toBe("hello");
    chat.send.mockResolvedValueOnce(true);
    await send();
    expect(container.querySelector("input")?.value).toBe("");
    expect(chat.send).toHaveBeenCalledWith("hello");
  });

  it("cancels the chosen same-name member's run without clearing a draft", async () => {
    runtime.params = { workspaceId: "project-a", groupId: "group-a", scope: "account-a" };
    const firstRun = { id: "run-a", botId: "bot-a", status: "running" };
    const secondRun = { id: "run-b", botId: "bot-b", status: "queued" };
    chat.snapshot = {
      threadId: "thread-a",
      groupId: "group-a",
      messages: [
        { id: "message-b", role: "bot", botId: "bot-b", blocks: [{ kind: "text", text: "Sample" }] },
      ],
      olderCursor: null,
      members: [
        { botId: "bot-a", name: "Alpha" },
        { botId: "bot-b", name: "Alpha" },
      ],
      run: firstRun,
      activeRuns: [firstRun, secondRun],
    };
    await render();
    await fill("keep the draft");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toContain("取消 Alpha (1) 的任务");
    expect(Array.from(container.querySelectorAll("span"), (span) => span.textContent)).toContain(
      "Alpha (2)",
    );
    const stop = buttons.find((button) => button.textContent === "取消 Alpha (2) 的任务")!;
    await act(async () => stop.click());
    expect(chat.cancelRun).toHaveBeenCalledExactlyOnceWith("run-b");
    expect(container.querySelector("input")?.value).toBe("keep the draft");
  });

  it("hides old content and disables sending when the account scope changes", async () => {
    runtime.params.projectName = "设计工作区";
    await render();
    await fill("private draft");
    runtime.scope = "account-b";
    await render();
    expect(runtime.hook).toHaveBeenLastCalledWith(
      "project-a",
      { botId: "bot-a" },
      "account-b",
      false,
    );
    expect(container.textContent).toContain("项目入口已失效");
    expect(container.textContent).not.toContain("external()");
    expect(container.querySelector("header")?.textContent).toBe("项目");
    expect(container.querySelector("input")?.value).toBe("");
    expect(container.querySelector("input")?.disabled).toBe(true);
  });

  it("uses the authorized project name for groups opened without a title parameter", async () => {
    runtime.params = { workspaceId: "project-a", groupId: "group-a", scope: "account-a" };
    chat.snapshot = { ...(chat.snapshot as object), groupName: "群聊名称" };
    await render();
    expect(container.querySelector("header")?.textContent).toBe("设计工作区");
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/get",
      { id: "project-a" },
      expect.objectContaining({ skipSpaceAuthRecovery: true }),
    );
  });

  it("opens Bot settings within the current project scope", async () => {
    runtime.params.projectName = "旧标题";
    await render();
    expect(container.querySelector("header")?.textContent).toBe("设计工作区Settings");
    await act(async () => container.querySelector<HTMLButtonElement>("header button")?.click());
    expect(runtime.push).toHaveBeenCalledWith({
      pathname: "/bot-settings",
      params: { projectId: "project-a", botId: "bot-a", scope: "account-a" },
    });
  });

  it("renders external message content as selectable text without creating HTML", async () => {
    await render();
    expect(container.textContent).toContain("<script>external()</script>");
    expect(container.querySelector("script")).toBeNull();
  });

  it("uses translucent surfaces for both project chat message roles", async () => {
    chat.snapshot = {
      threadId: "thread-a",
      messages: [
        { id: "user-a", role: "user", blocks: [{ kind: "text", text: "Question" }] },
        { id: "bot-a", role: "bot", blocks: [{ kind: "text", text: "Answer" }] },
      ],
      olderCursor: null,
      run: null,
    };
    await render();
    expect(
      Array.from(container.querySelectorAll("[data-glass-tint]"), (node) =>
        node.getAttribute("data-glass-tint"),
      ),
    ).toEqual(["rgba(17, 34, 51, 0.64)", "rgba(68, 85, 102, 0.64)"]);
  });

  it("shows a reconnect action while preserving displayed messages after read failure", async () => {
    chat.readError = new TypeError("connection interrupted");
    await render();
    expect(container.textContent).toContain("会话同步中断");
    expect(container.textContent).toContain("external()");
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "重新连接")!
        .click(),
    );
    expect(chat.retry).toHaveBeenCalledOnce();
  });
});
