import { darkTokens } from "@rakazo/ui-tokens";
import { describe, expect, it, vi } from "vitest";
import { resolveScopedTheme } from "./theme-pack";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  PlatformColor: (name: string) => `system:${name}`,
  Appearance: {
    getColorScheme: () => "dark",
    setColorScheme: vi.fn(),
    addChangeListener: () => ({ remove: vi.fn() }),
  },
  StyleSheet: {
    create: <T>(styles: T) => styles,
    hairlineWidth: 0.5,
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));

import { createHomeStyles } from "../components/home-styles";

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("createHomeStyles scoped theming", () => {
  const colors = {
    page: "#0A0A0A",
    fill: "#111",
    quietFill: "#111",
    fillPressed: "#222",
    separator: "#333",
    label: "#FFF",
    secondaryLabel: "#AAA",
    tertiaryLabel: "#888",
    systemTertiaryLabel: "#777",
    groupedPage: "#0A0A0A",
    groupedCell: "#1A1A1A",
  };

  it("uses transparent screen background when a theme pack provides a background image and applies card geometry", () => {
    const pack = {
      schemaVersion: 1 as const,
      id: "inbox-cards",
      name: "Inbox Cards",
      author: "Test",
      version: "1.0.0",
      coverage: ["inbox"] as ["inbox"],
      defaults: {
        layout: "cards" as const,
        surface: "outlined" as const,
        geometry: { cardRadius: 22, borderWidth: 2 },
        background: { dark: "bg", opacity: 0.25 },
      },
      assets: { bg: TINY_PNG },
    };
    const scope = resolveScopedTheme(
      [pack],
      { schemaVersion: 1, globalPackId: "classic", pages: { inbox: "inbox-cards" } },
      "inbox",
      "dark",
    );
    const styles = createHomeStyles(darkTokens, colors, scope);
    expect(styles.screen.backgroundColor).toBe("transparent");
    expect(styles.row.borderRadius).toBe(22);
    expect(styles.row.borderWidth).toBe(2);
    expect(styles.pinnedTile.borderRadius).toBe(24);
  });

  it("keeps opaque page color when no theme background is active", () => {
    const styles = createHomeStyles(darkTokens, colors, null);
    expect(styles.screen.backgroundColor).toBe("#0A0A0A");
    expect(styles.row.borderRadius).toBe(0);
    expect(styles.row.borderWidth).toBe(0);
  });

  it("keeps themed chat capsules colored without covering them with the default gradient", () => {
    const scope = resolveScopedTheme(
      [],
      { schemaVersion: 1, globalPackId: "classic", pages: {} },
      "inbox",
      "dark",
    );
    scope.background = {
      uri: "file://background.jpg",
      fit: "cover",
      opacity: 1,
      overlayOpacity: 0.35,
    };
    const tokens = { ...darkTokens, card: "rgba(233, 241, 247, 0.5)" };
    const styles = createHomeStyles(tokens, colors, scope);
    expect(styles.screen.backgroundColor).toBe("transparent");
    expect(styles.rosterRow.backgroundColor).toBe(tokens.card);
    expect(styles.rosterRow.borderRadius).toBe(18);
    expect(styles.rosterRow.marginHorizontal).toBe(20);
    expect(styles.rosterRow.experimental_backgroundImage).toBeUndefined();
  });
});
