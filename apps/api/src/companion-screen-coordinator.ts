import type { Actor } from "@rakazo/contracts";
import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { withAbort } from "@rakazo/core";
import { createCompanionScreenResponder } from "./companion-screen-response.js";
import {
  createCompanionScreenSessions,
  type CompanionScreenOwner,
} from "./companion-screen-session.js";

type ResponseDependencies = Parameters<typeof createCompanionScreenResponder>[0];

export function createCompanionScreenCoordinator(deps: Omit<ResponseDependencies, "authorize"> & {
  authorize: (owner: CompanionScreenOwner, actor: Actor, model?: AgentRunRequest["model"]) => Promise<boolean>;
}) {
  const sessions = createCompanionScreenSessions();
  const ownerFor = (actor: Actor, botId: string, sessionId: string): CompanionScreenOwner => ({
    userId: actor.userId,
    spaceId: actor.spaceId,
    botId,
    sessionId,
  });
  return {
    async start(
      actor: Actor, botId: string, sessionId: string, confirmed: boolean,
      stillAuthorized: () => Promise<boolean>, signal?: AbortSignal,
    ) {
      const owner = ownerFor(actor, botId, sessionId);
      const check = (promise: Promise<boolean>) => signal ? withAbort(promise, signal) : promise;
      if (!confirmed || !sessionId || signal?.aborted || !(await check(stillAuthorized())) ||
        signal?.aborted || !(await check(deps.authorize(owner, actor))) || signal?.aborted ||
        !(await check(stillAuthorized())) || signal?.aborted) {
        throw new Error("Screen sharing consent required.");
      }
      return sessions.start(owner, true);
    },
    stop(actor: Actor, botId: string, sessionId: string, id: string) {
      return sessions.stop(id, ownerFor(actor, botId, sessionId));
    },
    async respond(
      actor: Actor, botId: string, sessionId: string, id: string, text: string,
      stillAuthorized: () => Promise<boolean>, signal?: AbortSignal,
    ) {
      const owner = ownerFor(actor, botId, sessionId);
      return sessions.run(id, owner, async (sessionSignal) => {
        const respond = createCompanionScreenResponder({
          ...deps,
          authorize: async (_scope, model) => sessions.isActive(id, owner) && await stillAuthorized() &&
            await deps.authorize(owner, actor, model) && await stillAuthorized() && sessions.isActive(id, owner),
        });
        const combined = signal ? AbortSignal.any([signal, sessionSignal]) : sessionSignal;
        return respond(actor, botId, text, combined);
      });
    },
  };
}
