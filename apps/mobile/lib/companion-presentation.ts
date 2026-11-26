export type CompanionStatus = "present" | "listening" | "thinking" | "disconnected";
export type CallLiveActivityPhase = "listening" | "thinking" | "speaking" | "muted";

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

const RICH_CALL_STATUS_LABELS: Record<CallLiveActivityPhase, string> = {
  listening: "通话 · 正在听",
  thinking: "通话 · 思考中",
  speaking: "通话 · 说话中",
  muted: "通话 · 已静音",
};

const LEGACY_CALL_STATUS_LABELS: Record<CallLiveActivityPhase, string> = {
  listening: "正在听",
  thinking: "思考中",
  speaking: "正在听",
  muted: "我一直都在",
};

export function stripCompanionMarkdown(value: string): string {
  return value
    .replace(/```[\s\S]*?```/gu, (block) =>
      block.replace(/```[^\n]*\n?/gu, "").replace(/```/gu, ""),
    )
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
    .replace(/^\s*>\s?/gmu, "")
    .replace(/^\s*[-*+]\s+/gmu, "")
    .replace(/(\*\*|__)(.*?)\1/gu, "$2")
    .replace(/~~(.*?)~~/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/(^|[\s(（【])\*([^*\n]+)\*(?=$|[\s.,!?;:，。！？；：)）】])/gu, "$1$2");
}

function boundedText(value: string, limit: number): string {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length > limit
    ? `${characters.slice(0, limit - 1).join("")}…`
    : characters.join("");
}

export function companionPresentation(options: {
  botName: string;
  status: CompanionStatus;
  latestReply?: string | null;
  showReply: boolean;
}): CompanionPresentation {
  const reply = options.showReply
    ? boundedText(stripCompanionMarkdown(options.latestReply ?? ""), 110)
    : "";
  return {
    title: boundedText(options.botName, 32) || "Bot",
    status: STATUS_LABELS[options.status],
    reply: reply || null,
  };
}

export function callLiveActivityPresentation(options: {
  botName: string;
  phase: CallLiveActivityPhase;
  caption?: string | null;
  showReply: boolean;
  richNativeStatus: boolean;
}): CompanionPresentation {
  const reply = options.showReply
    ? boundedText(stripCompanionMarkdown(options.caption ?? ""), 110)
    : "";
  const labels = options.richNativeStatus ? RICH_CALL_STATUS_LABELS : LEGACY_CALL_STATUS_LABELS;
  return {
    title: boundedText(options.botName, 32) || "Bot",
    status: labels[options.phase],
    reply: reply || null,
  };
}
