import { expect, it } from "vitest";
import { canStartCompanionVoice, companionNavigationAllowed, companionVoiceLinkMatches } from "./companion-voice-guard";

it("validates companion links before a workspace switch while leaving ordinary links alone", () => {
  const input = {
    companionLink: "1",
    companionVoice: undefined,
    companionToken: "token",
    botId: "bot",
    spaceId: "space",
    activity: { botId: "bot", spaceId: "space", linkToken: "token" },
  };
  expect(companionNavigationAllowed(input)).toBe(true);
  expect(companionNavigationAllowed({ ...input, companionToken: "old" })).toBe(false);
  expect(companionNavigationAllowed({ ...input, spaceId: "other" })).toBe(false);
  expect(companionNavigationAllowed({ ...input, botId: "other" })).toBe(false);
  expect(companionNavigationAllowed({ ...input, activity: null })).toBe(false);
  expect(companionNavigationAllowed({ ...input, companionLink: undefined, companionVoice: "1" })).toBe(true);
  expect(companionNavigationAllowed({ ...input, companionLink: undefined, companionVoice: undefined })).toBe(true);
  expect(companionNavigationAllowed({ ...input, spaceId: ["space", "other"] })).toBe(false);
});

it("accepts only the link created for the current matching activity", () => {
  const activity = { botId: "bot-1", spaceId: "space-1", linkToken: "new-token" };
  expect(companionVoiceLinkMatches("new-token", activity, "bot-1", "space-1")).toBe(true);
  expect(companionVoiceLinkMatches("old-token", activity, "bot-1", "space-1")).toBe(false);
  expect(companionVoiceLinkMatches(undefined, activity, "bot-1", "space-1")).toBe(false);
  expect(companionVoiceLinkMatches("new-token", activity, "bot-2", "space-1")).toBe(false);
  expect(companionVoiceLinkMatches("new-token", activity, "bot-1", "space-2")).toBe(false);
  expect(companionVoiceLinkMatches("new-token", null, "bot-1", "space-1")).toBe(false);
});

it("only starts an approved voice session in its original visible account and chat", () => {
  const scope = {
    focused: true,
    requestedBot: "bot-1",
    activeBot: "bot-1",
    requestGeneration: 3,
    currentGeneration: 3,
    requestSpace: "space-1",
    currentSpace: "space-1",
    requestActivityId: "activity-1",
    activeActivity: { id: "activity-1", botId: "bot-1", spaceId: "space-1" },
    requestSpaceSelection: 2,
    currentSpaceSelection: 2,
    spaceSelectionPending: false,
  };
  expect(canStartCompanionVoice(scope)).toBe(true);
  expect(canStartCompanionVoice({ ...scope, focused: false })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, activeBot: "bot-2" })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, currentGeneration: 4 })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, currentSpace: "space-2" })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, activeActivity: null })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, activeActivity: { ...scope.activeActivity, id: "activity-2" } })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, activeActivity: { ...scope.activeActivity, botId: "bot-2" } })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, activeActivity: { ...scope.activeActivity, spaceId: "space-2" } })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, currentSpaceSelection: 4 })).toBe(false);
  expect(canStartCompanionVoice({ ...scope, spaceSelectionPending: true })).toBe(false);
});
