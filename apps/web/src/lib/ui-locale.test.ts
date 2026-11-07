import { describe, expect, it } from "vitest";
import { normalizeUiLocale, persistUiLocale, resolveUiLocale, UI_LOCALES, UI_LOCALE_STORAGE_KEY } from "./ui-locale";

describe("web language preferences", () => {
  it("offers Chinese and English only", () => {
    expect(UI_LOCALES).toEqual(["zh-CN", "en"]);
    expect(normalizeUiLocale("en-US")).toBe("en");
    expect(normalizeUiLocale("zh-TW")).toBe("zh-CN");
    expect(normalizeUiLocale("fr")).toBe("zh-CN");
  });

  it("defaults to Chinese and preserves explicit English", () => {
    expect(resolveUiLocale({ stored: null, envDefault: null, navigatorLanguage: "en-US" })).toBe("zh-CN");
    expect(resolveUiLocale({ stored: "en", envDefault: "zh-CN" })).toBe("en");
    expect(resolveUiLocale({ stored: "de", envDefault: "en" })).toBe("zh-CN");
  });

  it("saves the selected language", () => {
    const store = new Map<string, string>();
    persistUiLocale("en", { setItem: (key, value) => { store.set(key, value); } });
    expect(store.get(UI_LOCALE_STORAGE_KEY)).toBe("en");
  });
});
