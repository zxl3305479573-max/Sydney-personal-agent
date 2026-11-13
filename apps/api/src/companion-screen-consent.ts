import type { AgentRunRequest } from "@rakazo/adapter-kit";
import { aiRecipient } from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { aiConsentStatus } from "./ai-consent.js";
import type { CompanionScreenOwner } from "./companion-screen-session.js";
import type { RouterDeps } from "./router.js";

export function createCompanionScreenConsent(deps: RouterDeps) {
  return async (owner: CompanionScreenOwner, actor: Actor, model?: AgentRunRequest["model"]) => {
    if (owner.userId !== actor.userId || owner.spaceId !== actor.spaceId || !owner.botId) return false;
    const status = await aiConsentStatus(deps, actor, { botId: owner.botId, uses: ["model"] });
    if (status.recipients.some((recipient) => recipient.use === "model" && !recipient.allowed)) return false;
    if (!model) return true;
    if (model.provider === "scripted" || !model.id) return false;
    const recipient = aiRecipient({
      provider: model.provider, modelId: model.id, baseUrl: model.baseUrl, use: "model",
    });
    return Boolean(recipient && status.recipients.some((item) => item.key === recipient.key && item.allowed));
  };
}
