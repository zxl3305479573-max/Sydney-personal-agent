import type { Actor } from "@rakazo/contracts";
import { currentDbContext, runAsTenant } from "@rakazo/db";
import { describe, expect, it } from "vitest";
import { asTenant } from "./context.js";

const actor: Actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "user@example.test",
  isDeploymentOwner: false,
};

function fixture() {
  const seen: unknown[] = [];
  const output: AsyncIterableIterator<number> = {
    async next() {
      seen.push(currentDbContext());
      return { done: false, value: 1 };
    },
    async return(value) {
      seen.push(currentDbContext());
      return { done: true, value };
    },
    async throw() {
      seen.push(currentDbContext());
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
  return { output, seen };
}

describe("streamed tenant scope", () => {
  it("retains the original project on next, return and throw outside its initiating context", async () => {
    const stream = fixture();
    const result = await runAsTenant({ ...actor, projectWorkspaceId: "project-a" }, () =>
      asTenant(actor, () => ({ output: stream.output })),
    );
    await runAsTenant({ ...actor, projectWorkspaceId: "project-b" }, async () => {
      await result.output.next();
      await result.output.return?.();
      await result.output.throw?.(new Error("stop"));
    });
    expect(stream.seen).toEqual(
      Array.from({ length: 3 }, () => ({
        kind: "tenant",
        spaceId: actor.spaceId,
        userId: actor.userId,
        projectWorkspaceId: "project-a",
      })),
    );
  });

  it("keeps a home stream in home when it is consumed inside a project", async () => {
    const stream = fixture();
    const result = await asTenant(actor, () => ({ output: stream.output }));
    await runAsTenant({ ...actor, projectWorkspaceId: "project-b" }, () => result.output.next());
    expect(stream.seen).toEqual([{ kind: "tenant", spaceId: actor.spaceId, userId: actor.userId }]);
  });
});
