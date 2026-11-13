export function companionVoiceLinkMatches(
  token: string | undefined,
  activity: { botId: string; spaceId: string | null; linkToken?: string } | null,
  botId: string,
  spaceId: string | null,
): boolean {
  return Boolean(token && activity?.linkToken === token &&
    activity.botId === botId && activity.spaceId === spaceId);
}

export function companionNavigationAllowed(input: {
  companionLink: string | string[] | undefined;
  companionVoice: string | string[] | undefined;
  companionToken: string | string[] | undefined;
  botId: string | string[] | undefined;
  spaceId: string | string[] | undefined;
  activity: { botId: string; spaceId: string | null; linkToken?: string } | null;
}): boolean {
  if (input.companionLink === undefined && input.companionVoice === undefined) return true;
  if ((input.companionLink !== "1" && input.companionLink !== undefined) ||
    (input.companionVoice !== undefined && input.companionVoice !== "1") ||
    typeof input.botId !== "string" || !input.botId ||
    (input.spaceId !== undefined && (typeof input.spaceId !== "string" || !input.spaceId)) ||
    typeof input.companionToken !== "string") return false;
  return companionVoiceLinkMatches(input.companionToken, input.activity, input.botId, input.spaceId ?? null);
}

export function canStartCompanionVoice(input: {
  focused: boolean;
  requestedBot: string;
  activeBot: string | undefined;
  requestGeneration: number;
  currentGeneration: number;
  requestSpace: string | null;
  currentSpace: string | null;
  requestActivityId: string;
  activeActivity: { id: string; botId: string; spaceId: string | null } | null;
  requestSpaceSelection: number;
  currentSpaceSelection: number;
  spaceSelectionPending: boolean;
}): boolean {
  return input.focused &&
    !input.spaceSelectionPending &&
    input.requestSpaceSelection === input.currentSpaceSelection &&
    input.requestedBot === input.activeBot &&
    input.requestGeneration === input.currentGeneration &&
    input.requestSpace === input.currentSpace &&
    input.activeActivity?.id === input.requestActivityId &&
    input.activeActivity.botId === input.requestedBot &&
    input.activeActivity.spaceId === input.requestSpace;
}
