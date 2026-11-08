export type PersonalityId =
  | "balanced"
  | "professional"
  | "friendly"
  | "concise"
  | "creative"
  | "teacher";

export interface PersonalityPreset {
  id: PersonalityId;
  instructions: string;
}

export const PERSONALITY_LIBRARY: readonly PersonalityPreset[] = [
  {
    id: "balanced",
    instructions: "表达清晰、友好、专业，保持适度简洁。",
  },
  {
    id: "professional",
    instructions: "使用专业、准确的措辞和有条理的表达，先说明结论，再按需补充依据。",
  },
  {
    id: "friendly",
    instructions: "语气温和、耐心，使用自然易懂的语言，避免过度正式。",
  },
  {
    id: "concise",
    instructions: "优先使用简洁的短句，直接回答，按需展开细节。",
  },
  {
    id: "creative",
    instructions: "表达富有想象力，适当使用生动的例子，保持清晰。",
  },
  {
    id: "teacher",
    instructions: "解释时语气耐心，按需要使用步骤、类比和小例子。",
  },
];

export function personalityPreset(id: PersonalityId): PersonalityPreset {
  return PERSONALITY_LIBRARY.find((preset) => preset.id === id) ?? PERSONALITY_LIBRARY[0]!;
}

export function personalityIdForInstructions(instructions: string): PersonalityId | "custom" {
  const normalized = splitPersonalityInstructions(instructions).personality.trim();
  return PERSONALITY_LIBRARY.find((preset) => preset.instructions === normalized)?.id ?? "custom";
}

const PERSONALITY_MARKER =
  "--- Sydney personality: speaking style only; duties above take priority ---\n";

export function splitPersonalityInstructions(instructions: string): {
  duties: string;
  personality: string;
} {
  const index = instructions.lastIndexOf(PERSONALITY_MARKER);
  if (index < 0 || (index > 0 && instructions.slice(index - 2, index) !== "\n\n"))
    return { duties: instructions, personality: "" };
  try {
    const value: unknown = JSON.parse(instructions.slice(index + PERSONALITY_MARKER.length));
    if (typeof value === "string")
      return { duties: instructions.slice(0, index === 0 ? 0 : index - 2), personality: value };
  } catch {}
  return { duties: instructions, personality: "" };
}

export function combinePersonalityInstructions(duties: string, personality: string): string {
  if (!personality) return duties;
  return `${duties}${duties ? "\n\n" : ""}${PERSONALITY_MARKER}${JSON.stringify(personality)}`;
}
