// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SegmentedControl } from "./segmented-control.js";

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root && host) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

function render(value: string, onValueChange: (next: string) => void) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <SegmentedControl
        label="View"
        value={value}
        onValueChange={onValueChange}
        options={[
          { value: "day", label: "Day" },
          { value: "week", label: "Week" },
          { value: "month", label: "Month" },
        ]}
      />,
    ),
  );
  return host;
}

it("marks one selection and keeps only it in the tab order", () => {
  const container = render("week", vi.fn());
  const items = [...container.querySelectorAll<HTMLButtonElement>("button")];
  expect(items.map((item) => item.getAttribute("aria-pressed"))).toEqual([
    "false",
    "true",
    "false",
  ]);
  expect(items.map((item) => item.tabIndex)).toEqual([-1, 0, -1]);
  expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  expect(container.querySelector("fieldset")?.getAttribute("aria-label")).toBe("View");
});

it("chooses a segment on click", () => {
  const onValueChange = vi.fn();
  const container = render("day", onValueChange);
  act(() => container.querySelectorAll("button")[2]?.click());
  expect(onValueChange).toHaveBeenCalledWith("month");
});

it("wraps arrow keys and handles Home and End", () => {
  let value = "day";
  const onValueChange = vi.fn((next: string) => {
    value = next;
    act(() =>
      root?.render(
        <SegmentedControl
          label="View"
          value={value}
          onValueChange={onValueChange}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />,
      ),
    );
  });
  const container = render(value, onValueChange);
  const group = container.querySelector<HTMLElement>("fieldset");
  if (!group) throw new Error("Missing group");
  const key = (name: string) =>
    act(() => group.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })));
  key("ArrowLeft");
  expect(onValueChange).toHaveBeenLastCalledWith("month");
  key("Home");
  expect(onValueChange).toHaveBeenLastCalledWith("day");
  key("End");
  expect(onValueChange).toHaveBeenLastCalledWith("month");
  key("ArrowRight");
  expect(onValueChange).toHaveBeenLastCalledWith("day");
  key("ArrowRight");
  expect(onValueChange).toHaveBeenLastCalledWith("week");
});
