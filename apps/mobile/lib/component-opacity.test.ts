import { darkTokens, lightTokens } from "@rakazo/ui-tokens";
import { expect, it } from "vitest";
import {
  componentSurfaceColor,
  componentSurfaceStyle,
  componentSurfaceTokens,
} from "./component-opacity";

it.each([lightTokens, darkTokens])(
  "changes component fills while keeping page, content and status colors intact",
  (tokens) => {
    const changed = componentSurfaceTokens(tokens, 0.25);
    expect(changed.card).toMatch(/, 0.25\)$/);
    for (const key of [
      "background",
      "foreground",
      "cardForeground",
      "primary",
      "primaryForeground",
      "success",
      "destructive",
      "border",
      "chatUserForeground",
    ] as const) {
      expect(changed[key]).toBe(tokens[key]);
    }
    expect(componentSurfaceTokens(tokens, 1)).toBe(tokens);
  },
);

it("keeps existing translucent fills and never compounds alpha across nested component layers", () => {
  expect(componentSurfaceColor("#FFFFFF80", 0.75)).toBe("rgba(255, 255, 255, 0.5019607843137255)");
  expect(componentSurfaceColor("#FFF8", 0.25)).toBe("rgba(255, 255, 255, 0.25)");
  expect(componentSurfaceColor("rgba(20, 30, 40, 0.1)", 0.5)).toBe("rgba(20, 30, 40, 0.1)");
  const once = componentSurfaceColor("#FFFFFF", 0.5);
  expect(componentSurfaceColor(once, 0.5)).toBe(once);
  expect(componentSurfaceColor("transparent", 0.5)).toBe("transparent");
});

it("removes opaque card gradients without applying opacity to children or changing geometry", () => {
  const original = {
    backgroundColor: "#FFFFFF",
    experimental_backgroundImage: "linear-gradient(#fff,#eee)",
    borderRadius: 20,
    opacity: 0.9,
    shadowOpacity: 0.1,
  };
  const changed = componentSurfaceStyle(original, 0.5)!;
  expect(changed.backgroundColor).toBe("rgba(255, 255, 255, 0.5)");
  expect(changed.experimental_backgroundImage).toBeUndefined();
  expect(changed.opacity).toBe(0.9);
  expect(changed.borderRadius).toBe(20);
  expect(componentSurfaceStyle(original, 1)).toBe(original);
});
