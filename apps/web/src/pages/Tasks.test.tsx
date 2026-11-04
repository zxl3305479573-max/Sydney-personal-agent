// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  bots: { list: vi.fn() },
  tasks: { list: vi.fn(), inspect: vi.fn(), dispatch: vi.fn() },
}));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.mock("../lib/rpc", () => ({ rpc: api, selectedSpaceId: () => "space" }));
vi.mock("./WindowChrome", () => ({ WindowChrome: () => null }));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => text + part + String(values[index] ?? ""), "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@rakazo/ui-web", () => ({
  Button: ({ variant: _variant, ...props }: ComponentProps<"button"> & { variant?: string }) => (
    <button {...props} />
  ),
  Input: (props: ComponentProps<"input">) => <input {...props} />,
  Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

import { TasksPage, taskGrants } from "./Tasks";

const task = {
  id: "task",
  botId: "bot",
  threadId: "thread",
  prompt: "Summarize a public page",
  status: "queued",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  execution: {
    format: 1,
    version: 0,
    currentRunId: null,
    control: { intent: "continue", quiesced: true },
    completionEvidence: null,
    budget: {
      maxRuns: 3,
      maxToolCalls: 30,
      maxModelCalls: 8,
      maxReservedTokens: 100000,
      timeoutMs: 900000,
    },
    deadline: null,
    modelCalls: 0,
    reservedTokens: 0,
    toolCalls: [],
  },
};
const input = {
  taskId: "task",
  botId: "bot",
  pageUrl: "https://example.org/page#part",
  read: true,
  write: true,
  desktop: false,
  memory: false,
  ask: true,
};

it("builds explicit task, workspace, and exact URL grants", () => {
  expect(taskGrants(input)).toEqual([
    { tool: "read_file", action: "execute", resource: "workspace" },
    { tool: "list_files", action: "execute", resource: "workspace" },
    { tool: "write_file", action: "execute", resource: "workspace" },
    { tool: "web_fetch", action: "execute", resource: "https://example.org/page" },
    { tool: "ask_user", action: "execute", resource: "task:task" },
  ]);
  expect(taskGrants({ ...input, pageUrl: "", desktop: true, memory: true })).toContainEqual({
    tool: "shell",
    action: "execute",
    resource: "computer:bot",
  });
});

it.each(["http://example.org", "https://user:pass@example.org"])(
  "refuses an unsafe URL %s",
  (pageUrl) => {
    expect(() => taskGrants({ ...input, pageUrl })).toThrow();
  },
);

it("does not dispatch until model data sharing is explicitly accepted", async () => {
  api.bots.list.mockResolvedValue([{ id: "bot", name: "Agent" }]);
  api.tasks.list.mockResolvedValue([task]);
  api.tasks.inspect.mockResolvedValue({
    task,
    state: "queued",
    reason: null,
    runs: [],
    unresolvedEffects: [],
    pendingEffects: [],
    historyComplete: true,
  });
  api.tasks.dispatch.mockResolvedValue({ runId: "run", reused: false });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TasksPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await act(async () => {
    for (let rounds = 0; rounds < 10; rounds += 1) {
      if (container.textContent?.includes("Summarize a public page")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
  await act(async () => {
    const selected = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Summarize a public page"),
    );
    selected?.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await act(async () => {
    for (let rounds = 0; rounds < 10; rounds += 1) {
      if (container.textContent?.includes("Authorize execution")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  });
  const detailsShown = container.textContent?.includes("Authorize execution");
  expect(detailsShown).toBe(true);
  const start = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Start with these permissions"),
  );
  expect(start?.disabled).toBe(true);
  const consent = [...container.querySelectorAll("label")]
    .find((label) => label.textContent?.includes("configured model"))
    ?.querySelector("input");
  await act(async () => {
    consent?.click();
  });
  expect(start?.disabled).toBe(false);
  await act(async () => {
    start?.click();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  expect(api.tasks.dispatch).toHaveBeenCalledOnce();
  expect(api.tasks.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      taskId: "task",
      expectedVersion: 0,
      modelDataConsent: true,
      scopes: expect.arrayContaining([
        { tool: "write_file", action: "execute", resource: "workspace" },
      ]),
    }),
  );
  await act(async () => root.unmount());
  client.clear();
  container.remove();
});
