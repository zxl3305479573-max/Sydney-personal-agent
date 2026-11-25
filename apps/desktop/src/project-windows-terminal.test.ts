import type { ProjectWindowsTerminalRequest } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createProjectWindowsTerminal } from "./project-windows-terminal.js";

const request: ProjectWindowsTerminalRequest = {
  method: "projectWindowsTerminal",
  projectId: "project-a",
  projectName: "Project A",
  spaceId: "space-a",
  runId: "run-a",
  command: "ver",
};
const origin = "https://sydney.example";

describe.skipIf(process.platform !== "win32")("Windows project diagnostics", () => {
  it.each([
    ["ver", /^\d+(?:\.\d+){2,3}$/],
    ["chcp", /^\d+$/],
  ] as const)(
    "runs real %s only after the native confirmation callback",
    async (command, pattern) => {
      const confirm = vi.fn().mockResolvedValue(true);
      const execute = createProjectWindowsTerminal(confirm);
      const signal = new AbortController().signal;
      const task = { ...request, command };
      await expect(execute(origin, task, signal)).resolves.toEqual({
        status: "completed",
        stdout: expect.stringMatching(pattern),
      });
      expect(confirm).toHaveBeenCalledExactlyOnceWith(origin, task, signal);
    },
  );

  it("rejects injected parameters before prompting and reports a native refusal", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const execute = createProjectWindowsTerminal(confirm);
    const signal = new AbortController().signal;
    const unexpectedInput = { ...request, cwd: "C:\\private" };
    await expect(execute(origin, unexpectedInput, signal)).rejects.toThrow();
    expect(confirm).not.toHaveBeenCalled();
    await expect(execute(origin, request, signal)).resolves.toEqual({ status: "declined" });
  });

  it("does not start the diagnostic after the pending task is cancelled", async () => {
    const controller = new AbortController();
    const confirm = vi.fn(async () => {
      controller.abort();
      return true;
    });
    const execute = createProjectWindowsTerminal(confirm);
    await expect(execute(origin, request, controller.signal)).rejects.toHaveProperty(
      "name",
      "AbortError",
    );
  });
});
