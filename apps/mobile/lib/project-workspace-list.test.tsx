// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ProjectWorkspaceListProps } from "../components/project-workspace-list";
import { ProjectWorkspaceList } from "../components/project-workspace-list";

const controls = vi.hoisted(() => ({
  buttons: [] as Array<{
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean; disabled?: boolean };
    disabled?: boolean;
    onPress?: () => void;
    style?: (state: { pressed: boolean }) => { opacity: number };
  }>,
}));

vi.mock("react-native", () => {
  const wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    View: wrapper,
    Text: wrapper,
    ActivityIndicator: () => null,
    Pressable: (props: (typeof controls.buttons)[number] & { children?: ReactNode }) => {
      controls.buttons.push(props);
      return <div>{props.children}</div>;
    },
  };
});
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./native", () => ({
  native: { label: "black", secondaryLabel: "gray", fill: "white", fillPressed: "blue" },
  useResolvedAppearance: () => "light",
}));

const labels: ProjectWorkspaceListProps["labels"] = {
  loading: "Loading",
  error: "Failed",
  empty: "No workspaces",
  add: "Add",
  remove: "Remove",
  selected: "Selected",
  connectionStatus: {
    unknown: "Unknown",
    connecting: "Connecting",
    online: "Online",
    offline: "Offline",
    unauthorized: "Unauthorized",
    unavailable: "Unavailable",
  },
  selectWorkspace: (name, status) => `${name}, ${status}`,
  removeWorkspace: (name) => `Remove ${name}`,
};

const props: ProjectWorkspaceListProps = {
  state: {
    status: "ready",
    workspaces: [
      { id: "one", name: "Alpha", connectionStatus: "offline" },
      { id: "two", name: "Beta", connectionStatus: "online" },
    ],
  },
  selectedId: "one",
  labels,
  onSelect: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
};

beforeEach(() => {
  controls.buttons.length = 0;
  vi.clearAllMocks();
});

it("renders supplied statuses and selection and delegates each action", () => {
  const html = renderToStaticMarkup(<ProjectWorkspaceList {...props} />);
  expect(html).toContain("Alpha");
  expect(html).toContain("Offline");
  expect(html).toContain("Selected");
  expect(html).toContain("Online");
  expect(controls.buttons[0]?.accessibilityLabel).toBe("Alpha, Offline");
  expect(controls.buttons[0]?.accessibilityState?.selected).toBe(true);
  expect(controls.buttons[1]?.accessibilityLabel).toBe("Remove Alpha");
  expect(html).not.toContain("Remove Alpha");
  expect(controls.buttons[2]?.accessibilityState?.selected).toBe(false);
  controls.buttons[2]?.onPress?.();
  controls.buttons[1]?.onPress?.();
  controls.buttons[4]?.onPress?.();
  expect(props.onSelect).toHaveBeenCalledWith("two");
  expect(props.onRemove).toHaveBeenCalledWith("one");
  expect(props.onAdd).toHaveBeenCalledOnce();
});

it("shows loading, error and empty states without workspace actions", () => {
  for (const [state, text] of [
    [{ status: "loading" }, "Loading"],
    [{ status: "error" }, "Failed"],
    [{ status: "ready", workspaces: [] }, "No workspaces"],
  ] as const) {
    controls.buttons.length = 0;
    expect(renderToStaticMarkup(<ProjectWorkspaceList {...props} state={state} />)).toContain(text);
    expect(controls.buttons).toHaveLength(1);
  }
});

it("disables all actions while an operation is pending", () => {
  renderToStaticMarkup(<ProjectWorkspaceList {...props} pending />);
  expect(controls.buttons).toHaveLength(5);
  expect(controls.buttons.every((button) => button.disabled)).toBe(true);
  expect(controls.buttons.every((button) => button.accessibilityState?.disabled)).toBe(true);
  expect(controls.buttons.every((button) => button.style?.({ pressed: false }).opacity === 0.5)).toBe(
    true,
  );
});

it("shows press feedback for enabled actions", () => {
  renderToStaticMarkup(<ProjectWorkspaceList {...props} />);
  expect(controls.buttons.every((button) => button.style?.({ pressed: false }).opacity === 1)).toBe(
    true,
  );
  expect(controls.buttons.every((button) => button.style?.({ pressed: true }).opacity === 0.65)).toBe(
    true,
  );
});
