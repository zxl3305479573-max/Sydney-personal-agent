import { canonicalPiProviderId } from "@rakazo/contracts";
import type { ChatModelChoice } from "@rakazo/core";
import {
  chatModelChoices,
  connectedModelChoices,
  modelOptionKey,
  resolveSelectableModelId,
} from "@rakazo/core";
import type { MobileBot, MobileMe, MobileModel, MobileModelCredential } from "./api";

type BotModel = Pick<MobileBot, "modelProvider" | "modelId">;
type DefaultModel = Pick<MobileMe, "defaultProvider" | "defaultModel" | "needsModel">;

export function chatModelSelectionKey(catalog: MobileModel[], bot: BotModel): string {
  return bot.modelProvider && bot.modelId
    ? modelOptionKey(
        bot.modelProvider,
        resolveSelectableModelId(catalog, bot.modelProvider, bot.modelId),
      )
    : "";
}

export function chatModelDisplayName(
  me: DefaultModel | null | undefined,
  catalog: MobileModel[],
  bot?: BotModel,
): string | undefined {
  if (bot?.modelProvider && bot.modelId)
    return catalogEntry(catalog, bot.modelProvider, bot.modelId)?.label ?? bot.modelId;
  if (me?.needsModel || !me?.defaultModel) return undefined;
  return catalogEntry(catalog, me.defaultProvider, me.defaultModel)?.label ?? me.defaultModel;
}

/** What a chat's model picker lists, with the space default named after its model. */
export function chatModelPickerChoices(
  me: DefaultModel | null,
  catalog: MobileModel[],
  credentials: MobileModelCredential[],
  selectedKey: string,
  t: (message: string) => string,
): ChatModelChoice[] {
  const defaultId = me?.needsModel ? undefined : me?.defaultModel;
  const defaultEntry = defaultId
    ? catalogEntry(catalog, me?.defaultProvider, defaultId)
    : undefined;
  const defaultName = defaultEntry?.label ?? defaultId ?? undefined;
  const title = t("Space default");
  const spaceDefaultLabel = defaultName ? `${title} (${defaultName})` : title;
  const choices = chatModelChoices(
    connectedModelChoices(credentials, catalog),
    selectedKey,
    spaceDefaultLabel,
    defaultEntry?.images,
  );
  choices[0] = {
    ...choices[0]!,
    title,
    detail: defaultName,
  };
  return choices;
}

function catalogEntry(
  catalog: MobileModel[],
  provider: string | null | undefined,
  modelId: string,
) {
  if (!provider) return undefined;
  const resolvedId = resolveSelectableModelId(catalog, provider, modelId);
  const canonicalProvider = canonicalPiProviderId(provider);
  return catalog.find(
    (entry) =>
      !entry.placeholder &&
      canonicalPiProviderId(entry.provider) === canonicalProvider &&
      (entry.id === resolvedId || entry.id === modelId),
  );
}
