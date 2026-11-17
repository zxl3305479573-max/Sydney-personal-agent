import { describe, expect, it } from "vitest";
import { TOOL_INTENT_CASES } from "./tool-intent-cases.js";
import { evaluateToolIntentCases } from "./tool-intent-evaluation.js";

describe("tool intent evaluation", () => {
  it("counts unsafe omissions separately from conservative fallbacks", async () => {
    const result = await evaluateToolIntentCases(TOOL_INTENT_CASES, async (testCase) =>
      testCase.id === "weather" ? "no_tools" : "uncertain",
    );
    expect(result.missedTools).toBe(1);
    expect(result.simpleWithoutTools).toBe(0);
    expect(result.results).toHaveLength(TOOL_INTENT_CASES.length);
    expect(result.results.every((entry) => entry.durationMs >= 0)).toBe(true);
  });
});
