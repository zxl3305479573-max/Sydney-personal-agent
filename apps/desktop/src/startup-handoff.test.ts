import { expect, it, vi } from "vitest";
import { finishAfterStartup } from "./startup-handoff.js";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

it.each(["work", "animation"] as const)(
  "waits for both startup and the animation when %s finishes first",
  async (first) => {
    const work = deferred();
    const animation = deferred();
    const finish = vi.fn();
    const handoff = finishAfterStartup(work.promise, animation.promise, finish);

    (first === "work" ? work : animation).resolve();
    await Promise.resolve();
    expect(finish).not.toHaveBeenCalled();

    (first === "work" ? animation : work).resolve();
    await handoff;
    expect(finish).toHaveBeenCalledOnce();
  },
);

it("releases the startup window after an initialization error", async () => {
  const work = deferred();
  const animation = deferred();
  const finish = vi.fn();
  const handoff = finishAfterStartup(work.promise, animation.promise, finish);
  const result = expect(handoff).rejects.toThrow("startup failed");

  work.reject(new Error("startup failed"));
  await Promise.resolve();
  expect(finish).not.toHaveBeenCalled();
  animation.resolve();
  await result;
  expect(finish).toHaveBeenCalledOnce();
});
