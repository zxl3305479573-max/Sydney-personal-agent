// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { queryClient } from "../../lib/query";
import { ComputerMessageCard } from "./computer-message-card";

const env = vi.hoisted(() => ({ scope: "space-1", allowed: true, screen: vi.fn() }));
vi.mock("../../lib/query", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return {
    queryClient: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
    useSpaceQueries: () => ({
      me: {
        queryOptions: () => ({
          queryKey: [env.scope, "me", env.allowed],
          queryFn: async () => ({ featureAccess: { computer: env.allowed } }),
        }),
      },
      computer: {
        screenUrl: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: [env.scope, "computer/screenUrl", input],
            queryFn: () => env.screen(input),
          }),
        },
      },
    }),
  };
});
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children?: ReactNode }) => children,
  useLingui: () => ({
    t: (parts: TemplateStringsArray, ...values: unknown[]) => String.raw(parts, ...values),
  }),
}));
vi.mock("@rakazo/chat-ui/web", () => ({
  ChatMarkdown: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: ({ children, size: _size, ...props }: ComponentProps<"button"> & { size?: string }) => (
    <button {...props}>{children}</button>
  ),
}));

let root: Root;
let container: HTMLDivElement;
const onOpen = vi.fn();
const onTakeControl = vi.fn();
const defaults = {
  block: { kind: "computer" as const, state: "Live", text: "" },
  active: true,
  botId: "bot-1",
  onOpen,
  onTakeControl,
};
async function render(extra: Partial<ComponentProps<typeof ComputerMessageCard>> = {}) {
  await act(async () => {
    root.render(<ComputerMessageCard {...defaults} {...extra} />);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(env, { scope: "space-1", allowed: true });
  env.screen
    .mockReset()
    .mockResolvedValue({ url: "https://screen.example.test/embed?view_only=true" });
  onOpen.mockReset();
  onTakeControl.mockReset();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
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

it("embeds a read-only screen with distinct view and take-control actions", async () => {
  await render();
  expect(env.screen).toHaveBeenCalledWith({ botId: "bot-1", viewOnly: true });
  const frame = container.querySelector("iframe");
  expect(frame?.src).toBe("https://screen.example.test/embed?view_only=true");
  expect(frame?.tabIndex).toBe(-1);
  expect(frame?.className).toContain("pointer-events-none");
  expect(onTakeControl).not.toHaveBeenCalled();
  act(() =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Take control")
      ?.click(),
  );
  expect(onTakeControl).toHaveBeenCalledOnce();
  expect(onOpen).not.toHaveBeenCalled();
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-testid="computer-card-open"]')?.click(),
  );
  expect(onOpen).toHaveBeenCalledOnce();
});

it("unmounts a live stream when the task ends or the app goes into the background", async () => {
  await render();
  expect(container.querySelector("iframe")).not.toBeNull();
  await render({ active: false });
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("Done");
  await render();
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(container.querySelector("iframe")).toBeNull();
});

it("does not connect completed cards and hides controls after permission is revoked", async () => {
  await render({ active: false });
  expect(env.screen).not.toHaveBeenCalled();
  await render();
  env.allowed = false;
  await render();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("button")).toBeNull();
});

it("clears old Space content before the new request resolves", async () => {
  await render();
  env.scope = "space-2";
  env.screen.mockReturnValue(new Promise(() => undefined));
  await render();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("Loading live desktop");
});

it("shows an actionable fallback for failed or unavailable preview connections", async () => {
  env.screen.mockRejectedValueOnce(new Error("access revoked"));
  await render();
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("Preview unavailable");
  env.scope = "space-2";
  env.screen.mockResolvedValue({ url: null });
  await render();
  expect(container.textContent).toContain("Preview unavailable");
});

it("only accepts connection reports from its own frame", async () => {
  await render();
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", { data: { rakazoScreen: "failed" }, source: window }),
    ),
  );
  expect(container.querySelector("iframe")).not.toBeNull();
  const frame = container.querySelector("iframe");
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { rakazoScreen: "failed" },
        source: frame?.contentWindow,
      }),
    ),
  );
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toContain("Preview unavailable");
});
