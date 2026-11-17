import { z } from "zod";
import { BOT_INSTRUCTIONS_MAX_LENGTH } from "./domain.js";
import { Id } from "./ids.js";

export const PersonalitySourceSchema = z.enum(["hersona", "custom"]);
export type PersonalitySource = z.infer<typeof PersonalitySourceSchema>;

export const PersonalityAttributeCategorySchema = z.enum([
  "personality",
  "speech",
  "archetype",
  "hobby",
]);
export type PersonalityAttributeCategory = z.infer<typeof PersonalityAttributeCategorySchema>;

export const PersonalityAttributeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_/-]{1,100}$/),
  category: PersonalityAttributeCategorySchema,
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  source: z.literal("hersona"),
});
export type PersonalityAttribute = z.infer<typeof PersonalityAttributeSchema>;

export const PersonalitySelectionSchema = z.object({
  attributeId: PersonalityAttributeSchema.shape.id,
  weight: z.enum(["mild", "moderate", "strong"]).default("moderate"),
});
export type PersonalitySelection = z.infer<typeof PersonalitySelectionSchema>;

export const PersonalityPresetSchema = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  instructions: z.string().max(BOT_INSTRUCTIONS_MAX_LENGTH),
  customInstructions: z.string().max(BOT_INSTRUCTIONS_MAX_LENGTH),
  source: PersonalitySourceSchema,
  selections: z.array(PersonalitySelectionSchema).max(12),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type PersonalityPreset = z.infer<typeof PersonalityPresetSchema>;

export const CreatePersonalityInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(""),
  instructions: z.string().trim().max(BOT_INSTRUCTIONS_MAX_LENGTH).default(""),
  selections: z.array(PersonalitySelectionSchema).max(12).default([]),
});
export type CreatePersonalityInput = z.infer<typeof CreatePersonalityInput>;

export const UpdatePersonalityInput = CreatePersonalityInput.extend({
  personalityId: Id,
});
export type UpdatePersonalityInput = z.infer<typeof UpdatePersonalityInput>;
