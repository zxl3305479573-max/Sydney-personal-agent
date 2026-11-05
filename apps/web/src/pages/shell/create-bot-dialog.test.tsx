// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { CreateBotDialogInput } from "./create-bot-dialog";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
import { CreateBotDialog } from "./create-bot-dialog";

describe("CreateBotDialog", () => {
  it("creates a fluid avatar with the selected color and retains its separate chat color", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const canvas = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const create = vi.fn(async (_input: CreateBotDialogInput) => undefined);
    await act(async () => root.render(<CreateBotDialog onCancel={() => undefined} onCreate={create} />));
    const buttons = () => [...document.querySelectorAll("button")];
    expect(buttons().some((button) => button.textContent === "Original" || button.textContent === "Rakazo")).toBe(false);
    await act(async () => buttons().find((button) => button.getAttribute("aria-label") === "Color #10B981")!.click());
    const input = document.querySelector<HTMLInputElement>('input[placeholder="Name your Bot"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Scout");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => buttons().find((button) => button.textContent === "Create")!.click());
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0]).toMatchObject({ name: "Scout", avatarSet: "fluid" });
    expect(create.mock.calls[0]![0].color).toMatch(/^#[0-9a-f]{6}::fluid_#10B981$/i);
    await act(async () => root.unmount());
    container.remove();
    canvas.mockRestore();
  });
});
