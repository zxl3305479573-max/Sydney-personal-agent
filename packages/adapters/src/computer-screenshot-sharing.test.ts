import { afterEach, expect, it, vi } from "vitest";
import { computerVisualActionKey, parseComputerActions } from "./computer-tools.js";
import * as messages from "./run-messages.js";
import { computerTools } from "./run-tools-computer.js";
import * as artifacts from "./thread-artifacts.js";

afterEach(() => vi.restoreAllMocks());

it("keeps routine observations and action screenshots for the model without posting them", async () => {
  const attach = vi.spyOn(artifacts, "attachWorkspaceFileToThread").mockResolvedValue({
    artifactId: "image",
    block: { kind: "image", artifactId: "image", mimeType: "image/png", name: "screen.png" },
  });
  const publish = vi.spyOn(messages, "publishMessage").mockResolvedValue(undefined as never);
  const observation = {
    image: Uint8Array.from([1, 2, 3]),
    mimeType: "image/png",
    frameId: "frame",
    capturedAt: "2026-11-09T00:00:00Z",
    width: 100,
    height: 100,
  };
  const ctx = {
    deps: {
      artifacts: {},
      prisma: { taughtSkill: { findFirst: async () => null } },
      sandbox: {
        observe: async () => observation,
        act: async () => ({ completed: 1, observation: { ...observation, frameId: "next" } }),
      },
    },
    run: { spaceId: "space", userId: "user", botId: "bot" },
    runId: "run",
    bot: { id: "bot" },
    thread: { id: "thread" },
    context: {},
    computer: { get: async () => ({}), checkpoint: { markDirty() {} } },
    tools: { offered: [{ name: "request_takeover" }] },
    secrets: [],
    state: { screen: { unchangedVisualStreak: { count: 0 } } },
  };
  const observe = computerTools.computer_observe!;
  const act = computerTools.computer_act!;
  const call = {
    name: "computer_observe",
    executionId: "observe",
    args: {},
    finish: async (result: unknown) => result,
  };
  const result = (await observe(ctx as never, call as never)) as {
    content: Array<{ type: string }>;
  };
  expect(result.content.some((part) => part.type === "image")).toBe(true);
  await act(
    ctx as never,
    {
      ...call,
      name: "computer_act",
      args: { actions: [{ kind: "click", x: 1, y: 1 }] },
    } as never,
  );
  expect(attach).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();

  await observe(
    ctx as never,
    { ...call, args: { share_with_user: true }, executionId: "requested" } as never,
  );
  expect(attach).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledOnce();

  attach.mockClear();
  publish.mockClear();
  await observe(
    ctx as never,
    { ...call, args: { share_with_user: true }, executionId: "requested-again" } as never,
  );
  expect(attach).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledOnce();

  attach.mockClear();
  publish.mockClear();
  const failed = (await observe(
    { ...ctx, deps: { ...ctx.deps, artifacts: undefined } } as never,
    { ...call, args: { share_with_user: true } } as never,
  )) as { content: Array<{ type: string; text?: string }> };
  expect(failed.content.some((part) => part.text?.includes("could not be sent"))).toBe(true);
  expect(publish).not.toHaveBeenCalled();

  const actions = [{ kind: "click", x: 1, y: 1 }];
  ctx.state.screen.unchangedVisualStreak = {
    frameId: "frame",
    actionKey: computerVisualActionKey(parseComputerActions(actions)),
    count: 3,
  } as typeof ctx.state.screen.unchangedVisualStreak;
  const blocked = await act(
    ctx as never,
    { ...call, name: "computer_act", args: { actions } } as never,
  );
  expect(blocked).toMatchObject({ details: { takeoverSuggested: true } });
  expect(attach).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledOnce();
});
