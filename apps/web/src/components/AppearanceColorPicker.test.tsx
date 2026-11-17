// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AppearanceColorPicker, colorContrast } from "./AppearanceColorPicker";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("calculates color contrast", () => {
  expect(colorContrast("#000000", "#ffffff")).toBeCloseTo(21);
  expect(colorContrast("#000000", "#000000")).toBeCloseTo(1);
});

it("applies a preset and rejects incomplete HEX input", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Example() {
    const [value, setValue] = useState("#000000");
    return (
      <AppearanceColorPicker
        label="背景"
        value={value}
        onChange={setValue}
        contrastWith="#ffffff"
      />
    );
  }
  try {
    await act(async () => root.render(<Example />));
    const trigger = container.querySelector<HTMLButtonElement>(
      'button[aria-label="背景：#000000"]',
    )!;
    await act(async () => trigger.click());
    const positioner = document.querySelector('[data-slot="popover-content"]')?.parentElement;
    expect(positioner?.getAttribute("data-side")).toBe("bottom");
    const white = document.querySelector<HTMLButtonElement>('button[aria-label="选择 #FFFFFF"]')!;
    expect(white).toBeTruthy();
    await act(async () => white.click());
    expect(trigger.getAttribute("aria-label")).toBe("背景：#FFFFFF");
    const hex = document.querySelector<HTMLInputElement>('input[aria-label="背景 HEX"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(hex, "#12");
      hex.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(hex.getAttribute("aria-invalid")).toBe("true");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("六位 HEX");
    expect(trigger.getAttribute("aria-label")).toBe("背景：#FFFFFF");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
