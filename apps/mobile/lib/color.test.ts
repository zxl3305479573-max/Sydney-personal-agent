import { darkTokens, lightTokens } from "@rakazo/ui-tokens";
import { describe, expect, it } from "vitest";
import { translucentColor, transparentColor } from "./color.js";

describe("transparentColor", () => {
  it("keeps the hue of six-digit backgrounds", () => {
    expect(transparentColor(darkTokens.background)).toBe("rgba(21, 23, 28, 0)");
    expect(transparentColor(lightTokens.background)).toBe("rgba(243, 241, 236, 0)");
  });

  it("reads rgba palette colors and drops their alpha", () => {
    expect(transparentColor(darkTokens.overlay)).toBe("rgba(8, 10, 14, 0)");
    expect(transparentColor(lightTokens.overlay)).toBe("rgba(24, 22, 18, 0)");
    expect(transparentColor("rgb(1, 2, 3)")).toBe("rgba(1, 2, 3, 0)");
  });

  it("expands short hex and ignores an existing hex alpha", () => {
    expect(transparentColor("#abc")).toBe("rgba(170, 187, 204, 0)");
    expect(transparentColor("#0B0C0E80")).toBe("rgba(11, 12, 14, 0)");
  });

  it("stays a valid color when the source format is unknown", () => {
    expect(transparentColor("oklch(0.2 0.02 260)")).toBe("transparent");
  });
});

describe("translucentColor", () => {
  it("gives the label grey at iOS's tertiary 30% in both themes", () => {
    expect(translucentColor(lightTokens.mutedForeground, 0.3)).toBe("rgba(51, 46, 40, 0.3)");
    expect(translucentColor(darkTokens.mutedForeground, 0.3)).toBe("rgba(234, 232, 225, 0.3)");
  });

  it("leaves a colour it can't read as it was", () => {
    expect(translucentColor("oklch(0.2 0.02 260)", 0.3)).toBe("oklch(0.2 0.02 260)");
  });
});
