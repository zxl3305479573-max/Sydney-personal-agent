// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComputerCard } from "../components/ComputerCard";
import { queryClient } from "./query";

const env = vi.hoisted(() => ({
  scope: "space-1",
  foreground: true,
  focused: true,
  allowed: true,
  readOnly: false,
  load: vi.fn(),
}));
vi.mock("./query", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    rpcQuery: (path: string, input: unknown) => ({
      queryKey: [env.scope, path, input],
      queryFn: () => env.load(path, input),
    }),
  };
});
vi.mock("react-native", () => ({
  View: ({ children, testID }: { children?: ReactNode; testID?: string }) => (
    <div data-testid={testID}>{children}</div>
  ),
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (style: unknown) => style, hairlineWidth: 0.5 },
  useWindowDimensions: () => ({ width: 390 }),
}));
vi.mock("react-native-webview", () => ({
  WebView: (props: { source: { uri: string }; pointerEvents: string; onError: () => void }) => (
    <div
      data-testid="live-screen"
      data-src={props.source.uri}
      data-pointer-events={props.pointerEvents}
    >
      <button type="button" onClick={props.onError}>
        Fail screen
      </button>
    </div>
  ),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: () => (() => void) | undefined) =>
    useEffect(() => (env.focused ? callback() : undefined), [callback, env.focused]),
}));
vi.mock("@rakazo/chat-ui/native", () => ({
  ChatMarkdown: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("./api", () => ({ currentApiBase: () => "https://api.example.test" }));
vi.mock("./app-foreground", () => ({ useAppForeground: () => env.foreground }));
vi.mock("./feature-access", () => ({ useFeatureAccess: () => ({ computer: env.allowed }) }));
vi.mock("./thread-read-only", () => ({ useThreadReadOnly: () => env.readOnly }));
vi.mock("./native", () => ({
  useMobileTokens: () => ({ foreground: "black", mutedForeground: "gray" }),
  useResolvedAppearance: () => "light",
}));
vi.mock("./i18n", () => ({
  t: (text: string) => text,
  useI18n: () => ({ t: (text: string) => text }),
}));
vi.mock("../components/glass-surface", () => ({
  GlassSurface: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/native-action-button", () => ({
  NativeActionButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

let root: Root;
let container: HTMLDivElement;
const onOpen = vi.fn();
const onTakeControl = vi.fn();
const props = {
  block: { kind: "computer" as const, state: "Live", text: "" },
  botId: "bot-1",
  active: true,
  onOpen,
  onTakeControl,
};
async function render(extra: Partial<ComponentProps<typeof ComputerCard>> = {}) {
  await act(async () => {
    root.render(<ComputerCard {...props} {...extra} />);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(env, {
    scope: "space-1",
    foreground: true,
    focused: true,
    allowed: true,
    readOnly: false,
  });
  env.load
    .mockReset()
    .mockResolvedValue({ url: "https://screen.example.test/embed?view_only=true" });
  onOpen.mockReset();
  onTakeControl.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("requests a read-only live screen and only takes control after a button press", async () => {
  await render();
  expect(env.load).toHaveBeenCalledWith("computer/screenUrl", { botId: "bot-1", viewOnly: true });
  expect(
    container.querySelector('[data-testid="live-screen"]')?.getAttribute("data-pointer-events"),
  ).toBe("none");
  expect(onOpen).not.toHaveBeenCalled();
  expect(onTakeControl).not.toHaveBeenCalled();
  act(() =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Take control")
      ?.click(),
  );
  expect(onTakeControl).toHaveBeenCalledOnce();
  act(() =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Open computer")
      ?.click(),
  );
  expect(onOpen).toHaveBeenCalledOnce();
});

it.each(["inactive", "background", "unfocused", "forbidden", "readOnly"])(
  "does not connect a %s card",
  async (state) => {
    if (state === "background") env.foreground = false;
    if (state === "unfocused") env.focused = false;
    if (state === "forbidden") env.allowed = false;
    if (state === "readOnly") env.readOnly = true;
    await render({ active: state !== "inactive" });
    expect(env.load).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="live-screen"]')).toBeNull();
    if (state === "inactive") expect(container.textContent).toContain("Done");
  },
);

it("removes an existing screen when the run ends or permission is revoked", async () => {
  await render();
  expect(container.querySelector('[data-testid="live-screen"]')).not.toBeNull();
  await render({ active: false });
  expect(container.querySelector('[data-testid="live-screen"]')).toBeNull();
  await render();
  env.allowed = false;
  await render();
  expect(container.querySelector('[data-testid="live-screen"]')).toBeNull();
  expect(container.textContent).not.toContain("Take control");
});

it("shows a reconnect action after a transport failure or unavailable screen", async () => {
  env.load.mockRejectedValueOnce(new Error("forbidden"));
  await render();
  expect(container.textContent).toContain("Preview unavailable");
  expect(container.querySelector('[data-testid="live-screen"]')).toBeNull();
  env.scope = "space-2";
  env.load.mockResolvedValue({ url: null });
  await render();
  expect(container.textContent).toContain("Preview unavailable");
});

it("clears the prior Space's frame before a new scope's response arrives", async () => {
  await render();
  env.scope = "space-2";
  env.load.mockReturnValue(new Promise(() => undefined));
  await render();
  expect(container.querySelector('[data-testid="live-screen"]')).toBeNull();
});
