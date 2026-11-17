export type SydneyPersonalityId =
  | "balanced"
  | "professional"
  | "friendly"
  | "concise"
  | "creative"
  | "teacher";

export interface SydneyPersonalityPreset {
  id: SydneyPersonalityId;
  instructions: string;
}

export const SYDNEY_PERSONALITIES: readonly SydneyPersonalityPreset[] = [
  { id: "balanced", instructions: "表达清晰、友好、专业，保持适度简洁。" },
  {
    id: "professional",
    instructions: "使用专业、准确的措辞和有条理的表达，先说明结论，再按需补充依据。",
  },
  { id: "friendly", instructions: "语气温和、耐心，使用自然易懂的语言，避免过度正式。" },
  { id: "concise", instructions: "优先使用简洁的短句，直接回答，按需展开细节。" },
  { id: "creative", instructions: "表达富有想象力，适当使用生动的例子，保持清晰。" },
  { id: "teacher", instructions: "解释时语气耐心，按需要使用步骤、类比和小例子。" },
];

export function sydneyPersonalityPreset(id: SydneyPersonalityId): SydneyPersonalityPreset {
  return SYDNEY_PERSONALITIES.find((preset) => preset.id === id) ?? SYDNEY_PERSONALITIES[0]!;
}
