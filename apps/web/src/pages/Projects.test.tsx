// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps, ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ locale: "en" }));
const projectWorkspaces = vi.hoisted(() => ({
  list: vi.fn(),
  capabilities: vi.fn(),
  conversationCapabilities: vi.fn(),
  groupCreationCapability: vi.fn(),
  get: vi.fn(),
  roster: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  removeEmpty: vi.fn(),
  createBot: vi.fn(),
  createGroup: vi.fn(),
}));
const rpcClient = vi.hoisted(() => ({ projectWorkspaces }));

vi.mock("../lib/rpc", () => ({
  rpc: rpcClient,
  rpcForSpace: () => rpcClient,
  createSpaceRpc: () => rpcClient,
  selectedSpaceId: () => "space-1",
}));
vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((acc, part, index) => `${acc}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return {
    useLingui: () => ({ t, i18n: { locale: state.locale } }),
    Trans: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock("./WindowChrome", () => ({ WindowChrome: () => null }));
vi.mock("./ProjectGroupCreation", () => ({ ProjectGroupCreation: () => null }));
vi.mock("./shell/create-bot-dialog", () => ({ CreateBotDialog: () => null }));
vi.mock("@rakazo/ui-web", () => {
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    AlertDialog: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
      open ? <div role="alertdialog">{children}</div> : null,
    AlertDialogAction: (props: ComponentProps<"button">) => <button type="button" {...props} />,
    AlertDialogCancel: (props: ComponentProps<"button">) => <button type="button" {...props} />,
    AlertDialogContent: Box,
    AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    AlertDialogFooter: Box,
    AlertDialogHeader: Box,
    AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    Button: (props: ComponentProps<"button">) => <button type="button" {...props} />,
    Input: (props: ComponentProps<"input">) => <input {...props} />,
  };
});

import { ProjectsPage } from "./Projects";

const sampleProject = {
  id: "project-1",
  name: "Alpha Project",
  locationType: null,
  connectionStatus: "unknown" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let queryClient: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.locale = "en";
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  projectWorkspaces.list.mockResolvedValue({ items: [sampleProject], nextCursor: null });
  projectWorkspaces.get.mockResolvedValue(sampleProject);
  projectWorkspaces.roster.mockResolvedValue({
    bots: [{ id: "bot-1", name: "Helper" }],
    groups: [],
    nextBotId: null,
    nextGroupId: null,
  });
  projectWorkspaces.conversationCapabilities.mockResolvedValue({ createBot: false });
  projectWorkspaces.groupCreationCapability.mockResolvedValue({ createGroup: false });
  projectWorkspaces.remove.mockResolvedValue({ ok: true });
  projectWorkspaces.removeEmpty.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderProjectDetail() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/app/projects/project-1"]}>
          <Routes>
            <Route path="/app/projects" element={<ProjectsPage />} />
            <Route path="/app/projects/:workspaceId" element={<ProjectsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    container,
    button(label: string) {
      return [...container.querySelectorAll("button")].find((item) => item.textContent === label);
    },
    async cleanup() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("ProjectsPage project removal", () => {
  it("uses projectWorkspaces.remove with explicit local-files assurance when capabilities.remove is true", async () => {
    projectWorkspaces.capabilities.mockResolvedValue({
      create: true,
      removeEmpty: true,
      remove: true,
    });
    const page = await renderProjectDetail();
    try {
      const trigger = page.button("Remove project");
      expect(trigger).toBeTruthy();
      expect(page.button("Remove empty project")).toBeUndefined();

      await act(async () => {
        trigger?.click();
      });

      const dialog = page.container.querySelector('[role="alertdialog"]');
      expect(dialog?.textContent).toContain("Remove project?");
      expect(dialog?.textContent).toContain("bots, group chats, and chat history in Sydney");
      expect(dialog?.textContent).toContain("Local files on your computer are not deleted.");

      const confirm = page.button("Remove");
      expect(confirm).toBeTruthy();
      await act(async () => {
        confirm?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(projectWorkspaces.remove).toHaveBeenCalledWith({
        id: "project-1",
        confirmRemoveAppData: true,
      });
      expect(projectWorkspaces.removeEmpty).not.toHaveBeenCalled();
    } finally {
      await page.cleanup();
    }
  });

  it.each([
    { label: "remove is false", caps: { create: true, removeEmpty: true, remove: false } },
    { label: "remove is omitted by an older backend", caps: { create: true, removeEmpty: true } },
  ])("falls back to projectWorkspaces.removeEmpty when $label", async ({ caps }) => {
    projectWorkspaces.capabilities.mockResolvedValue(caps);
    const page = await renderProjectDetail();
    try {
      const trigger = page.button("Remove empty project");
      expect(trigger).toBeTruthy();
      expect(page.button("Remove project")).toBeUndefined();

      await act(async () => {
        trigger?.click();
      });

      const dialog = page.container.querySelector('[role="alertdialog"]');
      expect(dialog?.textContent).toContain("Remove empty project?");
      expect(dialog?.textContent).toContain("files on your computer are not deleted.");

      const confirm = page.button("Remove");
      await act(async () => {
        confirm?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(projectWorkspaces.removeEmpty).toHaveBeenCalledWith({
        id: "project-1",
        confirmRemoveAppData: true,
      });
      expect(projectWorkspaces.remove).not.toHaveBeenCalled();
    } finally {
      await page.cleanup();
    }
  });

  it("hides removal controls when neither remove nor removeEmpty is enabled", async () => {
    projectWorkspaces.capabilities.mockResolvedValue({
      create: false,
      removeEmpty: false,
      remove: false,
    });
    const page = await renderProjectDetail();
    try {
      expect(page.button("Remove project")).toBeUndefined();
      expect(page.button("Remove empty project")).toBeUndefined();
    } finally {
      await page.cleanup();
    }
  });

  it("surfaces server conflict messages when projectWorkspaces.remove fails and supports Chinese copy", async () => {
    state.locale = "zh-CN";
    projectWorkspaces.capabilities.mockResolvedValue({
      create: true,
      removeEmpty: true,
      remove: true,
    });
    projectWorkspaces.remove.mockRejectedValueOnce(
      new Error("Project workspace deletion is already in progress"),
    );
    const page = await renderProjectDetail();
    try {
      const trigger = page.button("删除项目");
      expect(trigger).toBeTruthy();
      await act(async () => {
        trigger?.click();
      });
      const dialog = page.container.querySelector('[role="alertdialog"]');
      expect(dialog?.textContent).toContain("不会删除你电脑中的本地文件");

      await act(async () => {
        page.button("删除")?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const alert = dialog?.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Project workspace deletion is already in progress");
    } finally {
      await page.cleanup();
    }
  });
});
