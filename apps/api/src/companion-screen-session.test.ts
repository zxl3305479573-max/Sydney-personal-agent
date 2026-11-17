import { describe, expect, it, vi } from "vitest";
import { createCompanionScreenSessions } from "./companion-screen-session.js";

const owner = { userId: "user", spaceId: "space", botId: "bot", sessionId: "login" };

describe("companion screen session", () => {
  it("requires explicit consent and binds every owner field", () => {
    const sessions = createCompanionScreenSessions();
    expect(() => sessions.start(owner, false)).toThrow();
    const { id } = sessions.start(owner, true);
    expect(sessions.isActive(id, owner)).toBe(true);
    for (const key of Object.keys(owner) as Array<keyof typeof owner>) {
      expect(sessions.isActive(id, { ...owner, [key]: "other" })).toBe(false);
      expect(sessions.stop(id, { ...owner, [key]: "other" })).toBe(false);
    }
  });

  it("limits concurrency and request frequency, including failures", async () => {
    let time = 1_000;
    const sessions = createCompanionScreenSessions({ now: () => time, intervalMs: 30 });
    const { id } = sessions.start(owner, true);
    let finish!: (value: string) => void;
    const first = sessions.run(id, owner, () => new Promise<string>((resolve) => { finish = resolve; }));
    await Promise.resolve();
    await expect(sessions.run(id, owner, async () => "second")).rejects.toThrow();
    finish("first");
    await expect(first).resolves.toBe("first");
    await expect(sessions.run(id, owner, async () => "second")).rejects.toThrow();
    time += 30;
    await expect(sessions.run(id, owner, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(sessions.run(id, owner, async () => "second")).rejects.toThrow();
  });

  it("aborts a stopped, expired, or replaced session and rejects late results", async () => {
    let time = 1_000;
    const sessions = createCompanionScreenSessions({ now: () => time, lifetimeMs: 100, intervalMs: 1 });
    for (const ending of ["stop", "expire", "replace"] as const) {
      const { id } = sessions.start(owner, true);
      let finish!: (value: string) => void;
      const onAbort = vi.fn();
      const pending = sessions.run(id, owner, (signal) => {
        signal.addEventListener("abort", onAbort);
        return new Promise<string>((resolve) => { finish = resolve; });
      });
      await Promise.resolve();
      if (ending === "stop") sessions.stop(id, owner);
      if (ending === "expire") { time += 100; sessions.isActive(id, owner); }
      if (ending === "replace") sessions.start(owner, true);
      expect(onAbort).toHaveBeenCalledOnce();
      finish("late");
      await expect(pending).rejects.toThrow();
      time += 1;
    }
  });

  it("does not start queued work if the session stops immediately", async () => {
    const sessions = createCompanionScreenSessions();
    const { id } = sessions.start(owner, true);
    const task = vi.fn(async () => "unexpected");
    const pending = sessions.run(id, owner, task);
    sessions.stop(id, owner);
    await expect(pending).rejects.toThrow();
    expect(task).not.toHaveBeenCalled();
  });

  it("keeps the account cooldown when sessions are replaced or stopped", async () => {
    let time = 1_000;
    const sessions = createCompanionScreenSessions({ now: () => time, intervalMs: 30 });
    const first = sessions.start(owner, true);
    await sessions.run(first.id, owner, async () => "first");
    sessions.stop(first.id, owner);
    const secondOwner = { ...owner, botId: "other-bot", sessionId: "other-login" };
    const second = sessions.start(secondOwner, true);
    await expect(sessions.run(second.id, secondOwner, async () => "second")).rejects.toThrow();
    time += 30;
    await expect(sessions.run(second.id, secondOwner, async () => "second")).resolves.toBe("second");
  });

  it("does not overlap a previous task that ignores cancellation", async () => {
    let time = 1_000;
    const sessions = createCompanionScreenSessions({ now: () => time, intervalMs: 30 });
    const first = sessions.start(owner, true);
    let finish!: (value: string) => void;
    const pending = sessions.run(first.id, owner, () => new Promise<string>((resolve) => { finish = resolve; }));
    await Promise.resolve();
    sessions.stop(first.id, owner);
    await expect(pending).rejects.toThrow();
    time += 31;
    const second = sessions.start(owner, true);
    await expect(sessions.run(second.id, owner, async () => "second")).rejects.toThrow();
    finish("late");
    await Promise.resolve();
    await Promise.resolve();
    await expect(sessions.run(second.id, owner, async () => "second")).resolves.toBe("second");
  });
});
