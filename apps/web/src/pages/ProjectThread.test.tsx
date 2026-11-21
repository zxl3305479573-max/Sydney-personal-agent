// @vitest-environment jsdom
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { act, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  user: "user-a",
  space: "space-a",
  navigate: (_path: string) => {},
  getProject: vi.fn(),
  threadSnapshot: vi.fn(),
  subscribe: vi.fn(),
  consentStatus: vi.fn(),
  consentAllow: vi.fn(),
  sendText: vi.fn(),
  cancelRun: vi.fn(),
  roster: vi.fn(),
}));
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ i18n: { locale: "zh-CN" } }) }));
vi.mock("@rakazo/ui-web", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props} />,
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
vi.mock("./shell/composer", () => ({
  Composer: ({
    onSend,
    disabled,
    textOnly,
  }: ComponentProps<typeof import("./shell/composer").Composer>) => {
    const [draft, setDraft] = useState("");
    return (
      <form
        data-shared-composer
        data-text-only={textOnly}
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          const submitted = draft;
          void onSend(submitted, [], "composer-nonce").then((sent) => {
            if (sent) setDraft((current) => (current === submitted ? "" : current));
          });
        }}
      >
        <textarea
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={disabled}>
          发送
        </button>
      </form>
    );
  },
}));
vi.mock("../lib/query", () => ({ useQueryUserId: () => runtime.user }));
vi.mock("../lib/rpc", () => ({
  selectedSpaceId: () => runtime.space,
  createSpaceRpc: () => ({ projectWorkspaces: { ...runtime, get: runtime.getProject } }),
}));
vi.mock("./WindowChrome", () => ({ WindowChrome: () => null }));

import { ProjectThreadPage } from "./ProjectThread";

describe("desktop project text chat", () => {
  let container: HTMLDivElement;
  let root: Root;
  const approved = { scope: "scope-a", version: "v1", recipients: [] };
  const snapshot = {
    threadId: "thread-a",
    cursor: 1,
    botId: "bot-a",
    messages: [
      {
        id: "message-a",
        role: "assistant",
        botId: "bot-a",
        blocks: [{ kind: "text", text: "External **reply**\n\n<script>external()</script>" }],
      },
    ],
    olderCursor: null,
    run: null,
  };
  function Navigation({ children }: { children: ReactNode }) {
    runtime.navigate = useNavigate();
    return children;
  }
  const render = (path = "/app/projects/project-a/chat?botId=bot-a") =>
    act(async () =>
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Navigation>
            <Routes>
              <Route path="/app/projects/:workspaceId/chat" element={<ProjectThreadPage />} />
            </Routes>
          </Navigation>
        </MemoryRouter>,
      ),
    );
  const fill = (value: string) =>
    act(async () => {
      const textarea = container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        value,
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const submit = () =>
    act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.user = "user-a";
    runtime.space = "space-a";
    runtime.getProject.mockReset().mockResolvedValue({ name: "Project Alpha" });
    runtime.threadSnapshot.mockReset().mockResolvedValue(snapshot);
    runtime.subscribe.mockReset().mockImplementation(async (_input, { signal }) =>
      (async function* () {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
          if (signal.aborted) resolve();
        });
      })(),
    );
    runtime.consentStatus.mockReset().mockResolvedValue(approved);
    runtime.consentAllow.mockReset().mockResolvedValue(approved);
    runtime.sendText.mockReset().mockResolvedValue({ ok: true });
    runtime.cancelRun.mockReset().mockResolvedValue({ ok: true });
    runtime.roster.mockReset().mockResolvedValue({
      bots: [{ id: "bot-a", name: "Alpha", color: "#123456", avatarSet: "rakazo" }],
      groups: [],
      nextBotId: null,
      nextGroupId: null,
    });
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("reads only the chosen project and displays external text without executing HTML", async () => {
    await render();
    expect(runtime.threadSnapshot).toHaveBeenCalledWith(
      { projectId: "project-a", botId: "bot-a", groupId: undefined },
      { signal: expect.any(AbortSignal) },
    );
    expect(runtime.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a", cursor: 1 }),
      expect.anything(),
    );
    expect(container.textContent).toContain("External reply");
    expect(container.querySelector("strong")?.textContent).toBe("reply");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Project Alpha");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/app/projects/project-a");
  });

  it("retains the draft on a failed send and clears it after a successful retry", async () => {
    await render();
    await fill("hello");
    runtime.sendText.mockRejectedValueOnce(new TypeError("response lost"));
    await submit();
    expect(container.querySelector("textarea")?.value).toBe("hello");
    expect(container.textContent).toContain("发送未确认");
    await submit();
    expect(container.querySelector("textarea")?.value).toBe("");
    const calls = runtime.sendText.mock.calls;
    expect(calls[0]?.[0]).toMatchObject({ projectId: "project-a", botId: "bot-a", text: "hello" });
    expect(calls[0]?.[0].clientNonce).toBe(calls[1]?.[0].clientNonce);
  });

  it("uses the shared text-only composer and resolves single-chat avatars from the project roster", async () => {
    await render();
    expect(container.querySelector("[data-shared-composer]")?.getAttribute("data-text-only")).toBe(
      "true",
    );
    const avatar = container.querySelector("[data-avatar]");
    expect(avatar?.getAttribute("data-avatar")).toBe("bot-a");
    expect(avatar?.getAttribute("data-avatar-set")).toBe("rakazo");
    expect(avatar?.getAttribute("data-color")).toBe("#123456");
    expect(avatar?.getAttribute("data-activity")).toBe("idle");
    expect(runtime.roster).toHaveBeenCalledExactlyOnceWith(
      { id: "project-a", afterBotId: undefined },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("keeps sent Markdown literal and aligns user messages with the ordinary user bubble", async () => {
    runtime.threadSnapshot.mockResolvedValueOnce({
      ...snapshot,
      messages: [
        {
          id: "user-a",
          role: "user",
          blocks: [{ kind: "text", text: "**literal** <script>external()</script>" }],
        },
      ],
    });
    await render();
    const bubble = container.querySelector('[data-testid="message-user-bubble"]');
    expect(bubble?.textContent).toBe("**literal** <script>external()</script>");
    expect(bubble?.querySelector("strong, script")).toBeNull();
    expect(container.querySelector("[data-avatar]")).toBeNull();
  });

  it("distinguishes same-name group members and cancels only the chosen run", async () => {
    const firstRun = { id: "run-a", botId: "bot-a", status: "running" };
    const secondRun = { id: "run-b", botId: "bot-b", status: "queued" };
    const group = {
      ...snapshot,
      groupId: "group-a",
      members: [
        { botId: "bot-a", name: "Alpha" },
        { botId: "bot-b", name: "Alpha" },
      ],
      run: firstRun,
      activeRuns: [secondRun, firstRun],
    };
    runtime.threadSnapshot.mockResolvedValueOnce(group).mockResolvedValueOnce({
      ...group,
      cursor: 2,
      run: secondRun,
      activeRuns: [secondRun],
    });
    await render("/app/projects/project-a/chat?groupId=group-a");
    expect(
      Array.from(container.querySelectorAll("p"), (paragraph) => paragraph.textContent),
    ).toContain("Alpha (1)");
    const stop = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "取消 Alpha (1) 的任务",
    )!;
    await act(async () => stop.click());
    expect(runtime.cancelRun).toHaveBeenCalledExactlyOnceWith(
      { projectId: "project-a", groupId: "group-a", botId: undefined, runId: "run-a" },
      { signal: expect.any(AbortSignal) },
    );
    expect(container.textContent).toContain("取消 Alpha (2) 的任务");
    expect(container.textContent).not.toContain("取消 Alpha (1) 的任务");
  });

  it("asks for consent before sending and requires another send after allowing", async () => {
    await render();
    runtime.consentStatus.mockResolvedValueOnce({
      ...approved,
      recipients: [
        {
          key: "provider-a",
          name: "Example AI",
          detail: "Model provider",
          use: "model",
          allowed: false,
        },
      ],
    });
    await fill("hello");
    await submit();
    expect(runtime.sendText).not.toHaveBeenCalled();
    const allow = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "允许这些接收方",
    )!;
    await act(async () => allow.click());
    expect(runtime.consentAllow).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a", keys: ["provider-a"] }),
      expect.anything(),
    );
    expect(runtime.sendText).not.toHaveBeenCalled();
    await submit();
    expect(runtime.sendText).toHaveBeenCalledOnce();
  });

  it("cancels the previous stream and clears the composer when switching project targets", async () => {
    await render();
    await fill("project A draft");
    const signal = runtime.subscribe.mock.calls[0]?.[1].signal as AbortSignal;
    await act(async () => runtime.navigate("/app/projects/project-b/chat?groupId=group-b"));
    expect(signal.aborted).toBe(true);
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(runtime.threadSnapshot).toHaveBeenLastCalledWith(
      { projectId: "project-b", groupId: "group-b", botId: undefined },
      expect.anything(),
    );
  });

  it("does not send after switching space during the consent check", async () => {
    await render();
    await fill("hello");
    let resolve!: (value: unknown) => void;
    runtime.consentStatus.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await submit();
    runtime.space = "space-b";
    await act(async () => resolve(approved));
    expect(runtime.sendText).not.toHaveBeenCalled();
  });

  it("rejects ambiguous targets without making a request", async () => {
    await render("/app/projects/project-a/chat?botId=bot-a&groupId=group-a");
    expect(container.textContent).toContain("项目入口无效");
    expect(runtime.threadSnapshot).not.toHaveBeenCalled();
  });
});
