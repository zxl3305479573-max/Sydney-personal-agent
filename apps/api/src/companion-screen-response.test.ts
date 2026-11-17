import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createCompanionScreenResponder } from "./companion-screen-response.js";

const actor = { userId: "user", spaceId: "space" } as Actor;

function fixture() {
  const authorize = vi.fn(async () => true);
  const resolveModel = vi.fn(async () => ({ provider: "test", id: "model" }));
  const resolvePersonality = vi.fn(async () => ({ name: "小雪", instructions: "说话温柔" }));
  const recordUsage = vi.fn(async () => undefined);
  const runWithoutTools = vi.fn(async function* () {
    yield { type: "done" as const, text: "我在这里" };
  });
  return {
    authorize, resolveModel, resolvePersonality, recordUsage, runWithoutTools,
    respond: createCompanionScreenResponder({ authorize, resolveModel, resolvePersonality, recordUsage, runWithoutTools }),
  };
}

describe("companion screen response", () => {
  it("uses an authorized tool-free request with bounded input and output", async () => {
    const test = fixture();
    await expect(test.respond(actor, "bot", "  screen text  ")).resolves.toBe("我在这里");
    expect(test.authorize).toHaveBeenCalledTimes(3);
    expect(test.authorize).toHaveBeenNthCalledWith(2, { userId: "user", spaceId: "space", botId: "bot" }, { provider: "test", id: "model" });
    expect(test.authorize).toHaveBeenNthCalledWith(3, { userId: "user", spaceId: "space", botId: "bot" }, { provider: "test", id: "model" });
    expect(test.runWithoutTools).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: "bot", prompt: "screen text", tools: [], history: [],
        instructions: expect.stringContaining("untrusted data"),
      }),
      expect.objectContaining({ userId: "user", spaceId: "space", botId: "bot", signal: expect.any(AbortSignal) }),
    );
    expect(test.resolvePersonality).toHaveBeenCalledWith({ userId: "user", spaceId: "space", botId: "bot" });
    expect(test.runWithoutTools).toHaveBeenCalledWith(
      expect.objectContaining({ instructions: expect.stringContaining("说话温柔") }),
      expect.anything(),
    );
  });

  it("does not invoke a model if authorization is denied or revoked during setup", async () => {
    const denied = fixture();
    denied.authorize.mockResolvedValue(false);
    await expect(denied.respond(actor, "bot", "text")).rejects.toThrow();
    expect(denied.resolveModel).not.toHaveBeenCalled();
    expect(denied.resolvePersonality).not.toHaveBeenCalled();
    const revoked = fixture();
    revoked.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(revoked.respond(actor, "bot", "text")).rejects.toThrow();
    expect(revoked.runWithoutTools).not.toHaveBeenCalled();
  });

  it("fails closed when the selected bot profile is unavailable or authorization changes while loading it", async () => {
    const missing = fixture();
    missing.resolvePersonality.mockRejectedValueOnce(new Error("missing"));
    await expect(missing.respond(actor, "bot", "text")).rejects.toThrow();
    expect(missing.runWithoutTools).not.toHaveBeenCalled();
    const revoked = fixture();
    revoked.resolvePersonality.mockImplementationOnce(async () => {
      revoked.authorize.mockResolvedValue(false);
      return { name: "Bot", instructions: "Profile" };
    });
    await expect(revoked.respond(actor, "bot", "text")).rejects.toThrow();
    expect(revoked.runWithoutTools).not.toHaveBeenCalled();
  });

  it("does not expose screen text embedded in dependency or model errors", async () => {
    const secret = "private screen content";
    const setup = fixture();
    setup.resolvePersonality.mockRejectedValueOnce(new Error(secret));
    await expect(setup.respond(actor, "bot", secret)).rejects.toThrowError(
      /^Companion screen response unavailable\.$/,
    );
    const runtime = fixture();
    const respond = createCompanionScreenResponder({
      ...runtime,
      runWithoutTools: async function* () {
        throw new Error(secret);
        yield { type: "done", text: "" };
      },
    });
    await expect(respond(actor, "bot", secret)).rejects.toThrowError(
      /^Companion screen response unavailable\.$/,
    );
  });

  it("does not return a reply after authorization is revoked or the request is aborted", async () => {
    const revoked = fixture();
    revoked.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(revoked.respond(actor, "bot", "text")).rejects.toThrow();
    const cancelled = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(cancelled.respond(actor, "bot", "text", controller.signal)).rejects.toThrow();
    expect(cancelled.runWithoutTools).not.toHaveBeenCalled();
  });

  it("rejects empty or oversized screen text", async () => {
    const test = fixture();
    await expect(test.respond(actor, "bot", " ")).rejects.toThrow();
    await expect(test.respond(actor, "bot", "字".repeat(2001))).rejects.toThrow();
    expect(test.authorize).not.toHaveBeenCalled();
  });

  it("bounds model output to the RPC UTF-16 limit without splitting an emoji", async () => {
    const test = fixture();
    const respond = createCompanionScreenResponder({
      ...test,
      runWithoutTools: async function* () {
        yield { type: "done", text: `${"字".repeat(499)}😀更多` };
      },
    });
    await expect(respond(actor, "bot", "text")).resolves.toBe("字".repeat(499));
  });

  it("returns on cancellation even if the runtime does not settle", async () => {
    const test = fixture();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const respond = createCompanionScreenResponder({
      ...test,
      runWithoutTools: async function* () {
        started();
        await new Promise(() => undefined);
        yield { type: "done", text: "late" };
      },
    });
    const controller = new AbortController();
    const result = respond(actor, "bot", "text", controller.signal);
    await startedPromise;
    controller.abort();
    await expect(result).rejects.toThrow();
  });
});
