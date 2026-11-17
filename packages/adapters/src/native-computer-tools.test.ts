import { expect, it, vi } from "vitest";
import { persistentComputerInstruction } from "./run-instructions.js";
import { selectBuiltinToolsForRun } from "./run-tool-selection.js";
import { computerTools } from "./run-tools-computer.js";

const options = {
  graphicalToolsAllowed: true,
  groupId: null,
  trigger: "user",
  semanticMemoryEnabled: false,
  messagingChannelRun: false,
};

it("offers native desktop actions that the driver supports without changing other providers", () => {
  const native = selectBuiltinToolsForRun({ ...options, computerKind: "native-linux" });
  const other = selectBuiltinToolsForRun({ ...options, computerKind: "docker" });
  expect(native.map((tool) => tool.name)).not.toContain("open_path");
  expect(native.map((tool) => tool.name)).not.toContain("launch_app");
  expect(other.map((tool) => tool.name)).toEqual(
    expect.arrayContaining(["open_path", "launch_app"]),
  );
  const nativeAction = native.find((tool) => tool.name === "computer_act")!;
  const otherAction = other.find((tool) => tool.name === "computer_act")!;
  expect(nativeAction.description).not.toContain("focus");
  expect(JSON.stringify(nativeAction.inputSchema)).not.toContain('"focus"');
  expect(JSON.stringify(otherAction.inputSchema)).toContain('"focus"');
  const instruction = persistentComputerInstruction({
    graphical: true,
    graphicalToolsAllowed: true,
    heldForTakeover: false,
    computerKind: "native-linux",
  });
  expect(instruction).not.toContain("open_path");
  expect(instruction).not.toContain("other Team bots may run at the same time");
  expect(instruction).toContain("controlled by its lease");
});

it("rejects a mixed native batch before any action or computer startup", async () => {
  const act = vi.fn();
  const get = vi.fn();
  const markDirty = vi.fn();
  const ctx = {
    deps: { prisma: { taughtSkill: { findFirst: async () => null } }, sandbox: { act } },
    run: { spaceId: "space", botId: "bot" },
    computer: { kind: "native-linux", get, checkpoint: { markDirty } },
  };
  const result = await computerTools.computer_act!(
    ctx as never,
    {
      name: "computer_act",
      args: {
        actions: [
          { kind: "click", x: 1, y: 2 },
          { kind: "focus", application: "app" },
        ],
      },
      finish: async (value: unknown) => value,
    } as never,
  );
  expect(result).toMatchObject({ error: expect.stringContaining("全部未执行") });
  expect(get).not.toHaveBeenCalled();
  expect(act).not.toHaveBeenCalled();
  expect(markDirty).not.toHaveBeenCalled();
});

it("rejects legacy open and launch calls on the native desktop", async () => {
  const ctx = { computer: { kind: "native-linux" } };
  const call = { finish: async (value: unknown) => value };
  for (const name of ["open_path", "launch_app"] as const) {
    const result = await computerTools[name]!(ctx as never, call as never);
    expect(result).toMatchObject({ error: expect.stringContaining("不支持") });
  }
});
