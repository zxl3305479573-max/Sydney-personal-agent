export type CompanionStatus = "present" | "listening" | "thinking" | "disconnected";

export type CompanionPresentation = {
  title: string;
  status: string;
  reply: string | null;
};

const STATUS_LABELS: Record<CompanionStatus, string> = {
  present: "我一直都在",
  listening: "正在听",
  thinking: "思考中",
  disconnected: "连接已断开",
};

function boundedText(value: string, limit: number): string {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}…` : characters.join("");
}

export function companionPresentation(options: {
  botName: string;
  status: CompanionStatus;
  latestReply?: string | null;
  showReply: boolean;
}): CompanionPresentation {
  const reply = options.showReply ? boundedText(options.latestReply ?? "", 80) : "";
  return {
    title: boundedText(options.botName, 32) || "Bot",
    status: STATUS_LABELS[options.status],
    reply: reply || null,
  };
}
