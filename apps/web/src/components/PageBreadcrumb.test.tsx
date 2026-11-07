// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PageBreadcrumb } from "./PageBreadcrumb";

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray) =>
      ({ Artifacts: "产物" })[strings.join("")] ?? strings.join(""),
    i18n: {
      _: ({ id }: { id: string }) =>
        ({ Artifacts: "产物", "Access management": "访问管理" })[id] ?? id,
    },
  }),
}));

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function render(path: string, content = <PageBreadcrumb />) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  act(() => root.render(<MemoryRouter initialEntries={[path]}>{content}</MemoryRouter>));
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  };
  return container;
}

it("shows a translated mobile route label in the layout", () => {
  const container = render("/app/artifacts/123");
  const nav = container.querySelector("nav");
  expect(nav?.getAttribute("aria-label")).toBe("Sydney / 产物");
  expect(nav?.classList.contains("hidden")).toBe(false);
  expect(nav?.className).toContain("md:hidden");
});

it("does not overlay the chat or sidebar on mobile", () => {
  expect(render("/app/g/group-id").querySelector("nav")).toBeNull();
});

it("preserves already translated settings titles", () => {
  const container = render("/app", <PageBreadcrumb inline translated label="模型设置" />);
  expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Sydney / 模型设置");
});
