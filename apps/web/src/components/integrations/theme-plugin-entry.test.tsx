// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from "react";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: (strings: TemplateStringsArray) => strings.join("") }),
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} />,
}));

import { ThemePluginEntry } from "./theme-plugin-entry";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("opens the theme entry, changes the existing appearance, and returns", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  localStorage.removeItem("rakazo.uiAppearance");
  const container = document.createElement("div");
  const root = createRoot(container);
  function Host() {
    const [open, setOpen] = useState(false);
    return <ThemePluginEntry open={open} onOpenChange={setOpen} />;
  }
  try {
    await act(async () => root.render(<Host />));
    expect(container.querySelector('[data-testid="theme-plugin-entry"]')).not.toBeNull();
    await act(async () => container.querySelector("button")?.click());
    expect(container.textContent).toContain(
      "Theme plugin installation and layout changes are not available yet.",
    );
    const dark = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Dark",
    );
    await act(async () => dark?.click());
    expect(localStorage.getItem("rakazo.uiAppearance")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(dark?.getAttribute("aria-pressed")).toBe("true");
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Back"]')?.click(),
    );
    expect(container.querySelector('[data-testid="theme-plugin-entry"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    localStorage.removeItem("rakazo.uiAppearance");
  }
});
