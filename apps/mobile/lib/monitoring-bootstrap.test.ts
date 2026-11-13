import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  storedBase: "https://selected.example.com",
  importBroken: true,
  configure: vi.fn(async () => {}),
  report: vi.fn(),
  subscribe: vi.fn((_listener: () => void) => {}),
  sessionSubscribe: vi.fn((_listener: () => void) => {}),
  load: vi.fn(async () => "https://selected.example.com"),
  headers: vi.fn(async () => ({ authorization: "Bearer fake-session" })),
}));
vi.mock("expo-secure-store", () => ({ getItem: () => state.storedBase }));
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn() } }));
vi.mock("./monitoring", () => ({
  configureMobileMonitoring: state.configure,
  reportMobileError: state.report,
  resetMobileMonitoring: vi.fn(),
}));
vi.mock("./api", () => {
  if (state.importBroken) throw new Error("app import failed");
  return {
    authHeaders: state.headers,
    currentApiBase: () => state.storedBase,
    loadApiBase: state.load,
    subscribeApiBase: state.subscribe,
  };
});
vi.mock("./session", () => ({
  currentSessionGeneration: () => 0,
  subscribeSessionGeneration: state.sessionSubscribe,
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  state.importBroken = true;
  state.configure.mockResolvedValue(undefined);
  state.load.mockResolvedValue(state.storedBase);
  state.headers.mockResolvedValue({ authorization: "Bearer fake-session" });
});

describe("early monitoring bootstrap", () => {
  it("requests configuration on the selected server even when the app graph cannot load", async () => {
    const { startMobileMonitoring } = await import("./monitoring-bootstrap");
    startMobileMonitoring();
    expect(state.configure).toHaveBeenCalledWith(state.storedBase, {});
    await vi.waitFor(() =>
      expect(state.report).toHaveBeenCalledWith(expect.any(Error), "mobile.startup"),
    );
  });

  it("attaches session resets without waiting for the anonymous configuration request", async () => {
    state.importBroken = false;
    state.configure.mockImplementation(() => new Promise(() => {}));
    const { startMobileMonitoring } = await import("./monitoring-bootstrap");
    startMobileMonitoring();
    await vi.waitFor(() => expect(state.subscribe).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(state.configure).toHaveBeenCalledWith(state.storedBase, {
        authorization: "Bearer fake-session",
      }),
    );
  });

  it("does not attach a session while server settings are unresolved or rejected", async () => {
    state.importBroken = false;
    let rejectLoad: (error: Error) => void = () => undefined;
    state.load.mockReturnValue(new Promise((_resolve, reject) => {
      rejectLoad = reject;
    }));
    const { startMobileMonitoring } = await import("./monitoring-bootstrap");
    startMobileMonitoring();
    await vi.waitFor(() => expect(state.sessionSubscribe).toHaveBeenCalledOnce());
    state.sessionSubscribe.mock.calls[0]![0]();
    await Promise.resolve();
    expect(state.headers).not.toHaveBeenCalled();
    rejectLoad(new Error("storage locked"));
    await Promise.resolve();
    await Promise.resolve();
    expect(state.headers).not.toHaveBeenCalled();
  });

  it("attaches a session after server settings succeed following a failed load", async () => {
    state.importBroken = false;
    state.load.mockRejectedValue(new Error("storage locked"));
    const { startMobileMonitoring } = await import("./monitoring-bootstrap");
    startMobileMonitoring();
    await vi.waitFor(() => expect(state.subscribe).toHaveBeenCalledOnce());
    expect(state.headers).not.toHaveBeenCalled();
    state.subscribe.mock.calls[0]![0]();
    await vi.waitFor(() =>
      expect(state.configure).toHaveBeenCalledWith(state.storedBase, {
        authorization: "Bearer fake-session",
      }),
    );
  });
});
