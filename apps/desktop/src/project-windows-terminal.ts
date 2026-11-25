import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { ProjectWindowsTerminalRequestSchema } from "@rakazo/contracts";
import type {
  ProjectWindowsTerminalRequest,
  ProjectWindowsTerminalResult,
} from "@rakazo/contracts";

const executeFile = promisify(execFile);

export function createProjectWindowsTerminal(
  confirm: (origin: string, request: ProjectWindowsTerminalRequest, signal: AbortSignal) => Promise<boolean>,
) {
  let prompting = false;
  return async (
    origin: string, input: ProjectWindowsTerminalRequest, signal: AbortSignal,
  ): Promise<ProjectWindowsTerminalResult> => {
    const request = ProjectWindowsTerminalRequestSchema.parse(input);
    const windows = process.env.SystemRoot;
    if (process.platform !== "win32" || !windows || !path.win32.isAbsolute(windows) || prompting)
      throw new Error("Windows diagnostic unavailable");
    signal.throwIfAborted();
    prompting = true;
    try {
      const allowed = await confirm(origin, request, signal);
      signal.throwIfAborted();
      if (!allowed) return { status: "declined" };
      const cwd = path.win32.join(windows, "System32");
      const executable = path.win32.join(cwd, request.command === "ver" ? "cmd.exe" : "chcp.com");
      const args = request.command === "ver" ? ["/d", "/c", "ver"] : [];
      const { stdout } = await executeFile(executable, args, {
        cwd, signal, windowsHide: true, timeout: 4_000, maxBuffer: 4_096,
      });
      signal.throwIfAborted();
      const value = stdout.match(request.command === "ver" ? /\b\d+(?:\.\d+){2,3}\b/ : /\d+\s*$/)?.[0].trim();
      if (!value) throw new Error("Windows diagnostic did not return a value");
      return { status: "completed", stdout: value };
    } finally {
      prompting = false;
    }
  };
}
