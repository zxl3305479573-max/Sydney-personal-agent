import type { AgentRunRequest, AgentRuntime } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import type { ObservedToolList } from "./tool-calls.js";
import { observeToolCalls } from "./tool-calls.js";

describe("tool list observation", () => {
  it("records the actual first model list reported by the runtime", async () => {
    const runtime = {
      async *run(request: AgentRunRequest) {
        request.onInitialToolList?.({ count: 0, bytes: 2 });
        yield { type: "done" as const };
      },
    } as unknown as AgentRuntime;
    const observed: ObservedToolList[] = [];
    const callback = vi.fn();
    const request: AgentRunRequest = {
      botId: "bot",
      threadId: "thread",
      runId: "run",
      prompt: "hello",
      instructions: "",
      history: [],
      tools: [
        {
          name: "read_file",
          description: "read",
          inputSchema: { type: "object" },
        },
      ],
      model: { provider: "test", id: "test" },
      onInitialToolList: callback,
    };
    for await (const _event of observeToolCalls(runtime, [], observed).run(request)) {
      expect(_event.type).toBe("done");
    }
    expect(observed).toEqual([{ runId: "run", count: 0, bytes: 2 }]);
    expect(callback).toHaveBeenCalledWith({ count: 0, bytes: 2 });
  });
});
