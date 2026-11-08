// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const locale = vi.hoisted(() => ({ value: "zh-CN" }));
vi.mock("../lib/rpc", () => ({ rpc: { personalities: calls } }));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ i18n: { locale: locale.value } }),
}));

import { PersonalPersonalityLibrary } from "./PersonalPersonalityLibrary";

describe("personal personality library", () => {
  it("shows and searches attributes in the active interface language", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    calls.list.mockResolvedValue([]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      locale.value = "zh-CN";
      await act(async () => root.render(<PersonalPersonalityLibrary onApply={vi.fn()} />));
      await act(async () => container.querySelector("button")!.click());
      expect(container.textContent).toContain("天然呆");
      const search = container.querySelector<HTMLInputElement>('[aria-label="搜索属性"]')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          search,
          "天然呆",
        );
        search.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.querySelector('option[value="personality/airhead"]')).not.toBeNull();
      locale.value = "en";
      await act(async () => root.render(<PersonalPersonalityLibrary onApply={vi.fn()} />));
      const englishSearch = container.querySelector<HTMLInputElement>(
        '[aria-label="Search attributes"]',
      )!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          englishSearch,
          "airhead",
        );
        englishSearch.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(container.querySelector('option[value="personality/airhead"]')?.textContent).toBe(
        "Airhead",
      );
    } finally {
      locale.value = "zh-CN";
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("saves custom instructions and applies a stored snapshot", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const item = {
      id: "p1",
      name: "我的助手",
      description: "",
      instructions: "请耐心回答",
      customInstructions: "请耐心回答",
      selections: [],
      source: "custom" as const,
    };
    calls.list.mockResolvedValue([]);
    calls.create.mockImplementation(async () => {
      calls.list.mockResolvedValue([item]);
      return item;
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const apply = vi.fn();
    await act(async () => root.render(<PersonalPersonalityLibrary onApply={apply} />));
    await act(async () => container.querySelector("button")!.click());
    const name = container.querySelector("input:not([aria-label])") as HTMLInputElement;
    const instructions = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        name,
        item.name,
      );
      name.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        instructions,
        item.customInstructions,
      );
      instructions.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "保存")!
        .click(),
    );
    expect(calls.create).toHaveBeenCalledWith({
      name: item.name,
      description: "",
      instructions: item.customInstructions,
      selections: [],
    });
    await act(async () =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === item.name)!
        .click(),
    );
    expect(apply).toHaveBeenCalledWith(item.instructions, item.name);
    await act(async () => root.unmount());
    container.remove();
  });
});
