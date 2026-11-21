// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act, useEffect, useImperativeHandle, useState } from "react";
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
  t: (key: string, values?: Record<string, string>) =>
    key.replace(/\{(\w+)\}/g, (match, name: string) => values?.[name] ?? match),
}));
vi.mock("expo-router", () => ({
  Stack: {
    Screen: ({
      options,
    }: {
      options: {
        title: string;
        headerBackTitle?: string;
        headerTitle?: () => ReactNode;
        headerRight?: () => ReactNode;
      };
    }) => (
      <header data-project-name={options.headerBackTitle}>
        {options.headerTitle?.() ?? options.title}
        {options.headerRight?.()}
      </header>
    ),
  },
  useLocalSearchParams: () => runtime.params,
  useRouter: () => ({ push: runtime.push }),
  useFocusEffect: (callback: () => (() => void) | undefined) => useEffect(callback, [callback]),
}));
vi.mock("expo-router/react-navigation", () => ({ useHeaderHeight: () => 90 }));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  I18nManager: { isRTL: false },
  AppState: { currentState: "active", addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
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
vi.mock("../components/chat-title-content", () => ({
  ChatTitleContent: ({
    name,
    bot,
    onPress,
  }: ComponentProps<typeof import("../components/chat-title-content").ChatTitleContent>) => (
    <button type="button" data-title-color={bot?.color} onClick={onPress}>
      {name}
    </button>
  ),
}));
vi.mock("../components/thread/thread-composer-dock", () => ({
  ThreadComposerDock: ({
    children,
    columnPadding,
  }: {
    children: ReactNode;
    columnPadding: object;
  }) => <div data-composer-dock={JSON.stringify(columnPadding)}>{children}</div>,
}));
vi.mock("../components/bot-avatar", () => ({
  BotAvatar: ({
    identity,
    color,
    avatarSet,
    activity,
  }: {
    identity?: string;
    color: string;
    avatarSet?: string;
    activity?: string;
  }) => (
    <span
      data-avatar={identity}
      data-color={color}
      data-avatar-set={avatarSet}
      data-activity={activity}
    />
  ),
}));
vi.mock("../components/thread/message-bubble", () => ({
  MessageTextCard: ({
    message,
    speaker,
  }: {
    message: { role: string; blocks: { text?: string }[] };
    speaker?: string;
  }) => (
    <div data-message-card={message.role}>
      <span>{speaker}</span>
      <span>{message.blocks.map((block) => block.text).join("\n")}</span>
    </div>
  ),
}));
vi.mock("../components/thread-composer", () => ({
  ThreadComposer: ({
    ref,
    disabled,
    textOnly,
    send,
    composerPrompt,
    modelLabel,
    modelActions,
    onModelSelect,
    attachActions,
    attachFrom,
  }: ComponentProps<typeof import("../components/thread-composer").ThreadComposer>) => {
    const [draft, setDraft] = useState("");
    useImperativeHandle(ref, () => ({
      snapshot: () => ({
        promptText: draft,
        mentions: [],
        skill: null,
        replyQuote: null,
        attachmentIds: [],
      }),
      reset: () => setDraft(""),
      insert: setDraft,
    }));
    return (
      <div data-shared-composer data-text-only={textOnly}>
        <span data-model-label>{modelLabel}</span>
        {modelActions
          ?.flatMap((action) => action.subactions ?? [action])
          .map((action) => (
            <button
              key={action.id}
              type="button"
              data-model-key={action.id}
              onClick={() => onModelSelect?.(action.id!.slice(6))}
            >
              {action.title}
            </button>
          ))}
        {attachActions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-project-action={action.id}
            onClick={() => attachFrom(action.id!)}
          >
            {action.title}
          </button>
        ))}
        <input
          aria-label={composerPrompt}
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" disabled={disabled || !draft.trim()} onClick={() => void send()}>
          发送
        </button>
      </div>
    );
  },
}));
vi.mock("../components/thread-header-right", () => ({
  threadHeaderRight: ({ onBotActions }: { onBotActions: () => void }) => ({
    headerRight: () => (
      <button type="button" onClick={onBotActions}>
        Settings
      </button>
    ),
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
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN", t: runtime.t }) }));
vi.mock("./side-insets", () => ({ useSideInsets: () => ({ paddingLeft: 0, paddingRight: 0 }) }));
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
    runtime.rpc.mockReset().mockImplementation(async (method: string) => {
      if (method === "projectWorkspaces/get") return { name: "设计工作区" };
      if (method === "projectWorkspaces/roster")
        return {
          bots: [{ id: "bot-a", name: "Alpha", color: "#123456", avatarSet: "rakazo" }],
          groups: [{ id: "group-a", name: "群聊名称", members: [] }],
          nextBotId: null,
          nextGroupId: null,
        };
      if (method === "projectWorkspaces/getBot")
        return {
          id: "bot-a",
          name: "Alpha",
          color: "#123456",
          modelProvider: "openai",
          modelId: "model-a",
        };
      if (method === "projectWorkspaces/updateBot")
        return { id: "bot-a", name: "Alpha", modelProvider: null, modelId: null };
      if (method === "models/list" || method === "models/credentials") return [];
      if (method === "me") return { defaultProvider: "openai", defaultModel: "default-model" };
      return { botSettings: true };
    });
    runtime.push.mockReset();
    chat = {
      snapshot: {
        threadId: "thread-a",
        messages: [
          {
            id: "message-a",
            role: "bot",
            botId: "bot-a",
            blocks: [{ kind: "text", text: "<script>external()</script>" }],
          },
        ],
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
      answeringEffectId: null,
      downloadingArtifactId: null,
      answerApproval: vi.fn(),
      downloadArtifact: vi.fn(),
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
    vi.useRealTimers();
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
        {
          id: "message-b",
          role: "bot",
          botId: "bot-b",
          blocks: [{ kind: "text", text: "Sample" }],
        },
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
    expect(container.querySelector("header")?.textContent).toBe("群聊名称");
    expect(container.querySelector("header")?.getAttribute("data-project-name")).toBe("设计工作区");
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/get",
      { id: "project-a" },
      expect.objectContaining({ skipSpaceAuthRecovery: true }),
    );
  });

  it("refreshes the project title while the chat remains open", async () => {
    const names = vi.fn().mockReturnValueOnce("项目一").mockReturnValue("项目二");
    runtime.rpc.mockImplementation(async (method: string) => {
      if (method === "projectWorkspaces/get") return { name: names() };
      if (method === "projectWorkspaces/roster")
        return { bots: [], groups: [], nextBotId: null, nextGroupId: null };
      return { botSettings: false };
    });
    vi.useFakeTimers();
    await render();
    expect(container.querySelector("header")?.getAttribute("data-project-name")).toBe("项目一");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(container.querySelector("header")?.getAttribute("data-project-name")).toBe("项目二");
    expect(names).toHaveBeenCalledTimes(2);
  });

  it("opens Bot settings within the current project scope", async () => {
    runtime.params.projectName = "旧标题";
    await render();
    expect(container.querySelector("header")?.textContent).toBe("AlphaSettings");
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

  it("reuses ordinary message cards and the text-only composer", async () => {
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
      Array.from(container.querySelectorAll("[data-message-card]"), (node) =>
        node.getAttribute("data-message-card"),
      ),
    ).toEqual(["user", "bot"]);
    expect(container.querySelector("[data-shared-composer]")?.getAttribute("data-text-only")).toBe(
      "true",
    );
    const avatar = container.querySelector("[data-avatar]");
    expect(avatar?.getAttribute("data-avatar")).toBe("bot-a");
    expect(avatar?.getAttribute("data-color")).toBe("#123456");
    expect(avatar?.getAttribute("data-avatar-set")).toBe("rakazo");
    expect(avatar?.getAttribute("data-activity")).toBe("idle");
  });

  it("preserves stored picture avatars in the shared header and bot reply after reopening", async () => {
    const image = "data:image/png;base64,aW1hZ2U=";
    const fallback = runtime.rpc.getMockImplementation()!;
    runtime.rpc.mockImplementation(async (method: string, ...args: unknown[]) => {
      if (method === "projectWorkspaces/roster")
        return {
          bots: [{ id: "bot-a", name: "Alpha", color: image, avatarSet: "rakazo" }],
          groups: [],
          nextBotId: null,
          nextGroupId: null,
        };
      return fallback(method, ...args);
    });
    await render();
    expect(container.querySelector("[data-title-color]")?.getAttribute("data-title-color")).toBe(
      image,
    );
    expect(container.querySelector("[data-avatar]")?.getAttribute("data-color")).toBe(image);
    expect(container.querySelector("[data-composer-dock]")).not.toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(container.querySelector("[data-title-color]")?.getAttribute("data-title-color")).toBe(
      image,
    );
  });

  it("loads and saves the model through the project scope while retaining the draft", async () => {
    await render();
    await fill("keep this draft");
    expect(container.querySelector("[data-model-label]")?.textContent).toBe("model-a");
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/getBot",
      { projectId: "project-a", botId: "bot-a" },
      expect.any(Object),
    );
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-model-key="model:"]')!.click(),
    );
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/updateBot",
      {
        projectId: "project-a",
        bot: { botId: "bot-a", modelProvider: null, modelId: null, thinkingLevel: null },
      },
      expect.objectContaining({ skipSpaceAuthRecovery: true }),
    );
    expect(container.querySelector("[data-model-label]")?.textContent).toBe("default-model");
    expect(container.querySelector("input")?.value).toBe("keep this draft");
    expect(
      runtime.rpc.mock.calls.some(([method]) => method === "bots/get" || method === "bots/update"),
    ).toBe(false);
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-project-action="settings"]')!.click(),
    );
    expect(runtime.push).toHaveBeenCalledWith({
      pathname: "/bot-settings",
      params: { projectId: "project-a", botId: "bot-a", scope: "account-a" },
    });
  });

  it("refreshes identity even when reading the project title fails", async () => {
    const fallback = runtime.rpc.getMockImplementation()!;
    runtime.rpc.mockImplementation(async (method: string, ...args: unknown[]) => {
      if (method === "projectWorkspaces/get") throw new Error("offline");
      return fallback(method, ...args);
    });
    await render();
    expect(container.querySelector("header")?.textContent).toBe("AlphaSettings");
    expect(container.querySelector("[data-avatar]")?.getAttribute("data-color")).toBe("#123456");
  });

  it("keeps project approval and file actions on their scoped callbacks", async () => {
    chat.snapshot = {
      threadId: "thread-a",
      run: { id: "run-a", botId: "bot-a", status: "waiting_input" },
      olderCursor: null,
      messages: [
        {
          id: "approval-a",
          role: "bot",
          botId: "bot-a",
          runId: "run-a",
          blocks: [
            {
              kind: "ask",
              text: "Allow file?",
              detail: "Project file",
              approvalEffectId: "effect-a",
              actions: [{ id: "allow" }, { id: "deny" }],
            },
          ],
        },
        {
          id: "file-a",
          role: "bot",
          botId: "bot-a",
          blocks: [{ kind: "file", artifactId: "artifact-a", name: "result.md" }],
        },
      ],
    };
    await render();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "允许本次")!
        .click();
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "下载 result.md")!
        .click();
    });
    expect(chat.answerApproval).toHaveBeenCalledExactlyOnceWith("approval-a", "allow");
    expect(chat.downloadArtifact).toHaveBeenCalledExactlyOnceWith("artifact-a");
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
