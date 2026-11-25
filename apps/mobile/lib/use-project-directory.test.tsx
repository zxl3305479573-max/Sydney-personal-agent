// @vitest-environment jsdom
import type { EffectCallback } from "react";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  scope: "account-a",
  focused: true,
  pending: false,
  capture: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (callback: EffectCallback) =>
    useEffect(() => (runtime.focused ? callback() : undefined), [callback, runtime.focused]),
}));
vi.mock("./project-scope", () => ({ projectScopeKey: () => runtime.scope }));
vi.mock("./api", () => ({
  captureApiRequestContext: runtime.capture,
  isSpaceSelectionPending: () => runtime.pending,
  rpc: runtime.rpc,
}));

import { queryClient } from "./query-client";
import { useProjectDirectory } from "./use-project-directory";

describe("mobile project directory status", () => {
  let root: Root;
  let state: ReturnType<typeof useProjectDirectory>;
  let enabled: boolean;
  const context = {
    apiBase: "https://server.example",
    headers: { "x-rakazo-space-id": "space-a" },
  };
  const binding = {
    deviceId: "device-a",
    grantId: "746acaf1-0a4f-477d-822d-7357e7e8fe72",
    directoryName: "example",
    intent: "read-only",
  };
  const snapshot = { binding, deviceName: "Example computer", status: "online" };
  function Probe() {
    state = useProjectDirectory("project-a", runtime.scope, enabled);
    return null;
  }
  const render = () => act(async () => root.render(<Probe key={runtime.scope} />));
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    runtime.scope = "account-a";
    runtime.focused = true;
    runtime.pending = false;
    enabled = true;
    runtime.capture.mockReset().mockResolvedValue(context);
    runtime.rpc
      .mockReset()
      .mockImplementation(async (procedure: string) =>
        procedure.endsWith("directoryCapability")
          ? { localDevice: true }
          : procedure.endsWith("unbindDirectory")
            ? { removed: true, localRevocation: "confirmed" }
            : snapshot,
      );
    root = createRoot(document.createElement("div"));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it("loads the project status using one captured account and Space context", async () => {
    await render();
    expect(state.snapshot).toEqual(snapshot);
    expect(runtime.rpc).toHaveBeenCalledWith(
      "projectWorkspaces/directory",
      { id: "project-a" },
      expect.objectContaining({
        requestContext: context,
        signal: expect.any(AbortSignal),
        skipSpaceAuthRecovery: true,
      }),
    );
  });
  it("restores the directory before a new status read finishes on re-entry", async () => {
    await render();
    await act(async () => root.render(null));
    let finish!: (value: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    expect(state.snapshot).toEqual(snapshot);
    expect(state.available).toBe(true);
    expect(state.loading).toBe(false);
    await act(async () => finish({ localDevice: false }));
    expect(state.snapshot).toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(state.snapshot).toEqual(snapshot);
  });
  it("does not query the binding when the server capability is closed", async () => {
    runtime.rpc.mockResolvedValue({ localDevice: false });
    await render();
    expect(state.available).toBe(false);
    expect(state.snapshot).toBeNull();
    expect(runtime.rpc).toHaveBeenCalledOnce();
  });
  it("clears the saved binding if the server denies a reopened directory", async () => {
    await render();
    await act(async () => root.render(null));
    runtime.rpc.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));
    await render();
    expect(state.snapshot).toBeNull();
    expect(state.available).toBe(false);
    expect(state.failed).toBe(true);
  });
  it.each(["disabled", "pending", "unfocused"])(
    "does not query a %s project scope",
    async (reason) => {
      enabled = reason !== "disabled";
      runtime.pending = reason === "pending";
      runtime.focused = reason !== "unfocused";
      await render();
      expect(runtime.rpc).not.toHaveBeenCalled();
    },
  );
  it("drops old account results and aborts the old status request", async () => {
    let finish!: (result: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    const signal = runtime.rpc.mock.calls[0]?.[2].signal as AbortSignal;
    runtime.scope = "account-b";
    await render();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ localDevice: false }));
    expect(state.snapshot).toEqual(snapshot);
    expect(state.available).toBe(true);
  });
  it("shows failures and recovers on explicit refresh", async () => {
    runtime.capture.mockRejectedValueOnce(new Error("offline"));
    await render();
    expect(state.failed).toBe(true);
    await act(async () => state.refresh());
    expect(state.failed).toBe(false);
    expect(state.snapshot).toEqual(snapshot);
  });
  it.each(["confirmed", "pending"])(
    "preserves the server's %s revocation result",
    async (localRevocation) => {
      runtime.rpc.mockImplementation(async (procedure: string) =>
        procedure.endsWith("directoryCapability")
          ? { localDevice: true }
          : procedure.endsWith("unbindDirectory")
            ? { removed: true, localRevocation }
            : snapshot,
      );
      await render();
      await act(async () => state.remove());
      expect(state.revocation).toBe(localRevocation);
      expect(runtime.rpc).toHaveBeenCalledWith(
        "projectWorkspaces/unbindDirectory",
        { id: "project-a", grantId: binding.grantId },
        expect.objectContaining({ requestContext: context, skipSpaceAuthRecovery: true }),
      );
    },
  );
  it("refuses revocation after the active Space starts changing", async () => {
    await render();
    runtime.pending = true;
    await act(async () => state.remove());
    expect(
      runtime.rpc.mock.calls.some(([procedure]) => String(procedure).endsWith("unbindDirectory")),
    ).toBe(false);
  });
  it("ends status work when the page loses focus", async () => {
    await render();
    const signal = runtime.rpc.mock.calls[1]?.[2].signal as AbortSignal;
    runtime.focused = false;
    await render();
    expect(signal.aborted).toBe(true);
    await act(async () => state.refresh());
    expect(runtime.rpc).toHaveBeenCalledTimes(2);
  });
  it("clears a pending revocation indicator after leaving and refocusing the same project", async () => {
    await render();
    let finish!: (result: unknown) => void;
    runtime.rpc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let removing!: Promise<void>;
    await act(async () => {
      removing = state.remove();
    });
    expect(state.working).toBe(true);
    runtime.focused = false;
    await render();
    runtime.focused = true;
    await render();
    await act(async () => {
      finish({ removed: true, localRevocation: "confirmed" });
      await removing;
    });
    expect(state.working).toBe(false);
    expect(state.failed).toBe(false);
  });
});
