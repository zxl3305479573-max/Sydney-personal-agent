// @vitest-environment jsdom
import type { GithubRepoSummary } from "@rakazo/contracts";
import type { EffectCallback, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  scope: "account-a",
  focused: true,
  rpc: vi.fn(),
  capture: vi.fn(),
  push: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) =>
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]),
  useRouter: () => ({ push: runtime.push }),
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("./api", () => ({
  rpc: runtime.rpc,
  captureApiRequestContext: runtime.capture,
  isSpaceSelectionPending: () => false,
}));
vi.mock("./project-scope", () => ({ projectScopeKey: () => runtime.scope }));
vi.mock("./composer-draft", () => ({
  composerDraftScope: (userId: string, botId: string) => ({ userId, threadKey: `bot:${botId}` }),
  readComposerDraft: runtime.read,
  writeComposerDraft: runtime.write,
}));
vi.mock("./native", () => ({ useMobileTokens: () => ({}) }));
vi.mock("./i18n", () => ({ useI18n: () => ({ locale: "zh-CN" }) }));
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
vi.mock("../components/menu-picker", () => ({ MenuPicker: () => null }));

import { GithubBotAnalysis } from "../components/github-bot-analysis";

describe("mobile GitHub analysis draft", () => {
  let root: Root;
  let container: HTMLDivElement;
  const repo = {
    id: "repo-a",
    fullName: "example/repo",
    htmlUrl: "https://github.com/example/repo",
  } as GithubRepoSummary;
  const context = { apiBase: "https://example.test", headers: { "x-rakazo-space-id": "space-a" } };
  const render = () =>
    act(async () => root.render(<GithubBotAnalysis repo={repo} scopeKey="account-a" />));
  const click = () => act(async () => container.querySelector("button")!.click());
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.scope = "account-a";
    runtime.focused = true;
    runtime.capture.mockReset().mockResolvedValue(context);
    runtime.rpc
      .mockReset()
      .mockImplementation(async (procedure) =>
        procedure === "me"
          ? { userId: "user-a", spaceId: "space-a" }
          : procedure === "bots/list"
            ? [{ id: "bot-a", name: "Bot A" }]
            : { id: "bot-a" },
      );
    runtime.read.mockReset().mockReturnValue({ text: "", bindings: [] });
    runtime.write.mockReset().mockReturnValue(true);
    runtime.push.mockReset();
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("verifies the selected Home bot and prepares a scoped draft without sending it", async () => {
    await render();
    await click();
    expect(runtime.write).not.toHaveBeenCalled();
    await click();
    expect(runtime.rpc).toHaveBeenCalledWith(
      "bots/get",
      { botId: "bot-a" },
      expect.objectContaining({ requestContext: context }),
    );
    expect(runtime.write).toHaveBeenCalledWith(
      { userId: "user-a", threadKey: "bot:bot-a" },
      expect.stringContaining("example/repo"),
      [],
    );
    expect(runtime.push).toHaveBeenCalledWith({
      pathname: "/thread",
      params: { botId: "bot-a", spaceId: "space-a" },
    });
    expect(runtime.rpc.mock.calls.some(([procedure]) => String(procedure).includes("send"))).toBe(
      false,
    );
  });

  it("preserves an existing composer draft", async () => {
    runtime.read.mockReturnValue({ text: "existing draft", bindings: [] });
    await render();
    await click();
    await click();
    expect(runtime.write).not.toHaveBeenCalled();
    expect(runtime.push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("已有草稿");
  });

  it("does not navigate when persisting the draft fails", async () => {
    runtime.write.mockReturnValue(false);
    await render();
    await click();
    await click();
    expect(runtime.push).not.toHaveBeenCalled();
    expect(container.textContent).toContain("无法准备分析草稿");
  });

  it("does not write or navigate after changing accounts during bot verification", async () => {
    await render();
    await click();
    let resolve!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await click();
    runtime.scope = "account-b";
    await act(async () => resolve({ id: "bot-a" }));
    expect(runtime.write).not.toHaveBeenCalled();
    expect(runtime.push).not.toHaveBeenCalled();
  });

  it("shows an empty state and does not create a bot automatically", async () => {
    runtime.rpc.mockImplementation(async (procedure) =>
      procedure === "me" ? { userId: "user-a", spaceId: "space-a" } : [],
    );
    await render();
    await click();
    expect(container.textContent).toContain("先在首页创建 Bot");
    expect(container.querySelector("button")?.disabled).toBe(true);
    expect(runtime.write).not.toHaveBeenCalled();
  });
});
