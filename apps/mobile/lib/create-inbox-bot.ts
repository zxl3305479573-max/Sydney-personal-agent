import type { RpcInput } from "@rakazo/contracts";
import { DEFAULT_NEW_BOT_AVATAR_SET } from "@rakazo/contracts";
import type { Href } from "expo-router";
import type { ApiRequestContext } from "./api";
import {
  captureApiRequestContext,
  currentApiBase,
  isSpaceSelectionPending,
  rpc,
  selectedSpaceId,
  spaceSelectionSeq,
} from "./api";
import { allowFocusPrompt, scheduleFocusPrompt } from "./focus-prompt";
import { addToSearchInbox, searchInboxSession } from "./search-inbox";
import { currentSessionGeneration } from "./session";

export type InboxBotIdentity = Pick<
  RpcInput<"bots/create">,
  "name" | "color" | "instructions" | "spawnKey"
>;

const EXISTING_BOTS_TIMEOUT_MS = 2_000;

async function loadExistingBots(
  options: { requestContext: ApiRequestContext; skipSpaceAuthRecovery: true },
) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      rpc("bots/list", undefined, { ...options, signal: controller.signal }).catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, EXISTING_BOTS_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Creates a bot from the inbox's Create menu, adds it to the search roster, and opens its chat.
 * Throws when the bot could not be created.
 */
export async function createInboxBot({
  refreshBots,
  openChat,
  identity,
}: {
  refreshBots: () => Promise<unknown>;
  openChat: (href: Href) => void;
  identity?: InboxBotIdentity;
}) {
  const askedIn = searchInboxSession();
  const spaceId = selectedSpaceId();
  const selection = spaceSelectionSeq();
  const isCurrent = () =>
    !isSpaceSelectionPending() &&
    selectedSpaceId() === spaceId &&
    spaceSelectionSeq() === selection &&
    currentApiBase() === askedIn.apiBase &&
    currentSessionGeneration() === askedIn.generation;
  if (!isCurrent()) throw new Error("Space changed. Please try again.");
  const requestContext = await captureApiRequestContext(spaceId);
  if (!isCurrent()) throw new Error("Space changed. Please try again.");
  const options = { requestContext, skipSpaceAuthRecovery: true as const };
  const existingPromise = loadExistingBots(options);
  if (!isCurrent()) throw new Error("Space changed. Please try again.");
  const bot = await rpc(
    "bots/create",
    {
      name: identity?.name ?? "New Bot",
      color: identity?.color,
      instructions: identity?.instructions,
      spawnKey: identity?.spawnKey,
      notifyOnFinish: true,
      avatarSet: DEFAULT_NEW_BOT_AVATAR_SET,
      computerMode: "team",
    },
    options,
  );
  if (!isCurrent()) return;
  void refreshBots().catch(() => undefined);
  allowFocusPrompt(bot.id);
  addToSearchInbox({ kind: "bot", bot }, askedIn);
  openChat({ pathname: "/thread", params: { botId: bot.id, name: bot.name } });
  void (async () => {
    const existing = await existingPromise;
    if (!isCurrent()) return;
    const isFirstBot = existing !== null && existing.every((item) => item.id === bot.id);
    const started = await rpc("onboarding/start", { botId: bot.id }, options)
      .then(() => true)
      .catch(() => false);
    if (!started || !isCurrent()) return;
    scheduleFocusPrompt(bot.id, isFirstBot);
  })();
}
