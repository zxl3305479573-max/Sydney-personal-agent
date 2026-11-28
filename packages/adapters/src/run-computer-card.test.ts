import { beforeEach, expect, it, vi } from "vitest";
import type { ExecutorDeps } from "./executor-deps.js";
import { createRunComputerCardPublisher } from "./run-computer-card.js";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("./run-messages.js", () => ({ publishMessage: publish }));
const deps = {} as ExecutorDeps;
const run = { id: "run", spaceId: "space", threadId: "thread", botId: "bot", trigger: "message" };
beforeEach(() => publish.mockReset().mockResolvedValue(null));

it("shares a pending publication and keeps its durable nonce across executor retries", async () => {
  let finish: (value: null) => void = () => undefined;
  publish.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const emit = createRunComputerCardPublisher(deps, run);
  const first = emit();
  expect(emit()).toBe(first);
  expect(publish).toHaveBeenCalledOnce();
  finish(null);
  await first;
  await emit();
  expect(publish).toHaveBeenCalledOnce();
  await createRunComputerCardPublisher(deps, run)();
  expect(publish.mock.calls.map((call) => call[5])).toEqual([
    "computer-live:run",
    "computer-live:run",
  ]);
});

it("allows a failed publish to retry before computer actions proceed", async () => {
  publish.mockRejectedValueOnce(new Error("transaction failed"));
  const emit = createRunComputerCardPublisher(deps, run);
  await expect(emit()).rejects.toThrow("transaction failed");
  await emit();
  expect(publish).toHaveBeenCalledTimes(2);
});
