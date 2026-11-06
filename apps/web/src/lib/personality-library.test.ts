import { describe, expect, it } from "vitest";
import {
  PERSONALITY_LIBRARY,
  personalityIdForInstructions,
  personalityPreset,
} from "./personality-library";

describe("personality library", () => {
  it("provides selectable presets with usable instructions", () => {
    expect(PERSONALITY_LIBRARY.length).toBeGreaterThanOrEqual(6);
    expect(PERSONALITY_LIBRARY.every((preset) => preset.instructions.trim().length > 40)).toBe(
      true,
    );
  });

  it("recognizes a selected preset and treats edits as custom", () => {
    const preset = personalityPreset("teacher");
    expect(personalityIdForInstructions(preset.instructions)).toBe("teacher");
    expect(personalityIdForInstructions(`${preset.instructions}\n请先给结论`)).toBe("custom");
  });
});
