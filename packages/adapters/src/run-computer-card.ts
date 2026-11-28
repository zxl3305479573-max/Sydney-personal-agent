import type { ExecutorDeps } from "./executor-deps.js";
import { publishMessage } from "./run-messages.js";

export function createRunComputerCardPublisher(
  deps: ExecutorDeps,
  run: { id: string; spaceId: string; threadId: string; botId: string; trigger: string },
) {
  let pending: Promise<unknown> | undefined;
  return () => {
    pending ??= publishMessage(
      deps,
      run,
      "bot",
      [{ kind: "computer", state: "Live", text: "" }],
      false,
      `computer-live:${run.id}`,
    ).catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
}
