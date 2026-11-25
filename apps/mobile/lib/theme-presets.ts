import type { ThemePackV1 } from "./theme-pack";
import { parseThemePack } from "./theme-pack";

export type StarterThemeDescription = {
  "zh-CN": string;
  "zh-TW": string;
  en: string;
};

const GLOBAL_OCEAN_PACK = parseThemePack({
  schemaVersion: 1,
  id: "global-ocean",
  name: "Ocean Global",
  author: "Sydney",
  version: "1.0.0",
  coverage: "all",
  defaults: {
    layout: "classic",
    surface: "glass",
    colors: {
      light: {
        background: "#EAF5FF",
        card: "#FFFFFF",
        foreground: "#0B2239",
        primary: "#0B6EBD",
        primaryForeground: "#FFFFFF",
        accent: "#CDEBFF",
        accentForeground: "#0B2239",
        border: "#A8D4F2",
      },
      dark: {
        background: "#071A2B",
        card: "#102B43",
        foreground: "#EAF5FF",
        primary: "#6CC5FF",
        primaryForeground: "#071A2B",
        accent: "#1B4667",
        accentForeground: "#EAF5FF",
        border: "#2D5F83",
      },
    },
  },
});

const INBOX_CARDS_PACK = parseThemePack({
  schemaVersion: 1,
  id: "inbox-cards",
  name: "Inbox Cards",
  author: "Sydney",
  version: "1.0.0",
  coverage: ["inbox", "thread", "groupThread"],
  defaults: {
    layout: "cards",
    surface: "outlined",
    geometry: {
      cardRadius: 22,
      controlRadius: 16,
      borderWidth: 1,
    },
    colors: {
      light: {
        card: "#FFF7ED",
        accent: "#FFEDD5",
        accentForeground: "#7C2D12",
        border: "#FDBA74",
      },
      dark: {
        card: "#2A1B11",
        accent: "#4A2B16",
        accentForeground: "#FED7AA",
        border: "#9A5A2A",
      },
    },
  },
  pages: {
    thread: {
      surface: "glass",
    },
    groupThread: {
      surface: "glass",
    },
  },
});

/**
 * Official starter packs validated through `parseThemePack`. Users install them on demand into
 * the local theme library and can uninstall them normally.
 */
export const STARTER_THEME_PACKS: readonly ThemePackV1[] = Object.freeze([
  GLOBAL_OCEAN_PACK,
  INBOX_CARDS_PACK,
]);

export const STARTER_THEME_DESCRIPTIONS: Readonly<Record<string, StarterThemeDescription>> =
  Object.freeze({
    "global-ocean": {
      "zh-CN": "全界面海蓝配色与玻璃质感，适配浅色与深色外观。",
      "zh-TW": "全介面海藍配色與玻璃質感，適配淺色與深色外觀。",
      en: "Ocean blue palette with glass surfaces across all screens, light & dark.",
    },
    "inbox-cards": {
      "zh-CN": "暖色描边卡片首页，单聊与群聊切换玻璃质感。",
      "zh-TW": "暖色描邊卡片首頁，單聊與群聊切換玻璃質感。",
      en: "Warm outlined cards for Home, with glass surfaces in chats.",
    },
  });

export function starterThemeDescription(packId: string, locale: string): string | null {
  const description = STARTER_THEME_DESCRIPTIONS[packId];
  if (!description) return null;
  if (locale === "zh-TW") return description["zh-TW"];
  if (locale.startsWith("zh")) return description["zh-CN"];
  return description.en;
}
