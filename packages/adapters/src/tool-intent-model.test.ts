import type { AgentRunRequest, AgentRuntime } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { classifyToolIntent } from "./tool-intent.js";
import { createToolIntentModelClassifier } from "./tool-intent-model.js";

describe("model tool intent classifier", () => {
  it("sends the bounded conversation as data with no tools and accounts usage", async () => {
    const onUsage = vi.fn();
    const run = vi.fn(async function* (_request: AgentRunRequest) {
      yield {
        type: "usage" as const,
        provider: "test",
        model: "test",
        inputTokens: 4,
        outputTokens: 1,
      };
      yield { type: "done" as const, text: "no_tools" };
    });
    const originalRequest: AgentRunRequest = {
      botId: "bot",
      threadId: "thread",
      runId: "run",
      model: { provider: "test", id: "test" },
      onUsage,
      toolIntentCandidate: { message: "你好" },
      prompt: "original",
      instructions: "original",
      history: [],
      tools: [],
    };
    const classifier = createToolIntentModelClassifier({
      runtime: { run } as unknown as AgentRuntime,
      request: originalRequest,
      context: {},
    });
    const input = { message: "你好", history: [], contextComplete: true };
    expect(await classifyToolIntent(input, classifier, new AbortController().signal)).toBe(
      "no_tools",
    );
    const request = run.mock.calls[0]?.[0] as unknown as AgentRunRequest;
    expect(request.tools).toEqual([]);
    expect(request.toolIntentCandidate).toBeUndefined();
    expect(JSON.parse(request.prompt)).toEqual(input);
    expect(request.runId).toMatch(/^run:tool-intent:/);
    expect(onUsage).toHaveBeenCalledTimes(1);
  });
});
