import { ORPCError } from "@orpc/server";
import { runContinueJob } from "@rakazo/adapter-kit";
import { AI_CONSENT_REQUIRED } from "@rakazo/contracts";
import {
  createProjectWorkspace,
  getProjectWorkspace,
  IsolationError,
  listProjectWorkspaceRoster,
  listProjectWorkspaces,
  ProjectAccountDeletionInProgressError,
  ProjectWorkspaceConflictError,
  ProjectWorkspaceDeferredResourcesError,
  ProjectWorkspaceDeletionInProgressError,
  ProjectWorkspaceNotFoundError,
  recordAuditEvent,
  removeEmptyProjectWorkspace,
  renameProjectWorkspace,
  runAsTenant,
  runInProjectWorkspace,
  SpaceDeletionInProgressError,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { aiConsentStatus, allowAiConsent } from "../ai-consent.js";
import { getProjectThreadArtifact } from "../artifacts.js";
import { deleteProjectWorkspaceWithContent } from "../project-workspace-deletion.js";
import { loadMessagePage } from "../thread-message-pages.js";
import {
  markThreadRead,
  resolveThreadTarget,
  stopThreadRuns,
  threadHead,
  threadSnapshot,
} from "../thread-target.js";
import { updateBotSettings } from "./bots.js";
import type { RouterContext } from "./context.js";
import { projectChatManagementRoutes } from "./project-chat-management.js";
import { projectCloudDirectoryRoutes } from "./project-cloud-directories.js";
import { projectDirectoryRoutes } from "./project-directories.js";
import { THREAD_MESSAGE_PAGE_SIZE } from "./shared.js";
import { createThreadSender, subscribeThread } from "./threads.js";

export function projectWorkspaceRoutes(routerContext: RouterContext) {
  const { deps, repos, groupRepos } = routerContext;
  const authed = routerContext.projectsAuthed ?? routerContext.authed;
  const send = createThreadSender(routerContext);
  return {
    projectWorkspaces: {
      ...projectChatManagementRoutes(routerContext),
      ...projectDirectoryRoutes(routerContext),
      ...projectCloudDirectoryRoutes(routerContext),
      capabilities: authed.projectWorkspaces.capabilities.handler(async () => ({
        create: deps.env?.projectWorkspaceCreateExperiment === true,
        removeEmpty: deps.env?.projectWorkspaceCreateExperiment === true,
        remove: deps.env?.projectWorkspaceCreateExperiment === true,
      })),
      conversationCapabilities: authed.projectWorkspaces.conversationCapabilities.handler(
        async () => ({
          createBot: deps.env?.projectConversationCreateExperiment === true,
          botSettings: deps.env?.projectConversationCreateExperiment === true,
          chatManagement: deps.env?.projectConversationCreateExperiment === true,
        }),
      ),
      groupCreationCapability: authed.projectWorkspaces.groupCreationCapability.handler(
        async () => ({
          createGroup: deps.env?.projectConversationCreateExperiment === true,
        }),
      ),
      list: authed.projectWorkspaces.list.handler(async ({ context, input }) => {
        const page = await listProjectWorkspaces(
          deps.prisma,
          context.actor,
          input.after
            ? { id: input.after.id, createdAt: new Date(input.after.createdAt) }
            : undefined,
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
        try {
          return await createProjectWorkspace(deps.prisma, context.actor, input);
        } catch (error) {
          if (
            error instanceof ProjectAccountDeletionInProgressError ||
            error instanceof ProjectWorkspaceConflictError ||
            error instanceof SpaceDeletionInProgressError
          ) {
            throw new ORPCError("CONFLICT", { message: error.message });
          }
          throw error;
        }
      }),
      rename: authed.projectWorkspaces.rename.handler(async ({ context, input }) => {
        if (!deps.env?.projectWorkspaceCreateExperiment) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project editing is not available yet",
          });
        }
        const workspace = await renameProjectWorkspace(deps.prisma, context.actor, input);
        if (!workspace) throw new ORPCError("NOT_FOUND");
        return workspace;
      }),
      removeEmpty: authed.projectWorkspaces.removeEmpty.handler(async ({ context, input }) => {
        if (!deps.env?.projectWorkspaceCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project removal is not available yet",
          });
        if (!(await removeEmptyProjectWorkspace(deps.prisma, context.actor, input)))
          throw new ORPCError("CONFLICT", { message: "Project is unavailable or contains data" });
        return { ok: true as const };
      }),
      remove: authed.projectWorkspaces.remove.handler(async ({ context, input }) => {
        if (!deps.env?.projectWorkspaceCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project removal is not available yet",
          });
        try {
          const deleted = await deleteProjectWorkspaceWithContent(
            deps,
            context.actor,
            input,
            context.signal,
          );
          await recordAuditEvent({
            action: "project_workspace.deleted",
            actor: { type: "user", id: context.actor.userId },
            spaceId: context.actor.spaceId,
            target: { type: "project_workspace", id: deleted.id, label: deleted.name },
          });
          return { ok: true as const };
        } catch (error) {
          if (error instanceof ProjectWorkspaceNotFoundError || error instanceof IsolationError) {
            throw new ORPCError("NOT_FOUND", { message: error.message });
          }
          if (
            error instanceof ProjectWorkspaceDeletionInProgressError ||
            error instanceof ProjectWorkspaceDeferredResourcesError ||
            error instanceof SpaceDeletionInProgressError
          ) {
            throw new ORPCError("CONFLICT", { message: error.message });
          }
          throw error;
        }
      }),
      createBot: authed.projectWorkspaces.createBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        try {
          return await runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
            repos.createBot(context.actor, input.bot),
          );
        } catch (error) {
          if (error instanceof ProjectWorkspaceDeletionInProgressError) {
            throw new ORPCError("CONFLICT", { message: error.message });
          }
          throw error;
        }
      }),
      createGroup: authed.projectWorkspaces.createGroup.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        try {
          return await runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
            groupRepos.createGroup(context.actor, { ...input.group, id: input.requestId }),
          );
        } catch (error) {
          if (error instanceof ProjectWorkspaceDeletionInProgressError) {
            throw new ORPCError("CONFLICT", { message: error.message });
          }
          throw error;
        }
      }),
      threadHead: authed.projectWorkspaces.threadHead.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          return threadHead(deps.prisma, target);
        });
      }),
      getBot: authed.projectWorkspaces.getBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const bot =
            (await repos.listBots(context.actor)).find(({ id }) => id === input.botId) ??
            (input.includeArchived
              ? (await repos.listBots(context.actor, { archived: true })).find(
                  ({ id }) => id === input.botId,
                )
              : undefined);
          if (!bot) throw new IsolationError();
          return bot;
        });
      }),
      updateBot: authed.projectWorkspaces.updateBot.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          updateBotSettings(routerContext, context.actor, input.bot),
        );
      }),
      threadSnapshot: authed.projectWorkspaces.threadSnapshot.handler(
        async ({ context, input }) => {
          if (!deps.env?.projectConversationCreateExperiment)
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Project conversations are not available yet",
            });
          return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
            const target = await resolveThreadTarget(deps.prisma, context.actor, input, {
              includeArchived: true,
            });
            return threadSnapshot(deps, target);
          });
        },
      ),
      messages: authed.projectWorkspaces.messages.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input, {
            includeArchived: true,
          });
          return loadMessagePage(
            deps.prisma,
            target.threadId,
            input.before,
            THREAD_MESSAGE_PAGE_SIZE,
            input.around,
            input.includePeerRuns,
            input.includePeerReceipts,
          );
        });
      }),
      consentStatus: authed.projectWorkspaces.consentStatus.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          aiConsentStatus(deps, context.actor, {
            botId: input.botId,
            groupId: input.groupId,
            uses: ["model"],
          }),
        );
      }),
      consentAllow: authed.projectWorkspaces.consentAllow.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
          allowAiConsent(deps, context.actor, input, {
            botId: input.botId,
            groupId: input.groupId,
            uses: ["model"],
          }),
        );
      }),
      sendText: authed.projectWorkspaces.sendText.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        try {
          return await runInProjectWorkspace(
            deps.prisma,
            context.actor,
            input.projectId,
            async () => {
              const status = await aiConsentStatus(deps, context.actor, {
                botId: input.botId,
                groupId: input.groupId,
                uses: ["model"],
              });
              if (status.recipients.some((recipient) => !recipient.allowed))
                throw new ORPCError("FORBIDDEN", { message: AI_CONSENT_REQUIRED });
              return send(context.actor, input);
            },
          );
        } catch (error) {
          if (error instanceof ProjectWorkspaceDeletionInProgressError) {
            throw new ORPCError("CONFLICT", { message: error.message });
          }
          throw error;
        }
      }),
      stop: authed.projectWorkspaces.stop.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          await stopThreadRuns(deps, context.actor, target);
          return { ok: true as const };
        });
      }),
      markRead: authed.projectWorkspaces.markRead.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          const unreadAfterSeq = await markThreadRead(deps.prisma, context.actor, target);
          return { ok: true as const, unreadAfterSeq };
        });
      }),
      cancelRun: authed.projectWorkspaces.cancelRun.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input);
          await stopThreadRuns(deps, context.actor, target, input.runId);
          return { ok: true as const };
        });
      }),
      answerApproval: authed.projectWorkspaces.answerApproval.handler(
        async ({ context, input }) => {
          if (!deps.env?.projectConversationCreateExperiment)
            throw new ORPCError("SERVICE_UNAVAILABLE", {
              message: "Project conversations are not available yet",
            });
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
        },
      ),
      getArtifact: authed.projectWorkspaces.getArtifact.handler(async ({ context, input }) => {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
          const target = await resolveThreadTarget(deps.prisma, context.actor, input, {
            includeArchived: true,
          });
          return getProjectThreadArtifact(deps, context.actor, {
            ...input,
            threadId: target.threadId,
          });
        });
      }),
      subscribe: authed.projectWorkspaces.subscribe.handler(async function* ({ context, input }) {
        if (!deps.env?.projectConversationCreateExperiment)
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Project conversations are not available yet",
          });
        const iterator = subscribeThread(routerContext, context, input);
        try {
          while (!context.signal?.aborted) {
            const next = await runInProjectWorkspace(
              deps.prisma,
              context.actor,
              input.projectId,
              () => iterator.next(),
            );
            if (next.done) return;
            yield next.value;
          }
        } finally {
          void runAsTenant(
            {
              spaceId: context.actor.spaceId,
              userId: context.actor.userId,
              projectWorkspaceId: input.projectId,
            },
            () => iterator.return(undefined),
          ).catch(() => {});
        }
      }),
    },
  };
}
