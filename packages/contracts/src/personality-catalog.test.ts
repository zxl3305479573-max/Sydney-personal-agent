import { describe, expect, it } from "vitest";
import { CreatePersonalityInput } from "./personality.js";
import { PERSONALITY_CATALOG, renderPersonalitySelections } from "./personality-catalog.js";

describe("Hersona personality catalog", () => {
  it("includes pinned personality and language attributes without duplicate identities", () => {
    expect(PERSONALITY_CATALOG.length).toBe(300);
    expect(new Set(PERSONALITY_CATALOG.map((item) => item.id)).size).toBe(300);
    expect(PERSONALITY_CATALOG.some((item) => item.id === "speech/mandarin_casual")).toBe(true);
  });

  it("renders selected intensity and rejects unknown or conflicting attributes", () => {
    expect(
      renderPersonalitySelections([{ attributeId: "personality/intellectual", weight: "mild" }]),
    ).toContain("轻度");
    expect(() =>
      renderPersonalitySelections([{ attributeId: "personality/missing", weight: "moderate" }]),
    ).toThrow();
    expect(() =>
      renderPersonalitySelections([
        { attributeId: "personality/intellectual", weight: "moderate" },
        { attributeId: "personality/airhead", weight: "strong" },
      ]),
    ).toThrow(/Conflicting/);
  });

  it("bounds names, attributes and custom instructions", () => {
    expect(CreatePersonalityInput.safeParse({ name: "  " }).success).toBe(false);
    expect(
      CreatePersonalityInput.safeParse({ name: "A", instructions: "x".repeat(20001) }).success,
    ).toBe(false);
    expect(
      CreatePersonalityInput.safeParse({
        name: "A",
        selections: Array(13).fill({ attributeId: "personality/intellectual" }),
      }).success,
    ).toBe(false);
  });
});
