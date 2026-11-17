import type { Actor } from "@rakazo/contracts";
import { aiRecipient } from "@rakazo/adapters";
import { beforeEach, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";

const status = vi.hoisted(() => vi.fn());
vi.mock("./ai-consent.js", () => ({ aiConsentStatus: status }));

import { createCompanionScreenConsent } from "./companion-screen-consent.js";

const actor = { userId: "user", spaceId: "space" } as Actor;
const owner = { userId: "user", spaceId: "space", botId: "bot", sessionId: "login" };
const model = { provider: "openai", id: "model" };

beforeEach(() => status.mockReset());

it("requires approval for the exact resolved model recipient", async () => {
  const check = createCompanionScreenConsent({} as RouterDeps);
  const recipient = aiRecipient({ ...model, modelId: model.id, use: "model" })!;
  status.mockResolvedValue({ recipients: [{ ...recipient, allowed: true }] });
  expect(await check(owner, actor, model)).toBe(true);
  expect(status).toHaveBeenCalledWith(expect.anything(), actor, { botId: "bot", uses: ["model"] });
  expect(await check(owner, actor, { ...model, id: "different" })).toBe(false);
  expect(await check({ ...owner, userId: "other" }, actor, model)).toBe(false);
  status.mockResolvedValue({ recipients: [{ ...recipient, allowed: false }] });
  expect(await check(owner, actor, model)).toBe(false);
  status.mockResolvedValue({ recipients: [] });
  expect(await check(owner, actor, model)).toBe(false);
});
