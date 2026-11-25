import { darkTokens, lightTokens } from "@rakazo/ui-tokens";
import { describe, expect, it } from "vitest";
import {
  CONTRAST_SEVERE_THRESHOLD,
  CONTRAST_WARNING_THRESHOLD,
  contrastRatio,
  evaluatePackContrast,
  evaluateThemeContrast,
} from "./theme-contrast";
import { BUILTIN_THEME_PACKS, parseThemePack } from "./theme-pack";

describe("theme contrast evaluator (WCAG 2.1)", () => {
  it("computes accurate contrast ratios for opaque and alpha-composited hex colors", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#222222", "#222222")).toBeCloseTo(1, 5);

    // Classic WCAG AA 4.5:1 boundary on white background
    expect(contrastRatio("#767676", "#FFFFFF")).toBeGreaterThanOrEqual(CONTRAST_WARNING_THRESHOLD);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeLessThan(CONTRAST_WARNING_THRESHOLD);

    // #RRGGBBAA alpha compositing over background
    expect(contrastRatio("#FFFFFF00", "#000000")).toBeCloseTo(1, 5);
    expect(contrastRatio("#FFFFFF80", "#000000")).toBeGreaterThan(5);
    expect(contrastRatio("#00000080", "#FFFFFF")).toBeLessThan(CONTRAST_WARNING_THRESHOLD);

    // Translucent surface composited over screen backdrop
    expect(contrastRatio("#FFFFFF", "#FFFFFF20", "#000000")).toBeGreaterThan(10);
    expect(contrastRatio("#000000", "#FFFFFF20", "#000000")).toBeLessThan(
      CONTRAST_SEVERE_THRESHOLD,
    );

    // Non-hex / unsupported inputs return null instead of throwing
    expect(contrastRatio("white", "#000000")).toBeNull();
    expect(contrastRatio("#FFF", "#000000")).toBeNull();
    expect(contrastRatio("#GGGGGG", "#000000")).toBeNull();
  });

  it("passes default light/dark tokens and flags severe (<3.0) and warning (<4.5) readability pairs", () => {
    expect(evaluateThemeContrast(lightTokens)).toEqual([]);
    expect(evaluateThemeContrast(darkTokens)).toEqual([]);

    const issues = evaluateThemeContrast({
      ...darkTokens,
      background: "#101010",
      foreground: "#222222", // severe (< 3.0)
      card: "#FFFFFF",
      cardForeground: "#777777", // warning (3.0..4.5)
      primary: "#0066CC",
      primaryForeground: "#0055AA", // severe (< 3.0)
      chatUser: "#767676",
      chatUserForeground: "#D0D0D0", // severe (< 3.0)
    });

    expect(issues.map((issue) => [issue.pair, issue.severity])).toEqual([
      ["text", "severe"],
      ["card", "warning"],
      ["primary", "severe"],
      ["chatUser", "severe"],
    ]);
    for (const issue of issues) {
      if (issue.severity === "severe") expect(issue.ratio).toBeLessThan(CONTRAST_SEVERE_THRESHOLD);
      else {
        expect(issue.ratio).toBeGreaterThanOrEqual(CONTRAST_SEVERE_THRESHOLD);
        expect(issue.ratio).toBeLessThan(CONTRAST_WARNING_THRESHOLD);
      }
    }
  });

  it("evaluates both light and dark modes (plus page overrides) without blocking low-contrast packs", () => {
    for (const builtin of BUILTIN_THEME_PACKS) {
      const report = evaluatePackContrast(builtin);
      expect(report.issues).toEqual([]);
      expect(report.hasSevere).toBe(false);
    }

    const lowContrastPack = parseThemePack({
      schemaVersion: 1,
      id: "pale-day",
      name: "Pale Day",
      author: "Test",
      version: "1.0.0",
      coverage: "all",
      defaults: {
        colors: {
          light: { background: "#F5F5F5", foreground: "#DFDFDF" },
          dark: { background: "#0A0A0A", foreground: "#FFFFFF" },
        },
      },
      pages: {
        thread: {
          colors: {
            dark: { chatUser: "#444444", chatUserForeground: "#7A7A7A" },
          },
        },
      },
    });

    const report = evaluatePackContrast(lowContrastPack);
    expect(report.hasSevere).toBe(true);
    expect(report.light.some((issue) => issue.pair === "text" && issue.severity === "severe")).toBe(
      true,
    );
    expect(
      report.dark.some(
        (issue) =>
          issue.pair === "chatUser" && issue.scope === "thread" && issue.severity === "severe",
      ),
    ).toBe(true);
    // Defaults light issue should not be duplicated across defaults + thread scopes
    expect(report.light.filter((issue) => issue.pair === "text")).toHaveLength(1);
  });
});
