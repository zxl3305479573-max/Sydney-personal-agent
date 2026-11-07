// @vitest-environment jsdom
import { CreateBotInput } from "@rakazo/contracts";
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

function mockBuiltInAvatarFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["avatar"], { type: "image/webp" }),
    })),
  );
  class TestFileReader {
    result = "data:image/webp;base64,avatar";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() {
      this.onload?.();
    }
  }
  vi.stubGlobal("FileReader", TestFileReader);
}

describe("CreateBotDialog", () => {
  it("creates a bot with a selected built-in avatar and no color controls", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia ??= (() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    mockBuiltInAvatarFetch();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const create = vi.fn(async (_input: CreateBotDialogInput) => undefined);
    await act(async () =>
      root.render(<CreateBotDialog onCancel={() => undefined} onCreate={create} />),
    );

    expect(document.querySelector('[data-testid="personality-custom"]')).toBeNull();
    expect(document.querySelector('[data-testid="personality-balanced"]')?.textContent).toContain("Balanced");
    expect(document.querySelector('[aria-label="Color #10B981"]')).toBeNull();
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[aria-label="橙花"]')!.click(),
    );
    await act(async () =>
      document.querySelector<HTMLButtonElement>('[data-testid="personality-concise"]')!.click(),
    );

    const input = document.querySelector<HTMLInputElement>('input[placeholder="Name your Bot"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "Scout",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      [...document.querySelectorAll("button")]
        .find((item) => item.textContent === "Create")!
        .click();
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0]).toMatchObject({
      name: "Scout",
      color: "data:image/webp;base64,avatar",
      avatarSet: "organic",
      instructions: expect.stringContaining("简洁高效"),
    });
    expect(CreateBotInput.parse(create.mock.calls[0]![0])).toMatchObject(create.mock.calls[0]![0]);
    await act(async () => root.unmount());
    container.remove();
  });
});
