import type { MessageBlock } from "@rakazo/contracts";

export type LiveWorkStage = "preparing" | "web" | "computer" | "other";

export function liveWorkStage(
  messages: readonly { id: string; blocks: readonly MessageBlock[] }[],
): LiveWorkStage {
  const live = messages.findLast((message) => message.id.startsWith("progress:"));
  const steps = live?.blocks.findLast((block) => block.kind === "steps");
  const last = steps?.kind === "steps" ? steps.steps.at(-1)?.label.toLowerCase() : undefined;
  if (!last) return "preparing";
  if (/^(web search|web fetch|browser navigate|browser snapshot|browser act)$/.test(last))
    return "web";
  if (/^(shell|computer observe|computer act)$/.test(last)) return "computer";
  return "other";
}
