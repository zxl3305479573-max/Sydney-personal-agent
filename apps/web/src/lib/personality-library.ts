import type { SydneyPersonalityId } from "@rakazo/contracts";
import { SYDNEY_PERSONALITIES, splitPersonalityInstructions } from "@rakazo/contracts";

export type {
  SydneyPersonalityId as PersonalityId,
  SydneyPersonalityPreset as PersonalityPreset,
} from "@rakazo/contracts";
export {
  combinePersonalityInstructions,
  SYDNEY_PERSONALITIES as PERSONALITY_LIBRARY,
  splitPersonalityInstructions,
  sydneyPersonalityPreset as personalityPreset,
} from "@rakazo/contracts";

export function personalityIdForInstructions(instructions: string): SydneyPersonalityId | "custom" {
  const normalized = splitPersonalityInstructions(instructions).personality.trim();
  return SYDNEY_PERSONALITIES.find((preset) => preset.instructions === normalized)?.id ?? "custom";
}
