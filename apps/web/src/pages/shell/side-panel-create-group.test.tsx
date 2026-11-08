// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
}));
vi.mock("../GroupPanel", () => ({
  CreateGroupForm: ({ onCancel }: { onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>
      Cancel group
    </button>
  ),
  GroupSettings: () => null,
}));
vi.mock("../ResizableSidePanel", () => ({
  ResizableSidePanel: ({ open, children }: { open: boolean; children: ReactNode }) => (
    <div data-open={open}>{children}</div>
  ),
}));

import { ShellSidePanel } from "./side-panel";

it("opens group creation without an active chat and returns through cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const cancel = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    panel: "create-group",
    active: undefined,
    activeGroup: undefined,
    bots: [],
    onCancelCreateGroup: cancel,
  } as unknown as ComponentProps<typeof ShellSidePanel>;
  try {
    await act(async () => root.render(<ShellSidePanel {...props} />));
    expect(host.querySelector('[data-open="true"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(cancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
