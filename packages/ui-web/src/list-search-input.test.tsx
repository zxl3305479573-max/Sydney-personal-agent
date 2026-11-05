// @vitest-environment jsdom

import { Command } from "cmdk";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ListSearchInput } from "./components/ui/list-search-input";

afterEach(() => vi.unstubAllGlobals());

it.each([false, true])("clears the controlled search and restores focus (command: %s)", (command) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Example() {
    const [query, setQuery] = useState("model");
    const input = <ListSearchInput command={command} query={query} setQuery={setQuery} label="Search models" clearLabel="Clear" placeholder="Search" />;
    return command ? <Command>{input}<Command.List /></Command> : input;
  }
  try {
    act(() => root.render(<Example />));
    const input = container.querySelector<HTMLInputElement>("input")!;
    expect(input.type).toBe(command ? "text" : "search");
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Clear Search models"]')!;
    act(() => button.click());
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(container.querySelector("button")).toBeNull();
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it("clears with Escape without interrupting input method composition", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const setQuery = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(<ListSearchInput query="模型" setQuery={setQuery} label="Search" clearLabel="Clear" placeholder="Search" />));
    const input = container.querySelector("input")!;
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true })));
    expect(setQuery).not.toHaveBeenCalled();
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(setQuery).toHaveBeenCalledWith("");
  } finally {
    act(() => root.unmount());
  }
});
