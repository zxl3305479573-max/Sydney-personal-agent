import type { Actor } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { createCompanionScreenCoordinator } from "./companion-screen-coordinator.js";

const actor = { userId: "user", spaceId: "space" } as Actor;
const authorized = async () => true;

function fixture() {
  const authorize = vi.fn(async () => true);
  const resolveModel = vi.fn(async () => ({ provider: "test", id: "model" }));
  const resolvePersonality = vi.fn(async () => ({ name: "Bot", instructions: "" }));
  const recordUsage = vi.fn(async () => undefined);
  const runWithoutTools = vi.fn(async function* () {
    yield { type: "done" as const, text: "我在" };
  });
  return { authorize, resolveModel, resolvePersonality, runWithoutTools, coordinator: createCompanionScreenCoordinator({
    authorize, resolveModel, resolvePersonality, recordUsage, runWithoutTools,
  }) };
}

describe("companion screen coordinator", () => {
  it("requires authorization before starting and on every response", async () => {
    const test = fixture();
    await expect(test.coordinator.start(actor, "bot", "login", false, authorized)).rejects.toThrow();
    const session = await test.coordinator.start(actor, "bot", "login", true, authorized);
    await expect(test.coordinator.respond(actor, "bot", "login", session.id, "screen", authorized)).resolves.toBe("我在");
    expect(test.runWithoutTools).toHaveBeenCalledOnce();
    expect(test.authorize).toHaveBeenCalledWith(
      { userId: "user", spaceId: "space", botId: "bot", sessionId: "login" }, actor,
    );
  });

  it("rejects another login or revoked authorization without calling the model", async () => {
    const test = fixture();
    const session = await test.coordinator.start(actor, "bot", "login", true, authorized);
    await expect(test.coordinator.respond(actor, "bot", "other", session.id, "screen", authorized)).rejects.toThrow();
    test.authorize.mockResolvedValue(false);
    await expect(test.coordinator.respond(actor, "bot", "login", session.id, "screen", authorized)).rejects.toThrow();
    expect(test.runWithoutTools).not.toHaveBeenCalled();
  });

  it("does not replace an existing session when a newer start is canceled during authorization", async () => {
    const test = fixture();
    const first = await test.coordinator.start(actor, "bot", "login", true, authorized);
    let finish!: (authorized: boolean) => void;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    test.authorize.mockImplementationOnce(() => {
      entered();
      return new Promise<boolean>((resolve) => { finish = resolve; });
    });
    const controller = new AbortController();
    const pending = test.coordinator.start(actor, "bot", "login", true, authorized, controller.signal);
    await enteredPromise;
    controller.abort();
    await expect(pending).rejects.toThrow();
    finish(true);
    await expect(test.coordinator.respond(actor, "bot", "login", first.id, "screen", authorized)).resolves.toBe("我在");
  });

  it("stops an ongoing response and never returns its late result", async () => {
    const test = fixture();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const coordinator = createCompanionScreenCoordinator({
      authorize: test.authorize,
      resolveModel: test.resolveModel,
      resolvePersonality: test.resolvePersonality,
      recordUsage: async () => undefined,
      runWithoutTools: async function* () {
        started();
        await new Promise(() => undefined);
        yield { type: "done", text: "late" };
      },
    });
    const session = await coordinator.start(actor, "bot", "login", true, authorized);
    const response = coordinator.respond(actor, "bot", "login", session.id, "screen", authorized);
    await startedPromise;
    expect(coordinator.stop(actor, "bot", "login", session.id)).toBe(true);
    await expect(response).rejects.toThrow();
  });

  it("does not return a response after request authorization is revoked", async () => {
    const test = fixture();
    let live = true;
    const check = async () => live;
    const session = await test.coordinator.start(actor, "bot", "login", true, check);
    test.runWithoutTools.mockImplementationOnce(async function* () {
      live = false;
      yield { type: "done", text: "should not return" };
    });
    await expect(test.coordinator.respond(actor, "bot", "login", session.id, "screen", check))
      .rejects.toThrow();
  });
});
