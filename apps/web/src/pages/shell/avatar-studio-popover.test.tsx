// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children: ReactNode }) => children }));
import { AvatarStudioPopover } from "./avatar-studio-popover";

it("converts an old shape to a fluid avatar without changing its chat color", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const changed = vi.fn();
  await act(async () => root.render(<AvatarStudioPopover value="#8B5CF6::shape_2" avatarSet="organic" onChange={changed} />));
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === label)!;
  await act(async () => button("Customize bot avatar").click());
  expect([...document.querySelectorAll("button")].some((item) => item.textContent === "Original" || item.textContent === "Rakazo")).toBe(false);
  await act(async () => button("Color #10B981").click());
  expect(changed).toHaveBeenCalledWith("#8B5CF6::fluid_#10B981", "fluid");
  await act(async () => root.unmount());
  container.remove();
  canvas.mockRestore();
});
