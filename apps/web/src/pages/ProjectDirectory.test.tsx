// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ButtonHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  space: "space-a",
  capability: vi.fn(),
  directory: vi.fn(),
  choose: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@lingui/react/macro", () => ({ useLingui: () => ({ i18n: { locale: "zh-CN" } }) }));
vi.mock("@rakazo/ui-web", () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" {...props} />,
}));
vi.mock("../lib/desktop", () => ({
  desktopBridge: () => ({ projectDirectory: { choose: runtime.choose } }),
}));
vi.mock("../lib/rpc", () => ({
  selectedSpaceId: () => runtime.space,
  createSpaceRpc: () => ({ projectWorkspaces: { unbindDirectory: runtime.remove } }),
}));
vi.mock("../lib/query", () => ({
  useSpaceQueries: () => ({
    projectWorkspaces: {
      directoryCapability: {
        queryOptions: () => ({
          queryKey: [runtime.space, "capability"],
          queryFn: () => runtime.capability(),
        }),
      },
      directory: {
        queryOptions: ({ input }: { input: { id: string } }) => ({
          queryKey: [runtime.space, "directory", input.id],
          queryFn: () => runtime.directory(input),
        }),
      },
    },
  }),
}));

import { ProjectDirectory } from "./ProjectDirectory";

describe("desktop project folder controls", () => {
  let root: Root;
  let container: HTMLDivElement;
  let client: QueryClient;
  const binding = {
    deviceId: "device-a",
    grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
    directoryName: "example",
    intent: "read-only",
  };
  const empty = { binding: null, deviceName: null, status: "unknown" };
  const render = async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ProjectDirectory key={runtime.space} projectId="project-a" spaceId={runtime.space} />
        </QueryClientProvider>,
      ),
    );
    await act(async () => {
      await vi.waitFor(() => expect(container.textContent).not.toContain("正在读取"));
    });
  };
  const click = async (label: string) =>
    act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === label)!
        .click();
    });
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.space = "space-a";
    runtime.capability.mockReset().mockResolvedValue({ localDevice: true });
    runtime.directory.mockReset().mockResolvedValue(empty);
    runtime.choose.mockReset().mockResolvedValue(binding);
    runtime.remove.mockReset().mockResolvedValue({ removed: true, localRevocation: "confirmed" });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    vi.unstubAllGlobals();
  });
  it("selects with only project and Space identifiers", async () => {
    await render();
    await click("选择本机目录");
    expect(runtime.choose).toHaveBeenCalledWith({ projectId: "project-a", spaceId: "space-a" });
  });
  it("keeps closed server capabilities away from the directory query", async () => {
    runtime.capability.mockResolvedValue({ localDevice: false });
    await render();
    expect(container.textContent).toContain("尚未开放");
    expect(runtime.directory).not.toHaveBeenCalled();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
  it.each(["online", "offline", "unauthorized", "unavailable"])(
    "shows a real %s directory status",
    async (status) => {
      runtime.directory.mockResolvedValue({ binding, deviceName: "Example computer", status });
      await render();
      expect(container.textContent).toContain("Example computer · example");
      expect(container.textContent).not.toContain("尚未连接项目目录");
      expect(container.textContent).toContain("撤销目录绑定");
    },
  );
  it("shows pending local revocation without claiming it succeeded", async () => {
    runtime.directory.mockResolvedValue({
      binding,
      deviceName: "Example computer",
      status: "offline",
    });
    runtime.remove.mockResolvedValue({ removed: true, localRevocation: "pending" });
    await render();
    await click("撤销目录绑定");
    expect(runtime.remove).toHaveBeenCalledWith({ id: "project-a", grantId: binding.grantId });
    expect(container.textContent).toContain("本机授权撤销未确认");
  });
  it("does not start a chooser after the Space selection changes", async () => {
    await render();
    runtime.space = "space-b";
    await click("选择本机目录");
    expect(runtime.choose).not.toHaveBeenCalled();
  });
});
