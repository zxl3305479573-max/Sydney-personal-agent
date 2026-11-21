import { isSecretAskBlock } from "@rakazo/core";
import type { MobileMessage } from "./api";
import { isCenteredAgentEvent, THREAD_COLUMN_GUTTER } from "./message-presentation";

const COLUMN_PADDING = THREAD_COLUMN_GUTTER * 2;

export function messageAvatarBotId(
  message: Pick<MobileMessage, "role" | "botId">,
  inGroup: boolean,
  botId?: string,
): string | undefined {
  return message.role === "bot" ? (message.botId ?? (!inGroup ? botId : undefined)) : undefined;
}

/** Bot output, wide asks and centered events can use the entire content column. */
export function messageRowLayout(
  { role, blocks }: Pick<MobileMessage, "role" | "blocks">,
  columnWidth: number,
) {
  const wideAsk = blocks.some(isSecretAskBlock);
  const full = role === "bot" || wideAsk || isCenteredAgentEvent(blocks);
  // Connect cards fill the bubble width instead of shrinking to their button.
  const appConnect = blocks.some(
    (block) => block.kind === "app_connect" || block.kind === "mcp_approval",
  );
  const availableWidth = columnWidth - COLUMN_PADDING;
  return {
    width: full ? "100%" : appConnect ? "90%" : undefined,
    maxWidth: full ? "100%" : "90%",
    menuFullWidth: wideAsk || appConnect,
    menuMaxWidth: full ? availableWidth : availableWidth * 0.9,
  } as const;
}
