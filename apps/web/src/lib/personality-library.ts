import { splitPersonalityInstructions, SYDNEY_PERSONALITIES } from "@rakazo/contracts";
import type { SydneyPersonalityId } from "@rakazo/contracts";

export { combinePersonalityInstructions, splitPersonalityInstructions } from "@rakazo/contracts";
export {
  SYDNEY_PERSONALITIES as PERSONALITY_LIBRARY,
  sydneyPersonalityPreset as personalityPreset,
} from "@rakazo/contracts";
export type {
  SydneyPersonalityId as PersonalityId,
  SydneyPersonalityPreset as PersonalityPreset,
} from "@rakazo/contracts";

export function personalityIdForInstructions(instructions: string): SydneyPersonalityId | "custom" {
  const normalized = splitPersonalityInstructions(instructions).personality.trim();
  return SYDNEY_PERSONALITIES.find((preset) => preset.instructions === normalized)?.id ?? "custom";
}
