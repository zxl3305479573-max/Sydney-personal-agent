import type { ToolIntentCase } from "./tool-intent-cases.js";

type Decision = "no_tools" | "tools_needed" | "uncertain";

export async function evaluateToolIntentCases(
  cases: readonly ToolIntentCase[],
  classify: (testCase: ToolIntentCase) => Promise<Decision>,
) {
  const results: Array<{
    id: string;
    expected: ToolIntentCase["expected"];
    decision: Decision;
    durationMs: number;
  }> = [];
  for (const testCase of cases) {
    const start = performance.now();
    const decision = await classify(testCase);
    results.push({
      id: testCase.id,
      expected: testCase.expected,
      decision,
      durationMs: Math.max(0, performance.now() - start),
    });
  }
  return {
    results,
    missedTools: results.filter(
      (result) => result.expected === "tools_needed" && result.decision === "no_tools",
    ).length,
    simpleWithoutTools: results.filter(
      (result) => result.expected === "no_tools" && result.decision === "no_tools",
    ).length,
  };
}
