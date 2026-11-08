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
vi.mock("../lib/rpc", () => ({ rpc: { personalities: calls } }));
vi.mock("../lib/i18n", () => ({ getActiveUiLocale: () => "zh-CN" }));

import { PersonalPersonalityLibrary } from "./PersonalPersonalityLibrary";

describe("personal personality library", () => {
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
