import type { MenuAction } from "@expo/ui/community/menu";
import type { ChatModelChoice } from "@rakazo/core";
import { groupModelChoices } from "@rakazo/core";

export function chatModelMenuActions(
  choices: readonly ChatModelChoice[],
  selectedKey: string,
): MenuAction[] {
  const actionFor = (choice: ChatModelChoice): MenuAction => ({
    id: `model:${choice.key}`,
    title:
      choice.key === "" && choice.detail
        ? `${choice.title ?? choice.label} (${choice.detail})`
        : (choice.title ?? choice.label),
    state: choice.key === selectedKey ? "on" : "off",
  });

  return groupModelChoices(choices, "").flatMap((section) =>
    section.heading
      ? [
          {
            id: section.key,
            title: section.heading,
            displayInline: true,
            subactions: section.data.map(actionFor),
          },
        ]
      : section.data.map(actionFor),
  );
}
