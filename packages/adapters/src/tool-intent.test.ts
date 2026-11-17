import { describe, expect, it, vi } from "vitest";
import type { ToolIntentClassifier } from "./tool-intent.js";
import { classifyToolIntent, toolIntentCandidate } from "./tool-intent.js";

const input = { message: "你好", history: [], contextComplete: true };

describe("tool intent classification boundary", () => {
  it("only offers ordinary, context-complete first messages when explicitly enabled", () => {
    const eligible = {
      enabled: true,
      trigger: "user",
      sourceRole: "user",
      group: false,
      voiceCall: false,
      scripted: false,
      hasCheckpoint: false,
      hasAttachments: false,
      hasPriorContext: false,
      hasCustomInstructions: false,
      message: "你好",
    };
    expect(toolIntentCandidate(eligible)).toEqual({ message: "你好" });
    for (const patch of [
      { enabled: false },
      { trigger: "follow_up" },
      { sourceRole: "assistant" },
      { group: true },
      { voiceCall: true },
      { scripted: true },
      { hasCheckpoint: true },
      { hasAttachments: true },
      { hasPriorContext: true },
      { hasCustomInstructions: true },
      { message: "  " },
    ]) {
      expect(toolIntentCandidate({ ...eligible, ...patch })).toBeUndefined();
    }
  });

  it("accepts only explicit supported decisions", async () => {
    const signal = new AbortController().signal;
    expect(await classifyToolIntent(input, async () => "no_tools", signal)).toBe("no_tools");
    expect(await classifyToolIntent(input, async () => "tools_needed", signal)).toBe(
      "tools_needed",
    );
    for (const result of ["NO_TOOLS", { decision: "no_tools" }, "", null]) {
      expect(await classifyToolIntent(input, async () => result, signal)).toBe("uncertain");
    }
  });

  it("does not call the classifier for incomplete or oversized context", async () => {
    const classifier = vi.fn(async () => "no_tools");
    const signal = new AbortController().signal;
    expect(await classifyToolIntent({ ...input, contextComplete: false }, classifier, signal)).toBe(
      "uncertain",
    );
    expect(
      await classifyToolIntent({ ...input, message: "长".repeat(5_000) }, classifier, signal),
    ).toBe("uncertain");
    expect(classifier).not.toHaveBeenCalled();
  });

  it("returns uncertain on failure and passes the complete conversation through", async () => {
    const history = [{ role: "user" as const, content: "修改项目文件" }];
    const classifier = vi.fn<ToolIntentClassifier>(async () => {
      throw new Error("unavailable");
    });
    expect(
      await classifyToolIntent(
        { message: "继续", history, contextComplete: true },
        classifier,
        new AbortController().signal,
      ),
    ).toBe("uncertain");
    expect(classifier.mock.calls[0]?.[0]).toEqual({
      message: "继续",
      history,
      contextComplete: true,
    });
  });

  it("times out and aborts a stalled classifier", async () => {
    vi.useFakeTimers();
    try {
      let classifierSignal: AbortSignal | undefined;
      const pending = classifyToolIntent(
        input,
        async (_request, signal) => {
          classifierSignal = signal;
          return new Promise(() => {});
        },
        new AbortController().signal,
        10,
      );
      await vi.advanceTimersByTimeAsync(10);
      expect(await pending).toBe("uncertain");
      expect(classifierSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns promptly when the parent is aborted", async () => {
    const controller = new AbortController();
    const pending = classifyToolIntent(input, async () => new Promise(() => {}), controller.signal);
    controller.abort();
    expect(await pending).toBe("uncertain");
  });
});
