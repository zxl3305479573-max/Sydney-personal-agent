import type { MobileMessage } from "./api";
import type { CompanionStatus } from "./companion-presentation";

export function companionSnapshot(input: {
  botId: string | undefined;
  snapshotBotId: string | undefined;
  inGroup: boolean;
  readOnly: boolean;
  showingSaved: boolean;
  focused: boolean;
  foreground: boolean;
  currentScope: boolean;
  screenAutoActive: boolean;
  showingHistory: boolean;
  working: boolean;
  call?: { botId: string; phase: "listening" | "thinking" | "speaking"; muted: boolean } | null;
  messages: readonly MobileMessage[];
}): { status: CompanionStatus; latestReply: string | null } | null {
  if (
    !input.botId ||
    input.snapshotBotId !== input.botId ||
    input.inGroup ||
    input.readOnly ||
    input.showingSaved ||
    input.showingHistory ||
    !input.focused ||
    !input.foreground ||
    !input.currentScope ||
    input.screenAutoActive
  ) return null;
  const call = input.call?.botId === input.botId ? input.call : null;
  if (input.working || call?.phase === "thinking") return { status: "thinking", latestReply: null };
  const lastBotMessage = [...input.messages].reverse().find((message) => message.role === "bot");
  const reply = lastBotMessage?.blocks
    .filter((block) => block.kind === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return {
    status: call?.phase === "listening" && !call.muted ? "listening" : "present",
    latestReply: reply || null,
  };
}
