import { ORPCError } from "@orpc/server";
import {
  BOT_INSTRUCTIONS_MAX_LENGTH,
  PersonalitySelectionSchema,
  renderPersonalitySelections,
} from "@rakazo/contracts";
import type { RouterContext } from "./context.js";

function mapNameConflict(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    throw new ORPCError("CONFLICT", { message: "A personality with this name already exists" });
  }
  throw error;
}

function render(
  selections: Parameters<typeof renderPersonalitySelections>[0],
  instructions: string,
) {
  let generated: string;
  try {
    generated = renderPersonalitySelections(selections);
  } catch (error) {
    throw new ORPCError("BAD_REQUEST", {
      message: error instanceof Error ? error.message : "Invalid personality",
    });
  }
  const result = [generated, instructions.trim()].filter(Boolean).join("\n\n");
  if (!result || result.length > BOT_INSTRUCTIONS_MAX_LENGTH)
    throw new ORPCError("BAD_REQUEST", {
      message: "Personality instructions are empty or too long",
    });
  return result;
}

function dto(row: {
  id: string;
  name: string;
  description: string;
  instructions: string;
  customInstructions: string;
  selections: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    customInstructions: row.customInstructions,
    selections: PersonalitySelectionSchema.array().parse(row.selections),
    source: "custom" as const,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function personalityRoutes({ deps, authed }: RouterContext) {
  return {
    personalities: {
      list: authed.personalities.list.handler(async ({ context }) => {
        const rows = await deps.prisma.personalityPreset.findMany({
          where: { userId: context.actor.userId },
          orderBy: { updatedAt: "desc" },
        });
        return rows.map(dto);
      }),
      create: authed.personalities.create.handler(async ({ context, input }) => {
        const instructions = render(input.selections, input.instructions);
        const row = await deps.prisma.personalityPreset
          .create({
            data: {
              userId: context.actor.userId,
              name: input.name,
              description: input.description,
              instructions,
              customInstructions: input.instructions,
              selections: input.selections,
            },
          })
          .catch(mapNameConflict);
        return dto(row);
      }),
      update: authed.personalities.update.handler(async ({ context, input }) => {
        const instructions = render(input.selections, input.instructions);
        const result = await deps.prisma.personalityPreset
          .updateMany({
            where: { id: input.personalityId, userId: context.actor.userId },
            data: {
              name: input.name,
              description: input.description,
              instructions,
              customInstructions: input.instructions,
              selections: input.selections,
            },
          })
          .catch(mapNameConflict);
        if (!result.count) throw new ORPCError("NOT_FOUND");
        const row = await deps.prisma.personalityPreset.findFirst({
          where: { id: input.personalityId, userId: context.actor.userId },
        });
        if (!row) throw new ORPCError("NOT_FOUND");
        return dto(row);
      }),
      remove: authed.personalities.remove.handler(async ({ context, input }) => {
        const result = await deps.prisma.personalityPreset.deleteMany({
          where: { id: input.personalityId, userId: context.actor.userId },
        });
        if (!result.count) throw new ORPCError("NOT_FOUND");
        return { ok: true as const };
      }),
    },
  };
}
