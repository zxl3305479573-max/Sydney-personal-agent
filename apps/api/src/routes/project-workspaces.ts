import { ORPCError } from "@orpc/server";
import { runContinueJob } from "@rakazo/adapter-kit";
import { AI_CONSENT_REQUIRED } from "@rakazo/contracts";
import {
  createProjectWorkspace,
  getProjectWorkspace,
  IsolationError,
  listProjectWorkspaceRoster,
  listProjectWorkspaces,
  removeEmptyProjectWorkspace,
  runAsTenant,
  runInProjectWorkspace,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { getProjectThreadArtifact } from "../artifacts.js";
import { resolveThreadTarget, stopThreadRuns, threadSnapshot } from "../thread-target.js";
import { aiConsentStatus, allowAiConsent } from "../ai-consent.js";
import { updateBotSettings } from "./bots.js";
import type { RouterContext } from "./context.js";
import { createThreadSender, subscribeThread } from "./threads.js";
import { projectDirectoryRoutes } from "./project-directories.js";
import { projectCloudDirectoryRoutes } from "./project-cloud-directories.js";

export function projectWorkspaceRoutes(routerContext: RouterContext) {
  const { deps, authed, repos, groupRepos } = routerContext;
  const send = createThreadSender(routerContext);
  return {
    projectWorkspaces: {
      ...projectDirectoryRoutes(routerContext),
      ...projectCloudDirectoryRoutes(routerContext),
      capabilities: authed.projectWorkspaces.capabilities.handler(async () => ({
        create: deps.env?.projectWorkspaceCreateExperiment === true,
        removeEmpty: deps.env?.projectWorkspaceCreateExperiment === true,
      })),
      conversationCapabilities: authed.projectWorkspaces.conversationCapabilities.handler(async () => ({
        createBot: deps.env?.projectConversationCreateExperiment === true,
        botSettings: deps.env?.projectConversationCreateExperiment === true,
      })),
      groupCreationCapability: authed.projectWorkspaces.groupCreationCapability.handler(async () => ({
        createGroup: deps.env?.projectConversationCreateExperiment === true,
      })),
      list: authed.projectWorkspaces.list.handler(async ({ context, input }) => {
        const page = await listProjectWorkspaces(
          deps.prisma,
          context.actor,
          input.after ? { id: input.after.id, createdAt: new Date(input.after.createdAt) } : undefined,
        );
        return {
          items: page.items,
          nextCursor: page.nextCursor
            ? { id: page.nextCursor.id, createdAt: page.nextCursor.createdAt.toISOString() }
            : null,
        };
      }),
      get: authed.projectWorkspaces.get.handler(async ({ context, input }) => {
        const workspace = await getProjectWorkspace(deps.prisma, context.actor, input.id);
        if (!workspace) throw new ORPCError("NOT_FOUND");
        return workspace;
      }),
      roster: authed.projectWorkspaces.roster.handler(async ({ context, input }) => {
        const roster = await listProjectWorkspaceRoster(deps.prisma, context.actor, input);
        if (!roster) throw new ORPCError("NOT_FOUND");
        return roster;
      }),
      create: authed.projectWorkspaces.create.handler(async ({ context, input }) => {
        if (!deps.env?.projectWorkspaceCreateExperiment) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project creation is not available yet",
          });
        }
        return createProjectWorkspace(deps.prisma, context.actor, input);
      }),
      removeEmpty: authed.projectWorkspaces.removeEmpty.handler(async ({ context, input }) => {
        if (!deps.env?.projectWorkspaceCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project removal is not available yet" });
        if (!await removeEmptyProjectWorkspace(deps.prisma, context.actor, input))
          throw new ORPCError("CONFLICT", { message: "Project is unavailable or contains data" });
        return { ok: true as const };
      }),
      createBot: authed.projectWorkspaces.createBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          repos.createBot(context.actor, input.bot),
        );
      }),
      createGroup: authed.projectWorkspaces.createGroup.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          groupRepos.createGroup(context.actor, { ...input.group, id: input.requestId }),
        );
      }),
      getBot: authed.projectWorkspaces.getBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const bot = (await repos.listBots(context.actor)).find(({ id }) => id === input.botId);
          if (!bot) throw new IsolationError();
          return bot;
        });
      }),
      updateBot: authed.projectWorkspaces.updateBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          updateBotSettings(routerContext, context.actor, input.bot),
        );
      }),
      threadSnapshot: authed.projectWorkspaces.threadSnapshot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input, { includeArchived: true });
          return threadSnapshot(deps, target);
        });
      }),
      consentStatus: authed.projectWorkspaces.consentStatus.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          aiConsentStatus(deps, context.actor, { botId: input.botId, groupId: input.groupId, uses: ["model", "memory"] }),
        );
      }),
      consentAllow: authed.projectWorkspaces.consentAllow.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          allowAiConsent(deps, context.actor, input, {
            botId: input.botId, groupId: input.groupId, uses: ["model", "memory"],
          }),
        );
      }),
      sendText: authed.projectWorkspaces.sendText.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const status = await aiConsentStatus(deps, context.actor, {
            botId: input.botId, groupId: input.groupId, uses: ["model", "memory"],
          });
          if (status.recipients.some((recipient) => !recipient.allowed))
            throw new ORPCError("FORBIDDEN", { message: AI_CONSENT_REQUIRED });
          return send(context.actor, input);
        });
      }),
      cancelRun: authed.projectWorkspaces.cancelRun.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          await stopThreadRuns(deps, context.actor, target, input.runId);
          return { ok: true as const };
        });
      }),
      answerApproval: authed.projectWorkspaces.answerApproval.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        await runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          const answered = await deps.events.answerRunInput({
            spaceId: context.actor.spaceId,
            threadId: target.threadId,
            runId: input.runId,
            messageId: input.messageId,
            answeredByUserId: context.actor.userId,
            answer: input.decision,
            projectApproval: { projectId: input.projectId, effectId: input.effectId },
          });
          if (!answered)
            throw new ORPCError("CONFLICT", { message: "This approval is no longer pending" });
        });
        await deps.jobs.enqueue(runContinueJob(input.runId)).catch((error) => {
          getLogger().error("project approval enqueue", error);
        });
        return { ok: true as const };
      }),
      getArtifact: authed.projectWorkspaces.getArtifact.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input, { includeArchived: true });
          return getProjectThreadArtifact(deps, context.actor, { ...input, threadId: target.threadId });
        });
      }),
      subscribe: authed.projectWorkspaces.subscribe.handler(async function* ({ context, input }) {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Project conversations are not available yet" });
        const iterator = subscribeThread(routerContext, context, input);
        try {
          while (!context.signal?.aborted) {
            const next = await runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
              iterator.next(),
            );
            if (next.done) return;
            yield next.value;
          }
        } finally {
          void runAsTenant({
            spaceId: context.actor.spaceId,
            userId: context.actor.userId,
            projectWorkspaceId: input.projectId,
          }, () => iterator.return(undefined)).catch(() => {});
        }
      }),
    },
  };
}
