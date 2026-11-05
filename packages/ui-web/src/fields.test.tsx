// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SwitchField } from "./components/ui/field.js";
import { Input, InputRevealLabelsProvider, TextField } from "./components/ui/input.js";

const mounted: Array<() => void> = [];

afterEach(() => {
  for (const unmount of mounted.splice(0)) unmount();
  vi.unstubAllGlobals();
});

function render(node: ReactNode) {
  return renderRoot(node).container;
}

function renderRoot(node: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return { container, root };
}

function revealField(container: HTMLElement) {
  const input = container.querySelector("input");
  const button = container.querySelector("button");
  if (!input || !button) throw new Error("Missing the password field or its reveal button");
  return { input, button };
}

describe("Input with a hidden value", () => {
  it("styles the input itself and names its one reveal button in the caller's language", () => {
    const html = renderToString(
      <InputRevealLabelsProvider show="Passwort anzeigen" hide="Passwort verbergen">
        <Input type="password" className="mt-2 h-12" />
      </InputRevealLabelsProvider>,
    );
    const wrapper = html.match(/<div data-slot="input-reveal" class="([^"]*)"/)?.[1] ?? "";
    const input = html.match(/<input[^>]*class="([^"]*)"/)?.[1] ?? "";

    expect(wrapper).not.toContain("h-12");
    expect(input).toContain("h-12");
    expect(input).toContain("mt-2");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Passwort anzeigen"');
  });

  it("shows and hides the value without changing it", () => {
    const container = render(
      <InputRevealLabelsProvider show="Passwort anzeigen" hide="Passwort verbergen">
        <Input type="password" defaultValue="correct horse" />
      </InputRevealLabelsProvider>,
    );
    const { input, button } = revealField(container);
    expect(input.type).toBe("password");
    expect(button.getAttribute("aria-label")).toBe("Passwort anzeigen");

    act(() => button.click());
    expect(input.type).toBe("text");
    expect(input.value).toBe("correct horse");
    expect(button.getAttribute("aria-label")).toBe("Passwort verbergen");

    act(() => button.click());
    expect(input.type).toBe("password");
    expect(input.value).toBe("correct horse");
    expect(button.getAttribute("aria-label")).toBe("Passwort anzeigen");
  });

  it("hides a revealed value when the field is disabled, and keeps it hidden after", () => {
    const { container, root } = renderRoot(<Input type="password" defaultValue="correct horse" />);
    const { input, button } = revealField(container);
    act(() => button.click());
    expect(input.type).toBe("text");

    act(() => root.render(<Input type="password" disabled defaultValue="correct horse" />));
    expect(input.type).toBe("password");

    act(() => root.render(<Input type="password" defaultValue="correct horse" />));
    expect(input.type).toBe("password");
    expect(button.getAttribute("aria-label")).toBe("Show password");
  });

  it("does not reveal a disabled field", () => {
    const container = render(<Input type="password" disabled defaultValue="correct horse" />);
    const { input, button } = revealField(container);

    act(() => button.click());
    expect(input.type).toBe("password");
  });
});

describe("TextField", () => {
  it("connects the label, description, error and existing descriptions to the input", () => {
    const container = render(
      <TextField
        id="account-name"
        name="accountName"
        label="Name"
        description="Your display name."
        error="Enter a valid name."
        aria-describedby="external-note"
        defaultValue="Sydney"
      />,
    );
    const input = container.querySelector<HTMLInputElement>("input");
    expect(container.querySelector("label")?.htmlFor).toBe("account-name");
    expect(input?.name).toBe("accountName");
    expect(input?.value).toBe("Sydney");
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    expect(input?.getAttribute("aria-describedby")).toBe(
      "external-note account-name-description account-name-error",
    );
    expect(container.querySelector('[role="alert"]')?.id).toBe("account-name-error");
  });

  it("removes the error state when validation succeeds", () => {
    const { container, root } = renderRoot(<TextField label="Name" error="Invalid" />);
    act(() => root.render(<TextField label="Name" description="Ready" />));
    const input = container.querySelector("input");
    expect(input?.getAttribute("aria-invalid")).not.toBe("true");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(input?.getAttribute("aria-describedby")).toBe(
      container.querySelector('[data-slot="field-description"]')?.id,
    );
  });
});

describe("SwitchField", () => {
  it("names the switch from its label in server-rendered markup", () => {
    const html = renderToString(
      <SwitchField label="Stream replies" checked={false} onCheckedChange={() => {}} />,
    );
    const labelledBy = html.match(/role="switch"[^>]*aria-labelledby="([^"]+)"/)?.[1];

    expect(labelledBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${labelledBy}"[^>]*>Stream replies<`));
  });

  it("describes the switch with its note", () => {
    const html = renderToString(
      <SwitchField
        label="Stream replies"
        description="Show text as it arrives."
        checked
        onCheckedChange={() => {}}
      />,
    );
    const describedBy = html.match(/aria-describedby="([^"]+)"/)?.[1];

    expect(describedBy).toBeTruthy();
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("dims its label with the switch when disabled", () => {
    const html = renderToString(
      <SwitchField label="Stream replies" checked={false} disabled onCheckedChange={() => {}} />,
    );

    expect(html).toMatch(/data-slot="field"[^>]*data-disabled="true"/);
  });

  it("leaves the switch undescribed without a note", () => {
    const html = renderToString(
      <SwitchField label="Stream replies" checked={false} onCheckedChange={() => {}} />,
    );

    expect(html).not.toContain("aria-describedby");
  });
});
