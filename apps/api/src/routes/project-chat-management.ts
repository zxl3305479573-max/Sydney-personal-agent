import { createRouterClient, ORPCError } from "@orpc/server";
import { listScratchpadItems, mapScratchpadItem } from "@rakazo/adapters";
import { runInProjectWorkspace } from "@rakazo/db";
import { botsRoutes } from "./bots.js";
import { contentRoutes } from "./content.js";
import type { RouterContext } from "./context.js";
import { threadsRoutes } from "./threads.js";

export function projectChatManagementRoutes(routerContext: RouterContext) {
  const { deps, repos, groupRepos } = routerContext;
  const authed = routerContext.projectsAuthed ?? routerContext.authed;
  const procedures = authed.projectWorkspaces;
  const requireEnabled = () => {
    if (!deps.env?.projectConversationCreateExperiment)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "Project conversations are not available yet",
      });
  };
  return {
    conversations: procedures.conversations.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
        const [bots, groups] = await Promise.all([
          repos.listBots(context.actor, { archived: input.archived }),
          groupRepos.listGroups(context.actor, { archived: input.archived }),
        ]);
        return { bots, groups };
      });
    }),
    botContext: procedures.botContext.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
        await repos.getBot(context.actor, input.botId);
        const [work, docs] = await Promise.all([
          listScratchpadItems(
            { prisma: deps.prisma },
            { spaceId: context.actor.spaceId, botId: input.botId, includeDone: false },
          ),
          deps.prisma.memoryDocument.findMany({
            where: {
              spaceId: context.actor.spaceId,
              userId: context.actor.userId,
              botId: input.botId,
              scope: "bot",
            },
          }),
        ]);
        return {
          work,
          docs: docs.map((doc) => ({
            id: doc.id,
            scope: doc.scope as "bot" | "user",
            botId: doc.botId,
            path: doc.path,
            content: doc.content,
            revision: doc.revision,
            updatedAt: doc.updatedAt.toISOString(),
          })),
        };
      });
    }),
    botContextAction: procedures.botContextAction.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
        await repos.getBot(context.actor, input.botId);
        if (input.action === "create") {
          if (!input.title) throw new ORPCError("BAD_REQUEST");
          const item = await deps.prisma.scratchpadItem.create({
            data: {
              spaceId: context.actor.spaceId,
              userId: context.actor.userId,
              botId: input.botId,
              title: input.title,
              status: "open",
              notes: "",
            },
          });
          return { ok: true as const, item: mapScratchpadItem(item) };
        }
        if (!input.itemId) throw new ORPCError("BAD_REQUEST");
        const item = await deps.prisma.scratchpadItem.findFirst({
          where: {
            id: input.itemId,
            botId: input.botId,
            spaceId: context.actor.spaceId,
            userId: context.actor.userId,
            bot: { projectWorkspaceId: input.projectId },
          },
        });
        if (!item) throw new ORPCError("NOT_FOUND");
        await deps.prisma.scratchpadItem.update({
          where: { id: item.id },
          data: { status: "done" },
        });
        return { ok: true as const };
      });
    }),
    conversationAction: procedures.conversationAction.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, async () => {
        const client = createRouterClient(botsRoutes(routerContext), { context });
        const threads = createRouterClient(threadsRoutes(routerContext), { context }).threads;
        const target = input.botId ? { botId: input.botId } : { groupId: input.groupId! };
        if (input.action === "clear") return threads.clear(target);
        if (input.action === "read") {
          await threads.markRead(target);
          return { ok: true as const };
        }
        if (input.action === "unread") return threads.markUnread(target);
        if (input.botId) {
          const bot = { botId: input.botId };
          if (input.action === "duplicate")
            return { ok: true as const, bot: await client.bots.duplicate(bot) };
          if (input.action === "remove")
            return client.bots.remove({ ...bot, deleteMemories: input.deleteMemories });
          if (input.action === "archive") return client.bots.archive(bot);
          return client.bots.restore(bot);
        }
        const group = { groupId: input.groupId! };
        if (input.action === "duplicate")
          return { ok: true as const, group: await client.groups.duplicate(group) };
        if (input.action === "remove") return client.groups.remove(group);
        if (input.action === "archive") return client.groups.archive(group);
        return client.groups.restore(group);
      });
    }),
    updateGroup: procedures.updateGroup.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
        createRouterClient(botsRoutes(routerContext), { context }).groups.update(input.group),
      );
    }),
    restoreBotInstructions: procedures.restoreBotInstructions.handler(
      async ({ context, input }) => {
        requireEnabled();
        const { projectId, ...restore } = input;
        return runInProjectWorkspace(deps.prisma, context.actor, projectId, () =>
          createRouterClient(botsRoutes(routerContext), { context }).bots.restoreInstructions(
            restore,
          ),
        );
      },
    ),
    exportBot: procedures.exportBot.handler(async ({ context, input }) => {
      requireEnabled();
      return runInProjectWorkspace(deps.prisma, context.actor, input.projectId, () =>
        createRouterClient(contentRoutes(routerContext), { context }).export.bot({
          botId: input.botId,
        }),
      );
    }),
  };
}
