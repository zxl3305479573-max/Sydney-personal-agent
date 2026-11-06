// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

import { AvatarStudioPopover } from "./avatar-studio-popover";

it("shows the three built-in avatars without a color editor", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const changed = vi.fn();
  await act(async () => root.render(<AvatarStudioPopover value="#8B5CF6" onChange={changed} />));
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-label="Customize bot avatar"]')!.click(),
  );

  expect(document.querySelector('[aria-label="Color #10B981"]')).toBeNull();
  expect(document.querySelector('[aria-label="紫晶"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="橙花"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="蓝羽"]')).not.toBeNull();

  await act(async () => root.unmount());
  container.remove();
});
