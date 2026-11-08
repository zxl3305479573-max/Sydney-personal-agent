import { describe, expect, it } from "vitest";
import {
  combinePersonalityInstructions,
  PERSONALITY_LIBRARY,
  personalityIdForInstructions,
  personalityPreset,
  splitPersonalityInstructions,
} from "./personality-library";

describe("personality library", () => {
  it("provides selectable presets with usable instructions", () => {
    expect(PERSONALITY_LIBRARY.length).toBeGreaterThanOrEqual(6);
    expect(PERSONALITY_LIBRARY.every((preset) => preset.instructions.trim().length > 10)).toBe(
      true,
    );
  });

  it("recognizes a selected preset and treats edits as custom", () => {
    const preset = personalityPreset("teacher");
    const combined = combinePersonalityInstructions("负责审核方案", preset.instructions);
    expect(personalityIdForInstructions(combined)).toBe("teacher");
    expect(splitPersonalityInstructions(combined)).toEqual({
      duties: "负责审核方案",
      personality: preset.instructions,
    });
    expect(personalityIdForInstructions("原来的职责")).toBe("custom");
  });

  it("replaces only the personality and preserves old, unmarked duties", () => {
    const duties = "负责审核方案\n保持数据准确";
    const first = combinePersonalityInstructions(duties, "语气温和");
    const second = combinePersonalityInstructions(
      splitPersonalityInstructions(first).duties,
      "简洁",
    );
    expect(splitPersonalityInstructions(second)).toEqual({ duties, personality: "简洁" });
    expect(splitPersonalityInstructions(duties)).toEqual({ duties, personality: "" });
    expect(splitPersonalityInstructions(combinePersonalityInstructions("", "简洁").trim())).toEqual(
      {
        duties: "",
        personality: "简洁",
      },
    );
  });
});
