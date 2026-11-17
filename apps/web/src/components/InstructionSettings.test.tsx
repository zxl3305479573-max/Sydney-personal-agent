// @vitest-environment jsdom
import type { Bot } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ restoreInstructions: vi.fn(), update: vi.fn() }));
vi.mock("../lib/rpc", () => ({ rpc: { bots: api } }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
}));
vi.mock("./PersonalPersonalityLibrary", () => ({
  PersonalPersonalityLibrary: ({
    onApply,
  }: {
    onApply: (instructions: string, name: string) => void;
  }) => (
    <button type="button" onClick={() => onApply("使用温暖的语气", "温暖")}>
      Apply custom
    </button>
  ),
}));

import { splitPersonalityInstructions } from "../lib/personality-library";
import { InstructionSettings } from "./InstructionSettings";

it("keeps history behind its label action and restores with the current baseline", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const bot = {
    id: "fixture",
    instructions: "Current",
    instructionHistory: [
      {
        id: "version",
        instructions: "Earlier",
        createdAt: "2026-10-01T00:00:00Z",
        reason: "Manual edit",
      },
    ],
  } as Bot;
  api.restoreInstructions.mockResolvedValue({ ...bot, instructions: "Earlier" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<InstructionSettings bot={bot} />));
    expect(document.body.textContent).not.toContain("Manual edit");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Instruction history"]')!.click(),
    );
    expect(document.body.textContent).toContain("Manual edit");
    await act(async () =>
      [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent === "Restore")!
        .click(),
    );
    expect(api.restoreInstructions).toHaveBeenCalledWith({
      botId: "fixture",
      versionId: "version",
      expectedInstructions: "Current",
    });
    expect(host.querySelector("textarea")?.value).toBe("Earlier");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

it("preserves duties while switching built-in and custom personalities", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const bot = { id: "fixture", instructions: "负责审核合同" } as Bot;
  api.update.mockImplementation(async (input: { instructions: string }) => ({
    ...bot,
    instructions: input.instructions,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<InstructionSettings bot={bot} />));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[data-testid="personality-friendly"]')!.click(),
    );
    const first = api.update.mock.lastCall?.[0];
    expect(first.expectedInstructions).toBe(bot.instructions);
    expect(splitPersonalityInstructions(first.instructions).duties).toBe(bot.instructions);
    expect(host.querySelector("textarea")?.value).toBe(bot.instructions);
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Apply custom")!
        .click(),
    );
    const second = api.update.mock.lastCall?.[0];
    expect(second.expectedInstructions).toBe(first.instructions);
    expect(splitPersonalityInstructions(second.instructions)).toEqual({
      duties: bot.instructions,
      personality: "使用温暖的语气",
    });
    const textarea = host.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        textarea,
        "负责审核发票",
      );
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    const third = api.update.mock.lastCall?.[0];
    expect(third.expectedInstructions).toBe(second.instructions);
    expect(splitPersonalityInstructions(third.instructions)).toEqual({
      duties: "负责审核发票",
      personality: "使用温暖的语气",
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
