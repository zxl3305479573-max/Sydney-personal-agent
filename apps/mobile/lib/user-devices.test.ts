import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DeviceListError, listUserDevices } from "./user-devices";

const state = vi.hoisted(() => ({
  server: "https://server.test",
  generation: 1,
  headers: { authorization: "Bearer signed-token" } as Record<string, string>,
  fetch: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("./api", () => ({
  captureApiRequestContext: state.capture,
  currentApiBase: () => state.server,
}));
vi.mock("./session", () => ({ currentSessionGeneration: () => state.generation }));
vi.mock("./server-headers", () => ({ fetchServer: state.fetch }));

beforeEach(() => {
  state.server = "https://server.test";
  state.generation = 1;
  state.headers = { authorization: "Bearer signed-token" };
  state.fetch.mockReset();
  state.capture.mockReset().mockImplementation(async () => ({
    apiBase: state.server,
    sessionGeneration: state.generation,
    headers: state.headers,
  }));
});
afterEach(() => vi.useRealTimers());

it("requests and validates the device list with the captured bearer", async () => {
  state.fetch.mockResolvedValue(
    new Response(JSON.stringify({ devices: [{ deviceId: "a", name: "PC", connected: true }] })),
  );
  await expect(listUserDevices(new AbortController().signal)).resolves.toEqual([
    { deviceId: "a", name: "PC", connected: true },
  ]);
  expect(state.fetch).toHaveBeenCalledWith(
    "https://server.test/api/devices",
    expect.objectContaining({
      headers: { authorization: "Bearer signed-token" },
      redirect: "error",
    }),
    "https://server.test",
  );
});

it("distinguishes missing authentication, 401, 404 and network failure", async () => {
  state.headers = {};
  await expect(listUserDevices(new AbortController().signal)).rejects.toMatchObject({
    kind: "auth",
  });
  expect(state.fetch).not.toHaveBeenCalled();
  state.headers = { authorization: "Bearer signed-token" };
  state.fetch.mockResolvedValueOnce(new Response("", { status: 401 }));
  await expect(listUserDevices(new AbortController().signal)).rejects.toMatchObject({
    kind: "auth",
  });
  state.fetch.mockResolvedValueOnce(new Response("", { status: 404 }));
  await expect(listUserDevices(new AbortController().signal)).rejects.toMatchObject({
    kind: "unavailable",
  });
  state.fetch.mockRejectedValueOnce(new Error("network"));
  await expect(listUserDevices(new AbortController().signal)).rejects.toMatchObject({
    kind: "network",
  });
  state.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ devices: [{ name: "PC" }] })));
  await expect(listUserDevices(new AbortController().signal)).rejects.toMatchObject({
    kind: "invalid",
  });
});

it.each(["timeout", "abort"])("stops during credential retrieval on %s", async (event) => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  state.capture.mockReturnValue(new Promise((resolve) => (finish = resolve)));
  const controller = new AbortController();
  const pending = listUserDevices(controller.signal);
  const assertion = expect(pending).rejects.toMatchObject(
    event === "timeout" ? { kind: "timeout" } : { name: "AbortError" },
  );
  if (event === "timeout") await vi.advanceTimersByTimeAsync(8_000);
  else controller.abort();
  await assertion;
  finish({ apiBase: state.server, sessionGeneration: 1, headers: state.headers });
  await Promise.resolve();
  expect(state.fetch).not.toHaveBeenCalled();
});

it("exposes a typed timeout", () => {
  expect(new DeviceListError("timeout").kind).toBe("timeout");
});
it.each(["server", "session", "abort"])("rejects a response after %s changes", async (change) => {
  let finish!: (response: Response) => void;
  state.fetch.mockReturnValue(new Promise<Response>((resolve) => (finish = resolve)));
  const controller = new AbortController();
  const pending = listUserDevices(controller.signal);
  await vi.waitFor(() => expect(state.fetch).toHaveBeenCalled());
  if (change === "server") state.server = "https://other.test";
  if (change === "session") state.generation++;
  if (change === "abort") controller.abort();
  finish(new Response(JSON.stringify({ devices: [] })));
  await expect(pending).rejects.toThrow();
});
