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

export function replaceBotDuties(current: string, replacement: string): string {
  return combinePersonalityInstructions(
    splitPersonalityInstructions(replacement).duties,
    splitPersonalityInstructions(current).personality,
  );
}
