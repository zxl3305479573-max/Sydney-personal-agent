import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateUiLocale,
  getActiveUiLocale,
  i18n,
  setCatalogLoadersForTests,
  setUiLocale,
} from "./i18n";

vi.mock("./apply-ui-direction", () => ({ applyUiDirection: vi.fn() }));

describe("web locale activation", () => {
  beforeEach(() => {
    setCatalogLoadersForTests(null);
    i18n.load("en", {});
    i18n.activate("en");
    vi.unstubAllGlobals();
  });

  it("rebrands Chinese messages and uses English brand fallbacks", async () => {
    setCatalogLoadersForTests({
      en: async () => ({ messages: { signIn: "Sign in to Rakazo", welcome: "Welcome to Rakazo" } }),
      "zh-CN": async () => ({ messages: { signIn: "登录 Rakazo" } }),
    });
    await activateUiLocale("zh-CN");
    expect(i18n._({ id: "signIn" })).toBe("登录 Sydney");
    expect(i18n._({ id: "welcome" })).toBe("Welcome to Sydney");
  });

  it("falls back to English when Chinese fails", async () => {
    setCatalogLoadersForTests({
      en: async () => ({ messages: { Settings: "Settings" } }),
      "zh-CN": async () => {
        throw new Error("missing catalog");
      },
    });
    expect(await activateUiLocale("zh-CN")).toBe("en");
    expect(i18n._({ id: "Settings" })).toBe("Settings");
  });

  it("does not let a pending selection override a later selection", async () => {
    let resolveChinese!: (value: { messages: Record<string, string> }) => void;
    const chinese = new Promise<{ messages: Record<string, string> }>((resolve) => {
      resolveChinese = resolve;
    });
    setCatalogLoadersForTests({ en: async () => ({ messages: {} }), "zh-CN": () => chinese });
    await activateUiLocale("en");
    const pending = activateUiLocale("zh-CN");
    const latest = activateUiLocale("en");
    resolveChinese({ messages: { Settings: "设置" } });
    expect(await pending).toBe("en");
    expect(await latest).toBe("en");
    expect(getActiveUiLocale()).toBe("en");
  });

  it("persists the selected supported language", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    setCatalogLoadersForTests({
      en: async () => ({ messages: {} }),
      "zh-CN": async () => ({ messages: {} }),
    });
    expect(await setUiLocale("zh-CN")).toBe("zh-CN");
    expect(storage.get("rakazo.uiLocale")).toBe("zh-CN");
  });
});
